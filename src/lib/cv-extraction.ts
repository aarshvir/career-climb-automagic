export const MAX_CV_BYTES = 5 * 1024 * 1024;
export const MAX_CV_TEXT_LENGTH = 60_000;
export const CV_MIME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
} as const;
export type CvFileType = keyof typeof CV_MIME_TYPES;

export function validateCvFile(file: File): CvFileType {
  if (!file || file.size === 0) throw new Error("This file is empty. Choose a PDF, DOCX or TXT CV with text.");
  if (file.size > MAX_CV_BYTES) throw new Error("Your CV exceeds 5 MB. Save a smaller PDF, DOCX or TXT file and try again.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "doc") throw new Error("Legacy DOC files cannot be read here. Save your CV as DOCX, PDF or TXT first.");
  if (!extension || !(extension in CV_MIME_TYPES)) throw new Error("Choose a PDF, DOCX or TXT CV.");
  return extension as CvFileType;
}

export function normalizeCvText(text: string): string {
  return text.replace(/\r\n?/g, "\n").split("\u0000").join("").replace(/[\t ]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

export function validateCvText(text: string): string {
  const normalized = normalizeCvText(text);
  if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) {
    throw new Error("No readable CV text yet. Paste your career record into the CV text field, or choose a readable file.");
  }
  if (normalized.length < 80) throw new Error("Too little readable CV text was found. Review the extracted text and include at least 80 characters of your experience, education or skills.");
  if (normalized.length > MAX_CV_TEXT_LENGTH) throw new Error("This document contains too much text for a CV. Keep it below 60,000 characters.");
  return normalized;
}

export async function extractCvText(file: File): Promise<string> {
  const type = validateCvFile(file);
  try {
    const buffer = await file.arrayBuffer();
    if (type === "txt") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      if (text.includes("\u0000")) throw new Error("The TXT file is not UTF-8 text. Save it as UTF-8 and try again.");
      return validateCvText(text);
    }
    if (type === "docx") {
      const { extractDocxText } = await import("./cv-docx");
      return validateCvText(extractDocxText(new Uint8Array(buffer)));
    }
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 100) throw new Error("This PDF has more than 100 pages. Upload just your CV pages.");
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        let pageText = "";
        let previousY: number | undefined;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform[5];
          if (previousY !== undefined && Math.abs(y - previousY) > 3 && !pageText.endsWith("\n")) pageText += "\n";
          pageText += item.str;
          pageText += item.hasEOL ? "\n" : " ";
          previousY = y;
        }
        pages.push(pageText.trim());
        page.cleanup();
      }
      const extracted=pages.join("\n\n");
      if(!/[\p{L}\p{N}]/u.test(extracted))throw new Error("This PDF has no readable CV text. Scanned PDFs need OCR first; this check does not perform OCR. Use a text-based version or paste readable text into the CV text field.");
      return validateCvText(extracted);
    } finally {
      await task.destroy();
    }
  } catch (error) {
    if (error instanceof Error && /readable CV|too much text|more than 100|UTF-8|safe extraction limit/.test(error.message)) throw error;
    throw Object.assign(new Error(`We could not read this ${type.toUpperCase()} file. It may be damaged or password-protected. Save an unlocked text-based PDF, DOCX or UTF-8 TXT file and try again.`), { cause: error });
  }
}
