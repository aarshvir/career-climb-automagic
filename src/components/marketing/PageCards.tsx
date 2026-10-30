import { FileText, Repeat2 } from "lucide-react";
import "./ProductCards.css";
import "./PageCards.css";

// Round 3: each page stages its own illustrative product moment, so the product does not read as one repeated card.
// Placeholder employers and times only. Decorative (aria-hidden) and labelled as examples.

const week = ["M", "T", "W", "T", "F", "S", "S"];

const openings = [
  { role: "Operations Analyst", company: "Lumen Freight", place: "Chicago, IL", tag: "New" },
  { role: "Supply Chain Analyst", company: "Bluebird Retail", place: "Remote (US)", tag: "New" },
  { role: "Business Analyst", company: "Kestrel Energy", place: "Houston, TX", tag: "" },
  { role: "Strategy Associate", company: "Alder & Pine", place: "Remote (US)", tag: "" },
];
/** Openings matched to the roles you chose: a denser list with role filters and places. */
export function OpeningsCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-open ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · illustrative data</span></div>
    <div className="pc-tabs"><span className="is-on">All roles</span><span>Operations</span><span>Strategy</span></div>
    <ul className="pc-jobs">{openings.map(job => <li key={job.company}>
      <span className="pc-job"><strong>{job.role}</strong><span>{job.company} · {job.place}</span></span>
      {job.tag ? <span className="pc-tag">{job.tag}</span> : <span className="pc-tag pc-tag--neutral">Matched</span>}
    </li>)}</ul>
    <div className="pc-foot"><span />4 openings matched your roles</div>
  </div>;
}

/** Before and after: one CV line, reworded for one job from the person's own words. */
export function CvDiffCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-diff ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-file"><FileText />CV_Operations_Analyst.pdf</span><span className="pc-tag">Tailored</span></div>
    <div className="pc-diff-job"><span className="pc-diff-label">Job asks for</span><span className="pc-chip">Stock reporting</span><span className="pc-chip">Operations review</span></div>
    <div className="pc-diff-line pc-diff-line--before"><span className="pc-diff-label">Your line</span><p>Looked after the monthly stock reports for the warehouse team.</p></div>
    <div className="pc-diff-line pc-diff-line--after"><span className="pc-diff-label">Reworded for this job</span><p>Prepared monthly <mark>stock reports</mark> for the <mark>operations review</mark> with the warehouse team.</p></div>
  </div>;
}

const history = [
  ["Mon 7:04 AM", "3 jobs found", "3 CVs ready"],
  ["Fri 7:02 AM", "2 jobs found", "2 CVs ready"],
  ["Wed 7:01 AM", "No new jobs found", "Nothing to prepare"],
];
const prepared = [["CV_Operations_Analyst.pdf", "Ready for review"], ["CV_Supply_Chain_Analyst.pdf", "Ready for review"], ["CV_Business_Analyst.pdf", "CV tailored"]];
/** The Automated Job Loop dashboard: run history beside prepared CVs, with a role filter. */
export function DashboardCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-dash ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><strong>Your dashboard</strong><span className="pc-caption">Example · illustrative data</span></div>
    <div className="pc-tabs"><span className="is-on">All roles</span><span>Operations</span><span>Supply chain</span><span>Analytics</span></div>
    <div className="pc-dash-grid">
      <div><p className="pc-dash-h">Run history</p><ol className="pc-runs">{history.map(([when, found, ready]) => <li key={when}><span className="pc-time-mono">{when}</span><strong>{found}</strong><span>{ready}</span></li>)}</ol></div>
      <div><p className="pc-dash-h">Prepared CVs</p><ul className="pc-files">{prepared.map(([file, state]) => <li key={file}><span className="pc-file"><FileText />{file}</span><span className={`pc-tag${state === "CV tailored" ? " pc-tag--neutral" : ""}`}>{state}</span></li>)}</ul></div>
    </div>
    <div className="pc-foot"><span />Next run · Wed 7:00 AM</div>
  </div>;
}

/** The one-time setup: roles, locations, pace and time. */
export function SetupCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-setup ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><strong>Your setup</strong><span className="pc-caption">Example</span></div>
    <div className="pc-field"><span className="pc-diff-label">Roles</span><span className="pc-chips"><span className="pc-chip">Operations Analyst ×</span><span className="pc-chip">Supply Chain Analyst ×</span></span></div>
    <div className="pc-field"><span className="pc-diff-label">Locations</span><span className="pc-chips"><span className="pc-chip">Chicago, IL ×</span><span className="pc-chip">Remote (US) ×</span></span></div>
    <div className="pc-field"><span className="pc-diff-label">How often</span><span className="pc-seg"><span>Weekly</span><span className="is-on">3×/week</span><span>Daily</span></span></div>
    <div className="pc-meta"><span>Runs at</span><strong>7:00 AM</strong></div>
  </div>;
}

/** A compact "what is next" card for the closing bands. */
export function NextRunCard({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-next ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Next run</span><span className="pc-pill"><Repeat2 />3×/week</span></div>
    <div className="pc-next-time"><span className="pc-next-pulse" />Wed 7:00 AM</div>
    <div className="pc-week">{week.map((day, index) => <span key={index} className={[0, 2, 4].includes(index) ? "is-on" : ""}>{day}</span>)}</div>
    <div className="pc-foot"><span />Last run · 3 jobs · 3 tailored CVs</div>
  </div>;
}

const placeholderEmployers: [string, string][] = [["Lumen Freight", "Chicago, IL"], ["Bluebird Retail", "Remote (US)"], ["Kestrel Energy", "Houston, TX"]];
/** An example run for one audience: the roles that audience usually targets, with placeholder employers. */
export function AudienceRunCard({ roles, schedule = "3×/week", className = "" }: { roles: readonly string[]; schedule?: string; className?: string }) {
  return <div className={`pc-card pc-run ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example run · illustrative data</span></div>
    <div className="pc-head"><strong>Automated Job Loop</strong><span className="pc-pill"><Repeat2 />{schedule}</span></div>
    <ul className="pc-jobs">{roles.slice(0, 3).map((role, index) => <li key={role}>
      <span className="pc-job"><strong>{role}</strong><span>{placeholderEmployers[index][0]} · {placeholderEmployers[index][1]}</span></span>
      <span className={`pc-tag${index === 2 ? " pc-tag--neutral" : ""}`}>{index === 2 ? "CV tailored" : "Ready for review"}</span>
    </li>)}</ul>
    <div className="pc-foot"><span />{Math.min(roles.length, 3)} jobs · {Math.min(roles.length, 3)} tailored CVs</div>
  </div>;
}

const weekRuns: [string, string, string][] = [["Mon", "7:00 AM", "3 jobs"], ["Tue", "", ""], ["Wed", "7:00 AM", "No new jobs"], ["Thu", "", ""], ["Fri", "7:00 AM", "2 jobs"], ["Sat", "", ""], ["Sun", "", ""]];
/** One example week on a 3x/week schedule: the days it runs, and what each run left for review. Decorative. */
export function WeekStrip({ className = "" }: { className?: string }) {
  return <div className={`pc-week-strip ${className}`.trim()} aria-hidden="true">
    <p className="pc-week-strip-caption"><span className="pc-week-strip-dot" />Example week · 3×/week · illustrative data</p>
    <ol>{weekRuns.map(([day, time, result]) => <li key={day} className={time ? "is-run" : ""}>
      <span className="pc-week-day">{day}</span>
      <span className="pc-week-mark" />
      <span className="pc-week-time">{time || "Rest day"}</span>
      <span className="pc-week-result">{result}</span>
    </li>)}</ol>
  </div>;
}
