import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ invoke: vi.fn(async () => ({ error: null })), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: sdk.invoke }, auth: { getSession: sdk.getSession } } }));
const user = { id: '11111111-1111-4111-8111-111111111111', created_at: new Date().toISOString() };
const sessionId = '22222222-2222-4222-8222-222222222222';
const token = (id = sessionId) => `fixture.${btoa(JSON.stringify({ sub: user.id, session_id: id }))}.fixture`;
let pixel: typeof import('@/lib/meta-pixel');
beforeEach(async () => {
  vi.resetModules(); vi.stubEnv('PROD', true); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone: 'America/New_York' }) } as Intl.DateTimeFormat);
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/auth?mode=signup');
  sdk.invoke.mockClear(); sdk.getSession.mockReset();
  sdk.getSession.mockResolvedValue({ data: { session: { user, access_token: token() } }, error: null });
  pixel = await import('@/lib/meta-pixel');
});
afterEach(() => {
  void pixel.noteAccountForMeta(null); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  delete window.fbq; delete window._fbq;
  document.querySelectorAll('script[src*="fbevents"]').forEach(node => node.remove());
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
});
const registrations = () => (window.fbq?.queue ?? []).filter(row => row[0] === 'track' && row[1] === 'CompleteRegistration');
describe('registration authority after async boundaries', () => {
  it('cancels the server copy when the visitor opts out during its delay', async () => {
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    expect(registrations()).toHaveLength(1);
    pixel.setAdsOptOut(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('cancels the original request across logout and A → B → A', async () => {
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await pixel.noteAccountForMeta(null);
    await pixel.noteAccountForMeta({ ...user, id: '33333333-3333-4333-8333-333333333333', created_at: '2020-01-01' });
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('rejects a changed SDK session while a server-copy session read is pending', async () => {
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    sdk.getSession.mockResolvedValue({ data: { session: { user, access_token: token('44444444-4444-4444-8444-444444444444') } }, error: null });
    await vi.advanceTimersByTimeAsync(2000);
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('rejects an original hash completing after logout', async () => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let release!: (value: ArrayBuffer) => void;
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => new Promise<ArrayBuffer>(resolve => { release = resolve; }));
    const pending = pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await pixel.noteAccountForMeta(null);
    release(await original('SHA-256', new TextEncoder().encode(user.id)));
    await pending;
    expect(registrations()).toHaveLength(0);
  });
  it('uses the same currently verified session for a valid server copy', async () => {
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sdk.invoke).toHaveBeenCalledOnce();
    expect(sdk.invoke).toHaveBeenCalledWith('meta-conversions', expect.objectContaining({ headers: { Authorization: `Bearer ${token()}` } }));
  });
  it('rechecks opt-out after the asynchronous SDK read', async () => {
    let release!: (value: unknown) => void;
    sdk.getSession.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await vi.advanceTimersByTimeAsync(2000);
    pixel.setAdsOptOut(true);
    release({ data: { session: { user, access_token: token() } }, error: null });
    await Promise.resolve(); await Promise.resolve();
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('preserves the original public source while moving to a private route', async () => {
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    window.history.pushState(null, '', '/loop?ticket=private-ticket');
    pixel.trackMetaPage('/loop');
    await vi.advanceTimersByTimeAsync(2000);
    expect(sdk.invoke).toHaveBeenCalledWith('meta-conversions', expect.objectContaining({ body: expect.objectContaining({ pageUrl: `${window.location.origin}/auth` }) }));
  });
  it('revokes a delayed copy on a new same-owner session', async () => {
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await pixel.noteAccountForMeta(user, Date.now(), '44444444-4444-4444-8444-444444444444');
    await vi.advanceTimersByTimeAsync(2000);
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('preserves a delayed copy across a refresh of the same session', async () => {
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sdk.invoke).toHaveBeenCalledOnce();
  });
  it('honours a fresh GPC signal before the delayed copy', async () => {
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('does not flush a pending registration after logout', async () => {
    window.history.replaceState(null, '', '/auth/callback');
    await pixel.noteAccountForMeta(user, Date.now(), sessionId);
    await pixel.noteAccountForMeta(null);
    window.history.replaceState(null, '', '/'); pixel.trackMetaPage('/');
    expect(registrations()).toHaveLength(0);
  });
});
describe('public-path return URL boundaries', () => {
  it.each(['/auth?code=private-code', '/auth#access_token=private-token', '/pricing?session_id=private-payment', '/onboarding?next=%2Fapplications%2Fprivate-id'])('does not initialize from %s', path => {
    window.history.replaceState(null, '', path);
    pixel.trackMetaPage(window.location.pathname);
    expect(window.fbq).toBeUndefined();
  });
  it('does not initialize with a private same-origin referrer', () => {
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(`${window.location.origin}/auth/callback?code=private-code`);
    pixel.trackMetaPage('/auth');
    expect(window.fbq).toBeUndefined();
  });
  it('keeps the opt-out effective when browser storage is denied', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    pixel.setAdsOptOut(true);
    expect(pixel.adsMeasurementAllowed()).toBe(false);
  });
  it('does not grant measurement when the time zone cannot be established', () => {
    vi.mocked(Intl.DateTimeFormat).mockImplementation(() => { throw new Error('unknown zone'); });
    expect(pixel.adsMeasurementAllowed()).toBe(false);
  });
});
