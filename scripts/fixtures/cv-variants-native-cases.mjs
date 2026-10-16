import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Actual SQL in separate native sessions, using only disposable created owners.
// No hosted service, model, worker, document generation or candidate data.
export async function cvVariantsNativeCases({ observer, actor, check, blocking, quote }) {
  const json = value => `${quote(JSON.stringify(value))}::jsonb`;
  const profile = {
    audience: 'professional', name: 'Native Example', contactLine: '', targetTitles: ['Analyst'], locations: ['Remote'],
    experienceYears: null, languages: ['English'], pageTarget: 1, discreetSearch: true,
    sourceText: 'Native Example\nEXPERIENCE\nExample Group\nHelped prepare an operations tracker covering six workstreams.\nEducation: Business studies.',
    excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null },
  };
  const fact = { id: 'fact-1', revision: 1, status: 'active', confirmed: true, shareable: true,
    sourceKind: 'cv_passage', sourceQuote: 'Helped prepare an operations tracker covering six workstreams.',
    phrasing: 'Helped prepare an operations tracker covering six workstreams.', context: 'Example Group',
    kind: 'employment', resultStatus: 'not_measured', createdAt: '2026-10-17T00:00:00Z' };
  async function setup() {
    const owner = randomUUID();
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(owner)});`);
    const opened = await observer.json(`SELECT job_loop_open_record(${quote(owner)});`);
    const data = { profile: { ...profile, revision: 1 }, claims: [fact], opportunities: [], inbox: [] };
    const record = await observer.json(`SELECT job_loop_write_record(${quote(owner)},${opened.version},${json(data)},true);`);
    return { owner, generation: opened.lifecycle_generation, record, request: randomUUID() };
  }
  const server = (name, f) => actor(name, f.owner, 'service_role');
  const read = f => observer.json(`SELECT to_jsonb(r) FROM public.job_loop_records r WHERE user_id=${quote(f.owner)};`);
  const counts = f => observer.json(`SELECT jsonb_build_object('variants',(SELECT count(*) FROM jobvance_private.loop_cv_variants WHERE user_id=${quote(f.owner)}),'requests',(SELECT count(*) FROM jobvance_private.loop_cv_variant_requests WHERE user_id=${quote(f.owner)}));`);
  const stored = (f, id) => observer.json(`SELECT snapshot FROM jobvance_private.loop_cv_variants WHERE user_id=${quote(f.owner)} AND id=${quote(id)};`);
  const save = (f, options = {}) => {
    const { expected = f.record.version, request = f.request, variant = null, revision = 0,
      label = 'Operations', source = profile, refs = [{ id: fact.id, revision: fact.revision }] } = options;
    return `SELECT public.job_loop_save_cv_variant_bound(${quote(f.owner)},${f.generation},${expected},${quote(request)},${variant ? quote(variant) : 'NULL'},${revision},${quote(label)},${json(source)},${json(refs)},true);`;
  };
  const write = (f, data, expected = f.record.version) => `SELECT job_loop_write_record(${quote(f.owner)},${expected},${json(data)},true);`;
  const rejected = (promise, code) => promise.then(() => false, error => error.message.includes(code));
  const detail = (first, second, blockingPids) => ({ distinctBackendPids: [first.pid, second.pid], blockingPids });

  await check('simultaneous identical saves create one variant and one receipt without altering source input', async () => {
    const f = await setup(), first = await server('variant-first', f), duplicate = await server('variant-duplicate', f);
    await first.query('BEGIN;');
    const winner = await first.json(save(f));
    const pending = duplicate.json(save(f)), blocked = await blocking(duplicate, first);
    assert.deepEqual(await counts(f), { variants: 0, requests: 0 });
    assert.deepEqual(await read(f), f.record);
    await first.query('COMMIT;');
    const retry = await pending;
    assert.deepEqual(retry, { ...winner, reused: true });
    assert.deepEqual(await counts(f), { variants: 1, requests: 1 });
    const record = await read(f);
    assert.equal(record.version, f.record.version + 1); assert.equal(record.input_version, f.record.input_version);
    assert.deepEqual(record.data, f.record.data);
    assert.deepEqual(winner.variant.profile, profile); assert.deepEqual(winner.variant.claims, [fact]);
    await first.end(); await duplicate.end();
    return detail(first, duplicate, blocked);
  });

  await check('same request with a conflicting payload waits then rejects without a second write', async () => {
    const f = await setup(), first = await server('variant-conflict-winner', f), conflict = await server('variant-conflict-loser', f);
    await first.query('BEGIN;'); const winner = await first.json(save(f));
    const pending = rejected(conflict.query(save(f, { label: 'Changed label' })), 'LOOP_REQUEST_CONFLICT');
    const blocked = await blocking(conflict, first);
    await first.query('COMMIT;'); assert.equal(await pending, true);
    assert.deepEqual(await counts(f), { variants: 1, requests: 1 });
    assert.deepEqual(await stored(f, winner.variant.id), winner.variant);
    assert.equal((await read(f)).version, winner.recordVersion);
    await first.end(); await conflict.end();
    return detail(first, conflict, blocked);
  });

  await check('competing final-slot saves serialize and a fourth variant cannot bypass the cap', async () => {
    const f = await setup(), seed = await server('variant-cap-seed', f);
    for (let i = 0; i < 2; i++) {
      const saved = await seed.json(save(f, { expected: (await read(f)).version, request: randomUUID(), label: `Existing ${i + 1}` }));
      assert.equal(saved.variant.revision, 1);
    }
    const before = await read(f), first = await server('variant-third', f), second = await server('variant-fourth-concurrent', f);
    const nextRequest = randomUUID();
    await first.query('BEGIN;'); const winner = await first.json(save(f, { expected: before.version, request: randomUUID(), label: 'Third' }));
    const pending = rejected(second.query(save(f, { expected: before.version, request: nextRequest, label: 'Fourth' })), 'LOOP_VERSION_CONFLICT');
    const blocked = await blocking(second, first);
    await first.query('COMMIT;'); assert.equal(await pending, true);
    const retry = await server('variant-fourth-fresh-version', f);
    assert.equal(await rejected(retry.query(save(f, { expected: winner.recordVersion, request: nextRequest, label: 'Fourth' })), 'LOOP_VARIANT_LIMIT'), true);
    assert.deepEqual(await counts(f), { variants: 3, requests: 3 });
    assert.equal((await read(f)).version, winner.recordVersion);
    await seed.end(); await first.end(); await second.end(); await retry.end();
    return { ...detail(first, second, blocked), variantsAfterCompetingWrites: 3, freshRetryRejected: 'LOOP_VARIANT_LIMIT' };
  });

  await check('competing updates preserve the winning revision and reject stale revision even with fresh record version', async () => {
    const f = await setup(), first = await server('variant-update-winner', f);
    const initial = await first.json(save(f));
    const second = await server('variant-update-stale', f);
    const shared = { variant: initial.variant.id, revision: 1, expected: initial.recordVersion };
    await first.query('BEGIN;');
    const winner = await first.json(save(f, { ...shared, request: randomUUID(), label: 'Current update' }));
    const pending = rejected(second.query(save(f, { ...shared, request: randomUUID(), label: 'Stale update' })), 'LOOP_VERSION_CONFLICT');
    const blocked = await blocking(second, first);
    await first.query('COMMIT;'); assert.equal(await pending, true);
    const stale = await server('variant-update-old-revision', f);
    assert.equal(await rejected(stale.query(save(f, { ...shared, expected: winner.recordVersion, request: randomUUID(), label: 'Stale update' })), 'LOOP_VARIANT_REVISION_CONFLICT'), true);
    assert.equal(winner.variant.revision, 2); assert.equal(winner.savedRevision, 2);
    assert.deepEqual(await stored(f, initial.variant.id), winner.variant);
    assert.deepEqual(await counts(f), { variants: 1, requests: 2 });
    // The original exact retry returns current progress, not its old snapshot.
    const original = await first.json(save(f));
    assert.equal(original.reused, true); assert.equal(original.savedRevision, 1);
    assert.equal(original.variant.revision, 2); assert.equal(original.variant.label, 'Current update');
    await first.end(); await second.end(); await stale.end();
    return detail(first, second, blocked);
  });

  await check('source claim edit winning first fences old record and old confirmed-claim references', async () => {
    const f = await setup(), editor = await server('variant-claim-edit', f), saver = await server('variant-after-claim-edit', f);
    const data = structuredClone(f.record.data);
    data.claims[0].revision = 2; data.claims[0].shareable = false;
    await editor.query('BEGIN;'); const changed = await editor.json(write(f, data));
    const pending = rejected(saver.query(save(f)), 'LOOP_VERSION_CONFLICT'), blocked = await blocking(saver, editor);
    await editor.query('COMMIT;'); assert.equal(await pending, true);
    const retry = await server('variant-stale-claim-fresh-version', f);
    assert.equal(await rejected(retry.query(save(f, { expected: changed.version, request: randomUUID() })), 'LOOP_VARIANT_CLAIM_UNAVAILABLE'), true);
    assert.deepEqual(await counts(f), { variants: 0, requests: 0 });
    assert.deepEqual(await read(f), changed);
    await editor.end(); await saver.end(); await retry.end();
    return detail(editor, saver, blocked);
  });

  await check('save winning first freezes its source snapshot while later source edits remain independent', async () => {
    const f = await setup(), saver = await server('variant-before-source-edit', f), editor = await server('variant-later-source-edit', f);
    await saver.query('BEGIN;'); const saved = await saver.json(save(f));
    const data = structuredClone(f.record.data);
    data.profile.sourceText += '\nLater unrelated detail.'; data.profile.revision = 2;
    data.claims[0].revision = 2; data.claims[0].confirmed = false;
    // The expected version is intentionally the version returned by the save.
    // This models a later valid source edit queued behind the saving transaction.
    const pending = editor.json(write(f, data, saved.recordVersion)), blocked = await blocking(editor, saver);
    await saver.query('COMMIT;'); const changed = await pending;
    assert.deepEqual(await stored(f, saved.variant.id), saved.variant);
    assert.deepEqual(saved.variant.claims, [fact]); assert.deepEqual(saved.variant.profile, profile);
    assert.equal(changed.data.claims[0].confirmed, false); assert.equal(changed.data.profile.revision, 2);
    assert.deepEqual(await read(f), changed);
    await saver.end(); await editor.end();
    return detail(saver, editor, blocked);
  });

  await check('erasure winning before save rejects old intent and removes all variant receipts at finish', async () => {
    const f = await setup(), eraser = await server('variant-erasure-first', f), saver = await server('variant-save-after-erase', f);
    const initial = await eraser.json(save(f));
    await eraser.query('BEGIN;');
    const erase = await eraser.json(`SELECT job_loop_begin_erase(${quote(f.owner)},${f.generation});`);
    const pending = rejected(saver.query(save(f, { expected: initial.recordVersion, request: randomUUID(), label: 'Too late' })), 'LOOP_REQUEST_STALE');
    const blocked = await blocking(saver, eraser);
    await eraser.query('COMMIT;'); assert.equal(await pending, true);
    await eraser.query(`SELECT job_loop_finish_erase(${quote(f.owner)},${erase.generation});`);
    assert.deepEqual(await counts(f), { variants: 0, requests: 0 });
    const fresh = await eraser.json(`SELECT job_loop_open_record(${quote(f.owner)});`);
    assert(fresh.lifecycle_generation > f.generation);
    const stale = await server('variant-old-after-reopen', f);
    assert.equal(await rejected(stale.query(save(f)), 'LOOP_REQUEST_STALE'), true);
    assert.deepEqual(await counts(f), { variants: 0, requests: 0 });
    await eraser.end(); await saver.end(); await stale.end();
    return { ...detail(eraser, saver, blocked), originalGeneration: f.generation, freshGeneration: fresh.lifecycle_generation };
  });

  await check('save winning before erasure completes atomically then cannot survive the erase cascade', async () => {
    const f = await setup(), saver = await server('variant-save-before-erase', f), eraser = await server('variant-erase-after-save', f);
    await saver.query('BEGIN;'); const saved = await saver.json(save(f));
    const pending = eraser.json(`SELECT job_loop_begin_erase(${quote(f.owner)},${f.generation});`);
    const blocked = await blocking(eraser, saver);
    await saver.query('COMMIT;'); const erase = await pending;
    assert.deepEqual(await counts(f), { variants: 1, requests: 1 });
    assert.deepEqual(await stored(f, saved.variant.id), saved.variant);
    const stale = await server('variant-retry-during-erase', f);
    assert.equal(await rejected(stale.query(save(f)), 'LOOP_REQUEST_STALE'), true);
    await eraser.query(`SELECT job_loop_finish_erase(${quote(f.owner)},${erase.generation});`);
    assert.deepEqual(await counts(f), { variants: 0, requests: 0 });
    assert.equal(await observer.json(`SELECT to_json(count(*)) FROM public.job_loop_records WHERE user_id=${quote(f.owner)};`), 0);
    await saver.end(); await eraser.end(); await stale.end();
    return detail(saver, eraser, blocked);
  });

  await check('finish cascade blocks an old save and never restores variants or their source record', async () => {
    const f = await setup(), finisher = await server('variant-finish-cascade', f), saver = await server('variant-save-during-finish', f);
    await finisher.json(save(f));
    const erase = await finisher.json(`SELECT job_loop_begin_erase(${quote(f.owner)},${f.generation});`);
    await finisher.query(`BEGIN; SELECT job_loop_finish_erase(${quote(f.owner)},${erase.generation});`);
    // Other connections still see the pre-commit rows, proving transaction scope.
    assert.deepEqual(await counts(f), { variants: 1, requests: 1 });
    const pending = rejected(saver.query(save(f)), 'LOOP_REQUEST_STALE'), blocked = await blocking(saver, finisher);
    await finisher.query('COMMIT;'); assert.equal(await pending, true);
    assert.deepEqual(await counts(f), { variants: 0, requests: 0 });
    assert.equal(await observer.json(`SELECT to_json(count(*)) FROM public.job_loop_records WHERE user_id=${quote(f.owner)};`), 0);
    await finisher.end(); await saver.end();
    return detail(finisher, saver, blocked);
  });
}
