import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '../pages/JobLoop';
import { LoopPlanNote } from '../pages/JobLoopPanels';
import { blankLoopProfile } from '../lib/job-loop-audiences';
import { clearLoopWorkingDraft } from '../lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, trackingDraftAuthority } from '../lib/tracking-draft-memory';
import type { LoopAction, LoopResponse, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'plan-note-owner' } as { id: string } | null, loading: false, authError: null as string | null },
  call: vi.fn(),
  cvs: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({
  callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs,
  getLoopDownload: vi.fn(), getLoopPreview: vi.fn(),
  isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value,
}));

type Pilot = LoopSnapshot['pilot'];
let current: LoopSnapshot;
function setPilot(pilot: Pilot) { current = { ...current, pilot }; }
function withOneRun() {
  current = { ...current, runs: [{ id: 'plan-note-run', requestId: 'plan-note-request', status: 'completed', phase: 'completed', startedAt: '2026-11-11T00:00:00Z', finishedAt: '2026-11-11T00:01:00Z', inputHash: 'plan-note-hash', provider: 'rules', model: 'grounded-rules-v1', lanes: [{ name: 'Manual opportunities', status: 'completed', count: 0, checkedAt: '2026-11-11T00:01:00Z', message: 'No opportunities were added.' }], opportunityIds: [], packetIds: [], messages: [], nextAction: 'Review source coverage.', reservedUsd: 0, usageUsd: 0 }] };
}
function tree() {
  return <HelmetProvider><MemoryRouter initialEntries={[{ pathname: '/loop', state: { onboardingSaved: true, owner: 'plan-note-owner', generation: 0, authority: trackingDraftAuthority('plan-note-owner') } }]}><JobLoop /></MemoryRouter></HelmetProvider>;
}
const tabButton = (name: string) => screen.getByRole('button', { name });
/** Onboarding hands the person to My CV & experience in an effect after the snapshot loads; wait for that intended state, not just for the first control to appear. */
async function landAfterOnboarding(firstRun: boolean) {
  render(tree());
  if (firstRun) await screen.findByRole('button', { name: 'Show the facts from my CV' });
  else await screen.findByRole('button', { name: 'Today' });
  await waitFor(() => expect(tabButton('My CV & experience')).toHaveAttribute('aria-pressed', 'true'));
}
async function openToday() {
  fireEvent.click(tabButton('Today'));
  await waitFor(() => expect(tabButton('Today')).toHaveAttribute('aria-pressed', 'true'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 'plan-note-owner' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('plan-note-owner');
  current = {
    lifecycleGeneration: 0, recordVersion: 1,
    profile: { ...blankLoopProfile('professional'), name: 'Plan Note Example', sourceText: 'Example College: recorded local plant species in a supervised academic project.', targetTitles: ['Research assistant'], locations: ['Boston'], revision: 1, updatedAt: '2026-11-11T00:00:00Z' },
    claims: [], opportunities: [], packets: [], runs: [], inbox: [], models: [],
    capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3, cvVariants: true, scheduler: true },
    gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false },
  };
  mocks.cvs.mockResolvedValue([]);
  mocks.call.mockImplementation(async (_owner: string, action: LoopAction): Promise<LoopResponse> => {
    if (action.action === 'get') return { snapshot: structuredClone(current) };
    throw new Error('Unexpected plan-note fixture action: ' + action.action);
  });
});
afterEach(cleanup);

describe('LoopPlanNote', () => {
  it('shows the verified free-setup / paid-ongoing line with the starting price and a plans link for an account without a plan', () => {
    render(<MemoryRouter><LoopPlanNote snapshot={{ pilot: { enrolled: false, activeUsers: 7, maxUsers: 10 } }} /></MemoryRouter>);
    const note = screen.getByTestId('loop-plan-note');
    expect(note).toHaveTextContent('A free account lets you set up your roles and schedule. Ongoing automatic runs need a paid plan, from US$29/month.');
    expect(screen.getByRole('link', { name: 'See plans and what is included' })).toHaveAttribute('href', '/pricing');
    expect(note.textContent).not.toMatch(/trial|guarantee|discount|every|each/i);
    // The 16px body size lives on the scoped class (jsdom does not load the stylesheet); other compact upgrade prompts keep their own size.
    expect(note).toHaveClass('jl-plan-note');
  });

  it.each([
    ['an active paid plan', { enrolled: true, activeUsers: 7, maxUsers: 10 } as Pilot],
    ['an unknown plan state', undefined],
    ['every free place taken (the fuller prompt owns that case)', { enrolled: false, activeUsers: 10, maxUsers: 10 } as Pilot],
  ])('renders nothing for %s', (_label, pilot) => {
    const { container } = render(<MemoryRouter><LoopPlanNote snapshot={{ pilot }} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('plan note on the signed-in Automated Job Loop screens', () => {
  it('appears once, inside the first-run panel a person lands on after saving their setup, without changing the first-run controls', async () => {
    setPilot({ enrolled: false, activeUsers: 7, maxUsers: 10 });
    await landAfterOnboarding(true);
    const panel = screen.getByRole('region', { name: 'Your next setup steps' });
    expect(within(panel).getAllByTestId('loop-plan-note')).toHaveLength(1);
    expect(screen.getAllByTestId('loop-plan-note')).toHaveLength(1);
    expect(within(panel).getByRole('button', { name: 'Show the facts from my CV' })).toBeEnabled();
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });

  it('is not repeated on Today while the first-run panel already shows it; the recurring-search status keeps its own', async () => {
    setPilot({ enrolled: false, activeUsers: 7, maxUsers: 10 });
    await landAfterOnboarding(true);
    await openToday();
    const notes = screen.getAllByTestId('loop-plan-note');
    expect(notes).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Your next setup steps' })).getAllByTestId('loop-plan-note')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Recurring search status' })).getAllByTestId('loop-plan-note')).toHaveLength(1);
    expect(document.querySelector('.jl-overview')!.querySelector('[data-testid="loop-plan-note"]')).toBeNull();
  });

  it('appears in the Today overview and in the recurring-search status once a run exists (no first-run panel), so the schedule step is not a price-free dead end', async () => {
    setPilot({ enrolled: false, activeUsers: 7, maxUsers: 10 });
    withOneRun();
    await landAfterOnboarding(false);
    expect(screen.queryByRole('region', { name: 'Your next setup steps' })).toBeNull();
    await openToday();
    expect(screen.getAllByTestId('loop-plan-note')).toHaveLength(2);
    expect(document.querySelector('.jl-overview')!.querySelectorAll('[data-testid="loop-plan-note"]')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Recurring search status' })).getAllByTestId('loop-plan-note')).toHaveLength(1);
  });

  it('is absent for an account with an active plan', async () => {
    setPilot({ enrolled: true, activeUsers: 7, maxUsers: 10 });
    await landAfterOnboarding(true);
    await openToday();
    expect(screen.queryByTestId('loop-plan-note')).toBeNull();
  });

  it('is absent while every free place is taken, where the existing prompt already shows the plan', async () => {
    setPilot({ enrolled: false, activeUsers: 10, maxUsers: 10 });
    await landAfterOnboarding(true);
    await openToday();
    expect(screen.queryByTestId('loop-plan-note')).toBeNull();
  });
});
