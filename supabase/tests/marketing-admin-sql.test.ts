// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

// In-memory PostgreSQL only; the seed contains public Meta object ids, no secrets.
let db: PGlite;
const q = (sql: string, values: unknown[] = []) => db.query<Record<string, unknown>>(sql, values);
const as = async (role: string) => { await db.exec('RESET ROLE'); await db.exec(`SET ROLE ${role}`); };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.jobvance_admin_members(user_id uuid PRIMARY KEY,role text,active boolean);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);
  await db.exec(await readFile('supabase/migrations/20261024090000_jobvance_marketing_admin.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });

describe('private marketing workspace schema', () => {
  it('replaces complete metrics atomically, clears removed days and fences older reads', async () => {
    await as('postgres');
    const actor = '11111111-1111-4111-8111-111111111111';
    await q("INSERT INTO public.jobvance_admin_members VALUES($1,'owner',true)", [actor]);
    const id = (await q("SELECT id FROM public.jobvance_marketing_launches WHERE name='Version C - man first'")).rows[0].id;
    await as('service_role');
    const commit = (at: string, days: unknown[], who = actor) => q('SELECT public.jobvance_marketing_commit_metrics($1,$2,$3,$4,$5) AS saved', [who,id,at,JSON.stringify({status:'PAUSED',effectiveStatus:'PAUSED',dailyBudgetMinor:50000,endAt:null}),JSON.stringify(days)]);
    const day = (date: string, spend = 123) => ({day:date,impressions:10,reach:8,clicks:2,linkClicks:1,landingPageViews:1,spendMinor:spend});
    const start = Date.now() - 60000;
    expect((await commit(new Date(start).toISOString(), [day('2026-10-23'),day('2026-10-24')])).rows[0].saved).toBe(true);
    await commit(new Date(start+1000).toISOString(), [day('2026-10-24',150)]);
    expect((await q('SELECT day::text,spend_minor::int FROM public.jobvance_marketing_metrics WHERE launch_id=$1',[id])).rows).toEqual([{day:'2026-10-24',spend_minor:150}]);
    expect((await commit(new Date(start).toISOString(), [day('2026-10-23')])).rows[0].saved).toBe(false);
    await expect(commit(new Date(start+2000).toISOString(),[day('2026-10-24',-1)])).rejects.toThrow();
    expect((await q('SELECT spend_minor::int FROM public.jobvance_marketing_metrics WHERE launch_id=$1',[id])).rows[0].spend_minor).toBe(150);
    await expect(commit(new Date(start+2000).toISOString(),[], '22222222-2222-4222-8222-222222222222')).rejects.toThrow(/MARKETING_FORBIDDEN/);
    await commit(new Date(start+2000).toISOString(), []);
    expect((await q('SELECT count(*)::int n FROM public.jobvance_marketing_metrics WHERE launch_id=$1',[id])).rows[0].n).toBe(0);
    for (const role of ['anon','authenticated']) {
      await as(role);
      await expect(commit(new Date(start+3000).toISOString(),[])).rejects.toThrow(/permission denied/);
    }
    await as('postgres'); await q('UPDATE public.jobvance_admin_members SET active=false WHERE user_id=$1',[actor]); await as('service_role');
    await expect(commit(new Date(start+3000).toISOString(),[])).rejects.toThrow(/MARKETING_FORBIDDEN/);
    await q("UPDATE public.jobvance_marketing_launches SET status='UNKNOWN',effective_status=NULL,last_synced_at=NULL,metrics_state='unknown' WHERE id=$1",[id]);
  });
  it('can actually queue a production request with ordinary text', async () => {
    await as('service_role');
    const idea = (await q("SELECT id FROM public.jobvance_marketing_ideas WHERE status='idea' LIMIT 1")).rows[0].id;
    const saved = await q("INSERT INTO public.jobvance_marketing_requests(idea_id,note) VALUES($1,$2) RETURNING status,note", [idea, 'A clear Job Loop walkthrough.']);
    expect(saved.rows[0]).toEqual({ status: 'queued', note: 'A clear Job Loop walkthrough.' });
    await expect(q("INSERT INTO public.jobvance_marketing_requests(idea_id,note) VALUES($1,'duplicate')",[idea])).rejects.toThrow(/unique constraint/);
  });
  it('seeds the launched versions, approved files, launches and safe default settings', async () => {
    await as('service_role');
    expect((await q('SELECT count(*)::int AS n FROM public.jobvance_marketing_ideas')).rows[0].n).toBe(7);
    // Live status and figures stay unknown until the first complete read from Meta.
    const launches = (await q('SELECT name, meta_ad_id, status, daily_budget_minor, metrics_state, last_synced_at FROM public.jobvance_marketing_launches ORDER BY name')).rows;
    const seeded = { status: 'UNKNOWN', daily_budget_minor: 50000, metrics_state: 'unknown', last_synced_at: null };
    expect(launches).toEqual([
      { name: 'Version A - Search Rewrite Repeat', meta_ad_id: '120252906172570325', ...seeded },
      { name: 'Version B - Job hunt dragging', meta_ad_id: '120252994824010325', ...seeded },
      { name: 'Version C - man first', meta_ad_id: '120253003770960325', ...seeded },
      { name: 'Version C - partner first', meta_ad_id: '120253003770940325', ...seeded },
    ]);
    expect((await q('SELECT count(*)::int AS n FROM public.jobvance_marketing_creatives WHERE approved')).rows[0].n).toBe(16);
    const live = (await q("SELECT file_name FROM public.jobvance_marketing_creatives WHERE sha256 IS NOT NULL AND (file_name LIKE '%-v4-upload.mp4' OR file_name LIKE 'Jobvance-C-%') ORDER BY file_name")).rows.map(r => r.file_name);
    expect(live).toEqual(['Jobvance-A-Feed-4x5-v4-upload.mp4', 'Jobvance-A-Reels-9x16-v4-upload.mp4', 'Jobvance-B-Feed-4x5-v4-upload.mp4', 'Jobvance-B-Reels-9x16-v4-upload.mp4', 'Jobvance-C-Feed-4x5-v2-upload.mp4', 'Jobvance-C-Reels-9x16-v2-upload.mp4', 'Jobvance-C-partnerfirst-Feed-4x5-v2-upload.mp4', 'Jobvance-C-partnerfirst-Reels-9x16-v2-upload.mp4']);
    const settings = (await q('SELECT version, max_daily_spend_minor, max_total_spend_minor FROM public.jobvance_marketing_settings')).rows[0];
    expect(settings).toEqual({ version: 0, max_daily_spend_minor: 300000, max_total_spend_minor: 1300000 });
  });

  it('keeps every table out of reach of browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      await as(role);
      for (const table of ['jobvance_marketing_ideas', 'jobvance_marketing_launches', 'jobvance_marketing_settings', 'jobvance_marketing_audit'])
        await expect(q(`SELECT 1 FROM public.${table} LIMIT 1`)).rejects.toThrow(/permission denied/);
    }
  });

  it('makes the audit log append-only', async () => {
    await as('service_role');
    const row = (await q("INSERT INTO public.jobvance_marketing_audit(action, details) VALUES('sync', '{\"launches\":2}') RETURNING id")).rows[0];
    await expect(q('UPDATE public.jobvance_marketing_audit SET action=$2 WHERE id=$1', [row.id, 'run_auto'])).rejects.toThrow(/MARKETING_AUDIT_IMMUTABLE/);
    await expect(q('DELETE FROM public.jobvance_marketing_audit WHERE id=$1', [row.id])).rejects.toThrow(/MARKETING_AUDIT_IMMUTABLE/);
    for (const action of ['delete_everything', 'set_status', 'run_auto', 'auto_pause', 'auto_resume'])
      await expect(q('INSERT INTO public.jobvance_marketing_audit(action) VALUES($1)', [action])).rejects.toThrow();
  });

  it('installs no scheduler, ticket or auto-mode switch', async () => {
    await as('service_role');
    const objects = (await q("SELECT p.proname::text AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'jobvance_marketing%' UNION ALL SELECT table_name::text FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'jobvance_marketing%' ORDER BY 1")).rows.map(r => r.name);
    expect(objects).toEqual(['jobvance_marketing_audit', 'jobvance_marketing_audit_immutable', 'jobvance_marketing_commit_metrics', 'jobvance_marketing_creatives', 'jobvance_marketing_ideas', 'jobvance_marketing_launches', 'jobvance_marketing_metrics', 'jobvance_marketing_requests', 'jobvance_marketing_settings']);
    const columns = (await q("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN('jobvance_marketing_settings','jobvance_marketing_launches')")).rows.map(r => r.column_name);
    expect(columns).not.toEqual(expect.arrayContaining(['auto_mode']));
    expect(columns.filter(name => /auto|paused/.test(String(name)))).toEqual([]);
    for (const file of (await readdir('supabase/migrations')).filter(name => name.includes('marketing')))
      expect(await readFile(`supabase/migrations/${file}`, 'utf8')).not.toMatch(/cron\.schedule|jobvance-marketing-auto|http_post/);
  });

  it('records figures as unknown until a complete read, never fresh without a sync time', async () => {
    await as('service_role');
    const id = (await q("SELECT id FROM public.jobvance_marketing_launches WHERE name='Version B - Job hunt dragging'")).rows[0].id;
    await expect(q("UPDATE public.jobvance_marketing_launches SET metrics_state='fresh' WHERE id=$1", [id])).rejects.toThrow();
    await expect(q("UPDATE public.jobvance_marketing_launches SET metrics_issue='zeroed' WHERE id=$1", [id])).rejects.toThrow();
    await q("UPDATE public.jobvance_marketing_launches SET metrics_state='fresh', last_synced_at=now() WHERE id=$1", [id]);
    await q("UPDATE public.jobvance_marketing_launches SET metrics_state='stale', metrics_issue='currency_mismatch' WHERE id=$1", [id]);
  });

  it('rejects approval without a timestamp, bad Meta ids and caps out of range', async () => {
    await as('service_role');
    const idea = (await q("SELECT id FROM public.jobvance_marketing_ideas WHERE slug='version-c-drama'")).rows[0].id;
    await expect(q("INSERT INTO public.jobvance_marketing_creatives(idea_id,label,kind,approved) VALUES($1,'C cut','video',true)", [idea])).rejects.toThrow();
    await expect(q("INSERT INTO public.jobvance_marketing_launches(idea_id,name,meta_campaign_id,meta_adset_id,meta_ad_id) VALUES($1,'C','act_1','2','3')", [idea])).rejects.toThrow();
    await expect(q('UPDATE public.jobvance_marketing_settings SET max_daily_spend_minor=0')).rejects.toThrow();
  });
});
