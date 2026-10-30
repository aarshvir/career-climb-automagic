import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Check, CircleHelp, CalendarClock, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { loopAudienceContent, loopAudiencePath, loopSignInPath } from '@/lib/job-loop-audiences';
import { staticPageMeta } from '@/lib/public-site-meta';
import type { LoopAudience } from '../../supabase/functions/_shared/job-loop-types';
import { BrandLockup } from '@/components/layout/MvpHeader';
import PriceNote from '@/components/marketing/PriceNote';
import { StudentSourceCard, MbaPivotCard, WeekRunCard, CvLineCard } from '@/components/marketing/AudienceCards';
import { WeekStrip } from '@/components/marketing/PageCards';
import { useReveal } from '@/hooks/useReveal';
import './AudienceLanding.css';

/** Keeps the product name on one line wherever it appears. */
function nb(text: string) {
  return text.split('Automated Job Loop').flatMap((part, index) => index === 0 ? [part] : [<span key={index} className="jv-nb">Automated Job Loop</span>, part]);
}

const closing: Record<LoopAudience, { heading: string; after: ReactNode }> = {
  student: { heading: 'Start with the projects you already have.', after: <>Built a <mark>reporting dashboard</mark> for a university <mark>operations</mark> project.</> },
  mba: { heading: 'Start with the work you have already done.', after: <>Prepared <mark>stakeholder reports</mark> that presented <mark>operational findings</mark> for a regional operations team.</> },
  professional: { heading: 'Start with the CV you already have.', after: <>Coordinated <mark>cross-functional delivery</mark> of a reporting process across two teams.</> },
};

/** One set piece per audience (all illustrative, aria-hidden diagrams under a real heading): sources to one line, a role bridge, a working week. */
function SetPiece({ audience }: { audience: LoopAudience }) {
  if (audience === 'student') return <section className="audience-setpiece audience-setpiece--student" aria-labelledby="audience-set-title">
    <div className="jv-head" data-reveal><p className="jv-caption">One record, three sources</p><h2 id="audience-set-title" className="jv-section-title">Projects, placements and activities, in one CV line.</h2></div>
    <div className="as-flow" aria-hidden="true" data-reveal>
      <ul className="as-sources">{[['Project', 'University operations project'], ['Placement', 'Summer internship, reporting team'], ['Activity', 'Society treasurer']].map(([kind, text]) => <li key={kind}><span>{kind}</span><strong>{text}</strong></li>)}</ul>
      <span className="as-join"><i /></span>
      <div className="as-result"><span>Example · one line, reworded for a job</span><p>{closing.student.after}</p></div>
    </div>
  </section>;
  if (audience === 'mba') return <section className="audience-setpiece audience-setpiece--mba jv-dark" aria-labelledby="audience-set-title">
    <div className="jv-head" data-reveal><p className="jv-caption">Your last role to your next one</p><h2 id="audience-set-title" className="jv-section-title">The same experience, framed for the role you want.</h2></div>
    <div className="as-bridge" aria-hidden="true" data-reveal>
      <div className="as-col"><span>Example · your experience</span><ul><li>Prepared stakeholder reports for a regional team</li><li>Ran the quarterly operations review</li><li>Coordinated delivery across two functions</li></ul></div>
      <span className="as-join"><i /></span>
      <div className="as-col as-col--to"><span>Example · the role you want</span><ul><li><b>Stakeholder reporting</b> from your reports</li><li><b>Operational findings</b> from the review</li><li><b>Cross-functional delivery</b> from your coordination</li></ul></div>
    </div>
  </section>;
  return <section className="audience-setpiece audience-setpiece--professional" aria-labelledby="audience-set-title">
    <div className="jv-head" data-reveal><p className="jv-caption">Your week, your pace</p><h2 id="audience-set-title" className="jv-section-title">Check what arrived between meetings.</h2></div>
    <div data-reveal><WeekStrip /></div>
  </section>;
}

/** The free CV Check example, built per audience so the three pages do not share one mock: requirement to source (students), last role to target role (MBA), confirmed facts reused (professionals). Illustrative; all text comes from the audience's own example copy. */
function AudienceWorkspace({ audience, content }: { audience: LoopAudience; content: typeof loopAudienceContent[LoopAudience] }) {
  const bar = <div className="audience-workspace-bar"><BrandLockup /><span><LockKeyhole size={14} aria-hidden="true" />Private workspace</span></div>;
  const next = <div className="audience-next"><CalendarClock size={18} aria-hidden="true" /><div><strong>Ready for your review</strong><p>Read the CV preview, then download your CV.</p></div></div>;
  const question = <div className="audience-question"><CircleHelp size={18} aria-hidden="true" /><p>{content.exampleQuestion}</p></div>;
  if (audience === 'mba') return <figure className="audience-workspace audience-workspace--mba" data-reveal><figcaption><span>Example application · role bridge</span></figcaption>{bar}<div className="audience-workspace-body"><p className="jv-caption">Last role<ArrowRight className="jv-inline-arrow" aria-hidden="true" /><span className="jv-sr-only"> to </span>target role</p><p className="audience-workspace-title">Carry your prior work into the role you want.</p>
    <div className="audience-bridge"><div className="audience-evidence audience-evidence--fact"><span>Your last role · {content.exampleContext}</span><p>{content.exampleFact}</p></div><ArrowRight className="audience-bridge-arrow" aria-hidden="true" /><div className="audience-evidence"><span>The role you want</span><p>{content.exampleRequirement}</p></div></div>{question}{next}</div></figure>;
  if (audience === 'professional') return <figure className="audience-workspace audience-workspace--professional" data-reveal><figcaption><span>Example application · reused facts</span></figcaption>{bar}<div className="audience-workspace-body"><p className="jv-caption">Confirmed once<ArrowRight className="jv-inline-arrow" aria-hidden="true" /><span className="jv-sr-only"> to </span>reused for the next role</p><p className="audience-workspace-title">Reuse what you have already confirmed.</p>
    <ol className="audience-reuse"><li><span>Confirmed · {content.exampleContext}</span><p>{content.exampleFact}</p></li><li><span>Matched to the vacancy</span><p>{content.exampleRequirement}</p></li><li><span>Kept out of the CV</span><p>Confidential client details and figures, which you remove before saving.</p></li></ol>{question}{next}</div></figure>;
  return <figure className="audience-workspace audience-workspace--student" data-reveal><figcaption><span>Example application · from a project</span></figcaption>{bar}<div className="audience-workspace-body"><p className="jv-caption">Your project<ArrowRight className="jv-inline-arrow" aria-hidden="true" /><span className="jv-sr-only"> to </span>job requirement<ArrowRight className="jv-inline-arrow" aria-hidden="true" /><span className="jv-sr-only"> to </span>review</p><p className="audience-workspace-title">See the experience behind each requirement.</p><div className="audience-evidence"><span>The vacancy asks</span><p>{content.exampleRequirement}</p></div><div className="audience-evidence audience-evidence--fact"><span>Your source · {content.exampleContext}</span><p>{content.exampleFact}</p><small><Check size={14} aria-hidden="true" />Compare the original wording</small></div>{question}{next}</div></figure>;
}

export default function AudienceLanding({ audience }: { audience: LoopAudience }) {
  useReveal();
  const content = loopAudienceContent[audience], { user } = useAuth();
  // Link destinations are unchanged from the live site: the hero leads with the check this page describes.
  const firstAction = user ? loopAudiencePath(audience) : `/check?audience=${audience}`;
  const saveRecord = user ? loopAudiencePath(audience) : loopSignInPath(audience);
  const meta = staticPageMeta(content.path)!;
  const short: Record<LoopAudience, string> = { student: 'Students', mba: 'MBAs', professional: 'Professionals' };
  return <main className={`audience-page audience-page--${audience} jv-rails`}>
    <Helmet><title>{meta.title}</title><meta name="description" content={meta.description} /><link rel="canonical" href={`https://jobvance.io${content.path}`} /></Helmet>
    <div className="jv-page">
      <nav className="audience-switch" aria-label="Choose your starting point">{(Object.keys(loopAudienceContent) as LoopAudience[]).map(key => <Link key={key} to={loopAudienceContent[key].path} aria-current={key === audience ? 'page' : undefined}><span className="audience-switch-full">{loopAudienceContent[key].label}</span><span className="audience-switch-short">{short[key]}</span></Link>)}</nav>
      <section className="audience-hero" aria-labelledby="audience-title">
        <div className="audience-copy">
          <p className="jv-caption">{content.eyebrow.toLowerCase().replace(/^./, c => c.toUpperCase())}</p>
          <h1 id="audience-title" className="jv-page-title jv-enter-h1">{content.searchTitle}</h1>
          <p className="jv-lead jv-enter" style={{ '--d': '60ms' } as CSSProperties}>{nb(content.searchIntro)}</p>
          <div className="jv-page-actions jv-enter" style={{ '--d': '140ms' } as CSSProperties}>
            {user
              ? <Link className="jv-btn jv-btn--primary jv-btn--lg" to={firstAction}>Open my saved applications<ArrowRight aria-hidden="true" /></Link>
              : <Link className="jv-btn jv-btn--primary jv-btn--lg" to="/onboarding">Start my search<ArrowRight aria-hidden="true" /></Link>}
            <Link className="jv-link" to={user ? `/check?audience=${audience}` : firstAction}><span>{user ? 'Prepare for another job' : 'Try the free CV Check'}</span><ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="audience-note jv-enter" style={{ '--d': '180ms' } as CSSProperties}><PriceNote /></div>
        </div>
        <div className="audience-hero-visual jv-enter" style={{ '--d': '120ms' } as CSSProperties} aria-hidden="true">{audience === 'student' ? <StudentSourceCard /> : audience === 'mba' ? <MbaPivotCard /> : <WeekRunCard />}</div>
      </section>
      <section className="jv-section audience-check" aria-labelledby="audience-check-title">
        <div className="audience-check-copy" data-reveal><p className="jv-caption">The free CV Check</p><h2 id="audience-check-title" className="jv-section-title">{content.title}</h2><p>{content.intro}</p></div>
        <AudienceWorkspace audience={audience} content={content} />
      </section>
      <SetPiece audience={audience} />
      <section className="jv-section audience-path" aria-labelledby="audience-path-title">
        <div className="jv-head" data-reveal><p className="jv-caption">From your first check to your next application</p><h2 id="audience-path-title" className="jv-section-title">Keep the experience you have already reviewed.</h2><p>Each vacancy needs a relevant CV, but your career history does not need to be entered again. Save confirmed facts in your private Automated Job Loop, then review how they fit the next role.</p><Link className="jv-link" to="/job-loop"><span>See how the Automated Job Loop works</span><ArrowRight aria-hidden="true" /></Link></div>
        <ol className="jv-steps">{content.steps.map((step, index) => <li key={step} data-reveal><p className="jv-caption">{String(index + 1).padStart(2, '0')}</p><h3>{step}</h3></li>)}</ol>
      </section>
      <section className="jv-section audience-features" aria-label="Your application workflow">
        <ul className="jv-steps">
          <li data-reveal><p className="jv-caption">Compare</p><h2>Compare the vacancy with your own words</h2><p>Read each requirement beside the relevant passage from your CV. When an example is missing, you can decide whether to add one from your experience.</p></li>
          <li data-reveal><p className="jv-caption">Reuse</p><h2>Prepare for another role with the same record</h2><p>Reuse confirmed facts in your private workspace. Add a vacancy yourself or use the available employer feeds, then review a separate set of documents for each role.</p></li>
          <li data-reveal><p className="jv-caption">Continue</p><h2>Pick up where you left off</h2><p>Keep the vacancy, prepared documents and next action together, and come back to the next run when it is ready.</p></li>
        </ul>
      </section>
    </div>
    <section className="jv-cta jv-cta--page jv-cta--visual jv-dark" aria-labelledby="audience-final-title">
      <div className="jv-cta-inner"><h2 id="audience-final-title">{closing[audience].heading}</h2><p>{content.recordHint}</p>
        <div className="jv-cta-actions">{user ? <Link className="jv-btn jv-btn--primary jv-btn--lg" to={saveRecord}>Open my career record<ArrowRight aria-hidden="true" /></Link> : <><Link className="jv-btn jv-btn--primary jv-btn--lg" to="/onboarding">Start my search<ArrowRight aria-hidden="true" /></Link><Link className="jv-btn jv-btn--secondary jv-btn--lg" to={saveRecord}>Sign in to save my experience</Link></>}</div></div>
      <div className="jv-cta-visual" aria-hidden="true"><CvLineCard before={content.exampleFact} after={closing[audience].after} /></div>
    </section>
  </main>;
}
