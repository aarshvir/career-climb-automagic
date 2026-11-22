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
/** Dodo's customer email log for every fixture customer, or a read failure. `emailLogRaw` replaces the whole
 * response body (malformed or truncated pages); `emailLogTotal` overrides the reported total_count. */
let emailLog: Record<string, unknown>[] | Error = [];
let emailLogRaw: unknown;
let emailLogTotal: number | undefined;
/** The customers whose email log was read, in order. */
let emailReads: string[] = [];
const DAY = 86400000;
let db: PGlite, owner: string, session: string, request: string, epoch: number;
const query = (q: string, a: unknown[] = []) => db.query<Record<string, any>>(q, a);
/** Every ordinary table in the two application schemas, so the tables the reminder migration adds can be listed. */
const tableNames = async () => (await query(`SELECT n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN('r','p') AND n.nspname IN('jobvance_private','public')`)).rows.map(row => row.name as string);
let tablesCreatedByReminderMigration: string[] = [];
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
    const emails = /^customers\/(cus_trial|cus_fair\d+)\/emails\?page_size=100$/.exec(path);
    if (emails) {
      emailReads.push(emails[1]);
      if (emailLog instanceof Error) throw emailLog;
      return (emailLogRaw ?? { items: emailLog, total_count: emailLogTotal ?? emailLog.length }) as Record<string, unknown>;
    }
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
  const tablesBefore = await tableNames();
  await db.exec(await readFile(new URL('../migrations/' + reminderMigration, import.meta.url), 'utf8'));
  tablesCreatedByReminderMigration = (await tableNames()).filter(name => !tablesBefore.includes(name)).sort();
}, 60000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE; TRUNCATE jobvance_private.loop_billing_events; TRUNCATE public.job_loop_pilot_users CASCADE; TRUNCATE jobvance_private.loop_trial_reminder_receipts, public.job_loop_trial_reminder_tickets, net.calls');
  emailLog = []; emailLogRaw = undefined; emailLogTotal = undefined; emailReads = [];
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

describe('trial reminder evidence (Dodo sends the trial-ending email; its log cannot be bound to a subscription)', () => {
  const sweep = (limit?: number) => confirmTrialReminders(ports, 'live', limit);
  const trialEnding = (changes: Record<string, unknown> = {}) => ({ email_log_id: 'elog_1', email_type: 'subscription_trial_ending', category: 'subscriptions', status: 'delivered',
    created_at: iso(firstCharge() - 2 * DAY + 60000), subject: 'Your trial ends soon', recipient: 'x@example.test', has_preview: true, ...changes });
  /** The same type and time as the real one, but on the log because ANOTHER product's trial is ending: Dodo's entry does not say so. */
  const otherProduct = (status = 'delivered', changes: Record<string, unknown> = {}) =>
    trialEnding({ email_log_id: 'elog_other_subscription', status, subject: 'Another product trial is ending', ...changes });
  const receipt = async () => instants((await query('SELECT * FROM jobvance_private.loop_trial_reminder_receipts')).rows[0] ?? {});
  const sentAt = async () => { const value = (await query('SELECT reminder_sent_at FROM jobvance_private.loop_subscription_trials')).rows[0].reminder_sent_at; return value === null ? null : new Date(value).toISOString(); };
  const escalated = async () => ((await sql('job_loop_billing_trial_reminders_escalated', { p_mode: 'live' })) as Record<string, unknown>[]).map(instants);
  const ageCheck = (minutes = 21) => query('UPDATE jobvance_private.loop_trial_reminder_receipts SET last_checked_at=now()-make_interval(mins=>$1)', [minutes]);
  const dispatch = async () => (await query('SELECT public.job_loop_trial_reminder_dispatch() n')).rows[0].n as number;
  const useScheduler = () => query("UPDATE public.job_loop_scheduler_config SET api_origin='https://fixture.supabase.co',publishable_key='fixture-publishable' WHERE singleton");
  /** Moves every fixed trial date earlier by `hours` (test-only, trigger bypassed as superuser). */
  async function shiftTrial(hours: number) {
    await query('ALTER TABLE jobvance_private.loop_subscription_trials DISABLE TRIGGER loop_trial_immutable');
    await query(`UPDATE jobvance_private.loop_subscription_trials SET starts_at=starts_at-make_interval(hours=>$1),ends_at=ends_at-make_interval(hours=>$1),
      first_charge_at=first_charge_at-make_interval(hours=>$1),reminder_at=reminder_at-make_interval(hours=>$1)`, [hours]);
    await query('ALTER TABLE jobvance_private.loop_subscription_trials ENABLE TRIGGER loop_trial_immutable');
    provider.trialStart -= hours * 3600000;
  }
  /** Copies of the started live trial for other owners (same dates), each with its own provider customer cus_fair<n>. */
  async function cloneTrials(count: number) {
    for (let i = 1; i <= count; i++) {
      const user = randomUUID(), clonedRequest = randomUUID();
      await query('INSERT INTO auth.users(id) VALUES($1)', [user]);
      await query(`INSERT INTO jobvance_private.loop_billing_orders SELECT (jsonb_populate_record(NULL::jobvance_private.loop_billing_orders,
        to_jsonb(o)||jsonb_build_object('user_id',$1::uuid,'request_id',$2::uuid,'session_id',NULL))).* FROM jobvance_private.loop_billing_orders o WHERE o.user_id=$3 AND o.request_id=$4`, [user, clonedRequest, owner, request]);
      await query(`INSERT INTO jobvance_private.loop_subscriptions SELECT (jsonb_populate_record(NULL::jobvance_private.loop_subscriptions,
        to_jsonb(s)||jsonb_build_object('subscription_id',$1::text,'user_id',$2::uuid,'request_id',$3::uuid,'customer_id',$4::text))).* FROM jobvance_private.loop_subscriptions s WHERE s.subscription_id='sub_trial'`,
        ['sub_fair' + i, user, clonedRequest, 'cus_fair' + i]);
      await query(`INSERT INTO jobvance_private.loop_subscription_trials SELECT (jsonb_populate_record(NULL::jobvance_private.loop_subscription_trials,
        to_jsonb(t)||jsonb_build_object('subscription_id',$1::text,'user_id',$2::uuid,'request_id',$3::uuid,'payment_id',$4::text))).* FROM jobvance_private.loop_subscription_trials t WHERE t.subscription_id='sub_trial'`,
        ['sub_fair' + i, user, clonedRequest, 'pay_fair' + i]);
    }
  }
  const selected = async (limit = 50) => ((await sql('job_loop_billing_trial_reminders_unconfirmed', { p_mode: 'live', p_limit: limit })) as { subscriptionId: string }[]).map(row => row.subscriptionId);

  // Finding 1: Dodo's EmailLogItem carries no subscription, product or payment reference.
  it('records a delivered trial-ending email as unbound evidence and never marks the reminder sent', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ email_log_id: 'elog_receipt', email_type: 'payment_successful', created_at: iso(provider.trialStart) }), trialEnding()];
    expect(await sweep()).toEqual({ checked: 1, confirmed: 0, pending: 0, escalated: 1, unavailable: 0, deferred: 0 });
    expect(await sentAt()).toBeNull();
    expect(await receipt()).toMatchObject({ email_log_id: 'elog_1', email_type: 'subscription_trial_ending', first_email_status: 'delivered', delivery_status: 'delivered', candidate_count: 1,
      email_created_at: new Date(iso(firstCharge() - 2 * DAY + 60000)), escalation_reasons: ['unbound'] });
    expect(await escalated()).toEqual([expect.objectContaining({ userId: owner, subscriptionId: 'sub_trial', reason: 'unbound', reasons: ['unbound'], emailStatus: 'delivered',
      emailSentAt: iso(firstCharge() - 2 * DAY + 60000), candidates: 1, charged: false })]);
    // The marker stays unset, so the legacy due list still shows the trial; a delivered answer ends the rechecks.
    expect(await reminders()).toHaveLength(1);
    await ageCheck(300);
    expect(await sweep()).toMatchObject({ checked: 0 });
  });
  it('does not certify a subscription from an unbound customer-wide email, however well its type and time fit', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [otherProduct('delivered')];
    const result = await sweep();
    expect(result.confirmed).toBe(0);
    expect(await sentAt()).toBeNull();
    expect(await receipt()).toMatchObject({ email_log_id: 'elog_other_subscription', escalation_reasons: ['unbound'] });
    expect(await escalated()).toEqual([expect.objectContaining({ subscriptionId: 'sub_trial', reason: 'unbound' })]);
  });
  it('an ambiguous log with several trial-ending emails stays unbound and says how many overlapped', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding(), otherProduct('delivered', { created_at: iso(firstCharge() - 2 * DAY + 3600000) })];
    expect(await sweep()).toMatchObject({ escalated: 1, confirmed: 0 });
    expect(await receipt()).toMatchObject({ candidate_count: 2, escalation_reasons: ['unbound'] });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'unbound', candidates: 2 })]);
    expect(await sentAt()).toBeNull();
  });
  it('waits while Dodo has not sent it, records not_found twelve hours after the reminder time, and a late email is still only unbound evidence', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ email_type: 'payment_successful' })];
    expect(await sweep()).toMatchObject({ checked: 1, pending: 1, escalated: 0, confirmed: 0 });
    expect(await receipt()).toMatchObject({ escalation_reasons: [], unavailable_checks: 0, not_found_at: null, last_read_at: expect.any(Date) });
    expect(await sentAt()).toBeNull();
    // A checked row waits 20 minutes before the next read.
    expect(await sweep()).toMatchObject({ checked: 0 });
    expect(await escalated()).toEqual([]);
    await ageCheck(); await shiftTrial(13);
    expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
    expect(await receipt()).toMatchObject({ escalation_reasons: ['not_found'], not_found_at: expect.any(Date), email_log_id: null });
    expect(await escalated()).toEqual([expect.objectContaining({ userId: owner, subscriptionId: 'sub_trial', reason: 'not_found' })]);
    await ageCheck(300);
    emailLog = [trialEnding({ created_at: new Date(Date.now() - 60000).toISOString() })];
    expect(await sweep()).toMatchObject({ escalated: 1, confirmed: 0 });
    expect(await receipt()).toMatchObject({ escalation_reasons: ['unbound'], not_found_at: expect.any(Date) });
    expect(await sentAt()).toBeNull();
  });
  it('escalates a failed email at once as unbound plus delivery_failed and never marks the reminder sent', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ status: 'failed', failure_code: 'mailbox_not_found' })];
    expect(await sweep()).toMatchObject({ escalated: 1, confirmed: 0 });
    expect(await sentAt()).toBeNull();
    expect(await receipt()).toMatchObject({ delivery_status: 'failed', first_email_status: 'failed', escalation_reasons: ['unbound', 'delivery_failed'] });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'delivery_failed', reasons: ['unbound', 'delivery_failed'] })]);
  });
  it('ignores trial emails outside the three days before this first charge, in the sweep and in SQL', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ created_at: iso(firstCharge() - 4 * DAY) }), trialEnding({ email_log_id: 'elog_after', created_at: iso(firstCharge() + 1000) })];
    expect(await sweep()).toMatchObject({ pending: 1, escalated: 0, confirmed: 0 });
    await expect(sql('job_loop_billing_trial_reminder_check', { p_mode: 'live', p_subscription: 'sub_trial', p_email_log_id: 'elog_old', p_email_type: 'subscription_trial_ending',
      p_email_status: 'delivered', p_email_created_at: iso(firstCharge() - 4 * DAY) })).rejects.toThrow('LOOP_BILLING_UNBOUND');
    expect(await sentAt()).toBeNull();
  });

  // Finding 2: an unreadable log is a recorded attempt, never a silent skip.
  it('records a provider read failure as unavailable, apart from not_found, and retries it with back-off', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = Error('Provider timeout');
    expect(await sweep()).toMatchObject({ checked: 1, unavailable: 1, pending: 0, escalated: 0 });
    expect(await receipt()).toMatchObject({ checks: 1, unavailable_checks: 1, unavailable_streak: 1, last_unavailable_cause: 'read_failed', last_read_at: null, not_found_at: null,
      email_log_id: null, escalation_reasons: [] });
    // Not overdue yet, so no incident. The retry waits 40 minutes (20, doubling).
    expect(await escalated()).toEqual([]);
    await ageCheck(21);
    expect(await sweep()).toMatchObject({ checked: 0 });
    await ageCheck(41);
    emailLog = [trialEnding()];
    expect(await sweep()).toMatchObject({ checked: 1, escalated: 1, unavailable: 0 });
    expect(await receipt()).toMatchObject({ checks: 2, unavailable_checks: 1, unavailable_streak: 0, last_read_at: expect.any(Date) });
  });
  it('records an invalid response and a page that does not reach the window as unavailable with their own causes, never as not_found', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLogRaw = { items: 'none' };
    expect(await sweep()).toMatchObject({ checked: 1, unavailable: 1 });
    expect(await receipt()).toMatchObject({ last_unavailable_cause: 'invalid_response', unavailable_checks: 1 });
    await ageCheck(300);
    emailLogRaw = undefined; emailLog = []; emailLogTotal = 150; // 150 emails exist, none of them on this page
    expect(await sweep()).toMatchObject({ checked: 1, unavailable: 1 });
    expect(await receipt()).toMatchObject({ last_unavailable_cause: 'incomplete', unavailable_checks: 2, not_found_at: null, escalation_reasons: [] });
  });
  it('escalates a prolonged provider outage after the twelve-hour reminder deadline', async () => {
    await startTrial(Date.now() - 6 * DAY);
    emailLog = Error('Provider unavailable');
    await sweep();
    expect(await sweep()).toMatchObject({ checked: 0 });
    expect(await receipt()).toMatchObject({ escalation_reasons: ['unavailable_overdue'], unavailable_overdue_at: expect.any(Date), not_found_at: null, email_log_id: null });
    expect(await escalated()).toEqual([expect.objectContaining({ subscriptionId: 'sub_trial', reason: 'unavailable_overdue', lastUnavailableCause: 'read_failed', unavailableStreak: 1, lastReadAt: null })]);
    // A later readable log ends the unavailable incident; the time it was first recorded stays.
    await ageCheck(300);
    emailLog = [];
    expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
    expect(await receipt()).toMatchObject({ escalation_reasons: ['not_found'], unavailable_overdue_at: expect.any(Date), unavailable_streak: 0 });
  });
  it('keeps reading an unverified trial after its first charge and keeps the incident', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    await shiftTrial(2 * 24 + 1); // the first charge was an hour ago
    expect(Date.parse((await query('SELECT first_charge_at FROM jobvance_private.loop_subscription_trials')).rows[0].first_charge_at)).toBeLessThan(Date.now());
    emailLog = Error('Provider unavailable');
    expect(await sweep()).toMatchObject({ checked: 1, unavailable: 1 });
    expect(await escalated()).toEqual([expect.objectContaining({ subscriptionId: 'sub_trial', reason: 'unavailable_overdue', charged: true })]);
    await ageCheck(300);
    emailLog = [];
    expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'not_found', charged: true })]);
    // The observation window closes three days after the charge; the incident stays on the support list for thirty.
    await ageCheck(300); await shiftTrial(3 * 24);
    expect(await sweep()).toMatchObject({ checked: 0 });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'not_found' })]);
    await shiftTrial(28 * 24);
    expect(await escalated()).toEqual([]);
    expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_trial_reminder_receipts')).rows[0].n).toBe(1);
  });
  it('the database flags an overdue unverified reminder on its own, before and after the first charge, and not a cancelled trial', async () => {
    await useScheduler();
    await startTrial(Date.now() - 5 * DAY - 60000);
    expect(await dispatch()).toBe(1);
    expect(await escalated()).toEqual([]); // reminder due, but not yet overdue
    await shiftTrial(2 * 24 + 1); // overdue, and the first charge has passed
    expect(await dispatch()).toBe(1); // the billing function is still woken for it
    const flagged = await receipt();
    expect(flagged).toMatchObject({ checks: 0, last_read_at: null, escalation_reasons: ['unavailable_overdue'], unavailable_overdue_at: expect.any(Date) });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'unavailable_overdue', charged: true, lastReadAt: null })]);
    await dispatch();
    expect((await receipt()).escalated_at).toEqual(flagged.escalated_at); // flagged once, not rewritten
    emailLog = [];
    expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
    expect(await receipt()).toMatchObject({ escalation_reasons: ['not_found'], unavailable_overdue_at: flagged.unavailable_overdue_at });
    await query('TRUNCATE jobvance_private.loop_trial_reminder_receipts');
    await query('UPDATE jobvance_private.loop_subscriptions SET cancel_at_period_end=true');
    expect(await dispatch()).toBe(0);
    expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_trial_reminder_receipts')).rows[0].n).toBe(0);
  });
  // Round 2: the database backstop must agree with the sweep selector once the first charge has passed.
  it('the database backstop keeps the missed-reminder incident when a failed first charge moves the subscription to on_hold during an edge outage', async () => {
    await useScheduler();
    await startTrial(Date.now() - 7 * DAY - 3600000);
    provider.firstChargeFails = true;
    await chargeFirst();
    expect((await query("SELECT status FROM jobvance_private.loop_subscriptions WHERE subscription_id='sub_trial'")).rows[0].status).toBe('on_hold');
    expect((await query('SELECT granted FROM jobvance_private.loop_subscription_trials')).rows[0].granted).toBe(true);
    // The edge sweep never runs: only the database acts.
    expect(await dispatch()).toBe(1); // the billing function is still woken for it
    const flagged = await receipt();
    expect(flagged).toMatchObject({ checks: 0, last_read_at: null, escalation_reasons: ['unavailable_overdue'], unavailable_overdue_at: expect.any(Date) });
    expect(await escalated()).toEqual([expect.objectContaining({ subscriptionId: 'sub_trial', reason: 'unavailable_overdue', subscriptionStatus: 'on_hold', charged: true, lastReadAt: null })]);
    await dispatch();
    expect((await receipt()).escalated_at).toEqual(flagged.escalated_at); // flagged once, not rewritten
    // When the edge comes back with Dodo still down, it reads the on_hold trial and the incident stays.
    emailLog = Error('Provider unavailable');
    expect(await sweep()).toMatchObject({ checked: 1, unavailable: 1 });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'unavailable_overdue', subscriptionStatus: 'on_hold', unavailableStreak: 1 })]);
  });
  it('after the first charge the backstop, the dispatcher and the sweep keep an overdue trial whatever status the payment failure left it in', async () => {
    await useScheduler();
    await startTrial(Date.now() - 5 * DAY - 60000);
    await shiftTrial(2 * 24 + 1); // overdue, and the first charge has passed
    for (const status of ['active', 'on_hold', 'past_due', 'paused', 'failed', 'expired']) {
      await query('TRUNCATE jobvance_private.loop_trial_reminder_receipts');
      await query('UPDATE jobvance_private.loop_subscriptions SET status=$1', [status]);
      expect(await selected(), status).toEqual(['sub_trial']);
      expect(await dispatch(), status).toBe(1);
      expect(await escalated(), status).toEqual([expect.objectContaining({ reason: 'unavailable_overdue', subscriptionStatus: status, charged: true })]);
    }
  });
  for (const [kind, change] of [['cancelled at period end', "status='cancelled',cancel_at_period_end=true"], ['revoked', 'revoked=true']] as const) {
    for (const when of ['before', 'after'] as const) {
      it(`a trial ${kind} is left alone ${when} its first charge by the backstop, the dispatcher and the sweep`, async () => {
        await useScheduler();
        await startTrial(Date.now() - 5 * DAY - 60000);
        await shiftTrial(when === 'before' ? 14 : 2 * 24 + 1); // overdue; the first charge is still ahead / has passed
        await query('UPDATE jobvance_private.loop_subscriptions SET ' + change);
        expect(await dispatch()).toBe(0);
        expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_trial_reminder_receipts')).rows[0].n).toBe(0);
        expect(await selected()).toEqual([]);
        expect(await sweep()).toMatchObject({ checked: 0 });
        expect(await escalated()).toEqual([]);
      });
    }
  }
  it('before the first charge only an active subscription owes the reminder', async () => {
    await useScheduler();
    await startTrial(Date.now() - 5 * DAY - 60000);
    await shiftTrial(14); // overdue, first charge still ahead
    for (const status of ['pending', 'on_hold', 'past_due', 'paused', 'failed', 'expired', 'cancelled']) {
      await query('UPDATE jobvance_private.loop_subscriptions SET status=$1', [status]);
      expect(await dispatch(), status).toBe(0);
      expect(await selected(), status).toEqual([]);
      expect((await query('SELECT count(*)::int n FROM jobvance_private.loop_trial_reminder_receipts')).rows[0].n, status).toBe(0);
    }
    await query("UPDATE jobvance_private.loop_subscriptions SET status='active'");
    expect(await dispatch()).toBe(1);
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'unavailable_overdue', subscriptionStatus: 'active', charged: false })]);
  });
  it('reads the least recently attempted rows first, so an outage cannot keep the same rows at the front of the batch', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000); await cloneTrials(4); // sub_fair1..4 and sub_trial, all due with the same dates
    emailLog = Error('Provider unavailable');
    expect(await sweep(2)).toMatchObject({ checked: 2, unavailable: 2 });
    expect(await sweep(2)).toMatchObject({ checked: 2, unavailable: 2 });
    expect(await sweep(2)).toMatchObject({ checked: 1, unavailable: 1 });
    expect(await sweep(2)).toMatchObject({ checked: 0 });
    expect(emailReads).toEqual(['cus_fair1', 'cus_fair2', 'cus_fair3', 'cus_fair4', 'cus_trial']);
  });
  it('orders never-attempted rows first, then by the oldest attempt, and applies the batch limit after that order', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000); await cloneTrials(3);
    await query(`INSERT INTO jobvance_private.loop_trial_reminder_receipts(mode,subscription_id,last_checked_at) VALUES
      ('live','sub_trial',now()-interval '3 hours'),('live','sub_fair1',now()-interval '1 hour'),('live','sub_fair2',now()-interval '2 hours')`);
    expect(await selected(10)).toEqual(['sub_fair3', 'sub_trial', 'sub_fair2', 'sub_fair1']);
    expect(await selected(2)).toEqual(['sub_fair3', 'sub_trial']);
  });
  it('stops a sweep after five provider failures in a row and reaches the remaining rows on the next sweep', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000); await cloneTrials(6); // seven rows
    emailLog = Error('Provider unavailable');
    expect(await sweep()).toMatchObject({ checked: 5, unavailable: 5, deferred: 2 });
    expect(emailReads).toHaveLength(5);
    expect(await sweep()).toMatchObject({ checked: 2, unavailable: 2, deferred: 0 });
    expect(new Set(emailReads).size).toBe(7);
  });

  // Finding 3: Dodo documents "sent" as still in transit; the delivery outcome is tracked apart from the send time.
  it('rechecks an in-flight sent email and surfaces its later bounce without rewriting the send evidence', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [otherProduct('sent')];
    expect(await sweep()).toMatchObject({ escalated: 1, confirmed: 0 });
    const first = await receipt();
    expect(first).toMatchObject({ delivery_status: 'sent', first_email_status: 'sent', delivery_checks: 0, escalation_reasons: ['unbound'] });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'unbound', emailStatus: 'sent' })]);
    await ageCheck();
    emailLog = [otherProduct('failed')];
    expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
    expect(await receipt()).toMatchObject({ delivery_status: 'failed', first_email_status: 'sent', delivery_checks: 1, email_log_id: 'elog_other_subscription',
      email_created_at: first.email_created_at, unbound_at: first.unbound_at, escalation_reasons: ['unbound', 'delivery_failed'] });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'delivery_failed', reasons: ['unbound', 'delivery_failed'], emailStatus: 'failed', firstEmailStatus: 'sent',
      emailSentAt: iso(firstCharge() - 2 * DAY + 60000) })]);
    // A failed answer is terminal: no more rechecks. The marker was never set.
    await ageCheck(300);
    expect(await sweep()).toMatchObject({ checked: 0 });
    expect(await sentAt()).toBeNull();
  });
  for (const [status, reason] of [['complained', 'delivery_complained'], ['blocked', 'delivery_blocked']] as const) {
    it(`surfaces a sent email that later turns out ${status}`, async () => {
      await startTrial(Date.now() - 5 * DAY - 60000);
      emailLog = [trialEnding({ status: 'sent' })];
      await sweep(); await ageCheck();
      emailLog = [trialEnding({ status })];
      expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
      expect(await receipt()).toMatchObject({ delivery_status: status, first_email_status: 'sent', escalation_reasons: ['unbound', reason] });
      expect(await escalated()).toEqual([expect.objectContaining({ reason, emailStatus: status })]);
    });
  }
  it('a delivered answer ends the rechecks and leaves only the unbound incident', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ status: 'sent' })];
    await sweep(); await ageCheck();
    emailLog = [trialEnding({ status: 'delivered' })];
    expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
    expect(await receipt()).toMatchObject({ delivery_status: 'delivered', first_email_status: 'sent', delivery_checks: 1, escalation_reasons: ['unbound'] });
    await ageCheck(300);
    expect(await sweep()).toMatchObject({ checked: 0 });
    expect(await escalated()).toEqual([expect.objectContaining({ reason: 'unbound', emailStatus: 'delivered', firstEmailStatus: 'sent' })]);
  });
  it('rechecks a still-in-flight email with back-off and at most 24 times', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ status: 'sent' })];
    await sweep();
    await ageCheck(21);
    expect(await sweep()).toMatchObject({ checked: 1 }); // first recheck, 20 minutes after the first sight
    await ageCheck(21);
    expect(await sweep()).toMatchObject({ checked: 0 }); // the next one waits 40 minutes
    let rechecks = 1;
    for (let i = 0; i < 60; i++) { await ageCheck(300); if ((await sweep()).checked === 0) break; rechecks++; }
    expect(rechecks).toBe(24);
    expect(await receipt()).toMatchObject({ delivery_status: 'sent', delivery_checks: 24, escalation_reasons: ['unbound'] });
  });
  it('keeps the evidence and treats a recorded email that vanishes from the log as unavailable', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ status: 'sent' })];
    await sweep(); await ageCheck();
    emailLog = [trialEnding({ email_log_id: 'elog_new_one', status: 'delivered' })]; // a different email must not take its place
    expect(await sweep()).toMatchObject({ checked: 1, unavailable: 1, escalated: 0 });
    expect(await receipt()).toMatchObject({ email_log_id: 'elog_1', delivery_status: 'sent', last_unavailable_cause: 'incomplete', escalation_reasons: ['unbound'] });
  });
  it('never rewrites the send evidence, swaps the candidate email or lets a delivery outcome move backward', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ status: 'sent' })];
    await sweep(); await ageCheck();
    emailLog = [trialEnding({ status: 'failed' })];
    await sweep();
    const recorded = await receipt();
    const table = 'UPDATE jobvance_private.loop_trial_reminder_receipts SET ';
    for (const change of ["email_created_at=email_created_at+interval '1 minute'", "email_log_id='elog_other'", "email_type='trial_ending'", "first_email_status='delivered'",
      "delivery_status='sent'", "delivery_status='delivered'", 'delivery_status=NULL', "unbound_at=now()", 'escalated_at=NULL'])
      await expect(query(table + change)).rejects.toThrow('LOOP_TRIAL_REMINDER_IMMUTABLE');
    const call = (id: string, status: string) => sql('job_loop_billing_trial_reminder_check', { p_mode: 'live', p_subscription: 'sub_trial', p_email_log_id: id, p_email_type: 'subscription_trial_ending',
      p_email_status: status, p_email_created_at: iso(firstCharge() - 2 * DAY + 60000), p_candidates: 1 });
    await expect(call('elog_other', 'delivered')).rejects.toThrow('LOOP_BILLING_UNBOUND'); // evidence is followed, never swapped
    expect(await call('elog_1', 'sent')).toBe('escalated'); // a stale answer cannot hide the bounce
    expect(await receipt()).toMatchObject({ delivery_status: 'failed', email_created_at: recorded.email_created_at, email_log_id: 'elog_1', escalation_reasons: ['unbound', 'delivery_failed'] });
    await expect(sql('job_loop_billing_trial_reminder_unavailable', { p_mode: 'live', p_subscription: 'sub_trial', p_cause: 'timeout' })).rejects.toThrow('LOOP_BILLING_UNBOUND');
    expect(await sentAt()).toBeNull();
  });

  it('lets a person who has checked the email close the incident with the existing marker, leaving the send evidence alone', async () => {
    await startTrial(Date.now() - 5 * DAY - 60000);
    emailLog = [trialEnding({ status: 'sent' })]; // still in flight, so the sweep would keep rechecking it
    await sweep();
    const evidence = await receipt();
    expect(await escalated()).toHaveLength(1);
    expect(await sql('job_loop_billing_trial_reminder_sent', { p_mode: 'live', p_subscription: 'sub_trial' })).toBe(true);
    expect(await sentAt()).not.toBeNull();
    expect(await escalated()).toEqual([]);
    expect(await receipt()).toMatchObject({ email_log_id: 'elog_1', email_created_at: evidence.email_created_at, escalation_reasons: ['unbound'] });
    await ageCheck(300);
    expect(await sweep()).toMatchObject({ checked: 0 });
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
  it('keeps waking the billing function for an in-flight email, then goes quiet once its outcome is final', async () => {
    await useScheduler();
    await startTrial(Date.now() - 5 * DAY - 60000);
    expect(await dispatch()).toBe(1);
    emailLog = [trialEnding({ status: 'sent' })];
    await sweep();
    expect(await dispatch()).toBe(0); // read a moment ago
    await ageCheck(21);
    expect(await dispatch()).toBe(1); // still in flight
    emailLog = [trialEnding({ status: 'delivered' })];
    await sweep(); await ageCheck(300);
    expect(await dispatch()).toBe(0); // delivered: nothing left to watch
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

  // Round 3 (privacy): a receipt holds the subscription id, the customer's email-log id and the delivery history of one trial,
  // so it must be erased with that trial and can only exist in its trial's own billing mode.
  describe('a receipt lives and dies with its trial', () => {
    const TRIALS = 'jobvance_private.loop_subscription_trials', SUBSCRIPTIONS = 'jobvance_private.loop_subscriptions', RECEIPTS = 'jobvance_private.loop_trial_reminder_receipts';
    const rows = async (table: string) => (await query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n as number;
    /** Rows, in every table the reminder migration created, that still mention any of these identifiers. */
    async function residue(...needles: string[]) {
      let found = 0;
      for (const table of tablesCreatedByReminderMigration) found += (await query(`SELECT count(*)::int n FROM ${table} x WHERE x::text LIKE ANY($1::text[])`, [needles.map(needle => '%' + needle + '%')])).rows[0].n;
      return found;
    }
    const supportList = async (mode: 'live' | 'test') => ((await sql('job_loop_billing_trial_reminders_escalated', { p_mode: mode })) as Record<string, unknown>[]).map(instants);
    /** A trial in the test billing mode for another owner, with its own provider customer (the live fixture trial is sub_trial). */
    async function cloneTestModeTrial() {
      const user = randomUUID(), clonedRequest = randomUUID();
      await query('INSERT INTO auth.users(id) VALUES($1)', [user]);
      await query(`INSERT INTO jobvance_private.loop_billing_orders SELECT (jsonb_populate_record(NULL::jobvance_private.loop_billing_orders,
        to_jsonb(o)||jsonb_build_object('user_id',$1::uuid,'request_id',$2::uuid,'session_id',NULL,'mode','test'::text))).* FROM jobvance_private.loop_billing_orders o WHERE o.user_id=$3 AND o.request_id=$4`, [user, clonedRequest, owner, request]);
      await query(`INSERT INTO jobvance_private.loop_subscriptions SELECT (jsonb_populate_record(NULL::jobvance_private.loop_subscriptions,
        to_jsonb(s)||jsonb_build_object('subscription_id','sub_test_trial'::text,'user_id',$1::uuid,'request_id',$2::uuid,'customer_id','cus_fair99'::text,'mode','test'::text))).* FROM jobvance_private.loop_subscriptions s WHERE s.subscription_id='sub_trial'`, [user, clonedRequest]);
      await query(`INSERT INTO jobvance_private.loop_subscription_trials SELECT (jsonb_populate_record(NULL::jobvance_private.loop_subscription_trials,
        to_jsonb(t)||jsonb_build_object('subscription_id','sub_test_trial'::text,'user_id',$1::uuid,'request_id',$2::uuid,'payment_id','pay_test_trial'::text,'mode','test'::text))).* FROM jobvance_private.loop_subscription_trials t WHERE t.subscription_id='sub_trial'`, [user, clonedRequest]);
      return user;
    }

    it('erasing the account removes the trial, its receipt, the incident and every identifier, and leaves nothing to list, sweep or dispatch', async () => {
      await useScheduler();
      await startTrial(Date.now() - 5 * DAY - 60000);
      emailLog = [trialEnding({ status: 'failed' })];
      // The evidence semantics are unchanged: unbound candidate evidence, an open incident, the marker never set, nothing confirmed.
      expect(await sweep()).toEqual({ checked: 1, confirmed: 0, pending: 0, escalated: 1, unavailable: 0, deferred: 0 });
      expect(await receipt()).toMatchObject({ email_log_id: 'elog_1', delivery_status: 'failed', escalation_reasons: ['unbound', 'delivery_failed'] });
      expect(await sentAt()).toBeNull();
      expect(await escalated()).toEqual([expect.objectContaining({ userId: owner, subscriptionId: 'sub_trial', reason: 'delivery_failed', emailLogId: 'elog_1' })]);
      expect(await residue('sub_trial', 'elog_1')).toBe(1);
      // Erasing the owner: auth.users -> subscription and trial (existing cascades) -> receipt (the new foreign key).
      await query('DELETE FROM auth.users WHERE id=$1', [owner]);
      for (const table of [TRIALS, SUBSCRIPTIONS, RECEIPTS]) expect(await rows(table), table).toBe(0);
      expect(await residue('sub_trial', 'elog_1', 'cus_trial', owner)).toBe(0);
      expect(await escalated()).toEqual([]);
      expect(await selected()).toEqual([]);
      expect(await reminders()).toEqual([]);
      expect(await sweep()).toEqual({ checked: 0, confirmed: 0, pending: 0, escalated: 0, unavailable: 0, deferred: 0 });
      expect(await dispatch()).toBe(0);
      expect(await rows(RECEIPTS)).toBe(0);
    });
    for (const [kind, table] of [['trial', TRIALS], ['subscription (and with it the trial)', SUBSCRIPTIONS]] as const) {
      it(`deleting only the ${kind} removes its receipt`, async () => {
        await startTrial(Date.now() - 5 * DAY - 60000);
        emailLog = [trialEnding({ status: 'sent' })];
        await sweep();
        expect(await rows(RECEIPTS)).toBe(1);
        await query(`DELETE FROM ${table} WHERE subscription_id='sub_trial'`);
        expect(await rows(TRIALS)).toBe(0);
        expect(await rows(RECEIPTS)).toBe(0);
        expect(await residue('sub_trial', 'elog_1')).toBe(0);
        expect(await escalated()).toEqual([]);
        expect(await selected()).toEqual([]);
      });
    }
    it('erases only the erased owner\'s receipt: another owner\'s evidence and incident stay and keep being swept', async () => {
      await startTrial(Date.now() - 5 * DAY - 60000); await cloneTrials(1); // sub_trial (owner) and sub_fair1 (another owner)
      emailLog = [trialEnding({ status: 'sent' })];
      expect(await sweep()).toMatchObject({ checked: 2, escalated: 2, confirmed: 0 });
      expect(await rows(RECEIPTS)).toBe(2);
      const other = (await query("SELECT user_id FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_fair1'")).rows[0].user_id;
      await query('DELETE FROM auth.users WHERE id=$1', [other]);
      expect((await query('SELECT subscription_id FROM ' + RECEIPTS)).rows).toEqual([{ subscription_id: 'sub_trial' }]);
      expect(await escalated()).toEqual([expect.objectContaining({ userId: owner, subscriptionId: 'sub_trial', reason: 'unbound' })]);
      // The in-flight email of the remaining trial is still rechecked, and its evidence is still immutable.
      await ageCheck();
      emailLog = [trialEnding({ status: 'failed' })];
      expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
      expect(await receipt()).toMatchObject({ subscription_id: 'sub_trial', first_email_status: 'sent', delivery_status: 'failed' });
      await expect(query("UPDATE jobvance_private.loop_trial_reminder_receipts SET email_log_id='elog_swapped'")).rejects.toThrow('LOOP_TRIAL_REMINDER_IMMUTABLE');
    });
    it('a trial erased while a sweep is reading Dodo does not error the sweep and no receipt is created for it', async () => {
      await startTrial(Date.now() - 5 * DAY - 60000);
      emailLog = [trialEnding()];
      const erasedMidSweep: LoopBillingPorts = { ...ports, provider: async (path, body, method) => {
        const answer = await ports.provider(path, body, method);
        if (path.includes('/emails')) await query('DELETE FROM auth.users WHERE id=$1', [owner]); // the owner is erased after the read, before the check is recorded
        return answer;
      } };
      expect(await confirmTrialReminders(erasedMidSweep, 'live')).toEqual({ checked: 1, confirmed: 0, pending: 0, escalated: 0, unavailable: 1, deferred: 0 });
      expect(emailReads).toEqual(['cus_trial']);
      expect(await rows(TRIALS)).toBe(0);
      expect(await rows(RECEIPTS)).toBe(0);
    });
    it('a trial erased while Dodo is unreachable does not error the sweep and no unavailable record is created for it', async () => {
      await startTrial(Date.now() - 5 * DAY - 60000);
      emailLog = Error('Provider unavailable');
      const erasedMidSweep: LoopBillingPorts = { ...ports, provider: async (path, body, method) => {
        try { return await ports.provider(path, body, method); } finally { if (path.includes('/emails')) await query('DELETE FROM auth.users WHERE id=$1', [owner]); }
      } };
      expect(await confirmTrialReminders(erasedMidSweep, 'live')).toEqual({ checked: 1, confirmed: 0, pending: 0, escalated: 0, unavailable: 1, deferred: 0 });
      expect(await rows(TRIALS)).toBe(0);
      expect(await rows(RECEIPTS)).toBe(0);
    });
    it('the backstop and the dispatcher flag nothing for an erased trial and never bring its receipt back', async () => {
      await useScheduler();
      await startTrial(Date.now() - 5 * DAY - 60000);
      await shiftTrial(2 * 24 + 1); // reminder overdue, first charge passed
      expect(await dispatch()).toBe(1);
      expect(await escalated()).toEqual([expect.objectContaining({ subscriptionId: 'sub_trial', reason: 'unavailable_overdue' })]);
      await query("DELETE FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_trial'"); // the trial alone, the subscription stays
      expect(await rows(RECEIPTS)).toBe(0);
      expect(await rows(SUBSCRIPTIONS)).toBe(1);
      expect((await query('SELECT jobvance_private.loop_trial_reminder_flag_overdue() n')).rows[0].n).toBe(0);
      expect(await dispatch()).toBe(0);
      expect(await escalated()).toEqual([]);
      expect(await rows(RECEIPTS)).toBe(0);
    });
    it('the backstop does not recreate a receipt for a trial whose owner was erased before it ran', async () => {
      await useScheduler();
      await startTrial(Date.now() - 5 * DAY - 60000);
      await shiftTrial(2 * 24 + 1);
      await query('DELETE FROM auth.users WHERE id=$1', [owner]);
      expect((await query('SELECT jobvance_private.loop_trial_reminder_flag_overdue() n')).rows[0].n).toBe(0);
      expect(await dispatch()).toBe(0);
      expect(await rows(RECEIPTS)).toBe(0);
      expect(await escalated()).toEqual([]);
    });
    it('the backstop still flags every live overdue trial next to one that is being erased', async () => {
      await useScheduler();
      await startTrial(Date.now() - 5 * DAY - 60000); await cloneTrials(2);
      await shiftTrial(2 * 24 + 1);
      const erased = (await query("SELECT user_id FROM jobvance_private.loop_subscription_trials WHERE subscription_id='sub_fair1'")).rows[0].user_id;
      await query('DELETE FROM auth.users WHERE id=$1', [erased]);
      expect(await dispatch()).toBe(1);
      expect((await query('SELECT subscription_id FROM ' + RECEIPTS + ' ORDER BY subscription_id')).rows).toEqual([{ subscription_id: 'sub_fair2' }, { subscription_id: 'sub_trial' }]);
      expect((await escalated()).map(entry => entry.subscriptionId)).toEqual(['sub_fair2', 'sub_trial']);
    });

    it('refuses a receipt for a trial that does not exist, or in a billing mode other than its trial\'s', async () => {
      await startTrial(Date.now() - 5 * DAY - 60000); // a live trial, sub_trial
      const insert = (mode: string, subscription: string) => query('INSERT INTO ' + RECEIPTS + '(mode,subscription_id) VALUES($1,$2)', [mode, subscription]);
      await expect(insert('test', 'sub_trial')).rejects.toThrow('loop_trial_reminder_receipts_trial_fkey'); // the right trial, the wrong mode
      await expect(insert('live', 'sub_missing')).rejects.toThrow('loop_trial_reminder_receipts_trial_fkey'); // no such trial
      expect(await rows(RECEIPTS)).toBe(0);
      await insert('live', 'sub_trial');
      // A receipt cannot be moved to another mode or to another trial either.
      await expect(query("UPDATE jobvance_private.loop_trial_reminder_receipts SET mode='test'")).rejects.toThrow('loop_trial_reminder_receipts_trial_fkey');
      await expect(query("UPDATE jobvance_private.loop_trial_reminder_receipts SET subscription_id='sub_missing'")).rejects.toThrow('loop_trial_reminder_receipts_trial_fkey');
      expect((await query('SELECT mode,subscription_id FROM ' + RECEIPTS)).rows).toEqual([{ mode: 'live', subscription_id: 'sub_trial' }]);
    });
    it('the recording functions cannot create a receipt for a trial in the other mode', async () => {
      await startTrial(Date.now() - 5 * DAY - 60000);
      const none = { p_email_log_id: null, p_email_type: null, p_email_status: null, p_email_created_at: null };
      await expect(sql('job_loop_billing_trial_reminder_check', { p_mode: 'test', p_subscription: 'sub_trial', ...none })).rejects.toThrow('LOOP_BILLING_UNBOUND');
      await expect(sql('job_loop_billing_trial_reminder_unavailable', { p_mode: 'test', p_subscription: 'sub_trial', p_cause: 'read_failed' })).rejects.toThrow('LOOP_BILLING_UNBOUND');
      expect(await rows(RECEIPTS)).toBe(0);
    });
    it('keeps live and test evidence apart: each mode lists and erases only its own trials', async () => {
      await startTrial(Date.now() - 5 * DAY - 60000);
      const testOwner = await cloneTestModeTrial(); // sub_test_trial, mode test
      emailLog = [trialEnding({ status: 'sent' })];
      expect(await sweep()).toMatchObject({ checked: 1, escalated: 1 });
      expect(await confirmTrialReminders(ports, 'test')).toMatchObject({ checked: 1, escalated: 1, confirmed: 0 });
      expect((await query('SELECT mode,subscription_id FROM ' + RECEIPTS + ' ORDER BY mode')).rows).toEqual([{ mode: 'live', subscription_id: 'sub_trial' }, { mode: 'test', subscription_id: 'sub_test_trial' }]);
      expect((await supportList('live')).map(entry => entry.subscriptionId)).toEqual(['sub_trial']);
      expect((await supportList('test')).map(entry => entry.subscriptionId)).toEqual(['sub_test_trial']);
      // A live receipt for the test trial (and the reverse) is refused.
      await expect(query("INSERT INTO jobvance_private.loop_trial_reminder_receipts(mode,subscription_id) VALUES('live','sub_test_trial')")).rejects.toThrow('loop_trial_reminder_receipts_trial_fkey');
      await expect(query("UPDATE jobvance_private.loop_trial_reminder_receipts SET mode='live' WHERE subscription_id='sub_test_trial'")).rejects.toThrow();
      // Erasing the test-mode owner removes only the test-mode receipt.
      await query('DELETE FROM auth.users WHERE id=$1', [testOwner]);
      expect((await query('SELECT mode,subscription_id FROM ' + RECEIPTS)).rows).toEqual([{ mode: 'live', subscription_id: 'sub_trial' }]);
      expect(await supportList('test')).toEqual([]);
      expect((await supportList('live')).map(entry => entry.subscriptionId)).toEqual(['sub_trial']);
    });
    it('every table the reminder migration creates is either tied to its trial by a cascading key or holds nothing about a person', async () => {
      expect(tablesCreatedByReminderMigration).toEqual(['jobvance_private.loop_trial_reminder_receipts', 'public.job_loop_trial_reminder_tickets']);
      const keys = (await query(`SELECT c.confdeltype,c.confrelid::regclass::text parent,
        (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum) child_columns,
        (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum) parent_columns
        FROM pg_constraint c WHERE c.conrelid='jobvance_private.loop_trial_reminder_receipts'::regclass AND c.contype='f'`)).rows;
      expect(keys).toEqual([{ confdeltype: 'c', parent: TRIALS, child_columns: ['subscription_id', 'mode'], parent_columns: ['subscription_id', 'mode'] }]);
      // The dispatch tickets are random ids with a billing mode and two timestamps: no user, subscription, customer or email.
      const columns = (await query("SELECT column_name::text c FROM information_schema.columns WHERE table_schema='public' AND table_name='job_loop_trial_reminder_tickets' ORDER BY 1")).rows.map(row => row.c);
      expect(columns).toEqual(['consumed_at', 'expires_at', 'mode', 'ticket']);
    });
  });
});
