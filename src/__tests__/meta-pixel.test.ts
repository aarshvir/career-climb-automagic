import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adAttributionQuery, adsMeasurementAllowed, isMeasuredPath, META_PIXEL_ID, noteAccountForMeta, setAdsOptOut, trackMetaPage } from '@/lib/meta-pixel';
import { registrationEventId } from '../../supabase/functions/_shared/meta-conversions';

const invoke = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { sent: false }, error: null })));
const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke }, auth: { getSession } } }));

const calls = () => (window.fbq?.queue ?? []).map(args => [...args]);
const events = (name: string) => calls().filter(args => args[0] === 'track' && args[1] === name);
const pageViews = () => calls().filter(args => args[0] === 'trackSingle' && args[1] === META_PIXEL_ID && args[2] === 'PageView');
const zone = (timeZone: string) => vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone }) } as Intl.DateTimeFormat);

beforeEach(() => {
  vi.stubEnv('PROD', true);
  zone('America/New_York');
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  void noteAccountForMeta(null);
  setAdsOptOut(false);
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

  it('loads once, reports public page transitions and turns off automatic collection and history tracking', () => {
    trackMetaPage('/');
    window.history.pushState(null, '', '/pricing');
    trackMetaPage('/pricing');
    expect(document.querySelectorAll('script[src="https://connect.facebook.net/en_US/fbevents.js"]')).toHaveLength(1);
    expect(window.fbq?.disablePushState).toBe(true);
    expect(calls().slice(0, 2)).toEqual([['set', 'autoConfig', false, META_PIXEL_ID], ['init', META_PIXEL_ID]]);
    expect(pageViews()).toHaveLength(2);
    expect(events('PageView')).toHaveLength(0);
  });

  it('does not send another public PageView after opt-out or a duplicate router notification', () => {
    trackMetaPage('/'); trackMetaPage('/');
    expect(pageViews()).toHaveLength(1);
    setAdsOptOut(true);
    window.history.pushState(null, '', '/pricing'); trackMetaPage('/pricing');
    expect(pageViews()).toHaveLength(1);
  });

  it('sends nothing after the visitor moves from a public page into a private one', async () => {
    trackMetaPage('/');
    const before = calls().length;
    window.history.pushState(null, '', '/loop');
    trackMetaPage('/loop');
    await noteAccountForMeta({ id: 'a1b2c3', created_at: new Date().toISOString() });
    expect(calls()).toHaveLength(before);
    window.history.pushState(null, '', '/pricing');
    trackMetaPage('/pricing');
    expect(events('CompleteRegistration')).toHaveLength(1);
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

  it('measures United Kingdom visitors and still excludes other European zones', () => {
    for (const uk of ['Europe/London', 'Europe/Belfast']) {
      vi.restoreAllMocks(); zone(uk);
      expect(adsMeasurementAllowed()).toBe(true);
    }
    for (const other of ['Europe/Dublin', 'Europe/Paris', 'Europe/Londonderry', 'Atlantic/Canary']) {
      vi.restoreAllMocks(); zone(other);
      expect(adsMeasurementAllowed()).toBe(false);
    }
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

  it('asks the server for a copy with the same event ID and only the page path', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      invoke.mockClear();
      document.cookie = '_fbp=fb.1.1729849200000.1234567890';
      window.history.replaceState(null, '', '/auth?mode=signup&utm_source=instagram');
      const sessionId = '22222222-2222-4222-8222-222222222222';
      const access_token = `fixture.${btoa(JSON.stringify({ sub: user.id, session_id: sessionId }))}.fixture`;
      getSession.mockResolvedValue({ data: { session: { user, access_token } }, error: null });
      await noteAccountForMeta(user, now, sessionId);
      expect(invoke).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      expect(invoke).toHaveBeenCalledWith('meta-conversions', { body: { pageUrl: `${window.location.origin}/auth`, fbp: 'fb.1.1729849200000.1234567890', fbc: undefined }, headers: { Authorization: `Bearer ${access_token}` } });
      expect(events('CompleteRegistration')[0][3]).toEqual({ eventID: await registrationEventId(user.id) });
    } finally { vi.useRealTimers(); document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT'; }
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
