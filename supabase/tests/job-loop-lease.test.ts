// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const hash = 'a'.repeat(64);
const record = { profile: { name: 'Fictional lease fixture' }, claims: [], opportunities: [], inbox: [] };
const leaseMigration = 'supabase/migrations/20261013190000_job_loop_provider_lease.sql';
let db: PGlite;

async function fixture(): Promise<PGlite> {
  const instance = new PGlite();
  await instance.exec(`
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
    CREATE POLICY legacy_all ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
  `);
  for (const migration of ['20261011010000_job_loop_cloud.sql', '20261011020000_job_loop_revoke_all.sql']) {
    await instance.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
  }
  return instance;
}

async function account(instance: PGlite): Promise<string> {
  const owner = randomUUID();
  await instance.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  await instance.query('SELECT job_loop_write_record($1,0,$2,true)', [owner, record]);
  return owner;
}

async function run(instance: PGlite, owner: string): Promise<string> {
  const result = await instance.query<{ run: { id: string } }>(`
    SELECT job_loop_start_run($1,$2,$3,$3,
      (SELECT version FROM job_loop_records WHERE user_id=$1),
      'rules','grounded-rules-v1','{}') AS run
  `, [owner, randomUUID(), hash]);
  return result.rows[0].run.id;
}

async function claim(instance: PGlite, runId: string): Promise<string> {
  const lease = randomUUID();
  await instance.query('SELECT job_loop_claim_run($1,$2)', [runId, lease]);
  return lease;
}

async function remaining(instance: PGlite, runId: string): Promise<number> {
  const result = await instance.query<{ seconds: number }>(
    'SELECT extract(epoch FROM lease_until-now()) AS seconds FROM job_loop_runs WHERE id=$1', [runId],
  );
  return Number(result.rows[0].seconds);
}

const commit = (instance: PGlite, runId: string, lease: string) => instance.query(
  "SELECT job_loop_commit_phase($1,$2,1,'running','{}')", [runId, lease],
);

beforeAll(async () => {
  db = await fixture();
  await db.exec(await readFile(leaseMigration, 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });

describe('provider lease migration with real PostgreSQL guards', () => {
  it('reproduces the old 101-second late commit failure and accepts it after migration', async () => {
    const historical = await fixture();
    try {
      const owner = await account(historical), runId = await run(historical, owner);
      const oldLease = await claim(historical, runId);
      expect(await remaining(historical, runId)).toBeGreaterThan(99);
      expect(await remaining(historical, runId)).toBeLessThanOrEqual(100);
      // Move the expiry, not wall time. This represents a provider response at 101 seconds.
      await historical.query("UPDATE job_loop_runs SET lease_until=lease_until-interval '101 seconds' WHERE id=$1", [runId]);
      await expect(commit(historical, runId, oldLease)).rejects.toThrow('LOOP_LEASE_LOST');

      await historical.exec(await readFile(leaseMigration, 'utf8'));
      const newLease = await claim(historical, runId);
      expect(await remaining(historical, runId)).toBeGreaterThan(179);
      expect(await remaining(historical, runId)).toBeLessThanOrEqual(180);
      await historical.query("UPDATE job_loop_runs SET lease_until=lease_until-interval '101 seconds' WHERE id=$1", [runId]);
      await expect(commit(historical, runId, newLease)).resolves.toBeDefined();
    } finally { await historical.close(); }
  }, 30000);

  it('keeps wrong-token and cancellation guards authoritative with the longer lease', async () => {
    const owner = await account(db), runId = await run(db, owner), lease = await claim(db, runId);
    await expect(commit(db, runId, randomUUID())).rejects.toThrow('LOOP_LEASE_LOST');
    await db.query("SELECT job_loop_run_action($1,$2,'cancel')", [owner, runId]);
    await expect(commit(db, runId, lease)).rejects.toThrow('LOOP_LEASE_LOST');
  });

  it('still denies changed source publication and foreign-owner reservations', async () => {
    const owner = await account(db), runId = await run(db, owner), lease = await claim(db, runId);
    await db.query('SELECT job_loop_write_record($1,1,$2,true)', [owner, record]);
    await expect(commit(db, runId, lease)).rejects.toThrow(/LOOP_(STALE_INPUT|LEASE_LOST)/);

    const other = await account(db), otherRun = await run(db, other), otherLease = await claim(db, otherRun);
    await expect(db.query("SELECT job_loop_reserve($1,$2,$3,'foreign','fixture',1)", [owner, otherRun, otherLease]))
      .rejects.toThrow('LOOP_LEASE_LOST');
  });

  it('keeps claim execution service-only after replacing the function', async () => {
    const owner = await account(db), runId = await run(db, owner);
    for (const role of ['anon', 'authenticated']) {
      await expect(db.transaction(async tx => {
        await tx.exec(`SET LOCAL ROLE ${role}`);
        await tx.query('SELECT job_loop_claim_run($1,$2)', [runId, randomUUID()]);
      })).rejects.toThrow(/permission denied/i);
    }
    const result = await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE service_role');
      return tx.query<{ run: { id: string } }>('SELECT job_loop_claim_run($1,$2) AS run', [runId, randomUUID()]);
    });
    expect(result.rows[0].run.id).toBe(runId);
  });
});
