import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
import Workspace from '@/pages/Workspace';
import JobLoop from '@/pages/JobLoop';
import { clearCheckRecovery, rememberCheckRecovery, readCheckRecovery } from '@/lib/check-draft';
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import type { FreeCvCheck } from '@/lib/free-check-api';
import type { ApplicationPack, TrackedApplication } from '@/lib/cv-database';
import type { LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom'); vi.unmock('@tanstack/react-query');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'owner-a' } as { id: string } | null, loading: false, authError: null as string | null }, list: vi.fn(), load: vi.fn(), loop: vi.fn(), save: vi.fn(), tracker: vi.fn(), download: vi.fn(), blob: vi.fn(), preview: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null, supabase: {} }));
vi.mock('@/pages/Auth', () => ({ default: () => <p>Local account form</p> }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list, saveFreeCheck: mocks.save, deleteFreeCheck: vi.fn() }));
vi.mock('@/lib/workspace-api', async original => ({ ...(await original<typeof import('@/lib/workspace-api')>()), loadWorkspace: mocks.load, addApplication: mocks.tracker }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.loop, loadLoopSavedCvs: vi.fn(async () => []), getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), isLoopHttpsUrl: (value: string) => value.startsWith('https://'), safeLoopGmailUrl: (value: string) => value }));
vi.mock('@/lib/cv-legacy', () => ({ listLegacyCvs: vi.fn(async () => []), downloadLegacyCv: vi.fn() }));
vi.mock('@/lib/document-download', async original => ({ ...(await original<typeof import('@/lib/document-download')>()), downloadBlob: mocks.download }));
vi.mock('@/lib/free-check-export', async original => ({ ...(await original<typeof import('@/lib/free-check-export')>()), createFreeCheckCvBlob: mocks.blob }));
// The download stage previews the PDF automatically; keep that local (no font fetch).
vi.mock('@/lib/document-export', async original => ({ ...(await original<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview }));

const id = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const source = 'Local Candidate\r\nEXPERIENCE\r\nPrepared monthly reporting definitions and explained Excel reports to colleagues.\r\nPRIVATE_REMOVED_FROM_FINAL';
const finalText = source.replace('\r\nPRIVATE_REMOVED_FROM_FINAL', '\r\nAn exact reviewed contribution.  ');
const vacancy = 'Prepare monthly Excel reports, explain reporting definitions to colleagues and coordinate the monthly reporting checklist with the operations team.';
const draft = { jobTitle: 'Unsaved local role', company: 'Original local company', sourceText: source, reviewedText: finalText + '\nUNSAVED_EDIT_TO_PRESERVE', jobDescription: vacancy };
function saved(): FreeCvCheck { return { id, user_id: 'owner-a', request_id: id, job_title: 'Exact saved role', company: 'Saved company', original_text: source, reviewed_text: finalText, job_description: vacancy, method_version: 'fixture-method', status: 'approved', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z' }; }
function pack(): ApplicationPack { return { id, user_id: 'owner-a', request_id: id, resume_id: null, job_title: 'Exact saved pack', company: 'Saved company', job_url: null, job_description: vacancy, original_text: source, tailored_text: finalText, matched_keywords: [], missing_keywords: [], status: 'approved', created_at: '2026-10-15T00:00:00Z' }; }
function tracker(): TrackedApplication { return { id: other, user_id: 'owner-a', pack_id: null, job_title: 'Unrelated tracking row', company: '', job_url: null, status: 'saved', notes: 'OTHER_RECORD_NOTE', applied_at: null, follow_up_at: null, created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z' }; }
function snapshot(): LoopSnapshot { return { lifecycleGeneration: 8, recordVersion: 1, profile: null, claims: [], opportunities: [{ id, title: 'Current lifetime vacancy', company: 'Local company', location: '', url: 'https://example.invalid/job', description: vacancy, source: 'manual', sourceKey: 'local', checkedAt: '2026-10-15T00:00:00Z', verification: 'user_provided', status: 'saved', notes: 'CURRENT_LIFETIME_NOTE', followUpAt: null, contact: null }], packets: [], runs: [], inbox: [], models: [], capabilities: { cloudWorker: false, rulesEngine: false, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 1 }, gmail: { connected: false, email: null, allowDrafts: false, status: 'Not connected' } }; }
// One confirmation approves; it is enabled once the automatic PDF preview settles.
const confirmBox = () => screen.getByLabelText(/I have checked this CV/) as HTMLInputElement;
async function approve() { await waitFor(() => expect(confirmBox()).toBeEnabled()); fireEvent.click(confirmBox()); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(pass => { resolve = pass; }); return { promise, resolve }; }
let client: QueryClient;
function tree(component: React.ReactNode, path: string) { return <HelmetProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{component}<Link to={`/dashboard?pack=${other}`}>Open a missing pack</Link></MemoryRouter></QueryClientProvider></HelmetProvider>; }
beforeEach(() => { vi.clearAllMocks(); clearCheckRecovery(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a'); mocks.auth.user = { id: 'owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null; mocks.list.mockReset().mockResolvedValue([saved()]); mocks.loop.mockReset().mockResolvedValue({ snapshot: snapshot() }); mocks.load.mockReset().mockResolvedValue({ cvs: [], packs: [pack()], applications: [tracker()], entitlement: null, entitlementError: null }); mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), pageCount: 1 }); client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20000 } } }); });
afterEach(() => { cleanup(); client.clear(); clearCheckRecovery(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe('independent exact application source review', () => {
  it('keeps a recovered draft until explicit replacement, requires fresh approval and can undo exact wording', async () => {
    rememberCheckRecovery({ draft, ownerId: 'owner-a', step: 6, cvReady: true, filename: 'local.txt', pageTarget: 2, reviewStarted: true }, false);
    render(tree(<CvCheck />, `/check?savedCheck=${id}`));
    const review = await screen.findByRole('button', { name: 'Review selected saved check' });
    expect(readCheckRecovery('owner-a')?.value.draft).toEqual(draft);
    fireEvent.click(review);
    expect(screen.getByRole('button', { name: 'Replace current draft and open saved check' })).toBeInTheDocument();
    expect(readCheckRecovery('owner-a')?.value.draft).toEqual(draft);
    fireEvent.click(screen.getByRole('button', { name: 'Replace current draft and open saved check' }));
    expect(readCheckRecovery('owner-a')?.value.draft.reviewedText).toBe(finalText);
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(confirmBox()).not.toBeChecked();
    // Undo waits for the automatic PDF preview of the replaced text to settle.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo source replacement' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Undo source replacement' }));
    expect(readCheckRecovery('owner-a')?.value.draft).toEqual(draft);
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.tracker).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('withdraws replacement permission after a current-draft edit', async () => {
    rememberCheckRecovery({ draft, ownerId: 'owner-a', step: 1, cvReady: true, filename: '', pageTarget: 2, reviewStarted: true }, false);
    render(tree(<CvCheck />, `/check?savedCheck=${id}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Review selected saved check' }));
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Edited after replacement prompt' } });
    expect(screen.queryByRole('button', { name: 'Replace current draft and open saved check' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review selected saved check' })).toBeInTheDocument();
    expect(readCheckRecovery('owner-a')?.value.draft.jobTitle).toBe('Edited after replacement prompt');
  });
  it('requires a fresh approval after A to B to A even when React sees the same final owner', async () => {
    const view = render(tree(<CvCheck />, `/check?savedCheck=${id}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Review selected saved check' }));
    await approve();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    mocks.list.mockResolvedValue([]);
    await act(async () => { setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a'); view.rerender(tree(<CvCheck />, `/check?savedCheck=${id}`)); });
    const download = screen.queryByRole('button', { name: 'Download TXT' });
    if (download) expect(download).toBeDisabled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('cannot adopt an earlier A lifetime delayed saved-check list after returning to A', async () => {
    const old = deferred<FreeCvCheck[]>();
    mocks.list.mockReturnValueOnce(old.promise).mockResolvedValue([]);
    const view = render(tree(<CvCheck />, `/check?savedCheck=${id}`));
    await act(async () => { setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a'); view.rerender(tree(<CvCheck />, `/check?savedCheck=${id}`)); });
    await screen.findByText(/This saved check is no longer available in this account/);
    await act(async () => { old.resolve([{ ...saved(), job_title: 'OLD_A_PRIVATE_CHECK_TITLE' }]); });
    expect(screen.queryByText('OLD_A_PRIVATE_CHECK_TITLE')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review selected saved check' })).not.toBeInTheDocument();
  });
  it('hides a newly mounted check if SDK authority has revoked the still-stale React owner', () => {
    rememberCheckRecovery({ draft, ownerId: 'owner-a', step: 6, cvReady: true, filename: '', pageTarget: 2, reviewStarted: true }, false);
    // AuthProvider revokes the old authority synchronously; its React context
    // update can commit later. A route mount in this interval must fail closed.
    setTrackingDraftOwner('owner-b');
    render(tree(<CvCheck />, `/check?savedCheck=${id}`));
    expect(screen.queryAllByText(/UNSAVED_EDIT_TO_PRESERVE/)).toHaveLength(0);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('does not start a delayed private download after synchronous SDK revocation before React updates', async () => {
    const pending = deferred<Blob>(); mocks.blob.mockReturnValueOnce(pending.promise);
    render(tree(<CvCheck />, `/check?savedCheck=${id}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Review selected saved check' }));
    await approve();
    fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }));
    await act(async () => { setTrackingDraftOwner('owner-b'); pending.resolve(new Blob(['LOCAL_PRIVATE_DOCUMENT'])); });
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('does not retain a prior exact pack review when the selected ID becomes missing', async () => {
    render(tree(<Workspace />, `/dashboard?pack=${id}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Review selected CV' }));
    expect(screen.getByText('Review: Exact saved pack')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Open a missing pack' }));
    await screen.findByText(/This application is no longer available in this account/);
    expect(screen.queryByText('Review: Exact saved pack')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
  });
  it('opens a normal saved pack when choosing it changes the tab URL, and keeps it through ordinary tab navigation', async () => {
    render(tree(<Workspace />, '/dashboard?tab=tailor&from=local-navigation-fixture'));
    fireEvent.click(await screen.findByRole('button', { name: /Exact saved pack.*Approved — open & download/ }));
    expect(screen.getByText('Review: Exact saved pack')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Applications' }));
    expect(screen.queryByText('Review: Exact saved pack')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tailor & download' }));
    expect(screen.getByText('Review: Exact saved pack')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
  });
  it('does not display another tracking row for an absent exact tracker', async () => {
    render(tree(<Workspace />, `/dashboard?tracked=${id}`));
    await screen.findByText(/This application is no longer available in this account/);
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('OTHER_RECORD_NOTE')).not.toBeInTheDocument();
  });
  it('does not let a cached prior A lifetime reopen the exact pack while a fresh A read is pending', async () => {
    const view = render(tree(<Workspace />, `/dashboard?pack=${id}`));
    await screen.findByRole('button', { name: 'Review selected CV' });
    const fresh = deferred<Awaited<ReturnType<typeof mocks.load>>>(); mocks.load.mockReturnValueOnce(fresh.promise);
    await act(async () => { setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a'); view.rerender(tree(<Workspace />, `/dashboard?pack=${id}`)); });
    expect(screen.queryByRole('button', { name: 'Review selected CV' })).not.toBeInTheDocument();
    await act(async () => { fresh.resolve({ cvs: [], packs: [], applications: [], entitlement: null, entitlementError: null }); });
    await screen.findByText(/This application is no longer available in this account/);
  });
  it('never shows current-lifetime tracking or output controls for an earlier Loop generation link', async () => {
    render(tree(<JobLoop />, `/loop?opportunity=${id}&generation=7`));
    await screen.findByText(/This link belongs to an earlier Job Loop record/);
    expect(screen.queryByLabelText('My application notes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review document attempt/ })).not.toBeInTheDocument();
    expect(mocks.loop.mock.calls.every(([, action]) => action.action === 'get')).toBe(true);
  });
});
