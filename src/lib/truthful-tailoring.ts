import { validateRewrite } from '../../supabase/functions/_shared/cv-tailor';
import { cvCheckCostText } from './cv-check-faqs';

/** Date the facts on the public AI-tailoring page were last compared with the product code. Update it whenever the checks or the copy change. */
export const TAILORING_FACTS_CHECKED = '5 November 2026';

/** The same wording as the FAQ on /cv-check, kept in one place so the two pages cannot disagree about what leaves the device. */
export const AI_SENT_TEXT = 'Your file stays on your device and comparing without AI runs entirely on it. AI tailoring sends your CV text, job description, job title and company name through OpenRouter to the AI model provider. If you choose to improve the CV with your answers, your confirmed answers and their CV-line references are sent too. Saving a check to your Jobvance account is optional; see the privacy page for how your information is handled.';

export type TailoringExample = { source: string; suggestion: string; why: string };

/**
 * Invented lines, not customer text. The result shown beside each one is computed by the product's own
 * validateRewrite at render time, so a change to the checks changes the page (and fails the test that pins these).
 */
export const checkedExamples: TailoringExample[] = [
  { source: 'Built the weekly KPI pack for the COO covering sales, margin and inventory', suggestion: 'Built the weekly KPI reporting pack for the COO, tracking sales, margin and inventory performance', why: 'No check failed: no new digit number, capitalised name, qualification word or listed ownership verb. Whether the meaning is unchanged is for you to judge.' },
  { source: 'Supported the finance team with monthly reporting', suggestion: 'Supported the finance team with monthly reporting for 40 stores', why: 'Adds a number (40) that is not in the line.' },
  { source: 'Built Excel models and slide decks', suggestion: 'Built Excel and Tableau models and slide decks', why: 'Adds a tool (Tableau) that is not in the line.' },
  { source: 'Supported the finance team with monthly reporting', suggestion: 'Supported the finance team with monthly reporting as a certified analyst', why: 'Adds a qualification word (certified) that is not in the line.' },
  { source: 'Supported the finance team with monthly reporting', suggestion: 'Led monthly reporting for the finance team', why: 'Upgrades “supported” to “led”, which claims more ownership than the line does.' },
  { source: 'Projected savings of AED 1M from the pilot', suggestion: 'Saved AED 1M through the pilot', why: 'The line is a projection; the suggestion states it as achieved. Cautious wording must stay exactly as written.' },
];

/** Suggestions that pass every check and are still wrong: the honest limit of a wording check. */
export const slipThroughExamples: TailoringExample[] = [
  { source: 'Prepared monthly reports for the finance team', suggestion: 'Prepared monthly reports that shaped the finance team’s decisions', why: 'Adds an outcome in ordinary words. The checks look for numbers, names, qualifications and listed verbs, not for new claims.' },
  { source: 'Supported the store rollout', suggestion: 'Implemented the store rollout', why: 'Verbs that are not on the list, such as “implemented” or “developed”, are not checked, so a supporting role can read as doing the work.' },
  { source: 'Analyst on the finance team', suggestion: 'Senior Analyst on the finance team', why: 'Common title words such as “Senior” are not treated as new names, so a title can rise unnoticed.' },
];

export type ExampleResult = 'kept' | 'left-out';
export function exampleResult(example: TailoringExample): ExampleResult {
  return validateRewrite(example.suggestion, [example.source]) === null ? 'kept' : 'left-out';
}

export const tailoringFaqs: [string, string][] = [
  ['Can the AI add things that are not in my CV?', 'It is asked not to, and word-rule checks leave out some suggestions that add numbers in digits, capitalised names, listed qualification words or listed ownership verbs. The checks have limits, so a suggestion can still claim more than your CV says. Read the changes and keep your original wherever you can.'],
  ['What does the AI change in my CV?', 'It rewords bullet and text lines, reorders bullets under one role and writes a short profile. Your name, contact lines, headings and role lines are copied as they are when Jobvance recognises them by their layout. A new bullet appears only if you answer a question, confirm the answer and choose the CV line it belongs to.'],
  ['What happens to a suggestion that fails a check?', 'It is left out and your original line stays. The check tells you how many were left out, not what they said. The count includes reorders that do not match and suggestions it could not read or place; it does not count a suggestion that changes nothing.'],
  ['Can I undo a change?', 'A reworded line or a replaced profile has a button to keep your original wording, and a new line or profile has a button to remove it. A reorder has no button of its own. A reworded line inside a profile that is replaced is not listed on its own; the replaced profile shows your original text. After you improve the CV with your answers, or if you edited your CV before tailoring, you can also undo the whole step. You confirm that your CV is accurate before you download or save it.'],
  ['Is my CV sent to an AI provider?', `Only if you choose AI tailoring. ${AI_SENT_TEXT}`],
  ['How much does AI tailoring cost?', cvCheckCostText],
  ['Will AI tailoring get me an interview?', 'No. Jobvance helps you prepare and organise applications; employer decisions are outside its control.'],
];

/** schema.org nodes for the page: the FAQ exactly as printed. No ratings, reviews, awards or outcome figures. */
export function truthfulTailoringStructuredNodes(): object[] {
  return [{ '@type': 'FAQPage', mainEntity: tailoringFaqs.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) }];
}
