// @vitest-environment node
import { createHmac, webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { billingConfiguration } from '../functions/_shared/core';
import { validateApprovedPaddleRefund, validatePaddlePrice, validatePaddleTransaction, verifyPaddleSignature } from '../functions/_shared/paddle';
import { paddlePrice, paddlePriceId, paddleRefund, paddleTransaction, paddleTransactionId } from './paddle-fixtures';
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });

describe('Paddle configuration and seller eligibility', () => {
  const fixture: Record<string, string> = { JOBVANCE_BILLING_ENABLED: 'true', JOBVANCE_BILLING_MODE: 'test', APP_URL: 'http://localhost:5173', PADDLE_API_KEY: 'pdl_sdbx_apikey_fixture', PADDLE_PRICE_ID: paddlePriceId, PADDLE_WEBHOOK_SECRET: 'paddle-fixture-signing-secret' };
  const config = (changes: Record<string, string> = {}) => billingConfiguration(key => ({ ...fixture, ...changes })[key]);
  it('defaults to Paddle, requires explicit enablement and rejects wrong-mode keys', () => {
    expect(config()?.provider).toBe('paddle');
    expect(config({ JOBVANCE_BILLING_ENABLED: 'false' })).toBeNull();
    expect(config({ PADDLE_API_KEY: 'pdl_live_apikey_fixture' })).toBeNull();
  });
  it('keeps live billing disabled without seller eligibility and merchant approval', () => {
    const live = { JOBVANCE_BILLING_MODE: 'live', PADDLE_API_KEY: 'pdl_live_apikey_fixture', APP_URL: 'https://jobvance.io', SUPPORT_EMAIL: 'support@example.invalid', JOBVANCE_LIVE_BILLING_REVIEWED: 'true', JOBVANCE_COMMERCIAL_TERMS_REVIEWED: 'true' };
    expect(config(live)).toBeNull();
    expect(config({ ...live, JOBVANCE_SELLER_ELIGIBILITY_REVIEWED: 'true' })).toBeNull();
    expect(config({ ...live, JOBVANCE_SELLER_ELIGIBILITY_REVIEWED: 'true', JOBVANCE_PADDLE_MERCHANT_APPROVAL_REVIEWED: 'true' })?.mode).toBe('live');
  });
});
describe('Paddle product and amount validation', () => {
  it('verifies a one-time before-tax $29 price and completed transaction', () => {
    expect(validatePaddlePrice(paddlePrice(), paddlePriceId).id).toBe(paddlePriceId);
    expect(validatePaddleTransaction(paddleTransaction(), paddlePriceId).transactionId).toBe(paddleTransactionId);
  });
  it.each([{ billing_cycle: { interval: 'month', frequency: 1 } }, { trial_period: { interval: 'day', frequency: 7 } }, { tax_mode: 'internal' }, { unit_price: { amount: '290', currency_code: 'USD' } }, { unit_price: { amount: '2900', currency_code: 'EUR' } }, { unit_price_overrides: [{ country_codes: ['AE'], unit_price: { amount: '100', currency_code: 'USD' } }] }])('rejects recurring, discounted, localized and tax-inclusive catalog configuration', change => {
    expect(() => validatePaddlePrice({ ...paddlePrice(), ...change }, paddlePriceId)).toThrow();
  });
  it.each([{ status: 'paid' }, { subscription_id: 'sub_recurring' }, { currency_code: 'EUR' }, { collection_mode: 'manual' }, { items: [{ price: paddlePrice(), quantity: 2 }] }])('rejects invalid transaction context', change => expect(() => validatePaddleTransaction({ ...paddleTransaction(), ...change }, paddlePriceId)).toThrow());
  it('rejects altered line-item totals even when the catalog price is correct', () => {
    const transaction = paddleTransaction(); transaction.details.line_items[0].totals.subtotal = '100';
    expect(() => validatePaddleTransaction(transaction, paddlePriceId)).toThrow();
  });
  it('accepts only approved refunds for the correct transaction', () => {
    expect(validateApprovedPaddleRefund(paddleRefund(), paddleTransactionId)).toBe(500);
    expect(() => validateApprovedPaddleRefund({ ...paddleRefund(), status: 'pending_approval' }, paddleTransactionId)).toThrow();
    expect(() => validateApprovedPaddleRefund({ ...paddleRefund(), transaction_id: `txn_${'z'.repeat(26)}` }, paddleTransactionId)).toThrow();
    expect(() => validateApprovedPaddleRefund({ ...paddleRefund(), action: 'credit' }, paddleTransactionId)).toThrow();
    expect(() => validateApprovedPaddleRefund({ ...paddleRefund(), totals: { subtotal: '0', currency_code: 'USD' } }, paddleTransactionId)).toThrow();
  });
});
describe('Paddle raw-body signature authentication', () => {
  const secret = 'paddle-fixture-signing-secret'; const now = 2000000000; const raw = '{"event_type":"transaction.completed"}';
  const signature = (time = now) => `ts=${time};h1=${createHmac('sha256', secret).update(`${time}:${raw}`).digest('hex')}`;
  it('verifies colon-separated HMAC payloads and rotated signature headers', async () => {
    await expect(verifyPaddleSignature(raw, signature(), secret, now)).resolves.toBeUndefined();
    await expect(verifyPaddleSignature(raw, `${signature()};h1=${'0'.repeat(64)}`, secret, now)).resolves.toBeUndefined();
  });
  it('rejects altered payloads, missing signatures, old and future timestamps', async () => {
    await expect(verifyPaddleSignature(raw + ' ', signature(), secret, now)).rejects.toThrow();
    await expect(verifyPaddleSignature(raw, null, secret, now)).rejects.toThrow();
    await expect(verifyPaddleSignature(raw, signature(now - 6), secret, now)).rejects.toThrow();
    await expect(verifyPaddleSignature(raw, signature(now + 6), secret, now)).rejects.toThrow();
  });
});
