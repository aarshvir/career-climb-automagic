import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ApplicationsHome from '@/pages/ApplicationsHome';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ checks: vi.fn(), loop: vi.fn(), from: vi.fn(), owner: vi.fn(), entitlement: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a' }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.checks }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.loop }));
vi.mock('@/lib/cv-database', () => ({ mvpSupabase: { auth: { getUser: mocks.owner }, from: mocks.from } }));
vi.mock('@/lib/workspace-api', async original => ({ ...(await original<typeof import('@/lib/workspace-api')>()), getEntitlement: mocks.entitlement }));

function Address() { const location = useLocation(); return <output aria-label="Current address">{location.pathname + location.search}</output>; }
const tree = (url = '/applications') => <HelmetProvider><MemoryRouter initialEntries={[url]}><ApplicationsHome /><Address /></MemoryRouter></HelmetProvider>;
const access = { freeMonthlyLimit: 3, freeUsedThisMonth: 1, freeRemainingThisMonth: 2, passes: [] as unknown[], paidRemaining: 0, dailyLimit: 40, usedToday: 1 };
const entitlement = (tailorAccess: unknown) => ({ creditsRemaining: 0, expiresAt: null, billingConfigured: false, tailorAccess });

beforeEach(() => {
  vi.clearAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
  mocks.owner.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }));
  mocks.checks.mockResolvedValue([]); mocks.loop.mockResolvedValue({ existingState: 'absent' });
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); vi.useRealTimers(); });

describe('Your plan on Applications home', () => {
  it('shows the free allowance with a link to passes', async () => {
    mocks.entitlement.mockResolvedValue(entitlement(access));
    render(tree());
    const line = await screen.findByText(/Free · 2 of 3 tailored CVs left this month/);
    expect(line).toHaveTextContent('Your plan: Free · 2 of 3 tailored CVs left this month · See passes');
    expect(screen.getByRole('link', { name: 'See passes' })).toHaveAttribute('href', '/pricing');
  });
  it('shows the pass that will be used next', async () => {
    mocks.entitlement.mockResolvedValue(entitlement({ ...access, passes: [{ plan: 'search_30d', name: 'Job Search', expiresAt: '2026-11-16T12:00:00Z', quota: 100, used: 18, remaining: 82 }], paidRemaining: 82 }));
    render(tree());
    expect(await screen.findByText(/Job Search pass/)).toHaveTextContent('Your plan: Job Search pass · 82 of 100 tailored CVs left · until 16 Nov');
    expect(screen.queryByRole('link', { name: 'See passes' })).not.toBeInTheDocument();
  });
  it('leaves saved work visible when the plan cannot be read', async () => {
    mocks.entitlement.mockRejectedValue(new Error('unavailable'));
    render(tree());
    await screen.findByText('All saved work loaded');
    expect(screen.queryByText(/Your plan/)).not.toBeInTheDocument();
  });
  it('treats a checkout return as a notice, not a selection, and drops the buyer email from the address', async () => {
    mocks.entitlement.mockResolvedValue(entitlement(access));
    render(tree('/applications?checkout=success&payment_id=pay_Fixture&status=succeeded&email=buyer%40example.invalid'));
    expect(await screen.findByText(/Your pass appears under “Your plan” once Dodo Payments confirms the payment/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Current address' })).toHaveTextContent(/^\/applications$/));
    expect(screen.queryByText('This selection is not valid')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('buyer@example.invalid');
  });
  it('keeps re-reading the plan after the return parameters are removed, until the pass appears', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.entitlement.mockResolvedValue(entitlement(access));
    render(tree('/applications?checkout=success&payment_id=pay_Fixture&status=succeeded'));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Current address' })).toHaveTextContent(/^\/applications$/));
    const before = mocks.entitlement.mock.calls.length;
    mocks.entitlement.mockResolvedValue(entitlement({ ...access, passes: [{ plan: 'sprint_7d', name: 'Sprint', expiresAt: '2026-11-16T12:00:00Z', quota: 25, used: 0, remaining: 25 }], paidRemaining: 25 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.entitlement.mock.calls.length).toBeGreaterThan(before);
    expect(await screen.findByText(/Sprint pass · 25 of 25 tailored CVs left/)).toBeInTheDocument();
  });
});
