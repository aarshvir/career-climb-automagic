// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../functions/_shared/core.ts';
import { eraseLoopArtifacts, type LoopErasureAdapter } from '../functions/_shared/job-loop-erasure.ts';

const owner = '11111111-1111-4111-a111-111111111111';
const other = '22222222-2222-4222-a222-222222222222';
function path(index: number, user = owner) { return `${user}/packet-${String(index).padStart(5, '0')}/${'a'.repeat(64)}/txt`; }

function fixture(count: number) {
  const objects = new Set(Array.from({ length: count }, (_, index) => path(index)));
  objects.add(path(0, other));
  let completed = false;
  let fence = false;
  let removed = 0;
  let generation = 7;
  let nextBatch: unknown;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const remove = vi.fn(async (paths: string[]): Promise<{ error: unknown }> => {
    for (const selected of paths) objects.delete(selected);
    return { error: null };
  });
  const rpc: LoopErasureAdapter['rpc'] = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    expect(args.p_user).toBe(owner);
    if (name === 'job_loop_begin_erase') {
      fence = true;
      return { generation } as T;
    }
    expect(fence).toBe(true);
    expect(args.p_generation).toBe(generation);
    if (name === 'job_loop_erasure_batch') {
      expect(args.p_limit).toBe(200);
      expect(args).not.toHaveProperty('offset');
      expect(args).not.toHaveProperty('cursor');
      return (nextBatch === undefined ? [...objects].filter(item => item.startsWith(`${owner}/`)).sort().slice(0, 200) : nextBatch) as T;
    }
    if (name === 'job_loop_erasure_progress') {
      expect(args.p_removed).toBeGreaterThan(0);
      expect(args.p_removed).toBeLessThanOrEqual(100);
      removed += Number(args.p_removed);
      return undefined as T;
    }
    if (name === 'job_loop_finish_erase') {
      if ([...objects].some(item => item.startsWith(`${owner}/`))) {
        throw new ApiError(503, 'LOOP_ERASURE_RETRY', 'Objects remain; the fence is retained.');
      }
      completed = true;
      fence = false;
      return undefined as T;
    }
    throw new Error(`Unexpected fixture RPC: ${name}`);
  };
  return {
    adapter: { rpc, remove } satisfies LoopErasureAdapter, objects, remove, calls,
    ownedCount: () => [...objects].filter(item => item.startsWith(`${owner}/`)).length,
    completed: () => completed, fenced: () => fence, progress: () => removed,
    returnBatch: (value: unknown) => { nextBatch = value; },
    returnGeneration: (value: number) => { generation = value; },
  };
}

describe('bounded, owner-bound Job Loop storage erasure', () => {
  it('erases more than 10,000 objects through bounded retries which each make progress under the same generation', async () => {
    const h = fixture(10_001);
    let attempts = 0;
    while (!h.completed() && attempts < 12) {
      const before = h.ownedCount(), callStart = h.calls.length, removeStart = h.remove.mock.calls.length;
      try { await eraseLoopArtifacts(h.adapter, owner); }
      catch (error) {
        expect(error).toMatchObject({ status: 503, code: 'LOOP_ERASURE_RETRY' });
        expect(h.fenced()).toBe(true);
      }
      attempts++;
      expect(h.ownedCount()).toBeLessThan(before);
      expect(before - h.ownedCount()).toBeLessThanOrEqual(1000);
      expect(h.calls.slice(callStart).filter(call => call.name === 'job_loop_erasure_batch').length).toBeLessThanOrEqual(5);
      for (const [paths] of h.remove.mock.calls.slice(removeStart)) {
        expect(paths.length).toBeLessThanOrEqual(100);
        expect(paths.every(item => item.startsWith(`${owner}/`))).toBe(true);
      }
    }
    expect(attempts).toBe(11);
    expect(h.completed()).toBe(true);
    expect(h.ownedCount()).toBe(0);
    expect(h.objects).toEqual(new Set([path(0, other)]));
    expect(h.progress()).toBe(10_001);
    expect(h.calls.filter(call => call.name !== 'job_loop_begin_erase').every(call => call.args.p_generation === 7)).toBe(true);
  });

  it.each([0, 199, 200, 1000])('finishes %i objects in one bounded call, including a completely full final batch', async count => {
    const h = fixture(count);
    await eraseLoopArtifacts(h.adapter, owner);
    expect(h.completed()).toBe(true);
    expect(h.ownedCount()).toBe(0);
    expect(h.objects.has(path(0, other))).toBe(true);
    expect(h.calls.filter(call => call.name === 'job_loop_erasure_batch').length).toBeLessThanOrEqual(5);
    expect(h.calls.at(-1)?.name).toBe('job_loop_finish_erase');
  });

  it('resumes actual remaining objects after a storage error partially deletes a chunk, without claiming completion', async () => {
    const h = fixture(800);
    h.remove.mockImplementationOnce(async paths => {
      for (const selected of paths) h.objects.delete(selected);
      return { error: null };
    }).mockImplementationOnce(async paths => {
      for (const selected of paths.slice(0, 35)) h.objects.delete(selected);
      return { error: new Error('Synthetic storage interruption after partial deletion') };
    });
    await expect(eraseLoopArtifacts(h.adapter, owner)).rejects.toMatchObject({ status: 503, code: 'LOOP_ERASURE_RETRY' });
    expect(h.ownedCount()).toBe(665);
    expect(h.progress()).toBe(100);
    expect(h.completed()).toBe(false);
    expect(h.fenced()).toBe(true);
    expect(h.calls.some(call => call.name === 'job_loop_finish_erase')).toBe(false);
    await eraseLoopArtifacts(h.adapter, owner);
    expect(h.completed()).toBe(true);
    expect(h.ownedCount()).toBe(0);
    expect(h.objects).toEqual(new Set([path(0, other)]));
    expect(h.progress()).toBe(765); // An uncertain partial response is not an exact deletion receipt.
    expect(h.calls.filter(call => call.name !== 'job_loop_begin_erase').every(call => call.args.p_generation === 7)).toBe(true);
  });

  it('keeps the fence without progress or finish when Storage throws', async () => {
    const h = fixture(20);
    h.remove.mockRejectedValueOnce(new Error('Synthetic network timeout'));
    await expect(eraseLoopArtifacts(h.adapter, owner)).rejects.toMatchObject({ status: 503, code: 'LOOP_ERASURE_RETRY' });
    expect(h.ownedCount()).toBe(20);
    expect(h.fenced()).toBe(true);
    expect(h.progress()).toBe(0);
    expect(h.calls.some(call => call.name === 'job_loop_finish_erase')).toBe(false);
  });

  it.each([
    `${other}/packet/hash/txt`, `${owner}-extra/packet/hash/txt`, `${owner}/../${other}/txt`,
    `${owner}//txt`, `${owner}/packet/./txt`, `${owner}/packet\\..\\txt`, `${owner}/packet/\u0000txt`,
    `${owner}/`, owner, null,
  ])('rejects a malicious or non-owned path before removing any object in its batch: %s', async badPath => {
    const h = fixture(1);
    h.returnBatch([path(0), badPath]);
    await expect(eraseLoopArtifacts(h.adapter, owner)).rejects.toMatchObject({ status: 503, code: 'LOOP_ERASURE_PATH' });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.fenced()).toBe(true);
    expect(h.completed()).toBe(false);
    expect(h.objects.has(path(0, other))).toBe(true);
  });

  it.each([
    { response: {} }, { response: null }, { response: ['not-a-path'] },
    { response: Array.from({ length: 201 }, (_, index) => path(index)) },
    { response: [path(0), path(0)] },
  ])('fails closed on an invalid bounded batch response', async ({ response }) => {
    const h = fixture(1);
    h.returnBatch(response);
    await expect(eraseLoopArtifacts(h.adapter, owner)).rejects.toMatchObject({ status: 503 });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.completed()).toBe(false);
    expect(h.fenced()).toBe(true);
  });

  it.each([0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('refuses an unusable generation before requesting paths', async generation => {
    const h = fixture(1); h.returnGeneration(generation);
    await expect(eraseLoopArtifacts(h.adapter, owner)).rejects.toMatchObject({ status: 503, code: 'LOOP_ERASURE_RETRY' });
    expect(h.calls).toHaveLength(1);
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.fenced()).toBe(true);
  });

  it('rejects a non-UUID owner before calling privileged cleanup', async () => {
    const h = fixture(1);
    await expect(eraseLoopArtifacts(h.adapter, `${owner}/../${other}`)).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' });
    expect(h.calls).toHaveLength(0);
    expect(h.remove).not.toHaveBeenCalled();
  });
});
