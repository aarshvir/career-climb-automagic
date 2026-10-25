import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { clearCheckRecovery, readCheckRecovery, rememberCheckRecovery } from '@/lib/check-draft';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'owner-a', email: 'owner-a@example.test' } as { id: string; email: string } | null, loading: false },
  list: vi.fn(), save: vi.fn(), remove: vi.fn(), download: vi.fn(), tracker: vi.fn(), extract: vi.fn(), preview: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/pages/Auth', () => ({ default: () => <p>Account form</p> }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list, saveFreeCheck: mocks.save, deleteFreeCheck: mocks.remove }));
vi.mock('@/lib/workspace-api', () => ({ addApplication: mocks.tracker }));
vi.mock('@/lib/document-download', async original => ({ ...(await original<typeof import('@/lib/document-download')>()), downloadBlob: mocks.download }));
vi.mock('@/lib/cv-extraction', async original => ({ ...(await original<typeof import('@/lib/cv-extraction')>()), extractCvText: mocks.extract }));
vi.mock('@/lib/document-export', async original => ({ ...(await original<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview }));

const source = 'Alex Example\r\nEXPERIENCE\r\n• Prepared monthly stakeholder reports using Excel.\r\n• Supported a reporting pilot across five units.\r\nEDUCATION\r\nBachelor of Business Administration  ';
const finalText = source + '\nA precise later contribution in my own wording.  ';
const replacement = source.replace('Alex Example', 'Replacement Example');
const vacancy = 'Responsibilities\n• Prepare monthly stakeholder reports using Excel.\n• Explain report findings to colleagues and coordinate the reporting process.';
const NativeURL = globalThis.URL;
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((pass, fail) => { resolve = pass; reject = fail; }); return { promise, resolve, reject }; }
function tree() { return <HelmetProvider><MemoryRouter initialEntries={['/check']}><CvCheck /></MemoryRouter></HelmetProvider>; }
function review() {
  fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Reporting analyst' } });
  fireEvent.change(screen.getByLabelText('Company (optional)'), { target: { value: 'Actual employer' } });
  fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: source } });
  fireEvent.change(screen.getByLabelText('The job description'), { target: { value: vacancy } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
  fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: finalText } });
}
function confirmBox() { return screen.getByLabelText(/I have checked this CV/) as HTMLInputElement; }
// The final stage starts a PDF preview automatically and is busy until it settles.
async function settled() { await waitFor(() => expect(confirmBox()).toBeEnabled()); }
async function finishReview() { fireEvent.click(screen.getByRole('button', { name: 'Continue to download' })); await settled(); }
// One confirmation box now approves immediately when ticked.
async function approve() {
  await settled();
  if (!confirmBox().checked) fireEvent.click(confirmBox());
  expect(screen.getByText('Ready to download')).toBeInTheDocument();
}
function save() {
  const input = screen.getByLabelText('Save these reviewed texts privately in my account.');
  if (!(input as HTMLInputElement).checked) fireEvent.click(input);
  fireEvent.click(screen.getByRole('button', { name: 'Save approved check to my account' }));
}
// The source CV now sits on stage 1 with the vacancy.
function goSource() { fireEvent.click(within(screen.getByRole('navigation', { name: 'Check progress' })).getByRole('button', { name: 'Add your CV and the job' })); }
beforeEach(() => {
  clearTrackingDraftMemory();
  vi.clearAllMocks(); clearCheckRecovery(); sessionStorage.clear(); localStorage.clear();
  mocks.auth.user = { id: 'owner-a', email: 'owner-a@example.test' }; mocks.auth.loading = false;
  mocks.list.mockResolvedValue([]); mocks.extract.mockResolvedValue(replacement);
  mocks.preview.mockResolvedValue({ blob: new Blob(['pdf-fixture'], { type: 'application/pdf' }), pageCount: 1 });
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = vi.fn(() => 'blob:approved'); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); clearCheckRecovery(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('bounded source replacement and optional-save repair', () => {
  it('restores literal prior file source/final text and metadata even when rereading an identical source file', async () => {
    const draft = { sourceText: source, reviewedText: finalText, jobDescription: vacancy, jobTitle: 'Reporting analyst', company: 'Actual employer' };
    rememberCheckRecovery({ draft, step: 6, cvReady: true, filename: 'original.pdf', ownerId: 'owner-a', pageTarget: 1, reviewStarted: true }, false);
    mocks.extract.mockResolvedValue(source);
    render(tree()); await approve(); goSource();
    fireEvent.change(screen.getByLabelText(/Upload your CV/), { target: { files: [new File(['source'], 'reread.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(screen.getByText(/Read: reread.txt/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Undo source replacement' }));
    // The file was reread on stage 1 (the old separate CV step 2 is now part of stage 1).
    expect(readCheckRecovery('owner-a')!.value).toMatchObject({ draft, filename: 'original.pdf', pageTarget: 1, cvReady: true, reviewStarted: true, step: 1 });
    expect(screen.getByText(/Read: original.pdf/)).toBeInTheDocument();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('restores exact source and final edits after a continuous source replacement, with fresh approval required', async () => {
    render(tree()); review(); await finishReview(); await approve();
    const before = readCheckRecovery('owner-a')!.value.draft;
    goSource();
    fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: replacement } });
    fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: replacement + '\nAnother edit.' } });
    // Committing the replaced source (old "Use this reviewed CV text") is now preparing it for review.
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(readCheckRecovery('owner-a')!.value.draft.reviewedText).not.toBe(before.reviewedText);
    fireEvent.click(screen.getByRole('button', { name: 'Undo source replacement' }));
    const restored = readCheckRecovery('owner-a')!.value;
    expect(restored.draft).toEqual(before);
    expect(restored.reviewStarted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(readCheckRecovery('owner-a')!.value.draft.reviewedText).toBe(before.reviewedText);
    await finishReview(); expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(confirmBox()).not.toBeChecked();
  });

  it('keeps approved TXT, DOCX and exact ready PDF exports available while an optional save is unresolved', async () => {
    const pending = deferred<never>(); mocks.save.mockReturnValue(pending.promise);
    render(tree()); review(); await finishReview();
    // The exact PDF preview is now generated automatically when the final stage opens.
    await waitFor(() => expect(screen.getByTitle('Exact PDF preview before approval')).toBeInTheDocument());
    await approve(); save();
    for (const name of ['Download TXT', 'Download Word', 'Download PDF']) {
      const button = screen.getByRole('button', { name }); expect(button).toBeEnabled(); fireEvent.click(button);
      await waitFor(() => expect(button).toBeEnabled());
    }
    expect(mocks.download).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('button', { name: 'Saving approved check…' })).toBeDisabled();
    await act(async () => { pending.reject(new Error('Save response uncertain')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Save response uncertain');
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
  });

  it('reuses uncertain save identity after unchanged reapproval and recovery, but changes identity for changed content', async () => {
    mocks.save.mockRejectedValue(new Error('Save response uncertain'));
    const first = render(tree()); review(); await finishReview(); await approve(); save();
    await screen.findByText(/Save response uncertain/);
    const originalId = mocks.save.mock.calls[0][1].requestId;
    // Unticking the single confirmation clears approval; ticking it again re-approves unchanged content.
    fireEvent.click(confirmBox());
    expect(screen.queryByText('Ready to download')).not.toBeInTheDocument();
    await approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].requestId).toBe(originalId);
    await screen.findByText(/Save response uncertain/); first.unmount();
    render(tree()); await approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(3));
    expect(mocks.save.mock.calls[2][1].requestId).toBe(originalId);
    await screen.findByText(/Save response uncertain/);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Check progress' })).getByRole('button', { name: 'Review changes' }));
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: finalText + '\nA new factual contribution.' } });
    await finishReview(); await approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(4));
    expect(mocks.save.mock.calls[3][1].requestId).not.toBe(originalId);
  });

  it('starts a new save identity after an explicit reset even when the next check contains identical text', async () => {
    mocks.save.mockRejectedValue(new Error('Save response uncertain'));
    render(tree()); review(); await finishReview(); await approve(); save(); await screen.findByText(/Save response uncertain/);
    const previousId = mocks.save.mock.calls[0][1].requestId;
    fireEvent.click(screen.getByRole('button', { name: 'Clear & start again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear current check' }));
    expect(readCheckRecovery('owner-a')!.value.saveReference).toBeUndefined();
    review(); await finishReview(); await approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].requestId).not.toBe(previousId);
  });
  it('links an owned approved saved snapshot to explicit Loop review, without importing or tracking it', async () => {
    const id = 'afe62064-a331-4ce6-9e51-2849e091ba54';
    mocks.list.mockResolvedValue([{ id, user_id: 'owner-a', request_id: id, job_title: 'Reporting analyst', company: 'Example employer', job_description: vacancy, original_text: source, reviewed_text: finalText, method_version: 'fixture-method', status: 'approved', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z' }]);
    const view = render(tree());
    const link = await screen.findByRole('link', { name: 'Continue this saved check in your Automated Job Loop' });
    expect(link).toHaveAttribute('href', `/loop?fromCheck=${id}`);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.tracker).not.toHaveBeenCalled();
    mocks.auth.user = { id: 'owner-b', email: 'owner-b@example.test' };
    setTrackingDraftOwner('owner-b');
    mocks.list.mockResolvedValue([]); view.rerender(tree());
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Continue this saved check in your Automated Job Loop' })).not.toBeInTheDocument());
  });

});
