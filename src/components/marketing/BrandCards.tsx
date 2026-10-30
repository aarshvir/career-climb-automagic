import { ArrowDown } from "lucide-react";
import LoopOrbit from "./LoopOrbit";
import "./BrandCards.css";

// Round 6: page-specific artifacts, so the product's illustrative cards are not the only recurring visual.

const stops: { when: string; title: string; text: string }[] = [
  { when: "Once · you", title: "Add your experience", text: "Upload a CV, reuse a saved check, or build one from guided questions." },
  { when: "Once · you", title: "Choose roles, places and pace", text: "Pick the roles and locations you want, then weekly, three-times-weekly or daily." },
  { when: "Every run · automatic", title: "Find and match", text: "Searches the sources connected to your account and matches openings to the experience you confirmed." },
  { when: "Every run · automatic", title: "Tailor and prepare", text: "A tailored CV for each prepared role, with every job and next step kept in your dashboard." },
];

/** /how-it-works: one vertical rail from the two things you do to the two things every run does. */
export function JourneyTimeline() {
  return <ol className="bc-timeline" aria-label="From setup to dashboard">{stops.map((stop, index) => <li key={stop.title} className={index > 1 ? "is-auto" : ""} data-reveal>
    <span className="bc-timeline-node" aria-hidden="true" />
    <p className="jv-caption">{stop.when}</p>
    <h3>{stop.title}</h3>
    <p>{stop.text}</p>
  </li>)}</ol>;
}

/** /about: the brand mark of the product, the loop, with the three words the page is built on. Decorative. */
export function AboutMark() {
  return <div className="bc-mark" aria-hidden="true">
    <LoopOrbit size={380} labels variant="dark" animate={false}><span className="bc-mark-core"><strong>Your experience</strong><span>every time</span></span></LoopOrbit>
  </div>;
}

/** /about: the problem as a picture. Three applications each retype the same facts; one saved record replaces them. Decorative, labelled as an example. */
export function RepeatStack() {
  return <div className="bc-stack" aria-hidden="true">
    <p className="bc-stack-cap">Example · the same facts, retyped</p>
    <div className="bc-stack-docs">{["Application 3", "Application 2", "Application 1"].map(label => <div key={label} className="bc-stack-doc"><span>{label}</span><i /><i /><i className="is-short" /></div>)}</div>
    <ArrowDown className="bc-stack-arrow" />
    <div className="bc-stack-one"><strong>Your experience</strong><span>Added once, reused every run</span></div>
  </div>;
}

const miniRows: [string, string][] = [["Product Analyst", "CV tailored"], ["Data Analyst", "CV tailored"], ["Operations Analyst", "CV tailored"]];
/** A three-row example run for dark surfaces (the account entry panel). Decorative; placeholder roles only. */
export function MiniRun({ className = "" }: { className?: string }) {
  return <div className={`bc-mini ${className}`.trim()} aria-hidden="true">
    <p className="bc-mini-cap">Example run · illustrative</p>
    <ul>{miniRows.map(([role, state]) => <li key={role}><span>{role}</span><em>{state}</em></li>)}</ul>
    <p className="bc-mini-foot"><i />3 jobs · 3 tailored CVs</p>
  </div>;
}
