const KEY = 'jobvance_account_return_v1';
const TTL = 30 * 60 * 1000;

/** Fixed destinations only. No CV, tokens or user input are retained here. */
export function accountDestination(value: string | null): '/loop' | '/check' | '/dashboard' {
  return value === '/loop' || value === '/check' ? value : '/dashboard';
}

export function rememberLoopReturn(value: string | null, now = Date.now()): void {
  try {
    if (value === '/loop') sessionStorage.setItem(KEY, JSON.stringify({ path: '/loop', expiresAt: now + TTL }));
    else sessionStorage.removeItem(KEY);
  } catch { /* Signing in still works when tab storage is unavailable. */ }
}

export function takeLoopReturn(now = Date.now()): '/loop' | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw || raw.length > 200) return null;
    const value = JSON.parse(raw);
    return value.path === '/loop' && typeof value.expiresAt === 'number' && value.expiresAt > now && value.expiresAt <= now + TTL ? '/loop' : null;
  } catch { return null; }
}
