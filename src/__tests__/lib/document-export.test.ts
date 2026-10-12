// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import type { ApplicationPack } from "@/lib/cv-database";
import { extractCvText } from "@/lib/cv-extraction";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/lib/cv-database", () => ({ mvpSupabase: { auth: { getUser: mocks.getUser } } }));
vi.mock("@/lib/document-download", () => ({ downloadBlob: mocks.downloadBlob, safeDocumentFilename: (name: string) => name }));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", async () => {
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  return { default: pathToFileURL(resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href };
});
import { createPackBlob, downloadPack, createReviewedPdfPreview } from "@/lib/document-export";

const text = "Zoë Martin — product manager\nEight years of product delivery and stakeholder management.\nLed three teams without inventing skills or changing dates.";
const pack: ApplicationPack = { id: "pack-1", user_id: "owner", resume_id: "cv-1", request_id: "request-1", job_title: "Product Manager", company: "Example", job_url: null, job_description: "Product management", original_text: text, tailored_text: text, matched_keywords: ["product"], missing_keywords: ["Python"], status: "approved", created_at: "2026-10-10T10:00:00Z" };
beforeAll(() => vi.stubGlobal("DOMParser", new JSDOM().window.DOMParser));

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  const font = await readFile("src/lib/document-dejavu-sans.ttf");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(font, { status: 200 })));
});

describe("reviewed CV exports", () => {
  it('renders mixed Arabic and Latin names with shaped glyph coverage and reports actual page count', async () => {
    const cv = 'محمد أحمد / Mohamed Ahmed\n' + text;
    const preview = await createReviewedPdfPreview(cv, 'Graduate Analyst');
    expect(preview.pageCount).toBe(1);
    const roundtrip = await extractCvText(new File([preview.blob], 'CV.pdf'));
    expect(roundtrip).toContain('Mohamed Ahmed');
    expect(roundtrip.normalize('NFKC')).toContain('محمد أحمد');
    expect(preview.blob.size).toBeGreaterThan(1000);
  });
  it("exports exactly the approved Unicode text as TXT, without adding missing skills", async () => {
    const blob = await createPackBlob(pack, "txt");
    expect(await blob.text()).toBe(text);
    expect(blob.type).toBe("text/plain;charset=utf-8");
    expect(await blob.text()).not.toContain("Python");
  });
  it("exports a real DOCX whose extracted content preserves the approved CV", async () => {
    const blob = await createPackBlob(pack, "docx");
    const roundtrip = await extractCvText(new File([blob], "CV.docx"));
    expect(roundtrip).toContain("Zoë Martin");
    expect(roundtrip).toContain("without inventing skills or changing dates");
    expect(roundtrip).not.toContain("Python");
  });
  it("exports a readable PDF with accented names and wraps across pages", async () => {
    const longText = Array.from({ length: 150 }, (_, index) => `${index + 1}. ${text}`).join("\n");
    const blob = await createPackBlob({ ...pack, tailored_text: longText }, "pdf");
    expect(blob.type).toBe("application/pdf");
    const roundtrip = await extractCvText(new File([blob], "CV.pdf"));
    expect(roundtrip).toContain("Zoë Martin");
    expect(roundtrip).toContain("150.");
    expect(roundtrip).not.toContain("Python");
  });
  it("refuses unapproved drafts before generation or download", async () => {
    await expect(createPackBlob({ ...pack, status: "draft" }, "pdf")).rejects.toThrow("approve");
    await expect(downloadPack({ ...pack, status: "draft" }, "txt")).rejects.toThrow("approve");
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
  });
  it("does not silently replace characters unsupported by the embedded PDF font", async () => {
    await expect(createPackBlob({ ...pack, tailored_text: `${text}\n工程师` }, "pdf")).rejects.toThrow("Download DOCX or TXT");
    const blob = await createPackBlob({ ...pack, tailored_text: `${text}\n工程师` }, "txt");
    expect(await blob.text()).toContain("工程师");
  });
  it("requires authenticated ownership and downloads the real document", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(downloadPack(pack, "txt")).rejects.toThrow("own account");
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    await downloadPack(pack, "txt");
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "CV-Product Manager.txt");
    expect(await (mocks.downloadBlob.mock.calls[0][0] as Blob).text()).toBe(text);
  });
});
