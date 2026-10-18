// @vitest-environment node
// Provider accounting metadata cannot create or convert paid service proof.
import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { applyLoopBillingWebhook,controlLoopBilling,type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';
import { LOOP_BILLING_PRODUCT,loopBillingConfiguration } from '../functions/_shared/loop-billing.ts';
import { dodoEnvironment } from './dodo-fixtures';

let db:PGlite,owner:string,session:string,request:string,q:Record<string,any>,start:string,end:string,epoch:number;
const raw=(sql:string,args:unknown[]=[])=>db.query<Record<string,any>>(sql,args);
async function rpc(name:string,args:Record<string,unknown>){
  if(!/^job_loop_billing_[a-z_0-9]+$/.test(name))throw Error('Unexpected SQL function');
  await db.exec('SET ROLE service_role');try{return(await raw('SELECT '+name+'('+Object.keys(args).map((key,index)=>key+'=>$'+(index+1)).join(',')+') r',Object.values(args))).rows[0]?.r;}finally{await db.exec('RESET ROLE');}
}
const bindArgs=(changes:Record<string,unknown>={})=>({p_user:owner,p_request:request,p_mode:'live',p_quote:q.quoteId,p_subscription:'sub_accounting',p_customer:'cus_accounting',p_payment:'pay_accounting',p_currency:'INR',p_amount:279900,p_settlement_currency:'USD',p_settlement_amount:2834,p_settlement_tax:0,p_accounting_currency:'USD',p_accounting_amount:2947,p_period_start:start,p_valid_until:end,...changes});
const bind=(changes:Record<string,unknown>={})=>rpc('job_loop_billing_accounting_bind',bindArgs(changes));
const order=()=>rpc('job_loop_billing_order',{p_user:owner,p_request:request,p_mode:'live'});
const entitlement=()=>rpc('job_loop_billing_entitlement',{p_user:owner});
const apply=(changes:Record<string,unknown>={})=>rpc('job_loop_billing_apply_event_v2',{p_user:owner,p_request:request,p_mode:'live',p_plan:'weekly',p_product:q.productId,p_session:'cks_accounting',p_subscription:'sub_accounting',p_customer:'cus_accounting',p_status:'active',p_period_start:start,p_valid_until:end,p_cancel_at_period_end:false,p_event:'evt_accounting',p_created:epoch,p_revoked:false,p_payload_hash:'d'.repeat(64),p_payment:'pay_accounting',p_paid_amount:279900,p_grace_until:null,p_quote:q.quoteId,p_currency:'INR',...changes});

beforeAll(async()=>{
  db=new PGlite();await db.exec(await checkLoopSchema());await db.exec('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz)');
  for(const name of['20261017122000_job_loop_dodo_entitlements.sql','20261018073501_job_loop_subscription_lifecycle.sql','20261018091955_job_loop_refund_renewal_safety.sql','20261018095409_job_loop_localized_price_quotes.sql','20261018101948_job_loop_provider_accounting.sql'])await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec('RESET ROLE;TRUNCATE auth.users CASCADE;TRUNCATE jobvance_private.loop_billing_events');owner=randomUUID();session=randomUUID();request=randomUUID();
  await raw('INSERT INTO auth.users(id) VALUES($1)',[owner]);await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,owner]);await raw('SELECT job_loop_open_record($1)',[owner]);await raw('UPDATE job_loop_pilot_users SET active=false WHERE user_id=$1',[owner]);
  q=await rpc('job_loop_billing_quote_issue',{p_user:owner,p_auth_session:session,p_generation:0,p_request:randomUUID(),p_mode:'live',p_plan:'weekly',p_country:'IN',p_currency:'INR',p_catalog_version:'loop-local-2026-10-18-v1',p_product:'pdt_0NpzVnWkzvNbKUPtHzZGo',p_rule:'lcp_accounting',p_provider_revision:'a'.repeat(64),p_preview_hash:'b'.repeat(64),p_initial_amount:279900,p_recurring_amount:279900});
  await rpc('job_loop_billing_checkout_claim_v2',{p_user:owner,p_auth_session:session,p_generation:0,p_request:request,p_mode:'live',p_plan:'weekly',p_product:q.productId,p_quote:q.quoteId});
  await rpc('job_loop_billing_checkout_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:request,p_session:'cks_accounting',p_url:'https://checkout.dodopayments.com/session/cks_accounting'});
  const t=(await raw("SELECT (now()-interval '1 day')::text start,(now()+interval '29 days')::text end,extract(epoch FROM now())::bigint-100 epoch")).rows[0];start=t.start;end=t.end;epoch=Number(t.epoch);
});

describe('immutable provider accounting evidence separate from customer payment',()=>{
  it('runs real orchestration through SQL with USD subscription accounting, local paid cycles, unknown later accounting cancellation and old-payment refund',async()=>{
    const environment=dodoEnvironment({JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:q.productId,DODO_PRODUCT_LOOP_ACTIVE:'pdt_active',DODO_PRODUCT_LOOP_DAILY:'pdt_daily'});
    const config={...loopBillingConfiguration(key=>environment[key])!,mode:'live' as const};
    const initialStart=new Date(start).toISOString(),initialEnd=new Date(end).toISOString(),renewStart=initialEnd,renewEnd=new Date(Date.parse(initialEnd)+30*86400000).toISOString();
    let renewed=false,accountingAmount=2947,cancelled=false,patches=0;
    const payment=(id='pay_accounting')=>({payload_type:'Payment',payment_id:id,status:'succeeded',currency:'INR',subscription_id:'sub_accounting',subscription_ids:['sub_accounting'],customer:{customer_id:'cus_accounting'},total_amount:279900,tax:29900,checkout_session_id:id==='pay_accounting'?'cks_accounting':null,settlement_currency:'USD',settlement_amount:id==='pay_accounting'?2834:2840,settlement_tax:0,service_periods:[{subscription_id:'sub_accounting',starts_at:id==='pay_accounting'?initialStart:renewStart,ends_at:id==='pay_accounting'?initialEnd:renewEnd}]});
    const source=()=>({payload_type:'Subscription',subscription_id:'sub_accounting',product_id:q.productId,quantity:1,currency:'USD',recurring_pre_tax_amount:accountingAmount,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:cancelled,status:'active',previous_billing_date:renewed?renewStart:initialStart,next_billing_date:renewed?renewEnd:initialEnd,customer:{customer_id:'cus_accounting'},metadata:{product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly',quote_id:q.quoteId}});
    const ports:LoopBillingPorts={rpc:async<T>(name:string,args:Record<string,unknown>)=>await rpc(name,args) as T,provider:async(endpoint,_body,method)=>{
      if(endpoint==='subscriptions/sub_accounting'){if(method==='PATCH'){patches++;cancelled=true;}return source();}
      if(endpoint==='checkouts/cks_accounting')return{id:'cks_accounting',payment_id:'pay_accounting'};
      if(endpoint==='payments/pay_accounting')return payment();if(endpoint==='payments/pay_cycle_2')return payment('pay_cycle_2');
      throw Error('Unexpected network boundary');
    }};
    await applyLoopBillingWebhook(ports,config,{type:'payment.succeeded',created:epoch,data:payment()},'accounting_initial');
    const original=(await order()).providerAccounting[0];expect(original).toMatchObject({currency:'INR',amountMinor:279900,accountingCurrency:'USD',accountingAmountMinor:2947,settlementAmountMinor:2834});expect((await entitlement()).active).toBe(true);
    renewed=true;accountingAmount=2995;await applyLoopBillingWebhook(ports,config,{type:'subscription.renewed',created:epoch+1,data:{...source(),payment_id:'pay_cycle_2'}},'accounting_renewal');
    expect((await order()).providerAccounting).toHaveLength(2);expect((await order()).providerAccounting[0]).toEqual(original);expect(new Date((await entitlement()).validUntil).toISOString()).toBe(renewEnd);
    accountingAmount=3010;const status=await rpc('job_loop_billing_status_v2',{p_user:owner,p_auth_session:session,p_mode:'live'});
    expect(JSON.stringify(status)).not.toMatch(/providerAccounting|accountingAmountMinor|settlementAmountMinor/);
    const cancel=await controlLoopBilling(ports,config,owner,session,{action:'cancel',requestId:randomUUID(),expectedGeneration:0,expectedSubscriptionId:'sub_accounting',expectedVersion:status.subscription.revision,consent:true,contractVersion:2});
    expect(cancel).toMatchObject({status:'confirmed',subscription:{cancelAtPeriodEnd:true,pricing:{currency:'INR',amountMinor:279900}}});expect(patches).toBe(1);expect((await order()).providerAccounting).toHaveLength(2);
    await applyLoopBillingWebhook(ports,config,{type:'refund.succeeded',created:epoch+2,data:{payload_type:'Refund',refund_id:'ref_original_accounting',payment_id:'pay_accounting',status:'succeeded',currency:'INR',amount:279900}},'accounting_original_refund');
    expect((await entitlement()).active).toBe(false);expect((await order()).providerAccounting).toHaveLength(2);expect((await order()).providerAccounting[0]).toEqual(original);
    expect((await raw('SELECT currency,amount::int FROM jobvance_private.loop_subscription_periods ORDER BY payment_id')).rows).toEqual([{currency:'INR',amount:279900},{currency:'INR',amount:279900}]);
  });
  it('recovers an anchored old paid proof after interruption and unseen current accounting without granting or binding the newer cycle',async()=>{
    const environment=dodoEnvironment({JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:q.productId,DODO_PRODUCT_LOOP_ACTIVE:'pdt_active',DODO_PRODUCT_LOOP_DAILY:'pdt_daily'}),config={...loopBillingConfiguration(key=>environment[key])!,mode:'live' as const};
    const oldStart=new Date(start).toISOString(),oldEnd=new Date(end).toISOString(),futureEnd=new Date(Date.parse(oldEnd)+30*86400000).toISOString();let advanced=false,interrupted=false;
    const payment=(id='pay_accounting')=>({payload_type:'Payment',payment_id:id,status:'succeeded',currency:'INR',subscription_id:'sub_accounting',subscription_ids:['sub_accounting'],customer:{customer_id:'cus_accounting'},total_amount:279900,tax:29900,checkout_session_id:'cks_accounting',settlement_currency:'USD',settlement_amount:2834,settlement_tax:0,service_periods:[{subscription_id:'sub_accounting',starts_at:oldStart,ends_at:oldEnd}]});
    const source=()=>({payload_type:'Subscription',subscription_id:'sub_accounting',product_id:q.productId,quantity:1,currency:'USD',recurring_pre_tax_amount:advanced?2995:2947,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:false,status:'active',previous_billing_date:advanced?oldEnd:oldStart,next_billing_date:advanced?futureEnd:oldEnd,customer:{customer_id:'cus_accounting'},metadata:{product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly',quote_id:q.quoteId}});
    const ports:LoopBillingPorts={rpc:async<T>(name:string,args:Record<string,unknown>)=>{
      if(name==='job_loop_billing_apply_event_v2'&&!interrupted){interrupted=true;throw Error('Isolated interruption after accounting evidence but before paid projection');}
      return await rpc(name,args) as T;
    },provider:async endpoint=>{
      if(endpoint==='subscriptions/sub_accounting')return source();if(endpoint==='checkouts/cks_accounting')return{id:'cks_accounting',payment_id:'pay_accounting'};
      if(endpoint==='payments/pay_accounting')return payment();if(endpoint==='payments/pay_unanchored')return payment('pay_unanchored');throw Error('Unexpected provider boundary');
    }};
    const event={type:'payment.succeeded',created:epoch,data:payment()};
    await expect(applyLoopBillingWebhook(ports,config,event,'accounting_interrupted')).rejects.toThrow('Isolated interruption');
    const original=(await order()).providerAccounting[0];expect(original.accountingAmountMinor).toBe(2947);expect((await entitlement()).active).toBe(false);expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods')).rows[0].n).toBe(0);
    advanced=true;await applyLoopBillingWebhook(ports,config,event,'accounting_interrupted');
    expect((await order()).providerAccounting).toEqual([original]);expect(new Date((await entitlement()).validUntil).toISOString()).toBe(oldEnd);expect((await raw('SELECT currency,amount::int,ends_at FROM jobvance_private.loop_subscription_periods')).rows).toHaveLength(1);
    await expect(applyLoopBillingWebhook(ports,config,{type:'payment.succeeded',created:epoch+1,data:payment('pay_unanchored')},'accounting_unanchored_late')).rejects.toThrow();
    expect((await order()).providerAccounting).toEqual([original]);expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods')).rows[0].n).toBe(1);
  });
  it('stores USD2947 accounting and USD2834 settlement beside exact INR279900 without granting access or converting either value',async()=>{
    expect((await entitlement()).active).toBe(false);const a=await bind();
    expect(a).toMatchObject({paymentId:'pay_accounting',quoteId:q.quoteId,currency:'INR',amountMinor:279900,accountingCurrency:'USD',accountingAmountMinor:2947,settlementCurrency:'USD',settlementAmountMinor:2834,settlementTaxMinor:0});
    expect((await entitlement()).active).toBe(false);expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_subscriptions')).rows[0].n).toBe(0);expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_subscription_periods')).rows[0].n).toBe(0);
    expect((await order()).providerAccounting).toEqual([a]);expect((await order()).pricing).toMatchObject({currency:'INR',amountMinor:279900});
  });
  it('reuses the same immutable payment evidence exactly',async()=>{
    const a=await bind();expect(await bind()).toEqual(a);expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_provider_accounting')).rows[0].n).toBe(1);
    await expect(raw('UPDATE jobvance_private.loop_provider_accounting SET accounting_amount_minor=1')).rejects.toThrow('LOOP_BILLING_ACCOUNTING_IMMUTABLE');
  });
  it.each([{p_amount:279901},{p_amount:2900},{p_currency:'USD'},{p_mode:'test'},{p_quote:null},{p_quote:'00000000-0000-4000-8000-000000000001'},{p_request:'00000000-0000-4000-8000-000000000001'}])('rejects a quote/order/customer-charge mismatch %j',async changes=>{
    await expect(bind(changes)).rejects.toThrow(/LOOP_BILLING_ACCOUNTING_CONFLICT|LOOP_BILLING_ACCOUNTING_INVALID/);expect((await order()).providerAccounting).toEqual([]);
  });
  it.each([{p_accounting_currency:'INR'},{p_accounting_currency:'EUR'},{p_accounting_amount:0},{p_accounting_amount:-1},{p_accounting_amount:1000000001},{p_payment:'not-payment'},{p_period_start:'infinity'},{p_valid_until:'2000-01-01'}])('rejects malformed or unsupported accounting metadata %j',async changes=>{
    await expect(bind(changes)).rejects.toThrow('LOOP_BILLING_ACCOUNTING_INVALID');
  });
  it.each([{p_accounting_amount:2948},{p_settlement_amount:2800},{p_settlement_tax:1},{p_customer:'cus_other'},{p_subscription:'sub_other'},{p_period_start:'2026-01-01T00:00:00Z',p_valid_until:'2026-02-01T00:00:00Z'}])('never rewrites existing payment evidence after a later API snapshot %j',async changes=>{
    await bind();await expect(bind(changes)).rejects.toThrow('LOOP_BILLING_ACCOUNTING_CONFLICT');expect((await order()).providerAccounting[0]).toMatchObject({accountingAmountMinor:2947,settlementAmountMinor:2834,settlementTaxMinor:0});
  });
  it('appends later paid-cycle accounting while the original anchor and quoted customer price remain unchanged',async()=>{
    const original=await bind();await apply();const paidUntil=(await entitlement()).validUntil;
    const times=(await raw("SELECT (now()+interval '29 days')::text start,(now()+interval '59 days')::text end")).rows[0];
    const next=await bind({p_payment:'pay_cycle_2',p_period_start:times.start,p_valid_until:times.end,p_accounting_amount:2995,p_settlement_amount:2840});
    expect((await order()).providerAccounting).toEqual([original,next]);expect((await entitlement()).validUntil).toBe(paidUntil);
    await apply({p_event:'evt_cycle_2',p_created:epoch+1,p_payment:'pay_cycle_2',p_period_start:times.start,p_valid_until:times.end});
    expect(new Date((await entitlement()).validUntil).toISOString()).toBe(new Date(times.end).toISOString());
    const periods=(await raw('SELECT currency,amount::int FROM jobvance_private.loop_subscription_periods')).rows;expect(periods).toEqual([{currency:'INR',amount:279900},{currency:'INR',amount:279900}]);
    expect((await order()).pricing).toMatchObject({currency:'INR',amountMinor:279900});
    await apply({p_event:'evt_old_payment_refund',p_created:epoch+2,p_revoked:true});expect((await entitlement()).active).toBe(false);expect((await order()).providerAccounting[0]).toEqual(original);
  });
  it('never lets an accounting anchor make USD or net settlement amount qualify as the local paid period',async()=>{
    await bind();await expect(apply({p_currency:'USD',p_paid_amount:2947})).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');await expect(apply({p_currency:'USD',p_paid_amount:2834})).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');await expect(apply({p_currency:'INR',p_paid_amount:2834})).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');expect((await entitlement()).active).toBe(false);
    await apply();expect((await entitlement()).active).toBe(true);
  });
  it('rejects evidence inconsistent with an already-recorded paid service period or subscription owner',async()=>{
    await apply();await expect(bind({p_customer:'cus_other'})).rejects.toThrow('LOOP_BILLING_ACCOUNTING_CONFLICT');
    const times=(await raw("SELECT (now()+interval '29 days')::text start,(now()+interval '59 days')::text end")).rows[0];await expect(bind({p_period_start:times.start,p_valid_until:times.end})).rejects.toThrow('LOOP_BILLING_ACCOUNTING_CONFLICT');
    await expect(bind({p_user:randomUUID()})).rejects.toThrow('LOOP_BILLING_ACCOUNTING_CONFLICT');
  });
  it('preserves absence of optional settlement metadata instead of inventing fees, tax or conversion',async()=>{
    const a=await bind({p_settlement_currency:null,p_settlement_amount:null,p_settlement_tax:null});expect(a).toMatchObject({settlementCurrency:null,settlementAmountMinor:null,settlementTaxMinor:null});
  });
  it.each([{p_settlement_currency:null},{p_settlement_amount:null},{p_settlement_currency:null,p_settlement_amount:null,p_settlement_tax:1},{p_settlement_amount:-1},{p_settlement_tax:-1},{p_settlement_currency:'US'}])('rejects incomplete or invalid settlement evidence %j',async changes=>{
    await expect(bind(changes)).rejects.toThrow('LOOP_BILLING_ACCOUNTING_INVALID');
  });
  it('preserves the already-applied quote migration bytes and strict service-only boundaries',async()=>{
    const bytes=await readFile(new URL('../migrations/20261018095409_job_loop_localized_price_quotes.sql',import.meta.url));expect(createHash('sha256').update(bytes).digest('hex')).toBe('e219b605684eaec209f1cc8f50e7e5957138c1111fff341f6430608e20e7557c');
    for(const role of['anon','authenticated'])expect((await raw("SELECT has_function_privilege($1,'job_loop_billing_accounting_bind(uuid,uuid,text,uuid,text,text,text,text,bigint,text,bigint,bigint,text,bigint,timestamptz,timestamptz)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
    for(const role of['anon','authenticated','service_role'])expect((await raw("SELECT has_table_privilege($1,'jobvance_private.loop_provider_accounting','SELECT,INSERT,UPDATE,DELETE') allowed",[role])).rows[0].allowed).toBe(false);
    expect((await raw("SELECT proconfig FROM pg_proc WHERE oid='job_loop_billing_accounting_bind(uuid,uuid,text,uuid,text,text,text,text,bigint,text,bigint,bigint,text,bigint,timestamptz,timestamptz)'::regprocedure")).rows[0].proconfig).toEqual(['search_path=""']);
  });
});
