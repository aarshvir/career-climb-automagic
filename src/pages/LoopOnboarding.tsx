import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { callJobLoop, boundLoopAction, type LoopSnapshot } from '@/lib/job-loop-api';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { extractCvText, unsupportedCharacterLine, validateCvText } from '@/lib/cv-extraction';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { registerTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority, trackingLoopGeneration } from '@/lib/tracking-draft-memory';
import type { LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';
import LoopCvBuilder from './LoopCvBuilder';
import LoopPreferencePicker from '@/components/LoopPreferencePicker';
import { accountFullName, accountRoleSuggestions, cvRoleSuggestions, roleChoices, locationChoices, cleanPreferences } from '@/lib/loop-role-suggestions';
import { retainOnboardingDraft, moveRetainedOnboardingStep, recoverOnboardingDraft, clearOnboardingDraft, type OnboardingDraft } from '@/lib/loop-onboarding-memory';
import { draftState, holdsUnsavedAnswers, lateSaveOutcome, submittedForm, type DraftState } from '@/lib/loop-onboarding-readback';
import { adAttributionQuery } from '@/lib/meta-pixel';
import { pricingChoiceFromReturn, pricingReturnFromOnboarding } from '@/lib/account-return';
import { clearPreSignupAnswers, takePreSignupAnswers } from '@/lib/pre-signup-quiz';
import './JobLoop.css';
import './LoopOnboarding.css';

const questions = ['Which roles would you like to find?', 'Where would you like to work?', 'What compensation would you consider?', 'What should stay private?', 'Bring your experience', 'Review your Automated Job Loop setup'];
type ErrorKind = 'dashboard' | 'fix' | 'file';
const SETUP_READ_DEADLINE_MS = 20_000;
/** A write or file read that never answers must not leave the page on "Saving…" for ever. */
const SETUP_SAVE_DEADLINE_MS = 30_000;
const CV_READ_DEADLINE_MS = 30_000;
const list = (value: string) => [...new Set(value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))];

const EARLIER_SAVE_MESSAGE = 'Your earlier save arrived after all, so a setup is saved. Changes you made since are not saved and nothing was overwritten. Your newer answers are still below, unchanged.';
const REOPENED_MESSAGE = 'A saved setup was found that this page had not seen. The answers this tab still held are retained below, unchanged. Nothing was overwritten and this page will not write.';
/**
 * The remembered answers as one comparable value (the order is fixed), WITHOUT the step: a draft whose answers are unchanged (it was only reopened, or only moved with Back or
 * Next) can be told from one the person has since changed. Pressing Back or Next is navigation, not an answer, so it never starts another 30 minutes; only a change to an answer does.
 */
const draftKey = (draft: OnboardingDraft) => JSON.stringify([draft.profile, draft.answers, draft.roleQuery, draft.locationQuery, draft.rolesEdited, draft.suggestionSource, [...(draft.touched ?? [])].sort()]);
const PROFILE_PARTS: [keyof LoopProfileInput, string][] = [['targetTitles', 'Target roles'], ['locations', 'Cities or countries'], ['compensation', 'Compensation'], ['discreetSearch', 'Discreet search'], ['excludedTerms', 'Private terms'],
  ['name', 'Name on your CV'], ['contactLine', 'Contact line'], ['experienceYears', 'Years of experience'], ['sourceText', 'CV text']];
function partText(profile: LoopProfileInput, key: keyof LoopProfileInput): string {
  const value = profile[key];
  if (key === 'compensation') { const pay = profile.compensation; return pay.minimum === null ? 'No minimum set' : `${pay.minimum} ${pay.currency} / ${pay.period}`; }
  if (Array.isArray(value)) return value.join('; ') || '(none)';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  return value === null || value === undefined || value === '' ? '(empty)' : String(value);
}
/** What the page holds that the saved setup does not: the labels that differ, and the whole current draft as plain text a person can read and copy. */
function unsavedDraft(saved: NonNullable<LoopSnapshot['profile']>, profile: LoopProfileInput, answers: Record<string, string>, roleQuery: string, locationQuery: string, retained = false, startingName = false) {
  const draft = submittedForm(profile), changed: string[] = [];
  for (const [key, label] of PROFILE_PARTS) {
    const same = key === 'compensation' ? (['currency', 'period', 'minimum'] as const).every(field => saved.compensation[field] === draft.compensation[field]) : JSON.stringify(saved[key]) === JSON.stringify(draft[key]);
    // A name that is still the page's own starting value (from the sign-up details, never edited) is not something this tab holds that the saved setup does not.
    if (!same && !(key === 'name' && startingName)) changed.push(label);
  }
  const builder = Object.entries(answers).filter(([, value]) => typeof value === 'string' && value.trim());
  if (builder.length) changed.push('CV builder answers');
  if (roleQuery.trim()) changed.push('Role text typed but not added');
  if (locationQuery.trim()) changed.push('Location text typed but not added');
  const lines = [retained ? 'My Jobvance setup answers retained in this tab (they are not saved from this page):' : 'My Jobvance setup answers that are NOT saved (still in this tab):', ...PROFILE_PARTS.filter(([key]) => key !== 'sourceText').map(([key, label]) => `${label}: ${partText(draft, key)}`)];
  if (builder.length) lines.push('CV builder answers:', ...builder.map(([key, value]) => `  ${key}: ${value.trim()}`));
  if (roleQuery.trim()) lines.push(`Role text typed but not added: ${roleQuery.trim()}`);
  if (locationQuery.trim()) lines.push(`Location text typed but not added: ${locationQuery.trim()}`);
  lines.push('', 'CV text:', draft.sourceText);
  return { changed, text: lines.join(String.fromCharCode(10)) };
}

export function onboardingStepError(step: number, profile: LoopProfileInput): string {
  if (step === 0 && (!profile.targetTitles.length || profile.targetTitles.length > 10 || profile.targetTitles.some(value => value.length > 150))) return 'Add between one and ten role titles or seniority preferences, each under 150 characters.';
  if (step === 0 && profile.targetTitles.some(value => unsupportedCharacterLine(value) !== null)) return 'A target role has an invisible control or text-direction character that cannot be saved. Remove that role and type it again.';
  if (step === 1 && (!profile.locations.length || profile.locations.length > 10 || profile.locations.some(value => value.length > 150))) return 'Add between one and ten cities or countries, each under 150 characters. For remote work, include where you can work.';
  if (step === 1 && profile.locations.some(value => unsupportedCharacterLine(value) !== null)) return 'A location has an invisible control or text-direction character that cannot be saved. Remove that location and type it again.';
  if (step === 2 && profile.compensation.currency && !/^[A-Z]{3}$/.test(profile.compensation.currency)) return 'Use a three-letter currency, such as USD, or leave it empty when no minimum is set.';
  if (step === 2 && profile.compensation.minimum !== null && (!Number.isFinite(profile.compensation.minimum) || profile.compensation.minimum < 0 || profile.compensation.minimum > 100000000 || !/^[A-Z]{3}$/.test(profile.compensation.currency))) return 'Use a non-negative minimum and a three-letter currency, such as USD. You can leave the minimum empty.';
  if (step === 3 && (profile.excludedTerms.length > 100 || profile.excludedTerms.some(value => value.length > 150))) return 'Keep each private term under 150 characters, with at most 100 terms.';
  if (step === 3 && profile.excludedTerms.some(value => unsupportedCharacterLine(value) !== null)) return 'A private term has an invisible control or text-direction character that cannot be saved. Remove that term and type it again.';
  if (step === 4) {
    if (!profile.name.trim() || profile.name.trim().length > 120) return 'Add the name you want on your CV, up to 120 characters.';
    if (profile.contactLine.length > 500) return 'Keep your CV contact line under 500 characters.';
    if (profile.experienceYears !== null && (!Number.isFinite(profile.experienceYears) || profile.experienceYears < 0 || profile.experienceYears > 80)) return 'Use a number from 0 to 80 for experience years, or leave it empty.';
    if (unsupportedCharacterLine(profile.name) !== null) return 'Your name has an invisible control or text-direction character that cannot be saved. Delete the name and type it again.';
    if (unsupportedCharacterLine(profile.contactLine) !== null) return 'Your contact line has an invisible control or text-direction character that cannot be saved. Delete the line and type it again.';
    const hidden = unsupportedCharacterLine(profile.sourceText);
    if (hidden !== null) return `Line ${hidden} of your CV text has an invisible control or text-direction character that cannot be saved. Delete that line and type it again, then continue. Nothing was changed for you.`;
    try { validateCvText(profile.sourceText); } catch (error) { return error instanceof Error ? error.message : 'Review your CV text.'; }
  }
  return '';
}

/** True when the contact line or the years of experience would stop Next on the CV step. Asked of the real validator, with a name and CV text that are known to be fine, so the rules are written once. */
const optionalDetailsInvalid = (profile: LoopProfileInput) => onboardingStepError(4, { ...profile, name: 'Name', sourceText: 'x'.repeat(100) }) !== '';

/**
 * The optional contact line and years of experience, closed so the step starts with what is needed (name, CV). It opens by itself when a value is already there (a restored draft)
 * or one of them has to be corrected, so a field is never hidden from the person it asks something of. A person may close it at any time, even while a value is wrong; `rejected`
 * counts the times Next refused to go on with an optional field wrong, and every refusal opens it again (`invalid` alone is not enough: it is already true while the value is typed,
 * so it does not change when Next rejects it). A valid section is never reopened by anything but the person.
 */
function OptionalDetails({ filled, invalid, rejected, children }: { filled: boolean; invalid: boolean; rejected: number; children: ReactNode }) {
  const [open, setOpen] = useState(filled || invalid);
  useEffect(() => { if (invalid) setOpen(true); }, [invalid, rejected]);
  return <details className="oq-optional" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>Optional details</summary>{children}</details>;
}

/**
 * "CV text is ready to review." beside an upload control, said only while the current file read is the one whose text is in the CV box. The live region is always in the page (empty),
 * so that text appearing in it is announced politely; it takes no focus and does not move the page, except by the least amount needed to keep the line out from under the fixed action bar
 * and the header (see scroll-margin in the style sheet). It never carries a file name or any CV text.
 */
function FileReadStatus({ confirmed }: { confirmed: boolean }) {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (confirmed) line.current?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' }); }, [confirmed]);
  return <div className="oq-read-live" aria-live="polite" aria-atomic="true">{confirmed && <p className="oq-read-ok" ref={line}><Check size={16} aria-hidden="true" /> CV text is ready to review.</p>}</div>;
}

/** Only the existing owned Loop record is written. No onboarding-complete flag,
 * automatic model request, implicit fact approval or schedule activation. */
export default function LoopOnboarding() {
  const { user, loading, authError, retryConnection } = useAuth();
  const { search } = useLocation();
  if (loading) return <main className="loop-onboarding"><p role="status">Opening your account…</p></main>;
  if (authError) return <main className="loop-onboarding"><p role="alert">Your sign-in could not be restored.</p><button onClick={retryConnection}>Retry sign-in recovery</button><Link to="/auth?next=%2Fonboarding">Sign in</Link></main>;
  // Signed-out visitors (mostly from ads) go straight to account creation, as before v80.
  // Measured 4-14 Nov: ad B converted 10 of 78 visits with this redirect and 0 of 32 with
  // two questions shown before sign-up. Ad campaign tags survive the redirect.
  if (!user) return <Navigate to={`/auth?mode=signup&next=%2Fonboarding${adAttributionQuery(search)}`} replace />;
  registerTrackingDraftOwner(user.id);
  // The plan the person came from, only if the address carries a valid one (see pricingReturnFromOnboarding). It is a navigation target, not account state: nothing is stored.
  return <OwnedQuiz key={`${user.id}:${trackingDraftAuthority(user.id)}`} owner={user.id} metadata={user.user_metadata} planReturn={pricingReturnFromOnboarding(search)} />;
}

function OwnedQuiz({ owner, metadata, planReturn }: { owner: string; metadata: unknown; planReturn: string | null }) {
  const authority = trackingDraftAuthority(owner);
  // The name asked for in step 5 is taken from the sign-up details when there is one. It is the page's own starting value, NOT an edit: it stays out of `touched`
  // and holdsUnsavedAnswers compares against it (see loop-onboarding-readback.ts), so it is never mistaken for a newer answer. It is still saved only after the confirmation tick.
  const [profile, setProfile] = useState(() => ({ ...blankLoopProfile('professional'), targetTitles: accountRoleSuggestions(metadata), name: accountFullName(metadata) }));
  const rolesEdited = useRef(false);
  const [roleQuery, setRoleQuery] = useState(''), [locationQuery, setLocationQuery] = useState('');
  const [handoff, setHandoff] = useState(false);
  const [suggestionSource, setSuggestionSource] = useState(accountRoleSuggestions(metadata).length ? 'account profile' : '');
  const [answers, setAnswers] = useState(blankLoopCvAnswers);
  const [step, setStep] = useState(0), [busy, setBusy] = useState('Loading your saved setup…'), [error, setErrorText] = useState(''), [errorKind, setErrorKind] = useState<ErrorKind>('dashboard');
  /**
   * An error about a load or a save ('dashboard', the default) keeps the link to the saved dashboard (checking what was saved is the useful next step). An error about something to correct on
   * this page ('fix': a step that needs an answer) says only what to fix. An error about a CV file that could not be read ('file') offers a local way on instead: paste the text, or choose
   * another file. A link out of setup at those moments invites leaving with nothing saved.
   */
  function setError(text: string, kind: ErrorKind = 'dashboard') { setErrorText(text); setErrorKind(text === '' ? 'dashboard' : kind); }
  /** The local recovery after a CV file could not be read: the paste box or the file chooser of the step the person is on (the early CV box on the first step, the CV step later). */
  function recoverCv(way: 'paste' | 'file') {
    const target = document.getElementById(`${step === 0 ? 'oq-early' : 'oq'}-${way === 'paste' ? 'source' : 'file'}`);
    if (!(target instanceof HTMLElement)) return;
    const box = target.closest('details'); if (box && !box.open) box.open = true;    // the early CV box is a section that can be closed: never point at a hidden field
    if (way === 'file') target.click(); else { target.scrollIntoView?.({ block: 'center', behavior: 'auto' }); target.focus(); }
  }
  const [optionalRejected, setOptionalRejected] = useState(0);
  // True only while the most recent file read is the one whose text is in the CV box (see upload, edit and the step effect). Never holds a file name or any CV text.
  const [readOk, setReadOk] = useState(false);
  const [loaded, setLoaded] = useState(false), [existing, setExisting] = useState(false), [saved, setSaved] = useState(false), [consent, setConsent] = useState(false);
  const consentEpoch = useRef<number | null>(null);
  const snapshot = useRef<LoopSnapshot | null>(null), alive = useRef(true), epoch = useRef(0), saving = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const loadDeadline = useRef<{ turn: number; handle: number } | null>(null);
  const saveDeadline = useRef<{ turn: number; handle: number } | null>(null);
  const checkDeadline = useRef<{ turn: number; handle: number } | null>(null);
  const cvDeadline = useRef<{ turn: number; handle: number } | null>(null);
  // The answers of a save that never confirmed. While set, nothing is written again until a read of the saved setup says what happened.
  // While it is set the answers are held exactly as submitted (the form is locked), so a readback can never be reconciled against a draft that moved on.
  const [unconfirmed, setUnconfirmed] = useState<LoopProfileInput | null>(null);
  // Set when a save gave up waiting: that write may still land at any moment, so until a save is confirmed every retry starts with a fresh read (never a cached
  // version number) and a refused or failed retry leaves this set. An ordinary failed save keeps the original version on retry, as before.
  const reconciling = useRef(false);
  // A setup that is already saved (an earlier save that arrived late, or one made in another tab). The page keeps the whole newer draft in view, readable and copyable, and never writes again.
  // 'reopened': this page opened while a setup was already saved and this tab still remembered newer answers for the same account, session and lifecycle (see load).
  const [conflict, setConflict] = useState<{ kind: 'earlier' | 'other' | 'reopened'; saved: NonNullable<LoopSnapshot['profile']> } | null>(null);
  const [copied, setCopied] = useState('');
  // The answers (draftKey, no step) of the draft this tab last put into its 30-minute memory, or reopened beside a saved setup. A change to a later render's answers is a real change and starts
  // a new 30 minutes; the same answers on another step (Back or Next) only move the remembered step and keep the deadline the last real change set. Showing a reopened draft renews nothing.
  const retainedKey = useRef<string | null>(null);
  // The profile fields this person has edited on this page (an edit they made: not a default, not a suggestion). Travels with the remembered draft, so a field they emptied on purpose is not mistaken for one nobody touched.
  const touched = useRef<Set<string>>(new Set());
  // The whole draft of the most recent write that was actually SENT: the profile plus what the page held besides it (CV builder answers, role/location text typed but not added).
  // A save attempt that gave up before it sent a write (its fresh read never answered) is not recorded here, so a newer answer added since is never taken for part of that write.
  const sentWrite = useRef<DraftState | null>(null);
  // The draft on screen right now, refreshed on every render, so a readback is always judged against the page as it is when the answer arrives.
  const liveDraft = useRef({ profile, answers, roleQuery, locationQuery });
  liveDraft.current = { profile, answers, roleQuery, locationQuery };
  const absentGeneration = useRef(trackingLoopGeneration(owner) ?? null);
  const current = () => {
    const observed = trackingLoopGeneration(owner) ?? null;
    const expected = snapshot.current?.lifecycleGeneration ?? absentGeneration.current;
    const sameLifecycle = observed === expected || (expected === null && observed === 0);
    return alive.current && authority >= 0 && trackingDraftAuthority(owner) === authority && sameLifecycle;
  };
  useEffect(() => { alive.current = true; return () => {
    alive.current = false; epoch.current++;
    for (const timer of [loadDeadline, saveDeadline, checkDeadline, cvDeadline]) if (timer.current) { window.clearTimeout(timer.current.handle); timer.current = null; }
  }; }, []);
  useEffect(() => { heading.current?.focus(); }, [step, saved]);
  useEffect(() => { setReadOk(false); }, [step]);   // a confirmation belongs to the visit of the step where the file was read
  /**
   * The ONE place that decides what a read of the saved setup means for this page: the fresh read before a retry, the check after an unconfirmed save and a confirmed save all end here,
   * and nothing else may clear the draft or say "saved". Only when the page still holds exactly the draft of the write that was sent (profile, CV builder answers, role and location text)
   * is the draft cleared and the saved heading shown. Otherwise the saved setup and the newer answers stay side by side, readable and copyable, and nothing is written again.
   * Returns null when settled, or the message to show when the page holds something the saved setup does not.
   */
  function readBack(savedProfile: NonNullable<LoopSnapshot['profile']>, otherMessage: string): string | null {
    const now = liveDraft.current;
    const outcome = lateSaveOutcome(savedProfile, sentWrite.current, draftState(now.profile, now.answers, now.roleQuery, now.locationQuery));
    if (outcome === 'settled') { reconciling.current = false; sentWrite.current = null; clearOnboardingDraft(); setSaved(true); return null; }
    setConflict({ kind: outcome, saved: savedProfile });
    return outcome === 'earlier' ? EARLIER_SAVE_MESSAGE : otherMessage;
  }
  function restore(recovered: OnboardingDraft) {
    setProfile(recovered.profile); setAnswers(recovered.answers); setStep(recovered.step);
    setRoleQuery(recovered.roleQuery); setLocationQuery(recovered.locationQuery);
    rolesEdited.current = recovered.rolesEdited; setSuggestionSource(recovered.suggestionSource); touched.current = new Set(recovered.touched ?? []);
  }
  async function load() {
    const turn = ++epoch.current; setBusy('Loading your saved setup…'); setError(''); consentEpoch.current = null; setConsent(false);
    if (loadDeadline.current) window.clearTimeout(loadDeadline.current.handle);
    loadDeadline.current = { turn, handle: window.setTimeout(() => {
      if (loadDeadline.current?.turn !== turn) return;
      loadDeadline.current = null;
      if (!current() || turn !== epoch.current) return;
      // Only the passive read is abandoned. Its late result cannot rebind this
      // page, and another request starts only when the owner chooses Retry.
      epoch.current++;
      setError('Your saved setup is taking too long to load. Check your connection, then retry.');
      setBusy('');
    }, SETUP_READ_DEADLINE_MS) };
    try {
      const result = await callJobLoop(owner, { action: 'get_existing' }, () => current() && turn === epoch.current);
      if (!current() || turn !== epoch.current) return;
      if (result.existingState === 'erasing') throw new Error('Your previous Automated Job Loop is being erased. Finish that process in your dashboard before creating a new setup.');
      // Only a read-only look at this tab's 30-minute memory: this function never writes, and a read that fails above this line clears nothing.
      let reopened: { draft: OnboardingDraft; saved: NonNullable<LoopSnapshot['profile']> } | null = null;
      if (result.snapshot) {
        const generation = result.snapshot.lifecycleGeneration;
        if (!Number.isSafeInteger(generation)) throw new Error('Your saved setup could not be verified. Retry loading it.');
        // Asked BEFORE this read can move the memory's lifecycle: a candidate is only a draft this tab already held for exactly this account, session and lifecycle, within its 30 minutes.
        // (A draft whose lifecycle this tab never saw is not adopted for a setup that is already saved; that stays as it was.)
        const held = result.snapshot.profile ? recoverOnboardingDraft(owner, authority, generation!) : null;
        setTrackingLoopGeneration(owner, generation!); snapshot.current = result.snapshot;
        if (!current()) return;
        if (result.snapshot.profile) {
          // A setup is already saved. Newer answers this tab still remembers are kept and shown beside it (the existing reconcile panel, no write); anything else is cleared, as before.
          if (held && holdsUnsavedAnswers(result.snapshot.profile, held, accountFullName(metadata))) reopened = { draft: held, saved: result.snapshot.profile };
          else { clearOnboardingDraft(); setExisting(true); }
        }
      } else if (result.existingState !== 'absent') throw new Error('Your saved setup could not be verified. Retry loading it.');
      if (reopened) {
        clearPreSignupAnswers(); restore(reopened.draft); retainedKey.current = draftKey(reopened.draft);
        setConflict({ kind: 'reopened', saved: reopened.saved }); setError(REOPENED_MESSAGE);
      } else if (!result.snapshot?.profile) {
        const recovered = recoverOnboardingDraft(owner, authority, result.snapshot?.lifecycleGeneration ?? null);
        if (recovered) {
          clearPreSignupAnswers(); restore(recovered);
        } else {
          const before = takePreSignupAnswers();
          if (before) {
            // Shown for review at step 1, never applied silently.
            setProfile(value => ({ ...value, targetTitles: before.targetTitles, locations: before.locations }));
            rolesEdited.current = true; setSuggestionSource(''); setHandoff(true);
          }
        }
      } else clearPreSignupAnswers();
      setLoaded(true);
    } catch (failure) { if (current() && turn === epoch.current) setError(failure instanceof Error ? failure.message : 'Your setup could not be loaded.'); }
    finally {
      if (loadDeadline.current?.turn === turn) { window.clearTimeout(loadDeadline.current.handle); loadDeadline.current = null; }
      if (current() && turn === epoch.current) setBusy('');
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!loaded || existing || saved || !current()) return;
    const held: OnboardingDraft = { profile, answers, step, roleQuery, locationQuery, rolesEdited: rolesEdited.current, suggestionSource, touched: [...touched.current].sort() };
    const scope = { owner, authority, generation: snapshot.current?.lifecycleGeneration ?? (absentGeneration.current === null && trackingLoopGeneration(owner) === 0 ? 0 : absentGeneration.current) };
    // Back and Next are navigation, not answers, at any time: with the answers unchanged since the draft was last remembered (or reopened) only the step is remembered and the deadline is kept,
    // so a draft shown beside a saved setup, or edited once and then walked through, still ends 30 minutes after the last change to an answer. A real change starts a new 30 minutes.
    const key = draftKey(held);
    if (retainedKey.current === key) { moveRetainedOnboardingStep(scope, step); return; }
    if (retainOnboardingDraft(scope, held)) retainedKey.current = key;
  }, [loaded, existing, saved, profile, answers, step, roleQuery, locationQuery, suggestionSource]);
  /** Returns whether the change was applied (a stale or locked page applies nothing). */
  function edit(patch: Partial<LoopProfileInput>): boolean {
    if (!current() || saving.current || unconfirmed) return false;
    epoch.current++; consentEpoch.current = null; setConsent(false); setError('');
    // The confirmation describes the text a file read just put in the CV box: once that text is typed over, pasted over or replaced, it no longer describes the box.
    if (patch.sourceText !== undefined) setReadOk(false);
    for (const key of Object.keys(patch)) touched.current.add(key);
    if (patch.targetTitles) { rolesEdited.current = true; setSuggestionSource(''); }
    if (patch.sourceText !== undefined && !rolesEdited.current) {
      const fromCv = cvRoleSuggestions(patch.sourceText), fromAccount = accountRoleSuggestions(metadata);
      patch = { ...patch, targetTitles: fromCv.length ? fromCv : fromAccount };
      setSuggestionSource(fromCv.length ? 'CV role headings' : fromAccount.length ? 'account profile' : '');
    }
    setProfile(value => ({ ...value, ...patch }));
    return true;
  }
  function changeQuery(kind: 'role' | 'location', value: string) {
    if (!current() || saving.current || busy || unconfirmed) return;
    epoch.current++; consentEpoch.current = null; setConsent(false); setError('');
    if (kind === 'role') { rolesEdited.current = true; setRoleQuery(value); } else setLocationQuery(value);
  }
  async function upload(file: File | undefined) {
    if (!file || !current() || busy || unconfirmed) return;
    const turn = ++epoch.current; setBusy('Reading your CV…'); consentEpoch.current = null; setConsent(false); setError(''); setReadOk(false);
    cvDeadline.current = { turn, handle: window.setTimeout(() => {
      if (cvDeadline.current?.turn !== turn) return;
      cvDeadline.current = null;
      if (!current() || turn !== epoch.current) return;
      // The parser may still finish; its late text can no longer reach this page. Nothing was changed.
      epoch.current++; setBusy(''); setReadOk(false);
      setError('Reading your CV is taking too long. Paste your CV text instead; nothing was changed.', 'file');
    }, CV_READ_DEADLINE_MS) };
    try { const sourceText = await extractCvText(file); if (current() && turn === epoch.current) { setBusy(''); if (edit({ sourceText })) setReadOk(true); } }
    catch (failure) { if (current() && turn === epoch.current) { setReadOk(false); setError(failure instanceof Error ? failure.message : 'The file could not be read. Paste your CV text instead.', 'file'); } }
    finally {
      if (cvDeadline.current?.turn === turn) { window.clearTimeout(cvDeadline.current.handle); cvDeadline.current = null; }
      if (current() && turn === epoch.current) setBusy('');
    }
  }
  async function save() {
    if (!current() || !loaded || !consent || consentEpoch.current !== epoch.current || saving.current || busy || conflict) return;
    const issue = Array.from({ length: 5 }, (_, index) => onboardingStepError(index, profile)).find(Boolean);
    if (issue) { setError(issue, 'fix'); return; }
    const submitted = structuredClone({ ...profile, name: profile.name.trim(), contactLine: profile.contactLine.trim(), sourceText: profile.sourceText.trim() }), turn = epoch.current;
    saving.current = true; setBusy('Saving your private setup…'); setError(''); consentEpoch.current = null; setConsent(false);
    saveDeadline.current = { turn, handle: window.setTimeout(() => {
      if (saveDeadline.current?.turn !== turn) return;
      saveDeadline.current = null;
      if (!current() || turn !== epoch.current) return;
      // The request is given up on screen only: it may still land. Its late answer is fenced out (the epoch moves on), the answers stay
      // exactly as typed, and no second write is allowed until a read of the saved setup says whether the first one arrived.
      epoch.current++; saving.current = false; reconciling.current = true; setUnconfirmed(submitted); setBusy('');
      setError('We could not confirm that your setup was saved. Your answers are still here, held exactly as you submitted them (locked) until you check whether it saved. Nothing is written again before that.');
    }, SETUP_SAVE_DEADLINE_MS) };
    try {
      // New records are initialized only after deliberate storage consent.
      // After a save that gave up waiting, the version number this page holds can be stale: read first, every time, until a save is confirmed.
      if (!snapshot.current || reconciling.current) {
        const initial = await callJobLoop(owner, { action: 'get' }, () => current() && turn === epoch.current);
        if (!current() || turn !== epoch.current) return;
        if (!initial.snapshot || initial.erasureGeneration !== undefined || !Number.isSafeInteger(initial.snapshot.lifecycleGeneration)) throw new Error('Your workspace could not be opened. Your answers are still here.');
        if (initial.snapshot.profile) {
          setTrackingLoopGeneration(owner, initial.snapshot.lifecycleGeneration!); snapshot.current = initial.snapshot; reconciling.current = false;
          // A setup is already saved. If it is exactly the write this page sent and nothing newer is on the page, that is the saved setup and there is nothing to write again;
          // otherwise the saved setup and the newer answers are kept side by side (one rule, shared with every other readback).
          const unsettled = readBack(initial.snapshot.profile, 'A setup was saved in another tab. Open your dashboard to review it; this quiz did not overwrite it. Your answers are still below, unchanged.');
          if (unsettled === null) return;
          throw new Error(unsettled);
        }
        setTrackingLoopGeneration(owner, initial.snapshot.lifecycleGeneration!); snapshot.current = initial.snapshot;
      }
      if (!current() || turn !== epoch.current) return;
      const original = snapshot.current!;
      sentWrite.current = draftState(profile, answers, roleQuery, locationQuery);
      const response = await callJobLoop(owner, boundLoopAction({ action: 'save_profile', expectedVersion: original.recordVersion, profile: submitted, saveConsent: true }, original.lifecycleGeneration), () => current() && turn === epoch.current);
      if (!current() || turn !== epoch.current) return;
      if (!response.snapshot?.profile || response.snapshot.lifecycleGeneration !== original.lifecycleGeneration || response.snapshot.recordVersion <= original.recordVersion) throw new Error('The save could not be confirmed. Your answers are still here. Open your dashboard to check before trying again.');
      for (const key of Object.keys(submitted) as (keyof LoopProfileInput)[]) {
        const same = key === 'compensation'
          ? (['currency', 'period', 'minimum'] as const).every(field => response.snapshot!.profile!.compensation[field] === submitted.compensation[field])
          : JSON.stringify(response.snapshot.profile[key]) === JSON.stringify(submitted[key]);
        if (!same) throw new Error('The returned setup differs from your answers. Open your dashboard to review it before continuing.');
      }
      snapshot.current = response.snapshot;
      const unsettled = readBack(response.snapshot.profile, 'The returned setup differs from your answers. Open your dashboard to review it before continuing.');
      if (unsettled !== null) throw new Error(unsettled);
    } catch (failure) { if (current() && turn === epoch.current) setError(failure instanceof Error ? failure.message : 'The save could not be confirmed. Check your dashboard before trying again.'); }
    finally {
      if (saveDeadline.current?.turn === turn) { window.clearTimeout(saveDeadline.current.handle); saveDeadline.current = null; }
      // A given-up request that settles late must not unlock a newer save: only the turn that still owns the page releases it.
      if (turn === epoch.current) saving.current = false;
      if (current() && turn === epoch.current) setBusy('');
    }
  }
  /** Read-only check after an unconfirmed save: says whether the write arrived before anything is written again. */
  async function checkSaved() {
    if (!unconfirmed || !current() || busy) return;
    const turn = ++epoch.current; setBusy('Checking your saved setup…'); setError(''); consentEpoch.current = null; setConsent(false);
    if (checkDeadline.current) window.clearTimeout(checkDeadline.current.handle);
    checkDeadline.current = { turn, handle: window.setTimeout(() => {
      if (checkDeadline.current?.turn !== turn) return;
      checkDeadline.current = null;
      if (!current() || turn !== epoch.current) return;
      epoch.current++; setBusy('');
      setError('Checking your saved setup is taking too long. Your answers are still here. Try the check again, or open your dashboard.');
    }, SETUP_READ_DEADLINE_MS) };
    try {
      const result = await callJobLoop(owner, { action: 'get_existing' }, () => current() && turn === epoch.current);
      if (!current() || turn !== epoch.current) return;
      if (result.existingState === 'erasing') throw new Error('Your previous Automated Job Loop is being erased. Finish that process in your dashboard before saving a new setup.');
      const generation = result.snapshot?.lifecycleGeneration;
      if (result.snapshot?.profile) {
        if (!Number.isSafeInteger(generation)) throw new Error('Your saved setup could not be verified. Check again.');
        setTrackingLoopGeneration(owner, generation!); snapshot.current = result.snapshot; setUnconfirmed(null);
        // Not "does the saved profile match the last attempt" (an attempt can give up before it sends a write, and a newer answer may have been added since): the shared rule asks whether
        // the page still holds exactly the draft of the write that was sent.
        const unsettled = readBack(result.snapshot.profile, 'A different setup is already saved in your account. Open your dashboard to review it; this quiz did not overwrite it. Your answers are still below, unchanged.');
        if (unsettled !== null) setError(unsettled);
      } else if (result.existingState === 'absent' || result.snapshot) {
        if (result.snapshot) {
          if (!Number.isSafeInteger(generation)) throw new Error('Your saved setup could not be verified. Check again.');
          setTrackingLoopGeneration(owner, generation!); snapshot.current = result.snapshot;
        } else snapshot.current = null;      // forces a fresh read before the next write
        // "Nothing yet" is not "nothing ever": the original write may still land, so the next save starts with another fresh read (also for an initialized but empty record).
        reconciling.current = true;
        setUnconfirmed(null);
        setError('Nothing was saved. Your answers are still here. Review them, tick the confirmation box and save again.');
      } else throw new Error('Your saved setup could not be verified. Your answers are still here. Check again.');
    } catch (failure) { if (current() && turn === epoch.current) setError(failure instanceof Error ? failure.message : 'Your saved setup could not be checked. Try again.'); }
    finally {
      if (checkDeadline.current?.turn === turn) { window.clearTimeout(checkDeadline.current.handle); checkDeadline.current = null; }
      if (current() && turn === epoch.current) setBusy('');
    }
  }
  // Save is disabled for other reasons too (saving, an unconfirmed save, a setup saved elsewhere), each with its own message; only the missing tick is explained here.
  const needsTick = !consent && !busy && !unconfirmed && !conflict;
  // Offered only on the confirmed-save screen (`saved` is set only by a confirmed readback), and only when the address carried a valid plan.
  const planChoice = saved && planReturn ? pricingChoiceFromReturn(planReturn) : null;
  return <main className="loop-onboarding">
    <Helmet><title>Set up your Automated Job Loop | Jobvance</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <header><Link to="/loop" className="oq-back"><ArrowLeft size={16} /> Back to your Automated Job Loop</Link><p className="oq-eyebrow">AUTOMATED JOB LOOP SETUP</p>
      <h1 ref={heading} tabIndex={-1}>{saved ? 'Your setup is saved.' : existing ? 'Your Automated Job Loop is ready to continue.' : questions[step]}</h1>
      {!saved && !existing && <><p>Tell us the roles and places you want, then add your CV. Pay and privacy choices are optional.</p><div className="oq-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={6} aria-valuenow={step + 1}><span style={{ transform: `scaleX(${(step + 1) / 6})` }} /></div><p className="oq-step">Step {step + 1} of 6</p></>}
    </header>
    {error && <div role="alert" className="oq-error" tabIndex={-1} ref={node => { if (node) { node.focus(); node.scrollIntoView?.({ block: "center", behavior: "auto" }); } }}>{error}{errorKind === 'dashboard' && <p><Link to="/loop">Check my saved dashboard</Link></p>}{errorKind === 'file' && <p className="oq-recovery"><button type="button" className="jl-button" onClick={() => recoverCv('paste')}>Paste my CV text instead</button><button type="button" className="jl-button" onClick={() => recoverCv('file')}>Choose another file</button></p>}</div>}
    {busy && <p role="status"><Loader2 size={18} className="animate-spin" /> {busy}</p>}
    {unconfirmed && !busy && !saved && !existing && <><p className="oq-note" role="note">Your answers are locked while we are unsure whether the save arrived, so a check can never be compared with a changed draft. The check unlocks them; your dashboard is always available above.</p><button type="button" className="jl-button jl-button--primary" onClick={() => void checkSaved()}>Check whether my setup was saved</button></>}
    {!busy && !loaded && <button className="jl-button" onClick={() => void load()}>Retry loading my setup</button>}
    {existing && <section className="oq-card"><p>Your saved CV and preferences are already in your account. Continue there to preserve your current drafts, facts and schedule.</p><Link className="jl-button jl-button--primary" to="/loop">Open my Automated Job Loop <ArrowRight size={16} /></Link></section>}
    {saved && <section className="oq-card"><Check size={32} /><h2>Next: review your facts and run your first search.</h2><p>Review useful facts copied from your CV, then deliberately start a search with your saved preferences. Add CV variants and a recurring schedule when you are ready.</p><p>Saving this setup has not started a search, activated a schedule or sent your CV to an AI provider.</p><div className="oq-saved-actions"><Link className="jl-button jl-button--primary" to="/loop" state={{ onboardingSaved: true, owner, generation: snapshot.current?.lifecycleGeneration, authority }}>Continue to my Automated Job Loop <ArrowRight size={16} /></Link>{planChoice && <Link className="jl-button" to={planReturn!}>Return to the {planChoice.name} plan <ArrowRight size={16} /></Link>}</div>{planChoice && <p className="oq-plan-note">You were choosing the {planChoice.name} plan. Returning shows its current price and asks you to confirm again; nothing is bought until you do.</p>}</section>}
    {conflict && !saved && !existing && (() => {
      const retained = conflict.kind === 'reopened', prefilled = accountFullName(metadata);
      const draft = unsavedDraft(conflict.saved, profile, answers as unknown as Record<string, string>, roleQuery, locationQuery, retained, retained && prefilled !== '' && !touched.current.has('name') && profile.name.trim() === prefilled);
      return <section className="oq-card oq-conflict" aria-labelledby="oq-conflict-title">
        <h2 id="oq-conflict-title">{conflict.kind === 'earlier' ? 'Your earlier setup was saved after all.' : 'A setup is already saved in your account.'}</h2>
        <p>{conflict.kind === 'earlier' ? 'The save that looked stuck did arrive, with the answers you submitted then.' : conflict.kind === 'reopened' ? 'It is a setup this page had not seen: an earlier save that arrived late, or one made in another tab or on another device.' : 'It was saved before this page could write.'} Nothing was overwritten, and this page will not write again.</p>
        <dl className="oq-review"><dt>Saved roles</dt><dd>{conflict.saved.targetTitles.join(', ') || '(none)'}</dd><dt>Saved locations</dt><dd>{conflict.saved.locations.join(', ') || '(none)'}</dd><dt>Saved name</dt><dd>{conflict.saved.name || '(empty)'}</dd></dl>
        <p>{draft.changed.length ? `${retained ? 'Retained in this tab and not part of the saved setup' : 'Still here and NOT saved'}: ${draft.changed.join(', ')}.` : 'Everything on this page matches the saved setup.'}</p>
        <details open><summary>{retained ? 'Answers retained in this tab (not saved)' : 'Your newer answers (not saved)'}</summary>
          <label htmlFor="oq-unsaved-copy">Read them here, or copy them before you leave. This tab keeps them for up to 30 minutes; refreshing, closing the tab or signing out clears them.</label>
          <textarea id="oq-unsaved-copy" readOnly rows={10} value={draft.text} />
          <button type="button" className="jl-button" onClick={() => { const done = () => setCopied('Copied.'); const fail = () => setCopied('Copying was blocked. Select the text above and copy it yourself.'); try { void navigator.clipboard.writeText(draft.text).then(done, fail); } catch { fail(); } }}>{retained ? 'Copy retained answers' : 'Copy my newer answers'}</button>
          {copied && <p role="status">{copied}</p>}
        </details>
        <Link className="jl-button jl-button--primary" to="/loop">Open my saved dashboard <ArrowRight size={16} /></Link>
      </section>;
    })()}
    {loaded && !existing && !saved && <section className="oq-card"><fieldset disabled={!!busy || !!unconfirmed}>
      {step === 0 && <><LoopPreferencePicker id="oq-roles" label="Target roles" searchLabel="Search or add a role" values={profile.targetTitles} query={roleQuery} choices={roleChoices} onQuery={value => changeQuery('role', value)} onChange={targetTitles => edit({ targetTitles })} description="Choose a specific title, such as Senior data analyst, or a broad level, such as Any director-level role." />
        {handoff && <p className="oq-suggestion" role="status">We filled in the roles and locations chosen on this device before sign-up. Check them, and change anything that is not yours.</p>}
        {suggestionSource && <p className="oq-suggestion" role="status">Suggested from your {suggestionSource}. These are editable search preferences—remove anything you do not want.</p>}
        <details className="oq-early-cv"><summary>Suggest roles from my CV (optional)</summary><p>Add your CV here to suggest up to three recognized role headings. Your name and email from Google sign-in do not tell us your profession. Once you edit the roles, uploading a CV will keep your choices.</p><div className="jl-field"><label htmlFor="oq-early-file">Upload a CV for role suggestions</label><input id="oq-early-file" type="file" accept=".pdf,.docx,.txt" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /><FileReadStatus confirmed={readOk} /><p>PDF, DOCX or TXT, up to 5 MB. Read locally on this device.</p></div><div className="jl-field"><label htmlFor="oq-early-source">Paste your CV for role suggestions</label><textarea id="oq-early-source" rows={5} maxLength={60000} value={profile.sourceText} onChange={event => edit({ sourceText: event.target.value })} /></div><p>Your CV will be here to review in the experience step. Nothing is saved or sent to an AI provider yet.</p></details></>}
      {step === 1 && <LoopPreferencePicker id="oq-locations" label="Cities or countries" searchLabel="Search or add a location" values={profile.locations} query={locationQuery} choices={locationChoices} onQuery={value => changeQuery('location', value)} onChange={locations => edit({ locations })} description="Choose cities or countries. For remote work, add Remote and the countries where you can work; remote does not mean every country. Check each employer’s work-authorisation requirements." />}
      {step === 2 && <><p>Optional. A listing without pay information is shown as unknown.</p><div className="jl-form-grid"><div className="jl-field"><label htmlFor="oq-minimum">Minimum compensation</label><input id="oq-minimum" type="number" min={0} max={100000000} value={profile.compensation.minimum ?? ''} onChange={event => edit({ compensation: { ...profile.compensation, minimum: event.target.value === '' ? null : Number(event.target.value) } })} /></div><div className="jl-field"><label htmlFor="oq-currency">Currency</label><input id="oq-currency" maxLength={3} placeholder="USD" value={profile.compensation.currency} onChange={event => edit({ compensation: { ...profile.compensation, currency: event.target.value.toUpperCase() } })} /></div></div><div className="jl-field"><label htmlFor="oq-period">Pay period</label><select id="oq-period" value={profile.compensation.period} onChange={event => edit({ compensation: { ...profile.compensation, period: event.target.value as 'annual' | 'monthly' | 'hourly' } })}><option value="annual">Per year</option><option value="monthly">Per month</option><option value="hourly">Per hour</option></select></div></>}
      {step === 3 && <><label className="jl-consent"><input type="checkbox" checked={profile.discreetSearch} onChange={event => edit({ discreetSearch: event.target.checked })} /><span>Keep my job search discreet.</span></label><div className="jl-field"><label htmlFor="oq-private">Terms or details to keep out of generated documents (optional)</label><textarea id="oq-private" rows={3} maxLength={15000} value={profile.excludedTerms.join('\n')} onChange={event => edit({ excludedTerms: event.target.value.split('\n') })} /><p>One per line, such as confidential client names. Remove sensitive details from your CV before saving too. This does not hide your activity from an employer or block all related companies.</p></div></>}
      {step === 4 && <><div className="jl-field"><label htmlFor="oq-name">Name on your CV</label><input id="oq-name" autoComplete="name" maxLength={120} value={profile.name} onChange={event => edit({ name: event.target.value })} /></div><div className="jl-field"><label htmlFor="oq-file">Upload a CV or LinkedIn PDF</label><input id="oq-file" type="file" accept=".pdf,.docx,.txt" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /><FileReadStatus confirmed={readOk} /><p>Readable PDF, DOCX or TXT, up to 5 MB. Your file is read on this device; review the extracted text below.</p></div><div className="jl-field"><label htmlFor="oq-source">Your CV text</label><textarea id="oq-source" rows={10} maxLength={60000} value={profile.sourceText} onChange={event => edit({ sourceText: event.target.value })} /></div><OptionalDetails filled={profile.contactLine !== '' || profile.experienceYears !== null} invalid={optionalDetailsInvalid(profile)} rejected={optionalRejected}><div className="jl-field"><label htmlFor="oq-contact">Contact line for your CV (optional)</label><input id="oq-contact" maxLength={500} value={profile.contactLine} onChange={event => edit({ contactLine: event.target.value })} /><p>Review and add the email, phone or links you want employers to see. Only include contact details you permit in generated documents.</p></div><div className="jl-field"><label htmlFor="oq-years">Years of relevant experience (optional)</label><input id="oq-years" type="number" min={0} max={80} step={0.5} value={profile.experienceYears ?? ''} onChange={event => edit({ experienceYears: event.target.value === '' ? null : Number(event.target.value) })} /><p>Use the total you can substantiate. Leave unknown years empty; we do not calculate years by adding dates.</p></div></OptionalDetails><LoopCvBuilder answers={answers} onChange={value => { if (current() && !unconfirmed) { epoch.current++; consentEpoch.current = null; setConsent(false); setAnswers(value); } }} source={profile.sourceText} onUse={sourceText => { if (!current() || busy || unconfirmed) return false; edit({ sourceText, ...(!profile.name.trim() && answers.name.trim() ? { name: answers.name.trim().slice(0, 120) } : {}) }); return true; }} disabled={!!busy} /></>}
      {step === 5 && <><dl className="oq-review"><dt>Roles</dt><dd>{profile.targetTitles.join(', ')}</dd><dt>Locations</dt><dd>{profile.locations.join(', ')}</dd><dt>Compensation</dt><dd>{profile.compensation.minimum === null ? 'No minimum set' : `${profile.compensation.minimum.toLocaleString()} ${profile.compensation.currency} / ${profile.compensation.period}`}</dd><dt>Discreet search</dt><dd>{profile.discreetSearch ? 'On' : 'Off'}</dd><dt>Contact line</dt><dd>{profile.contactLine || 'Not included'}</dd><dt>Experience</dt><dd>{profile.experienceYears === null ? 'Not specified' : `${profile.experienceYears} years`}</dd><dt>CV</dt><dd>{profile.name} · {profile.sourceText.length.toLocaleString()} characters</dd></dl><details><summary>Review the exact CV text to save</summary><pre>{profile.sourceText}</pre></details><p>Next, review your facts and run your first search. AI processing and recurring preparation each need your explicit confirmation.</p><label className="jl-consent"><input type="checkbox" checked={consent} disabled={!!conflict} onChange={event => { if (current() && !unconfirmed && !conflict) { consentEpoch.current = event.target.checked ? epoch.current : null; setConsent(event.target.checked); } }} /><span>Save this CV text and these preferences privately in my Jobvance account.</span></label></>}
      <div className="oq-actions">{step > 0 && <button type="button" className="jl-button" onClick={() => { if (unconfirmed) return; setStep(value => value - 1); setError(''); consentEpoch.current = null; setConsent(false); }}>Back</button>}{step < 5 ? <button className="jl-button jl-button--primary" onClick={() => { const clean = { ...profile, targetTitles: cleanPreferences([...profile.targetTitles, ...(step === 0 && roleQuery.trim() ? [roleQuery.trim()] : [])]), locations: cleanPreferences([...profile.locations, ...(step === 1 && locationQuery.trim() ? [locationQuery.trim()] : [])]), excludedTerms: list(profile.excludedTerms.join('\n')) }; if (!current() || busy || unconfirmed) return; setProfile(clean); if (step === 0) setRoleQuery(''); if (step === 1) setLocationQuery(''); const issue = onboardingStepError(step, clean); if (issue) { setError(issue, 'fix'); if (step === 4 && optionalDetailsInvalid(clean)) setOptionalRejected(count => count + 1); } else if (current() && !busy) { if (step === 0) rolesEdited.current = true; setError(''); setStep(value => value + 1); } }}>Next <ArrowRight size={16} /></button> : <>{needsTick && <p id="oq-save-reason" className="oq-save-reason">Tick the box above to save</p>}<button className="jl-button jl-button--primary" disabled={!consent || !!busy || !!unconfirmed || !!conflict} aria-describedby={needsTick ? 'oq-save-reason' : undefined} onClick={() => void save()}>Save my setup <ArrowRight size={16} /></button></>}</div>
    </fieldset><p className="oq-note">You can return to your Automated Job Loop and resume here for up to 30 minutes in this tab. Refreshing, closing the tab or signing out clears unsaved answers. Nothing is saved to your account until you confirm.</p></section>}
  </main>;
}
