const KEY = 'jobvance_account_return_v1';
const TTL = 30 * 60 * 1000;
type LoopReturn = '/loop' | '/loop?audience=student' | '/loop?audience=mba' | '/loop?audience=professional';
const loopPaths: readonly string[] = ['/loop', '/loop?audience=student', '/loop?audience=mba', '/loop?audience=professional'];
type AdminReturn = '/admin' | '/admin2' | `/admin?days=${7 | 30 | 90}` | `/admin2?days=${7 | 30 | 90}`;
const adminPaths: readonly string[] = ['/admin', '/admin2', '/admin?days=7', '/admin?days=30', '/admin?days=90', '/admin2?days=7', '/admin2?days=30', '/admin2?days=90'];
const privateReturnPaths = [...loopPaths, ...adminPaths];

/** Fixed destinations only. No CV, tokens or user input are retained here. */
export function accountDestination(value: string | null): LoopReturn | AdminReturn | '/check' | '/dashboard' {
  return privateReturnPaths.includes(value) ? value as LoopReturn | AdminReturn : value === '/check' ? '/check' : '/dashboard';
}

export function rememberLoopReturn(value: string | null, now = Date.now()): void {
  try {
    if (privateReturnPaths.includes(value)) sessionStorage.setItem(KEY, JSON.stringify({ path: value, expiresAt: now + TTL }));
    else sessionStorage.removeItem(KEY);
  } catch { /* Signing in still works when tab storage is unavailable. */ }
}

export function takeLoopReturn(now = Date.now()): LoopReturn | AdminReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw || raw.length > 200) return null;
    const value = JSON.parse(raw);
    return privateReturnPaths.includes(value.path) && typeof value.expiresAt === 'number' && value.expiresAt > now && value.expiresAt <= now + TTL ? value.path as LoopReturn | AdminReturn : null;
  } catch { return null; }
}
