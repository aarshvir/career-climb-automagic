import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The pricing introduction carries ONE underlined link, "See one-time CV tailoring passes", to the existing #one-time-passes fragment (PR #86 behaviour).
// It is a way to look at the pass offer: it selects nothing, starts no checkout, adds no event kind, and its click is recorded through the existing click-label
// path as that fixed wording (counted as browsing the pass offer, apart from plan selection, Buy and checkout labels).
vi.unmock('react-router-dom');
const m = vi.hoisted(() => ({
  auth: { user: null, session: null, loading: false, authError: null } as Record<string, unknown>,
  read: vi.fn(), quote: vi.fn(), checkout: vi.fn(), cancel: vi.fn(), open: vi.fn(), report: vi.fn(), invoke: vi.fn(), scroll: vi.fn(),
  getSession: vi.fn(), onAuthStateChange: vi.fn(), fetch: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock('@/lib/meta-commerce', () => ({ reportMetaCheckout: m.report }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => m.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: m.getSession, onAuthStateChange: m.onAuthStateChange }, functions: { invoke: m.invoke } } }));
vi.mock('@/lib/loop-subscription-billing', async original => ({ ...await original<typeof import('@/lib/loop-subscription-billing')>(), readLoopBilling: m.read, requestLoopPriceQuote: m.quote, createLoopSubscriptionCheckout: m.checkout, cancelLoopSubscription: m.cancel }));
vi.mock('@/lib/payment-checkout', () => ({ openPaymentCheckout: m.open }));
import ProductPage from '@/pages/ProductPage';
import RouteNavigation from '@/components/RouteNavigation';
import { startAnalytics, stopAnalytics, trackPage } from '@/lib/analytics';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { passPlans } from '@/lib/pass-plans';
import { cleanBatch } from '../../supabase/functions/_shared/jobvance-track';

const LABEL = 'See one-time CV tailoring passes';
const SIGNED_OUT = { user: null, session: null, loading: false, authError: null };
const SIGNED_IN = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };
const plans = [{ id: 'weekly', amount: 2900, currency: 'USD', interval: 'month', runsPerWeek: 1 }, { id: 'active', amount: 5900, currency: 'USD', interval: 'month', runsPerWeek: 3 }, { id: 'daily', amount: 9900, currency: 'USD', interval: 'month', runsPerWeek: 7 }];
const status = () => ({ billingConfigured: true, fulfillmentPending: false, billingMode: 'live', generation: 0, plans, entitlement: null, subscription: null, checkout: null, cancelRequest: null });
const ack = (body: string) => { const value = JSON.parse(body); return { status: 200, json: async () => ({ batchId: value.batchId, accepted: value.events.length, inserted: value.events.length, duplicate: false }) }; };
const bodies = () => m.fetch.mock.calls.map((call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string));
const sent = () => bodies().flatMap(body => body.events as { kind: string; label?: string; href?: string; path: string }[]);
const drain = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };
async function flush() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange')); await drain();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
}
async function startTracker(path: string) {
  window.history.replaceState(null, '', path);
  m.getSession.mockResolvedValue({ data: { session: null }, error: null });
  startAnalytics({ inTests: true }); trackPage(window.location); await drain();
}

// The browser's Back and Forward buttons are not part of the page and do not move its focus: they are driven through the router, not through a page control.
const router = { go: null as null | NavigateFunction };
const history = { back: () => act(async () => { await router.go!(-1); }), forward: () => act(async () => { await router.go!(1); }), plain: () => act(async () => { await router.go!('/pricing'); }) };
function Nav() {
  router.go = useNavigate();
  return <button type="button">Some other control</button>;
}
const pricing = (path = '/pricing') => render(<HelmetProvider><MemoryRouter initialEntries={[path]}><RouteNavigation /><Nav /><ProductPage kind="pricing" /></MemoryRouter></HelmetProvider>);
const intro = () => document.querySelector('.product-page-intro') as HTMLElement;
const section = () => document.getElementById('one-time-passes') as HTMLElement | null;
const disclosure = () => document.querySelector('details.pricing-passes-disclosure') as HTMLDetailsElement | null;
const link = () => screen.getByRole('link', { name: LABEL });
const headerLinks = () => [...document.querySelectorAll('header.jv-page-head a')].map(a => a.textContent?.replace(/\s+/g, ' ').trim());

beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner', 'session');
  m.auth = SIGNED_OUT;
  for (const mock of [m.read, m.quote, m.checkout, m.cancel, m.open, m.report, m.invoke, m.scroll, m.getSession, m.onAuthStateChange, m.fetch, m.unsubscribe]) mock.mockReset();
  m.read.mockResolvedValue(status()); m.report.mockResolvedValue(undefined);
  m.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: m.unsubscribe } } }));
  m.fetch.mockImplementation(async (_url: string, init: RequestInit) => ack(init.body as string));
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubGlobal('fetch', m.fetch);
  localStorage.clear(); sessionStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Element.prototype.scrollIntoView = m.scroll;   // jsdom has no layout: what matters is which element is scrolled to
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => { stopAnalytics(); cleanup(); document.body.replaceChildren(); clearTrackingDraftMemory(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });

describe('the link in the pricing introduction', () => {
  it('is one link with the exact text, inside the intro sentence, pointing at the existing fragment', () => {
    pricing();
    const links = screen.getAllByRole('link', { name: LABEL });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/pricing#one-time-passes');
    expect(links[0]).toHaveAttribute('id', 'pricing-pass-link');
    expect(intro()).toContainElement(links[0]);
    expect(links[0].textContent).toBe(LABEL);
    // The introduction keeps its sentence (the free-versus-paid terms are unchanged) and the link follows it in the same paragraph.
    expect(intro().textContent).toBe(`Choose how often your Automated Job Loop runs. Plans from $29/month, with a free account to start. ${LABEL}`);
  });

  it('adds no card and no second navigation block: the introduction is followed directly by the existing actions', () => {
    pricing();
    expect(intro().nextElementSibling).toHaveClass('jv-page-actions');
    expect(document.querySelector('.pricing-routes, .pricing-route')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Choose what you need' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('#pricing-pass-link')).toHaveLength(1);
    // Hero order: the intro link, then Start free, then the free CV Check link. No monthly shortcut was added.
    expect(headerLinks()).toEqual([LABEL, 'Start free', 'Try the free CV Check']);
    expect(screen.queryByRole('link', { name: /ongoing job searches/i })).not.toBeInTheDocument();
  });

  it('leaves Start free, the free CV Check link and the monthly plan controls as they were', () => {
    pricing();
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/onboarding');
    const freeCheck = screen.getByRole('link', { name: 'Try the free CV Check' });
    expect(freeCheck).toHaveAttribute('href', '/cv-check');
    expect(freeCheck.closest('.product-page-intro')).toBeNull();
    expect(freeCheck).not.toHaveClass('pricing-intro-link');
    expect(screen.getByRole('link', { name: 'Choose Starter' })).toHaveAttribute('href', expect.stringContaining('/auth?next='));
    expect(screen.getByRole('link', { name: 'Choose Starter' })).toHaveTextContent('Choose Starter');
  });

  it('is underlined through one rule scoped to this link, with no global anchor rule and no outline override', () => {
    const css = readFileSync('src/styles/marketing.css', 'utf8');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: match[2] }));
    const own = rules.filter(item => item.selector.includes('pricing-intro-link'));
    expect(own).toHaveLength(1);
    expect(own[0].selector).toBe('.product-page--pricing .product-page-intro .pricing-intro-link');
    expect(own[0].body).toMatch(/text-decoration:\s*underline/);
    expect(own[0].body).not.toMatch(/outline|display|font-size|border|padding|margin/);
    pricing();
    // The free CV Check link is outside the paragraph the rule is scoped to, so it keeps its own look.
    expect(link().closest('.product-page--pricing .product-page-intro')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Try the free CV Check' }).closest('.product-page-intro')).toBeNull();
  });
});

describe('following the link', () => {
  it('opens the passes, scrolls to them and focuses the section, and selects nothing', async () => {
    pricing();
    expect(disclosure()).not.toHaveAttribute('open');
    m.scroll.mockClear();
    await userEvent.setup({ delay: null }).click(link());
    await waitFor(() => expect(document.activeElement).toBe(section()));
    expect(disclosure()).toHaveAttribute('open');
    expect(m.scroll).toHaveBeenCalledTimes(1);
    expect(m.scroll.mock.contexts[0]).toBe(section());
    expect(document.querySelector('.pricing-picked, .pricing-tier--picked, [aria-pressed="true"]')).toBeNull();
    for (const plan of passPlans) expect(screen.getByRole('link', { name: `Sign in to buy ${plan.name}` })).toBeInTheDocument();
  });

  it('creates no checkout and calls no billing action, signed in or out', async () => {
    for (const auth of [SIGNED_OUT, SIGNED_IN]) {
      m.auth = auth; for (const mock of [m.read, m.quote, m.checkout, m.cancel, m.open, m.invoke]) mock.mockClear();
      m.read.mockResolvedValue(status());
      const view = pricing();
      await userEvent.setup({ delay: null }).click(link());
      await waitFor(() => expect(document.activeElement).toBe(section()));
      await drain();
      expect(m.checkout).not.toHaveBeenCalled(); expect(m.open).not.toHaveBeenCalled(); expect(m.quote).not.toHaveBeenCalled(); expect(m.cancel).not.toHaveBeenCalled();
      expect(m.invoke).not.toHaveBeenCalled();
      expect(document.querySelector('.pricing-picked, .pricing-tier--picked, [aria-pressed="true"]')).toBeNull();
      view.unmount(); document.body.replaceChildren();
    }
  });
});

describe('Back, then Tab', () => {
  it('returns focus to the intro link, so the next Tab continues in the introduction and not down the page', async () => {
    const user = userEvent.setup({ delay: null });
    pricing();
    await user.click(link());
    await waitFor(() => expect(document.activeElement).toBe(section()));
    m.scroll.mockClear();
    await history.back();
    await waitFor(() => expect(document.activeElement).toBe(link()));
    expect(disclosure()).not.toHaveAttribute('open');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Start free' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Try the free CV Check' }));
    // Nothing scrolled the page back down to the passes.
    expect(m.scroll).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(document.querySelector('.pricing-passes-disclosure > summary'));
  });

  it('works the same by keyboard (Tab to the link, Enter), and Forward lands on the section again', async () => {
    const user = userEvent.setup({ delay: null });
    pricing();
    link().focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(section()));
    await history.back();
    await waitFor(() => expect(document.activeElement).toBe(link()));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Start free' }));
    await history.forward();
    await waitFor(() => expect(document.activeElement).toBe(section()));
    expect(disclosure()).toHaveAttribute('open');
  });

  it('does not take focus when the visitor leaves the fragment some other way', async () => {
    const user = userEvent.setup({ delay: null });
    pricing();
    await user.click(link());
    await waitFor(() => expect(document.activeElement).toBe(section()));
    const other = screen.getByRole('button', { name: 'Some other control' });
    await user.click(other);            // the visitor moves on to something else on the page
    await history.plain();
    await waitFor(() => expect(disclosure()).not.toHaveAttribute('open'));
    expect(document.activeElement).toBe(other);
  });

  it('does nothing on an ordinary visit or for another fragment', async () => {
    pricing('/pricing');
    expect(document.activeElement).toBe(document.body);
    expect(disclosure()).not.toHaveAttribute('open');
    expect(m.scroll).not.toHaveBeenCalled();
  });
});

describe('measurement: browsing the pass offer, apart from selection, Buy and checkout', () => {
  it('records the click once, with the fixed wording and the plain /pricing destination, and no new kind of event', async () => {
    await startTracker('/pricing');
    pricing();
    await userEvent.setup({ delay: null }).click(link()); await flush();
    const clicks = sent().filter(event => event.kind === 'click');
    expect(clicks.map(event => event.label)).toEqual([LABEL]);
    expect(clicks[0].href).toBe('/pricing');
    expect(sent().every(event => ['page_view', 'page_leave', 'click', 'identify', 'form_submit'].includes(event.kind))).toBe(true);
    for (const body of bodies()) expect(cleanBatch(body)).not.toBeNull();
    // Nothing that counts as a plan selection, a pass sign-in choice, a Buy or a checkout.
    expect(sent().map(event => event.label ?? '').filter(label => /^(Choose|Sign in to buy|Buy|Continue to secure checkout|Selected)/.test(label))).toEqual([]);
  });

  it('records one click for the keyboard (Enter) as well, and the passes summary is not clicked by the arrival', async () => {
    await startTracker('/pricing');
    pricing();
    link().focus();
    await userEvent.setup({ delay: null }).keyboard('{Enter}'); await flush();
    expect(sent().filter(event => event.kind === 'click').map(event => event.label)).toEqual([LABEL]);
  });

  it('keeps the other pricing click labels as they were (the passes summary, a pass sign-in, a plan control)', async () => {
    await startTracker('/pricing');
    pricing();
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByText('Prefer a one-off? See one-time passes'));
    await user.click(screen.getByRole('link', { name: 'Sign in to buy Sprint' }).closest('a')!);
    await flush();
    expect(sent().filter(event => event.kind === 'click').map(event => event.label)).toEqual(['Prefer a one-off? See one-time passes', 'Sign in to buy Sprint']);
  });
});

describe('what stays as it was', () => {
  it('keeps the selected-pass return: ?plan= opens the section, shows the pick and scrolls to that card', async () => {
    const plan = passPlans[1];
    pricing(`/pricing?plan=${plan.key}`);
    expect(disclosure()).toHaveAttribute('open');
    expect(screen.getByText(new RegExp(`You picked the ${plan.name} pass`))).toBeInTheDocument();
    await waitFor(() => expect(m.scroll).toHaveBeenCalled());
    expect(m.scroll.mock.contexts.every(context => context !== section())).toBe(true);
  });

  it('keeps the cancelled-checkout return open with its reassurance', () => {
    pricing('/pricing?checkout=cancelled');
    expect(disclosure()).toHaveAttribute('open');
    expect(screen.getByText('Checkout was cancelled. You have not been charged.')).toBeInTheDocument();
  });

  it('keeps the PR 86 address working on a fresh load: open, focused, nothing selected', async () => {
    pricing('/pricing#one-time-passes');
    expect(disclosure()).toHaveAttribute('open');
    await waitFor(() => expect(document.activeElement).toBe(section()));
    expect(document.querySelector('.pricing-picked, .pricing-tier--picked')).toBeNull();
  });
});
