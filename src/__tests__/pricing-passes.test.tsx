import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { passPlans } from '@/lib/pass-plans';
import { accountDestination } from '@/lib/account-return';
import { describeTailorPlan } from '@/lib/tailor-access';
import { PASS_PLANS } from '../../supabase/functions/_shared/core';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: null as { id: string } | null, invoke: vi.fn(), open: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/payment-checkout', () => ({ openPaymentCheckout: mocks.open }));
import SubscriptionPricing from '@/pages/SubscriptionPricing';

const session = 'cks_FixtureSession000001';
const checkoutUrl = `https://test.checkout.dodopayments.com/session/${session}`;
const page = (path = '/pricing') => render(<MemoryRouter initialEntries={[path]}><SubscriptionPricing /></MemoryRouter>);
function failure(status: number, payload: Record<string, unknown>) {
  return { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }) }) };
}
beforeEach(() => { mocks.user = null; mocks.invoke.mockReset(); mocks.open.mockReset(); });
afterEach(cleanup);

describe('Pricing page tiers', () => {
  it('renders Free and the three passes with their prices, allowances and labels', () => {
    page();
    const tier = (name: string) => screen.getByRole('region', { name });
    expect(tier('Free')).toHaveTextContent('$0');
    expect(tier('Free')).toHaveTextContent('3 AI-tailored CVs a month when signed in');
    expect(tier('Free')).toHaveTextContent('Compare without AI, as often as you like');
    expect(tier('Sprint')).toHaveTextContent(/\$9One-time · 7 days.*25 AI-tailored CVs/);
    expect(tier('Job Search')).toHaveTextContent(/30-day pass.*\$19One-time · 30 days.*100 AI-tailored CVs/);
    expect(tier('Career Move')).toHaveTextContent(/Best value.*\$39One-time · 90 days.*About \$13 a month.*300 AI-tailored CVs/);
    for (const line of ['One-time payment. No subscription, nothing renews.', '7-day money-back if you’ve used fewer than 5 tailored CVs.', 'Secure checkout by Dodo Payments, our merchant of record.']) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    const teams = screen.getByRole('region', { name: 'Coaches & universities' });
    expect(within(teams).getByRole('link', { name: /Contact us/ })).toHaveAttribute('href', '/contact');
    const faq = screen.getByRole('region', { name: 'Questions about pricing' });
    for (const question of ['What counts as a tailored CV?', 'What stays free?', 'Can I buy another pass while one is active?', 'What if a pass isn’t right for me?', 'Who will my invoice come from?']) {
      expect(within(faq).getByText(question)).toBeInTheDocument();
    }
    expect(within(faq).getByRole('link', { name: 'Read the refund policy' })).toHaveAttribute('href', '/refund');
  });
  it('matches the plans the backend sells and the database seeds', () => {
    for (const plan of passPlans) expect(PASS_PLANS[plan.key]).toMatchObject({ name: plan.name, amount: plan.price * 100, days: plan.days, tailorQuota: plan.tailoredCvs });
    expect(passPlans.map(plan => plan.key).sort()).toEqual(Object.keys(PASS_PLANS).sort());
  });
});

describe('buying a pass', () => {
  it('sends signed-out visitors to sign in and back to the plan they chose', () => {
    page();
    for (const plan of passPlans) {
      const link = screen.getByRole('link', { name: `Sign in to buy ${plan.name}` });
      expect(link).toHaveAttribute('href', `/auth?next=${encodeURIComponent(`/pricing?plan=${plan.key}`)}`);
      expect(accountDestination(new URLSearchParams(link.getAttribute('href')!.split('?')[1]).get('next'))).toBe(`/pricing?plan=${plan.key}`);
    }
    expect(screen.queryByRole('button', { name: /Buy/ })).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('accepts only known plans as a sign-in return', () => {
    expect(accountDestination('/pricing?plan=lifetime')).toBe('/loop');
    expect(accountDestination('/pricing?plan=sprint_7d&next=https://attacker.example')).toBe('/loop');
    expect(accountDestination('/pricing')).toBe('/pricing');
  });
  it('starts a server-fixed checkout with only the plan key when signed in', async () => {
    mocks.user = { id: 'fixture-owner' };
    mocks.invoke.mockResolvedValue({ data: { provider: 'dodo', url: checkoutUrl, sessionId: session, billingMode: 'test' }, error: null });
    page();
    fireEvent.click(screen.getByRole('button', { name: 'Buy Job Search' }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [name, options] = mocks.invoke.mock.calls[0];
    expect(name).toBe('create-checkout');
    expect(options.body).toEqual({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), plan: 'search_30d' });
    expect(mocks.open.mock.calls[0][0]).toEqual({ provider: 'dodo', url: checkoutUrl, sessionId: session, billingMode: 'test' });
  });
  it('says payments open soon when billing is switched off, without an error', async () => {
    mocks.user = { id: 'fixture-owner' };
    mocks.invoke.mockResolvedValue(failure(503, { error: 'Payments are not enabled yet.', code: 'BILLING_UNAVAILABLE' }));
    page();
    fireEvent.click(screen.getByRole('button', { name: 'Buy Sprint' }));
    expect(await screen.findByText(/Payments open soon/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Buy Sprint' })).toBeEnabled();
  });
  it('shows a plain error for other failures and never a provider detail', async () => {
    mocks.user = { id: 'fixture-owner' };
    mocks.invoke.mockResolvedValue(failure(503, { error: 'The configured pass must be a one-time USD $9 product.', code: 'INVALID_PASS_PRICE' }));
    page();
    fireEvent.click(screen.getByRole('button', { name: 'Buy Career Move' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Checkout could not be opened right now. Nothing was charged.');
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('after sign-in shows the plan picked from the link but does not start checkout', () => {
    mocks.user = { id: 'fixture-owner' };
    page('/pricing?plan=move_90d');
    expect(screen.getByRole('status')).toHaveTextContent('You picked the Career Move pass ($39, 90 days). Choose “Buy Career Move” when you are ready to pay.');
    expect(screen.getByRole('region', { name: 'Career Move' })).toHaveClass('pricing-tier--picked');
    expect(mocks.invoke).not.toHaveBeenCalled();
    cleanup();
    page('/pricing?plan=unknown_plan');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('plan summary line', () => {
  const base = { freeMonthlyLimit: 3, freeUsedThisMonth: 1, freeRemainingThisMonth: 2, passes: [], paidRemaining: 0, dailyLimit: 40, usedToday: 1 };
  it('describes the free allowance and the next pass to be used', () => {
    expect(describeTailorPlan(base)).toEqual({ text: 'Free · 2 of 3 tailored CVs left this month', free: true });
    const pass = { plan: 'search_30d', name: 'Job Search', expiresAt: '2026-11-16T12:00:00Z', quota: 100, used: 18, remaining: 82 };
    expect(describeTailorPlan({ ...base, passes: [pass], paidRemaining: 82 })).toEqual({ text: 'Job Search pass · 82 of 100 tailored CVs left · until 16 Nov', free: false });
    const later = { plan: 'sprint_7d', name: 'Sprint', expiresAt: '2026-11-23T12:00:00Z', quota: 25, used: 0, remaining: 25 };
    expect(describeTailorPlan({ ...base, passes: [pass, later], paidRemaining: 107 }).text).toBe('Job Search pass · 82 of 100 tailored CVs left · until 16 Nov · 107 left across 2 passes');
  });
});
