/** Stable, bounded service codes let interrupted privacy work remain reachable. */
export class LoopServiceError extends Error {
  constructor(message: string, public readonly code: string | null) { super(message); this.name = 'LoopServiceError'; }
}
export function loopErasureNeedsContinuation(value: unknown): boolean {
  return value instanceof LoopServiceError && ['LOOP_ERASURE_IN_PROGRESS', 'LOOP_ERASURE_RETRY'].includes(value.code ?? '');
}
