// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prepareModelRequest, callModel } from '../functions/_shared/job-loop-providers';
import { composePacket } from '../functions/_shared/job-loop-engine';
import { renderPacket } from '../functions/_shared/job-loop-render';
import type { LoopClaim, LoopOpportunity, LoopProfile } from '../functions/_shared/job-loop-types';

const original = 'Supported monthly reporting for 5 stores.';
const proposed = 'Supported reporting monthly for 5 stores.';
const profile: LoopProfile = { audience: 'professional', name: 'Alex Example', contactLine: 'private-contact@example.invalid', targetTitles: ['Reporting Analyst'], locations: ['Remote'], experienceYears: 5, languages: ['English'], pageTarget: 1, discreetSearch: false,
  sourceText: `Alex Example\nEXPERIENCE\nExample Co\n${original}\nSKILLS\nPrivate detail that is not shared.`, excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null }, revision: 2, updatedAt: '2026-10-17T00:00:00Z' };
const claim: LoopClaim = { id: 'reporting-claim', revision: 3, status: 'active', sourceKind: 'cv_passage', sourceQuote: original, phrasing: original, context: 'Example Co', kind: 'employment', resultStatus: 'not_measured', confirmed: true, shareable: true, createdAt: profile.updatedAt };
const opportunity: LoopOpportunity = { id: '22222222-2222-4222-8222-222222222222', title: 'Reporting Analyst', company: 'Another Employer', location: 'Remote', url: 'https://example.com/jobs/reporting', description: 'Prepare monthly reporting for stores, support the reporting team and analyze information for the monthly reporting cycle.', contact: null, source: 'manual', sourceKey: 'manual:reporting', checkedAt: profile.updatedAt, verification: 'user_provided', status: 'saved', notes: '', followUpAt: null };
const env = (name: string) => ({ JOB_LOOP_PAID_APIS_ENABLED: 'true', OPENAI_API_KEY: 'isolated-fixture-only' }[name]);
const response = (text = proposed) => Response.json({ usage: { input_tokens: 100, output_tokens: 80 }, output_text: JSON.stringify({ claimIds: [claim.id], rewrites: [{ claimId: claim.id, text }] }) });
const compose = (rewrites: Awaited<ReturnType<typeof callModel>>['rewrites'], claims = [claim]) => composePacket({ profile, claims, opportunity, selectedClaimIds: [claim.id], proposedRewrites: rewrites, runId: '11111111-1111-4111-8111-111111111111', model: { provider: 'openai', model: 'gpt-6.1-sol', method: 'source-bound-deep-tailoring-v1' } });

describe('model response to reviewed Loop packet', () => {
  it('uses actual provider parsing and composition, preserving original evidence and requiring artifact approval', async () => {
    const source = structuredClone(claim), snapshot = structuredClone(source);
    const request = prepareModelRequest('openai', 'gpt-6.1-sol', env, opportunity, [source, { ...claim, id: 'private', phrasing: 'Unconfirmed secret', confirmed: false }, { ...claim, id: 'unshared', phrasing: 'Hidden private claim', shareable: false }]);
    const body = JSON.stringify(request.body);
    expect(body).not.toContain(profile.contactLine); expect(body).not.toContain('Private detail'); expect(body).not.toContain('Unconfirmed secret'); expect(body).not.toContain('Hidden private claim');
    const result = await callModel(request, async () => response());
    expect(result.error).toBeNull(); expect(result.actualMicros).toBe(1000);
    const packet = await compose(result.rewrites);
    expect(packet.cvText).toContain(proposed); expect(packet.evidenceText).toContain(`Approved wording: ${original}`);
    expect(packet.evidenceText).toContain(`Proposed wording for this CV (review required): ${proposed}`);
    expect(packet.claimVersions).toEqual({ [claim.id]: 3 });
    expect(packet.status).toBe('review_required'); expect(packet.approvedAt).toBeNull();
    expect(source).toEqual(snapshot);
    const rendered = await renderPacket({ packet, profile });
    expect(new TextDecoder().decode(rendered.artifacts.txt.bytes)).toContain(proposed);
    expect(new TextDecoder().decode(rendered.artifacts.txt.bytes)).not.toContain(original);
    expect(packet.approvedAt).toBeNull(); // rendering is preparation, never approval
  });
  it('refuses provider outputs that upgrade ownership or borrow another number', async () => {
    for (const text of ['Led reporting monthly for 5 stores.', 'Supported reporting monthly for 99 stores.']) {
      const result = await callModel(prepareModelRequest('openai', 'gpt-6.1-sol', env, opportunity, [claim]), async () => response(text));
      expect(result.error).toBeTruthy(); expect(result.rewrites).toEqual([]); expect(result.claimIds).toEqual([]);
    }
  });
  it('does not replay a saved rewrite against a new revision or withdrawn/private claim', async () => {
    const result = await callModel(prepareModelRequest('openai', 'gpt-6.1-sol', env, opportunity, [claim]), async () => response());
    for (const patch of [{ revision: 4 }, { status: 'withdrawn' as const }, { shareable: false }, { confirmed: false }]) {
      await expect(compose(result.rewrites, [{ ...claim, ...patch }])).rejects.toThrow();
    }
  });
});
