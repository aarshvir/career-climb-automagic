import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StrictMode } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopClaim, LoopPacket, LoopProfile, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, call: vi.fn(), cvs: vi.fn(), download: vi.fn(), saveBlob: vi.fn(), extract: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: mocks.download, isLoopHttpsUrl: (value: string) => /^https:\/\/[^@]+$/.test(value), safeLoopGmailUrl: (value: string) => value }));
vi.mock('@/lib/document-download', () => ({ downloadBlob: mocks.saveBlob }));
vi.mock('@/lib/cv-extraction', () => ({ extractCvText: mocks.extract, validateCvText: (value: string) => { if (value.length < 80 || value.length > 60000) throw new Error('Review CV text length.'); return value; } }));
import JobLoop from '@/pages/JobLoop';
const cv = 'Developed Python reports for a fictional university project using synthetic data. Assisted with reporting during a fictional internship. No employer is contacted.';
const profile: LoopProfile = { audience: 'student', name: 'Fictional Casey', contactLine: '', targetTitles: ['Graduate analyst'], locations: ['Remote'], experienceYears: null, languages: [], pageTarget: 1, discreetSearch: false, sourceText: cv, excludedTerms: [], compensation: { currency: '', period: 'annual', minimum: null }, revision: 1, updatedAt: '2026-10-11T00:00:00Z' };
const claim: LoopClaim = { id: 'claim-a', revision: 1, status: 'active', createdAt: profile.updatedAt, sourceKind: 'cv_passage', sourceQuote: cv, phrasing: cv, context: 'Fictional university project', kind: 'academic_project', resultStatus: 'not_measured', confirmed: true, shareable: true };
const packet: LoopPacket = { id: 'packet-a', runId: 'run-a', opportunityId: 'opportunity-a', title: 'Graduate analyst', company: 'Fictional company', inputHash: 'exact-server-hash', profileRevision: 1, claimVersions: { 'claim-a': 1 }, cvText: cv, evidenceText: 'Fictional source claim-a, revision 1.', coverLetterText: '', connectionNote: '', messageText: '', emailSubject: '', emailBody: '', contact: null, assessment: { score: 60, method: 'Named relevance heuristic', components: { role: 20, evidence: 20, constraints: 20 }, gaps: ['Professional experience is not established by a project.'], flags: [], claimIds: ['claim-a'] }, status: 'review_required', holdReasons: [], pageCount: 1, createdAt: profile.updatedAt, approvedAt: null, model: { provider: 'rules', model: 'grounded-rules-v1', method: 'Source-based composition' }, artifacts: {} };
const snapshot = (): LoopSnapshot => ({ recordVersion: 1, profile: { ...profile }, claims: [{ ...claim }], opportunities: [], runs: [], packets: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 1 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } });
let current: LoopSnapshot;
function tree() { return <HelmetProvider><MemoryRouter><JobLoop /></MemoryRouter></HelmetProvider>; }
async function openTab(label: string) { await userEvent.setup().click(await screen.findByRole('button', { name: label })); }
beforeEach(() => {
  vi.clearAllMocks(); current = snapshot(); mocks.user = { id: 'owner-a' }; mocks.cvs.mockResolvedValue([]); mocks.extract.mockResolvedValue(cv);
  mocks.call.mockImplementation(async (_id, action) => { if (action.action === 'suggest_claims') return { suggestions: [{ ...claim, confirmed: true, shareable: true }] }; return { snapshot: current }; });
  mocks.download.mockResolvedValue({ blob: new Blob([cv]), filename: 'fictional.txt' });
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/loop');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); window.history.replaceState(null, '', '/'); });

describe('cloud loop consent and accurate capabilities', () => {
  it('requires private-saving consent and keeps target text usable without local persistence', async () => {
    const store = vi.spyOn(Storage.prototype, 'setItem'); render(tree()); await openTab('Career record'); const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Target roles')); await user.type(screen.getByLabelText('Target roles'), 'Product analyst\nData analyst');
    expect(screen.getByLabelText('Target roles')).toHaveValue('Product analyst\nData analyst');
    expect(screen.getByRole('button', { name: 'Save career record' })).toBeDisabled();
    await user.click(screen.getByLabelText(/Save this reviewed text and profile privately/)); await user.click(screen.getByRole('button', { name: 'Save career record' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', expect.objectContaining({ action: 'save_profile', saveConsent: true, profile: expect.objectContaining({ targetTitles: ['Product analyst', 'Data analyst'], sourceText: cv, experienceYears: null, compensation: { currency: '', period: 'annual', minimum: null } }) })));
    expect(store).not.toHaveBeenCalled(); expect(mocks.call.mock.calls.some(([, action]) => action.action === 'start_run')).toBe(false);
  });
  it('does not approve imported suggestions or silently label their evidence context', async () => {
    render(tree()); await openTab('Career record'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Suggest literal passages' }));
    await waitFor(() => expect(screen.getAllByLabelText('Source passage or my answer').some(element => (element as HTMLTextAreaElement).value === cv)).toBe(true));
    const passage = screen.getAllByLabelText('Source passage or my answer').find(element => (element as HTMLTextAreaElement).value === cv)!;
    const form = within(passage.closest('form')!);
    expect(form.getByLabelText(/I confirm this wording/)).not.toBeChecked(); expect(form.getByLabelText(/This wording and every included figure/)).not.toBeChecked();
    expect(form.getByLabelText('Evidence context')).toHaveValue(''); expect(form.getByRole('button', { name: 'Save claim' })).toBeDisabled();
    await user.selectOptions(form.getByLabelText('Evidence context'), 'academic_project'); await user.click(form.getByRole('button', { name: 'Save claim' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', expect.objectContaining({ action: 'save_claim', claim: expect.objectContaining({ kind: 'academic_project', confirmed: false, shareable: false }) })));
  });
  it('lists only configured providers and requires model-specific consent before a paid-provider run', async () => {
    current.models = [{ provider: 'openai', model: 'configured-gpt-fixture', label: 'Configured GPT fixture', ready: true, inputUsdPerMillion: 1, outputUsdPerMillion: 1 }, { provider: 'anthropic', model: 'unconfigured-fixture', label: 'Not configured', ready: false, inputUsdPerMillion: 1, outputUsdPerMillion: 1 }];
    render(tree()); const user = userEvent.setup(); await user.selectOptions(await screen.findByLabelText('Preparation provider'), 'openai');
    expect(screen.getByRole('button', { name: 'Prepare today’s applications' })).toBeDisabled(); expect(screen.queryByRole('option', { name: 'Claude' })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Allow this run’s active, confirmed and shareable/)); await user.click(screen.getByRole('button', { name: 'Prepare today’s applications' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', expect.objectContaining({ action: 'start_run', provider: 'openai', model: 'configured-gpt-fixture', modelConsent: true, inboxConsent: false })));
    expect(screen.getByLabelText(/Allow this run’s active, confirmed and shareable/)).not.toBeChecked();
  });
  it('does not infer a rules mode or invent ready capabilities from an unavailable service', async () => {
    current.capabilities.rulesEngine = false; current.capabilities.cloudWorker = false; render(tree());
    expect(await screen.findByLabelText('Preparation provider')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Prepare today’s applications' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Connect Gmail' })).toBeDisabled();
  });
  it('keeps a get failure visible rather than presenting an empty successful shortlist', async () => {
    mocks.call.mockRejectedValue(new Error('The service is being configured.')); render(tree());
    expect(await screen.findByRole('alert')).toHaveTextContent('being configured'); expect(screen.queryByText('No runs are recorded yet. Added opportunities remain in your account.')).not.toBeInTheDocument();
  });
});
describe('exact approvals and account lifecycle', () => {
  it('requires both factual and disclosure review for the exact source-controlled packet', async () => {
    current.packets = [{ ...packet }]; render(tree()); await openTab('Outputs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ }));
    expect(screen.getByLabelText('CV text for factual review')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Approve exact packet' })).toBeDisabled(); await user.click(screen.getByLabelText(/I reviewed the complete CV and evidence/));
    expect(screen.getByRole('button', { name: 'Approve exact packet' })).toBeDisabled(); await user.click(screen.getByLabelText(/The final document and its figures/));
    await user.click(screen.getByRole('button', { name: 'Approve exact packet' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'approve_packet', packetId: packet.id, inputHash: packet.inputHash, reviewedText: cv, confirmFacts: true, confirmDisclosure: true }));
  });
  it('blocks downloads when an apparently approved packet refers to a withdrawn claim', async () => {
    current.claims[0].status = 'withdrawn'; current.packets = [{ ...packet, status: 'approved' }]; render(tree()); await openTab('Outputs'); await userEvent.setup().click(screen.getByRole('button', { name: /Graduate analyst/ }));
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled(); expect(screen.getByText(/does not match the current cleared record/)).toBeInTheDocument(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('does not present an approved status as download readiness when the measured document exceeds the page preference', async () => {
    current.packets = [{ ...packet, status: 'approved', pageCount: 3 }]; render(tree()); await openTab('Outputs'); await userEvent.setup().click(screen.getByRole('button', { name: /Graduate analyst/ }));
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled(); expect(screen.getByText(/rendered page count or document checks are not cleared/)).toBeInTheDocument();
  });
  it('does not expose a previous owner’s delayed snapshot after switching accounts', async () => {
    let finish!: (response: { snapshot: LoopSnapshot }) => void;
    mocks.call.mockImplementation((id) => id === 'owner-a' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ snapshot: { ...snapshot(), profile: null, claims: [] } }));
    const view = render(tree()); await waitFor(() => expect(mocks.call).toHaveBeenCalled());
    await act(async () => { mocks.user = { id: 'owner-b' }; view.rerender(tree()); });
    await act(async () => { finish({ snapshot: { ...snapshot(), inbox: [{ id: 'private-a', bucket: 'action_needed', subject: 'OWNER A PRIVATE FIXTURE', from: 'fictional@example.test', receivedAt: profile.updatedAt, summary: 'Synthetic private reply', draftReply: '', threadId: 'thread-a', opportunityId: null, roleUnconfirmed: true }] } }); });
    expect(screen.queryByText('OWNER A PRIVATE FIXTURE')).not.toBeInTheDocument();
  });
  it('does not trigger a document download after an in-flight account switch', async () => {
    current.packets = [{ ...packet, status: 'approved' }]; let finish!: (response: { blob: Blob; filename: string }) => void;
    mocks.download.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const view = render(tree()); await openTab('Outputs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ })); await user.click(screen.getByRole('button', { name: 'Download TXT' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    await act(async () => { mocks.user = { id: 'owner-b' }; current = { ...snapshot(), profile: null, claims: [], packets: [] }; view.rerender(tree()); });
    await act(async () => { finish({ blob: new Blob([cv]), filename: 'fictional.txt' }); }); expect(mocks.saveBlob).not.toHaveBeenCalled();
  });
  it('requires approved attachment and recipient confirmation and reuses an uncertain draft reference', async () => {
    current.gmail = { connected: true, email: 'fictional@example.test', status: 'Connected', allowDrafts: true }; current.capabilities.gmailRead = true; current.capabilities.gmailDrafts = true;
    current.packets = [{ ...packet, status: 'approved', contact: { name: 'Fictional Recruiter', title: 'Recruiter', email: 'recruiter@example.test', sourceUrl: 'https://example.test/fictional', sourceQuote: 'Fictional contact fixture', confirmedByUser: true, inExistingThread: false }, emailSubject: 'Fictional role', emailBody: 'Fictional message, not sent.' }];
    mocks.call.mockImplementation(async (_id, action) => action.action === 'gmail_create_draft' ? { message: 'Draft operation confirmed. Nothing sent.' } : { snapshot: current });
    render(tree()); await openTab('Outputs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ }));
    expect(screen.getByRole('button', { name: 'Create Gmail draft' })).toBeDisabled(); await user.click(screen.getByLabelText(/I checked the recipient, reviewed the message/));
    await user.click(screen.getByRole('button', { name: 'Create Gmail draft' })); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nothing sent'));
    await user.click(screen.getByRole('button', { name: 'Create Gmail draft' }));
    await waitFor(() => expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'gmail_create_draft')).toHaveLength(2));
    const requests = mocks.call.mock.calls.filter(([, action]) => action.action === 'gmail_create_draft').map(([, action]) => action.requestId); expect(requests[0]).toBe(requests[1]);
    expect(mocks.call.mock.calls.some(([, action]) => /send|apply/.test(action.action))).toBe(false);
  });
  it('polls real active run state and does not cancel the executor when the page closes', async () => {
    vi.useFakeTimers(); current.runs = [{ id: 'run-a', requestId: 'request-a', status: 'running', phase: 'preparing', startedAt: profile.updatedAt, finishedAt: null, inputHash: 'hash-a', provider: 'rules', model: 'grounded-rules-v1', lanes: [{ name: 'Manual opportunities', status: 'completed', count: 1, checkedAt: profile.updatedAt, message: 'One user-provided opportunity inspected.' }], opportunityIds: [], packetIds: [], messages: [], nextAction: 'Review source coverage.', reservedUsd: 0, usageUsd: 0 }];
    const view = render(tree()); await act(async () => {}); expect(screen.getByText('running · preparing')).toBeInTheDocument();
    current = { ...current, recordVersion: 2, runs: [{ ...current.runs[0], status: 'completed', phase: 'completed', finishedAt: profile.updatedAt }] };
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(screen.getByText('completed · completed')).toBeInTheDocument();
    view.unmount(); expect(mocks.call.mock.calls.some(([, action]) => action.action === 'cancel_run')).toBe(false);
  });
});

describe('browser-only Gmail return confirmation', () => {
  it('retains the browser-only ticket during original-account sign-in in another tab', async () => {
    mocks.user = null; window.history.replaceState(null, '', '/loop#gmail_ticket=synthetic-sealed-ticket'); current.capabilities.gmailRead = true;
    mocks.call.mockImplementation(async (_id, action) => action.action === 'gmail_preview' ? { gmailPreview: { email: 'fictional-mailbox@example.test', allowDrafts: false, expiresAt: new Date(Date.now() + 60000).toISOString() } } : { snapshot: current });
    const view = render(tree());
    expect(screen.getByRole('link', { name: 'Sign in in another tab' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Sign in in another tab' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(window.location.hash).toBe(''); expect(mocks.call).not.toHaveBeenCalled();
    await act(async () => { mocks.user = { id: 'owner-a' }; view.rerender(tree()); });
    expect(await screen.findByText('fictional-mailbox@example.test')).toBeInTheDocument();
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'gmail_preview', ticket: 'synthetic-sealed-ticket' });
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'gmail_finalize')).toBe(false);
  });
  it('survives StrictMode replay, clears the fragment and requires mailbox confirmation before activation', async () => {
    const ticket = 'synthetic-sealed-ticket'; window.history.replaceState(null, '', `/loop#gmail_ticket=${ticket}`);
    current.capabilities.gmailRead = true; current.capabilities.gmailDrafts = true;
    const store = vi.spyOn(Storage.prototype, 'setItem');
    mocks.call.mockImplementation(async (_id, action) => action.action === 'gmail_preview' ? { gmailPreview: { email: 'fictional-mailbox@example.test', allowDrafts: true, expiresAt: new Date(Date.now() + 60000).toISOString() } } : { snapshot: current });
    render(<StrictMode>{tree()}</StrictMode>);
    expect(await screen.findByText('fictional-mailbox@example.test')).toBeInTheDocument(); expect(window.location.hash).toBe('');
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'gmail_finalize')).toBe(false);
    expect(screen.getByRole('button', { name: 'Confirm this mailbox' })).toBeDisabled(); const user = userEvent.setup();
    await user.click(screen.getByLabelText(/This is my intended mailbox/)); await user.click(screen.getByRole('button', { name: 'Confirm this mailbox' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'gmail_finalize', ticket, confirmMailbox: true }));
    expect(store).not.toHaveBeenCalled();
  });
  it('suppresses a delayed mailbox identity when the signed-in account changes', async () => {
    window.history.replaceState(null, '', '/loop#gmail_ticket=synthetic-sealed-ticket');
    let finish!: (value: unknown) => void;
    mocks.call.mockImplementation(async (_id, action) => action.action === 'gmail_preview' ? new Promise(resolve => { finish = resolve; }) : { snapshot: current });
    const view = render(tree()); await waitFor(() => expect(mocks.call.mock.calls.some(([, action]) => action.action === 'gmail_preview')).toBe(true));
    await act(async () => { mocks.user = { id: 'owner-b' }; view.rerender(tree()); });
    await act(async () => { finish({ gmailPreview: { email: 'OLD-OWNER-MAILBOX@example.test', allowDrafts: true, expiresAt: new Date(Date.now() + 60000).toISOString() } }); });
    expect(screen.queryByText('OLD-OWNER-MAILBOX@example.test')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm this mailbox' })).not.toBeInTheDocument(); expect(window.location.hash).toBe('');
  });
  it('cancels without activating or retaining the return ticket across a new mount', async () => {
    window.history.replaceState(null, '', '/loop#gmail_ticket=synthetic-sealed-ticket'); current.capabilities.gmailRead = true;
    mocks.call.mockImplementation(async (_id, action) => action.action === 'gmail_preview' ? { gmailPreview: { email: 'fictional-mailbox@example.test', allowDrafts: false, expiresAt: new Date(Date.now() + 60000).toISOString() } } : { snapshot: current });
    const view = render(tree()); await screen.findByText('fictional-mailbox@example.test'); await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel mailbox confirmation' }));
    expect(screen.queryByText('fictional-mailbox@example.test')).not.toBeInTheDocument(); view.unmount(); render(tree());
    expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'gmail_preview')).toHaveLength(1); expect(mocks.call.mock.calls.some(([, action]) => action.action === 'gmail_finalize')).toBe(false);
  });
  it('distinguishes configured draft capability from a read-only mailbox grant', async () => {
    current.gmail = { connected: true, email: 'fictional@example.test', status: 'Connected', allowDrafts: false }; current.capabilities.gmailDrafts = true;
    current.packets = [{ ...packet, status: 'approved', contact: { name: 'Fictional Recruiter', title: 'Recruiter', email: 'recruiter@example.test', sourceUrl: 'https://example.test/source', sourceQuote: 'Fictional public source', confirmedByUser: true, inExistingThread: false }, emailBody: 'Fictional unsent email' }];
    render(tree()); await openTab('Outputs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ })); await user.click(screen.getByLabelText(/I checked the recipient, reviewed the message/));
    expect(screen.getByRole('button', { name: 'Create Gmail draft' })).toBeDisabled(); expect(mocks.call.mock.calls.some(([, action]) => action.action === 'gmail_create_draft')).toBe(false);
  });
});
