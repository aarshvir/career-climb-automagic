// @vitest-environment node
// A live paid Job Loop subscriber who never joined the free pilot must be able to
// store the documents of a run they were admitted to, through the same lease,
// generation, tombstone, GC and input-version checks that already govern pilots.
// Actual migration SQL in PGlite; auth/storage are the repository's local fixtures.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { LoopRepository } from '../functions/_shared/job-loop-repository';
import { controlLoop, processLoopPhase } from '../functions/_shared/job-loop-runtime';

// Every migration after the check-loop fixture, in production order, through the
// latest deployed one. The fix is applied separately so the defect is reproduced.
const deployed = [
  '20261015223000_job_loop_selected_preparation.sql', '20261017013000_job_loop_cv_variants.sql',
  '20261017080000_job_loop_cv_variant_facts.sql', '20261017122000_job_loop_dodo_entitlements.sql',
  '20261017130000_job_loop_variant_execution.sql', '20261017131000_job_loop_recurring_product.sql',
  '20261018073501_job_loop_subscription_lifecycle.sql', '20261018091955_job_loop_refund_renewal_safety.sql',
  '20261018095409_job_loop_localized_price_quotes.sql', '20261018101948_job_loop_provider_accounting.sql',
  '20261018105918_job_loop_whole_currency_prices.sql', '20261018111136_job_loop_versioned_price_products.sql',
];
const fix = '20261020090000_job_loop_paid_artifact_authority.sql';
const hash = 'a'.repeat(64);
const career = { profile: { name: 'Paid artifact fixture' }, claims: [], opportunities: [], inbox: [] };
const source = (name: string) => readFile(new URL('../migrations/' + name, import.meta.url), 'utf8');
beforeAll(() => vi.stubGlobal('DOMParser', new JSDOM().window.DOMParser));

type Account = { user: string; session: string; generation: number; request?: string; quote?: Record<string, any>; period?: Record<string, any> };
type Run = { id: string; lease: string };

async function database(extra: string[] = []) {
  const db = new PGlite();
  await db.exec(await checkLoopSchema());
  await db.exec('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz)');
  for (const name of [...deployed, ...extra]) {
    try { await db.exec(await source(name)); } catch (error) { throw new Error(`${name}: ${(error as Error).message}`); }
  }
  const raw = (sql: string, args: unknown[] = []) => db.query<Record<string, any>>(sql, args);
  // Service-role RPC exactly as the edge handlers call it (named arguments).
  async function rpc(name: string, args: Record<string, unknown>) {
    await db.exec('SET ROLE service_role');
    try { return (await raw(`SELECT public.${name}(${Object.keys(args).map((key, index) => `${key}=>$${index + 1}`).join(',')}) r`, Object.values(args))).rows[0]?.r; }
    finally { await db.exec('RESET ROLE'); }
  }
  const times = async () => (await raw("SELECT (now()-interval '1 day')::text start,(now()+interval '29 days')::text end,extract(epoch FROM now())::bigint-100 epoch")).rows[0];
  async function account(): Promise<Account> {
    const user = randomUUID(), session = randomUUID();
    await raw('INSERT INTO auth.users(id) VALUES($1)', [user]);
    await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [session, user]);
    const opened = await rpc('job_loop_open_record', { p_user: user });
    await rpc('job_loop_write_record', { p_user: user, p_expected: opened.version, p_data: career, p_inputs_changed: true });
    return { user, session, generation: Number(opened.lifecycle_generation) };
  }
  // The current production purchase path: v3 quote, quoted checkout claim and a
  // provider-verified first payment carrying its exact paid service period.
  async function pay(owner: Account, plan = 'weekly') {
    const base = { p_user: owner.user, p_auth_session: owner.session, p_generation: owner.generation, p_request: randomUUID(), p_mode: 'live', p_plan: plan, p_country: 'US', p_currency: 'USD' };
    const catalog = (await rpc('job_loop_billing_quote_candidate', base)).catalog;
    const quote = await rpc('job_loop_billing_quote_issue', { ...base, p_catalog_version: catalog.catalogVersion, p_product: catalog.productId, p_rule: null, p_provider_revision: 'b'.repeat(64), p_preview_hash: 'c'.repeat(64), p_initial_amount: catalog.amountMinor, p_recurring_amount: catalog.amountMinor });
    const request = randomUUID(), suffix = owner.user.replaceAll('-', '');
    await rpc('job_loop_billing_checkout_claim_v2', { p_user: owner.user, p_auth_session: owner.session, p_generation: owner.generation, p_request: request, p_mode: 'live', p_plan: plan, p_product: quote.productId, p_quote: quote.quoteId });
    await rpc('job_loop_billing_checkout_finalize', { p_user: owner.user, p_auth_session: owner.session, p_generation: owner.generation, p_request: request, p_session: 'cks_' + suffix, p_url: 'https://checkout.dodopayments.com/session/cks_' + suffix });
    owner.request = request; owner.quote = quote; owner.period = await times();
    expect(await paymentEvent(owner, {})).toMatchObject({ duplicate: false });
    return owner;
  }
  // Later events for the same payment carry its immutable paid service period.
  async function paymentEvent(owner: Account, changes: Record<string, unknown>) {
    const t = owner.period!, suffix = owner.user.replaceAll('-', '');
    return rpc('job_loop_billing_apply_event_v2', { p_user: owner.user, p_request: owner.request, p_mode: 'live', p_plan: owner.quote!.plan, p_product: owner.quote!.productId, p_session: 'cks_' + suffix,
      p_subscription: 'sub_' + suffix, p_customer: 'cus_' + suffix, p_status: 'active', p_period_start: t.start, p_valid_until: t.end, p_cancel_at_period_end: false,
      p_event: 'evt_' + randomUUID(), p_created: Number(t.epoch), p_revoked: false, p_payload_hash: 'd'.repeat(64), p_payment: 'pay_' + suffix, p_paid_amount: owner.quote!.amountMinor,
      p_grace_until: null, p_quote: owner.quote!.quoteId, p_currency: owner.quote!.currency, ...changes });
  }
  // job_loop_enroll_pilot is not callable by service_role; production reaches it
  // only inside definer routines (run start, schedule save, reserve).
  const enrollPilot = (owner: Account) => raw('SELECT public.job_loop_enroll_pilot($1)', [owner.user]);
  async function start(owner: Account): Promise<Run> {
    const record = await rpc('job_loop_read_record', { p_user: owner.user, p_generation: owner.generation });
    const run = await rpc('job_loop_start_run_bound', { p_user: owner.user, p_generation: owner.generation, p_request: randomUUID(), p_request_hash: hash, p_input_hash: hash, p_expected: record.version, p_provider: 'rules', p_model: 'grounded-rules-v1', p_consents: {} });
    const lease = randomUUID();
    expect(await rpc('job_loop_claim_run', { p_run: run.id, p_lease: lease })).toMatchObject({ id: run.id, lease_token: lease });
    return { id: run.id, lease };
  }
  const authorize = (owner: Account, run: Run, packet = randomUUID(), lease = run.lease, key = 'txt', digest = hash) =>
    rpc('job_loop_authorize_artifact', { p_user: owner.user, p_run: run.id, p_lease: lease, p_packet: packet, p_hash: digest, p_key: key });
  // Supabase Storage inserts as its own role; the BEFORE triggers are the boundary.
  const store = (path: string) => raw("INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',$1)", [path]);
  const stored = async (path: string) => Number((await raw("SELECT count(*) n FROM storage.objects WHERE bucket_id='job-loop-artifacts' AND name=$1", [path])).rows[0].n);
  const pilotRow = async (owner: Account) => (await raw('SELECT active FROM public.job_loop_pilot_users WHERE user_id=$1', [owner.user])).rows[0]?.active ?? null;
  const entitlement = (owner: Account) => rpc('job_loop_billing_entitlement', { p_user: owner.user });
  return { db, raw, rpc, account, pay, paymentEvent, enrollPilot, start, authorize, store, stored, pilotRow, entitlement };
}
type Harness = Awaited<ReturnType<typeof database>>;

// Actual control, repository, worker, renderer and SQL. Only object bytes and the
// worker dispatch transport are local adapters; storage inserts still hit the guard.
function integratedRepository(db: PGlite) {
  const sql = async (q: string, a: unknown[] = []) => (await db.query<{ r: any }>(q, a)).rows[0]?.r;
  const admin: any = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      try { if (!/^job_loop_[a-z_]+$/.test(name)) throw Error(name); const keys = Object.keys(args); await db.exec('SET ROLE service_role'); try { return { data: await sql(`SELECT ${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')}) r`, Object.values(args)), error: null }; } finally { await db.exec('RESET ROLE'); } }
      catch (e) { return { data: null, error: { message: (e as Error).message } }; }
    },
    from: (table: string) => {
      let columns = '*', single = false, order = '', limit = ''; const conditions: string[] = [], values: unknown[] = [];
      if (!/^job_loop_[a-z_]+$/.test(table)) throw Error(table);
      const q: any = { select: (s: string) => { columns = s; return q; }, eq: (k: string, v: unknown) => { values.push(v); conditions.push(`${k}=$${values.length}`); return q; },
        in: (k: string, v: unknown[]) => { conditions.push(`${k} IN (${v.map(x => { values.push(x); return '$' + values.length; }).join(',')})`); return q; },
        order: (k: string, o: any) => { order = ` ORDER BY ${k} ${o.ascending ? 'ASC' : 'DESC'}`; return q; }, limit: (n: number) => { limit = ` LIMIT ${n}`; return q; }, maybeSingle: () => { single = true; return q; },
        then: async (resolve: any) => { try { const r = await db.query(`SELECT ${columns} FROM ${table}${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''}${order}${limit}`, values); resolve({ data: single ? r.rows[0] ?? null : r.rows, error: null }); } catch (e) { resolve({ data: null, error: { message: (e as Error).message } }); } } };
      return q;
    },
    storage: { from: (bucket: string) => ({
      upload: async (path: string) => { try { await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)', [bucket, path]); return { error: null }; } catch (e) { return { error: { message: (e as Error).message } }; } },
      download: async () => ({ data: null, error: { message: 'not stored' } }),
    }) },
  };
  return new LoopRepository(admin);
}

const passage = 'Coordinated a twelve-person volunteer rota across three community sites.';
const profile = { audience: 'professional', name: 'Sam Example', contactLine: '', targetTitles: ['Coordinator'], locations: ['Remote'], experienceYears: null, languages: ['English'], pageTarget: 1, discreetSearch: true,
  sourceText: `Sam Example\nWORK EXPERIENCE\nCommunity Trust\n${passage}`, excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null } };
const fact = { sourceKind: 'cv_passage', sourceQuote: passage, phrasing: passage, context: 'Community Trust', kind: 'employment', resultStatus: 'not_measured', confirmed: true, shareable: true };

/** A paid-only subscriber chooses one saved vacancy and the real worker prepares it. */
async function paidSelectedJourney(h: Harness) {
  const owner = await h.pay(await h.account());
  const repo = integratedRepository(h.db), version = async () => Number((await h.raw('SELECT version FROM job_loop_records WHERE user_id=$1', [owner.user])).rows[0].version);
  const variant = (await h.raw("SELECT job_loop_save_cv_variant_bound($1,$2,$3,$4,NULL,0,'Coordinator',$5,'[]',true) r", [owner.user, owner.generation, await version(), randomUUID(), profile])).rows[0].r.variant;
  const saved = (await h.raw('SELECT job_loop_save_cv_variant_fact_bound($1,$2,$3,$4,$5,1,$6,NULL,0,$7,true) r', [owner.user, owner.generation, await version(), randomUUID(), variant.id, variant.sourceHash, fact])).rows[0].r.fact;
  const cvSelection = { variantId: variant.id, variantRevision: variant.revision, sourceHash: variant.sourceHash, factRefs: [{ id: saved.id, revision: saved.revision }] };
  const job = { id: randomUUID(), title: 'Volunteer coordinator', company: 'Example charity', location: 'Remote', url: 'https://careers.example.com/coordinator', description: 'Coordinate volunteer rotas across sites and keep scheduling records accurate for the operations team.',
    contact: null, source: 'manual', sourceKey: 'manual:coordinator', checkedAt: new Date().toISOString(), verification: 'user_provided', status: 'saved', followUpAt: null, notes: '' };
  const row = await repo.record(owner.user, owner.generation);
  await repo.write(owner.user, row.version, { ...row.data, opportunities: [job] as any }, false);
  const env = (key: string) => ({ SUPABASE_URL: 'https://project.example.test', SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-only' } as Record<string, string>)[key];
  const transport: any = async (url: string) => { if (url.includes('/functions/v1/job-loop-worker')) return Response.json({ accepted: true }); throw Error('Unexpected external call ' + url); };
  const started = await controlLoop(repo, owner.user, { action: 'start_selected_run', expectedGeneration: owner.generation, expectedVersion: await version(), requestId: randomUUID(), opportunityIds: [job.id], prepareConsent: true, provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, cvSelection } as any, env, transport);
  const runId = started.runId!;
  let phases = 0;
  while (phases < 12 && await processLoopPhase(repo, runId, env, transport)) phases++;
  const run = await repo.run(owner.user, runId);
  const objects = Number((await h.raw("SELECT count(*) n FROM storage.objects WHERE name LIKE $1", [owner.user + '/%'])).rows[0].n);
  return { owner, repo, run, objects, pilot: await h.pilotRow(owner), env, transport };
}

describe('deployed chain before this fix (reproduction)', () => {
  let h: Harness;
  beforeAll(async () => { h = await database(); }, 60000);
  afterAll(async () => h?.db.close());

  it('admits a paid-only subscriber to a run, then refuses its artifact as a lost lease', async () => {
    const owner = await h.pay(await h.account());
    expect(await h.entitlement(owner)).toMatchObject({ active: true, plan: 'weekly' });
    const run = await h.start(owner);
    // Run admission returned early for the entitled account; no pilot seat exists.
    expect(await h.pilotRow(owner)).toBeNull();
    await expect(h.authorize(owner, run)).rejects.toThrow('LOOP_LEASE_LOST');
  });

  it('also refuses the storage write itself for a paid-only owner with an otherwise valid grant', async () => {
    const owner = await h.pay(await h.account()), run = await h.start(owner), packet = randomUUID();
    const path = `${owner.user}/${packet}/${hash}/txt`;
    // A grant exactly as the authorizer would write it; only the pilot seat is missing.
    await h.raw('INSERT INTO public.job_loop_artifact_grants(user_id,path,run_id,lease_token,generation,expires_at) SELECT $1,$2,id,lease_token,$3,lease_until FROM public.job_loop_runs WHERE id=$4', [owner.user, path, owner.generation, run.id]);
    await expect(h.store(path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
  });

  it('works for the same journey when the account holds a pilot seat', async () => {
    const owner = await h.account();
    await h.enrollPilot(owner);
    const run = await h.start(owner), path = await h.authorize(owner, run);
    await h.store(path);
    expect(await h.pilotRow(owner)).toBe(true);
  });

  it('the real worker swallows the refusal: the paid run stays running with no packet, no document and no message', async () => {
    const { run, objects, pilot, repo, env, transport } = await paidSelectedJourney(h);
    expect(pilot).toBeNull();
    expect(run.status).toBe('running');
    expect(run.data.packetIds ?? []).toEqual([]);
    expect(objects).toBe(0);
    // Lease recovery repeats the identical silent stop; the run never finishes.
    await h.raw("UPDATE job_loop_runs SET lease_until=now()-interval '1 second' WHERE id=$1", [run.id]);
    expect(await processLoopPhase(repo, run.id, env, transport)).toBe(false);
    expect((await repo.run(run.user_id, run.id)).status).toBe('running');
  }, 30000);
});

describe('paid entitlement authorizes artifacts exactly like a pilot seat', () => {
  let h: Harness;
  beforeAll(async () => { h = await database([fix]); }, 60000);
  afterAll(async () => h?.db.close());

  it('lets a paid-only subscriber authorize, store and publish a packet without taking a pilot seat', async () => {
    const owner = await h.pay(await h.account()), run = await h.start(owner), packet = randomUUID();
    const path = await h.authorize(owner, run, packet);
    expect(path).toBe(`${owner.user}/${packet}/${hash}/txt`);
    await h.store(path);
    expect(await h.stored(path)).toBe(1);
    const published = { id: packet, runId: run.id, opportunityId: randomUUID(), inputHash: hash, artifacts: { txt: { path, sha256: hash, byteSize: 1 } }, status: 'held' };
    expect(await h.rpc('job_loop_commit_phase', { p_run: run.id, p_lease: run.lease, p_phase: 7, p_status: 'completed', p_data: {}, p_packets: [published], p_opportunities: [] })).toMatchObject({ status: 'completed' });
    expect(await h.pilotRow(owner)).toBeNull();
    expect(Number((await h.raw('SELECT count(*) n FROM public.job_loop_pilot_users')).rows[0].n)).toBe(0);
  });

  it('runs the real paid selected-vacancy journey to stored PDF, DOCX and text documents', async () => {
    const { run, objects, pilot } = await paidSelectedJourney(h);
    expect(pilot).toBeNull();
    expect(['completed', 'partial']).toContain(run.status);
    expect(run.data.packetIds).toHaveLength(1);
    expect(objects).toBeGreaterThanOrEqual(3);
  }, 30000);

  it('leaves the pilot seat path unchanged', async () => {
    const owner = await h.account();
    await h.enrollPilot(owner);
    expect(await h.entitlement(owner)).toMatchObject({ active: true, plan: 'pilot' });
    const run = await h.start(owner), path = await h.authorize(owner, run);
    await h.store(path);
    expect(await h.pilotRow(owner)).toBe(true);
    await h.rpc('job_loop_commit_phase', { p_run: run.id, p_lease: run.lease, p_phase: 7, p_status: 'completed', p_data: {}, p_packets: [], p_opportunities: [] });
    // A deactivated seat with no paid entitlement is refused as before.
    const next = await h.start(owner);
    await h.raw('UPDATE public.job_loop_pilot_users SET active=false WHERE user_id=$1', [owner.user]);
    await expect(h.authorize(owner, next)).rejects.toThrow('LOOP_LEASE_LOST');
  });

  it('refuses an account with neither a pilot seat nor a paid entitlement', async () => {
    const owner = await h.account(), run = await h.start(owner);
    // Ordinary admission enrolled this free account; without that seat it has no authority.
    expect(await h.pilotRow(owner)).toBe(true);
    const path = await h.authorize(owner, run);
    await h.raw('UPDATE public.job_loop_pilot_users SET active=false WHERE user_id=$1', [owner.user]);
    await expect(h.store(path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
  });

  it('rejects a lapsed subscriber without a pilot seat at authorization and at storage', async () => {
    const owner = await h.pay(await h.account()), run = await h.start(owner);
    const earlier = await h.authorize(owner, run);
    // The paid service period ends while the run still holds its lease.
    await h.raw("UPDATE jobvance_private.loop_subscription_periods SET starts_at=now()-interval '32 days',ends_at=now()-interval '2 days' WHERE subscription_id=$1", ['sub_' + owner.user.replaceAll('-', '')]);
    await h.raw("UPDATE jobvance_private.loop_subscriptions SET valid_until=now()-interval '2 days' WHERE user_id=$1", [owner.user]);
    expect(await h.entitlement(owner)).toMatchObject({ active: false });
    await expect(h.authorize(owner, run)).rejects.toThrow('LOOP_LEASE_LOST');
    await expect(h.store(earlier)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    // Lapsed paid accounts are still not silently converted into free pilots.
    await expect(h.rpc('job_loop_commit_phase', { p_run: run.id, p_lease: run.lease, p_phase: 7, p_status: 'blocked', p_data: {}, p_packets: [], p_opportunities: [] })).resolves.toMatchObject({ status: 'blocked' });
    await expect(h.start(owner)).rejects.toThrow('LOOP_SUBSCRIPTION_REQUIRED');
    expect(await h.pilotRow(owner)).toBeNull();
  });

  it('rejects a refunded payment mid-run at storage and at the next authorization', async () => {
    const owner = await h.pay(await h.account()), run = await h.start(owner);
    const path = await h.authorize(owner, run);
    expect(await h.paymentEvent(owner, { p_revoked: true, p_created: Number((await h.raw('SELECT extract(epoch FROM now())::bigint-50 e')).rows[0].e) })).toMatchObject({ duplicate: false });
    expect(await h.entitlement(owner)).toMatchObject({ active: false });
    await expect(h.store(path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await expect(h.authorize(owner, run)).rejects.toThrow('LOOP_LEASE_LOST');
  });

  it('follows the existing entitlement exactly for cancellation, provider grace, expiry, revocation and test mode', async () => {
    const owner = await h.pay(await h.account()), run = await h.start(owner), sub = 'sub_' + owner.user.replaceAll('-', '');
    const service = async () => (await h.raw('SELECT public.job_loop_service_active($1) r', [owner.user])).rows[0].r;
    const allowed = async () => h.authorize(owner, run).then(() => true, error => { expect(String(error)).toContain('LOOP_LEASE_LOST'); return false; });
    const states: [string, string][] = [
      ['cancelled at period end, still paid', "UPDATE jobvance_private.loop_subscriptions SET status='cancelled',cancel_at_period_end=true WHERE subscription_id=$1"],
      ['past due within provider grace', "UPDATE jobvance_private.loop_subscriptions SET status='past_due',cancel_at_period_end=false,grace_until=now()+interval '2 days',valid_until=now()-interval '1 hour' WHERE subscription_id=$1"],
      ['past due after provider grace', "UPDATE jobvance_private.loop_subscriptions SET grace_until=now()-interval '1 second' WHERE subscription_id=$1"],
      ['provider expired', "UPDATE jobvance_private.loop_subscriptions SET status='expired',grace_until=NULL,valid_until=now()+interval '20 days' WHERE subscription_id=$1"],
      ['active again', "UPDATE jobvance_private.loop_subscriptions SET status='active' WHERE subscription_id=$1"],
      ['revoked', 'UPDATE jobvance_private.loop_subscriptions SET revoked=true WHERE subscription_id=$1'],
      ['test-mode subscription only', "UPDATE jobvance_private.loop_subscriptions SET revoked=false,mode='test' WHERE subscription_id=$1"],
    ];
    expect(await service()).toBe(true);
    for (const [, update] of states) {
      await h.raw(update, [sub]);
      const paid = (await h.entitlement(owner)).active === true;
      expect(await service()).toBe(paid);
      expect(await allowed()).toBe(paid);
    }
    expect(states.length).toBe(7);
  });

  it('keeps lease, run status, input version, key/hash and grant generation checks for paid owners', async () => {
    const owner = await h.pay(await h.account());
    const run = await h.start(owner);
    await expect(h.authorize(owner, run, randomUUID(), randomUUID())).rejects.toThrow('LOOP_LEASE_LOST');
    await expect(h.authorize(owner, run, randomUUID(), run.lease, 'exe')).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await expect(h.authorize(owner, run, randomUUID(), run.lease, 'txt', 'not-a-hash')).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    const granted = await h.authorize(owner, run);
    // A grant from another lifetime is refused even with a live lease.
    await h.raw('UPDATE public.job_loop_artifact_grants SET generation=generation+1 WHERE path=$1', [granted]);
    await expect(h.store(granted)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    // An expired lease, then a factual edit that blocks the run, are refused.
    await h.raw("UPDATE job_loop_runs SET lease_until=now()-interval '1 second' WHERE id=$1", [run.id]);
    await expect(h.authorize(owner, run)).rejects.toThrow('LOOP_LEASE_LOST');
    const again = randomUUID();
    expect(await h.rpc('job_loop_claim_run', { p_run: run.id, p_lease: again })).toMatchObject({ lease_token: again });
    const fresh = await h.authorize(owner, { id: run.id, lease: again });
    const record = await h.rpc('job_loop_read_record', { p_user: owner.user, p_generation: owner.generation });
    await h.rpc('job_loop_write_record', { p_user: owner.user, p_expected: record.version, p_data: { ...career, profile: { name: 'Edited' } }, p_inputs_changed: true });
    await expect(h.authorize(owner, { id: run.id, lease: again })).rejects.toThrow('LOOP_LEASE_LOST');
    await expect(h.store(fresh)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
  });

  it('keeps erasure fencing for paid owners and never reopens an old path in a new lifetime', async () => {
    const owner = await h.pay(await h.account()), run = await h.start(owner);
    const path = await h.authorize(owner, run);
    const erasure = await h.rpc('job_loop_begin_erase', { p_user: owner.user, p_expected_generation: owner.generation });
    // Erasure deletes the grant, so the earlier CV-authority storage trigger fences it first.
    await expect(h.store(path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await expect(h.authorize(owner, run)).rejects.toThrow('LOOP_ERASURE_IN_PROGRESS');
    await h.rpc('job_loop_finish_erase', { p_user: owner.user, p_generation: erasure.generation });
    await expect(h.store(path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    expect(await h.stored(path)).toBe(0);
    const reopened = await h.rpc('job_loop_open_record', { p_user: owner.user });
    expect(Number(reopened.lifecycle_generation)).toBeGreaterThan(owner.generation);
    await expect(h.store(path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
  });

  it('keeps collected and tombstoned paths closed for paid owners', async () => {
    const owner = await h.pay(await h.account()), first = await h.start(owner), packet = randomUUID();
    const path = await h.authorize(owner, first, packet);
    await h.store(path);
    await h.raw("UPDATE job_loop_runs SET status='cancelled',finished_at=now()-interval '25 hours',lease_token=NULL,lease_until=NULL WHERE id=$1", [first.id]);
    await h.raw('UPDATE job_loop_gc_config SET enabled=true,allowed_owner_ids=ARRAY[$1]::uuid[],last_owner_id=NULL WHERE singleton', [owner.user]);
    const claimed = await h.rpc('job_loop_gc_claim', { p_token: randomUUID(), p_limit: 200 });
    expect(claimed.map((item: { path: string }) => item.path)).toEqual([path]);
    await h.raw('UPDATE job_loop_gc_config SET enabled=false,allowed_owner_ids=ARRAY[]::uuid[] WHERE singleton');
    const second = await h.start(owner);
    await expect(h.authorize(owner, second, packet)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
    await expect(h.store(path)).rejects.toThrow('LOOP_ARTIFACT_UNAUTHORIZED');
  });

  it('changes only the seat predicate, with the original definer, search path and grants', async () => {
    const migration = await source(fix), erasure = await source('20261014101107_job_loop_durable_erasure.sql'), gc = await source('20261014161126_job_loop_terminal_artifact_gc.sql');
    const body = (text: string, start: string) => { const at = text.indexOf(start); expect(at, start).toBeGreaterThanOrEqual(0); return text.slice(at, text.indexOf('END $$;', at) + 7); };
    // Whitespace/comment-insensitive (the originals are checked out with CRLF).
    const squash = (text: string) => text.replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' ').trim();
    const swap = (text: string, from: string, to: string) => { expect(text, from).toContain(from); return text.replace(from, to); };
    let authorizeBefore = squash(body(erasure, 'CREATE FUNCTION public.job_loop_authorize_artifact('));
    authorizeBefore = swap(authorizeBefore, 'CREATE FUNCTION public.job_loop_authorize_artifact(', 'CREATE OR REPLACE FUNCTION public.job_loop_authorize_artifact_pre_gc(');
    authorizeBefore = swap(authorizeBefore, 'public.job_loop_records r JOIN public.job_loop_pilot_users p ON p.user_id=r.user_id AND p.active WHERE r.user_id=p_user AND r.input_version=run.input_version)',
      'public.job_loop_records r WHERE r.user_id=p_user AND r.input_version=run.input_version) OR NOT public.job_loop_service_active(p_user)');
    expect(squash(body(migration, 'CREATE OR REPLACE FUNCTION public.job_loop_authorize_artifact_pre_gc('))).toBe(authorizeBefore);
    let guardBefore = squash(body(gc, 'CREATE OR REPLACE FUNCTION public.job_loop_storage_write_guard()'));
    guardBefore = swap(guardBefore, ' JOIN public.job_loop_pilot_users pilot ON pilot.user_id=run.user_id AND pilot.active', '');
    guardBefore = swap(guardBefore, "run.lease_until>clock_timestamp() ) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF; RETURN NEW;",
      "run.lease_until>clock_timestamp() ) OR NOT public.job_loop_service_active(owner_id) THEN RAISE EXCEPTION 'LOOP_ARTIFACT_UNAUTHORIZED'; END IF; RETURN NEW;");
    expect(squash(body(migration, 'CREATE OR REPLACE FUNCTION public.job_loop_storage_write_guard()'))).toBe(guardBefore);
    expect(migration).not.toMatch(/INSERT INTO public\.job_loop_pilot_users|GRANT /);
    const routines = (await h.raw(`SELECT p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('service_role',p.oid,'EXECUTE') service,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('anon',p.oid,'EXECUTE') anon
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('job_loop_service_active','job_loop_authorize_artifact_pre_gc','job_loop_storage_write_guard','job_loop_authorize_artifact') ORDER BY p.proname`)).rows;
    expect(routines).toEqual([
      { proname: 'job_loop_authorize_artifact', prosecdef: true, proconfig: ['search_path=""'], service: true, authenticated: false, anon: false },
      { proname: 'job_loop_authorize_artifact_pre_gc', prosecdef: true, proconfig: ['search_path=""'], service: false, authenticated: false, anon: false },
      { proname: 'job_loop_service_active', prosecdef: true, proconfig: ['search_path=""'], service: false, authenticated: false, anon: false },
      { proname: 'job_loop_storage_write_guard', prosecdef: true, proconfig: ['search_path=""'], service: false, authenticated: false, anon: false },
    ]);
    expect((await h.raw("SELECT count(*) n FROM pg_trigger WHERE tgname='job_loop_storage_write_guard' AND tgrelid='storage.objects'::regclass AND NOT tgisinternal")).rows[0].n).toBe(1);
  });
});
