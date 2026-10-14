const KEY = 'jobvance_account_return_v1';
const TTL = 30 * 60 * 1000;
type LoopReturn = '/loop' | '/loop?audience=student' | '/loop?audience=mba' | '/loop?audience=professional';
const loopPaths: readonly string[] = ['/loop', '/loop?audience=student', '/loop?audience=mba', '/loop?audience=professional'];
type AdminReturn = '/admin' | '/admin2' | `/admin?days=${7 | 30 | 90}` | `/admin2?days=${7 | 30 | 90}`;
const adminPaths: readonly string[] = ['/admin', '/admin2', '/admin?days=7', '/admin?days=30', '/admin?days=90', '/admin2?days=7', '/admin2?days=30', '/admin2?days=90'];
type WorkspaceReturn = '/dashboard' | `/dashboard?tab=${'cv' | 'tailor' | 'tracker' | 'billing'}`;
const workspacePaths: readonly string[] = ['/dashboard', '/dashboard?tab=cv', '/dashboard?tab=tailor', '/dashboard?tab=tracker', '/dashboard?tab=billing'];
type PrivateReturn = LoopReturn | AdminReturn | WorkspaceReturn;
const privateReturnPaths = [...loopPaths, ...adminPaths, ...workspacePaths];

/** Carry only the workspace's fixed tab, never other query data or fragments. */
export function workspaceReturnPath(search: string): WorkspaceReturn {
  const tabs = new URLSearchParams(search).getAll('tab');
  const path = `/dashboard?tab=${tabs[0] ?? ''}`;
  return tabs.length === 1 && workspacePaths.includes(path) ? path as WorkspaceReturn : '/dashboard';
}

/** Fixed destinations only. No CV, tokens or user input are retained here. */
export function accountDestination(value: string | null): PrivateReturn | '/check' {
  return privateReturnPaths.includes(value) ? value as PrivateReturn : value === '/check' ? '/check' : '/dashboard';
}

export function rememberLoopReturn(value: string | null, now = Date.now()): void {
  try {
    if (privateReturnPaths.includes(value)) sessionStorage.setItem(KEY, JSON.stringify({ path: value, expiresAt: now + TTL }));
    else sessionStorage.removeItem(KEY);
  } catch { /* Signing in still works when tab storage is unavailable. */ }
}

export function takeLoopReturn(now = Date.now()): PrivateReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw || raw.length > 200) return null;
    const value = JSON.parse(raw);
    return privateReturnPaths.includes(value.path) && typeof value.expiresAt === 'number' && value.expiresAt > now && value.expiresAt <= now + TTL ? value.path as PrivateReturn : null;
  } catch { return null; }
}
