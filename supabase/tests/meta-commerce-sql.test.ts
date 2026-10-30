// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// In-memory PostgreSQL only. Stub tables carry just the columns the migration reads.
let db: PGlite;
const q = (sql: string, args: unknown[] = []) => db.query<Record<string, any>>(sql, args);
const asService = async <T>(run: () => Promise<T>) => { await db.exec('SET ROLE service_role'); try { return await run(); } finally { await db.exec('RESET ROLE'); } };
const claimPurchases = (user: string, includeTest = false) => asService(async () => (await q('SELECT * FROM public.jobvance_meta_claim_purchases($1,$2)', [user, includeTest])).rows);
const claimCheckout = (user: string, request: string, includeTest = false) => asService(async () => (await q('SELECT * FROM public.jobvance_meta_claim_checkout($1,$2,$3)', [user, request, includeTest])).rows);
const markSent = (user: string, kind: string, keys: string[], mode = 'live') => asService(async () => (await q('SELECT public.jobvance_meta_mark_sent($1,$2,$3,$4) AS n', [user, kind, keys, mode])).rows[0].n);

let owner: string;
async function person(email = 'buyer@gmail.com', meta: Record<string, unknown> = {}) {
  const id = randomUUID();
  await q('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)', [id, email, JSON.stringify(meta)]);
  return id;
}
async function subscription(user: string, { mode = 'live', plan = 'weekly', id = `sub_${randomUUID().slice(0, 8)}` } = {}) {
  await q('INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,mode,plan) VALUES($1,$2,$3,$4)', [id, user, mode, plan]);
  return id;
}
async function period(subscription_id: string, { mode = 'live', payment = `pay_${randomUUID().slice(0, 8)}`, startsAgo = '1 hour', amount = 2900, currency = 'USD', revoked = false } = {}) {
  await q(`INSERT INTO jobvance_private.loop_subscription_periods(mode,payment_id,subscription_id,starts_at,ends_at,amount,currency,revoked)
    VALUES($1,$2,$3,now()-$4::interval,now()+interval '29 days',$5,$6,$7)`, [mode, payment, subscription_id, startsAgo, amount, currency, revoked]);
  return payment;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA jobvance_private;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.jobvance_admin_members(user_id uuid PRIMARY KEY);
    CREATE TABLE jobvance_private.loop_billing_orders(user_id uuid,request_id uuid,mode text,plan text,state text DEFAULT 'ready',session_id text,created_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,request_id));
    CREATE TABLE jobvance_private.loop_subscriptions(subscription_id text PRIMARY KEY,user_id uuid,mode text,plan text);
    CREATE TABLE jobvance_private.loop_subscription_periods(mode text,payment_id text,subscription_id text,starts_at timestamptz,ends_at timestamptz,amount bigint,currency text DEFAULT 'USD',revoked boolean DEFAULT false,PRIMARY KEY(mode,payment_id));
    CREATE TABLE jobvance_private.loop_provider_accounting(mode text,payment_id text,accounting_amount_minor bigint,PRIMARY KEY(mode,payment_id));
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
  await db.exec(await readFile('supabase/migrations/20261030100000_jobvance_meta_commerce_events.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE; TRUNCATE public.jobvance_admin_members;');
  await db.exec('DELETE FROM jobvance_private.loop_subscription_periods; DELETE FROM jobvance_private.loop_subscriptions; DELETE FROM jobvance_private.loop_billing_orders; DELETE FROM jobvance_private.loop_provider_accounting; DELETE FROM jobvance_private.meta_commerce_events');
  owner = await person();
});

describe('purchases offered to Meta', () => {
  it('review: a test claim cannot suppress a live payment with the same provider key', async () => {
    const payment = 'pay_review_shared_key';
    await period(await subscription(owner, { mode: 'test' }), { mode: 'test', payment });
    expect(await claimPurchases(owner, true)).toHaveLength(1);
    await markSent(owner, 'purchase', [payment], 'test');
    await period(await subscription(owner), { payment });
    expect(await claimPurchases(owner)).toHaveLength(1);
  });

  it('review: two payments with the same first-cycle start are one first-cycle purchase', async () => {
    const sub = await subscription(owner);
    const first = await period(sub);
    const second = await period(sub);
    await q('UPDATE jobvance_private.loop_subscription_periods SET starts_at=(SELECT starts_at FROM jobvance_private.loop_subscription_periods WHERE payment_id=$1) WHERE payment_id=$2', [first, second]);
    expect(await claimPurchases(owner)).toHaveLength(1);
  });

  it('claims the first paid cycle once, with plan, amount and currency, and never twice', async () => {
    const payment = await period(await subscription(owner, { plan: 'daily' }), { amount: 9900 });
    const first = await claimPurchases(owner);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ event_key: payment, plan_label: 'Job Loop Pro', amount_minor: 9900, currency: 'USD', mode: 'live' });
    expect(Number(first[0].usd)).toBe(99);
    expect(await claimPurchases(owner)).toHaveLength(0); // within the five-minute lease
  });

  it('reoffers an unsent claim after the lease and never reoffers a sent one', async () => {
    const payment = await period(await subscription(owner));
    expect(await claimPurchases(owner)).toHaveLength(1);
    await q("UPDATE jobvance_private.meta_commerce_events SET claimed_at=now()-interval '6 minutes'");
    expect((await claimPurchases(owner)).map(row => row.event_key)).toEqual([payment]);
    expect(await markSent(owner, 'purchase', [payment])).toBe(1);
    await q("UPDATE jobvance_private.meta_commerce_events SET claimed_at=now()-interval '1 hour'");
    expect(await claimPurchases(owner)).toHaveLength(0);
    expect(await markSent(owner, 'purchase', [payment])).toBe(0);
  });

  it('reports a local-currency payment in USD when accounting proves it, otherwise in the charged currency', async () => {
    const withProof = await period(await subscription(owner), { amount: 279900, currency: 'INR' });
    await q("INSERT INTO jobvance_private.loop_provider_accounting VALUES('live',$1,2900)", [withProof]);
    const [row] = await claimPurchases(owner);
    expect(Number(row.usd)).toBe(29);
    expect(row.currency).toBe('INR');
    const second = await person('second@gmail.com');
    await period(await subscription(second), { amount: 279900, currency: 'INR' });
    const [bare] = await claimPurchases(second);
    expect(bare.usd).toBeNull();
    expect(bare).toMatchObject({ amount_minor: 279900, currency: 'INR' });
  });

  it('skips renewals, refunded cycles, other people, stale payments and non-customers', async () => {
    const sub = await subscription(owner);
    await period(sub, { startsAgo: '20 days' }); // first cycle, too old for Meta
    await period(sub, { startsAgo: '1 hour' }); // a renewal, not a new customer
    expect(await claimPurchases(owner)).toHaveLength(0);

    const refunded = await person('refunded@gmail.com');
    await period(await subscription(refunded), { revoked: true });
    expect(await claimPurchases(refunded)).toHaveLength(0);

    const stranger = await person('stranger@gmail.com');
    await period(await subscription(stranger));
    expect(await claimPurchases(owner)).toHaveLength(0);

    const staff = await person('founder@jobvance.io');
    await q('INSERT INTO public.jobvance_admin_members(user_id) VALUES($1)', [staff]);
    await period(await subscription(staff));
    expect(await claimPurchases(staff)).toHaveLength(0);
    const qa = await person('qa@gmail.com', { qa_fixture: 'true' });
    await period(await subscription(qa));
    expect(await claimPurchases(qa)).toHaveLength(0);
    const fixture = await person('someone@example.com');
    await period(await subscription(fixture));
    expect(await claimPurchases(fixture)).toHaveLength(0);
  });

  it('offers Dodo test-mode payments only when asked, so live reporting is never polluted', async () => {
    const payment = await period(await subscription(owner, { mode: 'test' }), { mode: 'test' });
    expect(await claimPurchases(owner)).toHaveLength(0);
    expect((await claimPurchases(owner, true)).map(row => row.event_key)).toEqual([payment]);
  });
});

describe('checkouts offered to Meta', () => {
  it('claims an owner\'s ready checkout once, and ignores unfinished, foreign and test-mode ones', async () => {
    const request = randomUUID(), unfinished = randomUUID(), foreignRequest = randomUUID(), testRequest = randomUUID();
    const stranger = await person('stranger@gmail.com');
    await q("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,state,session_id) VALUES($1,$2,'live','weekly','ready','cks_one')", [owner, request]);
    await q("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,state,session_id) VALUES($1,$2,'live','weekly','creating',NULL)", [owner, unfinished]);
    await q("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,state,session_id) VALUES($1,$2,'live','daily','ready','cks_two')", [stranger, foreignRequest]);
    await q("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,state,session_id) VALUES($1,$2,'test','weekly','ready','cks_three')", [owner, testRequest]);
    expect(await claimCheckout(owner, request)).toEqual([{ event_key: request, plan_label: 'Job Loop Starter', mode: 'live' }]);
    expect(await claimCheckout(owner, request)).toHaveLength(0);
    expect(await claimCheckout(owner, unfinished)).toHaveLength(0);
    expect(await claimCheckout(owner, foreignRequest)).toHaveLength(0);
    expect(await claimCheckout(owner, testRequest)).toHaveLength(0);
    expect(await claimCheckout(owner, testRequest, true)).toHaveLength(1);
    expect(await markSent(owner, 'checkout', [request])).toBe(1);
  });
});

describe('access', () => {
  it('is reachable only by the service role', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(q('SELECT * FROM public.jobvance_meta_claim_purchases($1,false)', [owner])).rejects.toThrow(/permission denied/);
        await expect(q('SELECT * FROM public.jobvance_meta_claim_checkout($1,$2,false)', [owner, randomUUID()])).rejects.toThrow(/permission denied/);
        await expect(q("SELECT public.jobvance_meta_mark_sent($1,'purchase',ARRAY['x'],'live')", [owner])).rejects.toThrow(/permission denied/);
        await expect(q('SELECT * FROM jobvance_private.meta_commerce_events')).rejects.toThrow(/permission denied/);
      } finally { await db.exec('RESET ROLE'); }
    }
  });

  it('rejects malformed input', async () => {
    await expect(asService(() => q('SELECT * FROM public.jobvance_meta_claim_purchases(NULL,false)'))).rejects.toThrow(/META_COMMERCE_INVALID/);
    await expect(markSent(owner, 'everything', ['x'])).rejects.toThrow(/META_COMMERCE_INVALID/);
  });
});
