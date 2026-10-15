/**
 * Reads the visual structure already present in reviewed CV text so exports can
 * format it (name, contact line, section headings, role lines, bullets).
 * It never changes, adds or removes wording: every block carries its exact line.
 */
export type CvBlockKind = "name" | "contact" | "heading" | "role" | "bullet" | "text" | "blank";
export type CvBlock = { kind: CvBlockKind; text: string };

const BULLET = /^\s*([-•*–·▪●◦])\s+/u;
const SECTION_WORDS = /^(professional\s+|work\s+|relevant\s+|career\s+)?(profile|summary|objective|experience|employment(\s+history)?|education|skills|key\s+skills|core\s+skills|competencies|projects|certifications?|qualifications|languages|achievements|awards|publications|volunteering|interests|training|references|additional\s+experience|leadership|activities)\s*:?$/iu;

function isHeading(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > 50 || BULLET.test(value) || /[.!?]$/u.test(value)) return false;
  if (SECTION_WORDS.test(value)) return true;
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return false;
  const upper = value.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length >= 0.85 && !/[|@]/u.test(value);
}

export function parseCvLayout(text: string): CvBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(line => line.replace(/\s+$/u, ""));
  const blocks: CvBlock[] = [];
  let seenContent = false, inHeader = false, headerLines = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) { blocks.push({ kind: "blank", text: "" }); if (inHeader) inHeader = false; continue; }
    if (!seenContent) {
      seenContent = true;
      if (!isHeading(line) && !BULLET.test(line) && line.trim().length <= 80) { blocks.push({ kind: "name", text: line }); inHeader = true; continue; }
    }
    if (isHeading(line)) { inHeader = false; blocks.push({ kind: "heading", text: line }); continue; }
    if (inHeader && headerLines < 3 && line.trim().length <= 160 && !BULLET.test(line)) { headerLines++; blocks.push({ kind: "contact", text: line }); continue; }
    inHeader = false;
    if (BULLET.test(line)) { blocks.push({ kind: "bullet", text: line.replace(BULLET, "") }); continue; }
    let next = index + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (next < lines.length && next === index + 1 && BULLET.test(lines[next]) && line.trim().length <= 160) { blocks.push({ kind: "role", text: line }); continue; }
    blocks.push({ kind: "text", text: line });
  }
  return blocks;
}

/** The exact wording of every block, in order, for round-trip checks. */
export function layoutWords(blocks: CvBlock[]): string {
  return blocks.filter(block => block.kind !== "blank").map(block => block.text.trim()).join(" ").replace(/\s+/gu, " ");
}
