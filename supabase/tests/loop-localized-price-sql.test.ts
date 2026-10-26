// @vitest-environment node
// Actual SQL authority, isolated owners and provider fixtures. No HTTP or charges.
import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { applyLoopBillingWebhook,controlLoopBilling,type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';
import { LOOP_BILLING_PRODUCT,loopBillingConfiguration } from '../functions/_shared/loop-billing.ts';
import { dodoEnvironment } from './dodo-fixtures';

// This file deliberately executes the already-applied v1 migration. Historical
// price evidence must not change when today's customer catalogue advances.
const LOOP_LOCAL_PRICE_CATALOG_VERSION='loop-local-2026-10-18-v1';
const LOOP_LOCAL_CURRENCIES={
  USD:{exponent:2,amounts:{weekly:2900,active:5900,daily:9900}},EUR:{exponent:2,amounts:{weekly:2599,active:5199,daily:8799}},GBP:{exponent:2,amounts:{weekly:2199,active:4399,daily:7399}},
  INR:{exponent:2,amounts:{weekly:279900,active:559900,daily:939900}},AED:{exponent:2,amounts:{weekly:10999,active:21999,daily:35999}},CAD:{exponent:2,amounts:{weekly:4099,active:8399,daily:13999}},
  AUD:{exponent:2,amounts:{weekly:4199,active:8499,daily:13999}},SGD:{exponent:2,amounts:{weekly:3699,active:7499,daily:12999}},JPY:{exponent:0,amounts:{weekly:4599,active:9299,daily:15599}},
} as const;

let db:PGlite,owner:string,session:string,quoteRequest:string,checkoutRequest:string,start:string,end:string,epoch:number;
const file='20261018095409_job_loop_localized_price_quotes.sql';
const raw=(sql:string,args:unknown[]=[])=>db.query<Record<string,any>>(sql,args);
async function rpc(name:string,args:Record<string,unknown>){
  if(!/^job_loop_billing_[a-z_0-9]+$/.test(name))throw Error('Unexpected SQL function');
  await db.exec('SET ROLE service_role');try{return(await raw('SELECT '+name+'('+Object.keys(args).map((key,index)=>key+'=>$'+(index+1)).join(',')+') r',Object.values(args))).rows[0]?.r;}finally{await db.exec('RESET ROLE');}
}
const base=(changes:Record<string,unknown>={})=>({p_user:owner,p_auth_session:session,p_generation:0,p_request:quoteRequest,p_mode:'live',p_plan:'weekly',p_country:'IN',p_currency:'INR',...changes});
const candidate=(changes:Record<string,unknown>={})=>rpc('job_loop_billing_quote_candidate',base(changes));
async function issue(changes:Record<string,unknown>={},proof:Record<string,unknown>={}){
  const b=base(changes),c=(await candidate(changes)).catalog;
  return rpc('job_loop_billing_quote_issue',{...b,p_catalog_version:c?.catalogVersion??LOOP_LOCAL_PRICE_CATALOG_VERSION,p_product:c?.productId??'pdt_0NpzVnWkzvNbKUPtHzZGo',p_rule:b.p_currency==='USD'?null:'lcp_fixture',p_provider_revision:'c'.repeat(64),p_preview_hash:'a'.repeat(64),p_initial_amount:c?.amountMinor??279900,p_recurring_amount:c?.amountMinor??279900,...proof});
}
const claim=(q:Record<string,any>,changes:Record<string,unknown>={})=>rpc('job_loop_billing_checkout_claim_v2',{p_user:owner,p_auth_session:session,p_generation:0,p_request:checkoutRequest,p_mode:q.mode,p_plan:q.plan,p_product:q.productId,p_quote:q.quoteId,...changes});
const read=(q:Record<string,any>,changes:Record<string,unknown>={})=>rpc('job_loop_billing_quote_read',{p_user:owner,p_auth_session:session,p_generation:0,p_mode:q.mode,p_quote:q.quoteId,...changes});
const status=(mode='live')=>rpc('job_loop_billing_status_v2',{p_user:owner,p_auth_session:session,p_mode:mode});
async function ready(q:Record<string,any>){await claim(q);await rpc('job_loop_billing_checkout_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:checkoutRequest,p_session:'cks_fixture',p_url:`https://${q.mode==='test'?'test.':''}checkout.dodopayments.com/session/cks_fixture`});}
const event=(q:Record<string,any>,changes:Record<string,unknown>={})=>({p_user:owner,p_request:checkoutRequest,p_mode:q.mode,p_plan:q.plan,p_product:q.productId,p_session:'cks_fixture',p_subscription:'sub_fixture',p_customer:'cus_fixture',p_status:'active',p_period_start:start,p_valid_until:end,p_cancel_at_period_end:false,p_event:'evt_initial',p_created:epoch,p_revoked:false,p_payload_hash:'b'.repeat(64),p_payment:'pay_initial',p_paid_amount:q.amountMinor,p_grace_until:null,p_quote:q.quoteId,p_currency:q.currency,...changes});
const apply=(q:Record<string,any>,changes:Record<string,unknown>={})=>rpc('job_loop_billing_apply_event_v2',event(q,changes));
async function age(q:Record<string,any>){
  // Isolated fixture clock advancement; application roles cannot alter quotes.
  await db.exec('ALTER TABLE jobvance_private.loop_price_quotes DISABLE TRIGGER loop_price_quote_immutable');
  try{await raw("UPDATE jobvance_private.loop_price_quotes SET created_at=created_at-interval '1 hour',expires_at=expires_at-interval '1 hour' WHERE quote_id=$1",[q.quoteId]);}finally{await db.exec('ALTER TABLE jobvance_private.loop_price_quotes ENABLE TRIGGER loop_price_quote_immutable');}
}

beforeAll(async()=>{
  db=new PGlite();await db.exec(await checkLoopSchema());await db.exec('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz)');
  for(const name of['20261017122000_job_loop_dodo_entitlements.sql','20261018073501_job_loop_subscription_lifecycle.sql','20261018091955_job_loop_refund_renewal_safety.sql',file])await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec('RESET ROLE;TRUNCATE auth.users CASCADE;TRUNCATE jobvance_private.loop_billing_events;UPDATE jobvance_private.loop_price_revisions SET active=true');
  owner=randomUUID();session=randomUUID();quoteRequest=randomUUID();checkoutRequest=randomUUID();
  await raw('INSERT INTO auth.users(id) VALUES($1)',[owner]);await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,owner]);await raw('SELECT job_loop_open_record($1)',[owner]);
  const t=(await raw("SELECT (now()-interval '1 day')::text start,(now()+interval '29 days')::text end,extract(epoch FROM now())::bigint-100 epoch")).rows[0];start=t.start;end=t.end;epoch=Number(t.epoch);
});

describe('localized catalogue and immutable owned quote authority',()=>{
  it.each(Object.keys(LOOP_LOCAL_CURRENCIES))('seeds exact reviewed %s minor units for all three plans and both modes',async currency=>{
    const expected=LOOP_LOCAL_CURRENCIES[currency as keyof typeof LOOP_LOCAL_CURRENCIES];
    for(const mode of['test','live'])for(const plan of['weekly','active','daily'] as const){
      const sqlPlan=plan==='active'?'three_weekly':plan,c=(await candidate({p_mode:mode,p_plan:sqlPlan,p_currency:currency})).catalog;
      expect(c).toMatchObject({catalogVersion:LOOP_LOCAL_PRICE_CATALOG_VERSION,plan:sqlPlan,currency,amountMinor:expected.amounts[plan],exponent:expected.exponent,taxInclusive:true});
    }
  });
  it('issues one exact owner/session quote idempotently and makes its complete price immutable',async()=>{
    const q=await issue();expect(q).toMatchObject({requestId:quoteRequest,generation:0,currency:'INR',amountMinor:279900,initialAmountMinor:279900,recurringAmountMinor:279900,exponent:2,interval:'month',taxInclusive:true,localizedPriceId:'lcp_fixture'});
    expect(q.fingerprint).toMatch(/^[a-f0-9]{64}$/);expect(await issue()).toEqual(q);expect((await candidate()).quote).toEqual(q);expect(await read(q)).toEqual(q);
    const row=(await raw('SELECT extract(epoch FROM expires_at-created_at)::int seconds FROM jobvance_private.loop_price_quotes')).rows[0];expect(row.seconds).toBe(900);
    await expect(raw('UPDATE jobvance_private.loop_price_quotes SET amount_minor=1')).rejects.toThrow('LOOP_PRICE_IMMUTABLE');
    await expect(raw('UPDATE jobvance_private.loop_price_revisions SET amount_minor=1')).rejects.toThrow('LOOP_PRICE_IMMUTABLE');
  });
  it.each([{p_country:'US'},{p_currency:'JPY'},{p_plan:'daily'},{p_mode:'test'},{p_auth_session:'00000000-0000-4000-8000-000000000001'}])('never reinterprets an original quote request under changed identity %j',async changes=>{
    await issue();await expect(candidate(changes)).rejects.toThrow(/LOOP_BILLING_QUOTE_CONFLICT|LOOP_BILLING_SESSION_STALE/);
  });
  it.each([{p_initial_amount:279901},{p_recurring_amount:279901},{p_product:'pdt_forged'},{p_catalog_version:'forged'},{p_rule:null},{p_preview_hash:'invalid'}])('rejects unverified or different quote price proof %j',async proof=>{
    await expect(issue({},proof)).rejects.toThrow('LOOP_BILLING_QUOTE_INVALID');expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_price_quotes')).rows[0].n).toBe(0);
  });
  it('handles JPY as whole units and rejects unconfigured currencies instead of assuming cents',async()=>{
    const q=await issue({p_currency:'JPY',p_country:'JP'});expect(q).toMatchObject({currency:'JPY',exponent:0,amountMinor:4599});
    await expect(candidate({p_request:randomUUID(),p_currency:'KRW'})).rejects.toThrow('LOOP_BILLING_PRICE_UNAVAILABLE');
  });
  it('does not allow an expired quote to open its first checkout, while an original ready checkout keeps its exact price',async()=>{
    const expired=await issue();await age(expired);expect(await read(expired)).toMatchObject({quoteId:expired.quoteId});await expect(claim(expired)).rejects.toThrow('LOOP_BILLING_QUOTE_EXPIRED');
    quoteRequest=randomUUID();const q=await issue();await ready(q);await age(q);expect(await claim(q)).toMatchObject({state:'ready',creationClaimAcquired:false,pricing:{currency:'INR',amountMinor:279900}});
    await expect(claim(q,{p_request:randomUUID()})).rejects.toThrow('LOOP_BILLING_QUOTE_CONFLICT');
  });
  it('rejects cross-owner, cross-session and stale-generation quote reuse without creating an order',async()=>{
    const q=await issue(),other=randomUUID(),fresh=randomUUID();await raw('INSERT INTO auth.users(id) VALUES($1)',[other]);await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[fresh,owner]);
    await expect(read(q,{p_user:other})).rejects.toThrow('LOOP_BILLING_SESSION_STALE');await expect(claim(q,{p_auth_session:fresh})).rejects.toThrow('LOOP_BILLING_QUOTE_CONFLICT');await expect(claim(q,{p_generation:1})).rejects.toThrow('LOOP_REQUEST_STALE');
    expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_billing_orders')).rows[0].n).toBe(0);
  });
  it('preserves historical quoted price after the catalogue is retired and blocks new quotes for that revision',async()=>{
    const q=await issue();await ready(q);await raw("UPDATE jobvance_private.loop_price_revisions SET active=false WHERE mode='live' AND plan='weekly' AND currency='INR'");
    expect(await read(q)).toMatchObject({currency:'INR',amountMinor:279900});expect(await claim(q)).toMatchObject({pricing:{catalogVersion:LOOP_LOCAL_PRICE_CATALOG_VERSION,amountMinor:279900}});
    await expect(candidate({p_request:randomUUID()})).rejects.toThrow('LOOP_BILLING_PRICE_UNAVAILABLE');await apply(q);expect((await status()).subscription.pricing).toMatchObject({currency:'INR',amountMinor:279900});
  });
});

describe('localized initial payment, renewal, cancellation and permanent refund authority',()=>{
  it('recovers a historical v1 checkout through real control/webhook SQL orchestration, renewal, cancellation and explicit-currency refund',async()=>{
    const environment=dodoEnvironment({JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:'pdt_0NpzVnWkzvNbKUPtHzZGo',DODO_PRODUCT_LOOP_ACTIVE:'pdt_0NpzW2tG9N28jjBuUzYLB',DODO_PRODUCT_LOOP_DAILY:'pdt_0NpzWGsuzZZJfaeMXNPQV'});
    const config={...loopBillingConfiguration(key=>environment[key])!,mode:'live' as const};
    const product=config.loopProducts.weekly;let q:any,cancelled=false,renewed=false,posts=0,patches=0; // eslint-disable-line prefer-const -- q is assigned once, after the closures that read it
    const initialStart=new Date(start).toISOString(),initialEnd=new Date(end).toISOString(),renewalStart=initialEnd,renewalEnd=new Date(Date.parse(initialEnd)+30*86400000).toISOString();
    const payment=(id='pay_initial')=>({payload_type:'Payment',payment_id:id,status:'succeeded',currency:'INR',subscription_id:'sub_fixture',subscription_ids:['sub_fixture'],customer:{customer_id:'cus_fixture'},total_amount:279900,tax:29900,checkout_session_id:id==='pay_initial'?'cks_fixture':null,service_periods:[{subscription_id:'sub_fixture',starts_at:id==='pay_initial'?initialStart:renewalStart,ends_at:id==='pay_initial'?initialEnd:renewalEnd}]});
    const metadata=()=>({product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:checkoutRequest,generation:'0',plan:'weekly',quote_id:q.quoteId});
    const subscription=()=>({payload_type:'Subscription',subscription_id:'sub_fixture',product_id:product,quantity:1,currency:'INR',recurring_pre_tax_amount:250000,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:cancelled,status:'active',previous_billing_date:renewed?renewalStart:initialStart,next_billing_date:renewed?renewalEnd:initialEnd,customer:{customer_id:'cus_fixture'},metadata:metadata()});
    const ports:LoopBillingPorts={rpc:async<T>(name:string,args:Record<string,unknown>)=>await rpc(name,args) as T,provider:async(endpoint,body,method)=>{
      if(endpoint===`products/${product}`)return{product_id:product,is_recurring:true,pricing_mode:'by_currency',price:{type:'recurring_price',price:2900,currency:'USD',payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,tax_inclusive:true}};
      if(endpoint===`products/${product}/localized-prices`)return{items:[{id:'lcp_fixture',product_id:product,mode:'by_currency',currency:'INR',amount:279900,updated_at:initialStart}]};
      if(endpoint==='checkouts/preview')return{billing_country:'IN',currency:'INR',is_byop:false,payment_method_required:true,total_price:279900,current_breakup:{discount:0,total_amount:279900,tax:29900},recurring_breakup:{discount:0,total_amount:279900,tax:29900},product_cart:[{product_id:product,quantity:1,currency:'INR',is_subscription:true,is_usage_based:false,tax_inclusive:true,discount_amount:0,meters:[],addons:[]}],subscriptions:[{product_id:product,amount_due_now:279900,recurring_amount:279900,trial_period_days:0}]};
      if(endpoint==='checkouts'){posts++;expect(body).toMatchObject({billing_currency:'INR',metadata:metadata(),billing_address:{country:'IN'}});return{session_id:'cks_fixture',checkout_url:'https://checkout.dodopayments.com/session/cks_fixture'};}
      if(endpoint==='checkouts/cks_fixture')return{id:'cks_fixture',payment_id:'pay_initial'};
      if(endpoint==='payments/pay_initial')return payment();if(endpoint==='payments/pay_renewal')return payment('pay_renewal');
      if(endpoint==='subscriptions/sub_fixture'){if(method==='PATCH'){patches++;cancelled=true;}return subscription();}
      throw Error('Unplanned provider call');
    }};
    q=await issue();await ready(q);
    expect(q).toMatchObject({currency:'INR',amountMinor:279900,exponent:2});const intent={action:'checkout',requestId:checkoutRequest,expectedGeneration:0,plan:'weekly',quoteId:q.quoteId,consent:true};
    expect(await controlLoopBilling(ports,config,owner,session,intent)).toMatchObject({pricing:{currency:'INR',amountMinor:279900}});await controlLoopBilling(ports,config,owner,session,intent);expect(posts).toBe(0);
    await applyLoopBillingWebhook(ports,config,{type:'payment.succeeded',created:epoch,data:payment()},'inr_initial');
    const statusV2=await controlLoopBilling(ports,config,owner,session,{action:'status',contractVersion:2});expect(statusV2).toMatchObject({subscription:{pricing:{currency:'INR',amountMinor:279900}}});
    await expect(controlLoopBilling(ports,config,owner,session,{action:'status'})).rejects.toMatchObject({code:'LOOP_BILLING_CONTRACT_REQUIRED'});
    renewed=true;const rotated={...config,loopProducts:{...config.loopProducts,weekly:'pdt_new_catalogue'}};
    await applyLoopBillingWebhook(ports,rotated,{type:'subscription.renewed',created:epoch+10,data:{...subscription(),payment_id:'pay_renewal'}},'inr_renewal');
    expect((await status()).subscription.pricing).toMatchObject({currency:'INR',amountMinor:279900,productId:product});
    const cancelIntent={action:'cancel',requestId:randomUUID(),expectedGeneration:0,expectedSubscriptionId:'sub_fixture',expectedVersion:(await status()).subscription.revision,consent:true,contractVersion:2};
    expect(await controlLoopBilling(ports,rotated,owner,session,cancelIntent)).toMatchObject({status:'confirmed',subscription:{pricing:{currency:'INR',amountMinor:279900}}});expect(patches).toBe(1);expect((await status()).entitlement.active).toBe(true);
    await applyLoopBillingWebhook(ports,rotated,{type:'refund.succeeded',created:epoch+11,data:{payload_type:'Refund',refund_id:'ref_fixture',payment_id:'pay_initial',status:'succeeded',currency:'INR',amount:279900}},'inr_refund');
    expect((await status()).entitlement.active).toBe(false);expect((await raw('SELECT currency,amount::int FROM jobvance_private.loop_subscription_periods ORDER BY payment_id')).rows).toEqual([{currency:'INR',amount:279900},{currency:'INR',amount:279900}]);
  });
  it.each(['INR','JPY','EUR'])('records actual %s minor units through renewal/cancellation/refund with no USD substitution',async currency=>{
    const q=await issue({p_currency:currency});await ready(q);await apply(q);const initial=await status();expect(initial.subscription.pricing).toMatchObject({quoteId:q.quoteId,currency,amountMinor:q.amountMinor});expect(initial.entitlement).toMatchObject({active:true,maxWeeklyRuns:1});
    const times=(await raw("SELECT (now()+interval '29 days')::text start,(now()+interval '59 days')::text end")).rows[0];
    await apply(q,{p_event:'evt_renew',p_created:epoch+10,p_payment:'pay_renew',p_period_start:times.start,p_valid_until:times.end});
    const periods=(await raw('SELECT currency,amount::int,quote_id FROM jobvance_private.loop_subscription_periods ORDER BY payment_id')).rows;expect(periods).toHaveLength(2);expect(periods.every(row=>row.currency===currency&&row.amount===q.amountMinor&&row.quote_id===q.quoteId)).toBe(true);
    const id=randomUUID(),version=(await status()).subscription.revision;await rpc('job_loop_billing_cancel_claim',{p_user:owner,p_auth_session:session,p_generation:0,p_request:id,p_mode:'live',p_subscription:'sub_fixture',p_version:version});await rpc('job_loop_billing_cancel_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:id,p_mode:'live',p_subscription:'sub_fixture',p_confirmed:true});expect((await status()).entitlement.active).toBe(true);
    await apply(q,{p_event:'evt_refund',p_created:epoch+11,p_revoked:true,p_cancel_at_period_end:true});expect((await status()).entitlement.active).toBe(false);await apply(q,{p_event:'evt_late_active',p_created:epoch+12});expect((await status()).entitlement.active).toBe(false);
  });
  it.each([{p_currency:'USD'},{p_paid_amount:2900},{p_quote:null},{p_currency:'JPY'},{p_quote:'00000000-0000-4000-8000-000000000001'}])('rejects another currency, price or quote authority %j',async changes=>{
    const q=await issue();await ready(q);await expect(apply(q,changes)).rejects.toThrow(/LOOP_BILLING_PAYMENT_CONFLICT|LOOP_BILLING_QUOTE_CONFLICT/);expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods')).rows[0].n).toBe(0);
  });
  it('cannot downgrade a quoted order through original v1 checkout or payment RPC',async()=>{
    const q=await issue();await ready(q);await expect(rpc('job_loop_billing_checkout_claim',{p_user:owner,p_auth_session:session,p_generation:0,p_request:checkoutRequest,p_mode:'live',p_plan:'weekly',p_product:q.productId})).rejects.toThrow('LOOP_BILLING_QUOTE_CONFLICT');
    const input=event(q);delete input.p_quote;delete input.p_currency;await expect(rpc('job_loop_billing_apply_event',input)).rejects.toThrow('LOOP_BILLING_QUOTE_CONFLICT');
  });
  it('retains legitimate unquoted v1 USD checkout and exact USD payment, with an explicit USD pricing receipt',async()=>{
    const product='pdt_legacy';await rpc('job_loop_billing_checkout_claim',{p_user:owner,p_auth_session:session,p_generation:0,p_request:checkoutRequest,p_mode:'live',p_plan:'weekly',p_product:product});await rpc('job_loop_billing_checkout_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:checkoutRequest,p_session:'cks_fixture',p_url:'https://checkout.dodopayments.com/session/cks_fixture'});
    const input=event({mode:'live',plan:'weekly',productId:product,amountMinor:2900,quoteId:null,currency:'USD'});delete input.p_quote;delete input.p_currency;await rpc('job_loop_billing_apply_event',input);
    const view=await status();expect(view.subscription.pricing).toMatchObject({quoteId:null,currency:'USD',amountMinor:2900,exponent:2});expect(view.entitlement.active).toBe(true);
    const order=await rpc('job_loop_billing_order',{p_user:owner,p_request:checkoutRequest,p_mode:'live'});expect(order.pricing).toMatchObject({quoteId:null,currency:'USD',amountMinor:2900});
  });
  it('does not grant Live access from Test localized payment and exposes no candidate data in monetary receipts',async()=>{
    const q=await issue({p_mode:'test'});await ready(q);await apply(q);const view=await status('test');expect(view.entitlement.active).toBe(false);expect(view.subscription.pricing).toMatchObject({mode:'test',currency:'INR'});expect(JSON.stringify(view)).not.toMatch(/email|access_token|cvText|claims/i);
  });
  it('rejects changed original payment and cross-mode/owner replay while exact duplicate stays idempotent',async()=>{
    const q=await issue();await ready(q);await apply(q);expect(await apply(q)).toMatchObject({duplicate:true});await expect(apply(q,{p_currency:'USD'})).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');await expect(apply(q,{p_mode:'test'})).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
    await expect(raw("UPDATE jobvance_private.loop_subscription_periods SET currency='JPY'")).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');
  });
  it('retains service-only RPCs and internal helpers with fixed search paths',async()=>{
    for(const role of['anon','authenticated'])for(const name of['job_loop_billing_quote_candidate(uuid,uuid,bigint,uuid,text,text,text,text)','job_loop_billing_checkout_claim_v2(uuid,uuid,bigint,uuid,text,text,text,uuid)','job_loop_billing_status_v2(uuid,uuid,text)'])expect((await raw('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,name])).rows[0].allowed).toBe(false);
    for(const role of['anon','authenticated','service_role'])expect((await raw("SELECT has_function_privilege($1,'jobvance_private.guard_loop_price_binding()','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
    expect((await raw("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN('job_loop_billing_quote_issue','job_loop_billing_quote_read','job_loop_billing_checkout_claim_v2','job_loop_billing_status_v2') AND p.proconfig=ARRAY['search_path=\"\"']")).rows[0].n).toBe(4);
  });
});
