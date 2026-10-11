import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { LoopPacket, LoopProfileInput } from './job-loop-types.ts';
import { LOOP_FONT_BASE64 } from './job-loop-engine-font.ts';

export type LoopRenderedArtifact = { bytes: Uint8Array; mimeType: string; sha256: string; byteSize: number; filename: string };
export type LoopRenderResult = { packet: LoopPacket; artifacts: Record<string, LoopRenderedArtifact>; pageCount: number | null; holdReasons: string[] };
function filename(value: string): string { return value.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'reviewed-cv'; }
async function artifact(bytes: Uint8Array, mimeType: string, name: string): Promise<LoopRenderedArtifact> {
  return { bytes, mimeType, filename: name, byteSize: bytes.byteLength, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(v => v.toString(16).padStart(2, '0')).join('') };
}
/** Server-portable attempt renderer. Rendering never grants approval or writes external data. */
export async function renderPacket({ packet, profile, pageTarget = profile.pageTarget }: { packet: LoopPacket; profile: LoopProfileInput; pageTarget?: 1 | 2 }): Promise<LoopRenderResult> {
  if (pageTarget !== 1 && pageTarget !== 2) throw new Error('Choose a one- or two-page maximum.');
  const holds = [...packet.holdReasons];
  const artifacts: Record<string, LoopRenderedArtifact> = {};
  const stem = filename(packet.title);
  const excludes = profile.excludedTerms.filter(Boolean);
  const texts = [packet.cvText, packet.evidenceText, packet.coverLetterText, packet.messageText, packet.emailBody, packet.connectionNote];
  if (texts.some(t => excludes.some(term => t.toLowerCase().includes(term.toLowerCase())))) {
    holds.push('EXCLUDED_CONTENT_IN_PACKET');
    return { packet: { ...packet, status: 'held', approvedAt: null, pageCount: null, holdReasons: [...new Set(holds)] }, artifacts, pageCount: null, holdReasons: [...new Set(holds)] };
  }
  if (packet.cvText.length < 80 || packet.cvText.length > 60000) holds.push('CV_TEXT_LENGTH_INVALID');
  let pageCount: number | null = null;
  if (!holds.includes('CV_TEXT_LENGTH_INVALID')) {
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      pdf.addFileToVFS('NotoSans-Regular.ttf', LOOP_FONT_BASE64);
      pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
      pdf.setFont('NotoSans', 'normal'); pdf.setFontSize(11);
      const font = pdf.getFont().metadata as { characterToGlyph?: (code: number) => number };
      if (!font.characterToGlyph || [...new Set(packet.cvText)].some(c => !/\s/u.test(c) && font.characterToGlyph!(c.codePointAt(0)!) === 0)) throw new Error('FONT_UNSUPPORTED');
      const margin = 18, lineHeight = 5.4;
      const width = pdf.internal.pageSize.getWidth() - 2 * margin;
      const bottom = pdf.internal.pageSize.getHeight() - margin;
      let y = margin;
      for (const paragraph of packet.cvText.split(/\r?\n/)) {
        const lines: string[] = paragraph ? pdf.splitTextToSize(paragraph.replace(/\t/g, '    '), width) : [''];
        for (const line of lines) {
          if (y + lineHeight > bottom) { pdf.addPage(); y = margin; }
          if (line) pdf.text(line, margin, y); y += lineHeight;
        }
      }
      pageCount = pdf.getNumberOfPages();
      if (pageCount > pageTarget) holds.push('PAGE_TARGET_EXCEEDED');
      artifacts.pdf = await artifact(new Uint8Array(pdf.output('arraybuffer')), 'application/pdf', `cv-${stem}.pdf`);
    } catch (error) { holds.push(error instanceof Error && error.message === 'FONT_UNSUPPORTED' ? 'PDF_FONT_UNSUPPORTED' : 'PDF_RENDER_FAILED'); }
    try {
      const doc = new Document({ styles: { default: { document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { after: 80, line: 276 } } } } }, sections: [{ properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } }, children: packet.cvText.split(/\r?\n/).map(line => new Paragraph({ children: [new TextRun(line)], widowControl: true })) }] });
      artifacts.docx = await artifact(new Uint8Array(await Packer.toArrayBuffer(doc)), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `cv-${stem}.docx`);
    } catch { holds.push('DOCX_RENDER_FAILED'); }
    artifacts.txt = await artifact(new TextEncoder().encode(packet.cvText), 'text/plain;charset=utf-8', `cv-${stem}.txt`);
    artifacts.report = await artifact(new TextEncoder().encode(packet.evidenceText), 'text/plain;charset=utf-8', `review-${stem}.txt`);
    artifacts.letter = await artifact(new TextEncoder().encode(packet.coverLetterText), 'text/plain;charset=utf-8', `cover-letter-${stem}.txt`);
  }
  const reasons = [...new Set(holds)];
  return { packet: { ...packet, pageCount, holdReasons: reasons, status: reasons.length ? 'held' : packet.status, approvedAt: reasons.length ? null : packet.approvedAt }, artifacts, pageCount, holdReasons: reasons };
}
