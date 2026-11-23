import type { LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';
import { blankLoopProfile } from './job-loop-audiences';
import type { OnboardingDraft } from './loop-onboarding-memory';

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

/** The profile fields a person fills in on the setup page (audience, page target and languages are never typed there). */
export const TYPED_FIELDS = ['targetTitles', 'locations', 'compensation', 'discreetSearch', 'excludedTerms', 'name', 'contactLine', 'experienceYears', 'sourceText'] as const;
/** One field as a save would carry it: the private-terms box is one term per line, and an empty line is not a term. */
const fieldValue = (profile: LoopProfileInput, key: keyof LoopProfileInput) => key === 'excludedTerms' ? profile.excludedTerms.map(term => term.trim()).filter(Boolean) : profile[key];
const sameField = (a: LoopProfileInput, b: LoopProfileInput, key: keyof LoopProfileInput) => key === 'compensation'
  ? (['currency', 'period', 'minimum'] as const).every(field => a.compensation[field] === b.compensation[field])
  : JSON.stringify(fieldValue(a, key)) === JSON.stringify(fieldValue(b, key));

/**
 * Whether a draft this tab remembered holds anything the saved setup does not, so that opening setup again must not drop it. Only what a person put in counts:
 *  - any CV-builder answer, and role or location text typed but not added (none of it is ever part of a saved setup);
 *  - any typed profile field that differs from the saved setup AND is something the person did: either it differs from the blank page, or the person edited that field
 *    (`touched`), which keeps a deliberate clear or reset (an emptied contact line differs from the saved one and equals the blank page). A field nobody edited that merely
 *    equals the blank page is the page's own default, not an answer, so a page that was never filled in still holds nothing.
 * Roles suggested from the account or the CV and never confirmed (`rolesEdited` false) are not answers, whatever was touched. Surrounding whitespace is nothing, as in a save.
 * A draft that equals the saved setup, or was never filled in, holds nothing newer. Builder answers are kept even when they cannot be shown to be newer: they are never saved.
 */
export function holdsUnsavedAnswers(saved: LoopProfileInput, draft: Pick<OnboardingDraft, 'profile' | 'answers' | 'roleQuery' | 'locationQuery' | 'rolesEdited' | 'touched'>): boolean {
  if (draft.roleQuery.trim() || draft.locationQuery.trim()) return true;
  if (Object.values(draft.answers).some(value => typeof value === 'string' && value.trim())) return true;
  const typed = submittedForm(draft.profile), blank = blankLoopProfile('professional'), edited = new Set(draft.touched ?? []);
  return TYPED_FIELDS.some(key => (key !== 'targetTitles' || draft.rolesEdited) && !sameField(typed, saved, key) && (edited.has(key) || !sameField(typed, blank, key)));
}
