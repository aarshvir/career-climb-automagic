// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const owner = '00000000-0000-4000-8000-000000000001';
const operator = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const requestId = '00000000-0000-4000-8000-000000000004';
const receiptHash = 'a'.repeat(64);
const rateHash = 'b'.repeat(64);
const privateMessage = 'Private support message for the selected request.';
let db: PGlite;

interface Receipt {
  id: string; category: string; status: string; reply: string;
  createdAt: string; updatedAt: string; expiresAt: string;
}
interface Detail extends Receipt { version: number; message: string }
interface Metadata extends Omit<Detail, 'message' | 'reply'> { hasReply: boolean }
async function value<T = unknown>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ result: T }>(sql, args)).rows[0]?.result;
}
function create(id = requestId, receipt = receiptHash, rate = rateHash, category = 'privacy', message = privateMessage) {
  return value<Receipt>('SELECT public.jobvance_guest_support_create($1,$2,$3,$4,$5) AS result', [id, receipt, rate, category, message]);
}
function receipt(id = requestId, hash = receiptHash) {
  return value<Receipt>('SELECT public.jobvance_guest_support_receipt($1,$2) AS result', [id, hash]);
}
function list(actor = owner) {
  return value<Metadata[]>('SELECT public.jobvance_admin_guest_support_list($1) AS result', [actor]);
}
function detail(actor = owner, id = requestId) {
  return value<Detail>('SELECT public.jobvance_admin_guest_support_detail($1,$2) AS result', [actor, id]);
}
function update(actor = owner, id = requestId, expected = 0, status = 'in_review', reply = 'A private staff reply.') {
  return value<Detail>('SELECT public.jobvance_admin_guest_support_update($1,$2,$3,$4,$5) AS result', [actor, id, expected, status, reply]);
}
async function audit() {
  return (await db.query<{ actor_id: string; action: string; target_id: string | null; details: unknown }>(
    'SELECT actor_id,action,target_id,details FROM public.jobvance_admin_audit ORDER BY at,id',
  )).rows;
}

beforeAll(async () => {
  db = new PGlite();
  // Load production administrator assertion/audit migrations rather than stub authorization.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.job_loop_budget_months(month text PRIMARY KEY,committed_micros bigint NOT NULL DEFAULT 0);
    CREATE TABLE public.job_loop_support_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,category text,message text,status text DEFAULT 'received',created_at timestamptz DEFAULT now());
    CREATE TABLE public.job_loop_scheduler_config(singleton boolean PRIMARY KEY,enabled boolean,last_dispatch_at timestamptz);
    INSERT INTO public.job_loop_scheduler_config VALUES(true,false,NULL);
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'owner@example.test','{}'),($2,'operator@example.test','{}'),($3,'outsider@example.test','{\"admin\":true,\"role\":\"owner\"}')", [owner, operator, outsider]);
  for (const migration of [
    '20261012180814_jobvance_admin_platform.sql',
    '20261012183431_jobvance_admin_request_identity.sql',
    '20261014020000_jobvance_guest_support.sql',
  ]) await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
  await db.query("INSERT INTO public.jobvance_admin_members(user_id,role) VALUES($1,'owner'),($2,'operator')", [owner, operator]);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE public.jobvance_guest_support_requests,public.jobvance_admin_audit; UPDATE public.jobvance_admin_members SET active=true; SET ROLE service_role;');
});

describe('anonymous support PostgreSQL service boundary', () => {
  it('denies every browser table operation and RPC, including cleanup and staff actions', async () => {
    await create();
    const calls: [string, unknown[]][] = [
      ['SELECT public.jobvance_guest_support_create($1,$2,$3,$4,$5)', [requestId, receiptHash, rateHash, 'privacy', privateMessage]],
      ['SELECT public.jobvance_guest_support_receipt($1,$2)', [requestId, receiptHash]],
      ['SELECT public.jobvance_admin_guest_support_list($1)', [owner]],
      ['SELECT public.jobvance_admin_guest_support_detail($1,$2)', [owner, requestId]],
      ['SELECT public.jobvance_admin_guest_support_update($1,$2,0,$3,$4)', [owner, requestId, 'resolved', 'reply']],
      ['SELECT public.jobvance_guest_support_cleanup()', []],
    ];
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`RESET ROLE; SET ROLE ${role};`);
      for (const sql of [
        'SELECT * FROM public.jobvance_guest_support_requests',
        "INSERT INTO public.jobvance_guest_support_requests(id,receipt_hash,rate_hash,category,message) VALUES(gen_random_uuid(),repeat('a',64),repeat('b',64),'help','message')",
        "UPDATE public.jobvance_guest_support_requests SET reply='overwritten'",
        'DELETE FROM public.jobvance_guest_support_requests',
      ]) await expect(db.query(sql)).rejects.toThrow(/permission denied/);
      for (const [sql, args] of calls) await expect(db.query(sql, args)).rejects.toThrow(/permission denied/);
    }
    await db.exec('RESET ROLE; SET ROLE service_role;');
    expect(await receipt()).toMatchObject({ id: requestId, status: 'received' });
  });

  it('creates one private message with a 90-day receipt and returns only public receipt fields', async () => {
    const saved = await create(requestId, receiptHash, rateHash, 'privacy', `  ${privateMessage}  `);
    expect(Object.keys(saved).sort()).toEqual(['category', 'createdAt', 'expiresAt', 'id', 'reply', 'status', 'updatedAt']);
    expect(saved).toMatchObject({ id: requestId, category: 'privacy', status: 'received', reply: '' });
    expect(new Date(saved.expiresAt).getTime() - new Date(saved.createdAt).getTime()).toBe(90 * 24 * 60 * 60 * 1000);
    expect((await db.query('SELECT message,receipt_hash,rate_hash,version FROM public.jobvance_guest_support_requests')).rows)
      .toEqual([{ message: privateMessage, receipt_hash: receiptHash, rate_hash: rateHash, version: 0 }]);
    expect(await audit()).toEqual([]);
    expect(JSON.stringify(saved)).not.toContain(privateMessage);
    expect(JSON.stringify(saved)).not.toContain(receiptHash);
    expect(JSON.stringify(saved)).not.toContain(rateHash);
  });

  it('requires the matching bearer hash and makes wrong, missing and expired receipts unavailable', async () => {
    await create();
    expect(await receipt()).toMatchObject({ id: requestId });
    await expect(receipt(requestId, 'c'.repeat(64))).rejects.toThrow(/GUEST_SUPPORT_NOT_FOUND/);
    await expect(receipt(randomUUID(), receiptHash)).rejects.toThrow(/GUEST_SUPPORT_NOT_FOUND/);
    await expect(value('SELECT public.jobvance_guest_support_receipt($1,NULL) AS result', [requestId])).rejects.toThrow(/GUEST_SUPPORT_NOT_FOUND/);
    await db.query("UPDATE public.jobvance_guest_support_requests SET expires_at=now()-interval '1 second' WHERE id=$1", [requestId]);
    await expect(receipt()).rejects.toThrow(/GUEST_SUPPORT_NOT_FOUND/);
    await expect(create()).rejects.toThrow(/GUEST_SUPPORT_CONFLICT/);
  });

  it('replays an identical create without quota use and refuses changed receipt, category or message', async () => {
    const original = await create();
    expect(await create(requestId, receiptHash, 'c'.repeat(64), 'privacy', `  ${privateMessage}  `)).toEqual(original);
    const repeated = await Promise.all([create(), create()]);
    expect(repeated).toEqual([original, original]);
    await expect(create(requestId, 'd'.repeat(64))).rejects.toThrow(/GUEST_SUPPORT_CONFLICT/);
    await expect(create(requestId, receiptHash, rateHash, 'bug')).rejects.toThrow(/GUEST_SUPPORT_CONFLICT/);
    await expect(create(requestId, receiptHash, rateHash, 'privacy', 'Changed private message.')).rejects.toThrow(/GUEST_SUPPORT_CONFLICT/);
    expect((await db.query('SELECT id,message,receipt_hash,rate_hash FROM public.jobvance_guest_support_requests')).rows)
      .toEqual([{ id: requestId, message: privateMessage, receipt_hash: receiptHash, rate_hash: rateHash }]);
    expect(await audit()).toEqual([]);
  });

  it('limits each rate identity to five new requests per rolling hour while allowing retries', async () => {
    const original = await create();
    for (let i = 1; i < 5; i++) await create(randomUUID());
    await expect(create(randomUUID())).rejects.toThrow(/GUEST_SUPPORT_LIMIT/);
    expect(await create()).toEqual(original);
    await create(randomUUID(), receiptHash, 'c'.repeat(64));
    await db.query("UPDATE public.jobvance_guest_support_requests SET created_at=now()-interval '1 hour 1 second' WHERE id=$1", [requestId]);
    await create(randomUUID());
    expect(await value('SELECT count(*)::integer AS result FROM public.jobvance_guest_support_requests')).toBe(7);
  });

  it('applies the shared 100-per-day ceiling across independent rate identities', async () => {
    await db.exec(`INSERT INTO public.jobvance_guest_support_requests(id,receipt_hash,rate_hash,category,message)
      SELECT gen_random_uuid(),repeat('a',64),lpad(to_hex(i),64,'0'),'help','Fixture support message' FROM generate_series(1,99) i;`);
    const original = await create();
    await expect(create(randomUUID(), receiptHash, 'c'.repeat(64))).rejects.toThrow(/GUEST_SUPPORT_LIMIT/);
    expect(await create()).toEqual(original);
    expect(await value('SELECT count(*)::integer AS result FROM public.jobvance_guest_support_requests')).toBe(100);
    await db.exec("UPDATE public.jobvance_guest_support_requests SET created_at=now()-interval '1 day 1 second' WHERE id=(SELECT id FROM public.jobvance_guest_support_requests WHERE id<>'00000000-0000-4000-8000-000000000004' ORDER BY id LIMIT 1);");
    await create(randomUUID(), receiptHash, 'c'.repeat(64));
    expect(await value('SELECT count(*)::integer AS result FROM public.jobvance_guest_support_requests')).toBe(101);
  });

  it('rejects nulls, unsupported categories, malformed hashes and unbounded SQL messages without rows', async () => {
    const valid: unknown[] = [requestId, receiptHash, rateHash, 'help', 'Short request'];
    for (const [index, input] of [
      [0, null], [1, null], [2, null], [3, null], [4, null],
      [1, 'A'.repeat(64)], [1, 'a'.repeat(63)], [2, 'b'.repeat(65)],
      [3, 'billing'], [4, '    '], [4, 'tiny'], [4, 'X'.repeat(2001)],
    ] as [number, unknown][]) {
      const args = [...valid]; args[index] = input;
      await expect(value('SELECT public.jobvance_guest_support_create($1,$2,$3,$4,$5) AS result', args)).rejects.toThrow(/GUEST_SUPPORT_INVALID/);
    }
    expect(await value('SELECT count(*)::integer AS result FROM public.jobvance_guest_support_requests')).toBe(0);
  });
});

describe('staff guest support privacy, role and update boundary', () => {
  it('authorizes real active membership and immediately fences outsiders and revoked staff', async () => {
    await create();
    for (const actor of [owner, operator]) {
      expect(await list(actor)).toHaveLength(1);
      expect(await detail(actor)).toMatchObject({ id: requestId, message: privateMessage });
    }
    for (const call of [() => list(outsider), () => detail(outsider), () => update(outsider)])
      await expect(call()).rejects.toThrow(/ADMIN_FORBIDDEN/);
    await db.query('UPDATE public.jobvance_admin_members SET active=false WHERE user_id=$1', [operator]);
    for (const call of [() => list(operator), () => detail(operator), () => update(operator)])
      await expect(call()).rejects.toThrow(/ADMIN_FORBIDDEN/);
    await db.query('UPDATE public.jobvance_admin_members SET active=false WHERE user_id=$1', [owner]);
    for (const call of [() => list(), () => detail(), () => update()])
      await expect(call()).rejects.toThrow(/ADMIN_FORBIDDEN/);
    expect(await receipt()).toMatchObject({ status: 'received', reply: '' });
  });

  it('lists metadata, opens only the selected message and records safe read audit fields', async () => {
    const other = randomUUID(), expired = randomUUID();
    const privateReply = 'Private reply that does not belong in a metadata list.';
    await create();
    await create(other, 'c'.repeat(64), rateHash, 'bug', 'Another private support message.');
    await create(expired, 'd'.repeat(64), rateHash, 'help', 'Expired private support message.');
    await db.query('UPDATE public.jobvance_guest_support_requests SET reply=$1 WHERE id=$2', [privateReply, requestId]);
    await db.query("UPDATE public.jobvance_guest_support_requests SET expires_at=now()-interval '1 second' WHERE id=$1", [expired]);
    const metadata = await list();
    expect(metadata).toHaveLength(2);
    expect(metadata.find(item => item.id === requestId)).toMatchObject({ version: 0, hasReply: true });
    for (const item of metadata) expect(Object.keys(item).sort()).toEqual(['category', 'createdAt', 'expiresAt', 'hasReply', 'id', 'status', 'updatedAt', 'version']);
    expect(JSON.stringify(metadata)).not.toMatch(/Private support|Another private|Private reply|receipt_hash|rate_hash/);
    const selected = await detail(operator);
    expect(selected).toMatchObject({ id: requestId, message: privateMessage, reply: privateReply, version: 0 });
    expect(JSON.stringify(selected)).not.toContain('Another private');
    expect(Object.keys(selected).sort()).toEqual(['category', 'createdAt', 'expiresAt', 'id', 'message', 'reply', 'status', 'updatedAt', 'version']);
    expect(await audit()).toEqual([
      { actor_id: owner, action: 'snapshot', target_id: null, details: { count: 2 } },
      { actor_id: operator, action: 'support_detail', target_id: requestId, details: { version: 0 } },
    ]);
    expect(JSON.stringify(await audit())).not.toContain(privateMessage);
    expect(JSON.stringify(await audit())).not.toContain(privateReply);
    await expect(detail(owner, expired)).rejects.toThrow(/ADMIN_NOT_FOUND/);
    await expect(detail(owner, randomUUID())).rejects.toThrow(/ADMIN_NOT_FOUND/);
  });

  it('updates by expected version, publishes a private reply only to its bearer and audits no content', async () => {
    await create();
    const reply = 'We have reviewed the selected support request.';
    const saved = await update(operator, requestId, 0, 'in_review', reply);
    expect(saved).toMatchObject({ id: requestId, version: 1, status: 'in_review', reply, message: privateMessage });
    expect(await receipt()).toMatchObject({ id: requestId, status: 'in_review', reply });
    await expect(update(owner, requestId, 0, 'resolved', 'Stale overwrite')).rejects.toThrow(/ADMIN_VERSION_CONFLICT/);
    await expect(receipt(requestId, 'c'.repeat(64))).rejects.toThrow(/GUEST_SUPPORT_NOT_FOUND/);
    expect((await db.query('SELECT version,status,reply,message FROM public.jobvance_guest_support_requests WHERE id=$1', [requestId])).rows)
      .toEqual([{ version: 1, status: 'in_review', reply, message: privateMessage }]);
    expect(await audit()).toEqual([{ actor_id: operator, action: 'support_updated', target_id: requestId, details: { version: 1, status: 'in_review' } }]);
    const results = await Promise.allSettled([update(owner, requestId, 1, 'resolved', reply), update(operator, requestId, 1, 'received', 'Competing overwrite')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason.message).toContain('ADMIN_VERSION_CONFLICT');
    expect(await receipt()).toMatchObject({ status: 'resolved', reply });
    expect(await audit()).toHaveLength(2);
  });

  it('rejects invalid staff inputs and expired updates atomically', async () => {
    await create();
    for (const [version, status, reply] of [
      [-1, 'received', ''], [null, 'received', ''], [0, 'unrecognized', ''],
      [0, null, ''], [0, 'received', null], [0, 'received', 'X'.repeat(2001)],
    ]) await expect(value('SELECT public.jobvance_admin_guest_support_update($1,$2,$3,$4,$5) AS result', [owner, requestId, version, status, reply])).rejects.toThrow(/ADMIN_INPUT_INVALID/);
    await expect(update(owner, randomUUID())).rejects.toThrow(/ADMIN_NOT_FOUND/);
    expect(await audit()).toEqual([]);
    expect(await receipt()).toMatchObject({ status: 'received', reply: '' });
    await db.query("UPDATE public.jobvance_guest_support_requests SET expires_at=now()-interval '1 second' WHERE id=$1", [requestId]);
    await expect(update()).rejects.toThrow(/ADMIN_NOT_FOUND/);
    expect(await audit()).toEqual([]);
  });

  it('keeps audit append-only and rejects message, reply, receipt and rate metadata', async () => {
    await create();
    await detail();
    await db.exec('RESET ROLE;');
    await expect(db.query("UPDATE public.jobvance_admin_audit SET details='{}'")).rejects.toThrow(/ADMIN_AUDIT_IMMUTABLE/);
    await expect(db.query('DELETE FROM public.jobvance_admin_audit')).rejects.toThrow(/ADMIN_AUDIT_IMMUTABLE/);
    await db.exec('SET ROLE service_role;');
    for (const key of ['message', 'reply', 'receiptHash', 'receiptKey', 'rateHash', 'ip', 'email', 'attachment'])
      await expect(value("SELECT public.jobvance_admin_record_event($1,'support_detail',$2,$3) AS result", [owner, requestId, JSON.stringify({ [key]: 'Private forbidden content' })])).rejects.toThrow(/ADMIN_AUDIT_INVALID/);
    expect(await audit()).toEqual([{ actor_id: owner, action: 'support_detail', target_id: requestId, details: { version: 0 } }]);
  });

  it('retains current receipts and deletes expired private messages through service-only cleanup', async () => {
    await create();
    const expired = randomUUID();
    await create(expired, 'c'.repeat(64), rateHash, 'help', 'Expired private support message.');
    await db.query("UPDATE public.jobvance_guest_support_requests SET expires_at=now()-interval '1 second' WHERE id=$1", [expired]);
    expect(await value('SELECT public.jobvance_guest_support_cleanup() AS result')).toBe(1);
    expect((await db.query('SELECT id FROM public.jobvance_guest_support_requests')).rows).toEqual([{ id: requestId }]);
    expect(await value('SELECT public.jobvance_guest_support_cleanup() AS result')).toBe(0);
    await expect(receipt(expired, 'c'.repeat(64))).rejects.toThrow(/GUEST_SUPPORT_NOT_FOUND/);
    expect(await receipt()).toMatchObject({ id: requestId });
  });
});
