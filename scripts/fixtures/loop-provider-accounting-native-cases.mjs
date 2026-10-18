import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Genuine native locks; provider API and signature behavior are separate proof.
export async function loopProviderAccountingNativeCases({observer,actor,check,blocking,quote}){
  const product='pdt_0NpzVnWkzvNbKUPtHzZGo',hash='a'.repeat(64);
  const detail=(a,b,p)=>({distinctBackendPids:[a.pid,b.pid],blockingPids:p});
  const rejected=(promise,code)=>promise.then(()=>false,error=>error.message.includes(code));
  async function setup(){
    await observer.query('TRUNCATE auth.users CASCADE;');
    const f={user:randomUUID(),session:randomUUID(),request:randomUUID()},suffix=f.user.replaceAll('-','');Object.assign(f,{checkout:'cks_'+suffix,subscription:'sub_'+suffix,customer:'cus_'+suffix,payment:'pay_'+suffix});
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(f.user)});INSERT INTO auth.sessions(id,user_id) VALUES(${quote(f.session)},${quote(f.user)});SELECT job_loop_open_record(${quote(f.user)});UPDATE job_loop_pilot_users SET active=false WHERE user_id=${quote(f.user)};`);
    Object.assign(f,await observer.json("SELECT jsonb_build_object('start',now()-interval '1 day','end',now()+interval '29 days','renewStart',now()+interval '29 days','renewEnd',now()+interval '59 days','created',extract(epoch FROM now())::bigint-100);"));
    f.quoteId=(await observer.json(`SELECT job_loop_billing_quote_issue(${quote(f.user)},${quote(f.session)},0,${quote(randomUUID())},'live','weekly','IN','INR','loop-local-2026-10-18-v1',${quote(product)},'lcp_native',${quote(hash)},${quote(hash)},279900,279900);`)).quoteId;
    await observer.query(`SELECT job_loop_billing_checkout_claim_v2(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},'live','weekly',${quote(product)},${quote(f.quoteId)});SELECT job_loop_billing_checkout_finalize(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},${quote(f.checkout)},${quote('https://checkout.dodopayments.com/session/'+f.checkout)});`);return f;
  }
  const bind=(f,changes={})=>{const a={payment:f.payment,start:f.start,end:f.end,accounting:2947,settlement:2834,...changes};return`SELECT job_loop_billing_accounting_bind(${quote(f.user)},${quote(f.request)},'live',${quote(f.quoteId)},${quote(f.subscription)},${quote(f.customer)},${quote(a.payment)},'INR',279900,'USD',${a.settlement},0,'USD',${a.accounting},${quote(a.start)},${quote(a.end)});`;};
  const apply=(f,changes={})=>{const e={payment:f.payment,start:f.start,end:f.end,created:f.created,revoked:false,...changes};return`SELECT job_loop_billing_apply_event_v2(${quote(f.user)},${quote(f.request)},'live','weekly',${quote(product)},${quote(f.checkout)},${quote(f.subscription)},${quote(f.customer)},'active',${quote(e.start)},${quote(e.end)},false,${quote('evt_'+randomUUID())},${e.created},${e.revoked},${quote(hash)},${quote(e.payment)},279900,NULL,${quote(f.quoteId)},'INR');`;};
  const order=f=>`SELECT job_loop_billing_order(${quote(f.user)},${quote(f.request)},'live');`;
  const entitlement=f=>`SELECT job_loop_billing_entitlement(${quote(f.user)});`;
  await check('concurrent exact provider accounting retries preserve one original non-granting evidence tuple',async()=>{
    const f=await setup(),a=await actor('accounting-first',f.user,'service_role'),b=await actor('accounting-retry',f.user,'service_role');
    await a.query('BEGIN;');const original=await a.json(bind(f));const pending=b.json(bind(f)),p=await blocking(b,a);await a.query('COMMIT;');assert.deepEqual(await pending,original);
    assert.equal(original.amountMinor,279900);assert.equal(original.accountingAmountMinor,2947);assert.equal(original.settlementAmountMinor,2834);assert.equal((await observer.json(entitlement(f))).active,false);assert.equal((await observer.json(order(f))).providerAccounting.length,1);
    await a.end();await b.end();return detail(a,b,p);
  });
  await check('conflicting provider accounting snapshot waits then cannot rewrite the original payment',async()=>{
    const f=await setup(),a=await actor('accounting-proof-held',f.user,'service_role'),b=await actor('accounting-conflict',f.user,'service_role');await a.query('BEGIN;');await a.query(bind(f));
    const pending=rejected(b.query(bind(f,{accounting:3000})),'LOOP_BILLING_ACCOUNTING_CONFLICT'),p=await blocking(b,a);await a.query('COMMIT;');assert.equal(await pending,true);assert.equal((await observer.json(order(f))).providerAccounting[0].accountingAmountMinor,2947);
    await a.end();await b.end();return detail(a,b,p);
  });
  await check('accounting evidence serializes before exact local paid proof and cannot grant access by itself',async()=>{
    const f=await setup(),a=await actor('accounting-metadata-held',f.user,'service_role'),b=await actor('local-paid-proof',f.user,'service_role');await a.query('BEGIN;');await a.query(bind(f));assert.equal((await a.json(entitlement(f))).active,false);
    const pending=b.json(apply(f)),p=await blocking(b,a);await a.query('COMMIT;');await pending;assert.equal((await observer.json(entitlement(f))).active,true);
    const period=await observer.json('SELECT jsonb_build_object(\'currency\',currency,\'amount\',amount) FROM jobvance_private.loop_subscription_periods;');assert.deepEqual(period,{currency:'INR',amount:279900});
    await a.end();await b.end();return detail(a,b,p);
  });
  await check('later accounting revaluation appends without repricing earlier payment or blocking its refund',async()=>{
    const f=await setup();await observer.query(bind(f));await observer.query(apply(f));const previous=(await observer.json(entitlement(f))).validUntil;
    const next={payment:'pay_native_cycle_2',start:f.renewStart,end:f.renewEnd,accounting:2995,settlement:2840};await observer.query(bind(f,next));assert.equal((await observer.json(entitlement(f))).validUntil,previous);
    await observer.query(apply(f,{...next,created:f.created+1}));await observer.query(apply(f,{revoked:true,created:f.created+2}));
    const receipt=await observer.json(order(f));assert.equal(receipt.providerAccounting.length,2);assert.equal(receipt.providerAccounting[0].accountingAmountMinor,2947);assert.equal(receipt.providerAccounting[1].accountingAmountMinor,2995);assert.equal(receipt.pricing.currency,'INR');assert.equal(receipt.pricing.amountMinor,279900);assert.equal((await observer.json(entitlement(f))).active,false);
    return{accountingAnchors:2,earlierAnchorUnchanged:true,customerPriceUnchanged:true,oldPaymentRefundRevoked:true};
  });
}
