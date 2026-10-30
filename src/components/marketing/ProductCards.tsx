import { FileText, Repeat2 } from "lucide-react";
import "./ProductCards.css";

// Illustrative product fragments. Placeholder employers and times only: no scores, counts or outcomes.
// Every card is decorative (aria-hidden) and labelled as an example where it shows run data.

const runs = [
  { role: "Product Analyst", company: "Northwind Labs", place: "Remote (US)", tag: "Ready for review" },
  { role: "Data Analyst", company: "Contoso Health", place: "Austin, TX", tag: "Ready for review" },
  { role: "Junior Product Analyst", company: "Fabrikam", place: "Remote (US)", tag: "CV tailored" },
];

/** A static run result: the jobs a run found and where each one stands. */
export function RunCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-run ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example run · illustrative data</span></div>
    <div className="pc-head"><strong>Automated Job Loop</strong><span className="pc-pill"><Repeat2 />3×/week</span></div>
    <ul className="pc-jobs">{runs.map(run => <li key={run.company}>
      <span className="pc-job"><strong>{run.role}</strong><span>{run.company} · {run.place}</span></span>
      <span className={`pc-tag${run.tag === "CV tailored" ? " pc-tag--neutral" : ""}`}>{run.tag}</span>
    </li>)}</ul>
    <div className="pc-foot"><span />3 jobs found · 3 tailored CVs</div>
  </div>;
}

/** A tailored CV for one prepared role, with the job's own keywords reflected in the wording. */
export function CvCard({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return <div className={`pc-card pc-cv ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-file"><FileText />CV_Product_Analyst.pdf</span><span className="pc-tag">Tailored</span></div>
    <div className="pc-doc">
      <span className="pc-line pc-line--name" />
      <span className="pc-line pc-line--sub" />
      <div className="pc-doc-h">Profile</div>
      <div className="pc-doc-p">Analyst who turns <mark>SQL reporting</mark> into decisions for <mark>sales stakeholders</mark>.</div>
      {!compact && <><div className="pc-doc-h">Experience</div>
      <span className="pc-line" /><span className="pc-line pc-line--short" />
      <span className="pc-line" /><span className="pc-line pc-line--mid" /></>}
    </div>
    <div className="pc-foot-row"><span className="pc-chip">Product Analyst · Northwind Labs</span><span className="pc-chip">PDF · DOCX · TXT</span></div>
  </div>;
}

const week = ["M", "T", "W", "T", "F", "S", "S"];
/** The chosen weekdays and the next run. */
export function ScheduleCard({ className = "" }: { className?: string }) {
  const on = [0, 2, 4];
  return <div className={`pc-card pc-sched ${className}`.trim()} aria-hidden="true">
    <div className="pc-head"><strong>Schedule</strong><span className="pc-pill"><Repeat2 />3×/week</span></div>
    <div className="pc-week">{week.map((day, index) => <span key={index} className={on.includes(index) ? "is-on" : ""}>{day}</span>)}</div>
    <div className="pc-meta"><span>Next run</span><strong>Wed 7:00 AM</strong></div>
    <div className="pc-meta"><span>Roles</span><strong>Product Analyst · Data Analyst</strong></div>
    <div className="pc-meta"><span>Locations</span><strong>Remote (US) · Austin, TX</strong></div>
  </div>;
}

const steps = [
  ["7:00 AM", "Searches your connected sources"],
  ["7:02 AM", "Matches openings to your roles"],
  ["7:04 AM", "Tailors a CV for each prepared role"],
  ["7:05 AM", "Your dashboard is ready to review"],
];
/** A run, as a timeline. Illustrative times only. */
export function RunTimeline() {
  return <ol className="pc-timeline" aria-label="What a run does, illustrative times">{steps.map(([time, text]) => <li key={time}><span className="pc-time">{time}</span><span>{text}</span></li>)}</ol>;
}
