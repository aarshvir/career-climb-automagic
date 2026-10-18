// @vitest-environment node
// Actual edge entrypoints, genuine auth/provider HTTP composition, isolated SDK
// and network substitutes. These do not charge a card or use real credentials.
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { dodoEnvironment, dodoEnvelope, dodoSign } from './dodo-fixtures';
import { LOOP_BILLING_PRODUCT } from '../functions/_shared/loop-billing.ts';
import { LOOP_LOCAL_PRICE_CATALOG_VERSION } from '../functions/_shared/loop-local-prices.ts';
import { parseLoopQuote, storedLoopPrice, verifyLoopPricePreview, verifyLoopPriceRule } from '../functions/_shared/loop-billing-pricing.ts';
import { loopBillingConfiguration } from '../functions/_shared/loop-billing.ts';
type Handler=(req:Request)=>Promise<Response>;
const owner='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
const sub='sub_FixtureLoop',checkout='cks_FixtureLoop',payment='pay_FixtureLoop',customer='cus_FixtureLoop';
const token=`header.${Buffer.from(JSON.stringify({session_id:session})).toString('base64url')}.signature`;
const state=vi.hoisted(()=>({rpcCalls:[] as {name:string,args:Record<string,unknown>}[],sessionValid:true,cancelled:false,replies:{} as Record<string,unknown>,providerReplies:{} as Record<string,unknown>}));
vi.mock('https://esm.sh/@supabase/supabase-js@2.57.4',()=>({createClient:()=>({auth:{getUser:async(value:string)=>({data:{user:value.startsWith('header.')?{id:'11111111-1111-4111-8111-111111111111'}:null},error:null})},rpc:async(name:string,args:Record<string,unknown>)=>{
  state.rpcCalls.push({name,args});
  if(!state.sessionValid && name!=='job_loop_billing_event'&&name!=='job_loop_billing_order'&&name!=='job_loop_billing_apply_event')return{data:null,error:{message:'LOOP_BILLING_SESSION'}};
  const responses:Record<string,unknown>={job_loop_billing_event:{duplicate:false},job_loop_billing_status:{generation:0,subscription:null,checkout:null,entitlement:null},job_loop_billing_checkout_claim:{state:'creating',creationClaimAcquired:true},job_loop_billing_checkout_finalize:{},job_loop_billing_cancel_claim:{creationClaimAcquired:true},job_loop_billing_cancel_finalize:{status:'confirmed'},job_loop_billing_order:{user_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',generation:0,session_id:'cks_FixtureLoop',plan:'weekly',product_id:'pdt_FixtureWeekly'},job_loop_billing_apply_event:{duplicate:false}};
  return{data:state.replies[name]??responses[name],error:null};
}})}));
let env:Record<string,string|undefined>,handlers:Handler[]=[];
const fetches:{url:string,method:string,body:Record<string,unknown>|null}[]=[];
const metadata={product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly'};
const subFixture=()=>({payload_type:'Subscription',subscription_id:sub,product_id:'pdt_FixtureWeekly',quantity:1,currency:'USD',recurring_pre_tax_amount:2900,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:state.cancelled,status:'active',previous_billing_date:'2026-10-18T08:00:00Z',next_billing_date:'2026-11-18T08:00:00Z',customer:{customer_id:customer},metadata});
const payFixture=()=>({payload_type:'Payment',payment_id:payment,checkout_session_id:checkout,status:'succeeded',currency:'USD',subscription_id:sub,subscription_ids:[sub],is_multi_subscription:false,is_update_payment_method:false,customer:{customer_id:customer},total_amount:2900,tax:200,service_periods:[{subscription_id:sub,starts_at:'2026-10-18T08:00:00Z',ends_at:'2026-11-18T08:00:00Z'}]});
beforeAll(async()=>{
  vi.stubGlobal('crypto',webcrypto);
  vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]},serve:(handler:Handler)=>handlers.push(handler)});
  vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));const method=init?.method??'GET';
    fetches.push({url:url.href,method,body:init?.body?JSON.parse(String(init.body)):null});
    if(url.origin!=='https://test.dodopayments.com')throw new Error('Unexpected real network blocked');
    if(state.providerReplies[url.pathname])return Response.json(state.providerReplies[url.pathname]);
    if(url.pathname==='/products/pdt_FixtureWeekly')return Response.json(localProduct());
    if(url.pathname==='/products/pdt_FixtureWeekly/localized-prices')return Response.json(localRules());
    if(url.pathname==='/checkouts/preview')return Response.json(localPreview());
    if(url.pathname==='/checkouts')return Response.json({session_id:checkout,checkout_url:`https://test.checkout.dodopayments.com/session/${checkout}`});
    if(url.pathname===`/checkouts/${checkout}`)return Response.json({id:checkout,payment_id:payment});
    if(url.pathname===`/payments/${payment}`)return Response.json(payFixture());
    if(url.pathname===`/subscriptions/${sub}`){if(method==='PATCH')state.cancelled=true;return Response.json(subFixture());}
    throw new Error('Unexpected provider endpoint');
  });
  await import('../functions/job-loop-billing/index.ts');await import('../functions/dodo-webhook/index.ts');
});
beforeEach(()=>{
  env={...dodoEnvironment(),JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:'pdt_FixtureWeekly',DODO_PRODUCT_LOOP_ACTIVE:'pdt_FixtureActive',DODO_PRODUCT_LOOP_DAILY:'pdt_FixtureDaily',SUPABASE_URL:'https://supabase.fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-never-real'};
  fetches.length=0;state.rpcCalls.length=0;state.sessionValid=true;state.cancelled=false;state.replies={};state.providerReplies={};
});
afterAll(()=>vi.unstubAllGlobals());
function req(body:unknown,bearer:string|null=token){return new Request('https://edge.fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body)});}
function signed(type:string,data:Record<string,unknown>){const raw=dodoEnvelope(type,data),id='msg_LoopHandler',timestamp=Math.floor(Date.now()/1000);return new Request('https://edge.fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':String(timestamp),'webhook-signature':dodoSign(raw,id,timestamp)},body:raw});}
it('actual handler requires authenticated user and actual valid session before billing reads',async()=>{
  expect((await handlers[0](req({action:'status'},null))).status).toBe(401);
  expect((await handlers[0](req({action:'status'},'header.bad.signature'))).status).toBe(401);
  state.sessionValid=false;expect((await handlers[0](req({action:'status'}))).status).toBe(401);
  expect(fetches).toHaveLength(0);
});
it('actual checkout binds verified owner/session and ignores no browser identity override',async()=>{
  let response=await handlers[0](req({action:'checkout',plan:'weekly',requestId:request,expectedGeneration:0,consent:true,userId:'forged'}));expect(response.status).toBe(400);
  response=await handlers[0](req({action:'checkout',plan:'weekly',requestId:request,expectedGeneration:0,consent:true}));expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({provider:'dodo',billingMode:'test',requestId:request,generation:0,plan:'weekly',sessionId:checkout});
  expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_checkout_claim')?.args).toMatchObject({p_user:owner,p_auth_session:session,p_generation:0});
  expect(fetches.find(call=>call.method==='POST')?.body).toMatchObject({metadata,billing_currency:'USD',subscription_data:{trial_period_days:0}});
});
it('actual legacy USD recovery preserves its original product after current merchant configuration rotates',async()=>{
  env.DODO_PRODUCT_LOOP_WEEKLY='pdt_NextWeeklyVersion';state.replies.job_loop_billing_checkout_claim={state:'ready',creationClaimAcquired:false,session_id:checkout,checkout_url:`https://test.checkout.dodopayments.com/session/${checkout}`,created_at:new Date().toISOString()};
  const response=await handlers[0](req({action:'checkout',plan:'weekly',requestId:request,expectedGeneration:0,consent:true}));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({sessionId:checkout,requestId:request});
  expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_checkout_claim')?.args).toMatchObject({p_user:owner,p_auth_session:session,p_generation:0,p_product:'pdt_FixtureWeekly'});expect(fetches).toHaveLength(0);
});
it('unsigned webhook cannot query Dodo or touch subscription authority',async()=>{
  const response=await handlers[1](req({type:'payment.succeeded',data:payFixture()},null));expect(response.status).toBe(400);expect((await response.json()).code).toBe('BAD_SIGNATURE');expect(fetches).toHaveLength(0);expect(state.rpcCalls).toHaveLength(0);
});
it('actual signed recurring payment takes new route and passes verified paid cycle to SQL',async()=>{
  const response=await handlers[1](signed('payment.succeeded',payFixture()));expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({received:true,duplicate:false});
  expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_apply_event')?.args).toMatchObject({p_user:owner,p_subscription:sub,p_session:checkout,p_payment:payment,p_paid_amount:2900,p_valid_until:'2026-11-18T08:00:00.000Z'});
  expect(state.rpcCalls.some(call=>call.name==='jobvance_apply_payment_event')).toBe(false);
});
it('actual cancellation PATCH targets paid-period-end only and requires exact original identity',async()=>{
  const response=await handlers[0](req({action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:sub,expectedVersion:1,consent:true}));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:'confirmed',subscriptionId:sub});
  expect(fetches.filter(call=>call.method==='PATCH')).toEqual([{url:`https://test.dodopayments.com/subscriptions/${sub}`,method:'PATCH',body:{cancel_at_next_billing_date:true}}]);
});
const localQuoteId='44444444-4444-4444-8444-444444444444',localRequest='55555555-5555-4555-8555-555555555555';
function localProduct(){return{product_id:'pdt_FixtureWeekly',is_recurring:true,pricing_mode:'by_currency',price:{type:'recurring_price',price:2900,currency:'USD',payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,tax_inclusive:true}};}
function localRules(amount=299900){return{items:[{id:'lcp_FixtureINR',product_id:'pdt_FixtureWeekly',mode:'by_currency',currency:'INR',amount,updated_at:'2026-10-18T08:00:00Z'}]};}
function localPreview(amount=299900){return{billing_country:'IN',currency:'INR',is_byop:false,payment_method_required:true,total_price:amount,current_breakup:{discount:0,total_amount:amount,tax:0},recurring_breakup:{discount:0,total_amount:amount,tax:0},product_cart:[{product_id:'pdt_FixtureWeekly',quantity:1,currency:'INR',is_subscription:true,is_usage_based:false,tax_inclusive:true,discount_amount:0,meters:[],addons:[]}],subscriptions:[{product_id:'pdt_FixtureWeekly',amount_due_now:amount,recurring_amount:amount,trial_period_days:0}]};}
async function readyLocalQuote(historical=false){
  const amount=historical?279900:299900;
  const raw={quoteId:localQuoteId,requestId:localRequest,generation:0,mode:'test',productId:'pdt_FixtureWeekly',plan:'weekly',country:'IN',currency:'INR',amountMinor:amount,exponent:2,catalogVersion:historical?'loop-local-2026-10-18-v1':LOOP_LOCAL_PRICE_CATALOG_VERSION,taxInclusive:true,interval:'month',initialAmountMinor:amount,recurringAmountMinor:amount,expiresAt:new Date(Date.now()+600000).toISOString()};
  const pricing=storedLoopPrice({pricing:raw},'weekly'),config=loopBillingConfiguration(key=>env[key])!,rule=await verifyLoopPriceRule(localProduct(),localRules(amount),config,pricing),previewHash=await verifyLoopPricePreview(localPreview(amount),pricing);
  return parseLoopQuote({...raw,...rule,previewHash});
}
it('actual local quote endpoint verifies auth, exact provider rule and a non-purchasing preview before issuing receipt',async()=>{
  const q=await readyLocalQuote();state.replies.job_loop_billing_quote_candidate={quote:null,catalog:{...q}};state.replies.job_loop_billing_quote_issue=q;
  const response=await handlers[0](req({action:'quote',requestId:localRequest,expectedGeneration:0,plan:'weekly',country:'IN',currency:'INR'}));expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({quoteId:localQuoteId,requestId:localRequest,currency:'INR',amountMinor:299900,exponent:2});
  expect(fetches.map(call=>new URL(call.url).pathname)).toEqual(['/products/pdt_FixtureWeekly','/products/pdt_FixtureWeekly/localized-prices','/checkouts/preview']);
  expect(fetches.some(call=>call.url==='https://test.dodopayments.com/checkouts')).toBe(false);expect(state.rpcCalls[0].args).toMatchObject({p_user:owner,p_auth_session:session});
});
it('actual local checkout sends original quote metadata, billing country and currency without browser price authority',async()=>{
  const q=await readyLocalQuote();state.replies.job_loop_billing_quote_read=q;state.replies.job_loop_billing_checkout_claim_v2={state:'creating',creationClaimAcquired:true,pricing:q,product_id:'pdt_FixtureWeekly'};
  const response=await handlers[0](req({action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',quoteId:localQuoteId,consent:true}));expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({pricing:{quoteId:localQuoteId,currency:'INR',amountMinor:299900}});
  expect(fetches.find(call=>call.url==='https://test.dodopayments.com/checkouts')?.body).toMatchObject({billing_currency:'INR',billing_address:{country:'IN'},metadata:{...metadata,quote_id:localQuoteId},feature_flags:{allow_currency_selection:false,allow_customer_editing_country:false}});
});
it('actual local quote rejects a revoked auth session before any provider call',async()=>{
  state.sessionValid=false;const response=await handlers[0](req({action:'quote',requestId:localRequest,expectedGeneration:0,plan:'weekly',country:'IN',currency:'INR'}));expect(response.status).toBe(401);expect(fetches).toHaveLength(0);
});
it('actual signed local refund reaches the Loop route and never the independent USD-only CV-pass grant',async()=>{
  const q=await readyLocalQuote(true);state.replies.job_loop_billing_order={user_id:owner,request_id:request,generation:0,session_id:checkout,plan:'weekly',product_id:'pdt_FixtureWeekly',pricing:q};state.replies.job_loop_billing_apply_event_v2={duplicate:false};
  state.providerReplies[`/subscriptions/${sub}`]={...subFixture(),currency:'INR',recurring_pre_tax_amount:250000,metadata:{...metadata,quote_id:localQuoteId}};
  state.providerReplies[`/payments/${payment}`]={...payFixture(),currency:'INR',total_amount:279900,tax:29900};
  const response=await handlers[1](signed('refund.succeeded',{payload_type:'Refund',refund_id:'ref_LocalActual',payment_id:payment,status:'succeeded',amount:279900,currency:'INR'}));expect(response.status).toBe(200);
  expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_currency:'INR',p_paid_amount:279900,p_quote:localQuoteId,p_revoked:true});expect(state.rpcCalls.some(call=>call.name==='jobvance_apply_payment_event')).toBe(false);
});
it('actual signed local payment keeps customer INR money distinct from API USD accounting and net settlement',async()=>{
  const q=await readyLocalQuote(true);state.replies.job_loop_billing_order={user_id:owner,request_id:request,generation:0,session_id:checkout,plan:'weekly',product_id:'pdt_FixtureWeekly',pricing:q,providerAccounting:[]};state.replies.job_loop_billing_apply_event_v2={duplicate:false};state.replies.job_loop_billing_accounting_bind={recorded:true};
  state.providerReplies[`/subscriptions/${sub}`]={...subFixture(),currency:'USD',recurring_pre_tax_amount:2947,metadata:{...metadata,quote_id:localQuoteId}};
  const paid={...payFixture(),currency:'INR',total_amount:279900,tax:42697,settlement_currency:'USD',settlement_amount:2834,settlement_tax:432};state.providerReplies[`/payments/${payment}`]=paid;
  const response=await handlers[1](signed('payment.succeeded',paid));expect(response.status).toBe(200);
  expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_accounting_bind')?.args).toMatchObject({p_payment:payment,p_currency:'INR',p_amount:279900,p_accounting_currency:'USD',p_accounting_amount:2947,p_settlement_currency:'USD',p_settlement_amount:2834,p_settlement_tax:432});
  expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_currency:'INR',p_paid_amount:279900,p_payment:payment});
});
