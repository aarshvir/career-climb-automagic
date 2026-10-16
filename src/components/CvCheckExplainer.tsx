import { Link } from 'react-router-dom';

/** Public explanation shared by the loading shell and interactive check. */
export default function CvCheckExplainer() {
  return <details className="check-recovery" aria-label="About the free CV check">
    <summary><strong>How does this work?</strong><span>What you get, and what happens to your CV</span></summary>
    <div>
      <h2 className="font-semibold">Tailor your CV to one job</h2>
      <p>Add a readable PDF, DOCX or TXT CV, or paste its text, then paste the job description. Jobvance rewords and reorders what is already in your CV so it reads well for that role, and can add a short profile built only from your own lines.</p>
      <h3 className="font-semibold">Can it invent experience?</h3>
      <p>No. Every change is checked against the line it came from. Suggestions that add an employer, number, tool, qualification or stronger claim of ownership (for example “led” where you wrote “supported”) are rejected. Gaps become questions for you to answer only if they are true.</p>
      <h3 className="font-semibold">What do I get?</h3>
      <p>Your tailored CV with each change listed beside your original wording, a list of what the job asks for, and formatted PDF, Word or text downloads once you confirm it is accurate.</p>
      <h3 className="font-semibold">What does it cost?</h3>
      <p>Comparing without AI, editing and downloads are free. AI tailoring is free for 3 CVs a month when you sign in, or 1 a day without an account. For more, <Link className="underline" to="/pricing">one-time passes start at $9</Link>.</p>
      <h3 className="font-semibold">What happens to my CV?</h3>
      <p>Your file stays on your device. If you choose AI tailoring, the CV text and job description are sent to our AI provider to prepare one version and are not stored unless you save. “Compare without AI” runs entirely on your device. Saving to an account is optional.</p>
      <p><Link className="underline" to="/how-it-works">How it works</Link> · <Link className="underline" to="/privacy">How your information is handled</Link></p>
    </div>
  </details>;
}
