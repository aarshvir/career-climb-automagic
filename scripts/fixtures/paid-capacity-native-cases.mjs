import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Actual SQL and Storage metadata in an isolated database. No provider calls,
// customer records, real charges or hosted Storage bytes are involved.
export async function paidCapacityNativeCases({ observer, check, quote, actor, blocking }) {
  const hash = 'a'.repeat(64);
  await observer.query(`CREATE OR REPLACE FUNCTION public.paid_capacity_test_rejected(p_sql text,p_code text) RETURNS boolean LANGUAGE plpgsql AS $test$ BEGIN EXECUTE p_sql; RETURN false; EXCEPTION WHEN OTHERS THEN IF position(p_code in SQLERRM)>0 THEN RETURN true; END IF; RAISE; END $test$;`);
  const rejectSql = (sql, code) => observer.json('SELECT to_json(public.paid_capacity_test_rejected(' + quote(sql) + ',' + quote(code) + '));');
  const rejected = async (promise, code) => { try { await promise; return false; } catch (e) { if (!String(e.message).includes(code)) throw e; return true; } };
  async function account() {
    const user = randomUUID(), session = randomUUID(), request = randomUUID(), suffix = user.replaceAll('-', '');
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(user)}); INSERT INTO auth.sessions(id,user_id) VALUES(${quote(session)},${quote(user)}); SELECT job_loop_open_record(${quote(user)});`);
    const times = await observer.json("SELECT json_build_object('start',now()-interval '1 day','end',now()+interval '29 days');");
    return { user, session, request, checkout: 'cks_' + suffix, subscription: 'sub_' + suffix, customer: 'cus_' + suffix, ...times };
  }
  async function reset() { await observer.query('TRUNCATE auth.users CASCADE; TRUNCATE jobvance_private.loop_billing_events; TRUNCATE storage.objects;'); }
  const claim = f => `SELECT job_loop_billing_checkout_claim(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},'live','weekly','pdt_0Nq0BYq7BdjAS4guEjnZR');`;
  const finish = f => `SELECT job_loop_billing_checkout_finalize(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},${quote(f.checkout)},${quote('https://checkout.dodopayments.com/session/' + f.checkout)});`;
  const event = f => `SELECT job_loop_billing_apply_event(${quote(f.user)},${quote(f.request)},'live','weekly','pdt_0Nq0BYq7BdjAS4guEjnZR',${quote(f.checkout)},${quote(f.subscription)},${quote(f.customer)},'active',${quote(f.start)},${quote(f.end)},false,${quote('evt_' + f.request)},1,false,${quote(hash)},${quote('pay_' + f.request.replaceAll('-', ''))},2900);`;
  const entitlement = f => observer.json(`SELECT job_loop_billing_entitlement(${quote(f.user)});`);
  async function paid(f) { await observer.query(claim(f)); await observer.query(finish(f)); await observer.query(event(f)); }
  async function reserve(n) {
    const users = Array.from({ length: n }, () => randomUUID());
    if (!n) return users;
    const array = `ARRAY[${users.map(quote).join(',')}]::uuid[]`;
    await observer.query(`INSERT INTO auth.users(id) SELECT unnest(${array}); INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id,state,capacity_until) SELECT id,gen_random_uuid(),'live','weekly','pdt_0Nq0BYq7BdjAS4guEjnZR','ready',now()+interval '96 hours' FROM auth.users WHERE id=ANY(${array});`);
    return users;
  }
  async function pilots(n) { for (let i = 0; i < n; i++) { const f = await account(); await observer.query(`SELECT job_loop_enroll_pilot(${quote(f.user)});`); } }
  async function leased(f) {
    const run = randomUUID(), lease = randomUUID(), packet = randomUUID();
    await observer.query(`INSERT INTO job_loop_runs(id,user_id,request_id,request_hash,input_hash,input_version,snapshot,provider,model,consents,status,lease_token,lease_until) SELECT ${quote(run)},user_id,gen_random_uuid(),${quote(hash)},${quote(hash)},input_version,data,'rules','grounded-rules-v1','{}','running',${quote(lease)},now()+interval '5 minutes' FROM job_loop_records WHERE user_id=${quote(f.user)};`);
    return { ...f, run, lease, packet, path: `${f.user}/${packet}/${hash}/txt` };
  }
  const authorize = f => `SELECT to_json(job_loop_authorize_artifact(${quote(f.user)},${quote(f.run)},${quote(f.lease)},${quote(f.packet)},${quote(hash)},'txt'));`;
  const store = f => `INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',${quote(f.path)});`;

  await check('100 paid reservations are independent of the ten free pilot places', async () => {
    await reset(); await pilots(10); await reserve(99); const f = await account(), g = await account();
    assert.equal((await observer.json(claim(f))).creationClaimAcquired, true);
    assert.equal((await observer.json(claim(f))).creationClaimAcquired, false);
    assert.equal(await rejectSql(claim(g), 'LOOP_PILOT_FULL'), true);
    assert.equal(await observer.json('SELECT to_json(count(*)) FROM jobvance_private.loop_billing_orders WHERE capacity_until>now();'), 100);
    return { paidPlaces: 100, freePilotPlaces: 10, nextPaidOwnerRejected: true, originalRetryPreserved: true };
  });
  await check('paid occupancy does not consume free pilot places or let a pilot bypass full paid capacity', async () => {
    await reset(); await reserve(100); await pilots(10); const f = await account();
    assert.equal(await rejectSql(`SELECT job_loop_enroll_pilot(${quote(f.user)});`, 'LOOP_PILOT_FULL'), true);
    const user = await observer.json('SELECT to_json(user_id) FROM job_loop_pilot_users LIMIT 1;'), session = randomUUID();
    await observer.query(`INSERT INTO auth.sessions(id,user_id) VALUES(${quote(session)},${quote(user)});`);
    assert.equal(await rejectSql(claim({ ...f, user, session }), 'LOOP_PILOT_FULL'), true);
    return { freePilotBoundedAt: 10, freeAndPaidPoolsIndependent: true };
  });
  await check('reservations count distinct live owners and expired or failed attempts release capacity', async () => {
    await reset(); const users = await reserve(100), f = await account();
    await observer.query(`UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 second' WHERE user_id=${quote(users[0])};`);
    assert.equal((await observer.json(claim(f))).creationClaimAcquired, true);
    await observer.query(`INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id,state,capacity_until) VALUES(${quote(f.user)},gen_random_uuid(),'live','weekly','pdt_other','ready',now()+interval '96 hours'); UPDATE jobvance_private.loop_billing_orders SET state='failed' WHERE user_id=${quote(users[1])};`);
    const g = await account(); assert.equal((await observer.json(claim(g))).creationClaimAcquired, true);
    return { deduplicatesOwners: true, finiteReservations: true, failedReservationReleased: true };
  });
  await check('Test Mode reservations do not occupy live paid capacity', async () => {
    await reset(); await reserve(100); await observer.query("UPDATE jobvance_private.loop_billing_orders SET mode='test';");
    const f = await account(); assert.equal((await observer.json(claim(f))).creationClaimAcquired, true);
    return { testLiveIsolation: true };
  });
  await check('100 live paid accounts still occupy capacity after their checkout reservations expire', async () => {
    await reset(); const users = await reserve(100);
    await observer.query("UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 day'; INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created) SELECT 'sub_'||replace(user_id::text,'-',''),user_id,request_id,'live','weekly','cus_fixture','active',now()+interval '29 days',1 FROM jobvance_private.loop_billing_orders;");
    const f = await account(); assert.equal(await rejectSql(claim(f), 'LOOP_PILOT_FULL'), true);
    await observer.query(`SELECT job_loop_billing_assert_capacity(${quote(users[0])}); UPDATE jobvance_private.loop_subscriptions SET revoked=true WHERE user_id=${quote(users[0])};`);
    assert.equal((await observer.json(claim(f))).creationClaimAcquired, true);
    return { currentPaidAccountsCounted: 100, currentOwnerRetained: true, revokedPlaceReleased: true };
  });
  await check('paid-through cancellation and live grace retain a place, expired grace and old generations do not', async () => {
    await reset(); const users = await reserve(99), f = await account(); await paid(f);
    await observer.query(`UPDATE jobvance_private.loop_subscriptions SET status='cancelled',cancel_at_period_end=true WHERE user_id=${quote(f.user)}; UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 second' WHERE user_id=${quote(f.user)};`);
    const g = await account(); assert.equal(await rejectSql(claim(g), 'LOOP_PILOT_FULL'), true);
    await observer.query(`UPDATE jobvance_private.loop_subscriptions SET status='past_due',valid_until=now()-interval '1 day',grace_until=now()+interval '1 day' WHERE user_id=${quote(f.user)};`);
    assert.equal(await rejectSql(claim(g), 'LOOP_PILOT_FULL'), true);
    await observer.query(`UPDATE jobvance_private.loop_subscriptions SET grace_until=now()-interval '1 second' WHERE user_id=${quote(f.user)};`);
    assert.equal((await observer.json(claim(g))).creationClaimAcquired, true);
    await observer.query(`UPDATE jobvance_private.loop_billing_orders SET state='failed' WHERE user_id=${quote(users[0])}; UPDATE jobvance_private.loop_subscriptions SET status='active',valid_until=now()+interval '29 days',generation=999 WHERE user_id=${quote(f.user)};`);
    const h = await account(); assert.equal((await observer.json(claim(h))).creationClaimAcquired, true);
    return { cancellationAndGraceCounted: true, expiredGraceAndStaleLifecycleExcluded: true };
  });
  await check('a paid-only owner activates and writes a leased artifact when the free pilot is full', async () => {
    await reset(); await pilots(10); const f = await account(); await paid(f);
    assert.equal((await entitlement(f)).active, true);
    await observer.query(`SELECT job_loop_enroll_pilot(${quote(f.user)});`);
    assert.equal(await observer.json(`SELECT to_json(count(*)) FROM job_loop_pilot_users WHERE user_id=${quote(f.user)};`), 0);
    const budget = await observer.json(`SELECT job_loop_budget_snapshot(${quote(f.user)});`);
    assert.equal(budget.enrolled, true); assert.equal(budget.activeUsers, 10); assert.equal(budget.maxUsers, 10); assert.equal(Number(budget.capUsd), 50);
    const run = await leased(f); assert.equal(await observer.json(authorize(run)), run.path); await observer.query(store(run));
    assert.equal(await observer.json('SELECT to_json(count(*)) FROM storage.objects;'), 1);
    return { paidWithoutPilotMembership: true, fullPilotDoesNotBlockPaidUi: true, artifactGrantAndStorageTriggerPassed: true, monthlyAiCapUsd: 50 };
  });
  await check('artifact authority still rejects wrong owners, leases and current input revisions', async () => {
    await reset(); const f = await account(); await paid(f); const run = await leased(f), other = await account();
    assert.equal(await rejectSql(authorize({ ...run, user: other.user }), 'LOOP_LEASE_LOST'), true);
    assert.equal(await rejectSql(authorize({ ...run, lease: randomUUID() }), 'LOOP_LEASE_LOST'), true);
    await observer.query(`UPDATE job_loop_records SET input_version=input_version+1 WHERE user_id=${quote(f.user)};`);
    assert.equal(await rejectSql(authorize(run), 'LOOP_LEASE_LOST'), true);
    return { ownershipLeaseAndSourceFencesRetained: true };
  });
  await check('expired paid access cannot use an old artifact grant or regain free access', async () => {
    await reset(); const f = await account(); await paid(f); const run = await leased(f); await observer.query(authorize(run));
    await observer.query(`UPDATE jobvance_private.loop_subscriptions SET valid_until=now()-interval '1 second' WHERE user_id=${quote(f.user)};`);
    assert.equal((await entitlement(f)).active, false);
    assert.equal(await rejectSql(store(run), 'LOOP_ARTIFACT_UNAUTHORIZED'), true);
    assert.equal(await rejectSql(`SELECT job_loop_enroll_pilot(${quote(f.user)});`, 'LOOP_SUBSCRIPTION_REQUIRED'), true);
    return { expiredAccessAndPilotFallbackRejected: true };
  });
  await check('refunded paid access cannot use lingering active pilot membership to write artifacts', async () => {
    await reset(); const f = await account(); await observer.query(`SELECT job_loop_enroll_pilot(${quote(f.user)});`); await paid(f);
    const run = await leased(f); await observer.query(authorize(run));
    await observer.query(`UPDATE jobvance_private.loop_subscriptions SET revoked=true WHERE user_id=${quote(f.user)};`);
    assert.equal((await entitlement(f)).active, false);
    assert.equal((await observer.json(`SELECT job_loop_budget_snapshot(${quote(f.user)});`)).enrolled, false);
    assert.equal(await rejectSql(store(run), 'LOOP_ARTIFACT_UNAUTHORIZED'), true);
    assert.equal(await rejectSql(authorize({ ...run, packet: randomUUID() }), 'LOOP_LEASE_LOST'), true);
    return { refundRevocationOverridesPilotMembership: true };
  });
  await check('permanent path tombstones still reject paid artifact reuse', async () => {
    await reset(); const f = await account(); await paid(f); const run = await leased(f);
    await observer.query(`INSERT INTO job_loop_artifact_tombstones(path,user_id,generation,state,token,expires_at) VALUES(${quote(run.path)},${quote(f.user)},0,'claimed',gen_random_uuid(),now()+interval '1 hour');`);
    assert.equal(await rejectSql(authorize(run), 'LOOP_ARTIFACT_UNAUTHORIZED'), true);
    assert.equal(await rejectSql(store(run), 'LOOP_ARTIFACT_UNAUTHORIZED'), true);
    return { permanentGcFenceRetained: true };
  });
  await check('late paid fulfillment waits at 100 then replays safely after one place is released', async () => {
    await reset(); const f = await account(); await observer.query(claim(f)); await observer.query(finish(f));
    await observer.query(`UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 second' WHERE user_id=${quote(f.user)};`);
    const users = await reserve(100); assert.equal((await observer.json(event(f))).pendingFulfillment, true);
    await observer.query(`UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 second' WHERE user_id=${quote(users[0])};`);
    assert.equal((await observer.json(event(f))).duplicate, false); assert.equal((await entitlement(f)).active, true);
    assert.equal((await observer.json(event(f))).duplicate, true);
    return { pendingFulfillmentAndExactEventRecoveryPreserved: true };
  });
  await check('changed functions remain service-only and keep fixed search paths', async () => {
    const data = await observer.json(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'path',p.proconfig,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'))) FROM pg_proc p WHERE p.proname IN('job_loop_billing_assert_capacity','job_loop_enroll_pilot','job_loop_budget_snapshot','job_loop_authorize_artifact_pre_gc','job_loop_storage_write_guard');`);
    assert.equal(data.length, 5); for (const row of data) { assert.equal(row.definer, true); assert.deepEqual(row.path, ['search_path=""']); assert.equal(row.anon, false); assert.equal(row.authenticated, false); }
    return { checkedFunctions: 5, noBrowserExecution: true };
  });
  if (actor && blocking) {
    await check('two competing 100th paid checkouts serialize without overselling', async () => {
      await reset(); await reserve(99); const f = await account(), g = await account();
      const a = await actor('paid-100th', f.user, 'service_role'), b = await actor('paid-101st', g.user, 'service_role');
      await a.query('BEGIN;'); await a.query(claim(f));
      const pending = rejected(b.query(claim(g)), 'LOOP_PILOT_FULL'), held = await blocking(b, a);
      await a.query('COMMIT;'); assert.equal(await pending, true);
      await a.end(); await b.end(); return { backendPids: [a.pid, b.pid], observedBlockingPids: held };
    });
    await check('a rolled-back 100th reservation allows the waiting checkout to take its place', async () => {
      await reset(); await reserve(99); const f = await account(), g = await account();
      const a = await actor('paid-rollback', f.user, 'service_role'), b = await actor('paid-after-rollback', g.user, 'service_role');
      await a.query('BEGIN;'); await a.query(claim(f)); const pending = b.json(claim(g)), held = await blocking(b, a);
      await a.query('ROLLBACK;'); assert.equal((await pending).creationClaimAcquired, true);
      await a.end(); await b.end(); return { backendPids: [a.pid, b.pid], observedBlockingPids: held };
    });
  }
}
