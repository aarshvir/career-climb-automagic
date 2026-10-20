// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assessOpportunity, composePacket, fingerprintLoopInputs } from '../functions/_shared/job-loop-engine.ts';
import { validateLoopRewrites } from '../functions/_shared/job-loop-deep-tailor.ts';
import type { LoopClaim, LoopOpportunity, LoopProfile } from '../functions/_shared/job-loop-types.ts';

const at = '2026-10-20T00:00:00Z';
const first = 'Director | Westhaven Service Group | 2021-present';
const middle = 'Manager | Cairnbridge Advisory | 2016-2021';
const last = 'Analyst | Eastmere Logistics | 2012-2016';
const a = 'Led operating reviews and recorded decisions across regional service teams.';
const a2 = 'Cut annual planning from eight to five weeks.';
const b = 'Designed a service transition with named owners and delivery milestones.';
const c = 'Maintained delivery reports and reconciled operational planning inputs.';
const profile = (sourceText: string): LoopProfile => ({ audience: 'professional', name: 'Alex Morgan', contactLine: 'alex.morgan@example.com', targetTitles: ['Strategy Manager'], locations: ['New York'], experienceYears: 14, languages: ['English'], pageTarget: 2, discreetSearch: false, sourceText, excludedTerms: [], compensation: { currency: 'USD', period: 'annual', minimum: null }, revision: 3, updatedAt: at });
const fact = (id: string, context: string, sourceQuote: string, options: Partial<LoopClaim> = {}): LoopClaim => ({ id, context, sourceQuote, phrasing: sourceQuote, kind: 'employment', sourceKind: 'cv_passage', resultStatus: 'not_measured', confirmed: true, shareable: true, revision: 2, status: 'active', createdAt: at, ...options });
const opportunity: LoopOpportunity = { id: 'synthetic-role', title: 'Strategy Manager', company: 'Example Service Business', location: 'New York', url: 'https://example.com/careers/strategy', description: 'Lead strategy planning, service transitions and operating reviews.', contact: null, source: 'manual', sourceKey: 'synthetic-role', checkedAt: at, verification: 'user_provided', status: 'saved', followUpAt: null, notes: 'Wholly fictional fixture.' };
const headers = (text: string, contexts: string[]) => text.split('\n').filter(line => contexts.includes(line));
const source = ['Alex Morgan', 'EMPLOYMENT', first, a, a2, middle, b, last, c].join('\n');

describe('source context order in the composed CV only', () => {
  it('keeps literal career contexts in source order despite reversed model selection, retaining relevance order inside a context', async () => {
    const p = profile(source), claims = [fact('a', first, a), fact('a2', first, a2), fact('b', middle, b), fact('c', last, c)];
    const selected = ['c', 'a2', 'b', 'a'], original = structuredClone(claims);
    const packet = await composePacket({ profile: p, claims, opportunity, runId: 'test-run', selectedClaimIds: selected });
    expect(headers(packet.cvText, [first, middle, last])).toEqual([first, middle, last]);
    expect(packet.cvText.indexOf(a2)).toBeLessThan(packet.cvText.indexOf(a));
    for (const claim of claims) expect(packet.cvText).toContain(claim.phrasing);
    // Only the CV context iterator changes: selection, evidence and input authority remain original.
    expect(Object.keys(packet.claimVersions)).toEqual(selected);
    expect(packet.evidenceText.indexOf('c revision 2')).toBeLessThan(packet.evidenceText.indexOf('a2 revision 2'));
    expect(packet.coverLetterText.indexOf(c)).toBeLessThan(packet.coverLetterText.indexOf(a2));
    expect(packet.inputHash).toBe(await fingerprintLoopInputs(p, claims, [opportunity]));
    expect(packet.status).toBe('review_required'); expect(packet.approvedAt).toBeNull();
    expect(packet.profileRevision).toBe(3);
    expect(claims).toEqual(original); expect(selected).toEqual(['c', 'a2', 'b', 'a']);
  });

  it('retains source context order for the actual default overlap-ranked rules selection', async () => {
    const p = profile(source), claims = [fact('a', first, a), fact('b', middle, b), fact('c', last, c)];
    const job = { ...opportunity, description: c };
    expect(assessOpportunity(p, claims, job).claimIds[0]).toBe('c');
    const packet = await composePacket({ profile: p, claims, opportunity: job, runId: 'test-run' });
    expect(headers(packet.cvText, [first, middle, last])).toEqual([first, middle, last]);
    expect(Object.keys(packet.claimVersions)[0]).toBe('c');
  });

  it('follows source presentation rather than inferring chronology from dates', async () => {
    const p = profile(['EMPLOYMENT', last, c, first, a, middle, b].join('\n'));
    const packet = await composePacket({ profile: p, claims: [fact('a', first, a), fact('b', middle, b), fact('c', last, c)], opportunity, runId: 'test-run', selectedClaimIds: ['b', 'a', 'c'] });
    expect(headers(packet.cvText, [first, middle, last])).toEqual([last, first, middle]);
  });

  it('keeps user-answer contexts in their stable slots between sorted known contexts', async () => {
    const context = 'Independent advisory engagement';
    const answer = 'Independently reviewed a delivery roadmap and documented implementation risks.';
    const user = fact('u', context, `${context}: ${answer}`, { sourceKind: 'user_answer', phrasing: answer });
    const packet = await composePacket({ profile: profile(source), claims: [fact('a', first, a), fact('b', middle, b), fact('c', last, c), user], opportunity, runId: 'test-run', selectedClaimIds: ['c', 'u', 'b', 'a'] });
    expect(headers(packet.cvText, [first, middle, last, context])).toEqual([first, context, middle, last]);
    expect(packet.cvText).toContain(answer); expect(Object.keys(packet.claimVersions)).toEqual(['c', 'u', 'b', 'a']);
  });

  it('does not assign an independent answer a CV anchor when it shares a context with a literal fact', async () => {
    const answer = 'Coached another workstream lead on delivery planning and stakeholder updates.';
    const user = fact('u', first, `${first}: ${answer}`, { sourceKind: 'user_answer', phrasing: answer });
    const packet = await composePacket({ profile: profile(source), claims: [fact('a', first, a), fact('b', middle, b), fact('c', last, c), user], opportunity, runId: 'test-run', selectedClaimIds: ['c', 'u', 'b', 'a'] });
    expect(headers(packet.cvText, [first, middle, last])).toEqual([middle, first, last]);
    expect(packet.cvText.indexOf(answer)).toBeLessThan(packet.cvText.indexOf(a));
  });

  it('uses distinct literal headers to disambiguate a repeated quotation without weakening existing source authority', async () => {
    const shared = 'Prepared a weekly operating review for the service leadership team.';
    const p = profile(['EMPLOYMENT', first, shared, middle, shared, b, last, c].join('\n'));
    const claims = [fact('a', first, shared), fact('b', middle, b), fact('c', last, c)];
    const packet = await composePacket({ profile: p, claims, opportunity, runId: 'test-run', selectedClaimIds: ['c', 'b', 'a'] });
    expect(headers(packet.cvText, [first, middle, last])).toEqual([first, middle, last]);
    // validateClaim already rejects rebinding its first identical quotation to a later context.
    // This presentation repair must not expand that source authority.
    await expect(composePacket({ profile: p, claims: [fact('bad', middle, shared)], opportunity, runId: 'test-run' })).rejects.toThrow(/context/);
  });

  it('keeps an ambiguous repeated context in its original slot instead of guessing which occurrence it means', async () => {
    const ambiguous = 'Repeated service role', shared = 'Maintained an operating review and recorded delivery actions.';
    const p = profile(['EMPLOYMENT', ambiguous, shared, first, a, ambiguous, shared, middle, b].join('\n'));
    const packet = await composePacket({ profile: p, claims: [fact('a', first, a), fact('b', middle, b), fact('u', ambiguous, shared)], opportunity, runId: 'test-run', selectedClaimIds: ['b', 'u', 'a'] });
    expect(headers(packet.cvText, [first, middle, ambiguous])).toEqual([first, ambiguous, middle]);
    expect(packet.cvText).toContain(shared);
  });

  it('keeps a valid in-quote context without a literal source header in its stable slot', async () => {
    const context = 'Unanchored Team', quote = 'Delivered operating reviews with the Unanchored Team, recording actions and handovers.';
    const p = profile(`${source}\n${quote}`);
    const packet = await composePacket({ profile: p, claims: [fact('a', first, a), fact('b', middle, b), fact('c', last, c), fact('u', context, quote)], opportunity, runId: 'test-run', selectedClaimIds: ['c', 'u', 'b', 'a'] });
    expect(headers(packet.cvText, [first, middle, last, context])).toEqual([first, context, middle, last]);
    expect(packet.cvText).toContain(quote);
  });

  it('recognises exact combined employer/title/date headers from separate source lines', async () => {
    const p = profile(['EMPLOYMENT', 'Westhaven Service Group', 'Director', '2021-present', a, 'Cairnbridge Advisory', 'Manager', '2016-2021', b].join('\n'));
    const packet = await composePacket({ profile: p, claims: [fact('a', 'Westhaven Service Group', a), fact('b', 'Cairnbridge Advisory', b)], opportunity, runId: 'test-run', selectedClaimIds: ['b', 'a'] });
    expect(headers(packet.cvText, ['Westhaven Service Group | Director | 2021-present', 'Cairnbridge Advisory | Manager | 2016-2021'])).toEqual(['Westhaven Service Group | Director | 2021-present', 'Cairnbridge Advisory | Manager | 2016-2021']);
  });

  it('does not resurrect withdrawn, unconfirmed or nonshareable contexts while ordering the CV', async () => {
    const claims = [fact('a', first, a), fact('b', middle, b, { status: 'withdrawn' }), fact('c', last, c, { shareable: false }), fact('a2', first, a2, { confirmed: false })];
    const p = profile(source), packet = await composePacket({ profile: p, claims, opportunity, runId: 'test-run' });
    expect(headers(packet.cvText, [first, middle, last])).toEqual([first]);
    expect(packet.cvText).not.toContain(b); expect(packet.cvText).not.toContain(c); expect(packet.cvText).not.toContain(a2);
    expect(packet.claimVersions).toEqual({ a: 2 });
    await expect(composePacket({ profile: p, claims, opportunity, runId: 'test-run', selectedClaimIds: ['c'] })).rejects.toThrow(/selection/);
    const excluded = await composePacket({ profile: { ...p, excludedTerms: ['Westhaven'] }, claims, opportunity, runId: 'test-run' });
    expect(excluded.cvText).not.toContain(first); expect(excluded.cvText).not.toContain(a);
    expect(excluded.status).toBe('held'); expect(excluded.approvedAt).toBeNull();
  });

  it('keeps a source-bound rewrite attached to its original context and rejects a forged context after reordering', async () => {
    const p = profile(source), claims = [fact('a', first, a), fact('b', middle, b)];
    const rewritten = 'Across regional service teams, led operating reviews and recorded decisions.';
    const rewrites = validateLoopRewrites([{ claimId: 'a', text: rewritten }], claims, ['b', 'a']);
    const packet = await composePacket({ profile: p, claims, opportunity, runId: 'test-run', selectedClaimIds: ['b', 'a'], proposedRewrites: rewrites });
    expect(headers(packet.cvText, [first, middle])).toEqual([first, middle]);
    expect(packet.cvText.indexOf(rewritten)).toBeGreaterThan(packet.cvText.indexOf(first));
    expect(packet.cvText.indexOf(rewritten)).toBeLessThan(packet.cvText.indexOf(middle));
    expect(packet.evidenceText).toContain(`Approved wording: ${a}`);
    expect(packet.evidenceText).toContain(`Proposed wording for this CV (review required): ${rewritten}`);
    expect(Object.keys(packet.claimVersions)).toEqual(['b', 'a']);
    expect(packet.status).toBe('review_required'); expect(packet.approvedAt).toBeNull();
    await expect(composePacket({ profile: p, claims, opportunity, runId: 'test-run', selectedClaimIds: ['b', 'a'], proposedRewrites: [{ ...rewrites[0], context: middle }] })).rejects.toThrow(/source has changed/);
  });
});
