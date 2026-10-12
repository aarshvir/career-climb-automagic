import fontUrl from "./document-dejavu-sans.ttf?url";
import { type ApplicationPack, mvpSupabase } from "./cv-database";
import { downloadBlob, safeDocumentFilename } from "./document-download";
import { validateCvText } from "./cv-extraction";

export type DocumentFormat = "pdf" | "docx" | "txt";
export type ReviewedPdfPreview = { blob: Blob; pageCount: number };
let fontBase64: Promise<string> | undefined;

async function loadPdfFont(): Promise<string> {
  if (!fontBase64) {
    fontBase64 = (async () => {
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error("The PDF font could not be loaded. Retry or download DOCX/TXT.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      }
      return btoa(binary);
    })().catch((error) => {
      fontBase64 = undefined;
      throw error;
    });
  }
  return fontBase64;
}

function approvedText(pack: ApplicationPack): string {
  if (pack.status !== "approved") throw new Error("Review and approve this CV before downloading it.");
  return validateCvText(pack.tailored_text);
}

/** Builds the reviewed CV itself; job scores and missing skills are not added as candidate facts. */
export async function createPackBlob(pack: ApplicationPack, format: DocumentFormat): Promise<Blob> {
  return createReviewedCvBlob(approvedText(pack), format, pack.job_title);
}

/** Shared renderer for text that its caller has explicitly reviewed and approved. */
export async function createReviewedCvBlob(reviewedText: string, format: DocumentFormat, title: string): Promise<Blob> {
  const text = validateCvText(reviewedText);
  if (format === "txt") return new Blob([text], { type: "text/plain;charset=utf-8" });
  if (format === "docx") {
    const { Document, Paragraph, TextRun, Packer } = await import("docx");
    const doc = new Document({
      title: `Reviewed CV - ${title}`,
      styles: { default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { after: 100, line: 276 } } } } },
      sections: [{
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        children: text.split("\n").map((line) => new Paragraph({
          children: [new TextRun(line)],
          widowControl: true,
        })),
      }],
    });
    return Packer.toBlob(doc);
  }
  if (format !== "pdf") throw new Error("Choose PDF, DOCX or TXT for your CV download.");
  return (await createReviewedPdfPreview(text, title)).blob;
}

/** Exact PDF bytes for both preview and download; generating a preview grants no approval. */
export async function createReviewedPdfPreview(reviewedText: string, title: string): Promise<ReviewedPdfPreview> {
  const text = validateCvText(reviewedText);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.addFileToVFS("DejaVuSans.ttf", await loadPdfFont());
  pdf.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
  pdf.setFont("DejaVuSans", "normal");
  pdf.setFontSize(11);
  const metadata = pdf.getFont().metadata as { characterToGlyph?: (code: number) => number };
  if (!metadata.characterToGlyph) throw new Error("The PDF font is unavailable. Download DOCX/TXT or retry.");
  const unsupported = [...new Set(text + pdf.processArabic(text))].filter((character) => {
    const code = character.codePointAt(0)!;
    return !/\s/u.test(character) && metadata.characterToGlyph!(code) === 0;
  });
  if (unsupported.length) {
    throw new Error(`The PDF font cannot display these characters: ${unsupported.slice(0, 6).join(" ")}. Download DOCX or TXT to preserve them.`);
  }
  const margin = 18;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  const lineHeight = 5.4;
  let y = margin;
  for (const paragraph of text.split("\n")) {
    const lines: string[] = paragraph ? pdf.splitTextToSize(paragraph.replace(/\t/g, "    "), width) : [""];
    for (const line of lines) {
      if (y + lineHeight > bottom) { pdf.addPage(); y = margin; }
      if (line) pdf.text(line, margin, y);
      y += lineHeight;
    }
  }
  pdf.setProperties({ title: `Reviewed CV - ${title}`, creator: "Jobvance" });
  return { blob: new Blob([pdf.output("arraybuffer")], { type: "application/pdf" }), pageCount: pdf.getNumberOfPages() };
}

export async function downloadPack(pack: ApplicationPack, format: DocumentFormat): Promise<void> {
  approvedText(pack);
  const { data, error } = await mvpSupabase.auth.getUser();
  if (error || !data.user) throw new Error("Please sign in again before downloading your CV.");
  if (data.user.id !== pack.user_id) throw new Error("You can only download CVs in your own account.");
  const blob = await createPackBlob(pack, format);
  downloadBlob(blob, `${safeDocumentFilename(`CV-${pack.job_title}`)}.${format}`);
}
