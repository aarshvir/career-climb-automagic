import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Plus } from 'lucide-react';
import './Home.css';
import './JobLoopOverview.css';
import LoopJourney from '@/components/LoopJourney';
import LoopOrbit from '@/components/marketing/LoopOrbit';
import LoopRunMock from '@/components/marketing/LoopRunMock';
import { DashboardCard, WeekStrip } from '@/components/marketing/PageCards';
import { CvCard } from '@/components/marketing/ProductCards';
import { useReveal } from '@/hooks/useReveal';
import { currentOffer } from '@/lib/current-offer';
import { staticPageMeta, SITE_ORIGIN } from '@/lib/public-site-meta';

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

function StartLink({ children = 'Start my search', variant = 'primary', size = 'lg', className = '' }: { children?: React.ReactNode; variant?: 'primary' | 'secondary'; size?: 'md' | 'lg'; className?: string }) {
  return <Link to="/onboarding" className={`jv-btn jv-btn--${variant}${size === 'lg' ? ' jv-btn--lg' : ''}${className ? ` ${className}` : ''}`}>{children}<ArrowRight aria-hidden="true" /></Link>;
}
function TextLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="jv-link"><span>{children}</span><ArrowRight aria-hidden="true" /></Link>;
}

const faqs: [string, React.ReactNode][] = [
  ['Do I need to complete a long profile?', 'Start with a CV or use guided questions to build one. Review your experience, choose target roles and locations, then save your setup. CV Check is also available in your account when you have one vacancy in mind.'],
  ['Will every run find new jobs?', 'No. A run can find no suitable new vacancies, and a source can be unavailable. The dashboard shows the actual result and unfinished steps. You can add a vacancy yourself and prepare it directly.'],
  ['What does the Automated Job Loop include?', <><p>Keep up to three CV variants, choose target jobs and locations, and see matches from the sources connected in your account. Check the source details in your dashboard; coverage is not the whole job market.</p><p>Choose weekly, three-times-weekly or daily preparation while your browser is closed. Recurring AI preparation requires explicit consent for the selected CV, provider, model and route. Your dashboard shows each result, and you can pause or cancel a schedule.</p><p>Payment availability and allowances are shown before you purchase. Creating an account does not start a paid subscription. <Link to="/pricing">Read the current free offer</Link>.</p></>],
  ['What does the Automated Job Loop prepare for me?', 'Matched jobs from your connected sources, a tailored CV for each prepared role, PDF, DOCX or TXT downloads, and a dashboard that shows the result of every run.'],
  ['What if I do not have a CV yet?', <>Use the guided CV builder in your Automated Job Loop. Answer questions about your education, work and projects, then review the draft made from your own answers. <Link to="/help#no-cv">Follow the no-CV guide</Link> or read the <Link to="/guides">career guides</Link>.</>],
  ['Where can I find help with a step?', <><Link to="/walkthroughs">Walk through the first application</Link> or <Link to="/help">find a specific answer</Link>. The setup steps also link to relevant guides. Once you have saved a private record, you can return to it later.</>],
];

export default function JobLoopOverview() {
  useReveal();
  const meta = staticPageMeta('/job-loop');
  return <main className="jv-home loop-overview">
    <Helmet><title>{meta?.title ?? 'Automated Job Loop: your job search on a schedule | Jobvance'}</title><meta name="description" content={meta?.description ?? 'Set your roles, locations and schedule. Find jobs from connected sources and review prepared CVs in your Automated Job Loop dashboard.'} /><link rel="canonical" href={`${SITE_ORIGIN}/job-loop`} /></Helmet>

    <section className="jv-hero lo-loop-hero lo-loop-hero--forest jv-dark" aria-labelledby="lo-title">
      <div className="jv-shell jv-hero-grid">
        <div className="jv-hero-copy">
          <p className="jv-caption jv-hero-eyebrow">Automated Job Loop</p>
          <h1 id="lo-title" className="jv-hero-title jv-enter-h1"><span className="jv-nb">Automated Job Loop</span> finds the jobs and <span className="jv-h-signal">tailors the CV.</span></h1>
          <p className="jv-hero-lead jv-enter" style={delay(60)}>Choose your roles and locations once. Automated Job Loop runs on your schedule, finds jobs from connected sources and prepares a separate CV for each shortlisted role, ready to review in your dashboard.</p>
          <div className="jv-hero-actions jv-enter" style={delay(140)}>
            <StartLink className="jv-hero-cta" />
            <TextLink to="/walkthroughs">Walk through an application</TextLink>
          </div>
        </div>
        <div className="jv-hero-visual">
          <div className="jv-hero-orbit-wrap jv-enter-stage"><LoopOrbit size={560} variant="dark" className="jv-hero-orbit" nodes={false} animate={false} /></div>
          <div className="jv-hero-mock jv-enter-card" aria-hidden="true"><DashboardCard /></div>
        </div>
      </div>
    </section>

    <section className="jv-section lo-section" aria-labelledby="lo-start-title">
      <div className="jv-shell">
        <div className="jv-head" data-reveal><p className="jv-caption">Set up once</p><h2 id="lo-start-title" className="jv-section-title">One setup. A repeatable search.</h2></div>
        <LoopJourney />
        <div className="lo-week" data-reveal><WeekStrip /></div>
      </div>
    </section>

    <section className="jv-section lo-section" aria-labelledby="lo-work-title">
      <div className="jv-shell jv-split lo-dashboard">
        <div data-reveal>
          <p className="jv-caption">Your job search dashboard</p>
          <h2 id="lo-work-title" className="jv-section-title">Know what happened while you were away.</h2>
          <ul className="jv-ticks">
            <li>Find jobs from the employer feeds available in your account.</li>
            <li>Match roles to your target titles, locations and confirmed experience.</li>
            <li>Prepare a separate CV for each vacancy, ready to review and download.</li>
            <li>See each run’s progress and any unfinished step.</li>
            <li>Keep vacancies, prepared CVs and next actions together.</li>
          </ul>
        </div>
        <div className="lo-dashboard-visual" data-reveal>
          <LoopRunMock />
        </div>
      </div>
    </section>

    <section className="lo-private jv-dark" aria-labelledby="lo-private-title">
      <div className="jv-shell lo-private-grid">
        <div className="lo-private-copy" data-reveal>
          <p className="jv-caption">Keep your work for next time</p>
          <h2 id="lo-private-title">Save your experience for the next application.</h2>
          <p>Import your CV or choose a saved CV check, confirm the experience you want to reuse, and set up Automated Job Loop in your account. Each saved vacancy keeps its own documents, status and next action.</p>
          <ul className="jv-ticks lo-private-ticks"><li>Save a career record you have reviewed.</li><li>Keep each vacancy and its prepared documents together.</li><li>Choose when to use recurring preparation.</li></ul>
          <div className="lo-private-actions"><StartLink>Set up my search</StartLink><TextLink to="/help#job-loop-start">Read the setup guide</TextLink></div>
        </div>
        <aside className="lo-private-aside" data-reveal>
          <h3>Your search, in one place</h3>
          <p>{currentOffer.statement} Your account shows your available preparation allowance.</p>
          <TextLink to="/pricing">See what’s included</TextLink>
        </aside>
      </div>
    </section>

    <section className="jv-section lo-section" aria-labelledby="lo-audiences-title">
      <div className="jv-shell jv-split">
        <div data-reveal>
          <p className="jv-caption">Your experience, your next role</p>
          <h2 id="lo-audiences-title" className="jv-section-title">The same workflow for your first job or your next move.</h2>
          <p className="lo-lede">Use projects, internships, MBA work or employment experience. Start with your CV and the job you want.</p>
          <div className="lo-audience-cta"><StartLink /></div>
        </div>
        <ul className="lo-audience-links" data-reveal>
          <li><Link to="/for-students"><span>Students and graduates</span><ArrowRight aria-hidden="true" /></Link></li>
          <li><Link to="/for-mba"><span>MBA career pivots</span><ArrowRight aria-hidden="true" /></Link></li>
          <li><Link to="/for-career-switchers"><span>Busy professionals</span><ArrowRight aria-hidden="true" /></Link></li>
        </ul>
      </div>
    </section>

    <section className="jv-section lo-section lo-faq" aria-labelledby="lo-faq-title">
      <div className="jv-shell">
        <h2 id="lo-faq-title" className="jv-section-title" data-reveal>Before you start</h2>
        <div className="jv-faq jv-faq--wide">{faqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><span className="jv-faq-toggle" aria-hidden="true"><Plus /></span></summary>{typeof answer === 'string' ? <p>{answer}</p> : <div>{answer}</div>}</details>)}</div>
      </div>
    </section>

    <section className="jv-cta jv-cta--visual jv-dark" aria-labelledby="lo-final-title">
      <div className="jv-cta-inner">
        <h2 id="lo-final-title">Set up your next search.</h2>
        <p>Add your experience. Choose the jobs and places you want to explore.</p>
        <div className="jv-cta-actions"><StartLink /><Link to="/pricing" className="jv-btn jv-btn--secondary jv-btn--lg">See plans</Link></div>
      </div>
      <div className="jv-cta-visual" aria-hidden="true"><CvCard /></div>
      <LoopOrbit size={720} variant="dark" animate={false} className="jv-cta-orbit" />
    </section>
  </main>;
}
