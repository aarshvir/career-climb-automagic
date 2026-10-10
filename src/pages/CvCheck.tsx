import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
import { checkReviewKey, clearRetainedCheck, retainCheckForGoogle, readRetainedCheck, validateCheckDraft, type CheckDraft } from "@/lib/check-draft";
import { deleteFreeCheck, listFreeChecks, saveFreeCheck, type FreeCvCheck } from "@/lib/free-check-api";
import { createFreeCheckCvBlob, createFreeCheckReportText } from "@/lib/free-check-export";
import { downloadBlob, safeDocumentFilename } from "@/lib/document-download";
import { addApplication } from "@/lib/workspace-api";
import type { DocumentFormat } from "@/lib/document-export";
import "./CvCheck.css";

const emptyDraft: CheckDraft = { jobTitle: "", company: "", sourceText: "", reviewedText: "", jobDescription: "" };
const stepNames = ["Your role", "Your CV", "One vacancy", "The evidence", "Your review", "Approve & download"];
const statusLabels: Record<EvidenceStatus, string> = {
  direct: "Direct wording found", partial: "Related passage — review needed", missing: "No passage found", review: "Needs manual review",
};
const statusStyles: Record<EvidenceStatus, string> = {
  direct: "border-emerald-200 bg-emerald-50 text-emerald-950", partial: "border-amber-200 bg-amber-50 text-amber-950",
  missing: "border-slate-200 bg-slate-50 text-slate-800", review: "border-blue-200 bg-blue-50 text-blue-950",
};
type ApprovedCheck = { draft: CheckDraft; report: EvidenceReport; key: string; requestId: string };

function Finding({ item, originalText, onQuestion }: { item: EvidenceRequirement; originalText: string; onQuestion?: (question: string) => void }) {
  return <article className={`check-finding check-finding-${item.status}`} aria-label={`Vacancy finding: ${item.vacancyQuote}`}>
    <span className={`check-finding-status inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[item.status]}`}>{item.status === "direct" ? <CheckCircle2 size={13} /> : <FileText size={13} />}{statusLabels[item.status]}</span>
    <div className="check-quote-grid">
      <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In the vacancy</h4><blockquote className="mt-2 whitespace-pre-wrap break-words text-sm">{item.vacancyQuote}</blockquote></div>
      <div><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In your CV</h4>
        {item.evidence.length ? item.evidence.map(passage => <div key={`${passage.start}-${passage.end}`} className="check-cv-passage">
          <blockquote className="whitespace-pre-wrap break-words text-sm">{passage.cvQuote}</blockquote>
          <p className="mt-2 text-xs text-muted-foreground">Line {passage.line} · {originalText.includes(passage.cvQuote) ? "From your reviewed source CV" : "Added or edited by you during this check"}</p>
        </div>) : <p className="mt-2 text-sm text-muted-foreground">No clear example showed up in this CV. If you have one, you can add it during the review.</p>}
      </div>
    </div>
    <p className="mt-4 text-sm text-muted-foreground">{item.explanation}</p>
    {item.matchedTerms.length > 0 && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Words used in this comparison</summary><p className="mt-2">{item.matchedTerms.join(", ")}</p></details>}
    {item.status !== "direct" && <div className="mt-4 rounded-lg border border-dashed p-3">
      <p className="text-sm">{item.question}</p>
      {onQuestion && <Button type="button" variant="link" className="mt-1 h-auto whitespace-normal px-0 text-left" onClick={() => onQuestion(item.question)}>Add a truthful example, if you have one</Button>}
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
  const { user, loading: authLoading } = useAuth();
  const [restored] = useState(() => readRetainedCheck());
  const [draft, setDraft] = useState<CheckDraft>(restored ?? emptyDraft);
  const [step, setStep] = useState(restored ? 5 : 1);
  const [report, setReport] = useState<EvidenceReport | null>(() => restored ? analyzeCvEvidence(restored.reviewedText, restored.jobDescription) : null);
  const [approved, setApproved] = useState<ApprovedCheck | null>(null);
  const [preparedFile, setPreparedFile] = useState<{ url: string; filename: string } | null>(null);
  const [checkedFacts, setCheckedFacts] = useState(false), [checkedPrivacy, setCheckedPrivacy] = useState(false);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(restored ? "Your check is back. We cleared the temporary tab copy. Read it again before you approve." : "");
  const [cvReady, setCvReady] = useState(!!restored), [filename, setFilename] = useState("");
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

  function invalidate() {
    revision.current += 1; setPreparedFile(null); setApproved(null); setCheckedFacts(false); setCheckedPrivacy(false); setSaveConsent(false); setSaved(null); setTracked(false); setError(""); setNotice("");
    clearRetainedCheck();
  }
  function editDraft(patch: Partial<CheckDraft>) { invalidate(); setDraft(current => ({ ...current, ...patch })); }
  function reset() {
    invalidate(); setDraft(emptyDraft); setStep(1); setReport(null); setCvReady(false); setFilename(""); setFact(""); setQuestion(""); setFactPermitted(false); setGoogleConsent(false); setShowAccount(false); setResetConfirm(false); setDeleteTarget(null);
  }
  useEffect(() => {
    mounted.current = true; clearRetainedCheck();
    return () => { mounted.current = false; revision.current += 1; };
  }, []);
  useEffect(() => () => { if (preparedFile) URL.revokeObjectURL(preparedFile.url); }, [preparedFile]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); const target = step === 1 ? intro.current : progress.current; target?.scrollIntoView?.({ block: "start", behavior: "auto" }); }, [step]);
  useEffect(() => {
    const id = user?.id ?? null;
    if (previousOwner.current && previousOwner.current !== id) {
      revision.current += 1; clearRetainedCheck(); setDraft(emptyDraft); setStep(1); setReport(null); setPreparedFile(null); setApproved(null); setCheckedFacts(false); setCheckedPrivacy(false); setSaved(null); setSaveConsent(false); setCvReady(false); setFilename(""); setFact(""); setQuestion(""); setFactPermitted(false); setTracked(false); setShowAccount(false); setNotice("The account changed. The previous check was cleared from this page."); setError("");
    }
    previousOwner.current = id;
    setSavedChecks([]); setSavedError(""); setDeleteTarget(null); setSavedLoading(!!id);
    if (!id) return;
    let active = true;
    void listFreeChecks(id).then(rows => { if (active && owner.current === id) { setSavedChecks(rows); setSavedLoading(false); } }).catch(() => { if (active && owner.current === id) { setSavedError("Saved checks could not be loaded. Your current check and free downloads are still available."); setSavedLoading(false); } });
    return () => { active = false; };
  }, [user?.id]);

  function go(next: number) { setError(""); setNotice(""); setStep(next); }
  function checkRole() {
    if (draft.jobTitle.trim().length < 2 || draft.jobTitle.length > 200) { setError("Enter the role you want to prepare for."); return; }
    go(2);
  }
  async function readFile(file: File | undefined) {
    if (!file || busy) return;
    invalidate(); const atRevision = revision.current; setBusy("Reading your CV on this device…"); setCvReady(false);
    try {
      const text = await extractCvText(file);
      if (!mounted.current || revision.current !== atRevision) return;
      setDraft(current => ({ ...current, sourceText: text, reviewedText: "" })); setFilename(file.name);
      setNotice("Your CV text is ready to check. Fix any reading errors and remove private details. The file is still on your device.");
    } catch (failure) { if (mounted.current && revision.current === atRevision) setError(failure instanceof Error ? failure.message : "This CV could not be read. Try a readable file or paste text."); }
    finally { if (mounted.current) setBusy(""); }
  }
  function confirmCv() {
    try { const text = validateCvText(draft.sourceText); editDraft({ sourceText: text, reviewedText: text }); setCvReady(true); go(3); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Review your CV text."); }
  }
  function runCheck() {
    try {
      const valid = validateCheckDraft({ ...draft, reviewedText: draft.sourceText });
      invalidate(); const result = analyzeCvEvidence(valid.sourceText, valid.jobDescription);
      setDraft({ ...valid, reviewedText: prioritizeCvForVacancy(valid.sourceText, result) }); setReport(analyzeCvEvidence(prioritizeCvForVacancy(valid.sourceText, result), valid.jobDescription)); setStep(4);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The check could not complete. Review your inputs and retry."); }
  }
  function reviewChanges() {
    try { const valid = validateCheckDraft(draft); invalidate(); setDraft(valid); setReport(analyzeCvEvidence(valid.reviewedText, valid.jobDescription)); go(6); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Review the CV before continuing."); }
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
    try { const valid = validateCheckDraft(draft); setApproved({ draft: valid, report, key: checkReviewKey(valid, report.methodVersion), requestId: crypto.randomUUID() }); setNotice("Ready to download. You can also save this version privately if you want to come back to it."); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Approval could not complete."); }
  }
  async function download(format: DocumentFormat) {
    if (!approvalReady || !approved || busy) return;
    const snapshot = approved, atRevision = revision.current, startingOwner = owner.current;
    setBusy(`Preparing ${format.toUpperCase()}…`); setError("");
    try {
      const blob = await createFreeCheckCvBlob({ reviewedText: snapshot.draft.reviewedText, jobTitle: snapshot.draft.jobTitle, approved: true }, format);
      if (!mounted.current || revision.current !== atRevision || owner.current !== startingOwner) return;
      const filename = `${safeDocumentFilename(`CV-${snapshot.draft.jobTitle}`)}.${format}`;
      setPreparedFile({ url: URL.createObjectURL(blob), filename });
      downloadBlob(blob, filename); setNotice(`${format.toUpperCase()} download requested. Check your browser’s downloads.`);
    } catch (failure) { if (mounted.current && revision.current === atRevision) setError(failure instanceof Error ? failure.message : "Download failed. Retry or choose TXT."); }
    finally { if (mounted.current) setBusy(""); }
  }
  async function save() {
    if (!approvalReady || !approved || !user || !saveConsent || busy) return;
    const snapshot = approved, id = user.id, atRevision = revision.current;
    setBusy("Saving your private check…"); setError("");
    try {
      const record = await saveFreeCheck(id, { requestId: snapshot.requestId, jobTitle: snapshot.draft.jobTitle, company: snapshot.draft.company, jobDescription: snapshot.draft.jobDescription, originalText: snapshot.draft.sourceText, reviewedText: snapshot.draft.reviewedText, methodVersion: snapshot.report.methodVersion, approved: true });
      if (!mounted.current || owner.current !== id || revision.current !== atRevision) return;
      setSaved(record); setSavedChecks(rows => [record, ...rows.filter(row => row.id !== record.id)]); setNotice("Saved privately in your account. No pack credit was used.");
    } catch (failure) { if (mounted.current && owner.current === id && revision.current === atRevision) setError(failure instanceof Error ? failure.message : "The check could not be saved. Your free downloads remain available."); }
    finally { if (mounted.current) setBusy(""); }
  }
  async function saveTracker() {
    if (!user || !approved || !approvalReady || busy || tracked) return;
    const id = user.id, atRevision = revision.current;
    setBusy("Saving the vacancy…"); setError("");
    try { await addApplication(id, { jobTitle: approved.draft.jobTitle, company: approved.draft.company, jobUrl: "" }); if (mounted.current && owner.current === id && revision.current === atRevision) { setTracked(true); setNotice("Vacancy added as Saved. Nothing was submitted to an employer."); } }
    catch (failure) { if (mounted.current && owner.current === id && revision.current === atRevision) setError(failure instanceof Error ? failure.message : "The vacancy could not be saved."); }
    finally { if (mounted.current) setBusy(""); }
  }
  function openSaved(record: FreeCvCheck) {
    if (!user || record.user_id !== user.id || busy) return;
    invalidate(); const value: CheckDraft = { jobTitle: record.job_title, company: record.company, sourceText: record.original_text, reviewedText: record.reviewed_text, jobDescription: record.job_description };
    setDraft(value); setCvReady(true); setReport(analyzeCvEvidence(value.reviewedText, value.jobDescription)); setStep(6); setSaved(record); setNotice("Your saved CV is open. We checked its wording again; read it before approving a new download.");
  }
  async function removeSaved(record: FreeCvCheck) {
    if (!user || record.user_id !== user.id || deleteTarget !== record.id || busy) return;
    const id = user.id; setBusy("Deleting the saved check…"); setError("");
    try { await deleteFreeCheck(record); if (mounted.current && owner.current === id) { setSavedChecks(rows => rows.filter(row => row.id !== record.id)); if (saved?.id === record.id) setSaved(null); setNotice("Saved check deleted. Files you downloaded are still on your device."); } }
    catch (failure) { if (mounted.current && owner.current === id) setError(failure instanceof Error ? failure.message : "Deletion failed. Please retry."); }
    finally { if (mounted.current) { setBusy(""); setDeleteTarget(null); } }
  }

  return <main className="cv-check-page">
    <Helmet><title>Free CV-to-vacancy evidence check | Jobvance</title><meta name="description" content="Compare a real CV with one vacancy, review the source passages and questions, and download your approved CV for free." /><link rel="canonical" href="https://jobvance.io/check" /></Helmet>
    <div ref={intro} className="check-intro"><div><p className="check-eyebrow"><ShieldCheck size={15} /> Free CV check <span>NO CARD NEEDED</span></p><h1>One vacancy.<br className="check-mobile-break" /> Your actual experience.</h1><p className="check-intro-description">Check how your experience comes across for this job. Keep what fits, and work through anything unclear.</p></div>
      <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setResetConfirm(true)}>Clear & start again</Button>
    </div>
    {resetConfirm && <Alert className="mb-5"><AlertDescription><p>This clears the check open on this page and any temporary sign-in draft. Previously saved account checks stay in your account.</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setResetConfirm(false)}>Keep this check</Button><Button size="sm" onClick={reset}>Clear current check</Button></div></AlertDescription></Alert>}
    <div className="check-layout">
    <aside className="check-sidebar">
      <nav ref={progress} aria-label="Check progress" className="check-progress"><p className="check-rail-title">YOUR APPLICATION</p><ol>{stepNames.map((name, i) => <li key={name} aria-current={step === i + 1 ? "step" : undefined} data-complete={step > i + 1}>
        {i + 1 < step ? <button type="button" disabled={!!busy} onClick={() => go(i + 1)}><span className="check-step-number"><Check size={15} /></span><span>{name}</span></button> : <div><span className="check-step-number">{String(i + 1).padStart(2,"0")}</span><span>{name}</span></div>}
      </li>)}</ol><p className="check-rail-caption">Step {step} of 6 · English wording analysis · you review every finding</p></nav>
      <div className="check-context"><FileText size={20} /><p className="check-context-title">{draft.jobTitle || "Start with one role"}</p><p>{draft.company || (step === 1 ? "You’ll need your CV and a job description. We’ll walk through them together." : "Company not specified")}</p>{report && <span>{report.summary.total} requirements found in your vacancy</span>}</div>
      <div className="check-privacy"><LockKeyhole size={16} /><p>On your device.<br /><span>Only saved to your account if you choose.</span></p></div>
    </aside>
    <div className="check-workarea">
    {error && <Alert variant="destructive" role="alert" className="mb-5"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <p role="status" className="mb-5 rounded-xl border bg-muted/40 px-4 py-3 text-sm leading-6">{notice}</p>}
    {busy && <p role="status" className="mb-4 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />{busy}</p>}
    <Card className="check-stage"><CardContent className="check-stage-content"><div className="check-stage-heading"><span className="check-stage-index">{String(step).padStart(2,"0")} / 06</span><h2 ref={heading} tabIndex={-1} className="outline-none">{stepNames[step - 1]}</h2><p>{["Give this application a clear starting point.","Bring your experience into the picture.","The opportunity you want to prepare for.","Follow the words back to their source.","Make it a CV you can explain in person.","Your final call. Your document to send."][step-1]}</p></div>
      {step === 1 && <><p className="leading-7 text-muted-foreground">Which job do you have in mind? Use the title from the job description.</p><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="check-role">Target role</Label><Input id="check-role" placeholder="e.g. Strategy Manager or Transformation Manager" maxLength={200} value={draft.jobTitle} onChange={e => editDraft({ jobTitle: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="check-company">Company (optional)</Label><Input id="check-company" maxLength={200} value={draft.company} onChange={e => editDraft({ company: e.target.value })} placeholder="The employer for this vacancy" /></div></div><p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"><LockKeyhole size={16} className="mt-1 shrink-0" />Your CV and job description stay on this device unless you choose to save them to your account. Keep this page open while you work; refreshing it clears an unsaved check.</p><Button onClick={checkRole}>Continue to your CV <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 2 && <><p className="leading-7 text-muted-foreground">Add your CV as a PDF, Word or text file, up to 5 MB. You can paste it instead. Check the text below and remove anything confidential before continuing.</p><div className="rounded-xl border border-dashed bg-muted/25 p-5"><Label htmlFor="check-file" className="mb-3 flex items-center gap-2"><Upload size={18} /> Read a CV file on this device</Label><Input id="check-file" type="file" accept=".pdf,.docx,.txt" disabled={!!busy} onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />{filename && <p className="mt-2 break-all text-xs text-muted-foreground">Read: {filename}. The original file is not uploaded by this check.</p>}</div><div className="space-y-2"><Label htmlFor="check-source">CV text — paste, correct or remove private information</Label><Textarea id="check-source" className="min-h-72 font-mono text-sm" maxLength={60000} value={draft.sourceText} disabled={!!busy} onChange={e => { editDraft({ sourceText: e.target.value, reviewedText: "" }); setCvReady(false); }} /><p className="text-xs text-muted-foreground">{draft.sourceText.length.toLocaleString()} / 60,000 characters · scanned PDFs need readable text first</p></div><Button disabled={!!busy} onClick={confirmCv}>Use this reviewed CV text <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 3 && <><p className="leading-7 text-muted-foreground">Paste the job description, including the responsibilities and requirements. It helps to work with a job you actually want. This check does not open employer links or send applications.</p><div className="space-y-2"><Label htmlFor="check-vacancy">Vacancy description</Label><Textarea id="check-vacancy" className="min-h-72 text-sm" maxLength={20000} value={draft.jobDescription} onChange={e => editDraft({ jobDescription: e.target.value })} /><p className="text-xs text-muted-foreground">{draft.jobDescription.length.toLocaleString()} / 20,000 characters · at least 80 characters</p></div><Button disabled={!cvReady || !!busy} onClick={runCheck}>Check these inputs <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 4 && report && <><p className="text-muted-foreground">Read what the employer asks for beside what your CV says. A related phrase may still need a better example.</p><EvidenceResults report={report} originalText={draft.sourceText} /><details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Read the full vacancy</summary><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm">{draft.jobDescription}</pre></details><Button onClick={() => go(5)}>Review my CV & questions <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 5 && report && <><p className="leading-7 text-muted-foreground">Your words are still yours. Relevant bullets may move earlier within the same section, but the facts stay put. Read the whole CV and make any edits you need.</p><div className="space-y-2"><Label htmlFor="check-reviewed">Your CV to review</Label><p className="text-sm leading-6 text-muted-foreground">Read a few lines aloud. Would you say them in an interview? Use a clear verb, explain your part in the work, and keep any dates or numbers exact.</p><Textarea id="check-reviewed" className="min-h-80 font-mono text-sm" maxLength={60000} value={draft.reviewedText} disabled={!!busy} onChange={e => editDraft({ reviewedText: e.target.value })} /></div><details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Review questions and supporting passages</summary><div className="mt-4"><EvidenceResults report={report} originalText={draft.sourceText} onQuestion={text => { setQuestion(text); factField.current?.focus(); }} /><p className="mt-4 text-xs text-muted-foreground">Made an edit? Continue below to check the new wording.</p></div></details><div className="space-y-3 rounded-xl bg-muted/40 p-5"><h3 className="font-semibold">Have a relevant example to add? (optional)</h3><p className="text-sm leading-6 text-muted-foreground">You do not need to fill every gap. If you helped with a project, say how you helped. Include a figure only if it is accurate and safe to share.</p>{question && <p className="rounded-lg border bg-background p-3 text-sm">{question}</p>}<Label htmlFor="check-fact">Your own truthful example</Label><Textarea ref={factField} id="check-fact" maxLength={3000} value={fact} onChange={e => { setFact(e.target.value); setFactPermitted(false); }} placeholder="Describe your contribution, scope and an accurate outcome in your own words." /><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={factPermitted} onChange={e => setFactPermitted(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />This example is accurate, I have the right to use it, and it is safe to include.</label><Button variant="outline" type="button" onClick={addFact}>Add my example to the CV</Button></div><Button onClick={reviewChanges}>Recheck my changes & continue <ArrowRight className="ml-2" size={16} /></Button></>}
      {step === 6 && report && <><p className="leading-7 text-muted-foreground">One last read before you download. These findings use your current draft. You are approving the wording, not receiving a qualification certificate.</p><details open className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Final CV preview — review before approval</summary><pre className="check-final-document mt-4 whitespace-pre-wrap break-words font-sans text-sm">{draft.reviewedText}</pre></details><div className="check-final-summary"><FileText size={18} /><div><strong>{report.summary.total} vacancy requirements checked</strong><p>{report.summary.direct} direct wording findings · {report.summary.partial + report.summary.missing + report.summary.review} findings to review. Matching words do not verify qualifications.</p></div></div><details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Evidence from your final CV — review the findings</summary><div className="mt-5"><EvidenceResults report={report} originalText={draft.sourceText} /></div></details><div className="space-y-4 rounded-xl border bg-muted/20 p-5"><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checkedFacts} disabled={!!busy} onChange={e => { setCheckedFacts(e.target.checked); setPreparedFile(null); setApproved(null); }} className="mt-1 h-4 w-4 shrink-0" />I reviewed the complete CV and vacancy. My claims are accurate, and I understand the unresolved questions.</label><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checkedPrivacy} disabled={!!busy} onChange={e => { setCheckedPrivacy(e.target.checked); setPreparedFile(null); setApproved(null); }} className="mt-1 h-4 w-4 shrink-0" />Both my source CV and final CV are safe to include. I removed confidential or unnecessary sensitive information.</label><Button type="button" disabled={!checkedFacts || !checkedPrivacy || !!busy || approvalReady} onClick={approve}><CheckCircle2 size={17} className="mr-2" />{approvalReady ? "Approved by you" : "Approve this CV"}</Button></div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5"><h3 className="flex items-center gap-2 text-lg font-semibold"><Download size={19} /> Download free</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose the format you need. The evidence report is separate, so review questions do not end up in your CV. No account or card needed.</p><div className="mt-4 flex flex-wrap gap-2">{(["pdf", "docx", "txt"] as const).map(format => <Button key={format} variant="outline" disabled={!approvalReady || !!busy} onClick={() => void download(format)}>Download {format.toUpperCase()}</Button>)}<Button variant="outline" disabled={!approvalReady || !!busy} onClick={() => { if (approved && approvalReady) { const blob = new Blob([createFreeCheckReportText(approved.report, { sourceLabel: "Current reviewed CV; passages added/edited by the user are not independently verified", jobTitle: approved.draft.jobTitle })], { type: "text/plain;charset=utf-8" }); const filename = `${safeDocumentFilename(`Evidence-review-${approved.draft.jobTitle}`)}.txt`; setPreparedFile({ url: URL.createObjectURL(blob), filename }); downloadBlob(blob, filename); setNotice("Evidence report download requested. It is separate from your CV."); } }}>Download evidence report</Button></div>{preparedFile && approvalReady && <p className="mt-4 break-words text-sm leading-6">If the download did not start, <a className="font-medium text-primary underline" href={preparedFile.url} download={preparedFile.filename}>save the prepared file: {preparedFile.filename}</a>. This link is available while this approved check stays open.</p>}</div>
        <div className="rounded-xl border p-5"><h3 className="flex items-center gap-2 text-lg font-semibold"><LockKeyhole size={19} /> Save privately (optional)</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Want to come back to this application? Save the job description and both CV versions privately. The original file stays on your device, and saving uses no pack credit.</p>
          {authLoading ? <p role="status" className="mt-4 text-sm">Checking your sign-in…</p> : user ? <><p className="mt-4 text-sm">Signed in as {user.email ?? "your account"}.</p><details className="mt-4 rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Exactly what will be saved</summary><div className="mt-3 space-y-4 text-sm"><p>Role: {draft.jobTitle}. Company: {draft.company || "Not specified"}. Approved by you, with method {report.methodVersion}.</p><h4 className="font-medium">Reviewed source CV</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.sourceText}</pre><h4 className="font-medium">Approved final CV</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.reviewedText}</pre><h4 className="font-medium">Vacancy</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{draft.jobDescription}</pre><p>These are the texts we will store privately with your account in Supabase. We check them again when you reopen the saved version. The original file is not uploaded, and nothing is sent to an employer or advertising service.</p></div></details><label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={saveConsent} disabled={!approvalReady || !!busy} onChange={e => setSaveConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />Save these reviewed texts privately in my account.</label><Button className="mt-4" disabled={!approvalReady || !saveConsent || !!busy || !!saved} onClick={() => void save()}>{saved ? <><Check size={16} className="mr-2" />Saved privately</> : "Save approved check to my account"}</Button><div className="mt-5 border-t pt-4"><Button variant="outline" disabled={!approvalReady || !!busy || tracked} onClick={() => void saveTracker()}>{tracked ? "Vacancy saved in Applications" : "Also add vacancy to Applications"}</Button><p className="mt-2 text-xs text-muted-foreground">You submit separately on the employer’s site. <Link to="/applications" className="underline">Open your tracker</Link>.</p></div></> : <><Button className="mt-4" variant="outline" disabled={!approvalReady || !!busy} onClick={() => setShowAccount(current => !current)}>{showAccount ? "Close account form" : "Sign in or create an account to save"}</Button>{showAccount && <div className="mt-5 space-y-4"><p className="text-sm text-muted-foreground">Email sign-in keeps this page open. Google takes you away, so keeping the draft needs your permission.</p><p className="text-sm leading-6 text-muted-foreground">This tab will hold your CV and job description. Return within 30 minutes to restore them; we clear the copy when you return. If you cancel, clear this check or close the tab. Anyone using this tab may see the draft. You will need to approve it again.</p><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={googleConsent} onChange={e => { setGoogleConsent(e.target.checked); if (!e.target.checked) clearRetainedCheck(); }} className="mt-1 h-4 w-4 shrink-0" />Keep my CV and job description in this tab while I sign in with Google.</label><Auth embedded onBeforeGoogle={() => { try { retainCheckForGoogle(draft, googleConsent); return true; } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-in could not start."); return false; } }} /></div>}</>}
        </div>
      </>}
      {step > 1 && <div className="border-t pt-5"><Button type="button" variant="ghost" disabled={!!busy} onClick={() => go(step - 1)}><ArrowLeft size={16} className="mr-2" />Back to {stepNames[step - 2].toLowerCase()}</Button></div>}
    </CardContent></Card>
    </div></div>
    {user && <section className="mt-8 rounded-xl border bg-white p-5 sm:p-7" aria-label="Your saved free checks"><h2 className="flex items-center gap-2 text-xl font-semibold"><FileText size={20} /> Your saved free checks</h2>{savedError && <p role="alert" className="mt-3 text-sm text-destructive">{savedError}</p>}{savedLoading && <p role="status" className="mt-3 text-sm text-muted-foreground">Loading your saved checks…</p>}{!savedLoading && !savedError && savedChecks.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No free checks saved yet. Saving is optional.</p>}<div className="mt-4 space-y-3">{savedChecks.map(record => <article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><h3 className="font-medium">{record.job_title}</h3><p className="text-xs text-muted-foreground">{record.company || "Company not specified"} · {new Date(record.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy} onClick={() => openSaved(record)}>Open saved check</Button>{deleteTarget === record.id ? <><span className="self-center text-xs">Permanently delete this saved check?</span><Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void removeSaved(record)}>Confirm deletion</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button></> : <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setDeleteTarget(record.id)}>Delete</Button>}</div></article>)}</div></section>}
    <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">You choose the final wording and send the application yourself. <Link className="underline" to="/privacy">Privacy</Link> · <Link className="underline" to="/pilot">See the clearly labelled fictional pilot demo</Link></p>
  </main>;
}

