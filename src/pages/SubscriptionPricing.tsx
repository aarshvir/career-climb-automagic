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
  ['Can I pay for Automated Job Loop in my currency?', 'Choose your billing country and payment currency above the Automated Job Loop plans. Supported local prices are fixed monthly amounts, confirmed before purchase. Other countries can pay in US dollars and enter their actual billing country at secure checkout. One-time CV passes remain in US dollars.'],
  ['Does changing the currency change my existing subscription?', 'No. Your current subscription and any existing checkout keep their original price and currency. Your billing section shows that original price. Choosing another currency here changes the prices for a new purchase only.'],
  ['What counts as a tailored CV?', 'Each time you choose “Tailor my CV for this job” and the AI prepares a version, that uses one. If the request fails before any AI work is done, it does not count. Comparing without AI, editing and downloading never use one.'],
  ['What stays free?', `Compare without AI, editing, PDF, Word and text downloads, and the applications tracker stay free with no limit. Signed in, you also get ${FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs every calendar month (UTC). Automated Job Loop access is shown in your account.`],
  ['Do passes include Automated Job Loop runs?', 'No. Passes add AI-tailored CVs for the CV check. Automated Job Loop monthly plans are separate and cover the recurring search pace you choose. Your account confirms checkout availability and paid access.'],
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
    <section className="jv-section pricing-start" aria-labelledby="loop-offer">
      <div className="pricing-start-row" data-reveal>
        <div><h2 id="loop-offer" className="pricing-start-title">Not ready to choose? Start free.</h2><p>Create a free account, set your roles and schedule, and pick a plan when you are ready.</p></div>
        <Link className="jv-btn jv-btn--primary jv-btn--lg" to="/onboarding">Start my search <ArrowRight aria-hidden="true" /></Link>
      </div>
    </section>
    <section className="jv-section pricing-passes" aria-labelledby="passes-title">
      <div className="jv-head"><p className="jv-caption">AI CV tailoring · available now</p><h2 id="passes-title" className="jv-section-title jv-section-title--panel">Optional: one-time CV Check passes</h2><p>{currentOffer.check}</p></div>
      <p className="pricing-note pricing-note--lead">These optional one-time CV Check passes are priced in US dollars. The currency selector above applies to your Automated Job Loop subscriptions.</p>
      {picked && <p className="pricing-picked" role="status">You picked the {passPlan(picked).name} pass (${passPlan(picked).price}, {passPlan(picked).days} days). {user ? `Choose “Buy ${passPlan(picked).name}” when you are ready to pay.` : 'Sign in, then choose it again to pay.'}</p>}
      {params.get('checkout') === 'cancelled' && <p className="pricing-picked" role="status">Checkout was cancelled. You have not been charged.</p>}
      <div className="pricing-tiers">
        <section className="pricing-card pricing-tier pricing-tier--free" aria-labelledby="pricing-free">
          <p className="jv-caption">Start here · no card</p>
          <h3 id="pricing-free">Free</h3>
          <p className="pricing-price"><span className="pricing-amount">$0</span><span className="pricing-unit">Always free to start</span></p>
          <p className="pricing-desc">Try AI tailoring before you pay for anything.</p>
          <ul>{freeFeatures.map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
          <Link className="jv-btn jv-btn--secondary jv-btn--block" to="/check">Check my CV</Link>
        </section>
        {passPlans.map(plan => <section key={plan.key} className={`pricing-card pricing-tier${plan.badge === 'Best value' ? ' pricing-tier--featured' : ''}${picked === plan.key ? ' pricing-tier--picked' : ''}`} aria-labelledby={`pricing-${plan.key}`}>
          <p className="jv-caption">{plan.badge ?? `${plan.days} days · one-time`}</p>
          <h3 id={`pricing-${plan.key}`}>{plan.name}</h3>
          <p className="pricing-price"><span className="pricing-amount">${plan.price}</span><span className="pricing-unit">One-time · {plan.days} days</span></p>
          <p className="pricing-desc">{plan.note}</p>
          <ul>
            <li><Check size={16} aria-hidden="true" />{plan.tailoredCvs} AI-tailored CVs</li>
            <li><Check size={16} aria-hidden="true" />Use them within {plan.days} days</li>
            <li><Check size={16} aria-hidden="true" />Everything in Free</li>
          </ul>
          {user
            ? <button type="button" className={`jv-btn jv-btn--block ${plan.badge === 'Best value' ? 'jv-btn--primary' : 'jv-btn--secondary'}`} disabled={!!busy} onClick={() => void buy(plan.key)}>{busy === plan.key ? 'Opening secure checkout…' : `Buy ${plan.name}`}</button>
            : <Link className={`jv-btn jv-btn--block ${plan.badge === 'Best value' ? 'jv-btn--primary' : 'jv-btn--secondary'}`} to={`/auth?next=${encodeURIComponent(`/pricing?plan=${plan.key}`)}`}aria-label={`Sign in to buy ${plan.name}`}>Sign in to buy</Link>}
        </section>)}
      </div>
      {message && <p className={`pricing-message pricing-message--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      <ul className="pricing-trust" aria-label="About payment">{trustLines.map(line => <li key={line}><Check size={15} aria-hidden="true" />{line}</li>)}</ul>
    </section>
    <section className="jv-section pricing-teams" aria-labelledby="pricing-teams-title">
      <div><h2 id="pricing-teams-title">Coaches &amp; universities</h2><p>Supporting a group of job seekers? We can arrange passes for career coaches, bootcamps and university career services.</p></div>
      <Link className="jv-link" to="/contact"><span>Contact us</span><ArrowRight aria-hidden="true" /></Link>
    </section>
    <section className="jv-section pricing-faq" aria-labelledby="pricing-faq-title">
      <h2 id="pricing-faq-title" className="jv-section-title">Questions about pricing</h2>
      <div className="jv-faq jv-faq--wide">{faqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><span className="jv-faq-toggle" aria-hidden="true"><Plus /></span></summary><p>{answer}</p></details>)}</div>
    </section>
  </>;
}
