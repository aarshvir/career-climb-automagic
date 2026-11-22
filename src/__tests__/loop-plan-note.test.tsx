import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
function tree() {
  return <HelmetProvider><MemoryRouter initialEntries={[{ pathname: '/loop', state: { onboardingSaved: true, owner: 'plan-note-owner', generation: 0, authority: trackingDraftAuthority('plan-note-owner') } }]}><JobLoop /></MemoryRouter></HelmetProvider>;
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
  it('appears in the first-run panel a person lands on after saving their setup, without changing the first-run controls', async () => {
    setPilot({ enrolled: false, activeUsers: 7, maxUsers: 10 });
    render(tree());
    expect(await screen.findByRole('button', { name: 'Show the facts from my CV' })).toBeEnabled();
    expect(screen.getAllByTestId('loop-plan-note')).toHaveLength(1);
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });

  it('appears on Today (overview) and in the recurring-search status, so the schedule step is no longer a price-free dead end', async () => {
    setPilot({ enrolled: false, activeUsers: 7, maxUsers: 10 });
    render(tree());
    await screen.findByRole('button', { name: 'Show the facts from my CV' });
    fireEvent.click(screen.getAllByRole('button', { name: /^Today$/ })[0]);
    const notes = await screen.findAllByTestId('loop-plan-note');
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('region', { name: 'Recurring search status' })).toContainElement(notes[notes.length - 1]);
  });

  it('is absent for an account with an active plan', async () => {
    setPilot({ enrolled: true, activeUsers: 7, maxUsers: 10 });
    render(tree());
    await screen.findByRole('button', { name: 'Show the facts from my CV' });
    expect(screen.queryByTestId('loop-plan-note')).toBeNull();
  });

  it('is absent while every free place is taken, where the existing prompt already shows the plan', async () => {
    setPilot({ enrolled: false, activeUsers: 10, maxUsers: 10 });
    render(tree());
    await screen.findByRole('button', { name: 'Show the facts from my CV' });
    expect(screen.queryByTestId('loop-plan-note')).toBeNull();
  });
});
