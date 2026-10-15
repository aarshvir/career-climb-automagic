import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
import { clearCheckRecovery } from '@/lib/check-draft';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: { user: null, loading: false, authError: null, retryConnection: vi.fn() },
  list: vi.fn(), save: vi.fn(), remove: vi.fn(), tracker: vi.fn(), download: vi.fn(), preview: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/pages/Auth', () => ({ default: () => <p>Account form</p> }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list, saveFreeCheck: mocks.save, deleteFreeCheck: mocks.remove }));
vi.mock('@/lib/workspace-api', () => ({ addApplication: mocks.tracker }));
vi.mock('@/lib/document-download', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/document-download')>()), downloadBlob: mocks.download,
}));
// The final stage now prepares a PDF preview automatically; keep it local and offline.
vi.mock('@/lib/document-export', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/document-export')>()), createReviewedPdfPreview: mocks.preview,
}));

const recoveryKey = 'jobvance_check_recovery_v1';
const source = [
  'Alex Morgan', 'Experience', 'Operations analyst | North Company | 2022–2024',
  '- Managed inventories.', '- Prepared stakeholder reports.', '',
  'Education', 'Bachelor degree in Finance',
].join('\n');
const vacancy = 'Responsibilities\n- Produce stakeholder reports.\n- Prepare monthly reporting for the operations team and present findings to colleagues.';

function show() {
  return render(<HelmetProvider><MemoryRouter initialEntries={['/check']}><CvCheck /></MemoryRouter></HelmetProvider>);
}

// The CV and the vacancy now share stage 1, "Add your CV and the job".
function goBackToInputs() {
  const progress = screen.getByRole('navigation', { name: 'Check progress' });
  fireEvent.click(within(progress).getByRole('button', { name: 'Add your CV and the job' }));
}

function checkInputs() {
  fireEvent.click(screen.getByRole('button', { name: 'Compare without AI' }));
}

function startReview() {
  fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Operations analyst' } });
  fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: source } });
  fireEvent.change(screen.getByLabelText('The job description'), { target: { value: vacancy } });
  checkInputs();
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  clearCheckRecovery();
  mocks.list.mockResolvedValue([]);
  mocks.preview.mockResolvedValue({ blob: new Blob(['%PDF review-state fixture'], { type: 'application/pdf' }), pageCount: 1 });
});
afterEach(() => { cleanup(); clearCheckRecovery(); });

describe('preserving an intentionally emptied final CV', () => {
  it('validates the empty edit on recheck instead of recreating the original source', () => {
    show(); startReview();
    const firstDraft = (screen.getByLabelText('Your CV for this job') as HTMLTextAreaElement).value;
    expect(firstDraft).toContain('- Prepared stakeholder reports.\n- Managed inventories.');
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: '' } });

    goBackToInputs();
    checkInputs();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review changes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue('');
    expect(screen.getByLabelText('Your CV for this job')).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps the empty edit through a consented cold refresh on an earlier step, with an editor available to correct it', async () => {
    const first = show(); startReview();
    fireEvent.click(screen.getByLabelText('Keep my draft in this tab across refresh'));
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: '' } });
    goBackToInputs();
    const retained = sessionStorage.getItem(recoveryKey);
    expect(retained).not.toBeNull();
    first.unmount();

    // Drop module memory as a browser refresh would; keep only consented tab data.
    clearCheckRecovery();
    sessionStorage.setItem(recoveryKey, retained!);
    show();
    expect(screen.getByRole('heading', { name: 'Add your CV and the job' })).toBeInTheDocument();
    expect(screen.getByLabelText('The job description')).toHaveValue(vacancy);
    expect(screen.getByLabelText('Keep my draft in this tab across refresh')).toBeChecked();
    checkInputs();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue('');
    expect(screen.getByLabelText('Your CV for this job')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: source } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to download' }));
    // Let the automatic PDF preview settle so the disabled download reflects approval, not a busy state.
    await waitFor(() => expect(screen.getByLabelText(/I have checked this CV/)).toBeEnabled());
    expect(document.querySelector('.check-final-document')?.textContent).toBe(source);
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByLabelText(/I have checked this CV/)).not.toBeChecked();
  });

  it('starts preparation afresh after deliberate source replacement, while confirming an unchanged source preserves the empty final', () => {
    show(); startReview();
    fireEvent.change(screen.getByLabelText('Your CV for this job'), { target: { value: '' } });
    goBackToInputs();
    // Confirming the unchanged source (re-entering identical text) must not recreate the final CV.
    expect(screen.getByLabelText('Your CV')).toHaveValue(source);
    fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: source } });
    checkInputs();
    expect(screen.getByLabelText('Your CV for this job')).toHaveValue('');

    goBackToInputs();
    const replacement = source.replace('Alex Morgan', 'Taylor Morgan').replace('North Company', 'South Company');
    fireEvent.change(screen.getByLabelText('Your CV'), { target: { value: replacement } });
    checkInputs();

    const prepared = (screen.getByLabelText('Your CV for this job') as HTMLTextAreaElement).value;
    expect(prepared).toContain('Taylor Morgan');
    expect(prepared).toContain('South Company');
    expect(prepared).not.toContain('Alex Morgan');
    expect(prepared).toContain('- Prepared stakeholder reports.\n- Managed inventories.');
    expect(prepared.split('\n').sort()).toEqual(replacement.split('\n').sort());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
