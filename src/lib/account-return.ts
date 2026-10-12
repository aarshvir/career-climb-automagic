const KEY = 'jobvance_account_return_v1';
const TTL = 30 * 60 * 1000;
type LoopReturn = '/loop' | '/loop?audience=student' | '/loop?audience=mba' | '/loop?audience=professional';
const loopPaths: readonly string[] = ['/loop', '/loop?audience=student', '/loop?audience=mba', '/loop?audience=professional'];

/** Fixed destinations only. No CV, tokens or user input are retained here. */
export function accountDestination(value: string | null): LoopReturn | '/check' | '/dashboard' {
  return loopPaths.includes(value) ? value as LoopReturn : value === '/check' ? '/check' : '/dashboard';
}

export function rememberLoopReturn(value: string | null, now = Date.now()): void {
  try {
    if (loopPaths.includes(value)) sessionStorage.setItem(KEY, JSON.stringify({ path: value, expiresAt: now + TTL }));
    else sessionStorage.removeItem(KEY);
  } catch { /* Signing in still works when tab storage is unavailable. */ }
}

export function takeLoopReturn(now = Date.now()): LoopReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw || raw.length > 200) return null;
    const value = JSON.parse(raw);
    return loopPaths.includes(value.path) && typeof value.expiresAt === 'number' && value.expiresAt > now && value.expiresAt <= now + TTL ? value.path as LoopReturn : null;
  } catch { return null; }
}
