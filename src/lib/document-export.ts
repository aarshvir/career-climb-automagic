import fontUrl from "./document-dejavu-sans.ttf?url";
import { type ApplicationPack, mvpSupabase } from "./cv-database";
import { downloadBlob, safeDocumentFilename } from "./document-download";
import { validateCvText } from "./cv-extraction";
import { parseCvLayout } from "./cv-layout";

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
    const { Document, Paragraph, TextRun, Packer, BorderStyle } = await import("docx");
    const children = parseCvLayout(text).flatMap((block) => {
      switch (block.kind) {
        case "blank": return [];
        case "name": return [new Paragraph({ children: [new TextRun({ text: block.text, bold: true, size: 32 })], spacing: { after: 60 } })];
        case "contact": return [new Paragraph({ children: [new TextRun({ text: block.text, size: 19, color: "444444" })], spacing: { after: 20 } })];
        case "heading": return [new Paragraph({ children: [new TextRun({ text: block.text, bold: true, size: 22 })], spacing: { before: 220, after: 80 }, border: { bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 6 } }, keepNext: true })];
        case "role": return [new Paragraph({ children: [new TextRun({ text: block.text, bold: true })], spacing: { before: 120, after: 40 }, keepNext: true })];
        case "bullet": return [new Paragraph({ children: [new TextRun(block.text)], bullet: { level: 0 }, spacing: { after: 40 } })];
        default: return [new Paragraph({ children: [new TextRun(block.text)], widowControl: true })];
      }
    });
    const doc = new Document({
      title: `Reviewed CV - ${title}`,
      styles: { default: { document: { run: { font: "Arial", size: 21 }, paragraph: { spacing: { after: 60, line: 264 } } } } },
      sections: [{ properties: { page: { margin: { top: 900, right: 1000, bottom: 900, left: 1000 } } }, children }],
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
  pdf.setFontSize(10.5);
  const metadata = pdf.getFont().metadata as { characterToGlyph?: (code: number) => number };
  if (!metadata.characterToGlyph) throw new Error("The PDF font is unavailable. Download DOCX/TXT or retry.");
  const unsupported = [...new Set(text + pdf.processArabic(text))].filter((character) => {
    const code = character.codePointAt(0)!;
    return !/\s/u.test(character) && metadata.characterToGlyph!(code) === 0;
  });
  if (unsupported.length) {
    throw new Error(`The PDF font cannot display these characters: ${unsupported.slice(0, 6).join(" ")}. Download DOCX or TXT to preserve them.`);
  }
  // Bold uses a standard PDF font only when every character is in its encoding;
  // otherwise the line stays in the embedded Unicode font, never substituted.
  const latin = /^[\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]*$/u;
  const margin = 16;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin + 2;
  const font = (bold: boolean, line: string, size: number) => {
    if (bold && latin.test(line)) pdf.setFont("helvetica", "bold"); else pdf.setFont("DejaVuSans", "normal");
    pdf.setFontSize(size);
  };
  const room = (height: number) => { if (y + height > bottom) { pdf.addPage(); y = margin + 2; } };
  const write = (line: string, x: number, available: number, lineHeight: number) => {
    const lines: string[] = pdf.splitTextToSize(line.replace(/\t/g, "    "), available);
    for (const part of lines) { room(lineHeight); if (part) pdf.text(part, x, y); y += lineHeight; }
  };
  for (const block of parseCvLayout(text)) {
    if (block.kind === "blank") { y += 1.6; continue; }
    if (block.kind === "name") { font(true, block.text, 16); write(block.text, margin, width, 7.2); continue; }
    if (block.kind === "contact") { font(false, block.text, 9.5); write(block.text, margin, width, 4.6); continue; }
    if (block.kind === "heading") {
      y += 2.4; room(9); font(true, block.text, 11); write(block.text, margin, width, 5.2);
      pdf.setDrawColor(150); pdf.setLineWidth(0.25); pdf.line(margin, y - 3.6, margin + width, y - 3.6); y += 1.2; continue;
    }
    if (block.kind === "role") { y += 1; font(true, block.text, 10.5); write(block.text, margin, width, 5.1); continue; }
    if (block.kind === "bullet") {
      font(false, block.text, 10.5);
      const parts: string[] = pdf.splitTextToSize(block.text.replace(/\t/g, "    "), width - 5);
      parts.forEach((part, index) => { room(5); if (index === 0) pdf.text("•", margin + 1, y); if (part) pdf.text(part, margin + 5, y); y += 5; });
      continue;
    }
    font(false, block.text, 10.5); write(block.text, margin, width, 5);
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
