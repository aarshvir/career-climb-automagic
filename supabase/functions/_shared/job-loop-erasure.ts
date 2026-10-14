import { ApiError, uuid } from './core.ts';

export interface LoopErasureAdapter {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
  remove(paths: string[]): Promise<{ error: unknown }>;
}

const BATCH_SIZE = 200;
const REMOVE_SIZE = 100;
const MAX_BATCHES = 5;
const retry = () => new ApiError(503, 'LOOP_ERASURE_RETRY', 'Preparation is stopped and documents are revoked. Erasure is still in progress. Retry to continue.');

function checkedPaths(value: unknown, owner: string): string[] {
  if (!Array.isArray(value) || value.length > BATCH_SIZE) throw retry();
  const paths: string[] = [];
  for (const path of value) {
    if (typeof path !== 'string' || path.length > 1024 || !path.startsWith(`${owner}/`) ||
      /[\\\u0000-\u001f\u007f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new ApiError(503, 'LOOP_ERASURE_PATH', 'A private storage path could not be safely erased. Erasure remains in progress.');
    }
    paths.push(path);
  }
  if (new Set(paths).size !== paths.length) throw retry();
  return paths;
}

/** Storage deletion is the durable cursor: every retry starts with the first
 * remaining owned objects. The database holds the erasure generation/fence and
 * independently verifies an empty prefix before allowing finish to commit.
 * No browser-supplied cursor, whole-prefix scan or shrinking-list offset is used.
 */
export async function eraseLoopArtifacts(adapter: LoopErasureAdapter, userId: string): Promise<void> {
  const owner = uuid(userId, 'Account');
  const begun = await adapter.rpc<unknown>('job_loop_begin_erase', { p_user: owner });
  const generation = begun && typeof begun === 'object' && !Array.isArray(begun)
    ? (begun as { generation?: unknown }).generation : undefined;
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 1) throw retry();
  const authority = { p_user: owner, p_generation: generation };

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const paths = checkedPaths(await adapter.rpc<unknown>('job_loop_erasure_batch', { ...authority, p_limit: BATCH_SIZE }), owner);
    if (!paths.length) {
      await adapter.rpc('job_loop_finish_erase', authority);
      return;
    }
    for (let index = 0; index < paths.length; index += REMOVE_SIZE) {
      const chunk = paths.slice(index, index + REMOVE_SIZE);
      try {
        const result = await adapter.remove(chunk);
        if (!result || result.error) throw retry();
      } catch {
        // Even an errored response may have deleted some objects. Keep the
        // fence; the next batch query discovers what actually remains.
        throw retry();
      }
      await adapter.rpc('job_loop_erasure_progress', { ...authority, p_removed: chunk.length });
    }
  }

  // The guarded database finish is the final empty-prefix probe. It allows
  // exactly 1,000 removals to complete in this call without a sixth batch read,
  // and must reject with LOOP_ERASURE_RETRY while any owned object remains.
  await adapter.rpc('job_loop_finish_erase', authority);
}
