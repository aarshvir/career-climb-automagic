import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '../pages/JobLoop';
import { blankLoopProfile } from '../lib/job-loop-audiences';
import { clearLoopWorkingDraft } from '../lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, trackingDraftAuthority } from '../lib/tracking-draft-memory';
import type { LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'owner-a' } as { id: string } | null, loading: false, authError: null as string | null }, call: vi.fn(), cvs: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value }));
let current: LoopSnapshot;
const source = 'Alex Example completed a biology project recording local plant species at Example College.';
function LocationProbe() { return <output data-testid="handoff-state">{JSON.stringify(useLocation().state)}</output>; }
function tree(patch: Record<string, unknown> = {}) { return <HelmetProvider><MemoryRouter initialEntries={[{ pathname: '/loop', state: { onboardingSaved: true, owner: 'owner-a', generation: 0, authority: trackingDraftAuthority('owner-a'), ...patch } }]}><JobLoop /><LocationProbe /></MemoryRouter></HelmetProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.user = { id: 'owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
  current = { lifecycleGeneration: 0, recordVersion: 1, profile: { ...blankLoopProfile('professional'), name: 'Alex Example', sourceText: source, targetTitles: ['Research assistant'], locations: ['Boston'], revision: 1, updatedAt: '2026-10-17T00:00:00Z' }, claims: [], opportunities: [], packets: [], runs: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } };
  mocks.cvs.mockResolvedValue([]);
  mocks.call.mockImplementation(async (_owner, action) => { if (action.action !== 'get') throw new Error('Unexpected setup write'); return { snapshot: structuredClone(current) }; });
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); });
describe('saved quiz continuation in the actual Job Loop', () => {
  it('waits for the owned snapshot, opens the record, consumes the hint and preserves saved source without running', async () => {
    let resolve!: (value: unknown) => void;
    mocks.call.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(tree());
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('handoff-state')).not.toHaveTextContent('null');
    resolve({ snapshot: structuredClone(current) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'My CV & experience' })).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(screen.getByTestId('handoff-state')).toHaveTextContent('null'));
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(source);
    expect(screen.getByRole('region', { name: 'Your next setup steps' })).toHaveTextContent('0 active facts');
    fireEvent.click(screen.getByRole('button', { name: 'Review CV facts' }));
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });
  it.each([{ owner: 'owner-b' }, { generation: 1 }, { authority: -1 }])('ignores a stale handoff %j after reading current records', async patch => {
    render(tree(patch));
    await waitFor(() => expect(screen.getByTestId('handoff-state')).toHaveTextContent('null'));
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'My CV & experience' })).toHaveAttribute('aria-pressed', 'false');
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });
  it('does not treat the navigation hint as a saved profile', async () => {
    current.profile = null; render(tree());
    await screen.findByRole('link', { name: 'Start your setup' });
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'Your next setup steps' })).not.toBeInTheDocument();
  });
});
