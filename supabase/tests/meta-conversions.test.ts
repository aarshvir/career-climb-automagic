// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildRegistrationEvent, cleanSourceUrl, firstForwardedIp, registrationEventId } from '../functions/_shared/meta-conversions';

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
