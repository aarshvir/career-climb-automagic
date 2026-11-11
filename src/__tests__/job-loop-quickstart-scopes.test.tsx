import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobLoop from '../pages/JobLoop';
import { blankLoopProfile } from '../lib/job-loop-audiences';
import { clearLoopWorkingDraft } from '../lib/loop-draft-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, trackingDraftAuthority } from '../lib/tracking-draft-memory';
import type { LoopAction, LoopClaimInput, LoopResponse, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'scope-owner-a' } as { id: string } | null, loading: false, authError: null as string | null },
  call: vi.fn(),
  cvs: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/free-check-api', () => ({ listFreeChecks: vi.fn(async () => []) }));
vi.mock('@/lib/job-loop-api', () => ({
  callJobLoop: mocks.call, loadLoopSavedCvs: mocks.cvs,
  getLoopDownload: vi.fn(), getLoopPreview: vi.fn(),
  isLoopHttpsUrl: () => true, safeLoopGmailUrl: (value: string) => value,
}));

const lines = [
  'Example College: recorded local plant species in a supervised academic project.',
  'Example College: compared the collected observations with a published classification guide.',
  'Example College: prepared a documented explanation of the project method and its limitations.',
];
let current: LoopSnapshot;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function clone() { return structuredClone(current); }
function fact(sourceQuote: string): LoopClaimInput {
  return { sourceKind: 'cv_passage', sourceQuote, phrasing: sourceQuote, context: sourceQuote.startsWith('Another College') ? 'Another College' : 'Example College', kind: 'academic_project', resultStatus: 'not_measured', confirmed: false, shareable: false };
}
function commit(action: Extract<LoopAction, { action: 'save_claim' }>) {
  current = { ...current, recordVersion: current.recordVersion + 1, claims: [...current.claims, { ...action.claim, id: 'scope-fact-' + (current.claims.length + 1), revision: 1, status: 'active', createdAt: '2026-11-11T00:00:00Z' }] };
  return { snapshot: clone() };
}
function tree() {
  return <HelmetProvider><MemoryRouter initialEntries={[{ pathname: '/loop', state: { onboardingSaved: true, owner: 'scope-owner-a', generation: 0, authority: trackingDraftAuthority('scope-owner-a') } }]}><JobLoop /></MemoryRouter></HelmetProvider>;
}
function writes() { return mocks.call.mock.calls.filter(([, action]) => action.action === 'save_claim'); }
function runs() { return mocks.call.mock.calls.filter(([, action]) => action.action === 'start_run'); }
async function beginQuickStart() {
  fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
  const group = within(await screen.findByRole('group', { name: 'Quick start' }));
  fireEvent.click(await group.findByLabelText(/The ticked lines are accurate/));
  fireEvent.click(group.getByRole('button', { name: 'Confirm and find my first matches' }));
}
async function settle(action: () => void) {
  await act(async () => { action(); await new Promise<void>(resolve => setTimeout(resolve, 0)); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { id: 'scope-owner-a' }; mocks.auth.loading = false; mocks.auth.authError = null;
  clearLoopWorkingDraft(); clearTrackingDraftMemory(); setTrackingDraftOwner('scope-owner-a');
  current = {
    lifecycleGeneration: 0, recordVersion: 1,
    profile: { ...blankLoopProfile('professional'), name: 'Scope Example', sourceText: lines.join('\n'), targetTitles: ['Research assistant'], locations: ['Boston'], revision: 1, updatedAt: '2026-11-11T00:00:00Z' },
    claims: [], opportunities: [], packets: [], runs: [], inbox: [], models: [],
    capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 },
    gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false },
  };
  mocks.cvs.mockResolvedValue([]);
  mocks.call.mockImplementation(async (_owner: string, action: LoopAction): Promise<LoopResponse> => {
    if (action.action === 'get') return { snapshot: clone() };
    if (action.action === 'suggest_claims') return { snapshot: clone(), suggestions: lines.map(fact) };
    if (action.action === 'save_claim') return commit(action);
    if (action.action === 'start_run') return { snapshot: clone(), runId: 'scope-first-run' };
    throw new Error('Unexpected scope-fixture action: ' + action.action);
  });
});


describe('quick-start revocation recovery and first-use fallback', () => {
  it.each(['loading', 'error'] as const)('does not revive the original batch when transient auth %s recovers before its first acknowledgement', async mode => {
    const pending = deferred<LoopResponse>(), normal = mocks.call.getMockImplementation()!;
    let heldAction: Extract<LoopAction, { action: 'save_claim' }> | undefined;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => {
      if (action.action === 'save_claim' && !heldAction) { heldAction = action; return pending.promise; }
      return normal(owner, action);
    });
    const view = render(tree()); await beginQuickStart();
    await waitFor(() => expect(heldAction).toBeDefined());
    if (mode === 'loading') mocks.auth.loading = true; else mocks.auth.authError = 'Synthetic transient SDK interruption';
    view.rerender(tree()); await settle(() => undefined);
    mocks.auth.loading = false; mocks.auth.authError = null;
    view.rerender(tree()); await settle(() => undefined);
    await settle(() => pending.resolve(commit(heldAction!)));
    expect(writes()).toHaveLength(1);
    expect(runs()).toHaveLength(0);
  });

  it('does not adopt an unrelated record-version jump as its own successful fact progression', async () => {
    const pending = deferred<LoopResponse>(), normal = mocks.call.getMockImplementation()!;
    let heldAction: Extract<LoopAction, { action: 'save_claim' }> | undefined;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => {
      if (action.action === 'save_claim' && !heldAction) { heldAction = action; return pending.promise; }
      return normal(owner, action);
    });
    render(tree()); await beginQuickStart();
    await waitFor(() => expect(heldAction).toBeDefined());
    commit(heldAction!);
    current = { ...current, recordVersion: current.recordVersion + 2 };
    await settle(() => pending.resolve({ snapshot: clone() }));
    expect(writes()).toHaveLength(1);
    expect(runs()).toHaveLength(0);
  });

  it('lets a new owner make a fresh operation and ignores the old owner completion', async () => {
    const oldSave = deferred<LoopResponse>(), newSave = deferred<LoopResponse>();
    const normal = mocks.call.getMockImplementation()!;
    const original = clone(), otherLines = lines.map(line => line.replace('Example College', 'Another College'));
    let heldOld: Extract<LoopAction, { action: 'save_claim' }> | undefined;
    let heldNew: Extract<LoopAction, { action: 'save_claim' }> | undefined;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => {
      if (action.action === 'suggest_claims') return Promise.resolve({ snapshot: clone(), suggestions: (owner === 'scope-owner-b' ? otherLines : lines).map(fact) });
      if (action.action === 'save_claim' && owner === 'scope-owner-a' && !heldOld) { heldOld = action; return oldSave.promise; }
      if (action.action === 'save_claim' && owner === 'scope-owner-b' && !heldNew) { heldNew = action; return newSave.promise; }
      return normal(owner, action);
    });
    const view = render(tree()); await beginQuickStart();
    await waitFor(() => expect(heldOld).toBeDefined());
    const oldReceipt: LoopResponse = {
      snapshot: { ...original, recordVersion: 2, claims: [{ ...heldOld!.claim, id: 'old-owner-fact', revision: 1, status: 'active', createdAt: '2026-11-11T00:00:00Z' }] },
    };
    current = { ...structuredClone(original), profile: { ...original.profile!, sourceText: otherLines.join('\n'), name: 'Other Scope Example' }, claims: [] };
    mocks.auth.user = { id: 'scope-owner-b' }; setTrackingDraftOwner('scope-owner-b');
    view.rerender(tree());
    await waitFor(() => expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(otherLines.join('\n')));
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    const quick = within(await screen.findByRole('group', { name: 'Quick start' }));
    fireEvent.click(await quick.findByLabelText(/The ticked lines are accurate/));
    const go = quick.getByRole('button', { name: 'Confirm and find my first matches' });
    expect(go).toBeEnabled();
    fireEvent.click(go); await waitFor(() => expect(heldNew).toBeDefined());
    await settle(() => oldSave.resolve(oldReceipt));
    expect(writes().filter(([owner]) => owner === 'scope-owner-a')).toHaveLength(1);
    expect(writes().filter(([owner]) => owner === 'scope-owner-b')).toHaveLength(1);
    expect(runs()).toHaveLength(0);
    await settle(() => newSave.resolve(commit(heldNew!)));
    await waitFor(() => expect(runs().filter(([owner]) => owner === 'scope-owner-b')).toHaveLength(1));
    expect(writes().filter(([owner]) => owner === 'scope-owner-b').map(([, action]) => action.claim.sourceQuote)).toEqual(otherLines);
    expect(runs().some(([owner]) => owner === 'scope-owner-a')).toBe(false);
  });

  it('opens and focuses manual fact entry when there are no eligible literal passages', async () => {
    const normal = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => action.action === 'suggest_claims'
      ? Promise.resolve({ snapshot: clone(), suggestions: [] }) : normal(owner, action));
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add a fact myself' }));
    const manual = screen.getByText('Add my own specific example', { selector: 'summary' }).closest('details')!;
    await waitFor(() => expect(manual).toHaveAttribute('open'));
    expect(manual.querySelector('select,input,textarea')).toHaveFocus();
    expect(writes()).toHaveLength(0);
    expect(runs()).toHaveLength(0);
  });
});
afterEach(() => { cleanup(); clearLoopWorkingDraft(); clearTrackingDraftMemory(); });

describe('quick-start authority and acknowledgement boundaries in the actual JobLoop', () => {
  it('control: saves the exact selected source facts before one rules-only run', async () => {
    render(tree()); await beginQuickStart();
    await waitFor(() => expect(runs()).toHaveLength(1));
    expect(writes().map(([, action]) => action.claim.sourceQuote)).toEqual(lines);
    expect(writes().map(([, action]) => action.expectedVersion)).toEqual([1, 2, 3]);
    expect(runs()[0][1]).toMatchObject({ provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false, expectedGeneration: 0 });
    expect(mocks.call.mock.calls.some(([, action]) => /save_schedule|save_cv_variant|gmail/.test(action.action))).toBe(false);
  });

  it.each(['loading', 'error'] as const)('stops the remaining batch when auth becomes %s during a save and does not resume after recovery', async mode => {
    const pending = deferred<LoopResponse>(), normal = mocks.call.getMockImplementation()!;
    let heldAction: Extract<LoopAction, { action: 'save_claim' }> | undefined;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => {
      if (action.action === 'save_claim' && !heldAction) { heldAction = action; return pending.promise; }
      return normal(owner, action);
    });
    const view = render(tree()); await beginQuickStart();
    await waitFor(() => expect(heldAction).toBeDefined());
    if (mode === 'loading') mocks.auth.loading = true; else mocks.auth.authError = 'Synthetic interrupted SDK session';
    view.rerender(tree());
    const receipt = commit(heldAction!);
    await settle(() => pending.resolve(receipt));
    expect(writes()).toHaveLength(1); expect(runs()).toHaveLength(0);
    mocks.auth.loading = false; mocks.auth.authError = null; view.rerender(tree());
    await settle(() => undefined);
    expect(writes()).toHaveLength(1); expect(runs()).toHaveLength(0);
  });

  it.each(['lifetime', 'source'] as const)('does not continue an old-source batch when the save response observes a different %s', async change => {
    const pending = deferred<LoopResponse>(), normal = mocks.call.getMockImplementation()!;
    let held = false;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => {
      if (action.action === 'save_claim' && !held) { held = true; return pending.promise; }
      return normal(owner, action);
    });
    render(tree()); await beginQuickStart(); await waitFor(() => expect(held).toBe(true));
    const changedSource = 'Replacement Example College: reviewed a different supervised research project and its recorded observations.';
    current = {
      ...clone(), lifecycleGeneration: change === 'lifetime' ? 1 : 0,
      recordVersion: change === 'lifetime' ? 1 : 3,
      profile: { ...current.profile!, sourceText: changedSource, revision: 2 }, claims: [],
    };
    // A later lifetime/source snapshot must not inherit the earlier selected facts.
    await settle(() => pending.resolve({ snapshot: clone() }));
    expect(screen.getByLabelText('Reviewed source CV or career record')).toHaveValue(changedSource);
    expect(writes()).toHaveLength(1); expect(runs()).toHaveLength(0);
  });

  it('stops after a rejected first save instead of attempting other facts or starting a run', async () => {
    const normal = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => {
      if (action.action === 'save_claim') return Promise.reject(new Error('Synthetic rejected fact save'));
      return normal(owner, action);
    });
    render(tree()); await beginQuickStart(); await settle(() => undefined);
    expect(writes()).toHaveLength(1); expect(runs()).toHaveLength(0); expect(current.claims).toHaveLength(0);
  });

  it('keeps one acknowledged fact but does not continue or autorun after an uncertain second save', async () => {
    const uncertain = deferred<LoopResponse>(), normal = mocks.call.getMockImplementation()!;
    let saveCount = 0;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => {
      if (action.action === 'save_claim' && ++saveCount === 2) return uncertain.promise;
      return normal(owner, action);
    });
    render(tree()); await beginQuickStart(); await waitFor(() => expect(saveCount).toBe(2));
    expect(current.claims.map(claim => claim.sourceQuote)).toEqual([lines[0]]);
    await settle(() => uncertain.reject(new Error('Synthetic response loss; the second write outcome is unknown')));
    expect(writes()).toHaveLength(2);
    expect(writes().filter(([, action]) => action.claim.sourceQuote === lines[0])).toHaveLength(1);
    expect(runs()).toHaveLength(0);
    expect(current.claims.map(claim => claim.sourceQuote)).toEqual([lines[0]]);
  });
});


describe('manual fact fallback delayed focus', () => {
  it('does not steal focus after the user moves to another control', async () => {
    const frames: FrameRequestCallback[] = [], raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
    const normal = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => action.action === 'suggest_claims'
      ? Promise.resolve({ snapshot: clone(), suggestions: [] }) : normal(owner, action));
    try {
      render(tree());
      fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Add a fact myself' }));
      expect(frames.length).toBeGreaterThan(0);
      const later = screen.getByRole('button', { name: /^Today$/ });
      later.focus();
      await act(async () => { frames.splice(0).forEach(callback => callback(performance.now())); });
      expect(later).toHaveFocus();
      expect(screen.getByText('Add my own specific example', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
      expect(writes()).toHaveLength(0);
    } finally { raf.mockRestore(); }
  });

  it('does not replay an old focus handoff after sign-in readiness is revoked and restored', async () => {
    const frames: FrameRequestCallback[] = [], raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
    const normal = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation((owner: string, action: LoopAction) => action.action === 'suggest_claims'
      ? Promise.resolve({ snapshot: clone(), suggestions: [] }) : normal(owner, action));
    try {
      const view = render(tree());
      fireEvent.click(await screen.findByRole('button', { name: 'Show the facts from my CV' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Add a fact myself' }));
      expect(frames.length).toBeGreaterThan(0);
      mocks.auth.loading = true; view.rerender(tree()); await settle(() => undefined);
      mocks.auth.loading = false; view.rerender(tree()); await settle(() => undefined);
      await act(async () => { frames.splice(0).forEach(callback => callback(performance.now())); });
      await settle(() => undefined);
      expect(screen.getByText('Add my own specific example', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
      expect(writes()).toHaveLength(0);
      expect(runs()).toHaveLength(0);
    } finally { raf.mockRestore(); }
  });
});
