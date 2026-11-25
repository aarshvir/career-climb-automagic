import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '../pages/JobLoop';
import HelpCenter from '../pages/HelpCenter';
import { blankLoopProfile } from '../lib/job-loop-audiences';
import { clearLoopWorkingDraft } from '../lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '../lib/tracking-draft-memory';
import type { LoopAction, LoopOpportunity, LoopResponse, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
import type { FreeCvCheck } from '../lib/free-check-api';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'validation-owner' } as { id: string } | null, loading: false, authError: null as string | null }, call: vi.fn(), cvs: vi.fn(), list: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: mocks.list }));
// The page's own https rule, copied from src/lib/job-loop-api.ts so the tests exercise the real threshold.
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), safeLoopGmailUrl: (value: string) => value,
  isLoopHttpsUrl: (value: string) => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } } }));

const CV = 'Developed Python reports for a fictional university project using synthetic data. Assisted with reporting during a fictional internship.';
const DESCRIPTION = 'Fictional posting. Analyse sales data, prepare weekly reports and support the planning team. Based in a fictional office; no real employer.';
const LINK = 'https://employer.example.invalid/jobs/fictional-sales-analyst';
const REMEDY = { title: 'Add a title of at least 2 characters.', link: 'Paste the full link to the posting. It must be a valid https:// link.', description: 'Paste more of the posting: at least 80 characters are needed.' };
const BANNER = 'Add a title, a real HTTPS vacancy link and the full job description (at least 80 characters).';
const CONTACT_BANNER = 'Add a named contact, source link and source passage, then confirm the contact yourself. An email format is not verification.';
let current: LoopSnapshot;

function snapshot(): LoopSnapshot {
  return {
    lifecycleGeneration: 0, recordVersion: 3,
    profile: { ...blankLoopProfile('student'), name: 'Fictional Casey', sourceText: CV, targetTitles: ['Graduate analyst'], locations: ['Remote'], revision: 1, updatedAt: '2026-11-20T00:00:00Z' },
    claims: [{ id: 'claim-a', revision: 1, status: 'active', createdAt: '2026-11-20T00:00:00Z', sourceKind: 'cv_passage', sourceQuote: CV, phrasing: CV, context: 'Fictional university project', kind: 'academic_project', resultStatus: 'not_measured', confirmed: true, shareable: true }],
    opportunities: [], runs: [], packets: [], inbox: [], models: [],
    capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 1 },
    gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false },
  };
}
const tree = (path = '/loop') => <HelmetProvider><MemoryRouter initialEntries={[path]}><JobLoop /></MemoryRouter></HelmetProvider>;
const writes = () => mocks.call.mock.calls.filter(([, action]) => (action as LoopAction).action !== 'get').map(([, action]) => action as LoopAction);
const f = {
  title: () => screen.getByLabelText('Vacancy title') as HTMLInputElement, company: () => screen.getByLabelText('Company') as HTMLInputElement, location: () => screen.getByLabelText('Location') as HTMLInputElement,
  link: () => screen.getByLabelText('Vacancy HTTPS link') as HTMLInputElement, description: () => screen.getByLabelText('Full vacancy description') as HTMLTextAreaElement,
  save: () => screen.getByRole('button', { name: 'Save opportunity' }),
};
const form = () => f.save().closest('form') as HTMLFormElement;
const alerts = () => within(form()).queryAllByRole('alert');
const pageAlert = () => document.querySelector('.jl-content > .jl-alert');
const fill = (values: { title?: string; company?: string; location?: string; link?: string; description?: string }) => {
  for (const [key, value] of Object.entries(values)) fireEvent.change(f[key as keyof typeof f]() as HTMLElement, { target: { value } });
};
const valid = { title: 'Fictional sales analyst', company: 'Fictional Employer', location: 'Remote', link: LINK, description: DESCRIPTION };

// jsdom has no layout and no frames of its own: collect the page's animation frames so a test decides when the next frame runs, and record what is scrolled.
let frames: Map<number, FrameRequestCallback>, nextFrame: number, scrolled: ReturnType<typeof vi.fn>, restore: () => void, reduce: boolean;
async function flushFrames() { await act(async () => { const pending = [...frames.entries()]; frames.clear(); pending.forEach(([, callback]) => callback(performance.now())); }); }
const scrollsTo = (element: Element) => scrolled.mock.contexts.filter(context => context === element).length;
const containerOf = (field: HTMLElement) => field.closest('.jl-field') as HTMLElement;
const lastScroll = () => scrolled.mock.calls[scrolled.mock.calls.length - 1]?.[0] as ScrollIntoViewOptions | undefined;
async function openForm() {
  current = snapshot();
  render(tree());
  fireEvent.click(await screen.findByRole('button', { name: 'Opportunities' }));
  await screen.findByRole('button', { name: 'Save opportunity' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 'validation-owner' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('validation-owner');
  mocks.cvs.mockResolvedValue([]); mocks.list.mockResolvedValue([]);
  mocks.call.mockImplementation(async (_owner: string, action: LoopAction): Promise<LoopResponse> => {
    if (action.action === 'get') return { snapshot: structuredClone(current) };
    if (action.action === 'add_opportunity') {
      const o = action.opportunity;
      current = { ...current, recordVersion: current.recordVersion + 1, opportunities: [...current.opportunities, { id: 'op-1', ...o, source: 'manual', sourceKey: 'manual:fictional', checkedAt: '2026-11-25T09:00:00Z', verification: 'user_provided', status: 'saved', followUpAt: null, notes: '' } as LoopOpportunity] };
      return { snapshot: structuredClone(current), message: 'Opportunity saved as user-provided text.' };
    }
    throw new Error('Unexpected action in the vacancy-validation fixture: ' + action.action);
  });
  frames = new Map(); nextFrame = 0; reduce = false;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => ({ matches: reduce && query.includes('prefers-reduced-motion: reduce'), media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) });
  scrolled = vi.fn();
  const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrolled });
  restore = () => {
    if (originalScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll); else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia); else Reflect.deleteProperty(window, 'matchMedia');
  };
});
afterEach(() => { cleanup(); restore?.(); vi.restoreAllMocks(); });

describe('before Save: the three requirements are named where they are entered', () => {
  it('says what is required at the title, link and description, and that Company and Location are optional', async () => {
    await openForm();
    const help = (field: HTMLElement) => (field.getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent);
    expect(help(f.title())).toEqual(['Required. At least 2 characters.']);
    expect(help(f.link())).toEqual(['Required. The full link to the posting, starting with https://.']);
    expect(help(f.description())).toEqual(['Required. Paste at least 80 characters from the actual posting.']);
    expect(help(f.company())).toEqual(['Optional.']); expect(help(f.location())).toEqual(['Optional.']);
    expect(f.title()).not.toHaveAttribute('aria-invalid'); expect(f.link()).not.toHaveAttribute('aria-invalid');
  });

  it('keeps the browser\'s own url check on the link field (no novalidate, type=url, no required attribute added)', async () => {
    await openForm();
    expect(f.link()).toHaveAttribute('type', 'url'); expect(form()).not.toHaveAttribute('novalidate');
    for (const field of [f.title(), f.link(), f.description()]) expect(field).not.toBeRequired();
  });

  it('the Help instruction names the three requirements and says Company and Location are optional', () => {
    render(<HelmetProvider><MemoryRouter initialEntries={['/help']}><HelpCenter /></MemoryRouter></HelmetProvider>);
    const steps = [...document.querySelectorAll('li')].map(li => li.textContent ?? '');
    const step = steps.find(text => text.startsWith('In Add an opportunity')) ?? '';
    expect(step).toContain('the Vacancy title (at least 2 characters)');
    expect(step).toContain('the Vacancy HTTPS link (a valid link to the posting, starting with https://)');
    expect(step).toContain('the Full vacancy description (at least 80 characters from the actual posting)');
    expect(step).toContain('Company and Location are optional');
    expect(step).not.toContain('enter Vacancy title and Company');
  });
});

describe('a manual Save refused at the fields', () => {
  it('missing link: sends nothing, focuses the link field after the remedies render, marks it invalid, associates and announces its remedy once, keeps every value', async () => {
    await openForm(); fill({ ...valid, link: '' });
    fireEvent.click(f.save());
    expect(writes()).toHaveLength(0);
    expect(pageAlert()).toBeNull();                                                      // the page-level banner is not used for these three rules
    expect(f.link()).not.toHaveFocus();                                                   // focus is moved after the render, not inside the click
    await flushFrames();
    expect(f.link()).toHaveFocus();
    expect(f.link()).toHaveAttribute('aria-invalid', 'true');
    const described = (f.link().getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent);
    expect(described).toEqual([REMEDY.link, 'Required. The full link to the posting, starting with https://.']);
    expect(alerts()).toHaveLength(1); expect(alerts()[0]).toHaveTextContent(REMEDY.link);
    expect(scrollsTo(containerOf(f.link()))).toBe(1);
    expect(lastScroll()).toEqual({ block: 'center', behavior: 'smooth' });                // label, box and remedy come into view together
    expect([f.title().value, f.company().value, f.location().value, f.description().value]).toEqual([valid.title, valid.company, valid.location, valid.description]);
    expect(f.title()).not.toHaveAttribute('aria-invalid'); expect(f.description()).not.toHaveAttribute('aria-invalid');
  });

  it('short title: focuses the title with its remedy', async () => {
    await openForm(); fill({ ...valid, title: 'A' });
    fireEvent.click(f.save()); await flushFrames();
    expect(writes()).toHaveLength(0);
    expect(f.title()).toHaveFocus(); expect(f.title()).toHaveAttribute('aria-invalid', 'true');
    expect(alerts()).toHaveLength(1); expect(alerts()[0]).toHaveTextContent(REMEDY.title);
    expect(f.title().value).toBe('A');
  });

  it('spaces do not count towards the title or the description', async () => {
    await openForm(); fill({ ...valid, title: '   ', description: ' '.repeat(60) + 'D'.repeat(20) });
    fireEvent.click(f.save()); await flushFrames();
    expect(f.title()).toHaveFocus();
    expect(screen.getByText(REMEDY.title)).toBeInTheDocument(); expect(screen.getByText(REMEDY.description)).toBeInTheDocument();
  });

  it('short description: focuses the description with its remedy; 80 characters passes', async () => {
    await openForm(); fill({ ...valid, description: 'D'.repeat(79) });
    fireEvent.click(f.save()); await flushFrames();
    expect(writes()).toHaveLength(0);
    expect(f.description()).toHaveFocus(); expect(f.description()).toHaveAttribute('aria-invalid', 'true');
    expect(alerts()).toHaveLength(1); expect(alerts()[0]).toHaveTextContent(REMEDY.description);
    fireEvent.change(f.description(), { target: { value: 'D'.repeat(80) } });
    expect(f.description()).not.toHaveAttribute('aria-invalid'); expect(screen.queryByText(REMEDY.description)).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);                                                      // correcting alone sends nothing
  });

  it('several invalid fields: the first in form order takes focus, every remedy is shown, one live announcement only', async () => {
    await openForm(); fill({ title: '', link: 'http://employer.example.invalid/jobs/1', description: 'too short' });
    fireEvent.click(f.save()); await flushFrames();
    expect(writes()).toHaveLength(0);
    expect(f.title()).toHaveFocus();
    for (const field of [f.title(), f.link(), f.description()]) expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(REMEDY.title)).toBeInTheDocument(); expect(screen.getByText(REMEDY.link)).toBeInTheDocument(); expect(screen.getByText(REMEDY.description)).toBeInTheDocument();
    expect(alerts()).toHaveLength(1); expect(alerts()[0]).toHaveTextContent(REMEDY.title);
    expect(f.link()).toHaveValue('http://employer.example.invalid/jobs/1'); expect(f.description()).toHaveValue('too short');
    // reaching the next failing field by Tab finds its remedy attached to it
    const scrollsAtTitle = scrolled.mock.calls.length;
    await userEvent.setup().tab();
    expect(f.company()).toHaveFocus();
    expect(scrolled.mock.calls.length).toBe(scrollsAtTitle);                                // an unflagged field brings no scroll with it
    await userEvent.setup().tab(); await userEvent.setup().tab();
    expect(f.link()).toHaveFocus(); expect((f.link().getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent)[0]).toBe(REMEDY.link);
    expect(scrollsTo(containerOf(f.link()))).toBe(1); expect(lastScroll()).toEqual({ block: 'nearest', behavior: 'smooth' });   // reached by Tab: label, box and remedy are brought into view together
    await userEvent.setup().tab();
    expect(f.description()).toHaveFocus(); expect(scrollsTo(containerOf(f.description()))).toBe(1);
  });

  it('correcting a field clears its own remedy and flag only, never moves focus, never announces again, never sends', async () => {
    await openForm(); fill({ title: '', link: '', description: '' });
    fireEvent.click(f.save()); await flushFrames();
    const alert = alerts()[0], scrollsBefore = scrolled.mock.calls.length;
    const user = userEvent.setup();
    await user.type(f.title(), 'A');
    expect(f.title()).toHaveAttribute('aria-invalid', 'true'); expect(screen.getByText(REMEDY.title)).toBeInTheDocument();    // still too short: still flagged
    expect(alerts()).toHaveLength(1); expect(alerts()[0]).toBe(alert);                      // the same node: not announced again for a keystroke
    await user.type(f.title(), 'B');
    expect(f.title()).not.toHaveAttribute('aria-invalid'); expect(screen.queryByText(REMEDY.title)).not.toBeInTheDocument();
    expect(alerts()).toHaveLength(0);                                                       // the remedy that carried the announcement went with the correction; no other one takes over
    expect(f.link()).toHaveAttribute('aria-invalid', 'true'); expect(screen.getByText(REMEDY.link)).toBeInTheDocument();
    expect(f.title()).toHaveFocus(); expect(scrolled.mock.calls.length).toBe(scrollsBefore);
    await flushFrames(); expect(f.title()).toHaveFocus();
    expect(writes()).toHaveLength(0);
  });

  it('typing in another failing field never pulls focus back to the first failing one', async () => {
    await openForm(); fill({ title: '', link: '', description: DESCRIPTION });
    fireEvent.click(f.save()); await flushFrames();
    expect(f.title()).toHaveFocus();
    const user = userEvent.setup();
    await user.click(f.link());                                                               // reaching a flagged field reveals it once ...
    const scrollsBefore = scrolled.mock.calls.length;
    await user.type(f.link(), LINK);                                                          // ... typing in it adds no scroll and no focus move                              // the link becomes valid: its remedy goes, the title's stays
    await flushFrames();
    expect(f.link()).toHaveFocus(); expect(f.link()).not.toHaveAttribute('aria-invalid');
    expect(f.title()).toHaveAttribute('aria-invalid', 'true'); expect(scrolled.mock.calls.length).toBe(scrollsBefore);
    expect(writes()).toHaveLength(0);
  });

  it('a repeat rejection finds the first failing field again, and is announced again, without moving focus while typing', async () => {
    await openForm(); fill({ ...valid, link: '' });
    fireEvent.click(f.save()); await flushFrames();
    const firstAlert = alerts()[0];
    const user = userEvent.setup();
    await user.click(f.company());                                                           // the visitor wanders off to another field and types
    await user.type(f.company(), ' Ltd');
    expect(f.company()).toHaveFocus();                                                       // typing in another field never pulls focus back
    fireEvent.click(f.save()); await flushFrames();
    expect(writes()).toHaveLength(0);
    expect(f.link()).toHaveFocus();                                                          // found again
    expect(alerts()).toHaveLength(1); expect(alerts()[0]).toHaveTextContent(REMEDY.link); expect(alerts()[0]).not.toBe(firstAlert);   // a new announcement
    expect(scrollsTo(containerOf(f.link()))).toBe(2);
    expect(f.company()).toHaveValue('Fictional Employer Ltd');
  });

  it('Enter in a field takes the same path', async () => {
    await openForm(); fill({ ...valid, link: '' });
    const user = userEvent.setup();
    await user.click(f.title()); await user.keyboard('{Enter}'); await flushFrames();
    expect(writes()).toHaveLength(0);
    expect(f.link()).toHaveFocus(); expect(alerts()).toHaveLength(1);
  });

  it('under reduced motion the scroll is not smooth', async () => {
    reduce = true;
    await openForm(); fill({ ...valid, link: '' });
    fireEvent.click(f.save()); await flushFrames();
    expect(f.link()).toHaveFocus(); expect(lastScroll()).toEqual({ block: 'center', behavior: 'auto' });
  });

  it('after the corrections, one deliberate Save sends exactly one vacancy and clears the form and its remedies', async () => {
    await openForm(); fill({ title: '', link: '', description: '', company: 'Fictional Employer', location: 'Remote' });
    fireEvent.click(f.save()); await flushFrames();
    expect(writes()).toHaveLength(0);
    fill({ title: valid.title, link: LINK, description: DESCRIPTION });
    await flushFrames();
    expect(writes()).toHaveLength(0);                                                        // correcting alone sends nothing
    expect(alerts()).toHaveLength(0); expect(document.querySelectorAll('.jl-field-error')).toHaveLength(0); expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    fireEvent.click(f.save());
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ action: 'add_opportunity', opportunity: { title: valid.title, company: valid.company, location: valid.location, url: LINK, description: DESCRIPTION, contact: null } });
    await waitFor(() => expect(f.title()).toHaveValue(''));
    expect(document.querySelectorAll('.jl-field-error')).toHaveLength(0);
    expect(pageAlert()).toBeNull();
  });

  it('Company and Location stay optional', async () => {
    await openForm(); fill({ title: valid.title, link: LINK, description: DESCRIPTION });
    fireEvent.click(f.save());
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ opportunity: { company: '', location: '' } });
    expect(document.querySelectorAll('.jl-field-error')).toHaveLength(0);
  });
});

describe('regression controls: the other branches of the shared handler are unchanged', () => {
  it('named contact ticked and left blank: the page-level banner with its exact wording, nothing at the fields, nothing sent', async () => {
    await openForm(); fill(valid);
    fireEvent.click(screen.getByRole('checkbox', { name: /Add a named contact I have checked/ }));
    fireEvent.click(f.save()); await flushFrames();
    expect(writes()).toHaveLength(0);
    expect(pageAlert()).toHaveTextContent(CONTACT_BANNER);
    expect(document.querySelectorAll('.jl-field-error')).toHaveLength(0); expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    expect(document.activeElement).not.toBe(f.link());                                       // this branch never moves focus to a field
    expect(scrolled.mock.calls.length).toBe(0);
  });

  it('named contact: ordinary fields are still checked first, and by the new field-level path', async () => {
    await openForm(); fill({ ...valid, title: '' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Add a named contact I have checked/ }));
    fireEvent.click(f.save()); await flushFrames();
    expect(f.title()).toHaveFocus(); expect(pageAlert()).toBeNull(); expect(writes()).toHaveLength(0);
  });

  describe('saved-check link', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const vacancy = 'Prepare weekly operations reports using Excel. Explain the reporting definitions to colleagues, review data quality and coordinate the weekly checklist.';
    const finalText = ['Alex Reviewed', 'alex.reviewed@example.invalid', 'EXPERIENCE', 'Prepared weekly Excel reports for a local operations team and explained reporting definitions.'].join(String.fromCharCode(10));
    const saved = (): FreeCvCheck => ({ id, user_id: 'validation-owner', request_id: id, job_title: 'Operations Analyst', company: 'Saved Employer Fixture', job_description: vacancy, original_text: finalText + String.fromCharCode(10) + 'PRIVATE_DETAIL_REMOVED_FROM_FINAL', reviewed_text: finalText, status: 'approved', method_version: 'fixture-method', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z' }) as FreeCvCheck;
    async function openSavedCheck() {
      current = { ...snapshot(), profile: null, claims: [] }; mocks.list.mockResolvedValue([saved()]);
      render(tree(`/loop?fromCheck=${id}`));
      await screen.findByLabelText('Saved CV check'); await waitFor(() => expect(screen.getByLabelText('Saved CV check')).toHaveValue(id));
      fireEvent.click(screen.getByRole('button', { name: 'Use this saved check' }));
      fireEvent.click(screen.getByRole('button', { name: 'Opportunities' }));
    }
    it('consent unticked: the button stays disabled and a forced submit shows the page-level consent message, with no field-level remedy and nothing sent', async () => {
      await openSavedCheck();
      expect(screen.getByRole('button', { name: 'Save linked vacancy' })).toBeDisabled();
      fireEvent.submit(screen.getByRole('button', { name: 'Save linked vacancy' }).closest('form') as HTMLFormElement); await flushFrames();
      expect(pageAlert()).toHaveTextContent('Review the saved-check link and confirm your choice before saving.');
      expect(document.querySelectorAll('.jl-field-error')).toHaveLength(0); expect(writes()).toHaveLength(0);
    });
    it('consent ticked but the link missing: the saved-check path keeps its page-level message and gets no field-level remedy', async () => {
      await openSavedCheck();
      fireEvent.click(screen.getByLabelText(/Save this vacancy privately and link it to this saved check/));
      fireEvent.click(screen.getByRole('button', { name: 'Save linked vacancy' })); await flushFrames();
      expect(pageAlert()).toHaveTextContent(BANNER);
      expect(document.querySelectorAll('.jl-field-error')).toHaveLength(0); expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
      expect(writes()).toHaveLength(0);
    });
  });
});
