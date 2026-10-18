import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { currentOffer } from '@/lib/current-offer';
import { openPaymentCheckout } from '@/lib/payment-checkout';
import { startPassCheckout } from '@/lib/pass-checkout';
import { FAIR_USE_TAILORED_CVS_PER_DAY, FREE_TAILORED_CVS_PER_MONTH, isPassPlanKey, passPlan, passPlans, type PassPlanKey } from '@/lib/pass-plans';
import LoopSubscriptionBilling from '@/components/LoopSubscriptionBilling';

const freeFeatures = [
  `${FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs a month when signed in`,
  'Compare without AI, as often as you like',
  'Edit and download PDF, Word and text',
  'Applications tracker',
];
const trustLines = [
  'One-time payment. No subscription, nothing renews.',
  '7-day money-back if you’ve used fewer than 5 tailored CVs.',
  'Secure checkout by Dodo Payments, our merchant of record.',
];
const faqs: [string, React.ReactNode][] = [
  ['What counts as a tailored CV?', 'Each time you choose “Tailor my CV for this job” and the AI prepares a version, that uses one. If the request fails before any AI work is done, it does not count. Comparing without AI, editing and downloading never use one.'],
  ['What stays free?', `Compare without AI, editing, PDF, Word and text downloads, and the applications tracker stay free with no limit. Signed in, you also get ${FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs every calendar month (UTC). Job Loop access is shown in your account.`],
  ['Do passes include Job Loop runs?', 'No. Passes add AI-tailored CVs for the CV check. Job Loop monthly plans are separate and cover the recurring search pace you choose. Your account confirms checkout availability and paid access.'],
  ['Can I buy another pass while one is active?', `Yes. Its tailored CVs are added to what you have, and its days start when your current pass ends, so nothing is wasted. The pass that ends soonest is used first. For fair use, any account can tailor up to ${FAIR_USE_TAILORED_CVS_PER_DAY} CVs a day.`],
  ['What if a pass isn’t right for me?', <>If you have used fewer than 5 tailored CVs, ask within 7 days of buying and we will refund you in full. A refunded pass stops working, including any CVs left on it. <Link to="/refund">Read the refund policy</Link>.</>],
  ['Who will my invoice come from?', 'Dodo Payments sells passes for us as merchant of record. They take the payment, handle sales tax and email your invoice, and their name may appear on your card statement.'],
];

export default function SubscriptionPricing() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const requested = params.get('plan');
  const picked = isPassPlanKey(requested) ? requested : null;
  const [busy, setBusy] = useState<PassPlanKey | null>(null);
  const [message, setMessage] = useState<{ kind: 'soon' | 'error'; text: string } | null>(null);

  async function buy(plan: PassPlanKey) {
    if (busy) return;
    setBusy(plan); setMessage(null);
    try {
      const result = await startPassCheckout(plan);
      if (result.status === 'unavailable') { setMessage({ kind: 'soon', text: 'Payments open soon. Nothing was charged, and your free tailored CVs still work.' }); return; }
      await openPaymentCheckout(result.checkout, () => undefined);
    } catch (failure) {
      setMessage({ kind: 'error', text: failure instanceof Error ? failure.message : 'Checkout could not be opened. Please try again.' });
    } finally { setBusy(null); }
  }

  return <>
    <LoopSubscriptionBilling />
    <div className="product-current-offer product-current-offer--single">
      <section className="product-plan" aria-labelledby="loop-offer">
        <span className="product-eyebrow">JOB LOOP · ACCOUNT NEEDED</span>
        <h2 id="loop-offer">Start your Job Loop</h2>
        <p className="product-price">Your search<span>On your schedule</span></p>
        <p>{currentOffer.loop}</p>
        <p>Upload a CV or build one from guided questions. Choose the jobs and locations you want, then review matched jobs and prepared documents in your dashboard. Your dashboard lists connected sources and reports the result of each run.</p>
        <Link className="product-button" to="/onboarding">Start my Job Loop <ArrowRight size={17} aria-hidden="true" /></Link>
        <p className="product-plan-note">The CV check remains available when cloud preparation is full or paused. Your account shows current access; there is no guaranteed daily AI allowance.</p>
      </section>
    </div>
    <section className="product-current-offer pricing-offer" aria-labelledby="passes-title">
      <div className="pricing-section-head"><p className="product-eyebrow">AI CV TAILORING · AVAILABLE NOW</p><h2 id="passes-title">AI CV tailoring: free to start, passes when you need more</h2><p>{currentOffer.check}</p></div>
      {picked && <p className="pricing-picked" role="status">You picked the {passPlan(picked).name} pass (${passPlan(picked).price}, {passPlan(picked).days} days). {user ? `Choose “Buy ${passPlan(picked).name}” when you are ready to pay.` : 'Sign in, then choose it again to pay.'}</p>}
      {params.get('checkout') === 'cancelled' && <p className="pricing-picked" role="status">Checkout was cancelled. You have not been charged.</p>}
      <div className="pricing-tiers">
        <section className="product-plan pricing-tier pricing-tier--free" aria-labelledby="pricing-free">
          <span className="product-eyebrow">START HERE · NO CARD</span>
          <h3 id="pricing-free">Free</h3>
          <p className="product-price">$0<span>Always free to start</span></p>
          <ul>{freeFeatures.map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
          <Link className="product-button" to="/check">Check my CV against a job <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>
        {passPlans.map(plan => <section key={plan.key} className={`product-plan pricing-tier${plan.badge ? ' pricing-tier--featured' : ''}${picked === plan.key ? ' pricing-tier--picked' : ''}`} aria-labelledby={`pricing-${plan.key}`}>
          <span className="product-eyebrow">{plan.badge ?? `${plan.days} DAYS · ONE-TIME`}</span>
          <h3 id={`pricing-${plan.key}`}>{plan.name}</h3>
          <p className="product-price">${plan.price}<span>One-time · {plan.days} days</span></p>
          <p className="pricing-tier-note">{plan.note}</p>
          <ul>
            <li><Check size={16} aria-hidden="true" />{plan.tailoredCvs} AI-tailored CVs</li>
            <li><Check size={16} aria-hidden="true" />Use them within {plan.days} days</li>
            <li><Check size={16} aria-hidden="true" />Everything in Free</li>
          </ul>
          {user
            ? <button type="button" className="product-button" disabled={!!busy} onClick={() => void buy(plan.key)}>{busy === plan.key ? 'Opening secure checkout…' : `Buy ${plan.name}`}</button>
            : <Link className="product-button" to={`/auth?next=${encodeURIComponent(`/pricing?plan=${plan.key}`)}`}>Sign in to buy {plan.name}</Link>}
        </section>)}
      </div>
      {message && <p className={`pricing-message pricing-message--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      <ul className="pricing-trust" aria-label="About payment">{trustLines.map(line => <li key={line}><Check size={15} aria-hidden="true" />{line}</li>)}</ul>
    </section>
    <div className="pricing-offer">
      <section className="pricing-teams" aria-labelledby="pricing-teams-title">
        <div><h2 id="pricing-teams-title">Coaches &amp; universities</h2><p>Supporting a group of job seekers? We can arrange passes for career coaches, bootcamps and university career services.</p></div>
        <Link className="product-text-link" to="/contact">Contact us <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
      <section className="pricing-faq" aria-labelledby="pricing-faq-title">
        <h2 id="pricing-faq-title">Questions about pricing</h2>
        <div className="product-faqs">{faqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><Plus size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
      </section>
    </div>
  </>;
}
