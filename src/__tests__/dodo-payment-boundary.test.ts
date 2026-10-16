import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutSchema, entitlementSchema } from '@/lib/workspace-api';
import { openPaymentCheckout } from '@/lib/payment-checkout';

const sessionId = 'cks_FixtureSession000001';
const url = `https://test.checkout.dodopayments.com/session/${sessionId}`;

describe('Dodo checkout in the browser', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('accepts a Dodo hosted session only on Dodo checkout hosts', () => {
    expect(checkoutSchema.safeParse({ provider: 'dodo', sessionId, billingMode: 'test', url }).success).toBe(true);
    expect(checkoutSchema.safeParse({ provider: 'dodo', sessionId, billingMode: 'live', url: `https://checkout.dodopayments.com/session/${sessionId}` }).success).toBe(true);
    for (const forged of ['https://test.checkout.dodopayments.com.attacker.example/session/x', 'https://user@test.checkout.dodopayments.com/session/x',
      'http://test.checkout.dodopayments.com/session/x', 'https://test.checkout.dodopayments.com:8443/session/x', 'https://checkout.stripe.com/pay/x', 'javascript:alert(1)']) {
      expect(checkoutSchema.safeParse({ provider: 'dodo', sessionId, billingMode: 'test', url: forged }).success).toBe(false);
    }
    expect(checkoutSchema.safeParse({ provider: 'dodo', sessionId: 'cs_test_stripe', billingMode: 'test', url }).success).toBe(false);
    expect(checkoutSchema.safeParse({ provider: 'dodo', sessionId, billingMode: 'test' }).success).toBe(false);
  });
  it('accepts Dodo as the configured provider in the entitlement response', () => {
    expect(entitlementSchema.parse({ creditsRemaining: 1, expiresAt: null, billingConfigured: true, billingMode: 'test', paymentProvider: 'dodo' }).paymentProvider).toBe('dodo');
    expect(entitlementSchema.safeParse({ creditsRemaining: 1, expiresAt: null, billingConfigured: true, paymentProvider: 'lemonsqueezy' }).success).toBe(false);
  });
  it('redirects to the returned Dodo URL the same way as Stripe', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign, origin: 'https://staging.fixture.invalid' } });
    const onPaymentEvent = vi.fn();
    await openPaymentCheckout(checkoutSchema.parse({ provider: 'dodo', sessionId, billingMode: 'test', url }), onPaymentEvent);
    expect(assign).toHaveBeenCalledWith(url);
    expect(onPaymentEvent).not.toHaveBeenCalled();
  });
});
