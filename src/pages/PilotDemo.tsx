import { useId, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Download, FileText, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import {
  downloadPilotDemo,
  buildPilotRecruiterDraft,
  pilotCandidate,
  pilotFacts,
  pilotRejectedEdit,
  pilotRestrictedNote,
  pilotRoleDirections,
  type PilotFactId,
  type PilotRole,
} from "@/lib/pilot-demo";

const buttonBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function PilotDemo() {
  const componentId = useId();
  const [role, setRole] = useState<PilotRole>("strategy");
  const [reviewedFacts, setReviewedFacts] = useState<PilotFactId[]>([]);
  const [safeEditReviewed, setSafeEditReviewed] = useState(false);
  const [approved, setApproved] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const direction = pilotRoleDirections[role];
  const readyToApprove = reviewedFacts.length === direction.factOrder.length && safeEditReviewed;

  function clearReview() {
    setReviewedFacts([]);
    setSafeEditReviewed(false);
    setApproved(false);
    setDownloadNotice("");
    setDownloadError("");
  }

  function changeRole(nextRole: PilotRole) {
    if (nextRole === role) return;
    setRole(nextRole);
    clearReview();
  }

  function reviewFact(id: PilotFactId, checked: boolean) {
    setReviewedFacts((current) => checked ? [...current.filter((item) => item !== id), id] : current.filter((item) => item !== id));
    setApproved(false);
    setDownloadNotice("");
    setDownloadError("");
  }

  function download() {
    try {
      downloadPilotDemo(role, approved);
      setDownloadNotice(`Your fictional ${direction.label.toLowerCase()} CV download has started. Nothing was submitted or sent.`);
      setDownloadError("");
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "The example could not be downloaded. Please retry.");
    }
  }

  return (
    <section id="demo" aria-labelledby={`${componentId}-title`} className="scroll-mt-48 sm:scroll-mt-32 rounded-3xl border border-violet-200 bg-[#faf8ff] p-4 text-slate-900 sm:p-7 lg:p-9">
      <div className="max-w-3xl">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold tracking-wide text-violet-800">
          <FileText size={14} aria-hidden="true" /> FICTIONAL CONCEPT DEMO
        </p>
        <h2 id={`${componentId}-title`} className="text-2xl font-semibold tracking-tight sm:text-3xl">Different direction. Same facts.</h2>
        <p className="mt-3 leading-relaxed text-slate-600">Try a prewritten example: select a role, inspect the sources, reject an inflated claim, and approve a fictional CV for download.</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{pilotCandidate.disclosure} This is a static concept demonstration, with no live AI analysis or customer outcome claims.</p>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">01 / Choose a direction</p>
            <h3 className="mt-3 text-xl font-semibold">{pilotCandidate.name} <span className="text-sm font-normal text-slate-500">(fictional)</span></h3>
            <p className="mt-1 text-sm text-slate-600">{pilotCandidate.employers}<br />Both employers are fictional.</p>
            <div role="group" aria-label="Fictional role direction" className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(pilotRoleDirections) as PilotRole[]).map((item) => (
                <button key={item} type="button" aria-pressed={role === item} onClick={() => changeRole(item)} className={`${buttonBase} border ${role === item ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-violet-50"}`}>
                  {role === item && <Check size={16} aria-hidden="true" />}{pilotRoleDirections[item].label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{direction.emphasis}</p>
            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Fictional role brief / Not a live vacancy</p>
              <h4 className="mt-2 text-base font-semibold">{direction.roleTitle}</h4>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">These requirements and evidence labels are prewritten for the example. They are not an automated fit assessment.</p>
              <ul aria-label="Fictional role requirements" className="mt-4 space-y-3">
                {direction.requirements.map((requirement) => (
                  <li key={requirement.label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-800">{requirement.label}</p>
                    <p className={`mt-1 text-xs font-semibold ${requirement.status === "supported" ? "text-emerald-800" : "text-amber-900"}`}>{requirement.status === "supported" ? `Supported · ${requirement.factIds.join(" / ")}` : "Not established from these facts"}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{requirement.explanation}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-white p-5 sm:p-6">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-800"><ShieldCheck size={16} aria-hidden="true" /> 02 / Reject an inflated edit</p>
            <h3 className="mt-3 text-lg font-semibold">The wording we would reject</h3>
            <blockquote className="mt-3 border-l-2 border-rose-300 pl-4 text-sm leading-relaxed text-slate-700">“{pilotRejectedEdit.wording}”</blockquote>
            <ul className="mt-4 space-y-2 pl-5 text-sm leading-relaxed text-slate-600" style={{ listStyleType: "disc" }}>
              {pilotRejectedEdit.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Safe replacement / F-01 · SRC-01</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">{pilotRejectedEdit.replacement}</p>
            </div>
            <button type="button" onClick={() => { setSafeEditReviewed(true); setApproved(false); setDownloadNotice(""); }} disabled={safeEditReviewed} className={`${buttonBase} mt-4 w-full border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100`}>
              {safeEditReviewed ? <><CheckCircle2 size={17} aria-hidden="true" />Safe replacement reviewed</> : <>Keep the safe replacement<ArrowRight size={16} aria-hidden="true" /></>}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">This rejection and its explanation are prewritten for the demo.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={17} aria-hidden="true" />One note stays private</h3>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-600">{pilotRestrictedNote.sourceId} / Fictional disclosure</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700"><strong>{pilotRestrictedNote.value}</strong> — {pilotRestrictedNote.title.toLowerCase()}.</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{pilotRestrictedNote.restriction} This note is excluded from both downloadable examples.</p>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-violet-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">03 / Review the evidence</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${approved ? "bg-emerald-50 text-emerald-800" : "bg-violet-50 text-violet-800"}`}>{approved ? "Approved fictional example" : "Awaiting your review"}</span>
          </div>
          <h3 className="mt-4 text-xl font-semibold">{direction.label} CV preview</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">The three approved facts are reordered for this direction. Check each against its fictional source passage.</p>
          <ol aria-label="Fictional CV facts" className="mt-5 space-y-4">
            {direction.factOrder.map((id) => {
              const fact = pilotFacts[id];
              return (
                <li key={id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500"><span className="font-semibold text-violet-700">{fact.id}</span><span>{fact.employer} · fictional</span></div>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-900">{fact.wording}</p>
                  <details className="mt-3 rounded-lg bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600">Read source passage — {fact.sourceId}</summary>
                    <p className="mt-3 text-xs font-semibold text-slate-600">{fact.sourceTitle}</p>
                    <blockquote className="mt-2 text-sm leading-relaxed text-slate-700">{fact.sourcePassage}</blockquote>
                    <p className="mt-3 text-xs leading-relaxed text-slate-600">Review check: {fact.reviewNote}</p>
                  </details>
                  <label htmlFor={`${componentId}-${id}`} className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-2 text-sm leading-relaxed text-slate-700">
                    <input id={`${componentId}-${id}`} type="checkbox" checked={reviewedFacts.includes(id)} onChange={(event) => reviewFact(id, event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-violet-600 focus-visible:ring-2 focus-visible:ring-violet-600" />
                    <span>I checked {fact.id} against {fact.sourceId}.</span>
                  </label>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Prepared handoff / Prewritten fictional example</p>
            <h4 className="mt-3 text-base font-semibold">Recruiter draft for your review</h4>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Select the draft to copy it. It uses the same three recorded facts and asks about the unestablished requirement. No message is sent from this demo.</p>
            <label htmlFor={`${componentId}-recruiter-draft`} className="mt-4 block text-xs font-medium text-slate-600">Prewritten fictional recruiter draft</label>
            <textarea id={`${componentId}-recruiter-draft`} readOnly value={buildPilotRecruiterDraft(role)} rows={12} className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600" />
            <h4 className="mt-4 text-sm font-semibold text-slate-800">Proposed next step</h4>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{direction.nextStep}</p>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">The approved text download includes this role brief, the CV examples, this draft and the proposed next step.</p>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <p role="status" className="text-sm text-slate-600">{reviewedFacts.length} of 3 facts reviewed. {safeEditReviewed ? "Safe replacement reviewed." : "Review the safe replacement before approving."}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button type="button" disabled={!readyToApprove || approved} onClick={() => setApproved(true)} className={`${buttonBase} bg-violet-600 text-white hover:bg-violet-700`}>
                <CheckCircle2 size={17} aria-hidden="true" />{approved ? "Fictional CV approved" : "Approve fictional CV"}
              </button>
              <button type="button" disabled={!approved} onClick={download} className={`${buttonBase} border border-violet-200 bg-white text-violet-900 hover:bg-violet-50`}>
                <Download size={17} aria-hidden="true" />Download fictional CV (.txt)
              </button>
              <button type="button" onClick={clearReview} className={`${buttonBase} text-slate-600 hover:bg-slate-50`}><RotateCcw size={16} aria-hidden="true" />Reset review</button>
            </div>
            {downloadNotice && <p role="status" className="mt-4 text-sm leading-relaxed text-emerald-800">{downloadNotice}</p>}
            {downloadError && <p role="alert" className="mt-4 text-sm leading-relaxed text-rose-800">{downloadError}</p>}
            <p className="mt-4 text-xs leading-relaxed text-slate-500">The download is a clearly labeled fictional text document. Review choices stay only in this page’s memory and reset when you reload. It submits no application and sends no message.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
