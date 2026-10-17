import ProductNavigation from '@/components/ProductNavigation';
import { registerTrackingDraftOwner, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import { readApplicationSource } from '@/lib/application-source-selection';
import { savedCheckContinuationPath } from '@/lib/saved-check-continuation';
import CvCheckExplainer from '@/components/CvCheckExplainer';
import RequirementCoverage from '@/components/RequirementCoverage';
import { sourceLines } from '../../supabase/functions/_shared/cv-tailor';
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileText, Loader2, LockKeyhole, ShieldCheck, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Auth from "@/pages/Auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { extractCvText, validateCvText } from "@/lib/cv-extraction";
import { analyzeCvEvidence, prioritizeCvForVacancy, type EvidenceReport, type EvidenceRequirement, type EvidenceStatus } from "@/lib/cv-evidence";
import { checkReviewKey, clearRetainedCheck, retainCheckForGoogle, readRetainedCheck, validateCheckDraft, validateCheckField, CheckDraftValidationError, readCheckRecovery, rememberCheckRecovery, clearCheckRecovery, draftForAnotherVacancy, keepReviewedEditsInSource, checkSourceLines, removeSelectedSourceLines, checkAudience, type CheckAudience, type CheckDraft, type CheckDraftField, type CheckReuseSource, type CheckSaveReference } from "@/lib/check-draft";
import { deleteFreeCheck, listFreeChecks, saveFreeCheck, type FreeCvCheck } from "@/lib/free-check-api";
import { createFreeCheckCvBlob, createFreeCheckReportText } from "@/lib/free-check-export";
import { downloadBlob, safeDocumentFilename } from "@/lib/document-download";
import { trackFreeCheck } from "@/lib/free-check-tracking";
import { createReviewedPdfPreview, type DocumentFormat } from "@/lib/document-export";
import { companyFromVacancy, requestTailoredCv, roleFromVacancy, TailorUnavailable, type TailorChange } from "@/lib/cv-tailor-api";
import { staticPageMeta } from "@/lib/public-site-meta";
import "./CvCheck.css";

function ContinueSavedCheck({ record, ownerId }: { record: FreeCvCheck; ownerId: string }) {
  const path = record.user_id === ownerId && record.status === 'approved' ? savedCheckContinuationPath(record.id) : null;
  return path ? <Link className="text-sm underline underline-offset-4" to={path}>Continue this saved check in Job Loop</Link> : null;
}

const emptyDraft: CheckDraft = { jobTitle: "", company: "", sourceText: "", reviewedText: "", jobDescription: "" };
const stepNames = ["Add your CV and the job", "Your CV", "The job", "What the job asks for", "Review changes", "Download"];
const audienceGuidance = {
  student: { label: "University student", example: "e.g. Graduate analyst", text: "Projects, coursework, internships and volunteering count as source material. Keep them labelled as what they are; no employment history is required to check a CV." },
  mba: { label: "MBA student", example: "e.g. Associate consultant", text: "Bring previous work and MBA projects. Keep classroom projects distinct from client or employer work, and explain your own contribution." },
  professional: { label: "Busy professional", example: "e.g. Transformation manager", text: "Start with the career record you already have. Reuse your experience for your next role, show transferable work without changing your responsibilities, and remove confidential information." },
};
const statusLabels: Record<EvidenceStatus, string> = {
  direct: "Direct wording found", partial: "Related passage — review needed", missing: "No passage found", review: "Needs manual review",
};
const statusStyles: Record<EvidenceStatus, string> = {
  direct: "border-emerald-200 bg-emerald-50 text-emerald-950", partial: "border-amber-200 bg-amber-50 text-amber-950",
  missing: "border-slate-200 bg-slate-50 text-slate-800", review: "border-blue-200 bg-blue-50 text-blue-950",
};
type ApprovedCheck = { draft: CheckDraft; report: EvidenceReport; key: string; requestId: string };
type Tailoring = { changes: (TailorChange & { reverted?: boolean })[]; questions: string[]; rejectedCount: number; ownerId: string | null; facts: string[]; factSources: number[]; sourceText: string; jobDescription: string; jobTitle: string; company: string; withdrawnFacts?: number[] };
type TailorUndo = { text: string; ownerId: string | null; tailoring?: Tailoring | null };
type Answer = { text: string; confirmed: boolean; sourceLine?: number };
const MAX_ANSWERS = 5;
// Allowance limits that a one-time pass can lift (or that explain the passes on offer).
const PASS_OFFER_CODES = new Set(['TAILOR_FREE_LIMIT', 'TAILOR_GUEST_LIMIT', 'TAILOR_PASS_DAILY_LIMIT']);
type SourceUndo = { text: string; reviewedText?: string; ownerId: string | null };
type ApplicationUndo = { draft: CheckDraft; filename: string; pageTarget: 1 | 2; ownerId: string | null; sourceUndo: SourceUndo | null; reuseMode: boolean; saveReference: CheckSaveReference | null };
type SourceReplacementUndo = { draft: CheckDraft; filename: string; pageTarget: 1 | 2; ownerId: string | null; step: number; cvReady: boolean; reviewStarted: boolean; report: EvidenceReport | null; reuseMode: boolean; reuseInspect: boolean; sourceUndo: SourceUndo | null; applicationUndo: ApplicationUndo | null; saveReference: CheckSaveReference | null };
type CheckInputField = CheckDraftField | 'file';
const fieldIds: Record<CheckInputField, string> = { jobTitle: 'check-role', company: 'check-company', sourceText: 'check-source', reviewedText: 'check-reviewed', jobDescription: 'check-vacancy', file: 'check-file' };
const fieldSteps: Record<CheckInputField, number> = { jobTitle: 1, company: 1, sourceText: 1, reviewedText: 5, jobDescription: 1, file: 1 };
const contextLabels: Record<string, string> = { academic_project: 'Project / academic evidence', internship: 'Internship evidence', personal_project: 'Personal project evidence', volunteering: 'Volunteering evidence', employment: 'Employment section' };
const checkMeta = staticPageMeta('/check')!;

function ReuseCvAction({ disabled, reviewedAvailable, onReuse }: { disabled: boolean; reviewedAvailable: boolean; onReuse: (choice: CheckReuseSource) => void }) {
  const id = useId(), [useOriginal, setUseOriginal] = useState(false);
  const choice: CheckReuseSource = reviewedAvailable && !useOriginal ? 'reviewed' : 'source';
  return <div className="check-reuse-action"><label htmlFor={`${id}-reuse`}>CV version for another vacancy</label><select id={`${id}-reuse`} value={choice} aria-describedby={`${id}-reuse-help`} disabled={disabled} onChange={event => setUseOriginal(event.target.value === 'source')}><option value="source">Reviewed source CV</option><option value="reviewed" disabled={!reviewedAvailable}>Approved final CV</option></select><Button type="button" variant="outline" disabled={disabled || (choice === 'reviewed' && !reviewedAvailable)} onClick={() => onReuse(choice)}>Use this CV for another vacancy <ArrowRight size={16} className="ml-2" /></Button><p id={`${id}-reuse-help`}>{choice === 'reviewed' ? 'Uses your approved final wording, including the edits and removals you reviewed.' : 'Uses the CV from the source step, before final edits. It may include details you removed later; review it before reusing.'}</p></div>;
}

function Finding({ item, originalText, onQuestion }: { item: EvidenceRequirement; originalText: string; onQuestion?: (question: string) => void }) {
  return <article className={`check-finding check-finding-${item.status}`} aria-label={`Vacancy finding: ${item.vacancyQuote}`}>
    <span className={`check-finding-status inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[item.status]}`}>{item.status === "direct" ? <CheckCircle2 size={13} /> : <FileText size={13} />}{statusLabels[item.status]}</span>
    <div className="check-quote-grid">
      <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In the vacancy</h4><blockquote className="mt-2 whitespace-pre-wrap break-words text-sm">{item.vacancyQuote}</blockquote></div>
      <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In your CV</h4>
        {item.evidence.length ? item.evidence.map(passage => <div key={`${passage.start}-${passage.end}`} className="check-cv-passage">
          <blockquote className="whitespace-pre-wrap break-words text-sm">{passage.cvQuote}</blockquote>
          <p className="mt-2 text-xs text-muted-foreground">Line {passage.line} · {originalText.includes(passage.cvQuote) ? "From your reviewed source CV" : "Added or edited by you during this check"}{contextLabels[passage.contextKind ?? ''] ? ` · ${contextLabels[passage.contextKind ?? '']}` : ''}</p>
        </div>) : <p className="mt-2 text-sm text-muted-foreground">{item.category === 'condition' || item.category === 'deadline' ? 'This is an employer condition or deadline. Review the original listing; it does not need a CV achievement.' : 'No clear example showed up in this CV. If you have one, you can add it during the review.'}</p>}
      </div>
    </div>
    <p className="mt-4 text-sm text-muted-foreground">{item.explanation}</p>
    {item.matchedTerms.length > 0 && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Words used in this comparison</summary><p className="mt-2">{item.matchedTerms.join(", ")}</p></details>}
    {item.status !== "direct" && <div className="mt-4 rounded-lg border border-dashed p-3">
      <p className="text-sm">{item.question}</p>
      {onQuestion && item.category !== 'condition' && item.category !== 'deadline' && <Button type="button" variant="link" className="mt-1 h-auto whitespace-normal px-0 text-left" onClick={() => onQuestion(item.question)}>Add a truthful example, if you have one</Button>}
    </div>}
  </article>;
}

function EvidenceResults({ report, originalText, onQuestion }: { report: EvidenceReport; originalText: string; onQuestion?: (question: string) => void }) {
  const [filter, setFilter] = useState<"all" | "review">("all");
  const items = filter === "all" ? report.requirements : report.requirements.filter(item => item.status !== "direct");
  return <div className="space-y-5">
    <div className="check-finding-counts" aria-label="Finding counts">
      {(["direct", "partial", "missing", "review"] as const).map(status => <div key={status} className={`rounded-xl border p-4 ${statusStyles[status]}`}><p className="text-2xl font-semibold">{report.summary[status]}</p><p className="mt-1 text-xs">{statusLabels[status]}</p></div>)}
    </div>
    <p className="text-sm leading-6 text-muted-foreground">Use these findings to review your CV. Matching wording does not confirm that you qualify or predict an interview.</p>
    <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">How this check works and what it may miss</summary>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground"><p>{report.scope}</p><p>Each finding puts a job requirement beside the words in your CV. The check compares phrases and some related English terms. It keeps supporting work separate from leading it, and a listed skill separate from an example of using it.</p><p>Check the full job description too. The check cannot verify qualifications or add up experience from your dates. Method: {report.methodVersion}.</p>
        {report.warnings.map((text, i) => <p key={`warning-${i}`}>{text}</p>)}
        {report.unparsedNotes.map((text, i) => <p key={`note-${i}`}>{text}</p>)}
        {report.omittedSections.length > 0 && <div><h3 className="font-medium text-foreground">The rest of the job description</h3>{report.omittedSections.map((section, i) => <blockquote key={i} className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted p-3">{section.vacancyQuote}</blockquote>)}</div>}
      </div>
    </details>
    <div className="flex flex-wrap gap-2" aria-label="Filter findings"><Button type="button" size="sm" aria-pressed={filter === "all"} variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All findings</Button><Button type="button" size="sm" aria-pressed={filter === "review"} variant={filter === "review" ? "default" : "outline"} onClick={() => setFilter("review")}>Focus on review questions</Button></div>
    {items.length ? items.map(item => <Finding key={item.id} item={item} originalText={originalText} onQuestion={onQuestion} />) : <p className="rounded-xl border p-5 text-sm">Nothing else in this view. Read the full job description before you approve your CV.</p>}
  </div>;
}

export default function CvCheck() {
  const { loading, authError } = useAuth();
  const [authResolved, setAuthResolved] = useState(!loading && !authError);
  useEffect(() => { if (!loading && !authError) setAuthResolved(true); }, [loading, authError]);
  // Unknown ownership during bootstrap is not a signed-out visitor. Do not read
  // or replace an owner-bound draft until the persisted session has resolved.
  return authResolved ? <CvCheckWorkspace /> : <CheckSessionPending failed={!!authError} />;
}

function CheckSessionPending({ failed = false }: { failed?: boolean }) {
  const { retryConnection } = useAuth();
  return <main className="cv-check-page"><Helmet><title>{checkMeta.title}</title><meta name="description" content={checkMeta.description} /><link rel="canonical" href="https://jobvance.io/check" /></Helmet><div className="check-intro"><div><h1>Check your CV against one vacancy.</h1><p className="check-intro-description">See the requirements beside your experience. Review the wording before you download.</p></div></div><p role="status">{failed ? 'Your sign-in could not be restored. Try again to open this check safely.' : 'Restoring your session and draft…'}</p>{failed && <Button type="button" variant="outline" onClick={retryConnection}>Retry sign-in recovery</Button>}<CvCheckExplainer /></main>;
}

function CvCheckWorkspace() {
  const [searchParams] = useSearchParams();
  const sourceRoute = useLocation();
  const exactSelection = readApplicationSource(sourceRoute.search, 'savedCheck');
  const hasExactSelection = searchParams.has('savedCheck');
  const reuseCheckId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchParams.get('reuseCheck') ?? '') ? searchParams.get('reuseCheck')!.toLowerCase() : null;
  const reuseHandled = useRef('');
  const [openedSelection, setOpenedSelection] = useState<string | null>(null);
  const [replaceSelection, setReplaceSelection] = useState<{ id: string; draft: CheckDraft; owner: string; route: string } | null>(null);
  const requestedAudience = checkAudience(searchParams.get("audience"));
  const { user, loading: authLoading, authError } = useAuth();
  if (!authLoading && !authError) registerTrackingDraftOwner(user?.id ?? null);
  const authAuthority = user ? trackingDraftAuthority(user.id) : -1;
  const authorityCurrent = () => !user || (authAuthority >= 0 && trackingDraftAuthority(user.id) === authAuthority);
  const previousAuthority = useRef(authAuthority);
  const [draftAuthority, setDraftAuthority] = useState(authAuthority);
  const [draftOwner, setDraftOwner] = useState(user?.id ?? null);
  const [recovery] = useState(() => readCheckRecovery(user?.id ?? null));
  const [audience, setAudience] = useState<CheckAudience | null>(() => requestedAudience ?? recovery?.value.audience ?? null);
  const guidance = audience ? audienceGuidance[audience] : null;
  const [restored] = useState(() => readRetainedCheck());
  const initialDraft = restored ?? recovery?.value.draft ?? emptyDraft;
  const [draft, setDraft] = useState<CheckDraft>(initialDraft);
  const [step, setStep] = useState(() => { const saved = restored ? 5 : recovery?.value.step ?? 1; return saved === 6 ? 6 : saved >= 4 && (restored || recovery?.value.reviewStarted) ? 5 : saved >= 5 ? 5 : 1; });
  const [reuseMode, setReuseMode] = useState(!!recovery?.value.reuseMode), [reuseInspect, setReuseInspect] = useState(false);
  const [report, setReport] = useState<EvidenceReport | null>(() => (initialDraft.reviewedText || recovery?.value.reviewStarted) && initialDraft.jobDescription ? analyzeCvEvidence(initialDraft.reviewedText, initialDraft.jobDescription, initialDraft.jobTitle) : null);
  const [reviewStarted, setReviewStarted] = useState(!!restored || (recovery?.value.reviewStarted ?? !!(initialDraft.reviewedText && initialDraft.jobDescription)));
  const [approved, setApproved] = useState<ApprovedCheck | null>(null);
  const [preparedFile, setPreparedFile] = useState<{ url: string; filename: string } | null>(null);
  const [checkedFacts, setCheckedFacts] = useState(false), [checkedPrivacy, setCheckedPrivacy] = useState(false);
  const [busy, setBusy] = useState(""), [error, updateError] = useState(""), [errorField, setErrorField] = useState<CheckInputField | null>(null), [notice, setNotice] = useState(restored || recovery ? "Your draft is back. Read it again before you approve a new download." : "");
  const [cvReady, setCvReady] = useState(!!restored || !!recovery?.value.cvReady), [filename, setFilename] = useState(recovery?.value.filename ?? "");
  const [recoveryConsent, setRecoveryConsent] = useState(!!recovery?.storageConsented);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; blob: Blob; key: string; pageCount: number } | null>(null), [pdfError, setPdfError] = useState('');
  const [pageTarget, setPageTarget] = useState<1 | 2>(recovery?.value.pageTarget ?? 2);
  const [omitParagraphs, setOmitParagraphs] = useState<number[]>([]), [beforeSelection, setBeforeSelection] = useState<string | null>(null);
  const [previousSource, setPreviousSource] = useState<SourceUndo | null>(null), [previousApplication, setPreviousApplication] = useState<ApplicationUndo | null>(null);
  const [previousReplacement, setPreviousReplacement] = useState<SourceReplacementUndo | null>(null);
  const sourceEditing = useRef(false);
  const [selectedSourceLines, setSelectedSourceLines] = useState<number[]>([]), [sourceRemovalPreview, setSourceRemovalPreview] = useState<{ before: CheckDraft; after: CheckDraft; ownerId: string | null } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const sourceLineId = useId();
  const [fact, setFact] = useState(""), [factPermitted, setFactPermitted] = useState(false), [question, setQuestion] = useState("");
  const [googleConsent, setGoogleConsent] = useState(false), [showAccount, setShowAccount] = useState(false);
  const [saveConsent, setSaveConsent] = useState(false), [saved, setSaved] = useState<FreeCvCheck | null>(null), [savedChecks, setSavedChecks] = useState<FreeCvCheck[]>([]), [savedError, setSavedError] = useState("");
  const [savedLoading, setSavedLoading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const trackingOperation = useRef<symbol | null>(null);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(''), [saveNotice, setSaveNotice] = useState('');
  const [saveReference, setSaveReference] = useState<CheckSaveReference | null>(recovery?.value.saveReference ?? null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null), [resetConfirm, setResetConfirm] = useState(false), [tracked, setTracked] = useState(false);
  const revision = useRef(0), owner = useRef(user?.id ?? null), previousOwner = useRef(user?.id ?? null), mounted = useRef(true);
  const progress = useRef<HTMLElement>(null), intro = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null), factField = useRef<HTMLTextAreaElement>(null);
  owner.current = user?.id ?? null;
  const currentKey = useMemo(() => report ? checkReviewKey(draft, report.methodVersion) : "", [draft, report]);
  const approvalReady = !!approved && approved.key === currentKey;
  const sourceCoverage = useMemo(() => report && draft.sourceText.trim() && draft.jobDescription.trim() ? analyzeCvEvidence(draft.sourceText, draft.jobDescription, draft.jobTitle) : null, [report, draft.sourceText, draft.jobDescription, draft.jobTitle]);
  const savedMatchesReview = !!saved && !!approved && saved.user_id === user?.id && saved.status === 'approved' &&
    saved.job_title === approved.draft.jobTitle && saved.company === approved.draft.company &&
    saved.job_description === approved.draft.jobDescription && saved.original_text === approved.draft.sourceText && saved.reviewed_text === approved.draft.reviewedText;
  const [tailoring, setTailoring] = useState<Tailoring | null>(null), [tailorUndo, setTailorUndo] = useState<TailorUndo | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const tailoringOperation = useRef<symbol | null>(null);
  // Answers belong to one set of questions; a new result, undo or account change starts afresh.
  useEffect(() => { setAnswers({}); }, [tailoring?.questions]);
  // The limit notice that should carry a link to passes; any other notice replaces it.
  const [passOfferNotice, setPassOfferNotice] = useState("");
  const [roleTouched, setRoleTouched] = useState(!!initialDraft.jobTitle);
  const autoPreviewKey = useRef('');
  const visibleSteps = [1, 5, 6];
  const stepIndex = visibleSteps.indexOf(step), stepLabel = (value: number) => reuseMode && value === 1 ? 'Your next job' : stepNames[value - 1];

  function setError(message: string) { updateError(message); setErrorField(null); }
  function setFieldError(field: CheckInputField, message: string) { updateError(message); setErrorField(field); }
  function validationProps(field: CheckInputField) { return { 'aria-invalid': errorField === field || undefined, 'aria-describedby': errorField === field ? 'check-validation-error' : undefined }; }
  function showValidationFailure(failure: unknown, fallback: CheckDraftField, message: string) {
    const field = failure instanceof CheckDraftValidationError ? failure.field : fallback;
    setFieldError(field, failure instanceof Error ? failure.message : message); setStep(reuseMode && field !== 'reviewedText' ? 1 : fieldSteps[field]);
    if (reuseMode && field === 'sourceText') setReuseInspect(true);
  }

  function invalidate() {
    revision.current += 1; setBusy(''); setPreparedFile(null); setApproved(null); setCheckedFacts(false); setCheckedPrivacy(false); setSaveConsent(false); setSaved(null); setTracked(false); setError(""); setNotice("");
    setSaving(false); setSaveError(''); setSaveNotice(''); setTracking(false); setTrackingError(''); trackingOperation.current = null;
    clearRetainedCheck();
    setPdfPreview(null); setPdfError('');
    setSelectedSourceLines([]); setSourceRemovalPreview(null);
  }
  function editDraft(patch: Partial<CheckDraft>, keepSelectionUndo = false) {
    let keepError = !!errorField && !!error;
    if (errorField) {
      const correctedField = errorField === 'file' ? 'sourceText' : errorField;
      if (patch[correctedField] !== undefined) { try { validateCheckField(correctedField, patch[correctedField]!); keepError = false; } catch { /* Keep feedback until this field is readable. */ } }
    }
    invalidate(); if (keepError && errorField) setFieldError(errorField, error);
    setOmitParagraphs([]); if (!keepSelectionUndo) setBeforeSelection(null); if (patch.sourceText !== undefined && patch.sourceText !== draft.sourceText) setPreviousSource(null);
    if (patch.reviewedText === '' && patch.sourceText !== undefined) { setReviewStarted(false); setReport(null); }
    setDraft(current => ({ ...current, ...patch }));
  }
  function sourceSnapshot(): SourceReplacementUndo {
    return { draft, filename, pageTarget, ownerId: owner.current, step, cvReady, reviewStarted, report, reuseMode, reuseInspect, sourceUndo: previousSource, applicationUndo: previousApplication, saveReference };
  }
  function replaceSourceText(text: string) {
    if (text === draft.sourceText) return;
    if (!sourceEditing.current && draft.sourceText) setPreviousReplacement(sourceSnapshot());
    sourceEditing.current = true;
    editDraft({ sourceText: text, reviewedText: '' }); setFilename(''); setCvReady(false);
  }
  function undoSourceReplacement() {
    if (busy || !previousReplacement || previousReplacement.ownerId !== owner.current) return;
    const previous = previousReplacement;
    invalidate(); setDraft(previous.draft); setFilename(previous.filename); setPageTarget(previous.pageTarget);
    setStep(previous.step); setCvReady(previous.cvReady); setReviewStarted(previous.reviewStarted); setReport(previous.report);
    setReuseMode(previous.reuseMode); setReuseInspect(previous.reuseInspect); setPreviousSource(previous.sourceUndo);
    setPreviousApplication(previous.applicationUndo); setSaveReference(previous.saveReference); setPreviousReplacement(null); sourceEditing.current = false;
    setBeforeSelection(null); setOmitParagraphs([]);
    setNotice('Your previous source CV, final edits and application details are restored. Review and approve again before downloading or saving.');
  }
  function reset() {
    invalidate(); setDraft(emptyDraft); setStep(1); setReport(null); setReviewStarted(false); setCvReady(false); setFilename(""); setFact(""); setQuestion(""); setFactPermitted(false); setGoogleConsent(false); setShowAccount(false); setResetConfirm(false); setDeleteTarget(null);
    clearCheckRecovery(); setRecoveryConsent(false); setPageTarget(2); setOmitParagraphs([]); setBeforeSelection(null);
    setPreviousSource(null); setPreviousApplication(null); setPreviousReplacement(null); setSaveReference(null); sourceEditing.current = false;
    setReuseMode(false); setReuseInspect(false);
    setAudience(null);
    setTailoring(null); setTailorUndo(null); setRoleTouched(false);
  }
  function beginAnotherVacancy(previous: CheckDraft, choice: CheckReuseSource, previousFilename = '') {
    if (busy) return;
    try {
      const next = draftForAnotherVacancy(previous, choice);
      try { setPreviousApplication({ draft: validateCheckDraft(draft), filename, pageTarget, ownerId: owner.current, sourceUndo: previousSource, reuseMode, saveReference }); }
      catch { setPreviousApplication(null); }
      invalidate(); clearCheckRecovery(); setDraft(next); setStep(1); setReport(null); setReviewStarted(false); setCvReady(true); setReuseMode(true); setReuseInspect(false);
      setFilename(choice === 'source' ? previousFilename : ''); setFact(''); setQuestion(''); setFactPermitted(false);
      setGoogleConsent(false); setShowAccount(false); setResetConfirm(false); setDeleteTarget(null); setOmitParagraphs([]); setBeforeSelection(null);
      setPreviousSource(null);
      setPreviousReplacement(null); setSaveReference(null); sourceEditing.current = false; setTailoring(null); setTailorUndo(null); setRoleTouched(!!next.jobTitle);
      setNotice(`Your ${choice === 'source' ? 'reviewed source' : 'approved final'} CV is ready to reuse. Add the new role and vacancy below. You can inspect or edit the reused CV before checking. This application needs its own approval; saved checks stay unchanged.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'This CV could not be reused. Review its text first.'); }
  }
  function undoNewApplication() {
    if (busy || !previousApplication || previousApplication.ownerId !== owner.current) return;
    const previous = previousApplication;
    invalidate(); clearCheckRecovery(); setDraft(previous.draft); setFilename(previous.filename); setPageTarget(previous.pageTarget); setCvReady(true); setReuseMode(previous.reuseMode); setReuseInspect(false);
    setReport(analyzeCvEvidence(previous.draft.reviewedText, previous.draft.jobDescription, previous.draft.jobTitle)); setReviewStarted(true); setStep(5); setPreviousApplication(null); setPreviousSource(previous.sourceUndo);
    setPreviousReplacement(null); setSaveReference(previous.saveReference); sourceEditing.current = false;
    setFact(''); setFactPermitted(false); setQuestion(''); setBeforeSelection(null); setOmitParagraphs([]); setShowAccount(false); setGoogleConsent(false); setDeleteTarget(null); setResetConfirm(false);
    setNotice('Your previous CV, vacancy and edits are restored. Review them again before approving a new download.');
  }
  function keepSourceEdits() {
    if (busy) return;
    try {
      const next = keepReviewedEditsInSource(draft);
      setPreviousSource({ text: draft.sourceText, ownerId: owner.current }); invalidate(); setDraft(next); setFilename(''); setCvReady(true); setStep(5);
      setReport(analyzeCvEvidence(next.reviewedText, next.jobDescription, next.jobTitle)); setBeforeSelection(null); setOmitParagraphs([]);
      setNotice('Your reviewed wording is now the reusable source for this open check. No saved account record was changed. Review and approve again; you can undo this source update while this page stays open.');
      setFocusRequest(value => value + 1);
    } catch (failure) { showValidationFailure(failure, 'reviewedText', 'Review your CV text before updating its source.'); }
  }
  function undoSourceUpdate() {
    if (busy || !previousSource || previousSource.ownerId !== owner.current) return;
    const before = previousSource, next = { ...draft, sourceText: before.text, ...(before.reviewedText === undefined ? {} : { reviewedText: before.reviewedText }) };
    invalidate(); setDraft(next); setReport(analyzeCvEvidence(next.reviewedText, next.jobDescription, next.jobTitle)); setStep(5); setPreviousSource(null); setBeforeSelection(null); setOmitParagraphs([]);
    setNotice(before.reviewedText === undefined ? 'The prior reusable source is restored. It may include details you removed from the final CV. Review both versions before reusing or saving; your final edits remain.' : 'The source-line removal was undone in both CV versions. Removed details may be back. Review and approve again before downloading, saving or reusing.');
    setFocusRequest(value => value + 1);
  }
  function previewSourceRemoval() {
    if (busy) return;
    try { setSourceRemovalPreview({ before: draft, after: removeSelectedSourceLines(draft, selectedSourceLines), ownerId: owner.current }); setError(''); }
    catch (failure) { setSourceRemovalPreview(null); setError(failure instanceof Error ? failure.message : 'Keep enough CV text to review.'); }
  }
  function applySourceRemoval() {
    if (busy || !sourceRemovalPreview || sourceRemovalPreview.before !== draft || sourceRemovalPreview.ownerId !== owner.current) return;
    const next = sourceRemovalPreview.after;
    setPreviousSource({ text: draft.sourceText, reviewedText: draft.reviewedText, ownerId: owner.current });
    invalidate(); setDraft(next); setFilename(''); setCvReady(true); setStep(5); setReport(analyzeCvEvidence(next.reviewedText, next.jobDescription, next.jobTitle)); setBeforeSelection(null); setOmitParagraphs([]);
    setNotice('Your selected source lines and all identical complete lines in the current CV were removed. Edited or different passages still need your review. No saved check was changed. Review and approve again; you can undo this removal on this page.');
    setFocusRequest(value => value + 1);
  }
  useEffect(() => {
    mounted.current = true; clearRetainedCheck();
    return () => { mounted.current = false; revision.current += 1; };
  }, []);
  useEffect(() => { if (requestedAudience) setAudience(requestedAudience); }, [requestedAudience]);
  useEffect(() => () => { if (preparedFile) URL.revokeObjectURL(preparedFile.url); }, [preparedFile]);
  useEffect(() => () => { if (pdfPreview) URL.revokeObjectURL(pdfPreview.url); }, [pdfPreview]);
  useEffect(() => {
    // An ownership change must finish resetting/adopting state before any
    // persistence effect can label the draft with the newly signed-in account.
    if (authLoading || authError || (user && authAuthority < 0) || draftAuthority !== authAuthority || draftOwner !== (user?.id ?? null)) return;
    // A retry fingerprint includes the exact text: retain it only while it is
    // the current draft, never as a hidden copy of wording removed for privacy.
    try { rememberCheckRecovery({ draft, step, cvReady, filename, ownerId: user?.id ?? null, pageTarget, reviewStarted, ...(saveReference?.reviewKey === currentKey ? { saveReference } : {}), ...(reuseMode ? { reuseMode: true } : {}), ...(audience ? { audience } : {}) }, recoveryConsent); }
    catch (failure) { setRecoveryConsent(false); setError(failure instanceof Error ? failure.message : 'Draft recovery is unavailable.'); }
  }, [draft, step, cvReady, filename, user?.id, authLoading, authError, authAuthority, draftAuthority, draftOwner, recoveryConsent, pageTarget, reuseMode, audience, reviewStarted, saveReference, currentKey]);
  useEffect(() => {
    if (step !== 6) { autoPreviewKey.current = ''; return; }
    if (!report || busy || !currentKey || autoPreviewKey.current === currentKey || (pdfPreview && pdfPreview.key === currentKey)) return;
    autoPreviewKey.current = currentKey; void previewPdf();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, report, currentKey, busy]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); const target = step === 1 ? intro.current : heading.current; target?.scrollIntoView?.({ block: "start", behavior: "auto" }); }, [step, focusRequest]);
  useEffect(() => { if (errorField) document.getElementById(fieldIds[errorField])?.focus(); }, [errorField, step, reuseInspect]);
  useEffect(() => {
    if (authLoading || authError || (user && authAuthority < 0)) { invalidate(); return; }
    const id = user?.id ?? null;
    const lifetimeChanged = previousAuthority.current !== authAuthority;
    if (lifetimeChanged) { invalidate(); setOpenedSelection(null); setReplaceSelection(null); }
    if (previousOwner.current !== id || lifetimeChanged) { setBusy(''); setSaving(false); setSaveError(''); setSaveNotice(''); setTracking(false); setTrackingError(''); trackingOperation.current = null; setSaveReference(null); setPreviousReplacement(null); sourceEditing.current = false; setPreviousSource(null); setPreviousApplication(null); setSelectedSourceLines([]); setSourceRemovalPreview(null); }
    if (previousOwner.current && (previousOwner.current !== id || lifetimeChanged)) {
      revision.current += 1; clearRetainedCheck(); setDraft(emptyDraft); setStep(1); setReport(null); setPreparedFile(null); setApproved(null); setCheckedFacts(false); setCheckedPrivacy(false); setSaved(null); setSaveConsent(false); setCvReady(false); setFilename(""); setFact(""); setQuestion(""); setFactPermitted(false); setTracked(false); setShowAccount(false); setNotice("The account changed. The previous check was cleared from this page."); setError("");
      clearCheckRecovery(); setRecoveryConsent(false); setPageTarget(2); setPdfPreview(null); setPdfError(''); setBeforeSelection(null); setOmitParagraphs([]);
      setSelectedSourceLines([]); setSourceRemovalPreview(null);
      setReuseMode(false); setReuseInspect(false);
      setReviewStarted(false);
      setAudience(null);
      setTailoring(null); setTailorUndo(null); setRoleTouched(false);
    } else if (previousOwner.current !== id) {
      // Email sign-in may adopt the open guest draft, but never its approval.
      invalidate(); setShowAccount(false); setGoogleConsent(false);
      setNotice("Your draft is still here. Review it again before approving a download or saving it.");
    }
    previousOwner.current = id; previousAuthority.current = authAuthority;
    setDraftOwner(id); setDraftAuthority(authAuthority);
    setSavedChecks([]); setSavedError(""); setDeleteTarget(null); setSavedLoading(!!id);
    if (!id) return;
    let active = true;
    void listFreeChecks(id).then(rows => { if (active && owner.current === id && trackingDraftAuthority(id) === authAuthority) { setSavedChecks(rows); setSavedLoading(false); } }).catch(() => { if (active && owner.current === id && trackingDraftAuthority(id) === authAuthority) { setSavedError("Saved checks could not be loaded. Your current check and free downloads are still available."); setSavedLoading(false); } });
    return () => { active = false; };
  }, [user?.id, authLoading, authError, authAuthority]);

  function go(next: number) { setError(""); setNotice(""); setStep(next); }
  async function readFile(file: File | undefined) {
    if (!file || busy) return;
    const before = sourceSnapshot();
    invalidate(); const atRevision = revision.current, startingOwner = owner.current; setBusy("Reading your CV on this device…"); setCvReady(false);
    try {
      const text = await extractCvText(file);
      if (!mounted.current || !authorityCurrent() || revision.current !== atRevision || owner.current !== startingOwner) return;
      if (before.draft.sourceText) setPreviousReplacement(before);
      sourceEditing.current = true;
      setDraft(current => ({ ...current, sourceText: text, reviewedText: "" })); setFilename(file.name); setReviewStarted(false); setReport(null);
      setNotice("Your CV text is ready to check. Fix any reading errors and remove private details. The file is still on your device.");
    } catch (failure) { if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setFieldError('file', failure instanceof Error ? failure.message : "This CV could not be read. Try a readable file or paste text."); }
    finally { if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setBusy(""); }
  }
  function fillFromVacancy(base: CheckDraft): CheckDraft {
    let next = base;
    if (!roleTouched || !next.jobTitle.trim()) { const role = roleFromVacancy(next.jobDescription); if (role) next = { ...next, jobTitle: role }; }
    if (!next.company.trim()) { const company = companyFromVacancy(next.jobDescription); if (company) next = { ...next, company }; }
    return next;
  }
  async function prepare(useAi: boolean) {
    if (busy || tailoringOperation.current) return;
    const base = fillFromVacancy(draft);
    if (base.jobTitle.trim().length < 2) { if (base !== draft) setDraft(base); setFieldError('jobTitle', 'Add the job title. We could not read it from the job description.'); return; }
    let valid: CheckDraft;
    try {
      validateCheckField('sourceText', base.sourceText);
      valid = validateCheckDraft({ ...base, reviewedText: reviewStarted ? base.reviewedText : base.sourceText });
    } catch (failure) { if (base !== draft) setDraft(base); showValidationFailure(failure, 'jobDescription', 'Check your CV and the job description, then try again.'); return; }
    const edited = reviewStarted && valid.reviewedText !== valid.sourceText;
    const local = reviewStarted ? valid.reviewedText : prioritizeCvForVacancy(valid.sourceText, analyzeCvEvidence(valid.sourceText, valid.jobDescription, valid.jobTitle));
    invalidate(); sourceEditing.current = false; setCvReady(true);
    if (!useAi) {
      setDraft({ ...valid, reviewedText: local }); setReport(analyzeCvEvidence(local, valid.jobDescription, valid.jobTitle)); setReviewStarted(true); setTailoring(null); setStep(5);
      setNotice('Your CV is ready to review beside what the job asks for. Edit it below.');
      return;
    }
    const atRevision = revision.current, startingOwner = owner.current;
    const operation = Symbol('tailoring'); tailoringOperation.current = operation;
    setDraft({ ...valid, reviewedText: local });
    setBusy('Tailoring your CV for this job. This usually takes under a minute…');
    try {
      const tailored = await requestTailoredCv({ cvText: valid.sourceText, jobDescription: valid.jobDescription, jobTitle: valid.jobTitle, company: valid.company });
      if (!mounted.current || !authorityCurrent() || revision.current !== atRevision || owner.current !== startingOwner) return;
      const text = validateCheckField('reviewedText', tailored.text);
      if (edited) setTailorUndo({ text: valid.reviewedText, ownerId: owner.current });
      setDraft(current => ({ ...current, reviewedText: text }));
      setReport(analyzeCvEvidence(text, valid.jobDescription, valid.jobTitle)); setReviewStarted(true);
      setTailoring({ changes: tailored.changes.map(change => ({ ...change, facts: change.facts ?? [] })), questions: tailored.questions, rejectedCount: tailored.rejectedCount, ownerId: owner.current, facts: [], factSources: [], sourceText: valid.sourceText, jobDescription: valid.jobDescription, jobTitle: valid.jobTitle, company: valid.company });
      setNotice(tailored.changes.length ? `${tailored.changes.length} ${tailored.changes.length === 1 ? 'change' : 'changes'} prepared for this job. Each one shows the line it came from in your CV.` : 'Your CV already reads well for this job, so nothing needed rewording. Check it below.');
      setStep(5);
    } catch (failure) {
      if (!mounted.current || !authorityCurrent() || revision.current !== atRevision || owner.current !== startingOwner) return;
      setReport(analyzeCvEvidence(local, valid.jobDescription, valid.jobTitle)); setReviewStarted(true); setTailoring(null); setStep(5);
      const text = `${failure instanceof Error ? failure.message : 'AI tailoring is unavailable right now.'} Your CV is below beside what the job asks for, so you can edit it yourself.`;
      setNotice(text);
      setPassOfferNotice(failure instanceof TailorUnavailable && PASS_OFFER_CODES.has(failure.code) ? text : "");
    } finally { if (tailoringOperation.current === operation) tailoringOperation.current = null; if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setBusy(''); }
  }
  const answerSourceLines = useMemo(() => sourceLines(draft.sourceText).filter(line => ['role', 'bullet', 'text'].includes(line.kind)), [draft.sourceText]);
  const confirmedAnswers = tailoring ? tailoring.questions.map((_, index) => answers[index]).filter((answer): answer is Answer => !!answer && answer.confirmed && answer.text.trim().length >= 10 && answerSourceLines.some(line => line.n === answer.sourceLine)) : [];
  async function deepTailor() {
    if (busy || tailoringOperation.current || !authorityCurrent() || !tailoring || tailoring.ownerId !== owner.current || !confirmedAnswers.length) return;
    if (tailoring.sourceText !== draft.sourceText || tailoring.jobDescription !== draft.jobDescription || tailoring.jobTitle !== draft.jobTitle || tailoring.company !== draft.company) { setError('The source CV or job changed. Prepare a fresh version before answering its questions.'); return; }
    let valid: CheckDraft;
    try { valid = validateCheckDraft(draft); } catch (failure) { showValidationFailure(failure, 'reviewedText', 'Review the CV before improving it.'); return; }
    // Earlier confirmed answers stay in, because each run starts again from the original CV.
    const prior = tailoring.facts.flatMap((text, index) => tailoring.withdrawnFacts?.includes(index + 1) ? [] : [{ text, sourceLine: tailoring.factSources[index] }]);
    const incoming = confirmedAnswers.map(answer => ({ text: answer.text.trim().replace(/\s+/gu, ' '), sourceLine: answer.sourceLine! }));
    const merged = [...prior];
    for (const answer of incoming) if (!merged.some(old => old.text === answer.text && old.sourceLine === answer.sourceLine)) merged.push(answer);
    if (merged.length === prior.length) { setNotice('These answers are already included. Edit an answer or your CV before preparing another version.'); return; }
    if (merged.length > MAX_ANSWERS) { setError(`This version already uses ${prior.length} answers. You can include up to ${MAX_ANSWERS}; uncheck extra answers before continuing. No AI request was made.`); return; }
    const facts = merged.map(answer => answer.text), factSources = merged.map(answer => answer.sourceLine);
    const previous: TailorUndo = { text: draft.reviewedText, ownerId: owner.current, tailoring };
    invalidate();
    const atRevision = revision.current, startingOwner = owner.current;
    const operation = Symbol('deep-tailoring'); tailoringOperation.current = operation;
    setBusy('Improving your CV with your answers. This usually takes under a minute…');
    try {
      const result = await requestTailoredCv({ cvText: valid.sourceText, jobDescription: valid.jobDescription, jobTitle: valid.jobTitle, company: valid.company, facts, factSources });
      if (!mounted.current || !authorityCurrent() || revision.current !== atRevision || owner.current !== startingOwner) return;
      const text = validateCheckField('reviewedText', result.text);
      setTailorUndo(previous);
      setDraft(current => ({ ...current, reviewedText: text }));
      setReport(analyzeCvEvidence(text, valid.jobDescription, valid.jobTitle));
      const changes = result.changes.map(change => ({ ...change, facts: change.facts ?? [] }));
      setTailoring({ changes, questions: result.questions, rejectedCount: result.rejectedCount, ownerId: owner.current, facts, factSources, sourceText: valid.sourceText, jobDescription: valid.jobDescription, jobTitle: valid.jobTitle, company: valid.company });
      const used = changes.filter(change => change.facts.length).length;
      setNotice(used ? `${used} ${used === 1 ? 'change uses' : 'changes use'} your answers, marked “from your answer” below. Your previous version is saved if you want to undo.` : 'No new wording used your answers this time. Review any other proposed changes below. Your previous version is saved if you want to undo.');
    } catch (failure) {
      if (!mounted.current || !authorityCurrent() || revision.current !== atRevision || owner.current !== startingOwner) return;
      const text = `${failure instanceof Error ? failure.message : 'AI tailoring is unavailable right now.'} Your current CV is unchanged.`;
      setNotice(text);
      setPassOfferNotice(failure instanceof TailorUnavailable && PASS_OFFER_CODES.has(failure.code) ? text : "");
    } finally { if (tailoringOperation.current === operation) tailoringOperation.current = null; if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setBusy(''); }
  }
  function revertChange(index: number) {
    if (busy || !tailoring || tailoring.ownerId !== owner.current) return;
    const change = tailoring.changes[index];
    if (!change || change.reverted || change.kind === 'order') return;
    let text = draft.reviewedText;
    if (change.kind === 'rewrite') { if (!text.includes(change.after)) { setError('That line has been edited since, so it was left as it is.'); return; } text = text.replace(change.after, change.before); }
    else if (change.kind === 'addition') {
      const lines = text.split('\n'), matches = lines.flatMap((line, index) => line === change.after ? [index] : []);
      if (matches.length !== 1) { setError('That line was edited or appears more than once. Remove the intended line in your CV below; no text was changed.'); return; }
      lines.splice(matches[0], 1); text = lines.join('\n');
    }
    else {
      if (!text.includes(change.after)) { setError('The summary has been edited since, so it was left as it is.'); return; }
      const insertedHeading = !draft.sourceText.split(/\r?\n/u).some(line => line.trim() === 'PROFILE') && text.includes('\nPROFILE\n' + change.after);
      text = change.before ? text.replace(change.after, change.before) : insertedHeading ? text.replace('\n\nPROFILE\n' + change.after, '').replace('\nPROFILE\n' + change.after, '') : text.replace(change.after + '\n', '').replace(change.after, '');
    }
    const kept = tailoring; editDraft({ reviewedText: text }); setReport(analyzeCvEvidence(text, draft.jobDescription, draft.jobTitle));
    setTailoring({ ...kept, withdrawnFacts: [...new Set([...(kept.withdrawnFacts ?? []), ...change.facts])], changes: kept.changes.map((item, i) => i === index ? { ...item, reverted: true } : item) });
    setNotice(change.kind === 'addition' ? 'That new line is removed.' : 'That line is back to your original wording.');
  }
  function undoTailoring() {
    if (busy || !tailorUndo || tailorUndo.ownerId !== owner.current) return;
    const text = tailorUndo.text, restore = tailorUndo.tailoring ?? null; editDraft({ reviewedText: text }); setReport(analyzeCvEvidence(text, draft.jobDescription, draft.jobTitle)); setTailoring(restore); setTailorUndo(null);
    setNotice(restore ? 'Your previous version is back.' : 'Your previous edited CV is back.');
  }
  function reviewChanges() {
    try { const valid = validateCheckDraft(draft); invalidate(); setDraft(valid); setReport(analyzeCvEvidence(valid.reviewedText, valid.jobDescription, valid.jobTitle)); go(6); }
    catch (failure) { showValidationFailure(failure, 'reviewedText', "Review the CV before continuing."); }
  }
  function applyParagraphSelection() {
    if (!omitParagraphs.length) return;
    const paragraphs = draft.reviewedText.split(/\n\s*\n/);
    const text = paragraphs.filter((_, index) => !omitParagraphs.includes(index)).join('\n\n');
    try { validateCvText(text); setBeforeSelection(draft.reviewedText); editDraft({ reviewedText: text }, true); setOmitParagraphs([]); setReport(analyzeCvEvidence(text, draft.jobDescription, draft.jobTitle)); setNotice('Only the selected whole paragraphs were removed. The source CV is unchanged. You can undo this selection.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Keep enough CV text to review.'); }
  }
  async function previewPdf() {
    if (busy || !report) return;
    const atRevision = revision.current, key = currentKey, startingOwner = owner.current;
    setBusy('Preparing your PDF preview…'); setPdfError('');
    try { const preview = await createReviewedPdfPreview(draft.reviewedText, draft.jobTitle); if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setPdfPreview({ ...preview, key, url: URL.createObjectURL(preview.blob) }); }
    catch (failure) { if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setPdfError(failure instanceof Error ? failure.message : 'PDF preview is unavailable. DOCX and TXT preserve your text.'); }
    finally { if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setBusy(''); }
  }
  function addFact() {
    if (!fact.trim()) { setError("Add your own specific example, or leave this gap unanswered."); return; }
    if (!factPermitted) { setError("Confirm this example is accurate and safe to include."); return; }
    const text = `${draft.reviewedText.trim()}\n\nADDITIONAL EXPERIENCE\n• ${fact.trim()}`;
    try { validateCvText(text); editDraft({ reviewedText: text }); setFact(""); setFactPermitted(false); setQuestion(""); setNotice("Your example is in the draft. Read it in context and make sure it says what you mean."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The example could not be added."); }
  }
  function approve(confirmed = checkedFacts && checkedPrivacy) {
    if (!confirmed || !report) return;
    try { const valid = validateCheckDraft(draft), key = checkReviewKey(valid, report.methodVersion);
      const reference = saveReference?.reviewKey === key ? saveReference : { reviewKey: key, requestId: crypto.randomUUID() };
      setSaveReference(reference); setApproved({ draft: valid, report, key, requestId: reference.requestId }); setNotice("Ready to download."); setError(""); setFocusRequest(value => value + 1); }
    catch (failure) { showValidationFailure(failure, 'reviewedText', "Approval could not complete."); }
  }
  async function download(format: DocumentFormat) {
    if (!approvalReady || !approved || busy) return;
    const snapshot = approved, atRevision = revision.current, startingOwner = owner.current;
    setBusy(`Preparing ${format.toUpperCase()}…`); setError("");
    try {
      if (format === 'pdf' && (!pdfPreview || pdfPreview.key !== snapshot.key || pdfPreview.pageCount > pageTarget)) throw new Error('Preview the current PDF within your page target before downloading it. DOCX and TXT remain available.');
      const blob = format === 'pdf' ? pdfPreview!.blob : await createFreeCheckCvBlob({ reviewedText: snapshot.draft.reviewedText, jobTitle: snapshot.draft.jobTitle, approved: true }, format);
      if (!mounted.current || !authorityCurrent() || revision.current !== atRevision || owner.current !== startingOwner) return;
      const filename = `${safeDocumentFilename(`CV-${snapshot.draft.jobTitle}`)}.${format}`;
      setPreparedFile({ url: URL.createObjectURL(blob), filename });
      downloadBlob(blob, filename); setNotice(`${format.toUpperCase()} download requested. Check your browser’s downloads.`);
    } catch (failure) { if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setError(failure instanceof Error ? failure.message : "Download failed. Retry or choose TXT."); }
    finally { if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === startingOwner) setBusy(""); }
  }
  async function save() {
    if (!approvalReady || !approved || !user || !saveConsent || busy || saving) return;
    const snapshot = approved, id = user.id, atRevision = revision.current;
    setSaving(true); setSaveError(''); setSaveNotice('');
    try {
      const record = await saveFreeCheck(id, { requestId: snapshot.requestId, jobTitle: snapshot.draft.jobTitle, company: snapshot.draft.company, jobDescription: snapshot.draft.jobDescription, originalText: snapshot.draft.sourceText, reviewedText: snapshot.draft.reviewedText, methodVersion: snapshot.report.methodVersion, approved: true });
      if (!mounted.current || !authorityCurrent() || owner.current !== id || revision.current !== atRevision) return;
      setSaved(record); setSavedChecks(rows => [record, ...rows.filter(row => row.id !== record.id)]); setSaveNotice("Saved privately in your account for free.");
    } catch (failure) { if (mounted.current && authorityCurrent() && owner.current === id && revision.current === atRevision) setSaveError(failure instanceof Error ? failure.message : "The check could not be saved. Your free downloads remain available."); }
    finally { if (mounted.current && authorityCurrent() && revision.current === atRevision && owner.current === id) setSaving(false); }
  }
  async function saveTracker() {
    if (!user || !saved || !approvalReady || !savedMatchesReview || !authorityCurrent() || trackingOperation.current || tracked) return;
    const id = user.id, checkId = saved.id, atRevision = revision.current, operation = Symbol('track-check');
    trackingOperation.current = operation; setTracking(true); setTrackingError('');
    const current = () => mounted.current && authorityCurrent() && owner.current === id && revision.current === atRevision && trackingOperation.current === operation;
    try {
      await trackFreeCheck(id, checkId);
      if (current()) { setTracked(true); setNotice('Tracking is linked to this saved check in Applications. Any existing progress has been kept.'); }
    } catch (failure) {
      if (current()) setTrackingError(failure instanceof Error ? failure.message : 'Tracking could not be confirmed. Retry this same saved check.');
    } finally {
      if (current()) { setTracking(false); trackingOperation.current = null; }
    }
  }
  function openSaved(record: FreeCvCheck) {
    if (!user || record.user_id !== user.id || busy) return;
    setReuseMode(false); setReuseInspect(false);
    invalidate(); setPreviousSource(null); setPreviousApplication(null); const value: CheckDraft = { jobTitle: record.job_title, company: record.company, sourceText: record.original_text, reviewedText: record.reviewed_text, jobDescription: record.job_description };
    setDraft(value); setCvReady(true); setReviewStarted(true); setReport(analyzeCvEvidence(value.reviewedText, value.jobDescription, value.jobTitle)); setStep(6); setSaved(record); setNotice("Your saved CV is open. We checked its wording again; read it before approving a new download.");
    setPreviousReplacement(null); sourceEditing.current = false; setFilename(''); setSaveReference({ reviewKey: checkReviewKey(value, record.method_version), requestId: record.request_id });
  }
  async function removeSaved(record: FreeCvCheck) {
    if (!user || record.user_id !== user.id || deleteTarget !== record.id || busy) return;
    const id = user.id, atRevision = revision.current; setBusy("Deleting the saved check…"); setError("");
    try { await deleteFreeCheck(record); if (mounted.current && authorityCurrent() && owner.current === id && revision.current === atRevision) { setSavedChecks(rows => rows.filter(row => row.id !== record.id)); if (saved?.id === record.id) { setSaved(null); setTracked(false); setTracking(false); setTrackingError(''); trackingOperation.current = null; } setNotice("Saved check deleted. Files you downloaded are still on your device. Any application notes and progress remain in Applications."); } }
    catch (failure) { if (mounted.current && authorityCurrent() && owner.current === id && revision.current === atRevision) setError(failure instanceof Error ? failure.message : "Deletion failed. Please retry."); }
    finally { if (mounted.current && authorityCurrent() && owner.current === id && revision.current === atRevision) { setBusy(""); setDeleteTarget(null); } }
  }

  const exactCheck = user && exactSelection ? savedChecks.find(item => item.id === exactSelection.id && item.user_id === user.id) : null;
  useEffect(() => {
    if (!reuseCheckId || !user || savedLoading || busy || reuseHandled.current === `${user.id}:${reuseCheckId}`) return;
    const record = savedChecks.find(item => item.id === reuseCheckId && item.user_id === user.id && item.status === 'approved');
    if (!record) { if (!savedLoading && savedChecks.length) { reuseHandled.current = `${user.id}:${reuseCheckId}`; setError('That saved application is not available in this account.'); } return; }
    reuseHandled.current = `${user.id}:${reuseCheckId}`;
    beginAnotherVacancy({ jobTitle: record.job_title, company: record.company, sourceText: record.original_text, reviewedText: record.reviewed_text, jobDescription: record.job_description }, 'reviewed');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reuseCheckId, user?.id, savedLoading, savedChecks, busy]);
  function openExactCheck() {
    if (!exactCheck || !user || busy || savedLoading || savedError) return;
    const before = sourceSnapshot();
    if (Object.values(draft).some(value => value.trim()) && !(replaceSelection?.id === exactCheck.id && replaceSelection.draft === draft && replaceSelection.owner === user.id && replaceSelection.route === sourceRoute.search)) {
      setReplaceSelection({ id: exactCheck.id, draft, owner: user.id, route: sourceRoute.search }); return;
    }
    openSaved(exactCheck);
    if (Object.values(before.draft).some(value => value.trim())) setPreviousReplacement(before);
    setOpenedSelection(`${user.id}:${sourceRoute.search}`); setReplaceSelection(null);
  }
  const sourceReviewControls = <details className="check-source-update"><summary className="text-sm font-medium">Reuse these edits later (optional)</summary><section aria-label="Update your reusable source">
    <h3 className="mt-3">Keep reviewed edits for future applications</h3><p>Your edits do not update the reusable source automatically. This replaces the reusable source for this open check with your reviewed CV, so your edits and removals carry into future reuse. Check that the facts you want to keep are still there. Saved account records stay unchanged; saving is a separate choice.</p><Button type="button" variant="outline" disabled={!!busy || draft.sourceText === draft.reviewedText} onClick={keepSourceEdits}>Keep these edits in my reusable source</Button>
    <details className="check-source-lines"><summary>Choose source lines to remove</summary><p>Optional: select exact lines that are confidential or unsafe to reuse. Preview both CV versions before applying. This removes the selected source lines and all identical complete lines in your current CV. Edited or different passages stay in place; review those yourself. Remaining wording and line endings stay as entered.</p><Link to="/help#source-line-removal">How source-line removal works</Link>
      <div className="check-source-line-options">{checkSourceLines(draft.sourceText).filter(line => line.text.trim()).map(line => <label key={line.number}><input type="checkbox" aria-label={`Remove source line ${line.number}`} aria-describedby={`${sourceLineId}-line-${line.number}`} disabled={!!busy} checked={selectedSourceLines.includes(line.number)} onChange={event => { setSelectedSourceLines(current => event.target.checked ? [...current, line.number] : current.filter(number => number !== line.number)); setSourceRemovalPreview(null); }} /><span><strong>Source line {line.number}</strong><span id={`${sourceLineId}-line-${line.number}`}>{line.text}</span></span></label>)}</div>
      <Button type="button" variant="outline" disabled={!!busy || !selectedSourceLines.length} onClick={previewSourceRemoval}>Preview selected line removals</Button>
      {sourceRemovalPreview && sourceRemovalPreview.before === draft && sourceRemovalPreview.ownerId === owner.current && <section className="check-source-removal-preview" aria-label="Source-line removal preview"><h4>Reusable source after removal</h4><pre>{sourceRemovalPreview.after.sourceText}</pre><h4>Current CV after removal</h4><pre>{sourceRemovalPreview.after.reviewedText}</pre><p>Read both versions and check that qualifications and context remain accurate. Applying clears approval, download previews and save consent. This changes only the check open on this page.</p><Button type="button" variant="outline" disabled={!!busy} onClick={applySourceRemoval}>Remove selected lines</Button><Button type="button" variant="ghost" disabled={!!busy} onClick={() => { setSelectedSourceLines([]); setSourceRemovalPreview(null); }}>Cancel line removal</Button></section>}
    </details>
    {previousSource && previousSource.ownerId === owner.current && <><Button type="button" variant="ghost" disabled={!!busy} onClick={undoSourceUpdate}>{previousSource.reviewedText === undefined ? 'Undo source update' : 'Undo source-line removal'}</Button><p>Undo restores the prior source{previousSource.reviewedText === undefined ? '' : ' and current CV'}, which may include removed details. This undo is kept only on this page.</p></>}
  </section></details>;

  if (authLoading || authError || (user && authAuthority < 0) || draftAuthority !== authAuthority || draftOwner !== (user?.id ?? null)) return <CheckSessionPending failed={!!authError} />;

  return <main className={`cv-check-page${step === 1 ? ' check-first-step' : ''}`}>
    <Helmet><title>{checkMeta.title}</title><meta name="description" content={checkMeta.description} /><link rel="canonical" href="https://jobvance.io/check" /></Helmet>
    <ProductNavigation active="check" />
    <div ref={intro} className="check-intro"><div><p className="check-eyebrow"><ShieldCheck size={15} /> Free CV tailoring <span>NO CARD NEEDED</span></p><h1>Tailor your CV to a job.</h1><p className="check-intro-description">Add your CV and the job description. Get a version for that role in about a minute, with every change traced back to your original CV.</p></div>
    </div>
    {hasExactSelection && openedSelection !== `${user?.id}:${sourceRoute.search}` && <section className="mb-5 rounded-xl border bg-white p-5" aria-label="Selected saved check">
      <h2 className="font-semibold">Open your selected application</h2>
      {!exactSelection ? <p role="alert">This saved-check link is not valid. Choose the application again.</p> : !user ? <p><Link to={`/auth?next=${encodeURIComponent(`/check${sourceRoute.search}`)}`}>Sign in to open this saved check</Link>. Your current draft stays on this device.</p> : savedLoading ? <p role="status">Loading the selected saved check…</p> : savedError ? <p role="alert">{savedError}</p> : !exactCheck ? <p role="alert">This saved check is no longer available in this account. Your current check has not changed.</p> : <><p>{exactCheck.job_title} · {exactCheck.company || 'Company not recorded'}</p><p>Open the exact saved wording for a fresh review. This does not approve, save or submit anything.</p>{replaceSelection?.draft === draft && replaceSelection.id === exactCheck.id && replaceSelection.owner === user.id && replaceSelection.route === sourceRoute.search ? <><p>Your current draft will be replaced on this page. You can undo the replacement while this page stays open.</p><Button disabled={!!busy} onClick={openExactCheck}>Replace current draft and open saved check</Button><Button variant="ghost" onClick={() => { setReplaceSelection(null); setOpenedSelection(`${user.id}:${sourceRoute.search}`); }}>Keep current draft</Button></> : <Button disabled={!!busy} onClick={openExactCheck}>Review selected saved check</Button>}</>}
      <p className="mt-3"><Link to="/applications">Back to my applications</Link></p>
    </section>}
    {resetConfirm && <Alert className="mb-5"><AlertDescription><p>This clears the check open on this page and any temporary sign-in draft. Previously saved account checks stay in your account.</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setResetConfirm(false)}>Keep this check</Button><Button size="sm" onClick={reset}>Clear current check</Button></div></AlertDescription></Alert>}
    <div className="check-layout">
    <aside className="check-sidebar">
      <nav ref={progress} aria-label="Check progress" className="check-progress"><p className="check-rail-title">YOUR APPLICATION</p><ol>{visibleSteps.map((value, i) => <li key={value} aria-current={step === value ? "step" : undefined} data-complete={step > value}>
        {value < step ? <button type="button" disabled={!!busy} onClick={() => go(value)}><span className="check-step-number"><Check size={15} /></span><span>{stepLabel(value)}</span></button> : <div><span className="check-step-number">{String(i + 1).padStart(2,"0")}</span><span>{stepLabel(value)}</span></div>}
      </li>)}</ol><p className="check-rail-caption">Step {stepIndex + 1} of {visibleSteps.length} · you check every change</p></nav>
      <div className="check-context"><FileText size={20} /><p className="check-context-title">{draft.jobTitle || "Start with one role"}</p><p>{draft.company || (step === 1 ? "Have your CV and the job description ready." : "Company not specified")}</p>{report && <span>{report.summary.total} requirements in this job</span>}</div>
      <div className="check-privacy"><LockKeyhole size={16} /><p>Private by default.<br /><span>Saved to your account only if you choose.</span></p></div>
    </aside>
    <div className="check-workarea">
    {error && <Alert id="check-validation-error" variant="destructive" role="alert" className="mb-5"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <p role="status" className="mb-5 rounded-xl border bg-muted/40 px-4 py-3 text-sm leading-6">{notice}{notice === passOfferNotice && <> <Link className="font-medium underline underline-offset-4" to="/pricing">See passes from $9</Link></>}</p>}
    {previousReplacement && previousReplacement.ownerId === owner.current && <section className="mb-5 rounded-xl border p-4" aria-label="Source replacement undo"><Button type="button" variant="outline" disabled={!!busy} onClick={undoSourceReplacement}>Undo source replacement</Button><p className="mt-2 text-sm">Restore the source CV, final edits and application details from before this replacement. Review is required again. Undo lasts while this page stays open.</p></section>}
    {previousApplication && previousApplication.ownerId === owner.current && <div className="check-undo-application"><Button type="button" variant="outline" disabled={!!busy} onClick={undoNewApplication}>Undo new application</Button><p>Restore the previous CV, vacancy and edits for a fresh review. Undo is kept only on this page; leaving or refreshing loses it.</p></div>}
    {busy && <p role="status" className="mb-4 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />{busy}</p>}
    <Card className="check-stage"><CardContent className="check-stage-content"><div className="check-stage-heading"><span className="check-stage-index">{String(stepIndex + 1).padStart(2,"0")} / {String(visibleSteps.length).padStart(2,"0")}</span><h2 ref={heading} tabIndex={-1} className="outline-none">{stepLabel(step)}</h2><p>{reuseMode && step === 1 ? "Your last approved CV is ready. Paste the next job description." : ["Upload or paste your CV, then paste the job description. We read the job title from the ad.","Upload a file or paste your CV, then check the text.","Paste the responsibilities and requirements from the job.","Compare each requirement with the supporting words in your CV.","Check each change and edit anything. Nothing is added that is not in your CV.","Tick to confirm, then download."][step-1]}</p></div>
      {step === 1 && <>
        {!reuseMode && <><div className="rounded-xl border border-dashed bg-muted/25 p-5"><Label htmlFor="check-file" className="mb-3 flex items-center gap-2"><Upload size={18} /> Upload your CV (PDF, Word or text, up to 5 MB)</Label><Input id="check-file" {...validationProps('file')} type="file" accept=".pdf,.docx,.txt" disabled={!!busy} onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />{filename && <p className="mt-2 break-all text-xs text-muted-foreground">Read: {filename}. Check the text below.</p>}</div>
        <div className="space-y-2"><Label htmlFor="check-source">Your CV</Label><Textarea id="check-source" {...validationProps('sourceText')} className="min-h-56 font-mono text-sm" maxLength={60000} value={draft.sourceText} disabled={!!busy} placeholder="Or paste your CV here" onChange={e => replaceSourceText(e.target.value)} /><p className="text-xs text-muted-foreground">Remove anything you would not share with an employer. Scanned PDFs need readable text: paste the text instead. <Link to="/help#no-cv" className="underline">No CV yet?</Link></p></div></>}
        <div className="space-y-2"><Label htmlFor="check-vacancy">The job description</Label><Textarea id="check-vacancy" {...validationProps('jobDescription')} className="min-h-48 text-sm" maxLength={20000} value={draft.jobDescription} disabled={!!busy} placeholder="Paste the full job ad, including responsibilities and requirements" onChange={e => { const jobDescription = e.target.value; const role = roleTouched ? draft.jobTitle : roleFromVacancy(jobDescription); const company = draft.company.trim() ? draft.company : companyFromVacancy(jobDescription); editDraft({ jobDescription, ...(roleTouched ? {} : { jobTitle: role }), ...(draft.company.trim() ? {} : { company }) }); }} /><p className="text-xs text-muted-foreground">{draft.jobDescription.length >= 19500 ? 'That is close to the 20,000-character limit. Paste just the responsibilities and requirements if it is cut off.' : 'Paste the actual ad. We never open employer links or apply for you.'}</p></div>
        <div className="check-role-fields grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="check-role">Job title</Label><Input id="check-role" {...validationProps('jobTitle')} aria-required="true" placeholder={guidance?.example ?? "Read from the job ad"} maxLength={200} value={draft.jobTitle} disabled={!!busy} onChange={e => { setRoleTouched(true); editDraft({ jobTitle: e.target.value }); }} /></div><div className="space-y-2"><Label htmlFor="check-company">Company (optional)</Label><Input id="check-company" {...validationProps('company')} maxLength={200} value={draft.company} disabled={!!busy} onChange={e => editDraft({ company: e.target.value })} placeholder="Employer name, if known" /></div></div>
        {reuseMode && <details className="check-reused-cv" aria-label="Reused CV" open={reuseInspect} onToggle={event => setReuseInspect(event.currentTarget.open)}><summary>Check or edit the CV you are reusing</summary><p>This is your last approved CV. Remove anything you do not want in this application. Saved applications stay unchanged.</p><div className="space-y-2"><Label htmlFor="check-source">Reused CV text</Label><Textarea id="check-source" {...validationProps('sourceText')} className="min-h-72 text-sm" maxLength={60000} value={draft.sourceText} disabled={!!busy} onChange={e => replaceSourceText(e.target.value)} /></div></details>}
        <div className="check-prepare-actions flex flex-wrap items-center gap-3"><Button disabled={!!busy} onClick={() => void prepare(true)}>Tailor my CV for this job <ArrowRight className="ml-2" size={16} /></Button><Button variant="outline" disabled={!!busy} onClick={() => void prepare(false)}>Compare without AI</Button></div>
        <p className="check-local-note"><LockKeyhole size={15} />Tailoring sends your CV and this job to our AI provider to prepare one version. They are not stored unless you save, and the AI may only reword what is already in your CV. Comparing without AI stays on this device. Your account keeps your Jobvance journey together.</p></>}
      {step === 5 && report && <>
        {tailoring && tailoring.ownerId === owner.current && <section className="check-changes rounded-xl border p-5" aria-label="What changed"><h3 className="text-lg font-semibold">What changed for this job</h3>
          {tailoring.changes.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No rewording was needed. Your CV is below.</p> : <ol className="check-change-list mt-3 space-y-3">{tailoring.changes.map((change, index) => <li key={index} className={`check-change rounded-lg border p-3${change.reverted ? ' opacity-60' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{change.kind === 'summary' ? 'Profile summary' : change.kind === 'order' ? 'Most relevant first' : change.kind === 'addition' ? 'New line' : `Line ${change.n}`}{change.facts.length ? ' · from your answer' : ''}{change.reverted ? (change.kind === 'addition' ? ' · removed' : ' · kept your original') : ''}</p>
            {change.kind === 'order' ? <p className="mt-1 text-sm">Bullets under this role now start with the ones closest to the job.</p> : <><p className="mt-1 text-sm"><span className="font-medium">Now:</span> {change.after.replace(/^\s*[-•*–·▪●◦]\s+/u, '')}</p>{change.before && <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium">Your original:</span> {change.before.replace(/^\s*[-•*–·▪●◦]\s+/u, '')}</p>}{!change.before && change.kind === 'summary' && <p className="mt-1 text-xs text-muted-foreground">Written only from lines {change.sources.join(', ')} of your CV{change.facts.length ? ' and your answers' : ''}.</p>}{change.facts.length > 0 && <p className="mt-1 text-xs text-muted-foreground">From your answer: {change.facts.map(number => `“${tailoring.facts[number - 1] ?? ''}”`).join(' ')}</p>}
            {!change.reverted && <Button type="button" variant="link" className="h-auto px-0 text-sm" disabled={!!busy} onClick={() => revertChange(index)}>{change.kind === 'summary' && !change.before ? 'Remove this summary' : change.kind === 'addition' ? 'Remove this line' : 'Keep my original'}</Button>}</>}
          </li>)}</ol>}
          {tailoring.rejectedCount > 0 && <p className="mt-3 text-xs text-muted-foreground">We left out {tailoring.rejectedCount} AI {tailoring.rejectedCount === 1 ? 'suggestion' : 'suggestions'} that did not pass the source checks.</p>}
          {tailorUndo && tailorUndo.ownerId === owner.current && <Button type="button" variant="outline" className="mt-3" disabled={!!busy} onClick={undoTailoring}>{tailorUndo.tailoring ? 'Undo and restore the previous version' : 'Undo tailoring and restore my edited CV'}</Button>}
        </section>}
        {tailoring && tailoring.ownerId === owner.current && tailoring.questions.length > 0 && <section className="check-questions rounded-xl bg-muted/40 p-5" aria-label="Questions about gaps"><h3 className="font-semibold">Quick questions (answer only if true)</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Answer any that are true for you and choose where each belongs in your original CV. Check the proposed wording and placement before approving it.</p>
          <ol className="mt-3 space-y-4">{tailoring.questions.map((item, index) => { const answer = answers[index] ?? { text: '', confirmed: false }; return <li key={`${index}-${item}`} className="space-y-2"><Label htmlFor={`check-answer-${index}`} className="text-sm font-medium leading-6">{item}</Label><Textarea id={`check-answer-${index}`} maxLength={400} value={answer.text} disabled={!!busy} placeholder="What you did, in your own words. Leave it blank if it does not apply." onChange={e => { const value = e.target.value; setAnswers(current => ({ ...current, [index]: { ...current[index], text: value, confirmed: false } })); }} /><Label htmlFor={`check-answer-source-${index}`} className="text-sm">Where this answer belongs in your original CV</Label><select id={`check-answer-source-${index}`} className="w-full rounded-md border bg-background p-2 text-sm" value={answer.sourceLine ?? ""} disabled={!!busy} onChange={e => { const sourceLine = Number(e.target.value) || undefined; setAnswers(current => ({ ...current, [index]: { ...answer, sourceLine, confirmed: false } })); }}><option value="">Choose a role or line</option>{answerSourceLines.map(line => <option key={line.n} value={line.n}>Line {line.n}: {line.text}</option>)}</select><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={answer.confirmed} disabled={!!busy || answer.text.trim().length < 10 || !answer.sourceLine} onChange={e => { const confirmed = e.target.checked; setAnswers(current => ({ ...current, [index]: { ...answer, confirmed } })); }} />This is accurate for the selected CV line and safe to share with the AI provider.</label></li>; })}</ol>
          <Button type="button" className="mt-4" disabled={!!busy || !confirmedAnswers.length} onClick={() => void deepTailor()}>Improve my CV with these answers</Button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Uses one AI-tailored CV from your allowance. Your current version is kept, so you can undo.{tailoring.facts.length + confirmedAnswers.length > MAX_ANSWERS ? ` Choose at most ${MAX_ANSWERS} answers in total; extra answers will not be silently discarded.` : ''}</p>
        </section>}
        <RequirementCoverage before={sourceCoverage} after={report} changed={draft.reviewedText !== draft.sourceText} />
        <div className="space-y-2"><Label htmlFor="check-reviewed">{tailoring ? 'Your tailored CV' : 'Your CV for this job'}</Label><p className="text-sm leading-6 text-muted-foreground">Edit anything. Keep dates and numbers exact, and say what you did yourself.</p><Textarea id="check-reviewed" {...validationProps('reviewedText')} className="min-h-80 font-mono text-sm" maxLength={60000} value={draft.reviewedText} disabled={!!busy} onChange={e => editDraft({ reviewedText: e.target.value })} /></div>
        <div className="space-y-3 rounded-xl border p-5"><h3 className="font-semibold">Add something the job asks for (optional)</h3>{question && <p className="rounded-lg border bg-background p-3 text-sm">{question}</p>}<Label htmlFor="check-fact">Your own example, in your words</Label><Textarea ref={factField} id="check-fact" maxLength={3000} value={fact} onChange={e => { setFact(e.target.value); setFactPermitted(false); }} placeholder="What you did, for whom, and an accurate result." /><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={factPermitted} onChange={e => setFactPermitted(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />This is accurate and safe to share.</label><Button variant="outline" type="button" onClick={addFact}>Add to my CV</Button></div>
        <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">What the job asks for, beside your CV</summary><div className="mt-4"><EvidenceResults report={report} originalText={draft.sourceText} onQuestion={text => { setQuestion(text); factField.current?.focus(); }} /></div></details>
        <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">More options</summary><div className="mt-4 space-y-4">{sourceReviewControls}<details className="check-paragraph-selection rounded-xl border p-4"><summary className="cursor-pointer font-medium">Shorten: leave out whole paragraphs</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">Select complete paragraphs to leave out. The rest of your wording stays exactly as it is.</p><div className="mt-4 space-y-3">{draft.reviewedText.split(/\n\s*\n/).map((paragraph, index) => <label key={index} className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={omitParagraphs.includes(index)} onChange={e => setOmitParagraphs(current => e.target.checked ? [...current, index] : current.filter(item => item !== index))} /><span className="min-w-0"><strong className="text-xs">Leave out paragraph {index + 1}</strong><span className="mt-1 block whitespace-pre-wrap break-words text-sm">{paragraph}</span></span></label>)}</div><Button type="button" variant="outline" className="mt-4" disabled={!omitParagraphs.length} onClick={applyParagraphSelection}>Remove selected paragraphs</Button></details>{beforeSelection !== null && <Button type="button" variant="outline" onClick={() => { const text = beforeSelection; editDraft({ reviewedText: text }); setReport(analyzeCvEvidence(text, draft.jobDescription, draft.jobTitle)); setBeforeSelection(null); setNotice("The paragraph selection was undone. Review the restored CV."); }}>Undo paragraph selection</Button>}</div></details>
        <Button onClick={reviewChanges}>Continue to download <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 6 && report && <><p className="leading-7 text-muted-foreground">Read your final CV, preview its layout and approve the version you want to download.</p><details open className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Final CV preview — review before approval</summary><pre className="check-final-document mt-4 whitespace-pre-wrap break-words font-sans text-sm">{draft.reviewedText}</pre></details>{sourceReviewControls}<section className="check-pdf-preview rounded-xl border p-4" aria-label="PDF layout preview"><h3 className="font-semibold">PDF preview</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">This is the exact PDF you will download. Word and text files have the same wording.</p><div className="mt-4 flex flex-wrap items-center gap-3"><Label htmlFor="check-page-target">Maximum PDF length</Label><select id="check-page-target" className="rounded-lg border bg-white p-2 text-sm" value={pageTarget} onChange={e => setPageTarget(Number(e.target.value) as 1 | 2)}><option value={1}>One page</option><option value={2}>Two pages</option></select>{(!pdfPreview || pdfPreview.key !== currentKey) && <Button type="button" variant="outline" disabled={!!busy} onClick={() => void previewPdf()}>Show PDF preview</Button>}</div>{pdfError && <p role="status" className="mt-4 text-sm text-amber-950">{pdfError}</p>}{pdfPreview && pdfPreview.key === currentKey && <div className="mt-4"><p className="text-sm">{pdfPreview.pageCount} PDF page{pdfPreview.pageCount === 1 ? "" : "s"} · {pdfPreview.pageCount > pageTarget ? "Above your selected maximum. Return to your review to shorten it, or choose DOCX/TXT." : "Within your selected maximum."}</p><a className="mt-3 inline-block text-sm underline" href={pdfPreview.url} target="_blank" rel="noopener noreferrer">Open the exact PDF preview in a new tab</a><iframe className="check-pdf-frame mt-3" title="Exact PDF preview before approval" src={pdfPreview.url} /></div>}</section><div className="space-y-4 rounded-xl border bg-muted/20 p-5"><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checkedFacts && checkedPrivacy} disabled={!!busy} onChange={e => { const confirmed = e.target.checked; setCheckedFacts(confirmed); setCheckedPrivacy(confirmed); setPreparedFile(null); setApproved(null); if (confirmed) approve(true); }} className="mt-1 h-4 w-4 shrink-0" />I have checked this CV. It is accurate and safe to share with employers.</label>{approvalReady && <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 size={17} /> Ready to download</p>}</div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5"><h3 className="flex items-center gap-2 text-lg font-semibold"><Download size={19} /> Download free</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{approvalReady ? "Choose a format for your approved CV." : "Tick the box above to enable downloads."}</p><div className="mt-4 flex flex-wrap gap-2">{(["pdf", "docx", "txt"] as const).map(format => <Button key={format} variant={format === "pdf" ? "default" : "outline"} disabled={!approvalReady || !!busy || (format === "pdf" && (!pdfPreview || pdfPreview.key !== currentKey || pdfPreview.pageCount > pageTarget))} onClick={() => void download(format)}>Download {format === "docx" ? "Word" : format.toUpperCase()}</Button>)}<Button variant="outline" disabled={!approvalReady || !!busy} onClick={() => { if (approved && approvalReady) { const blob = new Blob([createFreeCheckReportText(approved.report, { sourceLabel: "Current reviewed CV; passages added/edited by the user are not independently verified", jobTitle: approved.draft.jobTitle, coverageBefore: analyzeCvEvidence(approved.draft.sourceText, approved.draft.jobDescription, approved.draft.jobTitle).summary })], { type: "text/plain;charset=utf-8" }); const filename = `${safeDocumentFilename(`Evidence-review-${approved.draft.jobTitle}`)}.txt`; setPreparedFile({ url: URL.createObjectURL(blob), filename }); downloadBlob(blob, filename); setNotice("Requirement report download requested. It is separate from your CV."); } }}>Requirement report</Button></div>{preparedFile && approvalReady && <p className="mt-4 break-words text-sm leading-6">If the download did not start, <a className="font-medium text-primary underline" href={preparedFile.url} download={preparedFile.filename}>save the prepared file: {preparedFile.filename}</a>. This link is available while this approved check stays open.</p>}</div>
        <section className="check-next-application rounded-xl border p-5" aria-label="Prepare another application"><h3 className="text-lg font-semibold">Applying for another job?</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Start from this approved CV. Just paste the next job description. Download or save this one first if you want to keep it.</p><Button className="mt-3" variant="outline" disabled={!approvalReady || !!busy} onClick={() => { if (approvalReady) beginAnotherVacancy(draft, "reviewed", filename); }}>Tailor for another job</Button>{!approvalReady && <p className="mt-2 text-xs text-muted-foreground">Tick the box above first.</p>}</section>
        <div className="rounded-xl border p-5"><h3 className="flex items-center gap-2 text-lg font-semibold"><LockKeyhole size={19} /> Save privately (optional)</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Want to come back to this application? Save the job description and both CV versions privately. The original file stays on your device. Saving this check is free.</p>
          {authLoading ? <p role="status" className="mt-4 text-sm">Checking your sign-in…</p> : user ? <><p className="mt-4 text-sm">Signed in as {user.email ?? "your account"}.</p><details className="mt-4 rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Exactly what will be saved</summary><div className="mt-3 space-y-4 text-sm"><p>Role: {draft.jobTitle}. Company: {draft.company || "Not specified"}. Approved by you.</p><h4 className="font-medium">Reviewed source CV</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.sourceText}</pre><h4 className="font-medium">Approved final CV</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.reviewedText}</pre><h4 className="font-medium">Vacancy</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.jobDescription}</pre><p>These are the texts we will store privately with your account in Supabase. We check them again when you reopen the saved version. The original file is not uploaded, and nothing is sent to an employer or advertising service.</p></div></details><label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={saveConsent} disabled={!approvalReady || !!busy || saving} onChange={e => setSaveConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />Save these reviewed texts privately in my account.</label><Button className="mt-4" disabled={!approvalReady || !saveConsent || !!busy || saving || !!saved} onClick={() => void save()}>{saved ? <><Check size={16} className="mr-2" />Saved privately</> : saving ? "Saving approved check…" : "Save approved check to my account"}</Button>{saving && <p role="status" className="mt-3 text-sm">Saving privately. Your approved local downloads remain available.</p>}{saveError && <p role="alert" className="mt-3 text-sm">{saveError} Your approved local downloads remain available.</p>}{saveNotice && <p role="status" className="mt-3 text-sm">{saveNotice}</p>}{saved && <div className="mt-4"><ContinueSavedCheck record={saved} ownerId={user.id} /><p className="mt-2 text-xs text-muted-foreground">Choose which saved CV version and vacancy to reuse there. Nothing is imported or prepared automatically.</p></div>}<div className="mt-5 border-t pt-4">{saved ? <><Button variant="outline" disabled={!approvalReady || !savedMatchesReview || tracking || tracked} onClick={() => void saveTracker()}>{tracked ? "Tracking in Applications" : tracking ? "Linking your progress…" : "Track this saved check"}</Button>{trackingError && <p role="alert" className="mt-3 text-sm">{trackingError}</p>}{tracking && <p role="status" className="mt-3 text-sm">Linking this saved check. Your local downloads remain available.</p>}<p className="mt-2 text-xs text-muted-foreground">Keep your notes, reminders and application status with this saved CV. Existing progress stays unchanged. <Link to={`/applications?item=check:${saved.id}`} className="underline">Open this application</Link>.</p></> : <p className="text-sm text-muted-foreground">Save the reviewed check above to keep its CV and application progress together. <Link to="/applications" className="underline">Open Applications</Link>.</p>}</div></> : <><Button className="mt-4" variant="outline" disabled={!approvalReady || !!busy} onClick={() => setShowAccount(current => !current)}>{showAccount ? "Close account form" : "Sign in or create an account to save"}</Button>{showAccount && <div className="mt-5 space-y-4"><p className="text-sm text-muted-foreground">Email sign-in keeps this page open. Google takes you away, so keeping the draft needs your permission.</p><p className="text-sm leading-6 text-muted-foreground">This tab will hold your CV and job description. Return within 30 minutes to restore them; we clear the copy when you return. If you cancel, clear this check or close the tab. Anyone using this tab may see the draft. You will need to approve it again.</p><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={googleConsent} onChange={e => { setGoogleConsent(e.target.checked); if (!e.target.checked) clearRetainedCheck(); }} className="mt-1 h-4 w-4 shrink-0" />Keep my CV and job description in this tab while I sign in with Google.</label><Auth embedded onBeforeGoogle={() => { try { retainCheckForGoogle(draft, googleConsent); return true; } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-in could not start."); return false; } }} /></div>}</>}
        </div>
      </>}
      {stepIndex > 0 && <div className="border-t pt-5"><Button type="button" variant="ghost" disabled={!!busy} onClick={() => go(visibleSteps[stepIndex - 1])}><ArrowLeft size={16} className="mr-2" />Back to {stepLabel(visibleSteps[stepIndex - 1]).toLowerCase()}</Button></div>}
    </CardContent></Card>
    {guidance && <section className="check-audience-guidance" aria-label={`${guidance.label} guidance`}><details><summary><strong>{guidance.label} guidance</strong><span>Optional</span></summary><p>{guidance.text}</p></details></section>}
    <details className="check-recovery" aria-label="Draft recovery"><summary><strong>Draft recovery (optional)</strong><span>{recoveryConsent ? 'Refresh recovery is on for this tab. Open to change your choice.' : 'Your draft returns when you come back in this tab. Refresh clears it unless you allow temporary storage.'}</span></summary><div><p>Allowing refresh recovery keeps your CV and vacancy in this tab for 30 minutes after your last change. Anyone using this browser tab can access it. Approval is always cleared when a draft is restored. Closing the tab clears the draft; account saving is a separate choice.</p><label><input type="checkbox" checked={recoveryConsent} onChange={e => { setRecoveryConsent(e.target.checked); if (!e.target.checked) clearCheckRecovery(); }} />Keep my draft in this tab across refresh</label></div></details>
    <Button className="check-reset" type="button" variant="ghost" disabled={!!busy} onClick={() => setResetConfirm(true)}>Clear & start again</Button>
    </div></div>
    <CvCheckExplainer />
    {user && <details className="mt-8 rounded-xl border bg-white p-5 sm:p-7" aria-label="Your saved free checks"><summary className="cursor-pointer"><span className="inline-flex items-center gap-2 text-lg font-semibold"><FileText size={20} /> Saved on this account ({savedChecks.length})</span> <Link to="/applications" className="ml-2 text-sm underline">Open My applications</Link></summary>{savedError && <p role="alert" className="mt-3 text-sm text-destructive">{savedError}</p>}{savedLoading && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading your saved checks…</p>}{!savedLoading && !savedError && savedChecks.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No free checks saved yet. Saving is optional.</p>}<div className="mt-4 space-y-3">{savedChecks.map(record => <article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><h3 className="font-medium">{record.job_title}</h3><p className="text-xs text-muted-foreground">{record.company || "Company not specified"} · {new Date(record.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy} onClick={() => openSaved(record)}>Open saved check</Button><ContinueSavedCheck record={record} ownerId={user.id} /><ReuseCvAction disabled={!!busy} reviewedAvailable={record.status === 'approved'} onReuse={choice => { if (user && record.user_id === user.id && (choice === 'source' || record.status === 'approved')) beginAnotherVacancy({ jobTitle: record.job_title, company: record.company, sourceText: record.original_text, reviewedText: record.reviewed_text, jobDescription: record.job_description }, choice); }} />{deleteTarget === record.id ? <><span className="self-center text-xs">Permanently delete this saved check?</span><Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void removeSaved(record)}>Confirm deletion</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button></> : <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setDeleteTarget(record.id)}>Delete</Button>}</div></article>)}</div></details>}
    <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">You choose the final wording and send the application yourself. <Link className="underline" to="/privacy">Privacy</Link></p>
  </main>;
}


