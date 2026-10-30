import type { ReactNode } from "react";
import { Check, Repeat2 } from "lucide-react";
import "./ProductCards.css";
import "./PageCards.css";
import "./AudienceCards.css";

// Round 7: each audience page leads with its own artifact (the shared run card stays on the home hero).
// Placeholder content only. Decorative (aria-hidden), labelled as examples, no claims or numbers about outcomes.

const studentSources: [string, string, string][] = [
  ["Project", "Reporting dashboard", "University operations module"],
  ["Placement", "Stock counts and rota", "Retail placement"],
  ["Activity", "Society budget tracking", "Student society"],
];

/** Students: projects, placements and activities feed one tailored CV line. */
export function StudentSourceCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-source ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · your experience</span><span className="pc-pill">3 sources</span></div>
    <ul className="pc-source-list">{studentSources.map(([kind, title, where], index) => <li key={kind} className={index === 0 ? "is-used" : ""}>
      <span className="pc-source-kind">{kind}</span><span className="pc-source-text"><strong>{title}</strong><span>{where}</span></span>
    </li>)}</ul>
    <div className="pc-source-join"><i /><span>Used for Graduate business analyst</span><i /></div>
    <div className="pc-line-box"><span className="pc-diff-label">Tailored CV line</span><p>Built a <mark>reporting dashboard</mark> for a university <mark>operations</mark> module.</p></div>
  </div>;
}

/** MBA: a pivot from prior work to the target role, with the examples that carry across. */
export function MbaPivotCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-pivot ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · prior work to target role</span></div>
    <div className="pc-pivot-row">
      <span className="pc-pivot-end"><span className="pc-diff-label">Before the MBA</span><strong>Operations lead</strong></span>
      <span className="pc-pivot-arrow"><i /></span>
      <span className="pc-pivot-end pc-pivot-end--to"><span className="pc-diff-label">Target role</span><strong>Strategy associate</strong></span>
    </div>
    <ul className="pc-pivot-list">{["Stakeholder reporting", "Process improvement", "Team leadership"].map((item, index) => <li key={item}><span className="pc-pivot-n">0{index + 1}</span><strong>{item}</strong><span className="pc-tag pc-tag--neutral">{index === 2 ? "From your MBA" : "From prior work"}</span></li>)}</ul>
    <div className="pc-foot"><span />3 reviewed examples · 1 tailored CV</div>
  </div>;
}

const runWeek: [string, string][] = [["Mon", "3 jobs"], ["Tue", ""], ["Wed", "No new"], ["Thu", ""], ["Fri", "2 jobs"], ["Sat", ""], ["Sun", ""]];

/** Professionals: a compact weekly-run calendar. */
export function WeekRunCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-weekrun ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example week · illustrative data</span><span className="pc-pill"><Repeat2 />3×/week</span></div>
    <ol className="pc-weekrun-grid">{runWeek.map(([day, result], index) => <li key={day + index} className={[0, 2, 4].includes(index) ? "is-run" : ""}><span className="pc-weekrun-day">{day}</span><span className="pc-weekrun-dot" /><span className="pc-weekrun-result">{result || "Rest"}</span></li>)}</ol>
    <div className="pc-meta"><span>Runs at</span><strong>7:00 AM</strong></div>
    <div className="pc-foot"><span />Next run · Wed 7:00 AM · reuses your confirmed facts</div>
  </div>;
}

/** Closing-band companion for the audience pages: the same CV line, before and after, in a compact card. */
export function CvLineCard({ before, after, className = "" }: { before: ReactNode; after: ReactNode; className?: string }) {
  return <div className={`pc-card pc-cvline ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · your words</span><span className="pc-tag">Reviewed</span></div>
    <div className="pc-line-box pc-line-box--before"><span className="pc-diff-label">Your line</span><p>{before}</p></div>
    <div className="pc-line-box"><span className="pc-diff-label">Reworded for the job</span><p>{after}</p></div>
  </div>;
}

const trailSteps = [["Add your experience", "CV uploaded or built"], ["Choose roles and locations", "3×/week at 7:00 AM"], ["Review your dashboard", "Next run · Wed 7:00 AM"]];
/** Closing-band companion for How it works: the three set-up steps, completed, and the run they lead to. */
export function StepsDoneCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-done ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · set up once</span></div>
    <ol className="pc-done-list">{trailSteps.map(([title, note]) => <li key={title}><span className="pc-done-check"><Check /></span><span className="pc-done-text"><strong>{title}</strong><span>{note}</span></span></li>)}</ol>
    <div className="pc-foot"><span />Runs on its own from here</div>
  </div>;
}
