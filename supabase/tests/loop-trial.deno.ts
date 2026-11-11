// Deno runtime check of the seven-day trial validators used by the edge
// functions. Hermetic: no network, provider, card or database.
import { captureLoopBillingInput, LOOP_BILLING_PRODUCT, LOOP_TRIAL_DAYS, loopCheckoutBody, loopOrderTrialDays, validateLoopBillingProduct, validateLoopSubscription, validateLoopTrialStart, type LoopBillingConfig } from '../functions/_shared/loop-billing.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function throws(run: () => unknown, message: string) { try { run(); } catch { return; } throw new Error(message); }
const DAY = 86400000, start = Date.parse('2026-11-11T08:00:00Z');
const owner = '11111111-1111-4111-8111-111111111111', request = '22222222-2222-4222-8222-222222222222';
const config = { mode: 'test', provider: 'dodo', appUrl: 'https://jobvance.io', trialEnabled: true, loopProducts: { weekly: 'pdt_weekly', active: 'pdt_active', daily: 'pdt_daily' } } as LoopBillingConfig;
const sub = (changes: Record<string, unknown> = {}) => ({ subscription_id: 'sub_trial', product_id: 'pdt_weekly', quantity: 1, currency: 'USD', recurring_pre_tax_amount: 2900, payment_frequency_count: 1,
  payment_frequency_interval: 'Month', subscription_period_count: 20, subscription_period_interval: 'Year', trial_period_days: 7, on_demand: false, tax_inclusive: true, cancel_at_next_billing_date: false, status: 'active',
  previous_billing_date: new Date(start).toISOString(), next_billing_date: new Date(start + 7 * DAY).toISOString(), customer: { customer_id: 'cus_trial' },
  metadata: { product: LOOP_BILLING_PRODUCT, user_id: owner, request_id: request, generation: '0', plan: 'weekly' }, ...changes });
const zero = (changes: Record<string, unknown> = {}) => ({ payment_id: 'pay_trial', status: 'succeeded', currency: 'USD', subscription_id: 'sub_trial', customer: { customer_id: 'cus_trial' }, total_amount: 0, tax: 0, checkout_session_id: 'cks_trial', ...changes });

Deno.test('trial checkout requests exactly seven days only for a trial order', () => {
  assert(LOOP_TRIAL_DAYS === 7, 'trial length');
  assert(loopCheckoutBody(config, owner, request, 0, 'weekly').subscription_data.trial_period_days === 0, 'paid checkout keeps zero trial days');
  assert(loopCheckoutBody(config, owner, request, 0, 'weekly', 7).subscription_data.trial_period_days === 7, 'trial checkout sends seven days');
  assert(captureLoopBillingInput({ action: 'checkout', requestId: request, expectedGeneration: 0, plan: 'weekly', consent: true, trial: true }).action === 'checkout', 'explicit trial accepted');
  throws(() => captureLoopBillingInput({ action: 'checkout', requestId: request, expectedGeneration: 0, plan: 'weekly', consent: true, trial: 'yes' }), 'non-boolean trial rejected');
  throws(() => loopOrderTrialDays({ trial_days: 14 }), 'only 0 or 7 trial days');
});
Deno.test('product price stays strict and card-required', () => {
  const product = (price: Record<string, unknown> = {}) => ({ product_id: 'pdt_weekly', is_recurring: true, price: { type: 'recurring_price', price: 2900, currency: 'USD', payment_frequency_count: 1, payment_frequency_interval: 'Month', subscription_period_count: 20, subscription_period_interval: 'Year', trial_period_days: 0, tax_inclusive: true, ...price } });
  validateLoopBillingProduct(product(), config, 'weekly');
  for (const price of [{ trial_period_days: 7 }, { trial_amount: 100 }, { trial_payment_method_optional: true }, { zero_amount_payment_method_optional: true }]) throws(() => validateLoopBillingProduct(product(price), config, 'weekly'), `rejects ${JSON.stringify(price)}`);
});
Deno.test('a trial start is proven only by the original $0 payment and a seven-day window', () => {
  const verified = validateLoopSubscription(sub(), config, undefined, undefined, 7);
  throws(() => validateLoopSubscription(sub(), config), 'trial subscription rejected on a paid order');
  const trial = validateLoopTrialStart(zero(), verified, 'cks_trial');
  assert(trial.firstChargeAt === new Date(start + 7 * DAY).toISOString(), 'first charge at trial end');
  for (const changes of [{ total_amount: 2900 }, { tax: 1 }, { checkout_session_id: 'cks_other' }, { refund_status: 'full' }]) throws(() => validateLoopTrialStart(zero(changes), verified, 'cks_trial'), `rejects ${JSON.stringify(changes)}`);
});
