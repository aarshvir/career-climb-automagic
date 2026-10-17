import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '@/pages/JobLoop';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';
import { clearOnboardingDraft, retainOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import type { LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'dashboard-owner' }, loading: false, authError: null as string | null },
  call: vi.fn(), cvs: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value }));

let snapshot: LoopSnapshot;
function openDashboard() {
  return render(<HelmetProvider><MemoryRouter initialEntries={['/loop']}><JobLoop /></MemoryRouter></HelmetProvider>);
}
function leaveSetupDraft(step: number) {
  retainOnboardingDraft({ owner: 'dashboard-owner', authority: trackingDraftAuthority('dashboard-owner'), generation: 0 }, {
    profile: { ...blankLoopProfile('professional'), targetTitles: ['Director of operations'], locations: ['Chicago'] },
    answers: blankLoopCvAnswers(), step, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '',
  });
}

beforeEach(() => {
  vi.clearAllMocks(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); clearOnboardingDraft();
  mocks.auth.user = { id: 'dashboard-owner' }; mocks.auth.loading = false; mocks.auth.authError = null;
  setTrackingDraftOwner('dashboard-owner'); setTrackingLoopGeneration('dashboard-owner', 0);
  snapshot = {
    lifecycleGeneration: 0, recordVersion: 1, profile: null, claims: [], opportunities: [], packets: [], runs: [], inbox: [], models: [],
    capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 },
    gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false },
  };
  mocks.cvs.mockResolvedValue([]);
  mocks.call.mockImplementation(async (_owner, action) => {
    if (action.action !== 'get') throw new Error('Dashboard navigation must not save or prepare');
    return { snapshot: structuredClone(snapshot) };
  });
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); clearOnboardingDraft(); });

describe('Job Loop dashboard setup continuity', () => {
  it('keeps independent CV preparation and saved-check panels distinct when variants are enabled', async () => {
    snapshot.capabilities.cvVariants = true;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      openDashboard();
      await screen.findByRole('link', { name: 'Start your setup' });
      fireEvent.click(screen.getByRole('button', { name: 'Set up directly without questions' }));
      expect(screen.getByLabelText('Reviewed source CV or career record')).toBeVisible();
      expect(errors.mock.calls.filter(args => args.some(value => typeof value === 'string' && value.includes('same key')))).toEqual([]);
    } finally { errors.mockRestore(); }
  });

  it('shows one setup destination instead of competing empty overview, discovery and preparation panels', async () => {
    openDashboard();
    const setup = await screen.findByRole('region', { name: 'Job Loop setup' });
    expect(screen.getAllByRole('region', { name: 'Job Loop setup' })).toHaveLength(1);
    expect(within(setup).getByRole('link', { name: 'Start your setup' })).toHaveAttribute('href', '/onboarding');
    expect(screen.queryByRole('list', { name: 'Job Loop journey' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Know where your shortlist comes from.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Discovery and wider preparation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Run history & source coverage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prepare today’s applications' })).not.toBeInTheDocument();
  });

  it('offers direct setup without making the questions compulsory or submitting data', async () => {
    openDashboard();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up directly without questions' }));
    expect(screen.getByRole('button', { name: 'My CV & experience' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Reviewed source CV or career record')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Set up directly without questions' })).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });

  it.each([[0, 'Roles'], [1, 'Locations'], [4, 'Your CV']] as const)('resumes the actual unfinished step %s instead of restarting the CV journey', async (step, label) => {
    leaveSetupDraft(step); openDashboard();
    const setup = await screen.findByRole('region', { name: 'Job Loop setup' });
    expect(within(setup).getByRole('heading', { name: 'Continue setting up your Job Loop' })).toBeInTheDocument();
    expect(setup).toHaveTextContent(`Step ${step + 1} of 6 · ${label}`);
    expect(setup).toHaveTextContent('Your answers are not saved to your account yet.');
    expect(within(setup).getByRole('link', { name: 'Resume setup' })).toHaveAttribute('href', '/onboarding');
    expect(screen.queryByRole('link', { name: 'Start your setup' })).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });

  it('does not offer a previous lifecycle’s setup draft after records are recreated', async () => {
    leaveSetupDraft(1); snapshot.lifecycleGeneration = 1; openDashboard();
    await screen.findByRole('link', { name: 'Start your setup' });
    expect(screen.queryByRole('link', { name: 'Resume setup' })).not.toBeInTheDocument();
  });

  it('keeps the saved-profile dashboard and its progress instead of showing a setup restart', async () => {
    snapshot.profile = { ...blankLoopProfile('professional'), name: 'Alex Example', sourceText: 'Alex Example coordinated reporting and reviewed operational processes at Example Company.', targetTitles: ['Operations manager'], locations: ['Boston'], revision: 1, updatedAt: '2026-10-17T00:00:00Z' };
    leaveSetupDraft(1); openDashboard();
    expect(await screen.findByRole('heading', { name: 'Pick up where you left off.' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Job Loop journey' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Job Loop setup' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Know where your shortlist comes from.' })).toBeInTheDocument();
  });

  it('identifies the two products and their different jobs without sending a Loop user to documents', async () => {
    openDashboard();
    await waitFor(() => expect(screen.getByRole('region', { name: 'Job Loop setup' })).toBeInTheDocument());
    const products = screen.getByRole('navigation', { name: 'Choose a product' });
    expect(within(products).getAllByRole('link')).toHaveLength(2);
    expect(within(products).getByRole('link', { name: /Job Loop/ })).toHaveAttribute('href', '/loop');
    expect(within(products).getByRole('link', { name: /Job Loop/ })).toHaveAttribute('aria-current', 'page');
    expect(within(products).getByRole('link', { name: /CV Check/ })).toHaveAttribute('href', '/check');
    expect(products).toHaveTextContent('Find jobs and prepare tailored CVs on your schedule.');
    expect(products).toHaveTextContent('Check your CV against a job you already found.');
  });
});
