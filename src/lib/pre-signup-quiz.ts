import { cleanPreferences } from '@/lib/loop-role-suggestions';

/**
 * The two answers a signed-out visitor gives before creating an account: target
 * roles and locations. They are not private CV data. They survive the sign-up
 * redirect and email confirmation (which can open a new tab), are read once by
 * the owned setup quiz, and expire after two hours. They are shown for review in
 * the first setup step, never applied silently, because a shared device could
 * hold another visitor's answers.
 */
export interface PreSignupAnswers { targetTitles: string[]; locations: string[] }

const KEY = 'jobvance:pre-signup-quiz';
const TTL_MS = 2 * 60 * 60 * 1000;

function valid(values: unknown): values is string[] {
  return Array.isArray(values) && values.length >= 1 && values.length <= 10
    && values.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 150);
}

export function savePreSignupAnswers(answers: PreSignupAnswers, now = Date.now()): void {
  const targetTitles = cleanPreferences(answers.targetTitles), locations = cleanPreferences(answers.locations);
  // Remove any earlier answers first, so a failed write can never leave them to be restored.
  clearPreSignupAnswers();
  if (!valid(targetTitles) || !valid(locations)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, targetTitles, locations, savedAt: now })); } catch { clearPreSignupAnswers(); }
}

export function clearPreSignupAnswers(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

/** Returns the answers once and removes them, whatever their state. */
export function takePreSignupAnswers(now = Date.now()): PreSignupAnswers | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  clearPreSignupAnswers();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; targetTitles?: unknown; locations?: unknown; savedAt?: unknown };
    if (parsed.v !== 1 || typeof parsed.savedAt !== 'number' || parsed.savedAt > now || now - parsed.savedAt > TTL_MS) return null;
    if (!valid(parsed.targetTitles) || !valid(parsed.locations)) return null;
    return { targetTitles: cleanPreferences(parsed.targetTitles), locations: cleanPreferences(parsed.locations) };
  } catch { return null; }
}
