import type { LoopCvAnswers } from './loop-cv-builder';
import type { LoopClaimInput, LoopContact, LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';
import { validLoopGeneration } from '../../supabase/functions/_shared/job-loop-request';
import { trackingDraftAuthority } from './tracking-draft-memory';
export interface PendingSavedCheckLink {
  ownerId: string; authority: number; generation: number; checkId: string;
  vacancy: { title: string; company: string; description: string };
}
/** Same trim semantics as the server contract; no title/company inference. */
export const savedCheckVacancyFingerprint = (value: PendingSavedCheckLink['vacancy']) => JSON.stringify([value.title.trim(), value.company.trim(), value.description.trim()]);
export interface LoopClaimDraft { value: LoopClaimInput; chosenKind: LoopClaimInput['kind'] | '' }
export interface LoopWorkingDraft {
  lifecycleGeneration: number;
  builderAnswers?: LoopCvAnswers;
  builderAuthority?: number;
  pendingCheckLink?: PendingSavedCheckLink | null;
  profile: LoopProfileInput; profileDirty: boolean; lists: { targets: string; locations: string; languages: string; excluded: string };
  claimDrafts: Record<string, LoopClaimDraft>; suggestions: { key: string; value: LoopClaimInput }[]; newClaimKey: number;
  opportunity: { title: string; company: string; location: string; jobUrl: string; description: string; withContact: boolean; contact: LoopContact };
}
const TTL = 30 * 60 * 1000;
let retained: { ownerId: string; expiresAt: number; draft: LoopWorkingDraft } | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
/** Route recovery only: no browser storage, server write, OAuth ticket or third-party call. */
export function retainLoopWorkingDraft(ownerId: string, draft: LoopWorkingDraft, now = Date.now()): void {
  clearLoopWorkingDraft();
  if (!validLoopGeneration(draft.lifecycleGeneration)) return;
  retained = { ownerId, expiresAt: now + TTL, draft: structuredClone(draft) };
  expiry = setTimeout(clearLoopWorkingDraft, TTL);
}
export function recoverLoopWorkingDraft(ownerId: string, expectedGeneration: number, now = Date.now()): LoopWorkingDraft | null {
  if (!validLoopGeneration(expectedGeneration) || !retained || retained.ownerId !== ownerId || retained.draft.lifecycleGeneration !== expectedGeneration || retained.expiresAt <= now || retained.expiresAt > now + TTL) { clearLoopWorkingDraft(); return null; }
  const draft = structuredClone(retained.draft);
  if (draft.builderAnswers && (!Number.isSafeInteger(draft.builderAuthority) || draft.builderAuthority! < 0 || draft.builderAuthority !== trackingDraftAuthority(ownerId))) { clearLoopWorkingDraft(); return null; }
  const pending = draft.pendingCheckLink;
  // Never recover imported wording without its original attribution. Discard the
  // whole old draft if that attribution belongs to another confirmed auth life.
  if (pending && (pending.ownerId !== ownerId || pending.generation !== expectedGeneration || pending.authority < 0 || pending.authority !== trackingDraftAuthority(ownerId))) { clearLoopWorkingDraft(); return null; }
  for (const claim of Object.values(draft.claimDrafts)) { claim.value.confirmed = false; claim.value.shareable = false; }
  draft.opportunity.contact.confirmedByUser = false;
  return draft;
}
export function clearLoopWorkingDraft(): void { retained = null; if (expiry !== null) clearTimeout(expiry); expiry = null; }
