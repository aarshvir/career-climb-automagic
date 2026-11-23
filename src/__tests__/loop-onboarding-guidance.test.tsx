import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { retainOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, trackingDraftAuthority } from '@/lib/tracking-draft-memory';

/**
 * Change B of the onboarding-friction branch (copy and guidance only):
 *  - the header promises only what the six steps do (roles, places and a CV; pay and privacy optional) and no longer promises a schedule step that does not exist;
 *  - a Save that is unavailable only because the box is not ticked says so, beside the button;
 *  - the "Check my saved dashboard" link is for load and save problems, not for a step that needs an answer (a link out of setup at that moment invites leaving).
 * The consent logic itself is untouched. All data is fictional and nothing leaves the test.
 */
vi.unmock('react-router-dom');
const mock = vi.hoisted(() => ({ call: vi.fn(), extract: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a' }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: mock.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: mock.extract }));

const SOURCE = 'Alex Example\nEducation\nRecorded local plant species in a supervised university fieldwork project with documented observations.';
const baseProfile = () => ({ ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Research assistant'], locations: ['Boston'], sourceText: SOURCE });
const seed = (step: number, patch: Record<string, unknown> = {}) => retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: null },
  { profile: { ...baseProfile(), ...patch }, answers: blankLoopCvAnswers(), step, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '' });
const open = () => render(<MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>);
const dashboardLink = () => screen.queryByRole('link', { name: 'Check my saved dashboard' });
const saveButton = () => screen.getByRole('button', { name: 'Save my setup' });
const tick = () => screen.getByRole('checkbox', { name: /Save this CV text/ });
const REASON = 'Tick the box above to save';
const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
const record = (version = 0) => ({ lifecycleGeneration: 0, recordVersion: version, profile: null });

function script(save?: (action: { profile: unknown }) => Promise<unknown>, existing?: () => Promise<unknown>) {
  mock.call.mockImplementation(async (_owner: string, action: { action: string; profile?: unknown }) => {
    if (action.action === 'get_existing') return existing ? existing() : { existingState: 'absent' };
    if (action.action === 'get') return { snapshot: record() };
    if (action.action === 'save_profile') return save ? save(action as { profile: unknown }) : { snapshot: { ...record(1), profile: { ...(action.profile as object), revision: 1, updatedAt: '2026-11-23T00:00:00.000Z' } } };
    throw new Error(`Unexpected action ${action.action}`);
  });
}
beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); mock.call.mockReset(); mock.extract.mockReset(); script();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External transport prohibited'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('the header promises only what the steps do', () => {
  const PROMISE = 'Tell us the roles and places you want, then add your CV. Pay and privacy choices are optional.';
  it('says roles, places and CV with pay and privacy optional, and never mentions a schedule, on every step', async () => {
    open(); await screen.findByLabelText('Search or add a role');
    const header = () => document.querySelector('header') as HTMLElement;
    const seen: string[] = [];
    for (let step = 1; step <= 6; step += 1) {
      expect(within(header()).getByText(PROMISE)).toBeInTheDocument();
      expect(header()).not.toHaveTextContent(/schedule/i);
      expect(header()).toHaveTextContent(`Step ${step} of 6`);
      seen.push(screen.getByRole('heading', { level: 1 }).textContent ?? '');
      if (step === 6) break;
      if (step === 1) fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' }));
      if (step === 2) fireEvent.click(screen.getByRole('button', { name: 'Add Remote' }));
      if (step === 5) { fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Example' } }); fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } }); }
      next();
    }
    expect(seen).toEqual(['Which roles would you like to find?', 'Where would you like to work?', 'What compensation would you consider?', 'What should stay private?', 'Bring your experience', 'Review your Automated Job Loop setup']);
  });
  it('is true: roles, places and a CV are each asked for, and the pay and privacy steps are marked optional and let Next through empty', async () => {
    open(); await screen.findByLabelText('Search or add a role');
    next(); expect(screen.getByRole('alert')).toHaveTextContent('Add between one and ten role titles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' })); next();
    next(); expect(screen.getByRole('alert')).toHaveTextContent('Add between one and ten cities or countries');
    fireEvent.click(screen.getByRole('button', { name: 'Add Remote' })); next();
    expect(screen.getByText(/^Optional\. A listing without pay information/)).toBeInTheDocument();     // pay: optional
    next(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Terms or details to keep out of generated documents \(optional\)/)).toBeInTheDocument();   // privacy: optional
    next(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Example' } });
    next(); expect(screen.getByRole('alert')).toHaveTextContent(/CV/);                                  // the CV: required
  });
});

describe('a disabled Save says why', () => {
  it('shows the reason beside the disabled Save, describes the button with it, and takes it away when the box is ticked (and puts it back when unticked)', async () => {
    seed(5); open(); await screen.findByRole('button', { name: 'Save my setup' });
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(REASON)).toBeVisible();
    expect(saveButton()).toHaveAccessibleDescription(REASON);
    fireEvent.click(tick());
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
    expect(saveButton()).not.toHaveAttribute('aria-describedby');
    fireEvent.click(tick());
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });
  it('is only on the review step, and the reason is a plain line (not an alert or a status that other messages depend on)', async () => {
    seed(4); open(); await screen.findByLabelText('Name on your CV');
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
    next();
    expect(screen.getByText(REASON).closest('[role]')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('consent is unchanged: the disabled button writes nothing, the tick alone enables it, and an edit clears the tick again', async () => {
    seed(5); open(); const save = await screen.findByRole('button', { name: 'Save my setup' });
    fireEvent.click(save);
    expect(mock.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing']);
    fireEvent.click(tick()); expect(tick()).toBeChecked(); expect(saveButton()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });
    next();
    expect(tick()).not.toBeChecked(); expect(saveButton()).toBeDisabled(); expect(screen.getByText(REASON)).toBeInTheDocument();
  });
  it('does not claim the box is the problem while a save is running, after an unconfirmed save, or when a setup was saved elsewhere', async () => {
    // saving: the write never answers
    script(() => new Promise(() => {}));
    seed(5); open(); await screen.findByRole('button', { name: 'Save my setup' });
    fireEvent.click(tick()); fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saving your private setup'));
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
    cleanup(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); mock.call.mockReset();
    // a setup was saved in another tab between the read and the save
    mock.call.mockImplementation(async (_owner: string, action: { action: string }) => action.action === 'get_existing' ? { existingState: 'absent' } : { snapshot: { ...record(2), profile: { ...baseProfile(), revision: 1, updatedAt: '2026-11-23T00:00:00.000Z', name: 'Someone Else' } } });
    seed(5); open(); await screen.findByRole('button', { name: 'Save my setup' });
    fireEvent.click(tick()); fireEvent.click(saveButton());
    await screen.findByRole('region', { name: 'A setup is already saved in your account.' });
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });
  it('does not claim the box is the problem once a save did not get confirmed (the form is locked, with its own explanation)', async () => {
    script(() => new Promise(() => {}));
    seed(5); open(); await screen.findByRole('button', { name: 'Save my setup' });
    vi.useFakeTimers();
    fireEvent.click(tick()); fireEvent.click(saveButton());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
    expect(screen.getByRole('alert')).toHaveTextContent('We could not confirm that your setup was saved');
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });
});

describe('the "Check my saved dashboard" link is for load and save problems', () => {
  it('is not shown beside a step that needs an answer, and the error is still announced and focused', async () => {
    open(); await screen.findByLabelText('Search or add a role');
    next();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Add between one and ten role titles');
    expect(alert).toHaveFocus();
    expect(dashboardLink()).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to your Automated Job Loop/ })).toBeInTheDocument();      // the page header link is unchanged
  });
  it('is not shown beside an answer that is found missing when Save is pressed', async () => {
    seed(5, { name: '' }); open(); await screen.findByRole('button', { name: 'Save my setup' });
    fireEvent.click(tick()); fireEvent.click(saveButton());
    expect(screen.getByRole('alert')).toHaveTextContent('Add the name you want on your CV');
    expect(dashboardLink()).not.toBeInTheDocument();
    expect(mock.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing']);
  });
  it('is not shown beside a CV file that could not be read', async () => {
    seed(4); mock.extract.mockRejectedValue(new Error('Fictional unreadable file. Paste your CV text instead.'));
    open(); await screen.findByLabelText('Upload a CV or LinkedIn PDF');
    fireEvent.change(screen.getByLabelText('Upload a CV or LinkedIn PDF'), { target: { files: [new File(['cv'], 'cv.pdf')] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Fictional unreadable file'));
    expect(dashboardLink()).not.toBeInTheDocument();
  });
  it('is shown, as before, when the saved setup cannot be loaded', async () => {
    mock.call.mockRejectedValue(new Error('Fictional connection refused'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Fictional connection refused');
    expect(dashboardLink()).toHaveAttribute('href', '/loop');
  });
  it('is shown, as before, when a save fails, and when the page says a setup was saved elsewhere', async () => {
    script(async () => { throw new Error('Fictional write failure. Check your dashboard before trying again.'); });
    seed(5); open(); await screen.findByRole('button', { name: 'Save my setup' });
    fireEvent.click(tick()); fireEvent.click(saveButton());
    expect(await screen.findByText(/Fictional write failure/)).toBeInTheDocument();
    expect(dashboardLink()).toHaveAttribute('href', '/loop');
  });
  it('is shown again after a step error was corrected and a later save fails (nothing is remembered from the step error)', async () => {
    seed(5, { name: '' }); open(); await screen.findByRole('button', { name: 'Save my setup' });
    fireEvent.click(tick()); fireEvent.click(saveButton());
    expect(dashboardLink()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Example' } });
    script(async () => { throw new Error('Fictional write failure. Check your dashboard before trying again.'); });
    next(); fireEvent.click(tick()); fireEvent.click(saveButton());
    expect(await screen.findByText(/Fictional write failure/)).toBeInTheDocument();
    expect(dashboardLink()).toBeInTheDocument();
  });
});
