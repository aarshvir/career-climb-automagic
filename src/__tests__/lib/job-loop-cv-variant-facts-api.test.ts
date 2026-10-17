import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopAction } from '../../../supabase/functions/_shared/job-loop-types';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration } from '@/lib/tracking-draft-memory';
const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: sdk.getUser }, functions: { invoke: sdk.invoke } } }));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: vi.fn() }));
import { callJobLoop } from '@/lib/job-loop-api';

const owner = '11111111-1111-4111-a111-111111111111';
const requestId = '22222222-2222-4222-a222-222222222222';
const variantId = '33333333-3333-4333-a333-333333333333';
const factId = '44444444-4444-4444-a444-444444444444';
const sourceHash = 'b'.repeat(64);
const claim = { sourceKind: 'cv_passage', sourceQuote: 'Helped prepare the weekly operations report.', phrasing: 'Helped prepare the weekly operations report.', context: 'Example Group', kind: 'employment', resultStatus: 'not_measured', confirmed: true, shareable: true };
function save(): any { return { action: 'save_cv_variant_fact', expectedGeneration: 7, expectedVersion: 10, requestId, variantId, expectedVariantRevision: 2, sourceHash, factId: null, expectedFactRevision: 0, claim: structuredClone(claim), saveConsent: true }; }
function withdraw(): any { const { claim: _claim, saveConsent: _consent, ...base } = save(); return { ...base, action: 'withdraw_cv_variant_fact', factId, expectedFactRevision: 1, withdrawConsent: true }; }
function read(): any { return { action: 'read_cv_variant_facts', expectedGeneration: 7, variantId }; }
function snapshot(): any { return { ...structuredClone(claim), id: factId, revision: 1, status: 'active', createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z', variantId, generation: 7, variantRevision: 2, sourceHash }; }
function receipt(): any { return { variantFactSave: { generation: 7, recordVersion: 11, variant: { id: variantId, revision: 2, sourceHash }, fact: snapshot(), requestId, requestHash: 'a'.repeat(64), savedRevision: 1, sourceHash, variantRevision: 2, reused: false } }; }
function withdrawnReceipt(): any { const data = receipt(); data.variantFactSave.savedRevision = 2; Object.assign(data.variantFactSave.fact, { revision: 2, status: 'withdrawn', confirmed: false, shareable: false }); return data; }
function list(): any { return { cvVariantFacts: { generation: 7, recordVersion: 11, variant: { id: variantId, revision: 2, sourceHash }, facts: [snapshot()] } }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner(owner); setTrackingLoopGeneration(owner, 7);
  sdk.session.mockResolvedValue({ user: { id: owner } }); sdk.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  sdk.invoke.mockResolvedValue({ data: receipt(), error: null });
});
afterEach(() => { clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('independent variant fact browser boundary (isolated adapters)', () => {
  it.each(['save', 'withdraw', 'read'])('uses only the explicit %s action without global or preparation side effects', async mode => {
    const action = mode === 'save' ? save() : mode === 'withdraw' ? withdraw() : read();
    const data = mode === 'save' ? receipt() : mode === 'withdraw' ? withdrawnReceipt() : list();
    sdk.invoke.mockResolvedValue({ data, error: null });
    const result = await callJobLoop(owner, action);
    expect(result).toEqual(data); expect(result.snapshot).toBeUndefined(); expect(result.runId).toBeUndefined();
    expect(sdk.invoke).toHaveBeenCalledExactlyOnceWith('job-loop-control', { body: action });
  });
  it('captures original nested fact wording, source and versions before authentication resolves', async () => {
    const auth = deferred<unknown>(); sdk.getUser.mockReturnValueOnce(auth.promise);
    const draft = save(), expected = structuredClone(draft), pending = callJobLoop(owner, draft);
    await vi.waitFor(() => expect(sdk.getUser).toHaveBeenCalled());
    draft.claim.phrasing = 'Newer unconfirmed wording'; draft.claim.shareable = false; draft.sourceHash = 'c'.repeat(64);
    draft.expectedVariantRevision = 9; draft.expectedFactRevision = 9; draft.requestId = factId;
    auth.resolve({ data: { user: { id: owner } }, error: null }); await pending;
    expect(sdk.invoke.mock.calls[0][1].body).toEqual(expected); expect(draft.claim.phrasing).toBe('Newer unconfirmed wording');
  });
  it.each(['save', 'withdraw', 'read'])('captures immutable top-level %s scope before authentication resolves', async mode => {
    const action = mode === 'save' ? save() : mode === 'withdraw' ? withdraw() : read(), original = structuredClone(action);
    const auth = deferred<unknown>(); sdk.getUser.mockReturnValueOnce(auth.promise);
    sdk.invoke.mockResolvedValue({ data: mode === 'save' ? receipt() : mode === 'withdraw' ? withdrawnReceipt() : list(), error: null });
    const pending = callJobLoop(owner, action); await vi.waitFor(() => expect(sdk.getUser).toHaveBeenCalled());
    action.variantId = factId; action.expectedGeneration = 99;
    auth.resolve({ data: { user: { id: owner } }, error: null }); await pending;
    expect(sdk.invoke.mock.calls[0][1].body).toEqual(original);
  });
  it.each(['save-before', 'save-after', 'withdraw-before', 'withdraw-after', 'read-before', 'read-after'])('rejects A→B→A owner authority across %s', async mode => {
    const delay = deferred<unknown>(), before = mode.endsWith('before'), action = mode.startsWith('save') ? save() : mode.startsWith('withdraw') ? withdraw() : read();
    const data = mode.startsWith('save') ? receipt() : mode.startsWith('withdraw') ? withdrawnReceipt() : list();
    (before ? sdk.getUser : sdk.invoke).mockReturnValueOnce(delay.promise);
    const pending = callJobLoop(owner, action), rejected = expect(pending).rejects.toThrow(/sign-in changed/);
    await vi.waitFor(() => expect(before ? sdk.getUser : sdk.invoke).toHaveBeenCalled());
    setTrackingDraftOwner(variantId); setTrackingDraftOwner(owner);
    delay.resolve(before ? { data: { user: { id: owner } }, error: null } : { data, error: null }); await rejected;
    if (before) expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it.each(['save', 'withdraw', 'read'])('rejects lifecycle changes while %s response is delayed', async mode => {
    const delay = deferred<unknown>(); sdk.invoke.mockReturnValueOnce(delay.promise);
    const pending = callJobLoop(owner, mode === 'save' ? save() : mode === 'withdraw' ? withdraw() : read());
    const rejected = expect(pending).rejects.toThrow(/workspace changed/); await vi.waitFor(() => expect(sdk.invoke).toHaveBeenCalled());
    setTrackingLoopGeneration(owner, 8); delay.resolve({ data: mode === 'save' ? receipt() : mode === 'withdraw' ? withdrawnReceipt() : list(), error: null }); await rejected;
  });
  it.each([{ userId: owner }, { confirmedByServer: true }, { expectedGeneration: undefined }, { expectedVariantRevision: 0 }, { sourceHash: 'forged' }, { factId, expectedFactRevision: 0 }, { saveConsent: false }, { claim: { ...claim, confirmed: false } }, { claim: { ...claim, sourceKind: ['cv_passage'] } }, { claim: { ...claim, approved: true } }])('rejects unsafe save before sending CV data: %j', async patch => {
    await expect(callJobLoop(owner, { ...save(), ...patch } as LoopAction)).rejects.toThrow(); expect(sdk.getUser).not.toHaveBeenCalled(); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it.each([{ factId: null }, { expectedFactRevision: 0 }, { withdrawConsent: false }, { claim }, { saveConsent: true }])('rejects unsafe withdrawal %j', async patch => {
    await expect(callJobLoop(owner, { ...withdraw(), ...patch } as LoopAction)).rejects.toThrow(); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it.each(['request', 'source', 'variant', 'variantRevision', 'newerCurrentSource', 'factVariant', 'factGeneration', 'factRevision', 'wording', 'privateFlag', 'recordVersion', 'arrayCategory'])('rejects mismatched fresh save receipt: %s', async mode => {
    const data = receipt(), value = data.variantFactSave;
    if (mode === 'request') value.requestId = factId;
    if (mode === 'source') value.sourceHash = 'c'.repeat(64);
    if (mode === 'variant') value.variant.id = owner;
    if (mode === 'variantRevision') value.variantRevision = 3;
    if (mode === 'newerCurrentSource') Object.assign(value.variant, { revision: 3, sourceHash: 'c'.repeat(64) });
    if (mode === 'factVariant') value.fact.variantId = owner;
    if (mode === 'factGeneration') value.fact.generation = 8;
    if (mode === 'factRevision') value.fact.revision = 2;
    if (mode === 'wording') value.fact.phrasing = 'Invented stronger wording';
    if (mode === 'privateFlag') value.fact.shareable = false;
    if (mode === 'recordVersion') value.recordVersion = 10;
    if (mode === 'arrayCategory') value.fact.kind = ['employment'];
    sdk.invoke.mockResolvedValue({ data, error: null }); await expect(callJobLoop(owner, save())).rejects.toThrow();
  });
  it('keeps exact original retry receipt separate from a later withdrawn fact and edited variant', async () => {
    sdk.invoke.mockRejectedValueOnce(new Error('connection lost')); await expect(callJobLoop(owner, save())).rejects.toThrow();
    const data = receipt(), value = data.variantFactSave; value.reused = true; value.recordVersion = 15;
    Object.assign(value.variant, { revision: 3, sourceHash: 'c'.repeat(64) });
    Object.assign(value.fact, { revision: 2, status: 'withdrawn', confirmed: false, shareable: false });
    sdk.invoke.mockResolvedValue({ data, error: null }); const result: any = await callJobLoop(owner, save());
    expect(result.variantFactSave.savedRevision).toBe(1); expect(result.variantFactSave.fact.status).toBe('withdrawn');
    expect(result.variantFactSave.variant.revision).toBe(3); expect(result.variantFactSave.variantRevision).toBe(2);
    expect(sdk.invoke.mock.calls[0][1].body).toEqual(sdk.invoke.mock.calls[1][1].body);
  });
  it('does not let a foreign fact ID replace an exact edited fact', async () => {
    const action = { ...save(), factId, expectedFactRevision: 1 }, data = receipt();
    data.variantFactSave.savedRevision = 2; Object.assign(data.variantFactSave.fact, { id: owner, revision: 2 });
    sdk.invoke.mockResolvedValue({ data, error: null }); await expect(callJobLoop(owner, action)).rejects.toThrow();
  });
  it.each(['snapshot', 'runId', 'cvVariants', 'cvVariantFacts', 'erasureGeneration', 'approved'])('rejects mixed save envelope with %s', async field => {
    sdk.invoke.mockResolvedValue({ data: { ...receipt(), [field]: {} }, error: null }); await expect(callJobLoop(owner, save())).rejects.toThrow();
  });
  it.each(['foreignVariant', 'foreignFact', 'duplicateFact', 'negativeVersion', 'mixedSnapshot'])('rejects malformed read %s', async mode => {
    const data = list();
    if (mode === 'foreignVariant') data.cvVariantFacts.variant.id = owner;
    if (mode === 'foreignFact') data.cvVariantFacts.facts[0].variantId = owner;
    if (mode === 'duplicateFact') data.cvVariantFacts.facts.push(structuredClone(data.cvVariantFacts.facts[0]));
    if (mode === 'negativeVersion') data.cvVariantFacts.recordVersion = -1;
    if (mode === 'mixedSnapshot') data.snapshot = {};
    sdk.invoke.mockResolvedValue({ data, error: null }); await expect(callJobLoop(owner, read())).rejects.toThrow();
  });
  it('returns an empty fact list honestly without creating global or variant facts', async () => {
    const data = list(); data.cvVariantFacts.facts = []; sdk.invoke.mockResolvedValue({ data, error: null });
    expect(await callJobLoop(owner, read())).toEqual(data); expect(sdk.invoke).toHaveBeenCalledTimes(1);
  });
});
