// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { captureLoopBillingInput, LOOP_BILLING_PRODUCT, loopBillingConfiguration, loopCheckoutBody, validateLoopBillingProduct, validateLoopPaidPeriod, validateLoopSubscription, verifiedAuthSession, type LoopBillingConfig } from '../functions/_shared/loop-billing.ts';
import { applyLoopBillingWebhook, controlLoopBilling, type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';
import { loopBillingRpc } from '../functions/_shared/loop-billing-edge.ts';
import { dodoEnvironment } from './dodo-fixtures';
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });
const owner='11111111-1111-4111-8111-111111111111', request='22222222-2222-4222-8222-222222222222', auth='33333333-3333-4333-8333-333333333333';
const subId='sub_FixtureLoop',session='cks_FixtureLoop',paymentId='pay_FixtureLoop',customer='cus_FixtureLoop';
const from='2026-10-18T08:00:00.000Z',until='2026-11-18T08:00:00.000Z';
const env=dodoEnvironment({ JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:'pdt_FixtureWeekly',DODO_PRODUCT_LOOP_ACTIVE:'pdt_FixtureActive',DODO_PRODUCT_LOOP_DAILY:'pdt_FixtureDaily' });
const config=()=>loopBillingConfiguration(key=>env[key])!;
const metadata={product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly'};
function subscription(changes:Record<string,unknown>={}) { return {payload_type:'Subscription',subscription_id:subId,product_id:'pdt_FixtureWeekly',quantity:1,currency:'USD',recurring_pre_tax_amount:2900,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:false,status:'active',previous_billing_date:from,next_billing_date:until,customer:{customer_id:customer},metadata,...changes}; }
function payment(changes:Record<string,unknown>={}) { return {payload_type:'Payment',payment_id:paymentId,status:'succeeded',currency:'USD',subscription_id:subId,subscription_ids:[subId],is_multi_subscription:false,is_update_payment_method:false,customer:{customer_id:customer},total_amount:2900,tax:200,checkout_session_id:session,service_periods:[{subscription_id:subId,starts_at:from,ends_at:until}],...changes}; }
function product(changes:Record<string,unknown>={},price:Record<string,unknown>={}) { return {product_id:'pdt_FixtureWeekly',is_recurring:true,price:{type:'recurring_price',price:2900,currency:'USD',payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,tax_inclusive:true,...price},...changes}; }
function ports() {
  const calls:{name:string,args:Record<string,unknown>}[]=[], providerCalls:{endpoint:string,body?:Record<string,unknown>,method?:string}[]=[];
  let cancelled=false;
  const rpcResults:Record<string,Record<string,unknown>>={job_loop_billing_event:{duplicate:false},job_loop_billing_checkout_claim:{state:'creating',creationClaimAcquired:true},job_loop_billing_checkout_finalize:{},job_loop_billing_status:{generation:0,subscription:null,checkout:null,entitlement:null},job_loop_billing_order:{user_id:owner,request_id:request,generation:0,session_id:session,plan:'weekly',product_id:'pdt_FixtureWeekly'},job_loop_billing_apply_event:{duplicate:false},job_loop_billing_cancel_claim:{creationClaimAcquired:true},job_loop_billing_cancel_finalize:{subscriptionId:subId,status:'confirmed'}};
  const providerResults:Record<string,Record<string,unknown>>={};
  const result:LoopBillingPorts={now:()=>Date.parse(from),rpc:async <T>(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return rpcResults[name] as T;},provider:async(endpoint,body,method)=>{
    providerCalls.push({endpoint,body,method});
    if(providerResults[endpoint])return providerResults[endpoint];
    if(endpoint==='products/pdt_FixtureWeekly')return product();
    if(endpoint==='checkouts')return {session_id:session,checkout_url:`https://test.checkout.dodopayments.com/session/${session}`};
    if(endpoint===`checkouts/${session}`)return{id:session,payment_id:paymentId};
    if(endpoint===`subscriptions/${subId}`){if(method==='PATCH')cancelled=true;return subscription({cancel_at_next_billing_date:cancelled});}
    if(endpoint===`payments/${paymentId}`)return payment();
    if(endpoint==='refunds/ref_FixtureLoop')return{refund_id:'ref_FixtureLoop',payment_id:paymentId,status:'succeeded',amount:2900};
    throw new Error('Unplanned network blocked');
  }};
  return {result,calls,providerCalls,rpcResults,providerResults};
}
describe('monthly Job Loop fixed product and authority',()=>{
  it('requires independent enable, 3 distinct products, current shared merchant gates and keys',()=>{
    expect(config()?.loopProducts.weekly).toBe('pdt_FixtureWeekly');
    for(const changes of [{JOBVANCE_LOOP_BILLING_ENABLED:'false'},{DODO_PRODUCT_LOOP_DAILY:'pdt_FixtureWeekly'},{DODO_PAYMENTS_API_KEY:''},{DODO_PAYMENTS_WEBHOOK_KEY:''},{JOBVANCE_BILLING_ENABLED:'false'}])expect(loopBillingConfiguration(key=>({...env,...changes})[key])).toBeNull();
    expect(loopBillingConfiguration(key=>({...env,JOBVANCE_BILLING_MODE:'live'})[key])).toBeNull();
  });
  it('accepts the securely saved singular API key alias without ambiguity or changing other providers',()=>{
    const alias={...env,DODO_PAYMENTS_API_KEY:undefined,DODO_PAYMENT_API_KEY:env.DODO_PAYMENTS_API_KEY};
    expect(loopBillingConfiguration(key=>alias[key])?.secretKey).toBe(env.DODO_PAYMENTS_API_KEY);
    expect(loopBillingConfiguration(key=>({...env,DODO_PAYMENT_API_KEY:env.DODO_PAYMENTS_API_KEY})[key])?.secretKey).toBe(env.DODO_PAYMENTS_API_KEY);
    expect(loopBillingConfiguration(key=>({...env,DODO_PAYMENT_API_KEY:'different-fixture-key'})[key])).toBeNull();
  });
  it('validates a no-trial fixed monthly product separately from a CV pass',()=>{
    expect(()=>validateLoopBillingProduct(product(),config(),'weekly')).not.toThrow();
    for(const change of [{price:2800},{currency:'INR'},{payment_frequency_count:3},{payment_frequency_interval:'Week'},{trial_period_days:14},{discount:1},{purchasing_power_parity:true},{type:'one_time_price'},{subscription_period_count:1},{tax_inclusive:false}])expect(()=>validateLoopBillingProduct(product({},change),config(),'weekly')).toThrow();
  });
  it('server fixes exact product, price quantity, original owner and recurring scope',()=>{
    const body=loopCheckoutBody(config(),owner,request,4,'active');
    expect(body.product_cart).toEqual([{product_id:'pdt_FixtureActive',quantity:1}]);
    expect(body.metadata).toEqual({...metadata,generation:'4',plan:'active'});
    expect(body.subscription_data.trial_period_days).toBe(0);
    expect(body.return_url).toContain('/pricing?loop_checkout=success');
  });
  it.each(['weekly','active','daily'] as const)('pins %s checkout billing currency without inventing a customer country',plan=>{
    for(const mode of ['test','live'] as const){const body=loopCheckoutBody({...config(),mode},owner,request,0,plan);expect(body.billing_currency).toBe('USD');expect(body.feature_flags.allow_currency_selection).toBe(false);expect(body).not.toHaveProperty('billing_address');}
  });
  it('continues rejecting localized subscription and payment currency after explicitly requesting USD',()=>{
    expect(()=>validateLoopSubscription(subscription({currency:'AED'}),config())).toThrow();
    const sub=validateLoopSubscription(subscription(),config());
    expect(()=>validateLoopPaidPeriod(payment({currency:'AED',total_amount:11078}),sub)).toThrow();
  });
  it('rejects forged owner, amount, discount, missing consent and malformed generation before awaits',()=>{
    const base={action:'checkout',requestId:request,plan:'weekly',expectedGeneration:0,consent:true};
    for(const change of [{userId:owner},{amount:1},{plan:'sprint_7d'},{consent:false},{expectedGeneration:'0'},{requestId:'bad'}])expect(()=>captureLoopBillingInput({...base,...change})).toThrow();
    expect(()=>captureLoopBillingInput({action:'status',userId:owner})).toThrow();
  });
  it('extracts the actual session claim only from the already verified bearer token',()=>{
    const jwt=`header.${Buffer.from(JSON.stringify({session_id:auth})).toString('base64url')}.signature`;
    expect(verifiedAuthSession(new Request('https://fixture.invalid',{headers:{Authorization:`Bearer ${jwt}`}}))).toBe(auth);
    expect(()=>verifiedAuthSession(new Request('https://fixture.invalid',{headers:{Authorization:'Bearer invalid'}}))).toThrow();
  });
  it('strictly verifies monthly subscription identity, no trial and actual customer',()=>{
    expect(validateLoopSubscription(subscription(),config()).subscriptionId).toBe(subId);
    for(const changes of [{trial_period_days:14},{on_demand:true},{quantity:3},{recurring_pre_tax_amount:3000},{currency:'INR'},{metadata:{...metadata,user_id:'bad'}},{payment_frequency_interval:'Day'},{discounts:[{}]}])expect(()=>validateLoopSubscription(subscription(changes),config())).toThrow();
  });
  it('grants only immutable succeeded payment service periods and exact included tax price',()=>{
    const sub=validateLoopSubscription(subscription(),config());
    expect(validateLoopPaidPeriod(payment(),sub)).toMatchObject({periodStart:from,validUntil:until,amount:2900});
    expect(()=>validateLoopPaidPeriod(payment({subscription_ids:null}),sub)).not.toThrow();
    expect(()=>validateLoopPaidPeriod(payment(),validateLoopSubscription(subscription({recurring_pre_tax_amount:2700}),config()))).not.toThrow();
    for(const changes of [{status:'failed'},{total_amount:3100},{service_periods:[]},{subscription_id:'sub_Forged'},{is_update_payment_method:true},{subscription_ids:[subId,'sub_Other']},{customer:{customer_id:'cus_Forged'}},{service_periods:[{subscription_id:subId,starts_at:from,ends_at:'2027-11-18T08:00:00Z'}]}])expect(()=>validateLoopPaidPeriod(payment(changes),sub)).toThrow();
    expect(()=>validateLoopSubscription(subscription({tax_inclusive:false}),config())).toThrow();
  });
});
describe('monthly checkout and cancellation orchestration',()=>{
  it('returns an actionable conflict when server renewal safety blocks a racing new checkout',async()=>{
    const rpc=loopBillingRpc({rpc:async()=>({data:null,error:{message:'LOOP_SUBSCRIPTION_EXISTS private SQL/provider context'}})} as unknown as Parameters<typeof loopBillingRpc>[0]);
    await expect(rpc('job_loop_billing_checkout_claim',{})).rejects.toMatchObject({status:409,code:'LOOP_SUBSCRIPTION_EXISTS',message:expect.stringContaining('Confirm its cancellation')});
  });
  it('returns a finished-checkout conflict without reopening a consumed payment link',async()=>{
    const rpc=loopBillingRpc({rpc:async()=>({data:null,error:{message:'LOOP_CHECKOUT_FINISHED'}})} as unknown as Parameters<typeof loopBillingRpc>[0]);
    await expect(rpc('job_loop_billing_checkout_claim',{})).rejects.toMatchObject({status:409,code:'LOOP_CHECKOUT_FINISHED',message:expect.stringContaining('Refresh billing')});
  });
  it('creates one bound checkout with actual auth session and immutable generation',async()=>{
    const p=ports();const reply=await controlLoopBilling(p.result,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',consent:true});
    expect(reply).toMatchObject({generation:0,plan:'weekly',sessionId:session,requestId:request});
    expect(p.calls.find(call=>call.name==='job_loop_billing_checkout_claim')).toEqual({name:'job_loop_billing_checkout_claim',args:{p_user:owner,p_auth_session:auth,p_generation:0,p_request:request,p_mode:'test',p_plan:'weekly',p_product:'pdt_FixtureWeekly'}});
    expect(p.calls[p.calls.length-1].name).toBe('job_loop_billing_checkout_finalize');
  });
  it('recovers the original unquoted USD ready link after product rotation without rereading or recreating it',async()=>{
    const p=ports(),rotated={...config(),loopProducts:{...config().loopProducts,weekly:'pdt_NextWeeklyVersion'}};
    p.rpcResults.job_loop_billing_checkout_claim={state:'ready',creationClaimAcquired:false,session_id:session,checkout_url:`https://test.checkout.dodopayments.com/session/${session}`,created_at:from};
    expect(await controlLoopBilling(p.result,rotated,owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',consent:true})).toMatchObject({requestId:request,sessionId:session});
    expect(p.calls.find(call=>call.name==='job_loop_billing_checkout_claim')?.args).toMatchObject({p_auth_session:auth,p_generation:0,p_product:'pdt_FixtureWeekly'});expect(p.providerCalls).toHaveLength(0);
    p.rpcResults.job_loop_billing_checkout_claim={state:'uncertain',creationClaimAcquired:false};
    await expect(controlLoopBilling(p.result,rotated,owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',consent:true})).rejects.toMatchObject({code:'LOOP_CHECKOUT_RECOVERY_REQUIRED'});expect(p.providerCalls).toHaveLength(0);
  });
  it('uses only the configured new product for a genuinely new unquoted USD checkout',async()=>{
    const p=ports(),next='pdt_NextWeeklyVersion',rotated={...config(),loopProducts:{...config().loopProducts,weekly:next}};delete p.rpcResults.job_loop_billing_order;
    p.providerResults[`products/${next}`]=product({product_id:next});
    await controlLoopBilling(p.result,rotated,owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',consent:true});
    expect(p.calls.find(call=>call.name==='job_loop_billing_checkout_claim')?.args.p_product).toBe(next);expect(p.providerCalls.find(call=>call.endpoint==='checkouts')?.body).toMatchObject({billing_currency:'USD',product_cart:[{product_id:next,quantity:1}]});
  });
  it('does not read a provider or reveal a saved link when the exact original SQL claim rejects current authority',async()=>{
    const p=ports(),rpc=p.result.rpc;p.result.rpc=async<T>(name,args)=>{if(name==='job_loop_billing_checkout_claim')throw new Error('LOOP_BILLING_SESSION');return rpc<T>(name,args);};
    await expect(controlLoopBilling(p.result,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',consent:true})).rejects.toThrow('LOOP_BILLING_SESSION');expect(p.providerCalls).toHaveLength(0);
  });
  it('reuses a saved checkout and never duplicates an ambiguous provider attempt',async()=>{
    const p=ports();p.rpcResults.job_loop_billing_checkout_claim={state:'ready',creationClaimAcquired:false,session_id:session,checkout_url:`https://test.checkout.dodopayments.com/session/${session}`,created_at:from};
    await controlLoopBilling(p.result,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',consent:true});
    expect(p.providerCalls.filter(call=>call.endpoint==='checkouts')).toHaveLength(0);
    p.rpcResults.job_loop_billing_checkout_claim={state:'creating',creationClaimAcquired:false};
    await expect(controlLoopBilling(p.result,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',consent:true})).rejects.toMatchObject({code:'LOOP_CHECKOUT_RECOVERY_REQUIRED'});
  });
  it('reads authenticated status without billing credentials or creating record metadata',async()=>{
    const p=ports();p.rpcResults.job_loop_billing_status={generation:3,subscription:{plan:'three_weekly',revision:4},checkout:null};
    const status=await controlLoopBilling(p.result,null,owner,auth,{action:'status'},'live');
    expect(status).toMatchObject({billingConfigured:false,billingMode:'live',generation:3,subscription:{plan:'active',version:4}});
    expect(p.calls).toHaveLength(1);expect(p.providerCalls).toHaveLength(0);
  });
  it('cancels only the exact selected subscription at paid-period end and confirms readback',async()=>{
    const p=ports();const reply=await controlLoopBilling(p.result,config(),owner,auth,{action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:subId,expectedVersion:1,consent:true});
    expect(reply).toMatchObject({status:'confirmed',subscriptionId:subId});
    const write=p.providerCalls.find(call=>call.method==='PATCH');expect(write?.body).toEqual({cancel_at_next_billing_date:true});
    expect(p.calls[0].args.p_version).toBe(1);expect(p.calls.find(call=>call.name==='job_loop_billing_cancel_finalize')?.args.p_confirmed).toBe(true);
  });
  it('cancels an owned refunded subscription without granting or restoring revoked access',async()=>{
    const p=ports();p.rpcResults.job_loop_billing_status={generation:0,subscription:{subscriptionId:subId,plan:'weekly',status:'active',validUntil:until,periodStart:from,cancelAtPeriodEnd:true,revoked:true,revision:2,graceUntil:null},entitlement:{active:false}};
    const result=await controlLoopBilling(p.result,config(),owner,auth,{action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:subId,expectedVersion:1,consent:true});
    expect(result).toMatchObject({status:'confirmed',subscription:{subscriptionId:subId,cancelAtPeriodEnd:true,revoked:true}});
    expect(p.providerCalls.filter(call=>call.method==='PATCH')).toHaveLength(1);expect(p.providerCalls.find(call=>call.method==='PATCH')?.body).toEqual({cancel_at_next_billing_date:true});
    expect(p.calls.some(call=>call.name==='job_loop_billing_apply_event')).toBe(false);
  });
  it('reconciles ambiguous cancellation by read without repeating the PATCH',async()=>{
    const p=ports();p.rpcResults.job_loop_billing_cancel_claim={creationClaimAcquired:false};p.rpcResults.job_loop_billing_cancel_finalize={status:'uncertain',subscriptionId:subId};
    const reply=await controlLoopBilling(p.result,config(),owner,auth,{action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:subId,expectedVersion:1,consent:true});
    expect(reply).toMatchObject({status:'uncertain'});expect(p.providerCalls.some(call=>call.method==='PATCH')).toBe(false);
  });
  it('releases only a failed initial GET and retries that original cancellation with exactly one PATCH',async()=>{
    const p=ports(),original=p.result.provider;let initialGetFails=true,patches=0;
    p.result.provider=async(endpoint,body,method)=>{if(endpoint===`subscriptions/${subId}`&&!body&&initialGetFails){initialGetFails=false;throw new Error('Test read outage');}if(method==='PATCH')patches++;return original(endpoint,body,method);};
    const intent={action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:subId,expectedVersion:1,consent:true};
    await expect(controlLoopBilling(p.result,config(),owner,auth,intent)).rejects.toMatchObject({status:503,code:'LOOP_CANCELLATION_RETRYABLE'});
    expect(patches).toBe(0);expect(p.calls.filter(call=>call.name==='job_loop_billing_cancel_retryable')).toHaveLength(1);
    expect(await controlLoopBilling(p.result,config(),owner,auth,intent)).toMatchObject({status:'confirmed'});expect(patches).toBe(1);
    const claims=p.calls.filter(call=>call.name==='job_loop_billing_cancel_claim');expect(claims[0].args).toEqual(claims[1].args);
  });
  it('never releases or repeats a cancellation after any provider PATCH attempt times out',async()=>{
    const p=ports(),original=p.result.provider;let patches=0;
    p.rpcResults.job_loop_billing_cancel_finalize={status:'uncertain',subscriptionId:subId};
    p.result.provider=async(endpoint,body,method)=>{if(method==='PATCH'){patches++;throw new Error('Ambiguous Test write');}return original(endpoint,body,method);};
    const intent={action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:subId,expectedVersion:1,consent:true};
    expect(await controlLoopBilling(p.result,config(),owner,auth,intent)).toMatchObject({status:'uncertain'});p.rpcResults.job_loop_billing_cancel_claim={creationClaimAcquired:false};
    expect(await controlLoopBilling(p.result,config(),owner,auth,intent)).toMatchObject({status:'uncertain'});
    expect(patches).toBe(1);expect(p.calls.some(call=>call.name==='job_loop_billing_cancel_retryable')).toBe(false);
  });
  it('can cancel billing after career data generation changes while preserving original subscription identity',async()=>{
    const p=ports();await controlLoopBilling(p.result,config(),owner,auth,{action:'cancel',requestId:request,expectedGeneration:4,expectedSubscriptionId:subId,expectedVersion:1,consent:true});
    expect(p.calls[0].args.p_generation).toBe(4);expect(p.providerCalls.some(call=>call.method==='PATCH')).toBe(true);
  });
});
describe('signed webhook internal recurring dispatch',()=>{
  it('uses stable signed occurrence identity across refreshed mutable delivery snapshots',async()=>{
    const p=ports();await applyLoopBillingWebhook(p.result,config(),{type:'subscription.updated',created:1792310400,data:subscription()},'msg_mutable');
    const original=p.calls.find(call=>call.name==='job_loop_billing_event')?.args.p_payload_hash;p.calls.length=0;
    await applyLoopBillingWebhook(p.result,config(),{type:'subscription.updated',created:1792310400,data:subscription({status:'past_due',next_billing_date:'2026-12-18T08:00:00Z',cancel_at_next_billing_date:true})},'msg_mutable');
    expect(p.calls.find(call=>call.name==='job_loop_billing_event')?.args.p_payload_hash).toBe(original);p.calls.length=0;
    await applyLoopBillingWebhook(p.result,config(),{type:'subscription.updated',created:1792310400,data:subscription({metadata:{...metadata,request_id:'44444444-4444-4444-8444-444444444444'}})},'msg_mutable');
    expect(p.calls.find(call=>call.name==='job_loop_billing_event')?.args.p_payload_hash).not.toBe(original);
  });
  it.each(['payment.succeeded','subscription.renewed'])('does not mark %s processed while API payment still processing',async type=>{
    const p=ports();p.providerResults[`payments/${paymentId}`]=payment({status:'processing',service_periods:[]});
    const data=type==='subscription.renewed'?subscription({payment_id:paymentId}):payment();
    await expect(applyLoopBillingWebhook(p.result,config(),{type,created:1792310400,data},'msg_processing')).rejects.toMatchObject({status:503,code:'LOOP_PAYMENT_CONFIRMATION_PENDING'});
    expect(p.calls.some(call=>call.name==='job_loop_billing_apply_event')).toBe(false);
    delete p.providerResults[`payments/${paymentId}`];
    await applyLoopBillingWebhook(p.result,config(),{type,created:1792310400,data},'msg_processing');
    expect(p.calls.find(call=>call.name==='job_loop_billing_apply_event')?.args.p_payment).toBe(paymentId);
  });
  it.each(['Subscription','Payment','Refund'])('rejects missing/wrong %s payload type before provider reads',async kind=>{
    const type=kind==='Subscription'?'subscription.active':kind==='Payment'?'payment.succeeded':'refund.succeeded';
    const data=kind==='Subscription'?subscription():kind==='Payment'?payment():{payload_type:'Refund',refund_id:'ref_FixtureLoop',payment_id:paymentId,status:'succeeded',amount:2900};
    for(const value of [undefined,'Incorrect']){const p=ports();await expect(applyLoopBillingWebhook(p.result,config(),{type,created:1792310400,data:{...data,payload_type:value}},'msg_badtype')).rejects.toMatchObject({code:'INVALID_PAYMENT_EVENT'});expect(p.providerCalls).toHaveLength(0);}
  });
  it('replayed identical signed event returns without reapplying changed provider state',async()=>{
    const p=ports();p.rpcResults.job_loop_billing_event={duplicate:true};
    const result=await applyLoopBillingWebhook(p.result,config(),{type:'subscription.updated',created:1792310400,data:subscription()},'msg_old');
    expect(result).toEqual({received:true,duplicate:true});expect(p.providerCalls).toHaveLength(0);expect(p.calls).toHaveLength(1);
  });
  it('uses exact signed past-due deadline and never computes grace from delivery time',async()=>{
    const p=ports();p.providerResults[`subscriptions/${subId}`]=subscription({status:'past_due'});
    await applyLoopBillingWebhook(p.result,config(),{type:'subscription.past_due',created:1792310400,data:subscription({status:'past_due',past_due_ends_at:'2026-11-21T08:00:00Z'})},'msg_grace');
    expect(p.calls.find(call=>call.name==='job_loop_billing_apply_event')?.args).toMatchObject({p_payment:null,p_grace_until:'2026-11-21T08:00:00.000Z'});
    p.calls.length=0;
    await applyLoopBillingWebhook(p.result,config(),{type:'subscription.updated',created:1792310400,data:subscription({status:'past_due',past_due_ends_at:'2026-11-21T08:00:00Z'})},'msg_grace_updated');
    expect(p.calls.find(call=>call.name==='job_loop_billing_apply_event')?.args.p_grace_until).toBe('2026-11-21T08:00:00.000Z');
    p.calls.length=0;
    await applyLoopBillingWebhook(p.result,config(),{type:'subscription.updated',created:1792310400,data:subscription({status:'past_due'})},'msg_grace2');
    expect(p.calls.find(call=>call.name==='job_loop_billing_apply_event')?.args.p_grace_until).toBeNull();
  });
  it('does not silently acknowledge a charged subscription pending capacity reconciliation',async()=>{
    const p=ports();p.rpcResults.job_loop_billing_apply_event={pendingFulfillment:true};
    await expect(applyLoopBillingWebhook(p.result,config(),{type:'payment.succeeded',created:1792310400,data:payment()},'msg_hold')).rejects.toMatchObject({status:503,code:'LOOP_BILLING_FULFILLMENT_PENDING'});
  });
  it('cross-verifies original checkout and succeeded service period before grant',async()=>{
    const p=ports();await applyLoopBillingWebhook(p.result,config(),{type:'payment.succeeded',created:1792310400,data:payment()},'msg_paid');
    const args=p.calls.find(call=>call.name==='job_loop_billing_apply_event')?.args;
    expect(args).toMatchObject({p_user:owner,p_session:session,p_subscription:subId,p_payment:paymentId,p_paid_amount:2900,p_period_start:from,p_valid_until:until,p_status:'active'});
    expect(p.providerCalls.map(call=>call.endpoint)).toContain(`checkouts/${session}`);
  });
  it('does not grant from updated billing dates alone',async()=>{
    const p=ports();await applyLoopBillingWebhook(p.result,config(),{type:'subscription.updated',created:1792310400,data:subscription()},'msg_active');
    expect(p.calls.find(call=>call.name==='job_loop_billing_apply_event')?.args).toMatchObject({p_payment:null,p_paid_amount:null});
  });
  it('renewal requires payment_id and verifies the provider current payment',async()=>{
    const p=ports();await expect(applyLoopBillingWebhook(p.result,config(),{type:'subscription.renewed',created:1792310400,data:subscription()},'msg_renew')).rejects.toMatchObject({code:'LOOP_PAYMENT_PROOF_REQUIRED'});
    await applyLoopBillingWebhook(p.result,config(),{type:'subscription.renewed',created:1792310400,data:subscription({payment_id:paymentId})},'msg_renew2');
    expect(p.calls.find(call=>call.name==='job_loop_billing_apply_event')?.args.p_payment).toBe(paymentId);
  });
  it('rejects static subscription metadata even when it names a valid owner and request',async()=>{
    const p=ports();p.providerResults[`checkouts/${session}`]={id:session,payment_id:'pay_Different'};
    await expect(applyLoopBillingWebhook(p.result,config(),{type:'payment.succeeded',created:1792310400,data:payment()},'msg_forged')).rejects.toThrow();
    expect(p.calls.some(call=>call.name==='job_loop_billing_apply_event')).toBe(false);
  });
  it('binds authenticated refund to provider payment and revokes exact paid cycle including refund-before-payment',async()=>{
    const p=ports();await applyLoopBillingWebhook(p.result,config(),{type:'refund.succeeded',created:1792310400,data:{payload_type:'Refund',refund_id:'ref_FixtureLoop',payment_id:paymentId,status:'succeeded',amount:2900}},'msg_refund');
    expect(p.calls.find(call=>call.name==='job_loop_billing_apply_event')?.args).toMatchObject({p_revoked:true,p_payment:paymentId});
  });
  it('leaves one-time passes and unrelated provider subscriptions to their existing handler',async()=>{
    const p=ports();expect(await applyLoopBillingWebhook(p.result,config(),{type:'payment.succeeded',created:1792310400,data:{payment_id:paymentId,subscription_id:null}},'msg_pass')).toBeNull();
    expect(p.providerCalls).toHaveLength(0);
  });
});
