// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Isolated synthetic SQL/storage metadata only. These tests never connect to a
// hosted database, remove candidate bytes or call any external provider.
let db: PGlite;
const hash = 'a'.repeat(64);
const career = { profile: { name: 'GC fixture' }, claims: [], opportunities: [], inbox: [] };
type Owner = { user: string; generation: number };
type Run = Owner & { run: string; lease: string };
type Claim = { user_id: string; path: string; generation: number; token: string };

async function account(): Promise<Owner> {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
  const opened = (await db.query<{ record: { version: number; lifecycle_generation: number } }>(
    'SELECT job_loop_open_record($1) record', [user],
  )).rows[0].record;
  await db.query('SELECT job_loop_write_record($1,$2,$3,true)', [user, opened.version, career]);
  return { user, generation: opened.lifecycle_generation };
}
async function start(owner: Owner): Promise<Run> {
  const run = (await db.query<{ run: { id: string } }>(`SELECT job_loop_start_run_bound($1,$2,$3,$4,$4,
    (SELECT version FROM job_loop_records WHERE user_id=$1),'rules','grounded-rules-v1','{}') run`,
  [owner.user, owner.generation, randomUUID(), hash])).rows[0].run.id;
  const lease = randomUUID();
  await db.query('SELECT job_loop_claim_run($1,$2)', [run, lease]);
  return { ...owner, run, lease };
}
async function artifact(run: Run, key = 'txt', packet = randomUUID(), store = true): Promise<string> {
  const path = (await db.query<{ path: string }>('SELECT job_loop_authorize_artifact($1,$2,$3,$4,$5,$6) path',
    [run.user, run.run, run.lease, packet, hash, key])).rows[0].path;
  if (store) await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',$1)", [path]);
  return path;
}
async function terminal(run: Run, status = 'cancelled', age = '25 hours', liveLease = false) {
  await db.query(`UPDATE job_loop_runs SET status=$2,finished_at=clock_timestamp()-$3::interval,
    lease_until=CASE WHEN $4 THEN clock_timestamp()+interval '5 minutes' ELSE NULL END WHERE id=$1`,
  [run.run, status, age, liveLease]);
}
async function enable(owners: Owner[], enabled = true) {
  await db.query('UPDATE job_loop_gc_config SET enabled=$1,allowed_owner_ids=$2,last_owner_id=NULL WHERE singleton',
    [enabled, owners.map(owner => owner.user)]);
}
async function claim(token = randomUUID(), limit = 200): Promise<Claim[]> {
  return (await db.query<{ claims: Claim[] }>('SELECT job_loop_gc_claim($1,$2) claims', [token, limit])).rows[0].claims;
}
async function finish(batch: Claim[], token = batch[0]?.token): Promise<number> {
  return (await db.query<{ count: number }>('SELECT job_loop_gc_finish($1,$2,$3,$4) count',
    [batch[0]?.user_id, batch[0]?.generation, token, batch.map(item => item.path)])).rows[0].count;
}
async function remove(paths: string[]) {
  // Metadata removal represents a mocked successful Storage API response. The
  // production helper must use Storage HTTP, never this SQL operation.
  await db.query("DELETE FROM storage.objects WHERE bucket_id='job-loop-artifacts' AND name=ANY($1)", [paths]);
}
async function packet(run: Run, path: string, status = 'held', key = 'txt') {
  const packetId = path.split('/')[1];
  await db.query(`INSERT INTO job_loop_packets(id,user_id,run_id,opportunity_id,input_version,input_hash,data,status)
    VALUES($1,$2,$3,$4,(SELECT input_version FROM job_loop_records WHERE user_id=$2),$5,$6,$7)`,
  [packetId, run.user, run.run, randomUUID(), hash, { artifacts: { [key]: { path } } }, status]);
}
async function expireClaims() {
  await db.exec(`UPDATE job_loop_artifact_grants SET gc_expires_at=clock_timestamp()-interval '1 second' WHERE gc_state='claimed';
    UPDATE job_loop_artifact_tombstones SET expires_at=clock_timestamp()-interval '1 second' WHERE state='claimed'`);
}
async function erase(run: Owner): Promise<number> {
  const generation = (await db.query<{ erasure: { generation: number } }>(
    'SELECT job_loop_begin_erase($1,$2) erasure', [run.user, run.generation],
  )).rows[0].erasure.generation;
  await db.query("DELETE FROM storage.objects WHERE bucket_id='job-loop-artifacts' AND name LIKE $1", [`${run.user}/%`]);
  await db.query('SELECT job_loop_finish_erase($1,$2)', [run.user, generation]);
  return generation;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT ALL ON storage.objects TO anon,authenticated;`);
  for (const migration of ['20261011010000_job_loop_cloud.sql', '20261011020000_job_loop_revoke_all.sql',
    '20261011030000_job_loop_recurring.sql', '20261013190000_job_loop_provider_lease.sql']) {
    await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
  }
  for (const suffix of ['_job_loop_durable_erasure.sql', '_job_loop_request_generation.sql', '_job_loop_terminal_artifact_gc.sql']) {
    const migrations = (await readdir('supabase/migrations')).filter(file => file.endsWith(suffix));
    expect(migrations).toHaveLength(1);
    await db.exec(await readFile(`supabase/migrations/${migrations[0]}`, 'utf8'));
  }
}, 30000);
afterEach(async () => {
  await db.exec(`TRUNCATE auth.users CASCADE; TRUNCATE storage.objects; TRUNCATE job_loop_budget_months CASCADE;
    UPDATE job_loop_gc_config SET enabled=false,allowed_owner_ids='{}',last_owner_id=NULL`);
});
afterAll(async () => { await db?.close(); });

describe('terminal artifact collection is bounded and permanently fences claimed paths', () => {
  it('is disabled by default, requires a nonempty explicit allowlist, and cannot discover an unrelated owner', async () => {
    const owner = await account(), unrelated = await account();
    const a = await start(owner), b = await start(unrelated);
    const path = await artifact(a); await artifact(b);
    await terminal(a); await terminal(b);
    expect(await claim()).toEqual([]);
    await enable([], true); expect(await claim()).toEqual([]);
    await enable([owner], false); expect(await claim()).toEqual([]);
    await enable([owner]);
    expect((await claim()).map(item => item.path)).toEqual([path]);
    expect((await db.query('SELECT * FROM job_loop_artifact_tombstones WHERE user_id=$1', [unrelated.user])).rows).toHaveLength(0);
  });

  it('claims generation zero, checks actual fixed-bucket absence, and finishes idempotently after deletion', async () => {
    const owner = await account(), run = await start(owner), path = await artifact(run);
    expect(owner.generation).toBe(0);
    await terminal(run, 'completed'); await enable([owner]);
    const batch = await claim();
    expect(batch).toEqual([{ user_id: owner.user, path, generation: 0, token: expect.any(String) }]);
    await expect(finish(batch)).rejects.toThrow('LOOP_GC_RETRY');
    await remove([path]);
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('other-bucket',$1)", [path]);
    expect(await finish(batch)).toBe(1);
    expect(await finish(batch)).toBe(1);
    expect((await db.query('SELECT gc_state FROM job_loop_artifact_grants')).rows).toEqual([{ gc_state: 'collected' }]);
    expect(await claim()).toEqual([]);
  });

  it('preserves all packet statuses and formats, including unknown manifest keys, before applying the limit', async () => {
    const owner = await account(), run = await start(owner);
    for (const [index, status] of ['held', 'revoked', 'review_required', 'approved'].entries()) {
      const key = ['pdf', 'docx', 'report', 'letter'][index];
      const path = await artifact(run, key);
      await packet(run, path, status, index === 3 ? 'future-format' : key);
    }
    const orphan = await artifact(run);
    await terminal(run); await enable([owner]);
    expect((await claim(randomUUID(), 1)).map(item => item.path)).toEqual([orphan]);
    expect((await db.query('SELECT * FROM job_loop_packets')).rows).toHaveLength(4);
  });

  it('preserves a referenced format but collects an orphan format from the same packet path family', async () => {
    const owner = await account(), run = await start(owner), packetId = randomUUID();
    const pdf = await artifact(run, 'pdf', packetId), letter = await artifact(run, 'letter', packetId);
    await packet(run, pdf, 'revoked', 'pdf');
    await terminal(run); await enable([owner]);
    expect((await claim()).map(item => item.path)).toEqual([letter]);
    // Revoking/erasing an untouched historical manifest must still work. Its
    // exact existing reference remains protected even if legacy metadata is odd.
    await db.exec('ALTER TABLE job_loop_packets DISABLE TRIGGER job_loop_packet_gc_guard');
    await db.query('UPDATE job_loop_packets SET data=$2 WHERE id=$1', [packetId, { artifacts: { legacy: { path: pdf, note: 'old shape' } } }]);
    await db.exec('ALTER TABLE job_loop_packets ENABLE TRIGGER job_loop_packet_gc_guard');
    await expect(db.query("UPDATE job_loop_packets SET status='held' WHERE id=$1", [packetId])).resolves.toBeDefined();
    await expect(db.query('SELECT job_loop_begin_erase($1,$2)', [owner.user, owner.generation])).resolves.toBeDefined();
  });

  it('skips resumable states, recent terminal runs, live terminal leases and untracked legacy objects', async () => {
    const owners: Owner[] = [];
    for (const status of ['queued', 'running', 'partial', 'blocked', 'failed', 'cancelled', 'completed']) {
      const owner = await account(), run = await start(owner); owners.push(owner); await artifact(run);
      await terminal(run, status, status === 'cancelled' ? '23 hours' : '25 hours', status === 'completed');
    }
    const legacyOwner = await account(); owners.push(legacyOwner);
    // Grant-free legacy metadata is deliberately outside this collector.
    await db.exec('ALTER TABLE storage.objects DISABLE TRIGGER job_loop_storage_write_guard');
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',$1)",
      [`${legacyOwner.user}/${randomUUID()}/${hash}/txt`]);
    await db.exec('ALTER TABLE storage.objects ENABLE TRIGGER job_loop_storage_write_guard');
    await enable(owners);
    expect(await claim()).toEqual([]);
    expect((await db.query('SELECT * FROM job_loop_artifact_tombstones')).rows).toHaveLength(0);
  });

  it('skips erasing, missing and stale-generation lifecycle rows without initializing an owner', async () => {
    const owner = await account(), run = await start(owner); await artifact(run); await terminal(run);
    await db.query('UPDATE job_loop_lifecycle SET generation=generation+1 WHERE user_id=$1', [owner.user]);
    const missing = { user: randomUUID(), generation: 0 };
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [missing.user]);
    await enable([owner, missing]); expect(await claim()).toEqual([]);
    expect((await db.query('SELECT * FROM job_loop_lifecycle WHERE user_id=$1', [missing.user])).rows).toHaveLength(0);
    await db.query("UPDATE job_loop_lifecycle SET generation=0,state='erasing' WHERE user_id=$1", [owner.user]);
    expect(await claim()).toEqual([]);
  });

  it('denies late authorization, upload/update and packet insertion or mutation once claimed', async () => {
    const owner = await account(), run = await start(owner), packetId = randomUUID();
    const path = await artifact(run, 'txt', packetId);
    await db.query(`INSERT INTO job_loop_packets(id,user_id,run_id,opportunity_id,input_version,input_hash,data,status)
      VALUES($1,$2,$3,$4,(SELECT input_version FROM job_loop_records WHERE user_id=$2),$5,'{}','held')`,
    [packetId, owner.user, run.run, randomUUID(), hash]);
    await terminal(run); await enable([owner]); const batch = await claim(); expect(batch).toHaveLength(1);
    await expect(db.query("SELECT job_loop_authorize_artifact($1,$2,$3,$4,$5,'txt')", [owner.user, run.run, run.lease, packetId, hash]))
      .rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await expect(db.query("UPDATE storage.objects SET name=name WHERE name=$1", [path])).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await remove([path]);
    await expect(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',$1)", [path]))
      .rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await expect(db.query('UPDATE job_loop_packets SET data=$2 WHERE id=$1', [packetId, { artifacts: { txt: { path } } }]))
      .rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await db.query('DELETE FROM job_loop_packets WHERE id=$1', [packetId]);
    await expect(packet(run, path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
  });

  it('never reopens an expired claim and rotates ownership while rejecting old finish tokens', async () => {
    const owner = await account(), run = await start(owner), path = await artifact(run);
    await terminal(run); await enable([owner]);
    const original = await claim(); await expireClaims();
    await expect(finish(original)).rejects.toThrow('LOOP_GC_STALE');
    expect(await claim(original[0].token)).toEqual([]);
    const replacement = await claim(); expect(replacement).toHaveLength(1);
    expect(replacement[0].token).not.toBe(original[0].token);
    await remove([path]);
    await expect(finish(original)).rejects.toThrow('LOOP_GC_STALE');
    expect(await finish(replacement)).toBe(1);
  });

  it('does not partially finish a batch after uncertain removal and later confirms the actual remaining objects', async () => {
    const owner = await account(), run = await start(owner), a = await artifact(run), b = await artifact(run);
    await terminal(run); await enable([owner]); const batch = await claim();
    await remove([a]);
    await expect(finish(batch)).rejects.toThrow('LOOP_GC_RETRY');
    expect((await db.query("SELECT count(*)::int count FROM job_loop_artifact_tombstones WHERE state='collected'")).rows[0]).toEqual({ count: 0 });
    await remove([b]); expect(await finish(batch)).toBe(2);
  });

  it('retains the closed path through full erasure and fresh enrollment, making delayed deletion harmless', async () => {
    const owner = await account(), run = await start(owner), packetId = randomUUID(), path = await artifact(run, 'txt', packetId);
    await terminal(run); await enable([owner]); const batch = await claim();
    await erase(owner);
    expect((await db.query('SELECT * FROM job_loop_artifact_grants')).rows).toHaveLength(0);
    expect((await db.query('SELECT path FROM job_loop_artifact_tombstones')).rows).toEqual([{ path }]);
    await expect(finish(batch)).rejects.toThrow('LOOP_GC_STALE');
    const fresh = (await db.query<{ record: { version: number; lifecycle_generation: number } }>('SELECT job_loop_open_record($1) record', [owner.user])).rows[0].record;
    await db.query('SELECT job_loop_write_record($1,$2,$3,true)', [owner.user, fresh.version, career]);
    const next = await start({ user: owner.user, generation: fresh.lifecycle_generation });
    await expect(db.query("SELECT job_loop_authorize_artifact($1,$2,$3,$4,$5,'txt')", [owner.user, next.run, next.lease, packetId, hash]))
      .rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await expect(packet(next, path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await remove([path]); // a delayed old collector can remove no new object
    const safePath = await artifact(next);
    expect(safePath).not.toBe(path);
    await expect(finish(batch)).rejects.toThrow('LOOP_GC_STALE');
    expect((await db.query('SELECT name FROM storage.objects')).rows).toEqual([{ name: safePath }]);
  });

  it('validates the entire finish envelope and rejects foreign, duplicate, malformed and over-limit paths', async () => {
    const owner = await account(), run = await start(owner), path = await artifact(run);
    await terminal(run); await enable([owner]); const batch = await claim(); await remove([path]);
    const finishRaw = (paths: unknown, user = owner.user, generation = owner.generation, token = batch[0].token) =>
      db.query('SELECT job_loop_gc_finish($1,$2,$3,$4)', [user, generation, token, paths]);
    for (const paths of [[], [path, path], [null], ['../other'], Array(201).fill(path)]) {
      await expect(finishRaw(paths)).rejects.toThrow('LOOP_GC_INVALID');
    }
    await expect(finishRaw([path], randomUUID())).rejects.toThrow('LOOP_GC_STALE');
    await expect(finishRaw([path], owner.user, owner.generation + 1)).rejects.toThrow('LOOP_GC_STALE');
    await expect(finishRaw([path], owner.user, owner.generation, randomUUID())).rejects.toThrow('LOOP_GC_STALE');
    expect(await finish(batch)).toBe(1);
  });

  it('rejects malformed claim bounds without issuing a claim or initializing lifecycle metadata', async () => {
    for (const [token, limit] of [[null, 200], [randomUUID(), 0], [randomUUID(), 201], [randomUUID(), null]]) {
      await expect(db.query('SELECT job_loop_gc_claim($1,$2)', [token, limit])).rejects.toThrow('LOOP_GC_INVALID');
    }
    expect((await db.query('SELECT * FROM job_loop_artifact_tombstones')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM job_loop_lifecycle')).rows).toHaveLength(0);
  });

  it('bounds 10,005 orphan candidates to 200 per claim and rotates fairly to another eligible owner', async () => {
    const a = await account(), b = await account(), first = await start(a), second = await start(b);
    await db.query(`INSERT INTO job_loop_artifact_grants(user_id,path,run_id,lease_token,generation,expires_at)
      SELECT $1::uuid,$1::uuid::text||'/'||gen_random_uuid()::text||'/'||$5||'/txt',$2,$3,$4,clock_timestamp()+interval '1 minute'
      FROM generate_series(1,10005)`, [a.user, first.run, first.lease, a.generation, hash]);
    const secondPath = await artifact(second);
    await terminal(first); await terminal(second); await enable([a, b]);
    // Force A first so the next call proves that a long queue does not starve B.
    await db.query('UPDATE job_loop_gc_config SET last_owner_id=$1', [a.user < b.user ? b.user : null]);
    const one = await claim();
    if (one[0].user_id === b.user) {
      expect(one).toHaveLength(1); expect(one[0].path).toBe(secondPath);
      const two = await claim(); expect(two).toHaveLength(200); expect(two[0].user_id).toBe(a.user);
    } else {
      expect(one).toHaveLength(200); expect(one[0].user_id).toBe(a.user);
      const two = await claim(); expect(two).toHaveLength(1); expect(two[0].path).toBe(secondPath);
    }
    const next = await claim(); expect(next).toHaveLength(200);
    expect((await db.query("SELECT count(*)::int count FROM job_loop_artifact_grants WHERE gc_state='available'")).rows[0].count).toBe(9605);
  }, 30000);

  it('keeps RPCs service-only, helpers private, configuration immutable to service callers and grants writable only through RPCs', async () => {
    const functions = (await db.query<{ proname: string; prosecdef: boolean; proconfig: string[]; browser: boolean; service: boolean }>(`
      SELECT proname,prosecdef,proconfig,
        has_function_privilege('anon',p.oid,'execute') OR has_function_privilege('authenticated',p.oid,'execute') browser,
        has_function_privilege('service_role',p.oid,'execute') service
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND proname IN('job_loop_gc_claim','job_loop_gc_finish','job_loop_gc_canonical_path','job_loop_gc_referenced',
          'job_loop_packet_gc_guard','job_loop_storage_write_guard','job_loop_authorize_artifact_pre_gc')`)).rows;
    expect(functions).toHaveLength(7);
    for (const fn of functions) {
      expect(fn.prosecdef).toBe(true); expect(fn.proconfig).toContain('search_path=""'); expect(fn.browser).toBe(false);
      expect(fn.service).toBe(['job_loop_gc_claim', 'job_loop_gc_finish'].includes(fn.proname));
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const privileges = (await db.query<{ config: boolean; tombstone: boolean; grant_write: boolean }>(`SELECT
        has_table_privilege($1,'job_loop_gc_config','UPDATE') config,
        has_table_privilege($1,'job_loop_artifact_tombstones','INSERT,UPDATE,DELETE') tombstone,
        has_table_privilege($1,'job_loop_artifact_grants','INSERT,UPDATE,DELETE') grant_write`, [role])).rows[0];
      expect(privileges).toEqual({ config: false, tombstone: false, grant_write: false });
    }
    await db.exec('SET ROLE authenticated');
    await expect(claim()).rejects.toThrow('permission denied');
    await expect(db.query('SELECT * FROM job_loop_artifact_tombstones')).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE service_role');
    expect(await claim()).toEqual([]);
    await db.exec('RESET ROLE');
  });
});
