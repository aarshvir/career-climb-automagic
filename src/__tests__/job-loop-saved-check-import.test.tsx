import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '@/pages/JobLoop';
import type { LoopProfile, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
import type { FreeCvCheck } from '@/lib/free-check-api';
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'owner-a' } as { id: string } | null, loading: false, authError: null as string | null }, call: vi.fn(), cvs: vi.fn(), list: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), isLoopHttpsUrl: (value: string) => /^https:\/\/[^@]+$/.test(value), safeLoopGmailUrl: (value: string) => value }));

const id = '11111111-1111-4111-8111-111111111111';
const finalText = 'Alex Reviewed\nalex.reviewed@example.invalid\nEXPERIENCE\nPrepared weekly Excel reports for a local operations team and explained reporting definitions.';
const sourceText = finalText + '\nPRIVATE_DETAIL_REMOVED_FROM_FINAL';
const vacancy = 'Prepare weekly operations reports using Excel. Explain the reporting definitions to colleagues, review data quality and coordinate the weekly checklist.';
const oldSource = 'Existing Candidate\nexisting@example.invalid\nEXPERIENCE\nMaintained the existing reporting checklist and documented the monthly process for colleagues.';
function saved(overrides: Partial<FreeCvCheck> = {}): FreeCvCheck {
  return { id, user_id: 'owner-a', request_id: id, job_title: 'Operations Analyst', company: 'Saved Employer Fixture', job_description: vacancy,
    original_text: sourceText, reviewed_text: finalText, status: 'approved', method_version: 'fixture-method', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z', ...overrides };
}
function snapshot(): LoopSnapshot {
  return { lifecycleGeneration: 0, recordVersion: 1, profile: null, claims: [], opportunities: [], packets: [], runs: [], inbox: [], models: [],
    capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 1 },
    gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } };
}
function existingProfile(): LoopProfile {
  return { audience: 'professional', name: 'Keep My Name', contactLine: 'keep@example.invalid', targetTitles: ['Existing Target'], locations: ['Dubai'], experienceYears: 7,
    languages: ['English'], pageTarget: 2, discreetSearch: true, sourceText: oldSource, excludedTerms: ['confidential-client'], compensation: { currency: 'AED', period: 'monthly', minimum: null }, revision: 1, updatedAt: '2026-10-15T00:00:00Z' };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((pass, fail) => { resolve = pass; reject = fail; });
  return { promise, resolve, reject };
}
let current: LoopSnapshot;
function RouteState() { const location = useLocation(); return <output data-testid="route">{location.pathname}{location.search}</output>; }
function tree(path = `/loop?fromCheck=${id}`) { return <HelmetProvider><MemoryRouter initialEntries={[path]}><JobLoop /><RouteState /></MemoryRouter></HelmetProvider>; }
async function preview() { await screen.findByLabelText('Saved CV check'); await waitFor(() => expect(screen.getByLabelText('Saved CV check')).toHaveValue(id)); }
function noWrites() { expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.list.mockReset(); mocks.call.mockReset(); mocks.auth.user = { id: 'owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
  current = snapshot(); mocks.cvs.mockResolvedValue([]); mocks.list.mockResolvedValue([saved()]);
  mocks.call.mockImplementation(async (_owner, action) => { if (action.action !== 'get') throw new Error('Unexpected write in local import test'); return { snapshot: structuredClone(current) }; });
  window.history.replaceState(null, '', '/loop');
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('saved check continuation inside the real Loop workspace', () => {
  it('preserves the exact opaque intent through the actual signed-out Loop sign-in link without loading records', () => {
    mocks.auth.user = null; setTrackingDraftOwner(null); render(tree());
    expect(screen.getByRole('link', { name: 'Sign in to review this saved check' })).toHaveAttribute('href', `/auth?next=${encodeURIComponent(`/loop?fromCheck=${id}`)}`);
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.call).not.toHaveBeenCalled();
  });

  it('defaults to final text, previews first and copies exact drafts only after the explicit action', async () => {
    render(tree()); await preview();
    expect(screen.getByLabelText('Reviewed final CV (recommended)')).toBeChecked();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue('');
    expect(screen.getByLabelText('Full vacancy description')).toHaveValue('');
    expect(screen.queryByText('PRIVATE_DETAIL_REMOVED_FROM_FINAL')).not.toBeInTheDocument();
    expect(screen.getByTestId('route')).toHaveTextContent(/^\/loop$/);
    noWrites(); fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(finalText);
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('Operations Analyst');
    expect(screen.getByLabelText('Company')).toHaveValue('Saved Employer Fixture');
    expect(screen.getByLabelText('Full vacancy description')).toHaveValue(vacancy);
    expect(screen.getByLabelText('Target roles')).toHaveValue('Operations Analyst');
    expect(screen.getByLabelText(/Save this reviewed text and profile privately/)).not.toBeChecked();
    expect(screen.queryByText('PRIVATE_DETAIL_REMOVED_FROM_FINAL')).not.toBeInTheDocument(); noWrites();
  });

  it('copies original source only after the separate warning and explicit source confirmation', async () => {
    render(tree()); await preview(); fireEvent.click(screen.getByLabelText('Original source CV instead'));
    expect(screen.getByText(/original source may contain details you removed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use this saved check' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I reviewed the original source and want to copy it/));
    fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(sourceText); noWrites();
  });

  it('keeps an exact linked older check available beyond the recent fifty without substituting another record', async () => {
    const recent = Array.from({ length: 51 }, (_, index) => saved({ id: `${(index + 2).toString(16).padStart(8, '0')}-2222-4222-8222-222222222222`, job_title: `Recent role ${index}` }));
    mocks.list.mockResolvedValue([...recent, saved()]); render(tree()); await preview();
    expect(screen.getByRole('option', { name: 'Operations Analyst · Saved Employer Fixture' })).toHaveValue(id);
    fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('Operations Analyst'); noWrites();
  });

  it('loads the chooser only after a deliberate opening when there is no URL intent', async () => {
    render(tree('/loop')); fireEvent.click(await screen.findByRole('button', { name: 'Career record' }));
    expect(mocks.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a saved CV check' }));
    await screen.findByLabelText('Saved CV check'); expect(mocks.list).toHaveBeenCalledExactlyOnceWith('owner-a');
    expect(screen.getByLabelText('Saved CV check')).toHaveValue(''); noWrites();
  });

  it('requires exact-current-draft replacement and can undo without restoring sharing consent', async () => {
    current.profile = existingProfile(); render(tree()); await preview();
    fireEvent.change(screen.getByLabelText('Vacancy title'), { target: { value: 'My existing vacancy' } });
    fireEvent.change(screen.getByLabelText('Full vacancy description'), { target: { value: 'My prior complete vacancy description to preserve.' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Previous vacancy location' } });
    fireEvent.change(screen.getByLabelText('Vacancy HTTPS link'), { target: { value: 'https://previous.example.invalid/job' } });
    expect(screen.getByRole('button', { name: 'Use this saved check' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Replace these local drafts/));
    fireEvent.change(screen.getByLabelText('Target roles'), { target: { value: 'My newer target' } });
    expect(screen.getByRole('button', { name: 'Use this saved check' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Replace these local drafts/));
    fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    expect(screen.getByLabelText('My name')).toHaveValue('Keep My Name');
    expect(screen.getByLabelText('Contact line for my CV (optional)')).toHaveValue('keep@example.invalid');
    expect(screen.getByLabelText('Target roles')).toHaveValue('My newer target');
    expect(screen.getByLabelText('Locations')).toHaveValue('Dubai');
    expect(screen.getByLabelText('Vacancy HTTPS link')).toHaveValue(''); expect(screen.getByLabelText('Location')).toHaveValue('');
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(finalText);
    expect(screen.getByRole('button', { name: 'Undo saved-check import' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Replace my current local CV and vacancy fields/));
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'A newer local company edit' } });
    expect(screen.getByRole('button', { name: 'Undo saved-check import' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Replace my current local CV and vacancy fields/));
    fireEvent.click(screen.getByRole('button', { name: 'Undo saved-check import' }));
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(oldSource);
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('My existing vacancy');
    expect(screen.getByLabelText('Full vacancy description')).toHaveValue('My prior complete vacancy description to preserve.');
    expect(screen.getByLabelText('Vacancy HTTPS link')).toHaveValue('https://previous.example.invalid/job');
    expect(screen.getByLabelText('Target roles')).toHaveValue('My newer target');
    expect(screen.getByLabelText(/Save this reviewed text and profile privately/)).not.toBeChecked(); noWrites();
  });

  it('preserves an existing profile’s intentionally blank contact line', async () => {
    current.profile = { ...existingProfile(), contactLine: '' }; render(tree()); await preview();
    fireEvent.click(screen.getByLabelText(/Replace these local drafts/));
    fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    expect(screen.getByLabelText('My name')).toHaveValue('Keep My Name');
    expect(screen.getByLabelText('Contact line for my CV (optional)')).toHaveValue(''); noWrites();
  });

  it('preserves edited blank headers in a new record instead of repopulating them from the CV', async () => {
    render(tree()); await preview();
    fireEvent.change(screen.getByLabelText('My name'), { target: { value: 'Name to clear' } });
    fireEvent.change(screen.getByLabelText('My name'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Contact line for my CV (optional)'), { target: { value: 'clear@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Contact line for my CV (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    expect(screen.getByLabelText('My name')).toHaveValue('');
    expect(screen.getByLabelText('Contact line for my CV (optional)')).toHaveValue(''); noWrites();
  });

  it('blocks importing over unsaved claim edits', async () => {
    current.profile = existingProfile(); render(tree()); await preview();
    fireEvent.change(screen.getByLabelText('Wording I can substantiate'), { target: { value: 'Keep this unsaved claim wording.' } });
    fireEvent.click(screen.getByLabelText(/Replace these local drafts/));
    expect(screen.getByRole('button', { name: 'Use this saved check' })).toBeDisabled();
    expect(screen.getByText('Save or discard your claim edits before copying a saved check.')).toBeInTheDocument();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(oldSource); noWrites();
  });

  it('keeps drafts unchanged on failed load and offers an explicit retry', async () => {
    mocks.list.mockRejectedValueOnce(new Error('LOCAL_READ_FAILURE')).mockResolvedValueOnce([saved()]); render(tree());
    expect(await screen.findByRole('alert')).toHaveTextContent('Your saved checks could not be loaded.');
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved checks' })); await preview();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(''); noWrites();
  });

  it('rejects a foreign-owner read response without showing its private content', async () => {
    mocks.list.mockResolvedValue([saved({ user_id: 'owner-b', reviewed_text: finalText + '\nFOREIGN_PRIVATE_TEXT' })]); render(tree());
    expect(await screen.findByRole('alert')).toHaveTextContent('Your saved checks could not be loaded.');
    expect(screen.queryByText(/FOREIGN_PRIVATE_TEXT/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(''); noWrites();
  });

  it.each(['resolve', 'reject'] as const)('ignores an old owner’s delayed list %s after an account change', async outcome => {
    const pending = deferred<FreeCvCheck[]>(); mocks.list.mockReturnValueOnce(pending.promise);
    const view = render(tree()); await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    await act(async () => { setTrackingDraftOwner('owner-b'); mocks.auth.user = { id: 'owner-b' }; view.rerender(tree()); });
    await screen.findByRole('button', { name: 'Choose a saved CV check' });
    await act(async () => { if (outcome === 'resolve') pending.resolve([saved()]); else pending.reject(new Error('OLD_OWNER_READ_FAILURE')); });
    expect(screen.queryByLabelText('Saved CV check')).not.toBeInTheDocument();
    expect(screen.queryByText(/OLD_OWNER_READ_FAILURE/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(''); noWrites();
  });

  it.each(['resolve', 'reject'] as const)('ignores an earlier A lifetime’s delayed list %s after A to B to A', async outcome => {
    const pending = deferred<FreeCvCheck[]>(); mocks.list.mockReturnValueOnce(pending.promise);
    const view = render(tree()); await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    await act(async () => { setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a'); view.rerender(tree()); });
    await screen.findByRole('button', { name: 'Choose a saved CV check' });
    await act(async () => { if (outcome === 'resolve') pending.resolve([saved()]); else pending.reject(new Error('OLD_A_LIFETIME_FAILURE')); });
    expect(screen.queryByLabelText('Saved CV check')).not.toBeInTheDocument();
    expect(screen.queryByText(/OLD_A_LIFETIME_FAILURE/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(''); noWrites();
  });

  it.each(['loading', 'authError'] as const)('hides a selected preview during unknown auth %s and requires a fresh owned read', async field => {
    const view = render(tree()); await preview();
    fireEvent.click(screen.getByLabelText('Original source CV instead'));
    fireEvent.click(screen.getByLabelText(/I reviewed the original source and want to copy it/));
    await act(async () => { if (field === 'loading') mocks.auth.loading = true; else mocks.auth.authError = 'Local auth uncertainty'; view.rerender(tree()); });
    expect(screen.queryByLabelText('Saved CV check')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue('');
    await act(async () => { mocks.auth.loading = false; mocks.auth.authError = null; view.rerender(tree()); });
    await preview(); expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Reviewed final CV (recommended)')).toBeChecked();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(''); noWrites();
  });

  it('ignores a pending list from a previous same-owner lifecycle', async () => {
    const pending = deferred<FreeCvCheck[]>(); mocks.list.mockReturnValueOnce(pending.promise);
    render(tree()); await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    current = { ...snapshot(), lifecycleGeneration: 2, recordVersion: 3 };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh records' }));
    await screen.findByRole('button', { name: 'Choose a saved CV check' });
    await act(async () => { pending.resolve([saved()]); });
    expect(screen.queryByLabelText('Saved CV check')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(''); noWrites();
  });

  it('clears a selected check and undo on a same-owner fresh lifecycle and does not replay the consumed URL', async () => {
    render(tree()); await preview(); fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    expect(screen.getByRole('button', { name: 'Undo saved-check import' })).toBeDisabled();
    current = { ...snapshot(), lifecycleGeneration: 2, recordVersion: 3 };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh records' }));
    await waitFor(() => expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(''));
    expect(screen.queryByRole('button', { name: 'Undo saved-check import' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Saved CV check')).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a saved CV check' }));
    await screen.findByLabelText('Saved CV check'); expect(screen.getByLabelText('Saved CV check')).toHaveValue(''); noWrites();
  });
});
