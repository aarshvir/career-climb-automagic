// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// In-memory PostgreSQL and invented identities only. These tests make no HTTP
// requests and cannot access production candidate records or provider accounts.
let db: PGlite;
const hash = 'b'.repeat(64);
const record = { profile: { name: 'Local budget regression fixture' }, claims: [], opportunities: [], inbox: [] };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON storage.objects TO anon,authenticated;
  `);
  const durable = (await readdir('supabase/migrations')).filter(name => name.endsWith('_job_loop_durable_erasure.sql'));
  expect(durable).toHaveLength(1);
  for (const migration of [
    '20261011010000_job_loop_cloud.sql',
    '20261011020000_job_loop_revoke_all.sql',
    '20261011030000_job_loop_recurring.sql',
    '20261013190000_job_loop_provider_lease.sql',
    durable[0],
  ]) await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
afterEach(async () => { await db.exec('TRUNCATE auth.users CASCADE; TRUNCATE job_loop_budget_months CASCADE;'); });

async function account() {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
  await db.query('SELECT job_loop_write_record($1,0,$2,true)', [user, record]);
  const result = await db.query<{ run: { id: string } }>(`
    SELECT job_loop_start_run($1,$2,$3,$3,
      (SELECT version FROM job_loop_records WHERE user_id=$1),
      'rules','grounded-rules-v1','{}') AS run
  `, [user, randomUUID(), hash]);
  const run = result.rows[0].run.id, lease = randomUUID();
  await db.query('SELECT job_loop_claim_run($1,$2)', [run, lease]);
  return { user, run, lease };
}

async function reserve(owner: Awaited<ReturnType<typeof account>>, key: string, micros: number): Promise<string> {
  const result = await db.query<{ usage: { id: string } }>(
    "SELECT job_loop_reserve($1,$2,$3,$4,'local-test-provider',$5,50000000) AS usage",
    [owner.user, owner.run, owner.lease, key, micros],
  );
  return result.rows[0].usage.id;
}

async function sharedBudget(user: string) {
  return (await db.query<{ budget: { committedUsd: number; remainingUsd: number; capUsd: number } }>(
    'SELECT job_loop_budget_snapshot($1,50000000) AS budget', [user],
  )).rows[0].budget;
}

async function committedMicros(): Promise<number> {
  return Number((await db.query<{ committed_micros: number }>(
    "SELECT committed_micros FROM job_loop_budget_months WHERE month=to_char(now() AT TIME ZONE 'UTC','YYYY-MM')",
  )).rows[0].committed_micros);
}

async function erase(user: string): Promise<number> {
  const generation = (await db.query<{ erasure: { generation: number } }>(
    'SELECT job_loop_begin_erase($1) AS erasure', [user],
  )).rows[0].erasure.generation;
  await db.query('SELECT job_loop_finish_erase($1,$2)', [user, generation]);
  return generation;
}

describe('JV-02 erasure cannot reopen the shared processing allowance', () => {
  it('retains actual, uncertain and reserved commitments while removing erased-owner usage authority and preserving another owner', async () => {
    const owner = await account(), other = await account();
    const settled = await reserve(owner, 'settled', 1_500_000);
    await db.query("SELECT job_loop_settle($1,1000000,'{}',false)", [settled]);
    const uncertain = await reserve(owner, 'uncertain', 2_000_000);
    await db.query('SELECT job_loop_settle($1,NULL,NULL,true)', [uncertain]);
    const reserved = await reserve(owner, 'reserved', 3_000_000);
    const otherUsage = await reserve(other, 'other-actual', 4_000_000);
    await db.query("SELECT job_loop_settle($1,4000000,'{}',false)", [otherUsage]);

    expect((await db.query<{ status: string }>('SELECT status FROM job_loop_usage WHERE id=ANY($1::uuid[]) ORDER BY status',
      [[settled, uncertain, reserved]])).rows.map(row => row.status)).toEqual(['reserved', 'settled', 'uncertain']);
    // 1 actual + 2 uncertain + 3 reserved from this owner, plus 4 from the other.
    expect(await committedMicros()).toBe(10_000_000);
    expect(await sharedBudget(other.user)).toMatchObject({ capUsd: 50, committedUsd: 10, remainingUsd: 40 });
    const otherRecord = (await db.query('SELECT * FROM job_loop_records WHERE user_id=$1', [other.user])).rows;
    const otherUsageRows = (await db.query('SELECT * FROM job_loop_usage WHERE user_id=$1', [other.user])).rows;

    const generation = (await db.query<{ erasure: { generation: number } }>('SELECT job_loop_begin_erase($1) AS erasure', [owner.user])).rows[0].erasure.generation;
    expect(await committedMicros()).toBe(10_000_000);
    await db.query('SELECT job_loop_finish_erase($1,$2)', [owner.user, generation]);
    expect((await db.query('SELECT * FROM job_loop_records WHERE user_id=$1', [owner.user])).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM job_loop_runs WHERE user_id=$1', [owner.user])).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM job_loop_usage WHERE user_id=$1', [owner.user])).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM job_loop_artifact_grants WHERE user_id=$1', [owner.user])).rows).toHaveLength(0);
    expect(await committedMicros()).toBe(10_000_000);

    // An idempotent completion and late settlements cannot refund or recreate
    // erased usage authority, including reservations with no confirmed outcome.
    await db.query('SELECT job_loop_finish_erase($1,$2)', [owner.user, generation]);
    for (const id of [settled, uncertain, reserved]) {
      await expect(db.query("SELECT job_loop_settle($1,0,'{}',false)", [id])).rejects.toThrow(/LOOP_/);
    }
    expect(await committedMicros()).toBe(10_000_000);
    expect(await sharedBudget(other.user)).toMatchObject({ capUsd: 50, committedUsd: 10, remainingUsd: 40 });
    expect((await db.query('SELECT * FROM job_loop_records WHERE user_id=$1', [other.user])).rows).toEqual(otherRecord);
    expect((await db.query('SELECT * FROM job_loop_usage WHERE user_id=$1', [other.user])).rows).toEqual(otherUsageRows);
    expect((await db.query<{ active: boolean }>('SELECT active FROM job_loop_pilot_users WHERE user_id=$1', [other.user])).rows[0].active).toBe(true);
  });

  it('keeps commitments and the new record intact when old completion or expected-version writes arrive after fresh setup', async () => {
    const owner = await account();
    await reserve(owner, 'still-reserved', 2_000_000);
    const previousVersion = Number((await db.query<{ version: number }>('SELECT version FROM job_loop_records WHERE user_id=$1', [owner.user])).rows[0].version);
    const generation = await erase(owner.user);
    await db.query('INSERT INTO job_loop_records(user_id) VALUES($1)', [owner.user]);
    const freshRecord = { ...record, profile: { name: 'Fresh post-erasure fixture' } };
    await db.query('SELECT job_loop_write_record($1,(SELECT version FROM job_loop_records WHERE user_id=$1),$2,true)', [owner.user, freshRecord]);
    const freshVersion = Number((await db.query<{ version: number }>('SELECT version FROM job_loop_records WHERE user_id=$1', [owner.user])).rows[0].version);

    expect(freshVersion).toBeGreaterThan(previousVersion);
    await expect(db.query('SELECT job_loop_write_record($1,$2,$3,true)',
      [owner.user, previousVersion, { ...record, profile: { name: 'OLD_DELAYED_REQUEST' } }])).rejects.toThrow('LOOP_VERSION_CONFLICT');
    await expect(db.query('SELECT job_loop_finish_erase($1,$2)', [owner.user, generation])).rejects.toThrow('LOOP_ERASURE_STALE');
    expect((await db.query<{ data: typeof record }>('SELECT data FROM job_loop_records WHERE user_id=$1', [owner.user])).rows[0].data).toEqual(freshRecord);
    expect(await committedMicros()).toBe(2_000_000);
    expect(await sharedBudget(owner.user)).toMatchObject({ capUsd: 50, committedUsd: 2, remainingUsd: 48 });
  });
});
