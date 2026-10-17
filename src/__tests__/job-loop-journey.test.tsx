import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StrictMode } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopClaim, LoopPacket, LoopProfile, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
import { clearLoopWorkingDraft, recoverLoopWorkingDraft } from '@/lib/loop-draft-memory';
import { LoopServiceError } from '@/lib/loop-service-error';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: { id: 'owner-a' } as { id: string } | null, call: vi.fn(), cvs: vi.fn(), download: vi.fn(), preview: vi.fn(), saveBlob: vi.fn(), extract: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: mocks.download, getLoopPreview: mocks.preview, isLoopHttpsUrl: (value: string) => /^https:\/\/[^@]+$/.test(value), safeLoopGmailUrl: (value: string) => value }));
vi.mock('@/lib/document-download', () => ({ downloadBlob: mocks.saveBlob }));
vi.mock('@/lib/cv-extraction', () => ({ extractCvText: mocks.extract, validateCvText: (value: string) => { if (value.length < 80 || value.length > 60000) throw new Error('Review CV text length.'); return value; } }));
import JobLoop from '@/pages/JobLoop';
import LoopPacketPreview from '@/pages/LoopPacketPreview';
const cv = 'Developed Python reports for a fictional university project using synthetic data. Assisted with reporting during a fictional internship. No employer is contacted.';
const StandardURL = URL;
const profile: LoopProfile = { audience: 'student', name: 'Fictional Casey', contactLine: '', targetTitles: ['Graduate analyst'], locations: ['Remote'], experienceYears: null, languages: [], pageTarget: 1, discreetSearch: false, sourceText: cv, excludedTerms: [], compensation: { currency: '', period: 'annual', minimum: null }, revision: 1, updatedAt: '2026-10-11T00:00:00Z' };
const claim: LoopClaim = { id: 'claim-a', revision: 1, status: 'active', createdAt: profile.updatedAt, sourceKind: 'cv_passage', sourceQuote: cv, phrasing: cv, context: 'Fictional university project', kind: 'academic_project', resultStatus: 'not_measured', confirmed: true, shareable: true };
const packet: LoopPacket = { id: 'packet-a', runId: 'run-a', opportunityId: 'opportunity-a', title: 'Graduate analyst', company: 'Fictional company', inputHash: 'exact-server-hash', profileRevision: 1, claimVersions: { 'claim-a': 1 }, cvText: cv, evidenceText: 'Fictional source claim-a, revision 1.', coverLetterText: '', connectionNote: '', messageText: '', emailSubject: '', emailBody: '', contact: null, assessment: { score: 60, method: 'Named relevance heuristic', components: { role: 20, evidence: 20, constraints: 20 }, gaps: ['Professional experience is not established by a project.'], flags: [], claimIds: ['claim-a'] }, status: 'review_required', holdReasons: [], pageCount: 1, createdAt: profile.updatedAt, approvedAt: null, model: { provider: 'rules', model: 'grounded-rules-v1', method: 'Source-based composition' }, artifacts: {} };
const snapshot = (): LoopSnapshot => ({ lifecycleGeneration: 0, recordVersion: 1, profile: { ...profile }, claims: [{ ...claim }], opportunities: [], runs: [], packets: [], inbox: [], models: [], capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 1 }, gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false } });
let current: LoopSnapshot;
function tree(path = '/loop') { return <HelmetProvider><MemoryRouter initialEntries={[path]}><JobLoop /></MemoryRouter></HelmetProvider>; }
async function openTab(label: string) { await userEvent.setup().click(await screen.findByRole('button', { name: label })); }
beforeEach(() => {
  clearLoopWorkingDraft();
  vi.clearAllMocks(); current = snapshot(); mocks.user = { id: 'owner-a' }; mocks.cvs.mockResolvedValue([]); mocks.extract.mockResolvedValue(cv);
  mocks.call.mockImplementation(async (_id, action) => { if (action.action === 'suggest_claims') return { suggestions: [{ ...claim, confirmed: true, shareable: true }] }; return { snapshot: current }; });
  mocks.download.mockResolvedValue({ blob: new Blob([cv]), filename: 'fictional.txt' });
  mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF-fictional'], { type: 'application/pdf' }), filename: 'fictional-preview.pdf' });
  vi.stubGlobal('URL', class extends StandardURL { static createObjectURL = vi.fn(() => 'blob:synthetic-loop-preview'); static revokeObjectURL = vi.fn(); });
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/loop');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); window.history.replaceState(null, '', '/'); });

describe('cloud loop consent and accurate capabilities', () => {
  it('allows a new unenrolled candidate to start while the pilot has available capacity', async () => {
    current.pilot = { enrolled: false, activeUsers: 0, maxUsers: 10 }; render(tree());
    expect(await screen.findByRole('button', { name: 'Prepare today’s applications' })).toBeEnabled();
  });
  it('disables new preparation for an unenrolled candidate when all pilot slots are occupied', async () => {
    current.pilot = { enrolled: false, activeUsers: 10, maxUsers: 10 }; current.capabilities.scheduler = true; render(tree());
    expect(await screen.findByRole('button', { name: 'Prepare today’s applications' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enable recurring preparation' })).toBeDisabled();
  });
  it('carries audience preferences into a new record while leaving years and target titles unset', async () => {
    current.profile = null; current.claims = []; render(tree('/loop?audience=professional')); await openTab('My CV & experience');
    expect(screen.getByLabelText('My situation')).toHaveValue('professional');
    expect(screen.getByLabelText('CV page preference')).toHaveValue('2');
    expect(screen.getByLabelText('Explicit experience years (optional)')).toHaveValue(null);
    expect(screen.getByLabelText('Target roles')).toHaveValue('');
    expect(screen.getByLabelText(/Keep my search discreet/)).toBeChecked();
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: '+ Operations manager' }));
    expect(screen.getByLabelText('Target roles')).toHaveValue('Operations manager');
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'save_profile')).toBe(false);
  });
  it('keeps an existing career record rather than replacing it with a landing-page preference', async () => {
    render(tree('/loop?audience=professional')); await openTab('My CV & experience');
    expect(screen.getByLabelText('My situation')).toHaveValue('student');
    expect(screen.getByLabelText('My name')).toHaveValue('Fictional Casey');
  });
  it('preserves unsaved claim wording while moving between workspace sections', async () => {
    render(tree()); await openTab('My CV & experience'); const user = userEvent.setup();
    await user.click(screen.getByText(/Developed Python reports for a fictional university project using synthetic data\. Assisted/, { selector: 'summary' }));
    const wording = screen.getAllByLabelText('Wording I can substantiate').find(element => (element as HTMLTextAreaElement).value === cv)!;
    await user.clear(wording); await user.type(wording, 'Synthetic unsaved contribution.');
    await openTab('Opportunities'); await openTab('My CV & experience');
    expect(screen.getAllByLabelText('Wording I can substantiate').some(element => (element as HTMLTextAreaElement).value === 'Synthetic unsaved contribution.')).toBe(true);
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'save_claim')).toBe(false);
  });
  it('recovers same-owner record and claim drafts after navigating away without retaining consent', async () => {
    const view = render(tree()); await openTab('My CV & experience'); const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Target roles')); await user.type(screen.getByLabelText('Target roles'), 'Synthetic second role');
    await user.click(screen.getByText(/Developed Python reports for a fictional university project using synthetic data\. Assisted/, { selector: 'summary' }));
    const wording = screen.getAllByLabelText('Wording I can substantiate').find(element => (element as HTMLTextAreaElement).value === cv)!;
    await user.clear(wording); await user.type(wording, 'Synthetic route draft.'); view.unmount();
    render(tree()); await openTab('My CV & experience');
    expect(screen.getByLabelText('Target roles')).toHaveValue('Synthetic second role');
    expect(screen.getAllByLabelText('Wording I can substantiate').some(element => (element as HTMLTextAreaElement).value === 'Synthetic route draft.')).toBe(true);
    expect(screen.getByLabelText(/Save this reviewed text and profile privately/)).not.toBeChecked();
    expect(mocks.call.mock.calls.some(([,action]) => ['save_profile','save_claim'].includes(action.action))).toBe(false);
  });
  it('shows recorded actors without converting document preparation into an application', async () => {
    current.activity = [{ id: 'event-a', kind: 'packet_prepared', actor: 'jobvance', at: profile.updatedAt, summary: 'Fictional document prepared; not submitted.', opportunityId: null, runId: 'run-a' }, { id: 'event-b', kind: 'profile_saved', actor: 'candidate', at: profile.updatedAt, summary: 'Fictional record saved.', opportunityId: null, runId: null }];
    render(tree()); expect(await screen.findByRole('heading', { name: 'Activity & decisions' })).toBeInTheDocument();
    expect(screen.getByText('Fictional document prepared; not submitted.')).toBeInTheDocument(); expect(screen.getByText('Fictional record saved.')).toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'update_opportunity')).toBe(false);
  });
  it('requires explicit recurring consent and sends a rules-only schedule', async () => {
    current.capabilities.scheduler = true; current.schedule = null; render(tree()); const user = userEvent.setup();
    const enable = await screen.findByRole('button', { name: 'Enable recurring preparation' }); expect(enable).toBeDisabled();
    await user.click(screen.getByLabelText(/I opt into recurring source-based preparation/)); await user.click(enable);
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'save_schedule', expectedGeneration: 0, expectedScheduleVersion: 0, schedule: { cadence: 'weekdays', timezone: 'Asia/Dubai', localTime: '08:00', weeklyDay: null, provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false }, recurringConsent: true }));
  });
  it('requires private-saving consent and keeps target text usable without local persistence', async () => {
    const store = vi.spyOn(Storage.prototype, 'setItem'); render(tree()); await openTab('My CV & experience'); const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Target roles')); await user.type(screen.getByLabelText('Target roles'), 'Product analyst\nData analyst');
    expect(screen.getByLabelText('Target roles')).toHaveValue('Product analyst\nData analyst');
    expect(screen.getByRole('button', { name: 'Save career record' })).toBeDisabled();
    await user.click(screen.getByLabelText(/Save this reviewed text and profile privately/)); await user.click(screen.getByRole('button', { name: 'Save career record' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', expect.objectContaining({ action: 'save_profile', saveConsent: true, profile: expect.objectContaining({ targetTitles: ['Product analyst', 'Data analyst'], sourceText: cv, experienceYears: null, compensation: { currency: '', period: 'annual', minimum: null } }) })));
    expect(store).not.toHaveBeenCalled(); expect(mocks.call.mock.calls.some(([, action]) => action.action === 'start_run')).toBe(false);
  });
  it('does not approve imported suggestions or silently label their evidence context', async () => {
    render(tree()); await openTab('My CV & experience'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Suggest literal passages' }));
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
  it('previews the exact saved PDF before approval without approving or downloading it', async () => {
    current.packets = [{ ...packet, artifacts: { pdf: { path: 'owner-a/packet-a/cv.pdf', sha256: 'synthetic-hash', byteSize: 100 } } }];
    render(tree()); await openTab('Prepared CVs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ }));
    await user.click(screen.getByRole('button', { name: 'Open exact PDF preview' }));
    expect(await screen.findByTitle('Exact saved CV PDF preview')).toHaveAttribute('src', 'blob:synthetic-loop-preview');
    expect(mocks.preview).toHaveBeenCalledWith('owner-a', 'packet-a', 'exact-server-hash', expect.any(AbortSignal));
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.call.mock.calls.some(([, action]) => action.action === 'approve_packet')).toBe(false);
  });
  it('clears a cached PDF when the server revokes the packet after a vacancy-only change', async () => {
    current.packets = [{ ...packet, artifacts: { pdf: { path: 'owner-a/packet-a/cv.pdf', sha256: 'synthetic-hash', byteSize: 100 } } }];
    render(tree()); await openTab('Prepared CVs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ })); await user.click(screen.getByRole('button', { name: 'Open exact PDF preview' }));
    expect(await screen.findByTitle('Exact saved CV PDF preview')).toBeInTheDocument();
    current = { ...current, recordVersion: 2, packets: [{ ...current.packets[0], status: 'revoked' }] };
    await user.click(screen.getByRole('button', { name: 'Refresh records' }));
    await waitFor(() => expect(screen.queryByTitle('Exact saved CV PDF preview')).not.toBeInTheDocument());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-loop-preview');
    expect(screen.getByRole('button', { name: 'Open exact PDF preview' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve exact packet' })).toBeDisabled();
  });
  it('keeps ready Word and text formats available when the approved PDF cannot meet its page preference', async () => {
    current.packets = [{ ...packet, status: 'approved', pageCount: 3, formatStatus: { pdf: { ready: false, reason: 'PAGE_TARGET_EXCEEDED', pageCount: 3 }, docx: { ready: true }, txt: { ready: true } } }];
    render(tree()); await openTab('Prepared CVs'); await userEvent.setup().click(screen.getByRole('button', { name: /Graduate analyst/ }));
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download DOCX' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    expect(screen.getByText(/Other ready formats remain available/)).toBeInTheDocument();
  });
  it('suppresses an exact preview returned after the account changes', async () => {
    current.packets = [{ ...packet, artifacts: { pdf: { path: 'owner-a/packet-a/cv.pdf', sha256: 'synthetic-hash', byteSize: 100 } } }];
    let finish!: (result: { blob: Blob; filename: string }) => void; mocks.preview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = render(tree()); await openTab('Prepared CVs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ })); await user.click(screen.getByRole('button', { name: 'Open exact PDF preview' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
    await act(async () => { mocks.user = { id: 'owner-b' }; current = { ...snapshot(), profile: null, claims: [], packets: [] }; view.rerender(tree()); });
    await act(async () => { finish({ blob: new Blob(['%PDF-fictional']), filename: 'fictional-preview.pdf' }); });
    expect(screen.queryByTitle('Exact saved CV PDF preview')).not.toBeInTheDocument(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('requires both factual and disclosure review for the exact source-controlled packet', async () => {
    current.packets = [{ ...packet }]; render(tree()); await openTab('Prepared CVs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ }));
    expect(screen.getByLabelText('CV text for factual review')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Approve exact packet' })).toBeDisabled(); await user.click(screen.getByLabelText(/I reviewed the complete CV and evidence/));
    expect(screen.getByRole('button', { name: 'Approve exact packet' })).toBeDisabled(); await user.click(screen.getByLabelText(/The final document and its figures/));
    await user.click(screen.getByRole('button', { name: 'Approve exact packet' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'approve_packet', packetId: packet.id, inputHash: packet.inputHash, reviewedText: cv, confirmFacts: true, confirmDisclosure: true }));
  });
  it('blocks downloads when an apparently approved packet refers to a withdrawn claim', async () => {
    current.claims[0].status = 'withdrawn'; current.packets = [{ ...packet, status: 'approved' }]; render(tree()); await openTab('Prepared CVs'); await userEvent.setup().click(screen.getByRole('button', { name: /Graduate analyst/ }));
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled(); expect(screen.getByText(/does not match the current cleared record/)).toBeInTheDocument(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('does not present an approved status as download readiness when the measured document exceeds the page preference', async () => {
    current.packets = [{ ...packet, status: 'approved', pageCount: 3 }]; render(tree()); await openTab('Prepared CVs'); await userEvent.setup().click(screen.getByRole('button', { name: /Graduate analyst/ }));
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
    mocks.download.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const view = render(tree()); await openTab('Prepared CVs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ })); await user.click(screen.getByRole('button', { name: 'Download TXT' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    const signal=mocks.download.mock.calls[0][3] as AbortSignal;expect(signal.aborted).toBe(false);
    await act(async () => { mocks.user = { id: 'owner-b' }; current = { ...snapshot(), profile: null, claims: [], packets: [] }; view.rerender(tree()); });
    expect(signal.aborted).toBe(true);
    await act(async () => { finish({ blob: new Blob([cv]), filename: 'fictional.txt' }); }); expect(mocks.saveBlob).not.toHaveBeenCalled();
  });
  it('cancels an active download when a refresh revokes its packet without changing its input hash',async()=>{
    current.packets=[{...packet,status:'approved'}];
    let finish!:(response:{blob:Blob;filename:string})=>void;
    mocks.download.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    render(tree());await openTab('Prepared CVs');const user=userEvent.setup();await user.click(screen.getByRole('button',{name:/Graduate analyst/}));
    let refreshed!:(response:{snapshot:LoopSnapshot})=>void;
    mocks.call.mockImplementationOnce(()=>new Promise(resolve=>{refreshed=resolve;}));
    await user.click(screen.getByRole('button',{name:'Refresh records'}));
    await user.click(screen.getByRole('button',{name:'Download TXT'}));
    await waitFor(()=>expect(mocks.download).toHaveBeenCalledOnce());
    const signal=mocks.download.mock.calls[0][3] as AbortSignal;expect(signal.aborted).toBe(false);
    const revoked={...current,recordVersion:2,packets:[{...current.packets[0],status:'revoked' as const}]};
    expect(revoked.packets[0].inputHash).toBe(packet.inputHash);
    await act(async()=>{refreshed({snapshot:revoked});});
    expect(signal.aborted).toBe(true);expect(screen.getByRole('button',{name:'Download TXT'})).toBeDisabled();
    // A transport that settles late must still be stopped at the component fence.
    await act(async()=>{finish({blob:new Blob([cv]),filename:'fictional.txt'});});
    expect(mocks.saveBlob).not.toHaveBeenCalled();expect(screen.queryByText('Download requested. This does not send an application.')).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([,action])=>action.action==='cancel_run')).toBe(false);
  });
  it('cancels a private download on unmount and ignores bytes that arrive afterward',async()=>{
    current.packets=[{...packet,status:'approved'}];
    let finish!:(response:{blob:Blob;filename:string})=>void;
    mocks.download.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const view=render(tree());await openTab('Prepared CVs');const user=userEvent.setup();await user.click(screen.getByRole('button',{name:/Graduate analyst/}));await user.click(screen.getByRole('button',{name:'Download TXT'}));
    await waitFor(()=>expect(mocks.download).toHaveBeenCalledOnce());
    const signal=mocks.download.mock.calls[0][3] as AbortSignal;expect(signal.aborted).toBe(false);
    view.unmount();expect(signal.aborted).toBe(true);
    await act(async()=>{finish({blob:new Blob([cv]),filename:'fictional.txt'});});
    expect(mocks.saveBlob).not.toHaveBeenCalled();expect(mocks.call.mock.calls.some(([,action])=>action.action==='cancel_run')).toBe(false);
  });
  it('requires approved attachment and recipient confirmation and reuses an uncertain draft reference', async () => {
    current.gmail = { connected: true, email: 'fictional@example.test', status: 'Connected', allowDrafts: true }; current.capabilities.gmailRead = true; current.capabilities.gmailDrafts = true;
    current.packets = [{ ...packet, status: 'approved', contact: { name: 'Fictional Recruiter', title: 'Recruiter', email: 'recruiter@example.test', sourceUrl: 'https://example.test/fictional', sourceQuote: 'Fictional contact fixture', confirmedByUser: true, inExistingThread: false }, emailSubject: 'Fictional role', emailBody: 'Fictional message, not sent.' }];
    mocks.call.mockImplementation(async (_id, action) => action.action === 'gmail_create_draft' ? { message: 'Draft operation confirmed. Nothing sent.' } : { snapshot: current });
    render(tree()); await openTab('Prepared CVs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ }));
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

describe('private PDF preview transfer lifecycle',()=>{
  it.each(['unmount','owner','hash','packet','current'] as const)('cancels a pending preview on %s change and ignores its late bytes',async change=>{
    const readyPacket={...packet,artifacts:{pdf:{path:'owner-a/packet-a/cv.pdf',sha256:'synthetic-hash',byteSize:100}}};
    let finish!:(response:{blob:Blob;filename:string})=>void;
    mocks.preview.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const view=render(<LoopPacketPreview ownerId="owner-a" packet={readyPacket} current busy={false}/>);
    await userEvent.setup().click(screen.getByRole('button',{name:'Open exact PDF preview'}));
    expect(mocks.preview).toHaveBeenCalledWith('owner-a',packet.id,packet.inputHash,expect.any(AbortSignal));
    const signal=mocks.preview.mock.calls[0][3] as AbortSignal;expect(signal.aborted).toBe(false);
    if(change==='unmount')view.unmount();
    else view.rerender(<LoopPacketPreview ownerId={change==='owner'?'owner-b':'owner-a'} packet={{...readyPacket,id:change==='packet'?'packet-b':packet.id,inputHash:change==='hash'?'replacement-server-hash':packet.inputHash}} current={change!=='current'} busy={false}/>);
    expect(signal.aborted).toBe(true);
    await act(async()=>{finish({blob:new Blob(['%PDF-obsolete']),filename:'obsolete.pdf'});});
    expect(URL.createObjectURL).not.toHaveBeenCalled();expect(screen.queryByTitle('Exact saved CV PDF preview')).not.toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    if(change!=='unmount'&&change!=='current')expect(screen.getByRole('button',{name:'Open exact PDF preview'})).toBeEnabled();
  });
  it('starts a fresh preview for the replacement source while suppressing an old cancellation error',async()=>{
    const readyPacket={...packet,artifacts:{pdf:{path:'owner-a/packet-a/cv.pdf',sha256:'synthetic-hash',byteSize:100}}};
    let failOld!:(error:Error)=>void;
    mocks.preview.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{failOld=reject;}));
    const view=render(<LoopPacketPreview ownerId="owner-a" packet={readyPacket} current busy={false}/>);const user=userEvent.setup();
    await user.click(screen.getByRole('button',{name:'Open exact PDF preview'}));
    const oldSignal=mocks.preview.mock.calls[0][3] as AbortSignal;
    view.rerender(<LoopPacketPreview ownerId="owner-a" packet={{...readyPacket,inputHash:'replacement-server-hash'}} current busy={false}/>);
    expect(oldSignal.aborted).toBe(true);await user.click(screen.getByRole('button',{name:'Open exact PDF preview'}));
    expect(mocks.preview).toHaveBeenLastCalledWith('owner-a',packet.id,'replacement-server-hash',expect.any(AbortSignal));
    expect(await screen.findByTitle('Exact saved CV PDF preview')).toHaveAttribute('src','blob:synthetic-loop-preview');
    await act(async()=>{failOld(Object.assign(new Error('The document download was cancelled.'),{name:'AbortError'}));});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByTitle('Exact saved CV PDF preview')).toBeInTheDocument();
  });
});

describe('support receipts and scoped self-service erasure', () => {
  it.each([1, 7])('keeps confirmed erasure reachable from generation %s without automatically erasing on page visit', async generation => {
    let erased = false;
    mocks.call.mockImplementation(async (_id, action) => {
      if (action.action === 'get' && !erased) return { erasureGeneration: generation };
      if (action.action === 'erase_loop') {
        erased = true;
        current = { ...snapshot(), lifecycleGeneration: generation + 1, recordVersion: 3, profile: null, claims: [], packets: [] };
      }
      return { snapshot: current };
    });
    render(tree());
    expect(await screen.findByRole('heading', { name: 'Finish erasing your Job Loop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prepare today’s applications' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reviewed source CV or career record')).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'erase_loop')).toBe(false);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Review remaining erasure' }));
    const continuation = screen.getByRole('button', { name: 'Continue erasing Job Loop data' });
    expect(continuation).toBeDisabled();
    await user.type(screen.getByLabelText('Type DELETE JOB LOOP to confirm this scope'), 'DELETE JOB LOOP');
    expect(continuation).toBeDisabled();
    await user.click(screen.getByLabelText(/I understand this removes my Job Loop data/));
    await user.click(continuation);

    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'erase_loop', expectedGeneration: generation, confirmErase: true }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Finish erasing your Job Loop' })).not.toBeInTheDocument());
    expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'erase_loop')).toHaveLength(1);
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'erase_self')).toBe(false);
  });
  it('hides a previously loaded private snapshot when refreshing reports pending erasure', async () => {
    render(tree());
    await openTab('My CV & experience');
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(cv);
    mocks.call.mockResolvedValueOnce({ erasureGeneration: 1 });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh records' }));

    expect(await screen.findByRole('heading', { name: 'Finish erasing your Job Loop' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Reviewed source CV or career record')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('CV text for factual review')).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'erase_loop')).toBe(false);
    expect(screen.getByRole('button', { name: 'Review remaining erasure' })).toBeEnabled();
  });
  it('retains the typed scope after a partial erasure batch and permits a deliberate continuation', async () => {
    let attempts = 0;
    mocks.call.mockImplementation(async (_id, action) => {
      if (action.action === 'erase_loop') {
        attempts++;
        if (attempts === 1) throw new LoopServiceError('A cleanup batch completed; more documents remain.', 'LOOP_ERASURE_RETRY');
        current = { ...snapshot(), lifecycleGeneration: 2, recordVersion: 3, profile: null, claims: [], packets: [] };
      }
      return { snapshot: current };
    });
    render(tree());
    await openTab('Help & privacy');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Review Job Loop erasure' }));
    await user.type(screen.getByLabelText('Type DELETE JOB LOOP to confirm this scope'), 'DELETE JOB LOOP');
    await user.click(screen.getByLabelText(/I understand this removes my Job Loop data/));
    await user.click(screen.getByRole('button', { name: 'Erase my Job Loop data' }));

    expect(await screen.findByRole('heading', { name: 'Finish erasing your Job Loop' })).toBeInTheDocument();
    expect(screen.getByLabelText('Type DELETE JOB LOOP to confirm this scope')).toHaveValue('DELETE JOB LOOP');
    expect(screen.getByLabelText(/I understand this removes my Job Loop data/)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue erasing Job Loop data' })).toBeEnabled();
    expect(screen.queryByLabelText('Reviewed source CV or career record')).not.toBeInTheDocument();
    expect(attempts).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Continue erasing Job Loop data' }));
    await waitFor(() => expect(attempts).toBe(2));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Finish erasing your Job Loop' })).not.toBeInTheDocument());
    expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'erase_loop').map(([, action]) => action.expectedGeneration)).toEqual([0, 0]);
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'erase_self')).toBe(false);
  });
  it('does not open erasure recovery for a new owner when a previous owner’s delayed get fails', async () => {
    let rejectOld!: (error: Error) => void;
    mocks.call.mockImplementation((ownerId, action) => ownerId === 'owner-a' && action.action === 'get'
      ? new Promise((_resolve, reject) => { rejectOld = reject; })
      : Promise.resolve({ snapshot: current }));
    const view = render(tree());
    await waitFor(() => expect(rejectOld).toBeDefined());
    await act(async () => {
      mocks.user = { id: 'owner-b' };
      current = { ...snapshot(), profile: null, claims: [], packets: [] };
      view.rerender(tree());
    });
    await screen.findByRole('button', { name: /Import or paste my CV/ });
    await act(async () => { rejectOld(new LoopServiceError('OWNER_A_PRIVATE_ERASURE_STATE', 'LOOP_ERASURE_IN_PROGRESS')); });

    expect(screen.queryByRole('heading', { name: 'Finish erasing your Job Loop' })).not.toBeInTheDocument();
    expect(screen.queryByText('OWNER_A_PRIVATE_ERASURE_STATE')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review remaining erasure' })).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'erase_loop')).toBe(false);
  });
  it('stores a private request with an actual service receipt and an unreviewed status', async () => {
    current.support = []; mocks.call.mockImplementation(async (_id, action) => { if (action.action === 'request_support') current.support = [{ id: 'synthetic-receipt-a', category: action.category, message: action.message, status: 'received', createdAt: profile.updatedAt }]; return { snapshot: current }; });
    render(tree()); await openTab('Help & privacy'); const user = userEvent.setup(); await user.type(screen.getByLabelText('What do you need help with?'), 'Synthetic download problem; no real personal data.');
    await user.click(screen.getByRole('button', { name: 'Save private support request' }));
    expect(await screen.findByText(/Reference synthetic-receipt-a/)).toBeInTheDocument(); expect(screen.getByText('received')).toBeInTheDocument();
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'request_support', expectedGeneration: 0, category: 'help', message: 'Synthetic download problem; no real personal data.' });
  });
  it('requires a typed scope and explicit confirmation before erasing only Job Loop data', async () => {
    render(tree()); await openTab('Help & privacy'); const user = userEvent.setup();
    expect(mocks.call.mock.calls.some(([,action]) => action.action === 'erase_loop')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Review Job Loop erasure' }));
    const erase = screen.getByRole('button', { name: 'Erase my Job Loop data' }); expect(erase).toBeDisabled();
    await user.type(screen.getByLabelText('Type DELETE JOB LOOP to confirm this scope'), 'DELETE JOB LOOP'); expect(erase).toBeDisabled();
    await user.click(screen.getByLabelText(/I understand this removes my Job Loop data/)); await user.click(erase);
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'erase_loop', expectedGeneration: 0, confirmErase: true }));
    expect(mocks.call.mock.calls.some(([,action]) => action.action === 'erase_self')).toBe(false);
  });
  it('keeps a follow-up as a calendar date instead of inventing a UTC noon deadline', async () => {
    current.opportunities = [{ id: 'opportunity-a', title: 'Fictional role', company: 'Fictional company', location: 'Dubai', description: cv, url: 'https://example.test/role', contact: null, source: 'manual', sourceKey: 'synthetic', checkedAt: profile.updatedAt, verification: 'user_provided', status: 'saved', followUpAt: null, notes: '' }];
    render(tree()); await openTab('Opportunities'); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Follow-up date'), '2026-10-15'); await user.click(screen.getByRole('button', { name: 'Save tracking update' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', expect.objectContaining({ action: 'update_opportunity', followUpAt: '2026-10-15' })));
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
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'gmail_preview', expectedGeneration: 0, ticket: 'synthetic-sealed-ticket' });
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
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'gmail_finalize', expectedGeneration: 0, ticket, confirmMailbox: true }));
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
    render(tree()); await openTab('Prepared CVs'); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /Graduate analyst/ })); await user.click(screen.getByLabelText(/I checked the recipient, reviewed the message/));
    expect(screen.getByRole('button', { name: 'Create Gmail draft' })).toBeDisabled(); expect(mocks.call.mock.calls.some(([, action]) => action.action === 'gmail_create_draft')).toBe(false);
  });
});

describe('same-owner Job Loop lifetime changes', () => {
  it('does not restore an older lifetime draft when the same owner returns to a newly created workspace', async () => {
    current.lifecycleGeneration = 7;
    const view = render(tree());
    await openTab('My CV & experience');
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Target roles'));
    await user.click(screen.getByLabelText('Target roles'));
    await user.paste('OLD_LIFETIME_ROUTE_DRAFT');
    expect(recoverLoopWorkingDraft('owner-a', 7)).not.toBeNull();
    view.unmount();

    current = { ...snapshot(), lifecycleGeneration: 9, recordVersion: 3,
      profile: { ...profile, targetTitles: ['Fresh workspace target'] } };
    render(tree());
    await openTab('My CV & experience');

    expect(screen.getByLabelText('Target roles')).toHaveValue('Fresh workspace target');
    expect(screen.queryByDisplayValue('OLD_LIFETIME_ROUTE_DRAFT')).not.toBeInTheDocument();
    expect(recoverLoopWorkingDraft('owner-a', 9)).toBeNull();
    expect(screen.getByLabelText(/Save this reviewed text and profile privately/)).not.toBeChecked();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'save_profile')).toBe(false);
  });

  it('clears unsent support text and an earlier erasure confirmation when a fresh active lifetime is loaded', async () => {
    current.lifecycleGeneration = 7;
    render(tree());
    await openTab('Help & privacy');
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('What do you need help with?'));
    await user.paste('OLD_LIFETIME_UNSENT_SUPPORT_MESSAGE');
    await user.selectOptions(screen.getByLabelText('Request type'), 'privacy');
    await user.click(screen.getByRole('button', { name: 'Review Job Loop erasure' }));
    await user.type(screen.getByLabelText('Type DELETE JOB LOOP to confirm this scope'), 'DELETE JOB LOOP');
    await user.click(screen.getByLabelText(/I understand this removes my Job Loop data/));
    expect(screen.getByRole('button', { name: 'Erase my Job Loop data' })).toBeEnabled();

    current = { ...snapshot(), lifecycleGeneration: 9, recordVersion: 3 };
    await user.click(screen.getByRole('button', { name: 'Refresh records' }));
    await waitFor(() => expect(screen.getByLabelText('What do you need help with?')).toHaveValue(''));
    expect(screen.getByLabelText('Request type')).toHaveValue('help');
    expect(screen.queryByLabelText('Type DELETE JOB LOOP to confirm this scope')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review Job Loop erasure' }));
    expect(screen.getByLabelText('Type DELETE JOB LOOP to confirm this scope')).toHaveValue('');
    expect(screen.getByLabelText(/I understand this removes my Job Loop data/)).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Erase my Job Loop data' })).toBeDisabled();
    expect(mocks.call.mock.calls.some(([, action]) => ['request_support', 'erase_loop'].includes(action.action))).toBe(false);
  });

  it('clears old source and claim edits plus storage, model and inbox consent when a fresh lifetime is loaded', async () => {
    current.lifecycleGeneration = 7;
    current.models = [{ provider: 'openai', model: 'configured-gpt-fixture', label: 'Configured local model fixture', ready: true, inputUsdPerMillion: 1, outputUsdPerMillion: 1 }];
    current.gmail = { connected: true, email: 'local-mailbox@example.test', status: 'Connected', allowDrafts: false };
    current.capabilities.gmailRead = true;
    render(tree());
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Prepare today’s applications' });
    await user.selectOptions(screen.getByLabelText('Preparation provider'), 'openai');
    await user.click(screen.getByLabelText(/Allow this run’s active, confirmed and shareable/));
    await user.click(screen.getByLabelText(/For this run, check the connected recruitment messages/));
    await openTab('My CV & experience');
    const source = screen.getByLabelText('Reviewed source CV or career record');
    const sourceDetails = source.closest('details')!;
    if (!sourceDetails.open) await user.click(sourceDetails.querySelector('summary')!);
    await user.clear(source);
    await user.click(source);
    await user.paste(cv + '\nOLD_UNSAVED_SOURCE_WORDING');
    await user.click(screen.getByText(/Developed Python reports for a fictional university project using synthetic data\. Assisted/, { selector: 'summary' }));
    const wording = screen.getAllByLabelText('Wording I can substantiate').find(element => (element as HTMLTextAreaElement).value === cv)!;
    await user.clear(wording);
    await user.click(wording);
    await user.paste('OLD_UNSAVED_CLAIM_WORDING from a previous workspace lifetime.');
    await user.click(screen.getByLabelText(/Save this reviewed text and profile privately/));
    expect(recoverLoopWorkingDraft('owner-a', 7)).not.toBeNull();

    const freshSource = 'Fresh workspace source record. Prepared reporting notes for a different reviewed university project. No previous workspace text is retained.';
    current = { ...current, lifecycleGeneration: 9, recordVersion: 3,
      profile: { ...profile, name: 'Fresh workspace fixture', sourceText: freshSource },
      claims: [{ ...claim, id: 'fresh-claim', sourceQuote: freshSource, phrasing: freshSource, context: 'Fresh university project' }], packets: [], opportunities: [] };
    await user.click(screen.getByRole('button', { name: 'Refresh records' }));

    await waitFor(() => expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(freshSource));
    expect(screen.getAllByLabelText('Wording I can substantiate').every(element => !(element as HTMLTextAreaElement).value.includes('OLD_UNSAVED_CLAIM_WORDING'))).toBe(true);
    expect(screen.getByLabelText(/Save this reviewed text and profile privately/)).not.toBeChecked();
    expect(recoverLoopWorkingDraft('owner-a', 9)).toBeNull();
    await openTab('Today');
    expect(screen.getByLabelText(/Allow this run’s active, confirmed and shareable/)).not.toBeChecked();
    expect(screen.getByLabelText(/For this run, check the connected recruitment messages/)).not.toBeChecked();
    expect(mocks.call.mock.calls.some(([, action]) => ['save_profile', 'save_claim', 'start_run'].includes(action.action))).toBe(false);
  });

  it('starts a new request reference with the new generation rather than reusing an uncertain earlier request', async () => {
    current.lifecycleGeneration = 7;
    let starts = 0;
    mocks.call.mockImplementation(async (_id, action) => {
      if (action.action === 'start_run' && ++starts === 1) throw new LoopServiceError('Local uncertain preparation fixture.', 'LOOP_PROVIDER_UNCERTAIN');
      return { snapshot: current };
    });
    render(tree());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Prepare today’s applications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('uncertain preparation');
    current = { ...snapshot(), lifecycleGeneration: 9, recordVersion: 3 };
    await user.click(screen.getByRole('button', { name: 'Refresh records' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare today’s applications' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Prepare today’s applications' }));

    await waitFor(() => expect(mocks.call.mock.calls.filter(([, action]) => action.action === 'start_run')).toHaveLength(2));
    const requests = mocks.call.mock.calls.filter(([, action]) => action.action === 'start_run').map(([, action]) => action);
    expect(requests.map(action => action.expectedGeneration)).toEqual([7, 9]);
    expect(requests[0].requestId).not.toBe(requests[1].requestId);
  });

  it('ignores a delayed mailbox preview from an earlier lifetime of the same signed-in account', async () => {
    current.lifecycleGeneration = 7;
    current.capabilities.gmailRead = true;
    window.history.replaceState(null, '', '/loop#gmail_ticket=local-previous-lifetime-ticket');
    let finishPreview!: (result: unknown) => void;
    mocks.call.mockImplementation(async (_id, action) => action.action === 'gmail_preview'
      ? new Promise(resolve => { finishPreview = resolve; }) : { snapshot: current });
    render(tree());
    await waitFor(() => expect(finishPreview).toBeDefined());
    expect(mocks.call).toHaveBeenCalledWith('owner-a', { action: 'gmail_preview', ticket: 'local-previous-lifetime-ticket', expectedGeneration: 7 });
    current = { ...snapshot(), lifecycleGeneration: 9, recordVersion: 3, profile: null, claims: [], packets: [] };
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh records' }));
    await screen.findByRole('button', { name: /Import or paste my CV/ });
    await act(async () => { finishPreview({ gmailPreview: { email: 'OLD_LIFETIME_MAILBOX@example.test', allowDrafts: true, expiresAt: new Date(Date.now() + 60000).toISOString() } }); });

    expect(screen.queryByText('OLD_LIFETIME_MAILBOX@example.test')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm this mailbox' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Confirm the returned Gmail mailbox' })).not.toBeInTheDocument();
    expect(mocks.call.mock.calls.some(([, action]) => action.action === 'gmail_finalize')).toBe(false);
  });
});
