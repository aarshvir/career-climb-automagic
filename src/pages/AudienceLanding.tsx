import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Check, CircleHelp, CalendarClock, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { loopAudienceContent, loopAudiencePath, loopSignInPath } from '@/lib/job-loop-audiences';
import { staticPageMeta } from '@/lib/public-site-meta';
import type { LoopAudience } from '../../supabase/functions/_shared/job-loop-types';
import { BrandLockup } from '@/components/layout/MvpHeader';
import PriceNote from '@/components/marketing/PriceNote';
import LoopOrbit from '@/components/marketing/LoopOrbit';
import { useReveal } from '@/hooks/useReveal';
import './AudienceLanding.css';

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
          <h1 id="audience-title" className="jv-page-title">{content.title}</h1>
          <p className="jv-lead">{content.intro}</p>
          <div className="jv-page-actions">
            <Link className="jv-btn jv-btn--primary jv-btn--lg" to={firstAction}>{user ? 'Open my saved applications' : 'Check my CV against a job'}<ArrowRight aria-hidden="true" /></Link>
            <Link className="jv-link" to={user ? `/check?audience=${audience}` : '/job-loop'}><span>{user ? 'Prepare for another job' : 'See how the Automated Job Loop works'}</span><ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="audience-note"><PriceNote /></div>
        </div>
        <figure className="audience-workspace" data-reveal><figcaption><span>How your experience fits one vacancy</span><span>Example application</span></figcaption><div className="audience-workspace-bar"><BrandLockup /><span><LockKeyhole size={14} aria-hidden="true" />Private workspace</span></div><div className="audience-workspace-body"><p className="jv-caption">Your CV → job requirements → review</p><h2>See the experience behind each requirement.</h2><div className="audience-evidence"><span>The vacancy asks</span><p>{content.exampleRequirement}</p></div><div className="audience-evidence audience-evidence--fact"><span>Your source · {content.exampleContext}</span><p>{content.exampleFact}</p><small><Check size={14} aria-hidden="true" />Compare the original wording</small></div><div className="audience-question"><CircleHelp size={18} aria-hidden="true" /><p>{content.exampleQuestion}</p></div><div className="audience-next"><CalendarClock size={18} aria-hidden="true" /><div><strong>Ready for your review</strong><p>Read the CV preview, then download your CV.</p></div></div></div></figure>
      </section>
      <section className="jv-section audience-path" aria-labelledby="audience-path-title">
        <div className="jv-head" data-reveal><p className="jv-caption">From your first check to your next application</p><h2 id="audience-path-title" className="jv-section-title">Keep the experience you have already reviewed.</h2><p>Each vacancy needs a relevant CV, but your career history does not need to be entered again. Save confirmed facts in your private Automated Job Loop, then review how they fit the next role.</p></div>
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
    <section className="jv-cta jv-dark" aria-labelledby="audience-final-title">
      <div className="jv-cta-inner"><p className="jv-caption">Save your experience for next time</p><h2 id="audience-final-title">Start your private record with the CV you have.</h2><p>{content.recordHint}</p><div className="jv-cta-actions"><Link className="jv-btn jv-btn--primary jv-btn--lg" to={saveRecord}>{user ? 'Open my career record' : 'Sign in to save my experience'}<ArrowRight aria-hidden="true" /></Link><LoopOrbit size={720} variant="dark" animate={false} className="jv-cta-orbit" /></div></div>
    </section>
  </main>;
}
