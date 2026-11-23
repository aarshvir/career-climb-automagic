// Shared helper for the deterministic virtual-time tests (not a test file: vitest only runs *.test.ts).
//
// Why it exists. Fake timers make `Date` and the timers virtual, but some code under test also waits on REAL asynchronous
// work. On the discovery path that work is `crypto.subtle.digest`, awaited by `stableUuid` for every retained opportunity:
// it runs on the thread pool and finishes only after real event-loop turns. A loop that just steps virtual time
// (`await vi.advanceTimersByTimeAsync(100)` again and again) lets the virtual clock run AHEAD of that real work: under a loaded
// CI runner the digest finishes late in virtual terms, the next board starts after the budget can no longer cover it, and it is
// reported "skipped" instead of read. Injecting even 20 ms of real digest latency made the old stepping fail every time.
//
// What it does. `virtually` advances virtual time and real work TOGETHER: after every virtual step it yields real event-loop
// turns until no digest is in flight. The assertions, tolerances and the exact budget boundaries of the tests are untouched.
import { vi } from 'vitest';

/** A real macrotask yield, captured when this module loads, BEFORE any fake timers exist (vitest fakes setImmediate by default). */
const realSetImmediate = globalThis.setImmediate.bind(globalThis);
export const realYield = (): Promise<void> => new Promise<void>(resolve => realSetImmediate(resolve));

let inFlight = 0;
/** Digests currently running on the real thread pool (0 when nothing real is outstanding). */
export const realWorkInFlight = (): number => inFlight;

/** Wraps `crypto.subtle.digest` so every call is counted while it runs. Returns the function that removes the wrapper again. */
function trackDigests(): () => void {
  const subtle = globalThis.crypto.subtle as unknown as { digest: (...args: unknown[]) => Promise<ArrayBuffer> };
  const hadOwn = Object.prototype.hasOwnProperty.call(subtle, 'digest');
  const previous = Object.getOwnPropertyDescriptor(subtle, 'digest');
  const original = subtle.digest;
  Object.defineProperty(subtle, 'digest', {
    configurable: true, writable: true,
    value: function counted(this: unknown, ...args: unknown[]) {
      inFlight++;
      const result = original.apply(subtle, args);
      result.then(() => { inFlight--; }, () => { inFlight--; });
      return result;
    },
  });
  return () => { if (hadOwn && previous) Object.defineProperty(subtle, 'digest', previous); else delete (subtle as { digest?: unknown }).digest; };
}

/** Yields real event-loop turns until no tracked real work is outstanding. */
export async function settleRealWork(): Promise<void> {
  do { await realYield(); } while (inFlight > 0);
}

/**
 * Drives `work` to completion in virtual time: advances the fake clock `stepMs` at a time and, after every step, lets all real
 * asynchronous work (digests) finish before the next step. Requires `vi.useFakeTimers(...)` to be installed by the caller.
 */
export async function virtually<T>(work: Promise<T>, stepMs = 100, maxSteps = 6000): Promise<T> {
  const untrack = trackDigests();
  try {
    let done = false;
    const tracked = work.finally(() => { done = true; });
    for (let step = 0; !done && step < maxSteps; step++) {
      await vi.advanceTimersByTimeAsync(stepMs);
      await settleRealWork();
    }
    return await tracked;
  } finally { untrack(); }
}
