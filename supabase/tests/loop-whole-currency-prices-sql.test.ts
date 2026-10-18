// @vitest-environment node
// Catalogue transition only: real SQL, isolated fixture owners and no provider writes.
import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { applyLoopBillingWebhook,controlLoopBilling,type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';
import { LOOP_BILLING_PRODUCT,loopBillingConfiguration } from '../functions/_shared/loop-billing.ts';
import { dodoEnvironment } from './dodo-fixtures';

let db:PGlite,owner:string,session:string,start:string,end:string,epoch:number;
const v1='loop-local-2026-10-18-v1',v2='loop-local-2026-10-18-v2';
const migration='20261018105918_job_loop_whole_currency_prices.sql';
const prices={USD:[2900,5900,9900],EUR:[2600,5200,8800],GBP:[2200,4400,7400],INR:[299900,599900,899900],AED:[10900,21900,35900],CAD:[4100,8400,13900],AUD:[4200,8500,13900],SGD:[3700,7500,12900],JPY:[4999,8999,15999]};
const raw=(sql:string,args:unknown[]=[])=>db.query<Record<string,any>>(sql,args);
async function rpc(name:string,args:Record<string,unknown>){await db.exec('SET ROLE service_role');try{return(await raw('SELECT '+name+'('+Object.keys(args).map((key,index)=>key+'=>$'+(index+1)).join(',')+') r',Object.values(args))).rows[0]?.r;}finally{await db.exec('RESET ROLE');}}
const activate=async()=>db.exec(await readFile(new URL('../migrations/'+migration,import.meta.url),'utf8'));
const base=(requestId=randomUUID(),changes:Record<string,unknown>={})=>({p_user:owner,p_auth_session:session,p_generation:0,p_request:requestId,p_mode:'live',p_plan:'weekly',p_country:'IN',p_currency:'INR',...changes});
async function quote(args=base()){
  const c=(await rpc('job_loop_billing_quote_candidate',args)).catalog;
  return rpc('job_loop_billing_quote_issue',{...args,p_catalog_version:c.catalogVersion,p_product:c.productId,p_rule:args.p_currency==='USD'?null:'lcp_whole',p_provider_revision:'a'.repeat(64),p_preview_hash:'b'.repeat(64),p_initial_amount:c.amountMinor,p_recurring_amount:c.amountMinor});
}
const claim=(q:Record<string,any>,requestId:string)=>rpc('job_loop_billing_checkout_claim_v2',{p_user:owner,p_auth_session:session,p_generation:0,p_request:requestId,p_mode:q.mode,p_plan:q.plan,p_product:q.productId,p_quote:q.quoteId});
async function ready(q:Record<string,any>,requestId:string){await claim(q,requestId);await rpc('job_loop_billing_checkout_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:requestId,p_session:'cks_whole',p_url:'https://checkout.dodopayments.com/session/cks_whole'});}
const apply=(q:Record<string,any>,requestId:string,changes:Record<string,unknown>={})=>rpc('job_loop_billing_apply_event_v2',{p_user:owner,p_request:requestId,p_mode:'live',p_plan:q.plan,p_product:q.productId,p_session:'cks_whole',p_subscription:'sub_whole',p_customer:'cus_whole',p_status:'active',p_period_start:start,p_valid_until:end,p_cancel_at_period_end:false,p_event:'evt_whole',p_created:epoch,p_revoked:false,p_payload_hash:'c'.repeat(64),p_payment:'pay_whole',p_paid_amount:q.amountMinor,p_grace_until:null,p_quote:q.quoteId,p_currency:q.currency,...changes});
const status=()=>rpc('job_loop_billing_status_v2',{p_user:owner,p_auth_session:session,p_mode:'live'});

beforeAll(async()=>{
  db=new PGlite();await db.exec(await checkLoopSchema());await db.exec('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz)');
  for(const name of['20261017122000_job_loop_dodo_entitlements.sql','20261018073501_job_loop_subscription_lifecycle.sql','20261018091955_job_loop_refund_renewal_safety.sql','20261018095409_job_loop_localized_price_quotes.sql','20261018101948_job_loop_provider_accounting.sql'])await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec("RESET ROLE;TRUNCATE auth.users CASCADE;TRUNCATE jobvance_private.loop_billing_events;DELETE FROM jobvance_private.loop_price_revisions WHERE catalog_version='"+v2+"';UPDATE jobvance_private.loop_price_revisions SET active=true WHERE catalog_version='"+v1+"'");
  owner=randomUUID();session=randomUUID();await raw('INSERT INTO auth.users(id) VALUES($1)',[owner]);await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,owner]);await raw('SELECT job_loop_open_record($1)',[owner]);
  const t=(await raw("SELECT (now()-interval '1 day')::text start,(now()+interval '29 days')::text end,extract(epoch FROM now())::bigint-100 epoch")).rows[0];start=t.start;end=t.end;epoch=Number(t.epoch);
});

describe('whole-unit new price admission with immutable historical prices',()=>{
  it.each(Object.keys(prices))('issues all three exact whole-unit %s plans in both modes after activation',async currency=>{
    await activate();for(const mode of['test','live'])for(const[index,plan]of['weekly','three_weekly','daily'].entries()){
      const q=await quote(base(randomUUID(),{p_mode:mode,p_plan:plan,p_currency:currency}));expect(q).toMatchObject({catalogVersion:v2,currency,amountMinor:prices[currency as keyof typeof prices][index],exponent:currency==='JPY'?0:2});
      // Historical v2 authority stays pinned when current product/catalogue changes.
      expect(q.amountMinor%10**q.exponent).toBe(0);if(currency==='INR')expect((q.amountMinor/100)%1000).toBe(999);
    }
  });
  it('retires v1 only for new quote issuance and keeps all old revision fields intact',async()=>{
    const before=(await raw('SELECT to_jsonb(p)-\'active\' row FROM jobvance_private.loop_price_revisions p WHERE catalog_version=$1 ORDER BY mode,plan,currency',[v1])).rows;
    await activate();const after=(await raw('SELECT to_jsonb(p)-\'active\' row FROM jobvance_private.loop_price_revisions p WHERE catalog_version=$1 ORDER BY mode,plan,currency',[v1])).rows;expect(after).toEqual(before);
    expect((await raw('SELECT catalog_version,active,count(*)::int n FROM jobvance_private.loop_price_revisions GROUP BY catalog_version,active ORDER BY catalog_version')).rows).toEqual([{catalog_version:v1,active:false,n:54},{catalog_version:v2,active:true,n:54}]);
    const old=base();await expect(rpc('job_loop_billing_quote_issue',{...old,p_catalog_version:v1,p_product:'pdt_0NpzVnWkzvNbKUPtHzZGo',p_rule:'lcp_old',p_provider_revision:'a'.repeat(64),p_preview_hash:'b'.repeat(64),p_initial_amount:279900,p_recurring_amount:279900})).rejects.toThrow('LOOP_BILLING_QUOTE_INVALID');
  });
  it('preserves an existing v1 quote and its original ready-checkout recovery without silently using v2 money',async()=>{
    const originalArgs=base(),q=await quote(originalArgs),requestId=randomUUID();await ready(q,requestId);const orderBefore=(await raw('SELECT to_jsonb(o) row FROM jobvance_private.loop_billing_orders o')).rows;
    await activate();expect((await rpc('job_loop_billing_quote_candidate',originalArgs)).quote).toEqual(q);expect(await rpc('job_loop_billing_quote_read',{p_user:owner,p_auth_session:session,p_generation:0,p_mode:'live',p_quote:q.quoteId})).toEqual(q);
    expect(await claim(q,requestId)).toMatchObject({creationClaimAcquired:false,pricing:{catalogVersion:v1,currency:'INR',amountMinor:279900}});expect((await raw('SELECT to_jsonb(o) row FROM jobvance_private.loop_billing_orders o')).rows).toEqual(orderBefore);
    expect(await quote()).toMatchObject({catalogVersion:v2,currency:'INR',amountMinor:299900});
  });
  it('preserves already-paid v1 access, actual paid amounts, renewal, cancellation and refund after v2 activation',async()=>{
    const q=await quote(),requestId=randomUUID();await ready(q,requestId);await apply(q,requestId);const before=(await raw('SELECT to_jsonb(s) row FROM jobvance_private.loop_subscriptions s')).rows,periodBefore=(await raw('SELECT to_jsonb(p) row FROM jobvance_private.loop_subscription_periods p')).rows;
    await activate();expect((await raw('SELECT to_jsonb(s) row FROM jobvance_private.loop_subscriptions s')).rows).toEqual(before);expect((await raw('SELECT to_jsonb(p) row FROM jobvance_private.loop_subscription_periods p')).rows).toEqual(periodBefore);expect((await status()).entitlement.active).toBe(true);
    const times=(await raw("SELECT (now()+interval '29 days')::text start,(now()+interval '59 days')::text end")).rows[0];await apply(q,requestId,{p_event:'evt_old_renew',p_created:epoch+1,p_payment:'pay_old_renew',p_period_start:times.start,p_valid_until:times.end});
    await expect(apply(q,requestId,{p_event:'evt_wrong_v2_amount',p_created:epoch+2,p_payment:'pay_wrong_new_price',p_paid_amount:299900,p_period_start:times.start,p_valid_until:times.end})).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');
    const view=await status();expect(view.subscription.pricing).toMatchObject({catalogVersion:v1,currency:'INR',amountMinor:279900});const cancel=randomUUID();await rpc('job_loop_billing_cancel_claim',{p_user:owner,p_auth_session:session,p_generation:0,p_request:cancel,p_mode:'live',p_subscription:'sub_whole',p_version:view.subscription.revision});await rpc('job_loop_billing_cancel_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:cancel,p_mode:'live',p_subscription:'sub_whole',p_confirmed:true});expect((await status()).entitlement.active).toBe(true);
    await apply(q,requestId,{p_event:'evt_old_refund',p_created:epoch+3,p_revoked:true,p_cancel_at_period_end:true});expect((await status()).entitlement.active).toBe(false);expect((await raw('SELECT currency,amount::int FROM jobvance_private.loop_subscription_periods')).rows).toEqual([{currency:'INR',amount:279900},{currency:'INR',amount:279900}]);
  });
  it('pins new v2 actual payments to the new quoted total and rejects the old v1 amount',async()=>{
    await activate();const q=await quote(),requestId=randomUUID();await ready(q,requestId);await expect(apply(q,requestId,{p_paid_amount:279900})).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');await apply(q,requestId);expect((await status()).subscription.pricing).toMatchObject({catalogVersion:v2,currency:'INR',amountMinor:299900});
  });
  it('recovers a historical v2 ready checkout and reconciles exact payment after current products rotate',async()=>{
    await activate();const product='pdt_0NpzVnWkzvNbKUPtHzZGo',requestId=randomUUID(),q=await quote();await ready(q,requestId);
    const environment=dodoEnvironment({JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:'pdt_current_v3_weekly',DODO_PRODUCT_LOOP_ACTIVE:'pdt_current_v3_active',DODO_PRODUCT_LOOP_DAILY:'pdt_current_v3_daily'}),config={...loopBillingConfiguration(key=>environment[key])!,mode:'live' as const};
    const from=new Date(start).toISOString(),until=new Date(end).toISOString();
    const payment=()=>({payload_type:'Payment',payment_id:'pay_whole',status:'succeeded',currency:'INR',subscription_id:'sub_whole',subscription_ids:['sub_whole'],customer:{customer_id:'cus_whole'},total_amount:299900,tax:0,checkout_session_id:'cks_whole',settlement_currency:'USD',settlement_amount:3025,settlement_tax:0,service_periods:[{subscription_id:'sub_whole',starts_at:from,ends_at:until}]});
    const ports:LoopBillingPorts={rpc:async<T>(name:string,args:Record<string,unknown>)=>await rpc(name,args) as T,provider:async(endpoint,body)=>{
      if(endpoint==='checkouts/cks_whole')return{id:'cks_whole',payment_id:'pay_whole'};if(endpoint==='payments/pay_whole')return payment();
      if(endpoint==='subscriptions/sub_whole')return{payload_type:'Subscription',subscription_id:'sub_whole',product_id:product,quantity:1,currency:'USD',recurring_pre_tax_amount:3120,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:false,status:'active',previous_billing_date:from,next_billing_date:until,customer:{customer_id:'cus_whole'},metadata:{product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:requestId,generation:'0',plan:'weekly',quote_id:q.quoteId}};
      throw Error('Unplanned provider boundary');
    }};
    const intent={action:'checkout',requestId,expectedGeneration:0,plan:'weekly',quoteId:q.quoteId,consent:true};expect(await controlLoopBilling(ports,config,owner,session,intent)).toMatchObject({url:'https://checkout.dodopayments.com/session/cks_whole',pricing:{catalogVersion:v2,currency:'INR',amountMinor:299900}});await controlLoopBilling(ports,config,owner,session,intent);
    await applyLoopBillingWebhook(ports,config,{type:'payment.succeeded',created:epoch,data:payment()},'whole_v2_initial');expect((await status()).subscription.pricing).toMatchObject({catalogVersion:v2,currency:'INR',amountMinor:299900});expect((await status()).entitlement).toMatchObject({active:true,plan:'weekly',maxWeeklyRuns:1});expect((await raw('SELECT currency,amount::int FROM jobvance_private.loop_subscription_periods')).rows).toEqual([{currency:'INR',amount:299900}]);
  });
  it('leaves both applied monetary authority migrations byte-for-byte unchanged',async()=>{
    for(const[name,hash]of[['20261018095409_job_loop_localized_price_quotes.sql','e219b605684eaec209f1cc8f50e7e5957138c1111fff341f6430608e20e7557c'],['20261018101948_job_loop_provider_accounting.sql','3dc4a02f4a1491283db4b3dd09bdb34797df04c4554e006071fadf49066b89d8']])expect(createHash('sha256').update(await readFile(new URL('../migrations/'+name,import.meta.url))).digest('hex')).toBe(hash);
  });
});
