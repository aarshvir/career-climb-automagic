import { BookOpen, FileText, Play, Search } from "lucide-react";
import "./ProductCards.css";
import "./PageCards.css";
import "./AudienceCards.css";

// Round 5: the text-first pages (FAQ, pricing, contact, guides, help, walkthroughs) each get one small product moment in the
// hero, built from the same .pc-card vocabulary as the product pages. Decorative (aria-hidden), labelled as examples, and only
// ever shows statements the page already makes.


/** FAQ: one open answer and two closed questions, as the page itself shows them. */
export function FaqAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-faq ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · common questions</span><span className="pc-pill"><Search />Search</span></div>
    <div className="pc-qa is-open"><span className="pc-qa-q">What does the Automated Job Loop prepare for me?<i /></span><p>Matching jobs for your roles and locations, and a tailored CV for each prepared role, kept in your dashboard.</p></div>
    <div className="pc-qa"><span className="pc-qa-q">Which files can I upload?<i /></span></div>
    <div className="pc-qa"><span className="pc-qa-q">Can I download my documents?<i /></span></div>
  </div>;
}

const paces: [string, string, number, number][] = [["Starter", "1 run a week", 1, 40], ["Advanced", "3 runs a week", 3, 66], ["Pro Job Seeker", "1 run a day", 7, 92]];
/** Pricing: the run pace behind each plan, drawn as three rings. The dots on each ring are the runs in one example week. */
export function PacesAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-paces ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example week · runs per ring</span></div>
    <div className="pc-rings">
      <svg viewBox="0 0 200 200" className="pc-rings-svg" focusable="false">
        {paces.map(([name, , , radius]) => <circle key={name} cx="100" cy="100" r={radius} fill="none" className="pc-ring" />)}
        {paces.map(([name, , count, radius]) => Array.from({ length: count }, (_, index) => {
          const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
          return <circle key={`${name}-${index}`} cx={100 + radius * Math.cos(angle)} cy={100 + radius * Math.sin(angle)} r={index === 0 ? 5.5 : 4} className={index === 0 ? "pc-ring-dot pc-ring-dot--first" : "pc-ring-dot"} />;
        }))}
      </svg>
      <ul className="pc-rings-legend">{paces.map(([name, pace, count]) => <li key={name}><strong>{name}</strong><span>{pace}</span></li>)}</ul>
    </div>
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
