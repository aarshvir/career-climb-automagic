import { Unzip, UnzipInflate, unzipSync } from "fflate";

export const MAX_DOCX_XML_BYTES = 2 * 1024 * 1024;
const DOCUMENT_XML = "word/document.xml";
const WORD_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);

/** Read only bounded document XML; ignore images, macros and external relationships. */
export function extractDocxText(bytes: Uint8Array): string {
  let documentCount = 0;
  // Inspect the central directory without allocating any decompressed entries.
  unzipSync(bytes, { filter(entry) {
    if (entry.name === DOCUMENT_XML) {
      documentCount++;
      if (entry.originalSize > MAX_DOCX_XML_BYTES) throw new Error("DOCX document XML exceeds the safe extraction limit. Save a simpler CV as DOCX or TXT.");
    }
    return false;
  } });
  if (documentCount !== 1) throw new Error("DOCX must contain exactly one word/document.xml file.");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let completed = false;
  let localDocumentCount = 0;
  const archive = new Unzip((file) => {
    if (file.name !== DOCUMENT_XML) return;
    localDocumentCount++;
    if (localDocumentCount !== 1) throw new Error("DOCX contains duplicate document XML entries.");
    if (file.originalSize !== undefined && file.originalSize > MAX_DOCX_XML_BYTES) throw new Error("DOCX document XML exceeds the safe extraction limit. Save a simpler CV as DOCX or TXT.");
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      totalBytes += chunk.length;
      // Enforce actual inflated bytes even when a malicious ZIP lies about its size.
      if (totalBytes > MAX_DOCX_XML_BYTES) throw new Error("DOCX document XML exceeds the safe extraction limit. Save a simpler CV as DOCX or TXT.");
      chunks.push(chunk);
      completed = final;
    };
    file.start();
  });
  archive.register(UnzipInflate);
  // Small compressed chunks bound memory/CPU before an inflation limit can fire.
  for (let offset = 0; offset < bytes.length; offset += 1024) {
    const end = Math.min(offset + 1024, bytes.length);
    archive.push(bytes.subarray(offset, end), end === bytes.length);
  }
  if (!completed || !totalBytes) throw new Error("DOCX has no readable document XML.");
  const decoded = new Uint8Array(totalBytes);
  let outputOffset = 0;
  for (const chunk of chunks) { decoded.set(chunk, outputOffset); outputOffset += chunk.length; }
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DOCX contains unsupported XML declarations. Save a new DOCX or TXT CV.");
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const root = parsed.documentElement;
  if (parsed.getElementsByTagName("parsererror").length || root.localName !== "document" || !WORD_NAMESPACES.has(root.namespaceURI ?? "")) {
    throw new Error("DOCX contains malformed document XML.");
  }
  const namespace = root.namespaceURI!;
  const body = root.getElementsByTagNameNS(namespace, "body")[0];
  if (!body) throw new Error("DOCX has no document body.");
  function paragraphText(node: Element): string {
    if (node.namespaceURI !== namespace) return "";
    if (node.localName === "t") return node.textContent ?? "";
    if (node.localName === "tab") return "\t";
    if (node.localName === "br" || node.localName === "cr") return "\n";
    if (["pPr", "del", "instrText"].includes(node.localName)) return "";
    return Array.from(node.children).filter((child) => child.localName !== "p").map(paragraphText).join("");
  }
  return Array.from(body.getElementsByTagNameNS(namespace, "p")).map((paragraph) => {
    const text = paragraphText(paragraph);
    const properties = Array.from(paragraph.children).find((child) => child.namespaceURI === namespace && child.localName === "pPr");
    const numbered = properties?.getElementsByTagNameNS(namespace, "numPr").length;
    return numbered && text.trim() ? `• ${text}` : text;
  }).join("\n");
}
