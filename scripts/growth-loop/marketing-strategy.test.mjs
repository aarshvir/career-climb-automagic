import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digestMarketingStrategyBrief, validateMarketingStrategyBrief, validateCreativeStrategyBinding } from './marketing-strategy.mjs';
import { writeMarketingStrategyFixture } from './marketing-strategy.fixture.mjs';

const now = Date.parse('2026-10-19T12:00:00Z');
const has = (r, code) => assert.ok(r.errors.some((e) => e.code === code), JSON.stringify(r.errors));
async function fixture(t) {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'jobvance-strategy-'));
  t.after(() => rm(evidenceRoot, { recursive: true, force: true }));
  const f = await writeMarketingStrategyFixture(evidenceRoot, { now });
  return { ...f, check: () => validateMarketingStrategyBrief(f.brief, { evidenceRoot, now }), checkBinding: (binding = f.binding) => validateCreativeStrategyBinding(binding, { evidenceRoot, now }) };
}

test('a retained research-to-pain-to-competitor-to-product chain admits creative work only', async (t) => {
  const f = await fixture(t); const r = await f.checkBinding();
  assert.equal(r.ok, true); assert.equal(r.readyForCreative, true);
  assert.equal(r.publicationAllowed, false); assert.equal(r.generationAllowed, false);
  assert.equal(r.selectedAngle.id, 'less-repeated-work'); assert.equal(r.evidence.length, 5);
  assert.equal(Object.hasOwn(r, 'customerValidated'), false); assert.equal(Object.hasOwn(r, 'nps'), false);
});

test('digest binds Claude decisions and every strategy field while ignoring key order only', async (t) => {
  const f = await fixture(t); const first = digestMarketingStrategyBrief(f.brief);
  assert.equal(first, digestMarketingStrategyBrief(Object.fromEntries(Object.entries(f.brief).reverse())));
  f.brief.claudeInputs[0].disposition = 'reject'; assert.notEqual(first, digestMarketingStrategyBrief(f.brief));
});

test('older published research retains its publication date after a fresh source verification', async (t) => {
  const f = await fixture(t); f.brief.evidence[1].publicationDate = '2023-02-01';
  const r = await f.check(); assert.equal(r.ok, true);
  const source = r.evidence.find((e) => e.id === 'research');
  assert.equal(source.publicationDate, '2023-02-01'); assert.equal(source.observedAt, f.brief.evidence[1].observedAt);
});

for (const [kind, days] of [['product_receipt', 8], ['competitor_claim', 31], ['research', 91], ['customer_interview', 181]]) {
  test(`${kind} must be rechecked after its current-use window`, async (t) => {
    const f = await fixture(t); const e = f.brief.evidence.find((r) => r.kind === kind) ?? f.brief.evidence[1];
    e.kind = kind; e.observedAt = new Date(now - days * 86_400_000).toISOString();
    has(await f.check(), 'STALE_EVIDENCE');
  });
}

test('future verification and publication dates cannot masquerade as evidence', async (t) => {
  const f = await fixture(t); f.brief.evidence[1].observedAt = '2027-01-01T00:00:00Z'; has(await f.check(), 'INVALID_OBSERVATION_TIME');
  f.brief.evidence[1].observedAt = '2026-10-19T11:00:00Z'; f.brief.evidence[1].publicationDate = '2027-01-01'; has(await f.check(), 'INVALID_PUBLICATION_DATE');
});

test('invalid calendar days cannot be normalized silently into source dates', async (t) => {
  const f = await fixture(t); f.brief.evidence[1].observedAt = '2026-02-30T11:00:00Z'; has(await f.check(), 'INVALID_OBSERVATION_TIME');
  f.brief.evidence[1].observedAt = '2026-10-19T11:00:00Z'; f.brief.evidence[1].publicationDate = '2026-02-30'; has(await f.check(), 'INVALID_PUBLICATION_DATE');
});

test('same-length edited evidence fails even when the strategy JSON is unchanged', async (t) => {
  const f = await fixture(t); const e = f.brief.evidence[1];
  await writeFile(path.join(f.evidenceRoot, e.path), Buffer.alloc(e.bytes, 65));
  has(await f.checkBinding(), 'EVIDENCE_BYTES_MISMATCH');
});

test('reformatting or editing a bound strategy file requires a fresh exact binding', async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.evidenceRoot, f.binding.path), JSON.stringify(f.brief));
  has(await f.checkBinding(), 'STRATEGY_BYTES_MISMATCH');
  f.brief.revision = 2; f.brief.selectedAngleId = 'different'; await f.writeBrief();
  const r = await f.checkBinding(); has(r, 'STRATEGY_IDENTITY_MISMATCH');
});

test('fresh hashes cannot bypass bound strategy ID, revision or selected angle', async (t) => {
  const f = await fixture(t);
  for (const mutation of [{ strategyId: 'other' }, { revision: 2 }, { strategyDigest: 'a'.repeat(64) }, { angleId: 'other' }]) has(await f.checkBinding({ ...f.binding, ...mutation }), 'STRATEGY_IDENTITY_MISMATCH');
});

test('a current product receipt and competitor source are both required for the selected message', async (t) => {
  const f = await fixture(t); f.brief.productProof[0].sourceIds = ['claude']; has(await f.check(), 'WRONG_EVIDENCE_CLASS');
  f.brief.productProof[0].sourceIds = ['product']; f.brief.alternatives[0].sourceIds = ['research']; has(await f.check(), 'WRONG_EVIDENCE_CLASS');
});

test('synthetic-only pain scenarios never become actual customer validation', async (t) => {
  const f = await fixture(t); f.brief.pains[0].sourceIds = ['claude']; f.brief.pains[0].status = 'observed';
  const r = await f.check(); has(r, 'WRONG_EVIDENCE_CLASS'); has(r, 'UNSUPPORTED_CUSTOMER_OBSERVATION');
});

test('owner-only pain supports a hypothesis but cannot solely admit creative or become an observed customer finding', async (t) => {
  const f = await fixture(t); f.brief.pains[0].sourceIds = ['owner'];
  has(await f.check(), 'SELECTED_PAIN_RESEARCH_REQUIRED');
  f.brief.pains[0].status = 'observed'; has(await f.check(), 'UNSUPPORTED_CUSTOMER_OBSERVATION');
});

test('research-backed observations retain external evidence status without manufacturing an NPS score', async (t) => {
  const f = await fixture(t); f.brief.pains[0].status = 'observed'; assert.equal((await f.check()).ok, true);
  f.brief.nps = 61; has(await f.check(), 'UNKNOWN_FIELD');
});

test('a selected angle without a falsifiable learning decision is blocked', async (t) => {
  const f = await fixture(t); f.brief.tests[0].decisionRule = ''; has(await f.check(), 'MISSING_TEST_DECISION');
  f.brief.tests = []; has(await f.check(), 'SELECTED_ANGLE_UNTESTED');
});

test('Claude input decisions must identify retained bytes and a reason', async (t) => {
  const f = await fixture(t); f.brief.claudeInputs[0].evidenceId = 'missing'; has(await f.check(), 'INVALID_CLAUDE_SOURCE');
  f.brief.claudeInputs[0].evidenceId = 'claude'; f.brief.claudeInputs[0].reason = ''; has(await f.check(), 'INVALID_CLAUDE_DECISION');
});

test('the requested upstream Claude reconciliation cannot be silently skipped', async (t) => {
  const f = await fixture(t); f.brief.claudeInputs = [];
  const r = await f.check(); has(r, 'INVALID_LIST'); assert.equal(r.readyForCreative, false);
});

test('the requested positioning and authorized audience cannot drift silently', async (t) => {
  const f = await fixture(t); f.brief.context.positioning = 'A safer CV score'; has(await f.check(), 'WRONG_PRODUCT_CONTEXT');
  f.brief.context.positioning = 'Jobvance automates your job search end to end.'; f.brief.context.market = 'worldwide'; has(await f.check(), 'WRONG_PRODUCT_CONTEXT');
  f.brief.context.market = 'US'; f.brief.context.audience = ['US job seekers']; has(await f.check(), 'WRONG_AUDIENCE_SCOPE');
});

test('a strategy cannot grant publication, generation or budget authority', async (t) => {
  const f = await fixture(t); f.brief.publicationAllowed = true; f.brief.dailyBudget = 500;
  const r = await f.check(); has(r, 'UNKNOWN_FIELD'); assert.equal(r.publicationAllowed, false); assert.equal(r.generationAllowed, false);
});

for (const value of [null, [], ['research'], {}, 3, true]) {
  test(`nonliteral source class ${JSON.stringify(value)} fails closed without coercion`, async (t) => {
    const f = await fixture(t); f.brief.evidence[1].kind = value; has(await f.check(), 'INVALID_EVIDENCE_CLASS');
  });
}

test('null/array category and malformed references produce errors rather than exceptions', async (t) => {
  const f = await fixture(t); f.brief.context = []; f.brief.pains[0].sourceIds = 'research'; f.brief.productProof = [null];
  const r = await f.check(); has(r, 'INVALID_CATEGORY'); has(r, 'INVALID_LIST');
});

test('duplicate IDs, source files and references cannot inflate evidence', async (t) => {
  const f = await fixture(t); f.brief.evidence.push({ ...f.brief.evidence[1] }); has(await f.check(), 'INVALID_ENTRY_ID');
  f.brief.evidence.pop(); f.brief.evidence.push({ ...f.brief.evidence[1], id: 'research-copy' }); has(await f.check(), 'DUPLICATE_EVIDENCE_FILE');
  f.brief.evidence.pop(); f.brief.pains[0].sourceIds = ['research', 'research']; has(await f.check(), 'INVALID_REFERENCE');
});

for (const badPath of ['../outside.txt', '/etc/passwd', 'C:\\private\\source.txt', '\\\\server\\share\\source.txt', 'absent.txt']) {
  test(`missing or escaping evidence is rejected: ${badPath}`, async (t) => {
    const f = await fixture(t); f.brief.evidence[1].path = badPath; has(await f.check(), 'EVIDENCE_UNAVAILABLE');
  });
}

test('an in-root symlink to outside evidence cannot bypass the root boundary', async (t) => {
  const f = await fixture(t); const outside = await mkdtemp(path.join(tmpdir(), 'jobvance-strategy-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'source.txt'), 'outside');
  try { await symlink(outside, path.join(f.evidenceRoot, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (e) { if (e.code === 'EPERM' || e.code === 'EACCES') { t.skip('Host does not permit isolated symlink creation.'); return; } throw e; }
  f.brief.evidence[1].path = 'linked/source.txt'; has(await f.check(), 'EVIDENCE_UNAVAILABLE');
});

test('strategy and binding cannot be null, arrays, cyclic, nonfinite or non-JSON objects', async () => {
  const cyclic = {}; cyclic.self = cyclic;
  for (const v of [null, [], cyclic, { version: NaN }, new Date(), { value: undefined }]) has(await validateMarketingStrategyBrief(v, { now }), 'INVALID_STRATEGY');
  for (const v of [null, [], cyclic]) has(await validateCreativeStrategyBinding(v, { now }), 'STRATEGY_BINDING_REQUIRED');
});

test('caller changes during filesystem awaits cannot replace the original strategy or binding intent', async (t) => {
  const f = await fixture(t); const originalDigest = digestMarketingStrategyBrief(f.brief);
  const checking = f.check(); f.brief.context.market = 'other'; f.brief.readyForCreative = false;
  const r = await checking; assert.equal(r.ok, true); assert.equal(r.strategyDigest, originalDigest);
  const binding = { ...f.binding }; const bound = f.checkBinding(binding); binding.angleId = 'different';
  assert.equal((await bound).ok, true);
});

test('invalid clocks cannot disable age validation', async (t) => {
  const f = await fixture(t);
  for (const clock of [NaN, Infinity, '2026-10-19']) {
    has(await validateMarketingStrategyBrief(f.brief, { evidenceRoot: f.evidenceRoot, now: clock }), 'INVALID_CLOCK');
    has(await validateCreativeStrategyBinding(f.binding, { evidenceRoot: f.evidenceRoot, now: clock }), 'INVALID_CLOCK');
  }
});

for (const promise of ['We automatically apply for you.', 'A guaranteed job.', 'No account needed.', 'We do 90% of the work.', 'Improve hiring chances by 300%.']) {
  test(`current product scope rejects angle: ${promise}`, async (t) => {
    const f = await fixture(t); f.brief.angles[0].promise = promise; has(await f.check(), 'UNSUPPORTED_ANGLE_PROMISE');
  });
}

test('bound JSON parse and bytes checks are independent of canonical digest', async (t) => {
  const f = await fixture(t); const file = path.join(f.evidenceRoot, f.binding.path);
  const invalid = Buffer.from('not JSON'); await writeFile(file, invalid);
  has(await f.checkBinding({ ...f.binding, sha256: createHash('sha256').update(invalid).digest('hex'), bytes: invalid.length }), 'STRATEGY_FILE_UNAVAILABLE');
  f.binding.path = '../outside.json'; has(await f.checkBinding(), 'STRATEGY_FILE_UNAVAILABLE');
});

test('a strategy file is preserved and checks do not mutate any source bytes', async (t) => {
  const f = await fixture(t); const file = path.join(f.evidenceRoot, f.binding.path); const before = await readFile(file);
  assert.equal((await f.checkBinding()).ok, true); assert.deepEqual(await readFile(file), before);
});
