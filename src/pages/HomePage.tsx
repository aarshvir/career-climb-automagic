import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText } from "lucide-react";
import LoopJourney from "@/components/LoopJourney";
import LoopOrbit from "@/components/marketing/LoopOrbit";
import LoopRunMock from "@/components/marketing/LoopRunMock";
import { useReveal } from "@/hooks/useReveal";
import { homeGuides } from "@/lib/home-guides";
import { subscriptionPlans } from "@/lib/subscription-plans";
import "./Home.css";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const fromPrice = subscriptionPlans[0].priceUsd;

// Facts the site already states (FAQ, pricing, Automated Job Loop page). No counts, ratings or outcomes.
const proof = ["Jobs and prepared CVs, together", "Up to 3 CV variants", "Weekly, 3×/week or daily", "PDF, DOCX or TXT downloads", "Free CV Check"];

/** One reassurance line, identical under both main buttons. Lines only break between segments. */
function PriceNote() {
  return <><span className="jv-nb">Free account</span>{" "}<span className="jv-nb">·&nbsp;plans from ${fromPrice}/month</span>{" "}<span className="jv-nb">·&nbsp;pay only if you choose a plan or pass</span></>;
}

function StartLink({ children = "Start my Automated Job Loop", to = "/onboarding", size = "md", variant = "primary", className = "" }: { children?: React.ReactNode; to?: string; size?: "md" | "lg"; variant?: "primary" | "secondary"; className?: string }) {
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
          <h1 id="home-title" className="jv-hero-title jv-enter-h1">Jobvance automates your job search end to end.</h1>
          <p className="jv-hero-lead jv-enter" style={delay(60)}>Choose your roles and locations once. It searches on your schedule and prepares a tailored CV for each role. You review, download and apply.</p>
          <div className="jv-hero-actions jv-enter" style={delay(140)}>
            <StartLink size="lg" className="jv-hero-cta">Start my search</StartLink>
            <TextLink to="/check">Try the free CV Check</TextLink>
          </div>
          <p className="jv-hero-note jv-enter" style={delay(180)}><PriceNote /></p>
        </div>
        <div className="jv-hero-visual">
          <div className="jv-hero-orbit-wrap jv-enter-stage"><LoopOrbit size={560} className="jv-hero-orbit" /></div>
          <div className="jv-hero-mock jv-enter-card"><LoopRunMock /></div>
        </div>
      </div>
    </section>

    {/* 2. Proof strip: a five-cell spec table. */}
    <div className="jv-proof jv-enter-fade">
      <div className="jv-shell">
        <ul aria-label="At a glance">{proof.map((item, index) => <li key={item}><span className="jv-proof-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span>{item}</span></li>)}</ul>
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
          <p className="jv-loop-caption">Every run · automatic</p>
          <LoopOrbit size={480} variant="dark" labels once>
            <span className="jv-orbit-core">
              <span className="jv-orbit-core-time">7:00 AM</span>
              <span className="jv-orbit-core-meta">Mon · Wed · Fri</span>
            </span>
          </LoopOrbit>
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
          <p>Set your search once. Each run brings back openings and a CV prepared for each one, ready for your review.</p>
        </div>
        <div className="jv-control-rows">
          <article className="jv-control-row" data-reveal>
            <div className="jv-control-copy"><h3>Your search comes back on schedule.</h3><p>Weekly, three days a week or daily, the next run starts without you rebuilding the same searches. Pause it whenever your plans change.</p></div>
            <div className="jv-frag" aria-hidden="true">
              <div className="jv-frag-card">
                <div className="jv-frag-head"><span className="jv-frag-strong">Schedule</span><span className="jv-frag-muted">3×/week</span></div>
                <div className="jv-frag-foot">
                  <span className="jv-frag-days is-on"><span>Mon</span><span>Wed</span><span>Fri</span></span>
                  <span className="jv-frag-state">Next run <span className="jv-frag-time">Wed 7:00 AM</span></span>
                </div>
              </div>
            </div>
          </article>
          <article className="jv-control-row" data-reveal>
            <div className="jv-control-copy"><h3>Openings for the roles you chose.</h3><p>Each run looks through connected sources for your roles and locations, so you start from a list instead of a blank search box. Some runs may find nothing new.</p></div>
            <div className="jv-frag" aria-hidden="true">
              <div className="jv-frag-card">
                <span className="jv-frag-label">Example run</span>
                <ul className="jv-frag-jobs">
                  <li><span className="jv-frag-strong">Product Analyst</span><span className="jv-frag-muted">Northwind Labs · Remote (US)</span></li>
                  <li><span className="jv-frag-strong">Data Analyst</span><span className="jv-frag-muted">Contoso Health · Austin, TX</span></li>
                </ul>
              </div>
            </div>
          </article>
          <article className="jv-control-row" data-reveal>
            <div className="jv-control-copy"><h3>A tailored CV for each prepared role.</h3><p>Each prepared role comes with a CV reworded for that job from your own experience. Review it, download PDF, DOCX or TXT and open the employer’s vacancy from your dashboard.</p></div>
            <div className="jv-frag" aria-hidden="true">
              <div className="jv-frag-card">
                <span className="jv-frag-label">Example application</span>
                <div className="jv-frag-head"><span className="jv-frag-strong">Product Analyst</span><span className="jv-frag-muted">Northwind Labs</span></div>
                <div className="jv-frag-foot">
                  <span className="jv-frag-filename"><FileText aria-hidden="true" />CV_Product_Analyst.pdf</span>
                  <span className="jv-status-tag">Ready for review</span>
                </div>
              </div>
            </div>
          </article>
        </div>
        <div className="jv-boundary" data-reveal>
          <p>Jobvance prepares; you approve each document, download it and apply on the employer’s site.</p>
          <div className="jv-boundary-links"><TextLink to="/job-loop">Explore Automated Job Loop</TextLink><TextLink to="/privacy">How your CV is handled</TextLink></div>
        </div>
      </div>
    </section>

    {/* 5. Free CV Check: a neutral panel; brand colour appears only in the highlights. */}
    <section className="jv-check" aria-labelledby="home-check-title">
      <div className="jv-check-copy" data-reveal>
        <h2 id="home-check-title"><span className="jv-h-line">Have one vacancy in mind?</span> <span className="jv-h-line">Try the free CV Check.</span></h2>
        <p>Bring a CV and a job description, review suggested changes and download your approved version. Save your check to continue into your Automated Job Loop.</p>
        <StartLink to="/check" variant="secondary">Check my CV against a job</StartLink>
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
        <div className="jv-built-for"><span>Built for</span><div><Link to="/for-students">Students and graduates</Link><Link to="/for-mba">MBA career pivots</Link><Link to="/for-career-switchers">Busy professionals</Link></div></div>
      </div>
    </section>

    {/* 7. Final CTA */}
    <section className="jv-cta jv-dark" aria-labelledby="home-final-title">
      <div className="jv-cta-inner">
        <h2 id="home-final-title">Give your job search a routine.</h2>
        <p>Set your roles and schedule once. Come back to jobs and tailored CVs ready for your review.</p>
        <div className="jv-cta-actions">
          <StartLink size="lg" />
          <Link to="/pricing" className="jv-btn jv-btn--secondary jv-btn--lg">See plans</Link>
          <LoopOrbit size={720} variant="dark" animate={false} className="jv-cta-orbit" />
        </div>
        <p className="jv-cta-note"><PriceNote /></p>
      </div>
    </section>
  </div>;
}
