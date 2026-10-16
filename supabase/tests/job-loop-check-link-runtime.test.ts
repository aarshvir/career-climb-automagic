// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { controlLoop, validateControlInput } from '../functions/_shared/job-loop-runtime';
import { LoopRepository, type RecordRow } from '../functions/_shared/job-loop-repository';
import type { LoopAction, LoopOpportunity } from '../functions/_shared/job-loop-types';
import { digest } from '../functions/_shared/job-loop-providers';

const owner = '11111111-1111-4111-a111-111111111111', checkId = '22222222-2222-4222-a222-222222222222', opportunityId = '33333333-3333-4333-a333-333333333333';
const input = { title: 'Analyst', company: 'Example employer', location: 'Dubai', url: 'https://example.test/jobs/1', description: 'Review customer research, document evidence and prepare reports for the product team.', contact: null };
const action: LoopAction = { action: 'link_saved_check', expectedGeneration: 7, expectedVersion: 1, checkId, opportunity: input, linkConsent: true };
const linked: LoopOpportunity = { ...input, id: opportunityId, sourceCheckId: checkId, source: 'manual', sourceKey: `saved-check:${checkId}`, checkedAt: '2026-10-15T00:00:00Z', verification: 'user_provided', status: 'interview', notes: 'Retain this progress', followUpAt: '2026-10-20' };
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  let epoch = 7, reused = false;
  const row: RecordRow = { user_id: owner, version: 1, input_version: 1, updated_at: '2026-10-15T00:00:00Z', data: { profile: null, claims: [], opportunities: [], inbox: [] } };
  let wait: Promise<void> | undefined;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'job_loop_link_saved_check') await wait;
    if (['job_loop_assert_generation', 'job_loop_read_record', 'job_loop_link_saved_check'].includes(name) && args.p_generation !== epoch) return { data: null, error: { message: 'LOOP_REQUEST_STALE' } };
    if (name === 'job_loop_assert_generation') return { data: null, error: null };
    if (name === 'job_loop_read_record') return { data: { ...structuredClone(row), lifecycle_generation: epoch }, error: null };
    if (name === 'job_loop_link_saved_check') {
      row.data.opportunities = [structuredClone(linked)]; row.version = 2;
      return { data: { record: structuredClone(row), opportunityId, reused }, error: null };
    }
    if (name === 'job_loop_write_record') { row.data = structuredClone(args.p_data) as RecordRow['data']; row.version++; return { data: structuredClone(row), error: null }; }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const from = vi.fn(() => { throw new Error('No direct table bypass.'); });
  const repo = new LoopRepository({ rpc, from } as never);
  vi.spyOn(repo, 'record').mockImplementation(async (_owner, generation) => {
    if (generation !== undefined) return repo.rpc('job_loop_read_record', { p_user: _owner, p_generation: generation });
    return structuredClone(row);
  });
  vi.spyOn(repo, 'erasureStatus').mockImplementation(async () => ({ state: 'active', generation: epoch }));
  vi.spyOn(repo, 'collections').mockResolvedValue({ runs: [], packets: [], usage: [], connection: null });
  vi.spyOn(repo, 'operationalSnapshot').mockResolvedValue({ schedule: null, activity: [], support: [], scheduler: { ready: false }, budget: { month: '2026-10', capUsd: 50, committedUsd: 0, remainingUsd: 50, enrolled: true, activeUsers: 1 } });
  return { repo, rpc, from, row, setEpoch: (value: number) => { epoch = value; }, reuse: () => { reused = true; }, delay: () => { let release!: () => void; wait = new Promise<void>(resolve => { release = resolve; }); return release; } };
}
const env = () => undefined;

describe('saved-check link control contract (unpublished)', () => {
  it('validates exact source, generation, consent and vacancy without accepting caller owner/metadata', () => {
    expect(validateControlInput(action)).toEqual(action);
    for (const patch of [{ expectedGeneration: undefined }, { checkId: 'guessed' }, { linkConsent: false }, { linkConsent: 'true' }, { userId: owner }, { opportunity: { ...input, sourceCheckId: checkId } }, { opportunity: { ...input, url: 'javascript:alert(1)' } }]) {
      expect(() => validateControlInput({ ...action, ...patch })).toThrow();
    }
  });
  it('passes only the verified server owner and original generation to the atomic RPC', async () => {
    const f = fixture(), fetcher = vi.fn();
    const result = await controlLoop(f.repo, owner, action, env, fetcher);
    expect(f.rpc).toHaveBeenCalledWith('job_loop_link_saved_check', { p_user: owner, p_generation: 7, p_expected: 1, p_check: checkId, p_opportunity: input, p_link_consent: true });
    expect(result.checkLink).toEqual({ checkId, opportunityId, reused: false });
    expect(result.snapshot?.opportunities[0]).toEqual(linked);
    expect(result.snapshot?.lifecycleGeneration).toBe(7);
    expect(f.rpc.mock.calls.some(([name]) => /open_record|start_run|reserve|upload/.test(name))).toBe(false);
    expect(f.from).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns reused identity and honest kept-progress copy without a generic write', async () => {
    const f = fixture(); f.reuse();
    const result = await controlLoop(f.repo, owner, action, env);
    expect(result.checkLink?.reused).toBe(true); expect(result.message).toContain('progress were kept');
    expect(f.rpc.mock.calls.some(([name]) => name === 'job_loop_write_record')).toBe(false);
  });
  it('revalidates a missing consent at the business boundary without dispatching the link', async () => {
    const f = fixture();
    await expect(controlLoop(f.repo, owner, { ...action, linkConsent: false }, env)).rejects.toThrow();
    expect(f.rpc.mock.calls.some(([name]) => name === 'job_loop_link_saved_check')).toBe(false);
  });
  it('refuses a delayed RPC after erasure/new lifetime rather than adopting the new generation', async () => {
    const f = fixture(), release = f.delay();
    const pending = controlLoop(f.repo, owner, action, env);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'LOOP_REQUEST_STALE' });
    await vi.waitFor(() => expect(f.rpc.mock.calls.some(([name]) => name === 'job_loop_link_saved_check')).toBe(true));
    f.setEpoch(9); release(); await rejected;
    expect(f.row.data.opportunities).toHaveLength(0);
  });
  it('never returns a mixed-lifetime snapshot after a successful old-generation write', async () => {
    const f = fixture();
    const original = f.repo.linkSavedCheck.bind(f.repo);
    vi.spyOn(f.repo, 'linkSavedCheck').mockImplementation(async (...args) => { const result = await original(...args); f.setEpoch(9); return result; });
    await expect(controlLoop(f.repo, owner, action, env)).rejects.toMatchObject({ code: 'LOOP_REQUEST_STALE' });
  });
  it('fails closed when the latest snapshot no longer has the receipt relationship', async () => {
    const f = fixture();
    const original = f.repo.linkSavedCheck.bind(f.repo);
    vi.spyOn(f.repo, 'linkSavedCheck').mockImplementation(async (...args) => { const result = await original(...args); f.row.data.opportunities = []; return result; });
    await expect(controlLoop(f.repo, owner, action, env)).rejects.toMatchObject({ code: 'LOOP_CHECK_LINK_CONFLICT' });
  });
  it.each(['foreign-owner', 'duplicate-link', 'different-id', 'wrong-source-key', 'missing-record'])('rejects invalid atomic receipt %s', async mode => {
    const f = fixture(), record = { ...f.row, data: { ...f.row.data, opportunities: [linked] } };
    if (mode === 'foreign-owner') record.user_id = 'another-owner';
    if (mode === 'duplicate-link') record.data.opportunities.push({ ...linked, id: 'another-id' });
    if (mode === 'wrong-source-key') record.data.opportunities = [{ ...linked, sourceKey: 'url:not-check' }];
    vi.spyOn(f.repo, 'rpc').mockResolvedValue({ record: mode === 'missing-record' ? null : record, opportunityId: mode === 'different-id' ? 'other' : opportunityId, reused: false });
    await expect(f.repo.linkSavedCheck(owner, 7, 1, checkId, input, true)).rejects.toMatchObject({ code: 'LOOP_CHECK_LINK_INVALID' });
  });
  it('does not overwrite a provenance-bearing vacancy through ordinary URL deduplication', async () => {
    const f = fixture(), sourceKey = `url:${await digest(input.url)}`;
    f.row.data.opportunities = [{ ...linked, sourceKey }];
    await controlLoop(f.repo, owner, { action: 'add_opportunity', expectedVersion: 1, opportunity: { ...input, title: 'Different manual role' } }, env);
    expect(f.row.data.opportunities).toHaveLength(2);
    expect(f.row.data.opportunities[0]).toEqual({ ...linked, sourceKey });
    expect(f.row.data.opportunities[1].sourceCheckId).toBeUndefined();
  });
  it.each(['LOOP_CHECK_UNAVAILABLE','LOOP_CHECK_SOURCE_CHANGED','LOOP_CHECK_LINK_CONFLICT','LOOP_CHECK_LINK_CONSENT','LOOP_OPPORTUNITY_LIMIT'])('maps database refusal %s without returning private detail', async code => {
    const repo = new LoopRepository({ rpc: vi.fn(async () => ({ data: null, error: { message: `${code}: private source text must not escape` } })) } as never);
    await expect(repo.linkSavedCheck(owner, 7, 1, checkId, input, true)).rejects.toMatchObject({ code });
    await expect(repo.linkSavedCheck(owner, 7, 1, checkId, input, true)).rejects.not.toThrow('private source text');
  });
});
