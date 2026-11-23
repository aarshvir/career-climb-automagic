import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { recoverOnboardingDraft, retainOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import type { LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mock = vi.hoisted(() => ({ call: vi.fn(), user: 'owner-a' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mock.user }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: mock.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));

/**
 * The boundary PR 68 left (22 Nov): load() - on opening setup, and on "Retry loading my setup" - cleared the remembered draft whenever a saved setup existed.
 * A person who gave up on a save, added newer answers, left setup, had the late write land and then opened setup again lost those answers silently.
 * The remembered draft is kept only inside the existing 30-minute memory (same account, same session, same lifecycle generation), only when it holds answers the saved
 * setup does not, and is then shown in the existing reconcile panel. Nothing is ever written by load(). All data is fictional and nothing leaves the test.
 */
const SOURCE = 'Alex Example\nEducation\nRecorded local plant species in a supervised university fieldwork project with documented observations.';
const baseProfile = (): LoopProfileInput => ({ ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Research assistant'], locations: ['Boston'], sourceText: SOURCE });
const NOTE = 'Newer builder notes never sent';
const never = () => new Promise<never>(() => {});
const names = () => mock.call.mock.calls.map(([, action]) => action.action);
const MINUTE = 60_000;

type Script = { get?: () => Promise<unknown>; save?: (action: { profile: unknown; expectedVersion: number }) => Promise<unknown>; existing?: () => Promise<unknown> };
function script(behaviour: Script) {
  mock.call.mockImplementation(async (_owner: string, action: { action: string; profile?: unknown; expectedVersion?: number }) => {
    if (action.action === 'get_existing') return behaviour.existing ? behaviour.existing() : { existingState: 'absent' };
    if (action.action === 'get') return behaviour.get ? behaviour.get() : { snapshot: { lifecycleGeneration: 0, recordVersion: 0, profile: null } };
    if (action.action === 'save_profile') return behaviour.save!(action as { profile: unknown; expectedVersion: number });
    throw new Error('Unexpected action ' + action.action);
  });
}
/** A small stand-in for the saved record: the version moves only on a write. */
function record(generation = 0) {
  const state = { profile: null as unknown, version: 0, writes: 0 };
  const snap = () => ({ lifecycleGeneration: generation, recordVersion: state.version, profile: state.profile && { ...(state.profile as object), revision: state.version, updatedAt: '2026-11-22T00:00:00.000Z' } });
  const commit = (profile: unknown) => { state.profile = profile; state.version += 1; };
  return { state, snap, commit };
}
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
async function flush() { await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
const view = () => <MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>;
async function reopen() { render(view()); await flush(); }
const checkButton = () => screen.getByRole('button', { name: 'Check whether my setup was saved' });
const memory = (generation: number | null = 0) => recoverOnboardingDraft('owner-a', trackingDraftAuthority('owner-a'), generation);

type Newer = { answers?: Partial<ReturnType<typeof blankLoopCvAnswers>>; roleQuery?: string; locationQuery?: string; profile?: Partial<LoopProfileInput>; step?: number; rolesEdited?: boolean; suggestionSource?: string; touched?: string[] };
/** A draft this tab already remembered for the lifecycle it had seen (the tab had read generation 0, as every page that has talked to the record has). */
function remember(patch: Newer = {}, generation: number | null = 0) {
  if (generation !== null) setTrackingLoopGeneration('owner-a', generation);
  retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation }, {
    profile: { ...baseProfile(), ...patch.profile }, answers: { ...blankLoopCvAnswers(), ...patch.answers }, step: patch.step ?? 5,
    roleQuery: patch.roleQuery ?? '', locationQuery: patch.locationQuery ?? '', rolesEdited: patch.rolesEdited ?? true, suggestionSource: patch.suggestionSource ?? '', touched: patch.touched,
  });
}
const panel = () => screen.queryByRole('region', { name: 'A setup is already saved in your account.' });
const savedHeading = () => screen.queryByRole('heading', { name: 'Your setup is saved.' });
const readyHeading = () => screen.queryByRole('heading', { name: 'Your Automated Job Loop is ready to continue.' });
const copyText = () => (screen.getByLabelText(/Read them here/) as HTMLTextAreaElement).value;
/** load() only ever reads. */
const onlyReads = (from = 0) => expect(names().slice(from).every(name => name === 'get_existing')).toBe(true);

beforeEach(() => {
  mock.user = 'owner-a'; clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); mock.call.mockReset();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External transport prohibited'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

/**
 * The reported sequence, end to end: the save is given up on, an empty check unlocks the form, a newer answer is added, the person leaves setup, the original
 * write lands, and setup is opened again. (The first page is driven exactly as in loop-onboarding-stalled-save.test.tsx.)
 */
type Kind = 'builder' | 'name' | 'role' | 'location' | 'clearContact';
const CONTACT = 'alex.example@example.invalid';
const NEWER_TEXT: Record<Kind, string> = { builder: NOTE, name: 'Name on your CV: Alex Revised', role: 'Role text typed but not added: Data analyst', location: 'Location text typed but not added: Lisbon', clearContact: 'Contact line: (empty)' };
function addNewer(kind: Kind) {
  if (kind === 'role') { for (let index = 0; index < 5; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.change(screen.getByLabelText('Search or add a role'), { target: { value: 'Data analyst' } }); return; }
  if (kind === 'location') { for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.change(screen.getByLabelText('Search or add a location'), { target: { value: 'Lisbon' } }); return; }
  if (kind === 'clearContact') {                                  // the contact line is on the Your CV step: emptied on purpose, and the form is left like that
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Contact line for your CV (optional)'), { target: { value: '' } });
    return;
  }
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  if (kind === 'builder') {
    fireEvent.click(screen.getByText('No CV yet? Build one with guided questions'));
    fireEvent.change(screen.getByLabelText('How would you introduce your experience? (optional)'), { target: { value: NOTE } });
  } else fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
}
async function leaveAfterGivenUpSave(newer: Kind | null, contactLine = '') {
  const server = record(); let first: unknown = null;
  script({ get: async () => ({ snapshot: server.snap() }), existing: async () => ({ snapshot: server.snap() }), save: action => { server.state.writes += 1; first = action.profile; return never(); } });
  // The first page: setup at the review step, consent ticked, Save pressed, the write never answers.
  retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: null },
    { profile: { ...baseProfile(), contactLine }, answers: blankLoopCvAnswers(), step: 5, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '' });
  render(view());
  const save = await screen.findByRole('button', { name: 'Save my setup' });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
  fireEvent.click(save);
  await settle();
  await advance(31_000);
  fireEvent.click(checkButton());                                    // the read-only check finds nothing saved yet and unlocks the form
  await settle();
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved');
  if (newer) addNewer(newer);
  cleanup();                                                         // the person leaves setup for the dashboard
  expect(server.state.writes).toBe(1);
  server.commit(first);                                              // the original write lands while setup is closed
  return { server, first, calls: mock.call.mock.calls.length };
}

describe('REPRODUCER: leave setup with newer answers, let the late save land, open setup again', () => {
  it.each(['builder', 'name', 'role', 'location'] as const)('keeps a newer %s answer and shows it beside the saved setup, without any write', async kind => {
    const { server, first, calls } = await leaveAfterGivenUpSave(kind);
    expect(memory()).not.toBeNull();                                 // the newer draft is still in this tab's 30-minute memory
    await reopen();
    expect(panel()).toBeInTheDocument();                             // the existing reconcile panel
    expect(panel()).toHaveTextContent('Alex Example');               // the saved setup
    expect(panel()).toHaveTextContent('Retained in this tab and not part of the saved setup');
    expect(panel()).not.toHaveTextContent('newer');                 // reopening cannot show that the answers are newer, so it does not say so
    expect(copyText()).toContain(NEWER_TEXT[kind]);                  // the newer answer, readable and copyable
    expect(screen.getByLabelText(/Read them here/)).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Copy retained answers' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Open my saved dashboard' })).toBeInTheDocument();
    expect(readyHeading()).not.toBeInTheDocument();
    expect(savedHeading()).not.toBeInTheDocument();
    expect(memory()).not.toBeNull();                                 // not cleared
    expect(server.state.profile).toBe(first);                        // nothing overwritten
    expect(server.state.writes).toBe(1);                             // no automatic second write
    onlyReads(calls);
    expect(names().slice(calls)).toEqual(['get_existing']);          // one read; no `get` that could initialise a record either
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);                             // the draft lives only in this tab's memory: no persistent candidate storage
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('shows the form read-only in effect: Save and consent stay disabled and Back is available (builder answer, review step)', async () => {
    await leaveAfterGivenUpSave('builder');
    await reopen();
    expect(screen.getByRole('heading', { level: 1, name: 'Review your Automated Job Loop setup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Save this CV text/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('had not seen');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getAllByDisplayValue(/Newer builder notes never sent/).length).toBeGreaterThan(0);   // the answer is in the form itself too
    expect(panel()).toBeInTheDocument();                                                                 // going back does not drop the panel
    expect(names().filter(name => name === 'save_profile')).toHaveLength(1);
  });

  it('control (a): when nothing newer was added, the draft equals the saved setup, is cleared and the normal page shows, exactly as before', async () => {
    const { calls } = await leaveAfterGivenUpSave(null);
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Read them here/)).not.toBeInTheDocument();
    expect(memory()).toBeNull();                                     // cleared, as today
    expect(names().slice(calls)).toEqual(['get_existing']);
  });
});

describe('Retry loading my setup takes the same path', () => {
  it('keeps the draft through a failed load, never claims saved, and shows it beside the saved setup when the retry finds one (control e)', async () => {
    const server = record(); server.commit(baseProfile());
    let reads = 0;
    script({ existing: async () => { reads += 1; if (reads === 1) throw new Error('Network down'); return { snapshot: server.snap() }; } });
    remember({ answers: { summary: NOTE } });
    await reopen();
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(screen.getByRole('button', { name: 'Retry loading my setup' })).toBeEnabled();
    expect(savedHeading()).not.toBeInTheDocument();
    expect(readyHeading()).not.toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(JSON.stringify(memory())).toContain(NOTE);               // an unreadable profile clears nothing
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading my setup' }));
    await flush();
    expect(panel()).toBeInTheDocument();
    expect(copyText()).toContain(NOTE);
    expect(JSON.stringify(memory())).toContain(NOTE);
    expect(names()).toEqual(['get_existing', 'get_existing']);
    expect(server.state.writes).toBe(0);
  });
});

describe('control (e): a profile that cannot be read clears nothing and claims nothing', () => {
  const saved = () => { const server = record(); server.commit(baseProfile()); return server; };
  it.each([
    ['the read fails', () => Promise.reject(new Error('Network down')), 'Network down'],
    ['the lifecycle of the saved setup cannot be verified', async () => ({ snapshot: { ...saved().snap(), lifecycleGeneration: 'x' } }), 'could not be verified'],
    ['the previous setup is still being erased', async () => ({ existingState: 'erasing' }), 'being erased'],
    ['the answer has no usable shape', async () => ({ existingState: 'active' }), 'could not be verified'],
  ])('when %s', async (_label, existing, message) => {
    script({ existing: existing as () => Promise<unknown> });
    remember({ answers: { summary: NOTE } });
    await reopen();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Retry loading my setup' })).toBeEnabled();
    expect(savedHeading()).not.toBeInTheDocument();
    expect(readyHeading()).not.toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(JSON.stringify(memory())).toContain(NOTE);
    expect(names()).toEqual(['get_existing']);
  });

  it('when the read never answers: bounded wait, retained draft untouched', async () => {
    script({ existing: never });
    remember({ answers: { summary: NOTE } });
    vi.useFakeTimers();
    render(view());
    await flush();
    await advance(21_000);
    expect(screen.getByRole('alert')).toHaveTextContent('taking too long');
    expect(savedHeading()).not.toBeInTheDocument();
    expect(readyHeading()).not.toBeInTheDocument();
    expect(JSON.stringify(memory())).toContain(NOTE);
    expect(names()).toEqual(['get_existing']);
  });
});

describe('what is not kept: the draft is cleared and the normal page shows, as before', () => {
  const server = () => { const value = record(); value.commit(baseProfile()); return value; };
  const expectCleared = async (existing = server()) => {
    script({ existing: async () => ({ snapshot: existing.snap() }) });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(memory()).toBeNull();
    expect(names()).toEqual(['get_existing']);
    expect(existing.state.writes).toBe(0);
  };

  it('control (a): a remembered draft that equals the saved setup', async () => { remember(); await expectCleared(); });
  it('control (a): the same setup with surrounding whitespace only (the save trims it)', async () => {
    remember({ profile: { name: '  Alex Example  ', sourceText: `${SOURCE}\n\n` } });
    await expectCleared();
  });
  it('an untouched draft (nothing was ever filled in) is not a newer answer, even though the saved setup differs from the blank page', async () => {
    remember({ profile: { ...blankLoopProfile('professional') }, step: 0, rolesEdited: false });
    await expectCleared();
  });
  it('roles suggested from the account profile and never confirmed are not a newer answer', async () => {
    remember({ profile: { ...blankLoopProfile('professional'), targetTitles: ['Suggested role'] }, step: 0, rolesEdited: false, suggestionSource: 'account profile' });
    await expectCleared();
  });
  it('whitespace-only builder answers or role text are not answers', async () => {
    remember({ answers: { summary: '   ' }, roleQuery: '  ', locationQuery: ' ' });
    await expectCleared();
  });

  it('control (b): a draft remembered for another account is never shown or used, however often the accounts switch', async () => {
    remember({ answers: { summary: 'Private notes of account A' } });
    const owner = trackingDraftAuthority('owner-a');
    act(() => { setTrackingDraftOwner('owner-b', 'session-b'); });
    mock.user = 'owner-b';
    // A stale writer of account A cannot put the draft back under account B either.
    retainOnboardingDraft({ owner: 'owner-a', authority: owner, generation: 0 }, { profile: baseProfile(), answers: { ...blankLoopCvAnswers(), summary: 'Private notes of account A' }, step: 5, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '' });
    const other = record(); other.commit({ ...baseProfile(), name: 'Blake Example' });
    script({ existing: async () => ({ snapshot: other.snap() }) });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Private notes of account A');
    expect(recoverOnboardingDraft('owner-a', owner, 0)).toBeNull();
    expect(recoverOnboardingDraft('owner-b', trackingDraftAuthority('owner-b'), 0)).toBeNull();
    cleanup();
    // Back to account A: A's draft was destroyed by the switch and does not come back.
    act(() => { setTrackingDraftOwner('owner-a', 'session-a'); });
    mock.user = 'owner-a';
    script({ existing: async () => ({ snapshot: server().snap() }) });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Private notes of account A');
    expect(memory()).toBeNull();
    expect(names().every(name => name === 'get_existing')).toBe(true);
  });

  it('control (d): a new sign-in session of the same account does not bring the draft back', async () => {
    remember({ answers: { summary: NOTE } });
    act(() => { setTrackingDraftOwner('owner-a', 'session-b'); });
    await expectCleared();
    expect(document.body).not.toHaveTextContent(NOTE);
  });

  it('control (d): a new lifecycle generation (an erased and recreated setup) does not bring the draft back', async () => {
    remember({ answers: { summary: NOTE } }, 0);
    const recreated = record(1); recreated.commit(baseProfile());
    await expectCleared(recreated);
    expect(document.body).not.toHaveTextContent(NOTE);
  });

  it('control (d): a draft this tab held without ever having seen the lifecycle is not adopted for a saved setup (unchanged from before)', async () => {
    remember({ answers: { summary: NOTE } }, null);
    await expectCleared();
    expect(document.body).not.toHaveTextContent(NOTE);
  });
});

describe('control (c): the existing 30-minute memory, never longer', () => {
  const saved = () => { const value = record(); value.commit(baseProfile()); return value; };

  it('uses a draft up to the end of the 30 minutes and not after it', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });
    await advance(29 * MINUTE);
    script({ existing: async () => ({ snapshot: saved().snap() }) });
    await reopen();
    expect(panel()).toBeInTheDocument();                             // 29 minutes: inside the window
    expect(copyText()).toContain(NOTE);
    cleanup();
    await advance(MINUTE);                                           // 30 minutes after the draft was last changed
    expect(memory()).toBeNull();
    await reopen();
    expect(readyHeading()).toBeInTheDocument();                      // 30 minutes: expired, not used
    expect(panel()).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(NOTE);
    expect(names().every(name => name === 'get_existing')).toBe(true);
  });

  it('does not use a draft that has already expired when the page opens', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });
    await advance(31 * MINUTE);
    script({ existing: async () => ({ snapshot: saved().snap() }) });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(NOTE);
  });

  it('reopening alone does not start another 30 minutes; a change the person makes does', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });                        // remembered at minute 0
    await advance(20 * MINUTE);
    script({ existing: async () => ({ snapshot: saved().snap() }) });
    await reopen();
    expect(panel()).toBeInTheDocument();
    await advance(9 * MINUTE + 59_000);                              // minute 29:59
    expect(memory()).not.toBeNull();
    await advance(1_000);                                            // minute 30:00 since the draft was last changed (not since the reopen)
    expect(memory()).toBeNull();
    cleanup();
    // A real change on a restored page is a new edit and is remembered again.
    clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a');
    remember({ answers: { summary: NOTE } });
    await advance(20 * MINUTE);
    await reopen();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));   // navigation only: not a change to an answer (see round 2 below)
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });   // a real answer edit
    await advance(15 * MINUTE);                                      // 35 minutes after the original draft, 15 after the change
    expect(JSON.stringify(memory())).toContain(NOTE);
    await advance(15 * MINUTE);
    expect(memory()).toBeNull();
  });
});

/**
 * Round 2 (23 Nov), finding 2: pressing Back or Next on a reopened draft is navigation, not an answer. The draft keeps the 30 minutes it had; the step is remembered,
 * the expiry does not move. A real edit of an answer still starts a new 30 minutes.
 */
describe('round 2: Back and Next do not renew the 30 minutes of a reopened draft (made general in round 3 below)', () => {
  const saved = () => { const value = record(); value.commit(baseProfile()); return value; };
  const withSaved = () => script({ existing: async () => ({ snapshot: saved().snap() }) });
  const stepLine = () => screen.getByText(/^Step \d of 6$/).textContent;

  it('Back at minute 29 does not move the end of the draft: it is gone at minute 30', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });                        // remembered at minute 0, at the review step
    await advance(29 * MINUTE);
    withSaved();
    await reopen();
    expect(panel()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await flush();
    expect(stepLine()).toBe('Step 5 of 6');
    expect(JSON.stringify(memory())).toContain(NOTE);                // still inside the 30 minutes
    await advance(MINUTE);                                           // minute 30: the original expiry
    expect(memory()).toBeNull();
    expect(names().every(name => name === 'get_existing')).toBe(true);
  });

  it('Next at minute 29 does not move it either', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE }, step: 3 });
    await advance(29 * MINUTE);
    withSaved();
    await reopen();
    expect(panel()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    await flush();
    expect(stepLine()).toBe('Step 5 of 6');
    expect(JSON.stringify(memory())).toContain(NOTE);
    await advance(MINUTE);
    expect(memory()).toBeNull();
  });

  it('any number of Back and Next presses spread over the window still end at the original minute 30', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });
    await advance(5 * MINUTE);
    withSaved();
    await reopen();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await advance(10 * MINUTE);                                      // minute 15
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    await advance(10 * MINUTE);                                      // minute 25
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await advance(4 * MINUTE + 59_000);                              // minute 29:59
    expect(JSON.stringify(memory())).toContain(NOTE);
    await advance(1_000);                                            // minute 30:00, not 55
    expect(memory()).toBeNull();
  });

  it('the step is remembered: opening setup again inside the window comes back to the step the person moved to', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });
    await advance(10 * MINUTE);
    withSaved();
    await reopen();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await flush();
    expect(memory()?.step).toBe(4);
    cleanup();
    await reopen();
    expect(panel()).toBeInTheDocument();
    expect(stepLine()).toBe('Step 5 of 6');
    expect(copyText()).toContain(NOTE);
  });

  it('a page left open past the 30 minutes does not bring the draft back by pressing Back or Next', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });
    await advance(29 * MINUTE);
    withSaved();
    await reopen();
    await advance(2 * MINUTE);                                       // minute 31: expired while the page stayed open
    expect(memory()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await flush();
    expect(memory()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    await flush();
    expect(memory()).toBeNull();
  });

  it('a real edit of an answer is still remembered and starts a new 30 minutes', async () => {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });
    await advance(25 * MINUTE);
    withSaved();
    await reopen();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });
    await advance(10 * MINUTE);                                      // minute 35: past the original expiry, 10 minutes after the edit
    expect(memory()?.profile.name).toBe('Alex Revised');
    await advance(20 * MINUTE);                                      // 30 minutes after the edit
    expect(memory()).toBeNull();
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Again' } });   // an edit on the open page starts a new 30
    expect(memory()?.profile.name).toBe('Alex Again');
  });
});

/**
 * Round 2 (23 Nov), finding 1: a field the person emptied or reset on purpose equals the blank page, so the blank-page rule alone dropped it on reopening. The page now
 * remembers which fields the person edited; an edited field that differs from the saved setup is kept, a blank field nobody edited is still the page's own default.
 */
describe('round 2: an intentional clear or reset survives reopening', () => {
  it('REPRODUCER (Codex): save with a contact line, give up, empty the contact line, leave, let the late write land, open setup again', async () => {
    const { server, first, calls } = await leaveAfterGivenUpSave('clearContact', CONTACT);
    expect((first as LoopProfileInput).contactLine).toBe(CONTACT);   // the write that is about to land holds the contact line
    expect(server.state.profile).toBe(first);                        // it has now landed: the saved setup holds the contact line
    expect(memory()?.profile.contactLine).toBe('');                  // the deliberate empty contact is what this tab remembers just before reopening
    expect(memory()?.touched).toEqual(['contactLine']);              // ... and that it was the person who emptied it
    await reopen();
    expect(panel()).toBeInTheDocument();                             // kept, shown beside the saved setup
    expect(panel()).toHaveTextContent('Contact line');
    expect(copyText()).toContain(NEWER_TEXT.clearContact);
    expect(readyHeading()).not.toBeInTheDocument();
    expect(memory()).not.toBeNull();
    expect((server.state.profile as LoopProfileInput).contactLine).toBe(CONTACT);   // the saved setup is untouched
    expect(server.state.writes).toBe(1);
    expect(names().slice(calls)).toEqual(['get_existing']);
    cleanup();
    await reopen();                                                  // the provenance travels with the memory: leaving and reopening again inside the window keeps it
    expect(panel()).toBeInTheDocument();
    expect(copyText()).toContain(NEWER_TEXT.clearContact);
  });

  it('control: the same sequence without emptying anything is cleared, as before', async () => {
    const { calls } = await leaveAfterGivenUpSave(null, CONTACT);
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(memory()).toBeNull();
    expect(names().slice(calls)).toEqual(['get_existing']);
  });

  it('what is edited after reopening is added to what was remembered (the provenance survives the reopen)', async () => {
    await leaveAfterGivenUpSave('clearContact', CONTACT);
    await reopen();
    expect(panel()).toBeInTheDocument();                             // the page comes back on the Your CV step, where the person left it
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });
    expect(memory()?.touched).toEqual(['contactLine', 'name']);
    expect(memory()?.profile.contactLine).toBe('');
  });

  // The simpler retained-state fixture, one per field a person can empty or reset.
  const EXTRAS = { contactLine: CONTACT, experienceYears: 4, excludedTerms: ['Confidential client'], compensation: { currency: 'USD', period: 'annual' as const, minimum: 50000 }, discreetSearch: !blankLoopProfile('professional').discreetSearch };
  const savedProfile = (): LoopProfileInput => ({ ...baseProfile(), ...EXTRAS });
  const serverWith = () => { const value = record(); value.commit(savedProfile()); return value; };
  const emptied: [string, string, Partial<LoopProfileInput>][] = [
    ['contactLine', 'Contact line', { contactLine: '' }],
    ['name', 'Name on your CV', { name: '' }],
    ['sourceText', 'CV text', { sourceText: '' }],
    ['locations', 'Cities or countries', { locations: [] }],
    ['targetTitles', 'Target roles', { targetTitles: [] }],
    ['excludedTerms', 'Private terms', { excludedTerms: [] }],
    ['experienceYears', 'Years of experience', { experienceYears: null }],
    ['compensation', 'Compensation', { compensation: { currency: '', period: 'annual', minimum: null } }],
    ['discreetSearch', 'Discreet search', { discreetSearch: blankLoopProfile('professional').discreetSearch }],
  ];
  it.each(emptied)('keeps an emptied or reset %s that the person edited', async (field, label, change) => {
    const server = serverWith();
    script({ existing: async () => ({ snapshot: server.snap() }) });
    remember({ profile: { ...EXTRAS, ...change }, touched: [field] });
    await reopen();
    expect(panel()).toBeInTheDocument();
    expect(panel()).toHaveTextContent(label);
    expect(readyHeading()).not.toBeInTheDocument();
    expect(memory()).not.toBeNull();
    expect(server.state.writes).toBe(0);
    expect(names()).toEqual(['get_existing']);
  });
  it.each(emptied)('still clears a blank %s that nobody edited (the page default, not an answer)', async (_field, _label, change) => {
    const server = serverWith();
    script({ existing: async () => ({ snapshot: server.snap() }) });
    remember({ profile: { ...EXTRAS, ...change }, touched: [] });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(memory()).toBeNull();
    expect(names()).toEqual(['get_existing']);
  });
  it('a draft remembered without any provenance (as before this change) behaves as it did', async () => {
    const server = serverWith();
    script({ existing: async () => ({ snapshot: server.snap() }) });
    remember({ profile: { ...EXTRAS, contactLine: '' } });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(memory()).toBeNull();
  });
  it('a field edited and then put back to the saved value holds nothing', async () => {
    const server = serverWith();
    script({ existing: async () => ({ snapshot: server.snap() }) });
    remember({ profile: { ...EXTRAS }, touched: ['contactLine', 'name', 'locations'] });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(memory()).toBeNull();
  });
  it('a private-terms box emptied beside a setup that has no private terms holds nothing', async () => {
    const server = record(); server.commit(baseProfile());
    script({ existing: async () => ({ snapshot: server.snap() }) });
    remember({ profile: { excludedTerms: [''] }, touched: ['excludedTerms'] });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(memory()).toBeNull();
  });
});

/**
 * Round 3 (23 Nov): Back and Next are navigation at ANY time, not only on a draft that was just reopened. The deadline of a remembered draft is set by the last real change to an
 * answer; navigation after one (or after any number of them, reopened or not) keeps that deadline, and the next real change starts another 30 minutes. Codex's round-2 review of d294ecb:
 * reopen at minute 29, press Back, edit the name (due minute 59), press Next at minute 58 without changing an answer: the draft must be gone at 59.
 */
describe('round 3: navigation after a real edit keeps the deadline that edit set', () => {
  const saved = () => { const value = record(); value.commit(baseProfile()); return value; };
  const withSaved = () => script({ existing: async () => ({ snapshot: saved().snap() }) });
  const withEmptyRecord = () => script({ existing: async () => ({ snapshot: { lifecycleGeneration: 0, recordVersion: 0, profile: null } }) });
  const stepLine = () => screen.getByText(/^Step \d of 6$/).textContent;
  const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
  const editName = (value: string) => fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value } });
  const editContact = (value: string) => fireEvent.change(screen.getByLabelText('Contact line for your CV (optional)'), { target: { value } });
  /** A draft remembered at minute 0, setup reopened beside a saved setup at `minute`, and put on the Your CV step (the review step is step 6; Back goes to it). */
  async function reopenedAt(minute: number) {
    vi.useFakeTimers();
    remember({ answers: { summary: NOTE } });
    await advance(minute * MINUTE);
    withSaved();
    await reopen();
    expect(panel()).toBeInTheDocument();
    back(); await flush();
    expect(stepLine()).toBe('Step 5 of 6');
  }

  it('CODEX SEQUENCE: reopen at 29, Back, edit the name (due 59), Next at 58 without changing an answer: gone at 59', async () => {
    await reopenedAt(29);
    editName('Alex Revised');                                        // a real edit at minute 29: a new period, due at minute 59
    expect(memory()?.profile.name).toBe('Alex Revised');
    await advance(29 * MINUTE);                                       // minute 58
    expect(memory()?.profile.name).toBe('Alex Revised');
    next(); await flush();                                            // navigation only
    expect(stepLine()).toBe('Step 6 of 6');
    expect(memory()?.step).toBe(5);                                   // the step is remembered ...
    await advance(59_000);                                            // minute 58:59
    expect(memory()?.profile.name).toBe('Alex Revised');
    await advance(1_000);                                             // ... the deadline is not moved: minute 59
    expect(memory()).toBeNull();
    expect(names().every(name => name === 'get_existing')).toBe(true);
  });

  it('edit, then Back at minute 58: gone at 59 (and nothing is brought back by walking on)', async () => {
    await reopenedAt(29);
    editName('Alex Revised');
    await advance(29 * MINUTE);
    back(); await flush();
    expect(stepLine()).toBe('Step 4 of 6');
    await advance(MINUTE);
    expect(memory()).toBeNull();
    next(); await flush(); back(); await flush();
    expect(memory()).toBeNull();
  });

  it('edit, then several Back and Next presses spread over the period: gone at the minute the edit set, not later', async () => {
    await reopenedAt(5);
    editName('Alex Revised');                                         // due minute 35
    await advance(5 * MINUTE); back(); await flush();                 // minute 10
    await advance(5 * MINUTE); next(); await flush();                 // minute 15
    await advance(5 * MINUTE); next(); await flush();                 // minute 20
    await advance(14 * MINUTE + 59_000); back(); await flush();       // minute 34:59
    expect(memory()?.profile.name).toBe('Alex Revised');
    await advance(1_000);                                             // minute 35
    expect(memory()).toBeNull();
  });

  it('two edits with navigation between them: each edit sets the deadline, the navigation between does not move it', async () => {
    await reopenedAt(29);
    editName('Alex Revised');                                         // due 59
    await advance(11 * MINUTE); back(); await flush();                // minute 40: navigation, deadline stays 59
    await advance(MINUTE); next(); await flush();                     // minute 41
    await advance(9 * MINUTE);                                        // minute 50
    expect(memory()?.profile.name).toBe('Alex Revised');             // still inside the first period
    editContact('alex.second@example.invalid');                       // a second real edit: a new period, due 80
    expect(memory()?.profile.contactLine).toBe('alex.second@example.invalid');
    await advance(10 * MINUTE);                                       // minute 60: past the first deadline, inside the second
    expect(memory()?.profile.contactLine).toBe('alex.second@example.invalid');
    await advance(19 * MINUTE); next(); await flush();                // minute 79: navigation only
    await advance(59_000);
    expect(memory()?.profile.contactLine).toBe('alex.second@example.invalid');
    await advance(1_000);                                             // minute 80, not 109
    expect(memory()).toBeNull();
  });

  it('an edit after navigation restarts the period: navigation first does not start one, the edit does', async () => {
    await reopenedAt(10);                                             // minute 10; Back already pressed (navigation, no renewal)
    await advance(10 * MINUTE);                                       // minute 20
    editName('Alex Revised');                                         // a real edit: due minute 50, not the original 30
    await advance(15 * MINUTE);                                       // minute 35: the original deadline has passed, the edit's has not
    expect(memory()?.profile.name).toBe('Alex Revised');
    await advance(14 * MINUTE + 59_000);                              // minute 49:59
    expect(memory()?.profile.name).toBe('Alex Revised');
    await advance(1_000);
    expect(memory()).toBeNull();
  });

  it.each([29, 30, 31])('navigation %i minutes after an edit never extends it (and never brings an expired draft back)', async offset => {
    await reopenedAt(10);
    editName('Alex Revised');                                         // minute 10, due minute 40
    await advance(offset * MINUTE);
    if (offset < 30) expect(memory()?.profile.name).toBe('Alex Revised'); else expect(memory()).toBeNull();
    next(); await flush();                                            // navigation only, at +29, +30 or +31 minutes
    expect(stepLine()).toBe('Step 6 of 6');
    if (offset < 30) { expect(memory()?.profile.name).toBe('Alex Revised'); await advance(MINUTE); }
    expect(memory()).toBeNull();                                      // gone at +30 in every case
    back(); await flush(); next(); await flush();
    await advance(35 * MINUTE);
    expect(memory()).toBeNull();                                      // and stays gone
  });

  it('a real edit after the deadline passed starts a new period, and navigation after that edit keeps that one', async () => {
    await reopenedAt(10);
    editName('Alex Revised');                                         // due minute 40
    await advance(31 * MINUTE);                                       // minute 41: expired while the page stayed open
    expect(memory()).toBeNull();
    next(); await flush();                                            // navigation does not revive it
    expect(memory()).toBeNull();
    back(); await flush();
    editName('Alex Again');                                           // a real edit: a new period, due minute 71
    expect(memory()?.profile.name).toBe('Alex Again');
    await advance(20 * MINUTE); next(); await flush();                // minute 61: navigation only
    await advance(10 * MINUTE - 1_000);                               // minute 70:59
    expect(memory()?.profile.name).toBe('Alex Again');
    await advance(1_000);                                             // minute 71
    expect(memory()).toBeNull();
  });

  // The same rule on a page that was never reopened beside a saved setup (an ordinary recovered draft), because the rule is about navigation, not about reopening.
  it('a draft that was never reopened beside a saved setup: Back and Next after remembering it never extend it', async () => {
    vi.useFakeTimers();
    withEmptyRecord();
    remember({ answers: { summary: NOTE } });                          // minute 0
    await reopen();                                                    // an empty record, no saved setup: the ordinary recovered draft
    expect(panel()).not.toBeInTheDocument();
    await advance(29 * MINUTE);
    back(); await flush();
    expect(JSON.stringify(memory())).toContain(NOTE);
    await advance(MINUTE);                                             // minute 30, not 59
    expect(memory()).toBeNull();
  });

  it('a draft that was never reopened: an edit, then Next, then the deadline of the edit', async () => {
    vi.useFakeTimers();
    withEmptyRecord();
    remember({ answers: { summary: NOTE } });
    await reopen();
    await advance(20 * MINUTE);
    back(); await flush();
    editName('Alex Revised');                                          // minute 20, due 50
    await advance(29 * MINUTE);                                        // minute 49
    next(); await flush();
    expect(memory()?.profile.name).toBe('Alex Revised');
    await advance(MINUTE);                                             // minute 50
    expect(memory()).toBeNull();
  });

  it('a page that starts blank: the first answer it remembers sets the deadline, and walking through the steps does not move it', async () => {
    vi.useFakeTimers();
    withEmptyRecord();
    await reopen();                                                    // nothing remembered: the blank page
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search or add a role'), { target: { value: 'Data analyst' } });   // a real change at minute 0
    expect(memory()?.roleQuery).toBe('Data analyst');
    await advance(25 * MINUTE);
    next(); await flush();                                             // Next adds the typed role: that is a change to an answer and starts a new period (due 55)
    expect(memory()?.profile.targetTitles).toContain('Data analyst');
    await advance(25 * MINUTE);                                        // minute 50
    expect(stepLine()).toBe('Step 2 of 6');
    expect(memory()?.profile.targetTitles).toContain('Data analyst');
    back(); await flush();                                             // navigation only
    await advance(5 * MINUTE);                                         // minute 55
    expect(memory()).toBeNull();
  });
});
