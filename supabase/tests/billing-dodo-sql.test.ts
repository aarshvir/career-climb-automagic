// @vitest-environment node
// Real PostgreSQL (PGlite) check of the Dodo provider migration layered on the billing MVP.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
let dodoMigration: string;
const id = (prefix: string) => prefix + randomUUID().replaceAll('-', '').slice(0, 21);
const now = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
  await db.exec(await readFile(new URL('../migrations/20261010000000_grounded_application_mvp.sql', import.meta.url), 'utf8'));
  dodoMigration = await readFile(new URL('../migrations/20261017090000_billing_dodo_provider.sql', import.meta.url), 'utf8');
  await db.exec(dodoMigration);
}, 30000);
afterAll(async () => { await db?.close(); });

async function account() {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [user, 'fixture@example.invalid']);
  return user;
}
async function balance(user: string, mode = 'test') {
  return (await db.query<{ value: { creditsRemaining: number } }>('SELECT jobvance_get_entitlement($1,$2) AS value', [user, mode])).rows[0].value.creditsRemaining;
}
async function order(user: string, request: string, session = id('cks_'), mode = 'test') {
  const host = mode === 'live' ? 'checkout.dodopayments.com' : 'test.checkout.dodopayments.com';
  await db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [user, request, 'dodo', mode]);
  await db.query('SELECT jobvance_finish_checkout($1,$2,$3,$4,$5,$6,$7)', [user, request, session, `https://${host}/session/${session}`, null, 'dodo', mode]);
  return session;
}
async function event(user: string, request: string, payment: string, session: string | null, options: { action?: string; eventId?: string; amount?: number; refund?: string | null; mode?: string } = {}) {
  const action = options.action ?? 'paid';
  return (await db.query<{ result: { duplicate: boolean } }>('SELECT jobvance_apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS result', [
    options.eventId ?? `dodo_${id('msg_')}`, action === 'paid' ? 'payment.succeeded' : 'refund.succeeded', now(), action, user, request, `dodo_${payment}`, session,
    action === 'paid' ? 0 : options.amount ?? 2900, 'dodo', options.mode ?? 'test', action === 'refund' ? (options.refund === undefined ? `dodo_${id('ref_')}` : options.refund) : null,
  ])).rows[0].result;
}

describe('provider constraints after the Dodo migration', () => {
  it('accepts dodo in every provider-constrained table and still rejects unknown providers', async () => {
    const user = await account(); const request = randomUUID(); const intent = `dodo_${id('pay_')}`;
    await db.query("INSERT INTO billing_orders(user_id,request_id,provider,billing_mode) VALUES($1,$2,'dodo','test')", [user, request]);
    await db.query("INSERT INTO billing_payments(payment_intent,user_id,request_id,provider,billing_mode) VALUES($1,$2,$3,'dodo','test')", [intent, user, request]);
    await db.query("INSERT INTO billing_credit_grants(user_id,kind,source_id,credits_total,expires_at,provider,billing_mode) VALUES($1,'paid',$2,10,now() + interval '30 days','dodo','test')", [user, intent]);
    await db.query('INSERT INTO billing_refund_adjustments(adjustment_id,payment_intent,amount) VALUES($1,$2,100)', [`dodo_${id('ref_')}`, intent]);
    await expect(db.query("INSERT INTO billing_orders(user_id,request_id,provider,billing_mode) VALUES($1,$2,'lemonsqueezy','test')", [user, randomUUID()])).rejects.toThrow(/billing_orders_provider_check/);
    await expect(db.query("INSERT INTO billing_payments(payment_intent,user_id,request_id,provider,billing_mode) VALUES($1,$2,$3,'Dodo','test')", ['x_unknown', user, request])).rejects.toThrow(/billing_payments_provider_check/);
    await expect(db.query("INSERT INTO billing_credit_grants(user_id,kind,source_id,credits_total,expires_at,provider,billing_mode) VALUES($1,'paid','x',10,now(),'unknown','test')", [user])).rejects.toThrow(/billing_credit_grants_provider_check/);
    await expect(db.query('INSERT INTO billing_refund_adjustments(adjustment_id,payment_intent,amount) VALUES($1,$2,100)', ['dodo_adj_wrong shape', intent])).rejects.toThrow(/adjustment_id_check/);
  });
  it('keeps exactly one provider check per table', async () => {
    const checks = await db.query<{ table: string; definition: string }>(`SELECT conrelid::regclass::text AS table, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE contype = 'c' AND conrelid::regclass::text IN ('billing_orders','billing_payments','billing_credit_grants') AND pg_get_constraintdef(oid) LIKE '%provider = ANY%'`);
    expect(checks.rows.map(row => row.table).sort()).toEqual(['billing_credit_grants', 'billing_orders', 'billing_payments']);
    for (const row of checks.rows) expect(row.definition).toContain("'dodo'");
  });
  it('lets begin_checkout claim a Dodo order once and still refuses unknown providers', async () => {
    const user = await account(); const request = randomUUID();
    const first = (await db.query<{ result: { creationClaimAcquired: boolean; provider: string } }>('SELECT jobvance_begin_checkout($1,$2,$3,$4) AS result', [user, request, 'dodo', 'test'])).rows[0].result;
    const retry = (await db.query<{ result: { creationClaimAcquired: boolean } }>('SELECT jobvance_begin_checkout($1,$2,$3,$4) AS result', [user, request, 'dodo', 'test'])).rows[0].result;
    expect(first).toMatchObject({ creationClaimAcquired: true, provider: 'dodo' }); expect(retry.creationClaimAcquired).toBe(false);
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [user, request, 'paddle', 'test'])).rejects.toThrow('REQUEST_CONFLICT');
    await expect(db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [user, randomUUID(), 'unknown', 'test'])).rejects.toThrow('REQUEST_CONFLICT');
  });
  it('stores only a Dodo session on the checkout host for its mode', async () => {
    const user = await account(); const request = randomUUID(); const session = id('cks_');
    await db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [user, request, 'dodo', 'test']);
    const finish = (sessionId: string | null, url: string | null) => db.query('SELECT jobvance_finish_checkout($1,$2,$3,$4,$5,$6,$7)', [user, request, sessionId, url, null, 'dodo', 'test']);
    await expect(finish(`txn_${'a'.repeat(26)}`, `https://test.checkout.dodopayments.com/session/${session}`)).rejects.toThrow('REQUEST_CONFLICT');
    await expect(finish(session, `https://checkout.dodopayments.com/session/${session}`)).rejects.toThrow('REQUEST_CONFLICT');
    await expect(finish(session, `https://test.checkout.dodopayments.com.attacker.example/${session}`)).rejects.toThrow('REQUEST_CONFLICT');
    await expect(finish(session, null)).rejects.toThrow('REQUEST_CONFLICT');
    await finish(session, `https://test.checkout.dodopayments.com/session/${session}`);
    const stored = (await db.query<{ checkout_session_id: string; payment_intent: string | null }>('SELECT checkout_session_id,payment_intent FROM billing_orders WHERE user_id=$1', [user])).rows[0];
    expect(stored).toEqual({ checkout_session_id: session, payment_intent: null });
  });
  it('still runs the Paddle and Stripe ledgers unchanged', async () => {
    const user = await account(); const paddleRequest = randomUUID(); const transaction = `txn_${randomUUID().replaceAll('-', '').slice(0, 26)}`;
    await db.query('SELECT jobvance_begin_checkout($1,$2,$3,$4)', [user, paddleRequest, 'paddle', 'test']);
    await db.query('SELECT jobvance_finish_checkout($1,$2,$3,$4,$5,$6,$7)', [user, paddleRequest, transaction, null, null, 'paddle', 'test']);
    await db.query('SELECT jobvance_apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [`paddle_evt_${randomUUID().replaceAll('-', '').slice(0, 26)}`, 'transaction.completed', now(), 'paid', user, paddleRequest, `paddle_${transaction}`, transaction, 0, 'paddle', 'test', null]);
    await db.query('SELECT jobvance_apply_payment_event($1,$2,$3,$4,$5,$6,$7,$8,$9)', [`evt_${randomUUID().replaceAll('-', '')}`, 'checkout.session.completed', now(), 'paid', user, randomUUID(), `pi_${randomUUID().replaceAll('-', '')}`, 'cs_test_fixture', 0]);
    expect(await balance(user)).toBe(21);
  });
});

describe('Dodo payment ledger binding', () => {
  it('rejects a payment whose session our backend never stored', async () => {
    const user = await account(); const request = randomUUID(); const payment = id('pay_');
    await expect(event(user, request, payment, id('cks_'))).rejects.toThrow('REQUEST_CONFLICT');
    const session = await order(user, request);
    await expect(event(user, request, payment, id('cks_'))).rejects.toThrow('REQUEST_CONFLICT');
    await expect(event(user, request, payment, session, { mode: 'live' })).rejects.toThrow('REQUEST_CONFLICT');
    expect(await balance(user)).toBe(1);
    await event(user, request, payment, session);
    expect(await balance(user)).toBe(11);
    expect(await balance(user, 'live')).toBe(1);
  });
  it('rolls back the event record when binding fails so a corrected retry can apply', async () => {
    const user = await account(); const request = randomUUID(); const payment = id('pay_'); const eventId = `dodo_${id('msg_')}`;
    await expect(event(user, request, payment, id('cks_'), { eventId })).rejects.toThrow('REQUEST_CONFLICT');
    expect((await db.query('SELECT 1 FROM billing_payment_events WHERE event_id=$1', [eventId])).rows).toHaveLength(0);
    const session = await order(user, request);
    expect((await event(user, request, payment, session, { eventId })).duplicate).toBe(false);
    expect((await event(user, request, payment, session, { eventId })).duplicate).toBe(true);
    expect(await balance(user)).toBe(11);
  });
  it('namespaces event, payment and refund IDs and requires the session', async () => {
    const user = await account(); const request = randomUUID(); const payment = id('pay_'); const session = await order(user, request);
    await expect(event(user, request, payment, session, { eventId: id('msg_') })).rejects.toThrow('INVALID_PAYMENT');
    await expect(event(user, request, payment, null)).rejects.toThrow('INVALID_PAYMENT');
    await expect(event(user, request, `txn_${'a'.repeat(26)}`, session)).rejects.toThrow('INVALID_PAYMENT');
    await expect(event(user, request, payment, session, { action: 'refund', refund: null })).rejects.toThrow('INVALID_PAYMENT');
    await expect(event(user, request, payment, session, { action: 'refund', refund: `paddle_adj_${'a'.repeat(26)}` })).rejects.toThrow('INVALID_PAYMENT');
    expect(await balance(user)).toBe(1);
  });
  it('a second payment cannot reuse a paid order', async () => {
    const user = await account(); const request = randomUUID(); const session = await order(user, request);
    await event(user, request, id('pay_'), session);
    await expect(event(user, request, id('pay_'), session)).rejects.toThrow('REQUEST_CONFLICT');
    expect(await balance(user)).toBe(11);
  });
  it('refunds revoke unused credits and deduplicate per refund ID', async () => {
    const user = await account(); const request = randomUUID(); const payment = id('pay_'); const session = await order(user, request); const refund = `dodo_${id('ref_')}`;
    await event(user, request, payment, session);
    expect(await balance(user)).toBe(11);
    await event(user, request, payment, session, { action: 'refund', amount: 952, refund });
    await event(user, request, payment, session, { action: 'refund', amount: 952, refund });
    expect(await balance(user)).toBe(1);
    expect((await db.query<{ refund_amount: number; status: string }>('SELECT p.refund_amount, o.status FROM billing_payments p JOIN billing_orders o USING (payment_intent) WHERE payment_intent=$1', [`dodo_${payment}`])).rows[0])
      .toEqual({ refund_amount: 952, status: 'refunded' });
    await expect(event(user, request, payment, session, { action: 'refund', amount: 100, refund })).rejects.toThrow('REQUEST_CONFLICT');
    await expect(event(user, request, payment, session, { action: 'refund', amount: 2900 })).rejects.toThrow('INVALID_PAYMENT');
  });
  it('a refund before payment.succeeded leaves a tombstone that a late payment cannot undo', async () => {
    const user = await account(); const request = randomUUID(); const payment = id('pay_'); const session = await order(user, request);
    await event(user, request, payment, session, { action: 'refund' });
    await event(user, request, payment, session);
    expect(await balance(user)).toBe(1);
    expect((await db.query<{ status: string }>('SELECT status FROM billing_orders WHERE payment_intent=$1', [`dodo_${payment}`])).rows[0].status).toBe('refunded');
  });
  it('can be re-applied without changing behaviour', async () => {
    await db.exec(dodoMigration);
    const user = await account(); const request = randomUUID(); const session = await order(user, request);
    await event(user, request, id('pay_'), session);
    expect(await balance(user)).toBe(11);
  });
});
