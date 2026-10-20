import { jsPDF } from 'jspdf';
import { BorderStyle, Document, LineRuleType, Packer, Paragraph, TextRun } from 'docx';
import type { LoopPacket, LoopProfileInput } from './job-loop-types.ts';
import { LOOP_FONT_BASE64 } from './job-loop-engine-font.ts';
import { LOOP_FONT_BOLD_BASE64 } from './job-loop-engine-font-bold.ts';
import { cvBlocks, cvStyle, type CvBlock } from './job-loop-document-layout.ts';

export type LoopRenderedArtifact = { bytes: Uint8Array; mimeType: string; sha256: string; byteSize: number; filename: string };
export type LoopRenderResult = { packet: LoopPacket; artifacts: Record<string, LoopRenderedArtifact>; pageCount: number | null; holdReasons: string[] };
function filename(value: string): string { return value.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'reviewed-cv'; }
async function artifact(bytes: Uint8Array, mimeType: string, name: string): Promise<LoopRenderedArtifact> {
  return { bytes, mimeType, filename: name, byteSize: bytes.byteLength, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(v => v.toString(16).padStart(2, '0')).join('') };
}

function renderCvPdf(text: string, name: string): { pdf: jsPDF; pageCount: number; balancedBreak: number; compact: boolean } {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('DejaVuSans.ttf', LOOP_FONT_BASE64);
  pdf.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  pdf.addFileToVFS('DejaVuSans-Bold.ttf', LOOP_FONT_BOLD_BASE64);
  pdf.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
  pdf.setFont('DejaVuSans', 'normal');
  type FontMetadata = { characterToGlyph?: (code: number) => number };
  const regular = pdf.getFont().metadata as FontMetadata;
  const supports = (font: FontMetadata, value: string) => !!font.characterToGlyph
    && [...new Set(value + pdf.processArabic(value))].every(c => /\s/u.test(c) || font.characterToGlyph!(c.codePointAt(0)!) !== 0);
  if (!supports(regular, text)) throw new Error('FONT_UNSUPPORTED');
  pdf.setFont('DejaVuSans', 'bold');
  const bold = pdf.getFont().metadata as FontMetadata;
  const margin = 19, width = pdf.internal.pageSize.getWidth() - margin * 2;
  const top = 20, bottom = pdf.internal.pageSize.getHeight() - 19;
  const capacity = bottom - top;
  const sourceBlocks = cvBlocks(text, name);
  const measure = (compact: boolean) => sourceBlocks.map(block => {
    const style = cvStyle(block.kind, compact);
    const fontStyle = style.bold && supports(bold, block.text) ? 'bold' : 'normal';
    pdf.setFont('DejaVuSans', fontStyle); pdf.setFontSize(style.size);
    const indent = block.kind === 'bullet' ? 3.5 : 0;
    const lines: string[] = pdf.splitTextToSize(block.text, width - indent);
    return { ...block, style, fontStyle, indent, lines, height: style.before + lines.length * style.line + style.after };
  });
  let compact = false;
  let blocks = measure(false);
  let totalHeight = blocks.reduce((sum, block) => sum + block.height, 0);
  if (totalHeight > capacity && totalHeight <= capacity * 1.4) {
    const tighter = measure(true);
    const tighterHeight = tighter.reduce((sum, block) => sum + block.height, 0);
    if (tighterHeight <= capacity) {
      blocks = tighter; totalHeight = tighterHeight; compact = true;
    }
  }
  let balancedBreak = -1;
  if (totalHeight > capacity && totalHeight <= capacity * 1.4) {
    // A CV just over one page should not leave only a skills/education tail on page two.
    // Prefer an existing role/section boundary, preserving all text and its order.
    let before = 0, distance = Infinity;
    for (let i = 0; i < blocks.length; i++) {
      const after = totalHeight - before;
      if ((blocks[i].kind === 'role' || blocks[i].kind === 'section')
        && before >= capacity * 0.4 && before <= capacity * 0.9
        && after >= capacity * 0.3 && after <= capacity
        && Math.abs(before - totalHeight * 0.55) < distance) {
        balancedBreak = i; distance = Math.abs(before - totalHeight * 0.55);
      }
      before += blocks[i].height;
    }
  }
  let y = top;
  const nextPage = () => { pdf.addPage(); y = top; };
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (i === balancedBreak && y > top) nextPage();
    const { style } = block;
    const paragraphReserve = (next: typeof block) => next.height <= capacity * 0.35
      ? next.height : next.style.before + Math.min(next.lines.length, 2) * next.style.line + next.style.after;
    let reserve = paragraphReserve(block);
    if (block.kind === 'section' || block.kind === 'role' || block.kind === 'name' || block.kind === 'contact' || block.kind === 'headline') {
      // Keep headings with their first actual content, including an intervening role label.
      for (let j = i + 1; j < blocks.length; j++) {
        const next = blocks[j];
        reserve += paragraphReserve(next);
        if (next.kind === 'body' || next.kind === 'bullet' || next.kind === 'section') break;
      }
      if (block.kind === 'section') {
        let sectionHeight = block.height;
        for (let j = i + 1; j < blocks.length && blocks[j].kind !== 'section'; j++) sectionHeight += blocks[j].height;
        // Short final sections (education/skills) travel as a unit, never a label-only tail.
        if (sectionHeight <= capacity * 0.32) reserve = Math.max(reserve, sectionHeight);
      }
    }
    // Ordinary short paragraphs/bullets stay whole. Long paragraphs may span pages.
    if (reserve <= capacity && y > top && y + reserve > bottom) nextPage();
    y += y === top ? 0 : style.before;
    pdf.setFont('DejaVuSans', block.fontStyle); pdf.setFontSize(style.size); pdf.setTextColor(`#${style.color}`);
    for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex++) {
      const remaining = block.lines.length - lineIndex;
      // Move two final lines together, rather than leaving a one-line widow.
      const needed = Math.min(remaining, 2) * style.line;
      if (y + needed > bottom && y > top) nextPage();
      const x = margin + (lineIndex === 0 ? 0 : block.indent);
      pdf.text(block.lines[lineIndex], x, y + style.size * 0.352778 * 0.82);
      if (block.kind === 'section' && lineIndex === block.lines.length - 1) {
        pdf.setDrawColor('#C2D2D9'); pdf.setLineWidth(0.22);
        pdf.line(margin, y + style.line + 0.25, margin + width, y + style.line + 0.25);
      }
      y += style.line;
    }
    y += style.after;
  }
  return { pdf, pageCount: pdf.getNumberOfPages(), balancedBreak, compact };
}

function cvDocxParagraph(block: CvBlock, pageBreakBefore: boolean, compact: boolean): Paragraph {
  const style = cvStyle(block.kind, compact);
  const keepNext = ['name', 'contact', 'headline', 'section', 'role'].includes(block.kind);
  const mmToTwip = (value: number) => Math.round(value * 1440 / 25.4);
  return new Paragraph({
    children: [new TextRun({ text: block.text, font: 'DejaVu Sans', size: Math.round(style.size * 2), bold: style.bold, color: style.color })],
    spacing: { before: mmToTwip(style.before), after: mmToTwip(style.after), line: mmToTwip(style.line), lineRule: LineRuleType.AT_LEAST },
    ...(block.kind === 'bullet' ? { indent: { left: mmToTwip(3.5), hanging: mmToTwip(3.5) } } : {}),
    ...(block.kind === 'section' ? { border: { bottom: { color: 'C2D2D9', size: 5, style: BorderStyle.SINGLE, space: 4 } } } : {}),
    keepNext, keepLines: true, widowControl: true, pageBreakBefore,
  });
}
/** Server-portable attempt renderer. Rendering never grants approval or writes external data. */
export async function renderPacket({ packet, profile, pageTarget = profile.pageTarget }: { packet: LoopPacket; profile: LoopProfileInput; pageTarget?: 1 | 2 }): Promise<LoopRenderResult> {
  if (pageTarget !== 1 && pageTarget !== 2) throw new Error('Choose a one- or two-page maximum.');
  const holds = [...packet.holdReasons];
  const artifacts: Record<string, LoopRenderedArtifact> = {};
  const formatStatus: NonNullable<LoopPacket['formatStatus']> = {};
  const stem = filename(packet.title);
  const excludes = profile.excludedTerms.filter(Boolean);
  const texts = [packet.cvText, packet.evidenceText, packet.coverLetterText, packet.messageText, packet.emailBody, packet.connectionNote];
  if (texts.some(t => excludes.some(term => t.toLowerCase().includes(term.toLowerCase())))) {
    holds.push('EXCLUDED_CONTENT_IN_PACKET');
    return { packet: { ...packet, status: 'held', approvedAt: null, pageCount: null, holdReasons: [...new Set(holds)] }, artifacts, pageCount: null, holdReasons: [...new Set(holds)] };
  }
  if (packet.cvText.length < 80 || packet.cvText.length > 60000) holds.push('CV_TEXT_LENGTH_INVALID');
  let pageCount: number | null = null;
  let balancedBreak = -1;
  let compact = false;
  if (!holds.includes('CV_TEXT_LENGTH_INVALID')) {
    try {
      const rendered = renderCvPdf(packet.cvText, profile.name);
      const pdf = rendered.pdf;
      pageCount = rendered.pageCount;
      balancedBreak = rendered.balancedBreak;
      compact = rendered.compact;
      formatStatus.pdf = { ready: pageCount <= pageTarget, pageCount, ...(pageCount > pageTarget ? { reason: 'PAGE_TARGET_EXCEEDED' } : {}) };
      artifacts.pdf = await artifact(new Uint8Array(pdf.output('arraybuffer')), 'application/pdf', `cv-${stem}.pdf`);
    } catch (error) { formatStatus.pdf = { ready: false, pageCount: null, reason: error instanceof Error && error.message === 'FONT_UNSUPPORTED' ? 'PDF_FONT_UNSUPPORTED' : 'PDF_RENDER_FAILED' }; }
    try {
      const doc = new Document({ styles: { default: { document: { run: { font: 'DejaVu Sans', size: 20 }, paragraph: { spacing: { after: 85, line: 272 } } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1077, bottom: 1077, left: 1077 } } }, children: cvBlocks(packet.cvText, profile.name).map((block, i) => cvDocxParagraph(block, i === balancedBreak, compact)) }] });
      artifacts.docx = await artifact(new Uint8Array(await Packer.toArrayBuffer(doc)), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `cv-${stem}.docx`);
      formatStatus.docx = { ready: true };
    } catch { formatStatus.docx = { ready: false, reason: 'DOCX_RENDER_FAILED' }; }
    artifacts.txt = await artifact(new TextEncoder().encode(packet.cvText), 'text/plain;charset=utf-8', `cv-${stem}.txt`);
    formatStatus.txt = { ready: true };
    artifacts.report = await artifact(new TextEncoder().encode(packet.evidenceText), 'text/plain;charset=utf-8', `review-${stem}.txt`);
    artifacts.letter = await artifact(new TextEncoder().encode(packet.coverLetterText), 'text/plain;charset=utf-8', `cover-letter-${stem}.txt`);
  }
  const reasons = [...new Set(holds)];
  return { packet: { ...packet, formatStatus, pageCount, holdReasons: reasons, status: reasons.length ? 'held' : packet.status, approvedAt: reasons.length ? null : packet.approvedAt }, artifacts, pageCount, holdReasons: reasons };
}
