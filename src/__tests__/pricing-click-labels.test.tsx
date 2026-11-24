import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, writeFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// First-party click labels on /pricing and the billing panel, measured through the REAL tracker (src/lib/analytics.ts): the real document listener, the real
// describe(), the real batching, and the real intake validator. Only the network edge is replaced.
// Rule under test: on the pricing route a click label carries stable action wording and plan names, never a price, a currency amount, a quote or a date the
// quote implies; one deliberate tap on the consent control is one click; every other control records what it always did; private routes keep tag names.
// Nothing here changes what billing, quote or checkout code does.
vi.unmock('react-router-dom');
const m = vi.hoisted(() => ({
  auth: { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null } as Record<string, unknown>,
  read: vi.fn(), quote: vi.fn(), checkout: vi.fn(), cancel: vi.fn(), open: vi.fn(), report: vi.fn(), invoke: vi.fn(),
  getSession: vi.fn(), onAuthStateChange: vi.fn(), fetch: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock('@/lib/meta-commerce', () => ({ reportMetaCheckout: m.report }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => m.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: m.getSession, onAuthStateChange: m.onAuthStateChange }, functions: { invoke: m.invoke } } }));
vi.mock('@/lib/loop-subscription-billing', async original => ({ ...await original<typeof import('@/lib/loop-subscription-billing')>(), readLoopBilling: m.read, requestLoopPriceQuote: m.quote, createLoopSubscriptionCheckout: m.checkout, cancelLoopSubscription: m.cancel }));
vi.mock('@/lib/payment-checkout', () => ({ openPaymentCheckout: m.open }));
import LoopSubscriptionBilling from '@/components/LoopSubscriptionBilling';
import SubscriptionPricing from '@/pages/SubscriptionPricing';
import { startAnalytics, stopAnalytics, trackPage } from '@/lib/analytics';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { LOOP_LOCAL_CURRENCIES, LOOP_LOCAL_PRICE_CATALOG_VERSION } from '@/lib/loop-local-prices';
import { formatLoopPrice } from '@/lib/loop-price-display';
import { cleanBatch } from '../../supabase/functions/_shared/jobvance-track';
import { giveConsent } from '@/test-utils/billing-consent';

type Plan = 'weekly' | 'active' | 'daily';
type Currency = keyof typeof LOOP_LOCAL_CURRENCIES;
const MARKETS = { GBP: { country: 'GB', currency: 'GBP' }, AED: { country: 'AE', currency: 'AED' }, USD: { country: 'US', currency: 'USD' } } as const;
type MarketName = keyof typeof MARKETS;
const MARKET_NAMES = Object.keys(MARKETS) as MarketName[];
const SIGNED_OUT = { user: null, session: null, loading: false, authError: null };
const SIGNED_IN = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };

const price = (plan: Plan, currency: Currency, quoteId: string | null, country: string | null) => ({ quoteId, country, currency, amountMinor: LOOP_LOCAL_CURRENCIES[currency].amounts[plan], exponent: LOOP_LOCAL_CURRENCIES[currency].exponent, catalogVersion: LOOP_LOCAL_PRICE_CATALOG_VERSION, taxInclusive: true, interval: 'month' });
const quoted = (intent: { plan: Plan; currency: Currency; country: string; requestId: string; expectedGeneration: number }) => ({ ...price(intent.plan, intent.currency, '00000000-0000-4000-8000-000000000041', intent.country), requestId: intent.requestId, generation: intent.expectedGeneration, plan: intent.plan, expiresAt: new Date(Date.now() + 900000).toISOString() });
const plans = [{ id: 'weekly', amount: 2900, currency: 'USD', interval: 'month', runsPerWeek: 1 }, { id: 'active', amount: 5900, currency: 'USD', interval: 'month', runsPerWeek: 3 }, { id: 'daily', amount: 9900, currency: 'USD', interval: 'month', runsPerWeek: 7 }];
const status = (extra: Record<string, unknown> = {}) => ({ billingConfigured: true, fulfillmentPending: false, billingMode: 'live', generation: 0, plans, entitlement: null, subscription: null, checkout: null, cancelRequest: null, ...extra });
const DAY = 86_400_000;
const trialWindow = () => { const start = Date.now(), end = start + 7 * DAY; return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), firstChargeAt: new Date(end).toISOString(), reminderAt: new Date(end - 2 * DAY).toISOString(), granted: true }; };
const subscription = (market: { currency: Currency; country: string }, trial: boolean) => {
  const window_ = trialWindow();
  return { subscriptionId: 'sub_one', plan: 'weekly', status: 'active', validUntil: trial ? window_.endsAt : new Date(Date.now() + 20 * DAY).toISOString(), periodStart: window_.startsAt, cancelAtPeriodEnd: false, revoked: false, graceUntil: null, version: 2, pricing: price('weekly', market.currency, null, market.country), ...(trial ? { trial: window_ } : {}) };
};
const receipt = (intent: { requestId: string; plan: Plan }) => ({ provider: 'dodo', billingMode: 'live', generation: 0, requestId: intent.requestId, plan: intent.plan, sessionId: 'cks_fixture', url: 'https://checkout.dodopayments.com/session/cks_fixture' });

// The network edge. A plain object stands in for the response so that the tracker's batch loop completes in microtasks.
const ack = (body: string) => { const value = JSON.parse(body); return { status: 200, json: async () => ({ batchId: value.batchId, accepted: value.events.length, inserted: value.events.length, duplicate: false }) }; };
interface Sent { id: string; kind: string; path: string; label?: string; href?: string; props?: unknown }
const bodies = () => m.fetch.mock.calls.map((call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string));
const sent = (): Sent[] => bodies().flatMap(body => body.events as Sent[]);
const clickEvents = () => sent().filter(event => event.kind === 'click');
const labels = () => clickEvents().map(event => event.label);
const drain = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };
/** Send what the tracker holds now, without ending the page exposure (a page that goes hidden sends its batch; later clicks still count). */
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
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
const CONTROLS = 'a, button, [role="button"], summary, label, select, input[type="checkbox"], input[type="radio"], input[type="submit"]';
const view = (path: string, compact = false) => render(<MemoryRouter initialEntries={[path]}>{compact ? <LoopSubscriptionBilling compact /> : <SubscriptionPricing />}</MemoryRouter>);
const loopPath = (market: MarketName, plan?: Plan) => `/pricing?${plan ? `loopPlan=${plan}&` : ''}country=${MARKETS[market].country}&currency=${MARKETS[market].currency}`;
const CONSENT = 'I choose Advanced and automatic monthly renewal', TRIAL_CONSENT = 'I start a 7-day free trial of Starter';

beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner', 'session');
  m.auth = SIGNED_IN;
  for (const mock of [m.read, m.quote, m.checkout, m.cancel, m.open, m.report, m.invoke, m.getSession, m.onAuthStateChange, m.fetch, m.unsubscribe]) mock.mockReset();
  m.read.mockResolvedValue(status());
  m.quote.mockImplementation(async (_scope, intent) => quoted(intent));
  m.report.mockResolvedValue(undefined);
  m.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: m.unsubscribe } } }));
  m.fetch.mockImplementation(async (_url: string, init: RequestInit) => ack(init.body as string));
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubGlobal('fetch', m.fetch);
  localStorage.clear(); sessionStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Element.prototype.scrollIntoView = function () { /* jsdom has no layout */ };
});
afterEach(() => { stopAnalytics(); cleanup(); document.body.replaceChildren(); clearTrackingDraftMemory(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Inventory: every control the capture listener can see, in every billing state and market, clicked through the real tracker.
// Each click is stopped at the document, after the tracker has seen it, so taking inventory never changes the page (and a label click never reaches its box).
// ---------------------------------------------------------------------------------------------------------------------------------------------
interface Row { state: string; market: MarketName; index: number; tag: string; type: string | null; text: string; ariaLabel: string | null; href: string | null; disabled: boolean; recorded: { label?: string; href?: string }[] | null }
const STATES: Record<string, (market: MarketName) => Promise<string>> = {
  'signed out, nothing chosen': async market => { m.auth = SIGNED_OUT; view(loopPath(market)); await screen.findByRole('link', { name: 'Choose Advanced' }); return loopPath(market); },
  'signed in, nothing chosen': async market => { view(loopPath(market)); await screen.findByRole('button', { name: 'Choose Advanced' }); await waitFor(() => expect(m.read).toHaveBeenCalled()); return loopPath(market); },
  'plan chosen, quote shown, consent not ticked': async market => { view(loopPath(market, 'active')); await screen.findByRole('checkbox', { name: /I choose Advanced/ }); return loopPath(market, 'active'); },
  'plan chosen, consent ticked': async market => { view(loopPath(market, 'active')); await giveConsent(await screen.findByRole('checkbox', { name: /I choose Advanced/ })); return loopPath(market, 'active'); },
  'trial offer, consent not ticked': async market => { m.read.mockResolvedValue(status({ trial: { available: true, eligible: true, days: 7 } })); view(loopPath(market, 'weekly')); await screen.findByRole('checkbox', { name: /I start a 7-day free trial of Starter/ }); return loopPath(market, 'weekly'); },
  'trial offer, consent ticked': async market => { m.read.mockResolvedValue(status({ trial: { available: true, eligible: true, days: 7 } })); view(loopPath(market, 'weekly')); await giveConsent(await screen.findByRole('checkbox', { name: /I start a 7-day free trial of Starter/ })); return loopPath(market, 'weekly'); },
  'after a failed checkout, consent ticked again': async market => {
    m.checkout.mockRejectedValue(new Error('network down'));
    view(loopPath(market, 'active')); await giveConsent(await screen.findByRole('checkbox', { name: /I choose Advanced/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Continue to secure checkout/ }));
    await screen.findByRole('button', { name: 'Resume original secure checkout' });
    await giveConsent(screen.getByRole('checkbox', { name: /I choose Advanced/ })); return loopPath(market, 'active');
  },
  'after a failed trial checkout, consent ticked again': async market => {
    m.read.mockResolvedValue(status({ trial: { available: true, eligible: true, days: 7 } })); m.checkout.mockRejectedValue(new Error('network down'));
    view(loopPath(market, 'weekly')); await giveConsent(await screen.findByRole('checkbox', { name: /I start a 7-day free trial of Starter/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Start 7-day free trial/ }));
    await screen.findByRole('button', { name: 'Resume original secure trial checkout' });
    await giveConsent(screen.getByRole('checkbox', { name: /I start a 7-day free trial of Starter/ })); return loopPath(market, 'weekly');
  },
  'subscribed, in a free trial, cancel consent ticked': async market => {
    m.read.mockResolvedValue(status({ trial: { available: true, eligible: false, days: 7 }, subscription: subscription(MARKETS[market], true) }));
    view(loopPath(market)); await giveConsent(await screen.findByRole('checkbox', { name: /Cancel this free trial/ })); return loopPath(market);
  },
  'subscribed, paid month, cancel consent ticked': async market => {
    m.read.mockResolvedValue(status({ subscription: subscription(MARKETS[market], false) }));
    view(loopPath(market)); await giveConsent(await screen.findByRole('checkbox', { name: /Cancel future monthly renewal/ })); return loopPath(market);
  },
};
/** What each state must record for the controls it names. A label that carries fixed wording records nothing itself (its box does); the box records the wording. */
const EXPECT: Record<string, { match: (row: Row) => boolean; recorded: string[] }[]> = {
  'signed out, nothing chosen': [
    ...['Starter', 'Advanced', 'Pro Job Seeker'].map(name => ({ match: (row: Row) => row.tag === 'a' && row.text === `Choose ${name}`, recorded: [`Choose ${name}`] })),
    ...['Sprint', 'Job Search', 'Career Move'].map(name => ({ match: (row: Row) => row.ariaLabel === `Sign in to buy ${name}`, recorded: [`Sign in to buy ${name}`] })),
    { match: row => row.tag === 'summary' && row.text.startsWith('AI CV tailoring'), recorded: ['Prefer a one-off? See one-time passes'] },
  ],
  'signed in, nothing chosen': [
    ...['Starter', 'Advanced', 'Pro Job Seeker'].map(name => ({ match: (row: Row) => row.tag === 'button' && row.text === `Choose ${name}`, recorded: [`Choose ${name}`] })),
    ...['Sprint', 'Job Search', 'Career Move'].map(name => ({ match: (row: Row) => row.text === `Buy ${name}`, recorded: [`Buy ${name}`] })),
    { match: row => row.text === 'Refresh billing', recorded: ['Refresh billing'] },
    { match: row => row.tag === 'summary' && row.text === 'Billing details', recorded: ['Billing details'] },
  ],
  'plan chosen, quote shown, consent not ticked': [
    { match: row => row.text === 'Selected', recorded: ['Selected'] },
    { match: row => row.text === 'Choose Starter' && row.tag === 'button', recorded: ['Choose Starter'] },
    { match: row => row.text === 'Refresh monthly price', recorded: ['Refresh monthly price'] },
    { match: row => row.text === 'Change billing country', recorded: ['Change billing country'] },
    { match: row => row.tag === 'label' && row.text.startsWith('I choose Advanced at'), recorded: [] },
    { match: row => row.tag === 'input' && row.type === 'checkbox', recorded: [CONSENT] },
    { match: row => row.text === 'terms', recorded: ['terms'] },
    { match: row => row.text === 'refund policy', recorded: ['refund policy'] },
  ],
  'plan chosen, consent ticked': [
    { match: row => row.tag === 'button' && row.text.startsWith('Continue to secure checkout'), recorded: ['Continue to secure checkout'] },
    { match: row => row.tag === 'input' && row.type === 'checkbox', recorded: [CONSENT] },
  ],
  'trial offer, consent not ticked': [
    { match: row => row.tag === 'label' && row.text.startsWith('I start a 7-day free trial of Starter'), recorded: [] },
    { match: row => row.tag === 'input' && row.type === 'checkbox', recorded: [TRIAL_CONSENT] },
  ],
  'trial offer, consent ticked': [
    { match: row => row.tag === 'button' && row.text.startsWith('Start 7-day free trial'), recorded: ['Start 7-day free trial · card required'] },
    { match: row => row.tag === 'input' && row.type === 'checkbox', recorded: [TRIAL_CONSENT] },
  ],
  'after a failed checkout, consent ticked again': [{ match: row => row.tag === 'button' && row.text.startsWith('Resume original'), recorded: ['Resume original secure checkout'] }],
  'after a failed trial checkout, consent ticked again': [{ match: row => row.tag === 'button' && row.text.startsWith('Resume original'), recorded: ['Resume original secure trial checkout'] }],
  'subscribed, in a free trial, cancel consent ticked': [
    { match: row => row.tag === 'label' && row.text.startsWith('Cancel this free trial'), recorded: [] },
    { match: row => row.tag === 'input' && row.type === 'checkbox', recorded: ['Cancel this free trial so the first charge is not taken'] },
    { match: row => row.text === 'Cancel free trial', recorded: ['Cancel free trial'] },
  ],
  'subscribed, paid month, cancel consent ticked': [
    { match: row => row.tag === 'label' && row.text.startsWith('Cancel future monthly renewal'), recorded: [] },
    { match: row => row.tag === 'input' && row.type === 'checkbox', recorded: ['Cancel future monthly renewal'] },
    { match: row => row.text === 'Cancel monthly renewal', recorded: ['Cancel monthly renewal'] },
  ],
};
const describeControl = (element: Element) => ({ tag: element.tagName.toLowerCase(), type: element.getAttribute('type'), text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120), ariaLabel: element.getAttribute('aria-label'), href: element.getAttribute('href'), disabled: (element as HTMLButtonElement).disabled === true });
/** One deliberate click on a control, through the real tracker; returns the click events it recorded (none when the tracker stands aside). */
async function tap(element: Element) {
  const before = clickEvents().length;
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await flush();
  return clickEvents().slice(before).map(event => ({ label: event.label, href: event.href }));
}
async function inventory(stateName: string, market: MarketName): Promise<Row[]> {
  const path = await STATES[stateName](market);
  await startTracker(path);
  const stop = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
  document.addEventListener('click', stop, { capture: true });
  try {
    const rows: Row[] = [];
    for (const [index, element] of [...document.querySelectorAll(CONTROLS)].entries()) {
      const control = describeControl(element);
      rows.push({ state: stateName, market, index, ...control, recorded: control.disabled ? null : await tap(element) });
    }
    return rows;
  } finally { document.removeEventListener('click', stop, { capture: true }); }
}
/** The same test of "is this an amount" written independently of the tracker: the formatted price of every plan in the market, or a symbol or code next to a number. */
const amountIn = (label: string, market: MarketName) => {
  const { currency } = MARKETS[market];
  const formatted = (['weekly', 'active', 'daily'] as Plan[]).map(plan => formatLoopPrice({ currency, amountMinor: LOOP_LOCAL_CURRENCIES[currency].amounts[plan], exponent: LOOP_LOCAL_CURRENCIES[currency].exponent }));
  return formatted.some(text => label.includes(text)) || /\p{Sc}|\b[A-Z]{3}\s*\d|\d\s*[A-Z]{3}\b/u.test(label);
};

describe('every control on /pricing, in each billing state and each market', () => {
  it.each(Object.keys(STATES))('%s', async stateName => {
    const rows: Row[] = [];
    for (const market of MARKET_NAMES) {
      rows.push(...await inventory(stateName, market));
      stopAnalytics(); cleanup(); m.fetch.mockClear(); m.read.mockResolvedValue(status()); m.checkout.mockReset(); m.auth = SIGNED_IN; clearTrackingDraftMemory(); setTrackingDraftOwner('owner', 'session');
    }
    if (process.env.CLICK_LABEL_DUMP) writeFileSync(`${process.env.CLICK_LABEL_DUMP}.${stateName.replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(rows, null, 1));
    expect(rows.length).toBeGreaterThan(10);
    for (const market of MARKET_NAMES) {
      const own = rows.filter(row => row.market === market);
      // 1. No recorded label is an amount, a quote or a currency figure, in any market.
      const leaks = own.flatMap(row => (row.recorded ?? []).map(item => ({ control: row.text.slice(0, 40), label: item.label ?? '' }))).filter(item => amountIn(item.label, market));
      expect(leaks, `${stateName} / ${market}`).toEqual([]);
      // 2. Every recorded label is a usable label (the intake rejects an empty or over-long one).
      for (const row of own) for (const item of row.recorded ?? []) expect(item.label && item.label.length > 0 && item.label.length <= 100, `${market} ${row.text.slice(0, 30)}`).toBe(true);
      // 3. Every enabled control records exactly one click, except a consent label, which stands aside for its own box.
      const odd = own.filter(row => !row.disabled && (row.recorded?.length ?? 0) !== (row.tag === 'label' && row.text.startsWith('I ') || row.tag === 'label' && row.text.startsWith('Cancel ') ? 0 : 1));
      expect(odd.map(row => `${row.tag}:${row.text.slice(0, 40)}:${row.recorded?.length}`), `${stateName} / ${market}`).toEqual([]);
      // 4. The controls named for this state record exactly the stable wording, the same in all three markets.
      for (const expectation of EXPECT[stateName] ?? []) {
        const matched = own.filter(expectation.match);
        expect(matched.length, `${stateName} / ${market}: a control is missing`).toBeGreaterThan(0);
        for (const row of matched) expect((row.recorded ?? []).map(item => item.label), `${stateName} / ${market} / ${row.text.slice(0, 40)}`).toEqual(expectation.recorded);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// One deliberate action is one click: consent, keyboard activation, retries.
// ---------------------------------------------------------------------------------------------------------------------------------------------
async function openPanel(options: { market?: MarketName; plan?: Plan; trial?: boolean } = {}) {
  const { market = 'GBP', plan = options.trial ? 'weekly' : 'active' } = options;
  if (options.trial) m.read.mockResolvedValue(status({ trial: { available: true, eligible: true, days: 7 } }));
  const path = loopPath(market, plan);
  view(path);
  const box = await screen.findByRole('checkbox', { name: options.trial ? /I start a 7-day free trial of Starter/ : /I choose Advanced/ });
  await waitFor(() => expect(box).toBeEnabled()); await settle();   // let the page's price and consent effects finish, so a tap is kept
  await startTracker(path);                                         // started AFTER the set-up, so only the taps below are recorded
  return box;
}

describe('one tap on the consent control is one click', () => {
  const user = () => userEvent.setup({ delay: null });

  it('a tap on the WORDS of the consent text records one click, with fixed wording and no price (the browser clicks the box too, and that is the one kept)', async () => {
    const box = await openPanel();
    await user().click(screen.getByText(/I choose Advanced at/));
    await waitFor(() => expect(box).toBeChecked()); await flush();
    expect(clickEvents().map(event => ({ label: event.label, path: event.path }))).toEqual([{ label: CONSENT, path: '/pricing?loopPlan=active' }]);
  });

  it('a tap on the BOX is one click, and Space on the focused box is one click, both with the same wording', async () => {
    const box = await openPanel();
    const actor = user();
    await actor.click(box); await waitFor(() => expect(box).toBeChecked());
    box.focus(); await actor.keyboard(' '); await waitFor(() => expect(box).not.toBeChecked());
    await actor.keyboard(' '); await waitFor(() => expect(box).toBeChecked());
    await flush();
    expect(labels()).toEqual([CONSENT, CONSENT, CONSENT]);       // tick, untick, tick again: three deliberate actions, three clicks, none merged
  });

  it('the trial consent is one click as well, with the plan name and no price', async () => {
    const box = await openPanel({ trial: true });
    await user().click(screen.getByText(/I start a 7-day free trial of Starter\./));
    await waitFor(() => expect(box).toBeChecked()); await flush();
    expect(labels()).toEqual([TRIAL_CONSENT]);
  });

  it('a link inside the consent text still records its own click and does not tick the box', async () => {
    const box = await openPanel();
    await user().click(screen.getByRole('link', { name: 'terms' })); await flush();
    expect(clickEvents().map(event => ({ label: event.label, href: event.href }))).toEqual([{ label: 'terms', href: '/terms' }]);
    expect(box).not.toBeChecked();
  });

  it('a tap on the words while the box is disabled (a checkout is being created) changes nothing and records nothing', async () => {
    const box = await openPanel();
    m.checkout.mockImplementation(() => new Promise(() => undefined));
    const actor = user();
    await actor.click(box); await waitFor(() => expect(box).toBeChecked());
    await actor.click(screen.getByRole('button', { name: /Continue to secure checkout/ }));
    await waitFor(() => expect(box).toBeDisabled());
    await actor.click(screen.getByText(/I choose Advanced at/)); await flush();
    expect(labels()).toEqual([CONSENT, 'Continue to secure checkout']);
  });

  it('the cancel consent is one click too, in a trial and in a paid month', async () => {
    for (const [trial, wording, name] of [[true, 'Cancel this free trial so the first charge is not taken', /Cancel this free trial/], [false, 'Cancel future monthly renewal', /Cancel future monthly renewal/]] as const) {
      m.read.mockResolvedValue(status({ trial: { available: true, eligible: false, days: 7 }, subscription: subscription(MARKETS.GBP, trial) }));
      view(loopPath('GBP'));
      const box = await screen.findByRole('checkbox', { name }); await waitFor(() => expect(box).toBeEnabled()); await settle();
      await startTracker(loopPath('GBP'));
      await user().click(screen.getByText(name)); await waitFor(() => expect(box).toBeChecked()); await flush();
      expect(labels(), String(trial)).toEqual([wording]);
      stopAnalytics(); cleanup(); m.fetch.mockClear();
    }
  });

  it('a checkbox that is NOT a billing consent still records its label and its box, as it always did (also on /pricing)', async () => {
    for (const path of ['/pricing', '/job-loop', '/contact']) {
      await startTracker(path);
      const host = document.createElement('div');
      host.innerHTML = '<label>Send me updates<input type="checkbox"></label>'; document.body.appendChild(host);
      await userEvent.setup({ delay: null }).click(host.querySelector('label')!); await flush();
      expect(labels(), path).toEqual(['Send me updates', 'INPUT']);
      stopAnalytics(); host.remove(); m.fetch.mockClear();
    }
  });

  it('a label with fixed wording stands aside only for a checkbox or radio; for any other control it still records its own click', async () => {
    const out = await recordOn('/pricing', '<label data-analytics-label="Pick a size">Size<select><option>S</option></select></label><label data-analytics-label="Pick a colour">Colour<input type="text"></label>');
    expect(out[0].recorded[0]).toBe('Pick a size');
    expect(out.find(item => item.text.startsWith('Colour'))!.recorded[0]).toBe('Pick a colour');
  });
});

describe('keyboard activation records exactly one click, and a retry is its own click', () => {
  const user = () => userEvent.setup({ delay: null });

  it('Enter and Space on plan buttons, Enter on a sign-in plan link and Enter on Continue: one click each', async () => {
    const path = loopPath('GBP');
    view(path); await screen.findByRole('button', { name: 'Choose Advanced' }); await settle();
    await startTracker(path);
    const actor = user();
    screen.getByRole('button', { name: 'Choose Starter' }).focus(); await actor.keyboard('{Enter}');
    screen.getByRole('button', { name: 'Choose Pro Job Seeker' }).focus(); await actor.keyboard(' ');
    const box = await screen.findByRole('checkbox', { name: /I choose Pro Job Seeker/ }); await waitFor(() => expect(box).toBeEnabled()); await settle();
    box.focus(); await actor.keyboard(' '); await waitFor(() => expect(box).toBeChecked());
    m.checkout.mockImplementation(async (_scope, intent) => receipt(intent));
    screen.getByRole('button', { name: /Continue to secure checkout/ }).focus(); await actor.keyboard('{Enter}');
    await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1)); await flush();
    expect(labels()).toEqual(['Choose Starter', 'Choose Pro Job Seeker', 'I choose Pro Job Seeker and automatic monthly renewal', 'Continue to secure checkout']);
    expect(m.checkout).toHaveBeenCalledTimes(1);
  });

  it('Enter on a signed-out plan link records one click with its plan name and no market', async () => {
    m.auth = SIGNED_OUT;
    const path = loopPath('AED');
    view(path); const link = await screen.findByRole('link', { name: 'Choose Advanced' });
    await startTracker(path);
    link.focus(); await user().keyboard('{Enter}'); await flush();
    expect(clickEvents().map(event => ({ label: event.label, href: event.href }))).toEqual([{ label: 'Choose Advanced', href: '/auth' }]);
    expect(JSON.stringify(bodies())).not.toMatch(/AED|country|currency|next/);
  });

  it('a retry after a failed checkout is its own click, named differently from the first confirmation, and the tracker never merges them', async () => {
    const box = await openPanel();
    const actor = user();
    m.checkout.mockRejectedValueOnce(new Error('network down')).mockRejectedValueOnce(new Error('network down')).mockImplementationOnce(async (_scope, intent) => receipt(intent));
    const tick = async () => { await waitFor(() => expect(box).toBeEnabled()); await settle(); await actor.click(screen.getByText(/I choose Advanced at/)); await waitFor(() => expect(box).toBeChecked()); };
    await tick(); await actor.click(screen.getByRole('button', { name: /Continue to secure checkout/ }));
    await screen.findByRole('button', { name: 'Resume original secure checkout' });
    await tick(); await actor.click(screen.getByRole('button', { name: 'Resume original secure checkout' }));
    await waitFor(() => expect(m.checkout).toHaveBeenCalledTimes(2)); await waitFor(() => expect(box).toBeEnabled());
    await tick(); await actor.click(screen.getByRole('button', { name: 'Resume original secure checkout' }));
    await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1)); await flush();
    expect(labels()).toEqual([CONSENT, 'Continue to secure checkout', CONSENT, 'Resume original secure checkout', CONSENT, 'Resume original secure checkout']);
    // The retry reuses the original request (existing behaviour, untouched): only the measurement is under test here.
    expect(new Set(m.checkout.mock.calls.map(call => call[1].requestId)).size).toBe(1);
  });

  it('the trial confirmation and its recovery keep their own static wording', async () => {
    const box = await openPanel({ trial: true });
    const actor = user();
    m.checkout.mockRejectedValueOnce(new Error('network down'));
    await actor.click(box); await waitFor(() => expect(box).toBeChecked());
    await actor.click(screen.getByRole('button', { name: /Start 7-day free trial/ }));
    await screen.findByRole('button', { name: 'Resume original secure trial checkout' }); await flush();
    expect(labels()).toEqual([TRIAL_CONSENT, 'Start 7-day free trial · card required']);
    await waitFor(() => expect(box).toBeEnabled()); await settle(); await actor.click(box); await waitFor(() => expect(box).toBeChecked());
    m.checkout.mockImplementationOnce(async (_scope, intent) => receipt(intent));
    await actor.click(screen.getByRole('button', { name: 'Resume original secure trial checkout' }));
    await waitFor(() => expect(m.open).toHaveBeenCalled()); await flush();
    expect(labels().slice(2)).toEqual([TRIAL_CONSENT, 'Resume original secure trial checkout']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The rule at the capture, with controls nobody gave fixed wording; other pages; private routes; privacy switches; legacy and new batches.
// ---------------------------------------------------------------------------------------------------------------------------------------------
async function recordOn(path: string, html: string) {
  await startTracker(path);
  const host = document.createElement('div'); host.innerHTML = html; document.body.appendChild(host);
  host.addEventListener('click', event => { if ((event.target as Element).closest('a')) event.preventDefault(); });      // no navigation in jsdom; labels keep their activation
  const out: { text: string; recorded: string[] }[] = [];
  for (const element of host.querySelectorAll(CONTROLS)) {
    const before = clickEvents().length;
    (element as HTMLElement).click(); await flush();
    out.push({ text: (element.textContent ?? '').trim(), recorded: clickEvents().slice(before).map(event => event.label ?? '') });
  }
  return out;
}
const ARABIC = String.fromCodePoint(0x62f, 0x2e, 0x625), ARABIC_DIGITS = String.fromCodePoint(0x661, 0x660, 0x669);
const PRICEY = ['<button>Upgrade now AED 219</button>', '<a href="/x">From £44 a month</a>', '<button>€59/month</button>', '<button>¥4,999</button>', '<button>USD 29</button>', '<button>59 USD</button>', `<button>${ARABIC_DIGITS} ${ARABIC}</button>`, '<summary>Plans from $29/month</summary>'];

describe('the rule at the capture', () => {
  it('on /pricing, a control that still reads as an amount is recorded as its tag name, never its text', async () => {
    const out = await recordOn('/pricing', PRICEY.join(''));
    expect(out.map(item => item.recorded)).toEqual([['button'], ['a'], ['button'], ['button'], ['button'], ['button'], ['button'], ['summary']]);
  });

  it('stable wording on /pricing is untouched: plan names, verbs, trial and recovery wording, FAQ questions', async () => {
    const wording = ['Choose Pro Job Seeker', 'Choose Starter', 'Sign in to buy Job Search', 'Buy Career Move', 'Start 7-day free trial · card required', 'Resume original secure checkout', 'Resume original secure trial checkout', 'Continue to secure checkout', 'Refresh monthly price', 'Questions about pricing', '300 AI-tailored CVs', 'Use them within 30 days', 'What if a pass isn’t right for me?'];
    const out = await recordOn('/pricing', wording.map(text => `<button>${text}</button>`).join(''));
    expect(out.map(item => item.recorded)).toEqual(wording.map(text => [text]));
  });

  it('the same text on any OTHER public page, or on a path that only starts like pricing, is recorded exactly as before', async () => {
    for (const path of ['/job-loop', '/', '/faq', '/pricing-guide', '/for-students']) {
      const out = await recordOn(path, PRICEY.join(''));
      expect(out.map(item => item.recorded[0]), path).toEqual(['Upgrade now AED 219', 'From £44 a month', '€59/month', '¥4,999', 'USD 29', '59 USD', `${ARABIC_DIGITS} ${ARABIC}`, 'Plans from $29/month']);
      stopAnalytics(); cleanup(); m.fetch.mockClear(); document.body.replaceChildren();
    }
  });

  it('a control may state fixed wording; it wins over its own text on a public page, and a private route ignores it and keeps the tag name', async () => {
    const html = '<button data-analytics-label="Continue to secure checkout">Continue to secure checkout · £44/month</button>';
    expect((await recordOn('/pricing', html))[0].recorded).toEqual(['Continue to secure checkout']);
    stopAnalytics(); m.fetch.mockClear(); document.body.replaceChildren();
    expect((await recordOn('/loop', html))[0].recorded).toEqual(['button']);
    stopAnalytics(); m.fetch.mockClear(); document.body.replaceChildren();
    // Fixed wording that is itself an amount is caught by the same rule.
    expect((await recordOn('/pricing', '<button data-analytics-label="Pay £44 now">x</button>'))[0].recorded).toEqual(['button']);
  });

  it('an ordinary label and box elsewhere still record two clicks; the existing opt-out attribute still records none', async () => {
    const html = '<label>Remember me<input type="checkbox"></label><div data-analytics="off"><label data-analytics-label="Hidden consent">Hidden<input type="checkbox"></label><button>Private action</button></div>';
    const out = await recordOn('/pricing', html);
    expect(out.map(item => item.recorded)).toEqual([['Remember me', 'INPUT'], ['INPUT'], [], [], []]);
  });

  it('private routes keep tag names for the whole billing panel, and the consent is one click there too', async () => {
    m.read.mockResolvedValue(status());
    const path = '/loop?loopPlan=active';
    view(path, true);
    const box = await screen.findByRole('checkbox', { name: /I choose Advanced/ }); await waitFor(() => expect(box).toBeEnabled()); await settle();
    await startTracker(path);
    const actor = userEvent.setup({ delay: null });
    await actor.click(screen.getByText(/I choose Advanced at/)); await waitFor(() => expect(box).toBeChecked());
    m.checkout.mockImplementation(async (_scope, intent) => receipt(intent));
    await actor.click(screen.getByRole('button', { name: /Continue to secure checkout/ }));
    await waitFor(() => expect(m.open).toHaveBeenCalled()); await flush();
    expect(clickEvents().map(event => event.label)).toEqual(['input', 'button']);
    expect(JSON.stringify(sent().map(event => [event.label, event.href, (event as { title?: string }).title]))).not.toMatch(/Advanced|choose|Continue|£|44|GBP|monthly/i);
  });

  it('the plan link keeps its destination without the billing market, and nothing about the market reaches the tracker', async () => {
    m.auth = SIGNED_OUT;
    for (const market of MARKET_NAMES) {
      const path = loopPath(market); view(path); const link = await screen.findByRole('link', { name: 'Choose Starter' }); await startTracker(path);
      link.addEventListener('click', event => event.preventDefault());
      await userEvent.setup({ delay: null }).click(link); await flush();
      expect(clickEvents().map(event => ({ label: event.label, href: event.href, path: event.path }))).toEqual([{ label: 'Choose Starter', href: '/auth', path: '/pricing' }]);
      expect(JSON.stringify(bodies())).not.toMatch(/country|currency|GBP|AED|USD|next=/);
      stopAnalytics(); cleanup(); m.fetch.mockClear();
    }
  });
});

describe('batches: older clients, this client, and the unchanged intake', () => {
  const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  // A batch exactly as the client before this change sent it for a plan choice, a tap on the consent words and Continue (captured in the browser harness, fictional ids).
  const legacy = () => ({
    visitorId: ID(1), sessionId: ID(2), batchId: ID(3), token: null, context: { landing: '/pricing', screen: '390x844' },
    events: [
      { id: ID(10), pageId: ID(9), kind: 'page_view', at: '2026-11-24T07:00:00.000Z', path: '/pricing', title: 'Pricing | Jobvance' },
      { id: ID(11), pageId: ID(9), kind: 'click', at: '2026-11-24T07:00:01.000Z', path: '/pricing', label: 'Choose Advanced', href: '/auth' },
      { id: ID(12), pageId: ID(9), kind: 'click', at: '2026-11-24T07:00:02.000Z', path: '/pricing', label: 'I choose Advanced at £44 GBP each month, with tax included, and automatic monthly renewal until I ca' },
      { id: ID(13), pageId: ID(9), kind: 'click', at: '2026-11-24T07:00:02.000Z', path: '/pricing', label: 'INPUT' },
      { id: ID(14), pageId: ID(9), kind: 'click', at: '2026-11-24T07:00:03.000Z', path: '/pricing', label: 'Continue to secure checkout · £44/month' },
      { id: ID(15), pageId: ID(9), kind: 'click', at: '2026-11-24T07:00:04.000Z', path: '/pricing', label: 'AI CV tailoring · one-time passes from $9Prefer a one-off? See one-time passesTailor your CV to a jo' },
      { id: ID(16), pageId: ID(9), kind: 'page_leave', at: '2026-11-24T07:00:05.000Z', path: '/pricing', durationMs: 5000, props: { maxScroll: 40, hidden: true } },
    ],
  });
  const NOW = Date.parse('2026-11-24T07:00:10.000Z');

  it('a batch already queued by an older client (price in labels, label then INPUT) is still accepted, event for event, by the unchanged intake', () => {
    const accepted = cleanBatch(legacy(), NOW);
    expect(accepted).not.toBeNull();
    expect(accepted!.events.map(event => event.label)).toEqual([undefined, 'Choose Advanced', expect.stringContaining('£44'), 'INPUT', expect.stringContaining('£44'), expect.stringContaining('$9'), undefined]);
  });

  it('every batch this client sends through a full pricing journey is accepted by the same intake', async () => {
    const box = await openPanel();
    const actor = userEvent.setup({ delay: null });
    m.checkout.mockImplementation(async (_scope, intent) => receipt(intent));
    await actor.click(screen.getByText(/I choose Advanced at/)); await waitFor(() => expect(box).toBeChecked());
    await actor.click(screen.getByRole('button', { name: /Continue to secure checkout/ })); await waitFor(() => expect(m.open).toHaveBeenCalled());
    await actor.click(screen.getByText('Prefer a one-off? See one-time passes')); await flush();
    expect(bodies().length).toBeGreaterThan(0);
    for (const body of bodies()) expect(cleanBatch(body), JSON.stringify(body.events.map((event: Sent) => event.label))).not.toBeNull();
    expect(labels()).toEqual([CONSENT, 'Continue to secure checkout', 'Prefer a one-off? See one-time passes']);
  });

  it('this client changes no event kind, no property and no field: the same keys the intake already allows', async () => {
    const box = await openPanel(); await userEvent.setup({ delay: null }).click(box); await flush();
    for (const event of sent()) {
      expect(Object.keys(event).every(key => ['id', 'pageId', 'kind', 'at', 'path', 'title', 'label', 'href', 'durationMs', 'props'].includes(key))).toBe(true);
      expect(['page_view', 'page_leave', 'click', 'form_submit', 'identify']).toContain(event.kind);
    }
  });

  it('measurement and Meta stay apart: the tracker imports nothing from the Meta modules and a billing journey calls neither the pixel nor the server notice', async () => {
    const source = readFileSync('src/lib/analytics.ts', 'utf8');
    expect(source).not.toMatch(/meta-pixel|meta-commerce|meta-conversions|fbq/);
    const box = await openPanel(); await userEvent.setup({ delay: null }).click(box); await flush();
    expect(m.invoke).not.toHaveBeenCalled();
    expect((window as unknown as { fbq?: unknown }).fbq).toBeUndefined();
  });
});
