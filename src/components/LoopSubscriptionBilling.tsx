import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { registerTrackingDraftOwner, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import { openPaymentCheckout } from '@/lib/payment-checkout';
import { reportMetaCheckout } from '@/lib/meta-commerce';
import { subscriptionPlans, isLoopSubscriptionPlan, loopSubscriptionPlan, type LoopSubscriptionPlan } from '@/lib/subscription-plans';
import { cancelLoopSubscription, captureLoopCancelIntent, captureLoopCheckoutIntent, captureLoopQuoteIntent,createLoopSubscriptionCheckout, readLoopBilling,requestLoopPriceQuote,quotePricing, LoopBillingError, type LoopBillingStatus, type LoopCancelIntent, type LoopCheckoutIntent,type LoopPriceQuote,type LoopPricing } from '@/lib/loop-subscription-billing';
import {LOOP_LOCAL_COUNTRIES,LOOP_LOCAL_CURRENCIES,initialLoopPriceMarket,isLoopLocalCountry,isLoopLocalCurrency,loopPricingReturn,type LoopPriceMarket} from '@/lib/loop-local-prices';
import {formatLoopPrice} from '@/lib/loop-price-display';
import './LoopSubscriptionBilling.css';

function date(value: string) { return new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); }
function legacyPrice(plan:LoopSubscriptionPlan):LoopPricing{return {quoteId:null,country:null,currency:'USD',amountMinor:LOOP_LOCAL_CURRENCIES.USD.amounts[plan],exponent:2,catalogVersion:'legacy-usd-v1',taxInclusive:true,interval:'month'};}
export default function LoopSubscriptionBilling({ compact=false }: {compact?:boolean}) {
  const {user,session,loading:authLoading,authError}=useAuth();
  const authReady=!!user&&!!session&&!authLoading&&!authError;
  if(authReady)registerTrackingDraftOwner(user.id);
  const authority=user?trackingDraftAuthority(user.id):-1;
  const [params]=useSearchParams();
  const requested=params.get('loopPlan');
  const [market,setMarket]=useState<LoopPriceMarket>(()=>initialLoopPriceMarket(params.toString(),typeof navigator==='undefined'?undefined:navigator.language));
  const [chosen,setChosen]=useState<LoopSubscriptionPlan|null>(isLoopSubscriptionPlan(requested)?requested:null);
  const [storedStatus,setStatus]=useState<LoopBillingStatus|null>(null),[loadedScope,setLoadedScope]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const status=authReady&&loadedScope===`${user.id}:${authority}`?storedStatus:null;
  const [consent,setConsent]=useState(false),[cancelConfirm,setCancelConfirm]=useState(false);
  const checkoutIntent=useRef<Readonly<LoopCheckoutIntent>|null>(null),cancelIntent=useRef<Readonly<LoopCancelIntent>|null>(null);
  const attemptedPrice=useRef<LoopPricing|null>(null),quoteSequence=useRef(0);
  const [quoteState,setQuoteState]=useState<{key:string;value:LoopPriceQuote}|null>(null),[quoteLoading,setQuoteLoading]=useState(false),[quoteError,setQuoteError]=useState(''),[quoteRefresh,setQuoteRefresh]=useState(0),[quoteExpired,setQuoteExpired]=useState(false);
  const purchaseConsentScope=useRef<string|null>(null),cancelConsentScope=useRef<string|null>(null),refreshSequence=useRef(0);
  const current=useRef({owner:user?.id,authority,ready:authReady}),epoch=useRef(0),mounted=useRef(true),lock=useRef(false);
  current.current={owner:user?.id,authority,ready:authReady};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
  const refresh=useCallback(async()=>{
    if(!user||!authReady||authority<0)return;
    const scope={ownerId:user.id,authority},at=epoch.current,ticket=++refreshSequence.current;
    const valid=()=>mounted.current&&current.current.ready&&current.current.owner===scope.ownerId&&current.current.authority===scope.authority&&epoch.current===at&&refreshSequence.current===ticket;
    purchaseConsentScope.current=null;cancelConsentScope.current=null;setConsent(false);setCancelConfirm(false);setLoading(true);setError('');
    try{const next=await readLoopBilling(scope,valid);if(valid()){purchaseConsentScope.current=null;cancelConsentScope.current=null;setConsent(false);setCancelConfirm(false);setLoadedScope(`${scope.ownerId}:${scope.authority}`);setStatus(next);if(checkoutIntent.current&&(checkoutIntent.current.expectedGeneration!==next.generation||next.checkout?.requestId===checkoutIntent.current.requestId&&next.checkout.status==='failed')){checkoutIntent.current=null;attemptedPrice.current=null;setQuoteState(null);setQuoteRefresh(value=>value+1);}if(next.checkout?.pricing&&!['failed','expired','cancelled','completed'].includes(next.checkout.status)){setChosen(next.checkout.plan);setMarket(previous=>({country:isLoopLocalCountry(next.checkout.pricing.country)?next.checkout.pricing.country:previous.country,currency:next.checkout.pricing.currency as LoopPriceMarket['currency']}));}if(cancelIntent.current&&(cancelIntent.current.expectedGeneration!==next.generation||cancelIntent.current.expectedSubscriptionId!==next.subscription?.subscriptionId))cancelIntent.current=null;if(next.subscription?.cancelAtPeriodEnd)cancelIntent.current=null;else if(next.cancelRequest&&next.cancelRequest.status!=='confirmed'&&next.generation!==null&&next.cancelRequest.subscriptionId===next.subscription?.subscriptionId)cancelIntent.current=Object.freeze({action:'cancel',requestId:next.cancelRequest.requestId,expectedGeneration:next.generation,expectedSubscriptionId:next.cancelRequest.subscriptionId,expectedVersion:next.cancelRequest.version,consent:true,contractVersion:2});}}
    catch{if(valid()){setStatus(null);setError('We could not load your Automated Job Loop billing. Refresh to confirm your access and any previous checkout.');}}
    finally{if(valid())setLoading(false);}
  },[user?.id,authReady,authority]);
  useEffect(()=>{epoch.current++;refreshSequence.current++;quoteSequence.current++;purchaseConsentScope.current=null;cancelConsentScope.current=null;checkoutIntent.current=null;attemptedPrice.current=null;cancelIntent.current=null;setQuoteState(null);setQuoteError('');setStatus(null);setLoadedScope('');setConsent(false);setCancelConfirm(false);setMessage('');setError('');setBusy(false);lock.current=false;void refresh();},[user?.id,authority,authReady,refresh]);
  const sub=status?.subscription;
  const paidPlan=sub?.plan==='active'?'three_weekly':sub?.plan;
  const currentPaid=status?.billingMode==='live'&&!!sub&&!sub.revoked&&!!status.entitlement?.active&&status.entitlement.plan===paidPlan&&!!status.entitlement.validUntil&&new Date(status.entitlement.validUntil).getTime()>Date.now();
  const graceAccess=currentPaid&&sub.status==='past_due'&&!!sub.graceUntil&&new Date(sub.graceUntil).getTime()>Date.now();
  // Access revocation (for example a refund) does not cancel Dodo renewal.
  const providerMayRenew=!!sub&&!sub.cancelAtPeriodEnd&&['pending','active','on_hold','paused','past_due'].includes(sub.status);
  const providerPaymentUnresolved=!!sub&&['pending','on_hold','paused','past_due'].includes(sub.status);
  const subscriptionOpen=providerMayRenew||providerPaymentUnresolved||!!sub&&!sub.revoked&&new Date(sub.validUntil).getTime()>Date.now()&&['active','cancelled'].includes(sub.status);
  const checkoutPending=!!status?.checkout&&!currentPaid&&!['failed','expired','cancelled','completed'].includes(status.checkout.status);
  const selected=chosen?loopSubscriptionPlan(chosen):null;
  const hasLocalAttempt=!!checkoutIntent.current;
  const quoteKey=JSON.stringify([user?.id,authority,status?.billingMode,status?.generation,chosen,market.country,market.currency,quoteRefresh]);
  const currentQuoteKey=useRef(quoteKey);currentQuoteKey.current=quoteKey;
  const freshQuote=quoteState?.key===quoteKey?quoteState.value:null;
  const pendingPrice=checkoutPending?status.checkout.pricing:null;
  const payablePrice=pendingPrice??(hasLocalAttempt?attemptedPrice.current:null)??(market.country==='other'&&selected?legacyPrice(selected.id):freshQuote?quotePricing(freshQuote):null);
  const originalRecovery=checkoutPending||hasLocalAttempt;
  const quoteCurrent=market.country==='other'||!!freshQuote&&!quoteExpired&&Date.parse(freshQuote.expiresAt)>Date.now();
  const available=!!status?.billingConfigured&&!status.fulfillmentPending&&status.generation!==null&&status.plans.some(item=>item.id===chosen)&&!!payablePrice&&(originalRecovery||quoteCurrent);
  useEffect(()=>{
    const ticket=++quoteSequence.current,at=epoch.current,key=quoteKey;
    purchaseConsentScope.current=null;setConsent(false);setQuoteExpired(false);setQuoteError('');
    if(!authReady||!user||!status?.billingConfigured||status.generation===null||!selected||market.country==='other'||checkoutPending||hasLocalAttempt||subscriptionOpen||status.fulfillmentPending){setQuoteLoading(false);return;}
    const scope={ownerId:user.id,authority,billingMode:status.billingMode};
    const valid=()=>mounted.current&&epoch.current===at&&quoteSequence.current===ticket&&currentQuoteKey.current===key&&current.current.owner===scope.ownerId&&current.current.authority===scope.authority&&current.current.ready;
    const intent=captureLoopQuoteIntent({action:'quote',requestId:crypto.randomUUID(),expectedGeneration:status.generation,plan:selected.id,country:market.country,currency:market.currency});
    setQuoteLoading(true);
    void requestLoopPriceQuote(scope,intent,valid).then(value=>{if(valid()){setQuoteState({key,value});setQuoteExpired(false);}}).catch(()=>{if(valid()){setQuoteState(null);setQuoteError('We could not confirm this monthly price. Refresh the price before continuing.');}}).finally(()=>{if(valid())setQuoteLoading(false);});
    return()=>{quoteSequence.current++;};
  },[quoteKey,authReady,checkoutPending,hasLocalAttempt,subscriptionOpen,status?.billingConfigured,status?.fulfillmentPending]);
  useEffect(()=>{if(!freshQuote||originalRecovery)return;const remaining=Date.parse(freshQuote.expiresAt)-Date.now();const timer=setTimeout(()=>{purchaseConsentScope.current=null;setConsent(false);setQuoteExpired(true);},Math.max(0,remaining));return()=>clearTimeout(timer);},[freshQuote?.quoteId,originalRecovery]);
  const purchaseFingerprint=()=>JSON.stringify([user?.id,authority,status?.billingMode,status?.generation,chosen,status?.checkout?.requestId,payablePrice]);
  const cancelFingerprint=()=>JSON.stringify([user?.id,authority,status?.billingMode,status?.generation,sub?.subscriptionId,sub?.version]);
  function changeMarket(next:LoopPriceMarket){if(lock.current||originalRecovery||next.country===market.country&&next.currency===market.currency)return;quoteSequence.current++;purchaseConsentScope.current=null;setConsent(false);setQuoteState(null);setQuoteExpired(false);setMarket(next);setError('');setMessage('');}
  const choose=(id:LoopSubscriptionPlan)=>{if(lock.current||id===chosen||originalRecovery&&id!==chosen)return;quoteSequence.current++;purchaseConsentScope.current=null;cancelConsentScope.current=null;setChosen(id);setConsent(false);setCancelConfirm(false);setError('');setMessage('');};
  async function checkout(){
    if(lock.current||loading||!user||!authReady||!status||status.generation===null||!selected||!available||!consent||purchaseConsentScope.current!==purchaseFingerprint()||subscriptionOpen)return;
    const scope={ownerId:user.id,authority,billingMode:status.billingMode,pricing:payablePrice},at=epoch.current;
    const valid=()=>mounted.current&&current.current.ready&&current.current.owner===scope.ownerId&&current.current.authority===scope.authority&&trackingDraftAuthority(scope.ownerId)===scope.authority&&epoch.current===at;
    const original=checkoutIntent.current;
    if(original&&(original.plan!==selected.id||original.expectedGeneration!==status.generation||original.quoteId!==(payablePrice.quoteId??undefined))){setError('Confirm the previous checkout with Refresh billing before choosing another plan or currency.');return;}
    const intent=original??captureLoopCheckoutIntent(selected.id,status.generation,checkoutPending?status.checkout.requestId:crypto.randomUUID(),payablePrice.quoteId??undefined);
    checkoutIntent.current=intent;attemptedPrice.current=payablePrice;purchaseConsentScope.current=null;lock.current=true;setBusy(true);setConsent(false);setError('');
    try{const receipt=await createLoopSubscriptionCheckout(scope,intent,valid);if(!valid())return;await reportMetaCheckout(receipt.requestId,scope.ownerId);if(!valid())return;await openPaymentCheckout(receipt,()=>undefined);if(valid())setMessage('Checkout opened. Access starts only after payment is confirmed.');}
    catch(failure){if(valid()){
      // These explicit server codes prove the provider checkout was never sent.
      // Unknown failures retain their original identity to prevent a second charge.
      if(failure instanceof LoopBillingError&&['LOOP_BILLING_QUOTE_EXPIRED','LOOP_BILLING_PRICE_CHANGED'].includes(failure.code??'')&&checkoutIntent.current===intent){checkoutIntent.current=null;attemptedPrice.current=null;setQuoteState(null);setQuoteRefresh(value=>value+1);setError('This monthly price changed or expired before checkout was created. Review the refreshed price and confirm again.');}
      else setError(failure instanceof LoopBillingError?failure.message:'Checkout could not be confirmed. Refresh billing before trying again; use the original checkout if one is shown.');
    }}
    finally{if(valid()){lock.current=false;setBusy(false);}}
  }
  async function cancel(){
    if(lock.current||loading||!user||!authReady||!status||status.generation===null||!sub||!cancelConfirm||cancelConsentScope.current!==cancelFingerprint()||sub.cancelAtPeriodEnd)return;
    const scope={ownerId:user.id,authority},at=epoch.current;
    const valid=()=>mounted.current&&current.current.ready&&current.current.owner===scope.ownerId&&current.current.authority===scope.authority&&epoch.current===at;
    const intent=cancelIntent.current??captureLoopCancelIntent(sub,status.generation);
    cancelIntent.current=intent;cancelConsentScope.current=null;lock.current=true;setBusy(true);setCancelConfirm(false);setError('');setMessage('');
    try{const receipt=await cancelLoopSubscription(scope,intent,valid);if(!valid())return;setStatus(previous=>previous?{...previous,subscription:receipt.subscription}:null);if(receipt.status==='confirmed'&&receipt.subscription?.cancelAtPeriodEnd){cancelIntent.current=null;setMessage(`Renewal cancelled. Your recorded billing period ends ${date(receipt.subscription.validUntil)}. Check current access below.`);}else setError('Cancellation is awaiting confirmation. Refresh billing to check it, or retry the same cancellation request.');}
    catch{if(valid())setError('Cancellation could not be confirmed. Refresh billing, or confirm again to retry the same request.');}
    finally{if(valid()){lock.current=false;setBusy(false);}}
  }
  async function resumeCheckout(){
    if(!status?.checkout?.checkoutUrl||!user||busy)return;
    // Resolve the original server request again; a stored URL alone never grants access or renewal consent.
    const existing=status.checkout;
    if(!consent||chosen!==existing.plan||status.generation===null)return;
    checkoutIntent.current=captureLoopCheckoutIntent(existing.plan,status.generation,existing.requestId,existing.pricing?.quoteId??undefined);attemptedPrice.current=existing.pricing;await checkout();
  }
  return <section className={`loop-subscription-billing ${compact?'jl-panel':'product-proposed-plans'}`} aria-labelledby={compact?'loop-billing-account-title':'loop-monthly-plans-title'}>
    <p className={compact?'jl-eyebrow':'jv-caption'}>{compact?'AUTOMATED JOB LOOP · MONTHLY SUBSCRIPTION':'Automated Job Loop · monthly subscription'}</p>
    <h2 id={compact?'loop-billing-account-title':'loop-monthly-plans-title'} className={compact?undefined:'jv-sr-only'}>{compact?'Your Automated Job Loop subscription':'Automated Job Loop monthly plans'}</h2>
    {compact&&<p>Choose your search pace. Add or build up to three CV variants, set your roles and locations, and review matched opportunities and tailored CVs in your dashboard.</p>}
    {!compact&&<div className="product-proposed-grid">{subscriptionPlans.map((item,index)=>{const money={currency:market.currency,amountMinor:LOOP_LOCAL_CURRENCIES[market.currency].amounts[item.id],exponent:LOOP_LOCAL_CURRENCIES[market.currency].exponent};return <article className={`pricing-card${index===1?' pricing-card--featured jv-dark':''}`} key={item.id}><div className="pricing-card-head"><h3>{item.name}</h3>{index===1&&<span className="pricing-flag">Best for an active search</span>}</div><p className="pricing-price"><span className="pricing-amount">{formatLoopPrice(money)}</span><span className="pricing-unit">{money.currency} / month</span></p><p className="pricing-desc">{item.description}</p><ul>{item.features.map(feature=><li key={feature}><Check size={17} aria-hidden="true"/>{feature}</li>)}</ul>{authReady?<button type="button" className={`jv-btn jv-btn--block ${index===1?'jv-btn--primary':'jv-btn--secondary'}`} onClick={()=>choose(item.id)} disabled={busy||status?.fulfillmentPending||subscriptionOpen||originalRecovery&&chosen!==item.id} aria-pressed={chosen===item.id}>{chosen===item.id?'Selected':`Choose ${item.name}`}</button>:<Link className={`jv-btn jv-btn--block ${index===1?'jv-btn--primary':'jv-btn--secondary'}`} to={`/auth?next=${encodeURIComponent(loopPricingReturn(item.id,market))}`}>Choose {item.name}</Link>}</article>;})}</div>}
    {!compact&&<p className="loop-bill-line">Billed monthly until you cancel. Tax is included in the quoted total, and no trial or subscription starts automatically.</p>}
    {!compact&&<div className="loop-price-market" role="group" aria-label="Monthly price location and currency"><label>Billing country or region<select value={market.country} disabled={busy||loading||originalRecovery} onChange={event=>{const country=event.target.value;if(country==='other')changeMarket({country:'other',currency:'USD'});else if(isLoopLocalCountry(country))changeMarket({country,currency:LOOP_LOCAL_COUNTRIES[country].currency});}}>{Object.entries(LOOP_LOCAL_COUNTRIES).map(([code,item])=><option key={code} value={code}>{item.label}</option>)}<option value="other">Other country / region · pay in USD</option></select></label><label>Payment currency<select value={market.currency} disabled={busy||loading||originalRecovery||market.country==='other'} onChange={event=>{if(isLoopLocalCurrency(event.target.value))changeMarket({...market,currency:event.target.value});}}>{Object.entries(LOOP_LOCAL_CURRENCIES).map(([code,item])=><option key={code} value={code}>{code} · {item.label}</option>)}</select></label><p>This selects billing prices, separately from the countries where you want to find jobs. You can change the suggestion before checkout.</p>{market.country==='other'&&<p>Pay in US dollars. Enter your actual billing country at secure checkout.</p>}{originalRecovery&&<p>The original checkout keeps its own price and currency. Confirm its status before starting another purchase.</p>}</div>}
    {compact?<p>Prices are shown in the selected currency, billed every month until you cancel. Tax is included in the quoted monthly total. Existing subscriptions keep their original price and currency. No trial or subscription starts automatically. A run is one search and preparation cycle, not a guaranteed number of vacancies, interviews or job offers.</p>:<details className="jv-faq jv-faq--wide pricing-details"><summary><span>Billing details</span><span className="jv-faq-toggle" aria-hidden="true"><Plus/></span></summary><p>Prices are shown in the selected currency, billed every month until you cancel. Tax is included in the quoted monthly total. Existing subscriptions keep their original price and currency. No trial or subscription starts automatically. A run is one search and preparation cycle, not a guaranteed number of vacancies, interviews or job offers.</p></details>}
    {authReady&&<div>
      {status?.billingMode==='test'&&<p role="status" className="jl-warning">Test checkout only. Test payments do not purchase live Automated Job Loop access.</p>}
      {loading&&<p role="status">Checking your subscription and payment confirmations…</p>}
      {status&&!status.billingConfigured&&<p role="status">Automated Job Loop checkout is not available right now. Existing access and saved work are unchanged.</p>}
      {status?.fulfillmentPending&&<p role="alert" className="jl-warning">Payment was received, but Automated Job Loop access is awaiting service-capacity reconciliation. Do not purchase again. <Link to="/contact">Contact support with your Dodo receipt</Link> so we can resolve access or the payment.</p>}
      {status?.generation===null&&<p>Save your Automated Job Loop setup before choosing a subscription. <Link to="/onboarding">Continue my setup</Link>.</p>}
      {sub&&<div aria-label="Current Automated Job Loop subscription"><h3>{loopSubscriptionPlan(sub.plan).name} · {sub.pricing?`${formatLoopPrice(sub.pricing)} ${sub.pricing.currency}/month`:'monthly subscription'}</h3>{!sub.pricing&&<p>Your Dodo Payments invoice confirms the original billed amount and currency.</p>}<p>Status: {sub.revoked?'Access revoked':sub.status.replace(/_/g,' ')}.</p><p>Recorded paid period ends {date(sub.validUntil)}.</p>{currentPaid&&!graceAccess&&<p>Paid access through {date(status.entitlement.validUntil)}.</p>}{graceAccess&&<p>Payment is overdue. Access temporarily continues until {date(sub.graceUntil)} under the confirmed payment grace period. Contact support if you need help resolving payment.</p>}{sub.cancelAtPeriodEnd?<p>Renewal is cancelled. There is no further scheduled renewal. {currentPaid ? `Your confirmed access ends ${date(status.entitlement.validUntil)}.` : "Saved records are retained; current payment and access status are shown above."}</p>:sub.revoked&&providerMayRenew?<p>Your access is revoked, but monthly renewal has not been cancelled. Cancel renewal below before starting another subscription.</p>:sub.status==='active'?<p>Renews monthly until you cancel. Your Dodo Payments invoice confirms your charge dates.</p>:!graceAccess&&<p>Payment or subscription access needs confirmation. Saved records are retained.</p>}
        {sub.cancelAtPeriodEnd&&providerPaymentUnresolved&&<p>The provider may still be resolving an earlier payment. <Link to="/contact">Contact support</Link> before starting another subscription.</p>}
        {providerMayRenew&&<><label className="jl-consent"><input type="checkbox" checked={cancelConfirm} disabled={busy||loading} onChange={event=>{cancelConsentScope.current=event.target.checked?cancelFingerprint():null;setCancelConfirm(event.target.checked);}}/><span>Cancel future monthly renewal for this Automated Job Loop subscription. {sub.revoked?'This stops future renewal without restoring revoked access.':'Any already-confirmed paid access keeps its current end date.'} This does not request a refund.</span></label><button type="button" className="jl-button" disabled={busy||loading||!cancelConfirm} onClick={()=>void cancel()}>{busy?'Confirming…':cancelIntent.current?'Retry original cancellation':'Cancel monthly renewal'}</button></>}
      </div>}
      {checkoutPending&&!status.fulfillmentPending&&<p role="status">{loopSubscriptionPlan(status.checkout.plan).name} checkout is {status.checkout.status.replace(/_/g,' ')}. Payment is not yet confirmed here. Refresh billing before opening another checkout. If the original checkout has expired or payment remains unclear, <Link to="/contact">contact support</Link> to reconcile it.</p>}
      {pendingPrice&&<p role="status">Original checkout price: {formatLoopPrice(pendingPrice)} {pendingPrice.currency} each month, tax included. Its original price applies when you resume it.</p>}
      {params.get('loop_checkout')&&<p role="status">Returned from checkout. Your payment confirmation and current access are shown here after Refresh billing; this return link does not prove payment.</p>}
      {quoteLoading&&!originalRecovery&&<p role="status">Confirming your monthly price…</p>}
      {(quoteError||quoteExpired)&&!originalRecovery&&<p role="alert">{quoteExpired?'This price quote expired. Refresh the price and review it again before purchasing.':quoteError}</p>}
      {selected&&!originalRecovery&&!subscriptionOpen&&market.country!=='other'&&status?.billingConfigured&&<button type="button" className="jl-button" disabled={busy||loading||quoteLoading} onClick={()=>{quoteSequence.current++;purchaseConsentScope.current=null;setConsent(false);setQuoteState(null);setQuoteRefresh(value=>value+1);}}>Refresh monthly price</button>}
      {!subscriptionOpen&&selected&&available&&<div aria-label="Confirm Automated Job Loop purchase"><h3>Automated Job Loop {selected.name} · {formatLoopPrice(payablePrice)} {payablePrice.currency} / month</h3><label className="jl-consent"><input type="checkbox" checked={consent} disabled={busy||loading||quoteLoading&&!originalRecovery} onChange={event=>{purchaseConsentScope.current=event.target.checked?purchaseFingerprint():null;setConsent(event.target.checked);}}/><span>I choose {selected.name} at {formatLoopPrice(payablePrice)} {payablePrice.currency} each month, with tax included, and automatic monthly renewal until I cancel. I have read the <Link to="/terms">terms</Link> and <Link to="/refund">refund policy</Link>.</span></label><button type="button" className="product-button" disabled={busy||loading||!consent||checkoutPending&&status.checkout.plan!==selected.id} onClick={()=>void(checkoutPending?resumeCheckout():checkout())}>{busy?'Confirming checkout…':originalRecovery?'Resume original secure checkout':`Continue to secure checkout · ${formatLoopPrice(payablePrice)}/month`}</button></div>}
      {compact&&<Link className="jl-button" to="/pricing">View monthly Automated Job Loop plans</Link>}
      <button type="button" className="jl-button" disabled={busy||loading} onClick={()=>void refresh()}>Refresh billing</button>
    </div>}
    {error&&<p role="alert" className="jl-warning">{error}</p>}{message&&<p role="status">{message}</p>}
    <p className="product-plan-note">Pausing or cancelling an Automated Job Loop schedule stops scheduling; it does not cancel subscription billing. Use Cancel monthly renewal here to stop future charges. AI processing requires its separate consent and remains subject to the limits and availability shown in your account. <Link to="/refund">Payment help and refunds</Link>.</p>
  </section>;
}
