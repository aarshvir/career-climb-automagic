import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import LoopJourney from "@/components/LoopJourney";
import LoopOrbit from "@/components/marketing/LoopOrbit";
import LoopRunMock from "@/components/marketing/LoopRunMock";
import { useReveal } from "@/hooks/useReveal";
import { homeGuides } from "@/lib/home-guides";
import { subscriptionPlans } from "@/lib/subscription-plans";
import "./Home.css";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const step = (i: number) => ({ "--i": i }) as CSSProperties;
const fromPrice = subscriptionPlans[0].priceUsd;

const proof = ["You review before you apply", "Free CV Check", "Weekly, 3×/week or daily", "Up to 3 CV variants", "Pause anytime"];

// Every line restates something the site already says; no new facts.
const goodToKnow = [
  <>Runs weekly, three times a week or daily. Confirm your AI provider once before recurring runs.</>,
  <>Searches your connected sources or a vacancy you add, so a run may find nothing new.</>,
  <>Your dashboard shows the jobs found, the documents prepared and any step that couldn’t finish.</>,
  <>Review what you reuse before saving. You approve each document and apply on the employer’s site.</>,
];

function StartLink({ children = "Start my Automated Job Loop", to = "/onboarding", size = "md", variant = "primary", className = "" }: { children?: React.ReactNode; to?: string; size?: "md" | "lg"; variant?: "primary" | "secondary"; className?: string }) {
  return <Link to={to} className={`jv-btn jv-btn--${variant}${size === "lg" ? " jv-btn--lg" : ""} ${className}`.trim()}>{children}<ArrowRight aria-hidden="true" /></Link>;
}

function TextLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="jv-link"><span>{children}</span><ArrowRight aria-hidden="true" /></Link>;
}

export default function HomePage() {
  const [paused, setPaused] = useState(false);
  useReveal();
  return <div className="jv-home">
    {/* 1. Hero */}
    <section className="jv-hero" aria-labelledby="home-title">
      <div className="jv-shell jv-hero-grid">
        <div className="jv-hero-copy">
          <h1 id="home-title" className="jv-hero-title jv-enter-h1">Automate your job search.</h1>
          <p className="jv-hero-lead jv-enter" style={delay(60)}>Automated Job Loop finds jobs on your schedule and prepares a tailored CV for each. You review, download and apply.</p>
          <div className="jv-hero-actions jv-enter" style={delay(140)}>
            <div className="jv-hero-primary">
              <StartLink size="lg" className="jv-hero-cta" />
              <p className="jv-hero-note">Free account · plans from ${fromPrice}/month</p>
            </div>
            <TextLink to="/check">Try a free CV check</TextLink>
          </div>
        </div>
        <div className={`jv-hero-visual${paused ? " is-paused" : ""}`}>
          <LoopOrbit size={560} nodes={false} className="jv-hero-orbit jv-enter-stage" />
          <div className="jv-hero-mock jv-enter-card"><LoopRunMock onPausedChange={setPaused} /></div>
        </div>
      </div>
    </section>

    {/* 2. Proof strip */}
    <div className="jv-proof jv-enter-fade">
      <div className="jv-shell">
        <ul aria-label="At a glance">{proof.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
    </div>

    {/* 3. How the loop runs */}
    <section className="jv-loop-band jv-dark" aria-labelledby="home-loop-journey">
      <div className="jv-loop-grid">
        <h2 id="home-loop-journey" className="jv-loop-head" data-reveal>Set it up once. Come back to your next applications.</h2>
        <div className="jv-loop-visual">
          <LoopOrbit size={440} variant="dark" labels once>
            <span className="jv-orbit-core">
              <span className="jv-orbit-core-label">Next run</span>
              <span className="jv-orbit-core-time">Wed 7:00 AM</span>
              <span className="jv-orbit-core-meta">3×/week</span>
            </span>
          </LoopOrbit>
        </div>
        <div className="jv-loop-steps"><LoopJourney variant="ring" /></div>
      </div>
    </section>

    {/* 4. You stay in control */}
    <section className="jv-control" aria-labelledby="home-control-title">
      <div className="jv-shell">
        <div className="jv-section-head" data-reveal>
          <h2 id="home-control-title">You stay in control.</h2>
          <p>Jobvance prepares. You decide what is used, and you send every application yourself.</p>
        </div>
        <div className="jv-control-rows">
          <article className="jv-control-row" data-reveal style={step(0)}>
            <div><h3>Jobvance never applies for you</h3><p>Each prepared CV waits for your approval. You download it and apply on the employer’s site.</p></div>
            <div className="jv-frag" aria-hidden="true">
              <div className="jv-frag-card">
                <div><span className="jv-frag-strong">Product Analyst</span><span className="jv-frag-muted">Northwind Labs · CV ready</span></div>
                <span className="jv-switch is-on"><span /></span>
              </div>
              <span className="jv-frag-caption">Approved by you</span>
            </div>
          </article>
          <article className="jv-control-row" data-reveal style={step(1)}>
            <div><h3>Only what you have listed</h3><p>It never adds employers, numbers, tools or qualifications you haven’t listed. It rewords and reorders your own lines.</p></div>
            <div className="jv-frag" aria-hidden="true">
              <div className="jv-frag-cv">
                <span className="jv-frag-label">Example CV line</span>
                <p>Ran the quarterly customer survey and shared the results with the team.</p>
                <span className="jv-frag-skip"><s>Tableau</s><span>Not on your CV · not added</span></span>
              </div>
              <span className="jv-frag-caption">Only tools and facts from your own CV</span>
            </div>
          </article>
          <article className="jv-control-row" data-reveal style={step(2)}>
            <div><h3>Pause or cancel anytime</h3><p>Pause or cancel your schedule whenever you need to. Your account shows the next scheduled run.</p></div>
            <div className="jv-frag" aria-hidden="true">
              <div className="jv-frag-card">
                <div><span className="jv-frag-strong">Schedule</span><span className="jv-frag-muted">3×/week · Mon Wed Fri</span></div>
                <span className="jv-frag-pause"><span className="jv-switch"><span /></span>Paused</span>
              </div>
              <span className="jv-frag-caption">Resume whenever you are ready</span>
            </div>
          </article>
        </div>
        <div className="jv-know" data-reveal>
          <div className="jv-know-head">
            <h3>Good to know</h3>
            <div className="jv-know-links">
              <TextLink to="/job-loop">Explore Automated Job Loop</TextLink>
              <TextLink to="/privacy">How your CV is handled</TextLink>
            </div>
          </div>
          <ul>{goodToKnow.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      </div>
    </section>

    {/* 5. Free CV Check */}
    <section className="jv-check" aria-labelledby="home-check-title">
      <div className="jv-check-copy" data-reveal>
        <h2 id="home-check-title"><span className="jv-h-line">Have one vacancy in mind?</span> <span className="jv-h-line">Try the free CV Check.</span></h2>
        <p>Bring a CV and a job description, review suggested changes and download your approved version.</p>
        <StartLink to="/check">Check my CV against a job</StartLink>
      </div>
      <div className="jv-check-example" aria-hidden="true" data-reveal style={step(1)}>
        <span className="jv-chip jv-chip--caption">Example</span>
        <div className="jv-check-line jv-check-line--before"><span className="jv-frag-label">Your line</span><p>Wrote weekly SQL reports for the sales team.</p></div>
        <div className="jv-check-line jv-check-line--after"><span className="jv-frag-label">Suggested for this job</span><p>Wrote <mark>weekly sales reports in SQL</mark> for the team.</p></div>
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
        <div className="jv-built-for"><span>Built for</span><div><Link to="/for-students">students and graduates</Link><Link to="/for-mba">MBA career pivots</Link><Link to="/for-career-switchers">busy professionals</Link></div></div>
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
        </div>
        <p className="jv-cta-note">Free account · plans from ${fromPrice}/month · an account doesn’t start a paid subscription</p>
      </div>
    </section>
  </div>;
}
