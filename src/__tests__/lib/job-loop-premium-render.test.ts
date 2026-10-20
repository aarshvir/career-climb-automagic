// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { unzipSync, strFromU8 } from 'fflate';
import { renderPacket } from '../../../supabase/functions/_shared/job-loop-render';
import { cvBlocks } from '../../../supabase/functions/_shared/job-loop-document-layout';
import { LOOP_FONT_BOLD_BASE64 } from '../../../supabase/functions/_shared/job-loop-engine-font-bold';
import type { LoopPacket, LoopProfileInput } from '../../../supabase/functions/_shared/job-loop-types';

const text = [
  'Alex Morgan', 'New York, NY | alex.morgan@example.com', '', 'EMPLOYMENT',
  'Director, Strategy & Operations | Westhaven Service Group | 2021-present',
  '• Cut annual planning from eight to five weeks.',
  '• Managed a team of six strategy and operations professionals. Established project ownership and coached workstream leads.',
  '', 'EDUCATION', 'Education', '• MBA, Business Strategy | Brookmere School of Management | 2016.',
  '', 'CONFIRMED SKILLS', '• Corporate planning; Excel; Power BI.',
].join('\n');
const profile = { name: 'Alex Morgan', excludedTerms: [], pageTarget: 2 } as LoopProfileInput;
function packet(cvText = text): LoopPacket {
  return { title: 'Strategy & Operations', cvText, evidenceText: 'Review retained.', coverLetterText: '', connectionNote: '', messageText: '', emailBody: '', status: 'review_required', approvedAt: null, holdReasons: [] } as unknown as LoopPacket;
}
async function pdfPages(bytes: Uint8Array) {
  const loading = getDocument({ data: bytes.slice(), useSystemFonts: false });
  const pdf = await loading.promise;
  try {
    return await Promise.all(Array.from({ length: pdf.numPages }, async (_, i) => {
      const page = await pdf.getPage(i + 1);
      const content = await page.getTextContent();
      return { width: page.view[2], height: page.view[3], items: content.items.filter(item => 'str' in item) as Array<{ str: string; transform: number[]; height: number; width: number; fontName: string }> };
    }));
  } finally { await loading.destroy(); }
}
const flat = (value: string) => value.replace(/\s+/gu, ' ').trim();

describe('source-preserving executive CV presentation', () => {
  it('preserves all words and dates in PDF/DOCX/TXT while applying genuine heading hierarchy', async () => {
    const original = packet();
    const result = await renderPacket({ packet: original, profile });
    expect(result.packet.cvText).toBe(text);
    expect(original.cvText).toBe(text);
    expect(new TextDecoder().decode(result.artifacts.txt.bytes)).toBe(text);
    const pages = await pdfPages(result.artifacts.pdf.bytes);
    expect(flat(pages.flatMap(page => page.items.map(item => item.str)).join(' '))).toBe(flat(text));
    const name = pages[0].items.find(item => item.str === 'Alex Morgan')!;
    const section = pages[0].items.find(item => item.str === 'EMPLOYMENT')!;
    const bullet = pages[0].items.find(item => item.str.includes('Cut annual planning'))!;
    expect(name.height).toBeCloseTo(20, 1);
    expect(section.height).toBeCloseTo(11.1, 1);
    expect(bullet.height).toBeCloseTo(10.1, 1);
    expect(name.fontName).not.toBe(bullet.fontName);
    const fontBytes = Buffer.from(LOOP_FONT_BOLD_BASE64, 'base64');
    const os2 = Array.from({ length: fontBytes.readUInt16BE(4) }, (_, i) => 12 + i * 16).find(offset => fontBytes.toString('ascii', offset, offset + 4) === 'OS/2')!;
    expect(fontBytes.readUInt16BE(fontBytes.readUInt32BE(os2 + 8) + 4)).toBe(700);
    expect(new TextDecoder('latin1').decode(result.artifacts.pdf.bytes).match(/\/FontFile2 /g)?.length).toBe(2);
    const xml = strFromU8(unzipSync(result.artifacts.docx.bytes)['word/document.xml']);
    expect(xml).toContain('w:sz w:val="40"');
    expect(xml).toContain('w:color w:val="22566C"');
    expect(xml).toContain('w:keepNext');
    expect(xml).toContain('w:pBdr');
    expect(xml).toContain('2021-present');
    expect(xml).toContain('Cut annual planning from eight to five weeks.');
    expect(result.packet.status).toBe('review_required');
    expect(result.packet.approvedAt).toBeNull();
  });

  it('keeps each section and role label with content across real PDF page breaks', async () => {
    const long = ['Alex Morgan', 'alex.morgan@example.com', '', 'EMPLOYMENT',
      ...Array.from({ length: 20 }, (_, i) => [`Role ${i} | Example Employer | 2020-2025`, '• Prepared operating reviews and worked with colleagues to identify delivery risks. '.repeat(4)]).flat(),
      '', 'EDUCATION', '• MBA, Example School | 2016.', '', 'SKILLS', '• Excel; planning; business reviews.',
    ].join('\n');
    const result = await renderPacket({ packet: packet(long), profile });
    const pages = await pdfPages(result.artifacts.pdf.bytes);
    expect(pages.length).toBeGreaterThan(2);
    expect(result.packet.formatStatus?.pdf).toMatchObject({ ready: false, reason: 'PAGE_TARGET_EXCEEDED' });
    expect(result.packet.formatStatus?.docx?.ready).toBe(true);
    expect(flat(pages.flatMap(page => page.items.map(item => item.str)).join(' '))).toBe(flat(long));
    for (const page of pages) {
      const visible = page.items.filter(item => item.str.trim());
      expect(visible.at(-1)?.str).not.toMatch(/^(?:EMPLOYMENT|EDUCATION|SKILLS|Role \d+ \|)/);
      for (const item of visible) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(53);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(page.width - 52);
        expect(item.transform[5]).toBeGreaterThan(52);
        expect(item.transform[5] + item.height).toBeLessThan(page.height - 48);
      }
    }
    const skillsPage = pages.find(page => page.items.some(item => item.str === 'SKILLS'))!;
    expect(skillsPage.items.some(item => item.str.includes('Excel; planning; business reviews.'))).toBe(true);
  });

  it('wraps long names, role headings and unbroken links within the page without losing characters', async () => {
    const longName = 'Alex Morgan '.repeat(15).trim();
    const link = `https://example.com/${'x'.repeat(230)}`;
    const cv = `${longName}\n${link}\n\nEMPLOYMENT\n${'Strategy & Operations '.repeat(7)} | Employer | 2021-present\n• Reviewed delivery plans and retained exact source facts.`;
    const result = await renderPacket({ packet: packet(cv), profile: { ...profile, name: longName } });
    const pages = await pdfPages(result.artifacts.pdf.bytes);
    // PDF line breaks inside an unbroken URL add visual whitespace only.
    expect(pages.flatMap(page => page.items.map(item => item.str)).join('').replace(/\s/gu, '')).toBe(cv.replace(/\s/gu, ''));
    for (const page of pages) for (const item of page.items) expect(item.transform[4] + item.width).toBeLessThanOrEqual(page.width - 52);
  });

  it('balances a modest two-page overflow at a real role boundary instead of a skills-only tail', async () => {
    const paragraph = '• Coordinated cross-functional transformation planning with commercial, technology and regional operations colleagues. Established accountable workstreams, tested implementation options and maintained an executive decision log. Reviewed customer demand, service capacity and investment assumptions with Finance before presenting practical recommendations and delivery milestones.';
    const cv = ['Alex Morgan', 'alex.morgan@example.com', '', 'EMPLOYMENT',
      ...Array.from({ length: 3 }, (_, i) => [`Strategy Manager ${i} | Example Group | 2020-2025`, ...Array.from({ length: 3 }, () => paragraph)]).flat(),
      '', 'EDUCATION', '• Business degree | Example University | 2016.', '', 'SKILLS', '• Transformation; programme delivery; Excel; business reviews.',
    ].join('\n');
    const result = await renderPacket({ packet: packet(cv), profile });
    const pages = await pdfPages(result.artifacts.pdf.bytes);
    expect(pages).toHaveLength(2);
    expect(result.packet.formatStatus?.pdf?.ready).toBe(true);
    expect(pages[1].items.some(item => /^Strategy Manager \d/.test(item.str))).toBe(true);
    expect(pages[1].items.filter(item => item.str.trim()).length).toBeGreaterThan(12);
    const xml = strFromU8(unzipSync(result.artifacts.docx.bytes)['word/document.xml']);
    expect(xml).toContain('<w:pageBreakBefore/>');
    expect(xml).toContain('w:lineRule="atLeast"');
  });

  it('uses readable spacing to keep a near-fit CV on one page even when the maximum is two', async () => {
    const paragraph = '• Coordinated cross-functional transformation planning with commercial, technology and regional operations colleagues. Established accountable workstreams, tested implementation options and maintained an executive decision log. Reviewed customer demand, service capacity and investment assumptions with Finance before presenting practical recommendations and delivery milestones.';
    const cv = ['Alex Morgan', 'alex.morgan@example.com', '', 'EMPLOYMENT',
      ...Array.from({ length: 3 }, (_, i) => [`Strategy Manager ${i} | Example Group | 2020-2025`, ...Array.from({ length: i === 2 ? 1 : 3 }, () => paragraph)]).flat(),
      '', 'EDUCATION', '• Business degree | Example University | 2016.', '', 'SKILLS', '• Transformation; programme delivery; Excel; business reviews.',
    ].join('\n');
    const result = await renderPacket({ packet: packet(cv), profile });
    const pages = await pdfPages(result.artifacts.pdf.bytes);
    expect(pages).toHaveLength(1);
    expect(pages[0].items.find(item => item.str.includes('Coordinated'))?.height).toBeCloseTo(10.1, 1);
    expect(flat(pages[0].items.map(item => item.str).join(' '))).toBe(flat(cv));
    const xml = strFromU8(unzipSync(result.artifacts.docx.bytes)['word/document.xml']);
    expect(xml).toContain('w:line="249"');
    expect(xml).not.toContain('<w:pageBreakBefore/>');
  });

  it('does not invent headings or classify unknown prose as a contact line', () => {
    const blocks = cvBlocks('Alex Morgan\nPrepared board reviews and operating plans.\nEMPLOYMENT\nA role with no date or separator\n• SQL\nEducation\nEducation\nA degree.', 'Alex Morgan');
    expect(blocks.map(block => block.kind)).toEqual(['name', 'body', 'section', 'body', 'bullet', 'section', 'role', 'body']);
    expect(blocks.map(block => block.text).join('\n')).toBe('Alex Morgan\nPrepared board reviews and operating plans.\nEMPLOYMENT\nA role with no date or separator\n• SQL\nEducation\nEducation\nA degree.');
    expect(cvBlocks('EMPLOYMENT\nA role\nA factual statement.', '').map(block => block.kind)).toEqual(['section', 'body', 'body']);
  });

  it('retains non-Latin fallback and empty-source holds instead of silently changing authority', async () => {
    const supported = await renderPacket({ packet: packet('Ирина Петрова\nPROFILE\n' + 'Prepared operational reviews. '.repeat(4)), profile: { ...profile, name: 'Ирина Петрова' } });
    expect(supported.packet.formatStatus?.pdf?.ready).toBe(true);
    const unsupported = await renderPacket({ packet: packet(text + '\n工程师'), profile });
    expect(unsupported.packet.formatStatus?.pdf).toEqual({ ready: false, pageCount: null, reason: 'PDF_FONT_UNSUPPORTED' });
    expect(unsupported.packet.formatStatus?.docx?.ready).toBe(true);
    const empty = await renderPacket({ packet: packet(''), profile });
    expect(empty.artifacts).toEqual({});
    expect(empty.packet.status).toBe('held');
    expect(empty.holdReasons).toContain('CV_TEXT_LENGTH_INVALID');
  });
});
