import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CvCheck from "@/pages/CvCheck";
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { clearCheckRecovery, readCheckRecovery } from '@/lib/check-draft';

vi.unmock("react-router-dom");
const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { id: string; email: string }, loading: false },
  save: vi.fn(), list: vi.fn(), remove: vi.fn(), download: vi.fn(), tracker: vi.fn(), preview: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/pages/Auth", () => ({ default: () => <div>Optional account form</div> }));
vi.mock("@/lib/free-check-api", () => ({ saveFreeCheck: mocks.save, listFreeChecks: mocks.list, deleteFreeCheck: mocks.remove }));
vi.mock("@/lib/document-download", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/document-download")>()), downloadBlob: mocks.download }));
vi.mock("@/lib/workspace-api", () => ({ addApplication: mocks.tracker }));
vi.mock('@/lib/document-export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview }));

const source = "Alex Example\nEXPERIENCE\n• Prepared monthly stakeholder reports using Excel.\n• Supported a transformation pilot across five units.\n• Facilitated weekly workstream meetings.\nSKILLS\nExcel, Power BI\nEDUCATION\nBachelor of Business Administration";
const StandardURL = globalThis.URL;
const vacancy = "Responsibilities\n• Prepare monthly stakeholder reports using Excel.\n• Lead a transformation programme.\nRequirements\n• PMP certification required.\n• At least five years of transformation experience.";
function show(path = '/check') { return render(<HelmetProvider><MemoryRouter initialEntries={[path]}><CvCheck /></MemoryRouter></HelmetProvider>); }
// Stage 1 now holds the role, CV and vacancy together; "Compare without AI" is the local, offline path to review.
async function toReview(initialSource = source) {
  fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Transformation Manager" } });
  fireEvent.change(screen.getByLabelText("Company (optional)"), { target: { value: "Example Employer" } });
  fireEvent.change(screen.getByLabelText("Your CV"), { target: { value: initialSource } });
  fireEvent.change(screen.getByLabelText("The job description"), { target: { value: vacancy } });
  fireEvent.click(screen.getByRole("button", { name: "Compare without AI" }));
}
function confirmBox() { return screen.getByLabelText(/I have checked this CV/) as HTMLInputElement; }
// The final stage prepares its PDF preview automatically and is busy until that settles.
async function settled() { await waitFor(() => expect(confirmBox()).toBeEnabled()); }
async function toDownload() { fireEvent.click(screen.getByRole("button", { name: "Continue to download" })); await settled(); }
async function toApproval() { await toReview(); await toDownload(); }
function openSourceReviewControls() {
  // In the review stage these controls sit inside "More options"; in the final stage they are shown directly.
  const more = screen.queryByText('More options');
  if (more && !more.closest('details')!.open) fireEvent.click(more);
  const summary = screen.getByText('Reuse these edits later (optional)');
  if (!summary.closest('details')!.open) fireEvent.click(summary);
}
// One confirmation box now approves immediately when ticked.
async function approve() {
  await settled();
  if (!confirmBox().checked) fireEvent.click(confirmBox());
  expect(screen.getByText('Ready to download')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Download' })).toHaveFocus();
}
function savedFromInput(id: string, value: { requestId: string; jobTitle: string; company: string; originalText: string; reviewedText: string; jobDescription: string; methodVersion: string }) {
  return { id: 'saved-from-this-check', user_id: id, request_id: value.requestId, job_title: value.jobTitle, company: value.company, original_text: value.originalText, reviewed_text: value.reviewedText, job_description: value.jobDescription, method_version: value.methodVersion, status: 'approved', created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z' };
}
// Choosing the source CV for another vacancy now exists only on saved checks.
async function saveAndReuseSavedSource(jobTitle: string) {
  fireEvent.click(screen.getByLabelText(/Save these reviewed texts privately/));
  fireEvent.click(screen.getByRole("button", { name: "Save approved check to my account" }));
  await waitFor(() => expect(screen.getByText("Saved privately in your account for free.")).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Saved on this account/));
  const savedCard = within(screen.getByRole('heading', { name: jobTitle }).closest('article')!);
  fireEvent.change(savedCard.getByLabelText('CV version for another vacancy'), { target: { value: 'source' } });
  expect(savedCard.getByText(/before final edits.*details you removed later/)).toBeInTheDocument();
  fireEvent.click(savedCard.getByRole('button', { name: 'Use this CV for another vacancy' }));
}
beforeEach(() => {
  clearTrackingDraftMemory();
  vi.stubGlobal("URL", class extends StandardURL { static createObjectURL = vi.fn(() => "blob:synthetic-reviewed-cv"); static revokeObjectURL = vi.fn(); });
  vi.clearAllMocks(); mocks.auth.user = null; mocks.auth.loading = false; mocks.list.mockResolvedValue([]); sessionStorage.clear(); localStorage.clear();
  mocks.save.mockReset();
  clearCheckRecovery();
  mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF fictional preview bytes'], { type: 'application/pdf' }), pageCount: 1 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("three-stage free CV check", () => {
  it('retains student guidance with a recovered draft after help and consented refresh, then clears it with a new check', async () => {
    const first = show('/check?audience=student'); await toReview();
    fireEvent.click(screen.getByLabelText('Keep my draft in this tab across refresh'));
    expect(readCheckRecovery(null)?.value.audience).toBe('student');
    expect(JSON.parse(sessionStorage.getItem('jobvance_check_recovery_v1')!).value.audience).toBe('student');
    first.unmount();
    const returned = show('/check');
    expect(screen.getByRole('region', { name: 'University student guidance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue(source);
    returned.unmount(); clearCheckRecovery();
    show('/check');
    expect(screen.queryByRole('region', { name: 'University student guidance' })).not.toBeInTheDocument();
  });
  it('explicit audience selection overrides recovered guidance and clear resets it', async () => {
    const first = show('/check?audience=student'); await toReview(); first.unmount();
    show('/check?audience=professional');
    expect(screen.getByRole('region', { name: 'Busy professional guidance' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'University student guidance' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear & start again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear current check' }));
    expect(screen.queryByRole('region', { name: 'Busy professional guidance' })).not.toBeInTheDocument();
    expect(readCheckRecovery(null)?.value.audience).toBeUndefined();
  });
  it('MH-02 links validation to the actual role, source, vacancy and final CV, retaining feedback on unrelated edits', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByLabelText('Job title')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Job title')).toHaveAttribute('aria-describedby', 'check-validation-error');
    expect(screen.getByLabelText('Company (optional)')).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Company (optional)'), { target: { value: 'Fictional employer' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Add the job title');
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'X' } });
    expect(screen.getByLabelText('Job title')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Reporting Analyst' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByLabelText('Your CV')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Upload your CV/)).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: source } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('The job description'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByLabelText('The job description')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('The job description')).toHaveAttribute('aria-describedby', 'check-validation-error');
    fireEvent.change(screen.getByLabelText('The job description'), { target: { value: vacancy } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to download' }));
    expect(screen.getByLabelText('Your CV for this job')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: source } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('MH-03 restores replaced application edits for fresh review without restoring approval or export assets', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    show(); await toReview();
    const edited = source + '\nVerified reviewed contribution.';
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: edited } });
    await toDownload();
    fireEvent.change(screen.getByLabelText('Maximum PDF length'), { target: { value: '1' } });
    await waitFor(() => expect(screen.getByTitle('Exact PDF preview before approval')).toBeInTheDocument());
    await approve(); fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    // The final stage now always starts the next application from the approved final CV.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tailor for another job' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    expect(readCheckRecovery(null)!.value.draft.sourceText).toBe(edited);
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Different role' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo new application' }));
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue(edited);
    const restoredDraft = readCheckRecovery(null)!.value.draft;
    expect(restoredDraft).toMatchObject({ jobTitle: 'Transformation Manager', company: 'Example Employer', jobDescription: vacancy, sourceText: source, reviewedText: edited });
    expect(screen.queryByRole('button', { name: 'Undo new application' })).not.toBeInTheDocument();
    const previewsBefore = mocks.preview.mock.calls.length;
    await toDownload();
    expect(screen.getByLabelText('Maximum PDF length')).toHaveValue('1');
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    // The earlier preview is not restored; a fresh one is made for the restored text.
    expect(mocks.preview.mock.calls.length).toBe(previewsBefore + 1);
    expect(mocks.preview).toHaveBeenLastCalledWith(edited, 'Transformation Manager');
    expect(screen.queryByRole('link', { name: /save the prepared file/ })).not.toBeInTheDocument();
    expect(confirmBox()).not.toBeChecked();
    expect(screen.queryByText('Ready to download')).not.toBeInTheDocument();
    expect(storage).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); storage.mockRestore();
  });
  it.each(['reset', 'account'] as const)('MH-03 clears replacement undo on %s change', async action => {
    const view = show(); await toApproval(); await approve(); fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    expect(screen.getByRole('button', { name: 'Undo new application' })).toBeInTheDocument();
    if (action === 'reset') { fireEvent.click(screen.getByRole('button', { name: 'Clear & start again' })); fireEvent.click(screen.getByRole('button', { name: 'Clear current check' })); }
    else { setTrackingDraftOwner('account-a'); mocks.auth.user = { id: 'account-a', email: 'a@example.test' }; view.rerender(<HelmetProvider><MemoryRouter><CvCheck /></MemoryRouter></HelmetProvider>); }
    expect(screen.queryByRole('button', { name: 'Undo new application' })).not.toBeInTheDocument();
  });
  it('professional F03 copies reviewed removals into the reusable source, offers undo, and starts the next job from the approved final CV', async () => {
    const confidential = source + '\nConfidential example client reference: PROJECT-ALPHA-FICTIONAL';
    const storage = vi.spyOn(Storage.prototype, 'setItem'), fetch = vi.spyOn(globalThis, 'fetch');
    show(); await toReview(confidential);
    expect(screen.getByText('Reuse these edits later (optional)').closest('details')).not.toHaveAttribute('open');
    openSourceReviewControls();
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: source } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep these edits in my reusable source' }));
    expect(readCheckRecovery(null)!.value.draft).toMatchObject({ sourceText: source, reviewedText: source, jobDescription: vacancy });
    expect(screen.getByRole('button', { name: 'Undo source update' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo source update' }));
    expect(readCheckRecovery(null)!.value.draft.sourceText).toBe(confidential);
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue(source);
    expect(screen.getByText(/The prior reusable source is restored/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep these edits in my reusable source' }));
    await toDownload(); await approve();
    // The source/final choice moved off the final stage: "Tailor for another job" always reuses the approved final CV.
    fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    expect(readCheckRecovery(null)!.value.draft.sourceText).toBe(source);
    expect(readCheckRecovery(null)!.value.draft.sourceText).not.toContain('PROJECT-ALPHA-FICTIONAL');
    expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    storage.mockRestore(); fetch.mockRestore();
  });
  it.each(['source', 'reviewed'] as const)('F03 previews and cancels exact source-line removal before keeping it out of %s reuse', async choice => {
    // Reusing the source CV is now offered only on saved checks, so that variant saves the approved check first.
    const owner = choice === 'source' ? 'account-a' : null;
    if (owner) { mocks.auth.user = { id: owner, email: 'a@example.test' }; mocks.save.mockImplementation(async (id, value) => savedFromInput(id, value)); }
    const privateLine = 'Confidential fictional reference: PROJECT-ALPHA-FICTIONAL';
    const initial = `${source}\n${privateLine}\nVerified source contribution to keep.`, storage = vi.spyOn(Storage.prototype, 'setItem'), fetch = vi.spyOn(globalThis, 'fetch');
    show(); await toReview(initial);
    const field = screen.getByLabelText('Your CV for this job') as HTMLTextAreaElement;
    const edited = `${field.value}\nVerified new contribution added during review.`;
    fireEvent.change(field, { target: { value: edited } });
    await toDownload(); await approve();
    openSourceReviewControls();
    fireEvent.click(screen.getByText('Choose source lines to remove'));
    expect(screen.getByRole('link', { name: 'How source-line removal works' })).toHaveAttribute('href', '/help#source-line-removal');
    const lineLabel = `Remove source line ${source.split('\n').length + 1}`;
    expect(screen.getByLabelText(lineLabel)).toHaveAccessibleDescription(privateLine);
    fireEvent.click(screen.getByLabelText(lineLabel)); fireEvent.click(screen.getByRole('button', { name: 'Preview selected line removals' }));
    const preview = screen.getByRole('region', { name: 'Source-line removal preview' });
    expect(preview.querySelectorAll('pre')).toHaveLength(2);
    expect(preview.querySelectorAll('pre')[0]).not.toHaveTextContent(privateLine);
    expect(preview.querySelectorAll('pre')[1]).not.toHaveTextContent(privateLine);
    expect(preview.querySelectorAll('pre')[1]).toHaveTextContent('Verified new contribution added during review.');
    expect(readCheckRecovery(owner)!.value.draft).toMatchObject({ sourceText: initial, reviewedText: edited });
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel line removal' }));
    expect(screen.queryByRole('region', { name: 'Source-line removal preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo source-line removal' })).not.toBeInTheDocument();
    expect(readCheckRecovery(owner)!.value.draft.sourceText).toBe(initial);
    fireEvent.click(screen.getByLabelText(lineLabel)); fireEvent.click(screen.getByRole('button', { name: 'Preview selected line removals' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected lines' }));
    expect(screen.getByRole('heading', { name: 'Review changes' })).toHaveFocus();
    const changed = readCheckRecovery(owner)!.value.draft;
    expect(changed.sourceText).toBe(`${source}\nVerified source contribution to keep.`);
    expect(changed.reviewedText).toBe(edited.replace(`${privateLine}\n`, ''));
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue(changed.reviewedText);
    openSourceReviewControls();
    expect(screen.getByRole('button', { name: 'Undo source-line removal' })).toBeInTheDocument();
    await toDownload(); await approve();
    if (choice === 'reviewed') fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    else {
      await saveAndReuseSavedSource('Transformation Manager');
      expect(mocks.save).toHaveBeenCalledExactlyOnceWith('account-a', expect.objectContaining({ originalText: changed.sourceText, reviewedText: changed.reviewedText }));
    }
    expect(readCheckRecovery(owner)!.value.draft.sourceText).toBe(choice === 'source' ? changed.sourceText : changed.reviewedText);
    expect(readCheckRecovery(owner)!.value.draft.sourceText).not.toContain(privateLine);
    expect(screen.getByRole('navigation', { name: 'Check progress' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Your next job' })).toBeInTheDocument();
    expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    if (choice === 'reviewed') expect(mocks.save).not.toHaveBeenCalled();
    storage.mockRestore(); fetch.mockRestore();
  });
  it('F03 invalidates approval and PDF/save assets on source-line removal, excludes undo from storage, and restores both versions deliberately', async () => {
    mocks.auth.user = { id: 'account-a', email: 'a@example.test' };
    const privateLine = 'Confidential fictional reference: PROJECT-ALPHA-FICTIONAL', initial = `${source}\n${privateLine}`;
    show(); await toReview(initial);
    const edited = `${(screen.getByLabelText('Your CV for this job') as HTMLTextAreaElement).value}\nVerified reviewed contribution.`;
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: edited } });
    await toDownload();
    await waitFor(() => expect(screen.getByTitle('Exact PDF preview before approval')).toBeInTheDocument()); await approve();
    fireEvent.click(screen.getByLabelText('Keep my draft in this tab across refresh'));
    fireEvent.click(screen.getByLabelText(/Save these reviewed texts privately/));
    openSourceReviewControls();
    fireEvent.click(screen.getByText('Choose source lines to remove'));
    fireEvent.click(screen.getByLabelText(`Remove source line ${source.split('\n').length + 1}`));
    fireEvent.click(screen.getByRole('button', { name: 'Preview selected line removals' })); fireEvent.click(screen.getByRole('button', { name: 'Remove selected lines' }));
    expect(sessionStorage.getItem('jobvance_check_recovery_v1')).not.toContain('PROJECT-ALPHA-FICTIONAL');
    expect(sessionStorage.getItem('jobvance_check_recovery_v1')).not.toContain('previousSource');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-reviewed-cv');
    expect(screen.getByLabelText('Your CV for this job')).not.toHaveValue(edited);
    openSourceReviewControls();
    fireEvent.click(screen.getByRole('button', { name: 'Undo source-line removal' }));
    expect(screen.getByRole('heading', { name: 'Review changes' })).toHaveFocus();
    expect(readCheckRecovery('account-a')!.value.draft).toMatchObject({ sourceText: initial, reviewedText: edited });
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue(edited);
    const previewsBefore = mocks.preview.mock.calls.length;
    await toDownload();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    // The revoked preview is not restored; a fresh one is made for the restored text.
    expect(mocks.preview.mock.calls.length).toBe(previewsBefore + 1);
    expect(mocks.preview.mock.lastCall?.[0]).toBe(edited);
    expect(confirmBox()).not.toBeChecked();
    expect(screen.getByLabelText(/Save these reviewed texts privately/)).not.toBeChecked();
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('F03 changes only the open copy of a saved check when source lines are removed', async () => {
    mocks.auth.user = { id: 'account-a', email: 'a@example.test' };
    const privateLine = 'Confidential fictional reference: PROJECT-ALPHA-FICTIONAL', text = `${source}\n${privateLine}`;
    const record = { id: 'old-saved-check', user_id: 'account-a', job_title: 'Saved fictional role', company: 'Fictional employer', original_text: text, reviewed_text: text, job_description: vacancy, method_version: 'fictional-method', status: 'approved', created_at: '2026-10-11T00:00:00Z' }, snapshot = JSON.stringify(record);
    mocks.list.mockResolvedValue([record]); show();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open saved check' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open saved check' }));
    await settled();
    openSourceReviewControls();
    fireEvent.click(screen.getByText('Choose source lines to remove'));
    fireEvent.click(screen.getByLabelText(`Remove source line ${source.split('\n').length + 1}`));
    fireEvent.click(screen.getByRole('button', { name: 'Preview selected line removals' })); fireEvent.click(screen.getByRole('button', { name: 'Remove selected lines' }));
    expect(readCheckRecovery('account-a')!.value.draft.sourceText).not.toContain(privateLine);
    expect(JSON.stringify(record)).toBe(snapshot);
    expect(screen.getByRole('heading', { name: 'Saved fictional role' })).toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.tracker).not.toHaveBeenCalled();
  });
  it('professional F03 invalidates existing approval and keeps source undo out of consented recovery storage and other accounts', async () => {
    const confidential = source + '\nConfidential fictional code: PROJECT-ALPHA-FICTIONAL';
    mocks.auth.user = { id: 'account-a', email: 'a@example.test' };
    const view = show(); await toReview(confidential);
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: source } });
    await toDownload(); await approve();
    fireEvent.click(screen.getByLabelText('Keep my draft in this tab across refresh'));
    openSourceReviewControls();
    fireEvent.click(screen.getByRole('button', { name: 'Keep these edits in my reusable source' }));
    expect(sessionStorage.getItem('jobvance_check_recovery_v1')).not.toContain('PROJECT-ALPHA-FICTIONAL');
    openSourceReviewControls();
    expect(screen.getByRole('button', { name: 'Undo source update' })).toBeInTheDocument();
    await toDownload();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(confirmBox()).not.toBeChecked();
    expect(screen.getByLabelText(/Save these reviewed texts privately/)).not.toBeChecked();
    setTrackingDraftOwner('account-b'); mocks.auth.user = { id: 'account-b', email: 'b@example.test' }; view.rerender(<HelmetProvider><MemoryRouter><CvCheck /></MemoryRouter></HelmetProvider>);
    expect(screen.queryByRole('button', { name: 'Undo source update' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Job title')).toHaveValue(''); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([['ACADEMIC PROJECTS', 'Project / academic evidence'], ['INTERNSHIP', 'Internship evidence'], ['PERSONAL PROJECTS', 'Personal project evidence'], ['VOLUNTEERING', 'Volunteering evidence']])('labels %s source context without claiming employment', async (section, label) => {
    show(); await toReview(`Fictional Candidate\nEDUCATION\nBachelor of Business Administration\n${section}\nPrepared monthly stakeholder reports using Excel.\nAssisted in coordinating a fictional reporting team.`);
    const passages = screen.getAllByText(new RegExp(label.replace('/', '\\/')));
    expect(passages.length).toBeGreaterThan(0);
    expect(passages[0]).not.toHaveTextContent('Employment section');
  });
  it('starts with optional recovery details collapsed and states what refresh does without consent', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    show();
    const recovery = screen.getByLabelText('Draft recovery');
    expect(recovery).not.toHaveAttribute('open');
    expect(within(recovery).getByText(/Refresh clears it unless you allow temporary storage/)).toBeInTheDocument();
    expect(screen.getByLabelText('Job title')).toBeInTheDocument();
    expect(screen.getByLabelText('Keep my draft in this tab across refresh')).not.toBeChecked();
    expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
  });
  it.each(['source', 'reviewed'] as const)('reuses the chosen %s CV for a second vacancy with fresh approval and preview', async choice => {
    // "Tailor for another job" on the final stage reuses the approved final CV; the source CV is reused from a saved check.
    const owner = choice === 'source' ? 'account-a' : null;
    if (owner) { mocks.auth.user = { id: owner, email: 'a@example.test' }; mocks.save.mockImplementation(async (id, value) => savedFromInput(id, value)); }
    const storage = vi.spyOn(Storage.prototype, 'setItem'), fetch = vi.spyOn(globalThis, 'fetch');
    const view = show(); await toReview();
    const revised = source + '\nVerified new contribution added during review.';
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: revised } });
    await toDownload();
    fireEvent.change(screen.getByLabelText('Maximum PDF length'), { target: { value: '1' } });
    expect(screen.getByRole('button', { name: 'Tailor for another job' })).toBeDisabled();
    await waitFor(() => expect(screen.getByTitle('Exact PDF preview before approval')).toBeInTheDocument());
    await approve(); fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tailor for another job' })).toBeEnabled());
    if (choice === 'reviewed') fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    else await saveAndReuseSavedSource('Transformation Manager');
    expect(screen.getByLabelText('Job title')).toHaveValue('');
    expect(screen.getByLabelText('Company (optional)')).toHaveValue('');
    expect(screen.queryByTitle('Exact PDF preview before approval')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /save the prepared file/ })).not.toBeInTheDocument();
    view.unmount(); show();
    expect(screen.getByLabelText('Job title')).toHaveValue('');
    expect(screen.getByRole('navigation', { name: 'Check progress' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Your next job' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reused CV')).not.toHaveAttribute('open');
    expect(screen.queryByLabelText(/Upload your CV/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Reused CV text')).toHaveValue(choice === 'reviewed' ? revised : source);
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Reporting Analyst' } });
    expect(screen.getByLabelText('The job description')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('The job description'), { target: { value: 'Responsibilities\nPrepare monthly stakeholder reports using Excel.\nRequirements\nA business degree and careful reporting are required.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByRole('heading', { name: 'Review changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to your next job' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Vacancy finding: Lead a transformation programme.' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your own example, in your words')).toHaveValue('');
    await toDownload();
    expect(screen.getByLabelText('Maximum PDF length')).toHaveValue('1');
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(confirmBox()).not.toBeChecked();
    await approve(); fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2));
    expect(mocks.download.mock.calls.map(call => call[1])).toEqual(['CV-Transformation Manager.txt', 'CV-Reporting Analyst.txt']);
    expect(mocks.tracker).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    if (choice === 'reviewed') expect(mocks.save).not.toHaveBeenCalled(); else expect(mocks.save).toHaveBeenCalledOnce();
    storage.mockRestore(); fetch.mockRestore();
  });
  it('uses a saved approved CV for another vacancy without updating or removing the saved application', async () => {
    mocks.auth.user = { id: 'account-a', email: 'a@example.test' };
    const record = { id: 'saved-first', user_id: 'account-a', request_id: 'request-first', job_title: 'Transformation Manager', company: 'Example Employer', original_text: source, reviewed_text: source + '\nA saved verified contribution.', job_description: vacancy, method_version: 'fixture-method', status: 'approved', created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z' };
    const snapshot = JSON.stringify(record); mocks.list.mockResolvedValue([record]); show();
    const heading = await screen.findByRole('heading', { name: 'Transformation Manager' });
    const savedCard = within(heading.closest('article')!);
    fireEvent.change(savedCard.getByLabelText('CV version for another vacancy'), { target: { value: 'reviewed' } });
    fireEvent.click(savedCard.getByRole('button', { name: 'Use this CV for another vacancy' }));
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Reporting Analyst' } });
    expect(screen.getByLabelText('Reused CV text')).toHaveValue(record.reviewed_text);
    expect(screen.getByLabelText('The job description')).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Your next job' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare without AI' })).toBeInTheDocument();
    expect(savedCard.getByRole('button', { name: 'Open saved check' })).toBeInTheDocument();
    expect(JSON.stringify(record)).toBe(snapshot); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('keeps explicitly chosen refresh recovery for new vacancy inputs without carrying the old approval', async () => {
    show(); await toApproval(); await approve();
    fireEvent.change(screen.getByLabelText('Maximum PDF length'), { target: { value: '1' } });
    // Behaviour change: choosing a PDF length no longer clears approval.
    expect(confirmBox()).toBeChecked();
    expect(screen.getByText('Ready to download')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Keep my draft in this tab across refresh'));
    fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    expect(screen.getByLabelText('Keep my draft in this tab across refresh')).toBeChecked();
    const retained = JSON.parse(sessionStorage.getItem('jobvance_check_recovery_v1')!);
    expect(retained.value).toMatchObject({ step: 1, pageTarget: 1, ownerId: null, cvReady: true, reuseMode: true, draft: { jobTitle: '', company: '', jobDescription: '', reviewedText: '', sourceText: source } });
    expect(retained.value).not.toHaveProperty('approved'); expect(retained.value).not.toHaveProperty('report');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('professional F04 validates each field in the combined reuse setup and opens the CV disclosure for its error', async () => {
    show(); await toApproval(); await approve(); fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByLabelText('Job title')).toHaveFocus();
    expect(screen.getByLabelText('Job title')).toHaveAttribute('aria-describedby', 'check-validation-error');
    fireEvent.change(screen.getByLabelText('Company (optional)'), { target: { value: 'A fictional employer' } });
    expect(screen.getByLabelText('Job title')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Reporting Analyst' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Company (optional)'), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByLabelText('Company (optional)')).toHaveFocus();
    expect(screen.getByLabelText('Company (optional)')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Company (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByLabelText('The job description')).toHaveFocus();
    expect(screen.getByLabelText('The job description')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('The job description'), { target: { value: vacancy } });
    fireEvent.change(screen.getByLabelText('Reused CV text'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByLabelText('Reused CV')).toHaveAttribute('open');
    expect(screen.getByLabelText('Reused CV text')).toHaveFocus();
    expect(screen.getByLabelText('Reused CV text')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('The job description')).not.toHaveAttribute('aria-invalid', 'true');
    const editedSource = source + '\nA verified new example for this application.';
    fireEvent.change(screen.getByLabelText('Reused CV text'), { target: { value: editedSource } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByRole('heading', { name: 'Review changes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to your next job' }));
    expect(screen.getByLabelText('The job description')).toHaveValue(vacancy);
    expect(screen.getByLabelText('Reused CV text')).toHaveValue(editedSource);
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue(editedSource);
  });
  it('professional F04 Undo restores an earlier reused application in its reuse path with fresh approval', async () => {
    show(); await toApproval(); await approve(); fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Second role' } });
    fireEvent.change(screen.getByLabelText('The job description'), { target: { value: vacancy } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    const edited = source + '\nVerified wording for the second application.';
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: edited } });
    await toDownload(); await approve();
    fireEvent.click(screen.getByRole('button', { name: 'Tailor for another job' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo new application' }));
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue(edited);
    expect(screen.getByRole('navigation', { name: 'Check progress' }).querySelectorAll('li')).toHaveLength(3);
    await toDownload();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(confirmBox()).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Back to review changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to your next job' }));
    expect(screen.getByLabelText('Job title')).toHaveValue('Second role');
    expect(screen.getByLabelText('The job description')).toHaveValue(vacancy);
    fireEvent.click(screen.getByRole('button', { name: 'Clear & start again' })); fireEvent.click(screen.getByRole('button', { name: 'Clear current check' }));
    expect(screen.getByRole('navigation', { name: 'Check progress' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'Add your CV and the job' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Reused CV')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Upload your CV/)).toBeInTheDocument();
  });
  it('downloads the exact PDF bytes previewed before approval and revokes the preview after edits', async () => {
    show(); await toApproval();
    const pdf = screen.getByRole('button', { name: 'Download PDF' });
    // The preview is generated automatically when the final stage opens; approval is still required.
    await waitFor(() => expect(screen.getByTitle('Exact PDF preview before approval')).toBeInTheDocument());
    expect(pdf).toBeDisabled();
    expect(screen.getByTitle('Exact PDF preview before approval')).toHaveAttribute('src', 'blob:synthetic-reviewed-cv');
    await approve(); expect(pdf).toBeEnabled(); fireEvent.click(pdf);
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    const preview = await mocks.preview.mock.results[0].value;
    expect(mocks.download.mock.calls[0][0]).toBe(preview.blob);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to review changes' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back to review changes' }));
    const field = screen.getByLabelText('Your CV for this job') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: field.value + '\nUpdated verified wording.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to download' }));
    expect(screen.queryByTitle('Exact PDF preview before approval')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-reviewed-cv');
    await settled();
    // Only a fresh preview of the edited text is shown, and it still needs approval.
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(mocks.preview.mock.calls[1][0]).toContain('Updated verified wording.');
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  });
  it('keeps Word and TXT approval available when PDF exceeds the chosen page target', async () => {
    mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF overlong synthetic layout']), pageCount: 3 });
    show(); await toApproval();
    await waitFor(() => expect(screen.getByText(/Above your selected maximum/)).toBeInTheDocument());
    await approve();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download Word' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeEnabled();
  });
  it.each([false, true])('restores the chosen one-page maximum with tab-storage consent %s, while clearing approval and preview', async consent => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const view = show(); await toApproval();
    fireEvent.change(screen.getByLabelText('Maximum PDF length'), { target: { value: '1' } });
    if (consent) fireEvent.click(screen.getByLabelText('Keep my draft in this tab across refresh'));
    await waitFor(() => expect(screen.getByTitle('Exact PDF preview before approval')).toBeInTheDocument());
    await approve();
    const reviewed = document.querySelector('.check-final-document')?.textContent;
    view.unmount(); show();
    expect(screen.getByText('Your draft is back. Read it again before you approve a new download.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(screen.queryByTitle('Exact PDF preview before approval')).not.toBeInTheDocument();
    expect(document.querySelector('.check-final-document')?.textContent).toBe(reviewed);
    expect(screen.getByLabelText('Maximum PDF length')).toHaveValue('1');
    expect(confirmBox()).not.toBeChecked();
    expect(screen.getByLabelText('Keep my draft in this tab across refresh')).toHaveProperty('checked', consent);
    // The restored final stage prepares a fresh preview of its own; it still needs a new approval.
    await settled();
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    if (!consent) expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });
  it('omits only deliberately selected whole paragraphs and supports undo', async () => {
    show(); await toReview();
    const field = screen.getByLabelText('Your CV for this job') as HTMLTextAreaElement;
    const full = field.value + '\n\nINTERESTS\nFictional chess club.';
    fireEvent.change(field, { target: { value: full } });
    fireEvent.click(screen.getByText('More options'));
    fireEvent.click(screen.getByText('Shorten: leave out whole paragraphs'));
    fireEvent.click(screen.getByLabelText(/Leave out paragraph 2/));
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected paragraphs' }));
    expect(field.value).toBe(full.split('\n\n')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo paragraph selection' }));
    expect(field.value).toBe(full);
  });
  it("runs a real evidence check and permits a guest TXT only after review without quota, storage or network writes", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem"), fetch = vi.spyOn(globalThis, "fetch");
    show(); await toReview();
    // The requirement findings now sit beside the CV in the review stage.
    fireEvent.click(screen.getByText('What the job asks for, beside your CV'));
    // The requirement now also appears in the coverage panel above the CV.
    expect(screen.getAllByText("Lead a transformation programme.").length).toBeGreaterThanOrEqual(2);
    expect(within(screen.getByRole("region", { name: "How your CV covers this job" })).getByText("Lead a transformation programme.")).toBeInTheDocument();
    const leadershipFinding = screen.getByRole("article", { name: "Vacancy finding: Lead a transformation programme." });
    expect(within(leadershipFinding).getByText("Supported a transformation pilot across five units.", { exact: true })).toBeInTheDocument();
    expect(within(leadershipFinding).getByText("Partly covered")).toBeInTheDocument();
    expect(screen.queryByText(/\d+\/100/)).not.toBeInTheDocument();
    await toDownload();
    expect(screen.getByText('Reuse these edits later (optional)').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Keep these edits in my reusable source' })).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeDisabled();
    expect(screen.queryByText(/\d+\/100/)).not.toBeInTheDocument();
    await approve(); fireEvent.click(screen.getByRole("button", { name: "Download TXT" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    expect(mocks.download.mock.calls[0][1]).toBe("CV-Transformation Manager.txt");
    expect(screen.getByRole("link", { name: "save the prepared file: CV-Transformation Manager.txt" })).toHaveAttribute("download", "CV-Transformation Manager.txt");
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.tracker).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    storage.mockRestore(); fetch.mockRestore();
  });
  it("keeps gap questions outside the CV and recalculates after a deliberate truthful addition", async () => {
    show(); await toReview();
    const before = screen.getByLabelText("Your CV for this job") as HTMLTextAreaElement;
    expect(before.value).not.toContain("PMP certification required");
    fireEvent.change(screen.getByLabelText("Your own example, in your words"), { target: { value: "Led a transformation programme for two divisions in 2025." } });
    fireEvent.click(screen.getByRole("button", { name: "Add to my CV" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Confirm this example is accurate");
    fireEvent.click(screen.getByLabelText(/This is accurate and safe to share/));
    fireEvent.click(screen.getByRole("button", { name: "Add to my CV" }));
    expect(before.value).toContain("Led a transformation programme for two divisions in 2025.");
    // "Continue to download" re-validates and recomputes the evidence; the findings are shown in the review stage.
    await toDownload();
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to review changes" }));
    expect(within(screen.getByRole("article", { name: "Vacancy finding: Lead a transformation programme." })).getByText("Added or edited by you during this check", { exact: false })).toBeInTheDocument();
  });
  it("invalidates approval and previous save consent after an edit", async () => {
    show(); await toApproval(); await approve();
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Back to review changes" }));
    const field = screen.getByLabelText("Your CV for this job") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: `${field.value}\nAdditional reviewed wording.` } });
    await toDownload();
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeDisabled();
    expect(confirmBox()).not.toBeChecked();
    expect(screen.queryByText('Ready to download')).not.toBeInTheDocument();
  });
  it("retains only the corrected source text on an explicit owner save", async () => {
    mocks.auth.user = { id: "account-a", email: "test@example.test" }; mocks.save.mockImplementation(async (id, value) => ({ id: "saved-check", user_id: id, job_title: value.jobTitle, company: value.company, original_text: value.originalText, reviewed_text: value.reviewedText, job_description: value.jobDescription, method_version: value.methodVersion, created_at: "2026-10-11T00:00:00Z" }));
    show(); await toApproval(); await approve();
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Save these reviewed texts privately/));
    fireEvent.click(screen.getByRole("button", { name: "Save approved check to my account" }));
    await waitFor(() => expect(screen.getByText("Saved privately in your account for free.")).toBeInTheDocument());
    expect(mocks.save).toHaveBeenCalledWith("account-a", expect.objectContaining({ originalText: source, approved: true, jobDescription: vacancy }));
    expect(mocks.tracker).not.toHaveBeenCalled();
  });
  it("does not show a late saved result in another account", async () => {
    mocks.auth.user = { id: "account-a", email: "a@example.test" };
    let finish!: (value: unknown) => void; mocks.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = show(); await toApproval(); await approve(); fireEvent.click(screen.getByLabelText(/Save these reviewed texts privately/)); fireEvent.click(screen.getByRole("button", { name: "Save approved check to my account" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    setTrackingDraftOwner('account-b'); mocks.auth.user = { id: "account-b", email: "b@example.test" }; view.rerender(<HelmetProvider><MemoryRouter><CvCheck /></MemoryRouter></HelmetProvider>);
    await act(async () => finish({ id: "private-a", user_id: "account-a", job_title: "Private account A role" }));
    expect(screen.queryByText("Private account A role")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Job title")).toHaveValue("");
  });
  it("surfaces save failure while keeping free exports available", async () => {
    mocks.auth.user = { id: "account-a", email: "a@example.test" }; mocks.save.mockRejectedValue(new Error("Saving is temporarily unavailable."));
    show(); await toApproval(); await approve(); fireEvent.click(screen.getByLabelText(/Save these reviewed texts privately/)); fireEvent.click(screen.getByRole("button", { name: "Save approved check to my account" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Saving is temporarily unavailable"));
    expect(screen.getByRole("button", { name: "Download TXT" })).toBeEnabled();
  });
  it("rejects incomplete inputs and starts progress at the first real step", () => {
    show(); expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Compare without AI" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add the job title");
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Strategy Manager" } });
    fireEvent.change(screen.getByLabelText("Your CV"), { target: { value: "short" } }); fireEvent.click(screen.getByRole("button", { name: "Compare without AI" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Too little readable CV text");
  });
});
