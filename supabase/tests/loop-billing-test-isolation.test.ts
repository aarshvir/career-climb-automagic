// @vitest-environment node
// Actual isolated acceptance entrypoints; all credentials, users, provider HTTP
// and SQL adapters are invented. No real socket, charge or deployment is used.
import { webcrypto, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dodoEnvelope, dodoSign, dodoWebhookKey } from './dodo-fixtures';
import { LOOP_BILLING_PRODUCT } from '../functions/_shared/loop-billing.ts';
import { loopBillingTestConfiguration } from '../functions/_shared/loop-billing-test-config.ts';
type Handler=(req:Request)=>Promise<Response>;
const owner='11111111-1111-4111-8111-111111111111',other='44444444-4444-4444-8444-444444444444',request='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
const sub='sub_IsolatedTest',checkout='cks_IsolatedTest',payment='pay_IsolatedTest';
const token=`header.${Buffer.from(JSON.stringify({session_id:session})).toString('base64url')}.signature`;
const liveSecret=`whsec_${randomBytes(32).toString('base64')}`;
const state=vi.hoisted(()=>({user:'11111111-1111-4111-8111-111111111111',rpcCalls:[] as {name:string,args:Record<string,unknown>}[],validSession:true,cancelled:false,pricing:null as Record<string,unknown>|null}));
vi.mock('https://esm.sh/@supabase/supabase-js@2.57.4',()=>({createClient:()=>({auth:{getUser:async(value:string)=>({data:{user:value.startsWith('header.')?{id:state.user}:null},error:null})},rpc:async(name:string,args:Record<string,unknown>)=>{
  state.rpcCalls.push({name,args});
  if(!state.validSession && name==='job_loop_billing_status')return{data:null,error:{message:'LOOP_BILLING_SESSION_STALE'}};
  const result:Record<string,unknown>={job_loop_billing_event:{duplicate:false},job_loop_billing_checkout_claim:{state:'creating',creationClaimAcquired:true},job_loop_billing_checkout_finalize:{},job_loop_billing_checkout_fail:{},job_loop_billing_cancel_claim:{creationClaimAcquired:true},job_loop_billing_cancel_finalize:{status:'confirmed'},job_loop_billing_apply_event:{duplicate:false},job_loop_billing_status:{generation:0,subscription:null,checkout:null,entitlement:{active:true,plan:'daily',validUntil:'2026-11-18T08:00:00Z'}},job_loop_billing_order:{user_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',generation:0,session_id:'cks_IsolatedTest',plan:'weekly',product_id:'pdt_IsolatedWeekly'}};
  if(name==='job_loop_billing_order'&&state.pricing)result[name]={...(result[name] as Record<string,unknown>),pricing:state.pricing};
  if(name==='job_loop_billing_apply_event_v2')return{data:{duplicate:false},error:null};
  return{data:result[name],error:null};
}})}));
let env:Record<string,string|undefined>;const handlers:Handler[]=[];
const fetches:{url:string,method:string,body:Record<string,unknown>|null,key:string|null}[]=[];
let metadata:Record<string,unknown>,providerOwner=owner,liveCheckout=false,providerCurrency='USD';
const subFixture=()=>({payload_type:'Subscription',subscription_id:sub,product_id:'pdt_IsolatedWeekly',quantity:1,currency:'USD',recurring_pre_tax_amount:2700,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:state.cancelled,status:'active',previous_billing_date:'2026-10-18T08:00:00Z',next_billing_date:'2026-11-18T08:00:00Z',customer:{customer_id:'cus_IsolatedTest'},metadata:{...metadata,user_id:providerOwner}});
const payFixture=()=>({payload_type:'Payment',payment_id:payment,checkout_session_id:checkout,status:'succeeded',currency:providerCurrency,subscription_id:sub,subscription_ids:[sub],is_multi_subscription:false,is_update_payment_method:false,customer:{customer_id:'cus_IsolatedTest'},total_amount:providerCurrency==='USD'?2900:279900,tax:200,metadata:{...metadata,user_id:providerOwner},service_periods:[{subscription_id:sub,starts_at:'2026-10-18T08:00:00Z',ends_at:'2026-11-18T08:00:00Z'}]});
function environment():Record<string,string|undefined>{return {
  // Aggressively enabled Live values must never supply the isolated test config.
  JOBVANCE_BILLING_ENABLED:'true',JOBVANCE_LOOP_BILLING_ENABLED:'true',JOBVANCE_BILLING_MODE:'live',JOBVANCE_PAYMENT_PROVIDER:'dodo',DODO_PAYMENTS_API_KEY:'dodo_live_DO_NOT_USE',DODO_PAYMENT_API_KEY:'dodo_live_ALIAS_DO_NOT_USE',DODO_PAYMENTS_WEBHOOK_KEY:liveSecret,DODO_PRODUCT_LOOP_WEEKLY:'pdt_LiveWeekly',DODO_PRODUCT_LOOP_ACTIVE:'pdt_LiveActive',DODO_PRODUCT_LOOP_DAILY:'pdt_LiveDaily',APP_URL:'https://live.fixture.invalid',
  JOBVANCE_LOOP_TEST_BILLING_ENABLED:'true',JOBVANCE_LOOP_TEST_OWNER_IDS:owner,JOBVANCE_LOOP_TEST_APP_URL:'https://test-return.fixture.invalid',DODO_TEST_PAYMENTS_API_KEY:'fixture-isolated-test-key',DODO_TEST_PAYMENTS_WEBHOOK_KEY:dodoWebhookKey,DODO_TEST_PRODUCT_LOOP_WEEKLY:'pdt_IsolatedWeekly',DODO_TEST_PRODUCT_LOOP_ACTIVE:'pdt_IsolatedActive',DODO_TEST_PRODUCT_LOOP_DAILY:'pdt_IsolatedDaily',SUPABASE_URL:'https://supabase.fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-not-a-real-secret',
};}
beforeAll(async()=>{
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]},serve:(handler:Handler)=>handlers.push(handler)});
  vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input)),method=init?.method??'GET';
    fetches.push({url:url.href,method,body:init?.body?JSON.parse(String(init.body)):null,key:new Headers(init?.headers).get('Authorization')});
    if(url.origin!=='https://test.dodopayments.com')throw new Error('Live or unplanned network blocked');
    if(url.pathname==='/products/pdt_IsolatedWeekly')return Response.json({product_id:'pdt_IsolatedWeekly',is_recurring:true,price:{type:'recurring_price',price:2900,currency:'USD',payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,tax_inclusive:true}});
    if(url.pathname==='/checkouts')return Response.json({session_id:checkout,checkout_url:`https://${liveCheckout?'checkout':'test.checkout'}.dodopayments.com/session/${checkout}`});
    if(url.pathname===`/checkouts/${checkout}`)return Response.json({id:checkout,payment_id:payment});
    if(url.pathname===`/payments/${payment}`)return Response.json(payFixture());
    if(url.pathname===`/subscriptions/${sub}`){if(method==='PATCH')state.cancelled=true;return Response.json({...subFixture(),currency:providerCurrency});}
    throw new Error('Unplanned Test provider endpoint');
  });
  await import('../functions/job-loop-billing-test/index.ts');await import('../functions/dodo-webhook-test/index.ts');
});
beforeEach(()=>{env=environment();metadata={product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly'};state.user=owner;state.rpcCalls.length=0;state.validSession=true;state.cancelled=false;state.pricing=null;providerOwner=owner;liveCheckout=false;providerCurrency='USD';fetches.length=0;});
afterAll(()=>vi.unstubAllGlobals());
function req(body:unknown,bearer:string|null=token){return new Request('https://edge.fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body)});}
function signed(type:string,data:Record<string,unknown>,secret=dodoWebhookKey){const raw=dodoEnvelope(type,data),id='msg_IsolatedTest',timestamp=Math.floor(Date.now()/1000);return new Request('https://edge.fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':String(timestamp),'webhook-signature':dodoSign(raw,id,timestamp,secret)},body:raw});}
describe('isolated test configuration',()=>{
  it('reads only the separately named test config and forces mode and provider origin',()=>{
    const reads:string[]=[];const config=loopBillingTestConfiguration(name=>{reads.push(name);return env[name];});
    expect(config).toMatchObject({mode:'test',secretKey:'fixture-isolated-test-key',webhookSecret:dodoWebhookKey,apiBaseUrl:'https://test.dodopayments.com',appUrl:'https://test-return.fixture.invalid',loopProducts:{weekly:'pdt_IsolatedWeekly'}});
    expect(reads.every(name=>name.startsWith('JOBVANCE_LOOP_TEST_')||name.startsWith('DODO_TEST_'))).toBe(true);
  });
  it.each(['JOBVANCE_LOOP_TEST_BILLING_ENABLED','JOBVANCE_LOOP_TEST_OWNER_IDS','JOBVANCE_LOOP_TEST_APP_URL','DODO_TEST_PAYMENTS_API_KEY','DODO_TEST_PAYMENTS_WEBHOOK_KEY','DODO_TEST_PRODUCT_LOOP_WEEKLY','DODO_TEST_PRODUCT_LOOP_ACTIVE','DODO_TEST_PRODUCT_LOOP_DAILY'])('does not fall back to Live when %s is missing',name=>{
    delete env[name];expect(loopBillingTestConfiguration(key=>env[key])).toBeNull();
  });
  it.each(['',`${owner},bad`,`${owner},${owner}`,Array.from({length:11},(_,i)=>`${String(i).padStart(8,'0')}-0000-4000-8000-000000000001`).join(',')])('rejects blank, malformed, repeated or excessive synthetic owner lists',ids=>{
    env.JOBVANCE_LOOP_TEST_OWNER_IDS=ids;expect(loopBillingTestConfiguration(key=>env[key])).toBeNull();
  });
  it('rejects visibly Live key in the Test field and duplicate products',()=>{
    env.DODO_TEST_PAYMENTS_API_KEY='dodo_live_wrong';expect(loopBillingTestConfiguration(key=>env[key])).toBeNull();env=environment();env.DODO_TEST_PRODUCT_LOOP_DAILY=env.DODO_TEST_PRODUCT_LOOP_WEEKLY;expect(loopBillingTestConfiguration(key=>env[key])).toBeNull();
  });
});
describe('actual isolated Test entrypoints',()=>{
  it('requires verified authentication/session and an allowlisted synthetic user before status/provider work',async()=>{
    expect((await handlers[0](req({action:'status'},null))).status).toBe(401);expect(state.rpcCalls).toHaveLength(0);
    state.user=other;expect((await handlers[0](req({action:'status'}))).status).toBe(403);expect(state.rpcCalls).toHaveLength(0);expect(fetches).toHaveLength(0);
    state.user=owner;state.validSession=false;expect((await handlers[0](req({action:'status'}))).status).toBe(401);
  });
  it('remains disabled even with all Live gates enabled, and status never labels existing Live entitlement as test-granted',async()=>{
    env.JOBVANCE_LOOP_TEST_BILLING_ENABLED='false';expect((await handlers[0](req({action:'status'}))).status).toBe(503);expect(state.rpcCalls).toHaveLength(0);
    env.JOBVANCE_LOOP_TEST_BILLING_ENABLED='true';const response=await handlers[0](req({action:'status'}));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({billingMode:'test',testModeOnly:true,entitlement:null});expect(state.rpcCalls[0].args).toMatchObject({p_mode:'test',p_user:owner,p_auth_session:session});
  });
  it('actual checkout uses only Test key/product/return URL and SQL Test mode, with no browser mode override',async()=>{
    let response=await handlers[0](req({action:'checkout',plan:'weekly',requestId:request,expectedGeneration:0,consent:true,billingMode:'live'}));expect(response.status).toBe(400);expect(fetches).toHaveLength(0);
    response=await handlers[0](req({action:'checkout',plan:'weekly',requestId:request,expectedGeneration:0,consent:true}));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({billingMode:'test',testModeOnly:true,url:`https://test.checkout.dodopayments.com/session/${checkout}`});
    expect(fetches.every(call=>call.url.startsWith('https://test.dodopayments.com/')&&call.key==='Bearer fixture-isolated-test-key')).toBe(true);expect(fetches.find(call=>call.method==='POST')?.body).toMatchObject({product_cart:[{product_id:'pdt_IsolatedWeekly',quantity:1}],billing_currency:'USD',return_url:'https://test-return.fixture.invalid/pricing?loop_checkout=success'});
    expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_checkout_claim')?.args.p_mode).toBe('test');
  });
  it('rejects a provider-returned Live checkout address and keeps the uncertain Test request',async()=>{
    liveCheckout=true;const response=await handlers[0](req({action:'checkout',plan:'weekly',requestId:request,expectedGeneration:0,consent:true}));expect(response.status).toBe(503);expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_checkout_fail')?.args.p_retryable).toBe(false);expect(state.rpcCalls.some(call=>call.args.p_mode==='live')).toBe(false);
  });
  it('accepts only the Test signing secret and never queries provider/SQL for invalid or non-allowlisted signatures',async()=>{
    expect((await handlers[1](signed('payment.succeeded',payFixture(),liveSecret))).status).toBe(400);expect(fetches).toHaveLength(0);expect(state.rpcCalls).toHaveLength(0);
    expect((await handlers[1](signed('payment.succeeded',{...payFixture(),metadata:{...metadata,user_id:other}}))).status).toBe(403);expect(fetches).toHaveLength(0);expect(state.rpcCalls).toHaveLength(0);
  });
  it('signed Test payment reaches actual orchestration but every persisted occurrence is mode Test',async()=>{
    const response=await handlers[1](signed('payment.succeeded',payFixture()));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({received:true,billingMode:'test',testModeOnly:true});expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_apply_event')?.args).toMatchObject({p_mode:'test',p_payment:payment,p_user:owner});expect(fetches.every(call=>call.url.startsWith('https://test.dodopayments.com/'))).toBe(true);
  });
  it('rechecks the provider subscription actual owner instead of trusting forged allowlisted event metadata',async()=>{
    providerOwner=other;const response=await handlers[1](signed('payment.succeeded',{...payFixture(),metadata}));expect(response.status).toBe(403);expect(state.rpcCalls.some(call=>call.name==='job_loop_billing_apply_event')).toBe(false);
  });
  it('a signed refund resolves actual payment owner with one cached Test read before applying refund authority',async()=>{
    const refund={payload_type:'Refund',refund_id:'ref_IsolatedTest',payment_id:payment,status:'succeeded',amount:2900,metadata:{}};
    const response=await handlers[1](signed('refund.succeeded',refund));expect(response.status).toBe(200);expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_apply_event')?.args).toMatchObject({p_mode:'test',p_revoked:true,p_payment:payment});expect(fetches.filter(call=>call.url.endsWith(`/payments/${payment}`))).toHaveLength(1);
    fetches.length=0;state.rpcCalls.length=0;providerOwner=other;expect((await handlers[1](signed('refund.succeeded',{...refund,metadata}))).status).toBe(403);expect(fetches).toHaveLength(1);expect(state.rpcCalls).toHaveLength(0);
  });
  it('actual cancellation writes only the exact Test subscription paid-period-end flag',async()=>{
    const response=await handlers[0](req({action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:sub,expectedVersion:1,consent:true}));expect(response.status).toBe(200);expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_cancel_claim')?.args.p_mode).toBe('test');expect(fetches.filter(call=>call.method==='PATCH')).toEqual([{url:`https://test.dodopayments.com/subscriptions/${sub}`,method:'PATCH',body:{cancel_at_next_billing_date:true},key:'Bearer fixture-isolated-test-key'}]);
  });
  it('actual Test refund wrapper accepts a bound explicit INR refund and keeps it isolated from Live',async()=>{
    const quoteId='55555555-5555-4555-8555-555555555555';metadata={...metadata,quote_id:quoteId};providerCurrency='INR';state.pricing={quoteId,productId:'pdt_IsolatedWeekly',plan:'weekly',country:'IN',currency:'INR',amountMinor:279900,exponent:2,catalogVersion:'historical-local-v1',taxInclusive:true,interval:'month'};
    const refund={payload_type:'Refund',refund_id:'ref_LocalIsolated',payment_id:payment,status:'succeeded',amount:279900,currency:'INR'};
    const response=await handlers[1](signed('refund.succeeded',refund));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({billingMode:'test',testModeOnly:true,received:true});
    expect(state.rpcCalls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_mode:'test',p_currency:'INR',p_quote:quoteId,p_revoked:true,p_paid_amount:279900});expect(fetches.every(call=>call.url.startsWith('https://test.dodopayments.com/'))).toBe(true);
    state.rpcCalls.length=0;fetches.length=0;expect((await handlers[1](signed('refund.succeeded',{...refund,currency:'JPY'}))).status).toBe(409);expect(state.rpcCalls).toHaveLength(0);expect(fetches).toHaveLength(1);
  });
});
