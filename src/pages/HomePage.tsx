import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import LoopJourney from "@/components/LoopJourney";
import LoopOrbit from "@/components/marketing/LoopOrbit";
import LoopRunMock from "@/components/marketing/LoopRunMock";
import { useReveal } from "@/hooks/useReveal";
import "./Home.css";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const step = (i: number) => ({ "--i": i }) as CSSProperties;

// Crawlable paths from the home page into the guides (titles, categories and reading
// minutes match src/lib/career-guides.ts; that file is too large to import into this bundle).
const homeGuides: [slug: string, title: string, meta: string][] = [
  ["cv-job-description-evidence", "Compare your CV with a job description using evidence", "CV evidence · 3 min"],
  ["achievements-without-numbers", "How to write CV achievements without numbers", "CV evidence · 3 min"],
  ["cv-pdf-or-docx", "Should you send your CV as PDF or DOCX?", "Application workflow · 3 min"],
  ["role-filtering-before-applying", "Filter roles before spending time on an application", "Career direction · 4 min"],
  ["application-tracking-follow-up", "How to track applications and plan follow-ups", "Application workflow · 3 min"],
  ["interview-stories-from-cv", "Turn your CV into clear interview stories", "CV evidence · 4 min"],
];

const proof = ["Free CV Check", "Weekly, 3×/week or daily", "Up to 3 CV variants", "You review before you apply", "Pause anytime"];

// Every line restates something the site already says; no new facts.
const goodToKnow = [
  <>Choose weekly, three-times-weekly or daily searches, and confirm the AI provider once for recurring preparation.</>,
  <>Searches use your connected employer feeds, or a vacancy you add yourself.</>,
  <>Search coverage depends on those sources; a run may find no suitable new vacancies.</>,
  <>Your account shows the connected sources it searches.</>,
  <>Your dashboard shows the jobs found, documents prepared and any step that could not finish.</>,
  <>Review the experience and vacancy you want to reuse before saving. You approve each document and apply on the employer’s site yourself.</>,
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
    <section className="jv-hero jv-frame" aria-labelledby="home-title">
      <span className="jv-hero-dots" aria-hidden="true" />
      <div className="jv-shell jv-hero-grid">
        <div className="jv-hero-copy">
          <h1 id="home-title" className="jv-hero-title jv-enter-h1">Automate your job search.</h1>
          <p className="jv-hero-lead jv-enter" style={delay(80)}>Automated Job Loop finds jobs on your schedule and prepares a tailored CV for each. You review, download and apply.</p>
          <ul className="jv-hero-chips jv-enter" style={delay(150)} aria-label="What it does">
            <li className="jv-chip">Finds jobs</li>
            <li className="jv-chip">Tailors your CV</li>
            <li className="jv-chip jv-chip--ink"><ShieldCheck aria-hidden="true" />You approve &amp; apply</li>
          </ul>
          <div className="jv-hero-actions jv-enter" style={delay(220)}>
            <StartLink size="lg" className="jv-hero-cta" />
            <TextLink to="/check">Try a free CV check</TextLink>
          </div>
          <p className="jv-hero-note jv-enter" style={delay(220)}>Free to start · no card</p>
        </div>
        <div className={`jv-hero-visual${paused ? " is-paused" : ""}`}>
          <LoopOrbit size={640} className="jv-hero-orbit" />
          <div className="jv-hero-mock jv-enter-card"><LoopRunMock onPausedChange={setPaused} /></div>
        </div>
      </div>
    </section>

    {/* 2. Proof strip */}
    <div className="jv-proof jv-enter-fade">
      <div className="jv-shell">
        <div className="jv-proof-scroll" role="region" aria-label="At a glance" tabIndex={0}>
          <ul>{proof.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
    </div>

    <div className="jv-hatch" aria-hidden="true" />

    {/* 3. How the loop runs */}
    <section className="jv-loop-band jv-dark" aria-labelledby="home-loop-journey">
      <div className="jv-loop-grid">
        <div className="jv-loop-visual"><LoopOrbit size={520} variant="dark" labels /></div>
        <div className="jv-loop-copy">
          <h2 id="home-loop-journey" data-reveal>Set it up once. Come back to your next applications.</h2>
          <LoopJourney variant="ring" />
        </div>
      </div>
    </section>

    {/* 4. You stay in control */}
    <section className="jv-control jv-frame" aria-labelledby="home-control-title">
      <div className="jv-shell">
        <div className="jv-section-head" data-reveal>
          <h2 id="home-control-title">You stay in control.</h2>
          <p>Jobvance prepares. You decide what is used, and you send every application yourself.</p>
        </div>
        <div className="jv-control-rows">
          <article className="jv-control-row" data-reveal style={step(0)}>
            <div><h3>Nothing is sent without you</h3><p>Each prepared CV waits for your approval. You download it and apply on the employer’s site.</p></div>
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
                <p>Built <mark>weekly sales reporting in SQL</mark> for the regional team.</p>
              </div>
              <span className="jv-frag-caption">Tailored phrase, from your own CV</span>
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
          <h3>Good to know</h3>
          <ul>{goodToKnow.map((item, index) => <li key={index}>{item}</li>)}</ul>
          <div className="jv-know-links">
            <TextLink to="/job-loop">Explore Automated Job Loop</TextLink>
            <Link to="/privacy" className="jv-link"><span>How your CV is handled</span></Link>
          </div>
        </div>
      </div>
    </section>

    {/* 5. Free CV Check */}
    <section className="jv-check" aria-labelledby="home-check-title">
      <div className="jv-check-copy" data-reveal>
        <h2 id="home-check-title">Have one vacancy in mind? Try the free CV Check.</h2>
        <p>Bring a CV and a job description, review suggested changes and download your approved version.</p>
        <StartLink to="/check">Check my CV against a job</StartLink>
      </div>
      <div className="jv-check-example" aria-hidden="true" data-reveal style={step(1)}>
        <span className="jv-chip">Example</span>
        <div className="jv-check-line jv-check-line--before"><span className="jv-frag-label">Your line</span><p>Helped the sales team with weekly reports in SQL.</p></div>
        <div className="jv-check-line jv-check-line--after"><span className="jv-frag-label">Suggested for this job</span><p>Built <mark>weekly sales reports in SQL</mark> for the sales team.</p></div>
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
        <p className="jv-built-for"><span>Built for</span><Link to="/for-students">students and graduates</Link><Link to="/for-mba">MBA career pivots</Link><Link to="/for-career-switchers">busy professionals</Link></p>
      </div>
    </section>

    <div className="jv-hatch" aria-hidden="true" />

    {/* 7. Final CTA */}
    <section className="jv-cta jv-dark" aria-labelledby="home-final-title">
      <LoopOrbit size={900} variant="dark" animate={false} />
      <div className="jv-cta-inner">
        <h2 id="home-final-title">Give your job search a routine.</h2>
        <p>Set your roles and schedule once. Come back to jobs and tailored CVs ready for your review.</p>
        <div className="jv-cta-actions">
          <StartLink size="lg" />
          <Link to="/pricing" className="jv-btn jv-btn--secondary jv-btn--lg">See plans</Link>
        </div>
      </div>
    </section>
  </div>;
}
