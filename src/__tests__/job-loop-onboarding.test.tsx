import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { clearTrackingDraftMemory } from '@/lib/tracking-draft-memory';
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';
import type { LoopClaimInput, LoopProfile, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: { id: 'synthetic-onboarding-owner' } as { id: string } | null, call: vi.fn(), extract: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: async () => [], isLoopHttpsUrl: (value: string) => value.startsWith('https://'), safeLoopGmailUrl: (value: string) => value, getLoopDownload: vi.fn(), getLoopPreview: vi.fn() }));
vi.mock('@/lib/cv-extraction', () => ({ extractCvText: mocks.extract, validateCvText: (value: string) => { if (value.length < 80 || value.length > 60000) throw new Error('Review CV text length.'); return value; } }));
import JobLoop from '@/pages/JobLoop';

// Every fixture below is fictional and remains in mocked local UI tests.
const source = 'Name: Fictional Casey\ncasey@example.test\nAcademic projects\nUniversity operations project\nBuilt a dashboard with synthetic data for a university operations project.\nPrepared a forecast of possible savings; the result was not measured.';
const quote = 'Built a dashboard with synthetic data for a university operations project.';
const forecast = 'Prepared a forecast of possible savings; the result was not measured.';
const suggestion = (sourceQuote: string): LoopClaimInput => ({ sourceKind: 'cv_passage', sourceQuote, phrasing: sourceQuote, context: 'University operations project', kind: 'academic_project', resultStatus: sourceQuote === forecast ? 'projected' : 'not_measured', confirmed: true, shareable: true });
const savedProfile = (): LoopProfile => ({ ...blankLoopProfile('professional'), name: 'Fictional saved name', sourceText: source, targetTitles: ['Operations analyst'], locations: ['Dubai'], revision: 1, updatedAt: '2026-10-13T00:00:00Z' });
const empty = (): LoopSnapshot => ({ recordVersion: 0, profile: null, claims: [], opportunities: [], runs: [], packets: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 1 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } });
let current: LoopSnapshot;
function tree() { return <HelmetProvider><MemoryRouter initialEntries={['/loop?audience=professional']}><JobLoop /></MemoryRouter></HelmetProvider>; }
async function startSource() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Set up directly without questions' }));
  await user.click(screen.getByLabelText('Reviewed source CV or career record')); await user.paste(source);
  await user.click(screen.getByRole('button', { name: 'Continue with this text' }));
  return user;
}
async function replaceSource(user: ReturnType<typeof userEvent.setup>, nextSource: string) {
  const textarea = screen.getByLabelText('Reviewed source CV or career record');
  const details = textarea.closest('details')!;
  if (!details.open) await user.click(details.querySelector('summary')!);
  await user.clear(textarea); await user.paste(nextSource);
  expect(textarea).toHaveValue(nextSource);
}
beforeEach(() => {
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); vi.clearAllMocks(); current = empty(); mocks.user = { id: 'synthetic-onboarding-owner' }; mocks.extract.mockResolvedValue(source);
  mocks.call.mockImplementation(async (_id, action) => {
    if (action.action === 'save_profile') { current = { ...current, recordVersion: current.recordVersion + 1, profile: { ...action.profile, revision: 1, updatedAt: '2026-10-13T00:00:00Z' } }; return { snapshot: current }; }
    if (action.action === 'suggest_claims') return { snapshot: current, suggestions: [suggestion(quote), suggestion(forecast)] };
    if (action.action === 'save_claim') { current = { ...current, recordVersion: current.recordVersion + 1, claims: [...current.claims, { ...action.claim, id: 'synthetic-claim', revision: 1, status: 'active', createdAt: '2026-10-13T00:00:00Z' }] }; return { snapshot: current }; }
    return { snapshot: current };
  });
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); vi.restoreAllMocks(); });

describe('Job Loop source-first onboarding', () => {
  it('offers first value to guests before private saving needs sign-in', () => {
    mocks.user = null; render(tree());
    expect(screen.getByRole('link', { name: 'Try a CV check first' })).toHaveAttribute('href', '/check?audience=professional');
    expect(screen.getByRole('link', { name: 'Set up my Job Loop' })).toHaveAttribute('href', '/auth?next=%2Floop');
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('shows one first action and saves no invented preparation or search result', async () => {
    render(tree());
    expect(await screen.findByRole('button', { name: 'Set up directly without questions' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Prepare today’s applications' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable recurring preparation' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Job Loop setup' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Start your setup' })).toHaveAttribute('href', '/onboarding');
    expect(screen.queryByRole('list', { name: 'Job Loop journey' })).not.toBeInTheDocument();
    expect(screen.queryByText(/No employer API sources are reported as configured/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Choose a product' })).getByRole('link', { name: /CV Check/ })).toHaveAttribute('href', '/check');
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });
  it('copies reviewed header details while leaving role, location and experience choices unset', async () => {
    render(tree()); await startSource();
    expect(screen.getByLabelText('My name')).toHaveValue('Fictional Casey');
    expect(screen.getByLabelText('Contact line for my CV (optional)')).toHaveValue('casey@example.test');
    expect(screen.getByLabelText('Target roles')).toHaveValue('');
    expect(screen.getByLabelText('Locations')).toHaveValue('');
    expect(screen.getByLabelText('Explicit experience years (optional)')).toHaveValue(null);
    expect(screen.getByText('Optional preferences and privacy boundaries').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByLabelText(/Save this reviewed text and profile privately/)).not.toBeChecked();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'save_profile')).toBe(false);
  });
  it('reads a local file without a server write or model processing', async () => {
    render(tree()); const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Set up directly without questions' }));
    await user.upload(screen.getByLabelText('Read a local CV on this device'), new File(['fictional source'], 'fictional-cv.txt', { type: 'text/plain' }));
    await waitFor(() => expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(source));
    expect(screen.getByLabelText('My name')).toHaveValue('Fictional Casey');
    expect(mocks.extract).toHaveBeenCalledOnce();
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });
  it('refreshes copied header details on source replacement while preserving a manually corrected name', async () => {
    render(tree()); const user = await startSource();
    const nextSource = source.replace('Name: Fictional Casey', 'Name: Fictional Alex').replace('casey@example.test', 'alex@example.test');
    await replaceSource(user, nextSource);
    await user.click(screen.getByRole('button', { name: 'Continue with this text' }));
    expect(screen.getByLabelText('My name')).toHaveValue('Fictional Alex');
    expect(screen.getByLabelText('Contact line for my CV (optional)')).toHaveValue('alex@example.test');
    await user.clear(screen.getByLabelText('My name')); await user.type(screen.getByLabelText('My name'), 'Fictional corrected name');
    await replaceSource(user, source);
    await user.click(screen.getByRole('button', { name: 'Continue with this text' }));
    expect(screen.getByLabelText('My name')).toHaveValue('Fictional corrected name');
    expect(screen.getByLabelText('Contact line for my CV (optional)')).toHaveValue('casey@example.test');
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });
  it('keeps a delayed step handoff from redirecting a source paste into the name field', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
    render(tree()); const user = await startSource();
    expect(frames).toHaveLength(1);
    const textarea = screen.getByLabelText('Reviewed source CV or career record');
    await user.click(textarea.closest('details')!.querySelector('summary')!);
    await user.clear(textarea);
    expect(textarea).toHaveFocus();
    act(() => { frames.shift()!(0); });
    expect(textarea).toHaveFocus();
    const nextSource = source.replace('Name: Fictional Casey', 'Name: Fictional Alex').replace('casey@example.test', 'alex@example.test');
    await user.paste(nextSource);
    expect(textarea).toHaveValue(nextSource);
    expect(screen.getByLabelText('My name')).toHaveValue('Fictional Casey');
    await user.click(screen.getByRole('button', { name: 'Continue with this text' }));
    expect(screen.getByLabelText('My name')).toHaveValue('Fictional Alex');
    expect(screen.getByLabelText('Contact line for my CV (optional)')).toHaveValue('alex@example.test');
    act(() => { frames.shift()!(1); });
    expect(screen.getByLabelText('My name')).toHaveFocus();
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });
  it('saves with private consent then presents one literal fact at a time with fresh confirmation', async () => {
    render(tree()); const user = await startSource();
    await user.type(screen.getByLabelText('Target roles'), 'Operations analyst'); await user.type(screen.getByLabelText('Locations'), 'Dubai');
    expect(screen.getByRole('button', { name: 'Save career record' })).toBeDisabled();
    await user.click(screen.getByLabelText(/Save this reviewed text and profile privately/)); await user.click(screen.getByRole('button', { name: 'Save career record' }));
    const passage = await screen.findByText(quote, { selector: 'blockquote' });
    const form = within(passage.closest('form')!);
    expect(screen.getByText(/2 passages left to review/)).toBeInTheDocument();
    expect(screen.queryByText(forecast, { selector: 'blockquote' })).not.toBeInTheDocument();
    expect(form.getByLabelText('Evidence context')).toHaveValue('');
    expect(form.getByLabelText(/I confirm this wording/)).not.toBeChecked();
    expect(form.getByLabelText(/This wording and every included figure/)).not.toBeChecked();
    expect(form.getByLabelText('Source passage or my answer')).toHaveValue(quote);
    expect(form.getByLabelText('Source context label')).toHaveValue('University operations project');
    await user.selectOptions(form.getByLabelText('Evidence context'), 'academic_project');
    await user.click(form.getByLabelText(/I confirm this wording/)); await user.click(form.getByLabelText(/This wording and every included figure/)); await user.click(form.getByRole('button', { name: 'Save claim' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('synthetic-onboarding-owner', { action: 'save_claim', expectedVersion: 1, claim: expect.objectContaining({ sourceKind: 'cv_passage', sourceQuote: quote, phrasing: quote, context: 'University operations project', kind: 'academic_project', confirmed: true, shareable: true }) }));
    expect(await screen.findByText(forecast, { selector: 'blockquote' })).toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([, action]) => /start_run|approve_packet|gmail|schedule/.test(action.action))).toBe(false);
  });
  it('skips a passage without creating a claim and clears obsolete suggestion edits after replacing the source', async () => {
    current.profile = savedProfile(); current.recordVersion = 1; render(tree()); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'My CV & experience' })); await user.click(screen.getByRole('button', { name: 'Suggest literal passages' }));
    const first = await screen.findByText(quote, { selector: 'blockquote' });
    await user.selectOptions(within(first.closest('form')!).getByLabelText('Evidence context'), 'academic_project');
    await user.click(screen.getByRole('button', { name: 'Skip this passage' }));
    expect(await screen.findByText(forecast, { selector: 'blockquote' })).toBeInTheDocument();
    await replaceSource(user, `${source}\nAn additional literal source line.`);
    expect(screen.queryByText(forecast, { selector: 'blockquote' })).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'save_claim')).toBe(false);
  });
  it('preserves a returning record and does not repeat unchanged fact confirmation automatically', async () => {
    current.profile = savedProfile(); current.recordVersion = 1; current.claims = [{ ...suggestion(quote), confirmed: true, shareable: true, id: 'synthetic-saved-fact', status: 'active', revision: 1, createdAt: '2026-10-13T00:00:00Z' }];
    render(tree()); const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Pick up where you left off.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set up my job search/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'My CV & experience' }));
    expect(screen.getByLabelText('My name')).toHaveValue('Fictional saved name');
    expect(screen.getByLabelText('Target roles')).toHaveValue('Operations analyst');
    expect(screen.getByText('Review or replace your source CV').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText(/1 fact ready for reuse/)).toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'suggest_claims')).toBe(false);
  });
});
