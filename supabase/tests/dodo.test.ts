// @vitest-environment node
import { randomBytes, webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { billingConfiguration, JOB_PASS_PRODUCT, PASS, PASS_PLANS } from '../functions/_shared/core';
import { dodoCheckoutBody, dodoCheckoutExpiry, dodoClaimedPlan, dodoExpectedProduct, dodoLedgerRefundAmount, dodoSigningKey, parseDodoEvent, validateDodoCheckoutSession, validateDodoPayment,
  validateDodoProduct, validateDodoRefund, verifyDodoSignature } from '../functions/_shared/dodo';
import { dodoCheckoutUrl, dodoEnvelope, dodoEnvironment, dodoOwner, dodoPassEnvironment, dodoPassPayment, dodoPayment, dodoPaymentId, dodoPlanProduct, dodoPlanProducts, dodoProduct, dodoProductId,
  dodoRefund, dodoRequestId, dodoSessionId, dodoSign, dodoWebhookKey } from './dodo-fixtures';

beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });

describe('Dodo configuration is off by default and test-first', () => {
  const config = (changes: Record<string, string | undefined> = {}) => billingConfiguration(key => dodoEnvironment(changes)[key]);
  const live = { JOBVANCE_BILLING_MODE: 'live', APP_URL: 'https://jobvance.io', SUPPORT_EMAIL: 'support@example.invalid', JOBVANCE_LIVE_BILLING_REVIEWED: 'true',
    JOBVANCE_COMMERCIAL_TERMS_REVIEWED: 'true', JOBVANCE_SELLER_ELIGIBILITY_REVIEWED: 'true' };
  it('stays disabled unless billing is explicitly enabled', () => {
    expect(billingConfiguration(() => undefined)).toBeNull();
    expect(config({ JOBVANCE_BILLING_ENABLED: undefined })).toBeNull();
    expect(config({ JOBVANCE_BILLING_ENABLED: 'false' })).toBeNull();
    expect(config({ JOBVANCE_BILLING_ENABLED: 'TRUE' })).toBeNull();
  });
  it('builds a test-mode config against the documented test host', () => {
    expect(config()).toMatchObject({ provider: 'dodo', mode: 'test', productId: dodoProductId, apiBaseUrl: 'https://test.dodopayments.com', appUrl: 'https://staging.fixture.invalid' });
  });
  it('accepts a webhook secret with or without the documented whsec_ prefix', () => {
    expect(config({ DODO_PAYMENTS_WEBHOOK_KEY: dodoWebhookKey.slice('whsec_'.length) })?.provider).toBe('dodo');
  });
  it.each([
    { JOBVANCE_PAYMENT_PROVIDER: 'dodopayments' }, { JOBVANCE_PAYMENT_PROVIDER: 'Dodo' }, { JOBVANCE_PAYMENT_PROVIDER: 'stripe' }, { JOBVANCE_PAYMENT_PROVIDER: 'paddle' },
    { JOBVANCE_BILLING_MODE: undefined }, { JOBVANCE_BILLING_MODE: 'sandbox' },
    { DODO_PAYMENTS_API_KEY: '' }, { DODO_PAYMENTS_API_KEY: 'has a space' }, { DODO_PAYMENTS_API_KEY: 'dodo_live_fixture' },
    { DODO_PAYMENTS_WEBHOOK_KEY: '' }, { DODO_PAYMENTS_WEBHOOK_KEY: 'whsec_not base64!' }, { DODO_PAYMENTS_WEBHOOK_KEY: 'whsec_abc' },
    { DODO_PRODUCT_ID: '' }, { DODO_PRODUCT_ID: 'pdt_../../payments' }, { DODO_PRODUCT_ID: 'pri_wrongprovider' },
    { APP_URL: 'http://jobvance.io' }, { APP_URL: 'https://jobvance.io/redirect' },
  ])('rejects a wrong provider or an incomplete or unsafe value %#', change => expect(config(change)).toBeNull());
  it('never pairs a key that is marked for the other mode', () => {
    expect(config({ DODO_PAYMENTS_API_KEY: 'dodo_live_fixture' })).toBeNull();
    expect(config({ ...live, DODO_PAYMENTS_API_KEY: 'dodo_test_fixture', JOBVANCE_DODO_MERCHANT_APPROVAL_REVIEWED: 'true' })).toBeNull();
  });
  it('requires every live review gate plus Dodo merchant approval before live mode', () => {
    expect(config({ JOBVANCE_BILLING_MODE: 'live', APP_URL: 'https://jobvance.io' })).toBeNull();
    expect(config(live)).toBeNull();
    for (const gate of ['JOBVANCE_LIVE_BILLING_REVIEWED', 'JOBVANCE_COMMERCIAL_TERMS_REVIEWED', 'JOBVANCE_SELLER_ELIGIBILITY_REVIEWED', 'SUPPORT_EMAIL']) {
      expect(config({ ...live, JOBVANCE_DODO_MERCHANT_APPROVAL_REVIEWED: 'true', [gate]: undefined })).toBeNull();
    }
    expect(config({ ...live, JOBVANCE_PADDLE_MERCHANT_APPROVAL_REVIEWED: 'true' })).toBeNull();
    expect(config({ ...live, JOBVANCE_DODO_MERCHANT_APPROVAL_REVIEWED: 'true' })).toMatchObject({ provider: 'dodo', mode: 'live', apiBaseUrl: 'https://live.dodopayments.com' });
  });
  it('leaves Paddle as the default provider and Stripe unchanged', () => {
    expect(billingConfiguration(key => ({ JOBVANCE_BILLING_ENABLED: 'true', JOBVANCE_BILLING_MODE: 'test', APP_URL: 'http://localhost:5173', PADDLE_API_KEY: 'pdl_sdbx_apikey_fixture',
      PADDLE_PRICE_ID: `pri_${'a'.repeat(26)}`, PADDLE_WEBHOOK_SECRET: 'paddle-fixture-signing-secret' } as Record<string, string>)[key])?.provider).toBe('paddle');
    expect(billingConfiguration(key => ({ JOBVANCE_BILLING_ENABLED: 'true', JOBVANCE_PAYMENT_PROVIDER: 'stripe', JOBVANCE_BILLING_MODE: 'test', APP_URL: 'http://localhost:5173',
      STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' } as Record<string, string>)[key])?.provider).toBe('stripe');
  });
});

describe('Standard Webhooks signature verification', () => {
  const raw = dodoEnvelope('payment.succeeded', dodoPayment());
  const id = 'msg_FixtureWebhook0001';
  const now = 2000000000;
  const headers = (changes: Partial<{ id: string | null; timestamp: string | null; signature: string | null }> = {}) =>
    ({ id, timestamp: String(now), signature: dodoSign(raw, id, now), ...changes });
  it('accepts an authentic raw body and returns the webhook ID', async () => {
    await expect(verifyDodoSignature(raw, headers(), dodoWebhookKey, now)).resolves.toBe(id);
  });
  it('accepts a secret supplied without the whsec_ prefix', async () => {
    await expect(verifyDodoSignature(raw, headers(), dodoWebhookKey.slice('whsec_'.length), now)).resolves.toBe(id);
  });
  it('rejects a tampered body, a different ID and a re-signed timestamp mismatch', async () => {
    await expect(verifyDodoSignature(raw.replace('3045', '1'), headers(), dodoWebhookKey, now)).rejects.toThrow('Invalid payment signature');
    await expect(verifyDodoSignature(raw + ' ', headers(), dodoWebhookKey, now)).rejects.toThrow('Invalid payment signature');
    await expect(verifyDodoSignature(raw, headers({ id: 'msg_OtherWebhook0002' }), dodoWebhookKey, now)).rejects.toThrow('Invalid payment signature');
    await expect(verifyDodoSignature(raw, headers({ timestamp: String(now - 1) }), dodoWebhookKey, now)).rejects.toThrow('Invalid payment signature');
  });
  it('rejects a signature made with another secret', async () => {
    const otherSecret = `whsec_${randomBytes(32).toString('base64')}`;
    await expect(verifyDodoSignature(raw, headers({ signature: dodoSign(raw, id, now, otherSecret) }), dodoWebhookKey, now)).rejects.toThrow('Invalid payment signature');
    await expect(verifyDodoSignature(raw, headers(), otherSecret, now)).rejects.toThrow('Invalid payment signature');
  });
  it('rejects stale and far-future timestamps even with a valid signature', async () => {
    for (const time of [now - 301, now + 301]) {
      await expect(verifyDodoSignature(raw, headers({ timestamp: String(time), signature: dodoSign(raw, id, time) }), dodoWebhookKey, now)).rejects.toThrow('expired');
    }
    for (const time of [now - 300, now + 300]) {
      await expect(verifyDodoSignature(raw, headers({ timestamp: String(time), signature: dodoSign(raw, id, time) }), dodoWebhookKey, now)).resolves.toBe(id);
    }
  });
  it('accepts any matching v1 entry among several space-separated signatures', async () => {
    const valid = dodoSign(raw, id, now);
    const rotatedOut = dodoSign(raw, id, now, `whsec_${randomBytes(32).toString('base64')}`);
    await expect(verifyDodoSignature(raw, headers({ signature: `${rotatedOut} ${valid}` }), dodoWebhookKey, now)).resolves.toBe(id);
    await expect(verifyDodoSignature(raw, headers({ signature: `${valid} ${rotatedOut}` }), dodoWebhookKey, now)).resolves.toBe(id);
    await expect(verifyDodoSignature(raw, headers({ signature: `v2,${valid.slice(3)} ${rotatedOut}` }), dodoWebhookKey, now)).rejects.toThrow('Invalid payment signature');
  });
  it.each([
    { id: null }, { timestamp: null }, { signature: null }, { id: '' }, { id: 'msg with space' }, { id: 'x'.repeat(201) },
    { timestamp: 'not-a-time' }, { timestamp: `${now}.0` }, { timestamp: '-1' },
    { signature: '' }, { signature: 'v1' }, { signature: 'v1,' }, { signature: 'v1,abc' }, { signature: `v1,${'A'.repeat(44)}` },
  ])('rejects malformed headers %#', async change => {
    await expect(verifyDodoSignature(raw, headers(change), dodoWebhookKey, now)).rejects.toThrow();
  });
  it('rejects extra comma fields, comma-joined lists and oversize bodies', async () => {
    const valid = dodoSign(raw, id, now);
    await expect(verifyDodoSignature(raw, headers({ signature: `${valid},extra` }), dodoWebhookKey, now)).rejects.toThrow();
    await expect(verifyDodoSignature(raw, headers({ signature: `${dodoSign(raw, id, now, `whsec_${randomBytes(32).toString('base64')}`)},${valid}` }), dodoWebhookKey, now)).rejects.toThrow();
    const large = 'x'.repeat(262145);
    await expect(verifyDodoSignature(large, headers({ signature: dodoSign(large, id, now) }), dodoWebhookKey, now)).rejects.toThrow();
  });
  it('refuses secrets that are not base64 signing keys', async () => {
    expect(dodoSigningKey('whsec_not base64')).toBeNull();
    expect(dodoSigningKey('whsec_')).toBeNull();
    await expect(verifyDodoSignature(raw, headers(), 'whsec_%%%%', now)).rejects.toThrow('Invalid payment signature');
  });
});

describe('Dodo event parsing and validation', () => {
  it('parses the documented envelope and converts its ISO timestamp', () => {
    const event = parseDodoEvent(dodoEnvelope('payment.succeeded', dodoPayment()));
    expect(event).toMatchObject({ type: 'payment.succeeded', created: Math.floor(Date.parse('2026-10-17T10:00:00Z') / 1000) });
    expect(event.data.payment_id).toBe(dodoPaymentId);
  });
  it.each(['not json', '[]', JSON.stringify({ type: 'payment.succeeded', timestamp: 'yesterday', data: {} }), JSON.stringify({ timestamp: '2026-10-17T10:00:00Z', data: {} }),
    JSON.stringify({ type: 'payment.succeeded', timestamp: '2026-10-17T10:00:00Z', data: [] }), JSON.stringify({ type: 'payment.succeeded', timestamp: '2026-10-17T10:00:00Z' })])('rejects malformed events %#', raw => {
    expect(() => parseDodoEvent(raw)).toThrow();
  });
  it('accepts a $29 pass with tax added on top or included in the price', () => {
    expect(validateDodoPayment(dodoPayment(), dodoProductId)).toEqual({ paymentId: dodoPaymentId, sessionId: dodoSessionId, totalAmount: 3045, taxAmount: 145, userId: dodoOwner, requestId: dodoRequestId });
    expect(validateDodoPayment(dodoPayment({ total_amount: 2900, tax: 483 }), dodoProductId).totalAmount).toBe(2900);
    expect(validateDodoPayment(dodoPayment({ total_amount: 2900, tax: null }), dodoProductId).totalAmount).toBe(2900);
  });
  it.each([
    { status: 'processing' }, { status: 'failed' }, { currency: 'EUR' }, { currency: 'AED', total_amount: 11078 }, { total_amount: 2610, tax: 0 }, { total_amount: 3045, tax: 100 }, { total_amount: '3045' },
    { product_cart: [{ product_id: 'pdt_SomeOtherProduct', quantity: 1 }] }, { product_cart: [{ product_id: dodoProductId, quantity: 2 }] },
    { product_cart: [{ product_id: dodoProductId, quantity: 1 }, { product_id: dodoProductId, quantity: 1 }] }, { product_cart: null },
    { checkout_session_id: null }, { checkout_session_id: 'cks_bad id' }, { payment_id: 'txn_wrongprovider' },
    { subscription_id: 'sub_Fixture' }, { subscription_ids: ['sub_Fixture'] }, { discount_id: 'dsc_Fixture' }, { discounts: [{ discount_id: 'dsc_Fixture' }] },
    { metadata: { user_id: dodoOwner, request_id: dodoRequestId, product: 'premium-browser-plan' } }, { metadata: { user_id: 'someone', request_id: dodoRequestId, product: PASS.product } },
  ])('rejects payments that do not match the one-time pass %#', change => {
    expect(() => validateDodoPayment(dodoPayment(change), dodoProductId)).toThrow();
  });
  it('accepts only succeeded refunds with an amount', () => {
    expect(validateDodoRefund(dodoRefund())).toEqual({ refundId: 'ref_FixtureRefund00000001', paymentId: dodoPaymentId, amount: 3045 });
    for (const change of [{ status: 'pending' }, { status: 'review' }, { status: 'failed' }, { amount: null }, { amount: 0 }, { amount: 12.5 }, { currency: 'EUR' },
      { refund_id: 'adj_wrongprovider' }, { payment_id: null }]) expect(() => validateDodoRefund(dodoRefund(change))).toThrow();
  });
  it('records refunds in pass-price units and binds them to the same payment', () => {
    const payment = validateDodoPayment(dodoPayment(), dodoProductId);
    expect(dodoLedgerRefundAmount(validateDodoRefund(dodoRefund()), payment)).toBe(PASS.amount);
    expect(dodoLedgerRefundAmount(validateDodoRefund(dodoRefund({ amount: 1000, is_partial: true })), payment)).toBe(952);
    expect(dodoLedgerRefundAmount(validateDodoRefund(dodoRefund({ amount: 1 })), payment)).toBe(1);
    expect(() => dodoLedgerRefundAmount(validateDodoRefund(dodoRefund({ amount: 3046 })), payment)).toThrow();
    expect(() => dodoLedgerRefundAmount(validateDodoRefund(dodoRefund({ payment_id: 'pay_AnotherPayment000001' })), payment)).toThrow();
  });
});

describe('Dodo checkout shape', () => {
  it('accepts only a one-time, base-priced USD $29 product', () => {
    expect(validateDodoProduct(dodoProduct(), dodoProductId).product_id).toBe(dodoProductId);
    expect(validateDodoProduct(dodoProduct({}, { tax_inclusive: true }), dodoProductId).product_id).toBe(dodoProductId);
    for (const [changes, price] of [[{ product_id: 'pdt_Other' }, {}], [{ is_recurring: true }, {}], [{ pricing_mode: 'localized' }, {}], [{}, { type: 'recurring_price' }],
      [{}, { price: 2500 }], [{}, { currency: 'EUR' }], [{}, { pay_what_you_want: true }], [{}, { purchasing_power_parity: true }], [{}, { discount_bps: 1000 }], [{}, { discount: 10 }],
      [{ price: null }, {}]] as [Record<string, unknown>, Record<string, unknown>][]) {
      expect(() => validateDodoProduct({ ...dodoProduct({}, price), ...changes }, dodoProductId)).toThrow('one-time USD $29');
    }
  });
  it('fixes product, quantity, identity and return route on the server', () => {
    const config = billingConfiguration(key => dodoEnvironment()[key]);
    if (config?.provider !== 'dodo') throw new Error('Dodo fixture configuration expected.');
    expect(dodoCheckoutBody(config, dodoOwner, dodoRequestId)).toEqual({
      product_cart: [{ product_id: dodoProductId, quantity: 1 }],
      billing_currency: 'USD',
      return_url: 'https://staging.fixture.invalid/dashboard?checkout=success',
      cancel_url: 'https://staging.fixture.invalid/dashboard?checkout=cancelled',
      metadata: { user_id: dodoOwner, request_id: dodoRequestId, product: PASS.product },
      feature_flags: { allow_discount_code: false, allow_currency_selection: false },
    });
  });
  it('accepts only a session on the checkout host for the configured mode', () => {
    expect(validateDodoCheckoutSession({ session_id: dodoSessionId, checkout_url: dodoCheckoutUrl }, 'test')).toEqual({ sessionId: dodoSessionId, url: dodoCheckoutUrl });
    expect(validateDodoCheckoutSession({ session_id: dodoSessionId, checkout_url: `https://checkout.dodopayments.com/session/${dodoSessionId}` }, 'live').sessionId).toBe(dodoSessionId);
    for (const session of [{ session_id: dodoSessionId, checkout_url: `https://checkout.dodopayments.com/session/${dodoSessionId}` }, { session_id: dodoSessionId, checkout_url: null },
      { session_id: dodoSessionId, checkout_url: 'http://test.checkout.dodopayments.com/session/x' }, { session_id: dodoSessionId, checkout_url: 'https://test.checkout.dodopayments.com.attacker.example/x' },
      { session_id: dodoSessionId, checkout_url: 'https://user@test.checkout.dodopayments.com/x' }, { session_id: dodoSessionId, checkout_url: 'https://test.checkout.dodopayments.com:8443/x' },
      { session_id: 'cs_test_stripe', checkout_url: dodoCheckoutUrl }, { checkout_url: dodoCheckoutUrl }, null]) {
      expect(() => validateDodoCheckoutSession(session, 'test')).toThrow();
    }
  });
  it('treats a stored session as expiring 24 hours after its order was claimed', () => {
    expect(dodoCheckoutExpiry({ created_at: '2026-10-17T10:00:00Z' })).toBe(Date.parse('2026-10-18T10:00:00Z'));
    expect(dodoCheckoutExpiry({ created_at: '2026-10-17T10:00:00Z', checkout_expires_at: '2026-10-17T11:00:00Z' })).toBe(Date.parse('2026-10-17T11:00:00Z'));
    expect(dodoCheckoutExpiry({})).toBeNaN();
  });
});

describe('Dodo one-time passes', () => {
  const config = (changes: Record<string, string | undefined> = {}) => billingConfiguration(key => dodoPassEnvironment(changes)[key]);
  it('reads one product per plan and keeps the legacy product optional', () => {
    expect(config()).toMatchObject({ provider: 'dodo', productId: dodoProductId, planProducts: dodoPlanProducts });
    expect(config({ DODO_PRODUCT_ID: undefined })).toMatchObject({ provider: 'dodo', productId: null, planProducts: dodoPlanProducts });
    expect(config({ DODO_PRODUCT_ID: undefined, DODO_PRODUCT_SEARCH: undefined, DODO_PRODUCT_MOVE: undefined })?.planProducts).toEqual({ sprint_7d: dodoPlanProducts.sprint_7d });
  });
  it.each([
    { DODO_PRODUCT_SPRINT: 'pdt_../../payments' }, { DODO_PRODUCT_SEARCH: 'pri_wrongprovider' }, { DODO_PRODUCT_MOVE: 'pdt_has space' },
    { DODO_PRODUCT_MOVE: dodoPlanProducts.sprint_7d }, { DODO_PRODUCT_ID: dodoPlanProducts.search_30d },
    { DODO_PRODUCT_ID: undefined, DODO_PRODUCT_SPRINT: undefined, DODO_PRODUCT_SEARCH: undefined, DODO_PRODUCT_MOVE: undefined },
  ])('fails closed on a malformed, shared or missing product %#', change => expect(config(change)).toBeNull());
  it('keeps every live-mode gate for pass products', () => {
    expect(config({ JOBVANCE_BILLING_MODE: 'live', APP_URL: 'https://jobvance.io', SUPPORT_EMAIL: 'support@example.invalid', JOBVANCE_LIVE_BILLING_REVIEWED: 'true',
      JOBVANCE_COMMERCIAL_TERMS_REVIEWED: 'true', JOBVANCE_SELLER_ELIGIBILITY_REVIEWED: 'true', DODO_PRODUCT_ID: undefined })).toBeNull();
  });
  it('accepts each plan product only at exactly its own one-time USD price', () => {
    for (const plan of ['sprint_7d', 'search_30d', 'move_90d'] as const) {
      const { amount } = PASS_PLANS[plan];
      expect(validateDodoProduct(dodoPlanProduct(plan), dodoPlanProducts[plan], amount).product_id).toBe(dodoPlanProducts[plan]);
      expect(() => validateDodoProduct(dodoPlanProduct(plan, {}, { price: amount + 100 }), dodoPlanProducts[plan], amount)).toThrow(`one-time USD $${amount / 100}`);
      expect(() => validateDodoProduct(dodoPlanProduct(plan, {}, { currency: 'EUR' }), dodoPlanProducts[plan], amount)).toThrow();
      expect(() => validateDodoProduct(dodoPlanProduct(plan, { is_recurring: true }), dodoPlanProducts[plan], amount)).toThrow();
      expect(() => validateDodoProduct(dodoPlanProduct(plan), dodoPlanProducts[plan], PASS.amount)).toThrow();
    }
  });
  it('builds a server-fixed pass checkout from the plan key only', () => {
    const passConfig = config();
    if (passConfig?.provider !== 'dodo') throw new Error('Dodo fixture configuration expected.');
    expect(dodoExpectedProduct(passConfig, 'move_90d')).toEqual({ productId: dodoPlanProducts.move_90d, amount: 3900 });
    expect(dodoCheckoutBody(passConfig, dodoOwner, dodoRequestId, 'search_30d')).toEqual({
      product_cart: [{ product_id: dodoPlanProducts.search_30d, quantity: 1 }],
      billing_currency: 'USD',
      return_url: 'https://staging.fixture.invalid/applications?checkout=success',
      cancel_url: 'https://staging.fixture.invalid/pricing?checkout=cancelled',
      metadata: { user_id: dodoOwner, request_id: dodoRequestId, product: JOB_PASS_PRODUCT, plan: 'search_30d' },
      feature_flags: { allow_discount_code: false, allow_currency_selection: false },
    });
    const legacyOnly = billingConfiguration(key => dodoEnvironment()[key]);
    if (legacyOnly?.provider !== 'dodo') throw new Error('Dodo fixture configuration expected.');
    expect(() => dodoCheckoutBody(legacyOnly, dodoOwner, dodoRequestId, 'sprint_7d')).toThrow('not on sale');
  });
  it('reads which product a payment claims without trusting it for the grant', () => {
    expect(dodoClaimedPlan({ product: PASS.product })).toBeNull();
    expect(dodoClaimedPlan({ product: JOB_PASS_PRODUCT, plan: 'move_90d' })).toBe('move_90d');
    for (const other of [null, [], 'text', {}, { product: 'another' }, { order: 'x' }]) expect(dodoClaimedPlan(other)).toBeUndefined();
    for (const forged of [{ product: JOB_PASS_PRODUCT }, { product: JOB_PASS_PRODUCT, plan: 'lifetime' }, { product: JOB_PASS_PRODUCT, plan: 'toString' }, { product: PASS.product, plan: 'move_90d' }]) {
      expect(() => dodoClaimedPlan(forged)).toThrow('Unknown payment product');
    }
  });
  it('verifies a pass payment against its plan price, before or after tax', () => {
    expect(validateDodoPayment(dodoPassPayment('sprint_7d'), dodoPlanProducts.sprint_7d, 900, 'sprint_7d')).toMatchObject({ totalAmount: 945, taxAmount: 45, userId: dodoOwner });
    expect(validateDodoPayment(dodoPassPayment('move_90d', { total_amount: 3900, tax: 650 }), dodoPlanProducts.move_90d, 3900, 'move_90d').totalAmount).toBe(3900);
    for (const change of [{ total_amount: 2900, tax: 0 }, { total_amount: 1000, tax: 50 }, { product_cart: [{ product_id: dodoPlanProducts.move_90d, quantity: 1 }] },
      { metadata: { user_id: dodoOwner, request_id: dodoRequestId, product: JOB_PASS_PRODUCT, plan: 'move_90d' } }, { metadata: { user_id: dodoOwner, request_id: dodoRequestId, product: PASS.product } }]) {
      expect(() => validateDodoPayment(dodoPassPayment('sprint_7d', change), dodoPlanProducts.sprint_7d, 900, 'sprint_7d')).toThrow();
    }
    // A pass payment never verifies as the legacy pack, and the legacy pack never verifies as a pass.
    expect(() => validateDodoPayment(dodoPassPayment('move_90d', { total_amount: 2900, tax: 0 }), dodoPlanProducts.move_90d)).toThrow();
    expect(() => validateDodoPayment(dodoPayment(), dodoProductId, PASS.amount, 'sprint_7d')).toThrow();
  });
  it('records pass refunds in plan-price units', () => {
    const payment = validateDodoPayment(dodoPassPayment('move_90d'), dodoPlanProducts.move_90d, 3900, 'move_90d');
    expect(dodoLedgerRefundAmount(validateDodoRefund(dodoRefund({ amount: payment.totalAmount })), payment, 3900)).toBe(3900);
    expect(dodoLedgerRefundAmount(validateDodoRefund(dodoRefund({ amount: 1000, is_partial: true })), payment, 3900)).toBe(952);
  });
});
