import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Only the disposable native harness calls this module. Sources, owners and
// authentication are created fixtures; no worker or hosted service is invoked.
export async function selectedPreparationNativeCases({ observer, actor, check, blocking, quote }) {
  const hash = 'a'.repeat(64), consents = { model: false, inbox: false };
  const json = value => `${quote(JSON.stringify(value))}::jsonb`;
  const idsSql = ids => `ARRAY[${ids.map(quote).join(',')}]::uuid[]`;
  async function setup() {
    const owner = randomUUID(), ids = [randomUUID(), randomUUID(), randomUUID()];
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(owner)});`);
    const opened = await observer.json(`SELECT job_loop_open_record(${quote(owner)});`);
    const data = { profile: { name: 'Created native candidate', revision: 1 }, claims: [], inbox: [],
      opportunities: ids.map((id, index) => ({ id, title: `Created role ${index}`, company: 'Created employer',
        description: 'Created vacancy '.repeat(10), url: `https://example.invalid/${index}`,
        status: 'saved', verification: 'user_provided', source: 'manual', sourceKey: `manual:${id}`, contact: null })) };
    const record = await observer.json(`SELECT job_loop_write_record(${quote(owner)},${opened.version},${json(data)},true);`);
    return { owner, ids, record, generation: opened.lifecycle_generation, request: randomUUID() };
  }
  const server = (name, f) => actor(name, f.owner, 'service_role');
  const read = f => observer.json(`SELECT to_jsonb(r) FROM job_loop_records r WHERE user_id=${quote(f.owner)};`);
  const runs = f => observer.json(`SELECT to_json(count(*)) FROM job_loop_runs WHERE user_id=${quote(f.owner)};`);
  const start = (f, options = {}) => {
    const { request = f.request, selected = [f.ids[2], f.ids[0]], requestHash = hash, choices = consents } = options;
    return `SELECT job_loop_start_selected_run_bound(${quote(f.owner)},${f.generation},${quote(request)},${quote(requestHash)},${quote(hash)},${f.record.version},'rules','grounded-rules-v1',${json(choices)},${idsSql(selected)});`;
  };
  const write = (f, data, changesInput = true) => `SELECT job_loop_write_record(${quote(f.owner)},${f.record.version},${json(data)},${changesInput});`;
  const rejected = (promise, code) => promise.then(() => false, error => error.message.includes(code));
  const detail = (first, second, blockingPids) => ({ distinctBackendPids: [first.pid, second.pid], blockingPids });

  await check('simultaneous exact requests admit one ordered immutable run', async () => {
    const f = await setup(), first = await server('selected-first', f), second = await server('selected-duplicate', f);
    await first.query('BEGIN;');
    const winner = await first.json(start(f)), pending = second.json(start(f));
    const blocked = await blocking(second, first);
    // A different connection must not see either half of admission before commit.
    assert.equal(await runs(f), 0);
    await first.query('COMMIT;');
    assert.deepEqual(await pending, winner);
    assert.deepEqual(winner.selected_opportunity_ids, [f.ids[2], f.ids[0]]);
    assert.equal(winner.selected_generation, f.generation);
    assert.deepEqual(winner.snapshot, f.record.data);
    assert.equal(await runs(f), 1);
    assert.deepEqual(await read(f), f.record);
    await first.end(); await second.end();
    return detail(first, second, blocked);
  });

  await check('conflicting concurrent request identity rejects order hash and consent substitutions', async () => {
    const f = await setup(), winner = await server('conflict-winner', f);
    await winner.json(start(f));
    const observed = [];
    for (const [name, options] of [
      ['order', { selected: [f.ids[0], f.ids[2]] }],
      ['hash', { requestHash: 'b'.repeat(64) }],
      ['consent', { choices: { model: true, inbox: false } }],
    ]) {
      await winner.query('BEGIN;'); await winner.json(start(f));
      const contender = await server(`conflict-${name}`, f);
      const pending = rejected(contender.query(start(f, options)), 'LOOP_REQUEST_CONFLICT');
      const blocked = await blocking(contender, winner);
      await winner.query('COMMIT;'); assert.equal(await pending, true, name);
      observed.push({ conflict: name, ...detail(winner, contender, blocked) });
      await contender.end();
    }
    assert.equal(await runs(f), 1); await winner.end();
    return { conflicts: observed };
  });

  await check('source edit winning first rejects admission with the original displayed version', async () => {
    const f = await setup(), editor = await server('source-edit-first', f), admission = await server('admit-after-edit', f);
    const changed = structuredClone(f.record.data); changed.opportunities[2].description = 'New vacancy wording '.repeat(10);
    await editor.query('BEGIN;'); const saved = await editor.json(write(f, changed));
    const pending = rejected(admission.query(start(f)), 'LOOP_VERSION_CONFLICT');
    const blocked = await blocking(admission, editor);
    await editor.query('COMMIT;'); assert.equal(await pending, true);
    assert.deepEqual(await read(f), saved); assert.equal(await runs(f), 0);
    await editor.end(); await admission.end();
    return detail(editor, admission, blocked);
  });

  await check('admission winning first retains immutable wording while a later source edit proceeds', async () => {
    const f = await setup(), admission = await server('admit-before-edit', f), editor = await server('source-edit-later', f);
    await admission.query('BEGIN;'); const run = await admission.json(start(f));
    const changed = structuredClone(f.record.data); changed.opportunities[2].title = 'Later title';
    const pending = editor.json(write(f, changed));
    const blocked = await blocking(editor, admission);
    await admission.query('COMMIT;'); const saved = await pending;
    assert.equal(saved.data.opportunities[2].title, 'Later title');
    const stored = await observer.json(`SELECT to_jsonb(r) FROM job_loop_runs r WHERE id=${quote(run.id)};`);
    assert.deepEqual(stored.snapshot, f.record.data);
    assert.deepEqual(stored.selected_opportunity_ids, [f.ids[2], f.ids[0]]);
    // The worker/control's separate source comparison must reject changed input;
    // this SQL test proves snapshot isolation, not worker execution.
    await admission.end(); await editor.end();
    return detail(admission, editor, blocked);
  });

  await check('ambiguous exact retry waits for later progress without replacing it or duplicating a run', async () => {
    const f = await setup(), editor = await server('progress-first', f), retry = await server('retry-progress', f);
    const run = await editor.json(start(f));
    const data = structuredClone(f.record.data);
    Object.assign(data.opportunities[2], { status: 'applied', notes: 'Keep independently updated progress' });
    await editor.query('BEGIN;'); const saved = await editor.json(write(f, data, false));
    const pending = retry.json(start(f)), blocked = await blocking(retry, editor);
    await editor.query('COMMIT;'); assert.deepEqual(await pending, run);
    assert.deepEqual(await read(f), saved); assert.equal(await runs(f), 1);
    await editor.end(); await retry.end();
    return detail(editor, retry, blocked);
  });

  await check('erasure winning first rejects old admission and old identity cannot enter a fresh generation', async () => {
    const f = await setup(), eraser = await server('erase-before-selected', f), admission = await server('selected-after-erase', f);
    await eraser.query('BEGIN;');
    const erase = await eraser.json(`SELECT job_loop_begin_erase(${quote(f.owner)},${f.generation});`);
    const pending = rejected(admission.query(start(f)), 'LOOP_REQUEST_STALE');
    const blocked = await blocking(admission, eraser);
    await eraser.query('COMMIT;'); assert.equal(await pending, true); assert.equal(await runs(f), 0);
    await eraser.query(`SELECT job_loop_finish_erase(${quote(f.owner)},${erase.generation});`);
    const fresh = await eraser.json(`SELECT job_loop_open_record(${quote(f.owner)});`);
    assert(fresh.lifecycle_generation > f.generation); assert.equal(fresh.data.opportunities.length, 0);
    const stale = await server('selected-old-after-reopen', f);
    assert.equal(await rejected(stale.query(start(f)), 'LOOP_REQUEST_STALE'), true);
    assert.equal(await runs(f), 0);
    await stale.end(); await eraser.end(); await admission.end();
    return { ...detail(eraser, admission, blocked), originalGeneration: f.generation, freshGeneration: fresh.lifecycle_generation };
  });

  await check('erasure waits for admitted selection then cancels it and rejects its old retry', async () => {
    const f = await setup(), admission = await server('selected-before-erase', f), eraser = await server('erase-after-selected', f);
    await admission.query('BEGIN;'); const run = await admission.json(start(f));
    const pending = eraser.json(`SELECT job_loop_begin_erase(${quote(f.owner)},${f.generation});`);
    const blocked = await blocking(eraser, admission);
    await admission.query('COMMIT;'); await pending;
    const stored = await observer.json(`SELECT to_jsonb(r) FROM job_loop_runs r WHERE id=${quote(run.id)};`);
    assert.equal(stored.status, 'cancelled');
    assert.equal(await rejected(admission.query(start(f)), 'LOOP_REQUEST_STALE'), true);
    await admission.end(); await eraser.end();
    return detail(admission, eraser, blocked);
  });

  await check('competing selected and wider discovery requests preserve the one-active-run gate', async () => {
    const f = await setup(), first = await server('active-selected', f);
    await first.json(start(f));
    const observed = [];
    for (const kind of ['selected', 'discovery']) {
      await first.query('BEGIN;'); await first.json(start(f));
      const second = await server(`competing-${kind}`, f);
      const sql = kind === 'selected' ? start(f, { request: randomUUID(), selected: [f.ids[1]] })
        : `SELECT job_loop_start_run_bound(${quote(f.owner)},${f.generation},${quote(randomUUID())},${quote(hash)},${quote(hash)},${f.record.version},'rules','grounded-rules-v1',${json(consents)});`;
      const pending = rejected(second.query(sql), 'LOOP_ACTIVE_RUN'), blocked = await blocking(second, first);
      await first.query('COMMIT;'); assert.equal(await pending, true);
      observed.push({ kind, ...detail(first, second, blocked) }); await second.end();
    }
    assert.equal(await runs(f), 1); await first.end();
    return { competitors: observed };
  });

  await check('concurrent admission cannot exceed daily quota even after the winner becomes terminal', async () => {
    const f = await setup(), first = await server('daily-winner', f), second = await server('daily-contender', f);
    for (let index = 0; index < 2; index++) {
      const run = await first.json(start(f, { request: randomUUID() }));
      await observer.query(`UPDATE job_loop_runs SET status='cancelled' WHERE id=${quote(run.id)};`);
    }
    await first.query('BEGIN;'); const final = await first.json(start(f));
    await first.query(`SELECT job_loop_run_action(${quote(f.owner)},${quote(final.id)},'cancel');`);
    const pending = rejected(second.query(start(f, { request: randomUUID() })), 'LOOP_DAILY_LIMIT');
    const blocked = await blocking(second, first);
    await first.query('COMMIT;'); assert.equal(await pending, true); assert.equal(await runs(f), 3);
    assert.equal(await observer.json('SELECT to_json(count(*)) FROM job_loop_usage;'), 0);
    assert.equal(await observer.json('SELECT to_json(enabled) FROM job_loop_gc_config;'), false);
    await first.end(); await second.end();
    return detail(first, second, blocked);
  });
}
