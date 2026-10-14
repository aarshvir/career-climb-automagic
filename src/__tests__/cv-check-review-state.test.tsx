import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvCheck from '@/pages/CvCheck';
import { clearCheckRecovery } from '@/lib/check-draft';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: { user: null, loading: false, authError: null, retryConnection: vi.fn() },
  list: vi.fn(), save: vi.fn(), remove: vi.fn(), tracker: vi.fn(), download: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/pages/Auth', () => ({ default: () => <p>Account form</p> }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list, saveFreeCheck: mocks.save, deleteFreeCheck: mocks.remove }));
vi.mock('@/lib/workspace-api', () => ({ addApplication: mocks.tracker }));
vi.mock('@/lib/document-download', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/document-download')>()), downloadBlob: mocks.download,
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

function goBackTo(label: 'One vacancy' | 'Your CV') {
  const progress = screen.getByRole('navigation', { name: 'Check progress' });
  fireEvent.click(within(progress).getByRole('button', { name: new RegExp(label) }));
}

function checkInputs() {
  fireEvent.click(screen.getByRole('button', { name: 'Check these inputs' }));
}

function startReview() {
  fireEvent.change(screen.getByLabelText('Target role'), { target: { value: 'Operations analyst' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to your CV' }));
  fireEvent.change(screen.getByLabelText('CV text — paste, correct or remove private information'), { target: { value: source } });
  fireEvent.click(screen.getByRole('button', { name: 'Use this reviewed CV text' }));
  fireEvent.change(screen.getByLabelText('Vacancy description'), { target: { value: vacancy } });
  checkInputs();
  fireEvent.click(screen.getByRole('button', { name: 'Review my CV & questions' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  clearCheckRecovery();
  mocks.list.mockResolvedValue([]);
});
afterEach(() => { cleanup(); clearCheckRecovery(); });

describe('preserving an intentionally emptied final CV', () => {
  it('validates the empty edit on recheck instead of recreating the original source', () => {
    show(); startReview();
    const firstDraft = (screen.getByLabelText('Your CV to review') as HTMLTextAreaElement).value;
    expect(firstDraft).toContain('- Prepared stakeholder reports.\n- Managed inventories.');
    fireEvent.change(screen.getByLabelText('Your CV to review'), { target: { value: '' } });

    goBackTo('One vacancy');
    checkInputs();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your review' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your CV to review')).toHaveValue('');
    expect(screen.getByLabelText('Your CV to review')).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps the empty edit through a consented cold refresh on an earlier step, with an editor available to correct it', () => {
    const first = show(); startReview();
    fireEvent.click(screen.getByLabelText('Keep my draft in this tab across refresh'));
    fireEvent.change(screen.getByLabelText('Your CV to review'), { target: { value: '' } });
    goBackTo('One vacancy');
    const retained = sessionStorage.getItem(recoveryKey);
    expect(retained).not.toBeNull();
    first.unmount();

    // Drop module memory as a browser refresh would; keep only consented tab data.
    clearCheckRecovery();
    sessionStorage.setItem(recoveryKey, retained!);
    show();
    expect(screen.getByRole('heading', { name: 'One vacancy' })).toBeInTheDocument();
    expect(screen.getByLabelText('Keep my draft in this tab across refresh')).toBeChecked();
    checkInputs();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Your CV to review')).toHaveValue('');
    expect(screen.getByLabelText('Your CV to review')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Your CV to review'), { target: { value: source } });
    fireEvent.click(screen.getByRole('button', { name: 'Recheck my changes & continue' }));
    expect(document.querySelector('.check-final-document')?.textContent).toBe(source);
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeDisabled();
    expect(screen.getByLabelText(/I reviewed the complete CV and vacancy/)).not.toBeChecked();
    expect(screen.getByLabelText(/Both my source CV and final CV are safe/)).not.toBeChecked();
  });

  it('starts preparation afresh after deliberate source replacement, while confirming an unchanged source preserves the empty final', () => {
    show(); startReview();
    fireEvent.change(screen.getByLabelText('Your CV to review'), { target: { value: '' } });
    goBackTo('Your CV');
    fireEvent.click(screen.getByRole('button', { name: 'Use this reviewed CV text' }));
    checkInputs();
    expect(screen.getByLabelText('Your CV to review')).toHaveValue('');

    goBackTo('Your CV');
    const replacement = source.replace('Alex Morgan', 'Taylor Morgan').replace('North Company', 'South Company');
    fireEvent.change(screen.getByLabelText('CV text — paste, correct or remove private information'), { target: { value: replacement } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this reviewed CV text' }));
    checkInputs();
    fireEvent.click(screen.getByRole('button', { name: 'Review my CV & questions' }));

    const prepared = (screen.getByLabelText('Your CV to review') as HTMLTextAreaElement).value;
    expect(prepared).toContain('Taylor Morgan');
    expect(prepared).toContain('South Company');
    expect(prepared).not.toContain('Alex Morgan');
    expect(prepared).toContain('- Prepared stakeholder reports.\n- Managed inventories.');
    expect(prepared.split('\n').sort()).toEqual(replacement.split('\n').sort());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
