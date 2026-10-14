import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
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
  fireEvent.change(screen.getByLabelText('Target role'), { target: { value: 'Reporting analyst' } });
  fireEvent.change(screen.getByLabelText('Company (optional)'), { target: { value: 'Actual employer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to your CV' }));
  fireEvent.change(screen.getByLabelText('CV text — paste, correct or remove private information'), { target: { value: source } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this reviewed CV text' }));
  fireEvent.change(screen.getByLabelText('Vacancy description'), { target: { value: vacancy } });
  fireEvent.click(screen.getByRole('button', { name: 'Check these inputs' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review my CV & questions' }));
  fireEvent.change(screen.getByLabelText('Your CV to review'), { target: { value: finalText } });
}
function finishReview() { fireEvent.click(screen.getByRole('button', { name: 'Recheck my changes & continue' })); }
function approve() {
  for (const label of [/I reviewed the complete CV and vacancy/, /Both my source CV and final CV are safe/]) {
    const input = screen.getByLabelText(label); if (!(input as HTMLInputElement).checked) fireEvent.click(input);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Approve this CV' }));
}
function save() {
  const input = screen.getByLabelText('Save these reviewed texts privately in my account.');
  if (!(input as HTMLInputElement).checked) fireEvent.click(input);
  fireEvent.click(screen.getByRole('button', { name: 'Save approved check to my account' }));
}
function goSource() { fireEvent.click(within(screen.getByRole('navigation', { name: 'Check progress' })).getByRole('button', { name: /Your CV/ })); }
beforeEach(() => {
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
    render(tree()); approve(); goSource();
    fireEvent.change(screen.getByLabelText('Read a CV file on this device'), { target: { files: [new File(['source'], 'reread.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(screen.getByText(/Read: reread.txt/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Undo source replacement' }));
    expect(readCheckRecovery('owner-a')!.value).toMatchObject({ draft, filename: 'original.pdf', pageTarget: 1, cvReady: true, reviewStarted: true, step: 2 });
    expect(screen.getByText(/Read: original.pdf/)).toBeInTheDocument();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('restores exact source and final edits after a continuous source replacement, with fresh approval required', () => {
    render(tree()); review(); finishReview(); approve();
    const before = readCheckRecovery('owner-a')!.value.draft;
    goSource();
    fireEvent.change(screen.getByLabelText('CV text — paste, correct or remove private information'), { target: { value: replacement } });
    fireEvent.change(screen.getByLabelText('CV text — paste, correct or remove private information'), { target: { value: replacement + '\nAnother edit.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this reviewed CV text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo source replacement' }));
    const restored = readCheckRecovery('owner-a')!.value;
    expect(restored.draft).toEqual(before);
    expect(restored.reviewStarted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Use this reviewed CV text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check these inputs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review my CV & questions' }));
    finishReview(); expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByLabelText(/I reviewed the complete CV and vacancy/)).not.toBeChecked();
  });

  it('keeps approved TXT, DOCX and exact ready PDF exports available while an optional save is unresolved', async () => {
    const pending = deferred<never>(); mocks.save.mockReturnValue(pending.promise);
    render(tree()); review(); finishReview();
    fireEvent.click(screen.getByRole('button', { name: 'Preview current PDF' }));
    await waitFor(() => expect(screen.getByTitle('Exact PDF preview before approval')).toBeInTheDocument());
    approve(); save();
    for (const name of ['Download TXT', 'Download DOCX', 'Download PDF']) {
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
    const first = render(tree()); review(); finishReview(); approve(); save();
    await screen.findByText(/Save response uncertain/);
    const originalId = mocks.save.mock.calls[0][1].requestId;
    fireEvent.click(screen.getByLabelText(/I reviewed the complete CV and vacancy/)); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].requestId).toBe(originalId);
    await screen.findByText(/Save response uncertain/); first.unmount();
    render(tree()); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(3));
    expect(mocks.save.mock.calls[2][1].requestId).toBe(originalId);
    await screen.findByText(/Save response uncertain/);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Check progress' })).getByRole('button', { name: /Your review/ }));
    fireEvent.change(screen.getByLabelText('Your CV to review'), { target: { value: finalText + '\nA new factual contribution.' } });
    finishReview(); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(4));
    expect(mocks.save.mock.calls[3][1].requestId).not.toBe(originalId);
  });

  it('starts a new save identity after an explicit reset even when the next check contains identical text', async () => {
    mocks.save.mockRejectedValue(new Error('Save response uncertain'));
    render(tree()); review(); finishReview(); approve(); save(); await screen.findByText(/Save response uncertain/);
    const previousId = mocks.save.mock.calls[0][1].requestId;
    fireEvent.click(screen.getByRole('button', { name: 'Clear & start again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear current check' }));
    expect(readCheckRecovery('owner-a')!.value.saveReference).toBeUndefined();
    review(); finishReview(); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].requestId).not.toBe(previousId);
  });
});
