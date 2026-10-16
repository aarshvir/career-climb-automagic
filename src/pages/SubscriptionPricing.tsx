import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { currentOffer } from '@/lib/current-offer';
import { subscriptionPlans } from '@/lib/subscription-plans';

export default function SubscriptionPricing() {
  return <><div className="product-current-offer">
    <section className="product-plan" aria-labelledby="loop-offer">
      <span className="product-eyebrow">JOB LOOP · ACCOUNT NEEDED</span>
      <h2 id="loop-offer">Start your Job Loop</h2>
      <p className="product-price">Free<span>During beta</span></p>
      <p>{currentOffer.loop}</p>
      <p>Upload a CV or build one from guided questions. Choose the jobs and locations you want, then review matched jobs and prepared documents in your dashboard. Selected employer feeds are available; broad web search and inbox access are not currently connected.</p>
      <Link className="product-button" to="/loop">Start my Job Loop <ArrowRight size={17} aria-hidden="true" /></Link>
      <p className="product-plan-note">The CV check remains available when cloud preparation is full or paused. Your account shows current access; there is no guaranteed daily AI allowance.</p>
    </section>
    <section className="product-plan product-plan--free" aria-labelledby="free-check-offer">
      <span className="product-eyebrow">TRY ONE APPLICATION · NO ACCOUNT NEEDED</span>
      <h2 id="free-check-offer">Your CV and one job</h2>
      <p className="product-price">Free</p>
      <p>{currentOffer.check}</p>
      <ul>{['Job requirements beside passages from your CV', 'An editable CV and a PDF layout preview', 'Reviewed PDF, DOCX and TXT downloads', 'Reuse your chosen CV for the next job'].map(item => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}</ul>
      <Link className="product-button" to="/check">Check my CV against a job <ArrowRight size={17} aria-hidden="true" /></Link>
      <p className="product-plan-note">AI tailoring uses only what is already in your CV, and you check every change. Free daily limits apply: 2 tailored CVs a day without an account, 8 when signed in.</p>
    </section>
    <p className="product-pricing-note">{currentOffer.future}</p>
  </div>
    <section className="product-proposed-plans" aria-labelledby="proposed-plans-title"><h2 id="proposed-plans-title">Planned monthly subscriptions</h2><p>Choose a pace for your search. These plans are proposals, not available to buy. Prices and allowances will be confirmed before launch; the free beta does not include these paid allowances.</p><div className="product-proposed-grid">{subscriptionPlans.map(plan => <article className="product-plan" key={plan.id}><span className="product-eyebrow">PROPOSED PLAN</span><h3>{plan.name}</h3><p className="product-price">${plan.priceUsd}<span>USD / month</span></p><p>{plan.description}</p><ul>{plan.features.map(item => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}</ul><p className="product-plan-note">Not available for purchase.</p></article>)}</div><p>A run means one search and preparation cycle, not a guaranteed number of jobs or interviews. A saved CV variant is a reusable starting CV; the document prepared for a vacancy is a separate output. Search coverage, document limits per run and AI allowances still need confirmation before paid access launches.</p></section>
  </>;
}
