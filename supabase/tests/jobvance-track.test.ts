import { describe, expect, it } from 'vitest';
import { cleanBatch, describeDevice, isBot } from '../functions/_shared/jobvance-track';

const visitorId = '00000000-0000-4000-8000-0000000000a1', sessionId = '00000000-0000-4000-8000-0000000000b1';
const now = Date.parse('2026-10-25T20:00:00Z');

describe('analytics intake checks', () => {
  it('keeps well-formed events and drops anything else', () => {
    const batch = cleanBatch({ visitorId, sessionId, token: 'jwt', context: { landing: '/onboarding', utm_source: 'instagram', fbclid: true, email: 'x@y.z' }, events: [
      { kind: 'page_view', at: '2026-10-25T19:59:00Z', path: '/job-loop', title: 'Job Loop' },
      { kind: 'page_leave', at: '2026-10-25T19:59:40Z', path: '/job-loop', durationMs: 40000, props: { maxScroll: 75, 'bad key': 1, nested: { no: 1 } } },
      { kind: 'keystroke', at: '2026-10-25T19:59:41Z', path: '/auth' },
      { kind: 'click', at: '2026-10-25T21:00:00Z', path: '/future' },
      { kind: 'click', at: 'yesterday', path: '/' },
      { kind: 'click', at: '2026-10-25T19:59:42Z', path: 'https://evil.example/' },
    ] }, now);
    expect(batch?.events.map(event => event.kind)).toEqual(['page_view', 'page_leave']);
    expect(batch?.events[1]).toMatchObject({ durationMs: 40000, props: { maxScroll: 75 } });
    expect(batch?.context).toEqual({ landing: '/onboarding', utm_source: 'instagram', fbclid: true });
    expect(batch?.token).toBe('jwt');
  });

  it('rejects batches without valid ids', () => {
    expect(cleanBatch({ visitorId: 'abc', sessionId, events: [] })).toBeNull();
    expect(cleanBatch({ visitorId, sessionId, events: 'nope' })).toBeNull();
    expect(cleanBatch(null)).toBeNull();
  });

  it('describes phones, in-app browsers and countries', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0', 'AE'))
      .toEqual({ device: 'mobile', browser: 'Instagram', os: 'iOS', inApp: 'Instagram', country: 'AE' });
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'not-a-country'))
      .toMatchObject({ device: 'desktop', browser: 'Chrome', os: 'Windows', inApp: null, country: null });
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot('Mozilla/5.0 (Macintosh) Safari/605.1.15')).toBe(false);
  });
});
