import { isSavedCheckContinuationPath, type SavedCheckContinuationPath } from './saved-check-continuation';
import { isApplicationSourcePath, type ApplicationSourcePath } from './application-source-selection';
import { passPlans, type PassPlanKey } from './pass-plans';
import { subscriptionPlans, type LoopSubscriptionPlan } from './subscription-plans';
import {isLocalizedLoopPricingReturn,type LocalizedLoopPricingReturn} from './loop-local-prices';

const KEY = 'jobvance_account_return_v1';
const TTL = 30 * 60 * 1000;
type LoopReturn = '/loop' | '/loop?audience=student' | '/loop?audience=mba' | '/loop?audience=professional';
const loopPaths: readonly string[] = ['/loop', '/loop?audience=student', '/loop?audience=mba', '/loop?audience=professional'];
const adminSections = ['today', 'growth', 'users', 'revenue', 'marketing', 'operations', 'support'] as const;
type AdminRoot = '/admin' | `/admin/${typeof adminSections[number]}` | '/admin-original' | '/admin2';
type AdminReturn = AdminRoot | `${AdminRoot}?days=${7 | 30 | 90}`;
const adminRoots = ['/admin', ...adminSections.map(section => `/admin/${section}`), '/admin-original', '/admin2'];
const adminPaths: readonly string[] = adminRoots.flatMap(root => [root, ...[7, 30, 90].map(days => `${root}?days=${days}`)]);
type WorkspaceReturn = '/dashboard' | `/dashboard?tab=${'cv' | 'tailor' | 'tracker' | 'billing'}`;
const workspacePaths: readonly string[] = ['/dashboard', '/dashboard?tab=cv', '/dashboard?tab=tailor', '/dashboard?tab=tracker', '/dashboard?tab=billing'];
// Choosing a pass while signed out returns to the Pricing page with that plan shown, never to checkout.
type PricingReturn = '/pricing' | `/pricing?plan=${PassPlanKey}` | `/pricing?loopPlan=${LoopSubscriptionPlan}` | LocalizedLoopPricingReturn;
const pricingPaths: readonly string[] = ['/pricing', ...passPlans.map(plan => `/pricing?plan=${plan.key}`), ...subscriptionPlans.map(plan => `/pricing?loopPlan=${plan.id}`)];
type PrivateReturn = LoopReturn | AdminReturn | WorkspaceReturn | SavedCheckContinuationPath | ApplicationSourcePath | '/applications' | '/onboarding' | '/check' | PricingReturn;
const privateReturnPaths = [...loopPaths, ...adminPaths, ...workspacePaths, '/applications', '/onboarding', '/check', ...pricingPaths];
const isPrivateReturn = (value: unknown): value is PrivateReturn => typeof value === 'string' && (privateReturnPaths.includes(value) || isSavedCheckContinuationPath(value) || isApplicationSourcePath(value) || isLocalizedLoopPricingReturn(value));

/** Carry only the workspace's fixed tab, never other query data or fragments. */
export function workspaceReturnPath(search: string): WorkspaceReturn | ApplicationSourcePath | '/loop' {
  const exact = `/dashboard${search}`;
  if (isApplicationSourcePath(exact)) return exact;
  const tabs = new URLSearchParams(search).getAll('tab');
  const path = `/dashboard?tab=${tabs[0] ?? ''}`;
  return tabs.length === 1 && workspacePaths.includes(path) ? path as WorkspaceReturn : '/loop';
}

/** Bounded destinations and opaque selectors only; never CV text or tokens. */
export function accountDestination(value: string | null): PrivateReturn | '/check' {
  return value === '/dashboard' ? '/loop' : isPrivateReturn(value) ? value : '/loop';
}

export function rememberLoopReturn(value: string | null, now = Date.now()): void {
  try {
    if (isPrivateReturn(value)) sessionStorage.setItem(KEY, JSON.stringify({ path: value, expiresAt: now + TTL }));
    else sessionStorage.removeItem(KEY);
  } catch { /* Signing in still works when tab storage is unavailable. */ }
}

export function peekLoopReturn(now = Date.now()): PrivateReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw || raw.length > 200) return null;
    const value = JSON.parse(raw);
    return isPrivateReturn(value.path) && typeof value.expiresAt === 'number' && value.expiresAt > now && value.expiresAt <= now + TTL ? accountDestination(value.path) : null;
  } catch { return null; }
}

export function takeLoopReturn(now = Date.now()): PrivateReturn | null {
  const path = peekLoopReturn(now);
  try { sessionStorage.removeItem(KEY); } catch { /* Storage can be disabled. */ }
  return path;
}
