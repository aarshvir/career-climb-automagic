// @vitest-environment node
// Real PostgreSQL (PGlite) check of one-time passes and the tiered AI-tailoring allowance, layered on
// the billing MVP, the CV-tailor ledger and the Dodo provider migration. Invented identities only.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASS_PLANS, TAILOR_LIMITS } from '../functions/_shared/core';

let db: PGlite;
const id = (prefix: string) => prefix + randomUUID().replaceAll('-', '').slice(0, 21);
const epoch = () => Math.floor(Date.now() / 1000);
const month = () => new Date().toISOString().slice(0, 7);
const hashA = 'a'.repeat(64), hashB = 'b'.repeat(64), hashC = 'c'.repeat(64);
const DAY = 24 * 3600 * 1000;
const migration = (name: string) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.job_loop_budget_months(month text PRIMARY KEY CHECK(month ~ '^\\d{4}-\\d{2}$'), committed_micros bigint NOT NULL DEFAULT 0 CHECK(committed_micros BETWEEN 0 AND 50000000));
    CREATE TABLE public.jobvance_admin_config(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), monthly_cap_micros bigint NOT NULL DEFAULT 50000000);
    INSERT INTO public.jobvance_admin_config DEFAULT VALUES;`);
  for (const name of ['20261010000000_grounded_application_mvp.sql', '20261015090000_jobvance_cv_tailor.sql', '20261017090000_billing_dodo_provider.sql', '20261017120000_jobvance_tailor_passes.sql']) {
    await db.exec(await migration(name));
  }
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('TRUNCATE public.jobvance_tailor_usage; TRUNCATE public.job_loop_budget_months; UPDATE public.jobvance_admin_config SET monthly_cap_micros = 50000000;');
});

type Plan = keyof typeof PASS_PLANS;
type Order = { request: string; session: string; payment: string };
type Usage = { id: string; is_new: boolean; tier: string; pass_id: string | null; status: string };
type Access = { freeMonthlyLimit: number; freeUsedThisMonth: number; freeRemainingThisMonth: number; passes: { plan: string; name: string; expiresAt: string; quota: number; used: number; remaining: number }[];
  paidRemaining: number; dailyLimit: number; usedToday: number };

async function account() {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user, 'fixture@example.invalid']);
  return user;
}
async function planOrder(user: string, plan: Plan | null, mode = 'test'): Promise<Order> {
  const request = randomUUID(), session = id('cks_');
  const host = mode === 'live' ? 'checkout.dodopayments.com' : 'test.checkout.dodopayments.com';
  await db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4,$5)', [user, request, 'dodo', mode, plan]);
  await db.query('SELECT jobvance_finish_checkout($1,$2,$3,$4,$5,$6,$7,$8)', [user, request, session, `https://${host}/session/${session}`, null, 'dodo', mode, plan]);
  return { request, session, payment: id('pay_') };
}
async function paid(user: string, order: Order, options: { amount?: number | null; tax?: number | null; eventId?: string; mode?: string } = {}) {
  return (await db.query<{ result: { duplicate: boolean } }>('SELECT jobvance_apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS result', [
    options.eventId ?? `dodo_${id('msg_')}`, 'payment.succeeded', epoch(), 'paid', user, order.request, `dodo_${order.payment}`, order.session, 0, 'dodo', options.mode ?? 'test', null,
    options.amount === undefined ? 1900 : options.amount, options.tax === undefined ? 0 : options.tax,
  ])).rows[0].result;
}
async function refunded(user: string, order: Order, amount: number, refund = `dodo_${id('ref_')}`) {
  return (await db.query<{ result: { duplicate: boolean } }>('SELECT jobvance_apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS result', [
    `dodo_${id('msg_')}`, 'refund.succeeded', epoch(), 'refund', user, order.request, `dodo_${order.payment}`, order.session, amount, 'dodo', 'test', refund, null, null,
  ])).rows[0].result;
}
async function buy(user: string, plan: Plan, mode = 'test') {
  const order = await planOrder(user, plan, mode);
  await paid(user, order, { amount: PASS_PLANS[plan].amount, mode });
  return order;
}
async function reserve(args: { user?: string | null; hash?: string | null; request?: string; micros?: number; mode?: string; freeMonthly?: number; passDaily?: number; guestDaily?: number; guestGlobal?: number }): Promise<Usage> {
  const result = await db.query<{ r: Usage }>('SELECT public.jobvance_tailor_reserve($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS r', [
    args.user ?? null, args.hash === undefined ? (args.user ? null : hashA) : args.hash, args.request ?? randomUUID(), 'openrouter', 'openai/gpt-6.1-sol', args.micros ?? 75000,
    args.mode ?? 'test', args.freeMonthly ?? TAILOR_LIMITS.freeMonthly, args.passDaily ?? TAILOR_LIMITS.passDaily, args.guestDaily ?? TAILOR_LIMITS.guestDaily, args.guestGlobal ?? TAILOR_LIMITS.guestGlobalDaily,
  ]);
  return result.rows[0].r;
}
const settle = (usage: Usage, actual: number | null) => db.query('SELECT public.jobvance_tailor_settle($1,$2,$3)', [usage.id, actual, actual === null]);
async function access(user: string, mode = 'test'): Promise<Access> {
  return (await db.query<{ value: Access }>('SELECT public.jobvance_get_tailor_access($1,$2,$3,$4) AS value', [user, mode, TAILOR_LIMITS.freeMonthly, TAILOR_LIMITS.passDaily])).rows[0].value;
}
async function passes(user: string) {
  return (await db.query<{ id: string; plan: string; status: string; quota: number; starts_at: Date; expires_at: Date }>('SELECT id, plan, status, quota, starts_at, expires_at FROM jobvance_passes WHERE user_id = $1 ORDER BY created_at, expires_at', [user])).rows;
}
async function committed() {
  return Number((await db.query<{ c: string }>('SELECT committed_micros AS c FROM public.job_loop_budget_months WHERE month = $1', [month()])).rows[0]?.c ?? 0);
}
/** Inserts already-settled usage rows directly, to reach daily or quota limits without many calls. */
async function history(user: string | null, count: number, options: { passId?: string | null; day?: string; monthKey?: string; actual?: number; hash?: string | null } = {}) {
  for (let index = 0; index < count; index++) {
    await db.query(`INSERT INTO public.jobvance_tailor_usage(month, day, user_id, rate_hash, request_id, provider, model, reserved_micros, actual_micros, status, pass_id)
      VALUES($1, COALESCE($2::date, (now() AT TIME ZONE 'UTC')::date), $3, $4, $5, 'openrouter', 'fixture-model', 1000, $6, 'settled', $7)`,
    [options.monthKey ?? month(), options.day ?? null, user, options.hash ?? null, randomUUID(), options.actual ?? 500, options.passId ?? null]);
  }
}

describe('pass plans', () => {
  it('seeds exactly the three one-time USD plans that the edge functions sell', async () => {
    const rows = (await db.query<{ plan: string; name: string; price_cents: number; currency: string; days: number; tailor_quota: number; active: boolean }>(
      'SELECT plan, name, price_cents, currency, days, tailor_quota, active FROM jobvance_pass_plans ORDER BY price_cents')).rows;
    expect(rows).toEqual([
      { plan: 'sprint_7d', name: 'Sprint', price_cents: 900, currency: 'usd', days: 7, tailor_quota: 25, active: true },
      { plan: 'search_30d', name: 'Job Search', price_cents: 1900, currency: 'usd', days: 30, tailor_quota: 100, active: true },
      { plan: 'move_90d', name: 'Career Move', price_cents: 3900, currency: 'usd', days: 90, tailor_quota: 300, active: true },
    ]);
    for (const row of rows) expect(PASS_PLANS[row.plan as Plan]).toMatchObject({ name: row.name, amount: row.price_cents, days: row.days, tailorQuota: row.tailor_quota });
    expect(Object.keys(PASS_PLANS).sort()).toEqual(rows.map(row => row.plan).sort());
  });
  it('closes plans, passes and every new function to browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(db.query('SELECT * FROM public.jobvance_pass_plans')).rejects.toThrow(/permission denied/u);
        await expect(db.query('SELECT * FROM public.jobvance_passes')).rejects.toThrow(/permission denied/u);
        await expect(db.query(`SELECT public.jobvance_get_tailor_access('${randomUUID()}')`)).rejects.toThrow(/permission denied/u);
        await expect(db.query(`SELECT public.jobvance_tailor_reserve(NULL,'${hashA}','${randomUUID()}','openrouter','m',1)`)).rejects.toThrow(/permission denied/u);
        await expect(db.query(`SELECT public.jobvance_begin_checkout('${randomUUID()}','${randomUUID()}','dodo','test','sprint_7d')`)).rejects.toThrow(/permission denied/u);
        await expect(db.query(`SELECT public.jobvance_apply_payment_event('dodo_x','payment.succeeded',1,'paid','${randomUUID()}','${randomUUID()}','dodo_pay_x','cks_x',0,'dodo','test',NULL,900,0)`)).rejects.toThrow(/permission denied/u);
      } finally { await db.exec('RESET ROLE'); }
    }
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('jobvance_pass_plans','jobvance_passes') ORDER BY relname");
    expect(rls.rows).toEqual([{ relname: 'jobvance_pass_plans', relrowsecurity: true }, { relname: 'jobvance_passes', relrowsecurity: true }]);
    const overloads = await db.query<{ proname: string; n: string }>(`SELECT proname, count(*) AS n FROM pg_proc WHERE proname IN
      ('jobvance_begin_checkout','jobvance_finish_checkout','jobvance_apply_payment_event','jobvance_tailor_reserve') GROUP BY proname ORDER BY proname`);
    expect(overloads.rows.map(row => [row.proname, Number(row.n)])).toEqual([['jobvance_apply_payment_event', 1], ['jobvance_begin_checkout', 1], ['jobvance_finish_checkout', 1], ['jobvance_tailor_reserve', 1]]);
  });
});

describe('plan checkout orders', () => {
  it('records the plan and its price on a Dodo order and refuses plans elsewhere', async () => {
    const user = await account();
    const order = await planOrder(user, 'move_90d');
    expect((await db.query('SELECT plan, amount, provider FROM billing_orders WHERE request_id = $1', [order.request])).rows[0]).toEqual({ plan: 'move_90d', amount: 3900, provider: 'dodo' });
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4,$5)', [user, randomUUID(), 'stripe', 'test', 'sprint_7d'])).rejects.toThrow('INVALID_PLAN');
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4,$5)', [user, randomUUID(), 'dodo', 'test', 'lifetime_free'])).rejects.toThrow('INVALID_PLAN');
    await db.query('UPDATE jobvance_pass_plans SET active = false WHERE plan = $1', ['sprint_7d']);
    try { await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4,$5)', [user, randomUUID(), 'dodo', 'test', 'sprint_7d'])).rejects.toThrow('INVALID_PLAN'); }
    finally { await db.query('UPDATE jobvance_pass_plans SET active = true WHERE plan = $1', ['sprint_7d']); }
    // A retried request must keep its plan, and the finished session must belong to the same plan.
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4,$5)', [user, order.request, 'dodo', 'test', 'sprint_7d'])).rejects.toThrow('REQUEST_CONFLICT');
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [user, order.request, 'dodo', 'test'])).rejects.toThrow('REQUEST_CONFLICT');
    const retry = (await db.query<{ r: { creationClaimAcquired: boolean; plan: string } }>('SELECT jobvance_begin_checkout($1,$2,$3,$4,$5) AS r', [user, order.request, 'dodo', 'test', 'move_90d'])).rows[0].r;
    expect(retry).toMatchObject({ creationClaimAcquired: false, plan: 'move_90d' });
    const other = randomUUID(), session = id('cks_');
    await db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4,$5)', [user, other, 'dodo', 'test', 'sprint_7d']);
    await expect(db.query('SELECT jobvance_finish_checkout($1,$2,$3,$4,$5,$6,$7,$8)', [user, other, session, `https://test.checkout.dodopayments.com/session/${session}`, null, 'dodo', 'test', 'search_30d']))
      .rejects.toThrow('REQUEST_CONFLICT');
    await expect(db.query('SELECT jobvance_finish_checkout($1,$2,$3,$4,$5,$6,$7)', [user, other, session, `https://test.checkout.dodopayments.com/session/${session}`, null, 'dodo', 'test']))
      .rejects.toThrow('REQUEST_CONFLICT');
  });
  it('keeps legacy orders at the fixed $29 amount', async () => {
    const user = await account(); const request = randomUUID();
    await db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [user, request, 'dodo', 'test']);
    expect((await db.query('SELECT plan, amount FROM billing_orders WHERE request_id = $1', [request])).rows[0]).toEqual({ plan: null, amount: 2900 });
    await expect(db.query("UPDATE billing_orders SET amount = 900 WHERE request_id = $1", [request])).rejects.toThrow(/billing_orders_amount_check/);
    await expect(db.query("INSERT INTO billing_orders(user_id,request_id,provider,billing_mode,plan,amount) VALUES($1,$2,'stripe','test','sprint_7d',900)", [user, randomUUID()]))
      .rejects.toThrow(/billing_orders_plan_provider_check/);
  });
});

describe('granting a pass', () => {
  it('grants one pass from the bound order, idempotently', async () => {
    const user = await account();
    const order = await planOrder(user, 'search_30d');
    const eventId = `dodo_${id('msg_')}`;
    expect((await paid(user, order, { amount: 1900, eventId })).duplicate).toBe(false);
    expect((await paid(user, order, { amount: 1900, eventId })).duplicate).toBe(true);
    // A second delivery under another webhook ID for the same payment grants nothing more.
    expect((await paid(user, order, { amount: 1900 })).duplicate).toBe(false);
    const rows = await passes(user);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plan: 'search_30d', status: 'active', quota: 100 });
    expect(rows[0].expires_at.getTime() - rows[0].starts_at.getTime()).toBe(30 * DAY);
    expect((await db.query('SELECT status FROM billing_orders WHERE request_id = $1', [order.request])).rows[0]).toEqual({ status: 'paid' });
    const summary = await access(user);
    expect(summary.passes).toEqual([expect.objectContaining({ plan: 'search_30d', name: 'Job Search', quota: 100, used: 0, remaining: 100 })]);
    expect(summary.paidRemaining).toBe(100);
    // Passes never add legacy pack credits.
    expect((await db.query<{ value: { creditsRemaining: number } }>('SELECT jobvance_get_entitlement($1,$2) AS value', [user, 'test'])).rows[0].value.creditsRemaining).toBe(1);
  });
  it('rejects a paid amount that is not the plan price, before or after tax', async () => {
    const user = await account();
    const order = await planOrder(user, 'search_30d');
    await expect(paid(user, order, { amount: 900 })).rejects.toThrow('INVALID_PAYMENT');
    await expect(paid(user, order, { amount: 3900, tax: 0 })).rejects.toThrow('INVALID_PAYMENT');
    await expect(paid(user, order, { amount: 2045, tax: 100 })).rejects.toThrow('INVALID_PAYMENT');
    await expect(paid(user, order, { amount: null, tax: null })).rejects.toThrow('INVALID_PAYMENT');
    await expect(paid(user, order, { amount: 1900, tax: 2000 })).rejects.toThrow('INVALID_PAYMENT');
    expect(await passes(user)).toHaveLength(0);
    expect((await db.query('SELECT 1 FROM billing_payments WHERE user_id = $1', [user])).rows).toHaveLength(0);
    // Tax added on top (total less tax is the price) and tax included in the price both match.
    await paid(user, order, { amount: 2045, tax: 145 });
    const inclusive = await planOrder(user, 'sprint_7d');
    await paid(user, inclusive, { amount: 900, tax: 150 });
    expect((await passes(user)).map(row => row.plan)).toEqual(['search_30d', 'sprint_7d']);
  });
  it('takes the plan from the order: a cheap plan cannot be paid for into a dearer pass', async () => {
    const user = await account();
    const order = await planOrder(user, 'move_90d');
    await expect(paid(user, order, { amount: PASS_PLANS.sprint_7d.amount })).rejects.toThrow('INVALID_PAYMENT');
    await expect(paid(user, { ...order, session: id('cks_') }, { amount: 3900 })).rejects.toThrow('REQUEST_CONFLICT');
    await paid(user, order, { amount: 3900 });
    expect((await passes(user)).map(row => [row.plan, row.quota])).toEqual([['move_90d', 300]]);
  });
  it('still grants legacy pack credits for a Dodo order without a plan', async () => {
    const user = await account();
    const order = await planOrder(user, null);
    await expect(paid(user, order, { amount: 1900 })).rejects.toThrow('INVALID_PAYMENT');
    await paid(user, order, { amount: 3045, tax: 145 });
    expect((await db.query<{ value: { creditsRemaining: number } }>('SELECT jobvance_get_entitlement($1,$2) AS value', [user, 'test'])).rows[0].value.creditsRemaining).toBe(11);
    expect(await passes(user)).toHaveLength(0);
  });
  it('stacks a new pass after the latest one still usable, so no days are wasted', async () => {
    const user = await account();
    await buy(user, 'sprint_7d');
    await buy(user, 'search_30d');
    let rows = await passes(user);
    expect(rows[1].expires_at.getTime() - rows[0].expires_at.getTime()).toBe(30 * DAY);
    expect(rows[1].starts_at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    // A pass with no quota left, an expired pass and a refunded pass are not usable, so none extends the next one.
    await history(user, 100, { passId: rows[1].id });
    await db.query('UPDATE jobvance_passes SET expires_at = now() - interval \'1 minute\', starts_at = now() - interval \'8 days\' WHERE id = $1', [rows[0].id]);
    const refundedOrder = await buy(user, 'sprint_7d');
    await refunded(user, refundedOrder, 900);
    await buy(user, 'move_90d');
    rows = await passes(user);
    const latest = rows.find(row => row.plan === 'move_90d')!;
    expect(latest.expires_at.getTime() - latest.starts_at.getTime()).toBe(90 * DAY);
  });
  it('counts a test-mode pass only in test mode', async () => {
    const user = await account();
    await buy(user, 'sprint_7d');
    expect((await access(user, 'live')).paidRemaining).toBe(0);
    expect((await reserve({ user, mode: 'live' })).tier).toBe('free');
    expect((await reserve({ user, mode: 'test' })).tier).toBe('pass');
  });
});

describe('refunds', () => {
  it('revokes the pass and its remaining quota, even for a partial refund', async () => {
    const user = await account();
    const order = await buy(user, 'search_30d');
    const used = await reserve({ user });
    expect(used.tier).toBe('pass');
    const refund = `dodo_${id('ref_')}`;
    await refunded(user, order, 500, refund);
    await refunded(user, order, 500, refund);
    expect((await passes(user))[0].status).toBe('refunded');
    expect((await access(user)).passes).toEqual([]);
    expect((await reserve({ user })).tier).toBe('free');
    expect((await db.query('SELECT status FROM billing_orders WHERE request_id = $1', [order.request])).rows[0]).toEqual({ status: 'refunded' });
    // Refunds are bounded by the order's own price, not the legacy $29.
    await expect(refunded(user, order, 1500)).rejects.toThrow('INVALID_PAYMENT');
    await refunded(user, order, 1400);
    await expect(refunded(user, order, 1)).rejects.toThrow('INVALID_PAYMENT');
  });
  it('accepts a full refund of a $39 pass and a refund that arrives before the payment', async () => {
    const user = await account();
    const order = await buy(user, 'move_90d');
    await refunded(user, order, 3900);
    expect((await passes(user))[0].status).toBe('refunded');
    const early = await planOrder(user, 'sprint_7d');
    await refunded(user, early, 900);
    await paid(user, early, { amount: 900 });
    expect((await passes(user)).filter(row => row.plan === 'sprint_7d')).toHaveLength(0);
  });
});

describe('jobvance_tailor_reserve allowances', () => {
  it('gives signed-in users 3 a month, and a call settled at zero cost does not count', async () => {
    const user = await account();
    const first = await reserve({ user });
    expect(first).toMatchObject({ is_new: true, tier: 'free', pass_id: null });
    await settle(first, 0);
    const counted = [await reserve({ user }), await reserve({ user }), await reserve({ user })];
    await expect(reserve({ user })).rejects.toThrow('TAILOR_FREE_LIMIT');
    await settle(counted[0], 1200); await settle(counted[1], null);
    await expect(reserve({ user })).rejects.toThrow('TAILOR_FREE_LIMIT');
    expect(await access(user)).toMatchObject({ freeMonthlyLimit: 3, freeUsedThisMonth: 3, freeRemainingThisMonth: 0, passes: [], paidRemaining: 0 });
    // Last month's use does not count against this month.
    const other = await account();
    await history(other, 3, { monthKey: '2020-01', day: '2020-01-15' });
    expect((await reserve({ user: other })).tier).toBe('free');
    expect((await access(other)).freeRemainingThisMonth).toBe(2);
  });
  it('gives each guest 1 a day, keeps the global guest cap and never counts guests as users', async () => {
    await reserve({ hash: hashA });
    await expect(reserve({ hash: hashA })).rejects.toThrow('TAILOR_GUEST_LIMIT');
    const zero = await reserve({ hash: hashB });
    await settle(zero, 0);
    expect((await reserve({ hash: hashB })).tier).toBe('guest');
    await history(null, 198, { hash: 'd'.repeat(64) });
    await expect(reserve({ hash: hashC })).rejects.toThrow('TAILOR_GUEST_CAPACITY');
    const user = await account();
    expect((await reserve({ user })).tier).toBe('free');
    await expect(reserve({ hash: null })).rejects.toThrow('TAILOR_INVALID');
  });
  it('consumes an active pass before the free allowance, soonest expiry first', async () => {
    const user = await account();
    await buy(user, 'move_90d');
    await buy(user, 'sprint_7d');
    const [move, sprint] = await passes(user);
    // Stacked purchase: the sprint expires after the 90-day pass, so the 90-day pass is used first.
    expect((await reserve({ user })).pass_id).toBe(move.id);
    await db.query("UPDATE jobvance_passes SET expires_at = now() + interval '2 days' WHERE id = $1", [sprint.id]);
    expect((await reserve({ user })).pass_id).toBe(sprint.id);
    await history(user, 24, { passId: sprint.id, day: '2020-01-15', monthKey: '2020-01' });
    expect((await reserve({ user })).pass_id).toBe(move.id);
    const summary = await access(user);
    expect(summary.passes.map(pass => [pass.plan, pass.remaining])).toEqual([['move_90d', 298]]);
    expect(summary).toMatchObject({ paidRemaining: 298, freeRemainingThisMonth: 3, usedToday: 3 });
  });
  it('falls back to the free allowance when the pass is used up or expired, and zero-cost pass calls are not charged', async () => {
    const user = await account();
    await buy(user, 'sprint_7d');
    const [pass] = await passes(user);
    const failed = await reserve({ user });
    await settle(failed, 0);
    await history(user, 24, { passId: pass.id, day: '2020-01-15', monthKey: '2020-01' });
    expect((await access(user)).passes[0].remaining).toBe(1);
    expect((await reserve({ user })).tier).toBe('pass');
    expect((await reserve({ user })).tier).toBe('free');
    const expired = await account();
    await buy(expired, 'search_30d');
    await db.query("UPDATE jobvance_passes SET starts_at = now() - interval '31 days', expires_at = now() - interval '1 second' WHERE user_id = $1", [expired]);
    expect((await reserve({ user: expired })).tier).toBe('free');
  });
  it('applies a fair-use cap of 40 a day to pass holders, even with quota left', async () => {
    const user = await account();
    await buy(user, 'move_90d');
    const [pass] = await passes(user);
    await history(user, 39, { passId: pass.id });
    expect((await reserve({ user })).tier).toBe('pass');
    await expect(reserve({ user })).rejects.toThrow('TAILOR_PASS_DAILY_LIMIT');
    expect((await access(user)).passes[0].remaining).toBe(260);
    // Yesterday's use does not count towards today.
    const other = await account();
    await buy(other, 'move_90d');
    await history(other, 40, { passId: (await passes(other))[0].id, day: '2020-01-15', monthKey: '2020-01' });
    expect((await reserve({ user: other })).tier).toBe('pass');
  });
  it('stops free and guest use at 80% of the monthly cap while paid use continues to 100%', async () => {
    await db.exec('UPDATE public.jobvance_admin_config SET monthly_cap_micros = 1000000');
    const free = await account(), payer = await account();
    await buy(payer, 'search_30d');
    await db.query('INSERT INTO public.job_loop_budget_months(month, committed_micros) VALUES($1, 700000)', [month()]);
    await reserve({ user: free, micros: 100000 });
    expect(await committed()).toBe(800000);
    await expect(reserve({ user: free, micros: 1 })).rejects.toThrow('TAILOR_BUDGET_LIMIT');
    await expect(reserve({ hash: hashA, micros: 1 })).rejects.toThrow('TAILOR_BUDGET_LIMIT');
    expect((await reserve({ user: payer, micros: 150000 })).tier).toBe('pass');
    expect((await reserve({ user: payer, micros: 50000 })).tier).toBe('pass');
    expect(await committed()).toBe(1000000);
    await expect(reserve({ user: payer, micros: 1 })).rejects.toThrow('TAILOR_BUDGET_LIMIT');
    // A rejected reservation leaves no usage row and no committed spend behind.
    expect(Number((await db.query<{ n: string }>('SELECT count(*) AS n FROM public.jobvance_tailor_usage')).rows[0].n)).toBe(3);
  });
  it('replays the same request without charging again and refuses it for anyone else', async () => {
    const user = await account();
    await buy(user, 'sprint_7d');
    const request = randomUUID();
    const first = await reserve({ user, request });
    const again = await reserve({ user, request });
    expect(again).toMatchObject({ id: first.id, is_new: false, tier: 'pass', pass_id: first.pass_id });
    expect(await committed()).toBe(75000);
    await expect(reserve({ user: await account(), request })).rejects.toThrow('TAILOR_REQUEST_CONFLICT');
    await expect(reserve({ hash: hashA, request })).rejects.toThrow('TAILOR_REQUEST_CONFLICT');
    const guestRequest = randomUUID();
    await reserve({ hash: hashB, request: guestRequest });
    expect((await reserve({ hash: hashB, request: guestRequest })).is_new).toBe(false);
    await expect(reserve({ hash: hashC, request: guestRequest })).rejects.toThrow('TAILOR_REQUEST_CONFLICT');
    expect((await access(user)).passes[0].remaining).toBe(24);
  });
  it('fails closed on invalid inputs', async () => {
    const user = await account();
    await expect(reserve({ user, mode: 'sandbox' })).rejects.toThrow('TAILOR_INVALID');
    await expect(reserve({ user, freeMonthly: -1 })).rejects.toThrow('TAILOR_INVALID');
    await expect(reserve({ hash: 'not-a-hash' })).rejects.toThrow('TAILOR_INVALID');
    await expect(reserve({ user, micros: 600000 })).rejects.toThrow('TAILOR_BUDGET_LIMIT');
    await expect(db.query('SELECT public.jobvance_get_tailor_access($1,$2)', [user, 'sandbox'])).rejects.toThrow('TAILOR_INVALID');
    expect(await committed()).toBe(0);
  });
});
