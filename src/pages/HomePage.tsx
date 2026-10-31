import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import LoopJourney from "@/components/LoopJourney";
import LoopOrbit from "@/components/marketing/LoopOrbit";
import HeroStage from "@/components/marketing/HeroStage";
import { CvCard, RunTimeline, ScheduleCard } from "@/components/marketing/ProductCards";
import { CvDiffCard, NextRunCard, OpeningsCard } from "@/components/marketing/PageCards";
import { useReveal } from "@/hooks/useReveal";
import { homeGuides } from "@/lib/home-guides";
import PriceNote from "@/components/marketing/PriceNote";
import "./Home.css";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

// Outcomes the product already promises elsewhere (FAQ, pricing, Automated Job Loop page). No counts, ratings or results.
const proof: [string, string][] = [["Matched jobs", "for your roles and locations"], ["Tailored CVs", "for matching roles"], ["Your schedule", "Weekly, 3×/week or daily"], ["Your formats", "PDF, DOCX or TXT downloads"]];

function StartLink({ children = "Start my search", to = "/onboarding", size = "md", variant = "primary", className = "" }: { children?: React.ReactNode; to?: string; size?: "md" | "lg"; variant?: "primary" | "secondary"; className?: string }) {
  return <Link to={to} className={`jv-btn jv-btn--${variant}${size === "lg" ? " jv-btn--lg" : ""} ${className}`.trim()}>{children}<ArrowRight aria-hidden="true" /></Link>;
}

function TextLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="jv-link"><span>{children}</span><ArrowRight aria-hidden="true" /></Link>;
}

export default function HomePage() {
  useReveal();
  return <div className="jv-home">
    {/* 1. Hero */}
    <section className="jv-hero" aria-labelledby="home-title">
      <div className="jv-shell jv-hero-grid">
        <div className="jv-hero-copy">
          {/* The product is named right above the pitch, so the main action can stay short. */}
          <p className="jv-caption jv-hero-eyebrow">Automated Job Loop</p>
          <h1 id="home-title" className="jv-hero-title jv-enter-h1"><span className="jv-h-bind">Jobvance automates</span> <span className="jv-h-bind">your job search</span> <span className="jv-h-mark">end to end.</span></h1>
          <p className="jv-hero-lead jv-enter" style={delay(60)}>Choose your roles and locations once. <span className="jv-nb">Automated Job Loop</span> runs in the background and finds the best-matching jobs for you, with tailored, role-specific CVs built from the facts you confirm.</p>
          <div className="jv-hero-actions jv-enter" style={delay(140)}>
            <StartLink size="lg" className="jv-hero-cta">Start my search</StartLink>
            <TextLink to="/check">Try the free CV Check</TextLink>
          </div>
          <div className="jv-hero-note jv-enter" style={delay(180)}><PriceNote /></div>
          <div className="jv-built-for jv-enter" style={delay(220)}><span>Built for</span><div><Link to="/for-students">Students and graduates</Link><Link to="/for-mba">MBA career pivots</Link><Link to="/for-career-switchers">Busy professionals</Link></div></div>
        </div>
        <div className="jv-hero-visual jv-hero-visual--stage"><HeroStage /></div>
      </div>
    </section>

    {/* 2. Proof strip: a five-cell spec table. */}
    <div className="jv-proof jv-enter-fade">
      <div className="jv-shell">
        <ul aria-label="At a glance">{proof.map(([lead, rest], index) => <li key={lead}><span className="jv-proof-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><strong>{lead}</strong><span>{rest}</span></li>)}</ul>
      </div>
    </div>

    {/* 3. How the loop runs: the headline leads, then the per-run cycle (orbit) beside the one-time set-up (steps). */}
    <section className="jv-loop-band jv-dark" aria-labelledby="home-loop-journey">
      <div className="jv-loop-grid">
        <div className="jv-loop-head" data-reveal>
          <p className="jv-caption">How Automated Job Loop works</p>
          <h2 id="home-loop-journey">Set it up once. Come back to your next applications.</h2>
        </div>
        <div className="jv-loop-visual">
          <p className="jv-loop-caption">Example run · illustrative</p>
          <LoopOrbit size={480} variant="dark" labels once>
            <span className="jv-orbit-core">
              <span className="jv-orbit-core-time">7:00 AM</span>
              <span className="jv-orbit-core-meta">Mon · Wed · Fri</span>
              <span className="jv-orbit-core-stage"><b>Find</b><b>Tailor</b><b>Review</b></span>
            </span>
          </LoopOrbit>
          <div className="jv-loop-timeline"><RunTimeline /></div>
        </div>
        <div className="jv-loop-steps">
          <p className="jv-loop-caption">Set up once · by you</p>
          <LoopJourney variant="ring" />
          <div className="jv-loop-actions">
            <StartLink className="jv-loop-cta">Start my search</StartLink>
          </div>
        </div>
      </div>
    </section>

    {/* 4. The work it takes off your hands: repeated searching, finding openings, preparing a CV for each.
        Each row stages one illustrative product fragment; one sentence states where Jobvance stops. */}
    <section className="jv-control" aria-labelledby="home-control-title">
      <div className="jv-shell">
        <div className="jv-section-head" data-reveal>
          <h2 id="home-control-title">Stop starting your job search from scratch.</h2>
          <p>Set your search once. Come back to matched openings and tailored CVs, ready to use.</p>
        </div>
        <div className="jv-bento">
          <article className="jv-tile jv-tile--schedule" data-reveal>
            <div className="jv-tile-copy"><p className="jv-step-index">01 · Schedule</p><h3>Your search comes back on schedule.</h3><p>Weekly, three days a week or daily, the next run starts without you rebuilding the same searches. Pause it whenever your plans change.</p></div>
            <div className="jv-tile-card" aria-hidden="true"><p className="jv-tile-next"><span className="jv-mock-pulse" />Next run · <b>Wed 7:00 AM</b><i>Example</i></p><ScheduleCard /></div>
          </article>
          <article className="jv-tile jv-tile--openings" data-reveal>
            <div className="jv-tile-copy"><p className="jv-step-index">02 · Openings</p><h3>Openings for the roles you chose.</h3><p>Each run looks through connected sources for your roles and locations, so you start from a list instead of a blank search box. Some runs may find nothing new.</p></div>
            <div className="jv-tile-card" aria-hidden="true"><OpeningsCard /></div>
          </article>
          <article className="jv-tile jv-tile--cv jv-dark" data-reveal>
            <div className="jv-tile-copy"><p className="jv-step-index">03 · Tailored CV</p><h3>Tailored CVs for matching roles.</h3><p>Your prepared CVs use the facts you confirm for the role. Review it, download PDF, DOCX or TXT and open the employer’s vacancy from your dashboard.</p></div>
            <div className="jv-tile-card" aria-hidden="true"><CvDiffCard /></div>
          </article>
        </div>
        <div className="jv-boundary" data-reveal>
          <p>Tailored, role-specific CVs, built from the facts you confirm.</p>
          <div className="jv-boundary-links"><StartLink>Start my search</StartLink><TextLink to="/how-it-works">See how it works</TextLink></div>
        </div>
      </div>
    </section>

    {/* 5. Free CV Check: a neutral panel; brand colour appears only in the highlights. */}
    <section className="jv-check" aria-labelledby="home-check-title">
      <div className="jv-check-copy" data-reveal>
        <h2 id="home-check-title"><span className="jv-h-line">Have one vacancy in mind?</span> <span className="jv-h-line">Try the free CV Check.</span></h2>
        <p>Bring a CV and a job description, review suggested changes and download your approved version. Save your check to continue into your Automated Job Loop.</p>
        <StartLink to="/check" variant="secondary">Try the free CV Check</StartLink>
      </div>
      <div className="jv-check-example" aria-hidden="true" data-reveal>
        <span className="jv-badge">Example</span>
        <div className="jv-check-job"><span className="jv-frag-label">Job asks for</span><span className="jv-check-chips"><span>SQL reporting</span><span>Sales stakeholders</span></span></div>
        <div className="jv-check-line jv-check-line--before"><span className="jv-frag-label">Your line</span><p>Wrote weekly reports for the sales team using SQL.</p></div>
        <div className="jv-check-line jv-check-line--after"><span className="jv-frag-label">Suggested for this job</span><p>Wrote weekly <mark>SQL reports</mark> for the <span className="jv-nb"><mark>sales team</mark>.</span></p></div>
      </div>
    </section>

    {/* 6. Career guides */}
    <section className="jv-guides" aria-labelledby="home-guides-title">
      <div className="jv-shell">
        <div className="jv-guides-head" data-reveal>
          <h2 id="home-guides-title">Practical help for your next application.</h2>
          <TextLink to="/guides">See all career guides</TextLink>
        </div>
        <ol className="jv-guide-index">{homeGuides.map(([slug, title, meta], index) => <li key={slug}>
          <Link to={`/guides/${slug}`}>
            <span className="jv-guide-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="jv-guide-title">{title}</span>
            <span className="jv-guide-meta">{meta}</span>
            <ArrowRight className="jv-guide-arrow" aria-hidden="true" />
          </Link>
        </li>)}</ol>
      </div>
    </section>

    {/* 7. Final CTA */}
    <section className="jv-cta jv-cta--visual jv-dark" aria-labelledby="home-final-title">
      <div className="jv-cta-inner">
        <h2 id="home-final-title">Give your job search a routine.</h2>
        <p>Set your roles and schedule once. Come back to the best-matching jobs and tailored CVs.</p>
        <div className="jv-cta-actions">
          <StartLink size="lg" />
          <Link to="/pricing" className="jv-btn jv-btn--secondary jv-btn--lg">See plans</Link>
        </div>
        <div className="jv-cta-note"><PriceNote /></div>
      </div>
      <div className="jv-cta-visual" aria-hidden="true"><NextRunCard /></div>
      <LoopOrbit size={720} variant="dark" animate={false} className="jv-cta-orbit" />
    </section>
  </div>;
}
