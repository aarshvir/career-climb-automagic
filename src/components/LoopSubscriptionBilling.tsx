import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { registerTrackingDraftOwner, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import { openPaymentCheckout } from '@/lib/payment-checkout';
import { subscriptionPlans, isLoopSubscriptionPlan, loopSubscriptionPlan, type LoopSubscriptionPlan } from '@/lib/subscription-plans';
import { cancelLoopSubscription, captureLoopCancelIntent, captureLoopCheckoutIntent, createLoopSubscriptionCheckout, readLoopBilling, LoopBillingError, type LoopBillingStatus, type LoopCancelIntent, type LoopCheckoutIntent } from '@/lib/loop-subscription-billing';
import './LoopSubscriptionBilling.css';

function date(value: string) { return new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); }
export default function LoopSubscriptionBilling({ compact=false }: {compact?:boolean}) {
  const {user,session,loading:authLoading,authError}=useAuth();
  const authReady=!!user&&!!session&&!authLoading&&!authError;
  if(authReady)registerTrackingDraftOwner(user.id);
  const authority=user?trackingDraftAuthority(user.id):-1;
  const [params]=useSearchParams();
  const requested=params.get('loopPlan');
  const [chosen,setChosen]=useState<LoopSubscriptionPlan|null>(isLoopSubscriptionPlan(requested)?requested:null);
  const [storedStatus,setStatus]=useState<LoopBillingStatus|null>(null),[loadedScope,setLoadedScope]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const status=authReady&&loadedScope===`${user.id}:${authority}`?storedStatus:null;
  const [consent,setConsent]=useState(false),[cancelConfirm,setCancelConfirm]=useState(false);
  const checkoutIntent=useRef<Readonly<LoopCheckoutIntent>|null>(null),cancelIntent=useRef<Readonly<LoopCancelIntent>|null>(null);
  const purchaseConsentScope=useRef<string|null>(null),cancelConsentScope=useRef<string|null>(null),refreshSequence=useRef(0);
  const current=useRef({owner:user?.id,authority,ready:authReady}),epoch=useRef(0),mounted=useRef(true),lock=useRef(false);
  current.current={owner:user?.id,authority,ready:authReady};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;};},[]);
  const refresh=useCallback(async()=>{
    if(!user||!authReady||authority<0)return;
    const scope={ownerId:user.id,authority},at=epoch.current,ticket=++refreshSequence.current;
    const valid=()=>mounted.current&&current.current.ready&&current.current.owner===scope.ownerId&&current.current.authority===scope.authority&&epoch.current===at&&refreshSequence.current===ticket;
    purchaseConsentScope.current=null;cancelConsentScope.current=null;setConsent(false);setCancelConfirm(false);setLoading(true);setError('');
    try{const next=await readLoopBilling(scope,valid);if(valid()){purchaseConsentScope.current=null;cancelConsentScope.current=null;setConsent(false);setCancelConfirm(false);setLoadedScope(`${scope.ownerId}:${scope.authority}`);setStatus(next);if(checkoutIntent.current&&checkoutIntent.current.expectedGeneration!==next.generation)checkoutIntent.current=null;if(cancelIntent.current&&(cancelIntent.current.expectedGeneration!==next.generation||cancelIntent.current.expectedSubscriptionId!==next.subscription?.subscriptionId))cancelIntent.current=null;if(next.subscription?.cancelAtPeriodEnd)cancelIntent.current=null;else if(next.cancelRequest&&next.cancelRequest.status!=='confirmed'&&next.generation!==null&&next.cancelRequest.subscriptionId===next.subscription?.subscriptionId)cancelIntent.current=Object.freeze({action:'cancel',requestId:next.cancelRequest.requestId,expectedGeneration:next.generation,expectedSubscriptionId:next.cancelRequest.subscriptionId,expectedVersion:next.cancelRequest.version,consent:true});}}
    catch{if(valid()){setStatus(null);setError('We could not load your Job Loop billing. Refresh to confirm your access and any previous checkout.');}}
    finally{if(valid())setLoading(false);}
  },[user?.id,authReady,authority]);
  useEffect(()=>{epoch.current++;refreshSequence.current++;purchaseConsentScope.current=null;cancelConsentScope.current=null;checkoutIntent.current=null;cancelIntent.current=null;setStatus(null);setLoadedScope('');setConsent(false);setCancelConfirm(false);setMessage('');setError('');setBusy(false);lock.current=false;void refresh();},[user?.id,authority,authReady,refresh]);
  const sub=status?.subscription;
  const paidPlan=sub?.plan==='active'?'three_weekly':sub?.plan;
  const currentPaid=status?.billingMode==='live'&&!!sub&&!sub.revoked&&!!status.entitlement?.active&&status.entitlement.plan===paidPlan&&!!status.entitlement.validUntil&&new Date(status.entitlement.validUntil).getTime()>Date.now();
  const graceAccess=currentPaid&&sub.status==='past_due'&&!!sub.graceUntil&&new Date(sub.graceUntil).getTime()>Date.now();
  const subscriptionOpen=!!sub&&!sub.revoked&&(new Date(sub.validUntil).getTime()>Date.now()&&['active','cancelled'].includes(sub.status)||['pending','on_hold','paused','past_due'].includes(sub.status));
  const checkoutPending=!!status?.checkout&&!currentPaid&&!['failed','expired','cancelled','completed'].includes(status.checkout.status);
  const selected=chosen?loopSubscriptionPlan(chosen):null;
  const available=!!status?.billingConfigured&&!status.fulfillmentPending&&status.generation!==null&&status.plans.some(item=>item.id===chosen);
  const purchaseFingerprint=()=>JSON.stringify([user?.id,authority,status?.billingMode,status?.generation,chosen,status?.checkout?.requestId]);
  const cancelFingerprint=()=>JSON.stringify([user?.id,authority,status?.billingMode,status?.generation,sub?.subscriptionId,sub?.version]);
  const choose=(id:LoopSubscriptionPlan)=>{if(lock.current)return;purchaseConsentScope.current=null;cancelConsentScope.current=null;setChosen(id);setConsent(false);setCancelConfirm(false);setError('');setMessage('');};
  async function checkout(){
    if(lock.current||loading||!user||!authReady||!status||status.generation===null||!selected||!available||!consent||purchaseConsentScope.current!==purchaseFingerprint()||subscriptionOpen)return;
    const scope={ownerId:user.id,authority,billingMode:status.billingMode},at=epoch.current;
    const valid=()=>mounted.current&&current.current.ready&&current.current.owner===scope.ownerId&&current.current.authority===scope.authority&&epoch.current===at;
    const original=checkoutIntent.current;
    if(original&&(original.plan!==selected.id||original.expectedGeneration!==status.generation)){setError('Confirm the previous checkout with Refresh billing before choosing another plan.');return;}
    const intent=original??captureLoopCheckoutIntent(selected.id,status.generation);
    checkoutIntent.current=intent;purchaseConsentScope.current=null;lock.current=true;setBusy(true);setConsent(false);setError('');
    try{const receipt=await createLoopSubscriptionCheckout(scope,intent,valid);if(!valid())return;await openPaymentCheckout(receipt,()=>undefined);if(valid())setMessage('Checkout opened. Access starts only after payment is confirmed.');}
    catch(failure){if(valid())setError(failure instanceof LoopBillingError?failure.message:'Checkout could not be confirmed. Refresh billing before trying again; use the original checkout if one is shown.');}
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
    checkoutIntent.current=captureLoopCheckoutIntent(existing.plan,status.generation,existing.requestId);await checkout();
  }
  return <section className={`loop-subscription-billing ${compact?'jl-panel':'product-proposed-plans'}`} aria-labelledby={compact?'loop-billing-account-title':'loop-monthly-plans-title'}>
    <p className={compact?'jl-eyebrow':'product-eyebrow'}>JOB LOOP · MONTHLY SUBSCRIPTION</p>
    <h2 id={compact?'loop-billing-account-title':'loop-monthly-plans-title'}>{compact?'Your Job Loop subscription':'Job Loop monthly plans'}</h2>
    <p>Choose your search pace. Add or build up to three CV variants, set your roles and locations, and review matched opportunities and tailored CVs in your dashboard.</p>
    {!compact&&<div className="product-proposed-grid">{subscriptionPlans.map(item=><article className="product-plan" key={item.id}><h3>{item.name}</h3><p className="product-price">${item.priceUsd}<span>USD / month</span></p><p>{item.description}</p><ul>{item.features.map(feature=><li key={feature}><Check size={17} aria-hidden="true"/>{feature}</li>)}</ul>{authReady?<button type="button" className="product-button" onClick={()=>choose(item.id)} disabled={busy||status?.fulfillmentPending||subscriptionOpen||checkoutPending&&status.checkout.plan!==item.id} aria-pressed={chosen===item.id}>{chosen===item.id?'Selected':`Choose ${item.name}`}</button>:<Link className="product-button" to={`/auth?next=${encodeURIComponent(`/pricing?loopPlan=${item.id}`)}`}>Sign in for {item.name}</Link>}</article>)}</div>}
    <p>Prices are in US dollars, billed every month until you cancel; tax is included in the displayed price and confirmed at secure checkout. No trial or subscription starts automatically. A run is one search and preparation cycle, not a guaranteed number of vacancies, interviews or job offers.</p>
    {authReady&&<div>
      {status?.billingMode==='test'&&<p role="status" className="jl-warning">Test checkout only. Test payments do not purchase live Job Loop access.</p>}
      {loading&&<p role="status">Checking your subscription and payment confirmations…</p>}
      {status&&!status.billingConfigured&&<p role="status">Job Loop checkout is not available right now. Existing access and saved work are unchanged.</p>}
      {status?.fulfillmentPending&&<p role="alert" className="jl-warning">Payment was received, but Job Loop access is awaiting service-capacity reconciliation. Do not purchase again. <Link to="/contact">Contact support with your Dodo receipt</Link> so we can resolve access or the payment.</p>}
      {status?.generation===null&&<p>Save your Job Loop setup before choosing a subscription. <Link to="/onboarding">Continue my setup</Link>.</p>}
      {sub&&<div aria-label="Current Job Loop subscription"><h3>{loopSubscriptionPlan(sub.plan).name} · ${loopSubscriptionPlan(sub.plan).priceUsd}/month</h3><p>Status: {sub.revoked?'Access revoked':sub.status.replace(/_/g,' ')}.</p><p>Recorded paid period ends {date(sub.validUntil)}.</p>{currentPaid&&!graceAccess&&<p>Paid access through {date(status.entitlement.validUntil)}.</p>}{graceAccess&&<p>Payment is overdue. Access temporarily continues until {date(sub.graceUntil)} under the confirmed payment grace period. Contact support if you need help resolving payment.</p>}{sub.cancelAtPeriodEnd?<p>Renewal is cancelled. There is no further scheduled renewal. {currentPaid ? `Your confirmed access ends ${date(status.entitlement.validUntil)}.` : "Saved records are retained; current payment and access status are shown above."}</p>:sub.status==='active'&&!sub.revoked?<p>Renews monthly until you cancel. Your Dodo Payments invoice confirms your charge dates.</p>:!graceAccess&&<p>Payment or subscription access needs confirmation. Saved records are retained.</p>}
        {!sub.cancelAtPeriodEnd&&!sub.revoked&&['active','on_hold','past_due','paused'].includes(sub.status)&&<><label className="jl-consent"><input type="checkbox" checked={cancelConfirm} disabled={busy||loading} onChange={event=>{cancelConsentScope.current=event.target.checked?cancelFingerprint():null;setCancelConfirm(event.target.checked);}}/><span>Cancel future monthly renewal for this Job Loop subscription. Paid access continues through the confirmed period end. This does not request a refund.</span></label><button type="button" className="jl-button" disabled={busy||loading||!cancelConfirm} onClick={()=>void cancel()}>{busy?'Confirming…':cancelIntent.current?'Retry original cancellation':'Cancel monthly renewal'}</button></>}
      </div>}
      {checkoutPending&&!status.fulfillmentPending&&<p role="status">A {loopSubscriptionPlan(status.checkout.plan).name} checkout is {status.checkout.status.replace(/_/g,' ')}. Payment is not yet confirmed here. Refresh billing before opening another checkout. If the original checkout has expired or payment remains unclear, <Link to="/contact">contact support</Link> to reconcile it.</p>}
      {params.get('loop_checkout')&&<p role="status">Returned from checkout. Your payment confirmation and current access are shown here after Refresh billing; this return link does not prove payment.</p>}
      {!subscriptionOpen&&selected&&available&&<div aria-label="Confirm Job Loop purchase"><h3>{selected.name} Job Loop · ${selected.priceUsd} USD / month</h3><label className="jl-consent"><input type="checkbox" checked={consent} disabled={busy||loading} onChange={event=>{purchaseConsentScope.current=event.target.checked?purchaseFingerprint():null;setConsent(event.target.checked);}}/><span>I choose {selected.name} at ${selected.priceUsd} USD each month, with tax included, and automatic monthly renewal until I cancel. I have read the <Link to="/terms">terms</Link> and <Link to="/refund">refund policy</Link>.</span></label><button type="button" className="product-button" disabled={busy||loading||!consent||checkoutPending&&status.checkout.plan!==selected.id} onClick={()=>void(checkoutPending?resumeCheckout():checkout())}>{busy?'Confirming checkout…':checkoutPending?'Resume original secure checkout':`Continue to secure checkout · $${selected.priceUsd}/month`}</button></div>}
      {compact&&<Link className="jl-button" to="/pricing">View monthly Job Loop plans</Link>}
      <button type="button" className="jl-button" disabled={busy||loading} onClick={()=>void refresh()}>Refresh billing</button>
    </div>}
    {error&&<p role="alert" className="jl-warning">{error}</p>}{message&&<p role="status">{message}</p>}
    <p className="product-plan-note">Pausing or cancelling a Job Loop schedule stops scheduling; it does not cancel subscription billing. Use Cancel monthly renewal here to stop future charges. AI processing requires its separate consent and remains subject to the limits and availability shown in your account. <Link to="/refund">Payment help and refunds</Link>.</p>
  </section>;
}
