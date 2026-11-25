import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { retainOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority } from '@/lib/tracking-draft-memory';

/**
 * A discoverability repair. When Next on the CV step is refused ONLY because the CV is empty, the message ("No readable CV text yet. Paste ... or choose a readable file.") now has a
 * visible action, "Build a CV from my answers", that opens the existing guided builder and puts the cursor in its first field. Short text, a failed file read and every other error keep
 * their own guidance and get no action. The builder's name is seeded from the page's name at most once, while the visitor has not edited or cleared it. Nothing else changes: the CV text,
 * approvals, the preview, the deliberate Use, review, consent and Save. All data is fictional and nothing leaves the test.
 */
vi.unmock('react-router-dom');
const state = vi.hoisted(() => ({ call: vi.fn(), extract: vi.fn(), metadata: undefined as unknown }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a', user_metadata: state.metadata }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: state.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: state.extract }));

const ACTION = 'Build a CV from my answers';
const EMPTY = 'No readable CV text yet. Paste your career record into the CV text field, or choose a readable file.';
const EDUCATION = 'BSc Fictional Studies, Example University, 2021 to 2024. Final project: a supervised data-cleaning study, with documented observations.';
const open = () => render(<MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>);
const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
const action = () => screen.queryByRole('button', { name: ACTION });
const builder = () => document.querySelector('details.jl-cv-builder') as HTMLDetailsElement;
const nameInBuilder = () => screen.getByLabelText('What name should appear on your CV?') as HTMLInputElement;
const pageName = () => screen.getByLabelText('Name on your CV') as HTMLInputElement;
const cvBox = () => screen.getByLabelText('Your CV text') as HTMLTextAreaElement;
const writes = () => state.call.mock.calls.filter(call => call[1].action === 'save_profile');

async function toCvStep(options: { name?: string } = {}) {
  open(); await screen.findByLabelText('Search or add a role');
  fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' })); next();
  fireEvent.click(screen.getByRole('button', { name: 'Add United States' })); next(); next(); next();
  await screen.findByLabelText('Your CV text');
  if (options.name !== undefined) fireEvent.change(pageName(), { target: { value: options.name } });
}

beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); state.call.mockReset(); state.extract.mockReset(); state.metadata = { full_name: 'Casey Fictional' };
  state.call.mockImplementation(async (_owner: string, request: { action: string; profile?: unknown }) => request.action === 'get_existing' ? { existingState: 'active', snapshot: { lifecycleGeneration: 7, recordVersion: 22, profile: null } } : { snapshot: { lifecycleGeneration: 7, recordVersion: 23, profile: { ...(request.profile as object), revision: 1, updatedAt: '2026-11-25T00:00:00.000Z' } } });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External transport prohibited'));
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('the action appears only when the CV is the one thing missing', () => {
  it('an empty CV: the existing message stays, the action is beside it, paste and upload stay available, and there is no dashboard link', async () => {
    await toCvStep();
    next();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(EMPTY);
    expect(action()).toBeInTheDocument(); expect(alert).toContainElement(action());
    expect(cvBox()).toBeEnabled(); expect(screen.getByLabelText('Upload a CV or LinkedIn PDF')).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Check my saved dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Paste my CV text instead' })).not.toBeInTheDocument();   // those belong to a failed file read
  });
  it('a CV that is only spaces counts as empty', async () => {
    await toCvStep();
    fireEvent.change(cvBox(), { target: { value: '   ' } }); next();
    expect(screen.getByRole('alert')).toHaveTextContent('No readable CV text yet');
    expect(action()).toBeInTheDocument();
  });
  it('short text keeps its own message and gets no action', async () => {
    await toCvStep();
    fireEvent.change(cvBox(), { target: { value: 'Too short.' } }); next();
    expect(screen.getByRole('alert')).toHaveTextContent('Too little readable CV text');
    expect(action()).not.toBeInTheDocument();
  });
  it('a file that could not be read keeps its recovery and gets no build action', async () => {
    await toCvStep();
    state.extract.mockRejectedValue(new Error('Fictional unreadable file. Paste your CV text instead.'));
    fireEvent.change(screen.getByLabelText('Upload a CV or LinkedIn PDF'), { target: { files: [new File(['x'], 'cv.pdf')] } });
    expect(await screen.findByRole('button', { name: 'Paste my CV text instead' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeEnabled();
    expect(action()).not.toBeInTheDocument();
  });
  it('other errors keep their guidance and get no action: a step that needs an answer, a wrong optional field', async () => {
    open(); await screen.findByLabelText('Search or add a role');
    next();
    expect(screen.getByRole('alert')).toHaveTextContent('Add between one and ten role titles'); expect(action()).not.toBeInTheDocument();
    cleanup(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a');
    await toCvStep();
    fireEvent.click(screen.getByText('Optional details'));
    fireEvent.change(screen.getByLabelText('Contact line for your CV (optional)'), { target: { value: 'x'.repeat(501) } });
    next();
    expect(screen.getByRole('alert')).toHaveTextContent('contact line under 500'); expect(action()).not.toBeInTheDocument();
  });
  it('the first-error order is kept when the page name is missing: the name message first, no action; once the name is there, the CV message and the action', async () => {
    state.metadata = undefined;
    await toCvStep();
    expect(pageName()).toHaveValue('');
    next();
    expect(screen.getByRole('alert')).toHaveTextContent('Add the name you want on your CV, up to 120 characters.');
    expect(action()).not.toBeInTheDocument();
    fireEvent.change(pageName(), { target: { value: 'Casey Fictional' } }); next();
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY); expect(action()).toBeInTheDocument();
  });
  it('the action goes away as soon as the CV text is edited (the error is cleared), and pasting then works as before', async () => {
    await toCvStep();
    next(); expect(action()).toBeInTheDocument();
    fireEvent.change(cvBox(), { target: { value: EDUCATION + ' Plus a second sentence about a project.' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(action()).not.toBeInTheDocument();
    next(); expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Review your Automated Job Loop setup');
  });
  it('the ordinary upload path is unchanged by the action existing', async () => {
    await toCvStep();
    next(); expect(action()).toBeInTheDocument();
    state.extract.mockResolvedValue(`Casey Fictional\nEducation\n${EDUCATION}`);
    fireEvent.change(screen.getByLabelText('Upload a CV or LinkedIn PDF'), { target: { files: [new File(['x'], 'cv.pdf')] } });
    await screen.findByText('CV text is ready to review.');
    expect(cvBox().value).toContain('BSc Fictional Studies'); expect(action()).not.toBeInTheDocument();
  });
});

describe('activating the action', () => {
  it('opens the existing builder and puts the cursor in its first field, seeded with the page name; the CV text, consent and the record are left alone', async () => {
    await toCvStep();
    next();
    expect(builder().open).toBe(false);
    const callsBefore = state.call.mock.calls.length;
    fireEvent.click(action() as HTMLElement);
    expect(builder().open).toBe(true);
    expect(document.activeElement).toBe(nameInBuilder());
    expect(nameInBuilder()).toHaveValue('Casey Fictional');
    expect(cvBox()).toHaveValue(''); expect(pageName()).toHaveValue('Casey Fictional');
    expect(state.call.mock.calls.length).toBe(callsBefore);                            // no read, no write
    expect(writes()).toHaveLength(0);
    expect(document.querySelectorAll('details.jl-cv-builder')).toHaveLength(1);
  });
  it('seeds at most once, and only an untouched builder: an edited name stays, a name cleared on purpose stays cleared', async () => {
    await toCvStep();
    next(); fireEvent.click(action() as HTMLElement);
    expect(nameInBuilder()).toHaveValue('Casey Fictional');
    fireEvent.change(nameInBuilder(), { target: { value: 'Casey F.' } });
    next(); fireEvent.click(action() as HTMLElement);
    expect(nameInBuilder()).toHaveValue('Casey F.');                                   // edited: kept
    fireEvent.change(nameInBuilder(), { target: { value: '' } });
    next(); fireEvent.click(action() as HTMLElement);
    expect(nameInBuilder()).toHaveValue('');                                           // cleared on purpose: not filled again
    expect(document.activeElement).toBe(nameInBuilder());
  });
  it('the first field is also scrolled to the middle of the screen, away from the fixed bar (and the page is not moved by anything else)', async () => {
    const scrolled = vi.fn(); const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrolled });
    try {
      await toCvStep(); next(); scrolled.mockClear();
      fireEvent.click(action() as HTMLElement);
      const onField = scrolled.mock.contexts.filter(context => context === nameInBuilder());
      expect(onField).toHaveLength(1);
      expect(scrolled).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
    } finally { if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); }
  });
  it('a name cleared on purpose in the builder BEFORE the action ever seeded it is not filled in later', async () => {
    await toCvStep();
    fireEvent.click(screen.getByText('No CV yet? Build one with guided questions'));
    fireEvent.change(nameInBuilder(), { target: { value: 'Typed' } }); fireEvent.change(nameInBuilder(), { target: { value: '' } });
    next(); fireEvent.click(action() as HTMLElement);
    expect(nameInBuilder()).toHaveValue(''); expect(document.activeElement).toBe(nameInBuilder());
  });
  it('a builder name that came back with a remembered draft is not replaced either, even without a record that it was edited', async () => {
    setTrackingLoopGeneration('owner-a', 7);
    retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: 7 }, {
      profile: { ...blankLoopProfile('professional'), name: 'Casey Fictional', targetTitles: ['Business analyst'], locations: ['United States'] }, answers: { ...blankLoopCvAnswers(), name: 'Restored Name' },
      step: 4, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '', touched: [],
    });
    open(); await screen.findByLabelText('Your CV text');
    next(); fireEvent.click(action() as HTMLElement);
    expect(nameInBuilder()).toHaveValue('Restored Name');
  });
  it('a builder name the visitor typed before the action is never replaced by the page name', async () => {
    await toCvStep();
    fireEvent.click(screen.getByText('No CV yet? Build one with guided questions'));
    fireEvent.change(nameInBuilder(), { target: { value: 'Typed Before' } });
    next(); fireEvent.click(action() as HTMLElement);
    expect(nameInBuilder()).toHaveValue('Typed Before');
  });
  it('the visitor can still collapse the builder and reopen it with the action, which takes the cursor again', async () => {
    await toCvStep();
    next(); fireEvent.click(action() as HTMLElement); expect(builder().open).toBe(true);
    builder().open = false; expect(builder().open).toBe(false);                        // collapsed by the person
    fireEvent.click(action() as HTMLElement);
    expect(builder().open).toBe(true); expect(document.activeElement).toBe(nameInBuilder());
  });
  it('a repeated rejection: after typing and clearing, refusing again shows the action once more, with one builder, and the alert takes the cursor again', async () => {
    await toCvStep();
    next(); fireEvent.click(action() as HTMLElement);
    fireEvent.change(cvBox(), { target: { value: 'something' } }); fireEvent.change(cvBox(), { target: { value: '' } });   // typed, then cleared: the message is gone meanwhile
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    next();
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY); expect(action()).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(document.querySelectorAll('details.jl-cv-builder')).toHaveLength(1);
    next();                                                                            // the same refusal again with nothing changed
    expect(action()).toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveFocus();
    fireEvent.click(action() as HTMLElement); expect(document.activeElement).toBe(nameInBuilder());
  });
  it('keyboard: Tab from the alert reaches the action, Enter or Space takes the cursor to the first builder field', async () => {
    for (const key of ['{Enter}', ' ']) {
      cleanup(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a');
      const user = userEvent.setup();
      await toCvStep();
      next();
      expect(screen.getByRole('alert')).toHaveFocus();
      await user.tab();
      expect(document.activeElement).toBe(action());
      await user.keyboard(key);
      expect(document.activeElement).toBe(nameInBuilder()); expect(builder().open).toBe(true);
    }
  });
  it('typing in the builder keeps the cursor there while the message is still on screen (the alert used to take focus on every render)', async () => {
    const user = userEvent.setup();
    await toCvStep();
    next(); fireEvent.click(action() as HTMLElement);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(nameInBuilder(), { target: { value: '' } });
    await user.type(nameInBuilder(), 'Casey');
    expect(nameInBuilder()).toHaveValue('Casey'); expect(document.activeElement).toBe(nameInBuilder());
    await user.click(screen.getByLabelText('What have you studied or trained in?'));
    await user.keyboard('BSc Fictional');
    expect(screen.getByLabelText('What have you studied or trained in?')).toHaveValue('BSc Fictional');
    expect(document.activeElement).toBe(screen.getByLabelText('What have you studied or trained in?'));
  });
  it('the alert still takes the cursor when an error is raised: the first refusal, and again when it is refused again', async () => {
    await toCvStep();
    next(); expect(screen.getByRole('alert')).toHaveFocus();
    cvBox().focus(); expect(document.activeElement).toBe(cvBox());
    next(); expect(screen.getByRole('alert')).toHaveFocus();
  });
});

describe('the rest of the flow is the existing one: preview, a deliberate Use, review, consent, one Save', () => {
  it('builds a CV from the visitor\'s own answers only and saves it once, after the explicit tick', async () => {
    const user = userEvent.setup();
    await toCvStep();
    next(); fireEvent.click(action() as HTMLElement);
    await user.click(screen.getByLabelText('What have you studied or trained in?')); await user.keyboard(EDUCATION);
    expect(cvBox()).toHaveValue('');                                                   // nothing is applied by typing
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    expect(cvBox()).toHaveValue('');                                                   // nor by the preview
    expect(screen.getByRole('heading', { name: 'Review your draft' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));        // only this applies it
    expect(cvBox().value).toBe(`Casey Fictional\n\nEducation\n${EDUCATION}`);
    next();
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].profile.sourceText).toBe(`Casey Fictional\n\nEducation\n${EDUCATION}`);   // exactly the arranged own words: nothing added
    expect(writes()[0][1].saveConsent).toBe(true);
    expect(state.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing', 'save_profile']);
    expect(globalThis.fetch).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
  });
  it('a refused Next after the action and some typing still creates no write and changes no approval', async () => {
    await toCvStep();
    next(); fireEvent.click(action() as HTMLElement);
    fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: EDUCATION } });
    next();
    expect(screen.getByRole('alert')).toHaveTextContent(EMPTY);
    expect(writes()).toHaveLength(0); expect(cvBox()).toHaveValue('');
  });
  it('a reopened draft: the builder answers (including the seeded name) come back with the draft, and the seeding is not repeated over a cleared name', async () => {
    await toCvStep();
    next(); fireEvent.click(action() as HTMLElement);
    fireEvent.change(nameInBuilder(), { target: { value: '' } });
    cleanup();                                                                         // the page is left and opened again inside the tab's memory
    open(); await screen.findByLabelText('Your CV text');
    next(); fireEvent.click(action() as HTMLElement);
    expect(nameInBuilder()).toHaveValue('');
  });
});

/**
 * Round 2 (Codex, review of 598401b): the request to open and focus the builder was kept in the page, so when the CV step was entered again (Back then Next, or Back from Review) the
 * builder mounted again, saw the old positive request and opened itself again with another focus and scroll. A request now belongs to ONE deliberate activation: the builder tells the
 * page when it has acted and the page clears it. A later deliberate click, after a new refusal, still opens and focuses.
 */
describe('one request per deliberate activation', () => {
  const heading = () => screen.getByRole('heading', { level: 1 });
  const education = () => screen.getByLabelText('What have you studied or trained in?') as HTMLTextAreaElement;
  const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  function watch() {
    const scrolled = vi.fn(), focused = vi.fn(); const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrolled });
    const listener = (event: Event) => { if (event.target instanceof HTMLInputElement && event.target.closest('details.jl-cv-builder') && event.target.id.endsWith('-name')) focused(); };
    document.addEventListener('focusin', listener);
    const onField = () => scrolled.mock.contexts.filter(context => context instanceof HTMLInputElement && (context as HTMLElement).closest('details.jl-cv-builder')).length;
    return { onField, focusedCount: () => focused.mock.calls.length, reset: () => { scrolled.mockClear(); focused.mockClear(); },
      stop: () => { document.removeEventListener('focusin', listener); if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); } };
  }

  it('(1) open with the button, type, collapse, Back to the privacy step, Next: the builder stays closed, nothing is focused or scrolled, the step heading has the cursor, the answers are kept', async () => {
    const watcher = watch();
    try {
      await toCvStep();
      next(); fireEvent.click(action() as HTMLElement);
      expect(builder().open).toBe(true); expect(document.activeElement).toBe(nameInBuilder());
      fireEvent.change(education(), { target: { value: EDUCATION } });
      builder().open = false;
      watcher.reset();
      back();
      expect(heading()).toHaveTextContent('What should stay private?');
      next();
      expect(heading()).toHaveTextContent('Bring your experience');
      expect(builder().open).toBe(false);                                              // not reopened
      expect(document.activeElement).toBe(heading());                                  // the ordinary step-heading focus
      expect(watcher.focusedCount()).toBe(0); expect(watcher.onField()).toBe(0);       // no stray focus or scroll on the builder
      expect(education()).toHaveValue(EDUCATION); expect(nameInBuilder()).toHaveValue('Casey Fictional');   // the typed answers survived
      expect(cvBox()).toHaveValue(''); expect(writes()).toHaveLength(0);
    } finally { watcher.stop(); }
  });

  it('(2) returning from Review to the CV step does not replay it either, and the draft that was used is still there; one deliberate Save writes once', async () => {
    const user = userEvent.setup(); const watcher = watch();
    try {
      await toCvStep();
      next(); fireEvent.click(action() as HTMLElement);
      await user.click(education()); await user.keyboard(EDUCATION);
      fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' })); fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));
      next();
      expect(heading()).toHaveTextContent('Review your Automated Job Loop setup');
      watcher.reset();
      back();
      expect(heading()).toHaveTextContent('Bring your experience');
      expect(builder().open).toBe(false);
      expect(document.activeElement).toBe(heading());
      expect(watcher.focusedCount()).toBe(0); expect(watcher.onField()).toBe(0);
      expect(cvBox().value).toBe(`Casey Fictional\n\nEducation\n${EDUCATION}`);
      expect(writes()).toHaveLength(0);
      next();
      fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
      await screen.findByRole('heading', { name: 'Your setup is saved.' });
      expect(writes()).toHaveLength(1);
    } finally { watcher.stop(); }
  });

  it('(3) a later deliberate click, after a new refusal and after the first request was consumed, opens and focuses again, once each time', async () => {
    const watcher = watch();
    try {
      await toCvStep();
      next(); fireEvent.click(action() as HTMLElement);                                // first activation
      expect(watcher.focusedCount()).toBe(1); expect(watcher.onField()).toBe(1);
      builder().open = false;
      back(); next();                                                                  // leave and come back: nothing replays
      expect(builder().open).toBe(false); expect(watcher.focusedCount()).toBe(1); expect(watcher.onField()).toBe(1);
      next();                                                                          // a new refusal on the re-entered step
      expect(screen.getByRole('alert')).toHaveTextContent(EMPTY); expect(action()).toBeInTheDocument();
      fireEvent.click(action() as HTMLElement);                                        // a new deliberate click
      expect(builder().open).toBe(true); expect(document.activeElement).toBe(nameInBuilder());
      expect(watcher.focusedCount()).toBe(2); expect(watcher.onField()).toBe(2);
      builder().open = false;
      fireEvent.click(action() as HTMLElement);                                        // and again, without leaving
      expect(builder().open).toBe(true); expect(document.activeElement).toBe(nameInBuilder()); expect(watcher.onField()).toBe(3);   // (jsdom keeps the cursor in the hidden field, so only the scroll is counted here)
      builder().open = false;
      back(); next();                                                                  // the last request is consumed too
      expect(builder().open).toBe(false); expect(watcher.focusedCount()).toBe(2); expect(watcher.onField()).toBe(3);
      expect(writes()).toHaveLength(0);
    } finally { watcher.stop(); }
  });

  it('the request is cleared once handled: the builder reports it handled once per request and a remount with no pending request does nothing', async () => {
    const { default: LoopCvBuilder } = await import('@/pages/LoopCvBuilder');
    const props = { answers: blankLoopCvAnswers(), onChange: vi.fn(), source: '', onUse: vi.fn(() => true), disabled: false };
    const handled = vi.fn();
    const view = render(<LoopCvBuilder {...props} focusRequest={1} onFocusHandled={handled} />);
    expect(handled).toHaveBeenCalledTimes(1); expect((document.querySelector('details.jl-cv-builder') as HTMLDetailsElement).open).toBe(true);
    view.rerender(<LoopCvBuilder {...props} focusRequest={1} onFocusHandled={handled} />);
    expect(handled).toHaveBeenCalledTimes(1);                                          // the same request is not handled twice
    view.rerender(<LoopCvBuilder {...props} focusRequest={0} onFocusHandled={handled} />);
    expect(handled).toHaveBeenCalledTimes(1);                                          // 0 means nothing pending
    view.rerender(<LoopCvBuilder {...props} focusRequest={1} onFocusHandled={handled} />);
    expect(handled).toHaveBeenCalledTimes(2);                                          // a new request after the clear is handled
    view.unmount();
    render(<LoopCvBuilder {...props} focusRequest={0} onFocusHandled={handled} />);
    expect((document.querySelector('details.jl-cv-builder') as HTMLDetailsElement).open).toBe(false); expect(handled).toHaveBeenCalledTimes(2);
  });

  it('a new callback identity never replays a request, and the newest callback is the one told when the next request arrives', async () => {
    const { default: LoopCvBuilder } = await import('@/pages/LoopCvBuilder');
    const props = { answers: blankLoopCvAnswers(), onChange: vi.fn(), source: '', onUse: vi.fn(() => true), disabled: false };
    const first = vi.fn(), second = vi.fn(), third = vi.fn();
    const view = render(<LoopCvBuilder {...props} focusRequest={1} onFocusHandled={first} />);
    expect(first).toHaveBeenCalledTimes(1);
    view.rerender(<LoopCvBuilder {...props} focusRequest={1} onFocusHandled={second} />);   // same request, new function: nothing happens again
    view.rerender(<LoopCvBuilder {...props} focusRequest={1} onFocusHandled={third} />);
    expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled(); expect(third).not.toHaveBeenCalled();
    view.rerender(<LoopCvBuilder {...props} focusRequest={2} onFocusHandled={third} />);    // a new request reaches the newest callback only
    expect(third).toHaveBeenCalledTimes(1); expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
  });
});
