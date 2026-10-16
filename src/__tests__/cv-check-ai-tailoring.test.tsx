import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CvCheck from "@/pages/CvCheck";
import { clearTrackingDraftMemory } from '@/lib/tracking-draft-memory';
import { clearCheckRecovery } from '@/lib/check-draft';
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
