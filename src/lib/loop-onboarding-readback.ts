import type { LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';

/** True when a saved profile carries exactly the submitted answers (the comparison the save itself makes). */
export function profileMatches(saved: LoopProfileInput, submitted: LoopProfileInput): boolean {
  return (Object.keys(submitted) as (keyof LoopProfileInput)[]).every(key => key === 'compensation'
    ? (['currency', 'period', 'minimum'] as const).every(field => saved.compensation[field] === submitted.compensation[field])
    : JSON.stringify(saved[key]) === JSON.stringify(submitted[key]));
}

/** The profile exactly as a save sends it (trimmed text, a private copy). */
export const submittedForm = (profile: LoopProfileInput): LoopProfileInput => structuredClone({ ...profile, name: profile.name.trim(), contactLine: profile.contactLine.trim(), sourceText: profile.sourceText.trim() });

/**
 * Everything on the setup page that one save answers for: the submitted profile, and what the page also holds that no write carries
 * (the CV-builder answers, and role or location text typed but not yet added).
 */
export interface DraftState { profile: LoopProfileInput; answers: string; roleQuery: string; locationQuery: string }
export const draftState = (profile: LoopProfileInput, answers: unknown, roleQuery: string, locationQuery: string): DraftState => ({ profile: submittedForm(profile), answers: JSON.stringify(answers), roleQuery, locationQuery });

const sameDraft = (a: DraftState, b: DraftState) => a.answers === b.answers && a.roleQuery === b.roleQuery && a.locationQuery === b.locationQuery && profileMatches(a.profile, b.profile);

/**
 * The ONE rule for what a read of the saved setup means for the page's draft. Every path that reads the saved setup back (the fresh read before a retry, the check after
 * an unconfirmed save, a confirmed save) must ask it and nothing else may clear the draft or say "saved":
 *  - 'settled': a write this page sent is what is saved AND the page still holds exactly that write's draft (profile, CV-builder answers, role and location text).
 *    Nothing newer exists, so the draft may be cleared and the page may say saved.
 *  - 'earlier': a write this page sent is what is saved, but the page holds something newer. Keep the saved setup and the newer answers side by side.
 *  - 'other': what is saved is not the write this page sent last (another tab, another write, or this page never sent one). Keep both side by side.
 * `sent` is the draft of the most recent write that was actually sent (an attempt that gave up before sending a write is not one).
 */
export function lateSaveOutcome(saved: LoopProfileInput, sent: DraftState | null, now: DraftState): 'settled' | 'earlier' | 'other' {
  if (!sent || !profileMatches(saved, sent.profile)) return 'other';
  return sameDraft(sent, now) ? 'settled' : 'earlier';
}
