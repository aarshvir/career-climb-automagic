// @vitest-environment node
// Seven-day trial validators and the localized-currency trial route. Provider
// and SQL are local substitutes; no network, card or charge.
import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { captureLoopBillingInput, LOOP_BILLING_PRODUCT, loopCheckoutBody, loopOrderTrialDays, validateLoopBillingProduct, validateLoopSubscription, validateLoopTrialStart, type LoopBillingConfig } from '../functions/_shared/loop-billing.ts';
import { applyLoopBillingWebhook, controlLoopBilling, type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';

const DAY = 86400000;
const owner = '11111111-1111-4111-8111-111111111111', request = '22222222-2222-4222-8222-222222222222', session = '33333333-3333-4333-8333-333333333333', quote = '44444444-4444-4444-8444-444444444444';
const config = { mode: 'test', provider: 'dodo', appUrl: 'https://jobvance.io', trialEnabled: true, loopProducts: { weekly: 'pdt_weekly', active: 'pdt_active', daily: 'pdt_daily' } } as LoopBillingConfig;
const start = Date.parse('2026-11-11T08:00:00Z');
const meta = (changes: Record<string, unknown> = {}) => ({ product: LOOP_BILLING_PRODUCT, user_id: owner, request_id: request, generation: '0', plan: 'weekly', ...changes });
const sub = (changes: Record<string, unknown> = {}) => ({ subscription_id: 'sub_trial', product_id: 'pdt_weekly', quantity: 1, currency: 'USD', recurring_pre_tax_amount: 2900, payment_frequency_count: 1,
  payment_frequency_interval: 'Month', subscription_period_count: 20, subscription_period_interval: 'Year', trial_period_days: 7, on_demand: false, tax_inclusive: true, cancel_at_next_billing_date: false,
  status: 'active', previous_billing_date: new Date(start).toISOString(), next_billing_date: new Date(start + 7 * DAY).toISOString(), customer: { customer_id: 'cus_trial' }, metadata: meta(), created_at: new Date(start).toISOString(), has_payment_method: true, ...changes });
const zero = (changes: Record<string, unknown> = {}) => ({ payment_id: 'pay_trial', status: 'succeeded', currency: 'USD', subscription_id: 'sub_trial', subscription_ids: ['sub_trial'], is_multi_subscription: false,
  is_update_payment_method: false, customer: { customer_id: 'cus_trial' }, total_amount: 0, tax: 0, checkout_session_id: 'cks_trial', created_at: new Date(start - 30000).toISOString(), ...changes });
const product = (price: Record<string, unknown> = {}) => ({ product_id: 'pdt_weekly', is_recurring: true, price: { type: 'recurring_price', price: 2900, currency: 'USD', payment_frequency_count: 1,
  payment_frequency_interval: 'Month', subscription_period_count: 20, subscription_period_interval: 'Year', trial_period_days: 0, tax_inclusive: true, ...price } });
beforeAll(() => { if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto }); });

describe('trial checkout validation', () => {
  it('accepts only an explicit boolean trial choice on checkout and contract 3 on status', () => {
    const base = { action: 'checkout', requestId: request, expectedGeneration: 0, plan: 'weekly', consent: true };
    expect(captureLoopBillingInput({ ...base, trial: true })).toMatchObject({ action: 'checkout', trial: true });
    expect(captureLoopBillingInput(base)).toMatchObject({ trial: false });
    for (const trial of ['true', 1, 7, {}]) expect(() => captureLoopBillingInput({ ...base, trial })).toThrow();
    expect(captureLoopBillingInput({ action: 'status', contractVersion: 3 })).toEqual({ action: 'status', contractVersion: 3 });
    expect(() => captureLoopBillingInput({ action: 'status', contractVersion: 4 })).toThrow();
    // Trial days, discounts, amounts and add-ons are never browser inputs.
    for (const key of ['trialDays', 'trial_period_days', 'discount', 'addons', 'amount']) expect(() => captureLoopBillingInput({ ...base, trial: true, [key]: 7 })).toThrow();
  });
  it('sends seven trial days only for a trial order and keeps every other checkout field fixed', () => {
    const paid = loopCheckoutBody(config, owner, request, 0, 'weekly'), trial = loopCheckoutBody(config, owner, request, 0, 'weekly', 7);
    expect(paid.subscription_data).toEqual({ trial_period_days: 0 });
    expect(trial.subscription_data).toEqual({ trial_period_days: 7 });
    expect({ ...trial, subscription_data: null }).toEqual({ ...paid, subscription_data: null });
    expect(trial.feature_flags).toEqual({ allow_discount_code: false, allow_currency_selection: false });
    expect(trial).not.toHaveProperty('trial_amount');
  });
  it('keeps the product price strict: no product trial, no paid trial, and never card-optional', () => {
    expect(() => validateLoopBillingProduct(product(), config, 'weekly')).not.toThrow();
    for (const price of [{ trial_period_days: 7 }, { trial_amount: 100 }, { trial_payment_method_optional: true }, { zero_amount_payment_method_optional: true }, { price: 0 }, { discount: 10 }, { pay_what_you_want: true }])
      expect(() => validateLoopBillingProduct(product(price), config, 'weekly')).toThrow();
  });
  it('requires the provider subscription trial to match the server-owned order', () => {
    expect(() => validateLoopSubscription(sub(), config, undefined, undefined, 7)).not.toThrow();
    expect(() => validateLoopSubscription(sub(), config)).toThrow();
    expect(() => validateLoopSubscription(sub({ trial_period_days: 0 }), config, undefined, undefined, 7)).toThrow();
    expect(() => validateLoopSubscription(sub({ trial_period_days: 14 }), config, undefined, undefined, 7)).toThrow();
    expect(() => validateLoopSubscription(sub({ trial_amount: 100 }), config, undefined, undefined, 7)).toThrow();
    expect(loopOrderTrialDays({})).toBe(0); expect(loopOrderTrialDays({ trial_days: 7 })).toBe(7);
    for (const trial_days of [14, 1, '7', -7]) expect(() => loopOrderTrialDays({ trial_days })).toThrow();
  });
  it('binds the original trial window to the subscription creation time, even after a renewal moved the billing dates', () => {
    const renewed = sub({ previous_billing_date: new Date(start + 7 * DAY).toISOString(), next_billing_date: new Date(start + 37 * DAY).toISOString() });
    const verified = validateLoopSubscription(renewed, config, undefined, undefined, 7);
    expect(validateLoopTrialStart(zero(), verified, 'cks_trial', renewed)).toEqual({ paymentId: 'pay_trial', trialStart: new Date(start).toISOString(), firstChargeAt: new Date(start + 7 * DAY).toISOString() });
    // A renewal that started before the seven-day boundary is not a valid trial history.
    const early = sub({ previous_billing_date: new Date(start + 3 * DAY).toISOString(), next_billing_date: new Date(start + 33 * DAY).toISOString() });
    expect(() => validateLoopTrialStart(zero(), validateLoopSubscription(early, config, undefined, undefined, 7), 'cks_trial', early)).toThrow();
    const current = validateLoopSubscription(sub(), config, undefined, undefined, 7);
    expect(() => validateLoopTrialStart(zero(), current, 'cks_trial', sub({ has_payment_method: false }))).toThrow(/card-required/);
    expect(() => validateLoopTrialStart(zero({ created_at: new Date(start + 2 * DAY).toISOString() }), current, 'cks_trial', sub())).toThrow(/original trial start/);
    expect(() => validateLoopTrialStart(zero(), current, 'cks_trial', sub({ created_at: undefined }))).toThrow();
  });
  it('proves a trial start only from the exact original $0 payment and a seven-day window', () => {
    const verified = validateLoopSubscription(sub(), config, undefined, undefined, 7);
    expect(validateLoopTrialStart(zero(), verified, 'cks_trial', sub())).toEqual({ paymentId: 'pay_trial', trialStart: new Date(start).toISOString(), firstChargeAt: new Date(start + 7 * DAY).toISOString() });
    for (const changes of [{ total_amount: 2900 }, { total_amount: 100 }, { tax: 10 }, { status: 'processing' }, { checkout_session_id: 'cks_other' }, { subscription_id: 'sub_other' }, { customer: { customer_id: 'cus_other' } },
      { discount_id: 'dsc_1' }, { refund_status: 'full' }, { currency: 'EUR' }, { is_update_payment_method: true }])
      expect(() => validateLoopTrialStart(zero(changes), verified, 'cks_trial', sub())).toThrow();
    const long = validateLoopSubscription(sub({ next_billing_date: new Date(start + 14 * DAY).toISOString(), trial_period_days: 7 }), config, undefined, undefined, 7);
    expect(() => validateLoopTrialStart(zero(), long, 'cks_trial', sub({ next_billing_date: new Date(start + 14 * DAY).toISOString() }))).toThrow();
  });
});

describe('localized trial route', () => {
  it('records an INR trial with its original quote and never binds USD accounting from the $0 payment', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const pricing = { quoteId: quote, requestId: request, generation: 0, mode: 'test', productId: 'pdt_weekly', plan: 'weekly', country: 'IN', currency: 'INR', amountMinor: 299900, exponent: 2,
      catalogVersion: 'loop-local-2026-10-18-v2', taxInclusive: true, interval: 'month', initialAmountMinor: 299900, recurringAmountMinor: 299900 };
    const order = { user_id: owner, request_id: request, generation: 0, plan: 'weekly', product_id: 'pdt_weekly', session_id: 'cks_trial', trial_days: 7, quote_id: quote, pricing, providerAccounting: [] };
    const ports: LoopBillingPorts = {
      rpc: async <T>(name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return (name === 'job_loop_billing_event' ? { duplicate: false } : name === 'job_loop_billing_order' ? order : { duplicate: false }) as T; },
      provider: async path => {
        if (path === 'subscriptions/sub_trial') return sub({ currency: 'USD', recurring_pre_tax_amount: 3500, metadata: meta({ quote_id: quote }) });
        if (path === 'checkouts/cks_trial') return { id: 'cks_trial', payment_id: 'pay_trial' };
        if (path === 'payments/pay_trial') return zero({ currency: 'INR' });
        throw Error('External network forbidden: ' + path);
      },
    };
    await applyLoopBillingWebhook(ports, config, { type: 'subscription.active', created: Math.floor(start / 1000), data: { payload_type: 'Subscription', subscription_id: 'sub_trial', metadata: meta({ quote_id: quote }) } } as never, 'msg_inr');
    expect(calls.find(call => call.name === 'job_loop_billing_apply_trial')?.args).toMatchObject({ p_quote: quote, p_currency: 'INR', p_payment: 'pay_trial', p_trial_start: new Date(start).toISOString(), p_first_charge: new Date(start + 7 * DAY).toISOString() });
    expect(calls.some(call => call.name === 'job_loop_billing_accounting_bind' || call.name.startsWith('job_loop_billing_apply_event'))).toBe(false);
  });
  it('claims a quoted INR trial through the trial RPC and fails closed before any checkout when the price cannot be re-verified', async () => {
    const quoteRow = { quoteId: quote, requestId: request, generation: 0, mode: 'test', productId: 'pdt_weekly', plan: 'weekly', country: 'IN', currency: 'INR', amountMinor: 299900, exponent: 2, catalogVersion: 'loop-local-2026-10-18-v2',
      taxInclusive: true, interval: 'month', initialAmountMinor: 299900, recurringAmountMinor: 299900, expiresAt: new Date(Date.now() + 600000).toISOString(), localizedPriceId: 'lcp_inr', providerRevision: 'a'.repeat(64), previewHash: 'b'.repeat(64) };
    const posts: Record<string, unknown>[] = [], calls: string[] = [];
    const ports: LoopBillingPorts = {
      rpc: async <T>(name: string) => { calls.push(name); return (name === 'job_loop_billing_quote_read' ? quoteRow : name === 'job_loop_billing_checkout_claim_trial' ? { state: 'creating', creationClaimAcquired: true, product_id: 'pdt_weekly', trial_days: 7, pricing: quoteRow } : {}) as T; },
      provider: async (path, body) => { if (path === 'checkouts') { posts.push(body!); return { session_id: 'cks_trial', checkout_url: 'https://test.checkout.dodopayments.com/session/cks_trial' }; } throw Error('verify'); },
    };
    // Price verification fails closed here (no provider product fixture); the claim is released as retryable.
    await expect(controlLoopBilling(ports, config, owner, session, { action: 'checkout', requestId: request, expectedGeneration: 0, plan: 'weekly', consent: true, quoteId: quote, trial: true })).rejects.toThrow();
    expect(calls).toContain('job_loop_billing_checkout_claim_trial'); expect(calls).toContain('job_loop_billing_checkout_fail'); expect(posts).toHaveLength(0);
  });
});
