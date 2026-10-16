import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Executed only by the isolated PostgreSQL harness. No hosted credentials,
// network API, production user or provider call is available in these cases.
export async function checkLoopNativeCases({ observer, actor, check, blocking, quote, owner, other, newCheck }) {
  const input = { title: 'Native role', company: 'Native company', location: 'Dubai', url: 'https://example.test/job', description: 'x'.repeat(80), contact: null };
  let generation;
  async function current() { return observer.json(`SELECT to_jsonb(r) FROM job_loop_records r WHERE user_id=${quote(owner)};`); }
  async function open() {
    const row = await observer.json(`SELECT job_loop_open_record(${quote(owner)});`);
    generation = row.lifecycle_generation;
    return row;
  }
  const link = (source, expected, epoch = generation) => `SELECT job_loop_link_saved_check(${quote(owner)},${epoch},${expected},${quote(source)},${quote(JSON.stringify(input))}::jsonb,true);`;
  const server = name => actor(name, owner, 'service_role');
  await open();

  await check('two first links serialize to one opportunity and one record write', async () => {
    const source = await newCheck(), before = await current();
    const first = await server('link-first'), second = await server('link-second');
    await first.query('BEGIN;');
    const firstResult = await first.json(link(source, before.version));
    const pending = second.json(link(source, before.version));
    const blockingPids = await blocking(second, first);
    await first.query('COMMIT;');
    const secondResult = await pending;
    assert.equal(secondResult.opportunityId, firstResult.opportunityId);
    assert.equal(secondResult.reused, true);
    assert.equal(secondResult.record.version, firstResult.record.version);
    assert.equal((await current()).data.opportunities.filter(item => item.sourceCheckId === source).length, 1);
    await first.end(); await second.end();
    return { distinctBackendPids: [first.pid, second.pid], blockingPids };
  });
  await check('source deletion waits for link then retains independently saved Loop work', async () => {
    const source = await newCheck(), before = await current();
    const writer = await server('link-before-delete'), deleter = await actor('delete-after-link');
    await writer.query('BEGIN;');
    const result = await writer.json(link(source, before.version));
    const pending = deleter.query(`DELETE FROM cv_checks WHERE id=${quote(source)};`);
    const blockingPids = await blocking(deleter, writer);
    await writer.query('COMMIT;'); await pending;
    assert((await current()).data.opportunities.some(item => item.id === result.opportunityId));
    assert.equal(await observer.json(`SELECT to_json(count(*)) FROM cv_checks WHERE id=${quote(source)};`), 0);
    const retry = await writer.json(link(source, before.version));
    assert.equal(retry.opportunityId, result.opportunityId); assert.equal(retry.reused, true);
    await writer.end(); await deleter.end();
    return { distinctBackendPids: [writer.pid, deleter.pid], blockingPids };
  });
  await check('deletion winning first prevents link without recreating a check', async () => {
    const source = await newCheck(), before = await current();
    const deleter = await actor('delete-before-link'), writer = await server('link-after-delete');
    await deleter.query(`BEGIN; DELETE FROM cv_checks WHERE id=${quote(source)};`);
    const pending = writer.json(link(source, before.version)).then(() => false, error => /LOOP_CHECK_UNAVAILABLE/.test(error.message));
    const blockingPids = await blocking(writer, deleter);
    await deleter.query('COMMIT;'); assert.equal(await pending, true);
    assert.deepEqual(await current(), before);
    await deleter.end(); await writer.end();
    return { distinctBackendPids: [deleter.pid, writer.pid], blockingPids };
  });
  await check('a retry waits for progress editing and never overwrites the winning notes or status', async () => {
    const source = await newCheck(), before = await current();
    const writer = await server('progress-writer');
    const linked = await writer.json(link(source, before.version));
    const data = structuredClone(linked.record.data);
    Object.assign(data.opportunities.find(item => item.id === linked.opportunityId), { notes: 'Keep after concurrent retry', status: 'interview', followUpAt: '2026-10-20' });
    await writer.query('BEGIN;');
    const changed = await writer.json(`SELECT job_loop_write_record(${quote(owner)},${linked.record.version},${quote(JSON.stringify(data))}::jsonb,false);`);
    const retry = await server('progress-retry');
    const pending = retry.json(link(source, before.version));
    const blockingPids = await blocking(retry, writer);
    await writer.query('COMMIT;');
    assert.deepEqual((await pending).record, changed);
    await writer.end(); await retry.end();
    return { distinctBackendPids: [writer.pid, retry.pid], blockingPids };
  });
  await check('erasure winning the lifecycle lock rejects an old link and fresh generation does not adopt it', async () => {
    const source = await newCheck(), before = await current(), originalGeneration = generation;
    const eraser = await server('erase-first'), writer = await server('link-after-erase');
    await eraser.query('BEGIN;');
    const erase = await eraser.json(`SELECT job_loop_begin_erase(${quote(owner)},${generation});`);
    const pending = writer.json(link(source, before.version)).then(() => false, error => /LOOP_REQUEST_STALE/.test(error.message));
    const blockingPids = await blocking(writer, eraser);
    await eraser.query('COMMIT;'); assert.equal(await pending, true);
    await eraser.query(`SELECT job_loop_finish_erase(${quote(owner)},${erase.generation});`);
    const fresh = await open();
    assert.equal(fresh.data.opportunities.length, 0);
    const stale = await server('old-epoch-after-open');
    assert.equal(await stale.query(link(source, fresh.version, originalGeneration)).then(() => false, error => /LOOP_REQUEST_STALE/.test(error.message)), true);
    await stale.end(); await eraser.end(); await writer.end();
    return { distinctBackendPids: [eraser.pid, writer.pid], blockingPids };
  });
  await check('native browser/private-routine and cross-owner boundaries reject guessed identity', async () => {
    const source = await newCheck(), foreign = await newCheck(other), before = await current();
    const attempts = [
      ['anon-public', 'anon', link(source, before.version), /permission denied/],
      ['auth-public', 'authenticated', link(source, before.version), /permission denied/],
      ['auth-private', 'authenticated', link(source, before.version).replace('job_loop_link_saved_check', 'jobvance_private.link_saved_check_to_loop'), /permission denied/],
      ['server-foreign-check', 'service_role', link(foreign, before.version), /LOOP_CHECK_UNAVAILABLE/],
    ];
    for (const [name, role, sql, expected] of attempts) {
      const caller = await actor(name, owner, role);
      assert.equal(await caller.query(sql).then(() => false, error => expected.test(error.message)), true, name);
      await caller.end();
    }
    assert.deepEqual(await current(), before);
    return { rejectedAttempts: attempts.map(([name]) => name) };
  });
}
