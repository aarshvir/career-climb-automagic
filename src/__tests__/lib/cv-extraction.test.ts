// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Document, Paragraph, Packer } from "docx";
import { jsPDF } from "jspdf";
import { JSDOM } from "jsdom";
import { zipSync, strToU8 } from "fflate";
import { MAX_DOCX_XML_BYTES } from "@/lib/cv-docx";
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", async () => {
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  return { default: pathToFileURL(resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href };
});
import { extractCvText, MAX_CV_BYTES, validateCvFile, validateCvText } from "@/lib/cv-extraction";

const cvText = "Zoë Martin — product manager with eight years of experience in research, product delivery and stakeholder management.\nLed delivery improvements across three teams.";
beforeAll(() => vi.stubGlobal("DOMParser", new JSDOM().window.DOMParser));

describe("local CV extraction", () => {
  it("extracts UTF-8 TXT, preserves Unicode and normalizes line endings", async () => {
    await expect(extractCvText(new File([cvText.replace(/\n/g, "\r\n")], "CV.TXT"))).resolves.toBe(cvText);
  });
  it("enforces the exact 5 MB boundary before running a parser", async () => {
    expect(validateCvFile(new File([new Uint8Array(MAX_CV_BYTES)], "CV.pdf"))).toBe("pdf");
    await expect(extractCvText(new File([new Uint8Array(MAX_CV_BYTES + 1)], "CV.pdf"))).rejects.toThrow("exceeds 5 MB");
  });
  it("rejects legacy DOC, empty files and unsupported file formats", async () => {
    await expect(extractCvText(new File([cvText], "CV.doc"))).rejects.toThrow("Legacy DOC");
    await expect(extractCvText(new File([], "CV.txt"))).rejects.toThrow("empty");
    await expect(extractCvText(new File([cvText], "CV.exe"))).rejects.toThrow("PDF, DOCX or TXT");
  });
  it("rejects whitespace, binary TXT and excessive reviewed text", async () => {
    await expect(extractCvText(new File(["   \n\t "], "CV.txt"))).rejects.toThrow("No readable");
    await expect(extractCvText(new File([new Uint8Array([0xff, 0xfe, 0x00])], "CV.txt"))).rejects.toThrow("UTF-8");
    expect(() => validateCvText("x".repeat(60001))).toThrow("60,000");
  });
  it("parses a real DOCX locally without turning document content into HTML", async () => {
    const doc = new Document({ sections: [{ children: cvText.split("\n").map((text) => new Paragraph(text)) }] });
    const blob = await Packer.toBlob(doc);
    const result = await extractCvText(new File([blob], "CV.docx"));
    expect(result).toContain("Zoë Martin");
    expect(result).toContain("Led delivery improvements across three teams.");
  });
  it("preserves DOCX paragraph, tab, break and numbered-list text without HTML injection", async () => {
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${cvText.split("\n")[0]}</w:t><w:tab/><w:t>Skills</w:t><w:br/><w:t>&lt;script&gt;never executed&lt;/script&gt;</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Led three teams.</w:t></w:r></w:p></w:body></w:document>`;
    const bytes = zipSync({ "word/document.xml": strToU8(xml) });
    const result = await extractCvText(new File([bytes], "CV.docx"));
    expect(result).toContain("\tSkills\n<script>never executed</script>\n• Led three teams.");
  });
  it("rejects ZIP bombs before XML parsing, including forged uncompressed-size headers", async () => {
    const bytes = zipSync({ "word/document.xml": strToU8("x".repeat(MAX_DOCX_XML_BYTES + 1)) });
    await expect(extractCvText(new File([bytes], "Bomb.docx"))).rejects.toThrow("safe extraction limit");
    const forged = bytes.slice();
    const view = new DataView(forged.buffer);
    // Lie in both local and central headers. Actual streaming output still has a bound.
    view.setUint32(22, 64, true);
    for (let i = 0; i < forged.length - 4; i++) {
      if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 64, true); break; }
    }
    await expect(extractCvText(new File([forged], "Forged.docx"))).rejects.toThrow("safe extraction limit");
  });
  it("rejects missing, malformed and entity-bearing document XML", async () => {
    for (const files of [
      { "other.xml": strToU8(cvText) },
      { "word/document.xml": strToU8("<w:document>broken") },
      { "word/document.xml": strToU8('<!DOCTYPE document [<!ENTITY x "text">]><document>&x;</document>') },
    ]) await expect(extractCvText(new File([zipSync(files)], "Broken.docx"))).rejects.toThrow("could not read");
  });
  it("extracts text from a real PDF and rejects a PDF without a text layer", async () => {
    const pdf = new jsPDF();
    pdf.text(cvText.replace("Zoë", "Zoe").replace("—", "-"), 15, 20, { maxWidth: 180 });
    const result = await extractCvText(new File([pdf.output("arraybuffer")], "CV.pdf"));
    expect(result).toContain("product manager");
    expect(result).toContain("Led delivery improvements");
    const scanned = new jsPDF();
    scanned.rect(10, 10, 50, 50, "F");
    await expect(extractCvText(new File([scanned.output("arraybuffer")], "Scanned.pdf"))).rejects.toThrow("Scanned PDFs need OCR");
  });
  it("returns an actionable error for malformed DOCX and PDF", async () => {
    await expect(extractCvText(new File(["damaged"], "CV.docx"))).rejects.toThrow("could not read");
    await expect(extractCvText(new File(["damaged"], "CV.pdf"))).rejects.toThrow("could not read");
  });
});
