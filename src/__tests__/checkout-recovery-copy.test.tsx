import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');

// The whole billing client runs for real (status, quote and checkout validation and its user-facing messages);
// only the Supabase function transport, the owner check and the hand-off to the provider page are replaced.
const m = vi.hoisted(() => ({ auth: { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null } as Record<string, any>, invoke: vi.fn(), owner: vi.fn(), open: vi.fn(), report: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: m.invoke } } }));
vi.mock('@/lib/job-loop-api', async original => ({ ...(await original<typeof import('@/lib/job-loop-api')>()), requireLoopOwner: m.owner }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => m.auth }));
vi.mock('@/lib/meta-commerce', () => ({ reportMetaCheckout: m.report }));
vi.mock('@/lib/payment-checkout', () => ({ openPaymentCheckout: m.open }));
import LoopSubscriptionBilling from '@/components/LoopSubscriptionBilling';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { LOOP_LOCAL_CURRENCIES, LOOP_LOCAL_PRICE_CATALOG_VERSION } from '@/lib/loop-local-prices';
import { giveConsent } from '@/test-utils/billing-consent';

type Mode = 'ok' | 'capacity' | 'unavailable' | 'http500' | 'network' | 'fetcherror' | 'hold';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const gbp = (quoteId: string | null = id(41)) => ({ quoteId, country: 'GB', currency: 'GBP', amountMinor: LOOP_LOCAL_CURRENCIES.GBP.amounts.weekly, exponent: 2, catalogVersion: LOOP_LOCAL_PRICE_CATALOG_VERSION, taxInclusive: true, interval: 'month' });
const world = { mode: 'ok' as Mode, trial: false, checkout: null as null | Record<string, unknown>, quotes: new Map<string, any>(), calls: [] as any[], release: undefined as undefined | (() => void) };
const reply = (code: string, status: number) => ({ data: null, error: { context: new Response(JSON.stringify({ code }), { status }) } });
const statusBody = () => ({ billingConfigured: true, fulfillmentPending: false, billingMode: 'live', generation: 0, entitlement: null, subscription: null, checkout: world.checkout, cancelRequest: null,
  plans: [{ id: 'weekly', amount: 2900, currency: 'USD', interval: 'month', runsPerWeek: 1 }, { id: 'active', amount: 5900, currency: 'USD', interval: 'month', runsPerWeek: 3 }, { id: 'daily', amount: 9900, currency: 'USD', interval: 'month', runsPerWeek: 7 }],
  ...(world.trial ? { trial: { available: true, eligible: true, days: 7 } } : {}) });
const receipt = (body: any) => {
  const quote = body.quoteId ? world.quotes.get(body.quoteId) ?? world.checkout?.pricing : null;
  const pricing = quote ? { quoteId: quote.quoteId, country: quote.country, currency: quote.currency, amountMinor: quote.amountMinor, exponent: quote.exponent, catalogVersion: quote.catalogVersion, taxInclusive: true, interval: 'month' } : undefined;
  return { provider: 'dodo', billingMode: 'live', generation: 0, requestId: body.requestId, plan: body.plan, sessionId: 'cks_example', url: 'https://checkout.dodopayments.com/session/cks_example', ...(pricing ? { pricing } : {}), ...(body.trial ? { trialDays: 7 } : {}) };
};
const checkoutCalls = () => world.calls.filter(call => call.action === 'checkout');
const statusReads = () => world.calls.filter(call => call.action === 'status').length;
const PATH = '/pricing?loopPlan=weekly&country=GB&currency=GBP';
const show = (path = PATH) => render(<MemoryRouter initialEntries={[path]}><LoopSubscriptionBilling /></MemoryRouter>);
const box = () => document.querySelector('label.jl-consent input') as HTMLInputElement;
const main = () => document.querySelector('button.product-button') as HTMLButtonElement;
const panelBox = () => screen.findByRole('checkbox', { name: /I choose Starter|I start a 7-day free trial of Starter/ });
const tick = async () => giveConsent(await panelBox());
const failFirstAttempt = async (path = PATH) => { show(path); await tick(); fireEvent.click(main()); await screen.findByRole('alert'); await waitFor(() => expect(main()).not.toHaveTextContent('Confirming checkout')); };
const refreshBilling = async () => { const before = statusReads(); fireEvent.click(screen.getByRole('button', { name: 'Refresh billing' })); await waitFor(() => expect(statusReads()).toBeGreaterThan(before)); await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh billing' })).toBeEnabled()); };
/** Every control the lock and enable logic touches, read without using any wording. */
const flags = () => ({
  plans: [...document.querySelectorAll<HTMLButtonElement>('article.pricing-card button')].map(button => button.disabled),
  selects: [...document.querySelectorAll<HTMLSelectElement>('.loop-price-market select')].map(select => select.disabled),
  consent: box() ? { disabled: box().disabled, checked: box().checked } : null,
  main: main() ? main().disabled : null,
  refreshBilling: (screen.getByRole('button', { name: 'Refresh billing' }) as HTMLButtonElement).disabled,
  refreshPrice: !!screen.queryByRole('button', { name: 'Refresh monthly price' }),
});
const server = (changes: Record<string, unknown> = {}) => ({ requestId: id(33), plan: 'weekly', status: 'ready', checkoutUrl: 'https://checkout.dodopayments.com/cks_fixture', pricing: gbp(), ...changes });

beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner', 'session');
  m.auth = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };
  world.mode = 'ok'; world.trial = false; world.checkout = null; world.quotes = new Map(); world.calls = []; world.release = undefined;
  m.owner.mockReset().mockResolvedValue(undefined); m.open.mockReset().mockResolvedValue(undefined); m.report.mockReset().mockResolvedValue(undefined);
  m.invoke.mockReset().mockImplementation(async (_name: string, { body }: { body: any }) => {
    world.calls.push(body);
    if (body.action === 'status') return { data: statusBody(), error: null };
    if (body.action === 'quote') { const quote = { ...gbp(id(41)), requestId: body.requestId, generation: body.expectedGeneration, plan: body.plan, expiresAt: new Date(Date.now() + 900000).toISOString() }; world.quotes.set(quote.quoteId, quote); return { data: quote, error: null }; }
    if (body.action === 'checkout') {
      if (world.mode === 'capacity') return reply('LOOP_PILOT_FULL', 429);
      if (world.mode === 'unavailable') return reply('LOOP_BILLING_UNAVAILABLE', 503);
      if (world.mode === 'http500') return { data: null, error: { context: new Response(JSON.stringify({ error: 'internal' }), { status: 500 }) } };
      if (world.mode === 'network') throw new Error('connection reset');
      if (world.mode === 'fetcherror') return { data: null, error: new Error('Failed to send a request to the Edge Function') };
      if (world.mode === 'hold') await new Promise<void>(resolve => { world.release = resolve; });
      return { data: receipt(body), error: null };
    }
    return { data: null, error: null };
  });
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); });

const OLD = { resume: 'Resume original secure checkout', resumeTrial: 'Resume original secure trial checkout', fixed: 'Billing country and currency are fixed for the open checkout.', fixedNoCountry: 'The open checkout keeps its original price and currency.', country: 'This checkout keeps its original country.' };
const NEW = {
  retry: 'Retry your original request', retryTrial: 'Retry your original trial request',
  kept: 'Billing country and currency are kept for your original request.', keptNoCountry: 'Your original request keeps its original price and currency.', country: 'Your original request keeps its original country.',
  note: 'We have not confirmed that your original request opened a secure checkout. Retrying sends that same request again, not a new one.',
};
const REFUSALS: [string, Mode, string][] = [
  ['capacity full (LOOP_PILOT_FULL)', 'capacity', 'Automated Job Loop is at its current account capacity. A new checkout was not opened. Existing access and saved work are unchanged.'],
  ['billing unavailable (LOOP_BILLING_UNAVAILABLE)', 'unavailable', 'Automated Job Loop checkout is not available right now. Your existing access and saved work are unchanged.'],
  ['HTTP 500 with no code', 'http500', 'We could not confirm this billing action. Refresh billing before retrying the original request.'],
  ['dropped connection (the call throws)', 'network', 'The payment action could not be confirmed. Refresh billing before retrying the original request.'],
  ['dropped connection (the client library reports a fetch error)', 'fetcherror', 'We could not confirm this billing action. Refresh billing before retrying the original request.'],
];
const countryLine = () => screen.getByText('United Kingdom', { selector: 'strong' }).parentElement!.textContent?.replace(/\s+/g, ' ').trim();
/** The words around the buttons: the market note, the confirmation panel and any alert. */
const recoveryText = () => ['.loop-price-market', '[aria-label^="Confirm Automated Job Loop"]', '[role=alert]'].map(selector => document.querySelector(selector)?.textContent ?? '').join(' | ');
/** Hosted-checkout wording that must not appear unless the server has confirmed a hosted session. */
const expectNoHostedWording = () => {
  expect(screen.queryByRole('button', { name: OLD.resume })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: OLD.resumeTrial })).not.toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/fixed for the open checkout|open checkout|This checkout keeps its original country|You have an open/i);
};

describe('lock and enable behaviour is the same wherever the copy differs', () => {
  const FRESH_TICKED = { plans: [false, false, false], selects: [false, false], consent: { disabled: false, checked: true }, main: false, refreshBilling: false, refreshPrice: true };
  const LOCKED = { plans: [false, true, true], selects: [true, true], consent: { disabled: false, checked: false }, main: true, refreshBilling: false, refreshPrice: false };
  const LOCKED_TICKED = { ...LOCKED, consent: { disabled: false, checked: true }, main: false };
  const LINK_PENDING = { plans: [false, true, true], selects: [true, true], consent: null, main: null, refreshBilling: false, refreshPrice: false };
  const IN_FLIGHT = { plans: [true, true, true], selects: [true, true], consent: { disabled: true, checked: false }, main: true, refreshBilling: true, refreshPrice: false };
  it('ordinary visit: nothing is locked and the checkout button follows the consent box', async () => {
    show(); await tick(); expect(flags()).toEqual(FRESH_TICKED);
  });
  it.each(REFUSALS)('after %s the same controls are locked and a fresh tick enables the retry', async (_name, mode) => {
    world.mode = mode; await failFirstAttempt();
    expect(flags()).toEqual(LOCKED);
    await tick(); expect(flags()).toEqual(LOCKED_TICKED);
  });
  it('Refresh billing with no checkout on the server releases nothing and clears the consent', async () => {
    world.mode = 'unavailable'; await failFirstAttempt(); await tick(); expect(flags()).toEqual(LOCKED_TICKED);
    await refreshBilling(); expect(flags()).toEqual(LOCKED);
  });
  it('while the first request is in flight everything is disabled, whatever it later returns', async () => {
    world.mode = 'hold'; show(); await tick(); fireEvent.click(main());
    await waitFor(() => expect(flags()).toEqual(IN_FLIGHT));
    world.release?.(); await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
  });
  it('a server-confirmed checkout locks the same controls', async () => {
    world.checkout = server(); show(); await panelBox(); expect(flags()).toEqual(LOCKED);
    await tick(); expect(flags()).toEqual(LOCKED_TICKED);
  });
  it.each(['creating', 'uncertain'])('a %s server order with no hosted link keeps the same plan and market locks, and has no consent box or resume button to enable', async state => {
    world.checkout = server({ status: state, checkoutUrl: null }); show(); await screen.findByText(/checkout request is recorded/);
    expect(flags()).toEqual(LINK_PENDING);
  });
  it('after a receipt the same controls stay locked', async () => {
    show(); await tick(); fireEvent.click(main()); await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
    await screen.findByText('Checkout opened. Access starts only after payment is confirmed.');
    await waitFor(() => expect(flags()).toEqual(LOCKED));
  });
  it('the trial offer locks the same controls after a refusal', async () => {
    world.trial = true; world.mode = 'capacity'; await failFirstAttempt();
    expect(flags()).toEqual(LOCKED);
  });
  it('a retry reuses the original request, quote and plan and asks for no new price', async () => {
    world.mode = 'http500'; await failFirstAttempt(); world.mode = 'ok';
    await tick(); fireEvent.click(main());
    await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()).toHaveLength(2); expect(checkoutCalls()[1]).toEqual(checkoutCalls()[0]);
    expect(world.calls.filter(call => call.action === 'quote')).toHaveLength(1);
  });
});

describe('local attempt the server has not confirmed: retry wording', () => {
  it.each(REFUSALS)('%s: the panel describes a retry of the original request and no open checkout', async (_name, mode, alert) => {
    world.mode = mode; await failFirstAttempt();
    expect(screen.getByRole('alert').textContent).toBe(alert);
    expect(main().textContent).toBe(NEW.retry);
    expect(screen.getByText(NEW.kept)).toBeInTheDocument();
    expect(countryLine()).toBe(`Billing country United Kingdom. ${NEW.country}`);
    expect(screen.getByText(NEW.note)).toBeInTheDocument();
    expectNoHostedWording();
  });
  it('the retry note describes the button for assistive technology, before the tick reason', async () => {
    world.mode = 'network'; await failFirstAttempt();
    expect(main()).toHaveAttribute('aria-describedby', 'loop-original-request-note loop-checkout-reason');
    expect(document.getElementById('loop-original-request-note')?.textContent).toBe(NEW.note);
    expect(document.getElementById('loop-checkout-reason')?.textContent).toBe('Tick the box above to continue.');
    await tick(); expect(main()).toHaveAttribute('aria-describedby', 'loop-original-request-note');
  });
  it('a trial request retried after a refusal is labelled as a trial request', async () => {
    world.trial = true; world.mode = 'capacity'; await failFirstAttempt();
    expect(main().textContent).toBe(NEW.retryTrial);
    expect(screen.getByRole('checkbox', { name: /I start a 7-day free trial of Starter/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: OLD.resumeTrial })).not.toBeInTheDocument();
  });
  it('without a billing country the note keeps the original price and currency for the original request', async () => {
    world.mode = 'unavailable'; await failFirstAttempt('/pricing?loopPlan=weekly&country=other&currency=USD');
    expect(screen.getByText(NEW.keptNoCountry)).toBeInTheDocument();
    expect(screen.queryByText(OLD.fixedNoCountry)).not.toBeInTheDocument();
    expect(main().textContent).toBe(NEW.retry);
  });
  it('Refresh billing that finds no checkout keeps the retry wording and does not claim the request never reached the provider', async () => {
    world.mode = 'capacity'; await failFirstAttempt(); await refreshBilling();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(main().textContent).toBe(NEW.retry); expect(screen.getByText(NEW.kept)).toBeInTheDocument(); expect(screen.getByText(NEW.note)).toBeInTheDocument();
    expect(recoveryText()).not.toMatch(/never reached|was not sent|no order|nothing was charged|not be charged/i);
    expectNoHostedWording();
  });
  it('the retry reassurance is limited to what the code does: the same request, never a promise about charges', async () => {
    world.mode = 'network'; await failFirstAttempt();
    expect(recoveryText()).not.toMatch(/charged twice|double|will not be charged|cannot be charged|nothing was charged/i);
    world.mode = 'ok'; await tick(); fireEvent.click(main()); await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()[1].requestId).toBe(checkoutCalls()[0].requestId);
  });
  it('a first request still in flight shows no retry wording', async () => {
    world.mode = 'hold'; show(); await tick(); fireEvent.click(main());
    await waitFor(() => expect(main()).toHaveTextContent('Confirming checkout…'));
    expect(screen.queryByText(NEW.note)).not.toBeInTheDocument(); expect(main()).not.toHaveAttribute('aria-describedby');
    world.release?.(); await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
  });
});

describe('server-confirmed hosted session keeps the existing resume wording', () => {
  it('an open checkout from the status read', async () => {
    world.checkout = server(); show(); await panelBox();
    expect(main().textContent).toBe(OLD.resume);
    expect(screen.getByText(OLD.fixed)).toBeInTheDocument();
    expect(countryLine()).toBe(`Billing country United Kingdom. ${OLD.country}`);
    expect(screen.getByText(/You have an open Starter checkout/)).toBeInTheDocument();
    expect(screen.queryByText(NEW.note)).not.toBeInTheDocument(); expect(screen.queryByText(NEW.kept)).not.toBeInTheDocument();
    expect(main()).toHaveAttribute('aria-describedby', 'loop-checkout-reason');
  });
  it('an open trial checkout from the status read', async () => {
    world.checkout = server({ trialDays: 7 }); world.trial = true; show(); await screen.findByRole('checkbox', { name: /I start a 7-day free trial of Starter/ });
    expect(main().textContent).toBe(OLD.resumeTrial); expect(screen.getByText(OLD.fixed)).toBeInTheDocument();
  });
  it('an open checkout without a country keeps its existing note', async () => {
    world.checkout = server({ pricing: { ...gbp(null), country: null, currency: 'USD', amountMinor: 2900, catalogVersion: 'legacy-usd-v1' } }); show('/pricing?loopPlan=weekly&country=other&currency=USD'); await panelBox();
    expect(screen.getByText(OLD.fixedNoCountry)).toBeInTheDocument(); expect(main().textContent).toBe(OLD.resume);
  });
  it('a refresh that finds the open hosted checkout of the same request switches to the resume wording and keeps every lock', async () => {
    world.mode = 'http500'; await failFirstAttempt();
    expect(main().textContent).toBe(NEW.retry);
    world.checkout = server({ requestId: checkoutCalls()[0].requestId, pricing: gbp(checkoutCalls()[0].quoteId) });
    await refreshBilling();
    expect(main().textContent).toBe(OLD.resume); expect(screen.getByText(OLD.fixed)).toBeInTheDocument();
    expect(screen.getByText(/You have an open Starter checkout/)).toBeInTheDocument(); expect(screen.queryByText(NEW.note)).not.toBeInTheDocument(); expect(screen.queryByText(NEW.kept)).not.toBeInTheDocument();
    expect(flags()).toEqual({ plans: [false, true, true], selects: [true, true], consent: { disabled: false, checked: false }, main: true, refreshBilling: false, refreshPrice: false });
  });
  it('the request the server answered with a receipt is a hosted session, so the resume wording returns once it is opened', async () => {
    show(); await tick(); fireEvent.click(main());
    await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(main().textContent).toBe(OLD.resume));
    expect(screen.getByText(OLD.fixed)).toBeInTheDocument(); expect(screen.queryByText(NEW.note)).not.toBeInTheDocument();
    expect(screen.getByText('Checkout opened. Access starts only after payment is confirmed.')).toBeInTheDocument();
  });
  it('a failure after the receipt (the provider page cannot be opened) still has a confirmed hosted session', async () => {
    m.open.mockRejectedValue(new Error('blocked')); show(); await tick(); fireEvent.click(main());
    expect((await screen.findByRole('alert')).textContent).toBe('Checkout could not be confirmed. Refresh billing before trying again; use the original checkout if one is shown.');
    await waitFor(() => expect(main().textContent).toBe(OLD.resume)); expect(screen.getByText(OLD.fixed)).toBeInTheDocument(); expect(screen.queryByText(NEW.note)).not.toBeInTheDocument();
  });
  it('a receipt that does not match the plan and price is not a confirmed hosted session', async () => {
    m.invoke.mockImplementation(async (_name: string, { body }: { body: any }) => {
      world.calls.push(body);
      if (body.action === 'status') return { data: statusBody(), error: null };
      if (body.action === 'quote') { const quote = { ...gbp(id(41)), requestId: body.requestId, generation: body.expectedGeneration, plan: body.plan, expiresAt: new Date(Date.now() + 900000).toISOString() }; world.quotes.set(quote.quoteId, quote); return { data: quote, error: null }; }
      return { data: { ...receipt(body), plan: 'daily' }, error: null };
    });
    show(); await tick(); fireEvent.click(main());
    expect((await screen.findByRole('alert')).textContent).toBe('The checkout receipt did not match your chosen plan and monthly price. Refresh billing before continuing.');
    await waitFor(() => expect(main().textContent).toBe(NEW.retry)); expect(m.open).not.toHaveBeenCalled();
  });
});

describe('the confirm button keeps three distinct recorded labels (merged with the fixed click wording)', () => {
  const label = () => main().getAttribute('data-analytics-label');
  it('a first checkout, a retry of an unconfirmed local request and a resume of a usable hosted checkout are three different labels, equal to the start of the visible wording', async () => {
    show(); await panelBox();
    expect(label()).toBe('Continue to secure checkout'); expect(main().textContent).toBe('Continue to secure checkout · £22/month');
    cleanup(); world.mode = 'network'; await failFirstAttempt();
    expect(label()).toBe(NEW.retry); expect(main().textContent).toBe(NEW.retry);
    cleanup(); world.mode = 'ok'; world.checkout = server(); show(); await panelBox();
    expect(label()).toBe(OLD.resume); expect(main().textContent).toBe(OLD.resume);
  });
  it('the trial variants are three different labels as well', async () => {
    world.trial = true; show(); await panelBox();
    expect(label()).toBe('Start 7-day free trial · card required'); expect(main().textContent).toBe('Start 7-day free trial · card required');
    cleanup(); world.mode = 'capacity'; await failFirstAttempt();
    expect(label()).toBe(NEW.retryTrial); expect(main().textContent).toBe(NEW.retryTrial);
    cleanup(); world.mode = 'ok'; world.checkout = server({ trialDays: 7 }); show(); await screen.findByRole('checkbox', { name: /I start a 7-day free trial of Starter/ });
    expect(label()).toBe(OLD.resumeTrial); expect(main().textContent).toBe(OLD.resumeTrial);
  });
  it('a request answered with a receipt is recorded as a resume, not a retry', async () => {
    show(); await tick(); fireEvent.click(main()); await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(label()).toBe(OLD.resume));
  });
  it('no label of the confirm button carries an amount or a currency', async () => {
    for (const mode of ['ok', 'capacity'] as Mode[]) { cleanup(); world.mode = mode; if (mode === 'ok') { show(); await panelBox(); } else await failFirstAttempt(); expect(label()).not.toMatch(/\p{Sc}|\d|GBP|USD/u); }
  });
});

describe('a server order without a usable hosted link (creating or uncertain)', () => {
  const RETRY_LABELS = [OLD.resume, OLD.resumeTrial, NEW.retry, NEW.retryTrial];
  const LINK_TEXT = 'Your Starter checkout request is recorded, but its checkout link is not ready. Contact support if it stays unavailable, the billing country is wrong or you need help confirming payment.';
  const LINK_PENDING = { plans: [false, true, true], selects: [true, true], consent: null, main: null, refreshBilling: false, refreshPrice: false };
  const showPending = async (state: string, path = PATH) => { world.checkout = server({ status: state, checkoutUrl: null }); show(path); await screen.findByText(/checkout request is recorded/); };
  const actions = () => world.calls.map(call => call.action).filter(action => action !== 'status');
  it.each(['creating', 'uncertain'])('%s: says the checkout link is not ready, keeps everything locked, offers Refresh billing and no dead resume action', async state => {
    await showPending(state);
    expect(screen.getByText(/checkout request is recorded/).closest('p')!.textContent).toBe(LINK_TEXT);
    expect(document.getElementById('loop-link-not-ready-note')?.textContent).toBe('There is nothing to resume yet. Select Refresh billing to check again for the checkout link.');
    expect(screen.queryByRole('button', { name: /Resume original|Retry your original|Continue to secure|Start 7-day/ })).not.toBeInTheDocument();
    expect(main()).toBeNull(); expect(box()).toBeNull(); expect(document.getElementById('loop-checkout-reason')).toBeNull(); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh billing' })).toBeEnabled();
    expect(screen.getByText(NEW.kept)).toBeInTheDocument(); expect(countryLine()).toBe(`Billing country United Kingdom. ${NEW.country}`);
    expect(screen.getByText(/Original request price:/).textContent).toBe('Original request price: £22 GBP each month, tax included. The original request keeps this price and currency.');
    expectNoHostedWording(); expect(document.body.textContent).not.toMatch(/when you resume it/);
    expect(flags()).toEqual(LINK_PENDING); expect(actions()).toEqual([]); expect(m.open).not.toHaveBeenCalled();
  });
  it('the same state with the trial offer shows no trial resume button either', async () => {
    world.trial = true; world.checkout = server({ status: 'uncertain', checkoutUrl: null, trialDays: 7 }); show(); await screen.findByText(/checkout request is recorded/);
    expect(screen.queryByRole('button', { name: /Resume original|Retry your original|Start 7-day/ })).not.toBeInTheDocument(); expect(main()).toBeNull();
  });
  it('Refresh billing with no link only reads status: no order, no quote, no consent, no navigation, nothing unlocked', async () => {
    await showPending('creating');
    await refreshBilling(); await refreshBilling();
    expect(actions()).toEqual([]); expect(m.open).not.toHaveBeenCalled(); expect(box()).toBeNull(); expect(flags()).toEqual(LINK_PENDING);
    expect(screen.getByText(/checkout request is recorded/)).toBeInTheDocument();
  });
  it.each(['creating', 'uncertain'])('%s, then a read-only refresh supplies the usable original link: a deliberate resume under the existing consent checks, once, for the same order', async state => {
    await showPending(state);
    world.checkout = server({ status: 'ready' }); await refreshBilling();
    const consent = await panelBox();
    expect(consent).not.toBeChecked(); expect(main().textContent).toBe(OLD.resume); expect(main()).toBeDisabled();
    expect(checkoutCalls()).toHaveLength(0); expect(m.open).not.toHaveBeenCalled();
    expect(flags()).toEqual({ plans: [false, true, true], selects: [true, true], consent: { disabled: false, checked: false }, main: true, refreshBilling: false, refreshPrice: false });
    fireEvent.click(main()); expect(checkoutCalls()).toHaveLength(0);
    await tick(); fireEvent.click(main());
    await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()).toHaveLength(1); expect(checkoutCalls()[0]).toMatchObject({ requestId: id(33), plan: 'weekly', quoteId: id(41) });
    expect(world.calls.filter(call => call.action === 'quote')).toHaveLength(0);
  });
  it('an ambiguous local attempt, then a refresh that finds an order with no link: no second request is possible, and the link arriving resumes the same request', async () => {
    world.mode = 'http500'; await failFirstAttempt();
    expect(main().textContent).toBe(NEW.retry);
    const first = checkoutCalls()[0];
    world.checkout = server({ requestId: first.requestId, status: 'uncertain', checkoutUrl: null, pricing: gbp(first.quoteId) });
    await refreshBilling(); await screen.findByText(/checkout request is recorded/);
    expect(main()).toBeNull(); expect(box()).toBeNull(); expect(flags()).toEqual(LINK_PENDING); expect(checkoutCalls()).toHaveLength(1);
    world.mode = 'ok'; world.checkout = server({ requestId: first.requestId, status: 'ready', pricing: gbp(first.quoteId) });
    await refreshBilling(); await tick();
    expect(main().textContent).toBe(OLD.resume);
    fireEvent.click(main()); await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()).toHaveLength(2); expect(checkoutCalls()[1]).toEqual(first);
  });
  it('a local-only ambiguous attempt still retries the same request, and a verified hosted link still resumes', async () => {
    world.mode = 'network'; await failFirstAttempt(); world.mode = 'ok';
    expect(main().textContent).toBe(NEW.retry); await tick(); fireEvent.click(main()); await waitFor(() => expect(m.open).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()[1]).toEqual(checkoutCalls()[0]);
    cleanup(); world.checkout = server(); show(); await panelBox(); expect(main().textContent).toBe(OLD.resume);
  });
  it('Refresh billing has its own fixed recorded label, which is none of the four retry labels', async () => {
    await showPending('uncertain');
    const label = screen.getByRole('button', { name: 'Refresh billing' }).getAttribute('data-analytics-label');
    expect(label).toBe('Refresh billing'); expect(RETRY_LABELS).not.toContain(label);
    cleanup(); world.checkout = null; show(); await panelBox(); expect(screen.getByRole('button', { name: 'Refresh billing' })).toHaveAttribute('data-analytics-label', 'Refresh billing');
  });
});

describe('copy that is unchanged', () => {
  it('a fresh checkout keeps its first-time wording and notes', async () => {
    show(); await panelBox();
    expect(main().textContent).toBe('Continue to secure checkout · £22/month');
    expect(screen.getByText('Choose the country on your billing address before opening checkout.')).toBeInTheDocument();
    expect(screen.queryByText(NEW.note)).not.toBeInTheDocument(); expect(document.getElementById('loop-original-request-note')).toBeNull();
    expect(main()).toHaveAttribute('aria-describedby', 'loop-checkout-reason');
    await tick(); expect(main()).not.toHaveAttribute('aria-describedby');
  });
  it('the trial offer keeps its first-time label', async () => {
    world.trial = true; show(); await panelBox(); expect(main().textContent).toBe('Start 7-day free trial · card required');
  });
});

describe('the wording and visibility flags are never used by a lock, guard or retry', () => {
  const source = readFileSync(resolve(__dirname, '../components/LoopSubscriptionBilling.tsx'), 'utf8');
  const between = (from: string, to: string) => { const start = source.indexOf(from), end = source.indexOf(to, start); expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start); return source.slice(start, end); };
  it('unconfirmedAttempt, noHostedSession and linkPending only choose words and what is shown', () => {
    expect(source.match(/unconfirmedAttempt/g)).toHaveLength(6);
    expect(source.match(/noHostedSession/g)).toHaveLength(3);
    expect(source.match(/linkPending/g)).toHaveLength(5);
    for (const token of ['unconfirmedAttempt', 'noHostedSession', 'linkPending']) {
      for (const expression of source.match(/disabled=\{[^}]*\}/g) ?? []) expect(expression, token).not.toContain(token);
      for (const [from, to] of [['const refresh=useCallback', 'const sub=status?.subscription'], ['const quoteCurrent', 'const purchaseFingerprint'], ['function changeMarket', 'async function cancel'], ['async function resumeCheckout', 'return <section']])
        expect(between(from, to), token).not.toContain(token);
    }
    expect(source).toContain('const linkPending=checkoutPending&&!status.checkout.checkoutUrl;');
    expect(source).toContain('const originalRecovery=checkoutPending||hasLocalAttempt;');
  });
  it('records a receipt for the request only once the server has answered, and only the wording flag reads it', () => {
    expect(source.match(/receiptIntent/g)).toHaveLength(3);
    expect(source).toContain('const receipt=await createLoopSubscriptionCheckout(scope,intent,valid);if(!valid())return;receiptIntent.current=intent;await reportMetaCheckout(');
    expect(source).toContain('const unconfirmedAttempt=hasLocalAttempt&&!checkoutPending&&receiptIntent.current!==checkoutIntent.current;');
  });
});
