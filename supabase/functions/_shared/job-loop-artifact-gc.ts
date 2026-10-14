import { ApiError } from './core.ts';
import { validLoopGeneration } from './job-loop-request.ts';

/** The repository owns the fixed job-loop-artifacts bucket. Neither callers nor
 * claim rows can select a bucket, endpoint, provider or document content. */
export interface LoopArtifactGcAdapter {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
  remove(paths: string[]): Promise<{ error: unknown }>;
}

export interface LoopArtifactGcResult {
  batches: number;
  claimed: number;
  /** Database-confirmed absence and closed-path settlement, not deleted bytes. */
  settled: number;
  /** More eligible work may remain; this is not a whole-bucket completion flag. */
  reachedBatchLimit: boolean;
}

interface Claim { user_id: string; path: string; generation: number; token: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const KEYS = new Set(['pdf', 'docx', 'txt', 'report', 'letter']);
const CLAIM_SIZE = 200;
const REMOVE_SIZE = 100;
const MAX_BATCHES = 5;
const invalid = () => new ApiError(503, 'LOOP_GC_INVALID_BATCH', 'Document cleanup received an invalid claim. No unvalidated paths were removed.');
const retry = () => new ApiError(503, 'LOOP_GC_RETRY', 'Document cleanup could not be confirmed. Its durable claims remain available for a later retry.');

function checkedClaims(value: unknown, token: string, seen: Set<string>): Claim[] {
  if (!Array.isArray(value) || value.length > CLAIM_SIZE) throw invalid();
  const claims: Claim[] = [];
  const batchPaths = new Set<string>();
  const generations = new Map<string, number>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
    const row = raw as Record<string, unknown>;
    if (typeof row.user_id !== 'string' || !UUID.test(row.user_id) || typeof row.path !== 'string' ||
      typeof row.token !== 'string' || row.token !== token || !validLoopGeneration(row.generation)) throw invalid();
    const parts = row.path.split('/');
    if (parts.length !== 4 || parts[0] !== row.user_id || !UUID.test(parts[1]) ||
      !HASH.test(parts[2]) || !KEYS.has(parts[3]) || batchPaths.has(row.path) || seen.has(row.path)) throw invalid();
    const priorGeneration = generations.get(row.user_id);
    if (priorGeneration !== undefined && priorGeneration !== row.generation) throw invalid();
    generations.set(row.user_id, row.generation);
    batchPaths.add(row.path);
    claims.push({ user_id: row.user_id, path: row.path, generation: row.generation, token });
  }
  // Nothing in this batch reaches Storage until every row is validated.
  for (const path of batchPaths) seen.add(path);
  return claims;
}

/** Collect only durable server claims. SQL owns terminal-run eligibility,
 * synthetic-owner gating, all-status reference exclusion and the persistent
 * closed-path fence. A timeout never releases that fence or permits path reuse.
 * No listing, offset cursor, object downloads or third-party calls occur here.
 */
export async function collectLoopArtifacts(adapter: LoopArtifactGcAdapter): Promise<LoopArtifactGcResult> {
  const token = crypto.randomUUID();
  if (!UUID.test(token)) throw invalid();
  const result: LoopArtifactGcResult = { batches: 0, claimed: 0, settled: 0, reachedBatchLimit: false };
  const seen = new Set<string>();
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const claims = checkedClaims(await adapter.rpc<unknown>('job_loop_gc_claim', { p_token: token, p_limit: CLAIM_SIZE }), token, seen);
    result.batches++;
    if (!claims.length) return result;
    result.claimed += claims.length;
    for (let at = 0; at < claims.length; at += REMOVE_SIZE) {
      const chunk = claims.slice(at, at + REMOVE_SIZE);
      try {
        const removed = await adapter.remove(chunk.map(claim => claim.path));
        if (!removed || typeof removed !== 'object' || Array.isArray(removed) ||
          !Object.prototype.hasOwnProperty.call(removed, 'error') || removed.error !== null) throw retry();
      } catch {
        // An error may follow a partial remote deletion. Do not settle or
        // release the claim; a later claim/finish checks actual object absence.
        throw retry();
      }
      const groups = new Map<string, { user: string; generation: number; paths: string[] }>();
      for (const claim of chunk) {
        const key = `${claim.user_id}:${claim.generation}`;
        const group = groups.get(key) ?? { user: claim.user_id, generation: claim.generation, paths: [] };
        group.paths.push(claim.path);
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        // The RPC must verify current token/generation, absence in Storage and
        // absence from every packet manifest atomically before marking settled.
        const settled = await adapter.rpc<unknown>('job_loop_gc_finish', { p_user: group.user, p_generation: group.generation, p_token: token, p_paths: group.paths });
        if (typeof settled !== 'number' || !Number.isSafeInteger(settled) || settled !== group.paths.length) throw retry();
        result.settled += settled;
      }
    }
  }
  result.reachedBatchLimit = true;
  return result;
}
