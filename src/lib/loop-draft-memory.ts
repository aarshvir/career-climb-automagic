import type { LoopClaimInput, LoopContact, LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';
export interface LoopClaimDraft { value: LoopClaimInput; chosenKind: LoopClaimInput['kind'] | '' }
export interface LoopWorkingDraft {
  profile: LoopProfileInput; profileDirty: boolean; lists: { targets: string; locations: string; languages: string; excluded: string };
  claimDrafts: Record<string, LoopClaimDraft>; suggestions: { key: string; value: LoopClaimInput }[]; newClaimKey: number;
  opportunity: { title: string; company: string; location: string; jobUrl: string; description: string; withContact: boolean; contact: LoopContact };
}
const TTL = 30 * 60 * 1000;
let retained: { ownerId: string; expiresAt: number; draft: LoopWorkingDraft } | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
/** Route recovery only: no browser storage, server write, OAuth ticket or third-party call. */
export function retainLoopWorkingDraft(ownerId: string, draft: LoopWorkingDraft, now = Date.now()): void {
  if (expiry !== null) clearTimeout(expiry);
  retained = { ownerId, expiresAt: now + TTL, draft: structuredClone(draft) };
  expiry = setTimeout(clearLoopWorkingDraft, TTL);
}
export function recoverLoopWorkingDraft(ownerId: string, now = Date.now()): LoopWorkingDraft | null {
  if (!retained || retained.ownerId !== ownerId || retained.expiresAt <= now || retained.expiresAt > now + TTL) { clearLoopWorkingDraft(); return null; }
  const draft = structuredClone(retained.draft);
  for (const claim of Object.values(draft.claimDrafts)) { claim.value.confirmed = false; claim.value.shareable = false; }
  draft.opportunity.contact.confirmedByUser = false;
  return draft;
}
export function clearLoopWorkingDraft(): void { retained = null; if (expiry !== null) clearTimeout(expiry); expiry = null; }
