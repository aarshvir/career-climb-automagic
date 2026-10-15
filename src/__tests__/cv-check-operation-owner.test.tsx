import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { clearCheckRecovery, clearRetainedCheck, readCheckRecovery } from '@/lib/check-draft';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'owner-a', email: 'owner-a@example.test' } as null | { id: string; email: string }, loading: false, authError: null as string | null },
  list: vi.fn(), save: vi.fn(), remove: vi.fn(), tracker: vi.fn(), extract: vi.fn(), preview: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/pages/Auth', () => ({ default: () => <div>Optional account form</div> }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list, saveFreeCheck: mocks.save, deleteFreeCheck: mocks.remove }));
vi.mock('@/lib/workspace-api', () => ({ addApplication: mocks.tracker }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: mocks.extract,
}));
vi.mock('@/lib/document-export', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((pass, fail) => { resolve = pass; reject = fail; });
  return { promise, resolve, reject };
}
const sourceA = 'Owner A\nEXPERIENCE\n• Prepared weekly operations reports using Excel.\n• Coordinated the reporting process across two teams.\nEDUCATION\nBachelor of Business Administration';
const sourceB = 'Owner B\nEXPERIENCE\n• Prepared monthly finance reports using Excel.\n• Analysed department spending for budget reviews.\nEDUCATION\nBachelor of Business Administration';
const vacancy = 'Responsibilities\n• Prepare clear reports using Excel.\n• Explain the findings to colleagues.\nRequirements\n• Coordinate the reporting process with other teams.';
function tree() { return <HelmetProvider><MemoryRouter initialEntries={['/check']}><CvCheck /></MemoryRouter></HelmetProvider>; }
// Stage 1 now shows the role, CV upload, CV text and vacancy on one screen.
function enterCvStage() {
  fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Reporting Analyst' } });
}
function fileInput() { return screen.getByLabelText(/Upload your CV/); }
function selectFile(name: string) {
  fireEvent.change(fileInput(), {
    target: { files: [new File(['private test text'], name, { type: 'text/plain' })] },
  });
}
// Entering the final stage now starts its PDF preview automatically.
function enterDownloadStage(source: string) {
  enterCvStage();
  fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: source } });
  fireEvent.change(screen.getByLabelText('The job description'), { target: { value: vacancy } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to download' }));
}
const StandardURL = globalThis.URL;
beforeEach(() => {
  clearTrackingDraftMemory();
  vi.clearAllMocks();
  vi.stubGlobal('URL', class extends StandardURL {
    static createObjectURL = vi.fn(() => 'blob:owner-b-current-preview');
    static revokeObjectURL = vi.fn();
  });
  mocks.auth.user = { id: 'owner-a', email: 'owner-a@example.test' };
  mocks.auth.loading = false;
  mocks.auth.authError = null;
  mocks.list.mockResolvedValue([]);
  clearCheckRecovery(); clearRetainedCheck(); sessionStorage.clear(); localStorage.clear();
});
afterEach(() => { cleanup(); clearCheckRecovery(); clearRetainedCheck(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('JV-01 pending operations stay bound to the active candidate', () => {
  it.each(['resolve', 'reject'] as const)('does not let owner A\'s late %s clear owner B\'s active file read or replace B\'s text', async outcome => {
    const first = deferred<string>(), second = deferred<string>();
    mocks.extract.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(tree());
    enterCvStage(); selectFile('owner-a.txt');
    expect(fileInput()).toBeDisabled();

    await act(async () => {
      mocks.auth.user = { id: 'owner-b', email: 'owner-b@example.test' };
      setTrackingDraftOwner('owner-b');
      view.rerender(tree());
    });
    expect(screen.getByLabelText('Job title')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Compare without AI' })).toBeEnabled();
    enterCvStage(); selectFile('owner-b.txt');

    await act(async () => {
      if (outcome === 'resolve') first.resolve(sourceA);
      else first.reject(new Error('Owner A extraction failed late'));
      await Promise.resolve();
    });
    expect(fileInput()).toBeDisabled();
    expect(screen.getByLabelText('Your CV')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readCheckRecovery('owner-b')?.value.draft.sourceText).toBe('');

    await act(async () => { second.resolve(sourceB); await Promise.resolve(); });
    expect(fileInput()).toBeEnabled();
    expect(screen.getByLabelText('Your CV')).toHaveValue(sourceB);
    expect(readCheckRecovery('owner-b')?.value.draft.sourceText).toBe(sourceB);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.tracker).not.toHaveBeenCalled();
  });

  it('ignores owner A\'s late PDF preview while owner B is preparing a different preview', async () => {
    type Preview = { blob: Blob; pageCount: number };
    const first = deferred<Preview>(), second = deferred<Preview>();
    mocks.preview.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(tree());
    enterDownloadStage(sourceA);
    expect(mocks.preview).toHaveBeenCalledTimes(1);

    await act(async () => {
      mocks.auth.user = { id: 'owner-b', email: 'owner-b@example.test' };
      setTrackingDraftOwner('owner-b');
      view.rerender(tree());
    });
    enterDownloadStage(sourceB);
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(mocks.preview.mock.calls[1][0]).toContain('Owner B');
    const staleBlob = new Blob(['owner A PDF bytes'], { type: 'application/pdf' });
    await act(async () => { first.resolve({ blob: staleBlob, pageCount: 1 }); await Promise.resolve(); });

    expect(screen.getByRole('button', { name: 'Show PDF preview' })).toBeDisabled();
    expect(screen.getByLabelText(/I have checked this CV/)).toBeDisabled();
    expect(screen.queryByTitle('Exact PDF preview before approval')).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(readCheckRecovery('owner-b')?.value.draft.reviewedText).not.toContain('Owner A');

    const currentBlob = new Blob(['owner B PDF bytes'], { type: 'application/pdf' });
    await act(async () => { second.resolve({ blob: currentBlob, pageCount: 1 }); await Promise.resolve(); });
    // The current owner's preview finishes: no longer busy, and the manual preview button is gone because a current preview exists.
    await waitFor(() => expect(screen.getByLabelText(/I have checked this CV/)).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Show PDF preview' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Exact PDF preview before approval')).toHaveAttribute('src', 'blob:owner-b-current-preview');
    expect(URL.createObjectURL).toHaveBeenCalledExactlyOnceWith(currentBlob);
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('clears a pending local read when an already-open reset confirmation is accepted', async () => {
    const pending = deferred<string>();
    mocks.extract.mockReturnValueOnce(pending.promise);
    render(tree()); enterCvStage();
    fireEvent.click(screen.getByRole('button', { name: 'Clear & start again' }));
    selectFile('owner-a.txt');
    fireEvent.click(screen.getByRole('button', { name: 'Clear current check' }));

    expect(screen.getByLabelText('Job title')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Compare without AI' })).toBeEnabled();
    await act(async () => { pending.resolve(sourceA); await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Compare without AI' })).toBeEnabled();
    expect(readCheckRecovery('owner-a')?.value.draft.sourceText).toBe('');
    expect(screen.queryByText(/Reading your CV on this device/)).not.toBeInTheDocument();
  });

  it('does not leave an abandoned file read busy when failed authentication later restores the same owner', async () => {
    const pending = deferred<string>();
    mocks.extract.mockReturnValueOnce(pending.promise);
    const view = render(tree()); enterCvStage();
    fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: sourceA } });
    selectFile('replacement.txt');
    await act(async () => {
      mocks.auth.user = null;
      mocks.auth.authError = 'Sign-in restoration failed';
      view.rerender(tree());
    });
    expect(screen.queryByLabelText('Your CV')).not.toBeInTheDocument();
    await act(async () => { pending.resolve(sourceB); await Promise.resolve(); });
    await act(async () => {
      mocks.auth.user = { id: 'owner-a', email: 'owner-a@example.test' };
      setTrackingDraftOwner('owner-a');
      mocks.auth.authError = null;
      view.rerender(tree());
    });
    expect(fileInput()).toBeEnabled();
    expect(screen.getByLabelText('Your CV')).toHaveValue(sourceA);
    expect(readCheckRecovery('owner-a')?.value.draft.sourceText).toBe(sourceA);
    expect(screen.queryByText(/Reading your CV on this device/)).not.toBeInTheDocument();
  });
});
