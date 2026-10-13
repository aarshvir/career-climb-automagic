import { validateCvText } from "./cv-extraction";

const DRAFT_KEY = "jobvance_check_oauth_draft_v1";
const RETURN_KEY = "jobvance_check_oauth_return_v1";
const TTL = 30 * 60 * 1000;
const RECOVERY_KEY = "jobvance_check_recovery_v1";
export type CheckRecovery = { draft: CheckDraft; step: number; cvReady: boolean; filename: string; ownerId: string | null; pageTarget: 1 | 2; reuseMode?: boolean };
let inMemoryRecovery: { value: CheckRecovery; expiresAt: number } | null = null;
export type CheckDraft = {
  jobTitle: string; company: string; sourceText: string; reviewedText: string; jobDescription: string;
};
export type CheckDraftField = keyof CheckDraft;
export class CheckDraftValidationError extends Error {
  constructor(public readonly field: CheckDraftField, message: string) { super(message); this.name = 'CheckDraftValidationError'; }
}

export function validateCheckField(field: CheckDraftField, value: string): string {
  if (field === 'jobTitle') {
    if (typeof value !== 'string' || value.trim().length < 2 || value.length > 200) throw new CheckDraftValidationError(field, 'Enter the target role (2–200 characters).');
  } else if (field === 'company') {
    if (typeof value !== 'string' || value.length > 200) throw new CheckDraftValidationError(field, 'Keep the company name under 200 characters.');
  } else if (field === 'jobDescription') {
    if (typeof value !== 'string' || value.trim().length < 80 || value.length > 20000) throw new CheckDraftValidationError(field, 'Paste the full vacancy description (80–20,000 characters).');
  } else {
    try { return validateCvText(value); }
    catch (failure) { throw new CheckDraftValidationError(field, failure instanceof Error ? failure.message : 'Review the readable CV text.'); }
  }
  return value.trim();
}

export type CheckReuseSource = 'source' | 'reviewed';

/** A second application starts from explicitly chosen CV text, never an old vacancy or approval. */
export function draftForAnotherVacancy(previous: CheckDraft, choice: CheckReuseSource): CheckDraft {
  if (choice !== 'source' && choice !== 'reviewed') throw new Error('Choose which CV version to reuse.');
  const sourceText = validateCvText(choice === 'reviewed' ? previous.reviewedText : previous.sourceText);
  return { jobTitle: '', company: '', sourceText, reviewedText: '', jobDescription: '' };
}

/** Copies only user-reviewed text into the current local source; saving remains separate. */
export function keepReviewedEditsInSource(draft: CheckDraft): CheckDraft {
  return { jobTitle: draft.jobTitle, company: draft.company, sourceText: validateCheckField('reviewedText', draft.reviewedText), reviewedText: draft.reviewedText, jobDescription: draft.jobDescription };
}

function boundedRecovery(value: unknown): CheckRecovery | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as CheckRecovery;
  if (!item.draft || typeof item.draft !== 'object' || !Number.isInteger(item.step) || item.step < 1 || item.step > 6 || typeof item.cvReady !== 'boolean' || typeof item.filename !== 'string' || item.filename.length > 300 || (item.ownerId !== null && typeof item.ownerId !== 'string')) return null;
  // Existing version-one drafts predate this preference and used a two-page maximum.
  const pageTarget = item.pageTarget === undefined ? 2 : item.pageTarget;
  if (pageTarget !== 1 && pageTarget !== 2) return null;
  if (item.reuseMode !== undefined && typeof item.reuseMode !== 'boolean') return null;
  if (item.reuseMode && ![1, 4, 5, 6].includes(item.step)) return null;
  for (const [key, limit] of [['jobTitle', 200], ['company', 200], ['sourceText', 60000], ['reviewedText', 60000], ['jobDescription', 20000]] as const) if (typeof item.draft[key] !== 'string' || item.draft[key].length > limit) return null;
  return { draft: { jobTitle: item.draft.jobTitle, company: item.draft.company, sourceText: item.draft.sourceText, reviewedText: item.draft.reviewedText, jobDescription: item.draft.jobDescription }, step: item.step, cvReady: item.cvReady, filename: item.filename, ownerId: item.ownerId, pageTarget, ...(item.reuseMode === undefined ? {} : { reuseMode: item.reuseMode }) };
}

/** Browser memory preserves route navigation; tab storage is used only after explicit consent. */
export function rememberCheckRecovery(value: CheckRecovery, tabStorageConsent: boolean, now = Date.now()): void {
  const safe = boundedRecovery(value);
  if (!safe) throw new Error('The draft could not be retained safely.');
  inMemoryRecovery = { value: safe, expiresAt: now + TTL };
  if (!tabStorageConsent) { try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* Memory remains usable. */ } return; }
  try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, value: safe, expiresAt: now + TTL })); }
  catch { throw new Error('This browser could not retain the draft across refresh. Keep the page open or save to your account.'); }
}

export function readCheckRecovery(ownerId: string | null, now = Date.now()): { value: CheckRecovery; storageConsented: boolean } | null {
  let stored: unknown;
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY);
    if (raw && raw.length <= 1_000_000) stored = JSON.parse(raw);
  } catch { /* A route-only draft may still exist. */ }
  if (stored && typeof stored === 'object') {
    const item = stored as { version: number; expiresAt: number; value: unknown };
    const safe = boundedRecovery(item.value);
    if (item.version === 1 && Number.isFinite(item.expiresAt) && item.expiresAt > now && item.expiresAt <= now + TTL && safe?.ownerId === ownerId) return { value: safe, storageConsented: true };
    try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* No usable stored draft. */ }
  }
  if (inMemoryRecovery && inMemoryRecovery.expiresAt > now && inMemoryRecovery.expiresAt <= now + TTL && inMemoryRecovery.value.ownerId === ownerId) return { value: inMemoryRecovery.value, storageConsented: false };
  return null;
}

export function clearCheckRecovery(): void {
  inMemoryRecovery = null;
  try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* Already inaccessible. */ }
}

export function validateCheckDraft(value: CheckDraft): CheckDraft {
  const jobTitle = validateCheckField('jobTitle', value.jobTitle), company = validateCheckField('company', value.company), jobDescription = validateCheckField('jobDescription', value.jobDescription);
  return { jobTitle, company, sourceText: validateCheckField('sourceText', value.sourceText), reviewedText: validateCheckField('reviewedText', value.reviewedText), jobDescription };
}

/** A local approval is bound to all reviewed inputs, never to a generic checkbox. */
export function checkReviewKey(draft: CheckDraft, methodVersion: string): string {
  return JSON.stringify([methodVersion, draft.jobTitle, draft.company, draft.sourceText, draft.reviewedText, draft.jobDescription]);
}

/** Only called after specific consent to retain this CV/vacancy in this browser tab. */
export function retainCheckForGoogle(draft: CheckDraft, consent: boolean, now = Date.now()): void {
  if (!consent) throw new Error("Allow temporary browser-tab storage before continuing with Google, or use email here.");
  const valid = validateCheckDraft(draft);
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, expiresAt: now + TTL, draft: valid }));
    sessionStorage.setItem(RETURN_KEY, "/check");
  } catch {
    clearRetainedCheck();
    throw new Error("This browser cannot retain the check. Use email sign-in here to keep your work open.");
  }
}

/** Read without consuming: React may replay a render before committing it. */
export function readRetainedCheck(now = Date.now()): CheckDraft | null {
  let raw: string | null;
  try { raw = sessionStorage.getItem(DRAFT_KEY); } catch { return null; }
  if (!raw) return null;
  // Bounds precede JSON parsing; allow the largest valid escaped inputs, not arbitrary cache payloads.
  if (raw.length > 1_000_000) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.expiresAt !== "number" || value.expiresAt <= now || value.expiresAt > now + TTL) return null;
    return validateCheckDraft(value.draft);
  } catch { return null; }
}

export function takeRetainedCheck(now = Date.now()): CheckDraft | null {
  const draft = readRetainedCheck(now);
  clearRetainedCheck();
  return draft;
}

export function takeCheckAuthReturn(): "/check" | "/dashboard" {
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return value === "/check" ? "/check" : "/dashboard";
  } catch { return "/dashboard"; }
}

export function checkAuthReturnAvailable(): boolean {
  try { return sessionStorage.getItem(RETURN_KEY) === "/check"; } catch { return false; }
}

export function clearRetainedCheck(): void {
  try { sessionStorage.removeItem(DRAFT_KEY); sessionStorage.removeItem(RETURN_KEY); } catch { /* In-memory checking still works. */ }
}
