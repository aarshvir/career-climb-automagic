import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { checkReviewKey, clearRetainedCheck, retainCheckForGoogle, readRetainedCheck, validateCheckDraft, validateCheckField, CheckDraftValidationError, readCheckRecovery, rememberCheckRecovery, clearCheckRecovery, draftForAnotherVacancy, keepReviewedEditsInSource, checkSourceLines, removeSelectedSourceLines, checkAudience, type CheckAudience, type CheckDraft, type CheckDraftField, type CheckReuseSource } from "@/lib/check-draft";
import { deleteFreeCheck, listFreeChecks, saveFreeCheck, type FreeCvCheck } from "@/lib/free-check-api";
import { createFreeCheckCvBlob, createFreeCheckReportText } from "@/lib/free-check-export";
import { downloadBlob, safeDocumentFilename } from "@/lib/document-download";
import { addApplication } from "@/lib/workspace-api";
import { createReviewedPdfPreview, type DocumentFormat } from "@/lib/document-export";
import { staticPageMeta } from "@/lib/public-site-meta";
import "./CvCheck.css";

const emptyDraft: CheckDraft = { jobTitle: "", company: "", sourceText: "", reviewedText: "", jobDescription: "" };
const stepNames = ["Your role", "Your CV", "One vacancy", "The evidence", "Your review", "Approve & download"];
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
type SourceUndo = { text: string; reviewedText?: string; ownerId: string | null };
type ApplicationUndo = { draft: CheckDraft; filename: string; pageTarget: 1 | 2; ownerId: string | null; sourceUndo: SourceUndo | null; reuseMode: boolean };
type CheckInputField = CheckDraftField | 'file';
const fieldIds: Record<CheckInputField, string> = { jobTitle: 'check-role', company: 'check-company', sourceText: 'check-source', reviewedText: 'check-reviewed', jobDescription: 'check-vacancy', file: 'check-file' };
const fieldSteps: Record<CheckInputField, number> = { jobTitle: 1, company: 1, sourceText: 2, reviewedText: 5, jobDescription: 3, file: 2 };
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
  return <main className="cv-check-page"><p role="status">{failed ? 'Your sign-in could not be restored. Your stored draft has been kept. Try again to open it safely.' : 'Restoring your session and draft…'}</p>{failed && <Button type="button" variant="outline" onClick={retryConnection}>Retry sign-in recovery</Button>}</main>;
}

function CvCheckWorkspace() {
  const [searchParams] = useSearchParams();
  const requestedAudience = checkAudience(searchParams.get("audience"));
  const { user, loading: authLoading, authError } = useAuth();
  const [draftOwner, setDraftOwner] = useState(user?.id ?? null);
  const [recovery] = useState(() => readCheckRecovery(user?.id ?? null));
  const [audience, setAudience] = useState<CheckAudience | null>(() => requestedAudience ?? recovery?.value.audience ?? null);
  const guidance = audience ? audienceGuidance[audience] : null;
  const [restored] = useState(() => readRetainedCheck());
  const initialDraft = restored ?? recovery?.value.draft ?? emptyDraft;
  const [draft, setDraft] = useState<CheckDraft>(initialDraft);
  const [step, setStep] = useState(restored ? 5 : recovery?.value.step ?? 1);
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
  const [selectedSourceLines, setSelectedSourceLines] = useState<number[]>([]), [sourceRemovalPreview, setSourceRemovalPreview] = useState<{ before: CheckDraft; after: CheckDraft; ownerId: string | null } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const sourceLineId = useId();
  const [fact, setFact] = useState(""), [factPermitted, setFactPermitted] = useState(false), [question, setQuestion] = useState("");
  const [googleConsent, setGoogleConsent] = useState(false), [showAccount, setShowAccount] = useState(false);
  const [saveConsent, setSaveConsent] = useState(false), [saved, setSaved] = useState<FreeCvCheck | null>(null), [savedChecks, setSavedChecks] = useState<FreeCvCheck[]>([]), [savedError, setSavedError] = useState("");
  const [savedLoading, setSavedLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null), [resetConfirm, setResetConfirm] = useState(false), [tracked, setTracked] = useState(false);
  const revision = useRef(0), owner = useRef(user?.id ?? null), previousOwner = useRef(user?.id ?? null), mounted = useRef(true);
  const progress = useRef<HTMLElement>(null), intro = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null), factField = useRef<HTMLTextAreaElement>(null);
  owner.current = user?.id ?? null;
  const currentKey = useMemo(() => report ? checkReviewKey(draft, report.methodVersion) : "", [draft, report]);
  const approvalReady = !!approved && approved.key === currentKey;
  const visibleSteps = reuseMode ? [1, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
  const stepIndex = visibleSteps.indexOf(step), stepLabel = (value: number) => reuseMode && value === 1 ? 'Next vacancy' : stepNames[value - 1];

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
  function reset() {
    invalidate(); setDraft(emptyDraft); setStep(1); setReport(null); setReviewStarted(false); setCvReady(false); setFilename(""); setFact(""); setQuestion(""); setFactPermitted(false); setGoogleConsent(false); setShowAccount(false); setResetConfirm(false); setDeleteTarget(null);
    clearCheckRecovery(); setRecoveryConsent(false); setPageTarget(2); setOmitParagraphs([]); setBeforeSelection(null);
    setPreviousSource(null); setPreviousApplication(null);
    setReuseMode(false); setReuseInspect(false);
    setAudience(null);
  }
  function beginAnotherVacancy(previous: CheckDraft, choice: CheckReuseSource, previousFilename = '') {
    if (busy) return;
    try {
      const next = draftForAnotherVacancy(previous, choice);
      try { setPreviousApplication({ draft: validateCheckDraft(draft), filename, pageTarget, ownerId: owner.current, sourceUndo: previousSource, reuseMode }); }
      catch { setPreviousApplication(null); }
      invalidate(); clearCheckRecovery(); setDraft(next); setStep(1); setReport(null); setReviewStarted(false); setCvReady(true); setReuseMode(true); setReuseInspect(false);
      setFilename(choice === 'source' ? previousFilename : ''); setFact(''); setQuestion(''); setFactPermitted(false);
      setGoogleConsent(false); setShowAccount(false); setResetConfirm(false); setDeleteTarget(null); setOmitParagraphs([]); setBeforeSelection(null);
      setPreviousSource(null);
      setNotice(`Your ${choice === 'source' ? 'reviewed source' : 'approved final'} CV is ready to reuse. Add the new role and vacancy below. You can inspect or edit the reused CV before checking. This application needs its own approval; saved checks stay unchanged.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'This CV could not be reused. Review its text first.'); }
  }
  function undoNewApplication() {
    if (busy || !previousApplication || previousApplication.ownerId !== owner.current) return;
    const previous = previousApplication;
    invalidate(); clearCheckRecovery(); setDraft(previous.draft); setFilename(previous.filename); setPageTarget(previous.pageTarget); setCvReady(true); setReuseMode(previous.reuseMode); setReuseInspect(false);
    setReport(analyzeCvEvidence(previous.draft.reviewedText, previous.draft.jobDescription, previous.draft.jobTitle)); setReviewStarted(true); setStep(5); setPreviousApplication(null); setPreviousSource(previous.sourceUndo);
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
    if (authLoading || authError || draftOwner !== (user?.id ?? null)) return;
    try { rememberCheckRecovery({ draft, step, cvReady, filename, ownerId: user?.id ?? null, pageTarget, reviewStarted, ...(reuseMode ? { reuseMode: true } : {}), ...(audience ? { audience } : {}) }, recoveryConsent); }
    catch (failure) { setRecoveryConsent(false); setError(failure instanceof Error ? failure.message : 'Draft recovery is unavailable.'); }
  }, [draft, step, cvReady, filename, user?.id, authLoading, authError, draftOwner, recoveryConsent, pageTarget, reuseMode, audience, reviewStarted]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); const target = step === 1 ? intro.current : heading.current; target?.scrollIntoView?.({ block: "start", behavior: "auto" }); }, [step, focusRequest]);
  useEffect(() => { if (errorField) document.getElementById(fieldIds[errorField])?.focus(); }, [errorField, step, reuseInspect]);
  useEffect(() => {
    if (authLoading || authError) { invalidate(); return; }
    const id = user?.id ?? null;
    if (previousOwner.current !== id) { setBusy(''); setPreviousSource(null); setPreviousApplication(null); setSelectedSourceLines([]); setSourceRemovalPreview(null); }
    if (previousOwner.current && previousOwner.current !== id) {
      revision.current += 1; clearRetainedCheck(); setDraft(emptyDraft); setStep(1); setReport(null); setPreparedFile(null); setApproved(null); setCheckedFacts(false); setCheckedPrivacy(false); setSaved(null); setSaveConsent(false); setCvReady(false); setFilename(""); setFact(""); setQuestion(""); setFactPermitted(false); setTracked(false); setShowAccount(false); setNotice("The account changed. The previous check was cleared from this page."); setError("");
      clearCheckRecovery(); setRecoveryConsent(false); setPageTarget(2); setPdfPreview(null); setPdfError(''); setBeforeSelection(null); setOmitParagraphs([]);
      setSelectedSourceLines([]); setSourceRemovalPreview(null);
      setReuseMode(false); setReuseInspect(false);
      setReviewStarted(false);
      setAudience(null);
    } else if (previousOwner.current !== id) {
      // Email sign-in may adopt the open guest draft, but never its approval.
      invalidate(); setShowAccount(false); setGoogleConsent(false);
      setNotice("Your draft is still here. Review it again before approving a download or saving it.");
    }
    previousOwner.current = id;
    setDraftOwner(id);
    setSavedChecks([]); setSavedError(""); setDeleteTarget(null); setSavedLoading(!!id);
    if (!id) return;
    let active = true;
    void listFreeChecks(id).then(rows => { if (active && owner.current === id) { setSavedChecks(rows); setSavedLoading(false); } }).catch(() => { if (active && owner.current === id) { setSavedError("Saved checks could not be loaded. Your current check and free downloads are still available."); setSavedLoading(false); } });
    return () => { active = false; };
  }, [user?.id, authLoading, authError]);

  function go(next: number) { setError(""); setNotice(""); setStep(next); }
  function checkRole() {
    if (draft.jobTitle.trim().length < 2 || draft.jobTitle.length > 200) { setFieldError('jobTitle', "Enter the role you want to prepare for."); return; }
    try { validateCheckField('company', draft.company); } catch (failure) { showValidationFailure(failure, 'company', 'Review the company name.'); return; }
    go(2);
  }
  async function readFile(file: File | undefined) {
    if (!file || busy) return;
    invalidate(); const atRevision = revision.current, startingOwner = owner.current; setBusy("Reading your CV on this device…"); setCvReady(false);
    try {
      const text = await extractCvText(file);
      if (!mounted.current || revision.current !== atRevision || owner.current !== startingOwner) return;
      setDraft(current => ({ ...current, sourceText: text, reviewedText: "" })); setFilename(file.name); setReviewStarted(false); setReport(null);
      setNotice("Your CV text is ready to check. Fix any reading errors and remove private details. The file is still on your device.");
    } catch (failure) { if (mounted.current && revision.current === atRevision && owner.current === startingOwner) setFieldError('file', failure instanceof Error ? failure.message : "This CV could not be read. Try a readable file or paste text."); }
    finally { if (mounted.current && revision.current === atRevision && owner.current === startingOwner) setBusy(""); }
  }
  function confirmCv() {
    try { const text = validateCheckField('sourceText', draft.sourceText); editDraft({ sourceText: text }); setCvReady(true); go(3); }
    catch (failure) { setFieldError('sourceText', failure instanceof Error ? failure.message : "Review your CV text."); }
  }
  function runCheck() {
    try {
      const valid = validateCheckDraft({ ...draft, reviewedText: reviewStarted ? draft.reviewedText : draft.sourceText });
      const reviewedText = reviewStarted ? valid.reviewedText : prioritizeCvForVacancy(valid.sourceText, analyzeCvEvidence(valid.sourceText, valid.jobDescription, valid.jobTitle));
      invalidate();
      setDraft({ ...valid, reviewedText }); setReport(analyzeCvEvidence(reviewedText, valid.jobDescription, valid.jobTitle)); setReviewStarted(true); setCvReady(true); setStep(4);
    } catch (failure) { showValidationFailure(failure, 'jobDescription', "The check could not complete. Review your inputs and retry."); }
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
    setApproved(null); setCheckedFacts(false); setCheckedPrivacy(false); setPreparedFile(null);
    setBusy('Preparing your exact PDF preview…'); setPdfError('');
    try { const preview = await createReviewedPdfPreview(draft.reviewedText, draft.jobTitle); if (mounted.current && revision.current === atRevision && owner.current === startingOwner) setPdfPreview({ ...preview, key, url: URL.createObjectURL(preview.blob) }); }
    catch (failure) { if (mounted.current && revision.current === atRevision && owner.current === startingOwner) setPdfError(failure instanceof Error ? failure.message : 'PDF preview is unavailable. DOCX and TXT preserve your text.'); }
    finally { if (mounted.current && revision.current === atRevision && owner.current === startingOwner) setBusy(''); }
  }
  function addFact() {
    if (!fact.trim()) { setError("Add your own specific example, or leave this gap unanswered."); return; }
    if (!factPermitted) { setError("Confirm this example is accurate and safe to include."); return; }
    const text = `${draft.reviewedText.trim()}\n\nADDITIONAL EXPERIENCE\n• ${fact.trim()}`;
    try { validateCvText(text); editDraft({ reviewedText: text }); setFact(""); setFactPermitted(false); setQuestion(""); setNotice("Your example is in the draft. Read it in context and make sure it says what you mean."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The example could not be added."); }
  }
  function approve() {
    if (!checkedFacts || !checkedPrivacy || !report) return;
    try { const valid = validateCheckDraft(draft); setApproved({ draft: valid, report, key: checkReviewKey(valid, report.methodVersion), requestId: crypto.randomUUID() }); setNotice("Ready to download. You can also save this version privately if you want to come back to it."); setError(""); setFocusRequest(value => value + 1); }
    catch (failure) { showValidationFailure(failure, 'reviewedText', "Approval could not complete."); }
  }
  async function download(format: DocumentFormat) {
    if (!approvalReady || !approved || busy) return;
    const snapshot = approved, atRevision = revision.current, startingOwner = owner.current;
    setBusy(`Preparing ${format.toUpperCase()}…`); setError("");
    try {
      if (format === 'pdf' && (!pdfPreview || pdfPreview.key !== snapshot.key || pdfPreview.pageCount > pageTarget)) throw new Error('Preview the current PDF within your page target before downloading it. DOCX and TXT remain available.');
      const blob = format === 'pdf' ? pdfPreview!.blob : await createFreeCheckCvBlob({ reviewedText: snapshot.draft.reviewedText, jobTitle: snapshot.draft.jobTitle, approved: true }, format);
      if (!mounted.current || revision.current !== atRevision || owner.current !== startingOwner) return;
      const filename = `${safeDocumentFilename(`CV-${snapshot.draft.jobTitle}`)}.${format}`;
      setPreparedFile({ url: URL.createObjectURL(blob), filename });
      downloadBlob(blob, filename); setNotice(`${format.toUpperCase()} download requested. Check your browser’s downloads.`);
    } catch (failure) { if (mounted.current && revision.current === atRevision && owner.current === startingOwner) setError(failure instanceof Error ? failure.message : "Download failed. Retry or choose TXT."); }
    finally { if (mounted.current && revision.current === atRevision && owner.current === startingOwner) setBusy(""); }
  }
  async function save() {
    if (!approvalReady || !approved || !user || !saveConsent || busy) return;
    const snapshot = approved, id = user.id, atRevision = revision.current;
    setBusy("Saving your private check…"); setError("");
    try {
      const record = await saveFreeCheck(id, { requestId: snapshot.requestId, jobTitle: snapshot.draft.jobTitle, company: snapshot.draft.company, jobDescription: snapshot.draft.jobDescription, originalText: snapshot.draft.sourceText, reviewedText: snapshot.draft.reviewedText, methodVersion: snapshot.report.methodVersion, approved: true });
      if (!mounted.current || owner.current !== id || revision.current !== atRevision) return;
      setSaved(record); setSavedChecks(rows => [record, ...rows.filter(row => row.id !== record.id)]); setNotice("Saved privately in your account for free.");
    } catch (failure) { if (mounted.current && owner.current === id && revision.current === atRevision) setError(failure instanceof Error ? failure.message : "The check could not be saved. Your free downloads remain available."); }
    finally { if (mounted.current && revision.current === atRevision && owner.current === id) setBusy(""); }
  }
  async function saveTracker() {
    if (!user || !approved || !approvalReady || busy || tracked) return;
    const id = user.id, atRevision = revision.current;
    setBusy("Saving the vacancy…"); setError("");
    try { await addApplication(id, { jobTitle: approved.draft.jobTitle, company: approved.draft.company, jobUrl: "" }); if (mounted.current && owner.current === id && revision.current === atRevision) { setTracked(true); setNotice("Vacancy added as Saved. Nothing was submitted to an employer."); } }
    catch (failure) { if (mounted.current && owner.current === id && revision.current === atRevision) setError(failure instanceof Error ? failure.message : "The vacancy could not be saved."); }
    finally { if (mounted.current && revision.current === atRevision && owner.current === id) setBusy(""); }
  }
  function openSaved(record: FreeCvCheck) {
    if (!user || record.user_id !== user.id || busy) return;
    setReuseMode(false); setReuseInspect(false);
    invalidate(); setPreviousSource(null); setPreviousApplication(null); const value: CheckDraft = { jobTitle: record.job_title, company: record.company, sourceText: record.original_text, reviewedText: record.reviewed_text, jobDescription: record.job_description };
    setDraft(value); setCvReady(true); setReviewStarted(true); setReport(analyzeCvEvidence(value.reviewedText, value.jobDescription, value.jobTitle)); setStep(6); setSaved(record); setNotice("Your saved CV is open. We checked its wording again; read it before approving a new download.");
  }
  async function removeSaved(record: FreeCvCheck) {
    if (!user || record.user_id !== user.id || deleteTarget !== record.id || busy) return;
    const id = user.id, atRevision = revision.current; setBusy("Deleting the saved check…"); setError("");
    try { await deleteFreeCheck(record); if (mounted.current && owner.current === id && revision.current === atRevision) { setSavedChecks(rows => rows.filter(row => row.id !== record.id)); if (saved?.id === record.id) setSaved(null); setNotice("Saved check deleted. Files you downloaded are still on your device."); } }
    catch (failure) { if (mounted.current && owner.current === id && revision.current === atRevision) setError(failure instanceof Error ? failure.message : "Deletion failed. Please retry."); }
    finally { if (mounted.current && owner.current === id && revision.current === atRevision) { setBusy(""); setDeleteTarget(null); } }
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

  if (authLoading || authError || draftOwner !== (user?.id ?? null)) return <CheckSessionPending failed={!!authError} />;

  return <main className={`cv-check-page${step === 1 ? ' check-first-step' : ''}`}>
    <Helmet><title>{checkMeta.title}</title><meta name="description" content={checkMeta.description} /><link rel="canonical" href="https://jobvance.io/check" /></Helmet>
    <div ref={intro} className="check-intro"><div><p className="check-eyebrow"><ShieldCheck size={15} /> Free CV check <span>NO CARD NEEDED</span></p><h1>Check your CV against one vacancy.</h1><p className="check-intro-description">See the requirements beside your experience. Review the wording before you download.</p></div>
    </div>
    {resetConfirm && <Alert className="mb-5"><AlertDescription><p>This clears the check open on this page and any temporary sign-in draft. Previously saved account checks stay in your account.</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setResetConfirm(false)}>Keep this check</Button><Button size="sm" onClick={reset}>Clear current check</Button></div></AlertDescription></Alert>}
    <div className="check-layout">
    <aside className="check-sidebar">
      <nav ref={progress} aria-label="Check progress" className="check-progress"><p className="check-rail-title">YOUR APPLICATION</p><ol>{visibleSteps.map((value, i) => <li key={value} aria-current={step === value ? "step" : undefined} data-complete={step > value}>
        {value < step ? <button type="button" disabled={!!busy} onClick={() => go(value)}><span className="check-step-number"><Check size={15} /></span><span>{stepLabel(value)}</span></button> : <div><span className="check-step-number">{String(i + 1).padStart(2,"0")}</span><span>{stepLabel(value)}</span></div>}
      </li>)}</ol><p className="check-rail-caption">Step {stepIndex + 1} of {visibleSteps.length} · English wording analysis · you review every finding</p></nav>
      <div className="check-context"><FileText size={20} /><p className="check-context-title">{draft.jobTitle || "Start with one role"}</p><p>{draft.company || (step === 1 ? "You’ll need your CV and a job description. We’ll walk through them together." : "Company not specified")}</p>{report && <span>{report.summary.total} requirements found in your vacancy</span>}</div>
      <div className="check-privacy"><LockKeyhole size={16} /><p>On your device.<br /><span>Only saved to your account if you choose.</span></p></div>
    </aside>
    <div className="check-workarea">
    {error && <Alert id="check-validation-error" variant="destructive" role="alert" className="mb-5"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <p role="status" className="mb-5 rounded-xl border bg-muted/40 px-4 py-3 text-sm leading-6">{notice}</p>}
    {previousApplication && previousApplication.ownerId === owner.current && <div className="check-undo-application"><Button type="button" variant="outline" disabled={!!busy} onClick={undoNewApplication}>Undo new application</Button><p>Restore the previous CV, vacancy and edits for a fresh review. Undo is kept only on this page; leaving or refreshing loses it.</p></div>}
    {busy && <p role="status" className="mb-4 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />{busy}</p>}
    <Card className="check-stage"><CardContent className="check-stage-content"><div className="check-stage-heading"><span className="check-stage-index">{String(stepIndex + 1).padStart(2,"0")} / {String(visibleSteps.length).padStart(2,"0")}</span><h2 ref={heading} tabIndex={-1} className="outline-none">{stepLabel(step)}</h2><p>{reuseMode && step === 1 ? "Your CV is reused. Add the next role and vacancy together." : ["Only a role title is required here. You’ll add your CV next.","Upload a file or paste your CV, then check the text.","Paste the responsibilities and requirements from the vacancy.","Compare each requirement with the supporting words in your CV.","Edit your CV and work through the questions before approval.","Review the final document, approve it and download."][step-1]}</p></div>
      {step === 1 && <><div className="check-role-fields grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="check-role">Target role</Label><Input id="check-role" {...validationProps('jobTitle')} aria-required="true" placeholder={guidance?.example ?? "e.g. Product manager"} maxLength={200} value={draft.jobTitle} onChange={e => editDraft({ jobTitle: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="check-company">Company (optional)</Label><Input id="check-company" {...validationProps('company')} maxLength={200} value={draft.company} onChange={e => editDraft({ company: e.target.value })} placeholder="Employer name, if you know it" /></div></div>
        {reuseMode && <><div className="space-y-2"><Label htmlFor="check-vacancy">Vacancy description</Label><Textarea id="check-vacancy" {...validationProps('jobDescription')} className="min-h-48 text-sm" maxLength={20000} value={draft.jobDescription} onChange={e => editDraft({ jobDescription: e.target.value })} /><p className="text-xs text-muted-foreground">Paste the new job description, including responsibilities and requirements. At least 80 characters; no employer link is opened.</p></div><details className="check-reused-cv" aria-label="Reused CV" open={reuseInspect} onToggle={event => setReuseInspect(event.currentTarget.open)}><summary>Inspect or edit the reused CV</summary><p>This is the CV version you chose for this application. Check that the facts you need are still here and remove anything private. Edits here apply to this new application; saved checks stay unchanged.</p><div className="space-y-2"><Label htmlFor="check-source">Reused CV text — inspect or edit</Label><Textarea id="check-source" {...validationProps('sourceText')} className="min-h-72 text-sm" maxLength={60000} value={draft.sourceText} disabled={!!busy} onChange={e => { editDraft({ sourceText: e.target.value, reviewedText: '' }); setCvReady(false); }} /><p className="text-xs text-muted-foreground">{draft.sourceText.length.toLocaleString()} / 60,000 characters</p></div></details></>}
        <Button disabled={!!busy} onClick={reuseMode ? runCheck : checkRole}>{reuseMode ? 'Check this next vacancy' : 'Continue to your CV'} <ArrowRight className="ml-2" size={16} /></Button><p className="check-local-note"><LockKeyhole size={15} />No account needed. Your CV and vacancy stay on this device unless you choose to save them.</p></>}
      {step === 2 && <><details className="check-no-cv"><summary>No finished CV yet? Start with your actual facts.</summary><p>You can paste a short career record below: education and its current status, a project or internship, your own contribution, and any measured or estimated result. Keep an unmeasured result labelled. You do not need a formatted CV file.</p><Link to="/help#no-cv">See the starter outline</Link> · <Link to="/help#uploads">Get help with a scanned or unreadable file</Link></details><p className="leading-7 text-muted-foreground">Add your CV as a PDF, Word or text file, up to 5 MB. You can paste it instead. Check the text below and remove anything confidential before continuing.</p><div className="rounded-xl border border-dashed bg-muted/25 p-5"><Label htmlFor="check-file" className="mb-3 flex items-center gap-2"><Upload size={18} /> Read a CV file on this device</Label><Input id="check-file" {...validationProps('file')} type="file" accept=".pdf,.docx,.txt" disabled={!!busy} onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />{filename && <p className="mt-2 break-all text-xs text-muted-foreground">Read: {filename}. The original file is not uploaded by this check.</p>}</div><div className="space-y-2"><Label htmlFor="check-source">CV text — paste, correct or remove private information</Label><Textarea id="check-source" {...validationProps('sourceText')} className="min-h-72 font-mono text-sm" maxLength={60000} value={draft.sourceText} disabled={!!busy} onChange={e => { editDraft({ sourceText: e.target.value, reviewedText: "" }); setCvReady(false); }} /><p className="text-xs text-muted-foreground">{draft.sourceText.length.toLocaleString()} / 60,000 characters · scanned PDFs need readable text first</p></div><Button disabled={!!busy} onClick={confirmCv}>Use this reviewed CV text <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 3 && <><p className="leading-7 text-muted-foreground">Paste the job description, including the responsibilities and requirements. It helps to work with a job you actually want. This check does not open employer links or send applications.</p><div className="space-y-2"><Label htmlFor="check-vacancy">Vacancy description</Label><Textarea id="check-vacancy" {...validationProps('jobDescription')} className="min-h-72 text-sm" maxLength={20000} value={draft.jobDescription} onChange={e => editDraft({ jobDescription: e.target.value })} /><p className="text-xs text-muted-foreground">{draft.jobDescription.length.toLocaleString()} / 20,000 characters · at least 80 characters</p></div><Button disabled={!cvReady || !!busy} onClick={runCheck}>Check these inputs <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 4 && report && <><p className="text-muted-foreground">Read what the employer asks for beside what your CV says. A related phrase may still need a better example.</p><EvidenceResults report={report} originalText={draft.sourceText} /><details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Read the full vacancy</summary><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm">{draft.jobDescription}</pre></details><Button onClick={() => go(5)}>Review my CV & questions <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 5 && report && <><p className="leading-7 text-muted-foreground">Your words are still yours. Relevant bullets may move earlier within the same section, but the facts stay put. Read the whole CV and make any edits you need.</p><div className="space-y-2"><Label htmlFor="check-reviewed">Your CV to review</Label><p className="text-sm leading-6 text-muted-foreground">Read a few lines aloud. Would you say them in an interview? Use a clear verb, explain your part in the work, and keep any dates or numbers exact.</p><Textarea id="check-reviewed" {...validationProps('reviewedText')} className="min-h-80 font-mono text-sm" maxLength={60000} value={draft.reviewedText} disabled={!!busy} onChange={e => editDraft({ reviewedText: e.target.value })} /></div>{sourceReviewControls}<details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Review questions and supporting passages</summary><div className="mt-4"><EvidenceResults report={report} originalText={draft.sourceText} onQuestion={text => { setQuestion(text); factField.current?.focus(); }} /><p className="mt-4 text-xs text-muted-foreground">Made an edit? Continue below to check the new wording.</p></div></details><div className="space-y-3 rounded-xl bg-muted/40 p-5"><h3 className="font-semibold">Have a relevant example to add? (optional)</h3><p className="text-sm leading-6 text-muted-foreground">You do not need to fill every gap. If you helped with a project, say how you helped. Include a figure only if it is accurate and safe to share.</p>{question && <p className="rounded-lg border bg-background p-3 text-sm">{question}</p>}<Label htmlFor="check-fact">Your own truthful example</Label><Textarea ref={factField} id="check-fact" maxLength={3000} value={fact} onChange={e => { setFact(e.target.value); setFactPermitted(false); }} placeholder="Describe your contribution, scope and an accurate outcome in your own words." /><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={factPermitted} onChange={e => setFactPermitted(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />This example is accurate, I have the right to use it, and it is safe to include.</label><Button variant="outline" type="button" onClick={addFact}>Add my example to the CV</Button></div><details className="check-paragraph-selection rounded-xl border p-4"><summary className="cursor-pointer font-medium">Choose whole paragraphs to leave out</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">For a shorter CV, select complete paragraphs yourself. We preserve the retained wording and never invent a replacement. Check that removing a paragraph does not hide an important qualification or change the context.</p><div className="mt-4 space-y-3">{draft.reviewedText.split(/\n\s*\n/).map((paragraph, index) => <label key={index} className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={omitParagraphs.includes(index)} onChange={e => setOmitParagraphs(current => e.target.checked ? [...current, index] : current.filter(item => item !== index))} /><span className="min-w-0"><strong className="text-xs">Leave out paragraph {index + 1}</strong><span className="mt-1 block whitespace-pre-wrap break-words text-sm">{paragraph}</span></span></label>)}</div><Button type="button" variant="outline" className="mt-4" disabled={!omitParagraphs.length} onClick={applyParagraphSelection}>Remove selected paragraphs</Button></details>{beforeSelection !== null && <Button type="button" variant="outline" onClick={() => { const text = beforeSelection; editDraft({ reviewedText: text }); setReport(analyzeCvEvidence(text, draft.jobDescription, draft.jobTitle)); setBeforeSelection(null); setNotice("The paragraph selection was undone. Review the restored CV."); }}>Undo paragraph selection</Button>}<Button onClick={reviewChanges}>Recheck my changes & continue <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 6 && report && <><p className="leading-7 text-muted-foreground">One last read before you download. These findings use your current draft. You are approving the wording, not receiving a qualification certificate.</p><details open className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Final CV preview — review before approval</summary><pre className="check-final-document mt-4 whitespace-pre-wrap break-words font-sans text-sm">{draft.reviewedText}</pre></details>{sourceReviewControls}<section className="check-pdf-preview rounded-xl border p-4" aria-label="PDF layout preview"><h3 className="font-semibold">Review the actual PDF layout</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">PDF downloads use the exact bytes shown here. Choose a maximum length, then preview before approval. DOCX and TXT preserve the same reviewed wording; their layout depends on your reader.</p><div className="mt-4 flex flex-wrap items-center gap-3"><Label htmlFor="check-page-target">Maximum PDF length</Label><select id="check-page-target" className="rounded-lg border bg-white p-2 text-sm" value={pageTarget} onChange={e => { setPageTarget(Number(e.target.value) as 1 | 2); setApproved(null); setCheckedFacts(false); setCheckedPrivacy(false); }}><option value={1}>One page</option><option value={2}>Two pages</option></select><Button type="button" variant="outline" disabled={!!busy} onClick={() => void previewPdf()}>Preview current PDF</Button></div>{pdfError && <p role="status" className="mt-4 text-sm text-amber-950">{pdfError}</p>}{pdfPreview && pdfPreview.key === currentKey && <div className="mt-4"><p className="text-sm">{pdfPreview.pageCount} PDF page{pdfPreview.pageCount === 1 ? "" : "s"} · {pdfPreview.pageCount > pageTarget ? "Above your selected maximum. Return to your review to shorten it, or choose DOCX/TXT." : "Within your selected maximum."}</p><a className="mt-3 inline-block text-sm underline" href={pdfPreview.url} target="_blank" rel="noopener noreferrer">Open the exact PDF preview in a new tab</a><iframe className="check-pdf-frame mt-3" title="Exact PDF preview before approval" src={pdfPreview.url} /></div>}</section><div className="check-final-summary"><FileText size={18} /><div><strong>{report.summary.total} vacancy requirements checked</strong><p>{report.summary.direct} direct wording findings · {report.summary.partial + report.summary.missing + report.summary.review} findings to review. Matching words do not verify qualifications.</p></div></div><details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Evidence from your final CV — review the findings</summary><div className="mt-5"><EvidenceResults report={report} originalText={draft.sourceText} /></div></details><div className="space-y-4 rounded-xl border bg-muted/20 p-5"><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checkedFacts} disabled={!!busy} onChange={e => { setCheckedFacts(e.target.checked); setPreparedFile(null); setApproved(null); }} className="mt-1 h-4 w-4 shrink-0" />I reviewed the complete CV and vacancy. My claims are accurate, and I understand the unresolved questions.</label><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checkedPrivacy} disabled={!!busy} onChange={e => { setCheckedPrivacy(e.target.checked); setPreparedFile(null); setApproved(null); }} className="mt-1 h-4 w-4 shrink-0" />Both my source CV and final CV are safe to include. I removed confidential or unnecessary sensitive information.</label><Button type="button" disabled={!checkedFacts || !checkedPrivacy || !!busy || approvalReady} onClick={approve}><CheckCircle2 size={17} className="mr-2" />{approvalReady ? "Approved by you" : "Approve this CV"}</Button></div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5"><h3 className="flex items-center gap-2 text-lg font-semibold"><Download size={19} /> Download free</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose the format you need. The evidence report is separate, so review questions do not end up in your CV. No account or card needed.</p><div className="mt-4 flex flex-wrap gap-2">{(["pdf", "docx", "txt"] as const).map(format => <Button key={format} variant="outline" disabled={!approvalReady || !!busy || (format === "pdf" && (!pdfPreview || pdfPreview.key !== currentKey || pdfPreview.pageCount > pageTarget))} onClick={() => void download(format)}>Download {format.toUpperCase()}</Button>)}<Button variant="outline" disabled={!approvalReady || !!busy} onClick={() => { if (approved && approvalReady) { const blob = new Blob([createFreeCheckReportText(approved.report, { sourceLabel: "Current reviewed CV; passages added/edited by the user are not independently verified", jobTitle: approved.draft.jobTitle })], { type: "text/plain;charset=utf-8" }); const filename = `${safeDocumentFilename(`Evidence-review-${approved.draft.jobTitle}`)}.txt`; setPreparedFile({ url: URL.createObjectURL(blob), filename }); downloadBlob(blob, filename); setNotice("Evidence report download requested. It is separate from your CV."); } }}>Download evidence report</Button></div>{preparedFile && approvalReady && <p className="mt-4 break-words text-sm leading-6">If the download did not start, <a className="font-medium text-primary underline" href={preparedFile.url} download={preparedFile.filename}>save the prepared file: {preparedFile.filename}</a>. This link is available while this approved check stays open.</p>}</div>
        <section className="check-next-application rounded-xl border p-5" aria-label="Prepare another application"><h3 className="text-lg font-semibold">Your next application</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose the CV to start from, then review it for a new vacancy. This starts a new check. You can undo the replacement while this page stays open; download or save the current check to keep it longer. Saved applications stay unchanged.</p><ReuseCvAction disabled={!approvalReady || !!busy} reviewedAvailable={approvalReady} onReuse={choice => { if (approvalReady) beginAnotherVacancy(draft, choice, filename); }} />{!approvalReady && <p className="mt-2 text-xs text-muted-foreground">Approve the current CV before reusing it.</p>}</section>
        <div className="rounded-xl border p-5"><h3 className="flex items-center gap-2 text-lg font-semibold"><LockKeyhole size={19} /> Save privately (optional)</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Want to come back to this application? Save the job description and both CV versions privately. The original file stays on your device. Saving this check is free.</p>
          {authLoading ? <p role="status" className="mt-4 text-sm">Checking your sign-in…</p> : user ? <><p className="mt-4 text-sm">Signed in as {user.email ?? "your account"}.</p><details className="mt-4 rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Exactly what will be saved</summary><div className="mt-3 space-y-4 text-sm"><p>Role: {draft.jobTitle}. Company: {draft.company || "Not specified"}. Approved by you, with method {report.methodVersion}.</p><h4 className="font-medium">Reviewed source CV</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.sourceText}</pre><h4 className="font-medium">Approved final CV</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.reviewedText}</pre><h4 className="font-medium">Vacancy</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.jobDescription}</pre><p>These are the texts we will store privately with your account in Supabase. We check them again when you reopen the saved version. The original file is not uploaded, and nothing is sent to an employer or advertising service.</p></div></details><label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={saveConsent} disabled={!approvalReady || !!busy} onChange={e => setSaveConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />Save these reviewed texts privately in my account.</label><Button className="mt-4" disabled={!approvalReady || !saveConsent || !!busy || !!saved} onClick={() => void save()}>{saved ? <><Check size={16} className="mr-2" />Saved privately</> : "Save approved check to my account"}</Button><div className="mt-5 border-t pt-4"><Button variant="outline" disabled={!approvalReady || !!busy || tracked} onClick={() => void saveTracker()}>{tracked ? "Vacancy saved in Applications" : "Also add vacancy to Applications"}</Button><p className="mt-2 text-xs text-muted-foreground">You submit separately on the employer’s site. <Link to="/applications" className="underline">Open your tracker</Link>.</p></div></> : <><Button className="mt-4" variant="outline" disabled={!approvalReady || !!busy} onClick={() => setShowAccount(current => !current)}>{showAccount ? "Close account form" : "Sign in or create an account to save"}</Button>{showAccount && <div className="mt-5 space-y-4"><p className="text-sm text-muted-foreground">Email sign-in keeps this page open. Google takes you away, so keeping the draft needs your permission.</p><p className="text-sm leading-6 text-muted-foreground">This tab will hold your CV and job description. Return within 30 minutes to restore them; we clear the copy when you return. If you cancel, clear this check or close the tab. Anyone using this tab may see the draft. You will need to approve it again.</p><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={googleConsent} onChange={e => { setGoogleConsent(e.target.checked); if (!e.target.checked) clearRetainedCheck(); }} className="mt-1 h-4 w-4 shrink-0" />Keep my CV and job description in this tab while I sign in with Google.</label><Auth embedded onBeforeGoogle={() => { try { retainCheckForGoogle(draft, googleConsent); return true; } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-in could not start."); return false; } }} /></div>}</>}
        </div>
      </>}
      {stepIndex > 0 && <div className="border-t pt-5"><Button type="button" variant="ghost" disabled={!!busy} onClick={() => go(visibleSteps[stepIndex - 1])}><ArrowLeft size={16} className="mr-2" />Back to {stepLabel(visibleSteps[stepIndex - 1]).toLowerCase()}</Button></div>}
    </CardContent></Card>
    {guidance && <section className="check-audience-guidance" aria-label={`${guidance.label} guidance`}><details><summary><strong>{guidance.label} guidance</strong><span>Optional</span></summary><p>{guidance.text}</p></details></section>}
    <details className="check-recovery" aria-label="Draft recovery"><summary><strong>Draft recovery (optional)</strong><span>{recoveryConsent ? 'Refresh recovery is on for this tab. Open to change your choice.' : 'Your draft returns when you come back in this tab. Refresh clears it unless you allow temporary storage.'}</span></summary><div><p>Allowing refresh recovery keeps your CV and vacancy in this tab for 30 minutes after your last change. Anyone using this browser tab can access it. Approval is always cleared when a draft is restored. Closing the tab clears the draft; account saving is a separate choice.</p><label><input type="checkbox" checked={recoveryConsent} onChange={e => { setRecoveryConsent(e.target.checked); if (!e.target.checked) clearCheckRecovery(); }} />Keep my draft in this tab across refresh</label></div></details>
    <Button className="check-reset" type="button" variant="ghost" disabled={!!busy} onClick={() => setResetConfirm(true)}>Clear & start again</Button>
    </div></div>
    {user && <section className="mt-8 rounded-xl border bg-white p-5 sm:p-7" aria-label="Your saved free checks"><h2 className="flex items-center gap-2 text-xl font-semibold"><FileText size={20} /> Your saved free checks</h2>{savedError && <p role="alert" className="mt-3 text-sm text-destructive">{savedError}</p>}{savedLoading && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading your saved checks…</p>}{!savedLoading && !savedError && savedChecks.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No free checks saved yet. Saving is optional.</p>}<div className="mt-4 space-y-3">{savedChecks.map(record => <article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><h3 className="font-medium">{record.job_title}</h3><p className="text-xs text-muted-foreground">{record.company || "Company not specified"} · {new Date(record.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy} onClick={() => openSaved(record)}>Open saved check</Button><ReuseCvAction disabled={!!busy} reviewedAvailable={record.status === 'approved'} onReuse={choice => { if (user && record.user_id === user.id && (choice === 'source' || record.status === 'approved')) beginAnotherVacancy({ jobTitle: record.job_title, company: record.company, sourceText: record.original_text, reviewedText: record.reviewed_text, jobDescription: record.job_description }, choice); }} />{deleteTarget === record.id ? <><span className="self-center text-xs">Permanently delete this saved check?</span><Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void removeSaved(record)}>Confirm deletion</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button></> : <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setDeleteTarget(record.id)}>Delete</Button>}</div></article>)}</div></section>}
    <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">You choose the final wording and send the application yourself. <Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/pilot">Explore a CV review</Link></p>
  </main>;
}


