import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import ApplicationsHome, { readApplicationHomePacks, readApplicationHomeTrackers } from '@/pages/ApplicationsHome';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import type { ApplicationPack, TrackedApplication } from '@/lib/cv-database';
import type { FreeCvCheck } from '@/lib/free-check-api';

vi.unmock('react-router-dom');

const mocks = vi.hoisted(() => ({ checks: vi.fn(), loop: vi.fn(), from: vi.fn(), owner: vi.fn(), retry: vi.fn() }));
let auth: { user: { id: string } | null; loading: boolean; authError: string | null };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ ...auth, retryConnection: mocks.retry }) }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.checks }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.loop }));
vi.mock('@/lib/cv-database', () => ({ mvpSupabase: { auth: { getUser: mocks.owner }, from: mocks.from } }));
const id = '11111111-1111-4111-8111-111111111111', packId = '22222222-2222-4222-8222-222222222222', trackedId = '33333333-3333-4333-8333-333333333333';
const date = '2026-10-15T10:00:00Z';
let packs: ApplicationPack[], trackers: TrackedApplication[];
let packRead: () => Promise<{ data: ApplicationPack[]; error: unknown }>;
let trackerRead: () => Promise<{ data: TrackedApplication[]; error: unknown }>;
const check = (extra: Partial<FreeCvCheck> = {}): FreeCvCheck => ({ id, user_id: 'owner-a', request_id: id, job_title: 'Operations Analyst', company: 'Check Employer', job_description: 'Exact check vacancy requirements', original_text: 'PRIVATE_ORIGINAL_REMOVED_FROM_FINAL', reviewed_text: 'EXACT_FINAL_REVIEWED_CV', status: 'approved', method_version: 'test', created_at: date, updated_at: date, ...extra });
const pack = (): ApplicationPack => ({ id: packId, user_id: 'owner-a', resume_id: null, request_id: packId, job_title: 'Finance Associate', company: 'Pack Employer', job_url: 'https://employer.example.invalid/job', job_description: 'Exact pack vacancy text', original_text: 'PACK_ORIGINAL', tailored_text: 'PACK_EXACT_FINAL', matched_keywords: [], missing_keywords: [], status: 'draft', created_at: date });
const tracker = (): TrackedApplication => ({ id: trackedId, user_id: 'owner-a', pack_id: packId, job_title: 'Finance Associate', company: 'Pack Employer', job_url: null, status: 'interview', notes: 'EXACT_TRACKER_NOTES', applied_at: date, follow_up_at: '2026-10-20', created_at: date, updated_at: date });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tree = (url = '/applications') => <HelmetProvider><MemoryRouter initialEntries={[url]}><ApplicationsHome /></MemoryRouter></HelmetProvider>;
async function loaded() { await waitFor(() => expect(screen.getByText('All saved work loaded')).toBeInTheDocument()); }
function list() { return within(screen.getByRole('region', { name: 'Saved applications' })); }
beforeEach(() => {
  vi.clearAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a'); auth = { user: { id: 'owner-a' }, loading: false, authError: null };
  mocks.owner.mockImplementation(async () => ({ data: { user: auth.user }, error: null }));
  packs = [pack()]; trackers = [tracker()]; packRead = async () => ({ data: packs, error: null }); trackerRead = async () => ({ data: trackers, error: null });
  mocks.from.mockImplementation((table: string) => ({ select: vi.fn(() => ({ eq: vi.fn((key: string, owner: string) => { expect(key).toBe('user_id'); expect(owner).toBe(auth.user?.id); return { order: vi.fn(() => table === 'application_packs' ? packRead() : trackerRead()) }; }) })) }));
  mocks.checks.mockResolvedValue([check()]); mocks.loop.mockResolvedValue({ existingState: 'absent' });
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); });

describe('Applications home actual saved work', () => {
  it('focuses and reveals the exact detail only after a deliberate list choice, without refresh auto-scroll', async () => {
    const scroll = vi.fn(); const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      render(tree()); await loaded();
      expect(screen.getByRole('heading', { name: 'Choose an application' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Application details' })).not.toHaveFocus(); expect(scroll).not.toHaveBeenCalled();
      fireEvent.click(list().getByRole('button', { name: /Saved CV check.*Operations Analyst/ }));
      expect(screen.getByRole('region', { name: 'Application details' })).toHaveFocus();
      expect(screen.getByRole('link', { name: 'Open and edit' })).toHaveAttribute('href', `/check?savedCheck=${id}`);
      expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start' });
      fireEvent.click(screen.getByRole('button', { name: 'Refresh applications' })); await loaded();
      expect(scroll).toHaveBeenCalledTimes(1);
    } finally { if (previous) HTMLElement.prototype.scrollIntoView = previous; else delete HTMLElement.prototype.scrollIntoView; }
  });
  it('loads independent real sources and exact details without Loop activation or any writes', async () => {
    render(tree()); await loaded();
    expect(list().getAllByRole('button')).toHaveLength(2);
    expect(mocks.loop).toHaveBeenCalledExactlyOnceWith('owner-a', { action: 'get_existing' });
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['application_packs', 'tracked_applications']);
    expect(screen.getByRole('heading', { name: 'Choose an application' })).toBeInTheDocument();
    fireEvent.click(list().getByRole('button', { name: /Saved CV check.*Operations Analyst/ }));
    const detail = within(screen.getByRole('region', { name: 'Application details' }));
    expect(detail.getByText('Exact check vacancy requirements')).toBeInTheDocument();
    expect(detail.getByText('EXACT_FINAL_REVIEWED_CV')).toBeInTheDocument();
    expect(detail.getByRole('link', { name: 'Open and edit' })).toHaveAttribute('href', `/check?savedCheck=${id}`);
    expect(detail.getByText(/No application progress is linked/)).toBeInTheDocument();
    fireEvent.click(list().getByRole('button', { name: /Application pack.*Finance Associate/ }));
    expect(detail.getByText('EXACT_TRACKER_NOTES')).toBeInTheDocument();
    expect(detail.getByText('interview', { exact: true })).toBeInTheDocument();
    expect(detail.getByRole('link', { name: 'Update this tracking entry' })).toHaveAttribute('href', `/dashboard?tracked=${trackedId}`);
  });
  it('keeps saved checks and trackers available when packs fail, with no empty-source claim', async () => {
    packRead = async () => ({ data: [], error: new Error('offline') }); render(tree());
    await screen.findByRole('button', { name: 'Retry application packs' });
    expect(list().getByRole('button', { name: /Saved CV check.*Operations Analyst/ })).toBeInTheDocument();
    fireEvent.click(list().getByRole('button', { name: /Tracked application.*Finance Associate/ }));
    expect(screen.getByRole('link', { name: 'Update this tracked application' })).toHaveAttribute('href', `/dashboard?tracked=${trackedId}`);
    expect(screen.queryByText('No saved applications yet.', { exact: false })).not.toBeInTheDocument();
  });
  it('distinguishes unavailable selected source from a deleted item and never opens another role', async () => {
    mocks.checks.mockRejectedValue(new Error('offline')); render(tree(`/applications?item=${encodeURIComponent(`check:${id}`)}`));
    await screen.findByRole('heading', { name: "This application's source is unavailable" });
    expect(screen.queryByRole('link', { name: 'Open this application pack' })).not.toBeInTheDocument();
    mocks.checks.mockResolvedValue([]); fireEvent.click(screen.getByRole('button', { name: 'Retry this source' }));
    await screen.findByRole('heading', { name: 'This application is no longer available here' });
    expect(screen.queryByRole('link', { name: 'Open this application pack' })).not.toBeInTheDocument();
  });
  it('clears exact selected private text and its action when authoritative refresh deletes it', async () => {
    render(tree(`/applications?item=${encodeURIComponent(`check:${id}`)}`)); await loaded(); expect(screen.getByText('EXACT_FINAL_REVIEWED_CV')).toBeInTheDocument();
    mocks.checks.mockResolvedValue([]); fireEvent.click(screen.getByRole('button', { name: 'Refresh applications' }));
    await screen.findByRole('heading', { name: 'This application is no longer available here' });
    expect(screen.queryByText('EXACT_FINAL_REVIEWED_CV')).not.toBeInTheDocument(); expect(screen.queryByRole('link', { name: 'Open and edit' })).not.toBeInTheDocument();
  });
  it('shows erasing separately and never opens old Loop documents', async () => {
    mocks.loop.mockResolvedValue({ existingState: 'erasing', erasureGeneration: 8 }); render(tree(`/applications?item=${encodeURIComponent(`loop:7:${id}`)}`)); await loaded();
    expect(screen.getByText(/Your Job Loop erasure is unfinished/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review remaining erasure' })).toHaveAttribute('href', '/loop');
    expect(screen.queryByRole('link', { name: 'Open this Job Loop vacancy' })).not.toBeInTheDocument();
  });
  it('fails closed when active Loop state is missing lifecycle generation', async () => {
    mocks.loop.mockResolvedValue({ existingState: 'active', snapshot: { opportunities: [], packets: [] } }); render(tree());
    await screen.findByRole('button', { name: 'Retry job loop' });
    expect(list().getByRole('button', { name: /Operations Analyst/ })).toBeInTheDocument();
  });
  it('replaces a selected old Loop lifetime with an unavailable state after a fresh generation read', async () => {
    const loop = (generation: number) => ({ existingState: 'active', snapshot: { lifecycleGeneration: generation, recordVersion: 1, profile: null, claims: [], packets: [], opportunities: [{ id, title: 'Loop Analyst', company: 'Loop Employer', description: 'LOOP_EXACT_VACANCY', url: '', checkedAt: date, notes: 'PRIVATE_OLD_LOOP_NOTE', status: 'saved', followUpAt: null }] } });
    mocks.loop.mockResolvedValue(loop(7)); render(tree(`/applications?item=${encodeURIComponent(`loop:7:${id}`)}`)); await loaded();
    expect(screen.getByRole('link', { name: 'Open this Job Loop vacancy' })).toHaveAttribute('href', `/loop?opportunity=${id}&generation=7`);
    mocks.loop.mockResolvedValue(loop(9)); fireEvent.click(screen.getByRole('button', { name: 'Refresh applications' })); await loaded();
    expect(screen.getByRole('heading', { name: 'This application is no longer available here' })).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE_OLD_LOOP_NOTE')).not.toBeInTheDocument(); expect(screen.queryByRole('link', { name: 'Open this Job Loop vacancy' })).not.toBeInTheDocument();
  });
  it('does not let an earlier same-owner refresh overwrite the newer authoritative result', async () => {
    render(tree()); await loaded(); const older = deferred<FreeCvCheck[]>(); mocks.checks.mockReturnValueOnce(older.promise).mockResolvedValue([check({ job_title: 'Newest role' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh applications' })); fireEvent.click(screen.getByRole('button', { name: 'Refresh applications' })); await loaded();
    await act(async () => older.resolve([check({ job_title: 'Obsolete role' })]));
    expect(list().getByRole('button', { name: /Newest role/ })).toBeInTheDocument(); expect(list().queryByRole('button', { name: /Obsolete role/ })).not.toBeInTheDocument();
  });
  it('never applies ambiguous or malformed selectors to the first surviving item', async () => {
    render(tree(`/applications?item=check:${id}&item=pack:${packId}`)); await loaded();
    expect(screen.getByRole('heading', { name: 'This selection is not valid' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open and edit' })).not.toBeInTheDocument();
  });
  it('suppresses a delayed old owner response and resets selected detail on owner change', async () => {
    const old = deferred<FreeCvCheck[]>(); mocks.checks.mockReturnValueOnce(old.promise); const rendered = render(tree(`/applications?item=${encodeURIComponent(`check:${id}`)}`));
    auth = { user: { id: 'owner-b' }, loading: false, authError: null }; setTrackingDraftOwner('owner-b'); packs = []; trackers = []; mocks.checks.mockResolvedValue([check({ id: packId, user_id: 'owner-b', job_title: 'B role' })]);
    rendered.rerender(tree()); await loaded(); await act(async () => old.resolve([check()]));
    expect(screen.queryByText('EXACT_FINAL_REVIEWED_CV')).not.toBeInTheDocument(); expect(list().queryByRole('button', { name: /Operations Analyst/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose an application' })).toBeInTheDocument();
  });
  it.each(['resolve', 'reject'] as const)('does not revive a previous A lifetime after A→B→A late %s', async result => {
    const old = deferred<FreeCvCheck[]>(); mocks.checks.mockReturnValueOnce(old.promise); const rendered = render(tree());
    auth = { ...auth, user: { id: 'owner-b' } }; setTrackingDraftOwner('owner-b'); packs = []; trackers = []; mocks.checks.mockResolvedValue([]); rendered.rerender(tree());
    await loaded(); auth = { ...auth, user: { id: 'owner-a' } }; setTrackingDraftOwner('owner-a'); mocks.checks.mockResolvedValue([check({ job_title: 'Current A role', reviewed_text: 'CURRENT_A_WORDING' })]); rendered.rerender(tree()); await loaded();
    await act(async () => result === 'resolve' ? old.resolve([check({ job_title: 'Obsolete A role' })]) : old.reject(new Error('late failure')));
    expect(list().getByRole('button', { name: /Current A role/ })).toBeInTheDocument(); expect(list().queryByRole('button', { name: /Obsolete A role/ })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Retry saved cv checks' })).not.toBeInTheDocument();
  });
  it('immediately hides private details during unknown or failing authentication', async () => {
    const rendered = render(tree(`/applications?item=${encodeURIComponent(`check:${id}`)}`)); await loaded(); expect(screen.getByText('EXACT_FINAL_REVIEWED_CV')).toBeInTheDocument();
    auth = { ...auth, loading: true }; rendered.rerender(tree()); expect(screen.queryByText('EXACT_FINAL_REVIEWED_CV')).not.toBeInTheDocument();
    auth = { ...auth, loading: false, authError: 'bootstrap failed' }; rendered.rerender(tree()); expect(screen.queryByText('Operations Analyst', { exact: true })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Retry account connection' })).toBeInTheDocument();
  });
  it('rejects foreign rows from each independent table reader', async () => {
    packs = [{ ...pack(), user_id: 'owner-b' }]; trackers = [{ ...tracker(), user_id: 'owner-b' }];
    await expect(readApplicationHomePacks('owner-a')).rejects.toThrow('could not be loaded'); await expect(readApplicationHomeTrackers('owner-a')).rejects.toThrow('could not be loaded');
  });
  it('rechecks the authenticated owner after an independent table read before returning private data', async () => {
    const delayed = deferred<{ data: ApplicationPack[]; error: unknown }>(); packRead = () => delayed.promise;
    const request = readApplicationHomePacks('owner-a'); await waitFor(() => expect(mocks.from).toHaveBeenCalledWith('application_packs'));
    auth = { ...auth, user: { id: 'owner-b' } }; delayed.resolve({ data: [pack()], error: null });
    await expect(request).rejects.toThrow('could not be confirmed');
  });
});
