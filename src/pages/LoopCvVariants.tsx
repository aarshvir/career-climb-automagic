import { useEffect, useRef, useState } from 'react';
import { callJobLoop } from '@/lib/job-loop-api';
import { clearCvVariantRecovery, recoverCvVariantRecovery, retainCvVariantRecovery, type VariantRecoveryScope, type VariantWorkingDraft } from '@/lib/loop-cv-variant-recovery';
import { captureCvVariantSaveIntent, resolveCvVariantClaims, validateCvVariantSaveReceipt, validateCvVariantsRead, type CvVariantSaveIntent } from '../../supabase/functions/_shared/job-loop-cv-variants';
import type { LoopClaim, LoopCvVariant, LoopCvVariantSaveReceipt, LoopCvVariants, LoopProfileInput, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

type Props = { snapshot: LoopSnapshot; owner: string; authority: number; ready: boolean; busy: boolean; hidden: boolean; captureGuard: () => () => boolean };
const profileInput = (profile: NonNullable<LoopSnapshot['profile']>): LoopProfileInput => {
  const { revision: _revision, updatedAt: _updatedAt, ...input } = profile;
  return structuredClone(input);
};
const sameRef = (a: { id: string; revision: number }, b: { id: string; revision: number }) => a.id === b.id && a.revision === b.revision;
const draftIdentity = (d: VariantWorkingDraft) => JSON.stringify([d.expectedVersion, d.variantId, d.expectedVariantRevision, d.label, d.profile, d.claimRefs]);

export default function LoopCvVariants(props: Props) {
  if (!props.ready || props.authority < 0) return null;
  return <VariantManager key={JSON.stringify([props.owner, props.authority, props.snapshot.lifecycleGeneration])} {...props} />;
}
function VariantManager(props: Props) {
  const { snapshot, owner, authority, ready, busy, hidden } = props;
  const scope: VariantRecoveryScope = { ownerId: owner, authority, generation: snapshot.lifecycleGeneration! };
  const recovered = useRef<ReturnType<typeof recoverCvVariantRecovery> | undefined>(undefined);
  if (recovered.current === undefined && ready) recovered.current = recoverCvVariantRecovery(scope);
  const [draft, setDraft] = useState<VariantWorkingDraft | null>(recovered.current?.draft ?? null);
  const [pending, setPending] = useState<CvVariantSaveIntent | null>(recovered.current?.pending ?? null);
  const [list, setList] = useState<LoopCvVariants | null>(null), [receipt, setReceipt] = useState<LoopCvVariantSaveReceipt | null>(null);
  const [working, setWorking] = useState(false), [message, setMessage] = useState(''), [loadError, setLoadError] = useState('');
  const [consent, setConsent] = useState(false), [retryConsent, setRetryConsent] = useState(false), [remember, setRemember] = useState(false);
  const [stopRetry, setStopRetry] = useState(false), [inspectedPending, setInspectedPending] = useState<string | null>(null);
  const [refreshRecovery, setRefreshRecovery] = useState(false);
  const [retained, setRetained] = useState(!!recovered.current);
  const draftRef = useRef(draft), pendingRef = useRef(pending), epoch = useRef(0), consentAt = useRef<number | null>(null), retryAt = useRef<number | null>(null);
  // Keep the successful request recoverable until the user deliberately attaches
  // newer edits to that saved variant. A route change must not turn them into a
  // second creation merely because the on-page receipt disappeared.
  const confirmedRequest = useRef<CvVariantSaveIntent | null>(null);
  const stopRetryAt = useRef<number | null>(null);
  const mounted = useRef(true), inFlight = useRef(false), propsRef = useRef(props); propsRef.current = props;
  const authorityKey = JSON.stringify([owner, authority, snapshot.lifecycleGeneration, ready]);
  const liveKey = useRef(authorityKey); liveKey.current = authorityKey;
  const context = JSON.stringify([snapshot.profile, snapshot.claims, ready, hidden]);
  const priorContext = useRef(context);
  if (priorContext.current !== context) {
    priorContext.current = context; epoch.current++; consentAt.current = null; retryAt.current = null; stopRetryAt.current = null;
    if (consent) setConsent(false); if (retryConsent) setRetryConsent(false);
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (recovered.current) retain(draftRef.current, pendingRef.current, false); }, []);
  function currentGuard() {
    const parent = propsRef.current.captureGuard(), key = liveKey.current;
    return () => mounted.current && liveKey.current === key && propsRef.current.ready && parent();
  }
  function retain(nextDraft = draftRef.current, nextPending = pendingRef.current, keep = remember) {
    if (!nextDraft) { clearCvVariantRecovery(scope); setRefreshRecovery(false); return; }
    const result = retainCvVariantRecovery(scope, { draft: nextDraft, pending: nextPending ?? confirmedRequest.current }, { rememberOnDevice: keep });
    setRefreshRecovery(result.refreshRecovery); setRetained(result.retained);
  }
  function change(next: VariantWorkingDraft) {
    epoch.current++; consentAt.current = null; retryAt.current = null; stopRetryAt.current = null; setConsent(false); setRetryConsent(false); setStopRetry(false); setMessage('');
    draftRef.current = next; setDraft(next); retain(next);
  }
  function choose(variant?: LoopCvVariant) {
    if (!list || !ready || busy || inFlight.current || pendingRef.current) return;
    const input = variant?.profile ?? (snapshot.profile ? profileInput(snapshot.profile) : null);
    if (!input) return;
    confirmedRequest.current = null;
    change({ expectedVersion: list.recordVersion, variantId: variant?.id ?? null, expectedVariantRevision: variant?.revision ?? 0, label: variant?.label ?? '', profile: structuredClone(input), claimRefs: [] });
    setReceipt(null);
  }
  function eligibility(claim: LoopClaim) {
    if (!draft) return false;
    try { resolveCvVariantClaims({ ...draft, expectedGeneration: scope.generation, requestId: '00000000-0000-4000-8000-000000000000', saveConsent: true, claimRefs: [{ id: claim.id, revision: claim.revision }] }, snapshot.profile, snapshot.claims); return true; }
    catch { return false; }
  }
  const eligible = snapshot.claims.filter(eligibility);
  const unavailable = draft?.claimRefs.filter(ref => !eligible.some(claim => sameRef(ref, claim))) ?? [];
  const needsRevisionReview = !!draft && (!!receipt || !!list && draft.expectedVersion !== list.recordVersion);
  const allowed = ready && authority >= 0 && Number.isSafeInteger(scope.generation) && scope.generation >= 0 && !hidden && !busy;
  async function load() {
    if (!allowed || inFlight.current) return;
    const current = currentGuard(); inFlight.current = true; setWorking(true); setLoadError('');
    try {
      const response = await callJobLoop(owner, { action: 'read_cv_variants', expectedGeneration: scope.generation });
      if (!current()) return;
      const value = validateCvVariantsRead(response.cvVariants, scope.generation);
      setList(value);
      setInspectedPending(pendingRef.current?.requestId ?? null); setStopRetry(false);
    } catch (error) { if (current()) setLoadError(error instanceof Error ? error.message : 'Your saved CV variants could not be loaded.'); }
    finally { inFlight.current = false; if (mounted.current) setWorking(false); }
  }
  async function save(retry = false) {
    if (!allowed || inFlight.current || !draftRef.current) return;
    if (retry ? !pendingRef.current || !retryConsent || retryAt.current !== epoch.current : pendingRef.current || needsRevisionReview || !consent || consentAt.current !== epoch.current || unavailable.length > 0) return;
    const current = currentGuard(), submittedEpoch = epoch.current;
    let intent: CvVariantSaveIntent;
    try { intent = structuredClone(captureCvVariantSaveIntent(retry ? pendingRef.current : { ...draftRef.current, expectedGeneration: scope.generation, requestId: crypto.randomUUID(), saveConsent: true })) as CvVariantSaveIntent; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Review your CV variant before saving.'); return; }
    const submittedDraftMatches = draftIdentity(draftRef.current) === draftIdentity(intent);
    pendingRef.current = intent; setPending(intent); setInspectedPending(null); setStopRetry(false); retain(draftRef.current, intent);
    inFlight.current = true; setWorking(true); setMessage(''); consentAt.current = null; retryAt.current = null; setConsent(false); setRetryConsent(false);
    try {
      const response = await callJobLoop(owner, { action: 'save_cv_variant', ...intent });
      if (!current()) return;
      const confirmed = validateCvVariantSaveReceipt(response.variantSave, intent);
      setReceipt(confirmed);
      setList(previous => previous ? ({ generation: scope.generation, recordVersion: Math.max(previous.recordVersion, confirmed.recordVersion), variants: [...previous.variants.filter(v => v.id !== confirmed.variant.id), confirmed.variant] }) : null);
      if (pendingRef.current?.requestId === intent.requestId) { pendingRef.current = null; setPending(null); }
      if (epoch.current === submittedEpoch && submittedDraftMatches) {
        confirmedRequest.current = null;
        draftRef.current = null; setDraft(null); clearCvVariantRecovery(scope, intent.requestId); setRefreshRecovery(false);
      } else { confirmedRequest.current = intent; retain(draftRef.current, pendingRef.current); }
      setMessage(epoch.current === submittedEpoch && submittedDraftMatches ? 'Your CV variant is saved privately. Refresh your workspace before making other saved changes.' : 'The earlier CV variant was saved. Your newer edits are still here; review them before making another save.');
    } catch (error) {
      if (current()) setMessage(`${error instanceof Error ? error.message : 'The save result could not be confirmed.'} Your original request is retained. Inspect it below before retrying.`);
    } finally { inFlight.current = false; if (mounted.current) setWorking(false); }
  }
  function editProfile(patch: Partial<LoopProfileInput>) {
    if (!draftRef.current) return;
    const next = { ...draftRef.current, profile: { ...draftRef.current.profile, ...patch } };
    if (patch.sourceText !== undefined) next.claimRefs = next.claimRefs.filter(ref => snapshot.claims.find(c => sameRef(c, ref))?.sourceKind !== 'cv_passage');
    change(next);
  }
  const renderedEpoch = epoch.current;
  function canContinue() { return allowed && !inFlight.current && !pendingRef.current && !!draftRef.current && epoch.current === renderedEpoch && currentGuard()(); }
  return <section className="jl-panel" hidden={hidden || !ready || authority < 0} aria-label="Private CV variants">
    <h2>Your CV variants</h2><p>Keep up to three named CV sources for different kinds of work. These private drafts stay separate from your main career record. Choosing a variant for a job run is not available yet.</p>
    <button type="button" className="jl-button" disabled={!allowed || working} onClick={() => void load()}>{list ? 'Refresh saved CV variants' : 'Load saved CV variants'}</button>
    {working && <p role="status">Checking your CV variants…</p>}{loadError && <p role="alert">{loadError} Your saved list has not been replaced.</p>}
    {list && <><p>{list.variants.length} of 3 CV variants saved.</p>{list.variants.map(variant => <article className="jl-signal" key={variant.id}><h3>{variant.label}</h3><p>Revision {variant.revision} · Updated {new Date(variant.updatedAt).toLocaleString()}</p><details><summary>Inspect saved source · {variant.label}</summary><pre>{variant.profile.sourceText}</pre><p>{variant.profile.name} · {variant.profile.targetTitles.join(', ')}</p><p>Facts saved with this revision. Their current availability is checked again when editing.</p>{variant.claims.map(c => <blockquote key={c.id}>{c.phrasing}</blockquote>)}{variant.claims.length === 0 && <p>No confirmed facts selected for this draft.</p>}</details><button type="button" className="jl-button" disabled={!allowed || working || !!pending || !!draft} onClick={() => choose(variant)}>Edit {variant.label}</button></article>)}<button type="button" className="jl-button" disabled={!allowed || working || list.variants.length >= 3 || !snapshot.profile || !!draft || !!pending} onClick={() => choose()}>Create a CV variant</button>{!snapshot.profile && <p>Save your main CV or use the guided builder first.</p>}{list.variants.length >= 3 && <p>All three places are used. You can still edit a saved variant.</p>}</>}
    {receipt && <section className="jl-signal" aria-label="Confirmed CV save"><p role="status">Request saved revision {receipt.savedRevision}. Current saved revision: {receipt.variant.revision}.{receipt.variant.revision > receipt.savedRevision ? ' This retry found a newer version; it did not replace that version with the original draft.' : ''}</p><details><summary>Inspect confirmed current CV · {receipt.variant.label}</summary><p>Saved revision {receipt.variant.revision} · {receipt.variant.profile.name}</p><pre>{receipt.variant.profile.sourceText}</pre><p>Facts saved with this revision:</p>{receipt.variant.claims.map(claim => <blockquote key={claim.id}>{claim.phrasing}</blockquote>)}{receipt.variant.claims.length === 0 && <p>No confirmed facts selected for this draft.</p>}</details></section>}
    {draft && <form className="jl-profile-form" aria-label="CV variant draft" onSubmit={event => { event.preventDefault(); void save(); }}>
      {recovered.current && <p className="jl-help">Recovered your draft in this account. Review its source and choose private-save permission again.</p>}
      <p>{draft.variantId ? `Editing saved revision ${draft.expectedVariantRevision}` : 'New CV variant'} · No job preparation or document approval is started by saving.</p>
      {!pending && receipt && <div className="jl-signal"><p>An earlier save is confirmed. To apply these newer edits to that saved CV, review its current source above and choose to continue.</p><button type="button" className="jl-button" disabled={!allowed || working} onClick={() => { if (!canContinue()) return; const current = list?.variants.find(v => v.id === receipt.variant.id) ?? receipt.variant; confirmedRequest.current = null; change({ ...draftRef.current!, variantId: current.id, expectedVariantRevision: current.revision, expectedVersion: Math.max(list?.recordVersion ?? 0, receipt.recordVersion) }); setReceipt(null); }}>Continue edits to {receipt.variant.label}</button></div>}
      {!pending && !receipt && list && draft.expectedVersion !== list.recordVersion && <div className="jl-signal"><p>Your saved workspace changed after this draft began. Inspect the current saved CV above before applying your draft to it. Existing draft wording stays in the form.</p><button type="button" className="jl-button" disabled={!allowed || working || !!draft.variantId && !list.variants.some(v => v.id === draft.variantId)} onClick={() => { if (!canContinue() || draft.variantId && !list.variants.some(v => v.id === draft.variantId)) return; change({ ...draftRef.current!, expectedVersion: list.recordVersion, expectedVariantRevision: draft.variantId ? list.variants.find(v => v.id === draft.variantId)!.revision : 0 }); }}>Use current saved revision for these edits</button></div>}
      <label className="jl-field">CV variant name<input value={draft.label} maxLength={80} onChange={e => change({ ...draftRef.current!, label: e.target.value })} /></label>
      <label className="jl-field">CV variant source text<textarea value={draft.profile.sourceText} maxLength={60000} onChange={e => editProfile({ sourceText: e.target.value })} /></label>
      <details><summary>Review the profile included with this CV</summary><label className="jl-field">Name in this CV<input value={draft.profile.name} maxLength={120} onChange={e => editProfile({ name: e.target.value })} /></label><label className="jl-field">Contact line in this CV<input value={draft.profile.contactLine} maxLength={500} onChange={e => editProfile({ contactLine: e.target.value })} /></label><p>Target roles: {draft.profile.targetTitles.join(', ') || 'None supplied'} · Locations: {draft.profile.locations.join(', ') || 'None supplied'}</p><p>Page preference: {draft.profile.pageTarget}. Other preferences are copied from the reviewed source profile.</p></details>
      <fieldset className="jl-form-fields"><legend>Choose confirmed facts to keep with this source</legend><p>Only currently confirmed, shareable facts valid for this exact source can be selected.</p>{eligible.map(claim => <label className="jl-consent" key={`${claim.id}:${claim.revision}`}><input type="checkbox" checked={draft.claimRefs.some(ref => sameRef(ref, claim))} onChange={e => change({ ...draftRef.current!, claimRefs: e.target.checked ? [...draftRef.current!.claimRefs, { id: claim.id, revision: claim.revision }] : draftRef.current!.claimRefs.filter(ref => !sameRef(ref, claim)) })} /><span>{claim.phrasing}</span></label>)}{unavailable.length > 0 && <p role="alert">Some selected facts changed or are no longer valid for this source. <button type="button" className="jl-text-link" onClick={() => change({ ...draftRef.current!, claimRefs: draftRef.current!.claimRefs.filter(ref => eligible.some(c => sameRef(c, ref))) })}>Remove unavailable facts</button></p>}{draft.claimRefs.length === 0 && <p>This will save a CV draft without confirmed facts. It is not ready for source-based preparation.</p>}</fieldset>
      <label className="jl-consent"><input type="checkbox" checked={remember} onChange={e => { setRemember(e.target.checked); retain(draftRef.current, pendingRef.current, e.target.checked); }} /><span>Keep this CV draft on this device for 30 minutes so I can recover it after refresh.</span></label>
      <p className="jl-help">{refreshRecovery ? 'Refresh recovery is enabled for this tab and signed-in session for 30 minutes. Private-save permission is never restored.' : retained ? 'Draft recovery is currently page memory only. Refreshing may lose these edits.' : 'This draft could not be retained for recovery. Keep this page open and copy your text before leaving.'}</p>
      <label className="jl-consent"><input type="checkbox" checked={consent && consentAt.current === epoch.current} disabled={!!pending || !allowed} onChange={e => { consentAt.current = e.target.checked ? epoch.current : null; setConsent(e.target.checked); }} /><span>Save this exact CV source and selected facts privately in my account.</span></label>
      <div className="jl-actions"><button type="submit" className="jl-button jl-button--primary" disabled={!allowed || working || !!pending || needsRevisionReview || !consent || consentAt.current !== epoch.current || unavailable.length > 0}>Save CV variant</button><button type="button" className="jl-button" disabled={working || !!pending} onClick={() => { epoch.current++; confirmedRequest.current = null; draftRef.current = null; setDraft(null); clearCvVariantRecovery(scope); setConsent(false); setRefreshRecovery(false); }}>Discard variant edits</button></div>
    </form>}
    {pending && <section className="jl-signal" aria-label="Unconfirmed CV save"><h3>Confirm the original save</h3><p>A save was sent, but its result still needs confirmation. Retry uses the original source, selected facts and request identity, including when you have newer edits above.</p><details><summary>Inspect original save · {pending.label}</summary><pre>{pending.profile.sourceText}</pre><p>{pending.claimRefs.length} selected facts · Starting revision {pending.expectedVariantRevision}</p></details><label className="jl-consent"><input type="checkbox" checked={retryConsent && retryAt.current === epoch.current} disabled={!allowed || working} onChange={e => { retryAt.current = e.target.checked ? epoch.current : null; setRetryConsent(e.target.checked); }} /><span>Retry this original private-save request. Keep any newer saved version and my newer draft edits.</span></label><button type="button" className="jl-button" disabled={!allowed || working || !retryConsent || retryAt.current !== epoch.current} onClick={() => void save(true)}>Retry original CV save</button><details><summary>Review a different save instead</summary><p>Refresh saved CV variants first and inspect whether the original save is already present. Stopping retries does not undo a saved CV. Your draft edits remain available.</p><label className="jl-consent"><input type="checkbox" checked={stopRetry && stopRetryAt.current === epoch.current} disabled={working || inspectedPending !== pending.requestId} onChange={e => { stopRetryAt.current = e.target.checked ? epoch.current : null; setStopRetry(e.target.checked); }} /><span>I inspected the refreshed saved list. Stop retrying this original request so I can review a different save.</span></label><button type="button" className="jl-button" disabled={!allowed || working || !stopRetry || stopRetryAt.current !== epoch.current || inspectedPending !== pending.requestId} onClick={() => { if (!allowed || inFlight.current || !stopRetry || stopRetryAt.current !== epoch.current || inspectedPending !== pendingRef.current?.requestId) return; confirmedRequest.current = null; pendingRef.current = null; setPending(null); change(draftRef.current!); retain(draftRef.current, null); }}>Keep edits and stop retrying</button></details></section>}
    {message && <p role="status">{message}</p>}
  </section>;
}
