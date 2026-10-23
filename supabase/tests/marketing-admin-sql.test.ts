// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

// In-memory PostgreSQL only; the seed contains public Meta object ids, no secrets.
let db: PGlite;
const q = (sql: string, values: unknown[] = []) => db.query<Record<string, unknown>>(sql, values);
const as = async (role: string) => { await db.exec('RESET ROLE'); await db.exec(`SET ROLE ${role}`); };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);
  await db.exec(await readFile('supabase/migrations/20261024090000_jobvance_marketing_admin.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });

describe('private marketing workspace schema', () => {
  it('seeds the launched versions, approved files, launches and safe default settings', async () => {
    await as('service_role');
    expect((await q('SELECT count(*)::int AS n FROM public.jobvance_marketing_ideas')).rows[0].n).toBe(7);
    const launches = (await q('SELECT name, meta_ad_id, status, daily_budget_minor FROM public.jobvance_marketing_launches ORDER BY name')).rows;
    expect(launches).toEqual([
      { name: 'Version A - Search Rewrite Repeat', meta_ad_id: '120252906172570325', status: 'ACTIVE', daily_budget_minor: 50000 },
      { name: 'Version B - Job hunt dragging', meta_ad_id: '120252994824010325', status: 'ACTIVE', daily_budget_minor: 50000 },
    ]);
    expect((await q('SELECT count(*)::int AS n FROM public.jobvance_marketing_creatives WHERE approved')).rows[0].n).toBe(6);
    const settings = (await q('SELECT version, auto_mode, max_daily_spend_minor, max_total_spend_minor FROM public.jobvance_marketing_settings')).rows[0];
    expect(settings).toEqual({ version: 0, auto_mode: false, max_daily_spend_minor: 150000, max_total_spend_minor: 700000 });
  });

  it('keeps every table out of reach of browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      await as(role);
      for (const table of ['jobvance_marketing_ideas', 'jobvance_marketing_launches', 'jobvance_marketing_settings', 'jobvance_marketing_audit', 'jobvance_marketing_dispatch_tickets'])
        await expect(q(`SELECT 1 FROM public.${table} LIMIT 1`)).rejects.toThrow(/permission denied/);
      await expect(q('SELECT public.jobvance_marketing_consume_ticket(gen_random_uuid())')).rejects.toThrow(/permission denied/);
    }
  });

  it('makes the audit log append-only', async () => {
    await as('service_role');
    const row = (await q("INSERT INTO public.jobvance_marketing_audit(action, details) VALUES('sync', '{\"launches\":2}') RETURNING id")).rows[0];
    await expect(q('UPDATE public.jobvance_marketing_audit SET action=$2 WHERE id=$1', [row.id, 'run_auto'])).rejects.toThrow(/MARKETING_AUDIT_IMMUTABLE/);
    await expect(q('DELETE FROM public.jobvance_marketing_audit WHERE id=$1', [row.id])).rejects.toThrow(/MARKETING_AUDIT_IMMUTABLE/);
    await expect(q("INSERT INTO public.jobvance_marketing_audit(action) VALUES('delete_everything')")).rejects.toThrow();
  });

  it('accepts a scheduler ticket exactly once and never an expired one', async () => {
    await as('service_role');
    const ticket = (await q('INSERT INTO public.jobvance_marketing_dispatch_tickets DEFAULT VALUES RETURNING ticket')).rows[0].ticket;
    expect((await q('SELECT public.jobvance_marketing_consume_ticket($1) AS ok', [ticket])).rows[0].ok).toBe(true);
    expect((await q('SELECT public.jobvance_marketing_consume_ticket($1) AS ok', [ticket])).rows[0].ok).toBe(false);
    const stale = (await q("INSERT INTO public.jobvance_marketing_dispatch_tickets(expires_at) VALUES(now() - interval '1 minute') RETURNING ticket")).rows[0].ticket;
    expect((await q('SELECT public.jobvance_marketing_consume_ticket($1) AS ok', [stale])).rows[0].ok).toBe(false);
  });

  it('rejects approval without a timestamp, bad Meta ids and caps out of range', async () => {
    await as('service_role');
    const idea = (await q("SELECT id FROM public.jobvance_marketing_ideas WHERE slug='version-c-drama'")).rows[0].id;
    await expect(q("INSERT INTO public.jobvance_marketing_creatives(idea_id,label,kind,approved) VALUES($1,'C cut','video',true)", [idea])).rejects.toThrow();
    await expect(q("INSERT INTO public.jobvance_marketing_launches(idea_id,name,meta_campaign_id,meta_adset_id,meta_ad_id) VALUES($1,'C','act_1','2','3')", [idea])).rejects.toThrow();
    await expect(q('UPDATE public.jobvance_marketing_settings SET max_daily_spend_minor=0')).rejects.toThrow();
  });
});
