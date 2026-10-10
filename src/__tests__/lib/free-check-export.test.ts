// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { extractCvText } from "@/lib/cv-extraction";
import type { EvidenceReport } from "@/lib/cv-evidence";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/lib/cv-database", () => ({ mvpSupabase: { auth: { getUser: mocks.getUser } } }));
vi.mock("@/lib/document-download", () => ({ downloadBlob: mocks.downloadBlob, safeDocumentFilename: (name: string) => name }));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", async () => {
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  return { default: pathToFileURL(resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href };
});
import { createFreeCheckCvBlob, downloadFreeCheckCv, createFreeCheckReportText, downloadFreeCheckReport } from "@/lib/free-check-export";

const text = "Zoë Morgan — fictional CV. Helped design a procurement pilot across five units, with projected savings. Created a tracker covering six workstreams and prepared twelve leadership briefings.";
const snapshot = { reviewedText: text, jobTitle: "Strategy Manager", approved: true };
beforeAll(() => vi.stubGlobal("DOMParser", new JSDOM().window.DOMParser));
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.getUser.mockImplementation(() => { throw new Error("Public local exports must not call auth or a metered service."); });
  const font = await readFile("src/lib/document-noto-sans.ttf");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(font, { status: 200 })));
});

describe("public approved CV exports", () => {
  it("requires explicit approval without needing an account", async () => {
    await expect(createFreeCheckCvBlob({ ...snapshot, approved: false }, "txt")).rejects.toThrow("approve");
    await expect(downloadFreeCheckCv({ ...snapshot, approved: false }, "txt")).rejects.toThrow("approve");
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("downloads only the approved CV text with no evidence gap or report content", async () => {
    await downloadFreeCheckCv(snapshot, "txt");
    const blob = mocks.downloadBlob.mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe(text);
    expect(await blob.text()).not.toMatch(/missing requirement|not established|evidence review/i);
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "CV-Strategy Manager.txt");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("generates actual PDF and DOCX locally that preserve the reviewed factual text", async () => {
    for (const format of ["pdf", "docx"] as const) {
      const blob = await createFreeCheckCvBlob(snapshot, format);
      const roundtrip = (await extractCvText(new File([blob], `CV.${format}`))).replace(/\s+/g, " ");
      expect(roundtrip).toContain("Zoë Morgan");
      expect(roundtrip).toContain("projected savings");
      expect(roundtrip).toContain("six workstreams");
      expect(roundtrip).not.toMatch(/missing requirement|not established|evidence review/i);
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("keeps requirement gaps and provenance in a separate source-labeled review report", async () => {
    const cvQuote = "Helped design a procurement pilot across five units, with projected savings.";
    const report: EvidenceReport = {
      methodVersion: "evidence-v1", scope: "Literal English wording check of user-provided text.",
      requirements: [{ id: "R-01", vacancyQuote: "Own transformation delivery.", start: 0, end: 28, status: "review", evidence: [{ cvQuote, start: text.indexOf(cvQuote), end: text.indexOf(cvQuote) + cvQuote.length, line: 1, sourceKind: "action" }], explanation: "Delivery ownership is not established by design support.", question: "Do you have separate evidence of delivery ownership?", matchedTerms: [] }],
      unparsedNotes: [], summary: { total: 1, direct: 0, partial: 0, missing: 0, review: 1 }, omittedSections: [], warnings: ["Review the wording manually."],
    };
    const options = { sourceLabel: "Current reviewed CV — includes user additions and edits", jobTitle: "Strategy Manager" };
    const review = createFreeCheckReportText(report, options);
    expect(review).toContain(options.sourceLabel);
    expect(review).toContain("not independently verified facts");
    expect(review).toContain(cvQuote);
    expect(review).toContain("not established by design support");
    expect(review).toContain("Do you have separate evidence");
    downloadFreeCheckReport(report, options);
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "Evidence-review-Strategy Manager.txt");
    expect(await (mocks.downloadBlob.mock.calls[0][0] as Blob).text()).toBe(review);
    expect(await (await createFreeCheckCvBlob(snapshot, "txt")).text()).toBe(text);
    expect(() => createFreeCheckReportText(report, { ...options, sourceLabel: "" })).toThrow("Label whether");
  });
});
