/** Local, conservative copying of header details. This never creates career facts. */
export interface LoopSourceDetails {
  name: string;
  contactLine: string;
  nameSource: string;
  contactSources: string[];
}

const SECTION_OR_ROLE = /\b(?:curriculum|resume|résumé|vitae|summary|profile|education|experience|skills|projects|internship|student|graduate|analyst|manager|director|consultant|engineer|developer|associate|officer|specialist|assistant|professional|employment|volunteer|university|college|certification|portfolio|business|development|marketing|sales|finance|recruiter|executive|coordinator|bachelor|master|built|developed|prepared|led|supported|managed|delivered|coordinated|designed|created|improved|analyzed|analysed|researched|assisted|completed|achieved|increased|reduced)\b/i;
const NAME_WORD = "[\\p{L}][\\p{L}'’.\\-]*";
const NAME = new RegExp(`^${NAME_WORD}(?:\\s+${NAME_WORD}){1,4}$`, 'u');
const TITLE_CASE_NAME = new RegExp(`^[\\p{Lu}][\\p{L}'’.\\-]*(?:\\s+[\\p{Lu}][\\p{L}'’.\\-]*){1,4}$`, 'u');
const CONTACT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/|(?:\+\d[\d ()-]{7,}\d)/i;
const SECTION = /^(?:summary|profile|education|academic projects|projects|work experience|professional experience|employment|skills|references|referees|volunteering)\s*:?$/i;

export function copyLoopSourceDetails(sourceText: string): LoopSourceDetails {
  const header = sourceText.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 8);
  const labelled = header.find(line => /^(?:full name|name)\s*:\s*/i.test(line));
  const named = labelled?.replace(/^(?:full name|name)\s*:\s*/i, '').trim() ?? '';
  const first = header[0] ?? '';
  // Only an explicit name or a plausible first header line is copied. Ambiguity stays blank.
  const name = named && named.length <= 120 && NAME.test(named) && !SECTION_OR_ROLE.test(named)
    ? named : first.length <= 120 && TITLE_CASE_NAME.test(first) && !SECTION_OR_ROLE.test(first) ? first : '';
  const sectionAt = header.findIndex(line => SECTION.test(line));
  const contactHeader = sectionAt >= 0 ? header.slice(0, sectionAt) : header;
  const contactSources = contactHeader.filter(line => line.length <= 250 && CONTACT.test(line) && !/[.!?]\s+[A-Z]/.test(line) && !/^(?:employer|recruiter|client|referee|reference)\b/i.test(line));
  const contactLine = contactSources.join(' · ');
  return { name, contactLine: contactLine.length <= 500 ? contactLine : '', nameSource: name ? labelled && name === named ? labelled : first : '', contactSources: contactLine.length <= 500 ? contactSources : [] };
}
