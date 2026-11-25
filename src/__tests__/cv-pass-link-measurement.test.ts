import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The CV Check passes link carries a fragment (#one-time-passes). Measurement must see the same thing it saw for the plain /pricing link: the same
// first-party page and click events (the fragment is never recorded), the same Meta PageView, and no new kind of event.
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), fetch: vi.fn(), unsubscribe: vi.fn(), invoke: vi.fn(() => Promise.resolve({ data: { sent: false }, error: null })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange }, functions: { invoke: mocks.invoke } } }));
import { cleanPath, startAnalytics, stopAnalytics, trackPage } from '@/lib/analytics';
import { noteAccountForMeta, setAdsOptOut, trackMetaPage, META_PIXEL_ID } from '@/lib/meta-pixel';
import { cleanBatch } from '../../supabase/functions/_shared/jobvance-track';

const session = (): Session => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, access_token: `e30.${btoa(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exp: 4102444800 }))}.e30`, refresh_token: 'r', expires_in: 3600, token_type: 'bearer' }) as unknown as Session;
const ack = (body: string) => { const value = JSON.parse(body); return new Response(JSON.stringify({ batchId: value.batchId, accepted: value.events.length, inserted: value.events.length, duplicate: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
const bodies = () => mocks.fetch.mock.calls.map((call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string));
const events = () => bodies().flatMap(body => body.events);
async function settle() { for (let index = 0; index < 12; index++) await Promise.resolve(); }

describe('the CV Check passes link in first-party analytics', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-25T05:00:00.000Z'));
    vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); document.body.replaceChildren();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubGlobal('fetch', mocks.fetch);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    mocks.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: mocks.unsubscribe } } }));
    mocks.fetch.mockImplementation(async (_url, init) => ack(init.body));
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
  });
  afterEach(() => { stopAnalytics(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });

  // The person is on the CV Check (a private page), follows the link, and the pricing page is reported without its fragment (the router reports pathname and search only).
  async function follow(href: string, arrivalUrl: string) {
    mocks.fetch.mockClear(); localStorage.clear(); sessionStorage.clear(); document.body.replaceChildren();
    window.history.replaceState(null, '', '/check');
    startAnalytics({ inTests: true }); trackPage(window.location); await settle();
    const link = document.createElement('a'); link.href = href; link.textContent = 'See passes from $9';
    link.addEventListener('click', event => event.preventDefault()); document.body.appendChild(link);
    link.click();
    window.history.replaceState(null, '', arrivalUrl);
    trackPage({ pathname: '/pricing', search: '' });
    window.dispatchEvent(new Event('pagehide')); await settle();
    const sent = bodies(), result = { events: events().map(event => ({ kind: event.kind, path: event.path, label: event.label, href: event.href, title: event.title })), json: JSON.stringify(sent), valid: sent.every(body => cleanBatch(body) !== null) };
    stopAnalytics();
    return result;
  }

  it('never records the fragment: the click and the pricing page are logged as plain /pricing', async () => {
    expect(cleanPath({ pathname: '/pricing', search: '' })).toBe('/pricing');
    const withFragment = await follow('/pricing#one-time-passes', '/pricing#one-time-passes');
    expect(withFragment.events.filter(event => event.kind === 'click').map(event => event.href)).toEqual(['/pricing']);
    expect(withFragment.events.filter(event => event.kind === 'page_view').map(event => event.path)).toContain('/pricing');
    expect(withFragment.json).not.toContain('one-time-passes');
    expect(withFragment.json).not.toContain('#');
    expect(withFragment.valid).toBe(true);
  });

  it('records exactly what the plain /pricing link recorded: no new kind of event, label or field', async () => {
    const plain = await follow('/pricing', '/pricing');
    const withFragment = await follow('/pricing#one-time-passes', '/pricing#one-time-passes');
    expect(withFragment.events).toEqual(plain.events);
    expect(new Set(withFragment.events.map(event => event.kind))).toEqual(new Set(plain.events.map(event => event.kind)));
    expect(plain.events.length).toBeGreaterThan(1);
  });
});

describe('the CV Check passes link and the Meta Pixel', () => {
  const calls = () => (window.fbq?.queue ?? []).map(args => [...args]);
  const pageViews = () => calls().filter(args => args[0] === 'trackSingle' && args[1] === META_PIXEL_ID && args[2] === 'PageView');
  const reset = () => {
    void noteAccountForMeta(null); setAdsOptOut(false);
    delete window.fbq; delete window._fbq;
    document.querySelectorAll('script[src*="fbevents"]').forEach(script => script.remove());
    localStorage.clear(); sessionStorage.clear();
  };
  beforeEach(() => {
    vi.stubEnv('PROD', true);
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone: 'America/New_York' }) } as Intl.DateTimeFormat);
    reset();
  });
  afterEach(() => { reset(); vi.unstubAllEnvs(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

  it('measures /pricing#one-time-passes exactly like /pricing: one PageView and the same pixel calls', () => {
    window.history.replaceState(null, '', '/pricing');
    trackMetaPage('/pricing');
    const plain = calls().map(args => `${args[0]}:${args[2] ?? ''}`);
    expect(pageViews()).toHaveLength(1);
    reset();
    window.history.replaceState(null, '', '/pricing#one-time-passes');
    trackMetaPage('/pricing');
    expect(pageViews()).toHaveLength(1);
    expect(calls().map(args => `${args[0]}:${args[2] ?? ''}`)).toEqual(plain);
  });

  it('still sends nothing for a fragment that is not an anchor name', () => {
    window.history.replaceState(null, '', '/pricing#one%20time%20passes?plan=x');
    trackMetaPage('/pricing');
    expect(pageViews()).toHaveLength(0);
  });
});
