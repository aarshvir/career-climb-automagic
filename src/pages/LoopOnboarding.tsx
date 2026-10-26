import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { callJobLoop, boundLoopAction, type LoopSnapshot } from '@/lib/job-loop-api';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { extractCvText, validateCvText } from '@/lib/cv-extraction';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { registerTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority, trackingLoopGeneration } from '@/lib/tracking-draft-memory';
import type { LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';
import LoopCvBuilder from './LoopCvBuilder';
import LoopPreferencePicker from '@/components/LoopPreferencePicker';
import { accountRoleSuggestions, cvRoleSuggestions, roleChoices, locationChoices, cleanPreferences } from '@/lib/loop-role-suggestions';
import { retainOnboardingDraft, recoverOnboardingDraft, clearOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { adAttributionQuery } from '@/lib/meta-pixel';
import './JobLoop.css';
import './LoopOnboarding.css';

const questions = ['Which roles would you like to find?', 'Where would you like to work?', 'What compensation would you consider?', 'What should stay private?', 'Bring your experience', 'Review your Automated Job Loop setup'];
const list = (value: string) => [...new Set(value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))];

export function onboardingStepError(step: number, profile: LoopProfileInput): string {
  if (step === 0 && (!profile.targetTitles.length || profile.targetTitles.length > 10 || profile.targetTitles.some(value => value.length > 150))) return 'Add between one and ten role titles or seniority preferences, each under 150 characters.';
  if (step === 1 && (!profile.locations.length || profile.locations.length > 10 || profile.locations.some(value => value.length > 150))) return 'Add between one and ten cities or countries, each under 150 characters. For remote work, include where you can work.';
  if (step === 2 && profile.compensation.currency && !/^[A-Z]{3}$/.test(profile.compensation.currency)) return 'Use a three-letter currency, such as USD, or leave it empty when no minimum is set.';
  if (step === 2 && profile.compensation.minimum !== null && (!Number.isFinite(profile.compensation.minimum) || profile.compensation.minimum < 0 || profile.compensation.minimum > 100000000 || !/^[A-Z]{3}$/.test(profile.compensation.currency))) return 'Use a non-negative minimum and a three-letter currency, such as USD. You can leave the minimum empty.';
  if (step === 3 && (profile.excludedTerms.length > 100 || profile.excludedTerms.some(value => value.length > 150))) return 'Keep each private term under 150 characters, with at most 100 terms.';
  if (step === 4) {
    if (!profile.name.trim() || profile.name.trim().length > 120) return 'Add the name you want on your CV, up to 120 characters.';
    if (profile.contactLine.length > 500) return 'Keep your CV contact line under 500 characters.';
    if (profile.experienceYears !== null && (!Number.isFinite(profile.experienceYears) || profile.experienceYears < 0 || profile.experienceYears > 80)) return 'Use a number from 0 to 80 for experience years, or leave it empty.';
    try { validateCvText(profile.sourceText); } catch (error) { return error instanceof Error ? error.message : 'Review your CV text.'; }
  }
  return '';
}

/** Only the existing owned Loop record is written. No onboarding-complete flag,
 * automatic model request, implicit fact approval or schedule activation. */
export default function LoopOnboarding() {
  const { user, loading, authError, retryConnection } = useAuth();
  const { search } = useLocation();
  if (loading) return <main className="loop-onboarding"><p role="status">Opening your account…</p></main>;
  if (authError) return <main className="loop-onboarding"><p role="alert">Your sign-in could not be restored.</p><button onClick={retryConnection}>Retry sign-in recovery</button><Link to="/auth?next=%2Fonboarding">Sign in</Link></main>;
  // Ad campaign tags survive the sign-up redirect so the visit stays attributed.
  if (!user) return <Navigate to={`/auth?mode=signup&next=%2Fonboarding${adAttributionQuery(search)}`} replace />;
  registerTrackingDraftOwner(user.id);
  return <OwnedQuiz key={`${user.id}:${trackingDraftAuthority(user.id)}`} owner={user.id} metadata={user.user_metadata} />;
}

function OwnedQuiz({ owner, metadata }: { owner: string; metadata: unknown }) {
  const authority = trackingDraftAuthority(owner);
  const [profile, setProfile] = useState(() => ({ ...blankLoopProfile('professional'), targetTitles: accountRoleSuggestions(metadata) }));
  const rolesEdited = useRef(false);
  const [roleQuery, setRoleQuery] = useState(''), [locationQuery, setLocationQuery] = useState('');
  const [suggestionSource, setSuggestionSource] = useState(accountRoleSuggestions(metadata).length ? 'account profile' : '');
  const [answers, setAnswers] = useState(blankLoopCvAnswers);
  const [step, setStep] = useState(0), [busy, setBusy] = useState('Loading your saved setup…'), [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false), [existing, setExisting] = useState(false), [saved, setSaved] = useState(false), [consent, setConsent] = useState(false);
  const consentEpoch = useRef<number | null>(null);
  const snapshot = useRef<LoopSnapshot | null>(null), alive = useRef(true), epoch = useRef(0), saving = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const absentGeneration = useRef(trackingLoopGeneration(owner) ?? null);
  const current = () => {
    const observed = trackingLoopGeneration(owner) ?? null;
    const expected = snapshot.current?.lifecycleGeneration ?? absentGeneration.current;
    const sameLifecycle = observed === expected || (expected === null && observed === 0);
    return alive.current && authority >= 0 && trackingDraftAuthority(owner) === authority && sameLifecycle;
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++; }; }, []);
  useEffect(() => { heading.current?.focus(); }, [step, saved]);
  async function load() {
    const turn = ++epoch.current; setBusy('Loading your saved setup…'); setError(''); consentEpoch.current = null; setConsent(false);
    try {
      const result = await callJobLoop(owner, { action: 'get_existing' }, () => current() && turn === epoch.current);
      if (!current() || turn !== epoch.current) return;
      if (result.existingState === 'erasing') throw new Error('Your previous Automated Job Loop is being erased. Finish that process in your dashboard before creating a new setup.');
      if (result.snapshot) {
        const generation = result.snapshot.lifecycleGeneration;
        if (!Number.isSafeInteger(generation)) throw new Error('Your saved setup could not be verified. Retry loading it.');
        setTrackingLoopGeneration(owner, generation!); snapshot.current = result.snapshot;
        if (!current()) return;
        if (result.snapshot.profile) { clearOnboardingDraft(); setExisting(true); }
      } else if (result.existingState !== 'absent') throw new Error('Your saved setup could not be verified. Retry loading it.');
      if (!result.snapshot?.profile) {
        const recovered = recoverOnboardingDraft(owner, authority, result.snapshot?.lifecycleGeneration ?? null);
        if (recovered) {
          setProfile(recovered.profile); setAnswers(recovered.answers); setStep(recovered.step);
          setRoleQuery(recovered.roleQuery); setLocationQuery(recovered.locationQuery);
          rolesEdited.current = recovered.rolesEdited; setSuggestionSource(recovered.suggestionSource);
        }
      }
      setLoaded(true);
    } catch (failure) { if (current() && turn === epoch.current) setError(failure instanceof Error ? failure.message : 'Your setup could not be loaded.'); }
    finally { if (current() && turn === epoch.current) setBusy(''); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!loaded || existing || saved || !current()) return;
    retainOnboardingDraft({ owner, authority, generation: snapshot.current?.lifecycleGeneration ?? (absentGeneration.current === null && trackingLoopGeneration(owner) === 0 ? 0 : absentGeneration.current) },
      { profile, answers, step, roleQuery, locationQuery, rolesEdited: rolesEdited.current, suggestionSource });
  }, [loaded, existing, saved, profile, answers, step, roleQuery, locationQuery, suggestionSource]);
  function edit(patch: Partial<LoopProfileInput>) {
    if (!current() || saving.current) return;
    epoch.current++; consentEpoch.current = null; setConsent(false); setError('');
    if (patch.targetTitles) { rolesEdited.current = true; setSuggestionSource(''); }
    if (patch.sourceText !== undefined && !rolesEdited.current) {
      const fromCv = cvRoleSuggestions(patch.sourceText), fromAccount = accountRoleSuggestions(metadata);
      patch = { ...patch, targetTitles: fromCv.length ? fromCv : fromAccount };
      setSuggestionSource(fromCv.length ? 'CV role headings' : fromAccount.length ? 'account profile' : '');
    }
    setProfile(value => ({ ...value, ...patch }));
  }
  function changeQuery(kind: 'role' | 'location', value: string) {
    if (!current() || saving.current || busy) return;
    epoch.current++; consentEpoch.current = null; setConsent(false); setError('');
    if (kind === 'role') { rolesEdited.current = true; setRoleQuery(value); } else setLocationQuery(value);
  }
  async function upload(file: File | undefined) {
    if (!file || !current() || busy) return;
    const turn = ++epoch.current; setBusy('Reading your CV…'); consentEpoch.current = null; setConsent(false); setError('');
    try { const sourceText = await extractCvText(file); if (current() && turn === epoch.current) { setBusy(''); edit({ sourceText }); } }
    catch (failure) { if (current() && turn === epoch.current) setError(failure instanceof Error ? failure.message : 'The file could not be read. Paste your CV text instead.'); }
    finally { if (current() && turn === epoch.current) setBusy(''); }
  }
  async function save() {
    if (!current() || !loaded || !consent || consentEpoch.current !== epoch.current || saving.current || busy) return;
    const issue = Array.from({ length: 5 }, (_, index) => onboardingStepError(index, profile)).find(Boolean);
    if (issue) { setError(issue); return; }
    const submitted = structuredClone({ ...profile, name: profile.name.trim(), contactLine: profile.contactLine.trim(), sourceText: profile.sourceText.trim() }), turn = epoch.current;
    saving.current = true; setBusy('Saving your private setup…'); setError(''); consentEpoch.current = null; setConsent(false);
    try {
      // New records are initialized only after deliberate storage consent.
      if (!snapshot.current) {
        const initial = await callJobLoop(owner, { action: 'get' }, () => current() && turn === epoch.current);
        if (!current() || turn !== epoch.current) return;
        if (!initial.snapshot || initial.erasureGeneration !== undefined || !Number.isSafeInteger(initial.snapshot.lifecycleGeneration)) throw new Error('Your workspace could not be opened. Your answers are still here.');
        if (initial.snapshot.profile) { setExisting(true); throw new Error('A setup was saved in another tab. Open your dashboard to review it; this quiz did not overwrite it.'); }
        setTrackingLoopGeneration(owner, initial.snapshot.lifecycleGeneration!); snapshot.current = initial.snapshot;
      }
      if (!current() || turn !== epoch.current) return;
      const original = snapshot.current!;
      const response = await callJobLoop(owner, boundLoopAction({ action: 'save_profile', expectedVersion: original.recordVersion, profile: submitted, saveConsent: true }, original.lifecycleGeneration), () => current() && turn === epoch.current);
      if (!current() || turn !== epoch.current) return;
      if (!response.snapshot?.profile || response.snapshot.lifecycleGeneration !== original.lifecycleGeneration || response.snapshot.recordVersion <= original.recordVersion) throw new Error('The save could not be confirmed. Your answers are still here. Open your dashboard to check before trying again.');
      for (const key of Object.keys(submitted) as (keyof LoopProfileInput)[]) {
        const same = key === 'compensation'
          ? (['currency', 'period', 'minimum'] as const).every(field => response.snapshot!.profile!.compensation[field] === submitted.compensation[field])
          : JSON.stringify(response.snapshot.profile[key]) === JSON.stringify(submitted[key]);
        if (!same) throw new Error('The returned setup differs from your answers. Open your dashboard to review it before continuing.');
      }
      snapshot.current = response.snapshot; clearOnboardingDraft(); setSaved(true);
    } catch (failure) { if (current() && turn === epoch.current) setError(failure instanceof Error ? failure.message : 'The save could not be confirmed. Check your dashboard before trying again.'); }
    finally { saving.current = false; if (current() && turn === epoch.current) setBusy(''); }
  }
  return <main className="loop-onboarding">
    <Helmet><title>Set up your Automated Job Loop | Jobvance</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <header><Link to="/loop" className="oq-back"><ArrowLeft size={16} /> Back to your Automated Job Loop</Link><p className="oq-eyebrow">AUTOMATED JOB LOOP SETUP</p>
      <h1 ref={heading} tabIndex={-1}>{saved ? 'Your setup is saved.' : existing ? 'Your Automated Job Loop is ready to continue.' : questions[step]}</h1>
      {!saved && !existing && <><p>Tell us the jobs you want, add your CV, then choose your search schedule.</p><div className="oq-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={6} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) / 6 * 100}%` }} /></div><p className="oq-step">Step {step + 1} of 6</p></>}
    </header>
    {error && <div role="alert" className="oq-error" tabIndex={-1} ref={node => { if (node) { node.focus(); node.scrollIntoView?.({ block: "center", behavior: "smooth" }); } }}>{error}<p><Link to="/loop">Check my saved dashboard</Link></p></div>}
    {busy && <p role="status"><Loader2 size={18} className="animate-spin" /> {busy}</p>}
    {!busy && !loaded && <button className="jl-button" onClick={() => void load()}>Retry loading my setup</button>}
    {existing && <section className="oq-card"><p>Your saved CV and preferences are already in your account. Continue there to preserve your current drafts, facts and schedule.</p><Link className="jl-button jl-button--primary" to="/loop">Open my Automated Job Loop <ArrowRight size={16} /></Link></section>}
    {saved && <section className="oq-card"><Check size={32} /><h2>Next: review your facts and run your first search.</h2><p>Review useful facts copied from your CV, then deliberately start a search with your saved preferences. Add CV variants and a recurring schedule when you are ready.</p><p>Saving this setup has not started a search, activated a schedule or sent your CV to an AI provider.</p><Link className="jl-button jl-button--primary" to="/loop" state={{ onboardingSaved: true, owner, generation: snapshot.current?.lifecycleGeneration, authority }}>Continue to my Automated Job Loop <ArrowRight size={16} /></Link></section>}
    {loaded && !existing && !saved && <section className="oq-card"><fieldset disabled={!!busy}>
      {step === 0 && <><LoopPreferencePicker id="oq-roles" label="Target roles" searchLabel="Search or add a role" values={profile.targetTitles} query={roleQuery} choices={roleChoices} onQuery={value => changeQuery('role', value)} onChange={targetTitles => edit({ targetTitles })} description="Choose a specific title, such as Senior data analyst, or a broad level, such as Any director-level role." />
        {suggestionSource && <p className="oq-suggestion" role="status">Suggested from your {suggestionSource}. These are editable search preferences—remove anything you do not want.</p>}
        <details className="oq-early-cv"><summary>Suggest roles from my CV (optional)</summary><p>Add your CV here to suggest up to three recognized role headings. Your name and email from Google sign-in do not tell us your profession. Once you edit the roles, uploading a CV will keep your choices.</p><div className="jl-field"><label htmlFor="oq-early-file">Upload a CV for role suggestions</label><input id="oq-early-file" type="file" accept=".pdf,.docx,.txt" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /><p>PDF, DOCX or TXT, up to 5 MB. Read locally on this device.</p></div><div className="jl-field"><label htmlFor="oq-early-source">Paste your CV for role suggestions</label><textarea id="oq-early-source" rows={5} maxLength={60000} value={profile.sourceText} onChange={event => edit({ sourceText: event.target.value })} /></div><p>Your CV will be here to review in the experience step. Nothing is saved or sent to an AI provider yet.</p></details></>}
      {step === 1 && <LoopPreferencePicker id="oq-locations" label="Cities or countries" searchLabel="Search or add a location" values={profile.locations} query={locationQuery} choices={locationChoices} onQuery={value => changeQuery('location', value)} onChange={locations => edit({ locations })} description="Choose cities or countries. For remote work, add Remote and the countries where you can work; remote does not mean every country. Check each employer’s work-authorisation requirements." />}
      {step === 2 && <><p>Optional. A listing without pay information is shown as unknown.</p><div className="jl-form-grid"><div className="jl-field"><label htmlFor="oq-minimum">Minimum compensation</label><input id="oq-minimum" type="number" min={0} max={100000000} value={profile.compensation.minimum ?? ''} onChange={event => edit({ compensation: { ...profile.compensation, minimum: event.target.value === '' ? null : Number(event.target.value) } })} /></div><div className="jl-field"><label htmlFor="oq-currency">Currency</label><input id="oq-currency" maxLength={3} placeholder="USD" value={profile.compensation.currency} onChange={event => edit({ compensation: { ...profile.compensation, currency: event.target.value.toUpperCase() } })} /></div></div><div className="jl-field"><label htmlFor="oq-period">Pay period</label><select id="oq-period" value={profile.compensation.period} onChange={event => edit({ compensation: { ...profile.compensation, period: event.target.value as 'annual' | 'monthly' | 'hourly' } })}><option value="annual">Per year</option><option value="monthly">Per month</option><option value="hourly">Per hour</option></select></div></>}
      {step === 3 && <><label className="jl-consent"><input type="checkbox" checked={profile.discreetSearch} onChange={event => edit({ discreetSearch: event.target.checked })} /><span>Keep my job search discreet.</span></label><div className="jl-field"><label htmlFor="oq-private">Terms or details to keep out of generated documents (optional)</label><textarea id="oq-private" rows={3} maxLength={15000} value={profile.excludedTerms.join('\n')} onChange={event => edit({ excludedTerms: event.target.value.split('\n') })} /><p>One per line, such as confidential client names. Remove sensitive details from your CV before saving too. This does not hide your activity from an employer or block all related companies.</p></div></>}
      {step === 4 && <><div className="jl-field"><label htmlFor="oq-name">Name on your CV</label><input id="oq-name" autoComplete="name" maxLength={120} value={profile.name} onChange={event => edit({ name: event.target.value })} /></div><div className="jl-field"><label htmlFor="oq-contact">Contact line for your CV (optional)</label><input id="oq-contact" maxLength={500} value={profile.contactLine} onChange={event => edit({ contactLine: event.target.value })} /><p>Review and add the email, phone or links you want employers to see. Only include contact details you permit in generated documents.</p></div><div className="jl-field"><label htmlFor="oq-years">Years of relevant experience (optional)</label><input id="oq-years" type="number" min={0} max={80} step={0.5} value={profile.experienceYears ?? ''} onChange={event => edit({ experienceYears: event.target.value === '' ? null : Number(event.target.value) })} /><p>Use the total you can substantiate. Leave unknown years empty; we do not calculate years by adding dates.</p></div><div className="jl-field"><label htmlFor="oq-file">Upload a CV or LinkedIn PDF</label><input id="oq-file" type="file" accept=".pdf,.docx,.txt" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /><p>Readable PDF, DOCX or TXT, up to 5 MB. Your file is read on this device; review the extracted text below.</p></div><div className="jl-field"><label htmlFor="oq-source">Your CV text</label><textarea id="oq-source" rows={10} maxLength={60000} value={profile.sourceText} onChange={event => edit({ sourceText: event.target.value })} /></div><LoopCvBuilder answers={answers} onChange={value => { if (current()) { epoch.current++; consentEpoch.current = null; setConsent(false); setAnswers(value); } }} source={profile.sourceText} onUse={sourceText => { if (!current() || busy) return false; edit({ sourceText, ...(!profile.name.trim() && answers.name.trim() ? { name: answers.name.trim().slice(0, 120) } : {}) }); return true; }} disabled={!!busy} /></>}
      {step === 5 && <><dl className="oq-review"><dt>Roles</dt><dd>{profile.targetTitles.join(', ')}</dd><dt>Locations</dt><dd>{profile.locations.join(', ')}</dd><dt>Compensation</dt><dd>{profile.compensation.minimum === null ? 'No minimum set' : `${profile.compensation.minimum.toLocaleString()} ${profile.compensation.currency} / ${profile.compensation.period}`}</dd><dt>Discreet search</dt><dd>{profile.discreetSearch ? 'On' : 'Off'}</dd><dt>Contact line</dt><dd>{profile.contactLine || 'Not included'}</dd><dt>Experience</dt><dd>{profile.experienceYears === null ? 'Not specified' : `${profile.experienceYears} years`}</dd><dt>CV</dt><dd>{profile.name} · {profile.sourceText.length.toLocaleString()} characters</dd></dl><details><summary>Review the exact CV text to save</summary><pre>{profile.sourceText}</pre></details><p>Next, review your facts and run your first search. AI processing and recurring preparation each need your explicit confirmation.</p><label className="jl-consent"><input type="checkbox" checked={consent} onChange={event => { if (current()) { consentEpoch.current = event.target.checked ? epoch.current : null; setConsent(event.target.checked); } }} /><span>Save this CV text and these preferences privately in my Jobvance account.</span></label></>}
      <div className="oq-actions">{step > 0 && <button type="button" className="jl-button" onClick={() => { setStep(value => value - 1); setError(''); consentEpoch.current = null; setConsent(false); }}>Back</button>}{step < 5 ? <button className="jl-button jl-button--primary" onClick={() => { const clean = { ...profile, targetTitles: cleanPreferences([...profile.targetTitles, ...(step === 0 && roleQuery.trim() ? [roleQuery.trim()] : [])]), locations: cleanPreferences([...profile.locations, ...(step === 1 && locationQuery.trim() ? [locationQuery.trim()] : [])]), excludedTerms: list(profile.excludedTerms.join('\n')) }; if (!current() || busy) return; setProfile(clean); if (step === 0) setRoleQuery(''); if (step === 1) setLocationQuery(''); const issue = onboardingStepError(step, clean); if (issue) setError(issue); else if (current() && !busy) { if (step === 0) rolesEdited.current = true; setError(''); setStep(value => value + 1); } }}>Next <ArrowRight size={16} /></button> : <button className="jl-button jl-button--primary" disabled={!consent || !!busy} onClick={() => void save()}>Save my setup <ArrowRight size={16} /></button>}</div>
    </fieldset><p className="oq-note">You can return to your Automated Job Loop and resume here for up to 30 minutes in this tab. Refreshing, closing the tab or signing out clears unsaved answers. Nothing is saved to your account until you confirm.</p></section>}
  </main>;
}
