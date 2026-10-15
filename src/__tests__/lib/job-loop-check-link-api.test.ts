import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopAction } from '../../../supabase/functions/_shared/job-loop-types';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: sdk.getUser }, functions: { invoke: sdk.invoke } } }));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: vi.fn() }));
import { boundLoopAction, callJobLoop } from '@/lib/job-loop-api';

const owner = '11111111-1111-4111-a111-111111111111', checkId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', opportunityId = '33333333-3333-4333-a333-333333333333';
const opportunity = { title: 'Analyst', company: 'Example employer', location: 'Dubai', url: 'https://example.test/jobs/1', description: 'Review customer research, document evidence and prepare reports for the product team.', contact: null };
const request = (): LoopAction => ({ action: 'link_saved_check', expectedGeneration: 7, expectedVersion: 1, checkId, opportunity: { ...opportunity }, linkConsent: true });
function response() {
  return { checkLink: { checkId, opportunityId, reused: false }, snapshot: {
    lifecycleGeneration: 7, recordVersion: 2, profile: null, claims: [], runs: [], packets: [], inbox: [], models: [],
    opportunities: [{ ...opportunity, id: opportunityId, sourceCheckId: checkId, source: 'manual', sourceKey: `saved-check:${checkId}`, checkedAt: '2026-10-15T00:00:00Z', verification: 'user_provided', status: 'interview', notes: 'Keep this progress', followUpAt: '2026-10-20' }],
    capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 },
    gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false },
  } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner(owner);
  sdk.session.mockResolvedValue({ user: { id: owner } });
  sdk.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  sdk.invoke.mockResolvedValue({ data: response(), error: null });
});
afterEach(() => { clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('saved-check link browser boundary (unpublished)', () => {
  it('preserves exact provenance and kept progress in the validated response', async () => {
    expect(await callJobLoop(owner, request())).toEqual(response());
    expect(sdk.invoke).toHaveBeenCalledExactlyOnceWith('job-loop-control', { body: request() });
  });
  it('also preserves sourceCheckId through an ordinary existing-record read', async () => {
    sdk.invoke.mockResolvedValue({ data: { existingState: 'active', snapshot: response().snapshot }, error: null });
    expect((await callJobLoop(owner, { action: 'get_existing' })).snapshot?.opportunities[0].sourceCheckId).toBe(checkId);
  });
  it('normalizes the opaque check UUID before dispatch and response matching', async () => {
    await callJobLoop(owner, { ...request(), checkId: checkId.toUpperCase() } as LoopAction);
    expect(sdk.invoke.mock.calls[0][1].body.checkId).toBe(checkId);
  });
  it('binds the displayed generation once without upgrading an old intent', () => {
    const action = request(); delete action.expectedGeneration;
    expect(boundLoopAction(action, 7).expectedGeneration).toBe(7);
    expect(boundLoopAction(boundLoopAction(action, 7), 9).expectedGeneration).toBe(7);
    expect(() => boundLoopAction(action, undefined)).toThrow();
  });
  it.each([{ expectedGeneration: undefined }, { expectedGeneration: 1.5 }, { checkId: 'not-an-id' }, { linkConsent: false }, { linkConsent: 'true' }, { userId: owner }, { opportunity: { ...opportunity, sourceCheckId: checkId } }, { opportunity: { ...opportunity, url: 'https://user:pass@example.test' } }])('rejects missing consent, unsafe input or claimed metadata before auth/network (%j)', async patch => {
    await expect(callJobLoop(owner, { ...request(), ...patch } as LoopAction)).rejects.toThrow();
    expect(sdk.invoke).not.toHaveBeenCalled(); expect(sdk.getUser).not.toHaveBeenCalled();
  });
  it('rejects an unconfirmed auth owner before dispatch', async () => {
    setTrackingDraftOwner(null);
    await expect(callJobLoop(owner, request())).rejects.toThrow('sign-in changed');
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('rejects A→B→A during delayed SDK validation before dispatch', async () => {
    const auth = deferred<unknown>(); sdk.getUser.mockReturnValueOnce(auth.promise);
    const pending = callJobLoop(owner, request()), rejected = expect(pending).rejects.toThrow('sign-in changed');
    await vi.waitFor(() => expect(sdk.getUser).toHaveBeenCalled());
    setTrackingDraftOwner('different-owner'); setTrackingDraftOwner(owner);
    auth.resolve({ data: { user: { id: owner } }, error: null }); await rejected;
    expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('rejects A→B→A during a delayed mutation response without displaying private snapshot', async () => {
    const reply = deferred<unknown>(); sdk.invoke.mockReturnValueOnce(reply.promise);
    const pending = callJobLoop(owner, request()), rejected = expect(pending).rejects.toThrow('sign-in changed');
    await vi.waitFor(() => expect(sdk.invoke).toHaveBeenCalled());
    setTrackingDraftOwner('different-owner'); setTrackingDraftOwner(owner);
    reply.resolve({ data: response(), error: null }); await rejected;
  });
  it('captures an immutable request before delayed auth rather than adopting changed draft inputs', async () => {
    const auth = deferred<unknown>(); sdk.getUser.mockReturnValueOnce(auth.promise);
    const action = request(), pending = callJobLoop(owner, action);
    await vi.waitFor(() => expect(sdk.getUser).toHaveBeenCalled());
    if (action.action === 'link_saved_check') { action.opportunity.title = 'New unsaved title'; action.expectedGeneration = 9; }
    auth.resolve({ data: { user: { id: owner } }, error: null }); await pending;
    expect(sdk.invoke.mock.calls[0][1].body).toEqual(request());
  });
  it.each(['no-receipt', 'wrong-check', 'wrong-opportunity', 'new-generation', 'missing-provenance', 'duplicate-provenance', 'non-manual', 'wrong-source-key'])('rejects a mismatched receipt/snapshot: %s', async mode => {
    const value = response();
    if (mode === 'no-receipt') delete value.checkLink;
    if (mode === 'wrong-check') value.checkLink.checkId = owner;
    if (mode === 'wrong-opportunity') value.checkLink.opportunityId = owner;
    if (mode === 'new-generation') value.snapshot.lifecycleGeneration = 9;
    if (mode === 'missing-provenance') delete value.snapshot.opportunities[0].sourceCheckId;
    if (mode === 'duplicate-provenance') value.snapshot.opportunities.push({ ...value.snapshot.opportunities[0], id: owner });
    if (mode === 'non-manual') value.snapshot.opportunities[0].source = 'web_search';
    if (mode === 'wrong-source-key') value.snapshot.opportunities[0].sourceKey = 'url:other';
    sdk.invoke.mockResolvedValue({ data: value, error: null });
    await expect(callJobLoop(owner, request())).rejects.toThrow('could not be confirmed');
  });
  it('retains the exact check retry identity after an ambiguous transport failure', async () => {
    sdk.invoke.mockRejectedValueOnce(new Error('lost response'));
    await expect(callJobLoop(owner, request())).rejects.toThrow('could not be confirmed');
    const retry = response(); retry.checkLink.reused = true;
    sdk.invoke.mockResolvedValueOnce({ data: retry, error: null });
    expect((await callJobLoop(owner, request())).checkLink?.reused).toBe(true);
    expect(sdk.invoke.mock.calls[0][1].body).toEqual(sdk.invoke.mock.calls[1][1].body);
  });
});
