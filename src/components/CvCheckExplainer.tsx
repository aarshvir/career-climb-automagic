import { Link } from 'react-router-dom';

/** Public explanation shared by the loading shell and interactive check. */
export default function CvCheckExplainer() {
  return <details className="check-recovery" aria-label="About the free CV check">
    <summary><strong>What does this CV check do?</strong><span>Inputs, results and privacy</span></summary>
    <div>
      <h2 className="font-semibold">Compare your CV with a job description</h2>
      <p>Add a readable PDF, DOCX or TXT CV, or paste its text. Then paste the responsibilities and requirements from one vacancy. The check shows job requirements beside passages from your CV so you can decide what to clarify or change.</p>
      <h3 className="font-semibold">What do I get?</h3>
      <p>A wording comparison, questions to review and an editable CV. Relevant bullets may be moved within the same role when the wording supports it. You make the final edits and can preview a PDF before approving PDF, Word or text downloads.</p>
      <h3 className="font-semibold">Is this an ATS score or an automatic rewrite?</h3>
      <p>No. Similar wording does not prove you meet a requirement, and missing wording does not prove you lack the experience. The check does not predict an employer’s decision or write new achievements.</p>
      <h3 className="font-semibold">Do I need an account?</h3>
      <p>The check and downloads are free without an account. Analysis runs on your device. Account saving and temporary draft recovery are separate choices. You can reuse your chosen CV for a second vacancy.</p>
      <p><Link className="underline" to="/how-it-works">See the steps</Link> · <Link className="underline" to="/privacy">How your information is handled</Link></p>
    </div>
  </details>;
}
