// @vitest-environment node
// New immutable provider products preserve old checkout/payment authority.
import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { applyLoopBillingWebhook,controlLoopBilling,type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';
import { LOOP_BILLING_PRODUCT,loopBillingConfiguration } from '../functions/_shared/loop-billing.ts';
import { LOOP_LOCAL_PRICE_CATALOG_VERSION } from '../functions/_shared/loop-local-prices.ts';
import { dodoEnvironment } from './dodo-fixtures';

let db:PGlite,owner:string,session:string,start:string,end:string,epoch:number;
const v1='loop-local-2026-10-18-v1',v2='loop-local-2026-10-18-v2',v3='loop-local-2026-10-18-v3',file='20261018111136_job_loop_versioned_price_products.sql';
const raw=(sql:string,args:unknown[]=[])=>db.query<Record<string,any>>(sql,args);
async function rpc(name:string,args:Record<string,unknown>){await db.exec('SET ROLE service_role');try{return(await raw('SELECT '+name+'('+Object.keys(args).map((key,index)=>key+'=>$'+(index+1)).join(',')+') r',Object.values(args))).rows[0]?.r;}finally{await db.exec('RESET ROLE');}}
async function migration(){
  const source=await readFile(new URL('../migrations/'+file,import.meta.url),'utf8');
  expect(source).not.toContain('__PENDING_');return source;
}
const activate=async()=>db.exec(await migration());
const base=(changes:Record<string,unknown>={})=>({p_user:owner,p_auth_session:session,p_generation:0,p_request:randomUUID(),p_mode:'live',p_plan:'weekly',p_country:'IN',p_currency:'INR',...changes});
const candidate=(args=base())=>rpc('job_loop_billing_quote_candidate',args);
async function quote(args=base()){
  const c=(await candidate(args)).catalog;
  return rpc('job_loop_billing_quote_issue',{...args,p_catalog_version:c.catalogVersion,p_product:c.productId,p_rule:args.p_currency==='USD'?null:'lcp_versioned',p_provider_revision:'a'.repeat(64),p_preview_hash:'b'.repeat(64),p_initial_amount:c.amountMinor,p_recurring_amount:c.amountMinor});
}
const claim=(q:Record<string,any>,requestId:string,changes:Record<string,unknown>={})=>rpc('job_loop_billing_checkout_claim_v2',{p_user:owner,p_auth_session:session,p_generation:0,p_request:requestId,p_mode:q.mode,p_plan:q.plan,p_product:q.productId,p_quote:q.quoteId,...changes});
async function ready(q:Record<string,any>,requestId:string){await claim(q,requestId);await rpc('job_loop_billing_checkout_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:requestId,p_session:'cks_versioned',p_url:'https://checkout.dodopayments.com/session/cks_versioned'});}
const apply=(q:Record<string,any>,requestId:string,changes:Record<string,unknown>={})=>rpc('job_loop_billing_apply_event_v2',{p_user:owner,p_request:requestId,p_mode:'live',p_plan:q.plan,p_product:q.productId,p_session:'cks_versioned',p_subscription:'sub_versioned',p_customer:'cus_versioned',p_status:'active',p_period_start:start,p_valid_until:end,p_cancel_at_period_end:false,p_event:'evt_versioned',p_created:epoch,p_revoked:false,p_payload_hash:'c'.repeat(64),p_payment:'pay_versioned',p_paid_amount:q.amountMinor,p_grace_until:null,p_quote:q.quoteId,p_currency:q.currency,...changes});
const status=()=>rpc('job_loop_billing_status_v2',{p_user:owner,p_auth_session:session,p_mode:'live'});
async function withV1Quote(changes:Record<string,unknown>={}){
  await db.exec(`UPDATE jobvance_private.loop_price_revisions SET active=false WHERE catalog_version='${v2}';UPDATE jobvance_private.loop_price_revisions SET active=true WHERE catalog_version='${v1}'`);
  const q=await quote(base(changes));await db.exec(`UPDATE jobvance_private.loop_price_revisions SET active=false WHERE catalog_version='${v1}';UPDATE jobvance_private.loop_price_revisions SET active=true WHERE catalog_version='${v2}'`);return q;
}
async function configV3(){
  const products:Record<string,string>={};for(const plan of['weekly','three_weekly','daily'])products[plan]=(await candidate(base({p_plan:plan}))).catalog.productId;
  const environment=dodoEnvironment({JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:products.weekly,DODO_PRODUCT_LOOP_ACTIVE:products.three_weekly,DODO_PRODUCT_LOOP_DAILY:products.daily});return{...loopBillingConfiguration(key=>environment[key])!,mode:'live' as const};
}
const portsWithoutProvider:LoopBillingPorts={rpc:async<T>(name:string,args:Record<string,unknown>)=>await rpc(name,args) as T,provider:async()=>{throw Error('Historical ready checkout must not contact or reprice provider');}};

beforeAll(async()=>{
  db=new PGlite();await db.exec(await checkLoopSchema());await db.exec('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz)');
  for(const name of['20261017122000_job_loop_dodo_entitlements.sql','20261018073501_job_loop_subscription_lifecycle.sql','20261018091955_job_loop_refund_renewal_safety.sql','20261018095409_job_loop_localized_price_quotes.sql','20261018101948_job_loop_provider_accounting.sql','20261018105918_job_loop_whole_currency_prices.sql'])await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec(`RESET ROLE;TRUNCATE auth.users CASCADE;TRUNCATE jobvance_private.loop_billing_events;DELETE FROM jobvance_private.loop_price_revisions WHERE catalog_version='${v3}';UPDATE jobvance_private.loop_price_revisions SET active=true WHERE catalog_version='${v2}'`);
  owner=randomUUID();session=randomUUID();await raw('INSERT INTO auth.users(id) VALUES($1)',[owner]);await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,owner]);await raw('SELECT job_loop_open_record($1)',[owner]);
  const t=(await raw("SELECT (now()-interval '1 day')::text start,(now()+interval '29 days')::text end,extract(epoch FROM now())::bigint-100 epoch")).rows[0];start=t.start;end=t.end;epoch=Number(t.epoch);
});

describe('new provider product version without repricing existing history',()=>{
  it('appends 54 v3 prices on exactly six new mode/plan products and copies every v2 amount unchanged',async()=>{
    const old=(await raw('SELECT mode,plan,currency,amount_minor::int,exponent,product_id FROM jobvance_private.loop_price_revisions WHERE catalog_version=$1 ORDER BY mode,plan,currency',[v2])).rows;
    await activate();const fresh=(await raw('SELECT mode,plan,currency,amount_minor::int,exponent,product_id FROM jobvance_private.loop_price_revisions WHERE catalog_version=$1 ORDER BY mode,plan,currency',[v3])).rows;expect(fresh).toHaveLength(54);expect(new Set(fresh.map(row=>row.product_id)).size).toBe(6);
    for(let i=0;i<fresh.length;i++){expect({...fresh[i],product_id:old[i].product_id}).toEqual(old[i]);expect(fresh[i].product_id).not.toBe(old[i].product_id);}
    expect((await raw('SELECT catalog_version,active,count(*)::int n FROM jobvance_private.loop_price_revisions GROUP BY catalog_version,active ORDER BY catalog_version')).rows).toEqual([{catalog_version:v1,active:false,n:54},{catalog_version:v2,active:false,n:54},{catalog_version:v3,active:true,n:54}]);
  });
  it('binds new quote and actual paid proof to the new product, rejecting the old product even for the same amount',async()=>{
    const old=(await candidate()).catalog.productId;await activate();const q=await quote(),requestId=randomUUID();expect(q.catalogVersion).toBe(v3);expect(q.productId).not.toBe(old);await expect(claim(q,requestId,{p_product:old})).rejects.toThrow('LOOP_BILLING_QUOTE_CONFLICT');await ready(q,requestId);
    await expect(apply(q,requestId,{p_product:old})).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');await apply(q,requestId);expect((await status()).subscription.pricing).toMatchObject({catalogVersion:v3,productId:q.productId,currency:'INR',amountMinor:299900});
  });
  it('executes fresh current v3 quote, checkout, retry and payment through actual SQL and orchestration on the new product',async()=>{
    await activate();expect(LOOP_LOCAL_PRICE_CATALOG_VERSION).toBe(v3);const config=await configV3(),product=config.loopProducts.weekly,requestId=randomUUID();let q:any,posts=0; // eslint-disable-line prefer-const -- q is assigned once, after the closures that read it
    const from=new Date(start).toISOString(),until=new Date(end).toISOString();
    const payment=()=>({payload_type:'Payment',payment_id:'pay_versioned',status:'succeeded',currency:'INR',subscription_id:'sub_versioned',subscription_ids:['sub_versioned'],customer:{customer_id:'cus_versioned'},total_amount:299900,tax:0,checkout_session_id:'cks_versioned',settlement_currency:'USD',settlement_amount:3025,settlement_tax:0,service_periods:[{subscription_id:'sub_versioned',starts_at:from,ends_at:until}]});
    const ports:LoopBillingPorts={rpc:async<T>(name:string,args:Record<string,unknown>)=>await rpc(name,args) as T,provider:async(endpoint,body)=>{
      if(endpoint===`products/${product}`)return{product_id:product,is_recurring:true,pricing_mode:'by_currency',price:{type:'recurring_price',price:2900,currency:'USD',payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,tax_inclusive:true}};
      if(endpoint===`products/${product}/localized-prices`)return{items:[{id:'lcp_versioned',product_id:product,mode:'by_currency',currency:'INR',amount:299900,updated_at:from}]};
      if(endpoint==='checkouts/preview')return{billing_country:'IN',currency:'INR',is_byop:false,payment_method_required:true,total_price:299900,current_breakup:{discount:0,total_amount:299900,tax:0},recurring_breakup:{discount:0,total_amount:299900,tax:0},product_cart:[{product_id:product,quantity:1,currency:'INR',is_subscription:true,is_usage_based:false,tax_inclusive:true,discount_amount:0,meters:[],addons:[]}],subscriptions:[{product_id:product,amount_due_now:299900,recurring_amount:299900,trial_period_days:0}]};
      if(endpoint==='checkouts'){posts++;expect(body).toMatchObject({product_cart:[{product_id:product,quantity:1}],billing_currency:'INR',metadata:{quote_id:q.quoteId},billing_address:{country:'IN'}});return{session_id:'cks_versioned',checkout_url:'https://checkout.dodopayments.com/session/cks_versioned'};}
      if(endpoint==='checkouts/cks_versioned')return{id:'cks_versioned',payment_id:'pay_versioned'};if(endpoint==='payments/pay_versioned')return payment();
      if(endpoint==='subscriptions/sub_versioned')return{payload_type:'Subscription',subscription_id:'sub_versioned',product_id:product,quantity:1,currency:'USD',recurring_pre_tax_amount:3120,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:false,status:'active',previous_billing_date:from,next_billing_date:until,customer:{customer_id:'cus_versioned'},metadata:{product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:requestId,generation:'0',plan:'weekly',quote_id:q.quoteId}};
      throw Error('Unplanned provider boundary');
    }};
    q=await controlLoopBilling(ports,config,owner,session,{action:'quote',requestId:randomUUID(),expectedGeneration:0,plan:'weekly',country:'IN',currency:'INR'});expect(q).toMatchObject({catalogVersion:v3,amountMinor:299900,currency:'INR'});
    const intent={action:'checkout',requestId,expectedGeneration:0,plan:'weekly',quoteId:q.quoteId,consent:true};await controlLoopBilling(ports,config,owner,session,intent);await controlLoopBilling(ports,config,owner,session,intent);expect(posts).toBe(1);
    await applyLoopBillingWebhook(ports,config,{type:'payment.succeeded',created:epoch,data:payment()},'versioned_v3_initial');expect((await status()).subscription.pricing).toMatchObject({catalogVersion:v3,productId:product,currency:'INR',amountMinor:299900});expect((await status()).entitlement).toMatchObject({active:true,plan:'weekly',maxWeeklyRuns:1});expect((await raw('SELECT currency,amount::int FROM jobvance_private.loop_subscription_periods')).rows).toEqual([{currency:'INR',amount:299900}]);
  });
  it('resumes a v1 fractional-price ready checkout under new product configuration without reading or repricing provider',async()=>{
    const q=await withV1Quote({p_plan:'daily',p_currency:'EUR',p_country:'DE'}),requestId=randomUUID();await ready(q,requestId);await activate();const config=await configV3();expect(config.loopProducts.daily).not.toBe(q.productId);
    expect(await controlLoopBilling(portsWithoutProvider,config,owner,session,{action:'checkout',requestId,expectedGeneration:0,plan:'daily',quoteId:q.quoteId,consent:true})).toMatchObject({url:'https://checkout.dodopayments.com/session/cks_versioned',pricing:{currency:'EUR',amountMinor:8799}});expect((await raw('SELECT product_id FROM jobvance_private.loop_billing_orders')).rows[0].product_id).toBe(q.productId);
  });
  it('resumes an unquoted legacy USD ready checkout with its original product under new configuration',async()=>{
    const old=(await candidate()).catalog.productId,requestId=randomUUID();await rpc('job_loop_billing_checkout_claim',{p_user:owner,p_auth_session:session,p_generation:0,p_request:requestId,p_mode:'live',p_plan:'weekly',p_product:old});await rpc('job_loop_billing_checkout_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:requestId,p_session:'cks_versioned',p_url:'https://checkout.dodopayments.com/session/cks_versioned'});
    await activate();const config=await configV3();expect(config.loopProducts.weekly).not.toBe(old);expect(await controlLoopBilling(portsWithoutProvider,config,owner,session,{action:'checkout',requestId,expectedGeneration:0,plan:'weekly',consent:true})).toMatchObject({url:'https://checkout.dodopayments.com/session/cks_versioned'});expect((await raw('SELECT product_id FROM jobvance_private.loop_billing_orders')).rows[0].product_id).toBe(old);
  });
  it('retains an existing v2 unclaimed quote and cannot rebind it to a new provider product',async()=>{
    const args=base({p_currency:'EUR',p_country:'DE'}),q=await quote(args);await activate();expect((await candidate(args)).quote).toEqual(q);const fresh=await quote(base({p_currency:'EUR',p_country:'DE'}));expect(fresh.amountMinor).toBe(q.amountMinor);expect(fresh.productId).not.toBe(q.productId);await expect(claim(q,randomUUID(),{p_product:fresh.productId})).rejects.toThrow('LOOP_BILLING_QUOTE_CONFLICT');
  });
  it('keeps original v1 paid product and amount through renewal, cancellation and refund after new products become active',async()=>{
    const q=await withV1Quote({p_plan:'daily',p_currency:'EUR',p_country:'DE'}),requestId=randomUUID();await ready(q,requestId);await apply(q,requestId);const before=(await raw('SELECT to_jsonb(s) row FROM jobvance_private.loop_subscriptions s')).rows;await activate();expect((await raw('SELECT to_jsonb(s) row FROM jobvance_private.loop_subscriptions s')).rows).toEqual(before);
    const times=(await raw("SELECT (now()+interval '29 days')::text start,(now()+interval '59 days')::text end")).rows[0];await apply(q,requestId,{p_event:'evt_old_product_renew',p_created:epoch+1,p_payment:'pay_old_product_renew',p_period_start:times.start,p_valid_until:times.end});const view=await status();expect(view.subscription.pricing).toMatchObject({catalogVersion:v1,productId:q.productId,currency:'EUR',amountMinor:8799});
    const id=randomUUID();await rpc('job_loop_billing_cancel_claim',{p_user:owner,p_auth_session:session,p_generation:0,p_request:id,p_mode:'live',p_subscription:'sub_versioned',p_version:view.subscription.revision});await rpc('job_loop_billing_cancel_finalize',{p_user:owner,p_auth_session:session,p_generation:0,p_request:id,p_mode:'live',p_subscription:'sub_versioned',p_confirmed:true});expect((await status()).entitlement.active).toBe(true);await apply(q,requestId,{p_event:'evt_old_product_refund',p_created:epoch+2,p_revoked:true,p_cancel_at_period_end:true});expect((await status()).entitlement.active).toBe(false);expect((await raw('SELECT currency,amount::int FROM jobvance_private.loop_subscription_periods')).rows).toEqual([{currency:'EUR',amount:8799},{currency:'EUR',amount:8799}]);
  });
  it('rolls back catalogue activation if any new mapping reuses a prior provider product',async()=>{
    const old=(await candidate()).catalog.productId,source=await migration(),mapping=/\('live','weekly','([^']+)'\)/.exec(source)![1];await expect(db.exec(source.replace(mapping,old))).rejects.toThrow('LOOP_PRICE_NEW_PRODUCTS_REQUIRED');await db.exec('ROLLBACK');expect((await candidate()).catalog.catalogVersion).toBe(v2);expect((await raw('SELECT count(*)::int n FROM jobvance_private.loop_price_revisions WHERE catalog_version=$1',[v3])).rows[0].n).toBe(0);
  });
  it('does not change any previously applied monetary migration bytes',async()=>{
    for(const[name,hash]of[['20261018095409_job_loop_localized_price_quotes.sql','e219b605684eaec209f1cc8f50e7e5957138c1111fff341f6430608e20e7557c'],['20261018101948_job_loop_provider_accounting.sql','3dc4a02f4a1491283db4b3dd09bdb34797df04c4554e006071fadf49066b89d8'],['20261018105918_job_loop_whole_currency_prices.sql','c02fca8b884304464d4adf82d6220d415541137963b6f487805b213c46fb1c69']])expect(createHash('sha256').update(await readFile(new URL('../migrations/'+name,import.meta.url))).digest('hex')).toBe(hash);
  });
});
