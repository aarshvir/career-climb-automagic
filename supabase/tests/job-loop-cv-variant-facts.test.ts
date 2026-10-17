// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { captureCvVariantFactSaveIntent, captureCvVariantFactWithdrawIntent, validateCvVariantFactReadScope, validateCvVariantFactSaveIntent, validateCvVariantFactWithdrawIntent, validateCvVariantFactForSource, validateCvVariantFactReceipt, validateCvVariantFactsRead, resolveCurrentCvVariantFacts, type CvVariantFactSnapshot } from '../functions/_shared/job-loop-cv-variant-facts.ts';
import type { LoopCvVariant } from '../functions/_shared/job-loop-types.ts';

const id = '10000000-0000-0000-0000-000000000001', factId = '20000000-0000-0000-0000-000000000002', requestId = '30000000-0000-0000-0000-000000000003';
const sourceHash = 'a'.repeat(64), date = '2026-10-17T00:00:00Z';
const passage = 'Helped prepare an operations tracker covering six workstreams.';
const variant: LoopCvVariant = { id, generation: 3, revision: 2, sourceHash, label: 'Operations', claims: [], createdAt: date, updatedAt: date,
  profile: { audience: 'professional', name: 'Alex Example', contactLine: '', targetTitles: ['Analyst'], locations: ['Remote'], experienceYears: null, languages: ['English'], pageTarget: 1, discreetSearch: true,
    sourceText: `Alex Example\nWORK EXPERIENCE\nExample Group\n${passage}\nEducation: Business studies.`, excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null } } };
function save() { return { expectedGeneration: 3, expectedVersion: 8, requestId, variantId: id, expectedVariantRevision: 2, sourceHash, factId: null as string | null, expectedFactRevision: 0,
  claim: { sourceKind: 'cv_passage' as const, sourceQuote: passage, phrasing: passage, context: 'Example Group', kind: 'employment' as const, resultStatus: 'not_measured' as const, confirmed: true, shareable: true }, saveConsent: true as const }; }
function withdraw() { const { claim, saveConsent, ...base } = save(); return { ...base, factId, expectedFactRevision: 1, withdrawConsent: true as const }; }
function snapshot(): CvVariantFactSnapshot { return { ...save().claim, id: factId, revision: 1, status: 'active', createdAt: date, updatedAt: date, variantId: id, generation: 3, variantRevision: 2, sourceHash }; }
function receipt() { return { generation: 3, recordVersion: 9, variant: { id, revision: 2, sourceHash }, fact: snapshot(), requestId, requestHash: 'b'.repeat(64), savedRevision: 1, sourceHash, variantRevision: 2, reused: false }; }
function read() { return { generation: 3, recordVersion: 9, variant: { id, revision: 2, sourceHash }, facts: [snapshot()] }; }
const scope = { expectedGeneration: 3, variantId: id };

describe('independent variant fact intent and evidence', () => {
  it('captures a detached frozen original before mutation', () => {
    const original = save(), captured = captureCvVariantFactSaveIntent(original);
    original.claim.phrasing = 'Changed after submitting'; original.sourceHash = 'c'.repeat(64); original.expectedVersion++;
    expect(captured.claim.phrasing).toBe(passage); expect(captured.sourceHash).toBe(sourceHash); expect(captured.expectedVersion).toBe(8);
    expect(Object.isFrozen(captured)).toBe(true); expect(Object.isFrozen(captured.claim)).toBe(true);
    expect(() => { (captured.claim as { shareable: boolean }).shareable = false; }).toThrow();
    expect(Object.isFrozen(captureCvVariantFactWithdrawIntent(withdraw()))).toBe(true);
  });
  it.each(['owner', 'action', 'approved', 'requestHash'])('rejects privileged field %s', field => {
    expect(() => validateCvVariantFactSaveIntent({ ...save(), [field]: true })).toThrow();
    expect(() => validateCvVariantFactWithdrawIntent({ ...withdraw(), [field]: true })).toThrow();
  });
  it.each([undefined, '2', [2], -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe or coerced revision %s', value => {
    for (const field of ['expectedGeneration', 'expectedVersion', 'expectedVariantRevision', 'expectedFactRevision']) expect(() => validateCvVariantFactSaveIntent({ ...save(), [field]: value })).toThrow();
  });
  it('refuses overflow, inconsistent new ids, omitted fields and foreign objects', () => {
    expect(() => validateCvVariantFactSaveIntent({ ...save(), expectedVersion: Number.MAX_SAFE_INTEGER })).toThrow();
    expect(() => validateCvVariantFactSaveIntent({ ...save(), expectedFactRevision: 1 })).toThrow();
    expect(() => validateCvVariantFactSaveIntent({ ...save(), factId })).toThrow();
    expect(() => validateCvVariantFactWithdrawIntent({ ...withdraw(), factId: null })).toThrow();
    expect(() => validateCvVariantFactSaveIntent(Object.assign(Object.create({}), save()))).toThrow();
    const { sourceHash: omitted, ...incomplete } = save(); expect(() => validateCvVariantFactSaveIntent(incomplete)).toThrow();
  });
  it.each([false, 'true', 1, [], undefined])('requires literal consent and confirmation %s', value => {
    expect(() => validateCvVariantFactSaveIntent({ ...save(), saveConsent: value })).toThrow();
    expect(() => validateCvVariantFactWithdrawIntent({ ...withdraw(), withdrawConsent: value })).toThrow();
    expect(() => validateCvVariantFactSaveIntent({ ...save(), claim: { ...save().claim, confirmed: value } })).toThrow();
  });
  it('permits deliberately private confirmed facts without assuming sharing', () => {
    expect(validateCvVariantFactSaveIntent({ ...save(), claim: { ...save().claim, shareable: false } }).claim.shareable).toBe(false);
  });
  it('rejects array categories, source coercion, unknown claim data and noncanonical text', () => {
    for (const field of ['sourceKind', 'kind', 'resultStatus'] as const) expect(() => validateCvVariantFactSaveIntent({ ...save(), claim: { ...save().claim, [field]: [save().claim[field]] } })).toThrow();
    for (const source of [[sourceHash], sourceHash.toUpperCase(), { toString: () => sourceHash }]) expect(() => validateCvVariantFactSaveIntent({ ...save(), sourceHash: source })).toThrow();
    expect(() => validateCvVariantFactSaveIntent({ ...save(), claim: { ...save().claim, revision: 1 } })).toThrow();
    for (const sourceQuote of [` ${passage}`, `${passage}\u007f`, '\u202e' + passage]) expect(() => validateCvVariantFactSaveIntent({ ...save(), claim: { ...save().claim, sourceQuote } })).toThrow();
  });
  it('strictly reads only exact owner-independent scope', () => {
    expect(validateCvVariantFactReadScope(scope)).toEqual(scope);
    expect(() => validateCvVariantFactReadScope({ ...scope, owner: id })).toThrow();
    expect(() => validateCvVariantFactReadScope({ ...scope, variantId: [id] })).toThrow();
  });
  it('validates another source directly without global profile swapping', () => {
    expect(validateCvVariantFactForSource(captureCvVariantFactSaveIntent(save()), variant)).toEqual(save().claim);
    expect(variant.profile.name).toBe('Alex Example');
  });
  it.each(['generation', 'revision', 'sourceHash', 'id'])('rejects changed source authority %s including same-hash A-B-A', field => {
    const changed = { ...variant, [field]: typeof variant[field as keyof LoopCvVariant] === 'number' ? 9 : 'c'.repeat(64) };
    expect(() => validateCvVariantFactForSource(captureCvVariantFactSaveIntent(save()), changed)).toThrow();
  });
  it('refuses cropped wording, different category and silently expanded role context', () => {
    expect(() => validateCvVariantFactForSource(captureCvVariantFactSaveIntent({ ...save(), claim: { ...save().claim, phrasing: 'Led six workstreams.' } }), variant)).toThrow();
    expect(() => validateCvVariantFactForSource(captureCvVariantFactSaveIntent({ ...save(), claim: { ...save().claim, kind: 'academic_project' } }), variant)).toThrow();
    const richer = { ...variant, profile: { ...variant.profile, sourceText: variant.profile.sourceText.replace('Example Group\n', 'Example Group\nAnalyst 2020–2022\n') } };
    expect(() => validateCvVariantFactForSource(captureCvVariantFactSaveIntent(save()), richer)).toThrow(/canonical/);
  });
  it('accepts canonical bullet quote only after exact source formatting was shown', () => {
    const bulleted = { ...variant, profile: { ...variant.profile, sourceText: variant.profile.sourceText.replace(passage, `• ${passage}`) } };
    expect(() => validateCvVariantFactForSource(captureCvVariantFactSaveIntent(save()), bulleted)).toThrow(/canonical/);
    const intent = captureCvVariantFactSaveIntent({ ...save(), claim: { ...save().claim, sourceQuote: `• ${passage}` } });
    expect(validateCvVariantFactForSource(intent, bulleted).phrasing).toBe(passage);
  });
  it('keeps complete user-attested context, qualifiers and private permission', () => {
    const claim = { ...save().claim, sourceKind: 'user_answer', sourceQuote: 'Course: Helped prepare an estimated operations budget.', phrasing: 'Helped prepare an estimated operations budget.', context: 'Course', kind: 'academic_project', resultStatus: 'projected', shareable: false };
    expect(validateCvVariantFactForSource(captureCvVariantFactSaveIntent({ ...save(), claim }), variant).shareable).toBe(false);
    expect(() => validateCvVariantFactForSource(captureCvVariantFactSaveIntent({ ...save(), claim: { ...claim, resultStatus: 'measured' } }), variant)).toThrow();
  });
});

describe('fresh exact variant fact resolution for future admission', () => {
  const refs = [{ id: factId, revision: 1 }];
  it('returns ordered detached facts and permits explicit empty selection', () => {
    const first = snapshot(), second = { ...snapshot(), id: requestId };
    const result = resolveCurrentCvVariantFacts(variant, [first, second], [{ id: second.id, revision: 1 }, ...refs]);
    expect(result.map(fact => fact.id)).toEqual([second.id, first.id]); result[1].shareable = false; expect(first.shareable).toBe(true);
    expect(resolveCurrentCvVariantFacts(variant, [first], [])).toEqual([]);
  });
  it.each(['withdrawn', 'private', 'unconfirmed', 'revision', 'generation', 'variantId', 'sourceHash', 'variantRevision'])('rejects stale or revoked current %s', key => {
    const changed = { ...snapshot(), ...(key === 'withdrawn' ? { status: 'withdrawn', confirmed: false, shareable: false } : key === 'private' ? { shareable: false } : key === 'unconfirmed' ? { confirmed: false } : { [key]: ['revision', 'generation', 'variantRevision'].includes(key) ? 99 : 'c'.repeat(64) }) };
    expect(() => resolveCurrentCvVariantFacts(variant, [changed as CvVariantFactSnapshot], refs)).toThrow();
  });
  it('rejects same-text A-B-A source revision changes and current semantic corruption', () => {
    expect(() => resolveCurrentCvVariantFacts({ ...variant, revision: 4 }, [snapshot()], refs)).toThrow();
    expect(() => resolveCurrentCvVariantFacts(variant, [{ ...snapshot(), phrasing: 'Led all six workstreams.' }], refs)).toThrow();
    const richer = { ...variant, profile: { ...variant.profile, sourceText: variant.profile.sourceText.replace('Example Group\n', 'Example Group\nAnalyst 2020–2022\n') } };
    expect(() => resolveCurrentCvVariantFacts(richer, [snapshot()], refs)).toThrow();
  });
  it('rejects absent or duplicate current facts and malformed, duplicate or oversized references', () => {
    expect(() => resolveCurrentCvVariantFacts(variant, [], refs)).toThrow();
    expect(() => resolveCurrentCvVariantFacts(variant, [snapshot(), snapshot()], refs)).toThrow();
    for (const invalid of [[...refs, ...refs], [{ id: factId, revision: '1' }], [{ id: factId, revision: 0 }], [{ id: factId, revision: 1, shareable: true }], Array(151).fill(refs[0]), { id: factId, revision: 1 }]) expect(() => resolveCurrentCvVariantFacts(variant, [snapshot()], invalid)).toThrow();
  });
});

describe('original request receipts and current independent facts', () => {
  it('accepts an exact save and keeps a detached current snapshot', () => {
    const raw = receipt(), result = validateCvVariantFactReceipt(raw, captureCvVariantFactSaveIntent(save())); raw.fact.phrasing = 'Edited response';
    expect(result.fact.phrasing).toBe(passage); expect(result.savedRevision).toBe(1);
  });
  it('allows old save retry after withdrawal without restoring original permissions', () => {
    const raw = { ...receipt(), reused: true, recordVersion: 12, fact: { ...snapshot(), revision: 2, status: 'withdrawn', confirmed: false, shareable: false } };
    const result = validateCvVariantFactReceipt(raw, captureCvVariantFactSaveIntent(save()));
    expect(result.savedRevision).toBe(1); expect(result.fact).toMatchObject({ revision: 2, status: 'withdrawn', confirmed: false, shareable: false });
  });
  it('keeps original provenance distinct from later explicitly rebound current facts', () => {
    const raw = { ...receipt(), reused: true, recordVersion: 12, variant: { id, revision: 3, sourceHash: 'c'.repeat(64) }, fact: { ...snapshot(), revision: 2, variantRevision: 3, sourceHash: 'c'.repeat(64) } };
    const result = validateCvVariantFactReceipt(raw, captureCvVariantFactSaveIntent(save()));
    expect(result.sourceHash).toBe(sourceHash); expect(result.variantRevision).toBe(2); expect(result.fact.sourceHash).toBe('c'.repeat(64));
  });
  it('accepts withdrawal of an older source after the CV has changed', () => {
    const raw = { ...receipt(), savedRevision: 2, variant: { id, revision: 3, sourceHash: 'c'.repeat(64) }, fact: { ...snapshot(), revision: 2, status: 'withdrawn', confirmed: false, shareable: false } };
    expect(validateCvVariantFactReceipt(raw, captureCvVariantFactWithdrawIntent(withdraw())).variant.revision).toBe(3);
    expect(() => validateCvVariantFactReceipt({ ...raw, fact: { ...raw.fact, shareable: true } }, captureCvVariantFactWithdrawIntent(withdraw()))).toThrow();
  });
  it.each(['generation', 'recordVersion', 'savedRevision', 'variantRevision', 'requestId', 'sourceHash', 'reused'])('rejects malformed receipt %s', field => {
    expect(() => validateCvVariantFactReceipt({ ...receipt(), [field]: [] }, captureCvVariantFactSaveIntent(save()))).toThrow();
  });
  it('rejects same-revision content or source replacement and premature/newer receipts', () => {
    const intent = captureCvVariantFactSaveIntent(save());
    for (const fact of [{ ...snapshot(), phrasing: 'Different literal source.' }, { ...snapshot(), sourceHash: 'c'.repeat(64) }, { ...snapshot(), variantRevision: 1 }, { ...snapshot(), revision: 2 }, { ...snapshot(), status: 'withdrawn', confirmed: false, shareable: false }]) expect(() => validateCvVariantFactReceipt({ ...receipt(), fact }, intent)).toThrow();
    expect(() => validateCvVariantFactReceipt({ ...receipt(), recordVersion: 8 }, intent)).toThrow();
    expect(() => validateCvVariantFactReceipt({ ...receipt(), recordVersion: 10 }, intent)).toThrow();
    expect(() => validateCvVariantFactReceipt({ ...receipt(), variant: { ...receipt().variant, revision: 3 } }, intent)).toThrow();
  });
  it('reads stale-source facts honestly while rejecting contradictions, future revisions and duplicates', () => {
    const raw = { ...read(), variant: { id, revision: 3, sourceHash: 'c'.repeat(64) } };
    expect(validateCvVariantFactsRead(raw, scope).facts[0].variantRevision).toBe(2);
    expect(() => validateCvVariantFactsRead({ ...read(), facts: [snapshot(), snapshot()] }, scope)).toThrow();
    expect(() => validateCvVariantFactsRead({ ...read(), facts: [{ ...snapshot(), variantRevision: 3 }] }, scope)).toThrow();
    expect(() => validateCvVariantFactsRead({ ...read(), facts: [{ ...snapshot(), sourceHash: 'c'.repeat(64) }] }, scope)).toThrow();
    expect(() => validateCvVariantFactsRead({ ...read(), facts: [{ ...snapshot(), confirmed: false }] }, scope)).toThrow();
  });
  it('rejects oversized lists, array-coerced categories and injected authority', () => {
    expect(() => validateCvVariantFactsRead({ ...read(), facts: Array.from({ length: 151 }, () => snapshot()) }, scope)).toThrow();
    for (const extra of [{ kind: ['employment'] }, { approved: true }, { status: ['active'] }, { shareable: 'true' }, { generation: 4 }, { id: [factId] }]) expect(() => validateCvVariantFactsRead({ ...read(), facts: [{ ...snapshot(), ...extra }] }, scope)).toThrow();
    expect(() => validateCvVariantFactsRead({ ...read(), owner: id }, scope)).toThrow();
  });
});
