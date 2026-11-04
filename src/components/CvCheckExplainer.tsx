import { Link } from 'react-router-dom';
import { FAIR_USE_TAILORED_CVS_PER_DAY } from '@/lib/pass-plans';

/** Public explanation shared by the loading shell and interactive check. */
export default function CvCheckExplainer() {
  return <details className="check-recovery" aria-label="About the free CV check">
    <summary><strong>How does this work?</strong><span>What you get, and what happens to your CV</span></summary>
    <div>
      <h2 className="font-semibold">Tailor your CV to one job</h2>
      <p>Add a readable PDF, DOCX or TXT CV, or paste its text, then paste the job description. Jobvance rewords and reorders what is already in your CV so it reads well for that role, and can add a short profile built from your own lines and any answers you confirm.</p>
      <h3 className="font-semibold">Can it invent experience?</h3>
      <p>Suggestions go through word-rule checks against their source CV lines and any confirmed answers you attach to them. Some that add numbers, capitalised names or tools, qualification words or listed ownership verbs (for example “led” where you wrote “supported”) are left out. The checks have limits, so review every change. Gaps become questions for you to answer only if they are true.</p>
      <h3 className="font-semibold">What do I get?</h3>
      <p>Your tailored CV with the changes listed, and each reworded line shown beside your original wording, a list of what the job asks for, and formatted PDF, Word or text downloads once you confirm it is accurate.</p>
      <h3 className="font-semibold">What does it cost?</h3>
      <p>Comparing without AI, editing and downloads are free. Your account includes AI tailoring for 3 CVs a month when AI tailoring is available. For more, <Link className="underline" to="/pricing">one-time passes start at $9</Link>, with a fair-use limit of {FAIR_USE_TAILORED_CVS_PER_DAY} AI-tailored CVs a day. AI tailoring is subject to availability and the service’s monthly budget.</p>
      <h3 className="font-semibold">What happens to my CV?</h3>
      <p>Your file stays on your device. AI tailoring sends your CV text, job description, job title and company name through OpenRouter to the AI model provider. If you choose “Improve my CV with these answers”, your confirmed answers and their CV-line references are sent too. “Compare without AI” runs entirely on your device. Saving to an account is optional.</p>
      <p><Link className="underline" to="/how-it-works">How it works</Link> · <Link className="underline" to="/truthful-cv-tailoring">How AI changes are checked</Link> · <Link className="underline" to="/privacy">How your information is handled</Link></p>
    </div>
  </details>;
}
