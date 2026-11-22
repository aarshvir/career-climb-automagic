import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { recoverOnboardingDraft, retainOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority } from '@/lib/tracking-draft-memory';

vi.unmock('react-router-dom');
const mock = vi.hoisted(() => ({ call: vi.fn(), extract: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a' }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: mock.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));
vi.mock('@/lib/cv-extraction', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/cv-extraction')>()), extractCvText: mock.extract }));

/**
 * v87 left the page on "Saving your private setup…" for ever when the write (or the read before it, or the CV file parser) never answered.
 * These tests pin the repair: a bounded wait, an honest "not confirmed" state that keeps every answer, a read-only check before any second
 * write, and no late answer from a given-up request touching the page. Everything is fictional and nothing leaves the test.
 */
const SOURCE = 'Alex Example\nEducation\nRecorded local plant species in a supervised university fieldwork project with documented observations.';
const baseProfile = () => ({ ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Research assistant'], locations: ['Boston'], sourceText: SOURCE });
const seed = (step: number, answers = blankLoopCvAnswers()) => retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: null },
  { profile: baseProfile(), answers, step, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '' });
const never = () => new Promise<never>(() => {});
const snapshotWith = (profile: unknown, recordVersion = 1) => ({ lifecycleGeneration: 0, recordVersion, profile: profile && { ...(profile as object), revision: 1, updatedAt: '2026-11-15T00:00:00.000Z' } });
const names = () => mock.call.mock.calls.map(([, action]) => action.action);

type Script = { get?: () => Promise<unknown>; save?: (action: { profile: unknown; expectedVersion: number }) => Promise<unknown>; existing?: () => Promise<unknown> };
function script(behaviour: Script) {
  mock.call.mockImplementation(async (_owner: string, action: { action: string; profile?: unknown; expectedVersion?: number }) => {
    if (action.action === 'get_existing') return behaviour.existing ? behaviour.existing() : { existingState: 'absent' };
    if (action.action === 'get') return behaviour.get ? behaviour.get() : { snapshot: { lifecycleGeneration: 0, recordVersion: 0, profile: null } };
    if (action.action === 'save_profile') return behaviour.save!(action as { profile: unknown; expectedVersion: number });
    throw new Error('Unexpected action ' + action.action);
  });
}
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function startSave(answers = blankLoopCvAnswers()) {
  seed(5, answers);
  render(<MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>);
  const save = await screen.findByRole('button', { name: 'Save my setup' });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
  fireEvent.click(save);
  await settle();
  return save;
}

beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); mock.call.mockReset(); mock.extract.mockReset();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External transport prohibited'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('a save that never answers', () => {
  it.each(['get', 'save_profile'])('stops saying "Saving" after a bounded wait, keeps every answer and offers a read-only check (%s never settles)', async pending => {
    script({ get: pending === 'get' ? never : undefined, save: never });
    const save = await startSave();
    await advance(29_000);
    expect(screen.getByRole('status')).toHaveTextContent('Saving your private setup');
    await advance(1_500);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('We could not confirm that your setup was saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Your answers are still here');
    expect(screen.getByRole('link', { name: 'Check my saved dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check whether my setup was saved' })).toBeEnabled();
    // The answers are held exactly as submitted (locked) until the check has read the saved setup; the check and the dashboard stay open.
    expect(document.querySelector('fieldset')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('locked while we are unsure');
    expect(screen.getByText((_t, element) => element?.tagName === 'PRE' && element.textContent === SOURCE)).toBeInTheDocument();
    // Ticking the confirmation again must not unlock a second write before the check.
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
    expect(save).toBeDisabled();
    await advance(300_000);
    expect(names()).toEqual(pending === 'get' ? ['get_existing', 'get'] : ['get_existing', 'get', 'save_profile']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('ignores a late answer from the given-up save: only the read-only check can say it was saved', async () => {
    let finish: (value: unknown) => void = () => {};
    let submitted: unknown = null;
    script({ save: action => { submitted = action.profile; return new Promise(resolve => { finish = resolve; }); } });
    await startSave();
    await advance(31_000);
    expect(screen.getByRole('alert')).toHaveTextContent('could not confirm');
    await act(async () => { finish({ snapshot: snapshotWith(submitted, 1) }); await Promise.resolve(); });
    await advance(1_000);
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('could not confirm');
    expect(screen.getByRole('button', { name: 'Check whether my setup was saved' })).toBeInTheDocument();
    expect(names()).toEqual(['get_existing', 'get', 'save_profile']);
  });

  it('says saved only after the check reads back exactly the submitted answers, with no second write', async () => {
    let submitted: unknown = null;
    script({ save: action => { submitted = action.profile; return never(); }, existing: async () => submitted ? { snapshot: snapshotWith(submitted, 1) } : { existingState: 'absent' } });
    await startSave();
    await advance(31_000);
    fireEvent.click(screen.getByRole('button', { name: 'Check whether my setup was saved' }));
    await settle();
    expect(screen.getByRole('heading', { name: 'Your setup is saved.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check whether my setup was saved' })).not.toBeInTheDocument();
    expect(names()).toEqual(['get_existing', 'get', 'save_profile', 'get_existing']);
  });

  it('allows a new deliberate save only after the check reads the setup as absent, with one fresh read and one write', async () => {
    let writes = 0;
    script({
      save: action => { writes += 1; return writes === 1 ? never() : Promise.resolve({ snapshot: snapshotWith(action.profile, 1) }); },
      existing: async () => ({ existingState: 'absent' }),
    });
    const save = await startSave();
    await advance(31_000);
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Check whether my setup was saved' }));
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Your answers are still here');
    expect(save).toBeDisabled();                                   // needs a fresh, deliberate confirmation
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await settle();
    expect(screen.getByRole('heading', { name: 'Your setup is saved.' })).toBeInTheDocument();
    expect(names()).toEqual(['get_existing', 'get', 'save_profile', 'get_existing', 'get', 'save_profile']);
    expect(writes).toBe(2);
  });

  it('never overwrites a different saved setup that the check finds', async () => {
    let reads = 0;
    script({ save: never, existing: async () => (++reads === 1 ? { existingState: 'absent' } : { snapshot: snapshotWith({ ...baseProfile(), targetTitles: ['Someone else'] }, 4) }) });
    await startSave();
    await advance(31_000);
    fireEvent.click(screen.getByRole('button', { name: 'Check whether my setup was saved' }));
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('A different setup is already saved');
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'A setup is already saved in your account.' })).toHaveTextContent('Someone else');      // the saved one is shown
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();                                                                // and the page still holds the draft
    expect((screen.getByLabelText(/Read them here/) as HTMLTextAreaElement).value).toContain('Research assistant');
    expect(names().filter(name => name === 'save_profile')).toHaveLength(1);
  });

  it('bounds the check itself and keeps the answers and the check available', async () => {
    let reads = 0;
    script({ save: never, existing: () => (++reads === 1 ? Promise.resolve({ existingState: 'absent' }) : never()) });
    await startSave();
    await advance(31_000);
    fireEvent.click(screen.getByRole('button', { name: 'Check whether my setup was saved' }));
    await advance(21_000);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('taking too long');
    expect(screen.getByRole('button', { name: 'Check whether my setup was saved' })).toBeEnabled();
    expect(screen.getByText((_t, element) => element?.tagName === 'PRE' && element.textContent === SOURCE)).toBeInTheDocument();
    expect(names().filter(name => name === 'save_profile')).toHaveLength(1);
  });
});

/** A small stand-in for the saved record: the version moves only on a write, and a write against a stale version is refused. */
function record() {
  const state = { profile: null as unknown, version: 0, writes: 0 };
  const snap = () => ({ lifecycleGeneration: 0, recordVersion: state.version, profile: state.profile && { ...(state.profile as object), revision: state.version, updatedAt: '2026-11-16T00:00:00.000Z' } });
  const commit = (profile: unknown) => { state.profile = profile; state.version += 1; };
  return { state, snap, commit };
}
const checkButton = () => screen.getByRole('button', { name: 'Check whether my setup was saved' });
const tickAndSave = async () => { fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' })); await settle(); };

describe('answers stay exactly as submitted while a save is unconfirmed (review finding: a newer edit was lost on readback)', () => {
  it('locks every control and cannot be edited or navigated until the check has answered', async () => {
    let submitted: unknown = null;
    script({ save: action => { submitted = action.profile; return never(); }, existing: async () => ({ snapshot: snapshotWith(submitted, 1) }) });
    await startSave();
    await advance(31_000);
    expect(document.querySelector('fieldset')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Review your Automated Job Loop setup' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check my saved dashboard' })).toBeInTheDocument();
    fireEvent.click(checkButton());
    await settle();
    expect(screen.getByRole('heading', { name: 'Your setup is saved.' })).toBeInTheDocument();     // what was submitted is what is saved: nothing newer exists to lose
  });

  it('unlocks the form only when the check reads nothing saved (entirely absent record or an initialized but empty one)', async () => {
    for (const reading of [{ existingState: 'absent' }, { snapshot: snapshotWith(null, 0) }]) {
      script({ save: never, existing: async () => reading });
      mock.call.mockClear();
      const save = await startSave();
      await advance(31_000);
      expect(document.querySelector('fieldset')).toBeDisabled();
      fireEvent.click(checkButton());
      await settle();
      expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved');
      expect(document.querySelector('fieldset')).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
      expect(save).toBeDisabled();
      cleanup(); vi.useRealTimers(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a');
    }
  });

  it('keeps the form locked and the check available when the check cannot tell (no answer shape, or an error)', async () => {
    let reads = 0;
    script({ save: never, existing: async () => { reads += 1; if (reads === 1) return { existingState: 'absent' }; if (reads === 2) return {}; throw new Error('Network down'); } });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be verified');
    expect(document.querySelector('fieldset')).toBeDisabled();
    fireEvent.click(checkButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(checkButton()).toBeEnabled();
    expect(document.querySelector('fieldset')).toBeDisabled();
    expect(names().filter(name => name === 'save_profile')).toHaveLength(1);
  });
});

describe('a write that lands after an empty check (review finding: the retry collided with it and could never recover)', () => {
  it('reads again before the retry and finds the late save instead of writing against a stale version', async () => {
    const server = record(); let first: unknown = null;
    script({
      get: async () => ({ snapshot: server.snap() }),
      existing: async () => ({ snapshot: server.snap() }),             // an initialized but empty record: profile null, version 0
      save: action => { server.state.writes += 1; if (server.state.writes === 1) { first = action.profile; return never(); } return Promise.reject(new Error('A second write must not be sent')); },
    });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved');
    server.commit(first);                                               // the original write lands just after the check read
    await tickAndSave();
    expect(screen.getByRole('heading', { name: 'Your setup is saved.' })).toBeInTheDocument();
    expect(server.state.writes).toBe(1);
    expect(names()).toEqual(['get_existing', 'save_profile', 'get_existing', 'get']);       // the load already held an initialized record; only the retry needed the fresh read
  });

  it('treats a collision between the fresh read and the write as another readback state, not a dead end', async () => {
    const server = record(); let first: unknown = null;
    script({
      get: async () => ({ snapshot: server.snap() }),
      existing: async () => ({ snapshot: server.snap() }),
      save: action => {
        server.state.writes += 1;
        if (server.state.writes === 1) { first = action.profile; return never(); }
        if ((action as { expectedVersion: number }).expectedVersion !== server.state.version) return Promise.reject(new Error('The saved record changed.'));
        server.commit(action.profile); return Promise.resolve({ snapshot: server.snap() });
      },
    });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    // The late write lands between the fresh read of the retry and the retry's own write.
    const read = mock.call.getMockImplementation()!;
    let reads = 0;
    mock.call.mockImplementation(async (owner: string, action: { action: string }, ...rest: unknown[]) => {
      const result = await read(owner, action, ...rest);
      if (action.action === 'get' && ++reads === 1) queueMicrotask(() => server.commit(first));
      return result;
    });
    await tickAndSave();
    expect(screen.getByRole('alert')).toHaveTextContent('The saved record changed');
    await tickAndSave();                                                // the retry starts with another fresh read and finds the saved setup
    expect(screen.getByRole('heading', { name: 'Your setup is saved.' })).toBeInTheDocument();
    expect(server.state.writes).toBe(2);                                // the original and one refused write: never a blind repeat
    expect(names().slice(-3)).toEqual(['get', 'save_profile', 'get']);
  });

  it('never overwrites a different setup that arrived in the meantime and says exactly what happened', async () => {
    const server = record();
    script({
      get: async () => ({ snapshot: server.snap() }),
      existing: async () => ({ snapshot: server.snap() }),
      save: () => never(),
    });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    server.commit({ ...baseProfile(), targetTitles: ['Someone else'] });
    await tickAndSave();
    expect(screen.getByRole('alert')).toHaveTextContent('A setup was saved in another tab');
    expect(screen.getByRole('region', { name: 'A setup is already saved in your account.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    expect(names().filter(name => name === 'save_profile')).toHaveLength(1);
  });
});

describe('the original save lands after an empty check unlocked editing (round 2: the newer draft must stay reachable)', () => {
  it('keeps every newer answer readable and copyable, never writes again and never switches to the saved-dashboard-only view', async () => {
    const server = record(); let first: unknown = null;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    script({
      get: async () => ({ snapshot: server.snap() }),
      existing: async () => ({ snapshot: server.snap() }),             // an initialized but empty record, version 0
      save: action => { server.state.writes += 1; if (server.state.writes === 1) { first = action.profile; return never(); } return Promise.reject(new Error('A second write must not be sent')); },
    });
    await startSave({ ...blankLoopCvAnswers(), name: 'Alex Builder', summary: 'Notes typed in the CV builder' });
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved');
    expect(document.querySelector('fieldset')).toBeEnabled();
    // Editing is allowed again after an empty check: a newer name.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    server.commit(first);                                               // the original write lands with the older name
    await tickAndSave();
    // The saved setup and the newer draft are both in view; nothing was written again or overwritten.
    const panel = screen.getByRole('region', { name: 'Your earlier setup was saved after all.' });
    expect(panel).toHaveTextContent('Alex Example');
    expect(panel).toHaveTextContent('Still here and NOT saved');
    expect(panel).toHaveTextContent('Name on your CV');
    expect(panel).toHaveTextContent('CV builder answers');
    expect(screen.queryByRole('heading', { name: 'Your Automated Job Loop is ready to continue.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).not.toBeInTheDocument();
    const copy = (screen.getByLabelText(/Read them here/) as HTMLTextAreaElement).value;
    expect(copy).toContain('Name on your CV: Alex Revised');
    expect(copy).toContain('name: Alex Builder');
    expect(copy).toContain('summary: Notes typed in the CV builder');
    expect(copy).toContain('Recorded local plant species');           // the CV text
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Save this CV text/ })).toBeDisabled();
    // The form itself still holds the newer answer, and a pending role typed later is part of the copy too.
    for (let index = 0; index < 5; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Search or add a role'), { target: { value: 'Data analyst' } });
    expect((screen.getByLabelText(/Read them here/) as HTMLTextAreaElement).value).toContain('Role text typed but not added: Data analyst');
    expect(screen.getByRole('region', { name: 'Your earlier setup was saved after all.' })).toHaveTextContent('Role text typed but not added');
    fireEvent.click(screen.getByRole('button', { name: 'Copy my newer answers' }));
    await settle();
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('Name on your CV: Alex Revised');
    expect(screen.getByText('Copied.')).toBeInTheDocument();
    expect(server.state.writes).toBe(1);
    expect(names().filter(name => name === 'save_profile')).toHaveLength(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('says when copying is blocked and keeps the text selectable', async () => {
    const server = record(); let first: unknown = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    script({ get: async () => ({ snapshot: server.snap() }), existing: async () => ({ snapshot: server.snap() }), save: action => { first = action.profile; return never(); } });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    server.commit(first);
    await tickAndSave();
    fireEvent.click(screen.getByRole('button', { name: 'Copy my newer answers' }));
    await settle();
    expect(screen.getByText(/Copying was blocked/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Read them here/)).toHaveAttribute('readonly');
  });
});

describe('round 3: only a CV-builder answer is newer when the original save lands and matches the unchanged profile', () => {
  it('keeps the builder answer readable and copyable instead of clearing the draft and saying saved', async () => {
    const server = record(); let first: unknown = null;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    script({ get: async () => ({ snapshot: server.snap() }), existing: async () => ({ snapshot: server.snap() }), save: action => { server.state.writes += 1; first = action.profile; return never(); } });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    // Only the CV builder changes after the unlock; the profile that was submitted stays exactly the same.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByText('No CV yet? Build one with guided questions'));
    fireEvent.change(screen.getByLabelText('How would you introduce your experience? (optional)'), { target: { value: 'Newer builder notes not incorporated into my source CV' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    server.commit(first);                                               // the original save lands with the unchanged profile
    await tickAndSave();
    expect(server.state.writes).toBe(1);                                // no second write
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your Automated Job Loop is ready to continue.' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Changes you made since are not saved');
    expect(screen.getByRole('region', { name: 'Your earlier setup was saved after all.' })).toHaveTextContent('CV builder answers');
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getAllByDisplayValue(/Newer builder notes not incorporated/).length).toBeGreaterThan(0);
    expect((screen.getByLabelText(/Read them here/) as HTMLTextAreaElement).value).toContain('Newer builder notes not incorporated into my source CV');
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy my newer answers' }));
    await settle();
    expect(writeText.mock.calls[0][0]).toContain('Newer builder notes not incorporated into my source CV');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('still says saved, and clears the draft, when nothing newer exists than what the original save held', async () => {
    const server = record(); let first: unknown = null;
    script({ get: async () => ({ snapshot: server.snap() }), existing: async () => ({ snapshot: server.snap() }), save: action => { server.state.writes += 1; first = action.profile; return never(); } });
    await startSave({ ...blankLoopCvAnswers(), summary: 'Builder notes that were already there when the first save was sent' });
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    server.commit(first);
    await tickAndSave();
    expect(screen.getByRole('heading', { name: 'Your setup is saved.' })).toBeInTheDocument();
    expect(server.state.writes).toBe(1);
  });
});

describe('a check that outlives its page, its session or its lifecycle', () => {
  it('writes nothing and shows nothing when the page unmounts during the check', async () => {
    let submitted: unknown = null; let finish: (value: unknown) => void = () => {};
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reads = 0;
    script({ save: action => { submitted = action.profile; return never(); }, existing: () => (++reads === 1 ? Promise.resolve({ existingState: 'absent' }) : new Promise(resolve => { finish = resolve; })) });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    cleanup();
    await act(async () => { finish({ snapshot: snapshotWith(submitted, 1) }); await Promise.resolve(); });
    await advance(60_000);
    expect(names()).toEqual(['get_existing', 'get', 'save_profile', 'get_existing']);
    expect(errors).not.toHaveBeenCalled();
  });

  it.each([
    ['a different session', () => setTrackingDraftOwner('owner-a', 'session-b')],
    ['a different lifecycle generation', () => setTrackingLoopGeneration('owner-a', 9)],
  ])('ignores the answer of the check after %s', async (_label, change) => {
    let submitted: unknown = null; let finish: (value: unknown) => void = () => {};
    let reads = 0;
    script({ save: action => { submitted = action.profile; return never(); }, existing: () => (++reads === 1 ? Promise.resolve({ existingState: 'absent' }) : new Promise(resolve => { finish = resolve; })) });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    act(() => { change(); });
    await act(async () => { finish({ snapshot: snapshotWith(submitted, 1) }); await Promise.resolve(); });
    expect(screen.queryByRole('heading', { name: 'Your setup is saved.' })).not.toBeInTheDocument();
    expect(names().filter(name => name === 'save_profile')).toHaveLength(1);
    expect(names()).toEqual(['get_existing', 'get', 'save_profile', 'get_existing']);
  });
});

describe('a CV file that never finishes reading', () => {
  it('releases the page after a bounded wait and lets the late text go nowhere', async () => {
    script({});
    seed(4);
    render(<MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Back' });
    let finish: (text: string) => void = () => {};
    mock.extract.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    vi.useFakeTimers();
    fireEvent.change(input, { target: { files: [new File(['x'], 'cv.pdf', { type: 'application/pdf' })] } });
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Reading your CV');
    await advance(31_000);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Reading your CV is taking too long');
    await act(async () => { finish('Replaced Late\nA late parser result that must not appear.'); await Promise.resolve(); });
    expect(screen.queryByDisplayValue(/A late parser result/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(/Recorded local plant species/)).toBeInTheDocument();
  });
});

/**
 * Round 4 (independent review, 22 Nov): the original save was given up on, an empty read unlocked editing, a CV-builder answer was added, the deliberate retry's
 * fresh read also timed out before any second write, and then the original write landed. The check ("Check whether my setup was saved") matched the saved profile
 * alone, cleared the draft and said "Your setup is saved." although the newer answer was never sent. Every read of the saved setup now goes through ONE rule: the draft
 * is cleared, and "saved" is said, only when the page still holds exactly the draft of the write that was sent. These tests run each path with a newer answer (kept,
 * readable, copyable, never a second write, no "saved") and with nothing newer (still says saved and clears the draft).
 */
describe('round 4: every read of the saved setup keeps a newer answer, and says saved only when nothing newer exists', () => {
  const NOTE = 'Newer builder notes never sent';
  type Newer = 'builder' | 'name';
  const newerText = (newer: Newer) => (newer === 'builder' ? NOTE : 'Name on your CV: Alex Revised');
  const savedHeading = () => screen.queryByRole('heading', { name: 'Your setup is saved.' });
  const retained = () => recoverOnboardingDraft('owner-a', trackingDraftAuthority('owner-a'), 0);
  const writeText = vi.fn();
  beforeEach(() => { writeText.mockReset(); writeText.mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } }); });

  /** After an empty check the form is open again; a newer answer is added without ever being applied to the CV text (builder) or as a visible edit (name). */
  function addNewer(newer: Newer) {
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    if (newer === 'builder') {
      fireEvent.click(screen.getByText('No CV yet? Build one with guided questions'));
      fireEvent.change(screen.getByLabelText('How would you introduce your experience? (optional)'), { target: { value: NOTE } });
    } else fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Revised' } });
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
  }
  async function expectNewerKept(server: ReturnType<typeof record>, newer: Newer, writes = 1) {
    expect(savedHeading()).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your Automated Job Loop is ready to continue.' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your earlier setup was saved after all.' })).toHaveTextContent('Still here and NOT saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Changes you made since are not saved');
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();                       // the newer answer is reachable in the form too
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Save this CV text/ })).toBeDisabled();
    expect((screen.getByLabelText(/Read them here/) as HTMLTextAreaElement).value).toContain(newerText(newer));
    fireEvent.click(screen.getByRole('button', { name: 'Copy my newer answers' }));
    await settle();
    expect(writeText.mock.calls[0][0]).toContain(newerText(newer));
    expect(JSON.stringify(retained())).toContain(newer === 'builder' ? NOTE : 'Alex Revised');   // the draft was not cleared
    expect(server.state.writes).toBe(writes);                                                   // never an automatic extra write
    expect(names().filter(name => name === 'save_profile')).toHaveLength(writes);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  }
  function expectSavedAndCleared(server: ReturnType<typeof record>, writes = 1) {
    expect(savedHeading()).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your earlier setup was saved after all.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(retained()).toBeNull();                                                              // nothing newer existed, so the draft is cleared
    expect(server.state.writes).toBe(writes);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  }

  /** The exact review sequence: the retry's fresh read hangs (no second write is ever sent), times out, and only then does the original write land. */
  async function retryReadTimesOut(newer: Newer | null) {
    const server = record(); let first: unknown = null;
    script({ get: () => never(), existing: async () => ({ snapshot: server.snap() }), save: action => { first = action.profile; server.state.writes += 1; return never(); } });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    expect(document.querySelector('fieldset')).toBeEnabled();
    if (newer) addNewer(newer);
    await tickAndSave();
    await advance(31_000);
    expect(screen.getByRole('alert')).toHaveTextContent('could not confirm');
    expect(names().filter(name => name === 'save_profile')).toHaveLength(1);
    server.commit(first);
    return server;
  }

  it.each(['builder', 'name'] as const)('check after the retry\'s read also timed out: a newer %s answer stays readable and copyable, and the page does not say saved', async newer => {
    const server = await retryReadTimesOut(newer);
    fireEvent.click(checkButton());
    await settle();
    await expectNewerKept(server, newer);
  });

  it('check after the retry\'s read also timed out, nothing newer: still says saved and clears the draft', async () => {
    const server = await retryReadTimesOut(null);
    fireEvent.click(checkButton());
    await settle();
    expectSavedAndCleared(server);
  });

  /** A third, deliberate attempt after two timeouts and an empty check: its fresh read finds the original write. */
  async function thirdAttempt(newer: Newer | null) {
    const server = record(); let first: unknown = null; let gets = 0;
    script({ get: () => (++gets === 1 ? never() : Promise.resolve({ snapshot: server.snap() })), existing: async () => ({ snapshot: server.snap() }), save: action => { first = action.profile; server.state.writes += 1; return never(); } });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    if (newer) addNewer(newer);
    await tickAndSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved');
    server.commit(first);
    await tickAndSave();
    return server;
  }

  it.each(['builder', 'name'] as const)('retry read after two timeouts: a newer %s answer stays readable and copyable, and the page does not say saved', async newer => {
    const server = await thirdAttempt(newer);
    await expectNewerKept(server, newer);
  });

  it('retry read after two timeouts, nothing newer: still says saved and clears the draft', async () => {
    const server = await thirdAttempt(null);
    expectSavedAndCleared(server);
  });

  /** The retry's fresh read answers (empty), its own write is sent and never answers; then the original write lands and the check reads it. */
  async function secondWriteTimesOut(newer: Newer) {
    const server = record(); let first: unknown = null;
    script({ get: async () => ({ snapshot: server.snap() }), existing: async () => ({ snapshot: server.snap() }), save: action => { server.state.writes += 1; if (server.state.writes === 1) first = action.profile; return never(); } });
    await startSave();
    await advance(31_000);
    fireEvent.click(checkButton());
    await settle();
    addNewer(newer);
    await tickAndSave();
    await advance(31_000);
    server.commit(first);
    fireEvent.click(checkButton());
    await settle();
    return server;
  }

  it('check after the retry\'s own write was sent: the draft the user submitted last is exactly what was sent, so a matching saved setup is saved', async () => {
    const server = await secondWriteTimesOut('builder');
    expectSavedAndCleared(server, 2);                                                           // the original and the one deliberate retry; the check wrote nothing
    expect(names().filter(name => name === 'save_profile')).toHaveLength(2);
  });

  it('check after the retry\'s own write was sent with a changed name: the saved older setup is kept apart from the newer name, which stays readable and copyable', async () => {
    const server = await secondWriteTimesOut('name');
    expect(savedHeading()).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'A setup is already saved in your account.' })).toHaveTextContent('Still here and NOT saved');
    expect(screen.getByRole('alert')).toHaveTextContent('A different setup is already saved');
    expect((screen.getByLabelText(/Read them here/) as HTMLTextAreaElement).value).toContain('Name on your CV: Alex Revised');
    expect(JSON.stringify(retained())).toContain('Alex Revised');
    expect(server.state.writes).toBe(2);
    expect(names().filter(name => name === 'save_profile')).toHaveLength(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('check after the first save timed out, with builder answers that were already on the page when it was sent: says saved and clears the draft', async () => {
    const server = record(); let first: unknown = null;
    script({ get: async () => ({ snapshot: server.snap() }), existing: async () => ({ snapshot: server.snap() }), save: action => { server.state.writes += 1; first = action.profile; return never(); } });
    await startSave({ ...blankLoopCvAnswers(), summary: 'Builder notes that were already there when the first save was sent' });
    await advance(31_000);
    server.commit(first);
    fireEvent.click(checkButton());
    await settle();
    expectSavedAndCleared(server);
  });
});
