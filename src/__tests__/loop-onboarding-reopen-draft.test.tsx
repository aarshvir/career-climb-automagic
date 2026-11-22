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

type Newer = { answers?: Partial<ReturnType<typeof blankLoopCvAnswers>>; roleQuery?: string; locationQuery?: string; profile?: Partial<LoopProfileInput>; step?: number; rolesEdited?: boolean; suggestionSource?: string };
/** A draft this tab already remembered for the lifecycle it had seen (the tab had read generation 0, as every page that has talked to the record has). */
function remember(patch: Newer = {}, generation: number | null = 0) {
  if (generation !== null) setTrackingLoopGeneration('owner-a', generation);
  retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation }, {
    profile: { ...baseProfile(), ...patch.profile }, answers: { ...blankLoopCvAnswers(), ...patch.answers }, step: patch.step ?? 5,
    roleQuery: patch.roleQuery ?? '', locationQuery: patch.locationQuery ?? '', rolesEdited: patch.rolesEdited ?? true, suggestionSource: patch.suggestionSource ?? '',
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
type Kind = 'builder' | 'name' | 'role' | 'location';
const NEWER_TEXT: Record<Kind, string> = { builder: NOTE, name: 'Name on your CV: Alex Revised', role: 'Role text typed but not added: Data analyst', location: 'Location text typed but not added: Lisbon' };
function addNewer(kind: Kind) {
  if (kind === 'role') { for (let index = 0; index < 5; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.change(screen.getByLabelText('Search or add a role'), { target: { value: 'Data analyst' } }); return; }
  if (kind === 'location') { for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.change(screen.getByLabelText('Search or add a location'), { target: { value: 'Lisbon' } }); return; }
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  if (kind === 'builder') {
    fireEvent.click(screen.getByText('No CV yet? Build one with guided questions'));
    fireEvent.change(screen.getByLabelText('How would you introduce your experience? (optional)'), { target: { value: NOTE } });
  } else fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });
  fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
}
async function leaveAfterGivenUpSave(newer: Kind | null) {
  const server = record(); let first: unknown = null;
  script({ get: async () => ({ snapshot: server.snap() }), existing: async () => ({ snapshot: server.snap() }), save: action => { server.state.writes += 1; first = action.profile; return never(); } });
  // The first page: setup at the review step, consent ticked, Save pressed, the write never answers.
  retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: null },
    { profile: baseProfile(), answers: blankLoopCvAnswers(), step: 5, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '' });
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
    expect(panel()).toHaveTextContent('Still here and NOT saved');
    expect(copyText()).toContain(NEWER_TEXT[kind]);                  // the newer answer, readable and copyable
    expect(screen.getByLabelText(/Read them here/)).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Copy my newer answers' })).toBeEnabled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await advance(15 * MINUTE);                                      // 35 minutes after the original draft, 15 after the change
    expect(JSON.stringify(memory())).toContain(NOTE);
    await advance(15 * MINUTE);
    expect(memory()).toBeNull();
  });
});
