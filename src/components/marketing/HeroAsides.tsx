import { BookOpen, FileText, Play } from "lucide-react";
import "./ProductCards.css";
import "./PageCards.css";
import "./AudienceCards.css";

// Round 5: the text-first pages (FAQ, pricing, contact, guides, help, walkthroughs) each get one small product moment in the
// hero, built from the same .pc-card vocabulary as the product pages. Decorative (aria-hidden), labelled as examples, and only
// ever shows statements the page already makes.


const cadenceDays = ["M", "T", "W", "T", "F", "S", "S"];
const cadence: [string, string, number[]][] = [["Starter", "1 run a week", [0]], ["Advanced", "3 runs a week", [0, 2, 4]], ["Pro Job Seeker", "1 run a day", [0, 1, 2, 3, 4, 5, 6]]];
/** Pricing: a plain cadence chart. One row per plan, one dot per run in an example week (Advanced shows Mon, Wed and Fri; you choose your days). */
export function PacesAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-cadence ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example week · runs per plan</span></div>
    <div className="pc-cad-grid">
      <span className="pc-cad-days">{cadenceDays.map((day, index) => <i key={index}>{day}</i>)}</span>
      {cadence.map(([name, pace, on]) => <div key={name} className="pc-cad-row">
        <span className="pc-cad-name"><strong>{name}</strong><span>{pace}</span></span>
        <span className="pc-cad-dots">{cadenceDays.map((_, index) => <i key={index} className={on.includes(index) ? "is-on" : ""} />)}</span>
      </div>)}
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

/** Guides: one real guide as a cover (category, title, reading time) with a drawn document motif. Decorative; the full list sits below. */
export function GuidesFeaturedAside({ category, title, minutes, className = "" }: { category: string; title: string; minutes: number; className?: string }) {
  return <div className={`pc-card pc-aside pc-cover ${className}`.trim()} aria-hidden="true">
    <div className="pc-cover-art"><span /><span /><span /><i /></div>
    <div className="pc-cover-body"><span className="pc-caption"><BookOpen />Featured guide · {category}</span><strong>{title}</strong><span className="pc-cover-meta">{minutes} min read</span></div>
  </div>;
}

/** Walkthroughs: a captioned video beside the interactive steps. */
export function WalkthroughAside({ className = "" }: { className?: string }) {
  return <div className={`pc-card pc-aside pc-walk ${className}`.trim()} aria-hidden="true">
    <div className="pc-top"><span className="pc-caption">Example · captioned video</span><span className="pc-file"><FileText />Interactive steps</span></div>
    <div className="pc-walk-screen"><span className="pc-walk-play"><Play /></span><span className="pc-walk-caption">Choose your roles and locations once.</span><span className="pc-walk-bar"><i /></span></div>
  </div>;
}
