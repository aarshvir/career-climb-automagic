import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digestCreativeManifest, validateCreativeManifest } from './creative-quality.mjs';

const now = Date.parse('2026-10-17T12:00:00Z');
const at = '2026-10-17T11:00:00Z';
async function fixture(t) {
  const assetRoot = await mkdtemp(path.join(tmpdir(), 'jobvance-creative-'));
  t.after(() => rm(assetRoot, { recursive: true, force: true }));
  // A local byte fixture tests receipt integrity, not a claim of decoded video QA.
  const bytes = Buffer.from('isolated final media bytes');
  await writeFile(path.join(assetRoot, 'final.mp4'), bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    version: 1, id: 'test-creative', revision: 1, product: 'job_loop', destinationUrl: 'https://jobvance.io/loop',
    copy: { headline: 'Job Loop', body: 'Create an account. Find jobs on your weekly schedule.', cta: 'Start your Job Loop', transcript: 'Create an account, choose roles and locations, and review jobs on your schedule.' },
    claims: { accountRequired: true, quizOptional: true, recurringJobLoop: true, automaticApplications: false, guaranteedOutcome: false },
    assets: [{ id: 'main', path: 'final.mp4', kind: 'video', sha256, bytes: bytes.length,
      provenance: { origin: 'synthetic_presenter', testimonial: false, licenseEvidence: 'isolated fixture provider receipt' },
      measurements: { width: 1080, height: 1920, durationSeconds: 15, assetSha256: sha256, measuredBy: 'fixture measurement', measuredAt: at },
      review: { reviewer: 'fixture reviewer', reviewerType: 'human', reviewedAt: at, assetSha256: sha256, method: 'human_full_asset', coverage: 'full', visual: true, copyAndClaims: true, audio: true, captions: true, lipSync: true },
    }],
  };
  const approve = () => { manifest.approval = { revision: manifest.revision, manifestDigest: digestCreativeManifest(manifest), approvedBy: 'fixture approver', approvedAt: at }; };
  approve();
  const check = () => validateCreativeManifest(manifest, { assetRoot, now });
  return { assetRoot, manifest, approve, check };
}
const has = (result, code) => assert.ok(result.errors.some((item) => item.code === code), JSON.stringify(result.errors));

test('exact local bytes with complete dated review and approval pass', async (t) => {
  const f = await fixture(t); const result = await f.check();
  assert.equal(result.ok, true); assert.equal(result.reviewed, true); assert.equal(result.assets[0].sha256, f.manifest.assets[0].sha256);
});
test('digest is stable across key order and ignores only approval', async (t) => {
  const f = await fixture(t); const original = digestCreativeManifest(f.manifest);
  assert.equal(original, digestCreativeManifest(Object.fromEntries(Object.entries(f.manifest).reverse())));
  f.manifest.approval.approvedBy = 'another approver'; assert.equal(original, digestCreativeManifest(f.manifest));
  f.manifest.copy.cta = 'Changed CTA'; assert.notEqual(original, digestCreativeManifest(f.manifest));
});
test('editing copy invalidates original exact approval', async (t) => {
  const f = await fixture(t); f.manifest.copy.body += ' Extra copy.'; has(await f.check(), 'EXACT_APPROVAL_REQUIRED');
});
test('same-length tampering fails the actual hash check', async (t) => {
  const f = await fixture(t); await writeFile(path.join(f.assetRoot, 'final.mp4'), Buffer.alloc(f.manifest.assets[0].bytes, 65));
  has(await f.check(), 'ASSET_BYTES_MISMATCH');
});
test('missing file and out-of-root path fail closed', async (t) => {
  const f = await fixture(t); f.manifest.assets[0].path = '../outside.mp4'; f.approve(); has(await f.check(), 'ASSET_UNAVAILABLE');
  f.manifest.assets[0].path = 'missing.mp4'; f.approve(); has(await f.check(), 'ASSET_UNAVAILABLE');
});
test('absolute Windows paths cannot escape a POSIX or Windows asset root', async (t) => {
  const f = await fixture(t); f.manifest.assets[0].path = 'C:\\private\\file.mp4'; f.approve(); has(await f.check(), 'ASSET_UNAVAILABLE');
});
test('frame-only presenter review never counts as full motion/audio review', async (t) => {
  const f = await fixture(t); Object.assign(f.manifest.assets[0].review, { reviewerType: 'agent', method: 'agent_visual_full_asset', coverage: 'frames', audio: false, lipSync: false });
  f.approve(); has(await f.check(), 'FULL_REVIEW_REQUIRED');
});
test('evidenced full agent video review is allowed without inventing a human reviewer', async (t) => {
  const f = await fixture(t); Object.assign(f.manifest.assets[0].review, { reviewerType: 'agent', method: 'agent_full_asset', evidence: 'fixture full playback/audio observation receipt' });
  f.approve(); assert.equal((await f.check()).ok, true);
  delete f.manifest.assets[0].review.evidence; f.approve(); has(await f.check(), 'FULL_REVIEW_REQUIRED');
});
test('agent full image inspection is allowed without requiring audio', async (t) => {
  const f = await fixture(t); const asset = f.manifest.assets[0]; asset.kind = 'image';
  Object.assign(asset.review, { reviewerType: 'agent', method: 'agent_visual_full_asset', audio: false, lipSync: false });
  f.manifest.copy.transcript = ''; f.approve(); assert.equal((await f.check()).ok, true);
});
test('every asset must be reviewed, not only the first carousel item', async (t) => {
  const f = await fixture(t); await writeFile(path.join(f.assetRoot, 'second.mp4'), Buffer.from('isolated final media bytes'));
  const second = structuredClone(f.manifest.assets[0]); second.id = 'second'; second.path = 'second.mp4'; delete second.review;
  f.manifest.assets.push(second); f.approve(); has(await f.check(), 'FULL_REVIEW_REQUIRED');
});
test('missing dimensions, duration or measurement binding fail', async (t) => {
  const f = await fixture(t); f.manifest.assets[0].measurements.durationSeconds = 0; f.approve(); has(await f.check(), 'MISSING_MEASUREMENTS');
  delete f.manifest.assets[0].measurements; f.approve(); has(await f.check(), 'MISSING_MEASUREMENTS');
});
test('future review, measurement and approval timestamps fail', async (t) => {
  const f = await fixture(t); const future = '2027-01-01T00:00:00Z';
  f.manifest.assets[0].review.reviewedAt = future; f.manifest.assets[0].measurements.measuredAt = future; f.approve(); f.manifest.approval.approvedAt = future;
  const result = await f.check(); has(result, 'FULL_REVIEW_REQUIRED'); has(result, 'MISSING_MEASUREMENTS'); has(result, 'EXACT_APPROVAL_REQUIRED');
});
test('approval cannot predate review', async (t) => {
  const f = await fixture(t); f.manifest.approval.approvedAt = '2026-10-17T10:00:00Z'; has(await f.check(), 'APPROVAL_PRECEDES_REVIEW');
});
test('synthetic presenter cannot be labelled a customer testimonial', async (t) => {
  const f = await fixture(t); f.manifest.assets[0].provenance.testimonial = true; f.approve(); has(await f.check(), 'MISSING_PROVENANCE');
});
for (const badCopy of ['No account needed.', 'Registration is optional.', 'A mandatory quiz.', 'Guaranteed job.', 'We automatically apply.', 'Join the beta.']) {
  test(`rejects unsupported claim: ${badCopy}`, async (t) => {
    const f = await fixture(t); f.manifest.copy.body += ` ${badCopy}`; f.approve(); has(await f.check(), 'UNSUPPORTED_COPY');
  });
}
test('product declaration and copy must both contain the intended journey', async (t) => {
  const f = await fixture(t); f.manifest.claims.accountRequired = false; f.approve(); has(await f.check(), 'INVALID_PRODUCT_CLAIMS');
  f.manifest.copy = { headline: 'CV check', body: 'See your score.', cta: 'Try now', transcript: '' }; f.approve(); has(await f.check(), 'MISSING_PRODUCT_MESSAGE');
});
test('external or credential-bearing destinations fail', async (t) => {
  const f = await fixture(t); f.manifest.destinationUrl = 'https://jobvance.io.evil.example/loop'; f.approve(); has(await f.check(), 'INVALID_DESTINATION');
  f.manifest.destinationUrl = 'https://user:password@jobvance.io/loop'; f.approve(); has(await f.check(), 'INVALID_DESTINATION');
});
test('malformed manifests never pass by parser fallback', async (t) => {
  const f = await fixture(t);
  for (const input of [null, [], 'bad', { ...f.manifest, revision: Infinity }]) assert.equal((await validateCreativeManifest(input, { assetRoot: f.assetRoot, now })).ok, false);
  const cycle = {}; cycle.self = cycle; assert.throws(() => digestCreativeManifest(cycle));
});
test('duplicate asset IDs, byte receipts and missing approval fail closed', async (t) => {
  const f = await fixture(t); f.manifest.assets.push(structuredClone(f.manifest.assets[0])); delete f.manifest.approval;
  const result = await f.check(); has(result, 'DUPLICATE_ASSET_ID'); has(result, 'ASSET_UNAVAILABLE'); has(result, 'EXACT_APPROVAL_REQUIRED');
});
test('validation captures complete manifest intent before its first asynchronous file read', async (t) => {
  const f = await fixture(t); const originalDigest = digestCreativeManifest(f.manifest);
  const pending = f.check();
  f.manifest.copy.body = 'No account needed.';
  f.manifest.assets[0].review.audio = false;
  f.manifest.assets[0].sha256 = 'f'.repeat(64);
  f.approve();
  const result = await pending;
  assert.equal(result.ok, true); assert.equal(result.manifestDigest, originalDigest);
  assert.notEqual(result.assets[0].sha256, f.manifest.assets[0].sha256);
});
test('alternate ports are not approved Jobvance destinations', async (t) => {
  const f = await fixture(t); f.manifest.destinationUrl = 'https://jobvance.io:8443/loop'; f.approve(); has(await f.check(), 'INVALID_DESTINATION');
});
