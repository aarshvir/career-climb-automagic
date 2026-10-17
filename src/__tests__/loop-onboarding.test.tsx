import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding, { onboardingStepError } from '@/pages/LoopOnboarding';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration } from '@/lib/tracking-draft-memory';

vi.unmock('react-router-dom');
const state = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, loading: false, authError: null as string | null, call: vi.fn(), extract: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: state.loading, authError: state.authError, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: state.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: state.extract }));
const source = 'Alex Example\nEducation\nStudied biology at Example University. Recorded local plant species for a university fieldwork project.';
const savedProfile = { ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Business analyst'], locations: ['United States'], sourceText: source };
function snapshot(profile: unknown = null, generation = 3, version = 0) { return { lifecycleGeneration: generation, recordVersion: version, profile }; }
function Destination() { const location = useLocation(); return <p data-testid="destination">{location.pathname}{location.search}</p>; }
function open() { return render(<MemoryRouter initialEntries={['/onboarding']}><Routes><Route path="/onboarding" element={<LoopOnboarding />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>); }
async function complete() {
  await screen.findByLabelText('Target roles');
  fireEvent.change(screen.getByLabelText('Target roles'), { target: { value: 'Business analyst' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Cities or countries'), { target: { value: 'United States' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Example' } });
  fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: source } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}
beforeEach(() => {
  vi.clearAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a');
  state.user = { id: 'owner-a' }; state.loading = false; state.authError = null;
  state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'absent' } : action.action === 'get' ? { snapshot: snapshot() } : { snapshot: snapshot({ ...action.profile, revision: 1 }, 3, 1) });
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); });

describe('account-first owned onboarding', () => {
  it('requires an account before reading or entering any private answers', () => {
    state.user = null; open(); expect(screen.getByTestId('destination')).toHaveTextContent('/auth?mode=signup&next=%2Fonboarding'); expect(state.call).not.toHaveBeenCalled();
  });
  it('does not initialize a record on opening, navigating or filling the quiz', async () => {
    await completeWithRender(); expect(state.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing']);
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  });
  it('saves exact preferences into the existing owned record only after explicit consent, without a run or schedule', async () => {
    state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'active', snapshot: snapshot(null, 7, 22) } : { snapshot: snapshot({ ...action.profile, revision: 1 }, 7, 23) });
    await completeWithRender(); fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    expect(state.call).toHaveBeenLastCalledWith('owner-a', { action: 'save_profile', expectedVersion: 22, saveConsent: true, profile: savedProfile }, expect.any(Function));
    expect(state.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing', 'save_profile']);
  });
  it('preserves a configured profile and sends its owner straight back to the dashboard', async () => {
    state.call.mockResolvedValue({ existingState: 'active', snapshot: snapshot({ ...savedProfile, revision: 4 }) }); open();
    await screen.findByRole('heading', { name: 'Your Job Loop is ready to continue.' });
    expect(screen.queryByLabelText('Target roles')).not.toBeInTheDocument(); expect(state.call).toHaveBeenCalledOnce();
  });
  it('does not overwrite a setup created elsewhere between passive read and final consent', async () => {
    state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'absent' } : { snapshot: snapshot({ ...savedProfile, revision: 1 }) });
    await completeWithRender(); fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByText(/A setup was saved in another tab/); expect(state.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing', 'get']);
  });
  it('rejects an owner A to B to A change before an initialization response', async () => {
    let resolve!: (value: unknown) => void;
    state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'absent' } : new Promise(done => { resolve = done; }));
    await completeWithRender(); fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await waitFor(() => expect(state.call).toHaveBeenCalledTimes(2));
    act(() => { setTrackingDraftOwner('owner-b', 'session-b'); setTrackingDraftOwner('owner-a', 'session-a2'); });
    await act(async () => { resolve({ snapshot: snapshot() }); });
    expect(state.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing', 'get']); expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).not.toBeInTheDocument();
  });
  it('ignores a late save receipt after a newer lifecycle is observed', async () => {
    let resolve!: (value: unknown) => void;
    state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'active', snapshot: snapshot() } : new Promise(done => { resolve = done; }));
    await completeWithRender(); fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    act(() => { setTrackingLoopGeneration('owner-a', 4); });
    await act(async () => { resolve({ snapshot: snapshot({ ...savedProfile, revision: 1 }, 3, 1) }); });
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).not.toBeInTheDocument();
  });
  it('revokes storage permission synchronously when unchecked and save is clicked in the same batch', async () => {
    await completeWithRender(); const consent = screen.getByRole('checkbox', { name: /Save this CV text/ }); fireEvent.click(consent);
    const save = screen.getByRole('button', { name: 'Save my setup' });
    act(() => { fireEvent.click(consent); fireEvent.click(save); });
    expect(state.call).toHaveBeenCalledOnce(); expect(save).toBeDisabled();
  });
  it('keeps the original profile version on retry after an ambiguous save', async () => {
    state.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'get_existing') return { existingState: 'active', snapshot: snapshot(null, 3, 7) };
      throw new Error('Connection interrupted. Check your dashboard before trying again.');
    });
    await completeWithRender(); fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByText(/Connection interrupted/); expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await waitFor(() => expect(state.call).toHaveBeenCalledTimes(3)); expect(state.call.mock.calls[2][1].expectedVersion).toBe(7);
  });
  it('does not treat a different returned CV as successful completion', async () => {
    state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { existingState: 'active', snapshot: snapshot() } : { snapshot: snapshot({ ...savedProfile, sourceText: source + ' Unexpected content.', revision: 1 }, 3, 1) });
    await completeWithRender(); fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByText(/returned setup differs/); expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).not.toBeInTheDocument();
  });
  it('requires a real target and supports an education-only CV without inventing employment', () => {
    expect(onboardingStepError(0, blankLoopProfile())).toMatch(/specific role titles/);
    expect(onboardingStepError(4, savedProfile)).toBe('');
    expect(onboardingStepError(2, { ...savedProfile, compensation: { currency: '', period: 'annual', minimum: 50000 } })).toMatch(/currency/);
  });
  it('saves only explicitly reviewed contact details and experience years without deriving them from source dates', async () => {
    await completeWithRender(); fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Contact line for your CV (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Years of relevant experience (optional)')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Contact line for your CV (optional)'), { target: { value: 'alex@example.test' } });
    fireEvent.change(screen.getByLabelText('Years of relevant experience (optional)'), { target: { value: '4.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    expect(state.call.mock.calls.at(-1)![1].profile).toMatchObject({ contactLine: 'alex@example.test', experienceYears: 4.5 });
  });
  it('builds an education-only source from exact answers before separately asking to save it', async () => {
    await completeWithRender(); fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('What name should appear on your CV?'), { target: { value: 'Alex Example' } });
    const education = 'Studied biology at Example University. Recorded plant species for a university fieldwork project.';
    fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: education } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));
    expect(screen.getByLabelText('Your CV text')).toHaveValue(`Alex Example\n\nEducation\n${education}`);
    expect(state.call).toHaveBeenCalledOnce();
  });
});
async function completeWithRender() { open(); await complete(); }
