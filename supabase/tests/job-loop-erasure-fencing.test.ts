// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// All accounts, documents and database/storage instances in this file are local
// fixtures. No Supabase endpoint, model API or real candidate data is used.
let erasureMigration: string;
const hash = 'a'.repeat(64);
const record = { profile: { name: 'Erasure regression fixture' }, claims: [], opportunities: [], inbox: [] };
const settings = {
  cadence: 'daily', timezone: 'Asia/Dubai', localTime: '08:30', weeklyDay: null,
  provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false,
};
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
  `);
  for (const migration of [
    '20261011010000_job_loop_cloud.sql',
    '20261011020000_job_loop_revoke_all.sql',
    '20261011030000_job_loop_recurring.sql',
    '20261013190000_job_loop_provider_lease.sql',
  ]) await instance.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
  return instance;
}

async function account(instance: PGlite): Promise<string> {
  const user = randomUUID();
  await instance.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
  await instance.query('SELECT job_loop_write_record($1,0,$2,true)', [user, record]);
  return user;
}

async function recreateRecord(instance: PGlite, user: string): Promise<void> {
  // Match the repository's fresh-record initialization and use its current
  // server version; a lifecycle fence must not recycle pre-erasure versions.
  await instance.query('INSERT INTO job_loop_records(user_id) VALUES($1) ON CONFLICT DO NOTHING', [user]);
  await instance.query('SELECT job_loop_write_record($1,(SELECT version FROM job_loop_records WHERE user_id=$1),$2,true)', [user, record]);
}

async function start(instance: PGlite, user: string): Promise<string> {
  const result = await instance.query<{ run: { id: string } }>(`
    SELECT job_loop_start_run($1,$2,$3,$3,
      (SELECT version FROM job_loop_records WHERE user_id=$1),
      'rules','grounded-rules-v1','{}') AS run
  `, [user, randomUUID(), hash]);
  return result.rows[0].run.id;
}

async function store(instance: PGlite, user: string): Promise<void> {
  await instance.query("INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',$1)",
    [`${user}/${randomUUID()}/${hash}/txt`]);
}

async function begin(instance: PGlite, user: string): Promise<{ generation: number }> {
  const result = await instance.query<{ erasure: { generation: number } }>(
    'SELECT job_loop_begin_erase($1) AS erasure', [user],
  );
  expect(Number.isSafeInteger(result.rows[0].erasure.generation)).toBe(true);
  return result.rows[0].erasure;
}

async function finish(instance: PGlite, user: string, generation: number): Promise<void> {
  await instance.query('SELECT job_loop_finish_erase($1,$2)', [user, generation]);
}

async function leaseRun(instance: PGlite, run: string): Promise<string> {
  const lease = randomUUID();
  await instance.query('SELECT job_loop_claim_run($1,$2)', [run, lease]);
  return lease;
}

async function authorizeArtifact(instance: PGlite, user: string, run: string, lease: string, packet = randomUUID()): Promise<string> {
  const result = await instance.query<{ path: string }>(
    "SELECT job_loop_authorize_artifact($1,$2,$3,$4,$5,'txt') AS path", [user, run, lease, packet, hash],
  );
  expect(result.rows[0].path).toBe(`${user}/${packet}/${hash}/txt`);
  return result.rows[0].path;
}

async function insertPath(instance: PGlite, path: string): Promise<void> {
  await instance.query("INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',$1)", [path]);
}

beforeAll(async () => {
  db = await fixture();
  const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('_job_loop_durable_erasure.sql'));
  expect(migrations).toHaveLength(1);
  erasureMigration = `supabase/migrations/${migrations[0]}`;
  await db.exec(await readFile(erasureMigration, 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
afterEach(async () => {
  await db?.exec('TRUNCATE auth.users CASCADE; TRUNCATE storage.objects; TRUNCATE job_loop_budget_months CASCADE;');
});

describe('JV-02 erasure fencing in real PostgreSQL', () => {
  // Pre-fence defect observation is archived under docs/audits/2026-10-14-navigation-save/;
  // active acceptance below asserts the corrected durable fencing behavior.


  it('refuses enrollment, new preparation, schedules and record changes while erasure is in progress', async () => {
    const user = await account(db);
    await start(db, user);
    await db.query('SELECT job_loop_begin_erase($1)', [user]);

    await expect(db.query('SELECT job_loop_enroll_pilot($1)', [user])).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await expect(start(db, user)).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await expect(db.query("SELECT job_loop_save_schedule($1,0,$2,now()+interval '1 day')", [user, settings])).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await expect(db.query('SELECT job_loop_write_record($1,(SELECT version FROM job_loop_records WHERE user_id=$1),$2,true)',
      [user, record])).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');

    expect((await db.query<{ active: boolean }>('SELECT active FROM job_loop_pilot_users WHERE user_id=$1', [user])).rows[0].active).toBe(false);
    expect((await db.query<{ status: string }>('SELECT status FROM job_loop_runs WHERE user_id=$1', [user])).rows.every(run => run.status === 'cancelled')).toBe(true);
  });

  it('fences an account even if it had not occupied a pilot seat when erasure began', async () => {
    const user = await account(db);
    await db.query('SELECT job_loop_begin_erase($1)', [user]);

    await expect(db.query('SELECT job_loop_enroll_pilot($1)', [user])).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await expect(start(db, user)).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await expect(store(db, user)).rejects.toThrow(/LOOP_(ERASURE_IN_PROGRESS|STORAGE_OWNER_INACTIVE|UPLOAD_)/);
    expect((await db.query('SELECT * FROM storage.objects')).rows).toHaveLength(0);
  });

  it('rejects late storage writes for the erasing owner while another owner remains usable', async () => {
    const user = await account(db), other = await account(db);
    await start(db, user);
    await start(db, other);
    await db.query('SELECT job_loop_begin_erase($1)', [user]);

    await expect(store(db, user)).rejects.toThrow(/LOOP_(ERASURE_IN_PROGRESS|STORAGE_OWNER_INACTIVE|UPLOAD_)/);
    await expect(db.query('SELECT job_loop_enroll_pilot($1)', [other])).resolves.toBeDefined();
    await expect(db.query('SELECT job_loop_write_record($1,(SELECT version FROM job_loop_records WHERE user_id=$1),$2,true)',
      [other, record])).resolves.toBeDefined();
    expect((await db.query('SELECT * FROM storage.objects')).rows).toHaveLength(0);
    expect((await db.query<{ active: boolean }>('SELECT active FROM job_loop_pilot_users WHERE user_id=$1', [other])).rows[0].active).toBe(true);
  });

  it('keeps repeated begin requests fenced, completes cleanup, and permits a deliberately fresh record afterwards', async () => {
    const user = await account(db);
    await start(db, user);
    const erasure = await begin(db, user);
    const repeated = await begin(db, user);
    expect(repeated.generation).toBe(erasure.generation);
    await expect(db.query('SELECT job_loop_enroll_pilot($1)', [user])).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await expect(db.query('SELECT job_loop_finish_erase($1)', [user])).rejects.toThrow('LOOP_ERASURE_GENERATION_REQUIRED');
    await finish(db, user, erasure.generation);

    expect((await db.query('SELECT * FROM job_loop_records WHERE user_id=$1', [user])).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM job_loop_runs WHERE user_id=$1', [user])).rows).toHaveLength(0);
    // Erasure is for the Job Loop data, not permanent deletion of sign-in.
    expect((await db.query('SELECT * FROM auth.users WHERE id=$1', [user])).rows).toHaveLength(1);
    await recreateRecord(db, user);
    await expect(start(db, user)).resolves.toEqual(expect.any(String));
  });

  it('returns bounded flat paths for only the erasing owner and refuses completion while any owned object remains', async () => {
    // Seed objects under the historical guard before applying the repair. This
    // represents existing documents, without bypassing the repaired upload guard.
    const instance = await fixture();
    try {
      const user = await account(instance), other = await account(instance);
      await start(instance, user);
      await start(instance, other);
      await instance.query(`
        INSERT INTO storage.objects(bucket_id,name)
        SELECT 'job-loop-artifacts',$1::text||'/packet/hash/artifact-'||lpad(number::text,3,'0')
        FROM generate_series(1,205) AS number
      `, [user]);
      await store(instance, other);
      await instance.exec(await readFile(erasureMigration, 'utf8'));
      const erasure = await begin(instance, user);
      const batches: string[][] = [];

      for (let index = 0; index < 2; index++) {
        const result = await instance.query<{ paths: string[] }>(
          'SELECT job_loop_erasure_batch($1,$2,200) AS paths', [user, erasure.generation],
        );
        const paths = result.rows[0].paths;
        expect(Array.isArray(paths)).toBe(true);
        expect(paths).toHaveLength(index === 0 ? 200 : 5);
        expect(paths.every(path => path.startsWith(`${user}/`))).toBe(true);
        batches.push(paths);
        await expect(finish(instance, user, erasure.generation)).rejects.toThrow('LOOP_ERASURE_RETRY');
        await instance.query("DELETE FROM storage.objects WHERE bucket_id='job-loop-artifacts' AND name=ANY($1::text[])", [paths]);
      }

      expect(new Set(batches.flat()).size).toBe(205);
      await expect(finish(instance, user, erasure.generation)).resolves.toBeUndefined();
      const remaining = (await instance.query<{ name: string }>('SELECT name FROM storage.objects')).rows;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name.startsWith(`${other}/`)).toBe(true);
    } finally { await instance.close(); }
  }, 30000);

  it('does not let a stale erasure generation finish a later cleanup', async () => {
    const user = await account(db);
    await start(db, user);
    const first = await begin(db, user);
    await finish(db, user, first.generation);
    await recreateRecord(db, user);
    await start(db, user);
    const next = await begin(db, user);

    expect(next.generation).not.toBe(first.generation);
    await expect(finish(db, user, first.generation)).rejects.toThrow(/LOOP_ERASURE_/);
    await expect(db.query('SELECT job_loop_enroll_pilot($1)', [user])).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await expect(finish(db, user, next.generation)).resolves.toBeUndefined();
  });

  it('does not revive an old upload grant after erasure completes and the owner starts a fresh record', async () => {
    const user = await account(db), oldRun = await start(db, user);
    const oldLease = await leaseRun(db, oldRun);
    const oldPath = await authorizeArtifact(db, user, oldRun, oldLease);
    const erasure = await begin(db, user);

    await expect(insertPath(db, oldPath)).rejects.toThrow(/LOOP_(ERASURE_IN_PROGRESS|STORAGE_OWNER_INACTIVE|UPLOAD_)/);
    await finish(db, user, erasure.generation);
    await recreateRecord(db, user);
    const freshRun = await start(db, user), freshLease = await leaseRun(db, freshRun);

    await expect(insertPath(db, oldPath)).rejects.toThrow(/LOOP_(STORAGE_|UPLOAD_|ARTIFACT_|LEASE_)/);
    await expect(authorizeArtifact(db, user, oldRun, oldLease)).rejects.toThrow(/LOOP_/);
    const freshPath = await authorizeArtifact(db, user, freshRun, freshLease);
    await expect(insertPath(db, freshPath)).resolves.toBeUndefined();
    expect((await db.query<{ name: string }>('SELECT name FROM storage.objects')).rows).toEqual([{ name: freshPath }]);
  });

  it('refuses an incorrect worker lease or owner when granting storage authority', async () => {
    const user = await account(db), other = await account(db), run = await start(db, user);
    const lease = await leaseRun(db, run);

    await expect(authorizeArtifact(db, user, run, randomUUID())).rejects.toThrow(/LOOP_/);
    await expect(authorizeArtifact(db, other, run, lease)).rejects.toThrow(/LOOP_/);
    await expect(authorizeArtifact(db, user, run, lease)).resolves.toEqual(expect.any(String));
  });

  it('fences protected metadata updates and renames while leaving unrelated storage updates usable', async () => {
    const user = await account(db), run = await start(db, user), lease = await leaseRun(db, run);
    const path = await authorizeArtifact(db, user, run, lease);
    const alternate = await authorizeArtifact(db, user, run, lease);
    await insertPath(db, path);
    await expect(db.query("UPDATE storage.objects SET name=$2 WHERE bucket_id='job-loop-artifacts' AND name=$1", [path, alternate]))
      .rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('unrelated-bucket','unrelated/original')");
    await expect(db.query("UPDATE storage.objects SET name='unrelated/renamed' WHERE bucket_id='unrelated-bucket'"))
      .resolves.toBeDefined();
    await begin(db, user);

    await expect(db.query("UPDATE storage.objects SET id=gen_random_uuid() WHERE bucket_id='job-loop-artifacts' AND name=$1", [path]))
      .rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await expect(db.query("UPDATE storage.objects SET bucket_id='job-loop-artifacts',name=$1 WHERE bucket_id='unrelated-bucket'", [alternate]))
      .rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    expect((await db.query<{ name: string }>("SELECT name FROM storage.objects WHERE bucket_id='unrelated-bucket'")).rows)
      .toEqual([{ name: 'unrelated/renamed' }]);
    expect((await db.query<{ name: string }>("SELECT name FROM storage.objects WHERE bucket_id='job-loop-artifacts'")).rows)
      .toEqual([{ name: path }]);
  });

  it('does not reuse a pre-erasure record version that could admit an old delayed write after fresh setup', async () => {
    const user = await account(db);
    const previousVersion = Number((await db.query<{ version: number }>('SELECT version FROM job_loop_records WHERE user_id=$1', [user])).rows[0].version);
    const erasure = await begin(db, user);
    await finish(db, user, erasure.generation);
    await recreateRecord(db, user);

    const currentVersion = Number((await db.query<{ version: number }>('SELECT version FROM job_loop_records WHERE user_id=$1', [user])).rows[0].version);
    expect(currentVersion).toBeGreaterThan(previousVersion);
    await expect(db.query('SELECT job_loop_write_record($1,$2,$3,true)',
      [user, previousVersion, { ...record, profile: { name: 'STALE_PRE_ERASURE_REQUEST' } }])).rejects.toThrow('LOOP_VERSION_CONFLICT');
    expect((await db.query<{ data: typeof record }>('SELECT data FROM job_loop_records WHERE user_id=$1', [user])).rows[0].data).toEqual(record);
  });

  it('keeps generation-bound erasure and artifact authorization unavailable to browser roles', async () => {
    const user = await account(db), run = await start(db, user), lease = await leaseRun(db, run);
    const erasure = await begin(db, user);
    const statements: [string, unknown[]][] = [
      ['SELECT job_loop_erasure_batch($1,$2,200)', [user, erasure.generation]],
      ['SELECT job_loop_finish_erase($1,$2)', [user, erasure.generation]],
      ["SELECT job_loop_authorize_artifact($1,$2,$3,$4,$5,'txt')", [user, run, lease, randomUUID(), hash]],
    ];
    for (const [statement, args] of statements) {
      await db.transaction(async transaction => {
        await transaction.exec('SET LOCAL ROLE authenticated');
        await expect(transaction.query(statement, args)).rejects.toThrow(/permission denied/);
      });
    }
  });
});
