import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { currentOffer } from '@/lib/current-offer';

export default function SubscriptionPricing() {
  return <div className="product-current-offer">
    <section className="product-plan product-plan--free" aria-labelledby="free-check-offer">
      <span className="product-eyebrow">START HERE · NO ACCOUNT NEEDED</span>
      <h2 id="free-check-offer">Your CV and one job</h2>
      <p className="product-price">Free</p>
      <p>{currentOffer.check}</p>
      <ul>{['Job requirements beside passages from your CV', 'An editable CV and a PDF layout preview', 'Reviewed PDF, DOCX and TXT downloads', 'Reuse your chosen CV for the next job'].map(item => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}</ul>
      <Link className="product-button" to="/check">Check my CV against a job <ArrowRight size={17} aria-hidden="true" /></Link>
      <p className="product-plan-note">The check compares wording. You make the final edits; it does not write a new CV for you.</p>
    </section>
    <section className="product-plan" aria-labelledby="loop-offer">
      <span className="product-eyebrow">OPTIONAL · ACCOUNT NEEDED</span>
      <h2 id="loop-offer">Keep your job search organised</h2>
      <p className="product-price">Free<span>During beta</span></p>
      <p>{currentOffer.loop}</p>
      <p>Import and confirm your experience in Job Loop, then add vacancies you want to pursue. Selected employer feeds are available; broad web search and inbox access are not currently connected.</p>
      <Link className="product-text-link" to="/job-loop">See what Job Loop includes <ArrowRight size={17} aria-hidden="true" /></Link>
      <p className="product-plan-note">The CV check remains available when cloud preparation is full or paused. Your account shows current access; there is no guaranteed daily AI allowance.</p>
    </section>
    <p className="product-pricing-note">{currentOffer.future}</p>
  </div>;
}
