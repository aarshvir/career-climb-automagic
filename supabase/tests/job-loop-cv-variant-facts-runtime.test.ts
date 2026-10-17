// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { controlLoop } from '../functions/_shared/job-loop-runtime';
import { LoopRepository, type RecordRow } from '../functions/_shared/job-loop-repository';
import type { LoopAction, LoopProfileInput } from '../functions/_shared/job-loop-types';

// Independent actual control/repository/SQL integration. PGlite and simulated
// authority/lifecycle calls are local substitutes, not hosted race evidence.
let db: PGlite, owner: string, other: string, generation: number, version: number, variant: any;
let beforeWrite: (() => Promise<void>) | undefined;
let afterWrite: (() => Promise<void>) | undefined;
const passage = 'Helped prepare an operations tracker covering six workstreams.';
const profile: LoopProfileInput = { audience: 'professional', name: 'Alex Example', contactLine: '', targetTitles: ['Analyst'], locations: ['Remote'], experienceYears: null, languages: ['English'], pageTarget: 1, discreetSearch: true, sourceText: `Alex Example\nWORK EXPERIENCE\nExample Group\n${passage}\nEducation: Business studies.`, excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null } };
const claim = { sourceKind: 'cv_passage', sourceQuote: passage, phrasing: passage, context: 'Example Group', kind: 'employment', resultStatus: 'not_measured', confirmed: true, shareable: true };
async function sql<T = any>(query: string, args: unknown[] = []): Promise<T> { return (await db.query<{ result: T }>(query, args)).rows[0]?.result; }
const row = () => sql<RecordRow>('SELECT to_jsonb(r) result FROM job_loop_records r WHERE user_id=$1', [owner]);
const facts = () => sql<any[]>('SELECT coalesce(jsonb_agg(snapshot),\'[]\') result FROM jobvance_private.loop_cv_variant_facts WHERE user_id=$1', [owner]);
function save(): any { return { action: 'save_cv_variant_fact', expectedGeneration: generation, expectedVersion: version, requestId: randomUUID(), variantId: variant.id, expectedVariantRevision: variant.revision, sourceHash: variant.sourceHash, factId: null, expectedFactRevision: 0, claim: structuredClone(claim), saveConsent: true }; }
function withdrawal(fact: any, expectedVersion: number): any { return { action: 'withdraw_cv_variant_fact', expectedGeneration: generation, expectedVersion, requestId: randomUUID(), variantId: variant.id, expectedVariantRevision: fact.variantRevision, sourceHash: fact.sourceHash, factId: fact.id, expectedFactRevision: fact.revision, withdrawConsent: true }; }
async function updateVariant(sourceText: string) {
  const current = await row();
  const result = await sql('SELECT job_loop_save_cv_variant_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result', [owner, generation, current.version, randomUUID(), variant.id, variant.revision, 'Operations', { ...profile, sourceText }, [], true]);
  variant = result.variant; version = result.recordVersion; return result;
}
function fixture() {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    const writes = ['job_loop_save_cv_variant_fact_bound', 'job_loop_withdraw_cv_variant_fact_bound', 'job_loop_save_cv_variant_bound'];
    const allowed = [...writes, 'job_loop_read_cv_variants_bound', 'job_loop_read_cv_variant_facts_bound', 'job_loop_read_record'];
    if (!allowed.includes(name)) throw new Error(`Unexpected RPC ${name}`);
    if (writes.includes(name) && beforeWrite) { const hook = beforeWrite; beforeWrite = undefined; await hook(); }
    await db.exec('SET ROLE service_role');
    let data: unknown;
    try {
      const names = Object.keys(args);
      if (names.some(key => !/^p_[a-z_]+$/.test(key))) throw new Error('Invalid fixture RPC parameter');
      data = await sql(`SELECT public.${name}(${names.map((key, n) => `${key} => $${n + 1}`).join(',')}) result`, Object.values(args));
    } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    finally { await db.exec('RESET ROLE'); }
    if (writes.includes(name) && afterWrite) { const hook = afterWrite; afterWrite = undefined; await hook(); }
    return { data, error: null };
  });
  const from = vi.fn((table: string) => {
    if (table !== 'job_loop_lifecycle') throw new Error(`Unexpected direct table ${table}`);
    return { select: () => ({ eq: (_key: string, user: string) => ({ maybeSingle: async () => ({ data: await sql('SELECT jsonb_build_object(\'user_id\',user_id,\'state\',state,\'generation\',generation) result FROM job_loop_lifecycle WHERE user_id=$1', [user]), error: null }) }) }) };
  });
  const fetcher = vi.fn(async () => { throw new Error('Provider/worker network not authorized'); });
  const repo = new LoopRepository({ rpc, from } as never);
  return { rpc, from, fetcher, run: (action: object, user = owner) => controlLoop(repo, user, action as LoopAction, () => undefined, fetcher) };
}
beforeAll(async () => {
  db = new PGlite(); await db.exec(await checkLoopSchema());
  for (const migration of ['20261015223000_job_loop_selected_preparation.sql', '20261017013000_job_loop_cv_variants.sql', '20261017080000_job_loop_cv_variant_facts.sql']) await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE;'); beforeWrite = undefined; afterWrite = undefined;
  owner = randomUUID(); other = randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, other]);
  const opened = await sql('SELECT job_loop_open_record($1) result', [owner]); generation = opened.lifecycle_generation;
  const current = await sql('SELECT job_loop_write_record($1,$2,$3,true) result', [owner, opened.version, { profile: { ...profile, sourceText: profile.sourceText + '\nGlobal source remains separate.', revision: 1, updatedAt: '2026-10-17T00:00:00Z' }, claims: [], opportunities: [], inbox: [] }]);
  const result = await sql('SELECT job_loop_save_cv_variant_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result', [owner, generation, current.version, randomUUID(), null, 0, 'Operations', profile, [], true]);
  variant = result.variant; version = result.recordVersion;
});

describe('independent actual variant fact control/SQL boundary', () => {
  it('saves against a different exact variant source without changing global facts/profile/input version or starting work', async () => {
    const h = fixture(), before = await row(), result = await h.run(save()), after = await row();
    expect(result.variantFactSave.fact).toMatchObject({ ...claim, variantId: variant.id, variantRevision: 1, revision: 1 });
    expect(after.data).toEqual(before.data); expect(after.input_version).toBe(before.input_version); expect(after.version).toBe(before.version + 1);
    expect(await sql('SELECT count(*)::int result FROM job_loop_runs')).toBe(0); expect(await sql('SELECT count(*)::int result FROM job_loop_packets')).toBe(0); expect(h.fetcher).not.toHaveBeenCalled();
  });
  it.each(['context', 'cropped', 'kind', 'expanded-header'])('rejects semantically invalid confirmed fact before SQL write: %s', async mode => {
    const h = fixture(), action = save();
    if (mode === 'context') action.claim.context = 'A different employer';
    if (mode === 'cropped') { action.claim.sourceQuote = 'prepare an operations tracker'; action.claim.phrasing = action.claim.sourceQuote; }
    if (mode === 'kind') action.claim.kind = 'academic_project';
    if (mode === 'expanded-header') { await updateVariant(profile.sourceText.replace('Example Group\n', 'Example Group\nAnalyst 2020–2022\n')); Object.assign(action, { expectedVersion: version, expectedVariantRevision: variant.revision, sourceHash: variant.sourceHash }); }
    await expect(h.run(action)).rejects.toMatchObject({ status: 422, code: 'LOOP_VARIANT_FACT_INVALID' });
    expect(h.rpc.mock.calls.some(([name]) => name === 'job_loop_save_cv_variant_fact_bound')).toBe(false); expect(await facts()).toEqual([]);
  });
  it('does not skip semantic validation for a future version that could become current before SQL', async () => {
    const h = fixture(), action = save(); action.expectedVersion++; action.claim.context = 'Forged employer context';
    beforeWrite = async () => { const current = await row(); await sql('SELECT job_loop_write_record($1,$2,$3,false) result', [owner, current.version, current.data]); };
    await expect(h.run(action)).rejects.toThrow(); expect(await facts()).toEqual([]);
    expect(h.rpc.mock.calls.some(([name]) => name === 'job_loop_save_cv_variant_fact_bound')).toBe(false);
  });
  it('also prevents a future record version from bypassing the existing variant source/claim semantic boundary', async () => {
    const h = fixture(), current = await row(), globalFact = { ...claim, id: randomUUID(), revision: 1, status: 'active', createdAt: '2026-10-17T00:00:00Z', context: 'Forged employer context' };
    const seeded = await sql('SELECT job_loop_write_record($1,$2,$3,false) result', [owner, current.version, { ...current.data, claims: [globalFact] }]);
    const { revision: _revision, updatedAt: _updated, ...globalProfile } = seeded.data.profile;
    const action = { action: 'save_cv_variant', expectedGeneration: generation, expectedVersion: seeded.version + 1, requestId: randomUUID(), variantId: null, expectedVariantRevision: 0, label: 'Future attempt', profile: globalProfile, claimRefs: [{ id: globalFact.id, revision: 1 }], saveConsent: true };
    beforeWrite = async () => { const fresh = await row(); await sql('SELECT job_loop_write_record($1,$2,$3,false) result', [owner, fresh.version, fresh.data]); };
    await expect(h.run(action)).rejects.toMatchObject({ code: 'LOOP_VERSION_CONFLICT' });
    expect(h.rpc.mock.calls.some(([name]) => name === 'job_loop_save_cv_variant_bound')).toBe(false);
    expect(await sql('SELECT count(*)::int result FROM jobvance_private.loop_cv_variants WHERE user_id=$1', [owner])).toBe(1);
  });
  it('rejects source editing between validation and locked SQL write', async () => {
    const h = fixture(), action = save(); beforeWrite = async () => { await updateVariant(profile.sourceText + '\nNew source wording.'); };
    await expect(h.run(action)).rejects.toThrow(); expect(await facts()).toEqual([]);
  });
  it('recovers original save after source change and withdrawal without reactivating the fact', async () => {
    const h = fixture(), original = save(), saved = (await h.run(original)).variantFactSave;
    await updateVariant(profile.sourceText + '\nChanged source must be reconfirmed.');
    const withdrawn = (await h.run(withdrawal(saved.fact, version))).variantFactSave;
    const beforeRetry = await row(), retry = (await h.run(original)).variantFactSave;
    expect(retry.reused).toBe(true); expect(retry.savedRevision).toBe(1); expect(retry.fact).toEqual(withdrawn.fact); expect(retry.fact.status).toBe('withdrawn');
    expect(retry.variant.revision).toBe(2); expect(retry.variantRevision).toBe(1); expect(await row()).toEqual(beforeRetry); expect(await facts()).toHaveLength(1);
  });
  it('rejects A→B→A source confirmation even when its original source hash returns', async () => {
    const original = save(), firstHash = variant.sourceHash;
    await updateVariant(profile.sourceText + '\nOther source.'); await updateVariant(profile.sourceText);
    expect(variant.sourceHash).toBe(firstHash); const action = { ...original, expectedVersion: version };
    await expect(fixture().run(action)).rejects.toThrow(); expect(await facts()).toEqual([]);
  });
  it('rejects an old original request ID used with changed fact wording', async () => {
    const h = fixture(), original = save(); await h.run(original);
    await expect(h.run({ ...original, claim: { ...claim, shareable: false } })).rejects.toThrow(); expect(await facts()).toHaveLength(1);
  });
  it('does not initialize an absent other owner or disclose another owner variant', async () => {
    const h = fixture(); await expect(h.run({ action: 'read_cv_variant_facts', expectedGeneration: generation, variantId: variant.id }, other)).rejects.toThrow();
    expect(await sql('SELECT count(*)::int result FROM job_loop_records WHERE user_id=$1', [other])).toBe(0); expect(h.rpc).not.toHaveBeenCalled();
  });
  it('rejects an erasure begun after a successful write before returning CV facts', async () => {
    const h = fixture(); afterWrite = async () => { await sql('SELECT job_loop_begin_erase($1,$2) result', [owner, generation]); };
    await expect(h.run(save())).rejects.toMatchObject({ code: 'LOOP_ERASURE_IN_PROGRESS' });
  });
});
