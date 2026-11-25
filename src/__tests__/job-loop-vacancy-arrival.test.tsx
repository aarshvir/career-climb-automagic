import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '../pages/JobLoop';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blankLoopProfile } from '../lib/job-loop-audiences';
import { clearLoopWorkingDraft } from '../lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '../lib/tracking-draft-memory';
import type { LoopAction, LoopResponse, LoopRun, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'arrival-owner' } as { id: string } | null, loading: false, authError: null as string | null }, call: vi.fn(), cvs: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({ callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs, getLoopDownload: vi.fn(), getLoopPreview: vi.fn(), isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value }));

const css = readFileSync(resolve(process.cwd(), 'src/pages/JobLoop.css'), 'utf8');
const ACTION = 'Add a vacancy I already found';
const NO_MATCH = 'No new matching jobs were found in the sources checked. Try broader roles or locations, or add a vacancy yourself.';
const PARTIAL = 'Some source checks could not finish. See source details, retry after resolving the issue, or add a vacancy yourself.';
const CV = 'Developed Python reports for a fictional university project using synthetic data. Assisted with reporting during a fictional internship.';
type Kind = 'nomatch' | 'partial' | 'noscope';
let current: LoopSnapshot;

function run(kind: Kind): LoopRun {
  const at = '2026-11-25T09:00:00.000Z';
  const lane = (name: string, status: LoopRun['lanes'][number]['status'], message: string) => ({ name, status, count: 0, checkedAt: at, message });
  return { id: '11111111-1111-4111-8111-111111111111', requestId: '22222222-2222-4222-8222-222222222222', status: kind === 'partial' ? 'partial' : 'completed', phase: 'report', startedAt: at, finishedAt: at,
    inputHash: '33333333-3333-4333-8333-333333333333', provider: 'rules', model: 'grounded-rules-v1', opportunityIds: [], packetIds: [], messages: [], reservedUsd: 0, usageUsd: 0,
    nextAction: kind === 'partial' ? PARTIAL : NO_MATCH,
    lanes: [lane('Recruitment inbox', 'not_run', 'Mailbox processing was not requested.'), kind === 'partial' ? lane('greenhouse:fictional-board-b', 'blocked', 'Source read failed or was blocked; it was not treated as an empty market.') : lane('greenhouse:fictional-board-b', 'completed', 'Published-list records read: 87.')] };
}
function snapshot(kind: Kind): LoopSnapshot {
  const base: LoopSnapshot = {
    lifecycleGeneration: 0, recordVersion: 3,
    profile: { ...blankLoopProfile('student'), name: 'Fictional Casey', sourceText: CV, targetTitles: ['Graduate analyst'], locations: ['Remote'], revision: 1, updatedAt: '2026-11-20T00:00:00Z' },
    claims: [{ id: 'claim-a', revision: 1, status: 'active', createdAt: '2026-11-20T00:00:00Z', sourceKind: 'cv_passage', sourceQuote: CV, phrasing: CV, context: 'Fictional university project', kind: 'academic_project', resultStatus: 'not_measured', confirmed: true, shareable: true }],
    opportunities: [], runs: [run(kind)], packets: [], inbox: [], models: [],
    capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 1 },
    gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false },
  };
  if (kind === 'noscope') { delete base.lifecycleGeneration; base.claims = []; }
  return base;
}
const tree = () => <HelmetProvider><MemoryRouter initialEntries={['/loop']}><JobLoop /></MemoryRouter></HelmetProvider>;
const actions = () => mocks.call.mock.calls.map(([, action]) => (action as LoopAction).action);
const heading = () => document.getElementById('jl-add-opportunity-heading') as HTMLElement;
const tabButton = (name: string) => screen.getByRole('button', { name });
const pressed = () => screen.getAllByRole('button').find(button => button.getAttribute('aria-pressed') === 'true' && ['Today', 'My CV & experience', 'Opportunities', 'Prepared CVs', 'Help & privacy'].includes(button.textContent?.trim() ?? ''))?.textContent?.trim();

// jsdom has no layout and no frames of its own: collect the page's animation frames so a test decides when the next frame runs, and record what is scrolled.
let frames: Map<number, FrameRequestCallback>, nextFrame: number, scrolled: ReturnType<typeof vi.fn>, restoreScroll: () => void, reduce: boolean;
async function flushFrames() { await act(async () => { const pending = [...frames.entries()]; frames.clear(); pending.forEach(([, callback]) => callback(performance.now())); }); }
const headingScrolls = () => scrolled.mock.contexts.filter(context => context === heading()).length;
const headingScrollOptions = () => scrolled.mock.calls[scrolled.mock.contexts.lastIndexOf(heading())]?.[0] as ScrollIntoViewOptions | undefined;
async function open(kind: Kind = 'nomatch') {
  current = snapshot(kind);
  render(tree());
  return await screen.findByRole('button', { name: ACTION });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 'arrival-owner' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('arrival-owner');
  mocks.cvs.mockResolvedValue([]);
  mocks.call.mockImplementation(async (_owner: string, action: LoopAction): Promise<LoopResponse> => {
    if (action.action === 'get') return { snapshot: structuredClone(current) };
    throw new Error('Unexpected action in the vacancy-arrival fixture: ' + action.action);
  });
  frames = new Map(); nextFrame = 0; reduce = false;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => ({ matches: reduce && query.includes('prefers-reduced-motion: reduce'), media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) });
  scrolled = vi.fn();
  const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrolled });
  restoreScroll = () => {
    if (originalScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll); else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia); else Reflect.deleteProperty(window, 'matchMedia');
  };
});
afterEach(() => { cleanup(); restoreScroll?.(); vi.restoreAllMocks(); });

describe('Today: "Add a vacancy I already found" opens the vacancy form', () => {
  it('opens Opportunities and, after the form has rendered (not inside the click), focuses the heading once and scrolls it to the top of the screen', async () => {
    const button = await open();
    expect(heading()).toHaveAttribute('tabindex', '-1');
    await act(async () => { button.focus(); });
    fireEvent.click(button);
    expect(pressed()).toBe('Opportunities');
    expect(screen.queryByRole('button', { name: ACTION })).not.toBeInTheDocument();      // the Today panel is gone, as on v106
    expect(heading()).not.toHaveFocus(); expect(headingScrolls()).toBe(0);                // nothing happens inside the click handler
    await flushFrames();
    expect(heading()).toHaveFocus(); expect(headingScrolls()).toBe(1);
    expect(headingScrollOptions()).toEqual({ block: 'start', behavior: 'smooth' });
    await flushFrames();
    expect(heading()).toHaveFocus(); expect(headingScrolls()).toBe(1);                    // one request, consumed once
    expect(actions().every(name => name === 'get')).toBe(true);                           // no write, no run
  });

  it('keeps the Vacancy title field next in the keyboard sequence', async () => {
    const button = await open();
    fireEvent.click(button); await flushFrames();
    expect(heading()).toHaveFocus();
    await userEvent.setup().tab();
    expect(screen.getByLabelText('Vacancy title')).toHaveFocus();
  });

  it('does the same for the partly read result, whose own message is unchanged', async () => {
    const button = await open('partial');
    expect(screen.getByRole('heading', { name: PARTIAL })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Search finished with some checks incomplete · report' })).toBeInTheDocument();
    fireEvent.click(button); await flushFrames();
    expect(heading()).toHaveFocus(); expect(headingScrolls()).toBe(1);
  });

  it('keeps the completed zero-match message distinct from the partly read one', async () => {
    await open('nomatch');
    expect(screen.getByRole('heading', { name: NO_MATCH })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Search finished · report' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: PARTIAL })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resume run/ })).not.toBeInTheDocument();
  });

  it('honours reduced motion: the scroll is not smooth', async () => {
    reduce = true;
    const button = await open();
    fireEvent.click(button); await flushFrames();
    expect(heading()).toHaveFocus();
    expect(headingScrollOptions()).toEqual({ block: 'start', behavior: 'auto' });
  });

  it('does not take focus back when the visitor has already moved it to another control', async () => {
    const button = await open();
    fireEvent.click(button);
    const elsewhere = screen.getByRole('button', { name: /Refresh records/ });
    elsewhere.focus();
    await flushFrames();
    expect(elsewhere).toHaveFocus(); expect(heading()).not.toHaveFocus(); expect(headingScrolls()).toBe(0);
    expect(pressed()).toBe('Opportunities');                                              // the destination itself still opened
  });

  it('does nothing, and forgets the request, when the visitor has already left the Opportunities tab', async () => {
    const button = await open();
    fireEvent.click(button);
    fireEvent.click(tabButton('Prepared CVs'));
    await flushFrames();
    expect(heading()).not.toHaveFocus(); expect(headingScrolls()).toBe(0);
    fireEvent.click(tabButton('Opportunities')); await flushFrames();                     // coming back by hand later is an ordinary arrival
    expect(heading()).not.toHaveFocus(); expect(headingScrolls()).toBe(0);
  });

  it('works again on a later deliberate activation, and never replays on tab switches', async () => {
    const button = await open();
    fireEvent.click(button); await flushFrames();
    expect(heading()).toHaveFocus(); expect(headingScrolls()).toBe(1);
    const away = tabButton('Prepared CVs'); await act(async () => { away.focus(); }); fireEvent.click(away); await flushFrames();
    const back = tabButton('Opportunities'); await act(async () => { back.focus(); }); fireEvent.click(back); await flushFrames();
    expect(heading()).not.toHaveFocus(); expect(back).toHaveFocus(); expect(headingScrolls()).toBe(1);   // a tab round trip replays nothing
    fireEvent.click(tabButton('Today'));
    fireEvent.click(await screen.findByRole('button', { name: ACTION })); await flushFrames();
    expect(heading()).toHaveFocus(); expect(headingScrolls()).toBe(2);                    // a new deliberate click, a new arrival
    fireEvent.click(tabButton('Today'));
    fireEvent.click(await screen.findByRole('button', { name: ACTION })); await flushFrames();
    expect(headingScrolls()).toBe(3);
    expect(actions().every(name => name === 'get')).toBe(true);
  });

  it('leaves ordinary tab switching alone: no focus or scroll beyond the tab button itself', async () => {
    await open();
    const opportunities = tabButton('Opportunities');
    await act(async () => { opportunities.focus(); });
    fireEvent.click(opportunities); await flushFrames();
    expect(pressed()).toBe('Opportunities');
    expect(opportunities).toHaveFocus(); expect(heading()).not.toHaveFocus(); expect(headingScrolls()).toBe(0);
    fireEvent.click(tabButton('Today')); await flushFrames();
    expect(headingScrolls()).toBe(0);
  });

  it('works without a saved-import scope (no lifecycle generation, no confirmed fact), where the import-specific steps are unavailable', async () => {
    // The saved-check import panel is rendered only when the page has a saved-import scope (the control record shows it, the no-scope record does not).
    await open('nomatch');
    fireEvent.click(tabButton('My CV & experience'));
    expect(screen.getByRole('heading', { name: 'Continue from a saved CV check' })).toBeInTheDocument();
    cleanup(); frames.clear();
    await open('noscope');
    fireEvent.click(tabButton('My CV & experience'));
    expect(screen.queryByRole('heading', { name: 'Continue from a saved CV check' })).not.toBeInTheDocument();   // the openSetupStep prerequisite really is absent here
    fireEvent.click(tabButton('Today'));
    const button = await screen.findByRole('button', { name: ACTION });
    fireEvent.click(button); await flushFrames();
    expect(pressed()).toBe('Opportunities');
    expect(heading()).toHaveFocus(); expect(headingScrolls()).toBe(1);
    expect(actions().every(name => name === 'get')).toBe(true);
  });

  it('does nothing when the page is gone before the frame runs', async () => {
    const button = await open();
    fireEvent.click(button);
    mocks.auth.user = null;
    await act(async () => { cleanup(); });
    await flushFrames();
    expect(headingScrolls()).toBe(0);
  });

  it('gives the form heading its own scroll margin, so it lands under the sticky header', () => {
    expect(css).toMatch(/#jl-add-opportunity-heading\s*\{[^}]*scroll-margin-top:\s*16px/);
  });
});

describe('opening the form changes no data', () => {
  it('sends only the record read: no save, no search run, nothing typed or submitted', async () => {
    const button = await open();
    fireEvent.click(button); await flushFrames();
    await waitFor(() => expect(heading()).toHaveFocus());
    expect(actions().every(name => name === 'get')).toBe(true);
    expect(screen.getByLabelText('Vacancy title')).toHaveValue('');
  });
});
