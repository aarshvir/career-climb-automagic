import type { LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';
import type { LoopCvAnswers } from './loop-cv-builder';

export interface OnboardingDraft {
  profile: LoopProfileInput;
  answers: LoopCvAnswers;
  step: number;
  roleQuery: string;
  locationQuery: string;
  rolesEdited: boolean;
  suggestionSource: string;
  /** The profile fields the person has edited on the page (set only by an edit they made, never by a default or a suggestion). Lets a deliberately emptied field be told from a field nobody touched. */
  touched?: string[];
}
type Scope = { owner: string; authority: number; generation: number | null };
const TTL = 30 * 60 * 1000;
let context: Scope | null = null;
let retained: { scope: Scope; draft: OnboardingDraft; expires: number } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
export function clearOnboardingDraft() { retained = null; if (timer !== null) clearTimeout(timer); timer = null; }
export function syncOnboardingOwner(owner: string | null | undefined, authority: number) {
  clearOnboardingDraft(); context = owner ? { owner, authority, generation: null } : null;
}
export function syncOnboardingGeneration(owner: string, generation: number) {
  if (!context || context.owner !== owner || context.generation === generation) return;
  // A first-ever empty record may be initialized by the dashboard. All later
  // lifecycles invalidate the draft, including erasure/recreation.
  if (context.generation === null && generation === 0 && retained?.scope.generation === null) retained.scope.generation = 0;
  else clearOnboardingDraft();
  context = { ...context, generation };
}
function matches(scope: Scope) {
  return !!context && scope.owner === context.owner && scope.authority >= 0 && scope.authority === context.authority && scope.generation === context.generation;
}
export function retainOnboardingDraft(scope: Scope, draft: OnboardingDraft, now = Date.now()) {
  if (!matches(scope) || !Number.isInteger(draft.step) || draft.step < 0 || draft.step > 5) return;
  clearOnboardingDraft(); retained = { scope: { ...scope }, draft: structuredClone(draft), expires: now + TTL };
  timer = setTimeout(clearOnboardingDraft, TTL);
}
/**
 * A navigation-only change (the step) on a draft that is already remembered: the step moves, nothing else does, and the 30 minutes it had are NOT renewed.
 * It does nothing when no draft is remembered for this scope or the draft has expired, so it can never bring an expired draft back.
 */
export function moveRetainedOnboardingStep(scope: Scope, step: number, now = Date.now()) {
  if (!matches(scope) || !Number.isInteger(step) || step < 0 || step > 5 || !retained) return;
  if (retained.expires <= now || retained.expires > now + TTL) { clearOnboardingDraft(); return; }
  if (retained.scope.owner !== scope.owner || retained.scope.authority !== scope.authority || retained.scope.generation !== scope.generation) return;
  retained.draft = { ...retained.draft, step };
}
export function recoverOnboardingDraft(owner: string, authority: number, generation: number | null, now = Date.now()): OnboardingDraft | null {
  if (retained && (retained.expires <= now || retained.expires > now + TTL)) clearOnboardingDraft();
  const scope = { owner, authority, generation };
  if (!matches(scope) || !retained || retained.scope.owner !== owner || retained.scope.authority !== authority || retained.scope.generation !== generation) return null;
  return structuredClone(retained.draft);
}
