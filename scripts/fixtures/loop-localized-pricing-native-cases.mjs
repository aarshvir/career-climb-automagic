import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Native sessions prove the exact additive currency schema under real locks.
// Signed HTTP/provider behavior belongs to separate acceptance evidence.
export async function loopLocalizedPricingNativeCases({observer,actor,check,blocking,quote}){
  const product='pdt_0NpzVnWkzvNbKUPtHzZGo',hash='c'.repeat(64);
  const detail=(a,b,p)=>({distinctBackendPids:[a.pid,b.pid],blockingPids:p});
  const rejected=(promise,code)=>promise.then(()=>false,error=>error.message.includes(code));
  async function setup(){
    await observer.query('TRUNCATE auth.users CASCADE;');
    const f={user:randomUUID(),session:randomUUID(),quoteRequest:randomUUID(),request:randomUUID()},suffix=f.user.replaceAll('-','');
    Object.assign(f,{checkout:'cks_'+suffix,subscription:'sub_'+suffix,customer:'cus_'+suffix});
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(f.user)});INSERT INTO auth.sessions(id,user_id) VALUES(${quote(f.session)},${quote(f.user)});SELECT job_loop_open_record(${quote(f.user)});`);
    Object.assign(f,await observer.json("SELECT jsonb_build_object('start',now()-interval '1 day','end',now()+interval '29 days','renewStart',now()+interval '29 days','renewEnd',now()+interval '59 days','created',extract(epoch FROM now())::bigint-100);"));return f;
  }
  const issue=f=>`SELECT job_loop_billing_quote_issue(${quote(f.user)},${quote(f.session)},0,${quote(f.quoteRequest)},'live','weekly','IN','INR','loop-local-2026-10-18-v1',${quote(product)},'lcp_native',${quote(hash)},${quote(hash)},279900,279900);`;
  const claim=f=>`SELECT job_loop_billing_checkout_claim_v2(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},'live','weekly',${quote(product)},${quote(f.quoteId)});`;
  const event=(f,changes={})=>{
    const e={start:f.start,end:f.end,currency:'INR',amount:279900,event:'evt_'+randomUUID(),payment:'pay_initial_'+f.request.replaceAll('-',''),created:f.created,revoked:false,...changes};
    return`SELECT job_loop_billing_apply_event_v2(${quote(f.user)},${quote(f.request)},'live','weekly',${quote(product)},${quote(f.checkout)},${quote(f.subscription)},${quote(f.customer)},'active',${quote(e.start)},${quote(e.end)},false,${quote(e.event)},${e.created},${e.revoked},${quote(hash)},${quote(e.payment)},${e.amount},NULL,${quote(f.quoteId)},${quote(e.currency)});`;
  };
  async function paid(f){f.quoteId=(await observer.json(issue(f))).quoteId;await observer.query(claim(f));await observer.query(`SELECT job_loop_billing_checkout_finalize(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},${quote(f.checkout)},${quote('https://checkout.dodopayments.com/session/'+f.checkout)});`);await observer.query(event(f));}
  await check('concurrent owned local quote retries retain one immutable price and fingerprint',async()=>{
    const f=await setup(),a=await actor('quote-local-winner',f.user,'service_role'),b=await actor('quote-local-retry',f.user,'service_role');
    await a.query('BEGIN;');const first=await a.json(issue(f));const pending=b.json(issue(f)),p=await blocking(b,a);await a.query('COMMIT;');const retry=await pending;
    assert.deepEqual(retry,first);assert.equal(first.currency,'INR');assert.equal(first.amountMinor,279900);assert.equal(await observer.json('SELECT to_json(count(*)) FROM jobvance_private.loop_price_quotes;'),1);
    await a.end();await b.end();return detail(a,b,p);
  });
  await check('concurrent same quoted checkout acquires one provider creation claim and original local amount',async()=>{
    const f=await setup();f.quoteId=(await observer.json(issue(f))).quoteId;
    const a=await actor('local-checkout-winner',f.user,'service_role'),b=await actor('local-checkout-retry',f.user,'service_role');await a.query('BEGIN;');const first=await a.json(claim(f));
    const pending=b.json(claim(f)),p=await blocking(b,a);await a.query('COMMIT;');const retry=await pending;
    assert.equal(first.creationClaimAcquired,true);assert.equal(retry.creationClaimAcquired,false);assert.equal(retry.pricing.currency,'INR');assert.equal(retry.pricing.amountMinor,279900);
    assert.equal(await observer.json('SELECT to_json(count(*)) FROM jobvance_private.loop_billing_orders;'),1);await a.end();await b.end();return detail(a,b,p);
  });
  await check('renewal and conflicting currency delivery serialize without converting or duplicating paid proof',async()=>{
    const f=await setup();await paid(f);const a=await actor('local-renewal-winner',f.user,'service_role'),b=await actor('wrong-currency-renewal',f.user,'service_role');
    const renewal={start:f.renewStart,end:f.renewEnd,created:f.created+10,payment:'pay_native_renewal'};
    await a.query('BEGIN;');await a.query(event(f,renewal));const pending=rejected(b.query(event(f,{...renewal,currency:'USD',amount:2900})),'LOOP_BILLING_PAYMENT_CONFLICT'),p=await blocking(b,a);await a.query('COMMIT;');assert.equal(await pending,true);
    const periods=await observer.json(`SELECT jsonb_agg(jsonb_build_object('currency',currency,'amount',amount,'quoteId',quote_id)) FROM jobvance_private.loop_subscription_periods;`);
    assert.equal(periods.length,2);assert(periods.every(row=>row.currency==='INR'&&row.amount===279900&&row.quoteId===f.quoteId));await a.end();await b.end();return detail(a,b,p);
  });
  await check('localized refund remains revoked after concurrent later activation with original currency receipt',async()=>{
    const f=await setup();await paid(f);const a=await actor('local-refund-first',f.user,'service_role'),b=await actor('local-activation-later',f.user,'service_role');
    await a.query('BEGIN;');await a.query(event(f,{revoked:true,created:f.created+10}));const pending=b.json(event(f,{created:f.created+20})),p=await blocking(b,a);await a.query('COMMIT;');await pending;
    const view=await observer.json(`SELECT job_loop_billing_status_v2(${quote(f.user)},${quote(f.session)},'live');`);assert.equal(view.entitlement.active,false);assert.equal(view.subscription.pricing.currency,'INR');assert.equal(view.subscription.pricing.amountMinor,279900);assert.equal(view.subscription.revoked,true);
    await a.end();await b.end();return detail(a,b,p);
  });
}
