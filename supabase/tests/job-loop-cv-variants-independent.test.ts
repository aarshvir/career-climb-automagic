// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { controlLoop } from '../functions/_shared/job-loop-runtime';
import { validateCvVariantSnapshot } from '../functions/_shared/job-loop-cv-variants';
import { LoopRepository, type RecordRow } from '../functions/_shared/job-loop-repository';
import type { LoopAction, LoopProfileInput, LoopClaim } from '../functions/_shared/job-loop-types';

// Independent integration: actual control/validation/repository + actual SQL.
// PGlite and auth/storage fixture tables are local substitutes, not hosted proof.
let db: PGlite, owner: string, generation: number, version: number;
let beforeSave: (() => Promise<void>) | undefined;
let beforeLifecycleRead: (() => Promise<void>) | undefined;
const passage = 'Helped prepare an operations tracker covering six workstreams.';
const profile: LoopProfileInput = {
  audience: 'professional', name: 'Alex Example', contactLine: '', targetTitles: ['Analyst'], locations: ['Remote'],
  experienceYears: null, languages: ['English'], pageTarget: 1, discreetSearch: true,
  sourceText: `Alex Example\nWORK EXPERIENCE\nExample Group\n${passage}\nEducation: Business studies.`,
  excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null },
};
const fact: LoopClaim = { id: 'fact-1', revision: 2, status: 'active', createdAt: '2026-10-17T00:00:00Z',
  sourceKind: 'cv_passage', sourceQuote: passage, phrasing: passage, context: 'Example Group', kind: 'employment',
  resultStatus: 'not_measured', confirmed: true, shareable: true };
async function sql<T = any>(query: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ result: T }>(query, args)).rows[0]?.result;
}
const row = () => sql<RecordRow>('SELECT to_jsonb(r) result FROM public.job_loop_records r WHERE user_id=$1', [owner]);
const count = () => sql<number>('SELECT count(*)::int result FROM jobvance_private.loop_cv_variants WHERE user_id=$1', [owner]);
const intent = () => ({ action: 'save_cv_variant', expectedGeneration: generation, expectedVersion: version,
  requestId: randomUUID(), variantId: null, expectedVariantRevision: 0, label: 'Operations',
  profile: structuredClone(profile), claimRefs: [{ id: fact.id, revision: fact.revision }], saveConsent: true });
async function edit(mutator: (value: RecordRow['data']) => void) {
  const current = await row(); mutator(current.data);
  return sql<RecordRow>('SELECT job_loop_write_record($1,$2,$3,true) result', [owner, current.version, current.data]);
}
function fixture() {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'job_loop_save_cv_variant_bound' && beforeSave) { const hook = beforeSave; beforeSave = undefined; await hook(); }
    const allowed = ['job_loop_assert_generation', 'job_loop_read_record', 'job_loop_save_cv_variant_bound', 'job_loop_read_cv_variants_bound'];
    if (!allowed.includes(name)) throw new Error(`Unexpected RPC ${name}`);
    await db.exec('SET ROLE service_role');
    try {
      const names = Object.keys(args);
      if (names.some(key => !/^p_[a-z_]+$/.test(key))) throw new Error('Invalid fixture RPC parameter');
      const data = await sql(`SELECT public.${name}(${names.map((key, index) => `${key} => $${index + 1}`).join(',')}) result`, Object.values(args));
      return { data, error: null };
    } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    finally { await db.exec('RESET ROLE'); }
  });
  const from = vi.fn((table: string) => {
    if (table !== 'job_loop_lifecycle') throw new Error('Variant contract must not directly read private data');
    return { select: (columns: string) => {
      if (columns !== 'user_id,state,generation') throw new Error('Unexpected lifecycle metadata selection');
      return { eq: (column: string, userId: string) => {
        if (column !== 'user_id') throw new Error('Missing owner filter');
        return { maybeSingle: async () => {
          await beforeLifecycleRead?.();
          return { data: await sql('SELECT jsonb_build_object(\'user_id\',user_id,\'state\',state,\'generation\',generation) result FROM public.job_loop_lifecycle WHERE user_id=$1', [userId]), error: null };
        } };
      } };
    } };
  });
  const repo = new LoopRepository({ rpc, from } as never);
  const fetcher = vi.fn(async () => { throw new Error('No provider/worker/network is authorized'); });
  return { rpc, from, fetcher, run: (action: object, userId = owner) => controlLoop(repo, userId, action as LoopAction, () => undefined, fetcher) };
}

beforeAll(async () => {
  db = new PGlite(); await db.exec(await checkLoopSchema());
  for (const migration of ['20261015223000_job_loop_selected_preparation.sql', '20261017013000_job_loop_cv_variants.sql']) {
    await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE;'); beforeSave = undefined; beforeLifecycleRead = undefined; owner = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  const opened = await sql<RecordRow>('SELECT job_loop_open_record($1) result', [owner]); generation = opened.lifecycle_generation!;
  const data = { profile: { ...profile, revision: 1, updatedAt: fact.createdAt }, claims: [structuredClone(fact)], opportunities: [], inbox: [] };
  version = (await sql<RecordRow>('SELECT job_loop_write_record($1,$2,$3,true) result', [owner, opened.version, data])).version;
});

describe('independent CV variant control against actual isolated SQL', () => {
  it.each(['sourceKind', 'kind', 'resultStatus'] as const)('rejects JSON array masquerading as a saved fact %s', field => {
    const claim = { ...fact, [field]: [fact[field]] };
    expect(() => validateCvVariantSnapshot({ id: randomUUID(), generation, revision: 1, label: 'Operations',
      profile, claims: [claim], sourceHash: 'a'.repeat(64), createdAt: fact.createdAt, updatedAt: fact.createdAt }, generation)).toThrow();
  });

  it.each(['withdraw', 'source', 'remove'] as const)('returns committed exact save after later %s while refusing new stale intent', async reason => {
    const f = fixture(), action = intent(), first = (await f.run(action)).variantSave!;
    await edit(data => {
      if (reason === 'withdraw') data.claims[0] = { ...data.claims[0], revision: 3, status: 'withdrawn', shareable: false, confirmed: false };
      if (reason === 'source') data.profile!.sourceText += '\nA later independent source edit.';
      if (reason === 'remove') data.claims = [];
    });
    const before = await row(), retry = (await f.run(action)).variantSave!;
    expect(retry.reused).toBe(true); expect(retry.sourceHash).toBe(first.sourceHash); expect(retry.savedRevision).toBe(1);
    expect(retry.variant).toEqual(first.variant); expect(await row()).toEqual(before); expect(await count()).toBe(1);
    await expect(f.run({ ...action, requestId: randomUUID() })).rejects.toMatchObject({ code: 'LOOP_VERSION_CONFLICT' });
    expect(await row()).toEqual(before); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.from.mock.calls.every(([table]) => table === 'job_loop_lifecycle')).toBe(true);
  });

  it('returns original receipt with current later revision without clearing or reverting current data', async () => {
    const f = fixture(), original = intent(), first = (await f.run(original)).variantSave!;
    const changed = (await f.run({ ...intent(), expectedVersion: first.recordVersion, variantId: first.variant.id,
      expectedVariantRevision: 1, label: 'Newer independent CV', profile: { ...profile, name: 'Alex Updated' } })).variantSave!;
    const retry = (await f.run(original)).variantSave!;
    expect(retry.savedRevision).toBe(1); expect(retry.sourceHash).toBe(first.sourceHash);
    expect(retry.variant).toEqual(changed.variant); expect(retry.variant.revision).toBe(2);
    expect(retry.variant.sourceHash).not.toBe(retry.sourceHash); expect(retry.recordVersion).toBe(changed.recordVersion);
  });

  it('rejects conflicting payload for a committed ID even after current source withdrawal', async () => {
    const f = fixture(), original = intent(); await f.run(original);
    await edit(data => { data.claims[0].shareable = false; data.claims[0].revision++; });
    await expect(f.run({ ...original, label: 'Substituted' })).rejects.toMatchObject({ code: 'LOOP_REQUEST_CONFLICT' });
    expect(await count()).toBe(1);
  });

  it('rejects new current-version request referencing withdrawn facts before persistence', async () => {
    const f = fixture(); const updated = await edit(data => { data.claims[0].shareable = false; data.claims[0].revision++; });
    await expect(f.run({ ...intent(), expectedVersion: updated.version, claimRefs: [{ id: fact.id, revision: 3 }] })).rejects.toThrow();
    expect(f.rpc.mock.calls.some(([name]) => name === 'job_loop_save_cv_variant_bound')).toBe(false);
    expect(await count()).toBe(0);
  });

  it('uses the locked SQL version fence when sharing changes after semantic preflight', async () => {
    const f = fixture(); beforeSave = async () => { await edit(data => { data.claims[0].shareable = false; data.claims[0].revision++; }); };
    await expect(f.run(intent())).rejects.toMatchObject({ code: 'LOOP_VERSION_CONFLICT' });
    expect(await count()).toBe(0); expect((await row()).data.claims[0].shareable).toBe(false);
  });

  it('uses original lifecycle authority when erasure starts after preflight', async () => {
    const f = fixture(); beforeSave = async () => { await sql('SELECT job_loop_begin_erase($1,$2) result', [owner, generation]); };
    await expect(f.run(intent())).rejects.toMatchObject({ code: 'LOOP_REQUEST_STALE' });
    expect(await count()).toBe(0); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it.each(['save', 'read'] as const)('withholds %s data when erasure starts after its SQL operation but before response', async operation => {
    const f = fixture();
    if (operation === 'read') await f.run(intent());
    let reads = 0;
    beforeLifecycleRead = async () => {
      if (++reads === 2) await sql('SELECT job_loop_begin_erase($1,$2) result', [owner, generation]);
    };
    await expect(f.run(operation === 'save' ? intent() : { action: 'read_cv_variants', expectedGeneration: generation }))
      .rejects.toMatchObject({ code: 'LOOP_ERASURE_IN_PROGRESS' });
    expect(reads).toBe(2); expect(await count()).toBe(1);
    // The erasure finisher, rather than a fabricated absent response, removes bytes.
    const life = await sql<any>('SELECT to_jsonb(l) result FROM public.job_loop_lifecycle l WHERE user_id=$1', [owner]);
    await sql('SELECT job_loop_finish_erase($1,$2) result', [owner, life.generation]);
    expect(await count()).toBe(0); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('reads exact owned variants without initializing an absent owner', async () => {
    const f = fixture(), first = (await f.run(intent())).variantSave!;
    const result = await f.run({ action: 'read_cv_variants', expectedGeneration: generation });
    expect(result.cvVariants?.variants).toEqual([first.variant]);
    const other = randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES($1)', [other]);
    await expect(f.run({ action: 'read_cv_variants', expectedGeneration: generation }, other)).rejects.toThrow();
    expect(await sql('SELECT count(*)::int result FROM public.job_loop_records WHERE user_id=$1', [other])).toBe(0);
    expect(f.from.mock.calls.every(([table]) => table === 'job_loop_lifecycle')).toBe(true); expect(f.fetcher).not.toHaveBeenCalled();
  });

  it('captures the original intent before the first await so later caller mutation cannot replace consent or source', async () => {
    const f = fixture(), action = intent(), pending = f.run(action);
    action.profile.name = 'Later unsaved name'; action.claimRefs = []; action.label = 'Later draft'; action.saveConsent = false;
    const result = (await pending).variantSave!;
    expect(result.variant.profile.name).toBe(profile.name); expect(result.variant.label).toBe('Operations');
    expect(result.variant.claims.map(claim => claim.id)).toEqual([fact.id]);
  });
});
