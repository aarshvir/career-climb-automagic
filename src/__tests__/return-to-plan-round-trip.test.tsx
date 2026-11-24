import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The whole path in one tree, with the real pricing billing panel and the real onboarding: pricing (plan chosen) -> "Continue my setup" -> onboarding
// -> confirmed save -> "Return to the Advanced plan" -> pricing with the plan selected and a FRESH quote, consent unticked, no checkout.
// Services are fixtures: the billing status reports generation null until the save, then a lifecycle.
vi.unmock('react-router-dom');
const m = vi.hoisted(() => ({
  user: { id: 'owner' } as { id: string }, generation: null as number | null,
  read: vi.fn(), quote: vi.fn(), checkout: vi.fn(), open: vi.fn(), report: vi.fn(), call: vi.fn(),
}));
vi.mock('@/lib/meta-commerce', () => ({ reportMetaCheckout: m.report }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: m.user, session: { user: m.user }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: m.call, requireLoopOwner: vi.fn(), boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));
vi.mock('@/lib/loop-subscription-billing', async original => ({ ...await original<typeof import('@/lib/loop-subscription-billing')>(), readLoopBilling: m.read, requestLoopPriceQuote: m.quote, createLoopSubscriptionCheckout: m.checkout }));
vi.mock('@/lib/payment-checkout', () => ({ openPaymentCheckout: m.open }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: vi.fn() }));
import LoopSubscriptionBilling from '@/components/LoopSubscriptionBilling';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { LOOP_LOCAL_CURRENCIES, LOOP_LOCAL_PRICE_CATALOG_VERSION } from '@/lib/loop-local-prices';

const SOURCE = 'Alex Example\nEducation\nStudied biology at Example University. Recorded local plant species for a university fieldwork project.';
const status = () => ({ billingConfigured: true, fulfillmentPending: false, billingMode: 'live', generation: m.generation, plans: [{ id: 'weekly', amount: 2900, currency: 'USD', interval: 'month', runsPerWeek: 1 }, { id: 'active', amount: 5900, currency: 'USD', interval: 'month', runsPerWeek: 3 }, { id: 'daily', amount: 9900, currency: 'USD', interval: 'month', runsPerWeek: 7 }], entitlement: null, subscription: null, checkout: null, cancelRequest: null });
type Intent = { plan: 'weekly' | 'active' | 'daily'; currency: keyof typeof LOOP_LOCAL_CURRENCIES; country: string; requestId: string; expectedGeneration: number };
const quoted = (intent: Intent) => ({ quoteId: crypto.randomUUID(), country: intent.country, currency: intent.currency, amountMinor: LOOP_LOCAL_CURRENCIES[intent.currency].amounts[intent.plan], exponent: LOOP_LOCAL_CURRENCIES[intent.currency].exponent, catalogVersion: LOOP_LOCAL_PRICE_CATALOG_VERSION, taxInclusive: true, interval: 'month', requestId: intent.requestId, generation: intent.expectedGeneration, plan: intent.plan, expiresAt: new Date(Date.now() + 900000).toISOString() });
const scrolls: Element[] = [];
function app(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/pricing" element={<LoopSubscriptionBilling />} /><Route path="/onboarding" element={<LoopOnboarding />} /></Routes></MemoryRouter>);
}
async function completeSetup() {
  await screen.findByLabelText('Target roles');
  fireEvent.change(screen.getByLabelText('Target roles'), { target: { value: 'Business analyst' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByLabelText('Cities or countries'), { target: { value: 'United Kingdom' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Example' } });
  fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Save this CV text/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
  await screen.findByRole('heading', { name: 'Your setup is saved.' });
}
beforeEach(() => {
  scrolls.length = 0;
  Element.prototype.scrollIntoView = function (this: Element) { scrolls.push(this); };
  vi.clearAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner', 'session'); m.user = { id: 'owner' }; m.generation = null;
  m.read.mockImplementation(async () => status());
  m.quote.mockImplementation(async (_scope, intent) => quoted(intent));
  m.report.mockResolvedValue(undefined);
  m.call.mockImplementation(async (_owner, action) => {
    if (action.action === 'get_existing') return { existingState: 'absent' };
    if (action.action === 'get') return { snapshot: { lifecycleGeneration: 3, recordVersion: 0, profile: null } };
    m.generation = 3;   // from now on the billing status reports a lifecycle
    return { snapshot: { lifecycleGeneration: 3, recordVersion: 1, profile: { ...action.profile, revision: 1, updatedAt: '2026-11-24T10:00:00.000Z' } } };
  });
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; });

describe('pricing -> setup -> save -> back to the chosen plan', () => {
  it('carries the plan out and back, asks for a fresh quote, and creates nothing', async () => {
    app('/pricing?loopPlan=active&country=GB&currency=GBP');
    // 1. Incomplete setup: the required action carries the chosen plan and market, nothing else; no quote or checkout exists yet.
    const setup = await screen.findByRole('link', { name: 'Continue my setup' });
    expect(setup).toHaveAttribute('href', '/onboarding?loopPlan=active&country=GB&currency=GBP');
    expect(m.quote).not.toHaveBeenCalled();
    // 2. Setup, then the confirmed save shows the optional return beside the ordinary action.
    fireEvent.click(setup);
    await completeSetup();
    expect(m.call.mock.calls.map(([, action]) => action.action)).toEqual(['get_existing', 'get', 'save_profile']);
    expect(screen.getByRole('link', { name: 'Continue to my Automated Job Loop' })).toHaveAttribute('href', '/loop');
    expect(m.quote).not.toHaveBeenCalled(); expect(m.checkout).not.toHaveBeenCalled();
    // 3. Return: the pricing panel mounts afresh and asks for a NEW quote for the same plan and market.
    fireEvent.click(screen.getByRole('link', { name: 'Return to the Advanced plan' }));
    const heading = await screen.findByRole('heading', { name: 'Advanced · £44 GBP / month' });
    expect(m.quote).toHaveBeenCalledTimes(1);
    expect(m.quote.mock.calls[0][1]).toMatchObject({ action: 'quote', plan: 'active', country: 'GB', currency: 'GBP', expectedGeneration: 3 });
    // The confirmation is brought into view (the existing one-time reveal), with the explicit consent still to give.
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scrolls.length).toBeGreaterThan(0);
    const consent = screen.getByRole('checkbox', { name: /I choose Advanced at £44 GBP each month/ });
    expect(consent).not.toBeChecked();
    const continueButton = screen.getByRole('button', { name: /Continue to secure checkout/ });
    expect(continueButton).toBeDisabled();
    expect(continueButton).toHaveAccessibleDescription('Tick the box above to continue.');
    // Nothing was ordered or resumed, and ticking is still what enables it.
    expect(m.checkout).not.toHaveBeenCalled(); expect(m.open).not.toHaveBeenCalled(); expect(m.report).not.toHaveBeenCalled();
    fireEvent.click(consent);
    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(m.checkout).not.toHaveBeenCalled();
  });

  it('does not carry anything for a person who had not chosen a plan: the setup link and the save screen are the ordinary ones', async () => {
    app('/pricing');
    const setup = await screen.findByRole('link', { name: 'Continue my setup' });
    expect(setup).toHaveAttribute('href', '/onboarding');
    fireEvent.click(setup);
    await completeSetup();
    expect(screen.queryByRole('link', { name: /Return to the .* plan/ })).toBeNull();
  });

  it('follows the billing country the person picked on pricing', async () => {
    app('/pricing?loopPlan=daily&country=AE&currency=AED');
    expect(await screen.findByRole('link', { name: 'Continue my setup' })).toHaveAttribute('href', '/onboarding?loopPlan=daily&country=AE&currency=AED');
    fireEvent.change(screen.getByRole('combobox', { name: 'Billing country or region' }), { target: { value: 'GB' } });
    await waitFor(() => expect(screen.getByRole('link', { name: 'Continue my setup' })).toHaveAttribute('href', '/onboarding?loopPlan=daily&country=GB&currency=GBP'));
  });

  it('does not offer a plan in the setup link while checkout is unavailable', async () => {
    m.read.mockImplementation(async () => ({ ...status(), billingConfigured: false }));
    app('/pricing?loopPlan=active&country=GB&currency=GBP');
    expect(await screen.findByRole('link', { name: 'Continue my setup' })).toHaveAttribute('href', '/onboarding');
  });
});
