// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';

let db: PGlite, owner: string, other: string, check: string, generation: number, version: number;
const opportunity = { title: 'Analyst', company: 'Example employer', location: 'Dubai', url: 'https://example.test/jobs/1', description: 'Review customer research, document evidence and prepare reports for the product team. '.repeat(2), contact: null };
type RecordRow = { version: number; input_version: number; data: { profile: unknown; claims: unknown[]; opportunities: Record<string, unknown>[]; inbox: unknown[] } };
type Result = { record: RecordRow; opportunityId: string; reused: boolean };
const query = (sql: string, values: unknown[] = []) => db.query<Record<string, any>>(sql, values);
async function newCheck(user = owner) {
  const id = randomUUID();
  await query(`INSERT INTO cv_checks(id,user_id,request_id,job_title,company,job_description,original_text,reviewed_text,method_version,status)
    VALUES($1,$2,$3,$4,$5,$6,repeat('Original CV ',10),repeat('Reviewed CV ',10),'fixture','approved')`,
  [id, user, randomUUID(), opportunity.title, opportunity.company, opportunity.description]);
  return id;
}
async function link(overrides: { user?: string; epoch?: number | null; expected?: number; checkId?: string; input?: unknown; consent?: boolean | null } = {}): Promise<Result> {
  await db.exec('SET ROLE service_role');
  try {
    return (await query('SELECT job_loop_link_saved_check($1,$2,$3,$4,$5,$6) result', [overrides.user ?? owner,
      overrides.epoch === undefined ? generation : overrides.epoch, overrides.expected ?? version, overrides.checkId ?? check,
      overrides.input === undefined ? { ...opportunity, description: opportunity.description.trim() } : overrides.input,
      overrides.consent === undefined ? true : overrides.consent])).rows[0].result;
  } finally { await db.exec('RESET ROLE'); }
}
async function record(): Promise<RecordRow> { return (await query('SELECT * FROM job_loop_records WHERE user_id=$1', [owner])).rows[0] as RecordRow; }
async function write(data: RecordRow['data']) {
  return (await query('SELECT job_loop_write_record($1,$2,$3,true) result', [owner, (await record()).version, data])).rows[0].result as RecordRow;
}
beforeAll(async () => { db = new PGlite(); await db.exec(await checkLoopSchema()); }, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE; TRUNCATE storage.objects; TRUNCATE job_loop_budget_months CASCADE;');
  owner = randomUUID(); other = randomUUID();
  await query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, other]);
  const opened = (await query('SELECT job_loop_open_record($1) result', [owner])).rows[0].result;
  generation = opened.lifecycle_generation;
  const saved = await write({ profile: { name: 'Created fixture', revision: 1 }, claims: [], opportunities: [], inbox: [] });
  version = saved.version;
  check = await newCheck();
});

describe('saved-check to Loop persistence boundary (not yet a published feature)', () => {
  it('creates one exact relationship and retains the separately saved check and profile', async () => {
    const before = await record(), source = (await query('SELECT * FROM cv_checks WHERE id=$1', [check])).rows[0];
    const result = await link();
    expect(result.reused).toBe(false);
    expect(result.record.data.opportunities).toHaveLength(1);
    expect(result.record.data.opportunities[0]).toMatchObject({ ...opportunity, description: opportunity.description.trim(), sourceCheckId: check, id: result.opportunityId, source: 'manual', sourceKey: `saved-check:${check}`, status: 'saved', notes: '', followUpAt: null });
    expect(result.record.data.profile).toEqual(before.data.profile);
    expect(result.record.input_version).toBe(before.input_version + 1);
    expect((await query('SELECT * FROM cv_checks WHERE id=$1', [check])).rows[0]).toEqual(source);
    expect((await query('SELECT * FROM job_loop_runs')).rows).toHaveLength(0);
    expect((await query('SELECT * FROM tracked_applications')).rows).toHaveLength(0);
  });
  it('lost-response retries keep the same ID without another version, packet invalidation or write', async () => {
    const first = await link();
    expect(await link()).toEqual({ ...first, reused: true });
  });
  it('retry preserves later progress, source edits and a different profile', async () => {
    const first = await link(), next = structuredClone(first.record.data);
    next.profile = { name: 'Updated profile', revision: 2 };
    Object.assign(next.opportunities[0], { notes: 'Keep these notes', status: 'interview', followUpAt: '2026-10-20', title: 'Edited later' });
    const changed = await write(next);
    expect((await link()).record).toEqual(changed);
  });
  it('never merges same-title/check contents, same URL, or an existing manual vacancy', async () => {
    const first = await link(), check2 = await newCheck();
    const second = await link({ checkId: check2, expected: first.record.version });
    expect(second.opportunityId).not.toBe(first.opportunityId);
    const data = structuredClone(second.record.data);
    data.opportunities.push({ ...opportunity, id: randomUUID(), source: 'manual', sourceKey: 'url:existing' });
    await write(data);
    expect((await link()).record.data.opportunities).toHaveLength(3);
  });
  it.each([false, null])('requires explicit link consent (%s)', async consent => {
    await expect(link({ consent })).rejects.toThrow('LOOP_CHECK_LINK_CONSENT');
    expect((await record()).data.opportunities).toHaveLength(0);
  });
  it('requires fresh consent even for an existing relationship', async () => {
    await link(); await expect(link({ consent: false })).rejects.toThrow('LOOP_CHECK_LINK_CONSENT');
  });
  it('does not reveal or link another owner check', async () => {
    const foreign = await newCheck(other);
    await expect(link({ checkId: foreign })).rejects.toThrow('LOOP_CHECK_UNAVAILABLE');
    await expect(link({ checkId: randomUUID() })).rejects.toThrow('LOOP_CHECK_UNAVAILABLE');
    expect((await record()).data.opportunities).toHaveLength(0);
  });
  it('rejects stale versions before a first relationship', async () => {
    await expect(link({ expected: version - 1 })).rejects.toThrow('LOOP_VERSION_CONFLICT');
  });
  it.each(['title', 'company', 'description'])('rejects an edited %s falsely attributed to the saved check', async key => {
    await expect(link({ input: { ...opportunity, description: opportunity.description.trim(), [key]: 'Different source '.repeat(8) } })).rejects.toThrow('LOOP_CHECK_SOURCE_CHANGED');
  });
  it('matches the existing validator trim rules for Unicode whitespace in saved source fields', async () => {
    const whitespace = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
    await query('UPDATE cv_checks SET job_title=$2,company=$3,job_description=$4 WHERE id=$1', [check, whitespace + opportunity.title + whitespace, whitespace + opportunity.company + whitespace, whitespace + opportunity.description + whitespace]);
    const result = await link();
    expect(result.record.data.opportunities[0].title).toBe(opportunity.title);
    expect(result.record.data.opportunities[0].description).toBe(opportunity.description.trim());
  });
  it.each([null, [], { ...opportunity, id: randomUUID() }, { ...opportunity, sourceCheckId: randomUUID() }, { ...opportunity, contact: 'unconfirmed' }])('rejects malformed or metadata-bearing vacancy inputs (%j)', async input => {
    await expect(link({ input })).rejects.toThrow('LOOP_CHECK_LINK_INVALID');
  });
  it.each(['http://example.test', 'https://name:password@example.test/job', 'https://example.test bad/job'])('rejects an unsafe URL %s', async url => {
    await expect(link({ input: { ...opportunity, description: opportunity.description.trim(), url } })).rejects.toThrow('LOOP_CHECK_LINK_INVALID');
  });
  it('deletion before linking fails without recreating a source', async () => {
    await query('DELETE FROM cv_checks WHERE id=$1', [check]);
    await expect(link()).rejects.toThrow('LOOP_CHECK_UNAVAILABLE');
  });
  it('source deletion after linking retains independent Loop work; retry does not recreate it', async () => {
    const first = await link();
    await query('DELETE FROM cv_checks WHERE id=$1', [check]);
    expect(await link()).toEqual({ ...first, reused: true });
    expect((await query('SELECT * FROM cv_checks')).rows).toHaveLength(0);
  });
  it('fails closed if a corrupt record contains two links to the same check', async () => {
    const first = await link(), data = structuredClone(first.record.data);
    data.opportunities.push({ ...data.opportunities[0], id: randomUUID() });
    await write(data);
    await expect(link()).rejects.toThrow('LOOP_CHECK_LINK_CONFLICT');
  });
  it('keeps the 100-vacancy bound while permitting retries at the limit', async () => {
    const first = await link(), data = structuredClone(first.record.data);
    for (let i = 1; i < 100; i++) data.opportunities.push({ ...opportunity, id: randomUUID(), source: 'manual' });
    const full = await write(data);
    expect((await link()).opportunityId).toBe(first.opportunityId);
    await expect(link({ checkId: await newCheck(), expected: full.version })).rejects.toThrow('LOOP_OPPORTUNITY_LIMIT');
  });
  it.each(['anon', 'authenticated'])('denies %s even with the exact owner and consent', async role => {
    await query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec(`SET ROLE ${role}`);
    try { await expect(query('SELECT job_loop_link_saved_check($1,$2,$3,$4,$5,true)', [owner, generation, version, check, opportunity])).rejects.toThrow('permission denied'); }
    finally { await db.exec('RESET ROLE'); }
  });
  it('rejects missing generation and old intent through erasure and fresh enrollment', async () => {
    await expect(link({ epoch: null })).rejects.toThrow('LOOP_REQUEST_GENERATION_REQUIRED');
    await link();
    const erasure = (await query('SELECT job_loop_begin_erase($1,$2) result', [owner, generation])).rows[0].result;
    await expect(link()).rejects.toThrow('LOOP_REQUEST_STALE');
    await expect(link({ epoch: erasure.generation })).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await query('SELECT job_loop_finish_erase($1,$2)', [owner, erasure.generation]);
    await expect(link()).rejects.toThrow('LOOP_REQUEST_STALE');
    const opened = (await query('SELECT job_loop_open_record($1) result', [owner])).rows[0].result;
    await expect(link()).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await record()).data.opportunities).toHaveLength(0);
    const fresh = await link({ epoch: opened.lifecycle_generation, expected: opened.version });
    expect(fresh.reused).toBe(false);
  });
  it('uses invoker security, fixed search path and service-only execution', async () => {
    const fn = (await query("SELECT prosecdef,proconfig,has_function_privilege('authenticated',oid,'EXECUTE') client,has_function_privilege('service_role',oid,'EXECUTE') server FROM pg_proc WHERE proname='job_loop_link_saved_check'")).rows[0];
    expect(fn).toMatchObject({ prosecdef: false, client: false, server: true });
    expect(fn.proconfig).toEqual(['search_path=""']);
    const inner = (await query("SELECT prosecdef,proconfig,has_function_privilege('authenticated',oid,'EXECUTE') client,has_function_privilege('anon',oid,'EXECUTE') guest,has_function_privilege('service_role',oid,'EXECUTE') server FROM pg_proc WHERE proname='link_saved_check_to_loop'")).rows[0];
    expect(inner).toMatchObject({ prosecdef: true, client: false, guest: false, server: true });
    expect(inner.proconfig).toEqual(['search_path=""']);
  });
  it('does not create a missing record or activate an erased lifetime', async () => {
    await expect(link({ user: other })).rejects.toThrow('LOOP_NOT_FOUND');
    expect((await query('SELECT * FROM job_loop_records WHERE user_id=$1', [other])).rows).toHaveLength(0);
    expect((await query('SELECT * FROM job_loop_lifecycle WHERE user_id=$1 AND state=$2', [other, 'active'])).rows).toHaveLength(0);
  });
  it('keeps uncertain/actual budget commitments, held packets and disabled collection intact', async () => {
    const priorId = randomUUID(), before = await record();
    const populated = await write({ ...before.data, opportunities: [{ ...opportunity, id: priorId, source: 'manual' }] });
    version = populated.version;
    const hash = 'a'.repeat(64);
    const run = (await query(`SELECT job_loop_start_run_bound($1,$2,$3,$4,$4,$5,'rules','grounded-rules-v1','{}') result`, [owner, generation, randomUUID(), hash, version])).rows[0].result;
    await query(`INSERT INTO job_loop_packets(id,user_id,run_id,opportunity_id,input_version,input_hash,data,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'held')`, [randomUUID(), owner, run.id, priorId, populated.input_version, hash, { opportunityId: priorId, status: 'held', artifacts: {} }]);
    await query("INSERT INTO job_loop_budget_months(month,committed_micros) VALUES(to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),1234567) ON CONFLICT(month) DO UPDATE SET committed_micros=1234567");
    for (const state of ['settled', 'uncertain', 'reserved']) await query(`INSERT INTO job_loop_usage(user_id,run_id,operation_key,month,provider,reserved_micros,actual_micros,status)
      VALUES($1,$2,$3,to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),'fixture',1000,$4,$3)`, [owner, run.id, state, state === 'settled' ? 700 : null]);
    const budget = (await query('SELECT * FROM job_loop_budget_months')).rows;
    const usage = (await query('SELECT * FROM job_loop_usage ORDER BY id')).rows;
    const gc = (await query('SELECT * FROM job_loop_gc_config')).rows;
    await link();
    expect((await query('SELECT * FROM job_loop_budget_months')).rows).toEqual(budget);
    expect((await query('SELECT * FROM job_loop_usage ORDER BY id')).rows).toEqual(usage);
    expect((await query('SELECT * FROM job_loop_gc_config')).rows).toEqual(gc);
    const packet = (await query('SELECT status,input_version FROM job_loop_packets')).rows[0];
    expect(packet.status).toBe('held');
    expect(packet.input_version).toBe(populated.input_version + 1);
    expect((await query('SELECT status FROM job_loop_runs')).rows).toEqual([{ status: 'blocked' }]);
  });
});
