import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adAttributionQuery, adsMeasurementAllowed, isMeasuredPath, META_PIXEL_ID, noteAccountForMeta, setAdsOptOut, trackMetaPage } from '@/lib/meta-pixel';

const calls = () => (window.fbq?.queue ?? []).map(args => [...args]);
const events = (name: string) => calls().filter(args => args[0] === 'track' && args[1] === name);
const zone = (timeZone: string) => vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone }) } as Intl.DateTimeFormat);

beforeEach(() => {
  vi.stubEnv('PROD', true);
  zone('America/New_York');
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  delete window.fbq; delete window._fbq;
  document.querySelectorAll('script[src*="fbevents"]').forEach(script => script.remove());
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
});

describe('Meta Pixel measurement boundaries', () => {
  it('measures public pages and the sign-up page but never private or sign-in return pages', () => {
    for (const path of ['/', '/onboarding', '/auth', '/pricing', '/job-loop', '/privacy', '/guides', '/guides/ats-optimization-checklist', '/for-mba/']) expect(isMeasuredPath(path)).toBe(true);
    for (const path of ['/auth/callback', '/auth/reset', '/auth/forgot-password', '/loop', '/check', '/dashboard', '/applications', '/admin', '/admin2', '/guides/a/b']) expect(isMeasuredPath(path)).toBe(false);
  });

  it('loads the pixel once with automatic page-content collection off and sends the first page view', () => {
    trackMetaPage('/');
    window.history.pushState(null, '', '/pricing');
    trackMetaPage('/pricing');
    expect(document.querySelectorAll('script[src="https://connect.facebook.net/en_US/fbevents.js"]')).toHaveLength(1);
    expect(calls().slice(0, 2)).toEqual([['set', 'autoConfig', false, META_PIXEL_ID], ['init', META_PIXEL_ID]]);
    // Later page changes are reported by Meta's own history tracking, which drops repeated manual PageViews.
    expect(events('PageView')).toHaveLength(1);
  });

  it('never starts on a private page or a sign-in return link', () => {
    for (const path of ['/loop', '/auth/callback', '/auth/reset', '/applications']) {
      window.history.replaceState(null, '', path);
      trackMetaPage(path);
    }
    expect(window.fbq).toBeUndefined();
    expect(document.querySelector('script[src*="fbevents"]')).toBeNull();
  });

  it('does not start when the browser is still on a return link', () => {
    window.history.replaceState(null, '', '/auth/callback');
    trackMetaPage('/onboarding');
    expect(window.fbq).toBeUndefined();
  });

  it('respects a saved opt-out, Global Privacy Control and European time zones', () => {
    expect(adsMeasurementAllowed()).toBe(true);
    setAdsOptOut(true);
    expect(adsMeasurementAllowed()).toBe(false);
    trackMetaPage('/');
    expect(window.fbq).toBeUndefined();
    setAdsOptOut(false);
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    expect(adsMeasurementAllowed()).toBe(false);
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
    vi.restoreAllMocks(); zone('Europe/Berlin');
    expect(adsMeasurementAllowed()).toBe(false);
  });

  it('never loads outside production builds', () => {
    vi.stubEnv('PROD', false);
    trackMetaPage('/');
    expect(window.fbq).toBeUndefined();
  });
});

describe('Meta sign-up event', () => {
  const now = Date.parse('2026-10-25T10:00:00Z');
  const user = { id: '7d3f2a10-0c1e-4b5e-9a77-3a1e2b4c5d6e', created_at: '2026-10-25T09:58:00Z' };

  it('waits on a sign-in return page and fires once on the next public page', async () => {
    window.history.replaceState(null, '', '/auth/callback');
    await noteAccountForMeta(user, now);
    expect(window.fbq).toBeUndefined();
    window.history.replaceState(null, '', '/onboarding');
    trackMetaPage('/onboarding');
    const registration = events('CompleteRegistration');
    expect(registration).toHaveLength(1);
    expect(registration[0][3]).toEqual({ eventID: expect.stringMatching(/^reg_[a-f\d]{32}$/) });
    await noteAccountForMeta(user, now);
    trackMetaPage('/pricing');
    expect(events('CompleteRegistration')).toHaveLength(1);
  });

  it('fires immediately when the account is created on the sign-up page', async () => {
    window.history.replaceState(null, '', '/auth');
    await noteAccountForMeta(user, now);
    expect(events('CompleteRegistration')).toHaveLength(1);
  });

  it('ignores existing accounts signing in', async () => {
    window.history.replaceState(null, '', '/auth');
    await noteAccountForMeta({ ...user, created_at: '2026-10-01T09:00:00Z' }, now);
    await noteAccountForMeta(null, now);
    trackMetaPage('/auth');
    expect(events('CompleteRegistration')).toHaveLength(0);
  });

  it('does not report a sign-up for an opted-out visitor', async () => {
    setAdsOptOut(true);
    window.history.replaceState(null, '', '/auth');
    await noteAccountForMeta(user, now);
    expect(window.fbq).toBeUndefined();
  });
});

describe('ad campaign tags', () => {
  it('keeps only campaign tags and the Meta click ID', () => {
    expect(adAttributionQuery('?utm_source=instagram&utm_content=C-v2-man0&fbclid=abc&next=%2Fadmin&code=secret')).toBe('&utm_source=instagram&utm_content=C-v2-man0&fbclid=abc');
    expect(adAttributionQuery('')).toBe('');
    expect(adAttributionQuery(`?utm_term=${'x'.repeat(301)}`)).toBe('');
  });
});
