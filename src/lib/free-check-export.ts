import type { EvidenceReport } from "./cv-evidence";
import { createReviewedCvBlob, type DocumentFormat } from "./document-export";
import { downloadBlob, safeDocumentFilename } from "./document-download";

export type ApprovedFreeCheckSnapshot = { reviewedText: string; jobTitle: string; approved: boolean };
export type FreeCheckReportOptions = { sourceLabel: string; jobTitle: string; coverageBefore?: EvidenceReport['summary'] };

export async function createFreeCheckCvBlob(snapshot: ApprovedFreeCheckSnapshot, format: DocumentFormat): Promise<Blob> {
  if (!snapshot.approved) throw new Error("Review and approve your current CV text before downloading it.");
  return createReviewedCvBlob(snapshot.reviewedText, format, snapshot.jobTitle);
}

/** Public local export: no account, billing API, evidence verdicts or gap notes enter the CV. */
export async function downloadFreeCheckCv(snapshot: ApprovedFreeCheckSnapshot, format: DocumentFormat): Promise<void> {
  const blob = await createFreeCheckCvBlob(snapshot, format);
  downloadBlob(blob, `${safeDocumentFilename(`CV-${snapshot.jobTitle}`)}.${format}`);
}

function noteText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "";
}

/** Evidence notes remain in a separate explicitly labeled report, never in the CV. */
export function createFreeCheckReportText(report: EvidenceReport, options: FreeCheckReportOptions): string {
  if (!options.sourceLabel.trim()) throw new Error("Label whether this report checks the original or current reviewed CV.");
  const lines = [
    "JOBVANCE — CV EVIDENCE REVIEW REPORT",
    `Role: ${options.jobTitle}`,
    `CV text checked: ${options.sourceLabel}`,
    `Method: ${report.methodVersion}`,
    `Scope: ${noteText(report.scope)}`,
    "",
    "This report describes evidence found in the selected CV text. User additions and edits to a reviewed CV remain user-provided claims, not independently verified facts.",
    "A missing requirement is not established by this CV text. It is not an instruction to add an unsupported claim.",
    "",
    "REQUIREMENT REVIEW",
  ];
  for (const requirement of report.requirements) {
    lines.push(
      "",
      `${requirement.id}: ${requirement.status}`,
      `Vacancy passage: ${requirement.vacancyQuote}`,
      `Explanation: ${requirement.explanation}`,
    );
    for (const evidence of requirement.evidence) {
      lines.push(`CV passage (line ${evidence.line}, ${evidence.sourceKind}): ${evidence.cvQuote}`);
    }
    if (requirement.question) lines.push(`Review question: ${requirement.question}`);
  }
  lines.push("", "SUMMARY", noteText(report.summary));
  if (options.coverageBefore) {
    const before = options.coverageBefore, after = report.summary;
    lines.push("", "COVERAGE BEFORE AND AFTER TAILORING (original CV → this CV)",
      `Covered: ${before.direct} → ${after.direct}`, `Partly covered: ${before.partial} → ${after.partial}`,
      `Not shown in the CV: ${before.missing} → ${after.missing}`, `Needs your judgment: ${before.review} → ${after.review}`);
  }
  if (report.unparsedNotes.length) lines.push("", "NOTES REQUIRING HUMAN REVIEW", ...report.unparsedNotes.map(noteText));
  if (report.omittedSections.length) lines.push("", "VACANCY SECTIONS OUTSIDE THE CHECK", ...report.omittedSections.map((section) => section.vacancyQuote));
  if (report.warnings.length) lines.push("", "METHOD WARNINGS", ...report.warnings.map(noteText));
  return lines.join("\n");
}

export function downloadFreeCheckReport(report: EvidenceReport, options: FreeCheckReportOptions): void {
  downloadBlob(new Blob([createFreeCheckReportText(report, options)], { type: "text/plain;charset=utf-8" }), `${safeDocumentFilename(`Evidence-review-${options.jobTitle}`)}.txt`);
}
