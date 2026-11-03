import { FREE_TAILORED_CVS_PER_MONTH, passPlans } from './pass-plans';
import { subscriptionPlans } from './subscription-plans';

/** Date the facts on the public CV Check page were last compared with the product. Update it whenever the copy or the limits change. */
export const FACTS_CHECKED = '4 November 2026';

export const cheapestPassPrice = Math.min(...passPlans.map(plan => plan.price));
export { FREE_TAILORED_CVS_PER_MONTH };
const cheapestMonthlyPlan = Math.min(...subscriptionPlans.map(plan => plan.priceUsd));
const passList = passPlans.map(plan => `$${plan.price} (${plan.name}, ${plan.tailoredCvs} CVs over ${plan.days} days)`);

/** The pricing facts, written once from the price files so the page and its FAQ cannot drift from the pricing page. */
export const cvCheckCostText = `A free account includes unlimited comparisons without AI and ${FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs a month. For more AI tailoring, one-time passes cost ${passList.slice(0, -1).join(', ')} or ${passList[passList.length - 1]}. Passes are one-time payments and nothing renews. Automated Job Loop has separate monthly plans from $${cheapestMonthlyPlan}.`;

/** One list feeds the visible FAQ and the page's FAQPage data, so they always say the same thing. */
export const cvCheckFaqs: [string, string][] = [
  ['Do I need an account to use the CV check?', 'Yes, a free one. Comparing without AI has no limit, and editing and downloads are free.'],
  ['What does the check show me?', 'Up to the first 40 parsed requirements in English, one of four outcomes (Covered, Partly covered, Not shown in your CV, Needs your judgment) and the closest line from your CV with its line number. Additional and omitted passages remain available for review.'],
  ['Why is there no match percentage or ATS score?', 'A percentage hides which requirement is missing and differs between tools. Jobvance shows the requirement and the CV line behind it. It is a guide to what to strengthen, not a hiring prediction.'],
  ['Does my CV leave my device?', 'Your file stays on your device and comparing without AI runs entirely on it. AI tailoring sends your CV text, job description, job title and company name through OpenRouter to the AI model provider. If you choose to improve the CV with your answers, your confirmed answers and their CV-line references are sent too. Saving a check to your Jobvance account is optional; see the privacy page for how your information is handled.'],
  ['Can the AI invent experience on my CV?', 'It is built not to. Each change is checked against its source CV lines and any confirmed answers you attach to those lines. Unsupported additions of numbers, capitalised names or tools, qualification words or stronger ownership verbs are rejected. The check is a rule check on wording, so you still read every change before you download.'],
  ['How much does it cost?', cvCheckCostText],
  ['Which files and languages work?', 'Text-based PDF, DOCX and TXT files up to 5 MB, or pasted text. Scanned PDFs and old .doc files need converting first. The wording check is for English text.'],
  ['Will this get me an interview?', 'No. Jobvance helps you prepare and organise applications; employer decisions are outside its control.'],
];
