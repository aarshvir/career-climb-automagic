import { describe, expect, it } from 'vitest';
import type { LoopClaim } from '../functions/_shared/job-loop-types';
import { snapshotTailoringClaims, validateLoopRewrites, validateLoopRewriteReceipts } from '../functions/_shared/job-loop-deep-tailor';

const claim: LoopClaim = { id: 'claim-one', revision: 3, sourceKind: 'user_answer', sourceQuote: 'At Example Co I supported monthly reporting. My manager led the team of 12.',
  phrasing: 'Supported monthly reporting for 5 stores', context: 'Example Co', kind: 'employment', resultStatus: 'not_measured',
  confirmed: true, shareable: true, status: 'active', createdAt: '2026-10-17T00:00:00Z' };
const proposal = (text: string, claimId = claim.id) => [{ claimId, text }];

describe('Loop tailoring preserves exact claim authority', () => {
  it('captures immutable evidence before provider work and never edits the original', () => {
    const source = { ...claim }, snapshot = snapshotTailoringClaims([source]);
    source.phrasing = 'Changed later'; source.revision = 4;
    const [result] = validateLoopRewrites(proposal('Supported reporting monthly for 5 stores'), snapshot, [claim.id]);
    expect(result).toMatchObject({ claimId: claim.id, revision: 3, sourcePhrasing: claim.phrasing, sourceQuote: claim.sourceQuote, context: claim.context });
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(snapshot[0])).toBe(true);
    expect(source.phrasing).toBe('Changed later');
  });
  it('retains the older claim-selection-only response contract', () => {
    expect(validateLoopRewrites(undefined, [claim], [claim.id])).toEqual([]);
  });
  it.each([
    'Led reporting for 5 stores', // ownership from another person in sourceQuote is not authority
    'Supported reporting for 12 stores', 'Supported reporting for stores',
    'Supported reporting for 5 stores using Tableau', 'Supported reporting for 5 stores as a certified analyst',
  ])('rejects a changed fact: %s', text => {
    expect(() => validateLoopRewrites(proposal(text), [claim], [claim.id])).toThrow();
  });
  it('does not pool numbers or ownership from a second eligible claim', () => {
    const other = { ...claim, id: 'claim-two', phrasing: 'Led reporting for 12 stores', context: 'Other Employer' };
    expect(() => validateLoopRewrites(proposal('Led reporting for 12 stores'), [claim, other], [claim.id, other.id])).toThrow();
  });
  it.each([{ status: 'withdrawn' as const }, { confirmed: false }, { shareable: false }])('rejects revoked claim authority %j', patch => {
    const revoked = { ...claim, ...patch };
    expect(snapshotTailoringClaims([revoked])).toEqual([]);
    expect(() => validateLoopRewrites(proposal(claim.phrasing), [revoked], [claim.id])).toThrow();
  });
  it('rejects non-selected, duplicate, injected or incorrectly shaped suggestions', () => {
    for (const value of [proposal(claim.phrasing, 'other'), [...proposal(claim.phrasing), ...proposal(claim.phrasing)], [{ claimId: claim.id, text: claim.phrasing, context: 'Other Employer' }], proposal('Supported reporting\nLed 5 stores'), proposal('<b>Supported reporting for 5 stores</b>')]) {
      expect(() => validateLoopRewrites(value, [claim], [claim.id])).toThrow();
    }
    expect(() => validateLoopRewrites(proposal(claim.phrasing), [claim], [])).toThrow();
    expect(() => snapshotTailoringClaims([claim, claim])).toThrow();
  });
  it.each(['I did not lead reporting for 5 stores', 'Projected reporting savings for 5 stores', 'Estimated reporting savings for 5 stores'])('keeps qualified wording exact: %s', phrasing => {
    const source = { ...claim, phrasing };
    expect(() => validateLoopRewrites(proposal('Led reporting for 5 stores'), [source], [claim.id])).toThrow();
    expect(validateLoopRewrites(proposal(phrasing), [source], [claim.id])[0].text).toBe(phrasing);
  });
  it.each(['Supported a team that led reporting for 5 stores', 'My manager led reporting for 5 stores'])('preserves attribution: %s', phrasing => {
    expect(() => validateLoopRewrites(proposal('Led reporting for 5 stores'), [{ ...claim, phrasing }], [claim.id])).toThrow(/attributed/);
  });
  it('rejects metered receipts rebound to a later revision, context, quotation or wording', () => {
    const receipts = validateLoopRewrites(proposal('Supported reporting monthly for 5 stores'), [claim], [claim.id]);
    expect(validateLoopRewriteReceipts(receipts, [claim], [claim.id])).toEqual(receipts);
    for (const patch of [{ revision: 4 }, { context: 'Other employer' }, { sourceQuote: 'Different evidence' }, { phrasing: 'Supported reporting for 5 stores monthly' }, { kind: 'internship' as const }, { resultStatus: 'measured' as const }]) {
      expect(() => validateLoopRewriteReceipts(receipts, [{ ...claim, ...patch }], [claim.id])).toThrow(/source has changed/);
    }
    expect(() => validateLoopRewriteReceipts(receipts, [{ ...claim, status: 'withdrawn' }], [claim.id])).toThrow();
    expect(() => validateLoopRewriteReceipts(proposal(claim.phrasing) as never, [claim], [claim.id])).toThrow(/receipt/);
  });
});
