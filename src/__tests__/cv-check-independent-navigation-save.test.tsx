import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { clearCheckRecovery, clearRetainedCheck, readCheckRecovery, rememberCheckRecovery, type CheckDraft } from '@/lib/check-draft';
import type { FreeCvCheck, SaveFreeCheckInput } from '@/lib/free-check-api';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'owner-a', email: 'owner-a@example.test' } as { id: string; email: string } | null, loading: false, authError: null as string | null },
  list: vi.fn(), save: vi.fn(), remove: vi.fn(), tracker: vi.fn(), exportCv: vi.fn(), download: vi.fn(), preview: vi.fn(), extract: vi.fn(),
  Unconfirmed: class FreeCheckSaveUnconfirmedError extends Error {
    constructor(public readonly requestId: string) { super('The save response was lost. Retry with the same save reference.'); }
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/pages/Auth', () => ({ default: () => <p>Optional account form</p> }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list, saveFreeCheck: mocks.save, deleteFreeCheck: mocks.remove, FreeCheckSaveUnconfirmedError: mocks.Unconfirmed }));
vi.mock('@/lib/workspace-api', () => ({ addApplication: mocks.tracker }));
vi.mock('@/lib/free-check-export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/free-check-export')>()), createFreeCheckCvBlob: mocks.exportCv }));
vi.mock('@/lib/document-export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview }));
vi.mock('@/lib/document-download', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/document-download')>()), downloadBlob: mocks.download }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: mocks.extract }));

const source = 'Alex Local Fixture\nEXPERIENCE\n• Prepared weekly Excel reports for an operations team.\n• Coordinated a reporting checklist with two colleagues.\n• PRIVATE_SOURCE_LINE_FOR_REMOVAL\nEDUCATION\nBachelor of Business Administration';
const finalText = source.replace('\n• PRIVATE_SOURCE_LINE_FOR_REMOVAL', '') + '\n• Kept the reporting definitions consistent during weekly reviews.';
const vacancy = 'Responsibilities\n• Prepare weekly Excel reports for an operations team.\n• Explain reporting definitions and coordinate the checklist with colleagues.\nRequirements\n• Present the information clearly.';
const original: CheckDraft = { jobTitle: 'Operations Analyst', company: 'Local Employer Fixture', sourceText: source, reviewedText: finalText, jobDescription: vacancy };
const replacement = 'Replacement Local Fixture\nEXPERIENCE\n• Prepared a monthly finance summary using Excel.\n• Reviewed the departmental budget with the reporting team.\nEDUCATION\nBachelor of Finance';
const StandardURL = globalThis.URL;

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((pass, fail) => { resolve = pass; reject = fail; });
  return { promise, resolve, reject };
}
function tree() { return <HelmetProvider><MemoryRouter initialEntries={['/check']}><CvCheck /></MemoryRouter></HelmetProvider>; }
function retain(draft = original, consent = false) {
  rememberCheckRecovery({ draft, step: 6, cvReady: true, filename: 'original-local-fixture.txt', ownerId: mocks.auth.user?.id ?? null, pageTarget: 1, reviewStarted: true }, consent);
}
function approve() {
  fireEvent.click(screen.getByLabelText(/I reviewed the complete CV and vacancy/));
  fireEvent.click(screen.getByLabelText(/Both my source CV and final CV are safe/));
  fireEvent.click(screen.getByRole('button', { name: 'Approve this CV' }));
  expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
}
function save() {
  fireEvent.click(screen.getByLabelText('Save these reviewed texts privately in my account.'));
  fireEvent.click(screen.getByRole('button', { name: 'Save approved check to my account' }));
}
function reapproveUnchanged() {
  fireEvent.click(screen.getByRole('button', { name: 'Your review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recheck my changes & continue' }));
  approve();
}
function savedRecord(owner: string, input: SaveFreeCheckInput, id = `saved-${owner}`): FreeCvCheck {
  return { id, user_id: owner, request_id: input.requestId, job_title: input.jobTitle, company: input.company,
    job_description: input.jobDescription, original_text: input.originalText, reviewed_text: input.reviewedText,
    method_version: input.methodVersion, status: 'approved', created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z' };
}
function enterNewOwnerReview() {
  fireEvent.change(screen.getByLabelText('Target role'), { target: { value: 'Financial Analyst' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to your CV' }));
  fireEvent.change(screen.getByLabelText('CV text — paste, correct or remove private information'), { target: { value: replacement } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this reviewed CV text' }));
  fireEvent.change(screen.getByLabelText('Vacancy description'), { target: { value: vacancy } });
  fireEvent.click(screen.getByRole('button', { name: 'Check these inputs' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review my CV & questions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recheck my changes & continue' }));
  approve();
}

beforeEach(() => {
  clearTrackingDraftMemory();
  for (const mock of [mocks.list, mocks.save, mocks.remove, mocks.tracker, mocks.exportCv, mocks.download, mocks.preview, mocks.extract]) mock.mockReset();
  mocks.auth.user = { id: 'owner-a', email: 'owner-a@example.test' }; mocks.auth.loading = false; mocks.auth.authError = null;
  mocks.list.mockResolvedValue([]);
  mocks.exportCv.mockImplementation(async ({ reviewedText }: { reviewedText: string }) => new Blob([reviewedText], { type: 'text/plain' }));
  mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF-local-fixture'], { type: 'application/pdf' }), pageCount: 1 });
  clearCheckRecovery(); clearRetainedCheck(); sessionStorage.clear(); localStorage.clear();
  let urls = 0;
  vi.stubGlobal('URL', class extends StandardURL { static createObjectURL = vi.fn(() => `blob:independent-fixture-${++urls}`); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); clearCheckRecovery(); clearRetainedCheck(); sessionStorage.clear(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('independent CV review navigation and optional account save acceptance', () => {
  it('keeps the approved local TXT, DOCX and exact PDF available while optional account saving is unresolved', async () => {
    const pending = deferred<FreeCvCheck>(); mocks.save.mockReturnValueOnce(pending.promise);
    retain(); render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'Preview current PDF' }));
    await screen.findByTitle('Exact PDF preview before approval'); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    for (const format of ['TXT', 'DOCX', 'PDF']) expect(screen.getByRole('button', { name: `Download ${format}` })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    expect(mocks.exportCv).toHaveBeenCalledWith(expect.objectContaining({ reviewedText: finalText }), 'txt');
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Saving approved check…' })).toBeDisabled();
    await act(async () => { pending.resolve(savedRecord('owner-a', mocks.save.mock.calls[0][1])); });
    expect(await screen.findByRole('button', { name: 'Saved privately' })).toBeDisabled();
  });

  it('does not let completion of an optional save clear a still-pending local export operation', async () => {
    const pendingSave = deferred<FreeCvCheck>(), pendingExport = deferred<Blob>();
    mocks.save.mockReturnValueOnce(pendingSave.promise); mocks.exportCv.mockReturnValueOnce(pendingExport.promise);
    retain(); render(tree()); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }));
    await waitFor(() => expect(mocks.exportCv).toHaveBeenCalledOnce());
    await act(async () => { pendingSave.resolve(savedRecord('owner-a', mocks.save.mock.calls[0][1])); });
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(mocks.download).not.toHaveBeenCalled();
    const blob = new Blob(['exact pending export fixture']);
    await act(async () => { pendingExport.resolve(blob); });
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(blob, expect.stringMatching(/Operations Analyst.*\.txt$/));
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
  });

  it.each(['resolve', 'reject'] as const)('ignores owner A’s delayed save %s while owner B has its own pending save and approved local export', async outcome => {
    const first = deferred<FreeCvCheck>(), second = deferred<FreeCvCheck>();
    mocks.save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    retain(); const view = render(tree()); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    await act(async () => { setTrackingDraftOwner('owner-b'); mocks.auth.user = { id: 'owner-b', email: 'owner-b@example.test' }; view.rerender(tree()); });
    enterNewOwnerReview(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    await act(async () => {
      if (outcome === 'resolve') first.resolve(savedRecord('owner-a', mocks.save.mock.calls[0][1], 'OLD_OWNER_PRIVATE_SAVE'));
      else first.reject(new Error('OLD_OWNER_PRIVATE_SAVE_ERROR'));
    });
    expect(screen.getByRole('button', { name: 'Saving approved check…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    expect(screen.queryByText(/OLD_OWNER_PRIVATE_SAVE/)).not.toBeInTheDocument();
    expect(readCheckRecovery('owner-b')?.value.draft.sourceText).toBe(replacement);
    await act(async () => { second.resolve(savedRecord('owner-b', mocks.save.mock.calls[1][1])); });
    expect(await screen.findByRole('button', { name: 'Saved privately' })).toBeDisabled();
    expect(mocks.save.mock.calls.map(([owner]) => owner)).toEqual(['owner-a', 'owner-b']);
  });

  it('reuses the same ambiguous save reference after unchanged reapproval and uses a different reference after a factual edit', async () => {
    mocks.save.mockImplementation(async (_owner, input) => { throw new mocks.Unconfirmed(input.requestId); });
    retain(); render(tree()); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    await screen.findByText(/save response was lost/i);
    const first = mocks.save.mock.calls[0][1].requestId;
    reapproveUnchanged(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    await screen.findByText(/save response was lost/i);
    expect(mocks.save.mock.calls[1][1].requestId).toBe(first);

    fireEvent.click(screen.getByRole('button', { name: 'Your review' }));
    fireEvent.change(screen.getByLabelText('Your CV to review'), { target: { value: finalText + '\n• Clarified the reporting definitions in the team checklist.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recheck my changes & continue' })); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(3));
    expect(mocks.save.mock.calls[2][1].requestId).not.toBe(first);
    expect(mocks.save.mock.calls[2][1].reviewedText).not.toBe(mocks.save.mock.calls[0][1].reviewedText);
  });

  it.each(['resolve', 'reject'] as const)('ignores an earlier same-owner save %s after a new review starts its own save', async outcome => {
    const first = deferred<FreeCvCheck>(), second = deferred<FreeCvCheck>();
    mocks.save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    retain(); render(tree()); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Your review' }));
    const corrected = finalText + '\n• Clarified the reporting definitions for the team checklist.';
    fireEvent.change(screen.getByLabelText('Your CV to review'), { target: { value: corrected } });
    fireEvent.click(screen.getByRole('button', { name: 'Recheck my changes & continue' })); approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    await act(async () => {
      if (outcome === 'resolve') first.resolve(savedRecord('owner-a', mocks.save.mock.calls[0][1], 'EARLIER_REVIEW_PRIVATE_SAVE'));
      else first.reject(new Error('EARLIER_REVIEW_PRIVATE_SAVE_ERROR'));
    });
    expect(screen.getByRole('button', { name: 'Saving approved check…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    expect(screen.queryByText(/EARLIER_REVIEW_PRIVATE_SAVE/)).not.toBeInTheDocument();
    expect(readCheckRecovery('owner-a')?.value.draft.reviewedText).toBe(corrected);
    expect(mocks.save.mock.calls[1][1].requestId).not.toBe(mocks.save.mock.calls[0][1].requestId);
    await act(async () => { second.resolve(savedRecord('owner-a', mocks.save.mock.calls[1][1])); });
    expect(await screen.findByRole('button', { name: 'Saved privately' })).toBeDisabled();
  });

  it('retains the ambiguous reference through an owner-matched consented refresh but clears approval', async () => {
    mocks.save.mockImplementation(async (_owner, input) => { throw new mocks.Unconfirmed(input.requestId); });
    retain(original, true); const firstView = render(tree()); approve(); save();
    await screen.findByText(/save response was lost/i);
    const firstReference = mocks.save.mock.calls[0][1].requestId;
    const stored = sessionStorage.getItem('jobvance_check_recovery_v1'); expect(stored).not.toBeNull();
    firstView.unmount(); clearCheckRecovery(); sessionStorage.setItem('jobvance_check_recovery_v1', stored!);
    render(tree());
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByLabelText(/I reviewed the complete CV and vacancy/)).not.toBeChecked();
    approve(); save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].requestId).toBe(firstReference);
  });

  it('undoes a continuous source replacement to the exact prior source, edited final, stage and page target without restoring approval', async () => {
    retain(); render(tree()); approve();
    fireEvent.click(screen.getByRole('button', { name: 'Your CV' }));
    const sourceEditor = screen.getByLabelText('CV text — paste, correct or remove private information');
    fireEvent.change(sourceEditor, { target: { value: replacement } });
    fireEvent.change(sourceEditor, { target: { value: replacement + '\n• Explained the finance reporting definitions.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo source replacement' }));
    expect(readCheckRecovery('owner-a')?.value).toMatchObject({ draft: original, pageTarget: 1, step: 2, filename: 'original-local-fixture.txt' });
    expect(screen.getByRole('heading', { name: 'Your CV' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use this reviewed CV text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check these inputs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review my CV & questions' }));
    expect(screen.getByLabelText('Your CV to review')).toHaveValue(finalText);
    fireEvent.click(screen.getByRole('button', { name: 'Recheck my changes & continue' }));
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByLabelText(/I reviewed the complete CV and vacancy/)).not.toBeChecked();
    expect(screen.getByLabelText(/Both my source CV and final CV are safe/)).not.toBeChecked();
    expect(screen.getByLabelText('Maximum PDF length')).toHaveValue('1');
    expect(screen.queryByRole('button', { name: 'Undo source replacement' })).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('drops the previous owner’s source-replacement undo and ignores its late file read after the new owner approves another review', async () => {
    const pending = deferred<string>(); mocks.extract.mockReturnValueOnce(pending.promise);
    retain(); const view = render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'Your CV' }));
    fireEvent.change(screen.getByLabelText('CV text — paste, correct or remove private information'), { target: { value: replacement } });
    expect(screen.getByRole('button', { name: 'Undo source replacement' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Read a CV file on this device'), { target: { files: [new File(['local fixture'], 'replacement.txt', { type: 'text/plain' })] } });
    await act(async () => { setTrackingDraftOwner('owner-b'); mocks.auth.user = { id: 'owner-b', email: 'owner-b@example.test' }; view.rerender(tree()); });
    expect(screen.queryByRole('button', { name: 'Undo source replacement' })).not.toBeInTheDocument();
    expect(readCheckRecovery('owner-b')?.value.draft.sourceText).toBe('');
    enterNewOwnerReview();
    await act(async () => { pending.resolve(replacement + '\nOLD_OWNER_REPLACEMENT_FILE_RESULT'); });
    expect(readCheckRecovery('owner-b')?.value.draft.sourceText).toBe(replacement);
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Undo source replacement' })).not.toBeInTheDocument();
  });
});
