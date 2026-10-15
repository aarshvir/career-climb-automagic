// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// In-memory PostgreSQL with invented identities only; no production access.
let db: PGlite;
const hashA = 'a'.repeat(64), hashB = 'b'.repeat(64), hashC = 'c'.repeat(64);
const month = () => new Date().toISOString().slice(0, 7);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE public.job_loop_budget_months(month text PRIMARY KEY CHECK(month ~ '^\\d{4}-\\d{2}$'), committed_micros bigint NOT NULL DEFAULT 0 CHECK(committed_micros BETWEEN 0 AND 50000000));
    CREATE TABLE public.jobvance_admin_config(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), monthly_cap_micros bigint NOT NULL DEFAULT 50000000);
    INSERT INTO public.jobvance_admin_config DEFAULT VALUES;
  `);
  await db.exec(await readFile('supabase/migrations/20261015090000_jobvance_cv_tailor.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('TRUNCATE public.jobvance_tailor_usage; TRUNCATE public.job_loop_budget_months; TRUNCATE auth.users CASCADE; UPDATE public.jobvance_admin_config SET monthly_cap_micros = 50000000;'); });

type Usage = { id: string; is_new: boolean; status: string; reserved_micros: number; actual_micros: number | null };
async function reserve(args: { user?: string | null; hash?: string | null; request?: string; micros?: number; userDaily?: number; guestDaily?: number; guestGlobal?: number }): Promise<Usage> {
  const result = await db.query<{ r: Usage }>('SELECT public.jobvance_tailor_reserve($1,$2,$3,$4,$5,$6,$7,$8,$9) AS r', [
    args.user ?? null, args.hash === undefined ? hashA : args.hash, args.request ?? randomUUID(), 'openrouter', 'openai/gpt-6.1-sol', args.micros ?? 75000,
    args.userDaily ?? 8, args.guestDaily ?? 2, args.guestGlobal ?? 200,
  ]);
  return result.rows[0].r;
}
async function committed(): Promise<number> {
  const result = await db.query<{ c: string }>('SELECT committed_micros AS c FROM public.job_loop_budget_months WHERE month = $1', [month()]);
  return Number(result.rows[0]?.c ?? 0);
}
async function user(): Promise<string> { const id = randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES($1)', [id]); return id; }

describe('jobvance_tailor_reserve', () => {
  it('reserves against the shared month ledger and replays the same request without double charging', async () => {
    const request = randomUUID();
    const first = await reserve({ request });
    expect(first.is_new).toBe(true);
    expect(await committed()).toBe(75000);
    const again = await reserve({ request });
    expect(again.is_new).toBe(false);
    expect(again.id).toBe(first.id);
    expect(await committed()).toBe(75000);
  });
  it('rejects reuse of a request id by another guest or account', async () => {
    const request = randomUUID();
    await reserve({ request, hash: hashA });
    await expect(reserve({ request, hash: hashB })).rejects.toThrow('TAILOR_REQUEST_CONFLICT');
    await expect(reserve({ request, user: await user(), hash: null })).rejects.toThrow('TAILOR_REQUEST_CONFLICT');
  });
  it('limits each guest per day and all guests together', async () => {
    await reserve({ hash: hashA }); await reserve({ hash: hashA });
    await expect(reserve({ hash: hashA })).rejects.toThrow('TAILOR_GUEST_LIMIT');
    await reserve({ hash: hashB, guestGlobal: 3 });
    await expect(reserve({ hash: hashC, guestGlobal: 3 })).rejects.toThrow('TAILOR_GUEST_CAPACITY');
    expect(await committed()).toBe(3 * 75000);
  });
  it('limits signed-in users separately and never counts them as guests', async () => {
    const id = await user();
    for (let i = 0; i < 3; i++) await reserve({ user: id, hash: null, userDaily: 3 });
    await expect(reserve({ user: id, hash: null, userDaily: 3 })).rejects.toThrow('TAILOR_DAILY_LIMIT');
    await reserve({ hash: hashA }); // guests unaffected by the signed-in count
    const rows = await db.query<{ n: string }>('SELECT count(*) AS n FROM public.jobvance_tailor_usage WHERE user_id IS NOT NULL AND rate_hash IS NOT NULL');
    expect(Number(rows.rows[0].n)).toBe(0);
  });
  it('fails closed at the owner cap and when inputs are invalid', async () => {
    await db.exec(`UPDATE public.jobvance_admin_config SET monthly_cap_micros = 100000`);
    await reserve({ micros: 75000 });
    await expect(reserve({ hash: hashB, micros: 75000 })).rejects.toThrow('TAILOR_BUDGET_LIMIT');
    await expect(reserve({ hash: hashC, micros: 600000 })).rejects.toThrow('TAILOR_BUDGET_LIMIT');
    await expect(reserve({ hash: 'not-a-hash' })).rejects.toThrow('TAILOR_INVALID');
    await expect(reserve({ hash: null })).rejects.toThrow('TAILOR_INVALID');
    expect(await committed()).toBe(75000);
  });
});

describe('jobvance_tailor_settle', () => {
  it('releases the unused reservation once, keeps uncertain usage committed and rejects impossible costs', async () => {
    const a = await reserve({ hash: hashA }), b = await reserve({ hash: hashB });
    await db.query('SELECT public.jobvance_tailor_settle($1,$2,false)', [a.id, 10500]);
    expect(await committed()).toBe(10500 + 75000);
    await db.query('SELECT public.jobvance_tailor_settle($1,$2,false)', [a.id, 1]); // already settled: no change
    expect(await committed()).toBe(10500 + 75000);
    await db.query('SELECT public.jobvance_tailor_settle($1,NULL,true)', [b.id]);
    expect(await committed()).toBe(10500 + 75000);
    const c = await reserve({ hash: hashC });
    await expect(db.query('SELECT public.jobvance_tailor_settle($1,$2,false)', [c.id, 80000])).rejects.toThrow('TAILOR_USAGE_INVALID');
    const status = await db.query<{ status: string }>('SELECT status FROM public.jobvance_tailor_usage ORDER BY created_at');
    expect(status.rows.map(row => row.status)).toEqual(['settled', 'uncertain', 'reserved']);
  });
});

describe('access and retention', () => {
  it('is callable by the service role only, and the table is closed to clients', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query(`SELECT public.jobvance_tailor_reserve(NULL,'${hashA}','${randomUUID()}','openrouter','m',1)`)).rejects.toThrow(/permission denied/u);
      await expect(db.query('SELECT * FROM public.jobvance_tailor_usage')).rejects.toThrow(/permission denied/u);
      await db.exec('RESET ROLE');
    }
  });
  it('deletes only settled guest rows older than 90 days', async () => {
    const old = await reserve({ hash: hashA }), recent = await reserve({ hash: hashB }), id = await user();
    const signed = await reserve({ user: id, hash: null });
    for (const usage of [old, recent, signed]) await db.query('SELECT public.jobvance_tailor_settle($1,1000,false)', [usage.id]);
    await db.query(`UPDATE public.jobvance_tailor_usage SET day = current_date - 120 WHERE id IN ($1,$2)`, [old.id, signed.id]);
    const removed = await db.query<{ n: number }>('SELECT public.jobvance_tailor_usage_cleanup() AS n');
    expect(removed.rows[0].n).toBe(1);
    const left = await db.query<{ id: string }>('SELECT id FROM public.jobvance_tailor_usage ORDER BY created_at');
    expect(left.rows.map(row => row.id)).toEqual([recent.id, signed.id]);
  });
});
