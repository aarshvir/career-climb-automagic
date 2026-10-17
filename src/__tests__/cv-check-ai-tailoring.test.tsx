import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CvCheck from "@/pages/CvCheck";
import { clearTrackingDraftMemory } from '@/lib/tracking-draft-memory';
import { clearCheckRecovery } from '@/lib/check-draft';
import { analyzeCvEvidence } from '@/lib/cv-evidence';
import { companyFromVacancy, roleFromVacancy, TailorUnavailable } from '@/lib/cv-tailor-api';

vi.unmock("react-router-dom");
const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { id: string; email: string }, loading: false },
  tailor: vi.fn(), preview: vi.fn(), list: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/pages/Auth", () => ({ default: () => <div>Optional account form</div> }));
vi.mock("@/lib/free-check-api", () => ({ saveFreeCheck: vi.fn(), listFreeChecks: mocks.list, deleteFreeCheck: vi.fn() }));
vi.mock("@/lib/workspace-api", () => ({ addApplication: vi.fn() }));
vi.mock("@/lib/document-download", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/document-download")>()), downloadBlob: vi.fn() }));
vi.mock('@/lib/document-export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview }));
vi.mock('@/lib/cv-tailor-api', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-tailor-api')>()), requestTailoredCv: mocks.tailor }));

const source = "Alex Example\nalex@example.com\n\nEXPERIENCE\nAnalyst - Example Co | 2021 - 2024\n- Prepared monthly stakeholder reports using Excel.\n- Supported a transformation pilot across five units.\n\nSKILLS\nExcel, Power BI";
const vacancy = "Transformation Analyst - Example Bank, Dubai\nResponsibilities\n- Prepare monthly stakeholder reporting.\n- Support transformation programmes.\nRequirements\n- Excel and Power BI.";
const tailoredText = "Alex Example\nalex@example.com\n\nPROFILE\nAnalyst preparing monthly stakeholder reporting in Excel.\n\nEXPERIENCE\nAnalyst - Example Co | 2021 - 2024\n- Prepared monthly stakeholder reporting in Excel.\n- Supported a transformation pilot across five units.\n\nSKILLS\nExcel, Power BI";
const tailored = {
  text: tailoredText,
  changes: [
    { kind: 'rewrite', n: 6, before: '- Prepared monthly stakeholder reports using Excel.', after: '- Prepared monthly stakeholder reporting in Excel.', sources: [6] },
    { kind: 'summary', n: null, before: '', after: 'Analyst preparing monthly stakeholder reporting in Excel.', sources: [5, 6] },
  ],
  questions: ['Did you lead any part of the transformation pilot, or support it?'],
  rejectedCount: 1,
};
function show() { return render(<HelmetProvider><MemoryRouter initialEntries={['/check']}><CvCheck /></MemoryRouter></HelmetProvider>); }
function fill() {
  fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: source } });
  fireEvent.change(screen.getByLabelText('The job description'), { target: { value: vacancy } });
}
const reviewed = () => (screen.getByLabelText(/Your tailored CV|Your CV for this job/) as HTMLTextAreaElement).value;

beforeEach(() => {
  clearTrackingDraftMemory(); clearCheckRecovery(); sessionStorage.clear();
  mocks.auth.user = null; mocks.tailor.mockReset(); mocks.list.mockResolvedValue([]);
  mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), pageCount: 1 });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); });

describe('reading the role from the job ad', () => {
  it('takes the title and company from a "Role - Company" first line', () => {
    expect(roleFromVacancy(vacancy)).toBe('Transformation Analyst');
    expect(companyFromVacancy(vacancy)).toBe('Example Bank');
    expect(roleFromVacancy('Job title: Product Manager at Fleetwise\nMore')).toBe('Product Manager');
    expect(roleFromVacancy('We are a fast-growing company looking for someone brilliant to join our wonderful team in Dubai today')).toBe('');
  });
  it('fills the job title and company on the single input screen until the user types a title', () => {
    show(); fill();
    expect((screen.getByLabelText('Job title') as HTMLInputElement).value).toBe('Transformation Analyst');
    expect((screen.getByLabelText('Company (optional)') as HTMLInputElement).value).toBe('Example Bank');
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Analyst' } });
    fireEvent.change(screen.getByLabelText('The job description'), { target: { value: `Different Role - Other Co\n${vacancy}` } });
    expect((screen.getByLabelText('Job title') as HTMLInputElement).value).toBe('Analyst');
  });
});

describe('AI tailoring in the check', () => {
  it('admits only one AI request when two clicks occur before React updates', async () => {
    let resolve!: (value: typeof tailored) => void;
    mocks.tailor.mockImplementation(() => new Promise(done => { resolve = done; }));
    show(); fill();
    const button = screen.getByRole('button', { name: /Tailor my CV for this job/ });
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mocks.tailor).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(tailored); });
    expect(await screen.findByRole('heading', { name: 'What changed for this job' })).toBeInTheDocument();
  });
  it('sends only the source CV, job and role, then shows each change beside the original', async () => {
    mocks.tailor.mockResolvedValue(tailored);
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByRole('heading', { name: 'What changed for this job' });
    expect(mocks.tailor).toHaveBeenCalledWith({ cvText: source, jobDescription: vacancy, jobTitle: 'Transformation Analyst', company: 'Example Bank' });
    expect(reviewed()).toBe(tailoredText);
    expect(screen.getByText(/Your original:/).parentElement!.textContent).toContain('Prepared monthly stakeholder reports using Excel.');
    expect(screen.getByText(/We left out 1 AI suggestion/)).toBeInTheDocument();
    expect(screen.getByText('Did you lead any part of the transformation pilot, or support it?')).toBeInTheDocument();
  });
  it('restores one original line, removes an added summary and its heading, and requires fresh approval', async () => {
    mocks.tailor.mockResolvedValue(tailored);
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByRole('heading', { name: 'What changed for this job' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep my original' }));
    expect(reviewed()).toContain('- Prepared monthly stakeholder reports using Excel.');
    expect(reviewed()).not.toContain('reporting in Excel.\n- Supported');
    fireEvent.click(screen.getByRole('button', { name: 'Remove this summary' }));
    expect(reviewed()).not.toContain('PROFILE');
    expect(reviewed()).toBe(source);
    expect(screen.getAllByText(/kept your original/)).toHaveLength(2);
  });
  it('falls back to the on-device comparison with a plain message when tailoring is unavailable', async () => {
    mocks.tailor.mockRejectedValue(new Error('AI tailoring is paused right now. Your CV comparison still works.'));
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByText(/AI tailoring is paused right now/);
    expect(screen.queryByRole('heading', { name: 'What changed for this job' })).not.toBeInTheDocument();
    expect(reviewed()).toContain('Prepared monthly stakeholder reports using Excel.');
    expect(screen.getByRole('heading', { name: 'Review changes' })).toBeInTheDocument();
  });
  it.each(['TAILOR_FREE_LIMIT', 'TAILOR_PASS_DAILY_LIMIT', 'TAILOR_GUEST_LIMIT'])('keeps the on-device fallback and links to passes when %s is reached', async code => {
    mocks.tailor.mockRejectedValue(new TailorUnavailable('You have used your 3 free AI-tailored CVs this month. Passes start at $9 on the Pricing page.', code));
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    const link = await screen.findByRole('link', { name: 'See passes from $9' });
    expect(link).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('status')).toHaveTextContent(/3 free AI-tailored CVs this month.*so you can edit it yourself/);
    expect(reviewed()).toContain('Prepared monthly stakeholder reports using Excel.');
    expect(screen.getByRole('heading', { name: 'Review changes' })).toBeInTheDocument();
  });
  it('does not offer passes for failures a pass would not fix', async () => {
    mocks.tailor.mockRejectedValue(new TailorUnavailable('AI tailoring is paused until next month to stay within our monthly budget.', 'TAILOR_BUDGET_LIMIT'));
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByText(/paused until next month/);
    expect(screen.queryByRole('link', { name: 'See passes from $9' })).not.toBeInTheDocument();
  });
  it('compares without AI when asked, never calling the AI service', () => {
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
    expect(mocks.tailor).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Review changes' })).toBeInTheDocument();
  });
  it('asks for a job title when it cannot be read from the ad', () => {
    show();
    fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: source } });
    fireEvent.change(screen.getByLabelText('The job description'), { target: { value: 'We are hiring someone wonderful to join a growing and ambitious team in a great location with many benefits\n- Excel' } });
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add the job title');
    expect(mocks.tailor).not.toHaveBeenCalled();
  });
  it('one confirmation approves downloads, and the page limit no longer clears it', async () => {
    mocks.tailor.mockResolvedValue(tailored);
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByRole('heading', { name: 'What changed for this job' });
    fireEvent.click(screen.getByRole('button', { name: /Continue to download/ }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Download Word' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I have checked this CV/));
    expect(screen.getByRole('button', { name: 'Download Word' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Maximum PDF length'), { target: { value: '1' } });
    expect(screen.getByRole('button', { name: 'Download Word' })).toBeEnabled();
    expect(screen.getByLabelText(/I have checked this CV/)).toBeChecked();
  });
});

describe('deep tailor from answers the candidate confirms', () => {
  const question = 'Did you lead any part of the transformation pilot, or support it?';
  const answerText = 'I led the pilot workstream for two of the five units.';
  const role = 'Analyst - Example Co | 2021 - 2024';
  const added = '- Led the pilot workstream for two of the five units.';
  const deepText = tailoredText.replace(`${role}\n`, `${role}\n${added}\n`);
  const deep = { text: deepText, changes: [{ kind: 'addition', n: 5, before: '', after: added, sources: [5], facts: [1] }], questions: [], rejectedCount: 0 };
  async function tailorThenAnswer() {
    mocks.tailor.mockResolvedValueOnce(tailored).mockResolvedValueOnce(deep);
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByRole('heading', { name: 'What changed for this job' });
    const improve = screen.getByRole('button', { name: 'Improve my CV with these answers' });
    expect(improve).toBeDisabled();
    fireEvent.change(screen.getByLabelText(question), { target: { value: answerText } });
    expect(improve).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Where this answer belongs in your original CV'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText(/This is accurate for the selected CV line/));
    expect(improve).toBeEnabled();
    return improve;
  }
  it('sends only confirmed answers, with the original CV, and marks what came from them', async () => {
    fireEvent.click(await tailorThenAnswer());
    await screen.findByText(/New line · from your answer/);
    expect(mocks.tailor).toHaveBeenLastCalledWith({ cvText: source, jobDescription: vacancy, jobTitle: 'Transformation Analyst', company: 'Example Bank', facts: [answerText], factSources: [5] });
    expect(reviewed()).toBe(deepText);
    expect(screen.getByText(`From your answer: “${answerText}”`)).toBeInTheDocument();
    expect(screen.getByText(/1 change uses your answers/)).toBeInTheDocument();
  });
  it('withdraws the confirmation when an answer is edited', async () => {
    const improve = await tailorThenAnswer();
    fireEvent.change(screen.getByLabelText(question), { target: { value: `${answerText} Edited.` } });
    expect(screen.getByLabelText(/This is accurate for the selected CV line/)).not.toBeChecked();
    expect(improve).toBeDisabled();
  });
  it('withdraws confirmation when the chosen source changes', async () => {
    const improve = await tailorThenAnswer();
    fireEvent.change(screen.getByLabelText('Where this answer belongs in your original CV'), { target: { value: '6' } });
    expect(screen.getByLabelText(/This is accurate for the selected CV line/)).not.toBeChecked();
    expect(improve).toBeDisabled();
  });
  it('never removes the first matching line when an addition is duplicated', async () => {
    const improve = await tailorThenAnswer();
    mocks.tailor.mockReset(); mocks.tailor.mockResolvedValue({ ...deep, text: `${deepText}\n${added}` });
    fireEvent.click(improve); await screen.findByText(/New line · from your answer/);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this line' }));
    expect(reviewed()).toBe(`${deepText}\n${added}`);
    expect(await screen.findByText(/appears more than once/)).toBeInTheDocument();
  });
  it('does not spend another allowance when new answers exceed the five-answer limit', async () => {
    const questions = ['Did you prepare reports?', 'Did you support planning?', 'Did you analyze sales?', 'Did you coordinate meetings?', 'Did you train colleagues?'];
    mocks.tailor.mockResolvedValueOnce({ ...tailored, questions }).mockResolvedValueOnce({ ...deep, questions: ['Did you support another project?'] });
    show(); fill(); fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByRole('heading', { name: 'What changed for this job' });
    questions.forEach((question, index) => {
      fireEvent.change(screen.getByLabelText(question), { target: { value: `I supported the reporting task for project ${index}.` } });
      fireEvent.change(screen.getAllByLabelText('Where this answer belongs in your original CV')[index], { target: { value: '5' } });
      fireEvent.click(screen.getAllByLabelText(/This is accurate for the selected CV line/)[index]);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Improve my CV with these answers' }));
    await screen.findByLabelText('Did you support another project?');
    fireEvent.change(screen.getByLabelText('Did you support another project?'), { target: { value: 'I supported a different project in the same role.' } });
    fireEvent.change(screen.getByLabelText('Where this answer belongs in your original CV'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText(/This is accurate for the selected CV line/));
    fireEvent.click(screen.getByRole('button', { name: 'Improve my CV with these answers' }));
    expect(await screen.findByText(/No AI request was made/)).toBeInTheDocument();
    expect(mocks.tailor).toHaveBeenCalledTimes(2);
    expect(reviewed()).toBe(deepText);
  });
  it('removes a new line, and undo brings back the previous version with its changes', async () => {
    fireEvent.click(await tailorThenAnswer());
    await screen.findByText(/New line · from your answer/);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this line' }));
    expect(reviewed()).toBe(tailoredText);
    fireEvent.click(screen.getByRole('button', { name: 'Undo and restore the previous version' }));
    expect(reviewed()).toBe(tailoredText);
    expect(screen.getByText(/Your original:/)).toBeInTheDocument();
    expect(screen.getByLabelText(question)).toHaveValue('');
  });
  it('keeps the current CV when the answer-based tailoring fails', async () => {
    mocks.tailor.mockReset();
    mocks.tailor.mockResolvedValueOnce(tailored).mockRejectedValueOnce(new Error('AI tailoring is unavailable right now.'));
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByRole('heading', { name: 'What changed for this job' });
    fireEvent.change(screen.getByLabelText(question), { target: { value: answerText } });
    fireEvent.change(screen.getByLabelText('Where this answer belongs in your original CV'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText(/This is accurate for the selected CV line/));
    fireEvent.click(screen.getByRole('button', { name: 'Improve my CV with these answers' }));
    await screen.findByText(/Your current CV is unchanged/);
    expect(reviewed()).toBe(tailoredText);
  });
});

describe('requirement coverage', () => {
  it('shows before → after counts from the original and tailored CV, never a percentage', async () => {
    mocks.tailor.mockResolvedValue(tailored);
    show(); fill();
    fireEvent.click(screen.getByRole('button', { name: /Tailor my CV for this job/ }));
    await screen.findByRole('heading', { name: 'What changed for this job' });
    const coverage = screen.getByRole('region', { name: 'How your CV covers this job' });
    const before = analyzeCvEvidence(source, vacancy, 'Transformation Analyst').summary, after = analyzeCvEvidence(tailoredText, vacancy, 'Transformation Analyst').summary;
    expect(within(coverage).getByText('Covered').nextElementSibling).toHaveTextContent(`${before.direct} → ${after.direct}`);
    expect(within(coverage).getByText('Partly covered').nextElementSibling).toHaveTextContent(`${before.partial} → ${after.partial}`);
    expect(within(coverage).getByText('Not shown in your CV').nextElementSibling).toHaveTextContent(`${before.missing} → ${after.missing}`);
    expect(coverage.textContent).not.toMatch(/%|score:|pass|fail/iu);
  });
});
