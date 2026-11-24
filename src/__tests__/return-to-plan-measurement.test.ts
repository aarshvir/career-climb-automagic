import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// What measurement can see of the plan carried on /onboarding: first-party page and click events (private route redaction) and the Meta Pixel.
// The only value that may appear is the plan id; never the billing country or currency, never anything typed, never CV text.
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), fetch: vi.fn(), unsubscribe: vi.fn(), invoke: vi.fn(() => Promise.resolve({ data: { sent: false }, error: null })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange }, functions: { invoke: mocks.invoke } } }));
import { cleanPath, startAnalytics, stopAnalytics, trackPage } from '@/lib/analytics';
import { noteAccountForMeta, setAdsOptOut, trackMetaPage, META_PIXEL_ID } from '@/lib/meta-pixel';
import { cleanBatch } from '../../supabase/functions/_shared/jobvance-track';
import { onboardingPathForChoice } from '@/lib/account-return';

const PLAN_SEARCH = '?loopPlan=active&country=GB&currency=GBP';
const PRIVATE_CV = 'Alex Example private career history with a confidential client name';
const session = (): Session => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, access_token: `e30.${btoa(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))}.signature` } as Session);
const ack = (body: string) => { const value = JSON.parse(body); return new Response(JSON.stringify({ batchId: value.batchId, accepted: value.events.length, inserted: value.events.length, duplicate: false }), { status: 200 }); };
const bodies = () => mocks.fetch.mock.calls.map((call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string));
const events = () => bodies().flatMap(body => body.events);
async function settle() { for (let index = 0; index < 12; index++) await Promise.resolve(); }

describe('the plan on /onboarding in first-party analytics', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-24T05:00:00.000Z'));
    vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); document.body.replaceChildren();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubGlobal('fetch', mocks.fetch);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    mocks.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: mocks.unsubscribe } } }));
    mocks.fetch.mockImplementation(async (_url, init) => ack(init.body));
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
  });
  afterEach(() => { stopAnalytics(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('keeps only the plan id in the recorded path, whatever else the address carries', () => {
    expect(cleanPath({ pathname: '/onboarding', search: `${PLAN_SEARCH}&utm_source=meta&cv=${encodeURIComponent(PRIVATE_CV)}&email=a%40b.example` })).toBe('/onboarding?utm_source=meta&loopPlan=active');
    expect(cleanPath({ pathname: '/onboarding', search: PLAN_SEARCH })).toBe('/onboarding?loopPlan=active');
    expect(cleanPath({ pathname: '/onboarding', search: '' })).toBe('/onboarding');
    // The link the pricing page builds is covered by the same rule.
    const built = new URL(onboardingPathForChoice('active', { country: 'GB', currency: 'GBP' }), 'https://example.test');
    expect(cleanPath({ pathname: built.pathname, search: built.search })).toBe('/onboarding?loopPlan=active');
  });

  it('records the onboarding page and the return link with private-route redaction: plan id only, tag-name labels, no title, no typed or CV text', async () => {
    window.history.replaceState(null, '', `/onboarding${PLAN_SEARCH}`);
    document.title = 'Set up your Automated Job Loop | Jobvance';
    startAnalytics({ inTests: true }); trackPage(window.location); await settle();
    const area = document.createElement('textarea'); area.value = PRIVATE_CV; document.body.appendChild(area);
    const heading = document.createElement('h1'); heading.textContent = 'Your setup is saved.'; document.body.appendChild(heading);
    const back = document.createElement('a'); back.href = '/pricing?loopPlan=active&country=GB&currency=GBP'; back.textContent = 'Return to the Advanced plan';
    back.addEventListener('click', event => event.preventDefault()); document.body.appendChild(back);
    const primary = document.createElement('a'); primary.href = '/loop'; primary.textContent = 'Continue to my Automated Job Loop';
    primary.addEventListener('click', event => event.preventDefault()); document.body.appendChild(primary);
    back.click(); primary.click();
    window.dispatchEvent(new Event('pagehide')); await settle();
    const sent = events();
    expect(sent.filter(event => event.kind === 'page_view').map(event => ({ path: event.path, title: event.title }))).toEqual([{ path: '/onboarding?loopPlan=active', title: 'Account page' }]);
    expect(sent.filter(event => event.kind === 'click').map(event => ({ path: event.path, label: event.label, href: event.href }))).toEqual([
      { path: '/onboarding?loopPlan=active', label: 'a', href: '/pricing?loopPlan=active' },
      { path: '/onboarding?loopPlan=active', label: 'a', href: '/loop' },
    ]);
    const everything = JSON.stringify(bodies());
    for (const forbidden of ['country', 'currency', 'GBP', 'Alex', 'confidential', 'private', 'Return to', 'Continue to my', 'Your setup is saved', 'Set up your Automated']) expect(everything, forbidden).not.toContain(forbidden);
    expect(everything).toContain('loopPlan=active');
    expect(bodies().every(body => cleanBatch(body) !== null)).toBe(true);
    expect(bodies().every(body => !JSON.stringify(body.context).includes('GBP') && !JSON.stringify(body.context).includes('country'))).toBe(true);
  });
});

describe('the plan on /onboarding and the Meta Pixel', () => {
  const calls = () => (window.fbq?.queue ?? []).map(args => [...args]);
  const pageViews = () => calls().filter(args => args[0] === 'trackSingle' && args[1] === META_PIXEL_ID && args[2] === 'PageView');
  beforeEach(() => {
    vi.stubEnv('PROD', true);
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone: 'America/New_York' }) } as Intl.DateTimeFormat);
    localStorage.clear(); sessionStorage.clear();
  });
  afterEach(() => {
    void noteAccountForMeta(null); setAdsOptOut(false); vi.unstubAllEnvs(); vi.restoreAllMocks();
    delete window.fbq; delete window._fbq;
    document.querySelectorAll('script[src*="fbevents"]').forEach(script => script.remove());
    window.history.replaceState(null, '', '/');
  });

  it('sends nothing to Meta for an onboarding address that carries a plan (the plan is not on the pixel allowlist), and still measures the plain page', () => {
    window.history.replaceState(null, '', `/onboarding${PLAN_SEARCH}`);
    trackMetaPage('/onboarding');
    expect(window.fbq).toBeUndefined();
    expect(document.querySelectorAll('script[src*="fbevents"]')).toHaveLength(0);
    expect(pageViews()).toHaveLength(0);
    window.history.replaceState(null, '', '/onboarding');
    trackMetaPage('/onboarding');
    expect(pageViews()).toHaveLength(1);   // unchanged behaviour for an ordinary onboarding visit
  });
});
