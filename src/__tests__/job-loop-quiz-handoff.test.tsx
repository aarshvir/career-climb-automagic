import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '../pages/JobLoop';
import { blankLoopProfile } from '../lib/job-loop-audiences';
import { clearLoopWorkingDraft } from '../lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, trackingDraftAuthority } from '../lib/tracking-draft-memory';
import type { LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'owner-a' } as { id: string } | null, loading: false, authError: null as string | null }, call: vi.fn(), cvs: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value }));
let current: LoopSnapshot;
const source = 'Alex Example completed a biology project recording local plant species at Example College.';
function LocationProbe() { return <output data-testid="handoff-state">{JSON.stringify(useLocation().state)}</output>; }
function tree(patch: Record<string, unknown> = {}) { return <HelmetProvider><MemoryRouter initialEntries={[{ pathname: '/loop', state: { onboardingSaved: true, owner: 'owner-a', generation: 0, authority: trackingDraftAuthority('owner-a'), ...patch } }]}><JobLoop /><LocationProbe /></MemoryRouter></HelmetProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.user = { id: 'owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
  current = { lifecycleGeneration: 0, recordVersion: 1, profile: { ...blankLoopProfile('professional'), name: 'Alex Example', sourceText: source, targetTitles: ['Research assistant'], locations: ['Boston'], revision: 1, updatedAt: '2026-10-17T00:00:00Z' }, claims: [], opportunities: [], packets: [], runs: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } };
  mocks.cvs.mockResolvedValue([]);
  mocks.call.mockImplementation(async (_owner, action) => { if (action.action === 'suggest_claims') return { snapshot: structuredClone(current), suggestions: [{ sourceKind: 'cv_passage', sourceQuote: source, phrasing: source, context: 'Example College', kind: 'academic_project', resultStatus: 'not_measured', confirmed: true, shareable: true }] }; if (action.action === 'save_claim') { current.claims = [{ ...action.claim, id: 'fact-a', revision: 1, status: 'active', createdAt: '2026-10-25T00:00:00Z' }]; current.recordVersion++; return { snapshot: structuredClone(current) }; } if (action.action === 'start_run') return { snapshot: structuredClone(current), runId: 'first-run' }; if (action.action !== 'get') throw new Error('Unexpected setup write'); return { snapshot: structuredClone(current) }; });
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); });
describe('saved quiz continuation in the actual Automated Job Loop', () => {
  it('waits for the owned snapshot, opens the record, consumes the hint and preserves saved source without running', async () => {
    let resolve!: (value: unknown) => void;
    mocks.call.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(tree());
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('handoff-state')).not.toHaveTextContent('null');
    resolve({ snapshot: structuredClone(current) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'My CV & experience' })).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(screen.getByTestId('handoff-state')).toHaveTextContent('null'));
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(source);
    expect(screen.getByRole('region', { name: 'Your next setup steps' })).toHaveTextContent('0 active facts');
    fireEvent.click(screen.getByRole('button', { name: 'Review CV facts' }));
    await screen.findByText(source, { selector: 'blockquote' });
    expect(mocks.call.mock.calls.map(([, action]) => action.action)).toEqual(['get', 'suggest_claims']);
    const form = within(screen.getByText(source, {selector:'blockquote'}).closest('form')!);
    expect(form.getByLabelText(/I confirm this wording/)).not.toBeChecked();
    expect(form.getByLabelText(/This wording and every included figure/)).not.toBeChecked();
  });
  it.each([{ owner: 'owner-b' }, { generation: 1 }, { authority: -1 }])('ignores a stale handoff %j after reading current records', async patch => {
    render(tree(patch));
    await waitFor(() => expect(screen.getByTestId('handoff-state')).toHaveTextContent('null'));
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'My CV & experience' })).toHaveAttribute('aria-pressed', 'false');
    expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });
  it('does not treat the navigation hint as a saved profile', async () => {
    current.profile = null; render(tree());
    await screen.findByRole('link', { name: 'Start your setup' });
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'Your next setup steps' })).not.toBeInTheDocument();
  });
  it('reviews a fact and deliberately searches without creating a variant or enabling a schedule', async () => {
    current.capabilities.cvVariants = true; render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Review CV facts' }));
    await screen.findByText(source, { selector: 'blockquote' });
    const form = within(screen.getByText(source, {selector:'blockquote'}).closest('form')!);
    fireEvent.change(form.getByLabelText('Evidence context'), { target: { value: 'academic_project' } });
    fireEvent.click(form.getByLabelText(/I confirm this wording/));
    fireEvent.click(form.getByLabelText(/This wording and every included figure/));
    fireEvent.click(form.getByRole('button', { name: 'Save claim' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run my first search' })).toBeEnabled());
    expect(mocks.call.mock.calls.some(([, a]) => /start_run|save_schedule|save_cv_variant/.test(a.action))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Run my first search' }));
    await waitFor(() => expect(mocks.call.mock.calls.filter(([, a]) => a.action === 'start_run')).toHaveLength(1));
    expect(mocks.call.mock.calls.find(([, a]) => a.action === 'start_run')![1]).toMatchObject({ provider: 'rules', modelConsent: false, inboxConsent: false, expectedGeneration: 0 });
  });
  it.each(['loading','error'] as const)('revokes first search when authentication is %s', async mode => {
    current.claims = [{ id:'fact-a', revision:1, status:'active', createdAt:'2026-10-25T00:00:00Z', sourceKind:'cv_passage', sourceQuote:source, phrasing:source, context:'Example College', kind:'academic_project', resultStatus:'not_measured', confirmed:true, shareable:true }];
    const view = render(tree()); await waitFor(() => expect(screen.getByRole('button', { name:'Run my first search' })).toBeEnabled());
    if (mode === 'loading') mocks.auth.loading = true; else mocks.auth.authError = 'Session unavailable';
    view.rerender(tree());
    const first = screen.queryByRole('button', { name:'Run my first search' }); if (first) expect(first).toBeDisabled();
    expect(mocks.call.mock.calls.some(([, a]) => a.action === 'start_run')).toBe(false);
  });
  it('rejects old fact suggestions returned with a newer saved CV', async () => {
    let finish!: (response: unknown) => void;
    mocks.call.mockImplementationOnce(async () => ({ snapshot: structuredClone(current) })).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(tree()); fireEvent.click(await screen.findByRole('button', { name:'Review CV facts' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(2));
    finish({ snapshot: { ...current, recordVersion:2, profile:{ ...current.profile!, sourceText:'Different current saved CV. '.repeat(5) } }, suggestions:[{ sourceQuote:source, phrasing:source }] });
    await waitFor(() => expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue('Different current saved CV. '.repeat(5)));
    expect(screen.queryByText(source, { selector:'blockquote' })).not.toBeInTheDocument();
  });

});
describe('one-step first search from literal CV lines', () => {
  function passages(count: number) {
    const lines = Array.from({ length: count }, (_, index) => `Example fact ${index + 1}: recorded local plant species in a supervised academic project.`);
    current.profile!.sourceText = lines.join('\n');
    mocks.call.mockImplementation(async (_owner, action) => {
      if (action.action === 'suggest_claims') return { snapshot: structuredClone(current), suggestions: lines.map(line => ({ sourceKind: 'cv_passage', sourceQuote: line, phrasing: line, context: 'Example College', kind: 'academic_project', resultStatus: 'not_measured', confirmed: false, shareable: false })) };
      if (action.action === 'save_claim') {
        current.claims.push({ ...action.claim, id: `fact-${current.claims.length}`, revision: 1, status: 'active', createdAt: '2026-11-11T00:00:00Z' });
        current.recordVersion++;
        return { snapshot: structuredClone(current) };
      }
      if (action.action === 'start_run') return { snapshot: structuredClone(current), runId: 'first-run' };
      if (action.action !== 'get') throw new Error('Unexpected setup write');
      return { snapshot: structuredClone(current) };
    });
    return lines;
  }
  it('confirms only the displayed and selected facts, without backfilling hidden lines', async () => {
    const lines = passages(13);
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    const quick = within(await screen.findByRole('group', { name: 'Quick start' }));
    expect(quick.queryByLabelText(lines[12])).not.toBeInTheDocument();
    fireEvent.click(quick.getByLabelText(lines[0]));
    fireEvent.click(quick.getByLabelText(/The ticked lines are accurate/));
    fireEvent.click(quick.getByRole('button', { name: 'Confirm and find my first matches' }));
    await waitFor(() => expect(mocks.call.mock.calls.some(([, action]) => action.action === 'start_run')).toBe(true));
    expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'save_claim').map(([, action]) => action.claim.sourceQuote)).toEqual(lines.slice(1, 12));
  });
  it('requires a fresh confirmation after changing which displayed lines are selected', async () => {
    const lines = passages(2);
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    const quick = within(await screen.findByRole('group', { name: 'Quick start' }));
    fireEvent.click(quick.getByLabelText(/The ticked lines are accurate/));
    expect(quick.getByRole('button', { name: 'Confirm and find my first matches' })).toBeEnabled();
    fireEvent.click(quick.getByLabelText(lines[1]));
    expect(quick.getByLabelText(/The ticked lines are accurate/)).not.toBeChecked();
    expect(quick.getByRole('button', { name: 'Confirm and find my first matches' })).toBeDisabled();
    expect(mocks.call.mock.calls.some(([, action]) => /save_claim|start_run/.test(action.action))).toBe(false);
  });
  it('aborts the remaining old-source batch when the account changes during a pending save', async () => {
    passages(2);
    const initial = structuredClone(current);
    const normal = mocks.call.getMockImplementation()!;
    let finish!: (response: unknown) => void;
    let held = false;
    mocks.call.mockImplementation((owner, action) => {
      if (action.action === 'save_claim' && !held) { held = true; return new Promise(resolve => { finish = resolve; }); }
      return normal(owner, action);
    });
    const view = render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    const quick = within(await screen.findByRole('group', { name: 'Quick start' }));
    fireEvent.click(quick.getByLabelText(/The ticked lines are accurate/));
    fireEvent.click(quick.getByRole('button', { name: 'Confirm and find my first matches' }));
    await waitFor(() => expect(held).toBe(true));
    const newSource = 'Another owner recorded a different supervised research project with a different source CV.';
    current = { ...structuredClone(initial), profile: { ...initial.profile!, sourceText: newSource } };
    mocks.auth.user = { id: 'owner-b' }; setTrackingDraftOwner('owner-b');
    view.rerender(tree());
    await waitFor(() => expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(newSource));
    await act(async () => { finish({ snapshot: initial }); });
    expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'save_claim')).toHaveLength(1);
    expect(mocks.call.mock.calls.some(([owner, action]) => owner === 'owner-b' && /save_claim|start_run/.test(action.action))).toBe(false);
  });
  async function holdFirstSave() {
    const normal = mocks.call.getMockImplementation()!;
    let finish!: (response: unknown) => void; let held = false;
    mocks.call.mockImplementation((owner, action) => {
      if (action.action === 'save_claim' && !held) { held = true; return new Promise(resolve => { finish = resolve; }); }
      return normal(owner, action);
    });
    return { held: () => held, finish: (response: unknown) => finish(response) };
  }
  async function startQuick() {
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    const quick = within(await screen.findByRole('group', { name: 'Quick start' }));
    fireEvent.click(quick.getByLabelText(/The ticked lines are accurate/));
    fireEvent.click(quick.getByRole('button', { name: 'Confirm and find my first matches' }));
    return quick;
  }
  it.each(['loading', 'error'] as const)('stops the batch and starts no search when sign-in is %s during a save', async mode => {
    passages(2); const gate = await holdFirstSave();
    const view = render(tree()); await startQuick();
    await waitFor(() => expect(gate.held()).toBe(true));
    if (mode === 'loading') mocks.auth.loading = true; else mocks.auth.authError = 'Session unavailable';
    view.rerender(tree());
    const saved = structuredClone(current); saved.recordVersion++;
    await act(async () => { gate.finish({ snapshot: saved }); });
    expect(mocks.call.mock.calls.filter(([, a]) => a.action === 'save_claim')).toHaveLength(1);
    expect(mocks.call.mock.calls.some(([, a]) => a.action === 'start_run')).toBe(false);
  });
  it('stops the batch when the saved CV source changes during a save', async () => {
    passages(2); const gate = await holdFirstSave();
    render(tree()); await startQuick();
    await waitFor(() => expect(gate.held()).toBe(true));
    const changed = structuredClone(current); changed.recordVersion++; changed.profile!.sourceText = 'A different CV source text that was saved in another tab for this same account.';
    await act(async () => { gate.finish({ snapshot: changed }); });
    expect(mocks.call.mock.calls.filter(([, a]) => a.action === 'save_claim')).toHaveLength(1);
    expect(mocks.call.mock.calls.some(([, a]) => a.action === 'start_run')).toBe(false);
  });
  it('starts no search after a partial failure, keeps the saved fact, and lets the user retry the search', async () => {
    const lines = passages(3);
    const normal = mocks.call.getMockImplementation()!;
    let saves = 0;
    mocks.call.mockImplementation((owner, action) => {
      if (action.action === 'save_claim' && ++saves === 2) return Promise.reject(new Error('The save could not be confirmed.'));
      return normal(owner, action);
    });
    render(tree()); await startQuick();
    await screen.findByText(/1 of 3 facts were confirmed. Your search has not started/);
    expect(mocks.call.mock.calls.filter(([, a]) => a.action === 'save_claim').map(([, a]) => a.claim.sourceQuote)).toEqual(lines.slice(0, 2));
    expect(mocks.call.mock.calls.some(([, a]) => a.action === 'start_run')).toBe(false);
    const run = await screen.findByRole('button', { name: 'Run my first search' });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    await waitFor(() => expect(mocks.call.mock.calls.filter(([, a]) => a.action === 'start_run')).toHaveLength(1));
  });
  it('offers a manual fact route, with confirmations unchecked, when the CV yields no lines', async () => {
    const normal = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation((owner, action) => action.action === 'suggest_claims' ? Promise.resolve({ snapshot: structuredClone(current), suggestions: [] }) : normal(owner, action));
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    const quick = within(await screen.findByRole('group', { name: 'Quick start' }));
    await waitFor(() => expect(quick.getByRole('button', { name: 'Add a fact myself' })).toBeInTheDocument());
    expect(quick.queryByRole('button', { name: 'Show the facts from my CV' })).not.toBeInTheDocument();
    fireEvent.click(quick.getByRole('button', { name: 'Add a fact myself' }));
    expect(screen.getByRole('button', { name: 'My CV & experience' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.call.mock.calls.some(([, a]) => /save_claim|start_run/.test(a.action))).toBe(false);
  });
  it('confirms the ticked lines word for word, then starts the first source-based search', async () => {
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    const quick = within(await screen.findByRole('group', { name: 'Quick start' }));
    expect(quick.getByLabelText(source)).toBeChecked();
    const go = quick.getByRole('button', { name: 'Confirm and find my first matches' });
    expect(go).toBeDisabled();
    fireEvent.click(quick.getByLabelText(/The ticked lines are accurate/));
    fireEvent.click(go);
    await waitFor(() => expect(mocks.call.mock.calls.filter(([, a]) => a.action === 'start_run')).toHaveLength(1));
    const saved = mocks.call.mock.calls.filter(([, a]) => a.action === 'save_claim');
    expect(saved).toHaveLength(1);
    expect(saved[0][1].claim).toMatchObject({ sourceQuote: source, phrasing: source, confirmed: true, shareable: true });
    expect(mocks.call.mock.calls.find(([, a]) => a.action === 'start_run')![1]).toMatchObject({ provider: 'rules', modelConsent: false, inboxConsent: false });
    expect(mocks.call.mock.calls.some(([, a]) => /save_schedule|save_cv_variant/.test(a.action))).toBe(false);
  });
  it('saves nothing and starts nothing when every line is unticked', async () => {
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    const quick = within(await screen.findByRole('group', { name: 'Quick start' }));
    fireEvent.click(quick.getByLabelText(source));
    expect(quick.getByLabelText(/The ticked lines are accurate/)).toBeDisabled();
    expect(quick.getByRole('button', { name: 'Confirm and find my first matches' })).toBeDisabled();
    expect(mocks.call.mock.calls.some(([, a]) => /save_claim|start_run/.test(a.action))).toBe(false);
  });
});
