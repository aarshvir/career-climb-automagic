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
    const ids = ['job-loop-start', 'job-loop-facts', 'job-loop-vacancies', 'job-loop-review', 'job-loop-controls', 'no-cv', 'first-check', 'uploads', 'source-line-removal', 'second-application', 'privacy', 'recovery'];
    expect(helpTopics).toHaveLength(ids.length);
    for (const id of ids) {
      const section = container.querySelector(`#${id}`);
      expect(section).toBeInTheDocument();
      expect(section?.querySelectorAll('.hc-steps li').length).toBeGreaterThanOrEqual(4);
    }
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What would you like to get done?');
    expect(screen.getByRole('status')).toHaveTextContent('12 topics');
    expect(screen.queryByRole('link', { name: /sign up/i })).not.toBeInTheDocument();
    for (const path of ['/check', '/job-loop', '/loop', '/contact', '/guides', '/walkthroughs']) expect(container.querySelector(`a[href="${path}"]`)).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Help topics on this page' });
    for (const link of within(navigation).getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('#'))) expect(container.querySelector(link.getAttribute('href')!)).toBeInTheDocument();
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
    expect(screen.getByRole('status')).toHaveTextContent('12 topics');
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
