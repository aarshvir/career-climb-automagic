// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildCheckoutEvent, buildPurchaseEvent, buildRegistrationEvent, cleanSourceUrl, commerceEventId, firstForwardedIp, purchaseValue, registrationEventId } from '../functions/_shared/meta-conversions';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const now = Date.parse('2026-10-25T10:00:00Z');
const facts = { userId: '7d3f2a10-0c1e-4b5e-9a77-3a1e2b4c5d6e', email: '  Person@Example.COM ', createdAt: '2026-10-25T09:58:00Z', now };

describe('Meta Conversions API sign-up event', () => {
  it('uses the browser event ID and hashes the email and account ID', async () => {
    const event = await buildRegistrationEvent({ ...facts, pageUrl: 'https://jobvance.io/onboarding?utm_source=instagram#x', ip: '203.0.113.7', userAgent: 'Mozilla/5.0', fbp: 'fb.1.1729849200000.1234567890', fbc: 'fb.1.1729849200000.IwAR3abc_DEF-1' });
    expect(event).toEqual({
      event_name: 'CompleteRegistration', event_time: now / 1000, event_id: `reg_${sha(facts.userId).slice(0, 32)}`,
      action_source: 'website', event_source_url: 'https://jobvance.io/onboarding',
      user_data: { external_id: [sha(facts.userId)], em: [sha('person@example.com')], client_ip_address: '203.0.113.7', client_user_agent: 'Mozilla/5.0', fbp: 'fb.1.1729849200000.1234567890', fbc: 'fb.1.1729849200000.IwAR3abc_DEF-1' },
    });
    expect(await registrationEventId(facts.userId)).toBe(event?.event_id);
  });

  it('sends nothing for accounts older than a day or with an invalid creation time', async () => {
    expect(await buildRegistrationEvent({ ...facts, createdAt: '2026-10-24T09:59:00Z' })).toBeNull();
    expect(await buildRegistrationEvent({ ...facts, createdAt: null })).toBeNull();
    expect(await buildRegistrationEvent({ ...facts, createdAt: '2026-10-25T10:30:00Z' })).toBeNull();
  });

  it('drops malformed browser identifiers instead of forwarding them', async () => {
    const event = await buildRegistrationEvent({ ...facts, email: null, fbp: 'fb.1.x.<script>', fbc: 42, ip: firstForwardedIp('not-an-ip'), userAgent: 'x'.repeat(513) });
    expect(event?.user_data).toEqual({ external_id: [sha(facts.userId)] });
  });

  it('keeps only jobvance.io page paths and the first forwarded address', () => {
    expect(cleanSourceUrl('https://jobvance.io/auth?mode=signup&code=secret')).toBe('https://jobvance.io/auth');
    expect(cleanSourceUrl('https://evil.example/auth')).toBe('https://jobvance.io/');
    expect(cleanSourceUrl('not a url')).toBe('https://jobvance.io/');
    expect(firstForwardedIp('198.51.100.4, 10.0.0.1')).toBe('198.51.100.4');
    expect(firstForwardedIp('2001:db8::1')).toBe('2001:db8::1');
    expect(firstForwardedIp(null)).toBeNull();
  });
});

describe('Meta Conversions API checkout and purchase events', () => {
  const person = { userId: facts.userId, email: 'Person@Example.COM', pageUrl: 'https://jobvance.io/pricing?loop_checkout=success&payment_id=pay_secret', fbp: 'fb.1.1729849200000.1234567890', ip: '203.0.113.7', userAgent: 'Mozilla/5.0', now };
  const paid = { event_key: 'pay_0NabcDEF123', occurred_at: '2026-10-25T09:55:00Z', plan_label: 'Job Loop Starter', amount_minor: 2900, currency: 'USD', usd: 29 };

  it('builds a dollar Purchase from the ledger with a stable ID, the payment time and only hashed identifiers', async () => {
    const event = await buildPurchaseEvent(person, paid);
    expect(event).toEqual({
      event_name: 'Purchase', event_time: Date.parse(paid.occurred_at) / 1000, event_id: `pur_${sha(paid.event_key).slice(0, 32)}`,
      action_source: 'website', event_source_url: 'https://jobvance.io/pricing',
      user_data: { external_id: [sha(person.userId)], em: [sha('person@example.com')], client_ip_address: '203.0.113.7', client_user_agent: 'Mozilla/5.0', fbp: person.fbp },
      custom_data: { value: 29, currency: 'USD', content_name: 'Job Loop Starter', content_type: 'product', num_items: 1 },
    });
    expect(event?.event_id).toBe(await commerceEventId('purchase', paid.event_key));
    expect(JSON.stringify(event)).not.toMatch(/pay_secret|person@example|0NabcDEF123/);
  });

  it('reports the charged currency when no dollar proof exists, and respects zero-decimal currencies', () => {
    expect(purchaseValue({ amount_minor: '279900', currency: 'inr', usd: null })).toEqual({ value: 2799, currency: 'INR' });
    expect(purchaseValue({ amount_minor: 4500, currency: 'JPY', usd: null })).toEqual({ value: 4500, currency: 'JPY' });
    expect(purchaseValue({ amount_minor: 2900, currency: 'USD', usd: '29.00' })).toEqual({ value: 29, currency: 'USD' });
    expect(purchaseValue({ amount_minor: 0, currency: 'USD', usd: null })).toBeNull();
    expect(purchaseValue({ amount_minor: 2900, currency: 'US$', usd: null })).toBeNull();
  });

  it('skips a payment with no usable amount or time, and never dates a purchase in the future', async () => {
    expect(await buildPurchaseEvent(person, { ...paid, amount_minor: 0, usd: null })).toBeNull();
    expect(await buildPurchaseEvent(person, { ...paid, occurred_at: 'soon' })).toBeNull();
    expect((await buildPurchaseEvent(person, { ...paid, occurred_at: '2026-10-25T10:03:00Z' }))?.event_time).toBe(now / 1000);
  });

  it('builds InitiateCheckout with a separate stable ID and no money fields', async () => {
    const request = '5b3c1e0e-9a41-4c3f-8a52-0e1f5b0c7d11';
    const event = await buildCheckoutEvent(person, { event_key: request, plan_label: 'Job Loop Pro' });
    expect(event).toMatchObject({ event_name: 'InitiateCheckout', event_time: now / 1000, event_id: `chk_${sha(request).slice(0, 32)}`, custom_data: { content_name: 'Job Loop Pro', content_type: 'product', num_items: 1 } });
    expect(event.custom_data).not.toHaveProperty('value');
    expect(event.event_id).not.toBe(await commerceEventId('purchase', request));
  });

  it('falls back to a neutral plan name instead of forwarding odd text', async () => {
    const event = await buildCheckoutEvent(person, { event_key: 'x'.repeat(10), plan_label: '<script>alert(1)</script>' });
    expect(event.custom_data).toMatchObject({ content_name: 'Job Loop' });
  });
});
