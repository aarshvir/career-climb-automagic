/** Presentation only: every nonblank source line stays in its original order. */
export type CvBlock = { text: string; kind: 'name' | 'contact' | 'headline' | 'section' | 'role' | 'body' | 'bullet'; blankBefore: boolean };

const sectionNames = new Set([
  'profile', 'professional profile', 'summary', 'professional summary', 'executive summary',
  'employment', 'experience', 'work experience', 'professional experience', 'career history',
  'education', 'qualifications', 'education and qualifications', 'education & qualifications',
  'skills', 'confirmed skills', 'key skills', 'core skills', 'technical skills', 'competencies',
  'projects', 'selected projects', 'internships', 'certifications', 'certificates', 'languages',
  'awards', 'publications', 'volunteering', 'volunteer experience', 'interests', 'references',
]);

export function cvBlocks(text: string, name: string): CvBlock[] {
  const blocks: CvBlock[] = [];
  let blankBefore = false;
  let sectionSeen = false;
  for (const original of text.split(/\r?\n/)) {
    if (!original.trim()) { blankBefore = true; continue; }
    const line = original.replace(/\t/g, '    ');
    const trimmed = line.trim();
    const previous = blocks.at(-1);
    const knownSection = sectionNames.has(trimmed.toLowerCase().replace(/:$/, ''));
    // An all-caps paragraph, employer with dates, or a short bullet is not a heading.
    const otherSection = blankBefore && trimmed.length <= 48 && /\p{L}/u.test(trimmed)
      && trimmed === trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase()
      && !/[|@\d.!?;•]/u.test(trimmed) && !/^[-–—*]/u.test(trimmed);
    let kind: CvBlock['kind'] = 'body';
    if (!blocks.length && name.trim() && trimmed.toLocaleLowerCase() === name.trim().toLocaleLowerCase()) kind = 'name';
    else if (/^[\s]*[•●▪◦*\-–]\s+/u.test(line)) kind = 'bullet';
    else if (knownSection || otherSection) {
      // Preserve repeated section/context labels verbatim, but avoid two competing rules.
      kind = previous?.kind === 'section' && previous.text.trim().toLowerCase() === trimmed.toLowerCase() ? 'role' : 'section';
      sectionSeen = true;
    } else if (!sectionSeen && blocks[0]?.kind === 'name' && blocks.length <= 3) {
      if (/@|https?:\/\/|www\.|\+?[\d ()-]{7,}/u.test(trimmed)) kind = 'contact';
      else if (trimmed.length <= 85 && trimmed === trimmed.toUpperCase() && /\p{L}/u.test(trimmed)) kind = 'headline';
    } else if (trimmed.length <= 190 && /\|/.test(trimmed) && /(?:\b(?:19|20)\d{2}\b|\bpresent\b|\bcurrent\b)/iu.test(trimmed)) kind = 'role';
    blocks.push({ text: line, kind, blankBefore });
    blankBefore = false;
  }
  return blocks;
}

export const CV_STYLE = {
  name: { size: 20, line: 8.3, before: 0, after: 2.1, bold: true, color: '173A50' },
  contact: { size: 9, line: 4.2, before: 0, after: 2.1, bold: false, color: '495666' },
  headline: { size: 10.5, line: 4.8, before: 0, after: 2, bold: true, color: '263C4A' },
  section: { size: 11.1, line: 5.3, before: 3.5, after: 2.2, bold: true, color: '22566C' },
  role: { size: 10.1, line: 4.7, before: 2.1, after: 1.6, bold: true, color: '243749' },
  body: { size: 10.1, line: 4.8, before: 0, after: 1.5, bold: false, color: '27313D' },
  bullet: { size: 10.1, line: 4.8, before: 0, after: 1.7, bold: false, color: '27313D' },
} as const;

export type CvStyle = { size: number; line: number; before: number; after: number; bold: boolean; color: string };
/** Same readable font sizes/margins; only modest spacing changes for a natural one-page fit. */
export function cvStyle(kind: CvBlock['kind'], compact: boolean): CvStyle {
  const style = CV_STYLE[kind];
  if (!compact) return style;
  if (kind === 'name') return { ...style, after: 1.6 };
  if (kind === 'contact') return { ...style, after: 1.7 };
  if (kind === 'section') return { ...style, before: 2.6, after: 1.6 };
  if (kind === 'role') return { ...style, before: 1.5, after: 1.1 };
  if (kind === 'body' || kind === 'bullet') return { ...style, line: 4.4, after: 1 };
  return style;
}
