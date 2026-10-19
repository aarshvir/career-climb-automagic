import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ReceiptStore, TARGETS } from './receipt-store.mjs';
import { digestCreativeManifest } from './creative-quality.mjs';
import { writeMarketingStrategyFixture } from './marketing-strategy.fixture.mjs';
import { preparePost, dispatchPost, assess, dispatchPause, status } from './orchestrator.mjs';

const now = Date.parse('2026-10-19T14:00:00Z');
const reviewedAt = '2026-10-17T11:00:00Z';
async function fixture(t) {
  const assetRoot = await mkdtemp(path.join(tmpdir(), 'jobvance-orchestration-'));
  const dbPath = path.join(assetRoot, 'state.sqlite');
  const handles = [];
  const open = () => { const store = new ReceiptStore(dbPath); handles.push(store); return store; };
  t.after(async () => { for (const handle of handles) { try { handle.close(); } catch {} } await rm(assetRoot, { recursive: true, force: true }); });
  const bytes = Buffer.from('local integration fixture media bytes, not decoded video');
  await writeFile(path.join(assetRoot, 'video.mp4'), bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    version: 1, id: 'orchestration-fixture', revision: 1, product: 'job_loop', destinationUrl: 'https://jobvance.io/loop',
    copy: { headline: 'Job Loop', body: 'Create an account. Find jobs on your weekly schedule.', cta: 'Start your Job Loop', transcript: 'Create an account, choose roles and locations, then review jobs on your schedule.' },
    claims: { accountRequired: true, quizOptional: true, recurringJobLoop: true, automaticApplications: false, guaranteedOutcome: false },
    assets: [{ id: 'main', path: 'video.mp4', kind: 'video', sha256, bytes: bytes.length,
      provenance: { origin: 'synthetic_presenter', testimonial: false, licenseEvidence: 'isolated fixture receipt' },
      measurements: { width: 1080, height: 1920, durationSeconds: 15, assetSha256: sha256, measuredBy: 'fixture measurement', measuredAt: reviewedAt },
      review: { reviewer: 'fixture reviewer', reviewerType: 'human', reviewedAt, assetSha256: sha256, method: 'human_full_asset', coverage: 'full', visual: true, copyAndClaims: true, audio: true, captions: true, lipSync: true },
    }],
  };
  const strategy = await writeMarketingStrategyFixture(assetRoot, { now: Date.parse('2026-10-17T12:00:00Z') });
  manifest.strategy = strategy.binding;
  const approve = () => { manifest.approval = { revision: manifest.revision, manifestDigest: digestCreativeManifest(manifest), approvedBy: 'fixture approver', approvedAt: reviewedAt }; };
  approve();
  return { assetRoot, dbPath, manifest, strategy, approve, open, store: open(), opts: { assetRoot, platform: 'facebook', now } };
}
const readback = attempt => ({ externalId: 'fixture-post', url: 'https://www.facebook.com/fixture-post', observedAt: new Date(now + 1000).toISOString(), target: TARGETS.facebook, bodyDigest: attempt.bodyDigest, verification: 'platform_readback' });

test('reviewed bytes pass through durable prepare, dispatch and exact readback across restarts', async t => {
  const f = await fixture(t);
  const queued = await preparePost(f.store, f.manifest, f.opts);
  assert.equal(queued.status, 'queued'); f.store.close();
  const second = f.open(); const attempt = await dispatchPost(second, queued.id, f.manifest, f.opts);
  assert.equal(attempt.body.target, TARGETS.facebook); assert.deepEqual(attempt.assetPaths, ['video.mp4']);
  assert.equal(second.get(queued.id).status, 'inflight'); second.close();
  const third = f.open(); third.confirm(queued.id, attempt.token, readback(attempt), now + 1000); third.close();
  const result = status(f.open(), now + 2000);
  assert.equal(result.operations[0].status, 'confirmed'); assert.equal(result.operations[0].receipt.externalId, 'fixture-post');
});

test('tampering with prepared bytes blocks dispatch without consuming the attempt', async t => {
  const f = await fixture(t); const queued = await preparePost(f.store, f.manifest, f.opts);
  await writeFile(path.join(f.assetRoot, 'video.mp4'), Buffer.alloc(f.manifest.assets[0].bytes, 88));
  const result = await dispatchPost(f.store, queued.id, f.manifest, f.opts);
  assert.equal(result.status, 'blocked'); assert.equal(f.store.get(queued.id).status, 'queued');
  assert.ok(result.quality.errors.some(e => e.code === 'ASSET_BYTES_MISMATCH'));
});

test('a fully reviewed creative cannot queue without its upstream strategy binding', async t => {
  const f = await fixture(t); delete f.manifest.strategy; f.approve();
  const result = await preparePost(f.store, f.manifest, f.opts);
  assert.equal(result.status, 'blocked');
  assert.ok(result.quality.errors.some(e => e.code === 'STRATEGY_BINDING_REQUIRED'));
  assert.deepEqual(f.store.report().operations, []);
});

test('a grounded strategy cannot launder unsupported promises in the actual ad copy or transcript', async t => {
  const f = await fixture(t);
  for (const claim of ['Job Loop does 90% of the work.', 'Improve hiring chances by 300%.', 'Never miss a relevant job.']) {
    f.manifest.copy.body = `Create an account for weekly Job Loop. ${claim}`;
    f.manifest.copy.transcript = claim;
    f.approve();
    const result = await preparePost(f.store, f.manifest, f.opts);
    assert.equal(result.status, 'blocked');
    assert.ok(result.quality.errors.some(e => e.code === 'UNSUPPORTED_COPY'));
  }
  assert.deepEqual(f.store.report().operations, []);
});

test('changed upstream customer evidence blocks a queued creative before any attempt', async t => {
  const f = await fixture(t); const queued = await preparePost(f.store, f.manifest, f.opts);
  const source = f.strategy.brief.evidence.find(e => e.kind === 'research');
  await writeFile(path.join(f.assetRoot, source.path), 'Changed source, not the originally admitted research.');
  const result = await dispatchPost(f.store, queued.id, f.manifest, f.opts);
  assert.equal(result.status, 'blocked');
  assert.ok(result.quality.errors.some(e => e.code === 'EVIDENCE_BYTES_MISMATCH'));
  assert.equal(f.store.get(queued.id).status, 'queued');
});

test('stale strategy proof is rechecked at dispatch without consuming a queued attempt', async t => {
  const f = await fixture(t); const queued = await preparePost(f.store, f.manifest, f.opts);
  const result = await dispatchPost(f.store, queued.id, f.manifest, { ...f.opts, now: Date.parse('2026-10-25T12:00:00Z') });
  assert.equal(result.status, 'blocked');
  assert.ok(result.quality.errors.some(e => e.code === 'STALE_EVIDENCE'));
  assert.equal(f.store.get(queued.id).status, 'queued');
});

test('unapproved edits do not enter outbox, and newly approved changed content cannot replace queued intent', async t => {
  const f = await fixture(t); const queued = await preparePost(f.store, f.manifest, f.opts);
  f.manifest.copy.body += ' Choose your locations.';
  assert.equal((await preparePost(f.store, f.manifest, f.opts)).status, 'blocked');
  f.manifest.revision++; f.approve();
  await assert.rejects(dispatchPost(f.store, queued.id, f.manifest, f.opts), /differs/);
  assert.equal(f.store.get(queued.id).status, 'queued');
  const next = await preparePost(f.store, f.manifest, f.opts); assert.notEqual(next.id, queued.id);
});

test('malformed manifest and unsupported platform cannot queue an external action', async t => {
  const f = await fixture(t);
  for (const manifest of [null, [], { version: 1 }]) assert.equal((await preparePost(f.store, manifest, f.opts)).status, 'blocked');
  await assert.rejects(preparePost(f.store, f.manifest, { ...f.opts, platform: 'unapproved' }));
  assert.deepEqual(f.store.report().operations, []);
});

test('confirmed publication cannot be reissued through a duplicate prepare or revised approval', async t => {
  const f = await fixture(t); const queued = await preparePost(f.store, f.manifest, f.opts);
  const attempt = await dispatchPost(f.store, queued.id, f.manifest, f.opts); f.store.confirm(queued.id, attempt.token, readback(attempt), now + 1000);
  const duplicate = await preparePost(f.store, f.manifest, f.opts); assert.equal(duplicate.id, queued.id); assert.equal(duplicate.duplicate, true);
  await assert.rejects(dispatchPost(f.store, duplicate.id, f.manifest, { ...f.opts, now: now + 86400000 }), /already attempted/);
  f.manifest.revision++; f.approve(); const revised = await preparePost(f.store, f.manifest, f.opts);
  assert.equal(revised.id, queued.id); await assert.rejects(dispatchPost(f.store, revised.id, f.manifest, f.opts));
  assert.equal(f.store.report().operations.length, 1);
});

test('crashed dispatch is unknown after reopen and cannot be automatically retried', async t => {
  const f = await fixture(t); const queued = await preparePost(f.store, f.manifest, f.opts);
  await dispatchPost(f.store, queued.id, f.manifest, f.opts); f.store.close();
  const second = f.open(); const report = status(second, now + 600001);
  assert.deepEqual(report.recovered, [queued.id]); assert.equal(report.operations[0].status, 'unknown');
  await assert.rejects(dispatchPost(second, queued.id, f.manifest, { ...f.opts, now: now + 86400000 }), /already attempted/);
});

test('missing measurement stays inconclusive and does not queue or claim advertising actions', async t => {
  const f = await fixture(t); const result = assess(f.store, { now: new Date(now).toISOString() });
  assert.equal(result.decision.action, 'review'); assert.equal(result.queuedPause, null); assert.equal(result.externalActionPerformed, false);
  assert.equal(result.decision.evidence.reviewedDownloads, null); assert.equal(result.decision.evidence.verifiedNetRevenueMinor, null);
  assert.equal(f.store.report().observations.length, 1); assert.deepEqual(f.store.report().operations, []);
});

test('expired deadline queues only approved campaign and can dispatch with a later wall clock', async t => {
  const f = await fixture(t); const input = { now: '2026-10-24T13:00:00Z' }; const assessed = assess(f.store, input);
  assert.equal(assessed.decision.action, 'pause'); assert.equal(assessed.externalActionPerformed, false);
  const queued = f.store.get(assessed.queuedPause.id);
  assert.equal(queued.body.target, TARGETS.campaign); assert.equal(queued.body.content.accountId, TARGETS.adAccount);
  const attempt = dispatchPause(f.store, queued.id, { ...input, now: '2026-10-24T13:00:01Z' });
  assert.equal(attempt.body.target, TARGETS.campaign); assert.equal(f.store.get(queued.id).status, 'inflight');
  assert.throws(() => dispatchPause(f.store, queued.id, { ...input, now: '2026-10-24T13:00:02Z' }), /already attempted/);
});

test('changed evidence cannot silently inherit an earlier pause decision', async t => {
  const f = await fixture(t); const input = { now: '2026-10-24T13:00:00Z' }; const assessed = assess(f.store, input);
  assert.throws(() => dispatchPause(f.store, assessed.queuedPause.id, { ...input, health: { available: false } }), /exact evaluated evidence/);
  assert.equal(f.store.get(assessed.queuedPause.id).status, 'queued');
});

test('prepare captures exact reviewed manifest before asynchronous asset reads', async t => {
  const f = await fixture(t); const before = structuredClone(f.manifest);
  const pending = preparePost(f.store, f.manifest, f.opts);
  f.manifest.copy.body = 'No account needed.';
  const queued = await pending; assert.equal(queued.status, 'queued');
  assert.equal(f.store.get(queued.id).body.content.caption, [before.copy.headline, before.copy.body, before.copy.cta].join('\n\n'));
});

test('dispatch cannot substitute mutable asset paths after review starts', async t => {
  const f = await fixture(t); const queued = await preparePost(f.store, f.manifest, f.opts);
  const pending = dispatchPost(f.store, queued.id, f.manifest, f.opts);
  f.manifest.assets[0].path = 'unreviewed.mp4';
  const attempt = await pending; assert.deepEqual(attempt.assetPaths, ['video.mp4']);
});

test('CLI validate and prepare share actual bytes and durable state, and reject unknown options', async t => {
  const f = await fixture(t); const file = path.join(f.assetRoot, 'manifest.json'); await writeFile(file, JSON.stringify(f.manifest));
  const cliPath = fileURLToPath(new URL('./cli.mjs', import.meta.url));
  const run = args => spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  const strategyCheck = run(['strategy-validate', '--brief', path.join(f.assetRoot, f.manifest.strategy.path), '--evidence-root', f.assetRoot]);
  assert.equal(strategyCheck.status, 0, strategyCheck.stderr);
  assert.equal(JSON.parse(strategyCheck.stdout).readyForCreative, true);
  assert.equal(JSON.parse(strategyCheck.stdout).publicationAllowed, false);
  const checked = run(['validate', '--manifest', file, '--asset-root', f.assetRoot]); assert.equal(checked.status, 0, checked.stderr); assert.equal(JSON.parse(checked.stdout).ok, true);
  const prepared = run(['prepare', '--db', f.dbPath, '--manifest', file, '--asset-root', f.assetRoot, '--platform', 'facebook']); assert.equal(prepared.status, 0, prepared.stderr);
  const queued = JSON.parse(prepared.stdout); assert.equal(f.store.get(queued.id).status, 'queued');
  const bad = run(['status', '--db', f.dbPath, '--activate', 'true']); assert.notEqual(bad.status, 0);
  await writeFile(path.join(f.assetRoot, 'video.mp4'), 'changed');
  const invalid = run(['validate', '--manifest', file, '--asset-root', f.assetRoot]); assert.equal(invalid.status, 2); assert.equal(JSON.parse(invalid.stdout).ok, false);
});
