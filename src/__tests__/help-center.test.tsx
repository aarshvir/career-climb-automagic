import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HelpCenter, { helpTopics, searchHelpTopics } from '@/pages/HelpCenter';

vi.unmock('react-router-dom');
afterEach(() => vi.restoreAllMocks());
function showHelp() { return render(<MemoryRouter initialEntries={['/help']}><HelpCenter /></MemoryRouter>); }

describe('task-focused public help', () => {
  it('renders every required anchor and complete steps without sign-in', () => {
    const { container } = showHelp();
    const ids = ['continue-saved-check', 'job-loop-start', 'job-loop-facts', 'job-loop-vacancies', 'job-loop-review', 'job-loop-controls', 'no-cv', 'first-check', 'uploads', 'source-line-removal', 'second-application', 'privacy', 'recovery'];
    expect(helpTopics).toHaveLength(ids.length);
    for (const id of ids) {
      const section = container.querySelector(`#${id}`);
      expect(section).toBeInTheDocument();
      expect(section?.querySelectorAll('.hc-steps li').length).toBeGreaterThanOrEqual(4);
    }
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What would you like to get done?');
    expect(screen.getByRole('status')).toHaveTextContent('13 topics');
    expect(screen.queryByRole('link', { name: /sign up/i })).not.toBeInTheDocument();
    for (const path of ['/check', '/job-loop', '/loop', '/contact', '/guides', '/walkthroughs']) expect(container.querySelector(`a[href="${path}"]`)).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Help topics on this page' });
    for (const link of within(navigation).getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('#'))) expect(container.querySelector(link.getAttribute('href')!)).toBeInTheDocument();
  });

  it('keeps the in-product review and approval control documented in Help', () => {
    // Marketing pages no longer carry approval caveats; the control itself must stay verifiable here.
    const review = helpTopics.find(topic => topic.id === 'job-loop-review');
    expect(review?.title).toMatch(/approve/i);
    expect(review?.steps.join(' ')).toMatch(/approve/i);
    showHelp();
    expect(screen.getByRole('heading', { name: /Preview, approve and download the exact document/ })).toBeInTheDocument();
  });

  it('searches useful instructions and field help, not only titles', async () => {
    const user = userEvent.setup();
    showHelp();
    await user.type(screen.getByRole('searchbox', { name: 'Search help topics' }), 'scanned');
    expect(screen.getByRole('status')).toHaveTextContent('1 topic');
    expect(screen.getByRole('heading', { name: 'Read a file, fix extracted text or convert an old CV' })).toBeInTheDocument();
    expect(screen.getByText(/Renaming the extension does not convert/)).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'four-person MBA');
    expect(screen.getByRole('heading', { name: 'Review the experience saved in your career record' })).toBeInTheDocument();
    expect(searchHelpTopics('25%')).toHaveLength(1);
    expect(searchHelpTopics('upload').some(topic => topic.id === 'uploads')).toBe(true);
    expect(searchHelpTopics('no CV')[0].id).toBe('no-cv');
    expect(searchHelpTopics('source line')[0].id).toBe('source-line-removal');
    expect(searchHelpTopics('confidential').some(topic => topic.id === 'source-line-removal')).toBe(true);
    expect(searchHelpTopics('Undo new application')[0].id).toBe('second-application');
    expect(searchHelpTopics('download timed out')[0].id).toBe('job-loop-review');
  });

  it('filters by task, announces results and recovers from an empty search', async () => {
    const user = userEvent.setup();
    showHelp();
    await user.click(screen.getByRole('button', { name: 'Privacy & recovery' }));
    expect(screen.getByRole('status')).toHaveTextContent('3 topics match');
    expect(screen.getByRole('button', { name: 'Privacy & recovery' })).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByRole('searchbox'), 'no-such-help-topic');
    expect(screen.getByRole('heading', { name: 'No matching help topic yet.' })).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Contact Jobvance' })) expect(link).toHaveAttribute('href', '/contact');
    await user.click(screen.getAllByRole('button', { name: 'Show all topics' })[0]);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('13 topics');
  });

  it('states the distinct local, recovery, source and approval limits', () => {
    const { container } = showHelp();
    const upload = container.querySelector('#uploads')!;
    expect(upload).toHaveTextContent('PDF, DOCX or UTF-8 TXT');
    expect(upload).toHaveTextContent('5 MB');
    expect(upload).toHaveTextContent('does not perform OCR');
    expect(container.querySelector('#recovery')).toHaveTextContent('Recovered confirmations for facts and contact details are reset');
    expect(container.querySelector('#recovery')).toHaveTextContent('Keep my draft in this tab across refresh');
    expect(container.querySelector('#job-loop-review')).toHaveTextContent('open this exact PDF in a new tab');
    expect(container.querySelector('#second-application')).toHaveTextContent('Saved or prepared does not mean applied');
    expect(container.querySelector('#job-loop-facts')).toHaveTextContent('not independent verification');
    expect(container.querySelector('#job-loop-controls')).toHaveTextContent('partial, blocked or failed');
  });

  it('teaches the three-stage free check and names no retired check controls', () => {
    const { container } = showHelp();
    const first = container.querySelector('#first-check')!;
    for (const label of ['Add your CV and the job', 'Upload your CV (PDF, Word or text, up to 5 MB)', 'The job description', 'Job title', 'Company (optional)', 'Tailor my CV for this job', 'Compare without AI', 'Review changes', 'What changed for this job', 'Keep my original', 'Remove this summary', 'Quick questions (answer only if true)', 'Your tailored CV', 'Your CV for this job', 'Add something the job asks for (optional)', 'Continue to download', 'Maximum PDF length', 'Open the exact PDF preview in a new tab', 'I have checked this CV. It is accurate and safe to share with employers.', 'Download PDF, Download Word or Download TXT', 'only rewords your own CV lines']) expect(first).toHaveTextContent(label);
    const next = container.querySelector('#second-application')!;
    for (const label of ['Applying for another job?', 'Tailor for another job', 'Your next job', 'Check or edit the CV you are reusing', 'CV version for another vacancy', 'Use this CV for another vacancy', 'Undo new application']) expect(next).toHaveTextContent(label);
    expect(container.querySelector('#privacy')).toHaveTextContent('sends the CV text and job description to our AI provider');
    expect(container.querySelector('#privacy')).toHaveTextContent('Compare without AI keeps your CV on this device');
    const text = helpTopics.flatMap(topic => [topic.title, topic.summary, ...topic.steps, ...topic.notes, ...(topic.fields ?? []).flatMap(field => [field.label, field.help])]).join(' ');
    const retired = ['Continue to your CV', 'Read a CV file on this device', 'Use this reviewed CV text', 'One vacancy', 'Vacancy description', 'Check these inputs', 'The evidence', 'Review my CV & questions', 'Your review', 'Recheck my changes', 'Approve & download', 'Approve this CV', 'Preview current PDF', 'Check this next vacancy', 'Your next application', 'Inspect or edit the reused CV', 'Your saved free checks'];
    for (const label of retired) expect(text, `help mentions ${label}`).not.toContain(label);
    expect(text).not.toMatch(/Target role(?!s)/);
    expect(searchHelpTopics('Tailor for another job')[0].id).toBe('second-application');
    expect(searchHelpTopics('Compare without AI').some(topic => topic.id === 'first-check')).toBe(true);
  });

  it('guides no-CV customers into the real Loop builder and preserves a check fallback', () => {
    const { container } = showHelp();
    const builder = container.querySelector('#no-cv')!;
    expect(builder).toHaveTextContent('My CV & experience');
    expect(builder).toHaveTextContent('No CV yet? Build one with guided questions');
    expect(builder).toHaveTextContent('Preview my CV draft');
    expect(builder).toHaveTextContent('Use this CV draft');
    expect(builder).toHaveTextContent('Undo CV builder replacement');
    expect(builder).toHaveTextContent('does not save it, approve it or start a run');
    expect(builder).toHaveTextContent('does not call an AI provider');
    expect(within(builder as HTMLElement).getByRole('link', { name: /Build my first CV in your Automated Job Loop/ })).toHaveAttribute('href', '/loop');
    expect(within(builder as HTMLElement).getByRole('link', { name: 'Try the free CV Check' })).toHaveAttribute('href', '/help#first-check');
    const loopText = helpTopics.filter(topic => topic.category === 'Automated Job Loop').flatMap(topic => topic.steps).join(' ');
    expect(loopText).not.toContain('Open Outputs');
    expect(loopText).not.toContain('Open Career record');
    expect(container.querySelector('#job-loop-review')).toHaveTextContent('Open Prepared CVs');
    expect(container.querySelector('#job-loop-start')).toHaveTextContent('My CV & experience');
  });

  it('reveals a quick-start anchor even after a search hid that topic', async () => {
    const user = userEvent.setup();
    const { container } = showHelp();
    await user.type(screen.getByRole('searchbox'), 'scanned');
    expect(container.querySelector('#first-check')).toBeNull();
    await user.click(screen.getByRole('link', { name: /Check your CV against a job/ }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(container.querySelector('#first-check')).toBeInTheDocument();
  });

  it('puts instructions in the initial HTML without browser globals or network/storage calls', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);
    try {
      const html = renderToString(<MemoryRouter><HelpCenter /></MemoryRouter>);
      expect(html).toContain('id="job-loop-facts"');
      expect(html).toContain('Source passage or my answer');
      expect(html).toContain('Keep my draft in this tab across refresh');
      expect(fetch).not.toHaveBeenCalled();
      expect(storage).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
