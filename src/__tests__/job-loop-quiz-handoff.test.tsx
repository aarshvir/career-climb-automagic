import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
