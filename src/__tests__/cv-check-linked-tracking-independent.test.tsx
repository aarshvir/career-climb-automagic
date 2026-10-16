import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { clearCheckRecovery, rememberCheckRecovery } from '@/lib/check-draft';
import type { FreeCvCheck } from '@/lib/free-check-api';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'owner-a' }, loading: false, authError: null }, list: vi.fn(), save: vi.fn(), remove: vi.fn(), track: vi.fn(), oldTrack: vi.fn(), download: vi.fn(), exportCv: vi.fn(), preview: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/pages/Auth', () => ({ default: () => <p>Account form</p> }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list, saveFreeCheck: mocks.save, deleteFreeCheck: mocks.remove }));
vi.mock('@/lib/free-check-tracking', () => ({ trackFreeCheck: mocks.track }));
vi.mock('@/lib/workspace-api', () => ({ addApplication: mocks.oldTrack }));
vi.mock('@/lib/free-check-export', async original => ({ ...(await original<typeof import('@/lib/free-check-export')>()), createFreeCheckCvBlob: mocks.exportCv }));
// The download stage previews the PDF automatically; keep that local (no font fetch).
vi.mock('@/lib/document-export', async original => ({ ...(await original<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview }));
vi.mock('@/lib/document-download', async original => ({ ...(await original<typeof import('@/lib/document-download')>()), downloadBlob: mocks.download }));

const checkId = '11111111-1111-4111-8111-111111111111', trackerId = '22222222-2222-4222-8222-222222222222';
const source = 'Alex Example\nEXPERIENCE\nPrepared weekly Excel reports and explained reporting definitions to colleagues.\nCoordinated a monthly operations checklist for the team.';
const finalText = `${source}\nReviewed reporting definitions with two colleagues.`;
const vacancy = 'Prepare weekly Excel reports and explain reporting definitions to the team. Coordinate the monthly operations checklist and keep the reporting definitions consistent.';
const draft = { jobTitle: 'Operations Analyst', company: 'Example Employer', jobDescription: vacancy, sourceText: source, reviewedText: finalText };
function saved(): FreeCvCheck { return { id: checkId, request_id: checkId, user_id: 'owner-a', job_title: draft.jobTitle, company: draft.company, job_description: vacancy, original_text: source, reviewed_text: finalText, method_version: 'historical-check-method', status: 'approved', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z' }; }
function tracker() { return { id: trackerId, cv_check_id: checkId, pack_id: null, user_id: 'owner-a', job_title: draft.jobTitle, company: draft.company, job_url: null, status: 'interview', notes: 'Existing interview note', applied_at: null, follow_up_at: '2026-10-20', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z' }; }
function tree(path = `/check?savedCheck=${checkId}`) { return <HelmetProvider><MemoryRouter initialEntries={[path]}><CvCheck /></MemoryRouter></HelmetProvider>; }
// One confirmation approves; it is enabled once the automatic PDF preview settles.
const confirmBox = () => screen.getByLabelText(/I have checked this CV/) as HTMLInputElement;
async function approve() { await waitFor(() => expect(confirmBox()).toBeEnabled()); if (!confirmBox().checked) fireEvent.click(confirmBox()); }
async function openSaved() { fireEvent.click(await screen.findByRole('button', { name: 'Review selected saved check' })); await approve(); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const OriginalURL = globalThis.URL;

beforeEach(() => {
  vi.resetAllMocks(); clearCheckRecovery(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a');
  mocks.auth.user = { id: 'owner-a' }; mocks.list.mockResolvedValue([saved()]); mocks.track.mockResolvedValue(tracker());
  mocks.exportCv.mockResolvedValue(new Blob([finalText])); mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), pageCount: 1 });
  vi.stubGlobal('URL', class extends OriginalURL { static createObjectURL = vi.fn(() => 'blob:local-fixture'); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); clearCheckRecovery(); clearTrackingDraftMemory(); vi.unstubAllGlobals(); });

describe('independent linked tracking customer actions', () => {
  it('cannot store the CV implicitly when a locally approved check has not been privately saved', async () => {
    rememberCheckRecovery({ draft, step: 6, cvReady: true, filename: '', ownerId: 'owner-a', pageTarget: 2, reviewStarted: true }, false);
    render(tree('/check')); await approve();
    const track = screen.queryByRole('button', { name: /Also add vacancy to Applications|Track this saved check|Add progress tracking/i });
    if (track) { expect(track).toBeDisabled(); fireEvent.click(track); }
    expect(mocks.track).not.toHaveBeenCalled(); expect(mocks.oldTrack).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
  });
  it('tracks the selected immutable saved check and does not request another private save', async () => {
    render(tree()); await openSaved();
    fireEvent.click(screen.getByRole('button', { name: /Also add vacancy to Applications|Track this saved check|Add progress tracking/i }));
    await waitFor(() => expect(mocks.track).toHaveBeenCalledExactlyOnceWith('owner-a', checkId));
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.oldTrack).not.toHaveBeenCalled();
  });
  it('keeps local download usable while optional tracking is unresolved', async () => {
    const pending = deferred<ReturnType<typeof tracker>>(); mocks.track.mockReturnValueOnce(pending.promise);
    render(tree()); await openSaved();
    fireEvent.click(screen.getByRole('button', { name: /Also add vacancy to Applications|Track this saved check|Add progress tracking/i }));
    await waitFor(() => expect(mocks.track).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    await act(async () => { pending.resolve(tracker()); });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('retries the identical saved check after a lost response and fresh page mount', async () => {
    mocks.track.mockRejectedValueOnce(new Error('Tracking could not be confirmed. Retry this same saved check.'));
    const first = render(tree()); await openSaved();
    fireEvent.click(screen.getByRole('button', { name: 'Track this saved check' }));
    await screen.findByText(/Tracking could not be confirmed/);
    first.unmount(); clearCheckRecovery();
    render(tree()); await openSaved();
    fireEvent.click(screen.getByRole('button', { name: 'Track this saved check' }));
    await screen.findByRole('button', { name: 'Tracking in Applications' });
    expect(mocks.track.mock.calls).toEqual([['owner-a', checkId], ['owner-a', checkId]]);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.oldTrack).not.toHaveBeenCalled();
  });
  it('requires a fresh private snapshot after editing the final CV before creating its tracking relationship', async () => {
    render(tree()); await openSaved();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Check progress' })).getByRole('button', { name: 'Review changes' }));
    fireEvent.change(screen.getByLabelText(/Your tailored CV|Your CV for this job/), { target: { value: `${finalText}\nAn additional truthful example.` } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to download' })); await approve();
    const track = screen.queryByRole('button', { name: /Also add vacancy to Applications|Track this saved check|Add progress tracking/i });
    if (track) expect(track).toBeDisabled();
    expect(mocks.track).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not display a prior lifetime tracking result after batched A→B→A', async () => {
    const pending = deferred<ReturnType<typeof tracker>>(); mocks.track.mockReturnValueOnce(pending.promise);
    const view = render(tree()); await openSaved();
    fireEvent.click(screen.getByRole('button', { name: /Also add vacancy to Applications|Track this saved check|Add progress tracking/i }));
    await waitFor(() => expect(mocks.track).toHaveBeenCalledOnce());
    mocks.list.mockResolvedValue([]);
    await act(async () => { setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a'); view.rerender(tree()); pending.resolve(tracker()); });
    expect(screen.queryByText(/Existing interview note/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tracking in Applications' })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('drops tracking state after deleting the source and permits a new saved snapshot', async () => {
    render(tree()); await openSaved();
    fireEvent.click(screen.getByRole('button', { name: 'Track this saved check' }));
    await screen.findByRole('button', { name: 'Tracking in Applications' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tracking in Applications' })).not.toBeInTheDocument());
    const next = { ...saved(), id: '33333333-3333-4333-8333-333333333333' };
    mocks.save.mockResolvedValue(next);
    fireEvent.click(screen.getByLabelText('Save these reviewed texts privately in my account.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save approved check to my account' }));
    await screen.findByRole('button', { name: 'Track this saved check' });
    fireEvent.click(screen.getByRole('button', { name: 'Track this saved check' }));
    await waitFor(() => expect(mocks.track).toHaveBeenLastCalledWith('owner-a', next.id));
  });

});

