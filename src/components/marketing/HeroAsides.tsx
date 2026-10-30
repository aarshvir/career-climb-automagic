import { BookOpen, FileText, Play, Search } from "lucide-react";
import "./ProductCards.css";
import "./PageCards.css";

// Round 5: the text-first pages (FAQ, pricing, contact, guides, help, walkthroughs) each get one small product moment in the
// hero, built from the same .pc-card vocabulary as the product pages. Decorative (aria-hidden), labelled as examples, and only
// ever shows statements the page already makes.

const days = ["M", "T", "W", "T", "F", "S", "S"];

/** FAQ: one open answer and two closed questions, as the page itself shows them. */
export function FaqAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-faq ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · common questions</span><span className="pc-pill"><Search />Search</span></div>
    <div className="pc-qa is-open"><span className="pc-qa-q">What does the Automated Job Loop prepare for me?<i /></span><p>Matching jobs for your roles and locations, and a tailored CV for each prepared role, kept in your dashboard.</p></div>
    <div className="pc-qa"><span className="pc-qa-q">Which files can I upload?<i /></span></div>
    <div className="pc-qa"><span className="pc-qa-q">Can I download my documents?<i /></span></div>
  </div>;
}

const paces: [string, string, number[]][] = [["Starter", "1 run a week", [0]], ["Advanced", "3 runs a week", [0, 2, 4]], ["Pro Job Seeker", "1 run a day", [0, 1, 2, 3, 4, 5, 6]]];
/** Pricing: the run pace behind each plan, drawn on one example week. */
export function PacesAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-paces ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example week · M T W T F S S</span></div>
    {paces.map(([name, pace, on]) => <div className="pc-pace" key={name}>
      <span className="pc-pace-name"><strong>{name}</strong><span>{pace}</span></span>
      <span className="pc-pace-dots">{days.map((_, index) => <i key={index} className={on.includes(index) ? "is-on" : ""} />)}</span>
    </div>)}
  </div>;
}

/** Contact: the private receipt a request returns (the real code is shown once, after sending). */
export function ReceiptAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-receipt ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · private receipt</span></div>
    <div className="pc-receipt-code"><span className="pc-diff-label">Your receipt code</span><strong>JVS-••••-••••-••••</strong></div>
    <div className="pc-receipt-rows"><span>No account needed</span><span>Keep the code to read any reply</span></div>
  </div>;
}

/** Guides: the library as an index, counted from the real list. */
export function GuidesAside({ counts, className = "" }: { counts: [string, number][]; className?: string }) {
  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  return <div className={`pc-card pc-aside pc-index ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption"><BookOpen />Guide library</span><span className="pc-tag pc-tag--neutral">{total} guides</span></div>
    <ul className="pc-index-list">{counts.map(([name, count]) => <li key={name}><span>{name}</span><strong>{count}</strong></li>)}</ul>
  </div>;
}

const helpSteps = [["Add your experience", "Upload a CV or build one"], ["Choose roles and locations", "Pick a weekly, 3x weekly or daily schedule"], ["Review your dashboard", "Matched jobs and a tailored CV for each"]];
/** Help: the three clicks every new search takes. */
export function HelpAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-help ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · your next click</span></div>
    <ol className="pc-trail">{helpSteps.map(([title, note], index) => <li key={title} className={index === 1 ? "is-now" : ""}><span className="pc-trail-n">0{index + 1}</span><span className="pc-trail-t"><strong>{title}</strong><span>{note}</span></span></li>)}</ol>
  </div>;
}

/** Walkthroughs: a captioned video beside the interactive steps. */
export function WalkthroughAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-walk ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · captioned video</span><span className="pc-file"><FileText />Interactive steps</span></div>
    <div className="pc-walk-screen"><span className="pc-walk-play"><Play /></span><span className="pc-walk-caption">Choose your roles and locations once.</span><span className="pc-walk-bar"><i /></span></div>
  </div>;
}
