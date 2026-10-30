import { currentOffer } from './current-offer';

/** The visible FAQ on /faq, kept out of the page module so the prerender can describe exactly the questions on the page. */
export const productFaqs: [string, string][] = [
  ["What does the Automated Job Loop prepare for me?", "It finds jobs from connected sources for your roles and locations, prepares a tailored CV for each prepared role and keeps everything in your dashboard. Download PDF, DOCX or TXT and open the employer’s vacancy when you are ready."],
  ["How does the Automated Job Loop work?", "Add your experience, choose your roles, locations and schedule, and the loop searches connected sources and prepares a separate CV for each role. Come back to your dashboard to download PDF, DOCX or TXT. Search, model and inbox connections depend on operator setup; the workspace shows which are available."],
  ["Do I need an account?", "Yes. Your Jobvance account keeps your CVs, preferences and applications together. Create an account, complete your search setup and choose how to prepare your applications."],
  ["Does Jobvance rewrite my CV?", "It rewords and reorders what is already in your CV so it reads well for the job, and adds a short profile built only from your own lines. It works from the experience you added, and it asks you about gaps instead of filling them. You check every change before downloading."],
  ["Can I download my documents?", "Your approved CV can be downloaded as PDF, DOCX or TXT. Your original uploaded file can also be downloaded."],
  ["Is my CV saved?", "Only if you choose. The free check reads your file on your device, and nothing is stored in your account until you confirm saving; the exact save is shown first. The Privacy page has the details."],
  ["Does an AI model see my CV?", "Only if you choose AI tailoring. Comparing without AI runs on your device. If you choose to tailor a CV, the text of your CV and the job description is sent to our AI provider to prepare that version. The Privacy page names the provider and what is kept."],
  ["Which files can I upload?", "Text-based PDF, DOCX and TXT files up to 5 MB. Scanned PDFs and old .doc files need conversion to a readable supported format."],
  ["What does Jobvance cost?", `${currentOffer.statement} Your account includes 3 AI-tailored CVs each month. For more, a one-time pass gives you Sprint: 25 tailored CVs over 7 days for $9, Job Search: 100 over 30 days for $19, or Career Move: 300 over 90 days for $39. ${currentOffer.passes}`],
  ["Are interviews or jobs guaranteed?", "No. Jobvance helps prepare and organize applications; employer decisions and hiring outcomes remain outside its control."],
  ["Can I use projects or internships in my CV?", "Yes. Your reviewed CV can include clearly labelled academic projects, internships, activities and previous employment. Describe your own contribution accurately. Project work is not automatically evidence of required professional experience."],
  ["How do I read my CV Check results?", "Matching words are a starting point, not a verdict. Read the requirement and the CV example yourself; the check cannot confirm your qualifications or predict what an employer will decide."],
];
