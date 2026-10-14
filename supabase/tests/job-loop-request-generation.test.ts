// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Isolated SQL only. Every identity, token and external reference is a fixture;
// no Supabase endpoint, Google request, model call or real account is used.
let db: PGlite;
let requestMigration: string;
const hash = 'a'.repeat(64);
const verifier = 'fixture-verifier-cipher-'.repeat(3);
const cipherA = 'fixture-token-cipher-a-'.repeat(3);
const cipherB = 'fixture-token-cipher-b-'.repeat(3);
const career = { profile: { name: 'Generation fixture' }, claims: [], opportunities: [], inbox: [] };
const schedule = { cadence: 'daily', timezone: 'Asia/Dubai', localTime: '08:30', weeklyDay: null,
  provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false };
type RecordSnapshot = { version: number; input_version: number; lifecycle_generation: number };

async function base(): Promise<PGlite> {
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
  for (const file of ['20261011010000_job_loop_cloud.sql', '20261011020000_job_loop_revoke_all.sql',
    '20261011030000_job_loop_recurring.sql', '20261013190000_job_loop_provider_lease.sql']) {
    await instance.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  const durable = (await readdir('supabase/migrations')).filter(file => file.endsWith('_job_loop_durable_erasure.sql'));
  expect(durable).toHaveLength(1);
  await instance.exec(await readFile(`supabase/migrations/${durable[0]}`, 'utf8'));
  return instance;
}

async function open(user: string): Promise<RecordSnapshot> {
  return (await db.query<{ snapshot: RecordSnapshot }>('SELECT job_loop_open_record($1) snapshot', [user])).rows[0].snapshot;
}
async function account(): Promise<{ user: string; generation: number }> {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
  const initial = await open(user);
  await db.query('SELECT job_loop_write_record($1,$2,$3,true)', [user, initial.version, career]);
  return { user, generation: initial.lifecycle_generation };
}
async function begin(user: string, expected: number): Promise<number> {
  return (await db.query<{ erasure: { generation: number } }>(
    'SELECT job_loop_begin_erase($1,$2) erasure', [user, expected],
  )).rows[0].erasure.generation;
}
async function eraseAndReopen(user: string, generation: number): Promise<number> {
  const erasure = await begin(user, generation);
  await db.query('SELECT job_loop_finish_erase($1,$2)', [user, erasure]);
  const fresh = await open(user);
  await db.query('SELECT job_loop_write_record($1,$2,$3,true)', [user, fresh.version, career]);
  expect(fresh.lifecycle_generation).toBeGreaterThan(erasure);
  return fresh.lifecycle_generation;
}
async function saveSchedule(user: string, generation: number, expected = 0) {
  return db.query("SELECT job_loop_save_schedule_bound($1,$2,$3,$4,now()+interval '1 day')", [user, generation, expected, schedule]);
}
async function oauth(user: string, generation: number, stateHash = randomUUID().replace(/-/g, '').repeat(2)) {
  await db.query("SELECT job_loop_create_oauth_state($1,$2,$3,false,$4,now()+interval '9 minutes')", [user, generation, stateHash, verifier]);
  return stateHash;
}
async function consume(stateHash: string) {
  return (await db.query<{ state: { user_id: string; lifecycle_generation: number } }>(
    'SELECT job_loop_consume_oauth_state($1) state', [stateHash],
  )).rows[0].state;
}
async function connect(user: string, generation: number, stateHash?: string) {
  const created = await oauth(user, generation, stateHash);
  await consume(created);
  await db.query('SELECT job_loop_activate_gmail_bound($1,$2,$3,$4,$5,false)',
    [user, generation, created, cipherA, 'mailbox@example.test']);
  return created;
}
async function run(user: string) {
  return (await db.query<{ run: { id: string } }>(`SELECT job_loop_start_run($1,$2,$3,$3,
    (SELECT version FROM job_loop_records WHERE user_id=$1),'rules','grounded-rules-v1','{}') run`,
  [user, randomUUID(), hash])).rows[0].run.id;
}
async function approvedPacket(user: string) {
  const runId = await run(user), packet = randomUUID();
  await db.query(`INSERT INTO job_loop_packets(id,user_id,run_id,opportunity_id,input_version,input_hash,data,status)
    VALUES($1,$2,$3,$4,(SELECT input_version FROM job_loop_records WHERE user_id=$2),$5,'{}','approved')`,
  [packet, user, runId, randomUUID(), hash]);
  return packet;
}

beforeAll(async () => {
  db = await base();
  const files = (await readdir('supabase/migrations')).filter(file => file.endsWith('_job_loop_request_generation.sql'));
  expect(files).toHaveLength(1);
  requestMigration = `supabase/migrations/${files[0]}`;
  await db.exec(await readFile(requestMigration, 'utf8'));
}, 30000);
afterEach(async () => { await db.exec('TRUNCATE auth.users CASCADE; TRUNCATE storage.objects; TRUNCATE job_loop_budget_months CASCADE'); });
afterAll(async () => { await db?.close(); });

describe('schedule and mailbox intent remains bound to the displayed lifecycle', () => {
  it('rejects an old zero-version schedule save after fresh enrollment while allowing a fresh request', async () => {
    const { user, generation } = await account();
    const fresh = await eraseAndReopen(user, generation);
    await expect(saveSchedule(user, generation, 0)).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await db.query('SELECT * FROM job_loop_schedules')).rows).toHaveLength(0);
    await expect(saveSchedule(user, fresh, 0)).resolves.toBeDefined();
    expect((await db.query<{ status: string }>('SELECT status FROM job_loop_schedules')).rows).toEqual([{ status: 'active' }]);
  });

  it('rejects stale pause/cancel even when the new schedule reuses version one', async () => {
    const { user, generation } = await account();
    await saveSchedule(user, generation);
    const fresh = await eraseAndReopen(user, generation);
    await saveSchedule(user, fresh);
    for (const action of ['paused', 'cancelled']) {
      await expect(db.query('SELECT job_loop_schedule_action_bound($1,$2,1,$3)', [user, generation, action]))
        .rejects.toThrow('LOOP_REQUEST_STALE');
    }
    expect((await db.query<{ version: number; status: string }>('SELECT version,status FROM job_loop_schedules')).rows[0].status).toBe('active');
    await expect(db.query("SELECT job_loop_schedule_action_bound($1,$2,1,'paused')", [user, fresh])).resolves.toBeDefined();
  });

  it('does not adopt fresh career facts for an old manual-run processing intent', async () => {
    const { user, generation } = await account(), fresh = await eraseAndReopen(user, generation);
    const current = await open(user);
    const startSql = "SELECT job_loop_start_run_bound($1,$2,$3,$4,$4,$5,'rules','grounded-rules-v1','{}')";
    await expect(db.query(startSql, [user, generation, randomUUID(), hash, current.version])).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await db.query('SELECT * FROM job_loop_runs')).rows).toHaveLength(0);
    await expect(db.query(startSql, [user, fresh, randomUUID(), hash, current.version])).resolves.toBeDefined();
    expect((await db.query('SELECT * FROM job_loop_runs')).rows).toHaveLength(1);
  });

  it('never restores an old support message and admits at most five current messages in the owner transaction', async () => {
    const { user, generation } = await account(), fresh = await eraseAndReopen(user, generation);
    const submit = (epoch: number, message: string) => db.query("SELECT job_loop_request_support($1,$2,'help',$3)", [user, epoch, message]);
    await expect(submit(generation, 'Private message from the prior enrollment')).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await db.query('SELECT * FROM job_loop_support_requests')).rows).toHaveLength(0);
    await expect(submit(fresh, '    ')).rejects.toThrow('LOOP_SUPPORT_INVALID');
    for (let i = 0; i < 5; i++) await submit(fresh, `Current support question ${i}`);
    await expect(submit(fresh, 'A sixth current support question')).rejects.toThrow('LOOP_SUPPORT_LIMIT');
    expect((await db.query('SELECT * FROM job_loop_support_requests')).rows).toHaveLength(5);
  });

  it('allows only the original or exact cleanup epoch to resume erasure and never erases a fresh enrollment', async () => {
    const { user, generation } = await account();
    const erasure = await begin(user, generation);
    expect(erasure).toBe(generation + 1);
    expect(await begin(user, generation)).toBe(erasure);
    expect(await begin(user, erasure)).toBe(erasure);
    const status = (await db.query<{ status: { state: string; generation: number } }>('SELECT job_loop_erasure_status($1) status', [user])).rows[0].status;
    expect(status).toEqual({ state: 'erasing', generation: erasure });
    await expect(open(user)).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await db.query('SELECT job_loop_finish_erase($1,$2)', [user, erasure]);
    expect(await begin(user, generation)).toBe(erasure);
    const fresh = await open(user);
    for (const old of [generation, erasure]) await expect(begin(user, old)).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await open(user)).lifecycle_generation).toBe(fresh.lifecycle_generation);
    expect(await begin(user, fresh.lifecycle_generation)).toBe(fresh.lifecycle_generation + 1);
  });

  it('does not reactivate an erased record when cleanup finishes between a preliminary check and the protected read', async () => {
    const { user, generation } = await account();
    await db.query('SELECT job_loop_assert_generation($1,$2)', [user, generation]);
    const erasure = await begin(user, generation);
    await db.query('SELECT job_loop_finish_erase($1,$2)', [user, erasure]);

    for (const staleOrErased of [generation, erasure]) await expect(db.query(
      'SELECT job_loop_read_record($1,$2)', [user, staleOrErased],
    )).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await db.query('SELECT * FROM job_loop_records WHERE user_id=$1', [user])).rows).toHaveLength(0);
    expect((await db.query<{ state: string; generation: number }>('SELECT state,generation FROM job_loop_lifecycle WHERE user_id=$1', [user])).rows)
      .toEqual([{ state: 'erased', generation: erasure }]);

    const opened = await open(user);
    expect(opened.lifecycle_generation).toBeGreaterThan(erasure);
    const read = (await db.query<{ snapshot: RecordSnapshot }>('SELECT job_loop_read_record($1,$2) snapshot', [user, opened.lifecycle_generation])).rows[0].snapshot;
    expect(read).toEqual(opened);
    expect((await open(user)).lifecycle_generation).toBe(opened.lifecycle_generation);
  });

  it('does not insert a delayed OAuth start into a fresh account generation', async () => {
    const { user, generation } = await account();
    const fresh = await eraseAndReopen(user, generation);
    await expect(oauth(user, generation)).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await db.query('SELECT * FROM job_loop_oauth_states')).rows).toHaveLength(0);
    const state = await oauth(user, fresh);
    expect((await consume(state)).lifecycle_generation).toBe(fresh);
  });

  it('rejects callback/activation intent after external exchange crosses erasure and preserves a new connection', async () => {
    const { user, generation } = await account();
    const state = await oauth(user, generation), admitted = await consume(state);
    expect(admitted.lifecycle_generation).toBe(generation);
    const fresh = await eraseAndReopen(user, generation);
    await expect(db.query('SELECT job_loop_assert_generation($1,$2)', [user, admitted.lifecycle_generation]))
      .rejects.toThrow('LOOP_REQUEST_STALE');
    const freshState = await connect(user, fresh);
    await expect(db.query('SELECT job_loop_read_oauth_state($1,$2,$3)', [user, generation, state])).rejects.toThrow('LOOP_REQUEST_STALE');
    await expect(db.query('SELECT job_loop_activate_gmail_bound($1,$2,$3,$4,$5,false)',
      [user, generation, freshState, cipherB, 'stale@example.test'])).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await db.query<{ email: string; lifecycle_generation: number }>('SELECT email,lifecycle_generation FROM job_loop_connections')).rows)
      .toEqual([{ email: 'mailbox@example.test', lifecycle_generation: fresh }]);
  });

  it('binds preview to both epoch and the consumed state without returning verifier ciphertext', async () => {
    const { user, generation } = await account(), state = await oauth(user, generation);
    await expect(db.query('SELECT job_loop_read_oauth_state($1,$2,$3)', [user, generation, state])).rejects.toThrow('LOOP_OAUTH_STATE');
    await consume(state);
    const preview = (await db.query<{ state: Record<string, unknown> }>('SELECT job_loop_read_oauth_state($1,$2,$3) state', [user, generation, state])).rows[0].state;
    expect(preview.lifecycle_generation).toBe(generation);
    expect(preview).not.toHaveProperty('verifier_ciphertext');
  });

  it('rejects old disconnect and refresh operations, and keeps compare-and-swap refresh within the current epoch', async () => {
    const { user, generation } = await account();
    await connect(user, generation);
    const fresh = await eraseAndReopen(user, generation);
    await connect(user, fresh);
    await expect(db.query('SELECT job_loop_disconnect_gmail($1,$2)', [user, generation])).rejects.toThrow('LOOP_REQUEST_STALE');
    await expect(db.query('SELECT job_loop_refresh_gmail($1,$2,$3,$4)', [user, generation, cipherA, cipherB])).rejects.toThrow('LOOP_REQUEST_STALE');
    const update = await db.query<{ ok: boolean }>('SELECT job_loop_refresh_gmail($1,$2,$3,$4) ok', [user, fresh, cipherA, cipherB]);
    expect(update.rows[0].ok).toBe(true);
    expect((await db.query<{ ok: boolean }>('SELECT job_loop_refresh_gmail($1,$2,$3,$4) ok', [user, fresh, cipherA, cipherB])).rows[0].ok).toBe(false);
    await expect(db.query('SELECT job_loop_read_gmail_connection($1,$2)', [user, generation])).rejects.toThrow('LOOP_REQUEST_STALE');
    const current = (await db.query<{ connection: { token_ciphertext: string } }>('SELECT job_loop_read_gmail_connection($1,$2) connection', [user, fresh])).rows[0].connection;
    expect(current.token_ciphertext).toBe(cipherB);
    await db.query('SELECT job_loop_disconnect_gmail($1,$2)', [user, fresh]);
    expect((await db.query('SELECT * FROM job_loop_connections')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM job_loop_oauth_states')).rows).toHaveLength(0);
  });

  it('does not let an old draft acknowledgement overwrite a fresh receipt using the same request ID', async () => {
    const { user, generation } = await account(), request = randomUUID(), oldPacket = await approvedPacket(user);
    await db.query('SELECT job_loop_claim_draft_bound($1,$2,$3,$4,$5)', [user, generation, oldPacket, request, hash]);
    const fresh = await eraseAndReopen(user, generation), newPacket = await approvedPacket(user), freshHash = 'b'.repeat(64);
    await db.query('SELECT job_loop_claim_draft_bound($1,$2,$3,$4,$5)', [user, fresh, newPacket, request, freshHash]);
    await expect(db.query("SELECT job_loop_finish_gmail_draft($1,$2,$3,$4,'created','old-draft')", [user, generation, request, hash]))
      .rejects.toThrow('LOOP_REQUEST_STALE');
    await db.query("SELECT job_loop_finish_gmail_draft($1,$2,$3,$4,'created','fresh-draft')", [user, fresh, request, freshHash]);
    await db.query("SELECT job_loop_finish_gmail_draft($1,$2,$3,$4,'created','fresh-draft')", [user, fresh, request, freshHash]);
    await expect(db.query("SELECT job_loop_finish_gmail_draft($1,$2,$3,$4,'uncertain',NULL)", [user, fresh, request, freshHash]))
      .rejects.toThrow('LOOP_DRAFT_UNCERTAIN');
    expect((await db.query<{ status: string; draft_id: string }>('SELECT status,draft_id FROM job_loop_gmail_drafts')).rows)
      .toEqual([{ status: 'created', draft_id: 'fresh-draft' }]);
  });

  it('returns the generation of the claimed worker lease and does not re-admit an erased run', async () => {
    const { user, generation } = await account(), oldRun = await run(user);
    const claimed = (await db.query<{ run: { lifecycle_generation: number } }>('SELECT job_loop_claim_run($1,$2) run', [oldRun, randomUUID()])).rows[0].run;
    expect(claimed.lifecycle_generation).toBe(generation);
    const fresh = await eraseAndReopen(user, generation);
    expect((await db.query<{ run: unknown }>('SELECT job_loop_claim_run($1,$2) run', [oldRun, randomUUID()])).rows[0].run).toBeNull();
    const newRun = await run(user);
    expect((await db.query<{ run: { lifecycle_generation: number } }>('SELECT job_loop_claim_run($1,$2) run', [newRun, randomUUID()])).rows[0].run.lifecycle_generation).toBe(fresh);
  });

  it('keeps the SQL scheduled-run admission usable after generationless manual-run access is revoked', async () => {
    const { user, generation } = await account();
    await saveSchedule(user, generation);
    await db.query("UPDATE job_loop_schedules SET next_run_at=now()-interval '1 minute' WHERE user_id=$1", [user]);
    const lease = randomUUID();
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE service_role');
      const claimed = (await tx.query<{ schedules: { user_id: string; lease_token: string }[] }>(
        'SELECT job_loop_claim_due($1,10) schedules', [lease],
      )).rows[0].schedules;
      expect(claimed).toHaveLength(1);
      const admitted = (await tx.query<{ run: { id: string } }>(`SELECT job_loop_start_scheduled_run($1,$2,$3,$4,$4,
        (SELECT version FROM job_loop_records WHERE user_id=$1),'rules','grounded-rules-v1','{"model":false,"inbox":false}') run`,
      [user, lease, randomUUID(), hash])).rows[0].run;
      expect(admitted.id).toEqual(expect.any(String));
    });
    expect((await db.query('SELECT * FROM job_loop_runs')).rows).toHaveLength(1);
  });

  it('denies generationless RPC and direct mailbox writes to the service role while allowing the bound RPC', async () => {
    const { user, generation } = await account();
    const denied: [string, unknown[]][] = [
      ["SELECT job_loop_save_schedule($1,0,$2,now()+interval '1 day')", [user, schedule]],
      ["SELECT job_loop_schedule_action($1,0,'cancelled')", [user]],
      ['SELECT job_loop_begin_erase($1)', [user]],
      ["SELECT job_loop_start_run($1,$2,$3,$3,1,'rules','grounded-rules-v1','{}')", [user, randomUUID(), hash]],
      ["SELECT job_loop_start_run_core($1,$2,$3,$3,1,'rules','grounded-rules-v1','{}')", [user, randomUUID(), hash]],
      ['SELECT job_loop_enroll_pilot($1)', [user]],
      ['SELECT job_loop_activate_gmail($1,$2,$3,$4,false)', [user, hash, cipherA, 'fixture@example.test']],
      ["INSERT INTO job_loop_oauth_states(state_hash,user_id,allow_drafts,verifier_ciphertext,expires_at) VALUES($1,$2,false,$3,now()+interval '1 minute')", [hash, user, verifier]],
      ["DELETE FROM job_loop_connections WHERE user_id=$1", [user]],
      ["UPDATE job_loop_gmail_drafts SET status='uncertain' WHERE user_id=$1", [user]],
      ["INSERT INTO job_loop_support_requests(user_id,category,message) VALUES($1,'help','Bypass message')", [user]],
    ];
    for (const [sql, args] of denied) await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE service_role');
      await expect(tx.query(sql, args)).rejects.toThrow(/permission denied/);
    });
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE service_role');
      await expect(tx.query("SELECT job_loop_save_schedule_bound($1,$2,0,$3,now()+interval '1 day')", [user, generation, schedule])).resolves.toBeDefined();
    });
  });

  it('keeps epoch/status/token RPCs unavailable to browser roles', async () => {
    const { user, generation } = await account();
    for (const role of ['anon', 'authenticated']) for (const sql of [
      'SELECT job_loop_erasure_status($1)', 'SELECT job_loop_open_record($1)', 'SELECT job_loop_read_record($1,$2)',
      'SELECT job_loop_assert_generation($1,$2)', 'SELECT job_loop_read_gmail_connection($1,$2)',
    ]) await db.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE ${role}`);
      await expect(tx.query(sql, sql.includes('$2') ? [user, generation] : [user])).rejects.toThrow(/permission denied/);
    });
  });

  it('requires a concrete generation instead of silently reading the current enrollment', async () => {
    const { user } = await account();
    await expect(db.query('SELECT job_loop_assert_generation($1,NULL)', [user])).rejects.toThrow('LOOP_REQUEST_GENERATION_REQUIRED');
    await expect(db.query('SELECT job_loop_begin_erase($1,NULL)', [user])).rejects.toThrow('LOOP_REQUEST_GENERATION_REQUIRED');
  });

  it('retains actual, uncertain and reserved shared commitments through bound erasure, repeated finish and fresh setup', async () => {
    const owner = await account(), other = await account();
    const leased = async (candidate: typeof owner) => {
      const snapshot = await open(candidate.user);
      const runId = (await db.query<{ run: { id: string } }>(`SELECT job_loop_start_run_bound($1,$2,$3,$4,$4,$5,
        'rules','grounded-rules-v1','{}') run`, [candidate.user, candidate.generation, randomUUID(), hash, snapshot.version])).rows[0].run.id;
      const lease = randomUUID();
      await db.query('SELECT job_loop_claim_run($1,$2)', [runId, lease]);
      return { ...candidate, run: runId, lease };
    };
    const first = await leased(owner), second = await leased(other);
    const reserve = async (candidate: typeof first, key: string, micros: number) =>
      (await db.query<{ usage: { id: string } }>("SELECT job_loop_reserve($1,$2,$3,$4,'fixture-provider',$5,50000000) usage",
        [candidate.user, candidate.run, candidate.lease, key, micros])).rows[0].usage.id;
    const committed = async () => Number((await db.query<{ committed_micros: number }>(
      "SELECT committed_micros FROM job_loop_budget_months WHERE month=to_char(now() AT TIME ZONE 'UTC','YYYY-MM')",
    )).rows[0].committed_micros);
    const actual = await reserve(first, 'actual', 1_500_000);
    await db.query("SELECT job_loop_settle($1,1000000,'{}',false)", [actual]);
    const uncertain = await reserve(first, 'uncertain', 2_000_000);
    await db.query('SELECT job_loop_settle($1,NULL,NULL,true)', [uncertain]);
    const reserved = await reserve(first, 'reserved', 3_000_000);
    const otherActual = await reserve(second, 'other-actual', 4_000_000);
    await db.query("SELECT job_loop_settle($1,4000000,'{}',false)", [otherActual]);
    const otherRecord = (await db.query('SELECT * FROM job_loop_records WHERE user_id=$1', [other.user])).rows;
    const otherUsage = (await db.query('SELECT * FROM job_loop_usage WHERE user_id=$1', [other.user])).rows;
    expect(await committed()).toBe(10_000_000);

    const erasure = await begin(owner.user, owner.generation);
    expect(await committed()).toBe(10_000_000);
    await db.query('SELECT job_loop_finish_erase($1,$2)', [owner.user, erasure]);
    await db.query('SELECT job_loop_finish_erase($1,$2)', [owner.user, erasure]);
    expect((await db.query('SELECT * FROM job_loop_usage WHERE user_id=$1', [owner.user])).rows).toHaveLength(0);
    expect(await committed()).toBe(10_000_000);
    const fresh = await open(owner.user);
    await db.query('SELECT job_loop_write_record($1,$2,$3,true)', [owner.user, fresh.version, career]);
    expect(fresh.lifecycle_generation).toBeGreaterThan(erasure);
    for (const usage of [actual, uncertain, reserved]) await expect(db.query("SELECT job_loop_settle($1,0,'{}',false)", [usage]))
      .rejects.toThrow(/LOOP_/);
    await expect(begin(owner.user, owner.generation)).rejects.toThrow('LOOP_REQUEST_STALE');
    expect(await committed()).toBe(10_000_000);
    const budget = (await db.query<{ budget: { capUsd: number; committedUsd: number; remainingUsd: number } }>(
      'SELECT job_loop_budget_snapshot($1,50000000) budget', [owner.user],
    )).rows[0].budget;
    expect(budget).toMatchObject({ capUsd: 50, committedUsd: 10, remainingUsd: 40 });
    expect((await db.query('SELECT * FROM job_loop_records WHERE user_id=$1', [other.user])).rows).toEqual(otherRecord);
    expect((await db.query('SELECT * FROM job_loop_usage WHERE user_id=$1', [other.user])).rows).toEqual(otherUsage);
  });

  it('keeps every new bound RPC definer path fixed and denies client or legacy delegate execution', async () => {
    const names = ['job_loop_assert_generation', 'job_loop_open_record', 'job_loop_read_record', 'job_loop_erasure_status',
      'job_loop_begin_erase', 'job_loop_save_schedule_bound', 'job_loop_schedule_action_bound', 'job_loop_start_run_bound',
      'job_loop_request_support', 'job_loop_create_oauth_state', 'job_loop_consume_oauth_state', 'job_loop_read_oauth_state',
      'job_loop_activate_gmail_bound', 'job_loop_disconnect_gmail', 'job_loop_read_gmail_connection', 'job_loop_refresh_gmail',
      'job_loop_claim_draft_bound', 'job_loop_finish_gmail_draft', 'job_loop_claim_run'];
    const functions = (await db.query<{ name: string; signature: string; definer: boolean; config: string[]; anon: boolean; authenticated: boolean; service: boolean }>(`
      SELECT p.proname AS name,p.oid::regprocedure::text AS signature,p.prosecdef AS definer,p.proconfig AS config,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
        has_function_privilege('service_role',p.oid,'EXECUTE') AS service
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=ANY($1::text[])`, [names])).rows;
    expect(new Set(functions.map(fn => fn.name))).toEqual(new Set(names));
    for (const fn of functions) {
      expect(fn.definer, fn.signature).toBe(true);
      expect(fn.config, fn.signature).toContain('search_path=""');
      expect(fn.anon, fn.signature).toBe(false);
      expect(fn.authenticated, fn.signature).toBe(false);
      expect(fn.service, fn.signature).toBe(fn.signature !== 'job_loop_begin_erase(uuid)');
    }
    const exposedDelegates = (await db.query<{ name: string }>(`
      SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND (p.proname LIKE 'job_loop_%_unfenced' OR p.proname='job_loop_begin_erase_v23')
        AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
          OR has_function_privilege('service_role',p.oid,'EXECUTE'))`)).rows;
    expect(exposedDelegates).toEqual([]);
  });

  it('backfills existing mailbox epochs without deleting a valid connection', async () => {
    const old = await base();
    try {
      const user = randomUUID();
      await old.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
      await old.query('SELECT job_loop_write_record($1,0,$2,true)', [user, career]);
      const erasure = (await old.query<{ e: { generation: number } }>('SELECT job_loop_begin_erase($1) e', [user])).rows[0].e.generation;
      await old.query('SELECT job_loop_finish_erase($1,$2)', [user, erasure]);
      await old.query('INSERT INTO job_loop_records(user_id) VALUES($1)', [user]);
      await old.query("INSERT INTO job_loop_connections(user_id,token_ciphertext,email,allow_drafts) VALUES($1,$2,'existing@example.test',false)", [user, cipherA]);
      await old.query("INSERT INTO job_loop_oauth_states(state_hash,user_id,allow_drafts,verifier_ciphertext,expires_at) VALUES($1,$2,false,$3,now()+interval '1 minute')", [hash, user, verifier]);
      await old.exec(await readFile(requestMigration, 'utf8'));
      const ownerGeneration = Number((await old.query<{ generation: number }>('SELECT generation FROM job_loop_lifecycle WHERE user_id=$1', [user])).rows[0].generation);
      expect(ownerGeneration).toBeGreaterThan(erasure);
      expect(Number((await old.query<{ lifecycle_generation: number }>('SELECT lifecycle_generation FROM job_loop_connections WHERE user_id=$1', [user])).rows[0].lifecycle_generation)).toBe(ownerGeneration);
      expect(Number((await old.query<{ lifecycle_generation: number }>('SELECT lifecycle_generation FROM job_loop_oauth_states WHERE user_id=$1', [user])).rows[0].lifecycle_generation)).toBe(ownerGeneration);
      expect((await old.query<{ email: string }>('SELECT email FROM job_loop_connections')).rows[0].email).toBe('existing@example.test');
    } finally { await old.close(); }
  });
});
