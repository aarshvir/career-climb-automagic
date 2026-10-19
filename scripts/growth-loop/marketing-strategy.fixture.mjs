// Isolated byte/schema fixture only. This does not represent customer research,
// competitor performance, a production release, or marketing approval.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { digestMarketingStrategyBrief, JOB_LOOP_POSITIONING } from './marketing-strategy.mjs';

/** Add one complete test-only strategy binding under an existing temporary root. */
export async function writeMarketingStrategyFixture(evidenceRoot, {
  now = Date.parse('2026-10-19T12:00:00Z'), prefix = 'strategy-fixture',
} = {}) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(prefix)) throw new Error('Use a simple test-only prefix.');
  await mkdir(path.join(evidenceRoot, prefix), { recursive: true });
  const observedAt = new Date(now - 3_600_000).toISOString();
  const records = [
    ['owner', 'owner_feedback', 'Isolated fixture: owner wants the end-to-end Job Loop benefit to lead.'],
    ['research', 'research', 'Isolated fixture: a dated external study describes repeated search and application work. Not Jobvance customers.'],
    ['competitor', 'competitor_claim', 'Isolated fixture: another service claims search plus CV preparation. Not an independently measured outcome.'],
    ['product', 'product_receipt', 'Isolated fixture: tested scoped scheduling and reviewed prepared-CV downloads; not market-wide discovery.'],
    ['claude', 'synthetic', 'Isolated fixture: Claude proposes a fragmentation hook; a model suggestion, not customer evidence.'],
  ];
  const evidence = [];
  for (const [id, kind, body] of records) {
    const bytes = Buffer.from(body);
    const relative = `${prefix}/${id}.txt`;
    await writeFile(path.join(evidenceRoot, relative), bytes);
    evidence.push({ id, kind, observedAt, publicationDate: null, summary: body, path: relative, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
  const brief = {
    version: 1, id: `${prefix}-brief`, revision: 1, createdAt: observedAt, product: 'job_loop',
    context: { owner: 'Jobvance', market: 'US', audience: ['US job seekers', 'US final-year students'], positioning: JOB_LOOP_POSITIONING, accountRequired: true, quizOptional: true },
    evidence,
    pains: [{ id: 'repeated-work', problem: 'Repeated search and CV preparation use time across multiple tools.', status: 'hypothesis', sourceIds: ['research', 'owner'] }],
    alternatives: [{ id: 'manual-or-service', name: 'Manual search or another job-search service', sourceIds: ['competitor'], tradeoff: 'Compare the actual search-to-prepared-CV workflow; no asserted superiority.' }],
    productProof: [{ id: 'scheduled-preparation', capability: 'Recurring Job Loop with reviewed CV preparation and downloads.', sourceIds: ['product'], limitation: 'This test fixture proves schema admission only; production proof must state coverage limits.' }],
    angles: [{ id: 'less-repeated-work', painIds: ['repeated-work'], alternativeIds: ['manual-or-service'], proofIds: ['scheduled-preparation'], headline: JOB_LOOP_POSITIONING, promise: 'Less searching and rewriting.', mechanism: 'Choose roles, locations and a schedule; review opportunities and prepared CVs in one dashboard.', cta: 'Create your account' }],
    tests: [{ angleId: 'less-repeated-work', hypothesis: 'Showing the recurring workflow may improve useful activation relative to a generic score hook.', primaryMetric: 'Verified first reviewed download per attributable account', guardrailMetric: 'Cancellation and refund observations over the same comparable window', decisionRule: 'Retain uncertainty until comparable real observations exist; do not infer a winner from this fixture.' }],
    claudeInputs: [{ evidenceId: 'claude', disposition: 'adapt', reason: 'Keep the customer-work framing; require actual proof and no model-derived satisfaction claim.' }],
    selectedAngleId: 'less-repeated-work', readyForCreative: true,
  };
  const relative = `${prefix}/brief.json`;
  async function writeBrief() {
    const bytes = Buffer.from(`${JSON.stringify(brief, null, 2)}\n`);
    await writeFile(path.join(evidenceRoot, relative), bytes);
    return {
      path: relative, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
      strategyId: brief.id, revision: brief.revision, strategyDigest: digestMarketingStrategyBrief(brief), angleId: brief.selectedAngleId,
    };
  }
  return { brief, binding: await writeBrief(), writeBrief, evidenceRoot, now };
}
