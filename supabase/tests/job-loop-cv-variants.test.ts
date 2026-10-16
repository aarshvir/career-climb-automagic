// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { captureCvVariantSaveIntent, resolveCvVariantClaims, validateCvVariantSaveIntent } from '../functions/_shared/job-loop-cv-variants.ts';
import type { LoopClaim, LoopProfileInput } from '../functions/_shared/job-loop-types.ts';

const passage = 'Helped prepare an operations tracker covering six workstreams.';
const profile: LoopProfileInput = {
  audience: 'professional', name: 'Alex Example', contactLine: '', targetTitles: ['Analyst'], locations: ['Remote'],
  experienceYears: null, languages: ['English'], pageTarget: 1, discreetSearch: true,
  sourceText: `Alex Example\nWORK EXPERIENCE\nExample Group\n${passage}\nEducation: Business studies.`,
  excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null },
};
const fact: LoopClaim = { id: 'fact-1', revision: 2, status: 'active', createdAt: '2026-10-17T00:00:00Z',
  sourceKind: 'cv_passage', sourceQuote: passage, phrasing: passage, context: 'Example Group', kind: 'employment',
  resultStatus: 'not_measured', confirmed: true, shareable: true };
function input() {
  return { expectedGeneration: 3, expectedVersion: 8, requestId: '10000000-0000-0000-0000-000000000001',
    variantId: null as string | null, expectedVariantRevision: 0, label: 'Operations', profile: structuredClone(profile),
    claimRefs: [{ id: fact.id, revision: fact.revision }], saveConsent: true };
}

describe('CV variant consent and immutable source contract foundation', () => {
  it('captures original source, selection, consent and revisions before later form edits', () => {
    const draft = input();
    const captured = captureCvVariantSaveIntent(draft);
    draft.profile.sourceText = 'Changed source'; draft.profile.targetTitles.push('Director');
    draft.profile.compensation.minimum = 1000; draft.claimRefs[0].revision++;
    draft.expectedGeneration++; draft.expectedVersion++; draft.saveConsent = false;
    expect(captured).toMatchObject({ expectedGeneration: 3, expectedVersion: 8, saveConsent: true,
      profile: { sourceText: profile.sourceText, targetTitles: ['Analyst'], compensation: { minimum: null } }, claimRefs: [{ id: fact.id, revision: 2 }] });
    expect(Object.isFrozen(captured.profile.targetTitles)).toBe(true);
    expect(Object.isFrozen(captured.profile.compensation)).toBe(true);
    expect(() => { (captured.claimRefs[0] as { revision: number }).revision = 4; }).toThrow();
  });
  it.each(['userId', 'owner', 'requestHash', 'sourceHash', 'modelConsent', 'approved', 'schedule'])('rejects client-supplied privileged %s', field => {
    expect(() => validateCvVariantSaveIntent({ ...input(), [field]: 'override' })).toThrow(/privileged/);
  });
  it.each([false, undefined, 'true', 1])('requires fresh explicit private-save consent (%s)', saveConsent => {
    expect(() => validateCvVariantSaveIntent({ ...input(), saveConsent })).toThrow(/Confirm private/);
  });
  it('does not infer missing lifetime or silently upgrade stale update revisions', () => {
    for (const value of [undefined, -1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1, '3']) {
      expect(() => validateCvVariantSaveIntent({ ...input(), expectedGeneration: value })).toThrow();
      expect(() => validateCvVariantSaveIntent({ ...input(), expectedVersion: value })).toThrow();
    }
    expect(() => validateCvVariantSaveIntent({ ...input(), expectedVariantRevision: 1 })).toThrow(/revision zero/);
    expect(() => validateCvVariantSaveIntent({ ...input(), variantId: input().requestId })).toThrow(/revision/);
    expect(validateCvVariantSaveIntent({ ...input(), variantId: input().requestId, expectedVariantRevision: 2 }).expectedVariantRevision).toBe(2);
  });
  it('keeps an independent empty-fact draft without inventing confirmation or a search target', () => {
    const draft = input(); draft.claimRefs = []; draft.profile.targetTitles = []; draft.profile.locations = [];
    const captured = captureCvVariantSaveIntent(draft);
    expect(resolveCvVariantClaims(captured, null, [])).toEqual([]);
    expect(captured.profile.contactLine).toBe(''); expect(captured.profile.targetTitles).toEqual([]);
  });
  it('rejects full injected claims, duplicates, missing references and invalid labels', () => {
    expect(() => validateCvVariantSaveIntent({ ...input(), claimRefs: [fact] })).toThrow(/privileged/);
    expect(() => validateCvVariantSaveIntent({ ...input(), claimRefs: [...input().claimRefs, ...input().claimRefs] })).toThrow(/distinct/);
    expect(() => validateCvVariantSaveIntent({ ...input(), claimRefs: [{ id: 'missing revision' }] })).toThrow();
    for (const label of ['', '   ', 'a'.repeat(81), 'Name\nOther', '\u202eHidden']) {
      expect(() => validateCvVariantSaveIntent({ ...input(), label })).toThrow(/readable/);
    }
  });
  it('uses existing profile constraints, preserving source facts and refusing privileged profile metadata', () => {
    expect(() => validateCvVariantSaveIntent({ ...input(), profile: { ...profile, revision: 10 } })).toThrow(/privileged/);
    expect(() => validateCvVariantSaveIntent({ ...input(), profile: { ...profile, sourceText: 'Too short' } })).toThrow();
  });
  it('resolves exact owner-record references in selected order without mutating original facts', () => {
    const second: LoopClaim = { ...fact, id: 'answer-2', sourceKind: 'user_answer', sourceQuote: 'Course: Completed a business analysis exercise.', phrasing: 'Completed a business analysis exercise.', context: 'Course', kind: 'academic_project' };
    const draft = input(); draft.claimRefs = [{ id: second.id, revision: second.revision }, ...draft.claimRefs];
    const resolved = resolveCvVariantClaims(captureCvVariantSaveIntent(draft), profile, [fact, second]);
    expect(resolved.map(c => c.id)).toEqual([second.id, fact.id]);
    resolved[1].shareable = false; expect(fact.shareable).toBe(true);
  });
  it.each(['missing', 'duplicate', 'revision', 'withdrawn', 'unconfirmed', 'private'])('holds %s fact membership', reason => {
    const changed = { ...fact };
    if (reason === 'revision') changed.revision++;
    if (reason === 'withdrawn') changed.status = 'withdrawn';
    if (reason === 'unconfirmed') changed.confirmed = false;
    if (reason === 'private') changed.shareable = false;
    const claims = reason === 'missing' ? [] : reason === 'duplicate' ? [changed, changed] : [changed];
    expect(() => resolveCvVariantClaims(captureCvVariantSaveIntent(input()), profile, claims)).toThrow(/changed|shareable/);
  });
  it('rejects source changes even when a confirmed quotation survives in a different CV', () => {
    const draft = input(); draft.profile.sourceText += '\nAnother employer.';
    expect(() => resolveCvVariantClaims(captureCvVariantSaveIntent(draft), profile, [fact])).toThrow(/different source/);
  });
  it('rechecks literal evidence instead of trusting a saved confirmed flag', () => {
    const misleading = { ...fact, phrasing: 'Led six workstreams and saved 20%.' };
    expect(() => resolveCvVariantClaims(captureCvVariantSaveIntent(input()), profile, [misleading])).toThrow(/literal/);
  });
  it('requires reconfirmation if canonical validation discovers missing role context', () => {
    const draft = input(); draft.profile.sourceText = profile.sourceText.replace('Example Group\n', 'Example Group\nAnalyst 2020–2022\n');
    expect(() => resolveCvVariantClaims(captureCvVariantSaveIntent(draft), draft.profile, [fact])).toThrow(/complete source context/);
  });
});
