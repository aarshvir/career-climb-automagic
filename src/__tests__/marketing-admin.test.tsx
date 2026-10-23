import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketingOverview } from '@/lib/marketing-types';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, call: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('@/lib/marketing-api', async importOriginal => { const original = await importOriginal<typeof import('@/lib/marketing-api')>(); return { ...original, callMarketing: mocks.call }; });
import MarketingAdmin from '@/pages/admin/MarketingAdmin';
import { MarketingApiError } from '@/lib/marketing-api';

function AccountRoute() { const location = useLocation(); return <div>Sign-in route: {location.search}</div>; }
const tree = () => <HelmetProvider><MemoryRouter initialEntries={['/marketing-admin']}><Routes><Route path="/marketing-admin" element={<MarketingAdmin />} /><Route path="/auth" element={<AccountRoute />} /></Routes></MemoryRouter></HelmetProvider>;
const idea = 'aaaaaaaa-0000-4000-8000-000000000001', launch = 'bbbbbbbb-0000-4000-8000-000000000001';
function overview(patch: Partial<MarketingOverview> = {}): MarketingOverview {
  return {
    actor: { id: 'owner-a', role: 'owner' }, generatedAt: '2026-10-26T06:00:00Z',
    meta: { configured: true, adAccountId: '1843729196384751', message: 'Connected.' },
    settings: { version: 2, autoMode: false, maxDailySpendMinor: 150000, maxTotalSpendMinor: 700000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2, lastSyncAt: '2026-10-26T05:00:00Z', lastAutoRunAt: null, updatedAt: '2026-10-24T00:00:00Z' },
    ideas: [{ id: idea, slug: 'version-a', title: 'A: Search. Rewrite. Repeat?', angle: 'Loop demo', status: 'launched', sourcePath: null, createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z' }],
    creatives: [{ id: 'c1', ideaId: idea, label: 'A feed 4x5', kind: 'video', format: '4x5', fileName: 'a.mp4', sha256: null, approved: true, approvedAt: '2026-10-23T00:00:00Z', notes: '' }],
    launches: [{ id: launch, ideaId: idea, name: 'Version A - Search Rewrite Repeat', platform: 'meta', metaCampaignId: '120252906111780325', metaAdsetId: '120252906157150325', metaAdId: '120252906172570325', status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudgetMinor: 50000, currency: 'INR', endAt: '2026-10-30T13:00:00Z', pausedBy: null, pausedReason: null, lastSyncedAt: '2026-10-26T05:00:00Z',
      totals: { impressions: 4200, reach: 3900, linkClicks: 61, landingPageViews: 37, spendMinor: 48753, ctrPct: 1.45, costPerLpvMinor: 1318, frequency: 1.08, days: 1, lastDay: '2026-10-25' }, daily: [{ day: '2026-10-25', impressions: 4200, reach: 3900, clicks: 80, linkClicks: 61, landingPageViews: 37, spendMinor: 48753 }] }],
    requests: [], recommendations: [{ id: `wait:${launch}`, launchId: launch, kind: 'wait', severity: 'info', title: 'Keep Version A running', reason: 'Not enough impressions yet.', autoEligible: false }],
    totals: { spendMinor: 48753, todaySpendMinor: 0, impressions: 4200, landingPageViews: 37, activeLaunches: 1, currency: 'INR' }, audit: [],
    ...patch,
  };
}
beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: 'owner-a' }; mocks.call.mockImplementation(async () => ({ overview: overview() })); });
afterEach(() => cleanup());

describe('marketing admin page', () => {
  it('sends a signed-out visitor to sign-in and back to /marketing-admin', async () => {
    mocks.user = null; render(tree());
    expect(await screen.findByText('Sign-in route: ?next=%2Fmarketing-admin')).toBeInTheDocument();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('opens no marketing data for an account without access', async () => {
    mocks.call.mockRejectedValue(new MarketingApiError('forbidden', 'This account does not have access to the marketing workspace.'));
    render(tree());
    expect(await screen.findByRole('heading', { name: 'Owner access required' })).toBeInTheDocument();
    expect(screen.queryByText('Version A - Search Rewrite Repeat')).not.toBeInTheDocument();
  });

  it('shows live figures and pauses an ad only after confirmation', async () => {
    const user = userEvent.setup(); render(tree());
    const row = (await screen.findByText('Version A - Search Rewrite Repeat')).closest('tr') as HTMLElement;
    expect(within(row).getByText('1.45%')).toBeInTheDocument();
    expect(within(row).getByText('37')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /Pause/ }));
    expect(mocks.call).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole('button', { name: 'Pause in Meta' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'set_status', launchId: launch, status: 'PAUSED' }));
  });

  it('disables ad controls and explains how to connect when Meta is not connected', async () => {
    mocks.call.mockImplementation(async () => ({ overview: overview({ meta: { configured: false, adAccountId: null, message: 'Meta is not connected yet. Add META_ACCESS_TOKEN.' } }) }));
    render(tree());
    expect(await screen.findByText('Meta is not connected yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pause/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Sync from Meta/ })).toBeDisabled();
  });
});
