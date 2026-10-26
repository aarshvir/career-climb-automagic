// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { analyticsSchema, contactsSchema, personSchema, sessionSchema } from '../../lib/admin-analytics';

let db: PGlite;
const owner = 'be619aa5-b1b8-4978-8780-b62461361980';
const operator = '00000000-0000-4000-8000-000000000014';
const casey = '00000000-0000-4000-8000-000000000011';
const qa = '00000000-0000-4000-8000-000000000013';
const caseyBrowser = '00000000-0000-4000-8000-0000000000a1';
const ownerBrowser = '00000000-0000-4000-8000-0000000000a2';
const strangerBrowser = '00000000-0000-4000-8000-0000000000a3';
const adVisit = '00000000-0000-4000-8000-0000000000b1';
const laterVisit = '00000000-0000-4000-8000-0000000000b2';
const ownerVisit = '00000000-0000-4000-8000-0000000000b3';
const strangerVisit = '00000000-0000-4000-8000-0000000000b4';
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
async function call<T>(sql: string, args: unknown[]) { return (await db.query<{ result: T }>(sql, args)).rows[0].result; }
const phoneDevice = { device: 'mobile', browser: 'Instagram', os: 'iOS', inApp: 'Instagram' };
const track = (visitor: string, session: string, user: string | null, context: object, events: object[], device: object = phoneDevice) =>
  call<number>('SELECT public.jobvance_track($1,$2,$3,$4,$5,$6) AS result', [visitor, session, user, JSON.stringify(context), JSON.stringify(device), JSON.stringify(events)]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA jobvance_private;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),last_sign_in_at timestamptz);
    CREATE TABLE public.job_loop_budget_months(month text PRIMARY KEY,committed_micros bigint NOT NULL DEFAULT 0);
    CREATE TABLE public.job_loop_support_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,category text,message text,status text DEFAULT 'received',created_at timestamptz DEFAULT now());
    CREATE TABLE public.job_loop_scheduler_config(singleton boolean PRIMARY KEY,enabled boolean,last_dispatch_at timestamptz);
    INSERT INTO public.job_loop_scheduler_config VALUES(true,true,now()-interval '3 minutes');
    CREATE TABLE public.job_loop_records(user_id uuid PRIMARY KEY,input_version bigint DEFAULT 0,data jsonb);
    CREATE TABLE public.job_loop_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,status text,phase integer DEFAULT 0,provider text DEFAULT 'rules',model text DEFAULT 'rules',input_version bigint DEFAULT 0,lease_token uuid,lease_until timestamptz,consents jsonb DEFAULT '{}',data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),finished_at timestamptz);
    CREATE TABLE public.job_loop_packets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,status text,approved_at timestamptz);
    CREATE TABLE public.job_loop_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,run_id uuid,operation_key text,month text,provider text,reserved_micros bigint,actual_micros bigint,status text DEFAULT 'reserved',result jsonb);
    CREATE TABLE public.job_loop_pilot_users(user_id uuid PRIMARY KEY,active boolean);
    CREATE TABLE public.job_loop_schedules(user_id uuid PRIMARY KEY,status text,next_run_at timestamptz,lease_until timestamptz);
    CREATE TABLE public.job_loop_activity(user_id uuid,kind text,actor text,at timestamptz DEFAULT now());
    CREATE TABLE public.job_loop_lifecycle(user_id uuid PRIMARY KEY,generation bigint,state text);
    CREATE TABLE public.cv_checks(user_id uuid,status text,created_at timestamptz DEFAULT now());
    CREATE TABLE public.jobvance_tailor_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),month text,user_id uuid,status text,actual_micros bigint);
    CREATE TABLE public.jobvance_guest_support_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text DEFAULT 'received',created_at timestamptz DEFAULT now());
    CREATE TABLE public.jobvance_pass_plans(plan text PRIMARY KEY,name text);
    INSERT INTO public.jobvance_pass_plans VALUES('search_30d','Job Search');
    CREATE TABLE public.billing_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,request_id uuid,billing_mode text,payment_intent text,status text,amount integer,plan text,created_at timestamptz DEFAULT now());
    CREATE TABLE public.billing_payments(payment_intent text PRIMARY KEY,user_id uuid,paid_at timestamptz,refunded_at timestamptz,refund_amount integer DEFAULT 0,created_at timestamptz DEFAULT now());
    CREATE TABLE public.jobvance_passes(user_id uuid,plan text,billing_mode text,status text,expires_at timestamptz);
    CREATE TABLE jobvance_private.loop_billing_orders(user_id uuid,request_id uuid,mode text,plan text,state text,capacity_until timestamptz,created_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,request_id));
    CREATE TABLE jobvance_private.loop_subscriptions(subscription_id text PRIMARY KEY,user_id uuid,request_id uuid,mode text,plan text,status text,valid_until timestamptz,revoked boolean DEFAULT false,generation bigint,cancel_at_period_end boolean DEFAULT false,grace_until timestamptz,period_start timestamptz);
    CREATE TABLE jobvance_private.loop_subscription_periods(mode text,payment_id text,subscription_id text,starts_at timestamptz,ends_at timestamptz,amount bigint,currency text DEFAULT 'USD',revoked boolean DEFAULT false,PRIMARY KEY(mode,payment_id));
    CREATE TABLE jobvance_private.loop_provider_accounting(mode text,payment_id text,accounting_amount_minor bigint,PRIMARY KEY(mode,payment_id));
    CREATE TABLE jobvance_private.loop_billing_cancel_requests(user_id uuid,request_id uuid,mode text,state text,created_at timestamptz DEFAULT now());
    CREATE TABLE jobvance_private.loop_billing_pending_fulfillment(mode text,event_id text,user_id uuid,resolved boolean DEFAULT false,created_at timestamptz DEFAULT now());
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  await db.query("INSERT INTO auth.users(id,email,created_at) VALUES($1,'aarshvir@gmail.com',now()-interval '200 days')", [owner]);
  await db.exec(await readFile('supabase/migrations/20261012180814_jobvance_admin_platform.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261025200000_jobvance_admin_dashboard.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261026010000_jobvance_analytics.sql', 'utf8'));
  await db.query(`INSERT INTO auth.users(id,email,created_at,raw_user_meta_data) VALUES
    ($1,'casey@work.org',now()-interval '30 minutes','{"full_name":"Casey Example","phone":"+971501234567"}'),
    ($2,'jobvance-qa@example.com',now()-interval '3 days','{"qa_fixture":true}'),
    ($3,'operator@work.org',now()-interval '100 days','{}')`, [casey, qa, operator]);
  await db.query(`INSERT INTO public.jobvance_admin_members(user_id,role,active) VALUES($1,'operator',true)`, [operator]);
  // Casey clicks an Instagram ad, reads for 40 s, signs up, finishes set-up, and later comes back from Google.
  await track(caseyBrowser, adVisit, null, { landing: '/onboarding?utm_source=instagram&utm_campaign=us-cv&utm_content=C-man', utm_source: 'instagram', utm_campaign: 'us-cv', utm_content: 'C-man', fbclid: true }, [
    { kind: 'page_view', at: at(60), path: '/job-loop', title: 'Job Loop' },
    { kind: 'click', at: at(59.5), path: '/job-loop', label: 'Start Job Loop', href: '/onboarding' },
    { kind: 'page_leave', at: at(59.3), path: '/job-loop', durationMs: 40000, props: { maxScroll: 75 } },
    { kind: 'page_view', at: at(59.2), path: '/auth?mode=signup', title: 'Sign up' },
    { kind: 'form_submit', at: at(58), path: '/auth?mode=signup', label: 'Create your Jobvance account' },
  ]);
  await track(caseyBrowser, adVisit, casey, {}, [
    { kind: 'identify', at: at(31), path: '/auth?mode=signup', label: 'Signed in' },
    { kind: 'page_leave', at: at(30.9), path: '/auth?mode=signup', durationMs: 20000 },
    { kind: 'page_view', at: at(30.8), path: '/onboarding' },
    { kind: 'page_leave', at: at(29), path: '/onboarding', durationMs: 90000 },
  ]);
  await track(caseyBrowser, laterVisit, casey, { landing: '/loop', referrer: 'www.google.com/' }, [{ kind: 'page_view', at: at(5), path: '/loop' }], { device: 'desktop', browser: 'Chrome', os: 'Windows' });
  await track(ownerBrowser, ownerVisit, owner, { landing: '/' }, [{ kind: 'page_view', at: at(10), path: '/' }], { device: 'desktop', browser: 'Chrome', os: 'macOS' });
  await track(strangerBrowser, strangerVisit, null, { landing: '/pricing', referrer: 'chatgpt.com/' }, [{ kind: 'page_view', at: at(3), path: '/pricing' }, { kind: 'page_leave', at: at(2), path: '/pricing', durationMs: 12000 }], { device: 'desktop', browser: 'Safari', os: 'macOS' });
}, 30000);
afterAll(async () => { await db?.close(); });

describe('first-party analytics SQL', () => {
  it("links a visitor's earlier anonymous visit to the account they create", async () => {
    const rows = (await db.query<{ user_id: string | null }>('SELECT user_id FROM public.jobvance_events WHERE session_id=$1', [adVisit])).rows;
    expect(rows.length).toBe(9);
    expect(rows.every(row => row.user_id === casey)).toBe(true);
    expect((await db.query<{ user_id: string }>('SELECT user_id FROM public.jobvance_visitors WHERE visitor_id=$1', [caseyBrowser])).rows[0].user_id).toBe(casey);
  });

  it('refuses events for a visit that belongs to another browser, and malformed events', async () => {
    expect(await track(strangerBrowser, adVisit, null, {}, [{ kind: 'page_view', at: at(1), path: '/' }])).toBe(0);
    expect(await track(strangerBrowser, strangerVisit, null, {}, [{ kind: 'nonsense', at: at(1), path: '/' }, { kind: 'click', at: at(1), path: 'no-slash' }])).toBe(0);
  });

  it('reports visitors, channels, pages and people, leaving out staff', async () => {
    const result = analyticsSchema.parse(await call('SELECT public.jobvance_admin_analytics($1,30) AS result', [owner]));
    expect(result.totals).toMatchObject({ visitors: 2, sessions: 3, newAccounts: 1 });
    expect(result.channels.map(channel => channel.label).sort()).toEqual(['AI assistants', 'Meta ads (Instagram / Facebook)', 'Search engines']);
    expect(result.channels.find(channel => channel.label.startsWith('Meta'))).toMatchObject({ sessions: 1, newAccounts: 1 });
    expect(result.campaigns[0]).toMatchObject({ source: 'instagram', campaign: 'us-cv', content: 'C-man', sessions: 1, newAccounts: 1 });
    expect(result.pages.find(page => page.path === '/job-loop')).toMatchObject({ views: 1, avgSeconds: 40 });
    expect(result.clicks[0]).toMatchObject({ label: 'Start Job Loop', count: 1 });
    expect(result.sessions.find(session => session.id === adVisit)).toMatchObject({ name: 'Casey Example', email: 'casey@work.org', phone: '+971501234567', pages: 3, clicks: 1, seconds: 150, inApp: 'Instagram', campaign: 'us-cv · C-man' });
    expect(result.sessions.some(session => session.id === ownerVisit)).toBe(false);
  });

  it('masks contact details for operators', async () => {
    const result = analyticsSchema.parse(await call('SELECT public.jobvance_admin_analytics($1,30) AS result', [operator]));
    expect(result.sessions.find(session => session.id === adVisit)).toMatchObject({ email: 'c***@work.org', phone: '+97••••567' });
  });

  it('shows one visit step by step with seconds on each page', async () => {
    const result = sessionSchema.parse(await call('SELECT public.jobvance_admin_session($1,$2) AS result', [owner, adVisit]));
    expect(result.person).toMatchObject({ name: 'Casey Example', phone: '+971501234567' });
    expect(result.events.map(event => [event.kind, event.path, event.seconds ?? null])).toEqual([
      ['page_view', '/job-loop', 40], ['click', '/job-loop', null], ['page_view', '/auth?mode=signup', 20], ['form_submit', '/auth?mode=signup', null],
      ['identify', '/auth?mode=signup', null], ['page_view', '/onboarding', 90],
    ]);
    expect(result.events[0].scroll).toBe(75);
    expect(result.otherVisits).toBe(1);
  });

  it('shows a person with their first visit and every visit since', async () => {
    const result = personSchema.parse(await call('SELECT public.jobvance_admin_person($1,$2) AS result', [owner, casey]));
    expect(result).toMatchObject({ name: 'Casey Example', email: 'casey@work.org', phone: '+971501234567', totals: { visits: 2, pageViews: 4, seconds: 150 } });
    expect(result.firstVisit).toMatchObject({ channel: 'Meta ads (Instagram / Facebook)', campaign: 'us-cv · C-man' });
    const contacts = contactsSchema.parse(await call('SELECT public.jobvance_admin_contacts($1) AS result', [owner]));
    expect(contacts.find(contact => contact.userId === casey)).toMatchObject({ name: 'Casey Example', phone: '+971501234567', visits: 2, channel: 'Meta ads (Instagram / Facebook)' });
  });

  it('keeps raw analytics away from browser roles and non-admins', async () => {
    await expect(db.query('SELECT public.jobvance_admin_analytics($1,30)', [casey])).rejects.toThrow(/ADMIN_FORBIDDEN/);
    await expect(db.query('SELECT public.jobvance_admin_session($1,$2)', [owner, '00000000-0000-4000-8000-0000000000ff'])).rejects.toThrow(/ADMIN_NOT_FOUND/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query('SELECT * FROM public.jobvance_events')).rejects.toThrow(/permission denied/);
      await expect(db.query('SELECT public.jobvance_track($1,$2,NULL,$3,$3,$4)', [strangerBrowser, strangerVisit, '{}', '[]'])).rejects.toThrow(/permission denied/);
      await db.exec('RESET ROLE');
    }
  });
});
