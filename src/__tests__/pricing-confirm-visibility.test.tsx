import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Focus and scroll behaviour of the Pricing confirmation (consent and Continue), the pass cards and their messages.
// The billing, quote and checkout services are the same fixtures the subscription UI suite uses; nothing here changes what they do.
vi.unmock('react-router-dom');
const m = vi.hoisted(() => ({
  auth: { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null } as Record<string, unknown>,
  read: vi.fn(), quote: vi.fn(), checkout: vi.fn(), cancel: vi.fn(), open: vi.fn(), report: vi.fn(), invoke: vi.fn(),
}));
vi.mock('@/lib/meta-commerce', () => ({ reportMetaCheckout: m.report }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => m.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: m.invoke } } }));
vi.mock('@/lib/loop-subscription-billing', async original => ({ ...await original<typeof import('@/lib/loop-subscription-billing')>(), readLoopBilling: m.read, requestLoopPriceQuote: m.quote, createLoopSubscriptionCheckout: m.checkout, cancelLoopSubscription: m.cancel }));
vi.mock('@/lib/payment-checkout', () => ({ openPaymentCheckout: m.open }));
import LoopSubscriptionBilling from '@/components/LoopSubscriptionBilling';
import SubscriptionPricing from '@/pages/SubscriptionPricing';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { LOOP_LOCAL_CURRENCIES, LOOP_LOCAL_PRICE_CATALOG_VERSION } from '@/lib/loop-local-prices';
import { giveConsent } from '@/test-utils/billing-consent';

type Plan = 'weekly' | 'active' | 'daily';
const price = (plan: Plan, currency: keyof typeof LOOP_LOCAL_CURRENCIES, quoteId: string, country: string) => ({ quoteId, country, currency, amountMinor: LOOP_LOCAL_CURRENCIES[currency].amounts[plan], exponent: LOOP_LOCAL_CURRENCIES[currency].exponent, catalogVersion: LOOP_LOCAL_PRICE_CATALOG_VERSION, taxInclusive: true, interval: 'month' });
const quoted = (intent: { plan: Plan; currency: keyof typeof LOOP_LOCAL_CURRENCIES; country: string; requestId: string; expectedGeneration: number }) => ({ ...price(intent.plan, intent.currency, '00000000-0000-4000-8000-000000000041', intent.country), requestId: intent.requestId, generation: intent.expectedGeneration, plan: intent.plan, expiresAt: new Date(Date.now() + 900000).toISOString() });
const status = (extra: Record<string, unknown> = {}) => ({ billingConfigured: true, fulfillmentPending: false, billingMode: 'live', generation: 0, plans: [{ id: 'weekly', amount: 2900, currency: 'USD', interval: 'month', runsPerWeek: 1 }, { id: 'active', amount: 5900, currency: 'USD', interval: 'month', runsPerWeek: 3 }, { id: 'daily', amount: 9900, currency: 'USD', interval: 'month', runsPerWeek: 7 }], entitlement: null, subscription: null, checkout: null, cancelRequest: null, ...extra });
const billing = (path = '/pricing', compact = false) => render(<MemoryRouter initialEntries={[path]}><LoopSubscriptionBilling compact={compact} /></MemoryRouter>);
const PANEL = '[aria-label^="Confirm Automated Job Loop"]';

// jsdom has no layout or scrolling: record every scrollIntoView call with the element and options it received.
const scrolls: { el: Element; options: ScrollIntoViewOptions }[] = [];
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
const panel = () => document.querySelector(PANEL) as HTMLElement;
beforeEach(() => {
  scrolls.length = 0;
  Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) { scrolls.push({ el: this, options: (options ?? {}) as ScrollIntoViewOptions }); };
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner', 'session');
  m.auth = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };
  for (const mock of [m.read, m.quote, m.checkout, m.cancel, m.open, m.report, m.invoke]) mock.mockReset();
  m.read.mockResolvedValue(status());
  m.quote.mockImplementation(async (_scope, intent) => quoted(intent));
  m.report.mockResolvedValue(undefined);
  (document.activeElement as HTMLElement | null)?.blur?.();
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; vi.unstubAllGlobals(); });

describe('Pricing confirmation: scroll and focus (F1)', () => {
  it('does not scroll or move focus on an ordinary visit with no plan in the URL', async () => {
    billing('/pricing');
    await screen.findByRole('button', { name: 'Choose Starter' });
    await waitFor(() => expect(m.read).toHaveBeenCalled());
    await settle();
    expect(panel()).toBeNull();
    expect(scrolls).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });

  it('on choosing a plan, scrolls the confirmation to the top and focuses its heading once the quote arrives', async () => {
    billing('/pricing');
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Advanced' }));
    const heading = await screen.findByRole('heading', { name: /Advanced · / });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].el).toBe(panel());
    expect(scrolls[0].options).toMatchObject({ block: 'start', behavior: 'smooth' });
    expect(panel()).toContainElement(screen.getByRole('checkbox', { name: /I choose Advanced/ }));
    expect(panel()).toContainElement(screen.getByRole('button', { name: /Continue to secure checkout/ }));
  });

  it('does not repeat on a quote refresh or a billing-country change, but does again for a different plan the person picks', async () => {
    billing('/pricing');
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Advanced' }));
    const first = await screen.findByRole('heading', { name: /Advanced · / });
    await waitFor(() => expect(first).toHaveFocus());
    expect(scrolls).toHaveLength(1);
    // Refresh the monthly price: the panel is rebuilt around a new quote, with no new scroll and no focus pulled back.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh monthly price' }));
    const second = await screen.findByRole('heading', { name: /Advanced · / });
    await settle();
    expect(m.quote).toHaveBeenCalledTimes(2);
    expect(scrolls).toHaveLength(1);
    expect(second).not.toHaveFocus();
    // Change the billing country: a new quote, again nothing.
    fireEvent.change(screen.getByRole('combobox', { name: 'Billing country or region' }), { target: { value: 'AE' } });
    await screen.findByRole('heading', { name: /Advanced · .*AED/ });
    await settle();
    expect(m.quote).toHaveBeenCalledTimes(3);
    expect(scrolls).toHaveLength(1);
    // A new tap on another plan is a new user action: it reveals again.
    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro Job Seeker' }));
    const third = await screen.findByRole('heading', { name: /Pro Job Seeker · / });
    await waitFor(() => expect(third).toHaveFocus());
    expect(scrolls).toHaveLength(2);
  });

  it('on a valid loopPlan return URL, reveals the confirmation once and not again after a refresh', async () => {
    billing('/pricing?loopPlan=weekly&country=US&currency=USD');
    const heading = await screen.findByRole('heading', { name: /Starter · / });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].el).toBe(panel());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh monthly price' }));
    await screen.findByRole('heading', { name: /Starter · / });
    await settle();
    expect(scrolls).toHaveLength(1);
  });

  it('also works when the account is still loading on return, and ignores an invalid plan in the URL', async () => {
    m.auth = { user: null, session: null, loading: true, authError: null };
    const view = billing('/pricing?loopPlan=active&country=US&currency=USD');
    await settle();
    expect(scrolls).toEqual([]);
    m.auth = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };
    view.rerender(<MemoryRouter initialEntries={['/pricing?loopPlan=active&country=US&currency=USD']}><LoopSubscriptionBilling /></MemoryRouter>);
    const heading = await screen.findByRole('heading', { name: /Advanced · / });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scrolls).toHaveLength(1);
    cleanup(); scrolls.length = 0;
    billing('/pricing?loopPlan=platinum&country=US&currency=USD');
    await screen.findByRole('button', { name: 'Choose Starter' });
    await settle();
    expect(panel()).toBeNull();
    expect(scrolls).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });

  it('never reveals for a signed-out visitor, even with a valid plan in the URL, nor if they sign in later without choosing', async () => {
    m.auth = { user: null, session: null, loading: false, authError: null };
    const view = billing('/pricing?loopPlan=weekly&country=US&currency=USD');
    await screen.findByRole('link', { name: 'Choose Starter' });
    await settle();
    expect(scrolls).toEqual([]);
    m.auth = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };
    view.rerender(<MemoryRouter initialEntries={['/pricing?loopPlan=weekly&country=US&currency=USD']}><LoopSubscriptionBilling /></MemoryRouter>);
    await screen.findByRole('heading', { name: /Starter · / });
    await settle();
    expect(scrolls).toEqual([]);
  });

  it('does nothing in the compact panel inside the Job Loop page', async () => {
    billing('/loop?loopPlan=weekly&country=US&currency=USD', true);
    await screen.findByRole('heading', { name: /Starter · / });
    await settle();
    expect(scrolls).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });

  it('uses an instant scroll when the visitor prefers reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
    billing('/pricing?loopPlan=weekly&country=US&currency=USD');
    await screen.findByRole('heading', { name: /Starter · / });
    await waitFor(() => expect(scrolls).toHaveLength(1));
    expect(scrolls[0].options.behavior).toBe('auto');
  });

  it('keeps consent and checkout behaviour: nothing is requested by the reveal, and Continue still needs the tick', async () => {
    billing('/pricing?loopPlan=weekly&country=US&currency=USD');
    await screen.findByRole('heading', { name: /Starter · / });
    expect(m.checkout).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /I choose Starter/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Continue to secure checkout/ })).toBeDisabled();
  });
});

describe('Continue button: a visible reason while it is disabled, and readable consent copy (F6)', () => {
  it('says why Continue is disabled, ties it to the button, and removes it once the box is ticked', async () => {
    billing('/pricing?loopPlan=weekly&country=US&currency=USD');
    const button = await screen.findByRole('button', { name: /Continue to secure checkout/ });
    const reason = screen.getByText('Tick the box above to continue.');
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Tick the box above to continue.');
    expect(reason).toBeVisible();
    // The reason sits in the same panel, after the consent box and the button.
    expect(panel()).toContainElement(reason);
    expect(screen.getByRole('checkbox', { name: /I choose Starter/ }).compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await giveConsent(screen.getByRole('checkbox', { name: /I choose Starter/ }));
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByText('Tick the box above to continue.')).not.toBeInTheDocument();
    expect(button).not.toHaveAttribute('aria-describedby');
    fireEvent.click(screen.getByRole('checkbox', { name: /I choose Starter/ }));
    expect(screen.getByText('Tick the box above to continue.')).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('shows the same reason on the free-trial confirmation', async () => {
    m.read.mockResolvedValue(status({ trial: { available: true, eligible: true, days: 7 } }));
    billing('/pricing?loopPlan=weekly&country=US&currency=USD');
    const button = await screen.findByRole('button', { name: /Start 7-day free trial/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Tick the box above to continue.');
  });

  it('sets the consent wording at 16px or larger in the billing stylesheet', () => {
    const css = readFileSync('src/components/LoopSubscriptionBilling.css', 'utf8');
    const rule = /\.loop-subscription-billing label\.jl-consent\s*\{[^}]*font-size:\s*(\d+(?:\.\d+)?)px/.exec(css);
    expect(rule, 'a font-size rule scoped to the billing consent label').not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThanOrEqual(16);
  });
});

describe('One-time passes: picked card and messages (F1 for passes, F2)', () => {
  const failure = (status: number, payload: Record<string, unknown>) => ({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }) }) });
  const passes = (path = '/pricing') => render(<MemoryRouter initialEntries={[path]}><SubscriptionPricing /></MemoryRouter>);
  const passScrolls = () => scrolls.filter(call => call.el.tagName === 'SECTION');

  it('scrolls the picked pass card into view once when ?plan= is present', async () => {
    const view = passes('/pricing?plan=move_90d');
    await waitFor(() => expect(passScrolls()).toHaveLength(1));
    expect(passScrolls()[0].el).toBe(screen.getByRole('region', { name: 'Career Move' }));
    expect(passScrolls()[0].options).toMatchObject({ block: 'start', behavior: 'smooth' });
    view.rerender(<MemoryRouter initialEntries={['/pricing?plan=move_90d']}><SubscriptionPricing /></MemoryRouter>);
    await settle();
    expect(passScrolls()).toHaveLength(1);
  });

  it('does not scroll on an ordinary visit or for an unknown plan', async () => {
    passes('/pricing');
    await settle();
    expect(scrolls.filter(call => call.el.matches('section.pricing-tier'))).toEqual([]);
    cleanup();
    passes('/pricing?plan=lifetime');
    await settle();
    expect(scrolls.filter(call => call.el.matches('section.pricing-tier'))).toEqual([]);
  });

  it('shows a failure inside the tapped card, under its button, as an alert, and nowhere else', async () => {
    m.auth = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };
    m.invoke.mockResolvedValue(failure(500, { error: 'internal' }));
    passes('/pricing');
    fireEvent.click(screen.getByRole('button', { name: 'Buy Sprint' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Checkout could not be opened right now. Nothing was charged.');
    const sprint = screen.getByRole('region', { name: 'Sprint' });
    expect(sprint).toContainElement(alert);
    expect(within(screen.getByRole('region', { name: 'Job Search' })).queryByRole('alert')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Career Move' })).queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy Sprint' }).compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll('.pricing-message')).toHaveLength(1);
    expect(document.querySelector('.pricing-tiers + .pricing-message')).toBeNull();
    // Kept on screen on a phone: nearest-edge scroll to the message itself.
    expect(scrolls.some(call => call.el === alert && call.options.block === 'nearest')).toBe(true);
    // The buttons are usable again and the next tap moves the message to that card.
    m.invoke.mockResolvedValue(failure(500, { error: 'internal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy Career Move' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Career Move' })).getByRole('alert')).toBeInTheDocument());
    expect(within(sprint).queryByRole('alert')).toBeNull();
    expect(document.querySelectorAll('.pricing-message')).toHaveLength(1);
  });

  it('keeps the payments-not-open notice a status (not an error) and places it in the tapped card', async () => {
    m.auth = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };
    m.invoke.mockResolvedValue(failure(503, { error: 'Payments are not enabled yet.', code: 'BILLING_UNAVAILABLE' }));
    passes('/pricing?plan=search_30d');
    fireEvent.click(screen.getByRole('button', { name: 'Buy Job Search' }));
    const notice = await screen.findByText(/Payments open soon/);
    expect(notice).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('region', { name: 'Job Search' })).toContainElement(notice);
    expect(m.open).not.toHaveBeenCalled();
  });
});

describe('Setup required (billing generation null): the same one-time reveal goes to "Continue my setup"', () => {
  const needsSetup = () => m.read.mockResolvedValue(status({ generation: null }));
  const link = () => screen.getByRole('link', { name: 'Continue my setup' });
  const blurActive = () => (document.activeElement as HTMLElement | null)?.blur?.();

  it('on a valid loopPlan return, scrolls to the setup action and focuses its link once, without any quote or checkout call', async () => {
    needsSetup();
    billing('/pricing?loopPlan=active&country=GB&currency=GBP');
    const action = await screen.findByRole('link', { name: 'Continue my setup' });
    await waitFor(() => expect(action).toHaveFocus());
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].el).toBe(action.closest('p'));
    expect(scrolls[0].options).toMatchObject({ block: 'start', behavior: 'smooth' });
    expect(action).toHaveAttribute('href', '/onboarding?loopPlan=active&country=GB&currency=GBP');
    // Payment eligibility and consent are exactly as before: no panel, no consent box, no Continue, nothing requested.
    expect(panel()).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Continue to secure checkout/ })).toBeNull();
    await settle();
    expect(m.quote).not.toHaveBeenCalled();
    expect(m.checkout).not.toHaveBeenCalled();
  });

  it('consumes the reveal: refreshing billing does not move the page or take focus again', async () => {
    needsSetup();
    const route = '/pricing?loopPlan=active&country=GB&currency=GBP';
    const view = billing(route);
    const action = await screen.findByRole('link', { name: 'Continue my setup' });
    await waitFor(() => expect(action).toHaveFocus());
    expect(scrolls).toHaveLength(1);
    blurActive();
    const reads = m.read.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh billing' }));
    await waitFor(() => expect(m.read.mock.calls.length).toBeGreaterThan(reads));
    await settle();
    expect(link()).not.toHaveFocus();
    expect(scrolls).toHaveLength(1);
    // A session refresh hands the page an equal but new user object: still nothing.
    m.auth = { user: { id: 'owner' }, session: { user: { id: 'owner' } }, loading: false, authError: null };
    view.rerender(<MemoryRouter initialEntries={[route]}><LoopSubscriptionBilling /></MemoryRouter>);
    await settle();
    expect(link()).not.toHaveFocus();
    expect(scrolls).toHaveLength(1);
  });

  it('stays still on an ordinary visit, for an invalid plan, and in the compact panel', async () => {
    needsSetup();
    billing('/pricing');
    await screen.findByRole('link', { name: 'Continue my setup' });
    await settle();
    expect(scrolls).toEqual([]);
    expect(document.activeElement).toBe(document.body);
    cleanup();
    billing('/pricing?loopPlan=platinum&country=GB&currency=GBP');
    await screen.findByRole('link', { name: 'Continue my setup' });
    await settle();
    expect(scrolls).toEqual([]);
    expect(document.activeElement).toBe(document.body);
    cleanup();
    billing('/loop?loopPlan=active&country=GB&currency=GBP', true);
    await screen.findByRole('link', { name: 'Continue my setup' });
    await settle();
    expect(scrolls).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });

  it('reveals the setup action when the person taps a plan, and again for each new tap, never otherwise', async () => {
    needsSetup();
    billing('/pricing');
    await screen.findByRole('link', { name: 'Continue my setup' });
    await settle();
    expect(scrolls).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Advanced' }));
    await waitFor(() => expect(link()).toHaveFocus());
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].el).toBe(link().closest('p'));
    blurActive();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Pro Job Seeker' }));
    await waitFor(() => expect(link()).toHaveFocus());
    expect(scrolls).toHaveLength(2);
    expect(m.quote).not.toHaveBeenCalled();
    expect(m.checkout).not.toHaveBeenCalled();
  });

  it('leaves the normal path alone: with generation 0 the target is the confirmation panel and there is no setup link', async () => {
    m.read.mockResolvedValue(status({ generation: 0 }));
    billing('/pricing?loopPlan=active&country=GB&currency=GBP');
    const heading = await screen.findByRole('heading', { name: /Advanced · / });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].el).toBe(panel());
    expect(screen.queryByRole('link', { name: 'Continue my setup' })).toBeNull();
    expect(m.quote).toHaveBeenCalledTimes(1);
  });
});

describe('"Continue my setup" reads as a link in its normal state', () => {
  const css = readFileSync('src/components/LoopSubscriptionBilling.css', 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: match[2] }));
  const rule = rules.find(item => /text-decoration:\s*underline/.test(item.body));

  it('puts a class on that one link and leaves its destination alone', async () => {
    m.read.mockResolvedValue(status({ generation: null }));
    billing('/pricing');
    const setup = await screen.findByRole('link', { name: 'Continue my setup' });
    expect(setup).toHaveClass('loop-setup-link');
    expect(setup).toHaveAttribute('href', '/onboarding');
    expect(document.querySelectorAll('.loop-setup-link')).toHaveLength(1);
    // The other links in the billing section (country, terms, refund policy, contact) do not carry it.
    for (const other of Array.from(document.querySelectorAll('.loop-subscription-billing a')).filter(node => node !== setup)) expect(other).not.toHaveClass('loop-setup-link');
  });

  it('underlines it through a rule scoped to that class, with no global anchor rule and no outline override', () => {
    expect(rule, 'a rule that underlines').toBeDefined();
    expect(rule!.selector).toBe('.loop-subscription-billing .loop-setup-link');
    expect(rule!.body).not.toMatch(/outline|border|display|color|font-weight/);
    for (const item of rules) expect(item.selector, 'no bare anchor selector in this stylesheet').not.toMatch(/(^|,)\s*a(\s*$|[:.#[\s>+~,])/);
  });
});
