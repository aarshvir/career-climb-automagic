import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '@/pages/JobLoop';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import type { LoopAction, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ call: vi.fn(), cvs: vi.fn() }));
const owner = '11111111-1111-4111-8111-111111111111';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, loading: false, authError: null }) }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value }));
let current: LoopSnapshot;
beforeEach(() => {
  vi.clearAllMocks(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner(owner); mocks.cvs.mockResolvedValue([]);
  current = { lifecycleGeneration: 4, recordVersion: 7, profile: { ...blankLoopProfile('professional'), name: 'Alex Example', sourceText: 'Alex Example\nEXPERIENCE\nExample Company\nMaintained operations reports and documented the weekly source checks.', targetTitles: ['Operations analyst'], locations: ['Dubai'], revision: 1, updatedAt: '2026-10-17' }, claims: [], opportunities: [], packets: [], runs: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } };
  mocks.call.mockImplementation(async (_owner: string, action: LoopAction) => {
    if (action.action === 'get') return { snapshot: structuredClone(current) };
    if (action.action === 'read_cv_variants') return { cvVariants: { generation: 4, recordVersion: 7, variants: [] } };
    if (action.action === 'save_cv_variant') return { variantSave: { generation: 4, recordVersion: 8, requestId: action.requestId, requestHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), savedRevision: 1, reused: false, variant: { id: '22222222-2222-4222-8222-222222222222', generation: 4, revision: 1, label: action.label, profile: action.profile, claims: [], sourceHash: 'b'.repeat(64), createdAt: '2026-10-17', updatedAt: '2026-10-17' } } };
    if (action.action === 'save_profile') throw new Error('Refresh the workspace before saving other changes.');
    throw new Error(`Unexpected action ${action.action}`);
  });
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); });

describe('CV variants in the actual Job Loop page', () => {
  it.each([undefined, false])('keeps the variant editor unavailable when the deployed backend capability is %s', async capability => {
    current.capabilities.cvVariants = capability;
    render(<HelmetProvider><MemoryRouter initialEntries={['/loop']}><JobLoop /></MemoryRouter></HelmetProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'My CV & experience' }));
    expect(screen.queryByRole('button', { name: 'Load saved CV variants' })).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.map(([, action]) => action.action)).toEqual(['get']);
  });
  it('uses exact variant actions, preserves the main draft and never adopts a variant receipt as a complete workspace snapshot', async () => {
    current.capabilities.cvVariants = true;
    render(<HelmetProvider><MemoryRouter initialEntries={['/loop']}><JobLoop /></MemoryRouter></HelmetProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'My CV & experience' }));
    fireEvent.change(screen.getByLabelText('My name'), { target: { value: 'Newer local main name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load saved CV variants' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create a CV variant' }));
    fireEvent.change(screen.getByLabelText('CV variant name'), { target: { value: 'Operations' } });
    fireEvent.click(screen.getByLabelText(/Save this exact CV source and selected facts privately/));
    fireEvent.click(screen.getByRole('button', { name: 'Save CV variant' }));
    await screen.findByText(/Your CV variant is saved privately. Refresh your workspace/);
    expect(mocks.call.mock.calls.map(([, action]) => action.action)).toEqual(['get', 'read_cv_variants', 'save_cv_variant']);
    expect(mocks.call.mock.calls[1]).toEqual([owner, { action: 'read_cv_variants', expectedGeneration: 4 }]);
    expect(mocks.call.mock.calls[2]).toEqual([owner, expect.objectContaining({ action: 'save_cv_variant', expectedGeneration: 4, expectedVersion: 7, variantId: null, expectedVariantRevision: 0, requestId: expect.any(String), saveConsent: true, claimRefs: [], profile: expect.objectContaining({ name: 'Alex Example' }) })]);
    expect(screen.getByLabelText('My name')).toHaveValue('Newer local main name');
    expect(current.recordVersion).toBe(7); expect(current.profile!.name).toBe('Alex Example');
    // A separately authorized main-profile attempt must still use its complete,
    // original snapshot version; the isolated variant receipt cannot advance it.
    fireEvent.click(screen.getByLabelText(/Save this reviewed text and profile privately/));
    fireEvent.click(screen.getByRole('button', { name: 'Save career record' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(4));
    expect(mocks.call.mock.calls[3][1]).toMatchObject({ action: 'save_profile', expectedVersion: 7, profile: { name: 'Newer local main name' } });
    await screen.findByText('Refresh the workspace before saving other changes.');
    expect(screen.getByLabelText('My name')).toHaveValue('Newer local main name');
  });
});
