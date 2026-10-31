import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.unmock('react-router-dom');
const sdk = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: sdk.invoke }, auth: { getSession: sdk.getSession } } }));
const owner = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const user = { id: owner, created_at: new Date().toISOString() };
const session = { user, access_token: `fixture.${btoa(JSON.stringify({ sub: owner, session_id: sessionId }))}.fixture` };
const consentKey = 'jobvance_meta_uk_consent_v1';
let pixel: typeof import('@/lib/meta-pixel');
const zone = (timeZone: string) => vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone }) } as Intl.DateTimeFormat);
const registrations = () => (window.fbq?.queue ?? []).filter(row => row[0] === 'track' && row[1] === 'CompleteRegistration');

beforeEach(async () => {
  vi.resetModules(); vi.stubEnv('PROD', true);
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
  sdk.invoke.mockReset(); sdk.invoke.mockResolvedValue({ data: { sent: false }, error: null });
  sdk.getSession.mockReset(); sdk.getSession.mockResolvedValue({ data: { session }, error: null });
  zone('Europe/London');
  pixel = await import('@/lib/meta-pixel');
});
afterEach(() => {
  void pixel.noteAccountForMeta(null); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  delete window.fbq; delete window._fbq;
  document.querySelectorAll('script[src*="fbevents"]').forEach(node => node.remove());
});

describe.each(['Europe/London', 'Europe/Belfast'])('%s consent', uk => {
  beforeEach(() => zone(uk));
  it('starts off, reads no Meta cookies and sends no public/signup/commerce notice before a choice', async () => {
    const cookie = vi.spyOn(document, 'cookie', 'get');
    pixel.trackMetaPage('/');
    expect(pixel.trackMetaSignupSubmitted('attempt')).toBe(false);
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    const { setTrackingDraftOwner } = await import('@/lib/tracking-draft-memory');
    setTrackingDraftOwner(owner, sessionId);
    const commerce = await import('@/lib/meta-commerce');
    await commerce.reportMetaCheckout(requestId, owner);
    await commerce.flushMetaCommerce(owner, true);
    expect(pixel.adsMeasurementAllowed()).toBe(false);
    expect(pixel.metaCookie('_fbp')).toBeUndefined();
    expect(cookie).not.toHaveBeenCalled();
    expect(window.fbq).toBeUndefined();
    expect(document.querySelector('script[src*="fbevents"]')).toBeNull();
    expect(sdk.getSession).not.toHaveBeenCalled();
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(localStorage.getItem(pixel.META_CHECKOUT_PENDING_KEY)).toBeNull();
  });
  it('accepts only the informed Allow action, remembers it on refresh and still excludes private/token URLs', async () => {
    pixel.setAdsOptOut(false);
    expect(pixel.adsMeasurementAllowed()).toBe(false);
    expect(pixel.setUkAdsConsent(true)).toBe(true);
    expect(pixel.ukAdsChoice()).toBe('accepted');
    vi.resetModules(); pixel = await import('@/lib/meta-pixel');
    expect(pixel.adsMeasurementAllowed()).toBe(true);
    window.history.replaceState(null, '', '/auth?next=/check?savedCheck=private');
    pixel.trackMetaPage('/auth');
    window.history.replaceState(null, '', '/check'); pixel.trackMetaPage('/check');
    expect(window.fbq).toBeUndefined();
    window.history.replaceState(null, '', '/'); pixel.trackMetaPage('/');
    expect(document.querySelectorAll('script[src*="fbevents"]')).toHaveLength(1);
  });
  it('remembers rejection and never treats turning off opt-out as a UK consent grant', async () => {
    expect(pixel.setUkAdsConsent(false)).toBe(true);
    vi.resetModules(); pixel = await import('@/lib/meta-pixel');
    expect(pixel.ukAdsChoice()).toBe('rejected');
    pixel.setAdsOptOut(false);
    expect(pixel.adsMeasurementAllowed()).toBe(false);
    pixel.trackMetaPage('/'); expect(window.fbq).toBeUndefined();
  });
});

describe('UK choice validity and overriding controls', () => {
  it('fails closed on missing, malformed, expired, future or unreadable saved consent', () => {
    for (const saved of [null, '{', '{}', JSON.stringify({version:1,choice:'accepted',at:Date.now(),revision:'bad'})]) {
      if (saved === null) localStorage.removeItem(consentKey); else localStorage.setItem(consentKey, saved);
      expect(pixel.adsMeasurementAllowed()).toBe(false);
    }
    pixel.setUkAdsConsent(true);
    const saved = JSON.parse(localStorage.getItem(consentKey)!);
    for (const at of [Date.now() - 180*24*60*60*1000, Date.now()+60000]) {
      localStorage.setItem(consentKey, JSON.stringify({...saved,at}));
      expect(pixel.adsMeasurementAllowed()).toBe(false);
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
    expect(pixel.adsMeasurementAllowed()).toBe(false);
  });
  it('does not start measurement when saving permission fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
    expect(pixel.setUkAdsConsent(true)).toBe(false);
    expect(pixel.adsMeasurementAllowed()).toBe(false);
    pixel.trackMetaPage('/'); expect(window.fbq).toBeUndefined();
    expect(pixel.setUkAdsConsent(false)).toBe(true);
  });
  it('always honors GPC and opt-out and never opens other European zones', () => {
    pixel.setUkAdsConsent(true); pixel.setAdsOptOut(true);
    expect(pixel.adsMeasurementAllowed()).toBe(false);
    pixel.setUkAdsConsent(true);
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    expect(pixel.adsMeasurementAllowed()).toBe(false);
    expect(pixel.setUkAdsConsent(true)).toBe(false);
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
    for (const other of ['Europe/Dublin','Europe/Paris','Europe/Londonderry','Atlantic/Canary']) {
      zone(other); expect(pixel.adsMeasurementAllowed()).toBe(false); expect(pixel.setUkAdsConsent(true)).toBe(false);
    }
  });
});

describe('withdrawal fences asynchronous work', () => {
  it('does not revive registration hashing after withdrawal and a new grant', async () => {
    pixel.setUkAdsConsent(true);
    let resolve!: (value: ArrayBuffer) => void;
    vi.spyOn(crypto.subtle, 'digest').mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = pixel.noteAccountForMeta(user, Date.now(), sessionId);
    pixel.setUkAdsConsent(false); pixel.setUkAdsConsent(true);
    resolve(new ArrayBuffer(32)); await pending;
    expect(registrations()).toHaveLength(0);
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('clears an unsent checkout and cancels registration timers even if permission is granted again', async () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    pixel.setUkAdsConsent(true);
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    expect(registrations()).toHaveLength(1);
    localStorage.setItem(pixel.META_CHECKOUT_PENDING_KEY, 'pending-fixture');
    pixel.setUkAdsConsent(false); pixel.setUkAdsConsent(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(localStorage.getItem(pixel.META_CHECKOUT_PENDING_KEY)).toBeNull();
  });
  it('does not revive a Purchase request paused in the SDK after withdraw and regrant', async () => {
    pixel.setUkAdsConsent(true);
    const { setTrackingDraftOwner } = await import('@/lib/tracking-draft-memory');
    setTrackingDraftOwner(owner, sessionId);
    let resolve!: (value: unknown) => void;
    sdk.getSession.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const { flushMetaCommerce } = await import('@/lib/meta-commerce');
    const pending = flushMetaCommerce(owner, true);
    pixel.setUkAdsConsent(false); pixel.setUkAdsConsent(true);
    resolve({data:{session},error:null}); await pending;
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('fences a cross-tab choice change before SDK continuation even before its storage event', async () => {
    pixel.setUkAdsConsent(true);
    const { setTrackingDraftOwner } = await import('@/lib/tracking-draft-memory');
    setTrackingDraftOwner(owner, sessionId);
    let resolve!: (value: unknown) => void;
    sdk.getSession.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const { flushMetaCommerce } = await import('@/lib/meta-commerce');
    const pending = flushMetaCommerce(owner, true);
    const saved = JSON.parse(localStorage.getItem(consentKey)!);
    localStorage.setItem(consentKey, JSON.stringify({...saved,revision:crypto.randomUUID()}));
    resolve({data:{session},error:null}); await pending;
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('a throwing third-party consent API cannot block withdrawal', () => {
    pixel.setUkAdsConsent(true); pixel.trackMetaPage('/');
    window.fbq = vi.fn(() => { throw Error('third party'); }) as unknown as typeof window.fbq;
    expect(() => pixel.setUkAdsConsent(false)).not.toThrow();
    expect(pixel.adsMeasurementAllowed()).toBe(false);
  });
});

describe('visible consent controls', () => {
  it('offers equally direct Allow/Reject and starts only after Allow; privacy withdrawal stops it', async () => {
    const { default: Choice } = await import('@/components/UkAdsConsent');
    const { default: Pages } = await import('@/components/MetaPixelPages');
    const { default: PrivacyChoice } = await import('@/components/AdsMeasurementChoice');
    const view = render(<MemoryRouter><Pages/><Choice/></MemoryRouter>);
    expect(screen.getByRole('button',{name:'Allow Meta measurement'})).toHaveClass('jv-ads-choice-button');
    expect(screen.getByRole('button',{name:'Reject Meta measurement'})).toHaveClass('jv-ads-choice-button');
    expect(window.fbq).toBeUndefined();
    fireEvent.click(screen.getByRole('button',{name:'Allow Meta measurement'}));
    expect(document.querySelectorAll('script[src*="fbevents"]')).toHaveLength(1);
    expect(screen.queryByRole('heading',{name:'Allow advertising measurement?'})).not.toBeInTheDocument();
    view.unmount(); render(<PrivacyChoice/>);
    fireEvent.click(screen.getByRole('button',{name:'Withdraw permission'}));
    expect(pixel.adsMeasurementAllowed()).toBe(false);
  });
  it('Reject needs no confirmation and a cross-tab rejection refreshes the page controls', async () => {
    const { default: Choice } = await import('@/components/UkAdsConsent');
    const { default: Pages } = await import('@/components/MetaPixelPages');
    render(<MemoryRouter><Pages/><Choice/></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'Reject Meta measurement'}));
    expect(pixel.ukAdsChoice()).toBe('rejected'); expect(window.fbq).toBeUndefined();
    act(() => { window.dispatchEvent(new StorageEvent('storage',{key:consentKey})); });
    expect(screen.queryByRole('heading',{name:'Allow advertising measurement?'})).not.toBeInTheDocument();
  });
});
