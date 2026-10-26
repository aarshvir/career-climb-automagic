import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketingLaunch, MarketingOverview } from '@/lib/marketing-types';
import { adminDashboard } from './fixtures/admin-dashboard';

vi.unmock('react-router-dom');
type Session = { user: { id: string }; access_token: string };
const mocks = vi.hoisted(() => ({
  user: { id: 'owner-a' } as { id: string } | null,
  token: 'session-a', loading: false, call: vi.fn(), marketing: vi.fn(),
  subscribers: new Set<(event: string, session: Session | null) => void>(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: mocks.user, loading: mocks.loading,
  session: mocks.user ? { user: mocks.user, access_token: mocks.token } : null,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
    mocks.subscribers.add(callback);
    return { data: { subscription: { unsubscribe: () => mocks.subscribers.delete(callback) } } };
  },
} } }));
vi.mock('@/lib/admin-api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/admin-api')>();
  return { ...actual, callAdmin: mocks.call };
});
vi.mock('@/lib/marketing-api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/marketing-api')>();
  return { ...actual, callMarketing: mocks.marketing };
});
import AdminHome from '@/pages/admin/home/AdminHome';
import { AdminApiError } from '@/lib/admin-api';
import { MarketingApiError } from '@/lib/marketing-api';

function Where() { const location = useLocation(); return <div>At: {location.pathname}{location.search}</div>; }
function tree(path = '/admin/users') {
  return <HelmetProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin" element={<AdminHome />} /><Route path="/admin/:section" element={<AdminHome />} />
    <Route path="/auth" element={<Where />} />
  </Routes></MemoryRouter></HelmetProvider>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function authEvent(event: string, owner: string | null, token = 'session-a') {
  for (const listener of [...mocks.subscribers]) listener(event, owner ? { user: { id: owner }, access_token: token } : null);
}
const launch: MarketingLaunch = {
  id: 'launch-one', ideaId: 'idea-one', name: 'Reviewed campaign', platform: 'meta',
  metaCampaignId: '120252906111780325', metaAdsetId: '120252906157150325', metaAdId: '120252906172570325',
  status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudgetMinor: 50000, currency: 'INR',
  endAt: '2026-10-30T13:00:00Z', lastSyncedAt: '2026-10-25T16:00:00Z', metrics: 'fresh', metricsIssue: null,
  totals: { impressions: 100, reach: 90, linkClicks: 2, landingPageViews: 1, spendMinor: 15000, ctrPct: 2, costPerLpvMinor: 15000, frequency: 1.11, days: 1, lastDay: '2026-10-25' },
  daily: [{ day: '2026-10-25', impressions: 100, reach: 90, clicks: 3, linkClicks: 2, landingPageViews: 1, spendMinor: 15000 }],
};
function overview(patch: Partial<MarketingOverview> = {}): MarketingOverview {
  return {
    actor: { id: 'owner-a', role: 'owner' }, generatedAt: '2026-10-25T16:00:00Z',
    meta: { configured: true, adAccountId: '1843729196384751', message: 'Connected read-only.' },
    settings: { version: 1, maxDailySpendMinor: 300000, maxTotalSpendMinor: 1300000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2, lastSyncAt: '2026-10-25T16:00:00Z', updatedAt: '2026-10-25T16:00:00Z' },
    ideas: [], creatives: [], launches: [launch], requests: [], recommendations: [],
    totals: { spendMinor: 15000, todaySpendMinor: 15000, impressions: 100, landingPageViews: 1, activeLaunches: 1, incompleteLaunches: 0, currency: 'INR' },
    audit: [], ...patch,
  };
}
const card = (label: string) => screen.getByText(label, { exact: true }).closest('article') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks(); mocks.subscribers.clear(); mocks.user = { id: 'owner-a' }; mocks.token = 'session-a'; mocks.loading = false;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  mocks.call.mockImplementation(async (_owner, action) => action.action === 'dashboard'
    ? { dashboard: adminDashboard(action.days) }
    : action.action === 'guest_support_list' ? { guestSupport: [] } : {});
  mocks.marketing.mockResolvedValue({ overview: overview() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('independent admin authority review', () => {
  it('opens no private request or cached content while authentication is loading', async () => {
    mocks.loading = true; const view = render(tree());
    expect(mocks.call).not.toHaveBeenCalled();
    expect(screen.queryByText('payer@work.org')).not.toBeInTheDocument();
    mocks.loading = false; view.rerender(tree());
    await screen.findByText('payer@work.org');
    mocks.loading = true; view.rerender(tree());
    expect(screen.queryByText('payer@work.org')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin pages' })).not.toBeInTheDocument();
  });

  it.each(['owner-b', 'same-owner-new-session'])('revokes cached data immediately for %s', async change => {
    const view = render(tree()); await screen.findByText('payer@work.org');
    mocks.call.mockImplementation(() => new Promise(() => {}));
    if (change === 'owner-b') mocks.user = { id: 'owner-b' };
    else mocks.token = 'session-a-new';
    view.rerender(tree());
    expect(screen.queryByText('payer@work.org')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin pages' })).not.toBeInTheDocument();
  });

  it('revokes a loaded cache after SDK A→B→A even when React sees only A', async () => {
    render(tree()); await screen.findByText('payer@work.org');
    mocks.call.mockImplementation(() => new Promise(() => {}));
    act(() => { authEvent('SIGNED_IN', 'owner-b', 'session-b'); authEvent('SIGNED_IN', 'owner-a'); });
    expect(screen.queryByText('payer@work.org')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin pages' })).not.toBeInTheDocument();
  });

  it('revokes a loaded cache on a same-owner new SDK session before React context catches up', async () => {
    render(tree()); await screen.findByText('payer@work.org');
    mocks.call.mockImplementation(() => new Promise(() => {}));
    act(() => { authEvent('SIGNED_IN', 'owner-a', 'session-a-new'); });
    expect(screen.queryByText('payer@work.org')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin pages' })).not.toBeInTheDocument();
  });

  it('retains verified data across token refresh inside the same SDK session', async () => {
    const token = (nonce: number) => `e30.${btoa(JSON.stringify({ sub: 'owner-a', session_id: '00000000-0000-4000-8000-000000000001', nonce }))}.synthetic`;
    mocks.token = token(1); const view = render(tree()); await screen.findByText('payer@work.org');
    mocks.token = token(2);
    act(() => { authEvent('TOKEN_REFRESHED', 'owner-a', mocks.token); });
    view.rerender(tree());
    expect(screen.getByText('payer@work.org')).toBeInTheDocument();
    // The Users page also loads names and phone numbers once; neither read repeats on refresh.
    const reads = (name: string) => mocks.call.mock.calls.filter(([, action]) => action.action === name).length;
    expect(reads('dashboard')).toBe(1);
    expect(reads('contacts')).toBe(1);
    expect(mocks.call).toHaveBeenCalledTimes(2);
  });

  it('ignores the original in-flight private result after SDK A→B→A', async () => {
    const pending = deferred<{ dashboard: ReturnType<typeof adminDashboard> }>();
    mocks.call.mockReturnValueOnce(pending.promise).mockImplementation(() => new Promise(() => {}));
    render(tree()); await waitFor(() => expect(mocks.call).toHaveBeenCalled());
    act(() => { authEvent('SIGNED_IN', 'owner-b', 'session-b'); authEvent('SIGNED_IN', 'owner-a'); });
    await act(async () => { pending.resolve({ dashboard: adminDashboard() }); });
    expect(screen.queryByText('payer@work.org')).not.toBeInTheDocument();
  });

  it('clears a formerly successful cache when refresh reports an expired session', async () => {
    render(tree()); await screen.findByText('payer@work.org');
    mocks.call.mockRejectedValue(new AdminApiError('unauthenticated', 'Expired session.'));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/At: \/auth\?next=/)).toBeInTheDocument();
    expect(screen.queryByText('payer@work.org')).not.toBeInTheDocument();
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('redirects inherited object key /admin/%s to overview', async section => {
    render(tree(`/admin/${section}`));
    await screen.findByRole('heading', { name: 'Overview' });
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('independent marketing evidence review', () => {
  it('shows unconfigured unknown ad figures as unknown, not zero', async () => {
    mocks.marketing.mockResolvedValue({ overview: overview({
      meta: { configured: false, adAccountId: null, message: 'The read connection is not configured.' },
      launches: [{ ...launch, status: 'UNKNOWN', effectiveStatus: null, metrics: 'unknown', lastSyncedAt: null, totals: null, daily: [] }],
      totals: { spendMinor: 0, todaySpendMinor: 0, impressions: 0, landingPageViews: 0, activeLaunches: 0, incompleteLaunches: 1, currency: 'INR' },
    }) });
    render(tree('/admin/marketing')); await screen.findByText('Reviewed campaign');
    for (const label of ['Recorded ad spend', 'Impressions', 'Link clicks', 'Landing page views']) {
      expect(within(card(label)).queryByText(/^(?:₹0(?:\.00)?|0)$/)).not.toBeInTheDocument();
      expect(card(label)).toHaveTextContent(/unknown|unavailable|—/i);
    }
  });

  it('preserves genuine measured zero when a complete fresh read reports it', async () => {
    const zeroLaunch = { ...launch, totals: { ...launch.totals!, impressions: 0, reach: 0, linkClicks: 0, landingPageViews: 0, spendMinor: 0, ctrPct: null, costPerLpvMinor: null, frequency: null }, daily: [] };
    mocks.marketing.mockResolvedValue({ overview: overview({ launches: [zeroLaunch], totals: { spendMinor: 0, todaySpendMinor: 0, impressions: 0, landingPageViews: 0, activeLaunches: 1, incompleteLaunches: 0, currency: 'INR' } }) });
    render(tree('/admin/marketing')); await screen.findByText('Reviewed campaign');
    expect(within(card('Recorded ad spend')).getByText(/^₹0(?:\.00)?$/)).toBeInTheDocument();
    expect(within(card('Link clicks')).getByText('0', { exact: true })).toBeInTheDocument();
  });

  it('shows effective campaign-paused state without calling a configured ACTIVE ad running', async () => {
    mocks.marketing.mockResolvedValue({ overview: overview({ launches: [{ ...launch, effectiveStatus: 'CAMPAIGN_PAUSED' }] }) });
    render(tree('/admin/marketing')); await screen.findByText('Reviewed campaign');
    const row = screen.getByText('Reviewed campaign').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent(/campaign[_ ]paused/i);
    expect(screen.queryByText('Ads running', { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByText(/last read|last sync|configured active/i).length).toBeGreaterThan(0);
  });

  it('refreshes the marketing source when the owner uses the dashboard Refresh button', async () => {
    render(tree('/admin/marketing')); await screen.findByText('Reviewed campaign');
    expect(mocks.marketing).toHaveBeenCalledTimes(1);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mocks.marketing).toHaveBeenCalledTimes(2));
  });

  it('revokes the private parent when the separate marketing source reports forbidden access', async () => {
    mocks.marketing.mockRejectedValue(new MarketingApiError('forbidden', 'Marketing membership was revoked.'));
    render(tree('/admin/marketing'));
    await screen.findByRole('heading', { name: 'No admin access' });
    expect(screen.queryByRole('navigation', { name: 'Admin pages' })).not.toBeInTheDocument();
    expect(screen.queryByText('Reviewed campaign')).not.toBeInTheDocument();
  });
});

describe('independent support source and authority review', () => {
  it('keeps failed visitor-list reads distinct from an empty successful inbox', async () => {
    mocks.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'dashboard') return { dashboard: { ...adminDashboard(action.days), support: [] } };
      if (action.action === 'guest_support_list') throw new AdminApiError('unavailable', 'Visitor messages could not be read.');
      return {};
    });
    render(tree('/admin/support'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/visitor|guest|messages/i);
    expect(screen.queryByText('No messages yet.', { exact: true })).not.toBeInTheDocument();
    expect(within(card('From visitors')).queryByText('0', { exact: true })).not.toBeInTheDocument();
  });

  it('refreshes visitor messages as well as account messages', async () => {
    render(tree('/admin/support')); await screen.findByRole('button', { name: 'Open' });
    await waitFor(() => expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'guest_support_list')).toHaveLength(1));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'guest_support_list')).toHaveLength(2));
  });

  it('revokes the private parent view when visitor support reports membership revoked', async () => {
    mocks.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'dashboard') return { dashboard: adminDashboard(action.days) };
      throw new AdminApiError('forbidden', 'Administration membership was revoked.');
    });
    render(tree('/admin/support'));
    await screen.findByRole('heading', { name: 'No admin access' });
    expect(screen.queryByRole('navigation', { name: 'Admin pages' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('clears already opened support text after a known forbidden save response', async () => {
    mocks.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'dashboard') return { dashboard: adminDashboard(action.days) };
      if (action.action === 'guest_support_list') return { guestSupport: [] };
      if (action.action === 'support_detail') return { supportDetail: { id: action.id, message: 'Private receipt that must be revoked.' } };
      throw new AdminApiError('forbidden', 'Administration membership was revoked.');
    });
    render(tree('/admin/support')); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await screen.findByText('Private receipt that must be revoked.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'No admin access' });
    expect(screen.queryByText('Private receipt that must be revoked.')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin pages' })).not.toBeInTheDocument();
  });

  it('discards an outstanding detail read after the parent is refreshed', async () => {
    const pending = deferred<{ supportDetail: { id: string; message: string } }>();
    mocks.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'dashboard') return { dashboard: adminDashboard(action.days) };
      if (action.action === 'guest_support_list') return { guestSupport: [] };
      return pending.promise;
    });
    render(tree('/admin/support')); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await act(async () => { pending.resolve({ supportDetail: { id: '00000000-0000-4000-8000-000000000051', message: 'Obsolete pending support text.' } }); });
    expect(screen.queryByText('Obsolete pending support text.')).not.toBeInTheDocument();
  });

  it('does not apply a late save receipt to the freshly reloaded support view', async () => {
    const pending = deferred<{ support: { id: string; status: string; version: number } }>();
    mocks.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'dashboard') return { dashboard: adminDashboard(action.days) };
      if (action.action === 'guest_support_list') return { guestSupport: [] };
      if (action.action === 'support_detail') return { supportDetail: { id: action.id, message: 'Saved under the earlier view.' } };
      return pending.promise;
    });
    render(tree('/admin/support')); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open' }));
    await screen.findByText('Saved under the earlier view.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'dashboard')).toHaveLength(2));
    await act(async () => { pending.resolve({ support: { id: '00000000-0000-4000-8000-000000000051', status: 'received', version: 1 } }); });
    expect(screen.queryByText(/Saved\. No email was sent/)).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'dashboard')).toHaveLength(2);
  });
});
