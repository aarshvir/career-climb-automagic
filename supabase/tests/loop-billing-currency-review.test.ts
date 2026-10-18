// @vitest-environment node
// Independent currency boundary: the numeric price is deliberately correct in
// every negative case, so rejection cannot be explained by an amount mismatch.
import { describe, expect, it } from 'vitest';
import { LOOP_BILLING_PLANS, validateLoopPaidPeriod, type LoopBillingPlan, type LoopSubscription } from '../functions/_shared/loop-billing';

describe('independent fixed-USD payment authority review',()=>{
  it.each(Object.keys(LOOP_BILLING_PLANS) as LoopBillingPlan[])('rejects non-USD %s payment even at the exact advertised numeric amount',plan=>{
    const sub:LoopSubscription={subscriptionId:'sub_CurrencyReview',userId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222',generation:0,plan,productId:'pdt_CurrencyReview',customerId:'cus_CurrencyReview',status:'active',periodStart:'2026-10-18T00:00:00Z',validUntil:'2026-11-18T00:00:00Z',cancelAtPeriodEnd:false,taxInclusive:true,currency:'USD',amountMinor:LOOP_BILLING_PLANS[plan].amount};
    const payment={payment_id:'pay_CurrencyReview',status:'succeeded',currency:'USD',subscription_id:sub.subscriptionId,subscription_ids:[sub.subscriptionId],customer:{customer_id:sub.customerId},total_amount:LOOP_BILLING_PLANS[plan].amount,tax:0,checkout_session_id:'cks_CurrencyReview',service_periods:[{subscription_id:sub.subscriptionId,starts_at:sub.periodStart,ends_at:sub.validUntil}]};
    expect(validateLoopPaidPeriod(payment,sub).amount).toBe(LOOP_BILLING_PLANS[plan].amount);
    for(const currency of ['AED','EUR','INR'])expect(()=>validateLoopPaidPeriod({...payment,currency},sub)).toThrow();
  });
});
