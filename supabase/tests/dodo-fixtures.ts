import { createHmac, randomBytes } from 'node:crypto';
import { PASS } from '../functions/_shared/core.ts';

// Invented test-mode values only. The signing secret is random per test run, and every
// signature is computed below with an independent HMAC implementation (node:crypto).
export const dodoOwner = '11111111-1111-4111-8111-111111111111';
export const dodoRequestId = '33333333-3333-4333-8333-333333333333';
export const dodoProductId = 'pdt_FixtureJobvancePass01';
export const dodoSessionId = 'cks_FixtureSession000001';
export const dodoPaymentId = 'pay_FixturePayment0000001';
export const dodoRefundId = 'ref_FixtureRefund00000001';
export const dodoApiKey = 'fixture-dodo-test-key-not-a-credential';
export const dodoWebhookKey = `whsec_${randomBytes(32).toString('base64')}`;
export const dodoCheckoutUrl = `https://test.checkout.dodopayments.com/session/${dodoSessionId}`;

export function dodoEnvironment(changes: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { JOBVANCE_BILLING_ENABLED: 'true', JOBVANCE_PAYMENT_PROVIDER: 'dodo', JOBVANCE_BILLING_MODE: 'test', APP_URL: 'https://staging.fixture.invalid',
    DODO_PAYMENTS_API_KEY: dodoApiKey, DODO_PAYMENTS_WEBHOOK_KEY: dodoWebhookKey, DODO_PRODUCT_ID: dodoProductId, ...changes };
}

export function dodoProduct(changes: Record<string, unknown> = {}, price: Record<string, unknown> = {}) {
  return { product_id: dodoProductId, business_id: 'bus_FixtureBusiness', is_recurring: false, pricing_mode: null, name: 'Jobvance: 10 application packs, valid 30 days',
    price: { type: 'one_time_price', price: PASS.amount, currency: 'USD', discount: 0, discount_bps: 0, pay_what_you_want: false, purchasing_power_parity: false, tax_inclusive: false, ...price },
    ...changes };
}

/** A tax-exclusive $29 purchase: Dodo adds $1.45 tax on top. */
export function dodoPayment(changes: Record<string, unknown> = {}) {
  return { payload_type: 'Payment', payment_id: dodoPaymentId, business_id: 'bus_FixtureBusiness', checkout_session_id: dodoSessionId, status: 'succeeded',
    total_amount: 3045, tax: 145, currency: 'USD', subscription_id: null, subscription_ids: [], discount_id: null, discounts: [],
    product_cart: [{ product_id: dodoProductId, quantity: 1 }], metadata: { user_id: dodoOwner, request_id: dodoRequestId, product: PASS.product },
    customer: { customer_id: 'cus_FixtureCustomer', email: 'fixture@example.invalid', name: 'Fixture Buyer' }, ...changes };
}

export function dodoRefund(changes: Record<string, unknown> = {}) {
  return { payload_type: 'Refund', refund_id: dodoRefundId, payment_id: dodoPaymentId, business_id: 'bus_FixtureBusiness', status: 'succeeded', amount: 3045,
    currency: 'USD', is_partial: false, metadata: {}, created_at: '2026-10-17T10:00:00Z', ...changes };
}

export function dodoEnvelope(type: string, data: Record<string, unknown>) {
  return JSON.stringify({ business_id: 'bus_FixtureBusiness', type, timestamp: '2026-10-17T10:00:00Z', data });
}

/** Standard Webhooks signature: base64(HMAC-SHA256(base64-decoded secret, `id.timestamp.body`)). */
export function dodoSign(raw: string, id: string, timestamp: number | string, secret = dodoWebhookKey): string {
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64')}`;
}
