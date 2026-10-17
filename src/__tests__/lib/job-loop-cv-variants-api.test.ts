import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopAction, LoopProfileInput } from '../../../supabase/functions/_shared/job-loop-types';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration } from '@/lib/tracking-draft-memory';
const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: sdk.getUser }, functions: { invoke: sdk.invoke } } }));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: vi.fn() }));
import { callJobLoop } from '@/lib/job-loop-api';

const owner = '11111111-1111-4111-a111-111111111111';
const requestId = '22222222-2222-4222-a222-222222222222';
const variantId = '33333333-3333-4333-a333-333333333333';
const profile: LoopProfileInput = { audience: 'professional', name: 'Alex Example', contactLine: '', sourceText: 'Example Group\nHelped prepare an operations tracker covering six workstreams.\nEducation: Business studies.', targetTitles: ['Analyst'], locations: ['Remote'], languages: ['English'], experienceYears: null, pageTarget: 1, discreetSearch: true, excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null } };
function request() { return { action: 'save_cv_variant' as const, expectedGeneration: 7, expectedVersion: 10, requestId, variantId: null as string | null, expectedVariantRevision: 0, label: 'Operations', profile: structuredClone(profile), claimRefs: [], saveConsent: true as const }; }
function response() { return { variantSave: { generation: 7, recordVersion: 11, requestId, requestHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), savedRevision: 1, reused: false, variant: { id: variantId, generation: 7, revision: 1, label: 'Operations', profile: structuredClone(profile), claims: [], sourceHash: 'b'.repeat(64), createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z' } } }; }
function readRequest(): LoopAction { return { action: 'read_cv_variants', expectedGeneration: 7 }; }
function readResponse() { return { cvVariants: { generation: 7, recordVersion: 11, variants: [response().variantSave.variant] } }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner(owner); setTrackingLoopGeneration(owner, 7);
  sdk.session.mockResolvedValue({ user: { id: owner } }); sdk.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  sdk.invoke.mockResolvedValue({ data: response(), error: null });
});
afterEach(() => { clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('CV variant browser contract, not deployed', () => {
  it('sends exact private-save intent without an owner override or preparation action', async () => {
    const result = await callJobLoop(owner, request());
    expect(sdk.invoke).toHaveBeenCalledExactlyOnceWith('job-loop-control', { body: request() });
    expect(result).toEqual(response()); expect(result.snapshot).toBeUndefined(); expect(result.runId).toBeUndefined();
  });
  it('reads exact generation without initializing or opening the global record', async () => {
    sdk.invoke.mockResolvedValue({ data: readResponse(), error: null });
    expect(await callJobLoop(owner, readRequest())).toEqual(readResponse());
    expect(sdk.invoke).toHaveBeenCalledExactlyOnceWith('job-loop-control', { body: readRequest() });
  });
  it.each([{ userId: owner }, { requestHash: 'forged' }, { sourceHash: 'forged' }, { saveConsent: false }, { saveConsent: 'true' }, { expectedGeneration: undefined }, { expectedVersion: 1.5 }, { profile: { ...profile, approved: true } }])('rejects unsafe save before auth/data transmission: %j', async patch => {
    await expect(callJobLoop(owner, { ...request(), ...patch } as LoopAction)).rejects.toThrow();
    expect(sdk.getUser).not.toHaveBeenCalled(); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it.each([{ owner }, { expectedGeneration: undefined }, { expectedGeneration: -1 }])('rejects unsafe passive read: %j', async patch => {
    await expect(callJobLoop(owner, { ...readRequest(), ...patch } as LoopAction)).rejects.toThrow(); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('captures nested sources and original request before authentication awaits', async () => {
    const auth = deferred<unknown>(); sdk.getUser.mockReturnValueOnce(auth.promise);
    const draft = request(), pending = callJobLoop(owner, draft);
    await vi.waitFor(() => expect(sdk.getUser).toHaveBeenCalled());
    draft.profile.sourceText = 'New local edits'; draft.profile.targetTitles.push('Manager'); draft.label = 'Newer label'; draft.requestId = variantId;
    auth.resolve({ data: { user: { id: owner } }, error: null }); await pending;
    expect(sdk.invoke.mock.calls[0][1].body).toEqual(request()); expect(draft.profile.sourceText).toBe('New local edits');
  });
  it.each(['save-before', 'save-after', 'read-before', 'read-after'])('rejects owner A→B→A across %s', async mode => {
    const delayed = deferred<unknown>(), reading = mode.startsWith('read');
    if (mode.endsWith('before')) sdk.getUser.mockReturnValueOnce(delayed.promise); else sdk.invoke.mockReturnValueOnce(delayed.promise);
    const pending = callJobLoop(owner, reading ? readRequest() : request()); const rejection = expect(pending).rejects.toThrow(/sign-in changed/);
    await vi.waitFor(() => expect(mode.endsWith('before') ? sdk.getUser : sdk.invoke).toHaveBeenCalled());
    setTrackingDraftOwner(variantId); setTrackingDraftOwner(owner);
    delayed.resolve(mode.endsWith('before') ? { data: { user: { id: owner } }, error: null } : { data: reading ? readResponse() : response(), error: null });
    await rejection; if (mode.endsWith('before')) expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it.each(['before', 'after'])('rejects a newer known lifecycle %s dispatch', async phase => {
    const delayed = deferred<unknown>(); if (phase === 'before') sdk.getUser.mockReturnValueOnce(delayed.promise); else sdk.invoke.mockReturnValueOnce(delayed.promise);
    const pending = callJobLoop(owner, request()), rejection = expect(pending).rejects.toThrow(/workspace changed/);
    await vi.waitFor(() => expect(phase === 'before' ? sdk.getUser : sdk.invoke).toHaveBeenCalled()); setTrackingLoopGeneration(owner, 8);
    delayed.resolve(phase === 'before' ? { data: { user: { id: owner } }, error: null } : { data: response(), error: null }); await rejection;
    if (phase === 'before') expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('refuses negative SDK authority even when session adapters still show an owner', async () => {
    setTrackingDraftOwner(null); await expect(callJobLoop(owner, request())).rejects.toThrow(/sign-in changed/); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it.each(['generation', 'request', 'savedRevision', 'recordVersion', 'sourceHash', 'source', 'label', 'hashFormat', 'unexpectedNewRevision'])('rejects inconsistent save receipt: %s', async mode => {
    const data = response(), receipt = data.variantSave;
    if (mode === 'generation') receipt.generation = 8;
    if (mode === 'request') receipt.requestId = variantId;
    if (mode === 'savedRevision') receipt.savedRevision = 2;
    if (mode === 'recordVersion') receipt.recordVersion = 10;
    if (mode === 'sourceHash') receipt.sourceHash = 'c'.repeat(64);
    if (mode === 'source') receipt.variant.profile.sourceText += '\nOther source';
    if (mode === 'label') receipt.variant.label = 'Other name';
    if (mode === 'hashFormat') receipt.requestHash = 'not-a-hash';
    if (mode === 'unexpectedNewRevision') receipt.variant.revision = 2;
    sdk.invoke.mockResolvedValue({ data, error: null }); await expect(callJobLoop(owner, request())).rejects.toThrow(/could not be confirmed/);
  });
  it('retains the original receipt alongside a genuinely newer current variant after ambiguous retry', async () => {
    sdk.invoke.mockRejectedValueOnce(new Error('connection lost'));
    await expect(callJobLoop(owner, request())).rejects.toThrow();
    const data = response(); data.variantSave.reused = true; data.variantSave.recordVersion = 15;
    data.variantSave.variant.revision = 2; data.variantSave.variant.label = 'Later edit'; data.variantSave.variant.sourceHash = 'c'.repeat(64);
    data.variantSave.variant.profile.sourceText += '\nLater facts';
    sdk.invoke.mockResolvedValue({ data, error: null });
    const result = await callJobLoop(owner, request());
    expect(result.variantSave.savedRevision).toBe(1); expect(result.variantSave.variant.revision).toBe(2);
    expect(result.variantSave.sourceHash).not.toBe(result.variantSave.variant.sourceHash);
    expect(sdk.invoke.mock.calls[0][1].body).toEqual(sdk.invoke.mock.calls[1][1].body);
  });
  it('rejects a substituted opaque ID when updating a known variant', async () => {
    const action = { ...request(), variantId, expectedVariantRevision: 1 }; const data = response();
    data.variantSave.savedRevision = 2; data.variantSave.variant.revision = 2; data.variantSave.variant.id = owner;
    sdk.invoke.mockResolvedValue({ data, error: null }); await expect(callJobLoop(owner, action)).rejects.toThrow(/could not be confirmed/);
  });
  it.each(['mixedSnapshot', 'mixedErasure', 'wrongWrapper', 'unknownField', 'missing'])('rejects ambiguous response envelope: %s', async mode => {
    const data: Record<string, unknown> = mode === 'missing' ? {} : response();
    if (mode === 'mixedSnapshot') data.snapshot = {};
    if (mode === 'mixedErasure') data.erasureGeneration = 8;
    if (mode === 'wrongWrapper') data.cvVariants = readResponse().cvVariants;
    if (mode === 'unknownField') data.approved = true;
    sdk.invoke.mockResolvedValue({ data, error: null }); await expect(callJobLoop(owner, request())).rejects.toThrow();
  });
  it.each(['generation', 'variantGeneration', 'duplicates', 'tooMany', 'negativeVersion'])('rejects invalid list: %s', async mode => {
    const data = readResponse();
    if (mode === 'generation') data.cvVariants.generation = 8;
    if (mode === 'variantGeneration') data.cvVariants.variants[0].generation = 8;
    if (mode === 'duplicates') data.cvVariants.variants.push({ ...data.cvVariants.variants[0] });
    if (mode === 'tooMany') data.cvVariants.variants = Array.from({ length: 4 }, (_, n) => ({ ...data.cvVariants.variants[0], id: `33333333-3333-4333-a333-33333333333${n}` }));
    if (mode === 'negativeVersion') data.cvVariants.recordVersion = -1;
    sdk.invoke.mockResolvedValue({ data, error: null }); await expect(callJobLoop(owner, readRequest())).rejects.toThrow(/could not be confirmed/);
  });
  it('allows an explicitly empty list without falling back to initializing get', async () => {
    const data = readResponse(); data.cvVariants.variants = []; sdk.invoke.mockResolvedValue({ data, error: null });
    expect((await callJobLoop(owner, readRequest())).cvVariants.variants).toEqual([]); expect(sdk.invoke).toHaveBeenCalledTimes(1);
  });
});
