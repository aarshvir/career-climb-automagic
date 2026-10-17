import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ReceiptStore, TARGETS, digest, canonical } from './receipt-store.mjs';

const monday = Date.parse('2026-10-19T14:00:00Z');
const hash = 'a'.repeat(64);
const manifestDigest = 'b'.repeat(64);
const op = (caption = 'Create an account for Job Loop on your schedule.', platform = 'facebook') => ({
  kind: 'organic_post', platform, target: TARGETS[platform],
  content: { creativeId: 'creative-b', revision: 1, manifestDigest, assetHashes: [hash], caption, destinationUrl: 'https://jobvance.io/loop' },
});
const quality = { ok: true, reviewed: true, manifestDigest, errors: [], assets: [{ id: 'main', sha256: hash, bytes: 12 }] };
const claimOptions = (now = monday) => ({ now, manifestDigest, quality: { ...quality, validatedAt: now } });
const receipt = (operation, observedAt = new Date(monday + 1000).toISOString()) => ({
  externalId: 'post123', url: `https://www.${operation.platform}.com/post123`, observedAt,
  target: operation.target, bodyDigest: digest(operation), verification: 'platform_readback',
});
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'jobvance-receipts-'));
  const dbPath = path.join(dir, 'queue.sqlite');
  const handles = [];
  const open = () => { const store = new ReceiptStore(dbPath); handles.push(store); return store; };
  t.after(async () => { for (const handle of handles) { try { handle.close(); } catch {} } await rm(dir, { recursive: true, force: true }); });
  return { open, store: open() };
}

test('queue, inflight attempt and confirmed receipt survive real close/reopen', async (t) => {
  const f = await fixture(t); const operation = op(); const queued = f.store.enqueue(operation, monday);
  f.store.close(); const second = f.open(); assert.equal(second.get(queued.id).status, 'queued');
  const attempt = second.claim(queued.id, claimOptions()); second.close();
  const third = f.open(); assert.equal(third.get(queued.id).token, attempt.token);
  third.confirm(queued.id, attempt.token, receipt(operation), monday + 1000); third.close();
  assert.equal(f.open().get(queued.id).status, 'confirmed');
});
test('two live SQLite connections cannot claim the same operation', async (t) => {
  const f = await fixture(t); const second = f.open(); const { id } = f.store.enqueue(op(), monday);
  f.store.claim(id, claimOptions()); assert.throws(() => second.claim(id, claimOptions()), /already attempted/);
});
test('two connections cannot consume two publishing slots on one weekday', async (t) => {
  const f = await fixture(t); const second = f.open(); const first = f.store.enqueue(op(), monday);
  const another = second.enqueue(op('Different approved caption'), monday);
  f.store.claim(first.id, claimOptions()); assert.throws(() => second.claim(another.id, claimOptions()), /slot already/);
  assert.equal(second.get(another.id).status, 'queued');
});
test('unknown outcome is never retried even on a later day', async (t) => {
  const f = await fixture(t); const { id } = f.store.enqueue(op(), monday); const attempt = f.store.claim(id, claimOptions());
  f.store.uncertain(id, attempt.token, 'Connection closed before receipt', monday + 1000);
  assert.throws(() => f.store.claim(id, claimOptions(monday + 86400000)), /already attempted/);
  assert.equal(f.store.enqueue(op(), monday + 86400000).id, id);
});
test('crash recovery makes timed-out attempt unknown without requeueing', async (t) => {
  const f = await fixture(t); const { id } = f.store.enqueue(op(), monday); f.store.claim(id, claimOptions()); f.store.close();
  const reopened = f.open(); assert.deepEqual(reopened.recover(monday + 600001), [id]);
  assert.equal(reopened.get(id).status, 'unknown'); assert.throws(() => reopened.claim(id, claimOptions(monday + 86400000)), /already attempted/);
});
test('same content with a new review revision remains the same operation', async (t) => {
  const f = await fixture(t); const first = f.store.enqueue(op(), monday); const revised = op();
  revised.content.revision = 2; revised.content.manifestDigest = 'c'.repeat(64);
  const duplicate = f.store.enqueue(revised, monday + 1000);
  assert.equal(duplicate.id, first.id); assert.equal(duplicate.duplicate, true);
});
test('wrong attempt or receipt target/body never confirms', async (t) => {
  const f = await fixture(t); const operation = op(); const { id } = f.store.enqueue(operation, monday); const attempt = f.store.claim(id, claimOptions());
  assert.throws(() => f.store.confirm(id, 'wrong-token', receipt(operation), monday + 1000), /Wrong attempt/);
  for (const patch of [{ target: 'unapproved' }, { bodyDigest: 'd'.repeat(64) }, { verification: 'guessed' }]) {
    assert.throws(() => f.store.confirm(id, attempt.token, { ...receipt(operation), ...patch }, monday + 1000), /receipt required/);
  }
  assert.equal(f.store.get(id).status, 'inflight');
});
test('confirmed receipt is immutable but exact confirmation replay is idempotent', async (t) => {
  const f = await fixture(t); const operation = op(); const { id } = f.store.enqueue(operation, monday); const attempt = f.store.claim(id, claimOptions());
  const proof = receipt(operation); f.store.confirm(id, attempt.token, proof, monday + 1000);
  assert.equal(f.store.confirm(id, attempt.token, proof, monday + 2000).status, 'confirmed');
  assert.throws(() => f.store.confirm(id, attempt.token, { ...proof, externalId: 'another-post' }, monday + 2000), /cannot change/);
});
test('malformed, pre-attempt and future observation times fail closed', async (t) => {
  const f = await fixture(t); const operation = op(); const { id } = f.store.enqueue(operation, monday); const attempt = f.store.claim(id, claimOptions());
  for (const time of ['not-a-date', '', null, new Date(monday - 1).toISOString(), new Date(monday + 5000).toISOString()]) {
    assert.throws(() => f.store.confirm(id, attempt.token, receipt(operation, time), monday + 1000));
  }
  assert.equal(f.store.get(id).status, 'inflight');
});
test('receipt platform must match the selected publishing platform', async (t) => {
  const f = await fixture(t); const operation = op(); const { id } = f.store.enqueue(operation, monday); const attempt = f.store.claim(id, claimOptions());
  assert.throws(() => f.store.confirm(id, attempt.token, { ...receipt(operation), url: 'https://www.instagram.com/post123' }, monday + 1000));
});
test('weekend cadence uses New York day, not UTC day', async (t) => {
  const f = await fixture(t); const { id } = f.store.enqueue(op(), monday);
  assert.throws(() => f.store.claim(id, claimOptions(Date.parse('2026-10-19T01:00:00Z'))), /weekday/); // Sunday evening in NY
  assert.equal(f.store.claim(id, claimOptions(monday)).id, id);
});
test('Instagram and Facebook have independent weekday slots', async (t) => {
  const f = await fixture(t); const fb = f.store.enqueue(op(), monday); const ig = f.store.enqueue(op(undefined, 'instagram'), monday);
  assert.equal(f.store.claim(fb.id, claimOptions()).id, fb.id); assert.equal(f.store.claim(ig.id, claimOptions()).id, ig.id);
});
test('claim needs successful exact creative quality context, not just a claimed digest', async (t) => {
  const f = await fixture(t); const { id } = f.store.enqueue(op(), monday);
  assert.throws(() => f.store.claim(id, { now: monday, manifestDigest }));
  assert.throws(() => f.store.claim(id, { ...claimOptions(), quality: { ...quality, ok: false } }));
  assert.throws(() => f.store.claim(id, { ...claimOptions(), quality: { ...quality, manifestDigest: 'f'.repeat(64) } }));
});
test('invalid recovery clocks and negative timeouts fail instead of silently ignoring attempts', async (t) => {
  const f = await fixture(t); assert.throws(() => f.store.recover('invalid')); assert.throws(() => f.store.recover(monday, -1));
});
test('stale, future or changed-byte quality result cannot consume a publishing slot', async (t) => {
  const f = await fixture(t); const { id } = f.store.enqueue(op(), monday);
  for (const patch of [{ validatedAt: monday - 60001 }, { validatedAt: monday + 1 }, { assets: [{ id: 'main', sha256: 'f'.repeat(64), bytes: 12 }] }, { assets: [] }]) {
    assert.throws(() => f.store.claim(id, { ...claimOptions(), quality: { ...claimOptions().quality, ...patch } }), /quality validation/);
  }
  assert.equal(f.store.get(id).status, 'queued');
  assert.equal(f.store.claim(id, claimOptions()).id, id);
});
test('quality asset order must match the actual carousel order', async (t) => {
  const f = await fixture(t); const operation = op(); const second = 'c'.repeat(64); operation.content.assetHashes.push(second);
  const { id } = f.store.enqueue(operation, monday);
  const assets = [{ id: 'second', sha256: second, bytes: 5 }, { id: 'first', sha256: hash, bytes: 12 }];
  assert.throws(() => f.store.claim(id, { ...claimOptions(), quality: { ...claimOptions().quality, assets } }), /quality validation/);
});
test('external receipt ID must be a real nonempty string', async (t) => {
  const f = await fixture(t); const operation = op(); const { id } = f.store.enqueue(operation, monday); const attempt = f.store.claim(id, claimOptions());
  for (const externalId of [{ id: '123' }, 123, '', '   ']) assert.throws(() => f.store.confirm(id, attempt.token, { ...receipt(operation), externalId }, monday + 1000), /receipt required/);
});
test('finite canonical JSON rejects ambiguous values before durable insertion', async (t) => {
  const f = await fixture(t); const cycle = {}; cycle.self = cycle;
  for (const value of [undefined, NaN, Infinity, { missing: undefined }, [undefined], new Array(1), cycle, new Date()]) {
    assert.throws(() => canonical(value), /Finite JSON/);
    assert.throws(() => f.store.observe('bad-fixture', value, monday));
  }
  assert.deepEqual(f.store.report().observations, []);
});
test('pause operations require approved scope and concrete reason/decision strings', async (t) => {
  const f = await fixture(t); const pause = { kind: 'pause_campaign', platform: 'meta', target: TARGETS.campaign, content: { accountId: TARGETS.adAccount, reason: 'Approved test expired', decisionId: 'decision-123' } };
  for (const patch of [{ reason: {} }, { decisionId: 1 }, { reason: ' ' }, { accountId: 'another-account' }]) assert.throws(() => f.store.enqueue({ ...pause, content: { ...pause.content, ...patch } }, monday));
  const queued = f.store.enqueue(pause, monday); assert.equal(f.store.claim(queued.id, { now: monday }).body.kind, 'pause_campaign');
});
test('unapproved ports cannot masquerade as a product or platform URL', async (t) => {
  const f = await fixture(t); const bad = op(); bad.content.destinationUrl = 'https://jobvance.io:8443/loop'; assert.throws(() => f.store.enqueue(bad, monday), /destination/);
  const operation = op(); const { id } = f.store.enqueue(operation, monday); const attempt = f.store.claim(id, claimOptions());
  assert.throws(() => f.store.confirm(id, attempt.token, { ...receipt(operation), url: 'https://www.facebook.com:8443/post123' }, monday + 1000), /receipt URL/);
});
