import { validateCvText } from "./cv-extraction";

const DRAFT_KEY = "jobvance_check_oauth_draft_v1";
const RETURN_KEY = "jobvance_check_oauth_return_v1";
const TTL = 30 * 60 * 1000;
export type CheckDraft = {
  jobTitle: string; company: string; sourceText: string; reviewedText: string; jobDescription: string;
};

export function validateCheckDraft(value: CheckDraft): CheckDraft {
  if (typeof value.jobTitle !== "string" || value.jobTitle.trim().length < 2 || value.jobTitle.length > 200)
    throw new Error("Enter the target role (2–200 characters).");
  if (typeof value.company !== "string" || value.company.length > 200)
    throw new Error("Keep the company name under 200 characters.");
  if (typeof value.jobDescription !== "string" || value.jobDescription.trim().length < 80 || value.jobDescription.length > 20000)
    throw new Error("Paste the full vacancy description (80–20,000 characters).");
  return { jobTitle: value.jobTitle.trim(), company: value.company.trim(), sourceText: validateCvText(value.sourceText), reviewedText: validateCvText(value.reviewedText), jobDescription: value.jobDescription.trim() };
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
