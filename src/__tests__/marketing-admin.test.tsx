import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketingLaunch, MarketingOverview } from '@/lib/marketing-types';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, token: 'session-a', call: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: mocks.user ? { user: mocks.user, access_token: mocks.token } : null, loading: false }) }));
vi.mock('@/lib/marketing-api', async importOriginal => { const original = await importOriginal<typeof import('@/lib/marketing-api')>(); return { ...original, callMarketing: mocks.call }; });
import MarketingAdmin from '@/pages/admin/MarketingAdmin';
import { MarketingApiError } from '@/lib/marketing-api';

function AccountRoute() { const location = useLocation(); return <div>Sign-in route: {location.search}</div>; }
const tree = () => <HelmetProvider><MemoryRouter initialEntries={['/marketing-admin']}><Routes><Route path="/marketing-admin" element={<MarketingAdmin />} /><Route path="/auth" element={<AccountRoute />} /></Routes></MemoryRouter></HelmetProvider>;
const idea = 'aaaaaaaa-0000-4000-8000-000000000001', launch = 'bbbbbbbb-0000-4000-8000-000000000001', other = 'bbbbbbbb-0000-4000-8000-000000000002';
const liveA: MarketingLaunch = { id: launch, ideaId: idea, name: 'Version A - Search Rewrite Repeat', platform: 'meta', metaCampaignId: '120252906111780325', metaAdsetId: '120252906157150325', metaAdId: '120252906172570325', status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudgetMinor: 50000, currency: 'INR', endAt: '2026-10-30T13:00:00Z', lastSyncedAt: '2026-10-26T05:00:00Z', metrics: 'fresh', metricsIssue: null,
  totals: { impressions: 4200, reach: 3900, linkClicks: 61, landingPageViews: 37, spendMinor: 48753, ctrPct: 1.45, costPerLpvMinor: 1318, frequency: 1.08, days: 1, lastDay: '2026-10-25' }, daily: [{ day: '2026-10-25', impressions: 4200, reach: 3900, clicks: 80, linkClicks: 61, landingPageViews: 37, spendMinor: 48753 }] };
const unknownB: MarketingLaunch = { ...liveA, id: other, name: 'Version B - Job hunt dragging', metaAdId: '120252994824010325', status: 'UNKNOWN', effectiveStatus: null, lastSyncedAt: null, metrics: 'unknown', metricsIssue: 'currency_mismatch', totals: null, daily: [] };
function overview(patch: Partial<MarketingOverview> = {}): MarketingOverview {
  return {
    actor: { id: 'owner-a', role: 'owner' }, generatedAt: '2026-10-26T06:00:00Z',
    meta: { configured: true, adAccountId: '1843729196384751', message: 'Connected read-only.' },
    settings: { version: 2, maxDailySpendMinor: 150000, maxTotalSpendMinor: 700000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2, lastSyncAt: '2026-10-26T05:00:00Z', updatedAt: '2026-10-24T00:00:00Z' },
    ideas: [{ id: idea, slug: 'version-a', title: 'A: Search. Rewrite. Repeat?', angle: 'Loop demo', status: 'launched', sourcePath: null, createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z' }],
    creatives: [{ id: 'c1', ideaId: idea, label: 'A feed 4x5', kind: 'video', format: '4x5', fileName: 'a.mp4', sha256: null, approved: true, approvedAt: '2026-10-23T00:00:00Z', notes: '' }],
    launches: [liveA], requests: [], recommendations: [{ id: `wait:${launch}`, launchId: launch, kind: 'wait', severity: 'info', title: 'Keep Version A running', reason: 'Not enough impressions yet.' }],
    totals: { spendMinor: 48753, todaySpendMinor: 0, impressions: 4200, landingPageViews: 37, activeLaunches: 1, incompleteLaunches: 0, currency: 'INR' }, audit: [],
    ...patch,
  };
}
beforeEach(() => { vi.clearAllMocks(); mocks.token = 'session-a'; mocks.user = { id: 'owner-a' }; mocks.call.mockImplementation(async () => ({ overview: overview() })); });
afterEach(() => cleanup());

describe('marketing admin page', () => {
  it.each(['other-owner', 'new-session'])('hides prior data immediately during %s re-verification', async change => {
    const view = render(tree());
    await screen.findByText('Version A - Search Rewrite Repeat');
    mocks.call.mockImplementation(() => new Promise(() => {}));
    if (change === 'other-owner') mocks.user = { id: 'owner-b' };
    else mocks.token = 'session-b';
    view.rerender(tree());
    expect(screen.queryByText('Version A - Search Rewrite Repeat')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verifying access…' })).toBeInTheDocument();
  });
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

  it('shows live status and every figure, with no control that changes an ad', async () => {
    render(tree());
    const row = (await screen.findByText('Version A - Search Rewrite Repeat')).closest('tr') as HTMLElement;
    for (const text of ['active', '₹487.53', '4,200', '61', '1.45%', '37', '₹13.18', 'Fresh']) expect(within(row).getByText(text)).toBeInTheDocument();
    expect(within(row).getByText(/as of 2026-10-26 05:00 UTC/)).toBeInTheDocument();
    expect(screen.getByText(/Last complete Meta sync 2026-10-26 05:00 UTC/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pause|Resume|Launch on Meta|Run the auto check|Switch on/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Auto mode: not available yet')).toBeInTheDocument();
    expect(screen.getByText('Auto mode, pause and resume are not available yet.')).toBeInTheDocument();
  });

  it('shows unknown figures as unknown and stale ones as stale, never as zero', async () => {
    const staleA = { ...liveA, metrics: 'stale' as const, metricsIssue: 'invalid' as const };
    mocks.call.mockImplementation(async () => ({ overview: overview({ launches: [staleA, unknownB], totals: { spendMinor: 48753, todaySpendMinor: 0, impressions: 4200, landingPageViews: 37, activeLaunches: 1, incompleteLaunches: 2, currency: 'INR' } }) }));
    render(tree());
    const unknownRow = (await screen.findByText('Version B - Job hunt dragging')).closest('tr') as HTMLElement;
    expect(within(unknownRow).getAllByText('Unknown')).toHaveLength(7);
    expect(within(unknownRow).queryByText(/₹0|^0$/)).not.toBeInTheDocument();
    expect(within(unknownRow).getByText(/never read completely · The ad account's currency no longer matches this launch/)).toBeInTheDocument();
    const staleRow = screen.getByText('Version A - Search Rewrite Repeat').closest('tr') as HTMLElement;
    expect(within(staleRow).getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText('At least ₹487.53')).toBeInTheDocument();
    expect(screen.getByText('Figures for 2 ads are unknown or stale.')).toBeInTheDocument();
  });

  it('shows the totals as unknown when no ad has been read completely', async () => {
    mocks.call.mockImplementation(async () => ({ overview: overview({ launches: [unknownB], totals: { spendMinor: 0, todaySpendMinor: 0, impressions: 0, landingPageViews: 0, activeLaunches: 0, incompleteLaunches: 1, currency: 'INR' } }) }));
    render(tree());
    await screen.findByText('Version B - Job hunt dragging');
    const summary = document.getElementById('summary') as HTMLElement;
    expect(within(summary).getAllByText('Unknown')).toHaveLength(3);
    expect(within(summary).queryByText('₹0')).not.toBeInTheDocument();
  });

  it('syncs by reading only', async () => {
    const user = userEvent.setup(); render(tree());
    await screen.findByText('Version A - Search Rewrite Repeat');
    await user.click(screen.getByRole('button', { name: /Sync now/ }));
    await waitFor(() => expect(mocks.call).toHaveBeenLastCalledWith('owner-a', { action: 'sync' }));
    expect(mocks.call.mock.calls.map(([, action]) => action.action)).toEqual(['overview', 'sync']);
  });

  it('saves caps without any auto-mode field', async () => {
    const user = userEvent.setup(); render(tree());
    await screen.findByText('Version A - Search Rewrite Repeat');
    await user.click(screen.getByRole('button', { name: 'Save caps and thresholds' }));
    await waitFor(() => expect(mocks.call).toHaveBeenLastCalledWith('owner-a', { action: 'update_settings', expectedVersion: 2, settings: { maxDailySpendMinor: 150000, maxTotalSpendMinor: 700000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2 } }));
  });

  it('disables sync and explains how to connect when Meta is not connected', async () => {
    mocks.call.mockImplementation(async () => ({ overview: overview({ meta: { configured: false, adAccountId: null, message: 'Meta is not connected yet. Add META_ACCESS_TOKEN.' } }) }));
    render(tree());
    expect(await screen.findByText('Meta is not connected yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sync now/ })).toBeDisabled();
  });
});
