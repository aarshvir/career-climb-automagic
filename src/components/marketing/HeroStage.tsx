import LoopRunMock from "./LoopRunMock";
import { FileText } from "lucide-react";
import "./HeroStage.css";

/** A believable one-page résumé, set as the "tailored CV" a run prepares. Placeholder person, employers and skills only; no scores, counts or results.
 * The highlighted words are the job's own keywords, the same ones the Free CV Check example shows. Decorative (aria-hidden). */
export function ResumeSheet({ className = "" }: { className?: string }) {
  return <div className={`rs ${className}`.trim()} aria-hidden="true">
    <div className="rs-bar"><span className="rs-file"><FileText />CV_Product_Analyst.pdf</span><span className="rs-tag">Tailored</span></div>
    <div className="rs-page">
      <p className="rs-name">Alex Morgan</p>
      <p className="rs-role">Product Analyst · Austin, TX</p>
      <hr className="rs-rule" />
      <p className="rs-h">Profile</p>
      <p className="rs-p">Analyst who turns <mark>SQL reporting</mark> into decisions for <mark>sales stakeholders</mark>.</p>
      <p className="rs-h">Experience</p>
      <p className="rs-job"><b>Data Analyst</b><span>Contoso Health</span></p>
      <ul className="rs-list">
        <li>Built weekly <mark>SQL reporting</mark> for the regional sales team</li>
        <li>Defined <mark>KPI</mark> dashboards used by <mark>product managers</mark></li>
        <li>Analysed <mark>A/B test</mark> results for pricing changes</li>
      </ul>
    </div>
  </div>;
}

/** The home hero's one product object: the run window on a lit forest stage, with the résumé it prepared rising from the stage's lower edge.
 * The sheet stays clear of the window (nothing is covered) and the stage ends well above the proof strip. */
export default function HeroStage() {
  return <div className="hs jv-enter-stage">
    <div className="hs-panel">
      <div className="hs-win jv-enter-card">
        <div className="hs-win-bar" aria-hidden="true">
          <span className="hs-dots"><i /><i /><i /></span>
          <span className="hs-tabs"><b>Dashboard</b><span>Jobs</span><span>CVs</span><span>Schedule</span></span>
        </div>
        <div className="hs-win-body"><LoopRunMock /></div>
      </div>
      <ResumeSheet className="hs-sheet jv-enter-card" />
    </div>
  </div>;
}
