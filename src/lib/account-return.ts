import { isSavedCheckContinuationPath, type SavedCheckContinuationPath } from './saved-check-continuation';
import { isApplicationSourcePath, type ApplicationSourcePath } from './application-source-selection';
import { passPlans, type PassPlanKey } from './pass-plans';

const KEY = 'jobvance_account_return_v1';
const TTL = 30 * 60 * 1000;
type LoopReturn = '/loop' | '/loop?audience=student' | '/loop?audience=mba' | '/loop?audience=professional';
const loopPaths: readonly string[] = ['/loop', '/loop?audience=student', '/loop?audience=mba', '/loop?audience=professional'];
type AdminReturn = '/admin' | '/admin2' | `/admin?days=${7 | 30 | 90}` | `/admin2?days=${7 | 30 | 90}`;
const adminPaths: readonly string[] = ['/admin', '/admin2', '/admin?days=7', '/admin?days=30', '/admin?days=90', '/admin2?days=7', '/admin2?days=30', '/admin2?days=90'];
type WorkspaceReturn = '/dashboard' | `/dashboard?tab=${'cv' | 'tailor' | 'tracker' | 'billing'}`;
const workspacePaths: readonly string[] = ['/dashboard', '/dashboard?tab=cv', '/dashboard?tab=tailor', '/dashboard?tab=tracker', '/dashboard?tab=billing'];
// Choosing a pass while signed out returns to the Pricing page with that plan shown, never to checkout.
type PricingReturn = '/pricing' | `/pricing?plan=${PassPlanKey}`;
const pricingPaths: readonly string[] = ['/pricing', ...passPlans.map(plan => `/pricing?plan=${plan.key}`)];
type PrivateReturn = LoopReturn | AdminReturn | WorkspaceReturn | SavedCheckContinuationPath | ApplicationSourcePath | '/applications' | PricingReturn;
const privateReturnPaths = [...loopPaths, ...adminPaths, ...workspacePaths, '/applications', ...pricingPaths];
const isPrivateReturn = (value: unknown): value is PrivateReturn => typeof value === 'string' && (privateReturnPaths.includes(value) || isSavedCheckContinuationPath(value) || isApplicationSourcePath(value));

/** Carry only the workspace's fixed tab, never other query data or fragments. */
export function workspaceReturnPath(search: string): WorkspaceReturn | ApplicationSourcePath {
  const exact = `/dashboard${search}`;
  if (isApplicationSourcePath(exact)) return exact;
  const tabs = new URLSearchParams(search).getAll('tab');
  const path = `/dashboard?tab=${tabs[0] ?? ''}`;
  return tabs.length === 1 && workspacePaths.includes(path) ? path as WorkspaceReturn : '/dashboard';
}

/** Bounded destinations and opaque selectors only; never CV text or tokens. */
export function accountDestination(value: string | null): PrivateReturn | '/check' {
  return isPrivateReturn(value) ? value : value === '/check' ? '/check' : '/dashboard';
}

export function rememberLoopReturn(value: string | null, now = Date.now()): void {
  try {
    if (isPrivateReturn(value)) sessionStorage.setItem(KEY, JSON.stringify({ path: value, expiresAt: now + TTL }));
    else sessionStorage.removeItem(KEY);
  } catch { /* Signing in still works when tab storage is unavailable. */ }
}

export function takeLoopReturn(now = Date.now()): PrivateReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw || raw.length > 200) return null;
    const value = JSON.parse(raw);
    return isPrivateReturn(value.path) && typeof value.expiresAt === 'number' && value.expiresAt > now && value.expiresAt <= now + TTL ? value.path : null;
  } catch { return null; }
}
