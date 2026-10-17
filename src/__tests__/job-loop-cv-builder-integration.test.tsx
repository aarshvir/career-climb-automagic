import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '../pages/JobLoop';
import { clearLoopWorkingDraft } from '../lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '../lib/tracking-draft-memory';
import type { LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'owner-a' } as { id: string } | null, loading: false, authError: null as string | null }, call: vi.fn(), cvs: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value }));

const education = 'Studied biology at Example College. Completed a class project recording local plant species.';
let current: LoopSnapshot;
const tree = () => <HelmetProvider><MemoryRouter initialEntries={['/loop']}><JobLoop /></MemoryRouter></HelmetProvider>;
async function openBuilder() {
  await screen.findByRole('button', { name: 'My CV & experience' });
  fireEvent.click(screen.getByRole('button', { name: 'My CV & experience' }));
  await screen.findByLabelText('What name should appear on your CV?');
  fireEvent.click(screen.getByText('No CV yet? Build one with guided questions'));
}
function enterAnswers() {
  fireEvent.change(screen.getByLabelText('What name should appear on your CV?'), { target: { value: 'Alex Example' } });
  fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: education } });
}
function noWrites() { expect(mocks.call.mock.calls.every(([, action]) => action.action === 'get')).toBe(true); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.user = { id: 'owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
  current = { lifecycleGeneration: 0, recordVersion: 1, profile: null, claims: [], opportunities: [], packets: [], runs: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } };
  mocks.cvs.mockResolvedValue([]);
  mocks.call.mockImplementation(async (_owner, action) => { if (action.action !== 'get') throw new Error('Unexpected write in builder acceptance'); return { snapshot: structuredClone(current) }; });
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); });

describe('no-CV entry inside the real Job Loop', () => {
  it('builds a first source draft, then copies the name for explicit profile review without saving or running', async () => {
    render(tree()); await openBuilder(); enterAnswers();
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(`Alex Example\n\nEducation\n${education}`);
    fireEvent.click(screen.getByRole('button', { name: /Continue with this text/ }));
    expect(screen.getByLabelText('My name')).toHaveValue('Alex Example');
    expect(screen.getByLabelText('What name should appear on your CV?')).toHaveValue('');
    noWrites();
  });
  it('retains unfinished answers across route unmount in the same owner lifetime', async () => {
    const first = render(tree()); await openBuilder(); enterAnswers(); first.unmount();
    render(tree()); await openBuilder();
    expect(screen.getByLabelText('What name should appear on your CV?')).toHaveValue('Alex Example');
    expect(screen.getByLabelText('What have you studied or trained in?')).toHaveValue(education);
    noWrites();
  });
  it('clears answers and preview after an account switch', async () => {
    const view = render(tree()); await openBuilder(); enterAnswers();
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    mocks.auth.user = { id: 'owner-b' }; setTrackingDraftOwner('owner-b'); view.rerender(tree());
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-b', expect.objectContaining({ action: 'get' })));
    await screen.findByLabelText('What name should appear on your CV?');
    expect(screen.getByLabelText('What name should appear on your CV?')).toHaveValue('');
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Use this CV draft' })).not.toBeInTheDocument(); noWrites();
  });
  it('blocks a prior preview after a same-batch answer change and use click', async () => {
    render(tree()); await openBuilder(); enterAnswers();
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    const use = screen.getByRole('button', { name: 'Use this CV draft' });
    act(() => { fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: education + ' Still studying.' } }); fireEvent.click(use); });
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(''); noWrites();
  });
});
