import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';

/**
 * A usability change: after a file is read successfully and its text applied, a short visible line ("CV text is ready to review.") appears under the upload control, in a live region
 * that is always on the page (so the text appearing in it is announced politely). On the CV step and on the early CV box of step 1. It says nothing about a file name or the CV,
 * moves no focus, and follows the CURRENT result only. All data is fictional and nothing leaves the test.
 */
vi.unmock('react-router-dom');
const state = vi.hoisted(() => ({ call: vi.fn(), extract: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a' }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: state.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: state.extract }));

const MESSAGE = 'CV text is ready to review.';
const FIRST = 'Fictional Casey\nEducation\nBSc Fictional Studies, Example University, 2024. Final project: a supervised data-cleaning study with documented observations.';
const SECOND = 'Fictional Casey\nExperience\nResearch assistant, Example Institute, 2024-2025. Prepared weekly summary tables from fictional survey data and wrote short reports.';
const file = (name = 'private-cv-name.pdf') => new File(['x'], name);
const open = () => render(<MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>);
const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
const live = () => document.querySelector('.oq-read-live') as HTMLElement;
const cvStepInput = () => screen.getByLabelText('Upload a CV or LinkedIn PDF') as HTMLInputElement;
const earlyInput = () => screen.getByLabelText('Upload a CV for role suggestions') as HTMLInputElement;
const choose = (input: HTMLInputElement, selected: File[] = [file()]) => fireEvent.change(input, { target: { files: selected } });
const settle = async () => { await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }); };
const deferred = () => { let resolve!: (value: string) => void, reject!: (error: Error) => void; const promise = new Promise<string>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const box = () => screen.getByLabelText('Your CV text') as HTMLTextAreaElement;
const note = (input: HTMLInputElement) => input.nextElementSibling as HTMLElement;
const words = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const CV_FULL = 'Readable PDF, DOCX or TXT, up to 5 MB. Your file is read on this device; review the extracted text below.';
const EARLY_FULL = 'PDF, DOCX or TXT, up to 5 MB. Read locally on this device.';
const AFTER = 'PDF, DOCX or TXT, up to 5 MB, on this device.';

async function toCvStep() {
  const view = open(); await screen.findByLabelText('Search or add a role');
  fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' })); next();
  fireEvent.click(screen.getByRole('button', { name: 'Add United States' })); next();
  next(); next();
  await screen.findByLabelText('Your CV text');
  fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Casey F.' } });
  return view;
}

beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); state.call.mockReset(); state.extract.mockReset();
  state.call.mockImplementation(async (_owner: string, action: { action: string; profile?: unknown }) => action.action === 'get_existing' ? { existingState: 'active', snapshot: { lifecycleGeneration: 7, recordVersion: 22, profile: null } } : { snapshot: { lifecycleGeneration: 7, recordVersion: 23, profile: { ...(action.profile as object), revision: 1, updatedAt: '2026-11-24T00:00:00.000Z' } } });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External transport prohibited'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('(a) a file is read and its text applied: the line appears, beside the upload control, politely announced', () => {
  it('on the CV step: an always-present live region gets the line; nothing else moves; no file name or CV text in it', async () => {
    const scrolled = vi.fn(); const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrolled });
    try {
      await toCvStep();
      state.extract.mockResolvedValue(FIRST);
      const region = live(), input = cvStepInput();
      expect(region).toHaveAttribute('aria-live', 'polite'); expect(region).toHaveAttribute('aria-atomic', 'true');
      expect(region).toBeEmptyDOMElement();                                          // present and empty BEFORE the read: a content change is announced
      expect(input.nextElementSibling).toContainElement(region);                      // inside the guidance paragraph directly under the upload control
      expect(input.nextElementSibling?.tagName).toBe('P');
      input.focus(); scrolled.mockClear();
      choose(input, [file('private-cv-name.pdf')]);
      await waitFor(() => expect(box()).toHaveValue(FIRST));
      expect(live()).toBe(region);                                                    // the same region, its content changed
      expect(region).toHaveTextContent(MESSAGE);
      expect(region.textContent?.trim()).toBe(MESSAGE);
      expect(screen.getByText(MESSAGE)).toBeVisible();
      expect(document.body.textContent).not.toContain('private-cv-name');             // no file name anywhere
      expect(region.textContent).not.toContain('Fictional');                          // no CV content in the message
      expect(document.activeElement).toBe(input);                                     // focus was not moved
      expect(scrolled).toHaveBeenCalledTimes(1);                                      // only the line itself, by the least amount ("nearest"), never the text box
      expect((scrolled.mock.contexts[0] as HTMLElement).className).toBe('oq-read-ok');
      expect(scrolled).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
      expect(region.querySelector('button, a, input')).toBeNull();                    // nothing to tap, so nothing for click tracking to describe
    } finally { if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); }
  });

  it('on the early CV box of step 1 as well, and it is not shown on the CV step when it was said on step 1', async () => {
    open(); await screen.findByLabelText('Search or add a role');
    fireEvent.click(screen.getByText('Suggest roles from my CV (optional)'));
    state.extract.mockResolvedValue(FIRST);
    const input = earlyInput(), region = live();
    expect(region).toBeEmptyDOMElement(); expect(input.nextElementSibling).toContainElement(region);
    choose(input);
    await waitFor(() => expect(screen.getByLabelText('Paste your CV for role suggestions')).toHaveValue(FIRST));
    expect(region.textContent?.trim()).toBe(MESSAGE);
    fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' })); next();
    fireEvent.click(screen.getByRole('button', { name: 'Add United States' })); next(); next(); next();
    await screen.findByLabelText('Your CV text');
    expect(live()).toBeEmptyDOMElement();                                             // that read was on another step
  });

});

/**
 * Round 2 (Codex, review of 2f070cc): a separate line pushed the imported text under the fixed action bar (45 px of the CV box visible became 16.7 px, 3.7 px for the first line).
 * The confirmation now lives in the existing guidance paragraph, which keeps the file types, the size limit and "on this device" in fewer words, so nothing is taller than before.
 * jsdom has no layout: these tests pin the structure and the words; the phone measurement (320, 360 and 390 px) is in the browser harness.
 */
describe('the confirmation is part of the existing guidance paragraph', () => {
  it('CV step: the default guidance is exactly as before; after a read the paragraph is shorter, has the same elements around it and still says the types, the limit and "on this device"', async () => {
    await toCvStep();
    state.extract.mockResolvedValue(FIRST);
    const input = cvStepInput(), field = input.parentElement as HTMLElement;
    expect(words(note(input).textContent)).toBe(CV_FULL);
    const beforeChildren = field.children.length, beforeLength = words(note(input).textContent).length;
    choose(input); await waitFor(() => expect(live().textContent?.trim()).toBe(MESSAGE));
    expect(field.children.length).toBe(beforeChildren);                                // no new element between the control and the CV box
    expect(words(note(input).textContent)).toBe(`${MESSAGE} ${AFTER}`);
    expect(words(note(input).textContent).length).toBeLessThan(beforeLength);          // fewer characters than before: never more lines
    for (const kept of ['PDF, DOCX or TXT', 'up to 5 MB', 'on this device']) expect(note(input).textContent).toContain(kept);
  });
  it('early CV box: the default guidance is exactly as before; after a read it has the same elements and keeps the types, the limit and "on this device"', async () => {
    open(); await screen.findByLabelText('Search or add a role');
    fireEvent.click(screen.getByText('Suggest roles from my CV (optional)'));
    state.extract.mockResolvedValue(FIRST);
    const input = earlyInput(), field = input.parentElement as HTMLElement;
    expect(words(note(input).textContent)).toBe(EARLY_FULL);
    const beforeChildren = field.children.length;
    choose(input); await waitFor(() => expect(live().textContent?.trim()).toBe(MESSAGE));
    expect(field.children.length).toBe(beforeChildren);
    expect(words(note(input).textContent)).toBe(`${MESSAGE} ${AFTER}`);
    for (const kept of ['PDF, DOCX or TXT', 'up to 5 MB', 'on this device']) expect(note(input).textContent).toContain(kept);
  });
  it('only the sentence is announced: the live region is a span inside the paragraph, the paragraph is not live, and the region never holds the guidance', async () => {
    await toCvStep();
    state.extract.mockResolvedValue(FIRST);
    const input = cvStepInput(), paragraph = note(input), region = live();
    const seen: string[] = [];
    new MutationObserver(() => seen.push(words(region.textContent))).observe(region, { childList: true, characterData: true, subtree: true });
    expect(region.tagName).toBe('SPAN'); expect(paragraph.contains(region)).toBe(true);
    expect(paragraph).not.toHaveAttribute('aria-live'); expect(paragraph).not.toHaveAttribute('role');
    choose(input); await waitFor(() => expect(region.textContent?.trim()).toBe(MESSAGE));
    fireEvent.change(box(), { target: { value: `${FIRST} edited` } });               // the guidance text changes back too, which must not announce anything
    await settle();
    expect(seen.length).toBeGreaterThan(0);
    for (const value of seen) expect([MESSAGE, '']).toContain(value);                  // every change to the live region is the sentence appearing or going
    expect(region).toBeEmptyDOMElement();
  });
  it('when the line goes (typing, a failed read, a new read, a step change) the full guidance is back', async () => {
    await toCvStep();
    const input = cvStepInput();
    state.extract.mockResolvedValueOnce(FIRST); choose(input); await waitFor(() => expect(live().textContent?.trim()).toBe(MESSAGE));
    fireEvent.change(box(), { target: { value: `${FIRST} edited` } });
    expect(words(note(input).textContent)).toBe(CV_FULL);
    state.extract.mockResolvedValueOnce(FIRST); choose(input); await waitFor(() => expect(live().textContent?.trim()).toBe(MESSAGE));
    state.extract.mockRejectedValueOnce(new Error('Fictional unreadable file. Paste your CV text instead.')); choose(input);
    await screen.findByRole('button', { name: 'Paste my CV text instead' });
    expect(words(note(input).textContent)).toBe(CV_FULL);
  });
});

describe('(b) a picker that is cancelled says nothing', () => {
  it('no file: no read, no line; with an earlier success the (still true) line is left as it was', async () => {
    await toCvStep();
    choose(cvStepInput(), []);
    expect(state.extract).not.toHaveBeenCalled(); expect(live()).toBeEmptyDOMElement();
    state.extract.mockResolvedValue(FIRST);
    choose(cvStepInput()); await waitFor(() => expect(live().textContent?.trim()).toBe(MESSAGE));
    choose(cvStepInput(), []);
    expect(state.extract).toHaveBeenCalledTimes(1); expect(live().textContent?.trim()).toBe(MESSAGE); expect(box()).toHaveValue(FIRST);
  });
});

describe('(c) an invalid or unreadable file keeps the existing recovery, says no success, and clears an earlier line', () => {
  it('shows the recovery and no line', async () => {
    await toCvStep();
    state.extract.mockRejectedValue(new Error('Fictional unreadable file. Paste your CV text instead.'));
    choose(cvStepInput());
    expect(await screen.findByRole('button', { name: 'Paste my CV text instead' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeEnabled();
    expect(live()).toBeEmptyDOMElement(); expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });
  it('a previous success line is cleared as soon as the next read starts, and stays cleared when that read fails', async () => {
    await toCvStep();
    state.extract.mockResolvedValueOnce(FIRST);
    choose(cvStepInput()); await waitFor(() => expect(live().textContent?.trim()).toBe(MESSAGE));
    const pending = deferred(); state.extract.mockReturnValueOnce(pending.promise);
    choose(cvStepInput(), [file('second.pdf')]);
    expect(live()).toBeEmptyDOMElement();                                             // cleared while the new file is being read
    await act(async () => { pending.reject(new Error('Fictional unreadable file. Paste your CV text instead.')); });
    await screen.findByRole('button', { name: 'Paste my CV text instead' });
    expect(live()).toBeEmptyDOMElement();
    expect(box()).toHaveValue(FIRST);                                                 // the text from the first file is still what the box holds; no line claims otherwise
  });
});

describe('(d) a read that times out and then succeeds late', () => {
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  it('keeps the timeout recovery and says nothing: a late result never applies (as in v96) so it never confirms', async () => {
    await toCvStep();
    vi.useFakeTimers();
    const late = deferred(); state.extract.mockReturnValueOnce(late.promise);
    choose(cvStepInput());
    await advance(30_001);
    expect(screen.getByRole('alert')).toHaveTextContent('Reading your CV is taking too long');
    expect(live()).toBeEmptyDOMElement();
    await act(async () => { late.resolve(FIRST); });
    expect(live()).toBeEmptyDOMElement(); expect(box()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Paste my CV text instead' })).toBeEnabled();    // the recovery is still what the visitor has
  });
  it('a newer choice wins: the older read that finishes after it is ignored and the line stays for the newer result', async () => {
    await toCvStep();
    vi.useFakeTimers();
    const old = deferred(); state.extract.mockReturnValueOnce(old.promise);
    choose(cvStepInput());
    await advance(30_001);
    state.extract.mockResolvedValueOnce(SECOND);
    choose(cvStepInput(), [file('newer.pdf')]);
    await advance(0);
    expect(box()).toHaveValue(SECOND); expect(live().textContent?.trim()).toBe(MESSAGE);
    await act(async () => { old.resolve(FIRST); });
    expect(box()).toHaveValue(SECOND); expect(live().textContent?.trim()).toBe(MESSAGE);
  });
  it('a late FAILURE after a newer success changes nothing either', async () => {
    await toCvStep();
    vi.useFakeTimers();
    const old = deferred(); state.extract.mockReturnValueOnce(old.promise);
    choose(cvStepInput()); await advance(30_001);
    state.extract.mockResolvedValueOnce(SECOND); choose(cvStepInput(), [file('newer.pdf')]); await advance(0);
    await act(async () => { old.reject(new Error('Fictional late failure')); });
    expect(live().textContent?.trim()).toBe(MESSAGE); expect(screen.queryByText(/Fictional late failure/)).not.toBeInTheDocument();
  });
});

describe('(e) another file after a success: the line follows the newest result', () => {
  it('is cleared while the second file is read and returns only when its text is applied', async () => {
    await toCvStep();
    state.extract.mockResolvedValueOnce(FIRST);
    choose(cvStepInput()); await waitFor(() => expect(live().textContent?.trim()).toBe(MESSAGE));
    const pending = deferred(); state.extract.mockReturnValueOnce(pending.promise);
    choose(cvStepInput(), [file('second.pdf')]);
    expect(live()).toBeEmptyDOMElement(); expect(screen.getByRole('status')).toHaveTextContent('Reading your CV');
    await act(async () => { pending.resolve(SECOND); });
    await waitFor(() => expect(box()).toHaveValue(SECOND));
    expect(live().textContent?.trim()).toBe(MESSAGE);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('(f) leaving the page or changing accounts during a read', () => {
  it('a read that finishes after the page was left shows nothing, now or on the next visit', async () => {
    await toCvStep();
    const late = deferred(); state.extract.mockReturnValueOnce(late.promise);
    choose(cvStepInput());
    cleanup();                                                                         // the person leaves
    await act(async () => { late.resolve(FIRST); });
    open(); await screen.findByLabelText('Your CV text');                             // back on the CV step from the tab's own memory
    expect(live()).toBeEmptyDOMElement(); expect(box()).toHaveValue('');
  });
  it('a read that finishes after the account changed (A to B to A) neither applies nor confirms, for the page that is on screen', async () => {
    const view = await toCvStep();
    const late = deferred(); state.extract.mockReturnValueOnce(late.promise);
    choose(cvStepInput());
    act(() => { setTrackingDraftOwner('owner-b', 'session-b'); setTrackingDraftOwner('owner-a', 'session-a2'); });
    view.rerender(<MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>);   // the app re-renders on the new session
    await screen.findByLabelText('Search or add a role');                              // the page opened again for the new session, empty
    await act(async () => { late.resolve(FIRST); });
    expect(live()).toBeEmptyDOMElement();
    expect(document.body.textContent).not.toContain(MESSAGE);
    expect(document.body.textContent).not.toContain('Fictional Casey');
  });
});

describe('(g) what the line is tied to: the text the read put in the box', () => {
  const succeed = async () => { await toCvStep(); state.extract.mockResolvedValue(FIRST); choose(cvStepInput()); await waitFor(() => expect(live().textContent?.trim()).toBe(MESSAGE)); };
  it('typing or pasting over that text removes the line (it no longer describes the box)', async () => {
    await succeed();
    fireEvent.change(box(), { target: { value: `${FIRST} And one more line I added.` } });
    expect(live()).toBeEmptyDOMElement();
  });
  it('replacing it with the guided CV builder draft removes the line', async () => {
    await succeed();
    fireEvent.change(screen.getByLabelText('What name should appear on your CV?'), { target: { value: 'Fictional Casey' } });
    fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: 'Studied biology at Example University. Recorded plant species for a university fieldwork project.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Replace my current/ }));             // the builder asks before replacing text that is already there
    expect(live().textContent?.trim()).toBe(MESSAGE);                                          // asking is not replacing
    fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));
    expect(box()).not.toHaveValue(FIRST);
    expect(live()).toBeEmptyDOMElement();
  });
  it('leaving the step removes the line for good: coming back does not repeat it (it belongs to that visit)', async () => {
    await succeed();
    next();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Review your Automated Job Loop setup');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(box()).toHaveValue(FIRST); expect(live()).toBeEmptyDOMElement();
  });
  it('other edits (name, optional details) leave the line alone, because the file text is untouched', async () => {
    await succeed();
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Casey Fictional' } });
    expect(screen.getByLabelText('Name on your CV')).toHaveValue('Casey Fictional');
    expect(live().textContent?.trim()).toBe(MESSAGE);
    fireEvent.change(screen.getByLabelText('Contact line for your CV (optional)'), { target: { value: 'casey@example.invalid' } });
    expect(live().textContent?.trim()).toBe(MESSAGE);
  });
  it('a read does not change what is saved: the review shows the file text and one Save sends exactly it', async () => {
    await succeed();
    next();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    const writes = state.call.mock.calls.filter(call => call[1].action === 'save_profile');
    expect(writes).toHaveLength(1); expect(writes[0][1].profile.sourceText).toBe(FIRST);
    expect(state.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing', 'save_profile']);
    expect(globalThis.fetch).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
  });
});
