import ProductNavigation from '@/components/ProductNavigation';
import LoopSubscriptionBilling from '@/components/LoopSubscriptionBilling';
import { recoverOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { explainDiscoveryMatch } from '@/lib/employer-discovery';
import LoopVariantPreparation from './LoopVariantPreparation';
import { readApplicationSource } from '@/lib/application-source-selection';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, CalendarClock, Check, ClipboardList, Download, FileText, Loader2, LockKeyhole, Mail, Play, RefreshCw, ShieldCheck, Square, UserRound, Settings2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { callJobLoop, getLoopDownload, isLoopHttpsUrl, loadLoopSavedCvs, safeLoopGmailUrl } from '@/lib/job-loop-api';
import { boundLoopAction } from '../../supabase/functions/_shared/job-loop-request';
import { loopErasureNeedsContinuation } from '@/lib/loop-service-error';
import { extractCvText, validateCvText } from '@/lib/cv-extraction';
import { downloadBlob } from '@/lib/document-download';
import type { CvDocument } from '@/lib/cv-database';
import { blankLoopProfile, loopAudienceContent, validLoopAudience } from '@/lib/job-loop-audiences';
import { copyLoopSourceDetails } from '@/lib/loop-source-intake';
import { LoopActivity, LoopDiscoverySources, LoopSchedule, LoopWorkspaceOverview } from './JobLoopPanels';
import LoopSelectedPreparation from './LoopSelectedPreparation';
import LoopCvBuilder from './LoopCvBuilder';
import LoopCvVariants from './LoopCvVariants';
import { blankLoopCvAnswers, type LoopCvAnswers } from '@/lib/loop-cv-builder';
import { LoopErasure, LoopSupportForm } from './LoopSupport';
import LoopPacketPreview from './LoopPacketPreview';
import LoopSavedCheckImport, { usableSavedCheck, type SavedCheckScope, type SavedCheckVersion } from './LoopSavedCheckImport';
import { readSavedCheckContinuation, savedCheckContinuationPath } from '@/lib/saved-check-continuation';
import type { FreeCvCheck } from '@/lib/free-check-api';
import { loopDateLabel, loopFollowUpDue } from '@/lib/loop-calendar';
import { clearLoopWorkingDraft, recoverLoopWorkingDraft, retainLoopWorkingDraft, savedCheckVacancyFingerprint, type PendingSavedCheckLink, type LoopClaimDraft } from '@/lib/loop-draft-memory';
import type { LoopAction, LoopApplicationStatus, LoopClaim, LoopClaimInput, LoopContact, LoopOpportunity, LoopPacket, LoopProfileInput, LoopProviderId, LoopResponse, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
import './JobLoop.css';
import { pruneTrackingApplications, registerTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority, trackingDraftIdentity, trackingDraftScope, useTrackingDraft, type TrackingDraftScope } from '@/lib/tracking-draft-memory';

type Tab = 'today' | 'record' | 'opportunities' | 'outputs' | 'settings';
const tabs: { id: Tab; label: string; icon: typeof UserRound }[] = [{ id: 'today', label: 'Today', icon: CalendarClock }, { id: 'record', label: 'My CV & experience', icon: UserRound }, { id: 'opportunities', label: 'Opportunities', icon: ClipboardList }, { id: 'outputs', label: 'Prepared CVs', icon: FileText }, { id: 'settings', label: 'Help & privacy', icon: Settings2 }];
const blankProfile = blankLoopProfile;
const blankClaim = (): LoopClaimInput => ({ sourceKind: 'user_answer', sourceQuote: '', phrasing: '', context: '', kind: 'academic_project', resultStatus: 'not_measured', confirmed: false, shareable: false });
const providerNames: Record<LoopProviderId, string> = { anthropic: 'Claude', openai: 'GPT', moonshot: 'Kimi' };
const kindOptions = ['employment', 'internship', 'academic_project', 'personal_project', 'volunteering', 'education', 'skill'] as const;
const statuses: LoopApplicationStatus[] = ['saved', 'prepared', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];
const display = (value: string) => value.replace(/_/g, ' ');
const split = (value: string) => value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
const listInputs = (profile: LoopProfileInput) => ({ targets: profile.targetTitles.join('\n'), locations: profile.locations.join('\n'), languages: profile.languages.join(', '), excluded: profile.excludedTerms.join('\n') });
type SavedCheckBackup = { pendingCheckLink: PendingSavedCheckLink | null; profile: LoopProfileInput; profileDirty: boolean; lists: ReturnType<typeof listInputs>; detailsReady: boolean; copiedHeader: { name: string; contactLine: string }; suggestions: { key: string; value: LoopClaimInput }[]; opportunity: { title: string; company: string; location: string; jobUrl: string; description: string; withContact: boolean; contact: LoopContact } };
const date = loopDateLabel;
const activeRun = (snapshot: LoopSnapshot) => snapshot.runs.some(run => run.status === 'queued' || run.status === 'running');
const packetSourcesCurrent = (packet: LoopPacket, snapshot: LoopSnapshot) => packet.status !== 'revoked' && !!snapshot.profile && packet.profileRevision === snapshot.profile.revision && Object.keys(packet.claimVersions).length > 0 && Object.entries(packet.claimVersions).every(([id, revision]) => snapshot.claims.some(claim => claim.id === id && claim.revision === revision && claim.status === 'active' && claim.confirmed && claim.shareable));
const packetPagesReady = (packet: LoopPacket, snapshot: LoopSnapshot) => !!snapshot.profile && packet.holdReasons.length === 0 && (packet.formatStatus ? Object.values(packet.formatStatus).some(format => format.ready) : packet.pageCount !== null && packet.pageCount > 0 && packet.pageCount <= snapshot.profile.pageTarget);
/** A pure initializer: repeated React renders may read, but never consume, the fragment. */
function returnedGmailTicket(): string {
  if (typeof window === 'undefined' || window.location.hash.length > 16500) return '';
  const value = new URLSearchParams(window.location.hash.slice(1)).get('gmail_ticket');
  return value && value.length <= 16000 ? value : '';
}
function clearGmailFragment(): void {
  if (new URLSearchParams(window.location.hash.slice(1)).has('gmail_ticket')) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
}
function explanation(value: string): string {
  const reasons: Record<string, string> = {
    PAGE_TARGET_EXCEEDED: 'The rendered CV exceeds your selected page preference. Review your record and shorten the cleared wording, then rebuild.',
    PDF_FONT_UNSUPPORTED: 'The PDF font cannot display every character in this document. Review the affected source text; this packet needs a supported render before approval.',
    PDF_RENDER_FAILED: 'The PDF could not be created. This packet is held until a new render succeeds.',
    DOCX_RENDER_FAILED: 'The Word document could not be created. This packet is held until a new render succeeds.',
    APPROVED_WORK_CONTEXT_UNAVAILABLE: 'A cleared source context is missing. Confirm the course, project or employer context in your record, then rebuild.',
    NO_SHAREABLE_CLAIMS: 'No confirmed, externally shareable claims are available for this packet.',
    SOURCE_CLAIMS_UNAVAILABLE: 'The source claims are unavailable or no longer cleared. Review your career record.',
    CONTACT_UNVERIFIED: 'The contact has not been confirmed. Check the source before preparing outreach.',
    CONTACT_NOT_FOUND: 'No named contact is available. Add one only after checking a real source.',
    COMPENSATION_UNKNOWN: 'Compensation is not stated or established.',
    ELIGIBILITY_UNKNOWN: 'Eligibility needs your manual review; it has not been established.',
  };
  return reasons[value] ?? (/^[A-Z0-9_]+$/.test(value) ? display(value.toLowerCase()).replace(/^./, letter => letter.toUpperCase()) + '. Review this condition before proceeding.' : value);
}

function Field({ label, value, onChange, multiline = false, type = 'text', maxLength = 500, help, disabled = false, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: string; maxLength?: number; help?: string; disabled?: boolean; readOnly?: boolean }) {
  const id = useId();
  return <div className="jl-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} disabled={disabled} readOnly={readOnly} aria-describedby={help ? `${id}-help` : undefined} /> : <input id={id} type={type} step={type === 'number' ? 'any' : undefined} value={value} onChange={event => onChange(event.target.value)} maxLength={maxLength} disabled={disabled} readOnly={readOnly} aria-describedby={help ? `${id}-help` : undefined} />}{help && <p id={`${id}-help`}>{help}</p>}</div>;
}
function Select({ label, value, onChange, children, disabled = false }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean }) {
  const id = useId(); return <div className="jl-field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>{children}</select></div>;
}
function Consent({ children, checked, onChange, disabled = false }: { children: ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="jl-consent"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} /><span>{children}</span></label>;
}
function ClaimEditor({ initial, saved, onSave, onWithdraw, onDirty, busy, restoredDraft, onDraft, guided = false, onSkip }: { initial: LoopClaimInput; saved?: LoopClaim; onSave: (value: LoopClaimInput) => Promise<boolean>; onWithdraw?: () => void; onDirty: (dirty: boolean) => void; busy: boolean; restoredDraft?: LoopClaimDraft; onDraft?: (draft: LoopClaimDraft | null) => void; guided?: boolean; onSkip?: () => void }) {
  const [value, setValue] = useState(restoredDraft?.value ?? initial);
  const [chosenKind, setChosenKind] = useState<LoopClaimInput['kind'] | ''>(restoredDraft?.chosenKind ?? (saved ? initial.kind : ''));
  const dirty = useRef(!!restoredDraft), draftCallback = useRef(onDraft);
  draftCallback.current = onDraft;
  useEffect(() => { if (dirty.current) draftCallback.current?.({ value, chosenKind }); }, [value, chosenKind]);
  function mark(dirtyValue: boolean) { dirty.current = dirtyValue; onDirty(dirtyValue); if (!dirtyValue) draftCallback.current?.(null); }
  function edit(patch: Partial<LoopClaimInput>) { mark(true); setValue(current => ({ ...current, ...patch, confirmed: false, shareable: false })); }
  async function submit(event: FormEvent) { event.preventDefault(); if (await onSave(value)) mark(false); }
  return <form className="jl-claim-editor" onSubmit={event => void submit(event)}><div className="jl-claim-heading"><span className="jl-tag">{saved ? `${display(saved.kind)} · revision ${saved.revision}` : 'Not yet saved or confirmed'}</span>{saved && <span className={`jl-tag jl-tag--${saved.status}`}>{display(saved.status)}</span>}</div>
    {guided && <div className="jl-fact-preview"><p className="jl-eyebrow">COPIED FROM YOUR SAVED CV</p><blockquote>{value.phrasing}</blockquote><p><strong>Nearby source context:</strong> {value.context || 'Choose the literal course, project or employer label below.'}</p><p>Keep the complete passage, including team credit, dates and estimates. Choose its category yourself.</p></div>}
    <Select label="Evidence context" value={chosenKind} onChange={kind => { setChosenKind(kind as LoopClaimInput['kind']); edit({ kind: kind as LoopClaimInput['kind'] }); }} disabled={busy}><option value="" disabled>Choose the evidence context</option>{kindOptions.map(kind => <option key={kind} value={kind}>{display(kind)}</option>)}</Select>
    <details className="jl-fact-source" open={!guided}><summary>{guided ? 'Inspect or correct the source and context' : 'Source and factual wording'}</summary><div className="jl-profile-form"><Select label="Source of this statement" value={value.sourceKind} onChange={kind => edit({ sourceKind: kind as LoopClaimInput['sourceKind'] })} disabled={busy}><option value="cv_passage">Literal CV passage</option><option value="user_answer">My own answer</option></Select>
    <Field label="Source passage or my answer" multiline value={value.sourceQuote} onChange={sourceQuote => edit({ sourceQuote })} maxLength={3000} disabled={busy} help="For a CV source, preserve the complete source line or passage and its factual wording. Your own answer must be a complete statement with contribution and context; isolated keywords or figures are not evidence." />
    <Field label="Source context label" value={value.context} maxLength={200} onChange={context => edit({ context })} help="Use the nearby literal course, project or employer heading for a CV passage. For your own answer, include this context in the complete statement. Describe your contribution in the factual wording below." disabled={busy} />
    <Field label="Wording I can substantiate" multiline value={value.phrasing} onChange={phrasing => edit({ phrasing })} maxLength={1500} disabled={busy} />
    </div></details>
    <Select label="Result status" value={value.resultStatus} onChange={resultStatus => edit({ resultStatus: resultStatus as LoopClaimInput['resultStatus'] })} disabled={busy}><option value="not_measured">No measured result stated</option><option value="projected">Projected or estimated</option><option value="measured">Measured result</option></Select>
    <Consent checked={value.confirmed} onChange={confirmed => { mark(true); setValue(current => ({ ...current, confirmed })); }} disabled={busy}>I confirm this wording describes my own accurate contribution. This is my statement, not independent verification.</Consent>
    <Consent checked={value.shareable} onChange={shareable => { mark(true); setValue(current => ({ ...current, shareable })); }} disabled={busy}>This wording and every included figure are permitted for external use.</Consent>
    <div className="jl-actions"><button className="jl-button jl-button--primary" type="submit" disabled={busy || !chosenKind || !value.context.trim() || !value.phrasing.trim() || !value.sourceQuote.trim()}>Save claim</button>{onSkip ? <button className="jl-button" type="button" disabled={busy} onClick={onSkip}>Skip this passage</button> : <button className="jl-button" type="button" disabled={busy} onClick={() => { setValue(initial); setChosenKind(saved ? initial.kind : ''); mark(false); }}>Discard edits</button>}{onWithdraw && saved?.status === 'active' && <button className="jl-button jl-button--quiet" type="button" disabled={busy} onClick={onWithdraw}>Withdraw claim</button>}</div><p className="jl-help">{guided && 'Saving without both confirmations keeps this fact out of outputs. '}Only active claims that you confirm and permit for sharing can enter fresh outputs. Saving corrections or withdrawing a claim invalidates affected approvals. <Link to="/help#job-loop-facts">Help with fact review</Link></p>
  </form>;
}
export function OpportunityRow({ opportunity, onSave, busy, scope, profile }: { profile?: LoopProfileInput | null; opportunity: LoopOpportunity; onSave: (status: LoopApplicationStatus, followUpAt: string | null, notes: string) => Promise<boolean>; busy: boolean; scope: TrackingDraftScope }) {
  const { draft, edit, recovered, current, baseline, acknowledge } = useTrackingDraft(scope, { status: opportunity.status, followUp: opportunity.followUpAt?.slice(0, 10) ?? '', notes: opportunity.notes });
  const [attested, setAttested] = useState(false);
  useEffect(() => { setAttested(false); }, [opportunity.status]);
  const match = profile ? explainDiscoveryMatch(profile, opportunity) : null;
  const changedStatus = draft.status !== opportunity.status;
  async function save() { const submitted = { ...current.current }, submittedBaseline = { ...baseline.current }; if (busy || (submitted.status !== opportunity.status && !attested)) return; if (await onSave(submitted.status as LoopApplicationStatus, submitted.followUp || null, submitted.notes)) { acknowledge(submitted, submittedBaseline); setAttested(false); } }
  return <article className="jl-opportunity"><div className="jl-row-heading"><div><h3>{opportunity.title}</h3><p>{opportunity.company} · {opportunity.location || 'Location not supplied'}</p></div><span className="jl-tag">{display(opportunity.verification)}</span></div><p className="jl-help">Source: {display(opportunity.source)} · Checked {date(opportunity.checkedAt)}. A source listing is not proof the role is open.</p>{isLoopHttpsUrl(opportunity.url) && <a className="jl-text-link" href={opportunity.url} target="_blank" rel="noopener noreferrer">Open vacancy yourself <ArrowRight size={14} aria-hidden="true" /></a>}<section aria-label="Job match explanation">{match && <><h4>Why this may fit</h4>{match.reasons.length ? <ul>{match.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>No match to your saved preferences has been established.</p>}<details><summary>What still needs checking</summary><ul>{match.missing.map(reason => <li key={reason}>{reason}</li>)}</ul></details></>}</section><details><summary>Vacancy and contact record</summary><pre>{opportunity.description}</pre>{opportunity.contact ? <p>{opportunity.contact.name} · {opportunity.contact.title || 'Title not supplied'} · {opportunity.contact.email || 'Email not supplied'}<br />{opportunity.contact.confirmedByUser ? 'Contact confirmed by you; not independently verified.' : 'Contact still needs your confirmation.'}</p> : <p>No named contact. Research it yourself before preparing outreach.</p>}</details>
    <div className="jl-form-grid"><Select label="Application status" value={draft.status} onChange={value => { edit({ status: value }); setAttested(false); }} disabled={busy}>{statuses.map(item => <option key={item} value={item}>{display(item)}</option>)}</Select><Field label="Follow-up date" type="date" value={draft.followUp} onChange={value => edit({ followUp: value })} disabled={busy} /></div><Field label="My application notes" multiline value={draft.notes} onChange={value => edit({ notes: value })} maxLength={5000} disabled={busy} />{recovered && <p className="jl-help">Unsaved tracking edits were restored from this tab. Review them before saving.</p>}{changedStatus && <Consent checked={attested} onChange={setAttested} disabled={busy}>I report this status myself. Preparing or opening a vacancy is not an application submission.</Consent>}<button type="button" className="jl-button" disabled={busy || (changedStatus && !attested)} onClick={() => void save()}>Save tracking update</button>
  </article>;
}

export default function JobLoop() {
  const { user, retryConnection, loading: authLoading, authError } = useAuth();
  if (!authLoading && !authError) registerTrackingDraftOwner(user?.id ?? null);
  const trackingAuthority = user ? trackingDraftAuthority(user.id) : -1;
  const route = useLocation();
  const navigate = useNavigate();
  const selectedOpportunitySource = readApplicationSource(route.search, 'opportunity');
  const hasOpportunitySource = new URLSearchParams(route.search).has('opportunity');
  const initialAudience = useRef(validLoopAudience(new URLSearchParams(route.search).get('audience')) ?? 'student');
  const [preparationChoice, setPreparationChoice] = useState<{ id: string; sequence: number; owner: string; authority: number; generation: number | undefined }>();
  const [tab, setTab] = useState<Tab>('today'), [snapshotState, setSnapshot] = useState<LoopSnapshot | null>(null), [loadedOwner, setLoadedOwner] = useState<string | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [erasureOwner, setErasureOwner] = useState<string | null>(null);
  const [profile, setProfile] = useState<LoopProfileInput>(() => blankProfile(initialAudience.current)), [profileDirty, setProfileDirty] = useState(false), [saveConsent, setSaveConsent] = useState(false), [cvs, setCvs] = useState<CvDocument[]>([]), [cvError, setCvError] = useState('');
  const [lists, setLists] = useState(() => listInputs(blankProfile(initialAudience.current)));
  const [suggestions, setSuggestions] = useState<{ key: string; value: LoopClaimInput }[]>([]), [newClaimKey, setNewClaimKey] = useState(0), [dirtyClaims, setDirtyClaims] = useState<Set<string>>(new Set());
  const [claimDrafts, setClaimDrafts] = useState<Record<string, LoopClaimDraft>>({});
  const [detailsReady, setDetailsReady] = useState(false);
  const [builderAnswers, setBuilderAnswers] = useState<LoopCvAnswers>(blankLoopCvAnswers);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const copiedHeaderRef = useRef({ name: '', contactLine: '' });
  const [title, setTitle] = useState(''), [company, setCompany] = useState(''), [location, setLocation] = useState(''), [jobUrl, setJobUrl] = useState(''), [description, setDescription] = useState('');
  const [withContact, setWithContact] = useState(false), [contact, setContact] = useState<LoopContact>({ name: '', title: '', email: '', sourceUrl: '', sourceQuote: '', confirmedByUser: false, inExistingThread: false });
  const [method, setMethod] = useState('rules'), [model, setModel] = useState('grounded-rules-v1'), [modelConsent, setModelConsent] = useState(false), [inboxConsent, setInboxConsent] = useState(false), [gmailReadConsent, setGmailReadConsent] = useState(false), [gmailDraftConsent, setGmailDraftConsent] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [reviewedText, setReviewedText] = useState(''), [facts, setFacts] = useState(false), [disclosure, setDisclosure] = useState(false), [recipientConsent, setRecipientConsent] = useState(false);
  const [gmailTicket, setGmailTicket] = useState(returnedGmailTicket), [gmailPreview, setGmailPreview] = useState<NonNullable<LoopResponse['gmailPreview']> | null>(null), [previewOwner, setPreviewOwner] = useState<string | null>(null), [mailboxConfirmed, setMailboxConfirmed] = useState(false), [previewBusy, setPreviewBusy] = useState(false), [ticketExpired, setTicketExpired] = useState(false);
  const [savedCheckIntent, setSavedCheckIntent] = useState<{ id: string; scope: SavedCheckScope } | null>(null);
  const [pendingCheckLink, setPendingCheckLink] = useState<PendingSavedCheckLink | null>(null), [linkConsent, setLinkConsent] = useState(false);
  const opportunityDraftRevision = useRef(0);
  const linkConsentRevision = useRef<number | null>(null);
  const [savedCheckUndo, setSavedCheckUndo] = useState<{ scope: SavedCheckScope; recordVersion: number; before: SavedCheckBackup } | null>(null), [restoreImportConfirmed, setRestoreImportConfirmed] = useState(false);
  const importAuthReady = useRef(!authLoading && !authError); importAuthReady.current = !authLoading && !authError;
  const ticketOwner = useRef(user?.id ?? null);
  const snapshot = loadedOwner === user?.id ? snapshotState : null;
  const erasurePending = !!user && erasureOwner === user.id;
  const lifecycleGeneration = useRef<number | undefined>(undefined), erasureGeneration = useRef<number | undefined>(undefined), confirmationGeneration = useRef<number | undefined>(undefined);
  const owner = useRef(user?.id ?? null), mounted = useRef(true), generation = useRef(0), serial = useRef(0), busyRef = useRef(''), profileDirtyRef = useRef(false), formRevision = useRef(0), selectedRef = useRef<string | null>(null), packetHashRef = useRef<string | null>(null), snapshotRef = useRef(snapshot), startReference = useRef<{ key: string; id: string } | null>(null), draftReference = useRef<{ key: string; id: string } | null>(null);
  owner.current = user?.id ?? null; busyRef.current = busy; profileDirtyRef.current = profileDirty; selectedRef.current = selectedId; snapshotRef.current = snapshot;
  const applySnapshot = useCallback((next: LoopSnapshot, resetProfile = false) => {
    const previous = lifecycleGeneration.current;
    if (previous !== undefined && next.lifecycleGeneration !== undefined && next.lifecycleGeneration < previous) return;
    if (snapshotRef.current && snapshotRef.current.recordVersion > next.recordVersion) return;
    if (snapshotRef.current && snapshotRef.current.recordVersion !== next.recordVersion) { setSavedCheckUndo(null); setRestoreImportConfirmed(false); }
    const recovered = previous === undefined && next.lifecycleGeneration !== undefined && owner.current
      ? recoverLoopWorkingDraft(owner.current, next.lifecycleGeneration) : null;
    if (previous !== undefined && next.lifecycleGeneration !== undefined && next.lifecycleGeneration !== previous) {
      generation.current++; serial.current++; formRevision.current++; downloadTransfer.current?.abort();
      setSavedCheckIntent(null); setSavedCheckUndo(null); setRestoreImportConfirmed(false);
      setPendingCheckLink(null); setLinkConsent(false); opportunityDraftRevision.current++;
      clearLoopWorkingDraft(); startReference.current = null; draftReference.current = null;
      setProfileDirty(false); profileDirtyRef.current = false; resetProfile = true;
      setSuggestions([]); setClaimDrafts({}); setDirtyClaims(new Set()); setDetailsReady(false); setBuilderAnswers(blankLoopCvAnswers());
      setSelectedId(null); setReviewedText(''); setFacts(false); setDisclosure(false); setRecipientConsent(false);
      setModelConsent(false); setInboxConsent(false); setGmailReadConsent(false); setGmailDraftConsent(false);
      setGmailTicket(''); setGmailPreview(null); setPreviewOwner(null); setMailboxConfirmed(false); setPreviewBusy(false);
      setTitle(''); setCompany(''); setLocation(''); setJobUrl(''); setDescription(''); setWithContact(false);
      setContact({ name: '', title: '', email: '', sourceUrl: '', sourceQuote: '', confirmedByUser: false, inExistingThread: false });
      busyRef.current = ''; setBusy('');
    }
    lifecycleGeneration.current = next.lifecycleGeneration; erasureGeneration.current = undefined; confirmationGeneration.current = next.lifecycleGeneration;
    if (owner.current && next.lifecycleGeneration !== undefined) { setTrackingLoopGeneration(owner.current, next.lifecycleGeneration); pruneTrackingApplications('loop', owner.current, next.opportunities.map(item => item.id), next.lifecycleGeneration); }
    setSnapshot(next); setLoadedOwner(owner.current); setErasureOwner(null);
    if (recovered) {
      setBuilderAnswers(recovered.builderAnswers ?? blankLoopCvAnswers());
      setPendingCheckLink(recovered.pendingCheckLink ?? null); setLinkConsent(false); opportunityDraftRevision.current++;
      setDetailsReady(!!recovered.profile.sourceText);setProfile(recovered.profile);setLists(recovered.lists);setProfileDirty(recovered.profileDirty);profileDirtyRef.current=recovered.profileDirty;
      setClaimDrafts(recovered.claimDrafts);setDirtyClaims(new Set(Object.keys(recovered.claimDrafts)));setSuggestions(recovered.suggestions);setNewClaimKey(recovered.newClaimKey);
      setTitle(recovered.opportunity.title);setCompany(recovered.opportunity.company);setLocation(recovered.opportunity.location);setJobUrl(recovered.opportunity.jobUrl);setDescription(recovered.opportunity.description);setWithContact(recovered.opportunity.withContact);setContact(recovered.opportunity.contact);
      setNotice('Recovered your unsaved career record, claim or vacancy edits from this tab’s memory. Confirm sharing choices again before saving.');
    }
    else if (resetProfile || !profileDirtyRef.current) { const value = next.profile ? { ...next.profile } : blankProfile(initialAudience.current); setProfile(value); setLists(listInputs(value)); }
    if (resetProfile) { setProfileDirty(false); profileDirtyRef.current = false; setSaveConsent(false); copiedHeaderRef.current = { name: '', contactLine: '' }; }
  }, []);
  const refresh = useCallback(async (quiet = false) => {
    const id = owner.current; if (!id) { setLoading(false); return; }
    const atGeneration = generation.current, ticket = ++serial.current;
    if (!quiet) { setLoading(true); setError(''); }
    try { const result = await callJobLoop(id, { action: 'get' }); if (mounted.current && owner.current === id && generation.current === atGeneration && serial.current === ticket) { if(result.erasureGeneration!==undefined){erasureGeneration.current=result.erasureGeneration;lifecycleGeneration.current=result.erasureGeneration;if(owner.current)setTrackingLoopGeneration(owner.current,result.erasureGeneration);confirmationGeneration.current ??= result.erasureGeneration;setErasureOwner(id);setSnapshot(null);setLoadedOwner(null);snapshotRef.current=null;}else if(result.snapshot)applySnapshot(result.snapshot);setError('');setLoading(false); } }
    catch (failure) { if (mounted.current && owner.current === id && generation.current === atGeneration && serial.current === ticket) { setError(failure instanceof Error ? failure.message : 'Your Job Loop could not be loaded.'); if(loopErasureNeedsContinuation(failure)){setErasureOwner(id);setSnapshot(null);setLoadedOwner(null);snapshotRef.current=null;} } }
    finally { if (mounted.current && owner.current === id && generation.current === atGeneration && serial.current === ticket) setLoading(false); }
  }, [applySnapshot]);
  const downloadTransfer = useRef<AbortController | null>(null);
  const clearMount = useCallback(() => { mounted.current = false; generation.current++; downloadTransfer.current?.abort(); }, []);
  useEffect(() => { mounted.current = true; return clearMount; }, [clearMount]);
  useEffect(() => { clearGmailFragment(); }, []);
  useEffect(() => { if (authLoading || authError) setLinkConsent(false); }, [authLoading, authError]);
  useEffect(() => {
    const id = readSavedCheckContinuation(route.search);
    if (!id) return;
    if (erasurePending) { setSavedCheckIntent(null); navigate('/loop', { replace: true }); return; }
    if (!user || authLoading || authError || !snapshot || !Number.isSafeInteger(snapshot.lifecycleGeneration) || snapshot.lifecycleGeneration! < 0) return;
    setSavedCheckIntent({ id, scope: { ownerId: user.id, generation: snapshot.lifecycleGeneration!, authority: trackingAuthority } });
    setTab('record'); navigate('/loop', { replace: true });
  }, [route.search, user?.id, authLoading, authError, snapshot?.lifecycleGeneration, erasurePending, trackingAuthority, navigate]);
  useEffect(() => {
    downloadTransfer.current?.abort();
    setSavedCheckIntent(null); setSavedCheckUndo(null); setRestoreImportConfirmed(false);
    setPendingCheckLink(null); setLinkConsent(false); opportunityDraftRevision.current++;
    setErasureOwner(null);
    lifecycleGeneration.current = undefined; erasureGeneration.current = undefined; confirmationGeneration.current = undefined;
    generation.current++; serial.current++; formRevision.current++; setSnapshot(null); setLoadedOwner(null); snapshotRef.current = null; setProfile(blankProfile(initialAudience.current)); setLists(listInputs(blankProfile(initialAudience.current))); setProfileDirty(false); profileDirtyRef.current = false; setSaveConsent(false); setCvs([]); setCvError(''); setSuggestions([]); setDirtyClaims(new Set()); setSelectedId(null); setReviewedText(''); setFacts(false); setDisclosure(false); setRecipientConsent(false); setMethod('rules'); setModel('grounded-rules-v1'); setModelConsent(false); setInboxConsent(false); setGmailReadConsent(false); setGmailDraftConsent(false); setBusy(''); setNotice(''); setError(''); setTitle(''); setCompany(''); setLocation(''); setJobUrl(''); setDescription(''); setWithContact(false); setContact({ name: '', title: '', email: '', sourceUrl: '', sourceQuote: '', confirmedByUser: false, inExistingThread: false }); startReference.current = null; draftReference.current = null;
    if (ticketOwner.current && ticketOwner.current !== user?.id) { setGmailTicket(''); setGmailPreview(null); setPreviewOwner(null); setMailboxConfirmed(false); setPreviewBusy(false); }
    ticketOwner.current = user?.id ?? null;
    setClaimDrafts({}); setDetailsReady(false); setBuilderAnswers(blankLoopCvAnswers()); copiedHeaderRef.current = { name: '', contactLine: '' };
    if (!user?.id) clearLoopWorkingDraft();
    void refresh(); const id = user?.id; let active = true;
    if (id) void loadLoopSavedCvs(id).then(rows => { if (active && owner.current === id) setCvs(rows); }).catch(() => { if (active && owner.current === id) setCvError('Saved CVs could not be loaded. You can read a local file or paste reviewed text instead.'); });
    return () => { active = false; };
  }, [user?.id, trackingAuthority, refresh]);
  useEffect(() => {
    const handoff = route.state;
    if (!handoff || handoff.onboardingSaved !== true || !user || authLoading || authError || loading || erasurePending || !snapshot || snapshotRef.current !== snapshot) return;
    // Route state is only a navigation hint, never proof of an authenticated or completed setup.
    if (handoff.owner === user.id && handoff.authority === trackingAuthority && trackingAuthority >= 0 && Number.isSafeInteger(handoff.generation) && handoff.generation === snapshot.lifecycleGeneration && snapshot.profile) setTab('record');
    navigate(`${route.pathname}${route.search}`, { replace: true, state: null });
  }, [route.state, route.pathname, route.search, user?.id, authLoading, authError, loading, erasurePending, snapshot, trackingAuthority, navigate]);
  useEffect(() => {
    const id = user?.id; if (!gmailTicket || !id || snapshot?.lifecycleGeneration === undefined) return;
    const atGeneration = generation.current; let active = true;
    setGmailPreview(null); setPreviewOwner(null); setMailboxConfirmed(false); setPreviewBusy(true); setTicketExpired(false);
    void callJobLoop(id, boundLoopAction({ action: 'gmail_preview', ticket: gmailTicket }, snapshot.lifecycleGeneration)).then(result => {
      if (!active || !mounted.current || owner.current !== id || generation.current !== atGeneration) return;
      if (!result.gmailPreview) { setError('The mailbox confirmation could not be previewed. Cancel and reconnect if needed.'); return; }
      setGmailPreview(result.gmailPreview); setPreviewOwner(id);
    }).catch(() => { if (active && mounted.current && owner.current === id && generation.current === atGeneration) setError('This mailbox confirmation is expired, belongs to another account or could not be checked. Cancel and reconnect from your own account.'); })
      .finally(() => { if (active && mounted.current && owner.current === id && generation.current === atGeneration) setPreviewBusy(false); });
    return () => { active = false; };
  }, [gmailTicket, user?.id, snapshot?.lifecycleGeneration]);
  useEffect(() => {
    if (!gmailPreview) return;
    const remaining = Date.parse(gmailPreview.expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) { setTicketExpired(true); return; }
    const timer = window.setTimeout(() => setTicketExpired(true), Math.min(remaining, 2147483647));
    return () => window.clearTimeout(timer);
  }, [gmailPreview]);
  useEffect(() => {
    if (!snapshot || !activeRun(snapshot)) return;
    const timer = window.setInterval(() => { if (!busyRef.current) void refresh(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [snapshot, refresh]);
  const sourceGenerationMatches = !!snapshot && selectedOpportunitySource?.generation === snapshot.lifecycleGeneration;
  const selectedOpportunity = sourceGenerationMatches ? snapshot.opportunities.find(item => item.id === selectedOpportunitySource.id) : null;
  const visibleOpportunities = hasOpportunitySource ? (selectedOpportunity ? [selectedOpportunity] : []) : snapshot?.opportunities ?? [];
  const visiblePackets = hasOpportunitySource ? (selectedOpportunity ? snapshot.packets.filter(item => item.opportunityId === selectedOpportunity.id) : []) : snapshot?.packets ?? [];
  const packet = visiblePackets.find(item => item.id === selectedId) ?? null;
  useEffect(() => {
    if (new URLSearchParams(route.search).has('opportunity')) { setTab('opportunities'); setSelectedId(null); setFacts(false); setDisclosure(false); setRecipientConsent(false); }
  }, [route.search, trackingAuthority]);
  packetHashRef.current = packet?.inputHash ?? null;
  useEffect(() => { setReviewedText(packet?.cvText ?? ''); setFacts(false); setDisclosure(false); setRecipientConsent(false); draftReference.current = null; }, [packet?.id, packet?.inputHash, packet?.cvText]);
  useEffect(() => {
    if (!snapshot) return;
    if (method === 'rules' && snapshot.capabilities.rulesEngine) return;
    if (snapshot.models.some(option => option.ready && option.provider === method && option.model === model)) return;
    const first = snapshot.models.find(option => option.ready);
    setMethod(snapshot.capabilities.rulesEngine ? 'rules' : first?.provider ?? '');
    setModel(snapshot.capabilities.rulesEngine ? 'grounded-rules-v1' : first?.model ?? '');
    setModelConsent(false);
  }, [snapshot, method, model]);
  function editProfile(patch: Partial<LoopProfileInput>) {
    formRevision.current++;
    if (patch.name !== undefined) copiedHeaderRef.current.name = '';
    if (patch.contactLine !== undefined) copiedHeaderRef.current.contactLine = '';
    if (patch.sourceText !== undefined && patch.sourceText !== profile.sourceText) {
      setDetailsReady(false); setSuggestions([]);
      setClaimDrafts(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith('suggestion-'))));
      setDirtyClaims(current => new Set([...current].filter(key => !key.startsWith('suggestion-'))));
    }
    setProfile(current => ({ ...current, ...patch })); setProfileDirty(true); profileDirtyRef.current = true; setSaveConsent(false); setFacts(false); setDisclosure(false); setRecipientConsent(false);
  }
  function markDirty(key: string, dirty: boolean) { formRevision.current++; setDirtyClaims(current => { const next = new Set(current); if (dirty) next.add(key); else next.delete(key); return next; }); if (!dirty) retainClaimDraft(key, null); setFacts(false); setDisclosure(false); setRecipientConsent(false); }
  function retainClaimDraft(key: string, draft: LoopClaimDraft | null) { setClaimDrafts(current => { const next = { ...current }; if (draft) next[key] = draft; else delete next[key]; return next; }); }
  function importSource(sourceText: string, preserveDetails = false) {
    const copied = copyLoopSourceDetails(sourceText);
    const copyName = !preserveDetails && (!profile.name.trim() || !!copiedHeaderRef.current.name && profile.name === copiedHeaderRef.current.name);
    const copyContact = !preserveDetails && (!profile.contactLine.trim() || !!copiedHeaderRef.current.contactLine && profile.contactLine === copiedHeaderRef.current.contactLine);
    editProfile({ sourceText, ...(copyName ? { name: copied.name } : {}), ...(copyContact ? { contactLine: copied.contactLine } : {}) });
    copiedHeaderRef.current = { name: copyName ? copied.name : '', contactLine: copyContact ? copied.contactLine : '' };
  }
  const savedCheckDraftKey = JSON.stringify([profile, lists, detailsReady, suggestions, claimDrafts, [...dirtyClaims], title, company, location, jobUrl, description, withContact, contact, pendingCheckLink]);
  const checkVacancyMatches = !pendingCheckLink || savedCheckVacancyFingerprint(pendingCheckLink.vacancy) === savedCheckVacancyFingerprint({ title, company, description });
  const existingCheckLinks = pendingCheckLink ? snapshot?.opportunities.filter(item => item.sourceCheckId === pendingCheckLink.checkId) ?? [] : [];
  const existingCheckLink = existingCheckLinks.length === 1 && existingCheckLinks[0].source === 'manual' && existingCheckLinks[0].sourceKey === `saved-check:${pendingCheckLink?.checkId}` ? existingCheckLinks[0] : null;
  const savedCheckNeedsReplacement = !!(profile.sourceText || title || company || location || jobUrl || description || withContact || Object.values(contact).some(Boolean));
  const savedCheckCopyHeader = !snapshot?.profile && !profileDirty && !profile.name.trim() && !profile.contactLine.trim();
  const savedCheckBlocked = dirtyClaims.size > 0 || Object.keys(claimDrafts).length > 0 ? 'Save or discard your claim edits before copying a saved check.' : '';
  useEffect(() => { setRestoreImportConfirmed(false); }, [savedCheckDraftKey]);
  function savedCheckScopeCurrent(scope: SavedCheckScope) {
    return mounted.current && importAuthReady.current && scope.authority >= 0 && owner.current === scope.ownerId && trackingDraftAuthority(scope.ownerId) === scope.authority
      && lifecycleGeneration.current === scope.generation && snapshotRef.current?.lifecycleGeneration === scope.generation;
  }
  function clearImportConsents() {
    setLinkConsent(false);
    setSaveConsent(false); setFacts(false); setDisclosure(false); setRecipientConsent(false); setModelConsent(false); setInboxConsent(false); setGmailReadConsent(false); setGmailDraftConsent(false);
  }
  function useSavedCheck(check: FreeCvCheck, version: SavedCheckVersion, scope: SavedCheckScope, replacementKey: string | null): boolean {
    if (busyRef.current || savedCheckBlocked || !savedCheckScopeCurrent(scope) || !usableSavedCheck(check, scope.ownerId)
      || (savedCheckNeedsReplacement && replacementKey !== savedCheckDraftKey) || !snapshotRef.current) return false;
    const sourceText = version === 'final' ? check.reviewed_text : check.original_text;
    try { validateCvText(sourceText); } catch { setError('This saved CV needs readable text before it can be copied.'); return false; }
    const before: SavedCheckBackup = structuredClone({ pendingCheckLink, profile, profileDirty, lists, detailsReady, copiedHeader: copiedHeaderRef.current, suggestions, opportunity: { title, company, location, jobUrl, description, withContact, contact } });
    opportunityDraftRevision.current++;
    setPendingCheckLink({ ...scope, checkId: check.id.toLowerCase(), vacancy: { title: check.job_title, company: check.company, description: check.job_description } });
    setSavedCheckUndo({ scope: { ...scope }, recordVersion: snapshotRef.current.recordVersion, before }); setRestoreImportConfirmed(false);
    importSource(sourceText, !savedCheckCopyHeader);
    if (!profile.targetTitles.length && !lists.targets.trim()) { editProfile({ targetTitles: [check.job_title] }); setLists(current => ({ ...current, targets: check.job_title })); }
    setTitle(check.job_title); setCompany(check.company); setDescription(check.job_description); setLocation(''); setJobUrl(''); setWithContact(false);
    setContact({ name: '', title: '', email: '', sourceUrl: '', sourceQuote: '', confirmedByUser: false, inExistingThread: false });
    clearImportConsents(); setSavedCheckIntent(null); setTab('record'); setError('');
    setNotice('Saved check copied into your local CV and vacancy drafts. Review and save each separately; add the employer’s real vacancy link. Nothing was submitted or sent to a model.');
    return true;
  }
  function undoSavedCheckImport() {
    if (!savedCheckUndo || !restoreImportConfirmed || busyRef.current || !savedCheckScopeCurrent(savedCheckUndo.scope) || snapshotRef.current?.recordVersion !== savedCheckUndo.recordVersion || savedCheckBlocked) return;
    const before = savedCheckUndo.before; formRevision.current++;
    opportunityDraftRevision.current++; setPendingCheckLink(before.pendingCheckLink);
    setProfile(before.profile); setLists(before.lists); setProfileDirty(before.profileDirty); profileDirtyRef.current = before.profileDirty; setDetailsReady(before.detailsReady); copiedHeaderRef.current = before.copiedHeader;
    setSuggestions(before.suggestions.map(item => ({ ...item, value: { ...item.value, confirmed: false, shareable: false } })));
    setTitle(before.opportunity.title); setCompany(before.opportunity.company); setLocation(before.opportunity.location); setJobUrl(before.opportunity.jobUrl); setDescription(before.opportunity.description); setWithContact(before.opportunity.withContact); setContact({ ...before.opportunity.contact, confirmedByUser: false });
    clearImportConsents(); setSavedCheckUndo(null); setRestoreImportConfirmed(false); setError(''); setNotice('Your previous local CV and vacancy draft are restored. Review sharing and contact confirmations again before saving.');
  }
  function reviewSource() {
    try {
      validateCvText(profile.sourceText);
      const focusFrom = document.activeElement, atGeneration = generation.current, atOwner = owner.current;
      importSource(profile.sourceText); setDetailsReady(true); setError('');
      const atRevision = formRevision.current;
      window.requestAnimationFrame(() => {
        const details = detailsRef.current;
        // A delayed handoff must not steal focus from a subsequent edit, page or account.
        if (!mounted.current || generation.current !== atGeneration || owner.current !== atOwner || formRevision.current !== atRevision || !details?.open || details.closest<HTMLElement>('.jl-tab-panel')?.hidden) return;
        if (document.activeElement !== focusFrom && document.activeElement !== document.body) return;
        details.scrollIntoView?.({ block: 'start', behavior: 'auto' }); details.querySelector('input')?.focus();
      });
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Review the source text before continuing.'); }
  }
  async function requestSuggestions() {
    const result = await perform({ action: 'suggest_claims' });
    if (result?.suggestions) {
      setSuggestions(result.suggestions.map(claim => ({ key: `suggestion-${crypto.randomUUID()}`, value: { ...claim, confirmed: false, shareable: false } })));
    }
  }
  function skipSuggestion(key: string) { markDirty(key, false); setSuggestions(current => current.filter(item => item.key !== key)); }
  async function perform(action: LoopAction, success?: string, resetProfile = false, current?: () => boolean): Promise<LoopResponse | null> {
    const id = owner.current; if (!id || busyRef.current || current && !current()) return null;
    try { action = boundLoopAction(action, erasureGeneration.current ?? snapshotRef.current?.lifecycleGeneration); }
    catch(failure) { setError(failure instanceof Error ? failure.message : 'Refresh Jobvance before continuing.'); return null; }
    const atGeneration = generation.current, atAuthority = trackingDraftAuthority(id); ++serial.current; busyRef.current = action.action; setBusy(action.action); setError(''); setNotice('');
    if (['save_profile', 'save_claim', 'withdraw_claim', 'add_opportunity', 'link_saved_check', 'erase_loop', 'erase_self'].includes(action.action)) { setSavedCheckUndo(null); setRestoreImportConfirmed(false); }
    if(action.action==='erase_loop'||action.action==='erase_self'){erasureGeneration.current=action.expectedGeneration;setErasureOwner(id);setSnapshot(null);setLoadedOwner(null);snapshotRef.current=null;downloadTransfer.current?.abort();}
    try {
      const result = await callJobLoop(id, action);
      if (!mounted.current || owner.current !== id || generation.current !== atGeneration) return null;
      if (current && !current()) return null;
      if (['link_saved_check', 'start_selected_run'].includes(action.action) && (!importAuthReady.current || atAuthority < 0 || trackingDraftAuthority(id) !== atAuthority || result.snapshot?.lifecycleGeneration !== action.expectedGeneration)) return null;
      if (result.snapshot) applySnapshot(result.snapshot, resetProfile);
      else if (!['suggest_claims', 'gmail_connect', 'download', 'gmail_create_draft'].includes(action.action)) {
        const fresh = await callJobLoop(id, { action: 'get' });
        if (!mounted.current || owner.current !== id || generation.current !== atGeneration) return null;
        if (fresh.erasureGeneration !== undefined) { erasureGeneration.current=fresh.erasureGeneration;setTrackingLoopGeneration(id,fresh.erasureGeneration);setErasureOwner(id);setSnapshot(null);setLoadedOwner(null);snapshotRef.current=null; }
        else if (fresh.snapshot) applySnapshot(fresh.snapshot, resetProfile);
      }
      if (['save_profile', 'save_claim', 'withdraw_claim', 'add_opportunity', 'link_saved_check'].includes(action.action)) { setModelConsent(false); setInboxConsent(false); }
      if (result.message || success) setNotice(result.message || success || '');
      return result;
    } catch (failure) { if (mounted.current && owner.current === id && generation.current === atGeneration && (!current || current())) { setError(failure instanceof Error ? failure.message : 'This action could not be completed.'); if(loopErasureNeedsContinuation(failure)){setErasureOwner(id);setSnapshot(null);setLoadedOwner(null);snapshotRef.current=null;} } return null; }
    finally { if (mounted.current && owner.current === id && generation.current === atGeneration) { busyRef.current = ''; setBusy(''); } }
  }
  async function readFile(file?: File) {
    if (!file || busyRef.current) return;
    const id = owner.current, revision = ++formRevision.current, atGeneration = generation.current; setBusy('reading'); busyRef.current = 'reading'; setError('');
    try { const sourceText = await extractCvText(file); if (mounted.current && owner.current === id && formRevision.current === revision && generation.current === atGeneration) { importSource(sourceText); setNotice('Text read locally. Review the extracted text and copied header details before saving. The original file was not uploaded.'); } }
    catch (failure) { if (mounted.current && owner.current === id && generation.current === atGeneration) setError(failure instanceof Error ? failure.message : 'This file could not be read.'); }
    finally { if (mounted.current && owner.current === id && generation.current === atGeneration) { setBusy(''); busyRef.current = ''; } }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!snapshot || !saveConsent) return;
    try { validateCvText(profile.sourceText); if (!profile.name.trim() || !profile.targetTitles.length || !profile.locations.length) throw new Error('Add your name, at least one target role and a location.');
      const firstSave = !snapshot.profile;
      const result = await perform({ action: 'save_profile', expectedVersion: snapshot.recordVersion, profile, saveConsent }, 'Career record saved privately. Review and confirm your claims next.', true);
      if (result && firstSave) await requestSuggestions();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Review your career record.'); }
  }
  async function saveClaim(value: LoopClaimInput, key: string, id?: string) {
    if (!snapshot) return false;
    const result = await perform({ action: 'save_claim', expectedVersion: snapshot.recordVersion, ...(id ? { id } : {}), claim: value }, 'Claim saved with your confirmation and sharing choices.');
    if (!result) return false;
    markDirty(key, false); if (!id && key === 'new') setNewClaimKey(current => current + 1);
    if (key.startsWith('suggestion-')) setSuggestions(current => current.filter(item => item.key !== key));
    return true;
  }
  async function addOpportunity(event: FormEvent) {
    event.preventDefault(); if (!snapshot) return;
    if (pendingCheckLink && (!savedCheckScopeCurrent(pendingCheckLink) || !checkVacancyMatches || !linkConsent || linkConsentRevision.current !== opportunityDraftRevision.current || (existingCheckLinks.length > 0 && !existingCheckLink))) { setError('Review the saved-check link and confirm your choice before saving.'); return; }
    if (title.trim().length < 2 || description.trim().length < 80 || !isLoopHttpsUrl(jobUrl)) { setError('Add a title, a real HTTPS vacancy link and the full job description (at least 80 characters).'); return; }
    if (withContact && (!contact.name.trim() || !contact.sourceQuote.trim() || !isLoopHttpsUrl(contact.sourceUrl) || !contact.confirmedByUser || (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)))) { setError('Add a named contact, source link and source passage, then confirm the contact yourself. An email format is not verification.'); return; }
    const revision = opportunityDraftRevision.current;
    const opportunity = { title, company, location, url: jobUrl, description, contact: withContact ? contact : null };
    const action: LoopAction = pendingCheckLink
      ? { action: 'link_saved_check', expectedVersion: snapshot.recordVersion, expectedGeneration: pendingCheckLink.generation, checkId: pendingCheckLink.checkId, opportunity, linkConsent: true }
      : { action: 'add_opportunity', expectedVersion: snapshot.recordVersion, opportunity };
    const result = await perform(action, pendingCheckLink ? 'Vacancy linked to your saved check. Existing progress is kept. No preparation, application or outreach was started.' : 'Opportunity saved as user-provided. No application or outreach was sent.');
    if (result && revision === opportunityDraftRevision.current && (!pendingCheckLink || savedCheckScopeCurrent(pendingCheckLink))) {
      opportunityDraftRevision.current++; setPendingCheckLink(null); setLinkConsent(false);
      setTitle(''); setCompany(''); setLocation(''); setJobUrl(''); setDescription(''); setWithContact(false); setContact({ name: '', title: '', email: '', sourceUrl: '', sourceQuote: '', confirmedByUser: false, inExistingThread: false });
    }
  }
  const preparationRevision = formRevision.current;
  const uncommitted = profileDirty || dirtyClaims.size > 0;
  const hasUnsavedDraft = Object.values(builderAnswers).some(value => value.trim()) || uncommitted || !!pendingCheckLink || !!(title || company || location || jobUrl || description || withContact);
  useEffect(() => {
    if (user?.id && (!snapshot || snapshot.lifecycleGeneration === undefined)) return;
    if (user?.id && hasUnsavedDraft) retainLoopWorkingDraft(user.id, { lifecycleGeneration:snapshot!.lifecycleGeneration!, builderAnswers, builderAuthority:trackingDraftAuthority(user.id), pendingCheckLink, profile, profileDirty, lists, claimDrafts, suggestions, newClaimKey, opportunity: { title, company, location, jobUrl, description, withContact, contact } });
    else clearLoopWorkingDraft();
  }, [user?.id, snapshot?.lifecycleGeneration, hasUnsavedDraft, builderAnswers, pendingCheckLink, profile, profileDirty, lists, claimDrafts, suggestions, newClaimKey, title, company, location, jobUrl, description, withContact, contact]);
  useEffect(() => {
    if (!hasUnsavedDraft) return;
    const leaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const following = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm('You have unsaved Job Loop edits. Stay to save them, or leave this page? Career record, claim and new-vacancy drafts remain in this tab’s memory for up to 30 minutes; refresh or account changes clear them.')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', leaving); document.addEventListener('click', following, true);
    return () => { window.removeEventListener('beforeunload', leaving); document.removeEventListener('click', following, true); };
  }, [hasUnsavedDraft]);
  const packetFresh = !!packet && !!snapshot && packetSourcesCurrent(packet, snapshot);
  const pagesReady = !!packet && !!snapshot && packetPagesReady(packet, snapshot);
  const edited = !!packet && reviewedText !== packet.cvText;
  const packetApproved = !!packet && packet.status === 'approved' && packetFresh && pagesReady && !edited && !uncommitted;
  const packetApprovedRef = useRef(packetApproved); packetApprovedRef.current = packetApproved;
  useEffect(() => { downloadTransfer.current?.abort(); }, [selectedId, packet?.inputHash, packetApproved]);
  async function download(format: 'pdf' | 'docx' | 'txt' | 'report' | 'letter') {
    if (!packet || !packetApproved || !user || busyRef.current || (["pdf","docx","txt"].includes(format) && packet.formatStatus?.[format as "pdf" | "docx" | "txt"]?.ready === false)) return;
    const id = user.id, packetId = packet.id, hash = packet.inputHash, atGeneration = generation.current; setBusy('download'); busyRef.current = 'download'; setError('');
    downloadTransfer.current?.abort(); const controller=new AbortController(); downloadTransfer.current=controller;
    try { const result = await getLoopDownload(id, packetId, format, controller.signal); if (!controller.signal.aborted && packetApprovedRef.current && mounted.current && owner.current === id && generation.current === atGeneration && selectedRef.current === packetId && hash === packetHashRef.current) { downloadBlob(result.blob, result.filename); setNotice('Download requested. This does not send an application.'); } }
    catch (failure) { if (!controller.signal.aborted && mounted.current && owner.current === id && generation.current === atGeneration) setError(failure instanceof Error ? failure.message : 'Download failed.'); }
    finally { if (mounted.current && owner.current === id && generation.current === atGeneration) { setBusy(''); busyRef.current = ''; } }
  }
  async function startRun() {
    if (!snapshot || !snapshot.profile || uncommitted || !snapshot.capabilities.cloudWorker || busyRef.current || (method === 'rules' && !snapshot.capabilities.rulesEngine)) return;
    const chosen = method === 'rules' ? null : snapshot.models.find(option => option.provider === method && option.model === model && option.ready);
    if (method !== 'rules' && (!chosen || !modelConsent)) { setError('Choose an available model and allow its processing before starting.'); return; }
    const key = JSON.stringify([snapshot.recordVersion, method, model, inboxConsent,chosen?.transport??'direct']);
    if (startReference.current?.key !== key) startReference.current = { key, id: crypto.randomUUID() };
    const result = await perform({ action: 'start_run', requestId: startReference.current.id, provider: method as LoopProviderId | 'rules', model, modelConsent, inboxConsent: snapshot.gmail.connected && inboxConsent,...(chosen?{processingRoute:chosen.transport??'direct'}:{}) }, 'Run requested. Its actual progress and source coverage appear below.');
    if (result) { startReference.current = null; setModelConsent(false); setInboxConsent(false); }
  }
  async function connectGmail() {
    if (!snapshot?.capabilities.gmailRead || !gmailReadConsent) return;
    const result = await perform({ action: 'gmail_connect', allowDrafts: snapshot.capabilities.gmailDrafts && gmailDraftConsent });
    if (result?.url) { try { window.location.assign(safeLoopGmailUrl(result.url)); } catch { setError('Gmail connection returned an unexpected address.'); } }
  }
  async function createGmailDraft() {
    if (!packet || !packetApproved || !recipientConsent || !snapshot?.gmail.connected || !snapshot.gmail.allowDrafts || !snapshot.capabilities.gmailDrafts || !packet.contact?.confirmedByUser || !packet.contact.email) return;
    const key = `${packet.id}:${packet.inputHash}`; if (draftReference.current?.key !== key) draftReference.current = { key, id: crypto.randomUUID() };
    await perform({ action: 'gmail_create_draft', packetId: packet.id, requestId: draftReference.current.id, confirmRecipientAndAttachment: recipientConsent }, 'Draft request completed. Check the server confirmation below; nothing was sent.');
  }
  function cancelMailboxConfirmation() { setGmailTicket(''); setGmailPreview(null); setPreviewOwner(null); setMailboxConfirmed(false); setPreviewBusy(false); setNotice('Mailbox confirmation cancelled. No new mailbox access was activated.'); }
  async function confirmMailbox() {
    if (!gmailTicket || !gmailPreview?.email || previewOwner !== owner.current || !mailboxConfirmed || ticketExpired || !snapshot?.capabilities.gmailRead) return;
    const result = await perform({ action: 'gmail_finalize', ticket: gmailTicket, confirmMailbox: mailboxConfirmed }, 'The previewed mailbox connection was confirmed.');
    if (result) { setGmailTicket(''); setGmailPreview(null); setPreviewOwner(null); setMailboxConfirmed(false); }
  }
  const latestRun = snapshot?.runs[0], due = snapshot?.opportunities.filter(item => loopFollowUpDue(item.followUpAt) && !['rejected', 'withdrawn', 'offer'].includes(item.status)) ?? [];
  const models = snapshot?.models.filter(option => option.ready) ?? [];
  const unavailableMethods = snapshot ? (['anthropic', 'openai', 'moonshot'] as const).filter(id => !models.some(option => option.provider === id)).map(id => providerNames[id]) : [];
  const savedImportScope = user && !authLoading && !authError && trackingAuthority >= 0 && snapshot && Number.isSafeInteger(snapshot.lifecycleGeneration) && snapshot.lifecycleGeneration! >= 0
    ? { ownerId: user.id, generation: snapshot.lifecycleGeneration!, authority: trackingAuthority } : null;
  const importIntentId = savedCheckIntent && savedImportScope && savedCheckIntent.scope.ownerId === savedImportScope.ownerId && savedCheckIntent.scope.authority === savedImportScope.authority && savedCheckIntent.scope.generation === savedImportScope.generation ? savedCheckIntent.id : null;
  const requestedSavedCheck = readSavedCheckContinuation(route.search);
  const savedCheckSignIn = `/auth?next=${encodeURIComponent(requestedSavedCheck ? savedCheckContinuationPath(requestedSavedCheck)! : '/loop')}`;
  function openSetupStep(section: Tab, target: string) {
    if (!savedImportScope || !importAuthReady.current || trackingDraftAuthority(savedImportScope.ownerId) !== savedImportScope.authority || snapshotRef.current?.lifecycleGeneration !== savedImportScope.generation) return;
    const scope = savedImportScope;
    setTab(section);
    window.requestAnimationFrame(() => {
      if (!mounted.current || !importAuthReady.current || owner.current !== scope.ownerId || trackingDraftAuthority(scope.ownerId) !== scope.authority || snapshotRef.current?.lifecycleGeneration !== scope.generation) return;
      const panel = document.getElementById(target);
      if (panel instanceof HTMLDetailsElement) panel.open = true;
      panel?.focus({ preventScroll: true }); panel?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    });
  }
  const setupDraft = user && snapshot && !snapshot.profile && !erasurePending && !loading && !error ? recoverOnboardingDraft(user.id, trackingAuthority, snapshot.lifecycleGeneration ?? null) : null;
  const setupSteps = ['Roles', 'Locations', 'Pay preferences', 'Privacy preferences', 'Your CV', 'Review and save'];
  return <main className="job-loop-page"><Helmet><title>Your Job Loop | Jobvance</title><meta name="robots" content="noindex,follow" /></Helmet>
    <ProductNavigation active="loop" />
    <header className="jl-page-heading"><div><p className="jl-eyebrow">YOUR JOB LOOP</p><h1>Your job search, on a schedule.</h1><p>Add or build your CV, tell us which jobs and locations interest you, then review matched jobs and prepared CVs here.</p><div className="jl-context-help"><Link to="/job-loop">What is Job Loop?</Link><Link to="/walkthroughs">Follow a walkthrough</Link></div></div></header>
    {user && hasOpportunitySource && <section className="jl-panel" aria-label="Selected application"><h2>Selected application</h2>{!selectedOpportunitySource ? <p role="alert">This application link is invalid. Choose it again from My applications.</p> : loading ? <p role="status">Loading your selected application…</p> : !snapshot ? <p role="alert">Your saved application could not be loaded. Retry without starting a new run.</p> : !sourceGenerationMatches ? <p role="alert">This link belongs to an earlier Job Loop record. Choose the current application from My applications.</p> : !selectedOpportunity ? <p role="alert">This vacancy is no longer available in this record. No other vacancy was selected.</p> : <><h3>{selectedOpportunity.title} · {selectedOpportunity.company}</h3><p>Tracking and recently loaded document attempts below belong to this exact vacancy. Older attempts may be outside the recent results.</p>{visiblePackets.map(item => <button key={item.id} className="jl-button" type="button" disabled={!!busy} onClick={() => { setSelectedId(item.id); setTab('outputs'); setFacts(false); setDisclosure(false); setRecipientConsent(false); }}>Review document attempt · {date(item.createdAt)} · {display(item.status)}</button>)}</>}<Link className="jl-text-link" to="/applications">Back to my applications</Link><button className="jl-button" type="button" onClick={() => navigate('/loop')}>Show all Job Loop opportunities</button></section>}
    {!user ? <section className="jl-panel"><h2>{gmailTicket ? 'Sign in to confirm the returned mailbox' : requestedSavedCheck ? 'Sign in to continue your saved CV check' : 'Start your Job Loop.'}</h2>{gmailTicket ? <><p>Keep this tab open. Sign in to the account that started this connection in another tab, then return here to confirm the mailbox.</p><p>The return ticket is held only in this page’s memory. Mailbox access is not activated by this return.</p><div className="jl-actions"><Link className="jl-button jl-button--primary" to="/auth?next=%2Floop" target="_blank" rel="noopener noreferrer">Sign in in another tab</Link><button className="jl-button" type="button" disabled={typeof retryConnection !== 'function'} onClick={() => retryConnection?.()}>Check sign-in again</button><button className="jl-button" type="button" onClick={cancelMailboxConfirmation}>Cancel mailbox confirmation</button></div></> : requestedSavedCheck ? <><p>Sign in to the account that saved this check. Review the CV and vacancy before choosing what to copy into Job Loop.</p><Link className="jl-button jl-button--primary" to={savedCheckSignIn}>Sign in to review this saved check</Link></> : <><p>Save your experience once, choose where you want to work and set up your search. Your dashboard keeps the jobs found, prepared CVs and next actions together.</p><div className="jl-actions"><Link className="jl-button jl-button--primary" to={savedCheckSignIn}>Set up my Job Loop</Link><Link className="jl-button" to={`/check?audience=${profile.audience}`}>Try a CV check first</Link></div></>}</section> : <div className="jl-layout"><aside className="jl-sidebar"><nav aria-label="Job Loop sections">{tabs.map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}><item.icon size={18} aria-hidden="true" />{item.label}</button>)}</nav><div className="jl-sidebar-note"><LockKeyhole size={18} aria-hidden="true" /><p>Private record. Reviewed outputs. No automatic sends or applications.</p></div><button type="button" className="jl-button jl-button--quiet" disabled={!!busy || loading} onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true" />Refresh records</button></aside>
      <div className="jl-content">{loading && <p role="status" className="jl-loading"><Loader2 size={18} aria-hidden="true" />Loading your private records…</p>}{busy && <p role="status" className="jl-loading"><Loader2 size={18} aria-hidden="true" />Working on your request…</p>}{error && <div role="alert" className="jl-alert"><p>{error}</p><p>Saved records are not replaced by an empty example. Refresh to confirm the current state.</p></div>}{notice && <p role="status" className="jl-notice">{notice}</p>}
      {gmailTicket && <section className="jl-panel jl-mailbox-confirmation" aria-labelledby="jl-mailbox-confirm-title"><p className="jl-eyebrow">RETURNED MAILBOX NEEDS YOUR CONFIRMATION</p><h2 id="jl-mailbox-confirm-title">Confirm the returned Gmail mailbox</h2><p>The return ticket was removed from the address bar and remains only in this page’s memory. Leaving this page cancels this confirmation. Nothing is connected automatically.</p>{previewBusy && <p role="status">Checking the account-bound mailbox preview…</p>}{gmailPreview && previewOwner === user.id && <><p className="jl-mailbox-identity"><Mail size={18} aria-hidden="true" />{gmailPreview.email || 'Mailbox identity could not be established'}</p><p>Permissions: mailbox reading{gmailPreview.allowDrafts ? ' and explicitly requested draft creation' : ' only'}. Jobvance uses recruitment-message queries after separate run consent. Google’s draft permission also allows sending at the permission level; Jobvance provides no send action.</p><p className="jl-help">Confirmation expires {date(gmailPreview.expiresAt)}. You can disconnect later; existing Gmail drafts are not deleted.</p>{ticketExpired && <p className="jl-warning">This confirmation has expired. Cancel and reconnect from your own account.</p>}<Consent checked={mailboxConfirmed} onChange={setMailboxConfirmed} disabled={!!busy || ticketExpired || !gmailPreview.email}>This is my intended mailbox, and I confirm the displayed permissions for my Jobvance account.</Consent><button type="button" className="jl-button jl-button--primary" disabled={!!busy || !mailboxConfirmed || ticketExpired || !gmailPreview.email || !snapshot?.capabilities.gmailRead} onClick={() => void confirmMailbox()}>Confirm this mailbox</button></>}<button type="button" className="jl-button" disabled={!!busy} onClick={cancelMailboxConfirmation}>Cancel mailbox confirmation</button></section>}
      {erasurePending && <section className="jl-panel" aria-label="Erasure progress"><h2>Finish erasing your Job Loop</h2><p>Erasure has not been confirmed complete. Continue to check and remove remaining Job Loop data. An active erasure request keeps new preparation and uploads stopped until its files are gone.</p><p>You can close this page and continue later with the same account. Your sign-in account and separate workspace records are outside this erasure.</p></section>}
      {!snapshot && !loading && !erasurePending && <section className="jl-panel"><h2>Your Job Loop could not be loaded.</h2><p>Retry to reconnect and load your saved work. You can also open your existing workspace.</p><div className="jl-actions"><button type="button" className="jl-button" disabled={!!busy} onClick={() => void refresh()}>Retry Job Loop</button><Link className="jl-button" to="/dashboard?tab=cv">Open existing workspace</Link></div></section>}
      {hasUnsavedDraft && <p className="jl-unsaved-notice">You have unsaved edits. Career record, claim and new-vacancy drafts remain in this tab’s memory for up to 30 minutes, including when switching pages. Refresh, closing this tab or changing accounts clears them.</p>}
      {snapshot && !snapshot.profile && <section className="jl-panel" aria-label="Job Loop setup"><h2>{setupDraft ? 'Continue setting up your Job Loop' : 'Set up your Job Loop'}</h2><p>{setupDraft ? `Step ${setupDraft.step + 1} of 6 · ${setupSteps[setupDraft.step]}. Your unfinished answers are still in this tab.` : 'Choose your roles and locations, add or build your CV, then set your search schedule.'}</p><div className="jl-actions"><Link className="jl-button jl-button--primary" to="/onboarding">{setupDraft ? 'Resume setup' : 'Start your setup'}</Link>{tab === 'today' && <button className="jl-button" type="button" onClick={() => setTab('record')}>Set up directly without questions</button>}</div>{setupDraft && <p className="jl-help">Your answers are not saved to your account yet. Resume within 30 minutes; refreshing or signing out clears this draft.</p>}</section>}
      {snapshot?.profile && snapshot.schedule?.status !== 'active' && <section className="jl-panel" aria-label="Your next setup steps"><h2>Put your CV to work.</h2><p>Your CV and search preferences are saved. Finish these steps to start recurring preparation.</p><ol>
        <li><strong>Review the facts in your CV.</strong> {snapshot.claims.filter(claim => claim.status === 'active' && claim.confirmed && claim.shareable).length} active facts are confirmed and permitted for sharing. <button className="jl-button jl-button--quiet" type="button" disabled={!savedImportScope || !!busy} onClick={() => openSetupStep('record', 'jl-facts')}>Review CV facts</button></li>
        {snapshot.capabilities.cvVariants === true ? <><li><strong>Save a CV for the work you want.</strong> Load your saved variants, or create one from your reviewed source. The saved list confirms what is available. <button className="jl-button jl-button--quiet" type="button" disabled={!savedImportScope || !!busy} onClick={() => openSetupStep('record', 'jl-cv-variants')}>Open saved CV variants</button></li><li><strong>Choose that CV and its schedule.</strong> Confirm the exact facts, frequency and processing method. AI preparation needs your provider and sharing consent. <button className="jl-button jl-button--quiet" type="button" disabled={!savedImportScope || !!busy} onClick={() => openSetupStep('record', 'jl-variant-preparation')}>Choose CV and schedule</button></li></> : <li><strong>Choose your search schedule.</strong> Review the available frequency and confirm preparation before enabling it. <button className="jl-button jl-button--quiet" type="button" disabled={!savedImportScope || !!busy} onClick={() => openSetupStep('today', 'jl-recurring-panel')}>Review search schedule</button></li>}
      </ol><p>Today shows your schedule and run results. Prepared CVs is where you review and approve each document before downloading.</p></section>}
      {snapshot?.profile && tab === 'today' && <LoopWorkspaceOverview snapshot={snapshot} onSchedule={() => { const schedule = document.getElementById('jl-recurring-panel') as HTMLDetailsElement | null; if (schedule) { schedule.open = true; schedule.querySelector<HTMLElement>('summary')?.focus(); schedule.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); } }} onOpen={(section, packetId) => { setTab(section); if (packetId) setSelectedId(packetId); if (section === 'today') window.requestAnimationFrame(() => { const heading = document.getElementById('jl-selected-prepare-heading'); heading?.focus({ preventScroll: true }); heading?.scrollIntoView?.({ block: 'start', behavior: 'instant' }); }); }} />}
      {snapshot?.profile && <LoopSelectedPreparation key={`selected:${user.id}:${trackingAuthority}:${snapshot.lifecycleGeneration}`} snapshot={snapshot} owner={user.id} authority={trackingAuthority} ready={!authLoading && !authError} busy={!!busy} hasEdits={uncommitted} draftRevision={preparationRevision} hidden={tab !== 'today'} requested={preparationChoice?.owner === user.id && preparationChoice.authority === trackingAuthority && preparationChoice.generation === snapshot.lifecycleGeneration ? preparationChoice : undefined} perform={perform} captureGuard={() => {
        const atOwner = owner.current, atAuthority = trackingDraftAuthority(user.id), atGeneration = generation.current, atRevision = preparationRevision;
        return () => mounted.current && importAuthReady.current && owner.current === atOwner && trackingDraftAuthority(user.id) === atAuthority && generation.current === atGeneration && formRevision.current === atRevision && !profileDirtyRef.current;
      }} />}
      {snapshot && tab === 'today' && <>

        {snapshot.profile && <>
        <section className="jl-panel jl-today-intro"><p className="jl-eyebrow">TODAY</p><h2>{latestRun?.nextAction || (snapshot.profile ? 'Review your facts, then prepare a run.' : 'Start with your career record.')}</h2><p>{snapshot.profile ? 'Replies and due follow-ups come first. Run results below report the sources actually checked.' : 'Bring a reviewed CV or project record. Save privately, then confirm the facts you want to use.'}</p>{!snapshot.profile && <button className="jl-button jl-button--primary" type="button" onClick={() => setTab('record')}>Set up my career record <ArrowRight size={16} aria-hidden="true" /></button>}</section>
        <section className="jl-panel" aria-label="Replies and next actions"><h2>Replies & due follow-ups</h2>{snapshot.inbox.filter(signal => signal.bucket === 'action_needed').map(signal => <article key={signal.id} className="jl-signal"><h3>{signal.subject}</h3><p>{signal.from} · {date(signal.receivedAt)}</p><p>{signal.summary}</p>{signal.roleUnconfirmed && <p className="jl-warning">Role unconfirmed. Check before assigning this reply to an application.</p>}{signal.draftReply && <details><summary>Review draft reply (unsent)</summary><pre>{signal.draftReply}</pre><button className="jl-button" type="button" onClick={() => void navigator.clipboard.writeText(signal.draftReply).then(() => setNotice('Reply text copied. Nothing was sent.')).catch(() => setError('Copy is unavailable. Select the draft text instead.'))}>Copy reply text</button></details>}</article>)}{snapshot.inbox.some(signal => ['progress', 'rejected'].includes(signal.bucket)) && <details><summary>Other recorded reply updates</summary>{snapshot.inbox.filter(signal => ['progress', 'rejected'].includes(signal.bucket)).map(signal => <article key={signal.id} className="jl-signal"><span className="jl-tag">{display(signal.bucket)}</span><h3>{signal.subject}</h3><p>{signal.from} · {date(signal.receivedAt)}</p><p>{signal.summary}</p>{signal.roleUnconfirmed && <p className="jl-warning">Role unconfirmed. This update has not been silently assigned to an application.</p>}</article>)}</details>}{due.map(item => <article key={item.id} className="jl-signal"><h3>{item.title} · {item.company}</h3><p>Your follow-up date: {date(item.followUpAt)}</p><button type="button" className="jl-text-link" onClick={() => setTab('opportunities')}>Review tracking record <ArrowRight size={14} aria-hidden="true" /></button></article>)}{!snapshot.inbox.some(signal => signal.bucket === 'action_needed') && due.length === 0 && <p>No action-needed messages or due dates are recorded here. This does not establish that your inbox has no replies.</p>}</section>
        <LoopDiscoverySources snapshot={snapshot} onAdd={() => setTab("opportunities")} /><section className="jl-panel"><h2 id="jl-prepare-heading" tabIndex={-1}>Discovery and wider preparation</h2><p>Runs use your saved, confirmed and shareable facts. Source-based preparation needs no external model. A cloud run can continue after you close this page; refresh to inspect its actual progress.</p><Link className="jl-text-link" to="/help#job-loop-controls">Help with preparation and optional automation</Link>{!snapshot.capabilities.cloudWorker && <p className="jl-warning">Cloud processing is not configured. Record saving and manual tracking are separate capabilities.</p>}{uncommitted && <p className="jl-warning">Save or discard your record and claim edits before starting or approving outputs.</p>}
          <div className="jl-form-grid"><Select label="Preparation provider" value={method} disabled={!!busy || !snapshot.capabilities.cloudWorker} onChange={value => { setMethod(value); setModelConsent(false); setModel(value === 'rules' ? 'grounded-rules-v1' : models.find(option => option.provider === value)?.model ?? ''); }}>{snapshot.capabilities.rulesEngine && <option value="rules">Source-based preparation · no AI</option>}{!snapshot.capabilities.rulesEngine && models.length === 0 && <option value="">No methods configured</option>}{(['anthropic', 'openai', 'moonshot'] as const).filter(id => models.some(option => option.provider === id)).map(id => <option key={id} value={id}>{providerNames[id]}</option>)}</Select>{method && method !== 'rules' && <Select label="Model" value={model} disabled={!!busy} onChange={value => { setModel(value); setModelConsent(false); }}>{models.filter(option => option.provider === method).map(option => <option key={option.model} value={option.model}>{option.label}</option>)}</Select>}</div>
          {unavailableMethods.length > 0 && <p className="jl-help">{unavailableMethods.join(', ')} processing is not currently configured. No provider is substituted silently.</p>}{method && method !== 'rules' && <><Consent checked={modelConsent} onChange={setModelConsent} disabled={!!busy}>Allow this run’s active, confirmed and shareable claim wording and the vacancy text to be processed by {providerNames[method as LoopProviderId]}{models.find(option => option.provider === method && option.model === model)?.transport === "openrouter" ? " via OpenRouter" : ""} using the selected model. This permission is bound to that processing route.</Consent><p className="jl-help">The model receives only cleared claim wording, its context and this vacancy text. Your raw CV source, name and contact line are not included. Review each claim’s sharing permission first.</p></>}{snapshot.gmail.connected ? <Consent checked={inboxConsent} onChange={setInboxConsent} disabled={!!busy}>For this run, check the connected recruitment messages before preparation. Google sign-in alone does not grant inbox consent.</Consent> : <p className="jl-help">Gmail is not connected. The inbox lane will be reported as not connected.</p>}<p className="jl-help">Current allowance: up to {snapshot.capabilities.dailyRunLimit} runs per day, subject to available processing capacity.</p><button type="button" className="jl-button jl-button--primary" disabled={!!busy || !snapshot.profile || uncommitted || !snapshot.capabilities.cloudWorker || activeRun(snapshot) || !method || (method === 'rules' && !snapshot.capabilities.rulesEngine) || snapshot.capabilities.dailyRunLimit < 1 || (snapshot.pilot?.enrolled === false && snapshot.pilot.activeUsers >= snapshot.pilot.maxUsers) || !snapshot.claims.some(claim => claim.status === "active" && claim.confirmed && claim.shareable) || !!error || (method !== 'rules' && !modelConsent)} onClick={() => void startRun()}><Play size={16} aria-hidden="true" />Prepare today’s applications</button>
        </section>
        <section className="jl-panel"><div className="jl-row-heading"><h2>Run history & source coverage</h2><span className="jl-tag">{snapshot.opportunities.length} opportunities · {snapshot.packets.filter(item => item.status === 'approved' && packetSourcesCurrent(item, snapshot) && packetPagesReady(item, snapshot)).length} ready downloads</span></div>{snapshot.runs.length === 0 ? <p>No runs are recorded yet. Added opportunities remain in your account.</p> : snapshot.runs.map(run => <article key={run.id} className="jl-run"><div className="jl-row-heading"><h3>{display(run.status)} · {display(run.phase)}</h3><span className="jl-help">Started {date(run.startedAt)}</span></div><p>{run.selection ? `Chosen vacancies: ${run.selection.opportunityIds.map(id => run.selection!.generation === snapshot.lifecycleGeneration ? snapshot.opportunities.find(o => o.id === id)?.title ?? 'Saved vacancy no longer available' : 'Vacancy from an earlier record').join(' · ')}. Inbox and discovery are excluded.` : 'Discovery-wide preparation; no exact vacancy selection was recorded.'}</p><p>{run.provider === 'rules' ? 'Source-based preparation' : `${providerNames[run.provider]} · ${snapshot.models.find(option => option.provider === run.provider && option.model === run.model)?.label ?? 'configured model'}`}</p>{run.lanes.length > 0 ? <ul className="jl-lanes">{run.lanes.map((lane, i) => <li key={`${lane.name}-${i}`}><strong>{lane.name}</strong><span className="jl-tag">{display(lane.status)} · {lane.count}</span><p>{lane.message}</p><small>Checked {date(lane.checkedAt)}</small></li>)}</ul> : <p className="jl-help">No completed source checks are reported yet.</p>}{run.messages.map((message, i) => <p key={i} className="jl-help">{message}</p>)}<div className="jl-actions">{['queued', 'running'].includes(run.status) && <button className="jl-button" type="button" disabled={!!busy} onClick={() => void perform({ action: 'cancel_run', runId: run.id }, 'Cancellation requested. Check the run state for confirmation.')}><Square size={14} aria-hidden="true" />Cancel run</button>}{['queued', 'running', 'partial', 'blocked', 'failed'].includes(run.status) && <button className="jl-button" type="button" disabled={!!busy || uncommitted || !snapshot.capabilities.cloudWorker} onClick={() => void perform({ action: 'resume_run', runId: run.id }, 'Resume requested. Progress is reported by the cloud service.')}><RefreshCw size={14} aria-hidden="true" />Resume run</button>}{run.packetIds.length > 0 && <button className="jl-button" type="button" onClick={() => { setTab('outputs'); setSelectedId(run.packetIds[0]); }}>Review this run’s outputs</button>}</div></article>)}</section>
        <details id="jl-recurring-panel" className="jl-panel jl-optional-block" open={snapshot.schedule?.status === 'active' || snapshot.schedule?.status === 'paused'}><summary>Your search schedule <span className="jl-tag">{snapshot.schedule ? display(snapshot.schedule.status) : snapshot.capabilities.scheduler ? 'Not enabled' : 'Not available'}</span></summary><LoopSchedule key={`${user.id}:${snapshot.lifecycleGeneration}`} snapshot={snapshot} busy={!!busy} hasEdits={uncommitted} perform={perform} /></details>
        <LoopActivity snapshot={snapshot} />
        <details className="jl-panel jl-optional-block"><summary>Optional Gmail access <span className="jl-tag">{snapshot.gmail.connected ? 'Connected' : snapshot.capabilities.gmailRead ? 'Not connected' : 'Not available'}</span></summary>
        <section className="jl-panel jl-optional-connection"><h2>Optional Gmail connection</h2><p>{snapshot.gmail.connected ? `Connected: ${snapshot.gmail.email || 'your Gmail account'}` : 'Not connected.'} {snapshot.gmail.status}</p>{!snapshot.capabilities.gmailRead && <p className="jl-help">Inbox connection is not available until the service is configured and its access requirements are completed.</p>}{snapshot.gmail.connected ? <button className="jl-button" type="button" disabled={!!busy} onClick={() => void perform({ action: 'gmail_disconnect' }, 'Gmail disconnect requested. Check the current connection state.')}>Disconnect Gmail</button> : <><Consent checked={gmailReadConsent} onChange={setGmailReadConsent} disabled={!snapshot.capabilities.gmailRead || !!busy}>Connect Gmail for recruitment-message review. Access is separate from signing in, and run-by-run reading remains my choice.</Consent><Consent checked={gmailDraftConsent} onChange={setGmailDraftConsent} disabled={!snapshot.capabilities.gmailDrafts || !!busy}>Also allow explicitly requested Gmail draft creation. Every recipient and approved attachment requires my confirmation; nothing is sent.</Consent><button className="jl-button" type="button" disabled={!!busy || !snapshot.capabilities.gmailRead || !gmailReadConsent} onClick={() => void connectGmail()}><Mail size={15} aria-hidden="true" />Connect Gmail</button></>}</section>
        </details></>}
      </>}
      {snapshot && <div className="jl-tab-panel" hidden={tab !== 'record'}>
        {'cvVariants' in snapshot.capabilities && snapshot.capabilities.cvVariants === true && <LoopCvVariants snapshot={snapshot} owner={user.id} authority={trackingAuthority} ready={!authLoading && !authError} busy={!!busy} hidden={tab !== 'record'} captureGuard={() => {
          const atOwner = owner.current, atAuthority = trackingDraftAuthority(user.id), atGeneration = generation.current, atLifecycle = lifecycleGeneration.current;
          return () => mounted.current && importAuthReady.current && owner.current === atOwner && trackingDraftAuthority(user.id) === atAuthority && generation.current === atGeneration && lifecycleGeneration.current === atLifecycle;
        }} />}
        {'cvVariants' in snapshot.capabilities && snapshot.capabilities.cvVariants === true && <LoopVariantPreparation key={`variant:${user.id}:${trackingAuthority}:${snapshot.lifecycleGeneration}`} perform={perform} snapshot={snapshot} owner={user.id} authority={trackingAuthority} busy={!!busy} hidden={tab !== 'record'} captureGuard={() => {
          const atOwner = owner.current, atAuthority = trackingDraftAuthority(user.id), atGeneration = generation.current, atLifecycle = lifecycleGeneration.current;
          return () => mounted.current && importAuthReady.current && owner.current === atOwner && trackingDraftAuthority(user.id) === atAuthority && generation.current === atGeneration && lifecycleGeneration.current === atLifecycle;
        }} />}
        {savedImportScope && <LoopSavedCheckImport key={`saved-check:${savedImportScope.ownerId}:${savedImportScope.authority}:${savedImportScope.generation}`} scope={savedImportScope} intentId={importIntentId} busy={!!busy} blockedReason={savedCheckBlocked} draftKey={savedCheckDraftKey} needsReplacement={savedCheckNeedsReplacement} copyHeader={savedCheckCopyHeader} isCurrent={savedCheckScopeCurrent} onUse={useSavedCheck} onClose={() => setSavedCheckIntent(null)} />}
        {savedCheckUndo && savedCheckScopeCurrent(savedCheckUndo.scope) && savedCheckUndo.recordVersion === snapshot.recordVersion && <section className="jl-panel" aria-label="Restore the draft before saved-check import"><h2>Restore your previous draft</h2><p>The previous CV and vacancy draft are kept only on this page, until you save, leave or saved records change. Restoring replaces edits made since the copy; sharing confirmations stay cleared.</p><details><summary>Review the draft to restore</summary><p>{savedCheckUndo.before.opportunity.title || 'No vacancy title'} · {savedCheckUndo.before.opportunity.company || 'No company'}</p><pre>{savedCheckUndo.before.profile.sourceText}</pre><pre>{savedCheckUndo.before.opportunity.description}</pre></details><Consent checked={restoreImportConfirmed} onChange={setRestoreImportConfirmed} disabled={!!busy || !!savedCheckBlocked}>Replace my current local CV and vacancy fields with the previous draft.</Consent><button type="button" className="jl-button" disabled={!!busy || !!savedCheckBlocked || !restoreImportConfirmed} onClick={undoSavedCheckImport}>Undo saved-check import</button>{savedCheckBlocked && <p className="jl-help">{savedCheckBlocked}</p>}</section>}
        <LoopCvBuilder key={`builder:${user.id}:${trackingAuthority}:${snapshot.lifecycleGeneration}`} answers={builderAnswers} onChange={answers => { formRevision.current++; setBuilderAnswers(answers); }} source={profile.sourceText} disabled={!!busy || authLoading || !!authError || trackingAuthority < 0} onUse={text => {
          if (!mounted.current || !importAuthReady.current || trackingAuthority < 0 || owner.current !== user.id || trackingDraftAuthority(user.id) !== trackingAuthority || formRevision.current !== preparationRevision || snapshotRef.current?.lifecycleGeneration !== snapshot.lifecycleGeneration || busyRef.current) return false;
          editProfile({ sourceText: text }); setBuilderAnswers(blankLoopCvAnswers()); return true;
        }} />
        <section className="jl-panel jl-source-setup"><p className="jl-eyebrow">SET UP ONCE · REUSE FOR EACH VACANCY</p><h2>{snapshot.profile ? 'Your career record is saved.' : 'Start with the CV you already have.'}</h2><p>{snapshot.profile ? `Saved revision ${snapshot.profile.revision}. Your source text, target roles and confirmed facts can be reused for the next application.` : 'Upload a CV or use the guided builder above. Check the text, save your details and confirm the experience you want reused.'}</p>
          <div className="jl-record-context"><p><strong>{loopAudienceContent[profile.audience].label}</strong> · {loopAudienceContent[profile.audience].recordHint}</p><Link className="jl-text-link" to="/help#job-loop-start">Help with the first step <ArrowRight size={14} aria-hidden="true" /></Link></div>
          <form onSubmit={event => void saveProfile(event)} className="jl-profile-form"><fieldset className="jl-form-fields" disabled={!!busy}>
          <details className="jl-setup-step" open={!snapshot.profile && !detailsReady}><summary>{snapshot.profile ? 'Review or replace your source CV' : '1. Import or paste your CV'}</summary><div className="jl-profile-form">
            <div className="jl-file-input--primary"><label className="jl-file-input">Read a local CV on this device<input type="file" accept=".pdf,.docx,.txt" disabled={!!busy} aria-describedby="jl-file-help" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readFile(file); }} /></label><p className="jl-help" id="jl-file-help">Text-based PDF, Word (.docx) or TXT, up to 5 MB. The original file stays on your device.</p></div>
            {cvs.length > 0 && <Select label="Use an owned saved CV (optional)" value="" onChange={value => { const found = cvs.find(cv => cv.id === value); if (found) importSource(found.text_content); }} disabled={!!busy}><option value="">Choose a saved CV to copy its text</option>{cvs.map(cv => <option key={cv.id} value={cv.id}>{cv.original_filename}</option>)}</Select>}{cvError && <p className="jl-help">{cvError}</p>}
            <Field label="Reviewed source CV or career record" multiline value={profile.sourceText} onChange={sourceText => editProfile({ sourceText })} maxLength={60000} help="Or paste your text here. Review extracted wording, dates and confidential details before saving. 80–60,000 characters." disabled={!!busy} />
            <div className="jl-actions"><button className="jl-button jl-button--primary" type="button" disabled={!!busy || !profile.sourceText.trim()} onClick={reviewSource}>Continue with this text <ArrowRight size={15} aria-hidden="true" /></button><button className="jl-text-link" type="button" onClick={() => { const builder = document.querySelector<HTMLDetailsElement>('.jl-cv-builder'); if (builder) { builder.open = true; builder.querySelector<HTMLElement>('summary')?.focus(); builder.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); } }}>No CV yet? Build one here</button></div>
          </div></details>
          <details className="jl-setup-step" ref={detailsRef} open={!!snapshot.profile || detailsReady}><summary>{snapshot.profile ? 'Review your name, target roles and locations' : '2. Check three details and save privately'}</summary><div className="jl-profile-form">
            <Field label="My name" value={profile.name} onChange={name => editProfile({ name })} maxLength={120} help="If copied from your CV, check it. Add your name here if it could not be identified clearly." />
            <div className="jl-form-grid"><Field label="Target roles" multiline value={lists.targets} onChange={value => { setLists(current => ({ ...current, targets: value })); editProfile({ targetTitles: split(value) }); }} help="Needed to focus preparation. One role per line; choose your own level." /><Field label="Locations" multiline value={lists.locations} onChange={value => { setLists(current => ({ ...current, locations: value })); editProfile({ locations: split(value) }); }} help="Needed to focus vacancies. Add places where you would work, or Remote." /></div>
            <details><summary>Need a starting role title?</summary><div className="jl-role-suggestions">{loopAudienceContent[profile.audience].suggestedRoles.map(role => <button type="button" key={role} disabled={!!busy} onClick={() => { const titles = [...new Set([...profile.targetTitles, role])]; setLists(current => ({ ...current, targets: titles.join('\n') })); editProfile({ targetTitles: titles }); }}>+ {role}</button>)}</div><p>Examples to edit, not a claim that you have the required qualifications.</p></details>
            <details className="jl-advanced-preferences"><summary>Optional preferences and privacy boundaries</summary><div className="jl-profile-form"><Select label="My situation" value={profile.audience} onChange={value => editProfile({ audience: value as LoopProfileInput['audience'] })}><option value="student">Student</option><option value="mba">MBA student or alumni</option><option value="professional">Working professional</option></Select><Field label="Contact line for my CV (optional)" value={profile.contactLine} onChange={contactLine => editProfile({ contactLine })} help="Check any contact details copied from the CV. Keep only details you permit in external documents." /><div className="jl-form-grid"><Field label="Explicit experience years (optional)" type="number" value={profile.experienceYears === null ? '' : String(profile.experienceYears)} onChange={value => editProfile({ experienceYears: value === '' ? null : Number(value) })} help="Leave empty when not established. Dates are not summed and years are never inferred." /><Select label="CV page preference" value={String(profile.pageTarget)} onChange={value => editProfile({ pageTarget: Number(value) as 1 | 2 })}><option value="1">One page</option><option value="2">Two pages</option></Select></div><Field label="Languages I actually use (optional)" value={lists.languages} onChange={value => { setLists(current => ({ ...current, languages: value })); editProfile({ languages: split(value) }); }} /><Consent checked={profile.discreetSearch} onChange={discreetSearch => editProfile({ discreetSearch })}>Keep my search discreet. Review current-employer details and contacts before external use.</Consent><Field label="Terms or facts I must not claim (optional)" multiline value={lists.excluded} onChange={value => { setLists(current => ({ ...current, excluded: value })); editProfile({ excludedTerms: split(value) }); }} help="One per line. Redact confidential material from your source text as well." /><details><summary>Optional compensation preferences</summary><div className="jl-form-grid"><Field label="Currency" value={profile.compensation.currency} onChange={currency => editProfile({ compensation: { ...profile.compensation, currency } })} /><Select label="Compensation period" value={profile.compensation.period} onChange={period => editProfile({ compensation: { ...profile.compensation, period: period as LoopProfileInput['compensation']['period'] } })}><option value="annual">Annual</option><option value="monthly">Monthly</option><option value="hourly">Hourly</option></Select></div><Field label="Minimum compensation (optional)" type="number" value={profile.compensation.minimum === null ? '' : String(profile.compensation.minimum)} onChange={value => editProfile({ compensation: { ...profile.compensation, minimum: value === '' ? null : Number(value) } })} help="Leave unknown pay unknown. A role title does not establish salary." /></details></div></details>
            <Consent checked={saveConsent} onChange={setSaveConsent} disabled={!!busy}>Save this reviewed text and profile privately in my Jobvance account. This does not authorize external AI processing or inbox access.</Consent><div className="jl-actions"><button className="jl-button jl-button--primary" type="submit" disabled={!!busy || !saveConsent}>Save career record</button><button className="jl-button" type="button" disabled={!!busy} onClick={() => { setProfile(snapshot.profile ? { ...snapshot.profile } : blankProfile(initialAudience.current)); setLists(listInputs(snapshot.profile ?? blankProfile(initialAudience.current))); setProfileDirty(false); profileDirtyRef.current = false; setSaveConsent(false); setDetailsReady(!!snapshot.profile); }}>Discard profile edits</button></div>
          </div></details></fieldset></form></section>
        <section className="jl-panel" id="jl-facts" tabIndex={-1}><div className="jl-row-heading"><div><p className="jl-eyebrow">REVIEW ONCE · REUSE YOUR CONFIRMED FACTS</p><h2>Your claim library</h2><p>Keep facts you can substantiate. Confirm category and sharing permission; the passage and context are already copied.</p></div><button className="jl-button" type="button" disabled={!!busy || !snapshot.profile || profileDirty || dirtyClaims.size > 0} onClick={() => void requestSuggestions()}>Suggest literal passages</button></div>
          {!snapshot.profile && <p>Save your reviewed CV first. Literal passages will be offered for review after your first save.</p>}
          {suggestions.length > 0 && <p className="jl-help">{suggestions.length} {suggestions.length === 1 ? 'passage' : 'passages'} left to review. Start with useful, shareable facts; skip headings or passages you do not need.</p>}
          {suggestions.slice(0, 1).map(item => <ClaimEditor key={item.key} guided restoredDraft={claimDrafts[item.key]} onDraft={draft => retainClaimDraft(item.key, draft)} initial={item.value} busy={!!busy || profileDirty} onDirty={dirty => markDirty(item.key, dirty)} onSave={value => saveClaim(value, item.key)} onSkip={() => skipSuggestion(item.key)} />)}
          {snapshot.profile && snapshot.claims.filter(claim => claim.status === 'active' && claim.confirmed && claim.shareable).length > 0 && <div className="jl-record-context"><p><strong>{snapshot.claims.filter(claim => claim.status === 'active' && claim.confirmed && claim.shareable).length} {snapshot.claims.filter(claim => claim.status === 'active' && claim.confirmed && claim.shareable).length === 1 ? 'fact' : 'facts'} ready for reuse.</strong> Unchanged facts do not need to be entered again for the next vacancy.</p><button type="button" className="jl-text-link" onClick={() => setTab('opportunities')}>Add the vacancy you want to prepare for <ArrowRight size={14} aria-hidden="true" /></button></div>}
          {snapshot.claims.map(claim => <details key={`${claim.id}-${claim.revision}`} className="jl-claim-details"><summary>{claim.phrasing.slice(0, 100)} <span className="jl-tag">{claim.status === 'withdrawn' ? 'withdrawn' : claim.confirmed && claim.shareable ? 'confirmed by you · shareable' : 'not cleared for output'}</span></summary><ClaimEditor restoredDraft={claimDrafts[claim.id]} onDraft={draft => retainClaimDraft(claim.id, draft)} initial={claim} saved={claim} busy={!!busy} onDirty={dirty => markDirty(claim.id, dirty)} onSave={value => saveClaim(value, claim.id, claim.id)} onWithdraw={() => void perform({ action: 'withdraw_claim', expectedVersion: snapshot.recordVersion, id: claim.id }, 'Claim withdrawn. Affected approvals must be rebuilt.').then(result => { if (result) markDirty(claim.id, false); })} /></details>)}<details className="jl-claim-details"><summary>Add my own specific example</summary><ClaimEditor key={newClaimKey} restoredDraft={claimDrafts.new} onDraft={draft => retainClaimDraft('new', draft)} initial={blankClaim()} busy={!!busy} onDirty={dirty => markDirty('new', dirty)} onSave={value => saveClaim(value, 'new')} /></details></section>
      </div>}
      {snapshot && <div className="jl-tab-panel" hidden={tab !== 'opportunities'}>
        <Link className="jl-text-link" to="/help#job-loop-vacancies">Help adding a real vacancy <ArrowRight size={14} aria-hidden="true" /></Link>
        <section className="jl-panel"><h2>Add an opportunity</h2><p>Paste the actual vacancy. A user-provided link is not independently verified as open. No guessed contact details.</p><form className="jl-profile-form" onChangeCapture={event => { opportunityDraftRevision.current++; if (!(event.target as HTMLElement).closest('[data-link-consent]')) setLinkConsent(false); }} onSubmit={event => void addOpportunity(event)}><fieldset className="jl-form-fields" disabled={!!busy}><div className="jl-form-grid"><Field label="Vacancy title" value={title} onChange={setTitle} /><Field label="Company" value={company} onChange={setCompany} /></div><Field label="Location" value={location} onChange={setLocation} /><Field label="Vacancy HTTPS link" type="url" value={jobUrl} onChange={setJobUrl} maxLength={2000} /><Field label="Full vacancy description" multiline value={description} onChange={setDescription} maxLength={20000} help="Paste at least 80 characters from the actual posting." /><Consent checked={withContact} onChange={setWithContact}>Add a named contact I have checked (optional).</Consent>{withContact && <div className="jl-contact-fields"><Field label="Contact name" value={contact.name} onChange={name => setContact(current => ({ ...current, name, confirmedByUser: false }))} /><Field label="Contact title" value={contact.title} onChange={title => setContact(current => ({ ...current, title, confirmedByUser: false }))} /><Field label="Contact email (optional, never guessed)" type="email" value={contact.email} onChange={email => setContact(current => ({ ...current, email, confirmedByUser: false }))} /><Field label="Public contact source HTTPS link" type="url" value={contact.sourceUrl} onChange={sourceUrl => setContact(current => ({ ...current, sourceUrl, confirmedByUser: false }))} maxLength={2000} /><Field label="Source passage supporting this contact" multiline value={contact.sourceQuote} onChange={sourceQuote => setContact(current => ({ ...current, sourceQuote, confirmedByUser: false }))} maxLength={60000} /><Consent checked={contact.confirmedByUser} onChange={confirmedByUser => setContact(current => ({ ...current, confirmedByUser }))}>I checked the name, role and supplied email against this source. Email syntax alone does not verify identity.</Consent><Consent checked={contact.inExistingThread} onChange={inExistingThread => setContact(current => ({ ...current, inExistingThread }))}>I already have an existing thread with this person; do not treat them as a cold contact.</Consent></div>}{pendingCheckLink && <section aria-label="Saved-check vacancy link">
          <p>This vacancy came from <strong>{pendingCheckLink.vacancy.title} · {pendingCheckLink.vacancy.company || 'Company not supplied'}</strong>. Saving it here can keep it together with that exact saved check in Applications.</p>
          {existingCheckLink && <p role="status">Already linked: {existingCheckLink.title} · {display(existingCheckLink.status)}. Saving again keeps its current wording, notes and progress; it does not replace them. <Link to={`/loop?opportunity=${encodeURIComponent(existingCheckLink.id)}&generation=${pendingCheckLink.generation}`}>Open linked vacancy and progress</Link></p>}
          {existingCheckLinks.length > 0 && !existingCheckLink && <p role="alert">The saved relationship is inconsistent. Refresh records before continuing; these records will not be merged.</p>}
          {!checkVacancyMatches && <><p role="alert">The title, company or description differs from the saved check. Restore its vacancy wording to keep the link, or keep your edits as a separate vacancy.</p><div className="jl-actions"><button type="button" className="jl-button" onClick={() => { if (!savedCheckScopeCurrent(pendingCheckLink)) return; opportunityDraftRevision.current++; setTitle(pendingCheckLink.vacancy.title); setCompany(pendingCheckLink.vacancy.company); setDescription(pendingCheckLink.vacancy.description); setLinkConsent(false); }}>Restore saved vacancy wording</button><button type="button" className="jl-button" onClick={() => { if (!savedCheckScopeCurrent(pendingCheckLink)) return; opportunityDraftRevision.current++; setPendingCheckLink(null); setLinkConsent(false); setNotice('Your edited vacancy is now a separate local draft. Save it when ready; the saved check is unchanged.'); }}>Keep edits as a separate vacancy</button></div></>}
          {checkVacancyMatches && <div data-link-consent><Consent checked={linkConsent} onChange={value => { linkConsentRevision.current = value ? opportunityDraftRevision.current : null; setLinkConsent(value); }}>Save this vacancy privately and link it to this saved check. Keep existing linked progress if it was already saved.</Consent></div>}
          <p className="jl-help">This saves the vacancy relationship only. Your CV, fact review, model consent and output approval remain separate.</p>
        </section>}<button type="submit" className="jl-button jl-button--primary" disabled={!!busy || !!pendingCheckLink && (!linkConsent || !checkVacancyMatches || !savedCheckScopeCurrent(pendingCheckLink) || existingCheckLinks.length > 0 && !existingCheckLink)}>{pendingCheckLink ? 'Save linked vacancy' : 'Save opportunity'}</button></fieldset></form></section>
        <section className="jl-panel"><h2>Your opportunities</h2>{snapshot.opportunities.length === 0 ? <p>No opportunities are recorded yet. Add a real vacancy or inspect a configured search run’s actual results.</p> : visibleOpportunities.map(item => <div key={trackingDraftIdentity(trackingDraftScope('loop', user.id, item.id, snapshot.lifecycleGeneration))}><button type="button" className="jl-button" disabled={!!busy} onClick={() => { setPreparationChoice(previous => ({ id: item.id, sequence: (previous?.sequence ?? 0) + 1, owner: user.id, authority: trackingAuthority, generation: snapshot.lifecycleGeneration })); setTab('today'); window.requestAnimationFrame(() => { const heading = document.getElementById('jl-selected-prepare-heading'); heading?.focus({ preventScroll: true }); heading?.scrollIntoView?.({ block: 'start', behavior: 'instant' }); }); }}>Choose {item.title} for preparation</button><OpportunityRow profile={snapshot.profile} scope={trackingDraftScope('loop', user.id, item.id, snapshot.lifecycleGeneration)} opportunity={item} busy={!!busy} onSave={async (status, followUpAt, notes) => !!await perform({ action: 'update_opportunity', expectedVersion: snapshot.recordVersion, id: item.id, status, followUpAt, notes }, 'Tracking update saved as your report. No employer action was taken.')} /></div>)}</section>
      </div>}
      {snapshot && tab === 'outputs' && <>
        <Link className="jl-text-link" to="/help#job-loop-review">Help reviewing and approving a document <ArrowRight size={14} aria-hidden="true" /></Link>
        <section className="jl-panel"><h2>Prepared outputs</h2><p>Read the exact sources, gaps and document attempt. Held, revoked or stale packets are not approved downloads.</p>{snapshot.packets.length === 0 ? <p>No packets have been built yet. A failed or unfinished run is not an empty successful shortlist.</p> : <div className="jl-output-list">{visiblePackets.map(item => <button key={item.id} type="button" className="jl-output-choice" aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}><span><strong>{item.title}</strong><small>{item.company}</small></span><span className="jl-tag">{display(item.status)}</span></button>)}</div>}</section>
        {packet && <section className="jl-panel" aria-label="Selected output review"><div className="jl-row-heading"><div><p className="jl-eyebrow">REVIEW BEFORE APPROVAL</p><h2>{packet.title}</h2><p>{packet.company}</p></div><span className="jl-tag">{display(packet.status)}</span></div><p className="jl-help">Career record revision {packet.profileRevision} · Actual rendered pages: {packet.pageCount ?? 'not established'} · {packet.model.provider === 'rules' ? 'Source-based composition' : providerNames[packet.model.provider]} · {packet.model.method}</p>{!pagesReady && <p className="jl-warning">The rendered page count or document checks are not cleared for your page preference. Resolve the hold and rebuild before approval or download.</p>}{(!packetFresh || uncommitted) && <p className="jl-warning">This output does not match the current cleared record, or record edits remain unsaved. Save corrections and build a new packet before approval or download.</p>}{packet.holdReasons.map((reason, index) => <p className="jl-warning" key={index}>{explanation(reason)}</p>)}<LoopPacketPreview key={`${user.id}:${packet.id}:${packet.inputHash}`} ownerId={user.id} packet={packet} current={packetFresh && !uncommitted} busy={!!busy} />{packet.formatStatus && Object.entries(packet.formatStatus).filter(([,state]) => !state.ready).map(([format,state]) => <p className="jl-warning" key={format}>{format.toUpperCase()}: {state.reason ? explanation(state.reason) : "This format needs a document repair."} Other ready formats remain available after your review.</p>)}<details open><summary>Source references and evidence</summary><pre>{packet.evidenceText}</pre><ul>{Object.entries(packet.claimVersions).map(([id, revision]) => { const claim = snapshot.claims.find(item => item.id === id); return <li key={id}>{claim ? `${display(claim.kind)} · ${claim.context} · revision ${revision}: ${claim.sourceQuote}` : `Source claim ${id} is no longer available in this record.`}</li>; })}</ul></details><details><summary>Relevance and unresolved questions</summary><p>{packet.assessment.method}. This is a relevance heuristic, not an employer ATS or eligibility result.</p><ul>{[...packet.assessment.gaps, ...packet.assessment.flags].map((gap, index) => <li key={index}>{explanation(gap)}</li>)}</ul></details><Field label="CV text for factual review" multiline value={reviewedText} onChange={value => { setReviewedText(value); setFacts(false); setDisclosure(false); setRecipientConsent(false); }} maxLength={60000} readOnly help="Factual edits need to be saved and confirmed in your career record first, then rebuilt. This review does not override source controls." disabled={!!busy} /><button type="button" className="jl-text-link" onClick={() => setTab('record')}>Edit career facts, then rebuild <ArrowRight size={14} aria-hidden="true" /></button>{edited && <div className="jl-warning"><p>This review text differs from the source-grounded packet. Update the corresponding record or claim and rebuild before approval.</p><div className="jl-actions"><button type="button" className="jl-button" onClick={() => setTab('record')}>Edit career record</button><button type="button" className="jl-button" onClick={() => { setReviewedText(packet.cvText); setFacts(false); setDisclosure(false); }}>Restore packet wording</button></div></div>}<Consent checked={facts} onChange={setFacts} disabled={!!busy || !packetFresh || edited}>I reviewed the complete CV and evidence. My personal contribution, context and result status are accurate.</Consent><Consent checked={disclosure} onChange={setDisclosure} disabled={!!busy || !packetFresh || edited}>The final document and its figures are safe and permitted for external use.</Consent><button type="button" className="jl-button jl-button--primary" disabled={!!busy || !packetFresh || !pagesReady || edited || uncommitted || !facts || !disclosure || ['held', 'revoked', 'approved'].includes(packet.status)} onClick={() => void perform({ action: 'approve_packet', packetId: packet.id, inputHash: packet.inputHash, reviewedText, confirmFacts: facts, confirmDisclosure: disclosure }, 'Approval recorded for this exact packet.')}><Check size={16} aria-hidden="true" />{packet.status === 'approved' ? 'Approved by you' : 'Approve exact packet'}</button><div className="jl-actions jl-downloads">{(['pdf', 'docx', 'txt', 'report'] as const).map(format => <button key={format} type="button" className="jl-button" disabled={!!busy || !packetApproved || (["pdf","docx","txt"].includes(format) && packet.formatStatus?.[format as "pdf" | "docx" | "txt"]?.ready === false)} onClick={() => void download(format)}><Download size={14} aria-hidden="true" />Download {format === 'report' ? 'evidence report' : format.toUpperCase()}</button>)}</div>
          <details><summary>Cover letter and message drafts (unsent)</summary>{packet.coverLetterText && <><h3>Cover letter</h3><pre>{packet.coverLetterText}</pre><button type="button" className="jl-button" disabled={!!busy || !packetApproved} onClick={() => void download('letter')}>Download reviewed letter</button></>}<h3>Connection note</h3><pre>{packet.connectionNote || 'No connection note: contact or supporting facts are missing.'}</pre><h3>Recruiter message</h3><pre>{packet.messageText || 'No recruiter message: contact or supporting facts are missing.'}</pre><h3>Email draft</h3><pre>{packet.emailSubject}{'\n\n'}{packet.emailBody || 'No email draft is ready.'}</pre></details><section className="jl-interview-brief" aria-labelledby="jl-interview-title"><p className="jl-eyebrow">LIGHT INTERVIEW PREPARATION</p><h3 id="jl-interview-title">Prepare with your actual evidence.</h3><p>Use these prompts to explain your contribution, context and results. They are preparation notes, not employer questions or verified outcomes.</p>{packet.interviewBrief?.length ? <ol>{packet.interviewBrief.map((point, index) => <li key={index}><h4>{point.title}</h4><p>{point.prompt}</p><blockquote>{point.sourceQuote}</blockquote><small className="jl-help">Source claims: {point.evidenceClaimIds.map(id => { const source = snapshot.claims.find(claim => claim.id === id); return source ? source.context + ' · packet revision ' + (packet.claimVersions[id] ?? 'not recorded') : 'Source no longer available'; }).join('; ')}</small></li>)}</ol> : <><p>No interview brief has been supplied for this packet. Start with the source-backed questions below.</p><ul>{packet.assessment.gaps.slice(0,5).map((gap,index) => <li key={index}>{explanation(gap)}</li>)}</ul></>}</section><div className="jl-gmail-draft"><h3>Create a Gmail draft only</h3><p>{packet.contact ? `${packet.contact.name} · ${packet.contact.email || 'No confirmed email'}` : 'No named contact. Complete contact research before outreach.'}</p>{packet.contact?.inExistingThread && <p className="jl-warning">An existing thread is recorded. Do not create duplicate cold outreach.</p>}<p className="jl-help">The attachment is this exact approved CV packet. Read the email draft above first. Gmail draft creation is separate from sending.</p><Consent checked={recipientConsent} onChange={setRecipientConsent} disabled={!!busy || !packetApproved}>I checked the recipient, reviewed the message and confirm this exact approved CV attachment for a Gmail draft.</Consent><button type="button" className="jl-button" disabled={!!busy || !packetApproved || !recipientConsent || !snapshot.gmail.connected || !snapshot.capabilities.gmailDrafts || !snapshot.gmail.allowDrafts || !packet.contact?.confirmedByUser || !packet.contact.email || packet.contact.inExistingThread || !packet.emailBody} onClick={() => void createGmailDraft()}><Mail size={15} aria-hidden="true" />Create Gmail draft</button>{(!snapshot.gmail.connected || !snapshot.capabilities.gmailDrafts || !snapshot.gmail.allowDrafts) && <p className="jl-help">Gmail draft access is not connected, configured or granted. To change access, disconnect and reconnect with your chosen permissions. No message is sent.</p>}</div>
        </section>}
      </>}
      {snapshot && tab === 'settings' && <>
        <LoopSubscriptionBilling key={`billing:${user.id}:${trackingAuthority}:${snapshot.lifecycleGeneration}`} compact />
        <LoopSupportForm key={`${user.id}:${snapshot.lifecycleGeneration}`} snapshot={snapshot} busy={!!busy} perform={perform} />
      </>}
      {((snapshot && tab === 'settings') || erasurePending) && <LoopErasure key={`${user.id}:${confirmationGeneration.current ?? erasureGeneration.current}`} busy={!!busy} continuing={erasurePending} perform={perform} onErased={() => { clearLoopWorkingDraft(); setClaimDrafts({}); setSuggestions([]); setDirtyClaims(new Set()); setNewClaimKey(current => current + 1); setSelectedId(null); setTitle(''); setCompany(''); setLocation(''); setJobUrl(''); setDescription(''); setWithContact(false); setFacts(false); setDisclosure(false); setRecipientConsent(false); setModelConsent(false); setInboxConsent(false); setTab('today'); }} />}
      </div></div>}
    <p className="jl-page-footnote"><ShieldCheck size={14} aria-hidden="true" />No automated sends or applications. Claims remain user-attested. <Link to="/privacy">Privacy</Link> · <Link to="/dashboard?tab=cv">Saved CV documents</Link></p>
  </main>;
}
