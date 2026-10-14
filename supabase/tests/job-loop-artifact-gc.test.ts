// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../functions/_shared/core.ts';
import { collectLoopArtifacts, type LoopArtifactGcAdapter } from '../functions/_shared/job-loop-artifact-gc.ts';

const owner = '11111111-1111-4111-a111-111111111111';
const other = '22222222-2222-4222-a222-222222222222';
const oldToken = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const keys = ['pdf', 'docx', 'txt', 'report', 'letter'];
function path(index: number, user = owner) {
  return `${user}/33333333-3333-4333-a333-${index.toString(16).padStart(12, '0')}/${index.toString(16).padStart(64, '0')}/${keys[index % keys.length]}`;
}
interface Grant { user_id: string; path: string; generation: number; token: string | null; until: number; state: 'available' | 'claimed' | 'collected' }

/** Synthetic in-memory durable claims and Storage only. SQL eligibility, actual
 * transactions, triggers, scheduler authentication and gates have separate tests. */
function fixture(count: number, mixedOwners = false) {
  const generations = new Map([[owner, 0], [other, 7]]);
  const grants: Grant[] = Array.from({ length: count }, (_, index) => {
    const user = mixedOwners && index % 2 ? other : owner;
    return { user_id: user, path: path(index, user), generation: generations.get(user)!, token: null, until: 0, state: 'available' };
  });
  const objects = new Set(grants.map(row => row.path));
  const grantIndex = new Map(grants.map(row => [row.path, row]));
  const referenced = new Set<string>();
  let now = 1, enabled = true;
  let overrideBatch = false, batchValue: unknown;
  let overrideFinish = false, finishValue: unknown;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const remove = vi.fn(async (selected: string[]): Promise<{ error: unknown }> => {
    for (const item of selected) objects.delete(item);
    return { error: null };
  });
  const rpc: LoopArtifactGcAdapter['rpc'] = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args: structuredClone(args) });
    if (name === 'job_loop_gc_claim') {
      expect(args.p_limit).toBe(200);
      expect(typeof args.p_token).toBe('string');
      expect(args).not.toHaveProperty('p_user');
      expect(args).not.toHaveProperty('offset');
      expect(args).not.toHaveProperty('cursor');
      if (overrideBatch) return (typeof batchValue === 'function' ? batchValue(args.p_token) : batchValue) as T;
      if (!enabled) return [] as T;
      const selected = grants.filter(row => row.state !== 'collected' && !referenced.has(row.path) &&
        row.generation === generations.get(row.user_id) &&
        (row.state === 'available' || row.token === args.p_token || row.until <= now)).slice(0, 200);
      for (const row of selected) { row.state = 'claimed'; row.token = args.p_token as string; row.until = now + 10; }
      return selected.map(({ user_id, path: selectedPath, generation, token }) => ({ user_id, path: selectedPath, generation, token })) as T;
    }
    if (name === 'job_loop_gc_finish') {
      if (overrideFinish) return finishValue as T;
      const selected = args.p_paths as string[];
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.length).toBeLessThanOrEqual(100);
      const rows = selected.map(item => grantIndex.get(item));
      if (generations.get(args.p_user as string) !== args.p_generation || rows.some(row => !row ||
        row.user_id !== args.p_user || row.generation !== args.p_generation || row.token !== args.p_token ||
        (row.state !== 'collected' && row.until <= now))) throw new ApiError(409, 'LOOP_GC_STALE', 'Synthetic stale collection claim');
      if (selected.some(item => objects.has(item) || referenced.has(item))) throw new ApiError(503, 'LOOP_GC_RETRY', 'Synthetic guarded absence/reference check');
      for (const row of rows) row!.state = 'collected';
      return selected.length as T;
    }
    throw new Error(`Unexpected fixture RPC: ${name}`);
  };
  return {
    adapter: { rpc, remove } satisfies LoopArtifactGcAdapter, grants, objects, referenced, calls, remove, generations,
    completed: () => grants.filter(row => row.state === 'collected').length,
    expire: () => { now += 11; },
    disabled: () => { enabled = false; },
    returnBatch: (value: unknown) => { overrideBatch = true; batchValue = value; },
    returnFinish: (value: unknown) => { overrideFinish = true; finishValue = value; },
  };
}

describe('bounded terminal-artifact collection orchestration', () => {
  it('settles more than 10,000 synthetic grants across bounded invocations without shrinking-list offsets', async () => {
    const h = fixture(10_001);
    h.objects.add(path(30_000, other)); // Unclaimed objects are never traversed.
    let invocations = 0, totalSettled = 0;
    while (h.completed() < h.grants.length && invocations < 12) {
      const callStart = h.calls.length, removeStart = h.remove.mock.calls.length;
      const result = await collectLoopArtifacts(h.adapter);
      invocations++;
      totalSettled += result.settled;
      expect(result.claimed).toBe(result.settled);
      expect(result.claimed).toBeGreaterThan(0);
      expect(result.claimed).toBeLessThanOrEqual(1000);
      expect(result.batches).toBeLessThanOrEqual(5);
      expect(h.calls.slice(callStart).filter(call => call.name === 'job_loop_gc_claim')).toHaveLength(result.batches);
      expect(new Set(h.calls.slice(callStart).map(call => call.args.p_token)).size).toBe(1);
      expect(result.reachedBatchLimit).toBe(invocations < 11);
      for (const [selected] of h.remove.mock.calls.slice(removeStart)) expect(selected.length).toBeLessThanOrEqual(100);
    }
    expect(invocations).toBe(11);
    expect(totalSettled).toBe(10_001);
    expect(h.objects).toEqual(new Set([path(30_000, other)]));
    expect(h.grants.every(row => row.state === 'collected' && !!row.token)).toBe(true);
  });

  it.each([0, 1, 99, 100, 199, 200, 999, 1000])('bounds an invocation with %i eligible grants, including a full last batch', async count => {
    const h = fixture(count);
    const result = await collectLoopArtifacts(h.adapter);
    expect(result).toMatchObject({ claimed: count, settled: count, reachedBatchLimit: count > 800 });
    expect(result.batches).toBeLessThanOrEqual(5);
    expect(h.completed()).toBe(count);
    expect(h.objects.size).toBe(0);
  });

  it('groups settlement by exact owner and generation and accepts first-lifetime generation zero', async () => {
    const h = fixture(8, true);
    const result = await collectLoopArtifacts(h.adapter);
    expect(result.settled).toBe(8);
    const finishes = h.calls.filter(call => call.name === 'job_loop_gc_finish');
    expect(finishes).toHaveLength(2);
    expect(finishes.map(call => [call.args.p_user, call.args.p_generation])).toEqual([[owner, 0], [other, 7]]);
    for (const call of finishes) expect((call.args.p_paths as string[]).every(item => item.startsWith(`${call.args.p_user}/`))).toBe(true);
  });

  it('does no Storage or finish work when the authoritative gate returns no claims', async () => {
    const h = fixture(5); h.disabled();
    expect(await collectLoopArtifacts(h.adapter)).toEqual({ batches: 1, claimed: 0, settled: 0, reachedBatchLimit: false });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.calls.map(call => call.name)).toEqual(['job_loop_gc_claim']);
    expect(h.grants.every(row => row.state === 'available')).toBe(true);
  });

  it('retains claims after partial uncertain removal and settles actual absence after lease reassignment', async () => {
    const h = fixture(220);
    h.remove.mockImplementationOnce(async selected => { selected.forEach(item => h.objects.delete(item)); return { error: null }; })
      .mockImplementationOnce(async selected => { selected.slice(0, 35).forEach(item => h.objects.delete(item)); return { error: new Error('Synthetic lost response') }; });
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ status: 503, code: 'LOOP_GC_RETRY' });
    expect(h.completed()).toBe(100);
    expect(h.objects.size).toBe(85);
    expect(h.grants.slice(100, 200).every(row => row.state === 'claimed')).toBe(true);
    expect(h.calls.filter(call => call.name === 'job_loop_gc_finish')).toHaveLength(1);
    const token = h.grants[100].token;
    h.expire();
    const result = await collectLoopArtifacts(h.adapter);
    expect(result.settled).toBe(120); // Includes absence after the uncertain partial response.
    expect(h.completed()).toBe(220);
    expect(h.objects.size).toBe(0);
    expect(h.grants[100].token).not.toBe(token);
  });

  it.each([undefined, null, {}, [], { error: undefined }, { error: false }, { error: 'Synthetic Storage error' }])('does not settle an uncertain Storage response: %s', async response => {
    const h = fixture(3);
    h.remove.mockResolvedValueOnce(response as { error: unknown });
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ status: 503, code: 'LOOP_GC_RETRY' });
    expect(h.completed()).toBe(0);
    expect(h.calls.some(call => call.name === 'job_loop_gc_finish')).toBe(false);
    expect(h.grants.every(row => row.state === 'claimed')).toBe(true);
  });

  it('does not settle or release claims when Storage throws', async () => {
    const h = fixture(4);
    h.remove.mockRejectedValueOnce(new Error('Synthetic connection loss'));
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ status: 503, code: 'LOOP_GC_RETRY' });
    expect(h.completed()).toBe(0);
    expect(h.objects.size).toBe(4);
    expect(h.calls.map(call => call.name)).toEqual(['job_loop_gc_claim']);
  });

  it('requires the independent database absence check even after a successful Storage response', async () => {
    const h = fixture(5);
    h.remove.mockResolvedValueOnce({ error: null }); // Claims success but leaves objects in the fixture.
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ status: 503, code: 'LOOP_GC_RETRY' });
    expect(h.completed()).toBe(0);
    expect(h.objects.size).toBe(5);
  });

  it('does not turn a new packet reference into a successful settlement', async () => {
    const h = fixture(2);
    h.remove.mockImplementationOnce(async selected => { selected.forEach(item => h.objects.delete(item)); h.referenced.add(selected[0]); return { error: null }; });
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ code: 'LOOP_GC_RETRY' });
    expect(h.completed()).toBe(0);
  });

  it.each([false, true])('cannot settle an expired claim even when reassignment is %s', async reassigned => {
    const h = fixture(2);
    h.remove.mockImplementationOnce(async selected => {
      selected.forEach(item => h.objects.delete(item));
      h.expire();
      if (reassigned) h.grants.forEach(row => { row.token = oldToken; });
      return { error: null };
    });
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ status: 409, code: 'LOOP_GC_STALE' });
    expect(h.completed()).toBe(0);
    expect(h.grants.every(row => reassigned ? row.token === oldToken : row.token !== oldToken)).toBe(true);
  });

  it('does not settle an old owner generation after erasure and fresh setup', async () => {
    const h = fixture(2);
    h.remove.mockImplementationOnce(async selected => { selected.forEach(item => h.objects.delete(item)); h.generations.set(owner, 2); return { error: null }; });
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ status: 409, code: 'LOOP_GC_STALE' });
    expect(h.completed()).toBe(0);
    expect(h.generations.get(owner)).toBe(2);
  });

  it.each([undefined, null, '2', 0, 1, 3, 0.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 1, { settled: 2 }])('does not infer a complete settlement from malformed or partial finish count %s', async count => {
    const h = fixture(2); h.returnFinish(count);
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ status: 503, code: 'LOOP_GC_RETRY' });
    expect(h.completed()).toBe(0);
    expect(h.grants.every(row => row.state === 'claimed')).toBe(true);
  });

  const mutations: [string, (row: Record<string, unknown>) => Record<string, unknown>][] = [
    ['different path owner', row => ({ ...row, path: path(1, other) })],
    ['noncanonical owner', row => ({ ...row, user_id: owner.toUpperCase() })],
    ['malformed owner', row => ({ ...row, user_id: 'not-an-owner' })],
    ['wrong token', row => ({ ...row, token: oldToken })],
    ['missing token', row => ({ ...row, token: undefined })],
    ['negative generation', row => ({ ...row, generation: -1 })],
    ['string generation', row => ({ ...row, generation: '0' })],
    ['fractional generation', row => ({ ...row, generation: 0.5 })],
    ['missing generation', row => ({ ...row, generation: undefined })],
    ['unsafe generation', row => ({ ...row, generation: Number.MAX_SAFE_INTEGER + 1 })],
    ['traversal', row => ({ ...row, path: `${owner}/../${other}/txt` })],
    ['empty path component', row => ({ ...row, path: path(1).replace('/3333', '//3333') })],
    ['encoded slash', row => ({ ...row, path: path(1).replace('/33333333', '%2f33333333') })],
    ['backslash', row => ({ ...row, path: path(1).replace('/', '\\') })],
    ['extra segment', row => ({ ...row, path: `${path(1)}/extra` })],
    ['noncanonical packet', row => ({ ...row, path: `${owner}/packet/${'a'.repeat(64)}/txt` })],
    ['noncanonical hash', row => ({ ...row, path: `${owner}/33333333-3333-4333-a333-000000000001/${'A'.repeat(64)}/txt` })],
    ['unexpected format', row => ({ ...row, path: path(1).replace(/docx$/, 'html') })],
    ['control character', row => ({ ...row, path: `${path(1)}\u0000` })],
  ];
  it.each(mutations)('validates the entire claim before any deletion: %s', async (_, mutate) => {
    const h = fixture(200);
    h.returnBatch((token: string) => h.grants.map((row, index) => {
      const claim = { user_id: row.user_id, path: row.path, generation: row.generation, token };
      return index === 199 ? mutate(claim) : claim;
    }));
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ status: 503, code: 'LOOP_GC_INVALID_BATCH' });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.calls.some(call => call.name === 'job_loop_gc_finish')).toBe(false);
    expect(h.objects.size).toBe(200);
  });

  it.each([null, undefined, {}, 'paths', [null], [[]]])('rejects a non-batch or non-row response before Storage: %s', async response => {
    const h = fixture(1); h.returnBatch(response);
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ code: 'LOOP_GC_INVALID_BATCH' });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('rejects over-limit and duplicate claims before deleting their first valid path', async () => {
    for (const count of [201, 2]) {
      const h = fixture(count);
      h.returnBatch((token: string) => Array.from({ length: count }, (_, index) => ({ user_id: owner, path: path(count === 2 ? 0 : index), generation: 0, token })));
      await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ code: 'LOOP_GC_INVALID_BATCH' });
      expect(h.remove).not.toHaveBeenCalled();
    }
  });

  it('rejects inconsistent generations for one owner in a batch', async () => {
    const h = fixture(2);
    h.returnBatch((token: string) => h.grants.map((row, index) => ({ user_id: row.user_id, path: row.path, generation: index, token })));
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ code: 'LOOP_GC_INVALID_BATCH' });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('does not repeatedly delete a supposedly settled path returned in a later batch', async () => {
    const h = fixture(1);
    h.returnBatch((token: string) => [{ user_id: owner, path: path(0), generation: 0, token }]);
    h.returnFinish(1);
    await expect(collectLoopArtifacts(h.adapter)).rejects.toMatchObject({ code: 'LOOP_GC_INVALID_BATCH' });
    // Even a misleading settlement acknowledgement cannot allow a second
    // deletion when the same invocation is handed a duplicate path later.
    expect(h.remove).toHaveBeenCalledOnce();
  });
});
