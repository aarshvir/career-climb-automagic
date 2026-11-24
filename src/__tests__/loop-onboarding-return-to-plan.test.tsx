import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { retainOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, trackingDraftAuthority } from '@/lib/tracking-draft-memory';

// "Return to the <Plan> plan" on the confirmed-save screen of the onboarding. The plan travels only in the address (validated in
// account-return.ts); the action is a plain link to the validated pricing path. Everything here is fictional and nothing leaves the test.
vi.unmock('react-router-dom');
const state = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, call: vi.fn(), extract: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: state.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: state.extract }));

const PLAN_URL = '/onboarding?loopPlan=active&country=GB&currency=GBP';
const SOURCE = 'Alex Example\nEducation\nStudied biology at Example University. Recorded local plant species for a university fieldwork project.';
const baseProfile = () => ({ ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Business analyst'], locations: ['United States'], sourceText: SOURCE });
// The server-generated revision and timestamp are part of a saved profile; a fixture without them cannot represent a confirmed save.
const withServerFields = (profile: unknown) => profile && { ...(profile as object), revision: 1, updatedAt: '2026-11-24T10:00:00.000Z' };
const snapshot = (profile: unknown = null, version = 0) => ({ lifecycleGeneration: 3, recordVersion: version, profile: withServerFields(profile) });
const actions = () => state.call.mock.calls.map(([, action]) => action.action);
function Destination() { const location = useLocation(); return <p data-testid="destination">{location.pathname}{location.search}</p>; }
function open(path = PLAN_URL) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/onboarding" element={<LoopOnboarding />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>);
}
async function fillAndReachReview() {
  await screen.findByLabelText('Target roles');
  fireEvent.change(screen.getByLabelText('Target roles'), { target: { value: 'Business analyst' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByLabelText('Cities or countries'), { target: { value: 'United States' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Example' } });
  fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('checkbox', { name: /Save this CV text/ });
}
async function saveAndConfirm() {
  await fillAndReachReview();
  fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
  await screen.findByRole('heading', { name: 'Your setup is saved.' });
}
const returnLink = () => screen.queryByRole('link', { name: /Return to the .* plan/ });
beforeEach(() => {
  vi.clearAllMocks(); state.call.mockReset(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); state.user = { id: 'owner-a' };
  state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'absent' } : action.action === 'get' ? { snapshot: snapshot() } : { snapshot: snapshot(action.profile, 1) });
});
afterEach(() => { cleanup(); vi.useRealTimers(); clearTrackingDraftMemory(); });

describe('Return to the plan after a confirmed save', () => {
  it('appears only on the confirmed-save screen, beside the ordinary action, and is a plain link to the validated pricing path', async () => {
    open();
    await fillAndReachReview();
    expect(returnLink()).toBeNull();   // not on any step, not before the save
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
    expect(returnLink()).toBeNull();   // consent alone changes nothing
    fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    const back = screen.getByRole('link', { name: 'Return to the Advanced plan' });
    expect(back).toHaveAttribute('href', '/pricing?loopPlan=active&country=GB&currency=GBP');
    expect(screen.getByRole('link', { name: 'Continue to my Automated Job Loop' })).toHaveAttribute('href', '/loop');   // the ordinary first-search action is kept, and stays primary
    expect(screen.getByRole('link', { name: 'Continue to my Automated Job Loop' })).toHaveClass('jl-button--primary');
    expect(back).not.toHaveClass('jl-button--primary');
    expect(screen.getByText(/You were choosing the Advanced plan\. Returning shows its current price and asks you to confirm again; nothing is bought until you do\./)).toBeInTheDocument();
    // Showing it made no call, and following it makes none: the onboarding's only calls are its own reads and the one save.
    expect(actions()).toEqual(['get_existing', 'get', 'save_profile']);
    fireEvent.click(back);
    expect(screen.getByTestId('destination')).toHaveTextContent('/pricing?loopPlan=active&country=GB&currency=GBP');
    expect(actions()).toEqual(['get_existing', 'get', 'save_profile']);
  });

  it('uses only what validates: advertising tags and other values are ignored and never copied into the link', async () => {
    open('/onboarding?utm_source=meta&fbclid=abc&country=AE&loopPlan=daily&currency=AED&next=https%3A%2F%2Fattacker.example&cv=Alex%20Example');
    await saveAndConfirm();
    expect(screen.getByRole('link', { name: 'Return to the Pro Job Seeker plan' })).toHaveAttribute('href', '/pricing?loopPlan=daily&country=AE&currency=AED');
  });

  it.each([
    ['ordinary onboarding, no plan', '/onboarding'],
    ['advertising tags only', '/onboarding?utm_source=instagram&utm_campaign=c01'],
    ['an unknown plan', '/onboarding?loopPlan=platinum&country=GB&currency=GBP'],
    ['a plan with no market', '/onboarding?loopPlan=active'],
    ['an unlisted country', '/onboarding?loopPlan=active&country=XX&currency=GBP'],
    ['an unlisted currency', '/onboarding?loopPlan=active&country=GB&currency=XYZ'],
    ['"other" with a non-dollar currency', '/onboarding?loopPlan=active&country=other&currency=GBP'],
    ['two plans', '/onboarding?loopPlan=active&loopPlan=daily&country=GB&currency=GBP'],
    ['a one-time pass value', '/onboarding?plan=sprint_7d&country=GB&currency=GBP'],
    ['an address-like plan', '/onboarding?loopPlan=https%3A%2F%2Fattacker.example&country=GB&currency=GBP'],
  ])('offers nothing for %s (the save screen is the ordinary one)', async (_label, path) => {
    open(path);
    await saveAndConfirm();
    expect(returnLink()).toBeNull();
    expect(screen.queryByText(/You were choosing/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Continue to my Automated Job Loop' })).toHaveAttribute('href', '/loop');
  });

  it('offers nothing when the save is refused, and the failure message is the ordinary one', async () => {
    state.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'get_existing') return { existingState: 'absent' };
      if (action.action === 'get') return { snapshot: snapshot() };
      throw new Error('This save was refused. Your answers are still here.');
    });
    open();
    await fillAndReachReview();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This save was refused.');
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).toBeNull();
    expect(returnLink()).toBeNull();
  });

  it('offers nothing when a different setup was saved elsewhere or one already exists', async () => {
    state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'absent' } : { snapshot: snapshot({ ...baseProfile(), targetTitles: ['Someone else'] }, 4) });
    open();
    await fillAndReachReview();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    expect(await screen.findByRole('heading', { name: 'A setup is already saved in your account.' })).toBeInTheDocument();
    expect(returnLink()).toBeNull();
    cleanup(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a');
    state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'active', snapshot: snapshot(baseProfile(), 2) } : { snapshot: snapshot(baseProfile(), 2) });
    open();
    expect(await screen.findByRole('heading', { name: 'Your Automated Job Loop is ready to continue.' })).toBeInTheDocument();
    expect(returnLink()).toBeNull();
  });

  it('is signed out: the plan is not carried through account creation, so nothing is applied afterwards', async () => {
    state.user = null;
    open('/onboarding?loopPlan=active&country=GB&currency=GBP&utm_source=meta');
    const destination = await screen.findByTestId('destination');
    expect(destination).toHaveTextContent('/auth?mode=signup&next=%2Fonboarding&utm_source=meta');
    expect(destination.textContent).not.toMatch(/loopPlan|country|currency/);
    expect(state.call).not.toHaveBeenCalled();
  });

  it('is account-bound in effect: another account in the same tab starts a fresh form, with no saved screen and no link from the previous one', async () => {
    const view = open();
    await saveAndConfirm();
    expect(screen.getByRole('link', { name: 'Return to the Advanced plan' })).toBeInTheDocument();
    state.user = { id: 'owner-b' }; setTrackingDraftOwner('owner-b', 'session-b');
    view.rerender(<MemoryRouter initialEntries={[PLAN_URL]}><Routes><Route path="/onboarding" element={<LoopOnboarding />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Which roles would you like to find?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).toBeNull();
    expect(returnLink()).toBeNull();
    expect(state.call.mock.calls.some(([owner]) => owner === 'owner-b')).toBe(true);
  });
});

describe('Return to the plan when the save was not confirmed at first', () => {
  const SRC = 'Alex Example\nEducation\nRecorded local plant species in a supervised university fieldwork project with documented observations.';
  const seeded = () => ({ ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Research assistant'], locations: ['Boston'], sourceText: SRC });
  const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  async function stalledSave(afterStall: () => Promise<unknown>) {
    let stalled = false;
    retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: null }, { profile: seeded(), answers: blankLoopCvAnswers(), step: 5, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '' });
    state.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'get_existing') return stalled ? afterStall() : { existingState: 'absent' };
      if (action.action === 'get') return { snapshot: snapshot() };
      return new Promise(() => {});   // the write never answers
    });
    open();
    const save = await screen.findByRole('button', { name: 'Save my setup' });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
    fireEvent.click(save);
    await settle();
    await advance(30_001);
    stalled = true;
    expect(screen.getByRole('alert')).toHaveTextContent('We could not confirm that your setup was saved.');
    expect(returnLink()).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).toBeNull();
  }

  it('shows no link while the save is unconfirmed, and still none when a check says nothing was saved', async () => {
    await stalledSave(async () => ({ existingState: 'absent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check whether my setup was saved' }));
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved.');
    expect(returnLink()).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).toBeNull();
  });

  it('shows the link only after a read of the saved setup confirms exactly the submitted answers', async () => {
    await stalledSave(async () => ({ existingState: 'active', snapshot: snapshot(seeded(), 1) }));
    fireEvent.click(screen.getByRole('button', { name: 'Check whether my setup was saved' }));
    await settle();
    expect(screen.getByRole('heading', { name: 'Your setup is saved.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to the Advanced plan' })).toHaveAttribute('href', '/pricing?loopPlan=active&country=GB&currency=GBP');
  });
});
