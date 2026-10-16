import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '@/pages/JobLoop';
import type { LoopProfile, LoopSnapshot, LoopResponse, LoopOpportunity } from '../../supabase/functions/_shared/job-loop-types';
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
function linked(checkId = id): LoopOpportunity { return { id: `op-${checkId}`, sourceCheckId: checkId, source: 'manual', sourceKey: `saved-check:${checkId}`, title: 'Operations Analyst', company: 'Saved Employer Fixture', description: vacancy, location: '', url: 'https://employer.example.invalid/job', contact: null, checkedAt: '2026-10-15T00:00:00Z', verification: 'user_provided', status: 'interview', notes: 'Keep my existing progress', followUpAt: null }; }
async function importAndOpen() {
  await preview(); fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
  fireEvent.click(screen.getByRole('button', { name: 'Opportunities' }));
  fireEvent.change(screen.getByLabelText('Vacancy HTTPS link'), { target: { value: 'https://employer.example.invalid/job' } });
}
const linkConsentLabel = /Save this vacancy privately and link it to this saved check/;
function submitLink() { fireEvent.click(screen.getByLabelText(linkConsentLabel)); fireEvent.click(screen.getByRole('button', { name: 'Save linked vacancy' })); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.list.mockReset(); mocks.call.mockReset(); mocks.auth.user = { id: 'owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
  current = snapshot(); mocks.cvs.mockResolvedValue([]); mocks.list.mockResolvedValue([saved()]);
  mocks.call.mockImplementation(async (_owner, action) => { if (action.action !== 'get') throw new Error('Unexpected write in local import test'); return { snapshot: structuredClone(current) }; });
  window.history.replaceState(null, '', '/loop');
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('saved check continuation inside the real Loop workspace', () => {
  it('requires fresh link consent and sends the exact source identity without saving the CV or starting preparation', async () => {
    render(tree()); await importAndOpen();
    expect(screen.getByRole('button', { name: 'Save linked vacancy' })).toBeDisabled(); noWrites();
    mocks.call.mockImplementation(async (_owner, action) => {
      expect(action).toMatchObject({ action: 'link_saved_check', checkId: id, expectedGeneration: 0, expectedVersion: 1, linkConsent: true, opportunity: { title: 'Operations Analyst', description: vacancy, contact: null } });
      return { snapshot: { ...current, recordVersion: 2, opportunities: [linked()] }, checkLink: { checkId: id, opportunityId: linked().id, reused: false } };
    });
    submitLink(); await waitFor(() => expect(screen.getByLabelText('Vacancy title')).toHaveValue(''));
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(finalText);
    expect(screen.getByLabelText('My application notes')).toHaveValue('Keep my existing progress');
    expect(mocks.call.mock.calls.filter(([, a]) => a.action !== 'get')).toHaveLength(1);
  });

  it.each(['Vacancy title', 'Company', 'Full vacancy description'])('requires a restore-or-separate choice after editing %s', async field => {
    render(tree()); await importAndOpen(); fireEvent.click(screen.getByLabelText(linkConsentLabel));
    fireEvent.change(screen.getByLabelText(field), { target: { value: field === 'Full vacancy description' ? vacancy + ' Changed requirements.' : 'Changed source field' } });
    expect(screen.getByRole('button', { name: 'Save linked vacancy' })).toBeDisabled();
    expect(screen.queryByLabelText(linkConsentLabel)).not.toBeInTheDocument(); noWrites();
    fireEvent.click(screen.getByRole('button', { name: 'Restore saved vacancy wording' }));
    expect(screen.getByLabelText(linkConsentLabel)).not.toBeChecked();
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('Operations Analyst');
    expect(screen.getByLabelText('Full vacancy description')).toHaveValue(vacancy);
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Separate company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep edits as a separate vacancy' }));
    expect(screen.getByLabelText('Company')).toHaveValue('Separate company');
    mocks.call.mockResolvedValue({ snapshot: current }); fireEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));
    await waitFor(() => expect(mocks.call).toHaveBeenLastCalledWith('owner-a', expect.objectContaining({ action: 'add_opportunity', opportunity: expect.objectContaining({ company: 'Separate company' }) })));
  });

  it('invalidates link consent even when source wording is changed back in one batch', async () => {
    render(tree()); await importAndOpen(); fireEvent.click(screen.getByLabelText(linkConsentLabel));
    act(() => { fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Changed' } }); fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Saved Employer Fixture' } }); });
    expect(screen.getByLabelText(linkConsentLabel)).not.toBeChecked(); noWrites();
  });

  it('rejects a same-batch submit after a field change before React commits consent invalidation', async () => {
    render(tree()); await importAndOpen(); fireEvent.click(screen.getByLabelText(linkConsentLabel));
    act(() => { fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'New employer' } }); fireEvent.submit(screen.getByLabelText('Company').closest('form')!); });
    noWrites(); expect(screen.getByLabelText('Company')).toHaveValue('New employer');
  });

  it('retains exact identity through navigation recovery but never retains link consent', async () => {
    const first = render(tree()); await importAndOpen(); fireEvent.click(screen.getByLabelText(linkConsentLabel)); first.unmount();
    render(tree('/loop')); fireEvent.click(await screen.findByRole('button', { name: 'Opportunities' }));
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('Operations Analyst');
    expect(screen.getByLabelText(linkConsentLabel)).not.toBeChecked();
    mocks.call.mockResolvedValue({ snapshot: { ...current, opportunities: [linked()] }, checkLink: { checkId: id, opportunityId: linked().id, reused: false } }); submitLink();
    await waitFor(() => expect(mocks.call).toHaveBeenLastCalledWith('owner-a', expect.objectContaining({ action: 'link_saved_check', checkId: id })));
  });

  it('keeps provenance after a profile save instead of falling back to a manual vacancy', async () => {
    current.profile = existingProfile(); render(tree()); await preview(); fireEvent.click(screen.getByLabelText(/Replace these local drafts/)); fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    mocks.call.mockImplementation(async (_owner, action) => { if (action.action === 'save_profile') return { snapshot: { ...current, recordVersion: 2, profile: { ...action.profile, revision: 2 } } }; return { snapshot: current }; });
    fireEvent.click(screen.getByLabelText(/Save this reviewed text and profile privately/));
    fireEvent.submit(screen.getByLabelText('Reviewed source CV or career record').closest('form')!);
    await waitFor(() => expect(screen.queryByText('Working on your request…')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Opportunities' }));
    fireEvent.change(screen.getByLabelText('Vacancy HTTPS link'), { target: { value: 'https://employer.example.invalid/job' } }); submitLink();
    await waitFor(() => expect(mocks.call).toHaveBeenLastCalledWith('owner-a', expect.objectContaining({ action: 'link_saved_check', checkId: id, expectedVersion: 2 })));
  });

  it('shows current linked progress on reopening and preserves it on an ambiguous retry', async () => {
    current.opportunities = [linked()]; render(tree()); await importAndOpen();
    expect(screen.getByRole('link', { name: 'Open linked vacancy and progress' })).toHaveAttribute('href', `/loop?opportunity=${linked().id}&generation=0`);
    expect(screen.getByText(/Already linked:/)).toHaveTextContent('interview');
    mocks.call.mockRejectedValueOnce(new Error('Response lost'));
    submitLink(); await screen.findByText('Response lost');
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('Operations Analyst');
    mocks.call.mockResolvedValue({ snapshot: current, checkLink: { checkId: id, opportunityId: linked().id, reused: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Save linked vacancy' }));
    await waitFor(() => expect(screen.getByLabelText('Vacancy title')).toHaveValue(''));
    expect(screen.getByLabelText('My application notes')).toHaveValue('Keep my existing progress');
    expect(mocks.call.mock.calls.filter(([, a]) => a.action === 'link_saved_check').map(([, a]) => a.checkId)).toEqual([id, id]);
  });

  it('keeps pending attribution in route memory even when all vacancy fields were intentionally cleared', async () => {
    const view = render(tree()); await importAndOpen();
    // Save the CV independently so the pending link is the only remaining draft.
    fireEvent.click(screen.getByRole('button', { name: 'My CV & experience' }));
    fireEvent.change(screen.getByLabelText('Locations'), { target: { value: 'Dubai' } });
    mocks.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'save_profile') { current = { ...current, recordVersion: 2, profile: { ...action.profile, revision: 1 } }; return { snapshot: current }; }
      if (action.action === 'suggest_claims') return { suggestions: [] };
      return { snapshot: current };
    });
    fireEvent.click(screen.getByLabelText(/Save this reviewed text and profile privately/)); fireEvent.submit(screen.getByLabelText('Reviewed source CV or career record').closest('form')!);
    await waitFor(() => expect(mocks.call.mock.calls.some(([, a]) => a.action === 'suggest_claims')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Opportunities' }));
    for (const label of ['Vacancy title', 'Company', 'Full vacancy description', 'Vacancy HTTPS link']) fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    view.unmount(); render(tree('/loop')); fireEvent.click(await screen.findByRole('button', { name: 'Opportunities' }));
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Restore saved vacancy wording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save linked vacancy' })).toBeDisabled();
  });

  it('does not clear newer vacancy edits when a delayed save succeeds', async () => {
    render(tree()); await importAndOpen(); const pending = deferred<LoopResponse>(); mocks.call.mockReturnValue(pending.promise); submitLink();
    // A programmatic change can occur even while the native fieldset is disabled.
    fireEvent.change(screen.getByLabelText('Vacancy title'), { target: { value: 'Newer local vacancy' } });
    await act(async () => pending.resolve({ snapshot: { ...current, opportunities: [linked()] }, checkLink: { checkId: id, opportunityId: linked().id, reused: false } }));
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('Newer local vacancy');
    expect(screen.getByRole('button', { name: 'Restore saved vacancy wording' })).toBeInTheDocument();
  });

  it('rejects an old auth lifetime result before React renders the identity transition', async () => {
    render(tree()); await importAndOpen(); const pending = deferred<LoopResponse>(); mocks.call.mockImplementation((_owner, action) => action.action === 'get' ? Promise.resolve({ snapshot: current }) : pending.promise); submitLink();
    await act(async () => { setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a'); pending.resolve({ snapshot: { ...current, opportunities: [linked()] }, checkLink: { checkId: id, opportunityId: linked().id, reused: false } }); });
    expect(screen.queryByText('Keep my existing progress')).not.toBeInTheDocument();
    expect(screen.queryByText(/Vacancy linked to your saved check/)).not.toBeInTheDocument();
  });

  it('restores the preceding imported check identity on undo, including two checks with the same vacancy wording', async () => {
    const secondId = '22222222-2222-4222-8222-222222222222'; mocks.list.mockResolvedValue([saved(), saved({ id: secondId })]);
    render(tree()); await importAndOpen();
    fireEvent.click(screen.getByRole('button', { name: 'My CV & experience' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose a saved CV check' })); await screen.findByLabelText('Saved CV check');
    fireEvent.change(screen.getByLabelText('Saved CV check'), { target: { value: secondId } });
    fireEvent.click(screen.getByLabelText(/Replace these local drafts/)); fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
    fireEvent.click(screen.getByLabelText(/Replace my current local CV and vacancy fields/)); fireEvent.click(screen.getByRole('button', { name: 'Undo saved-check import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opportunities' }));
    expect(screen.getByLabelText(linkConsentLabel)).not.toBeChecked();
    mocks.call.mockResolvedValue({ snapshot: { ...current, opportunities: [linked()] }, checkLink: { checkId: id, opportunityId: linked().id, reused: false } }); submitLink();
    await waitFor(() => expect(mocks.call).toHaveBeenLastCalledWith('owner-a', expect.objectContaining({ action: 'link_saved_check', checkId: id })));
  });

  it('saves a second identical-wording check as its own exact application instead of selecting the first link', async () => {
    const secondId = '22222222-2222-4222-8222-222222222222'; current.opportunities = [linked()]; mocks.list.mockResolvedValue([saved({ id: secondId })]);
    render(tree(`/loop?fromCheck=${secondId}`)); await screen.findByLabelText('Saved CV check');
    await waitFor(() => expect(screen.getByLabelText('Saved CV check')).toHaveValue(secondId));
    fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' })); fireEvent.click(screen.getByRole('button', { name: 'Opportunities' }));
    expect(screen.queryByRole('link', { name: 'Open linked vacancy and progress' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Vacancy HTTPS link'), { target: { value: 'https://employer.example.invalid/job' } });
    mocks.call.mockResolvedValue({ snapshot: { ...current, opportunities: [linked(), linked(secondId)] }, checkLink: { checkId: secondId, opportunityId: linked(secondId).id, reused: false } }); submitLink();
    await waitFor(() => expect(mocks.call).toHaveBeenLastCalledWith('owner-a', expect.objectContaining({ action: 'link_saved_check', checkId: secondId })));
    await waitFor(() => expect(screen.getAllByLabelText('My application notes')).toHaveLength(2));
  });

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
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(/^\/loop$/));
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
    render(tree('/loop')); fireEvent.click(await screen.findByRole('button', { name: 'My CV & experience' }));
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


describe('selected preparation in the actual Loop page', () => {
  const opportunityIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
  function preparedRecord() {
    current.profile = existingProfile();
    current.claims = [{ id: 'claim-1', revision: 1, status: 'active', createdAt: '2026-10-16', sourceKind: 'user_answer', sourceQuote: 'Maintained operations reports at Example Company.', phrasing: 'Maintained operations reports at Example Company.', context: 'Example Company', kind: 'employment', resultStatus: 'not_measured', confirmed: true, shareable: true }];
    current.opportunities = opportunityIds.map((opId, i) => ({ ...linked(), id: opId, title: `Chosen role ${i + 1}`, sourceCheckId: undefined, sourceKey: opId, status: 'saved' }));
  }
  async function readyChoice() {
    await screen.findByRole('heading', { name: 'Prepare for a saved vacancy' });
    fireEvent.click(screen.getByLabelText(/Chosen role 3 · Saved Employer Fixture/));
    fireEvent.click(screen.getByLabelText(/Prepare documents for only my chosen vacancies/));
  }
  it('offers a direct vacancy choice, requires consent and dispatches the selected action with original authority', async () => {
    preparedRecord(); render(tree('/loop')); await screen.findByRole('heading', { name: 'Prepare for a saved vacancy' });
    fireEvent.click(screen.getByRole('button', { name: 'Opportunities' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Chosen role 3 for preparation' }));
    expect(screen.getByLabelText(/Chosen role 3 · Saved Employer Fixture/)).toBeChecked(); noWrites();
    expect(screen.getByLabelText(/Prepare documents for only my chosen vacancies/)).not.toBeChecked();
    mocks.call.mockImplementation(async (_owner, action) => ({ snapshot: structuredClone(current), selectedRun: { requestId: action.requestId, runId: id, generation: 0, opportunityIds: [...action.opportunityIds] } }));
    fireEvent.click(screen.getByLabelText(/Prepare documents for only my chosen vacancies/));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare chosen vacancies' }));
    await screen.findByText(/Your chosen application preparation is recorded/);
    expect(mocks.call).toHaveBeenLastCalledWith('owner-a', expect.objectContaining({ action: 'start_selected_run', expectedGeneration: 0, expectedVersion: 1, opportunityIds: [opportunityIds[2]], prepareConsent: true, modelConsent: false }));
  });
  it('does not carry a direct vacancy choice into a refreshed record lifetime', async () => {
    preparedRecord(); render(tree('/loop')); await screen.findByRole('heading', { name: 'Prepare for a saved vacancy' });
    fireEvent.click(screen.getByRole('button', { name: 'Opportunities' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Chosen role 3 for preparation' }));
    expect(screen.getByLabelText(/Chosen role 3 · Saved Employer Fixture/)).toBeChecked();
    current = { ...current, lifecycleGeneration: 1, recordVersion: 2 };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh records' }));
    await waitFor(() => expect(screen.getByLabelText(/Chosen role 3 · Saved Employer Fixture/)).not.toBeChecked());
    noWrites();
  });
  it('blocks same-batch claim edits before React applies the dirty-state update', async () => {
    preparedRecord(); render(tree('/loop')); await readyChoice();
    act(() => { fireEvent.change(screen.getAllByLabelText('Wording I can substantiate')[0], { target: { value: 'New wording' } }); fireEvent.click(screen.getByRole('button', { name: 'Prepare chosen vacancies' })); });
    noWrites();
  });
  it('does not apply delayed selection responses over newer profile edits', async () => {
    preparedRecord(); render(tree('/loop')); await readyChoice(); const result = deferred<LoopResponse>();
    mocks.call.mockImplementation(() => result.promise); fireEvent.click(screen.getByRole('button', { name: 'Prepare chosen vacancies' }));
    const action = mocks.call.mock.calls.at(-1)![1];
    fireEvent.change(screen.getByLabelText('My name'), { target: { value: 'Keep newer name' } });
    await act(async () => result.resolve({ snapshot: { ...structuredClone(current), recordVersion: 99 }, message: 'Stale preparation response', selectedRun: { requestId: action.requestId, runId: id, generation: 0, opportunityIds: action.opportunityIds } }));
    expect(screen.getByLabelText('My name')).toHaveValue('Keep newer name'); expect(screen.queryByText('Stale preparation response')).not.toBeInTheDocument();
  });
  it('rejects delayed results after confirmed auth authority changes', async () => {
    preparedRecord(); const view = render(tree('/loop')); await readyChoice(); const result = deferred<LoopResponse>();
    mocks.call.mockImplementation(() => result.promise); fireEvent.click(screen.getByRole('button', { name: 'Prepare chosen vacancies' }));
    mocks.auth.authError = 'Session unavailable'; view.rerender(tree('/loop'));
    await act(async () => result.resolve({ snapshot: structuredClone(current), message: 'Old session result' }));
    expect(screen.queryByText('Old session result')).not.toBeInTheDocument();
  });
});
