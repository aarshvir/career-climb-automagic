// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { dodoEnvironment } from './dodo-fixtures';
import { captureLoopBillingInput, LOOP_BILLING_PRODUCT, loopBillingConfiguration, validateLoopBillingProduct, validateLoopPaidPeriod, validateLoopSubscription } from '../functions/_shared/loop-billing.ts';
import { applyLoopBillingWebhook, controlLoopBilling, type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';
import { loopPricePreviewBody, parseLoopQuote, publicLoopPrice, storedLoopPrice, verifyLoopPricePreview, verifyLoopPriceRule } from '../functions/_shared/loop-billing-pricing.ts';
import { LOOP_LOCAL_CURRENCIES, LOOP_LOCAL_PRICE_CATALOG_VERSION, LOOP_LOCAL_PRICE_SOURCE } from '../functions/_shared/loop-local-prices.ts';
beforeAll(()=>Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true}));
const owner='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222',auth='33333333-3333-4333-8333-333333333333',quoteId='44444444-4444-4444-8444-444444444444',quoteRequest='55555555-5555-4555-8555-555555555555';
const from='2026-10-18T08:00:00.000Z',until='2026-11-18T08:00:00.000Z',productId='pdt_FixtureWeekly',subId='sub_FixtureLocal',paymentId='pay_FixtureLocal',session='cks_FixtureLocal',customer='cus_FixtureLocal';
const env=dodoEnvironment({JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:productId,DODO_PRODUCT_LOOP_ACTIVE:'pdt_FixtureActive',DODO_PRODUCT_LOOP_DAILY:'pdt_FixtureDaily'});
const config=()=>loopBillingConfiguration(key=>env[key])!;
// Retain a real earlier catalogue snapshot to prove that a new public price
// does not reprice an original checkout, paid cycle, cancellation or refund.
const historicalWeekly={USD:2900,EUR:2599,GBP:2199,INR:279900,AED:10999,CAD:4099,AUD:4199,SGD:3699,JPY:4599};
const catalog=(currency:keyof typeof LOOP_LOCAL_CURRENCIES='INR',historical=false)=>({catalogVersion:historical?'loop-local-2026-10-18-v1':LOOP_LOCAL_PRICE_CATALOG_VERSION,productId,plan:'weekly',currency,amountMinor:historical?historicalWeekly[currency]:LOOP_LOCAL_CURRENCIES[currency].amounts.weekly,exponent:LOOP_LOCAL_CURRENCIES[currency].exponent,taxInclusive:true});
const quote=(currency:keyof typeof LOOP_LOCAL_CURRENCIES='INR',historical=false)=>({...catalog(currency,historical),quoteId,requestId:quoteRequest,generation:0,mode:'test',country:'IN',interval:'month',localizedPriceId:currency==='USD'?null:'lcp_FixtureLocal',providerRevision:'a'.repeat(64),previewHash:'b'.repeat(64),initialAmountMinor:catalog(currency,historical).amountMinor,recurringAmountMinor:catalog(currency,historical).amountMinor,expiresAt:'2026-10-18T08:15:00.000Z'});
const product=(changes:Record<string,unknown>={})=>({product_id:productId,is_recurring:true,pricing_mode:'by_currency',price:{type:'recurring_price',price:2900,currency:'USD',payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,tax_inclusive:true},...changes});
const rules=(currency:keyof typeof LOOP_LOCAL_CURRENCIES='INR',historical=false)=>({items:[{id:'lcp_FixtureLocal',product_id:productId,mode:'by_currency',currency,amount:catalog(currency,historical).amountMinor,updated_at:from}]});
const preview=(currency:keyof typeof LOOP_LOCAL_CURRENCIES='INR',historical=false)=>({billing_country:'IN',currency,is_byop:false,payment_method_required:true,total_price:catalog(currency,historical).amountMinor,current_breakup:{discount:0,total_amount:catalog(currency,historical).amountMinor,tax:0},recurring_breakup:{discount:0,total_amount:catalog(currency,historical).amountMinor,tax:0},product_cart:[{product_id:productId,quantity:1,currency,is_subscription:true,is_usage_based:false,tax_inclusive:true,discount_amount:0,meters:[],addons:[]}],subscriptions:[{product_id:productId,amount_due_now:catalog(currency,historical).amountMinor,recurring_amount:catalog(currency,historical).amountMinor,trial_period_days:0}]});
const metadata={product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly',quote_id:quoteId};
const subscription=(changes:Record<string,unknown>={})=>({payload_type:'Subscription',subscription_id:subId,product_id:productId,quantity:1,currency:'INR',recurring_pre_tax_amount:250000,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:false,status:'active',previous_billing_date:from,next_billing_date:until,customer:{customer_id:customer},metadata,...changes});
const payment=(changes:Record<string,unknown>={},amount=299900)=>({payload_type:'Payment',payment_id:paymentId,status:'succeeded',currency:'INR',subscription_id:subId,subscription_ids:[subId],is_multi_subscription:false,is_update_payment_method:false,customer:{customer_id:customer},total_amount:amount,tax:29900,checkout_session_id:session,service_periods:[{subscription_id:subId,starts_at:from,ends_at:until}],...changes});
async function fixture(currency:keyof typeof LOOP_LOCAL_CURRENCIES='INR',historical=false) {
  const q=quote(currency,historical),expected=storedLoopPrice({pricing:q},'weekly');
  const rule=await verifyLoopPriceRule(product(),rules(currency,historical),config(),expected),hash=await verifyLoopPricePreview(preview(currency,historical),expected);
  Object.assign(q,rule,{previewHash:hash});
  let cancelled=false;
  const calls:{name:string,args:Record<string,unknown>}[]=[],reads:{endpoint:string,body?:Record<string,unknown>,method?:string}[]=[];
  const order={user_id:owner,request_id:request,generation:0,session_id:session,plan:'weekly',product_id:productId,pricing:q};
  const replies:Record<string,Record<string,unknown>>={job_loop_billing_quote_candidate:{quote:null,catalog:catalog(currency)},job_loop_billing_quote_issue:q,job_loop_billing_quote_read:q,job_loop_billing_checkout_claim_v2:{...order,state:'creating',creationClaimAcquired:true},job_loop_billing_checkout_finalize:{},job_loop_billing_checkout_fail:{},job_loop_billing_event:{duplicate:false},job_loop_billing_order:order,job_loop_billing_apply_event_v2:{duplicate:false},job_loop_billing_cancel_claim:{creationClaimAcquired:true},job_loop_billing_cancel_finalize:{status:'confirmed'},job_loop_billing_status_v2:{generation:0,subscription:{subscriptionId:subId,plan:'weekly',status:'active',periodStart:from,validUntil:until,cancelAtPeriodEnd:true,revoked:false,revision:2,pricing:q},checkout:null,entitlement:{active:true}}};
  const values:Record<string,Record<string,unknown>>={};
  const ports:LoopBillingPorts={now:()=>Date.parse(from),rpc:async<T>(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return replies[name] as T;},provider:async(endpoint,body,method)=>{
    reads.push({endpoint,body,method});if(values[endpoint])return values[endpoint];
    if(endpoint===`products/${productId}`)return product();if(endpoint===`products/${productId}/localized-prices`)return rules(currency,historical);if(endpoint==='checkouts/preview')return preview(currency,historical);
    if(endpoint==='checkouts')return{session_id:session,checkout_url:`https://test.checkout.dodopayments.com/session/${session}`};
    if(endpoint===`checkouts/${session}`)return{id:session,payment_id:paymentId};if(endpoint===`payments/${paymentId}`)return payment({},q.amountMinor);
    if(endpoint===`subscriptions/${subId}`){if(method==='PATCH')cancelled=true;return subscription({cancel_at_next_billing_date:cancelled});}throw new Error('Unplanned network blocked');
  }};
  return {q,ports,calls,reads,replies,values,order};
}
describe('fixed local currency money authority',()=>{
  it('derives all 27 v2 whole-currency amounts from retained rates with exact integer rounding',()=>{
    expect(LOOP_LOCAL_PRICE_CATALOG_VERSION).toBe('loop-local-2026-10-18-v2');
    const rational=(value:string)=>{const [whole,fraction='']=value.split('.');return{n:BigInt(whole+fraction),d:10n**BigInt(fraction.length)};};
    const nearest=(n:bigint,d:bigint)=>(2n*n+d)/(2n*d);
    const usd=rational(LOOP_LOCAL_PRICE_SOURCE.eurRates.USD);
    for(const currency of Object.keys(LOOP_LOCAL_CURRENCIES) as (keyof typeof LOOP_LOCAL_CURRENCIES)[])for(const plan of ['weekly','active','daily'] as const){
      const base={weekly:29n,active:59n,daily:99n}[plan];
      let expected=base*100n;
      if(currency!=='USD'){
        const rate=currency==='AED'?rational(LOOP_LOCAL_PRICE_SOURCE.aedPerUsd):rational(LOOP_LOCAL_PRICE_SOURCE.eurRates[currency]);
        const n=base*rate.n*(currency==='AED'?1n:usd.d),d=rate.d*(currency==='AED'?1n:usd.n);
        const major=currency==='INR'||currency==='JPY'?nearest(n,d*1000n)*1000n-1n:n<100n*d?nearest(n,d):nearest(n,d*10n)*10n-1n;
        expected=major*(currency==='JPY'?1n:100n);
      }
      expect(BigInt(LOOP_LOCAL_CURRENCIES[currency].amounts[plan]),`${currency}/${plan}`).toBe(expected);
      expect(LOOP_LOCAL_CURRENCIES[currency].amounts[plan]%10**LOOP_LOCAL_CURRENCIES[currency].exponent).toBe(0);
    }
  });
  it.each(Object.keys(LOOP_LOCAL_CURRENCIES) as (keyof typeof LOOP_LOCAL_CURRENCIES)[])('verifies fixed %s minor units without live FX or a two-decimal assumption',async currency=>{
    const f=await fixture(currency);expect(parseLoopQuote(f.q)).toMatchObject({currency,amountMinor:catalog(currency).amountMinor,exponent:catalog(currency).exponent});
    expect(await verifyLoopPricePreview(preview(currency),storedLoopPrice({pricing:f.q},'weekly'))).toBe(f.q.previewHash);
  });
  it('accepts currency rules on unchanged USD base and rejects country-based/adaptive substitutions',()=>{
    expect(()=>validateLoopBillingProduct(product(),config(),'weekly')).not.toThrow();expect(()=>validateLoopBillingProduct(product({pricing_mode:'by_country'}),config(),'weekly')).toThrow();
  });
  it('never treats a missing quote as authority for a nonUSD payment',()=>{
    expect(()=>validateLoopSubscription(subscription(),config())).toThrow();expect(()=>storedLoopPrice({pricing:{...quote(),quoteId:null}},'weekly')).toThrow();
  });
  it('binds taxed recurring and paid totals to the original immutable quote',()=>{
    const price=storedLoopPrice({pricing:quote()},'weekly'),sub=validateLoopSubscription(subscription(),config(),price);
    expect(validateLoopPaidPeriod(payment(),sub)).toMatchObject({amount:299900});
    for(const changes of [{currency:'USD'},{total_amount:2900},{total_amount:299901},{tax:300000}])expect(()=>validateLoopPaidPeriod(payment(changes),sub)).toThrow();
    expect(()=>validateLoopSubscription(subscription({currency:'USD'}),config(),price)).toThrow();
    expect(()=>validateLoopSubscription(subscription({metadata:{...metadata,quote_id:request}}),config(),price)).toThrow();
  });
  it('preserves USD29 and its exact product after the current catalogue product changes',()=>{
    const legacy={...metadata};delete(legacy as Record<string,unknown>).quote_id;
    const price=storedLoopPrice({product_id:productId},'weekly');
    const rotated={...config(),loopProducts:{...config().loopProducts,weekly:'pdt_NewVersion'}};
    const sub=validateLoopSubscription(subscription({currency:'USD',recurring_pre_tax_amount:2700,metadata:legacy}),rotated,price);
    expect(validateLoopPaidPeriod(payment({currency:'USD',total_amount:2900,tax:200}),sub).amount).toBe(2900);
  });
  it.each([{current_breakup:{discount:0,total_amount:299901}},{recurring_breakup:{discount:0,total_amount:299899}},{currency:'AED'},{billing_country:'US'},{is_byop:true},{trial_period_days:14},{payment_method_required:false},{subscriptions:[{product_id:productId,amount_due_now:299900,recurring_amount:299901}]}])('rejects changed, trial or mismatched preview before payment',async change=>{
    await expect(verifyLoopPricePreview({...preview(),...change},storedLoopPrice({pricing:quote()},'weekly'))).rejects.toMatchObject({code:'LOOP_BILLING_PRICE_CHANGED'});
  });
  it('rejects conflicting localized rule identity or duplicate currency rules',async()=>{
    const expected=storedLoopPrice({pricing:quote()},'weekly');
    for(const change of [{amount:299901},{mode:'by_country'},{product_id:'pdt_Other'},{country_code:'IN'}])await expect(verifyLoopPriceRule(product(),{items:[{...rules().items[0],...change}]},config(),expected)).rejects.toThrow();
    await expect(verifyLoopPriceRule(product(),{items:[rules().items[0],rules().items[0]]},config(),expected)).rejects.toThrow();
  });
});
describe('authenticated immutable quote, checkout and lifecycle orchestration',()=>{
  it('authenticates candidate before provider reads and issues only the exact reviewed server catalogue',async()=>{
    const f=await fixture(),result=await controlLoopBilling(f.ports,config(),owner,auth,{action:'quote',requestId:quoteRequest,expectedGeneration:0,plan:'weekly',country:'IN',currency:'INR'});
    expect(result).toEqual({...publicLoopPrice(parseLoopQuote(f.q)),quoteId,requestId:quoteRequest,generation:0,plan:'weekly',expiresAt:f.q.expiresAt});
    expect(f.calls[0]).toEqual({name:'job_loop_billing_quote_candidate',args:{p_user:owner,p_auth_session:auth,p_generation:0,p_request:quoteRequest,p_mode:'test',p_plan:'weekly',p_country:'IN',p_currency:'INR'}});
    expect(f.calls[1].args).toMatchObject({p_initial_amount:299900,p_recurring_amount:299900,p_product:productId,p_rule:'lcp_FixtureLocal'});
    expect(f.reads.some(call=>call.endpoint==='checkouts')).toBe(false);expect(f.reads.find(call=>call.endpoint==='checkouts/preview')?.body).toEqual(loopPricePreviewBody(storedLoopPrice({pricing:f.q},'weekly')));
  });
  it('rejects browser amounts, owner, unconfigured currency and wrong country before quote issue',async()=>{
    const input={action:'quote',requestId:quoteRequest,expectedGeneration:0,plan:'weekly',country:'IN',currency:'INR'};
    for(const change of [{amountMinor:1},{owner},{consent:true},{country:'india'}])expect(()=>captureLoopBillingInput({...input,...change})).toThrow();
    const f=await fixture();f.replies.job_loop_billing_quote_candidate={quote:null,catalog:{...catalog(),amountMinor:1}};
    await expect(controlLoopBilling(f.ports,config(),owner,auth,input)).rejects.toThrow();expect(f.reads).toHaveLength(0);
  });
  it('creates a pinned local checkout only after a second exact price verification',async()=>{
    const f=await fixture(),result=await controlLoopBilling(f.ports,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',quoteId,consent:true});
    expect(result).toMatchObject({requestId:request,generation:0,pricing:{quoteId,currency:'INR',amountMinor:299900,exponent:2}});
    const body=f.reads.find(call=>call.endpoint==='checkouts')!.body!;expect(body).toMatchObject({billing_currency:'INR',billing_address:{country:'IN'},metadata:{...metadata},feature_flags:{allow_currency_selection:false,allow_customer_editing_country:false}});
    expect(f.calls.find(call=>call.name==='job_loop_billing_checkout_claim_v2')?.args).toMatchObject({p_quote:quoteId,p_product:productId,p_request:request});
    expect(f.reads.filter(call=>call.endpoint==='checkouts/preview')).toHaveLength(1);
  });
  it('does not send a provider checkout when its last preview changes; only known-no-write becomes retryable',async()=>{
    const f=await fixture();f.values['checkouts/preview']={...preview(),currency:'AED'};
    await expect(controlLoopBilling(f.ports,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',quoteId,consent:true})).rejects.toMatchObject({code:'LOOP_BILLING_PRICE_CHANGED'});
    expect(f.reads.some(call=>call.endpoint==='checkouts')).toBe(false);expect(f.calls.find(call=>call.name==='job_loop_billing_checkout_fail')?.args.p_retryable).toBe(true);
  });
  it.each(['INR','EUR'] as const)('resumes an original v1 %s ready checkout after quote expiry without repricing or another POST',async currency=>{
    const f=await fixture(currency,true);f.q.expiresAt='2026-10-18T07:59:00.000Z';f.replies.job_loop_billing_checkout_claim_v2={...f.order,state:'ready',creationClaimAcquired:false,checkout_url:`https://test.checkout.dodopayments.com/session/${session}`,created_at:from};
    expect(await controlLoopBilling(f.ports,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',quoteId,consent:true})).toMatchObject({pricing:{currency,amountMinor:historicalWeekly[currency],catalogVersion:'loop-local-2026-10-18-v1'}});
    expect(f.reads).toHaveLength(0);
  });
  it('holds an ambiguous original checkout without repricing or repeating any provider write',async()=>{
    const f=await fixture('INR',true);f.replies.job_loop_billing_checkout_claim_v2={...f.order,state:'uncertain',creationClaimAcquired:false,session_id:null};
    await expect(controlLoopBilling(f.ports,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',quoteId,consent:true})).rejects.toMatchObject({code:'LOOP_CHECKOUT_RECOVERY_REQUIRED'});expect(f.reads).toHaveLength(0);
  });
  it('holds an unused old quote if the provider changed its rule, instead of silently charging the new price',async()=>{
    const f=await fixture('INR',true);f.values[`products/${productId}/localized-prices`]=rules();f.values['checkouts/preview']=preview();
    await expect(controlLoopBilling(f.ports,config(),owner,auth,{action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',quoteId,consent:true})).rejects.toMatchObject({code:'LOOP_BILLING_PRICE_CHANGED'});
    expect(f.reads.some(call=>call.endpoint==='checkouts')).toBe(false);
    expect(f.calls.find(call=>call.name==='job_loop_billing_checkout_fail')?.args.p_retryable).toBe(true);
  });
  it('rejects the new price as payment for a historical v1 contract instead of repricing its paid cycle',async()=>{
    const f=await fixture('INR',true);f.values[`payments/${paymentId}`]=payment();
    await expect(applyLoopBillingWebhook(f.ports,config(),{type:'subscription.renewed',created:1792310400,data:subscription({payment_id:paymentId})},'msg_OldQuoteNewPrice')).rejects.toThrow();
    expect(f.calls.some(call=>call.name==='job_loop_billing_apply_event_v2')).toBe(false);
  });
  it('routes a verified local renewal using its exact owned quote despite current product rotation',async()=>{
    const f=await fixture('INR',true),rotated={...config(),loopProducts:{...config().loopProducts,weekly:'pdt_NewVersion'}};
    await applyLoopBillingWebhook(f.ports,rotated,{type:'subscription.renewed',created:1792310400,data:subscription({payment_id:paymentId})},'msg_LocalRenewal');
    expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_quote:quoteId,p_currency:'INR',p_paid_amount:279900,p_payment:paymentId,p_product:productId});
    expect(f.calls.some(call=>call.name==='job_loop_billing_apply_event')).toBe(false);expect(f.reads.some(call=>call.endpoint.startsWith('products/'))).toBe(false);
  });
  it('revokes an explicit local-currency refund only after binding it to the API-read original charge',async()=>{
    const f=await fixture('INR',true);
    await applyLoopBillingWebhook(f.ports,config(),{type:'refund.succeeded',created:1792310400,data:{payload_type:'Refund',refund_id:'ref_LocalFixture',payment_id:paymentId,status:'succeeded',amount:279900,currency:'INR'}},'msg_LocalRefund');
    expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_revoked:true,p_currency:'INR',p_paid_amount:279900,p_quote:quoteId});
    const wrong=await fixture();await expect(applyLoopBillingWebhook(wrong.ports,config(),{type:'refund.succeeded',created:1792310400,data:{payload_type:'Refund',refund_id:'ref_WrongCurrency',payment_id:paymentId,status:'succeeded',amount:279900,currency:'JPY'}},'msg_WrongRefund')).rejects.toThrow();
    expect(wrong.calls.some(call=>call.name==='job_loop_billing_apply_event_v2')).toBe(false);
  });
  it('cancels historical local billing using its original price, not today’s selected market',async()=>{
    const f=await fixture('INR',true),rotated={...config(),loopProducts:{...config().loopProducts,weekly:'pdt_NewVersion'}};
    const result=await controlLoopBilling(f.ports,rotated,owner,auth,{action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:subId,expectedVersion:1,consent:true,contractVersion:2});
    expect(result).toMatchObject({status:'confirmed',subscription:{pricing:{currency:'INR',amountMinor:279900,quoteId}}});expect(f.reads.filter(call=>call.method==='PATCH')).toHaveLength(1);
  });
  it('projects original money for v2 and asks old nonUSD tabs to refresh instead of displaying USD',async()=>{
    const f=await fixture('INR',true);f.replies.job_loop_billing_status=f.replies.job_loop_billing_status_v2;
    const result=await controlLoopBilling(f.ports,config(),owner,auth,{action:'status',contractVersion:2});
    expect(result).toMatchObject({subscription:{pricing:{currency:'INR',amountMinor:279900,quoteId}},billingConfigured:true});
    await expect(controlLoopBilling(f.ports,config(),owner,auth,{action:'status'})).rejects.toMatchObject({code:'LOOP_BILLING_CONTRACT_REQUIRED'});
  });
});
const historicalAccountingFixture=()=>fixture('INR',true);
describe('provider accounting separated from actual localized customer charges',()=>{
  const fixture=()=>historicalAccountingFixture();
  const accountingPayment=(changes:Record<string,unknown>={})=>payment({settlement_currency:'USD',settlement_amount:2834,settlement_tax:432,...changes},279900);
  const anchor=(changes:Record<string,unknown>={})=>({paymentId,subscriptionId:subId,customerId:customer,quoteId,currency:'INR',amountMinor:279900,accountingCurrency:'USD',accountingAmountMinor:2947,settlementCurrency:'USD',settlementAmountMinor:2834,settlementTaxMinor:432,periodStart:from,validUntil:until,...changes});
  it('records the API USD accounting tuple only after the exact INR charge is independently verified',async()=>{
    const f=await fixture();f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:2947});f.values[`payments/${paymentId}`]=accountingPayment();
    await applyLoopBillingWebhook(f.ports,config(),{type:'payment.succeeded',created:1792310400,data:accountingPayment()},'msg_AccountInitial');
    expect(f.calls.find(call=>call.name==='job_loop_billing_accounting_bind')?.args).toMatchObject({p_user:owner,p_request:request,p_quote:quoteId,p_payment:paymentId,p_currency:'INR',p_amount:279900,p_accounting_currency:'USD',p_accounting_amount:2947,p_settlement_currency:'USD',p_settlement_amount:2834,p_settlement_tax:432});
    expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_currency:'INR',p_paid_amount:279900,p_payment:paymentId});
  });
  it.each([{currency:'USD',total_amount:2947},{currency:'INR',total_amount:279901},{customer:{customer_id:'cus_Forged'}},{service_periods:[]}])('never treats accounting or settlement as a replacement for exact customer payment %j',async change=>{
    const f=await fixture();f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:2947});f.values[`payments/${paymentId}`]=accountingPayment(change);
    await expect(applyLoopBillingWebhook(f.ports,config(),{type:'payment.succeeded',created:1792310400,data:accountingPayment()},'msg_AccountBadPay')).rejects.toThrow();
    expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind'||call.name==='job_loop_billing_apply_event_v2')).toBe(false);
  });
  it('does not manufacture a USD accounting anchor from billing dates or an unpaid original payment',async()=>{
    const f=await fixture();f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:2947});f.values[`payments/${paymentId}`]=accountingPayment({status:'processing',service_periods:[]});
    await expect(applyLoopBillingWebhook(f.ports,config(),{type:'subscription.updated',created:1792310400,data:subscription()},'msg_AccountNoPay')).rejects.toThrow();
    expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind'||call.name==='job_loop_billing_apply_event_v2')).toBe(false);
  });
  it('uses a known paid-cycle accounting tuple for status without rebinding or extending paid time',async()=>{
    const f=await fixture();f.order.providerAccounting=[anchor()];f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:2947});f.values[`payments/${paymentId}`]=accountingPayment();
    await applyLoopBillingWebhook(f.ports,config(),{type:'subscription.updated',created:1792310400,data:subscription()},'msg_AccountKnown');
    expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind')).toBe(false);expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_currency:'INR',p_paid_amount:null,p_payment:null});
  });
  it('appends a separate anchor for a newly verified paid cycle when provider USD accounting revalues',async()=>{
    const f=await fixture(),nextPayment='pay_AccountingRenewal',start='2026-11-18T08:00:00.000Z',end='2026-12-18T08:00:00.000Z';f.order.providerAccounting=[anchor()];
    f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:3100,previous_billing_date:start,next_billing_date:end});f.values[`payments/${paymentId}`]=accountingPayment();
    f.values[`payments/${nextPayment}`]=accountingPayment({payment_id:nextPayment,checkout_session_id:null,settlement_amount:2981,settlement_tax:454,service_periods:[{subscription_id:subId,starts_at:start,ends_at:end}]});
    await applyLoopBillingWebhook(f.ports,config(),{type:'subscription.renewed',created:1792310410,data:subscription({payment_id:nextPayment})},'msg_AccountRenewed');
    expect(f.calls.find(call=>call.name==='job_loop_billing_accounting_bind')?.args).toMatchObject({p_payment:nextPayment,p_currency:'INR',p_amount:279900,p_accounting_amount:3100,p_period_start:start,p_valid_until:end});expect(f.order.providerAccounting).toEqual([anchor()]);
  });
  it.each([3100,3200])('can revoke the old exact payment after the provider accounting tuple moved to %i without rebinding the old charge',async currentAmount=>{
    const f=await fixture();f.order.providerAccounting=[anchor(),anchor({paymentId:'pay_AccountingRenewal',accountingAmountMinor:3100,periodStart:'2026-11-18T08:00:00.000Z',validUntil:'2026-12-18T08:00:00.000Z'})];
    f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:currentAmount,previous_billing_date:'2026-11-18T08:00:00.000Z',next_billing_date:'2026-12-18T08:00:00.000Z'});f.values[`payments/${paymentId}`]=accountingPayment();
    await applyLoopBillingWebhook(f.ports,config(),{type:'refund.succeeded',created:1792310420,data:{payload_type:'Refund',refund_id:'ref_AccountingOld',payment_id:paymentId,status:'succeeded',amount:279900,currency:'INR'}},'msg_AccountRefundOld');
    expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind')).toBe(false);expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_revoked:true,p_currency:'INR',p_paid_amount:279900,p_payment:paymentId});
  });
  it('does not attach an unproven new accounting snapshot to a stale old paid cycle',async()=>{
    const f=await fixture();f.order.providerAccounting=[anchor()];f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:3200,previous_billing_date:'2026-11-18T08:00:00.000Z',next_billing_date:'2026-12-18T08:00:00.000Z'});f.values[`payments/${paymentId}`]=accountingPayment();
    await expect(applyLoopBillingWebhook(f.ports,config(),{type:'subscription.updated',created:1792310420,data:subscription()},'msg_AccountUnknown')).rejects.toThrow();
    expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind'||call.name==='job_loop_billing_apply_event_v2')).toBe(false);
  });
  it('retains a late already-anchored exact old payment without attaching it to the newer unproven accounting tuple',async()=>{
    const f=await fixture();f.order.providerAccounting=[anchor()];f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:3200,previous_billing_date:'2026-11-18T08:00:00.000Z',next_billing_date:'2026-12-18T08:00:00.000Z'});f.values[`payments/${paymentId}`]=accountingPayment();
    await applyLoopBillingWebhook(f.ports,config(),{type:'payment.succeeded',created:1792310400,data:accountingPayment()},'msg_AccountLateKnown');
    expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind')).toBe(false);expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_payment:paymentId,p_currency:'INR',p_paid_amount:279900,p_period_start:from,p_valid_until:until});
  });
  it('holds an unanchored late old payment when the current accounting period cannot be proven',async()=>{
    const f=await fixture();f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:3200,previous_billing_date:'2026-11-18T08:00:00.000Z',next_billing_date:'2026-12-18T08:00:00.000Z'});f.values[`payments/${paymentId}`]=accountingPayment();
    await expect(applyLoopBillingWebhook(f.ports,config(),{type:'payment.succeeded',created:1792310400,data:accountingPayment()},'msg_AccountLateUnknown')).rejects.toThrow();expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind'||call.name==='job_loop_billing_apply_event_v2')).toBe(false);
  });
  it('uses a proven current B tuple and exact late payment A only for A’s paid time without binding A to B',async()=>{
    const f=await fixture();f.order.providerAccounting=[anchor({paymentId:'pay_AccountingB',accountingAmountMinor:3100,periodStart:'2026-11-18T08:00:00.000Z',validUntil:'2026-12-18T08:00:00.000Z'})];f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:3100,previous_billing_date:'2026-11-18T08:00:00.000Z',next_billing_date:'2026-12-18T08:00:00.000Z'});f.values[`payments/${paymentId}`]=accountingPayment();
    await applyLoopBillingWebhook(f.ports,config(),{type:'payment.succeeded',created:1792310400,data:accountingPayment()},'msg_AccountProvenPeriodB');expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind')).toBe(false);expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_payment:paymentId,p_currency:'INR',p_paid_amount:279900,p_period_start:from,p_valid_until:until});
  });
  it('never grants the mutable provider next date when recording an otherwise bound accounting snapshot',async()=>{
    const f=await fixture();f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:2947,next_billing_date:'2026-11-19T08:00:00.000Z'});f.values[`payments/${paymentId}`]=accountingPayment();
    await applyLoopBillingWebhook(f.ports,config(),{type:'payment.succeeded',created:1792310400,data:accountingPayment()},'msg_AccountMovedNextDate');expect(f.calls.find(call=>call.name==='job_loop_billing_accounting_bind')?.args.p_valid_until).toBe(until);expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_period_start:from,p_valid_until:until,p_paid_amount:279900});
  });
  it('lets the verified original owner stop a revalued or unanchored accounting mandate without any access grant',async()=>{
    const f=await fixture(),provider=f.ports.provider;let cancelled=false;f.values[`payments/${paymentId}`]=accountingPayment();f.order.providerAccounting=[anchor()];
    f.ports.provider=async(endpoint,body,method)=>{if(endpoint===`subscriptions/${subId}`){if(method==='PATCH')cancelled=true;return subscription({currency:'USD',recurring_pre_tax_amount:3200,cancel_at_next_billing_date:cancelled});}return provider(endpoint,body,method);};
    await expect(controlLoopBilling(f.ports,config(),owner,auth,{action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:subId,expectedVersion:1,consent:true,contractVersion:2})).resolves.toMatchObject({status:'confirmed'});
    expect(cancelled).toBe(true);expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind'||call.name==='job_loop_billing_apply_event_v2')).toBe(false);
  });
  it('rejects a forged accounting customer before either a cancellation PATCH or refund revocation',async()=>{
    const f=await fixture();f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:3200,customer:{customer_id:'cus_Forged'}});f.values[`payments/${paymentId}`]=accountingPayment();
    await expect(controlLoopBilling(f.ports,config(),owner,auth,{action:'cancel',requestId:request,expectedGeneration:0,expectedSubscriptionId:subId,expectedVersion:1,consent:true})).rejects.toThrow();
    expect(f.reads.some(call=>call.method==='PATCH')).toBe(false);
    await expect(applyLoopBillingWebhook(f.ports,config(),{type:'refund.succeeded',created:1792310420,data:{payload_type:'Refund',refund_id:'ref_BadAccount',payment_id:paymentId,status:'succeeded',amount:279900,currency:'INR'}},'msg_AccountBadRefund')).rejects.toThrow();
    expect(f.calls.some(call=>call.name==='job_loop_billing_apply_event_v2')).toBe(false);
  });
  it('records an initial failed localized charge only as a no-grant negative state without an accounting anchor',async()=>{
    const f=await fixture();f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:2947,status:'failed'});f.values[`payments/${paymentId}`]=accountingPayment({status:'failed',service_periods:[]});
    await applyLoopBillingWebhook(f.ports,config(),{type:'payment.failed',created:1792310420,data:accountingPayment({status:'failed',service_periods:[]})},'msg_AccountFailed');
    expect(f.calls.some(call=>call.name==='job_loop_billing_accounting_bind')).toBe(false);expect(f.calls.find(call=>call.name==='job_loop_billing_apply_event_v2')?.args).toMatchObject({p_status:'failed',p_payment:null,p_paid_amount:null,p_grace_until:null,p_currency:'INR'});
  });
  it.each(['active','past_due'])('does not use a failure event to accept unproven %s accounting or grace',async status=>{
    const f=await fixture();f.values[`subscriptions/${subId}`]=subscription({currency:'USD',recurring_pre_tax_amount:2947,status});f.values[`payments/${paymentId}`]=accountingPayment({status:'failed',service_periods:[]});
    await expect(applyLoopBillingWebhook(f.ports,config(),{type:'payment.failed',created:1792310420,data:accountingPayment({status:'failed',service_periods:[]})},'msg_AccountFailureMismatch')).rejects.toThrow();expect(f.calls.some(call=>call.name==='job_loop_billing_apply_event_v2'||call.name==='job_loop_billing_accounting_bind')).toBe(false);
  });
});
