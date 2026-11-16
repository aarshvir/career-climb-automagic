// @vitest-environment node
// Seven-day free trial: the actual edge runtime against the actual migration
// chain in PGlite. Provider reads are local fixtures; no network, card or charge.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { paidCapacitySchema } from './fixtures/paid-capacity-schema.mjs';
import { applyLoopBillingWebhook, controlLoopBilling, type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';
import { LOOP_BILLING_PRODUCT, type LoopBillingConfig } from '../functions/_shared/loop-billing.ts';
import { authorizeTrialReminderDispatch, confirmTrialReminders } from '../functions/_shared/loop-trial-reminders.ts';

const trialMigration = '20261111120000_job_loop_seven_day_trial.sql';
const reminderMigration = '20261116120000_job_loop_trial_reminder_receipts.sql';
/** Dodo's customer email log for cus_trial, or a read failure. */
let emailLog: Record<string, unknown>[] | Error = [];
const DAY = 86400000;
let db: PGlite, owner: string, session: string, request: string, epoch: number;
const query = (q: string, a: unknown[] = []) => db.query<Record<string, any>>(q, a);
async function sql(name: string, args: Record<string, unknown>) {
  if (!/^job_loop_billing_[a-z_0-9]+$/.test(name)) throw Error('Unexpected SQL ' + name);
  await db.exec('SET ROLE service_role');
  try { return (await query('SELECT ' + name + '(' + Object.keys(args).map((key, i) => key + ' => $' + (i + 1)).join(',') + ') r', Object.values(args))).rows[0]?.r; }
  finally { await db.exec('RESET ROLE'); }
}
const normal = (value: unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? new Date(value).toISOString() : value;
/** PGlite renders timestamps in the host time zone; compare instants. */
const instants = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normal(value)]));
const entitlement = async (user = owner) => instants(await sql('job_loop_billing_entitlement', { p_user: user }));
const reminders = async () => ((await sql('job_loop_billing_trial_reminders_due', { p_mode: 'live' })) as Record<string, unknown>[]).map(instants);

/** Mutable provider state for one trial subscription. */
interface Provider { trialStart: number; charged: boolean; cancelled: boolean; status: string; refunded: boolean; firstChargeFails: boolean; posts: Record<string, unknown>[]; patches: number; patchFails: boolean }
let provider: Provider;
const firstCharge = () => provider.trialStart + 7 * DAY;
const meta = () => ({ product: LOOP_BILLING_PRODUCT, user_id: owner, request_id: request, generation: '0', plan: 'weekly' });
const iso = (ms: number) => new Date(ms).toISOString();
function providerSub() {
  return { subscription_id: 'sub_trial', product_id: 'pdt_weekly', quantity: 1, currency: 'USD', recurring_pre_tax_amount: 2900, payment_frequency_count: 1, payment_frequency_interval: 'Month',
    subscription_period_count: 20, subscription_period_interval: 'Year', trial_period_days: 7, on_demand: false, tax_inclusive: true, cancel_at_next_billing_date: provider.cancelled,
    status: provider.status, previous_billing_date: iso(provider.charged ? firstCharge() : provider.trialStart), next_billing_date: iso(provider.charged ? firstCharge() + 30 * DAY : firstCharge()),
    customer: { customer_id: 'cus_trial' }, metadata: meta(), created_at: iso(provider.trialStart), has_payment_method: true };
}
function trialPayment() {
  return { payment_id: 'pay_trial', status: 'succeeded', currency: 'USD', subscription_id: 'sub_trial', subscription_ids: ['sub_trial'], is_multi_subscription: false, is_update_payment_method: false,
    customer: { customer_id: 'cus_trial' }, total_amount: 0, tax: 0, checkout_session_id: 'cks_trial', service_periods: [], created_at: iso(provider.trialStart - 30000) };
}
function firstPayment() {
  return { payment_id: 'pay_first', status: provider.firstChargeFails ? 'failed' : 'succeeded', currency: 'USD', subscription_id: 'sub_trial', subscription_ids: ['sub_trial'], is_multi_subscription: false,
    is_update_payment_method: false, customer: { customer_id: 'cus_trial' }, total_amount: 2900, tax: 0, checkout_session_id: null, refund_status: provider.refunded ? 'full' : 'none',
    service_periods: [{ subscription_id: 'sub_trial', starts_at: iso(firstCharge()), ends_at: iso(firstCharge() + 30 * DAY) }] };
}
const config = { mode: 'live', provider: 'dodo', appUrl: 'https://jobvance.io', trialEnabled: true, loopProducts: { weekly: 'pdt_weekly', active: 'pdt_active', daily: 'pdt_daily' } } as LoopBillingConfig;
const ports: LoopBillingPorts = {
  rpc: async <T>(name: string, args: Record<string, unknown>) => await sql(name, args) as T,
  provider: async (path, body, method) => {
    if (path === 'products/pdt_weekly') return { product_id: 'pdt_weekly', is_recurring: true, price: { type: 'recurring_price', price: 2900, currency: 'USD', payment_frequency_count: 1, payment_frequency_interval: 'Month', subscription_period_count: 20, subscription_period_interval: 'Year', trial_period_days: 0, tax_inclusive: true } };
    if (path === 'checkouts') { provider.posts.push(body!); return { session_id: 'cks_trial', checkout_url: 'https://checkout.dodopayments.com/session/cks_trial' }; }
    if (path === 'checkouts/cks_trial') return { id: 'cks_trial', payment_id: 'pay_trial' };
    if (path === 'payments/pay_trial') return trialPayment();
    if (path === 'payments/pay_first') return firstPayment();
    if (path === 'customers/cus_trial/emails?page_size=100') { if (emailLog instanceof Error) throw emailLog; return { items: emailLog, total_count: emailLog.length }; }
    if (path === 'subscriptions/sub_trial') { if (method === 'PATCH') { provider.patches++; if (provider.patchFails) throw Error('Provider timeout'); expect(body).toEqual({ cancel_at_next_billing_date: true }); provider.cancelled = true; } return providerSub(); }
    throw Error('External network forbidden: ' + path);
  },
};
const checkoutInput = (changes: Record<string, unknown> = {}) => ({ action: 'checkout', requestId: request, expectedGeneration: 0, plan: 'weekly', consent: true, trial: true, ...changes });
const activation = (created = epoch) => ({ type: 'subscription.active', created, data: { payload_type: 'Subscription', subscription_id: 'sub_trial', status: 'active', metadata: meta() } });
async function startTrial(trialStart = Date.now() - 3600000) {
  provider.trialStart = trialStart;
  await controlLoopBilling(ports, config, owner, session, checkoutInput());
  return applyLoopBillingWebhook(ports, config, activation() as never, 'msg_trial_start');
}
/** Occupy all 100 paid places with other live owners. */
async function fillAllPaidPlaces() {
  await query(`WITH u AS (INSERT INTO auth.users(id) SELECT gen_random_uuid() FROM generate_series(1,100) RETURNING id),
    o AS (INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id,state) SELECT id,gen_random_uuid(),'live','weekly','pdt_weekly','ready' FROM u RETURNING user_id,request_id)
    INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created)
    SELECT 'sub_full_'||row_number() OVER (),user_id,request_id,'live','weekly','cus_full','active',now()+interval '20 days',1 FROM o`);
}
async function chargeFirst(created = epoch + 20) {
  provider.charged = true; provider.status = provider.firstChargeFails ? 'on_hold' : 'active';
  const type = provider.firstChargeFails ? 'payment.failed' : 'payment.succeeded';
  return applyLoopBillingWebhook(ports, config, { type, created, data: { payload_type: 'Payment', subscription_id: 'sub_trial', payment_id: 'pay_first' } } as never, 'msg_first_charge');
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await paidCapacitySchema());
  await db.exec(await readFile(new URL('../migrations/' + trialMigration, import.meta.url), 'utf8'));
  // Local substitutes for pg_cron, pg_net and the scheduler origin (20261011050000).
  await db.exec(`CREATE SCHEMA IF NOT EXISTS cron; CREATE SCHEMA IF NOT EXISTS net;
    CREATE TABLE cron.job(jobname text PRIMARY KEY,schedule text,command text);
    CREATE FUNCTION cron.schedule(job_name text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job VALUES(job_name,schedule,command) RETURNING 1::bigint $$;
    CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,headers jsonb,body jsonb);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
      RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.calls(url,headers,body) VALUES(url,headers,body) RETURNING id $$;
    ALTER TABLE public.job_loop_scheduler_config ADD COLUMN IF NOT EXISTS api_origin text, ADD COLUMN IF NOT EXISTS publishable_key text;`);
  await db.exec(await readFile(new URL('../migrations/' + reminderMigration, import.meta.url), 'utf8'));
}, 60000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE; TRUNCATE jobvance_private.loop_billing_events; TRUNCATE public.job_loop_pilot_users CASCADE; TRUNCATE jobvance_private.loop_trial_reminder_receipts, public.job_loop_trial_reminder_tickets, net.calls');
  emailLog = [];
  owner = randomUUID(); session = randomUUID(); request = randomUUID();
  await query('INSERT INTO auth.users(id) VALUES($1)', [owner]); await query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [session, owner]); await query('SELECT job_loop_open_record($1)', [owner]);
  epoch = Number((await query('SELECT extract(epoch FROM now())::bigint-100 e')).rows[0].e);
  provider = { trialStart: Date.now() - 3600000, charged: false, cancelled: false, status: 'active', refunded: false, firstChargeFails: false, posts: [], patches: 0, patchFails: false };
});

describe('seven-day free trial checkout', () => {
  it('opens a card-required seven-day trial checkout and binds the trial to the original order', async () => {
    const receipt = await controlLoopBilling(ports, config, owner, session, checkoutInput());
    expect(receipt).toMatchObject({ sessionId: 'cks_trial', plan: 'weekly', trialDays: 7 });
    expect(provider.posts).toHaveLength(1);
    expect(provider.posts[0]).toMatchObject({ subscription_data: { trial_period_days: 7 }, metadata: meta(), feature_flags: { allow_discount_code: false } });
    expect((await query('SELECT trial_days,state FROM jobvance_private.loop_billing_orders WHERE request_id=$1', [request])).rows[0]).toMatchObject({ trial_days: 7, state: 'ready' });
    // Retrying the identical request reuses its session; changing the trial terms of that request conflicts.
    expect(await controlLoopBilling(ports, config, owner, session, checkoutInput())).toMatchObject({ sessionId: 'cks_trial' }); expect(provider.posts).toHaveLength(1);
    await expect(controlLoopBilling(ports, config, owner, session, checkoutInput({ trial: false }))).rejects.toMatchObject({ code: 'LOOP_BILLING_REQUEST_CONFLICT' });
    await expect(query('UPDATE jobvance_private.loop_billing_orders SET trial_days=0 WHERE request_id=$1', [request])).rejects.toThrow('LOOP_TRIAL_IMMUTABLE');
  });
  it('keeps paid checkouts at trial_period_days 0 and refuses a trial while the server flag is off', async () => {
    await expect(controlLoopBilling(ports, { ...config, trialEnabled: false }, owner, session, checkoutInput())).rejects.toMatchObject({ code: 'LOOP_TRIAL_UNAVAILABLE' });
    expect(provider.posts).toHaveLength(0);
    await controlLoopBilling(ports, config, owner, session, checkoutInput({ trial: false }));
    expect(provider.posts[0]).toMatchObject({ subscription_data: { trial_period_days: 0 } });
    expect((await query('SELECT trial_days FROM jobvance_private.loop_billing_orders WHERE request_id=$1', [request])).rows[0].trial_days).toBe(0);
  });
  it('reports eligibility and trial details to contract 3 only', async () => {
    const before = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 });
    expect(before).toMatchObject({ trial: { available: true, eligible: true, days: 7 } });
    expect(await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 2 })).not.toHaveProperty('trial');
    await startTrial();
    const during = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 }) as Record<string, any>;
    expect(during.trial).toMatchObject({ eligible: false });
    expect(during.subscription.trial).toMatchObject({ granted: true, startsAt: iso(provider.trialStart), endsAt: iso(firstCharge()), firstChargeAt: iso(firstCharge()), reminderAt: iso(firstCharge() - 2 * DAY) });
    const v2 = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 2 }) as Record<string, any>;
    expect(v2.subscription).not.toHaveProperty('trial');
  });
});

describe('one trial per account', () => {
  it('refuses a second trial checkout after a trial, even once the first subscription has ended', async () => {
    await startTrial();
    request = randomUUID();
    await expect(controlLoopBilling(ports, config, owner, session, checkoutInput())).rejects.toThrow('LOOP_TRIAL_USED');
    await query("UPDATE jobvance_private.loop_subscriptions SET status='expired' WHERE subscription_id='sub_trial'");
    await expect(controlLoopBilling(ports, config, owner, session, checkoutInput())).rejects.toThrow('LOOP_TRIAL_USED');
    expect(provider.posts).toHaveLength(1);
  });
  it('refuses a trial to an account that already had a paid subscription and to an active free-pilot place', async () => {
    await query("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id,auth_session,generation,state) VALUES($1,$2,'live','weekly','pdt_weekly',$3,0,'ready')", [owner, randomUUID(), session]);
    const old = (await query('SELECT request_id FROM jobvance_private.loop_billing_orders WHERE user_id=$1', [owner])).rows[0].request_id;
    await query("INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created,generation) VALUES('sub_old',$1,$2,'live','weekly','cus_trial','expired',now()-interval '1 day',1,0)", [owner, old]);
    await expect(controlLoopBilling(ports, config, owner, session, checkoutInput())).rejects.toThrow('LOOP_TRIAL_USED');
    const pilot = randomUUID(), pilotSession = randomUUID();
    await query('INSERT INTO auth.users(id) VALUES($1)', [pilot]); await query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [pilotSession, pilot]); await query('SELECT job_loop_open_record($1)', [pilot]);
    await query('INSERT INTO public.job_loop_pilot_users(user_id,active) VALUES($1,true)', [pilot]);
    await expect(controlLoopBilling(ports, config, pilot, pilotSession, checkoutInput({ requestId: randomUUID() }))).rejects.toThrow('LOOP_TRIAL_USED');
  });
  it('records but never grants a second trial that reaches SQL by another order', async () => {
    await startTrial();
    // A second trial order (for example an older open session completed late).
    const second = randomUUID();
    await query("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id,auth_session,generation,state,session_id,trial_days) VALUES($1,$2,'live','weekly','pdt_weekly',$3,0,'ready','cks_second',7)", [owner, second, session]);
    const result = await sql('job_loop_billing_apply_trial', { p_user: owner, p_request: second, p_mode: 'live', p_plan: 'weekly', p_product: 'pdt_weekly', p_session: 'cks_second', p_subscription: 'sub_second', p_customer: 'cus_trial',
      p_status: 'active', p_trial_start: iso(Date.now() - 60000), p_first_charge: iso(Date.now() - 60000 + 7 * DAY), p_cancel_at_period_end: false, p_event: 'dodo_msg_second', p_created: epoch + 5, p_payload_hash: 'c'.repeat(64), p_payment: 'pay_second' });
    expect(result.trial).toMatchObject({ granted: false, reason: 'trial_used' });
    expect((await query("SELECT valid_until<=now() expired FROM jobvance_private.loop_subscriptions WHERE subscription_id='sub_second'")).rows[0].expired).toBe(true);
    // The original trial still grants; the second one adds nothing.
    expect(await entitlement()).toMatchObject({ active: true, plan: 'weekly', validUntil: iso(firstCharge()) });
  });
});

describe('access during and after the trial', () => {
  it('grants the plan cadence during the trial and records the $0 window apart from paid periods', async () => {
    expect(await startTrial()).toMatchObject({ received: true, trial: { granted: true } });
    expect(await entitlement()).toEqual({ active: true, plan: 'weekly', cadence: 'weekly', variantLimit: 3, maxWeeklyRuns: 1, validUntil: iso(firstCharge()) });
    expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods')).rows[0].n).toBe(0);
    expect((await query('SELECT amount::int amount,payment_id,granted FROM jobvance_private.loop_subscription_trials')).rows).toEqual([{ amount: 0, payment_id: 'pay_trial', granted: true }]);
    // Trial subscriptions occupy a paid service place while they grant access.
    await sql('job_loop_billing_assert_capacity', { p_user: owner });
    // Redelivery is idempotent and a forged second trial window conflicts.
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_trial_start')).toEqual({ received: true, duplicate: true });
    provider.trialStart -= 3600000;
    await expect(applyLoopBillingWebhook(ports, config, activation(epoch + 1) as never, 'msg_trial_again')).rejects.toThrow();
  });
  it('lists the reminder two days before the first charge (day 5) and excludes cancelled trials', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    const due = await reminders();
    expect(due).toEqual([expect.objectContaining({ userId: owner, subscriptionId: 'sub_trial', firstChargeAt: iso(firstCharge()), reminderAt: iso(firstCharge() - 2 * DAY) })]);
    expect(Date.parse(due[0].firstChargeAt) - Date.parse(due[0].reminderAt)).toBeGreaterThanOrEqual(2 * DAY);
    expect(await sql('job_loop_billing_trial_reminder_sent', { p_mode: 'live', p_subscription: 'sub_trial' })).toBe(true);
    expect(await sql('job_loop_billing_trial_reminder_sent', { p_mode: 'live', p_subscription: 'sub_trial' })).toBe(false);
    expect(await reminders()).toEqual([]);
  });
  it('cancelling the trial stops the first charge and keeps access only until the trial end', async () => {
    await startTrial();
    const status = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 }) as Record<string, any>;
    const cancel = { action: 'cancel', requestId: randomUUID(), expectedGeneration: 0, expectedSubscriptionId: 'sub_trial', expectedVersion: status.subscription.version, consent: true, contractVersion: 2 };
    expect(await controlLoopBilling(ports, config, owner, session, cancel)).toMatchObject({ status: 'confirmed', subscription: { cancelAtPeriodEnd: true } });
    expect(provider.patches).toBe(1);
    expect(await entitlement()).toMatchObject({ active: true, validUntil: iso(firstCharge()) });
    expect(await reminders()).toEqual([]);
    // At the trial end Dodo ends the subscription without charging.
    provider.status = 'cancelled';
    await applyLoopBillingWebhook(ports, config, { type: 'subscription.cancelled', created: epoch + 30, data: { payload_type: 'Subscription', subscription_id: 'sub_trial', status: 'cancelled', metadata: meta() } } as never, 'msg_trial_cancelled');
    expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods')).rows[0].n).toBe(0);
    expect(await entitlement()).toMatchObject({ active: true, validUntil: iso(firstCharge()) });
  });
  it('ends access at the trial end when nobody is charged', async () => {
    await startTrial(Date.now() - 8 * DAY);
    expect(await entitlement()).toMatchObject({ active: false, maxWeeklyRuns: 0 });
  });
  it('a successful first charge continues access as a paid month', async () => {
    await startTrial(Date.now() - 8 * DAY);
    expect(await chargeFirst()).toMatchObject({ received: true });
    expect((await query('SELECT payment_id,amount::int amount,starts_at FROM jobvance_private.loop_subscription_periods')).rows).toEqual([{ payment_id: 'pay_first', amount: 2900, starts_at: new Date(firstCharge()) }]);
    expect(await entitlement()).toMatchObject({ active: true, plan: 'weekly', validUntil: iso(firstCharge() + 30 * DAY) });
  });
  it('a failed first charge leaves no access after the trial and records no paid period', async () => {
    await startTrial(Date.now() - 8 * DAY);
    provider.firstChargeFails = true;
    await chargeFirst();
    expect((await query("SELECT status FROM jobvance_private.loop_subscriptions WHERE subscription_id='sub_trial'")).rows[0].status).toBe('on_hold');
    expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods')).rows[0].n).toBe(0);
    expect(await entitlement()).toMatchObject({ active: false });
  });
  it('a first charge that fails during an overdue grace period still grants no trial-only access', async () => {
    await startTrial();
    await query("UPDATE jobvance_private.loop_subscriptions SET status='past_due',grace_until=now()+interval '3 days' WHERE subscription_id='sub_trial'");
    expect(await entitlement()).toMatchObject({ active: false });
  });
  it('a refunded first charge revokes access', async () => {
    await startTrial(Date.now() - 8 * DAY);
    await chargeFirst();
    provider.refunded = true;
    expect(await applyLoopBillingWebhook(ports, config, { type: 'refund.succeeded', created: epoch + 40, data: { payload_type: 'Refund', refund_id: 'ref_first', payment_id: 'pay_first', status: 'succeeded', amount: 2900, currency: 'USD' } } as never, 'msg_refund')).toMatchObject({ received: true });
    expect((await query("SELECT revoked FROM jobvance_private.loop_subscriptions WHERE subscription_id='sub_trial'")).rows[0].revoked).toBe(true);
    expect(await entitlement()).toMatchObject({ active: false });
  });
  it('a trial denied for a full service sends its first charge to pending fulfillment instead of paid access', async () => {
    provider.trialStart = Date.now() - 8 * DAY;
    await controlLoopBilling(ports, config, owner, session, checkoutInput());
    // The checkout reservation lapsed and every one of the 100 paid places is now taken.
    await query("UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 hour' WHERE request_id=$1", [request]);
    await query(`WITH u AS (INSERT INTO auth.users(id) SELECT gen_random_uuid() FROM generate_series(1,100) RETURNING id),
      o AS (INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id,state) SELECT id,gen_random_uuid(),'live','weekly','pdt_weekly','ready' FROM u RETURNING user_id,request_id)
      INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created)
      SELECT 'sub_full_'||row_number() OVER (),user_id,request_id,'live','weekly','cus_full','active',now()+interval '20 days',1 FROM o`);
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_trial_start')).toMatchObject({ trial: { granted: false, reason: 'capacity_full' } });
    expect(await entitlement()).toMatchObject({ active: false });
    await expect(chargeFirst()).rejects.toMatchObject({ code: 'LOOP_BILLING_FULFILLMENT_PENDING' });
    expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods WHERE subscription_id=$1', ['sub_trial'])).rows[0].n).toBe(0);
    expect((await query('SELECT reason,resolved FROM jobvance_private.loop_billing_pending_fulfillment WHERE user_id=$1', [owner])).rows).toEqual([{ reason: 'LOOP_PILOT_FULL', resolved: false }]);
    expect(await entitlement()).toMatchObject({ active: false });
    expect(await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 })).toMatchObject({ fulfillmentPending: true });
    // Once a place frees up, the retried delivery admits the paid month normally.
    await query("DELETE FROM jobvance_private.loop_subscriptions WHERE subscription_id='sub_full_1'");
    expect(await chargeFirst()).toMatchObject({ received: true });
    expect(await entitlement()).toMatchObject({ active: true, plan: 'weekly', validUntil: iso(firstCharge() + 30 * DAY) });
  });
  it('review 1: a denied trial is stopped at Dodo before its first charge, verified, audited and idempotent', async () => {
    await controlLoopBilling(ports, config, owner, session, checkoutInput());
    await query("UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 hour' WHERE request_id=$1", [request]);
    await fillAllPaidPlaces();
    const result = await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_trial_start');
    expect(result).toMatchObject({ trial: { granted: false, reason: 'capacity_full', stopState: 'stopped' } });
    expect(provider.patches).toBe(1);
    expect((await query("SELECT stop_state,stop_attempts,stop_updated_at IS NOT NULL audited FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_trial'")).rows).toEqual([{ stop_state: 'stopped', stop_attempts: 1, audited: true }]);
    expect(await entitlement()).toMatchObject({ active: false });
    expect(await reminders()).toEqual([]);
    const status = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 }) as Record<string, any>;
    expect(status.subscription.trial).toMatchObject({ granted: false, deniedReason: 'capacity_full', stopState: 'stopped' });
    // Any later trial-start delivery never repeats the provider write or reverts the terminal state.
    await applyLoopBillingWebhook(ports, config, activation(epoch + 2) as never, 'msg_trial_again');
    expect(provider.patches).toBe(1);
    await expect(query("UPDATE jobvance_private.loop_subscription_trials SET stop_state='required' WHERE subscription_id='sub_trial'")).rejects.toThrow('LOOP_TRIAL_IMMUTABLE');
  });
  it('review 1: an unverified stop fails the delivery, releases the occurrence and succeeds on Dodo retry', async () => {
    await controlLoopBilling(ports, config, owner, session, checkoutInput());
    await query("UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 hour' WHERE request_id=$1", [request]);
    await fillAllPaidPlaces();
    provider.patchFails = true;
    await expect(applyLoopBillingWebhook(ports, config, activation() as never, 'msg_trial_start')).rejects.toMatchObject({ code: 'LOOP_TRIAL_STOP_PENDING' });
    expect((await query("SELECT stop_state,stop_attempts FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_trial'")).rows).toEqual([{ stop_state: 'uncertain', stop_attempts: 1 }]);
    expect((await query("SELECT count(*)::int n FROM jobvance_private.loop_billing_events WHERE event_id='dodo_msg_trial_start'")).rows[0].n).toBe(0);
    provider.patchFails = false;
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_trial_start')).toMatchObject({ trial: { stopState: 'stopped' } });
    expect((await query("SELECT stop_state,stop_attempts FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_trial'")).rows).toEqual([{ stop_state: 'stopped', stop_attempts: 2 }]);
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_trial_start')).toEqual({ received: true, duplicate: true });
  });
  it('review 1: a denied trial whose first charge already happened is recorded as charged and the paid month needs a place', async () => {
    provider.trialStart = Date.now() - 9 * DAY;
    await controlLoopBilling(ports, config, owner, session, checkoutInput());
    await query("UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 hour' WHERE request_id=$1", [request]);
    await fillAllPaidPlaces();
    provider.charged = true; // Dodo already renewed; the original activation is delivered late.
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_trial_start')).toMatchObject({ trial: { granted: false, stopState: 'charged' } });
    expect(provider.patches).toBe(0);
    await expect(chargeFirst()).rejects.toMatchObject({ code: 'LOOP_BILLING_FULFILLMENT_PENDING' });
    expect((await query('SELECT reason FROM jobvance_private.loop_billing_pending_fulfillment WHERE user_id=$1', [owner])).rows).toEqual([{ reason: 'LOOP_PILOT_FULL' }]);
    expect(await entitlement()).toMatchObject({ active: false });
  });
  it('review 2: a granted trial that expired, then lost the last place, sends its first payment to pending fulfillment', async () => {
    await startTrial(Date.now() - 8 * DAY);
    expect((await query("SELECT granted FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_trial'")).rows[0].granted).toBe(true);
    await query("UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 hour' WHERE request_id=$1", [request]);
    await fillAllPaidPlaces();
    await expect(chargeFirst()).rejects.toMatchObject({ code: 'LOOP_BILLING_FULFILLMENT_PENDING' });
    expect((await query("SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods WHERE subscription_id='sub_trial'")).rows[0].n).toBe(0);
    expect(await entitlement()).toMatchObject({ active: false });
    await query("DELETE FROM jobvance_private.loop_subscriptions WHERE subscription_id='sub_full_1'");
    expect(await chargeFirst()).toMatchObject({ received: true });
    expect(await entitlement()).toMatchObject({ active: true, validUntil: iso(firstCharge() + 30 * DAY) });
  });
  it('review 3: a late original $0 activation after a renewal binds the original trial dates from immutable evidence', async () => {
    provider.trialStart = Date.now() - 10 * DAY;
    await controlLoopBilling(ports, config, owner, session, checkoutInput());
    await chargeFirst(); // The first charge is processed before the original activation.
    expect(await applyLoopBillingWebhook(ports, config, activation(epoch + 30) as never, 'msg_trial_start')).toMatchObject({ received: true, trial: { granted: true } });
    expect((await query("SELECT starts_at,first_charge_at FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_trial'")).rows)
      .toEqual([{ starts_at: new Date(provider.trialStart), first_charge_at: new Date(firstCharge()) }]);
    expect(await entitlement()).toMatchObject({ active: true, validUntil: iso(firstCharge() + 30 * DAY) });
  });
  it('review 4: cancelling at the first-charge boundary reports a possibly due charge, not "no charge"', async () => {
    await startTrial(Date.now() - 7 * DAY + 5 * 60000);
    const status = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 }) as Record<string, any>;
    const receipt = await controlLoopBilling(ports, config, owner, session, { action: 'cancel', requestId: randomUUID(), expectedGeneration: 0, expectedSubscriptionId: 'sub_trial', expectedVersion: status.subscription.version, consent: true, contractVersion: 3 });
    expect(receipt).toMatchObject({ status: 'confirmed', trialOutcome: 'charge_due', subscription: { trial: { cancelOutcome: 'charge_due' } } });
  });
  it('review 4: in a renewal race, cancelling after Dodo already took the first charge reports after_first_charge', async () => {
    await startTrial();
    const status = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 }) as Record<string, any>;
    // Dodo renewed (a later period) before the renewal webhook reached Jobvance.
    provider.trialStart = Date.now() - 8 * DAY; provider.charged = true;
    const receipt = await controlLoopBilling(ports, config, owner, session, { action: 'cancel', requestId: randomUUID(), expectedGeneration: 0, expectedSubscriptionId: 'sub_trial', expectedVersion: status.subscription.version, consent: true, contractVersion: 3 });
    expect(receipt).toMatchObject({ status: 'confirmed', trialOutcome: 'after_first_charge' });
    expect(provider.patches).toBe(1);
  });
  async function denyNextTrial() {
    await controlLoopBilling(ports, config, owner, session, checkoutInput());
    await query("UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 hour' WHERE request_id=$1", [request]);
    await fillAllPaidPlaces();
  }
  const trialRow = async () => instants((await query("SELECT stop_state,stop_attempts,stop_escalated_at IS NOT NULL escalated FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_trial'")).rows[0]);
  const eventKept = async (id: string) => (await query('SELECT count(*)::int n FROM jobvance_private.loop_billing_events WHERE event_id=$1', ['dodo_' + id])).rows[0].n === 1;
  it('round 4 (1): a duplicate of a delivery interrupted after the trial record committed resumes the provider stop', async () => {
    await denyNextTrial();
    const afterCommit: LoopBillingPorts = { ...ports, rpc: async <T>(name: string, args: Record<string, unknown>) => {
      const result = await sql(name, args);
      if (name === 'job_loop_billing_apply_trial') throw Error('Process interrupted after the SQL commit');
      return result as T;
    } };
    await expect(applyLoopBillingWebhook(afterCommit, config, activation() as never, 'msg_cut')).rejects.toThrow('Process interrupted');
    expect(await eventKept('msg_cut')).toBe(true);
    expect(await trialRow()).toMatchObject({ stop_state: 'required', stop_attempts: 0 });
    // The same signed occurrence is redelivered: it is a duplicate, yet the stop resumes.
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_cut')).toEqual({ received: true, duplicate: true, trial: { stopState: 'stopped' } });
    expect(provider).toMatchObject({ cancelled: true, patches: 1 });
    expect(await trialRow()).toMatchObject({ stop_state: 'stopped', stop_attempts: 1 });
    // Only once the stop is proven is a further duplicate a plain acknowledgement.
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_cut')).toEqual({ received: true, duplicate: true });
    expect(provider.patches).toBe(1);
  });
  it('round 4 (1): an interruption after Dodo accepted the cancellation stays pending, then reconciles without a second write', async () => {
    await denyNextTrial();
    const lostFinalize: LoopBillingPorts = { ...ports, rpc: async <T>(name: string, args: Record<string, unknown>) => {
      if (name === 'job_loop_billing_trial_stop_finalize') throw Error('Process interrupted before finalize');
      return await sql(name, args) as T;
    } };
    await expect(applyLoopBillingWebhook(lostFinalize, config, activation() as never, 'msg_mid')).rejects.toThrow('Process interrupted');
    expect(provider).toMatchObject({ cancelled: true, patches: 1 });
    expect(await trialRow()).toMatchObject({ stop_state: 'requested', stop_attempts: 1 });
    // A duplicate inside the in-flight window is neither acknowledged nor a second write.
    await expect(applyLoopBillingWebhook(ports, config, activation() as never, 'msg_mid')).rejects.toMatchObject({ code: 'LOOP_TRIAL_STOP_PENDING' });
    expect(await eventKept('msg_mid')).toBe(false);
    await query("UPDATE jobvance_private.loop_subscription_trials SET stop_updated_at=now()-interval '3 minutes' WHERE subscription_id='sub_trial'");
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_mid')).toMatchObject({ received: true, trial: { granted: false, stopState: 'stopped' } });
    expect(provider.patches).toBe(1);
    expect(await eventKept('msg_mid')).toBe(true);
  });
  it('round 4 (2): used-up fast stop retries stay pending and escalated, never acknowledged, and recover after the backoff', async () => {
    await denyNextTrial(); provider.patchFails = true;
    for (let attempt = 0; attempt < 20; attempt++)
      await expect(applyLoopBillingWebhook(ports, config, activation() as never, 'msg_exhaust')).rejects.toMatchObject({ code: 'LOOP_TRIAL_STOP_PENDING' });
    expect(provider.patches).toBe(20);
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(applyLoopBillingWebhook(ports, config, activation() as never, 'msg_exhaust')).rejects.toMatchObject({ code: 'LOOP_TRIAL_STOP_PENDING' });
    expect(provider).toMatchObject({ patches: 20, cancelled: false });
    expect(await eventKept('msg_exhaust')).toBe(false);
    expect(await trialRow()).toEqual({ stop_state: 'uncertain', stop_attempts: 20, escalated: true });
    expect(await sql('job_loop_billing_trial_stops_escalated', { p_mode: 'live' })).toMatchObject([{ userId: owner, subscriptionId: 'sub_trial', stopState: 'uncertain', attempts: 20 }]);
    const status = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 }) as Record<string, any>;
    expect(status.subscription.trial).toMatchObject({ granted: false, stopState: 'uncertain' });
    await expect(query("UPDATE jobvance_private.loop_subscription_trials SET stop_escalated_at=NULL WHERE subscription_id='sub_trial'")).rejects.toThrow('LOOP_TRIAL_IMMUTABLE');
    // After the six-hour backoff, Dodo's next retry tries the provider again.
    await query("UPDATE jobvance_private.loop_subscription_trials SET stop_updated_at=now()-interval '7 hours' WHERE subscription_id='sub_trial'");
    provider.patchFails = false;
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_exhaust')).toMatchObject({ received: true, trial: { stopState: 'stopped' } });
    expect(await trialRow()).toEqual({ stop_state: 'stopped', stop_attempts: 21, escalated: true });
    expect(await sql('job_loop_billing_trial_stops_escalated', { p_mode: 'live' })).toEqual([]);
  });
  it('round 4 (3): a denied-trial stop near or past the first-charge boundary is charge_due, not stopped, and later reconciles', async () => {
    for (const [minutes, settle] of [[5, 'charged'], [-5, 'stopped']] as const) {
      await db.exec('TRUNCATE auth.users CASCADE; TRUNCATE jobvance_private.loop_billing_events');
      await query('INSERT INTO auth.users(id) VALUES($1)', [owner]); await query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [session, owner]); await query('SELECT job_loop_open_record($1)', [owner]);
      provider = { trialStart: Date.now() - 7 * DAY + minutes * 60000, charged: false, cancelled: false, status: 'active', refunded: false, firstChargeFails: false, posts: [], patches: 0, patchFails: false };
      await denyNextTrial();
      // Dodo accepted the cancellation, but too close to the charge to prove none was taken.
      expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_boundary')).toMatchObject({ received: true, trial: { granted: false, stopState: 'charge_due' } });
      expect(provider).toMatchObject({ cancelled: true, patches: 1 });
      expect(await eventKept('msg_boundary')).toBe(true);
      const status = await controlLoopBilling(ports, config, owner, session, { action: 'status', contractVersion: 3 }) as Record<string, any>;
      expect(status.subscription.trial).toMatchObject({ stopState: 'charge_due' });
      await expect(query("UPDATE jobvance_private.loop_subscription_trials SET stop_state='uncertain' WHERE subscription_id='sub_trial'")).rejects.toThrow('LOOP_TRIAL_IMMUTABLE');
      if (settle === 'charged') {
        // The first charge was taken after all: recorded as charged; no free place means pending fulfillment.
        await expect(chargeFirst()).rejects.toMatchObject({ code: 'LOOP_BILLING_FULFILLMENT_PENDING' });
      } else {
        // Dodo ended the subscription at the boundary without charging.
        provider.status = 'cancelled';
        await applyLoopBillingWebhook(ports, config, { type: 'subscription.cancelled', created: epoch + 40, data: { payload_type: 'Subscription', subscription_id: 'sub_trial', status: 'cancelled', metadata: meta() } } as never, 'msg_ended');
      }
      expect((await trialRow()).stop_state).toBe(settle);
      expect(provider.patches).toBe(1);
    }
  });
  it('round 4 (3): a denied-trial stop read back well before the boundary is still proven stopped', async () => {
    provider.trialStart = Date.now() - 7 * DAY + 30 * 60000;
    await denyNextTrial();
    expect(await applyLoopBillingWebhook(ports, config, activation() as never, 'msg_early')).toMatchObject({ trial: { stopState: 'stopped' } });
  });
  /** Dodo scheduled the first charge 30 minutes after created_at + 7 days (inside the accepted hour). */
  const offset = 30 * 60000;
  const offsetPorts: LoopBillingPorts = { ...ports, provider: async (path, body, method) => {
    const result = await ports.provider(path, body, method);
    if (path === 'subscriptions/sub_trial') return { ...result, previous_billing_date: iso(provider.charged ? firstCharge() + offset : provider.trialStart), next_billing_date: iso(firstCharge() + offset + (provider.charged ? 30 * DAY : 0)) };
    if (path === 'payments/pay_first') return { ...result, service_periods: [{ subscription_id: 'sub_trial', starts_at: iso(firstCharge() + offset), ends_at: iso(firstCharge() + offset + 30 * DAY) }] };
    return result;
  } };
  it('round 4 (4): a later delivery of the original $0 payment after renewal keeps the accepted +30-minute first charge', async () => {
    provider.trialStart = Date.now() - 9 * DAY;
    await controlLoopBilling(ports, config, owner, session, checkoutInput());
    await applyLoopBillingWebhook(offsetPorts, config, activation() as never, 'msg_first_seen');
    const stored = { starts_at: new Date(provider.trialStart), first_charge_at: new Date(firstCharge() + offset) };
    expect((await query("SELECT starts_at,first_charge_at FROM jobvance_private.loop_subscription_trials")).rows).toEqual([stored]);
    provider.charged = true;
    expect(await applyLoopBillingWebhook(offsetPorts, config, activation(epoch + 30) as never, 'msg_redelivered')).toMatchObject({ received: true, trial: { firstChargeAt: expect.anything() } });
    expect((await query("SELECT starts_at,first_charge_at FROM jobvance_private.loop_subscription_trials")).rows).toEqual([stored]);
    // A different payment or trial start is still a conflict.
    await expect(sql('job_loop_billing_apply_trial', { p_user: owner, p_request: request, p_mode: 'live', p_plan: 'weekly', p_product: 'pdt_weekly', p_session: 'cks_trial', p_subscription: 'sub_trial', p_customer: 'cus_trial', p_status: 'active',
      p_trial_start: iso(provider.trialStart + 60000), p_first_charge: iso(firstCharge()), p_cancel_at_period_end: false, p_event: 'dodo_msg_forged', p_created: epoch + 50, p_payload_hash: 'a'.repeat(64), p_payment: 'pay_trial' })).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');
  });
  it('round 4 (4): a $0 activation first observed after its +30-minute first charge adopts that recorded charge time', async () => {
    provider.trialStart = Date.now() - 10 * DAY;
    await controlLoopBilling(ports, config, owner, session, checkoutInput());
    provider.charged = true;
    expect(await applyLoopBillingWebhook(offsetPorts, config, { type: 'payment.succeeded', created: epoch + 20, data: { payload_type: 'Payment', subscription_id: 'sub_trial', payment_id: 'pay_first' } } as never, 'msg_first_charge')).toMatchObject({ received: true });
    expect(await applyLoopBillingWebhook(offsetPorts, config, activation(epoch + 30) as never, 'msg_trial_late')).toMatchObject({ received: true, trial: { granted: true } });
    expect((await query("SELECT first_charge_at,reminder_at FROM jobvance_private.loop_subscription_trials")).rows)
      .toEqual([{ first_charge_at: new Date(firstCharge() + offset), reminder_at: new Date(firstCharge() + offset - 2 * DAY) }]);
    expect(await entitlement()).toMatchObject({ active: true, validUntil: iso(firstCharge() + offset + 30 * DAY) });
  });
  it('a zero-amount payment on a paid order never grants anything', async () => {
    await controlLoopBilling(ports, config, owner, session, checkoutInput({ trial: false }));
    await expect(applyLoopBillingWebhook(ports, config, activation() as never, 'msg_zero_paid')).rejects.toThrow();
    expect(await entitlement()).toMatchObject({ active: false });
    expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_subscription_trials')).rows[0].n).toBe(0);
  });
});

describe('trial reminder confirmation (Dodo sends the trial-ending email)', () => {
  const sweep = () => confirmTrialReminders(ports, 'live');
  const trialEnding = (changes: Record<string, unknown> = {}) => ({ email_log_id: 'elog_1', email_type: 'subscription_trial_ending', category: 'subscriptions', status: 'delivered',
    created_at: iso(firstCharge() - 2 * DAY + 60000), subject: 'Your trial ends soon', recipient: 'x@example.test', has_preview: true, ...changes });
  const receipt = async () => instants((await query('SELECT * FROM jobvance_private.loop_trial_reminder_receipts')).rows[0] ?? {});
  const sentAt = async () => { const value = (await query('SELECT reminder_sent_at FROM jobvance_private.loop_subscription_trials')).rows[0].reminder_sent_at; return value === null ? null : new Date(value).toISOString(); };
  const escalated = async () => (await sql('job_loop_billing_trial_reminders_escalated', { p_mode: 'live' })) as Record<string, unknown>[];
  const ageCheck = () => query("UPDATE jobvance_private.loop_trial_reminder_receipts SET last_checked_at=now()-interval '21 minutes'");
  /** Moves every fixed trial date earlier by `hours` (test-only, trigger bypassed as superuser). */
  async function shiftTrial(hours: number) {
    await query('ALTER TABLE jobvance_private.loop_subscription_trials DISABLE TRIGGER loop_trial_immutable');
    await query(`UPDATE jobvance_private.loop_subscription_trials SET starts_at=starts_at-make_interval(hours=>$1),ends_at=ends_at-make_interval(hours=>$1),
      first_charge_at=first_charge_at-make_interval(hours=>$1),reminder_at=reminder_at-make_interval(hours=>$1)`, [hours]);
    await query('ALTER TABLE jobvance_private.loop_subscription_trials ENABLE TRIGGER loop_trial_immutable');
    provider.trialStart -= hours * 3600000;
  }

  it('confirms a delivered trial-ending email and sets the one-way marker to its send time', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ email_log_id: 'elog_receipt', email_type: 'payment_successful', created_at: iso(provider.trialStart) }), trialEnding()];
    expect(await sweep()).toEqual({ checked: 1, confirmed: 1, pending: 0, escalated: 0, unavailable: 0 });
    expect(await sentAt()).toBe(iso(firstCharge() - 2 * DAY + 60000));
    expect(await receipt()).toMatchObject({ email_log_id: 'elog_1', email_type: 'subscription_trial_ending', email_status: 'delivered', escalated_at: null });
    // Confirmed rows leave every reminder queue and the marker never moves.
    expect(await reminders()).toEqual([]);
    expect(await sweep()).toMatchObject({ checked: 0 });
    await expect(query('UPDATE jobvance_private.loop_subscription_trials SET reminder_sent_at=now()')).rejects.toThrow('LOOP_TRIAL_IMMUTABLE');
  });
  it('waits while Dodo has not sent it, escalates twelve hours after the reminder time, and a late email still confirms', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ email_type: 'payment_successful' })];
    expect(await sweep()).toMatchObject({ checked: 1, pending: 1, confirmed: 0 });
    expect(await sentAt()).toBeNull();
    // A checked row waits 20 minutes before the next read.
    expect(await sweep()).toMatchObject({ checked: 0 });
    expect(await escalated()).toEqual([]);
    await ageCheck(); await shiftTrial(13);
    expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
    expect(await receipt()).toMatchObject({ escalation_reason: 'not_found', confirmed_at: null });
    expect(await escalated()).toEqual([expect.objectContaining({ userId: owner, subscriptionId: 'sub_trial', reason: 'not_found' })]);
    await ageCheck();
    emailLog = [trialEnding({ created_at: new Date(Date.now() - 60000).toISOString() })];
    expect(await sweep()).toMatchObject({ confirmed: 1 });
    expect(await escalated()).toEqual([]);
  });
  it('escalates a failed email at once and never confirms it', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ status: 'failed', failure_code: 'mailbox_not_found' })];
    expect(await sweep()).toMatchObject({ escalated: 1, confirmed: 0 });
    expect(await sentAt()).toBeNull();
    expect(await receipt()).toMatchObject({ escalation_reason: 'failed', email_status: 'failed' });
  });
  it('ignores trial emails outside the three days before this first charge, in the sweep and in SQL', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ created_at: iso(firstCharge() - 4 * DAY) }), trialEnding({ email_log_id: 'elog_after', created_at: iso(firstCharge() + 1000) })];
    expect(await sweep()).toMatchObject({ pending: 1, confirmed: 0 });
    await expect(sql('job_loop_billing_trial_reminder_check', { p_mode: 'live', p_subscription: 'sub_trial', p_email_log_id: 'elog_old', p_email_type: 'subscription_trial_ending',
      p_email_status: 'delivered', p_email_created_at: iso(firstCharge() - 4 * DAY) })).rejects.toThrow('LOOP_BILLING_UNBOUND');
    expect(await sentAt()).toBeNull();
  });
  it('a provider read failure records nothing and is retried by the next sweep', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = Error('Provider timeout');
    expect(await sweep()).toMatchObject({ checked: 1, unavailable: 1 });
    expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_trial_reminder_receipts')).rows[0].n).toBe(0);
    emailLog = [trialEnding()];
    expect(await sweep()).toMatchObject({ confirmed: 1 });
  });
  it('skips trials that are not yet due or are cancelling', async () => {
    await startTrial();
    expect(await sweep()).toMatchObject({ checked: 0 });
    await shiftTrial(5 * 24);
    expect((await sweep()).checked).toBe(1);
    await ageCheck();
    await query('UPDATE jobvance_private.loop_subscriptions SET cancel_at_period_end=true');
    expect(await sweep()).toMatchObject({ checked: 0 });
  });
  it('dispatches a mode-bound single-use ticket only while a reminder is due', async () => {
    await query("UPDATE public.job_loop_scheduler_config SET api_origin='https://fixture.supabase.co',publishable_key='fixture-publishable' WHERE singleton");
    expect((await query('SELECT public.job_loop_trial_reminder_dispatch() n')).rows[0].n).toBe(0);
    await startTrial(Date.now() - 5 * DAY - 60000);
    expect((await query('SELECT public.job_loop_trial_reminder_dispatch() n')).rows[0].n).toBe(1);
    const call = (await query('SELECT url,headers,body FROM net.calls')).rows[0];
    expect(call.url).toBe('https://fixture.supabase.co/functions/v1/job-loop-billing');
    expect(call.body).toEqual({ action: 'trial_reminders' });
    expect(call.headers.apikey).toBe('fixture-publishable');
    const ticket = call.headers['x-trial-reminder-ticket'];
    const consume = (t: string, mode: 'test' | 'live') => sql('job_loop_billing_trial_reminder_consume_ticket', { p_ticket: t, p_mode: mode });
    const req = (t: string) => new Request('https://fixture.supabase.co/functions/v1/job-loop-billing', { method: 'POST', headers: { 'x-trial-reminder-ticket': t } });
    await expect(authorizeTrialReminderDispatch(req(ticket), { action: 'trial_reminders', limit: 500 }, 'live', consume)).rejects.toMatchObject({ code: 'LOOP_INVALID_INPUT' });
    await expect(authorizeTrialReminderDispatch(req(ticket), { action: 'trial_reminders' }, 'test', consume)).rejects.toMatchObject({ code: 'LOOP_REMINDER_UNAUTHORIZED' });
    await expect(authorizeTrialReminderDispatch(req('not-a-ticket'), { action: 'trial_reminders' }, 'live', consume)).rejects.toMatchObject({ code: 'LOOP_REMINDER_UNAUTHORIZED' });
    await authorizeTrialReminderDispatch(req(ticket), { action: 'trial_reminders' }, 'live', consume);
    await expect(authorizeTrialReminderDispatch(req(ticket), { action: 'trial_reminders' }, 'live', consume)).rejects.toMatchObject({ code: 'LOOP_REMINDER_UNAUTHORIZED' });
    expect((await query("SELECT * FROM cron.job WHERE jobname='jobvance-trial-reminder-check'")).rows[0]).toMatchObject({ schedule: '*/30 * * * *', command: 'SELECT public.job_loop_trial_reminder_dispatch();' });
    // Tickets and receipts are private even to the service role; only the RPCs reach them.
    await db.exec('SET ROLE service_role');
    try {
      await expect(query('SELECT * FROM public.job_loop_trial_reminder_tickets')).rejects.toThrow();
      await expect(query('SELECT * FROM jobvance_private.loop_trial_reminder_receipts')).rejects.toThrow();
      await expect(query('SELECT public.job_loop_trial_reminder_dispatch()')).rejects.toThrow();
    } finally { await db.exec('RESET ROLE'); }
  });
});
