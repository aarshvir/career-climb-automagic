// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { controlAdmin, type AdminDatabase } from '../../../supabase/functions/_shared/jobvance-admin';
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
type Ack = { batchId: string; accepted: number; inserted: number; duplicate: boolean };
const pages = new Map<string, string>();
const adContext = { landing: '/onboarding?utm_source=instagram&utm_campaign=us-cv&utm_content=C-man', utm_source: 'instagram', utm_campaign: 'us-cv', utm_content: 'C-man', fbclid: true };
const track = (visitor: string, session: string, user: string | null, context: object, events: object[], device: object = phoneDevice, batch = randomUUID()) => {
  const admitted = events.map(item => {
    const value = item as Record<string, unknown>, key = session + ':' + value.path;
    if (value.kind === 'page_view' && !value.pageId) pages.set(key, randomUUID());
    const pageId = value.pageId ?? pages.get(key) ?? randomUUID();
    return { id: randomUUID(), pageId, ...value };
  });
  return call<Ack>('SELECT public.jobvance_track($1,$2,$3,$4,$5,$6,$7) AS result', [visitor, session, batch, user, JSON.stringify(context), JSON.stringify(device), JSON.stringify(admitted)]);
};

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
  await track(caseyBrowser, adVisit, null, adContext, [
    { kind: 'page_view', at: at(60), path: '/job-loop', title: 'Job Loop' },
    { kind: 'click', at: at(59.5), path: '/job-loop', label: 'Start Job Loop', href: '/onboarding' },
    { kind: 'page_leave', at: at(59.3), path: '/job-loop', durationMs: 40000, props: { maxScroll: 75 } },
    { kind: 'page_view', at: at(59.2), path: '/auth?mode=signup', title: 'Sign up' },
    { kind: 'form_submit', at: at(58), path: '/auth?mode=signup', label: 'Create your Jobvance account' },
  ]);
  await track(caseyBrowser, adVisit, casey, adContext, [
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
    await expect(track(strangerBrowser, adVisit, null, {}, [{ kind: 'page_view', at: at(1), path: '/' }])).rejects.toThrow(/TRACK_SESSION_CONFLICT/);
    await expect(track(strangerBrowser, strangerVisit, null, {}, [{ kind: 'nonsense', at: at(1), path: '/' }, { kind: 'click', at: at(1), path: 'no-slash' }])).rejects.toThrow(/TRACK_INPUT_INVALID/);
  });

  it('reports visitors, channels, pages and people, leaving out staff', async () => {
    const result = analyticsSchema.parse(await call('SELECT public.jobvance_admin_analytics($1,30) AS result', [owner]));
    expect(result.totals).toMatchObject({ visitors: 2, sessions: 3, newAccounts: 1 });
    expect(result.channels.map(channel => channel.label).sort()).toEqual(['AI assistants', 'Meta ads (Instagram / Facebook)', 'Search engines']);
    expect(result.channels.find(channel => channel.label.startsWith('Meta'))).toMatchObject({ sessions: 1, newAccounts: 1 });
    expect(result.channels.find(channel => channel.label === 'Search engines')).toMatchObject({ sessions: 1, newAccounts: 0 });
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
      await expect(db.query('SELECT public.jobvance_track($1,$2,$3,NULL,$4,$4,$5)', [strangerBrowser, strangerVisit, randomUUID(), '{}', '[]'])).rejects.toThrow(/permission denied/);
      for (const table of ['jobvance_visitors','jobvance_sessions','jobvance_tracking_batches','jobvance_events','jobvance_analytics_coverage']) await expect(db.query('SELECT * FROM public.' + table)).rejects.toThrow(/permission denied/);
      await db.exec('RESET ROLE');
    }
  });
});


describe('immutable analytics measurement and attribution', () => {
  const event = (kind = 'page_view', extra: Record<string, unknown> = {}) => ({ id: randomUUID(), pageId: randomUUID(), kind, at: at(2), path: '/loop', ...extra });
  const scope = () => ({ visitor: randomUUID(), session: randomUUID(), batch: randomUUID(), context: { landing: '/loop' } });
  const raw = (s: ReturnType<typeof scope>, events: object[], user: string | null = null, batch = s.batch, context: object = s.context) =>
    call<Ack>('SELECT public.jobvance_track($1,$2,$3,$4,$5,$6,$7) AS result', [s.visitor,s.session,batch,user,JSON.stringify(context),JSON.stringify(phoneDevice),JSON.stringify(events)]);

  it('returns the original batch receipt on exact retry and deduplicates exact events in a new batch', async () => {
    const s = scope(), events = [event()];
    const receipt = await raw(s, events);
    expect(receipt).toEqual({ batchId: s.batch, accepted: 1, inserted: 1, duplicate: false });
    expect(await raw(s, events)).toEqual(receipt);
    const next = randomUUID();
    expect(await raw(s, events, null, next)).toEqual({ batchId: next, accepted: 1, inserted: 0, duplicate: true });
    expect(await raw(s, events)).toEqual(receipt);
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM public.jobvance_events WHERE session_id=$1',[s.session])).rows[0].n).toBe(1);
  });

  it('rejects changed batch payload, actor, event payload and mixed batches without inserting partial rows', async () => {
    const s = scope(), events = [event()]; await raw(s, events);
    await expect(raw(s, [{...events[0], title:'Changed'}])).rejects.toThrow(/TRACK_BATCH_CONFLICT/);
    await expect(raw(s, events, casey)).rejects.toThrow(/TRACK_BATCH_CONFLICT/);
    await expect(raw(s, [{...events[0], title:'Changed'},event('click')], null, randomUUID())).rejects.toThrow(/TRACK_EVENT_CONFLICT/);
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM public.jobvance_events WHERE session_id=$1',[s.session])).rows[0].n).toBe(1);
    expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM public.jobvance_tracking_batches WHERE session_id=$1',[s.session])).rows[0].n).toBe(1);
  });

  it('binds event and exposure UUIDs to one visitor/session/path', async () => {
    const s=scope(), e=event(); await raw(s,[e]);
    const other=scope();
    await expect(raw(other,[e])).rejects.toThrow(/TRACK_EVENT_CONFLICT/);
    await expect(raw(other,[event('click',{pageId:e.pageId})])).rejects.toThrow(/TRACK_EVENT_CONFLICT/);
    await expect(raw(s,[event('click',{pageId:e.pageId,path:'/pricing'})],null,randomUUID())).rejects.toThrow(/TRACK_EVENT_CONFLICT/);
    await expect(raw(s,[event('page_view',{pageId:e.pageId})],null,randomUUID())).rejects.toThrow(/TRACK_EVENT_CONFLICT/);
  });

  it('keeps an original anonymous receipt and actor intact after first-account linking', async () => {
    const s=scope(), events=[event()]; const receipt=await raw(s,events);
    await raw(s,[event('identify',{pageId:events[0].pageId})],casey,randomUUID());
    expect(await raw(s,events)).toEqual(receipt);
    const stored=(await db.query<{user_id:string,original_user_id:string|null}>('SELECT user_id,original_user_id FROM public.jobvance_events WHERE event_id=$1',[events[0].id])).rows[0];
    expect(stored).toEqual({user_id:casey,original_user_id:null});
    await expect(raw(s,[event('click')],null,randomUUID())).rejects.toThrow(/TRACK_SESSION_CONFLICT/);
  });

  it('links first anonymous browser history once, and never gives a later account another person’s visits', async () => {
    const b=randomUUID(); await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'jordan@work.org','{\"full_name\":\"Jordan Example\"}')",[b]);
    const a=scope(), earlier={...a,session:randomUUID(),batch:randomUUID()};
    await raw(earlier,[event()]); await raw(a,[event()]); await raw(a,[event('identify')],casey,randomUUID());
    const anon={...a,session:randomUUID(),batch:randomUUID()}; await raw(anon,[event()]);
    await raw(anon,[event('identify')],b,randomUUID());
    await expect(raw(a,[event('click')],b,randomUUID())).rejects.toThrow(/TRACK_SESSION_CONFLICT/);
    expect((await db.query<{user_id:string}>('SELECT user_id FROM public.jobvance_visitors WHERE visitor_id=$1',[a.visitor])).rows[0].user_id).toBe(casey);
    const person=personSchema.parse(await call('SELECT public.jobvance_admin_person($1,$2) result',[owner,b]));
    expect(person.totals.visits).toBe(1); expect(person.visits.map(v=>v.id)).toEqual([anon.session]);
    const old=await call<{userId:string,otherVisits:number}>('SELECT public.jobvance_admin_session($1,$2) result',[owner,earlier.session]);
    expect(old.userId).toBe(casey);
    const current=await call<{userId:string,otherVisits:number}>('SELECT public.jobvance_admin_session($1,$2) result',[owner,anon.session]);
    expect(current.userId).toBe(b); expect(current.otherVisits).toBe(0);
  });

  it('does not reinterpret a deleted account as anonymous or accept a nonexistent fresh owner', async () => {
    const gone=randomUUID(),s=scope(); await db.query("INSERT INTO auth.users(id,email) VALUES($1,'gone@work.org')",[gone]);
    const events=[event()],receipt=await raw(s,events,gone); await db.query('DELETE FROM auth.users WHERE id=$1',[gone]);
    expect(await raw(s,events,gone)).toEqual(receipt);
    await expect(raw(s,[event('click')],null,randomUUID())).rejects.toThrow(/TRACK_SESSION_CONFLICT/);
    await expect(raw(scope(),[event()],gone)).rejects.toThrow(/TRACK_USER_INVALID/);
    expect((await db.query<{user_id:string}>('SELECT user_id FROM public.jobvance_sessions WHERE session_id=$1',[s.session])).rows[0].user_id).toBe(gone);
  });

  it('groups repeated URLs and late leave segments by actual page exposure, not the next URL visit', async () => {
    const s=scope(),first=randomUUID(),second=randomUUID();
    await raw(s,[event('page_view',{pageId:first,at:at(20)}),event('page_view',{pageId:second,at:at(19)}),
      event('page_leave',{pageId:first,at:at(18),durationMs:11000,props:{maxScroll:30}}),event('page_leave',{pageId:second,at:at(17),durationMs:22000,props:{maxScroll:80}})]);
    const visit=sessionSchema.parse(await call('SELECT public.jobvance_admin_session($1,$2) result',[owner,s.session]));
    expect(visit.events.filter(e=>e.kind==='page_view').map(e=>[e.seconds,e.scroll])).toEqual([[11,30],[22,80]]);
    expect((await db.query<{seconds:number}>("SELECT seconds FROM public.jobvance_admin_visits(now()-interval '1 day',now()) WHERE session_id=$1",[s.session])).rows[0].seconds).toBe(33);
  });

  it('rejects mixed or oversized events atomically and distinguishes paid from organic social', async () => {
    const s=scope(); await expect(raw(s,[event(),event('nonsense')])).rejects.toThrow(/TRACK_INPUT_INVALID/);
    await expect(raw(s,[event(),[]])).rejects.toThrow(/TRACK_INPUT_INVALID/);
    await expect(raw(s,[event('page_leave')])).rejects.toThrow(/TRACK_INPUT_INVALID/);
    await expect(raw(s,Array.from({length:26},()=>event()))).rejects.toThrow(/TRACK_INPUT_INVALID/);
    await expect(raw(s,[event('click',{props:{maxScroll:'not a number'}})])).rejects.toThrow(/TRACK_INPUT_INVALID/);
    expect(await call('SELECT public.jobvance_channel($1) result',[JSON.stringify({utm_source:'instagram',utm_medium:'organic'})])).toBe('Social (unpaid)');
    expect(await call('SELECT public.jobvance_channel($1) result',[JSON.stringify({utm_source:'instagram',utm_medium:'paid_social'})])).toBe('Meta ads (Instagram / Facebook)');
    expect(await call('SELECT public.jobvance_channel($1) result',[JSON.stringify({utm_source:'facebook'})])).toBe('Social (unpaid)');
    expect(await call('SELECT public.jobvance_channel($1) result',[JSON.stringify({utm_source:'google',utm_medium:'cpc'})])).toBe('Google ads');
  });

  it('keeps original visit context bound while changed device observations do not invalidate retries', async () => {
    const s=scope(),events=[event()],receipt=await raw(s,events,casey);
    await expect(raw(s,[event('click')],casey,randomUUID(),{landing:'/pricing'})).rejects.toThrow(/TRACK_SESSION_CONFLICT/);
    expect(await call('SELECT public.jobvance_track($1,$2,$3,$4,$5,$6,$7) result',[
      s.visitor,s.session,s.batch,casey,JSON.stringify(s.context),JSON.stringify({...phoneDevice,browser:'Chrome',country:'CA'}),JSON.stringify(events)
    ])).toEqual(receipt);
    expect(await call<Ack>('SELECT public.jobvance_track($1,$2,$3,$4,$5,$6,$7) result',[
      s.visitor,s.session,randomUUID(),casey,JSON.stringify(s.context),JSON.stringify({...phoneDevice,browser:'Chrome',country:'CA'}),JSON.stringify([event('click')])
    ])).toMatchObject({accepted:1,inserted:1});
    const row=(await db.query<{context:object,first_context:object,device_context:object}>('SELECT s.context,v.first_context,s.device_context FROM public.jobvance_sessions s JOIN public.jobvance_visitors v USING(visitor_id) WHERE s.session_id=$1',[s.session])).rows[0];
    expect(row.context).toEqual(s.context); expect(row.first_context).toEqual(s.context);
    expect(row.device_context).toEqual(phoneDevice);
  });

  it('excludes actual staff visits without hiding a different real account on the same browser', async () => {
    const session=randomUUID(); await track(ownerBrowser,session,casey,{landing:'/loop'},[{kind:'page_view',at:at(1),path:'/loop'}]);
    const rows=(await db.query<{session_id:string}>("SELECT session_id FROM public.jobvance_admin_visits(now()-interval '1 day',now()) WHERE visitor_id=$1",[ownerBrowser])).rows;
    expect(rows.map(r=>r.session_id)).toEqual([session]);
    expect((await db.query<{user_id:string}>('SELECT user_id FROM public.jobvance_visitors WHERE visitor_id=$1',[ownerBrowser])).rows[0].user_id).toBe(owner);
    await expect(call('SELECT public.jobvance_admin_session($1,$2) result',[owner,ownerVisit])).rejects.toThrow(/ADMIN_NOT_FOUND/);
  });

  it('retains first-recorded-touch acquisition even when that visit predates the selected report window', async () => {
    await db.query("UPDATE public.jobvance_sessions SET started_at=now()-interval '8 days' WHERE session_id=$1",[adVisit]);
    const result=analyticsSchema.parse(await call('SELECT public.jobvance_admin_analytics($1,7) result',[owner]));
    expect(result.channels.find(c=>c.label==='Meta ads (Instagram / Facebook)')).toMatchObject({sessions:0,newAccounts:1});
    expect(result.channels.find(c=>c.label==='Search engines')).toMatchObject({newAccounts:0});
    expect(result.campaigns.find(c=>c.source==='instagram')).toMatchObject({campaign:'us-cv',newAccounts:1});
  });

  it('reports collection start and partial historical coverage instead of pretending the history is complete', async () => {
    const result=await call<{coverage:{startedAt:string,status:string}}>('SELECT public.jobvance_admin_analytics($1,30) result',[owner]);
    expect(result.coverage.status).toBe('partial'); expect(Number.isFinite(Date.parse(result.coverage.startedAt))).toBe(true);
  });

  it('keeps fixed search paths and service-only intake/admin execution', async () => {
    const routines=(await db.query<{proname:string,proconfig:string[]}>("SELECT proname,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('jobvance_track','jobvance_page_exposures','jobvance_admin_analytics','jobvance_admin_session','jobvance_admin_person','jobvance_admin_contacts')")).rows;
    expect(routines).toHaveLength(6); for(const r of routines) expect(r.proconfig).toContain('search_path=""');
    for(const role of ['anon','authenticated']) {
      expect(await call("SELECT has_function_privilege($1,'public.jobvance_track(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE') result",[role])).toBe(false);
      expect(await call("SELECT has_function_privilege($1,'public.jobvance_page_exposures()','EXECUTE') result",[role])).toBe(false);
    }
    expect(await call("SELECT has_function_privilege('service_role','public.jobvance_track(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE') result",[])).toBe(true);
  });

  it('accepts the actual joined campaign width allowed by the intake fields', async () => {
    const s=scope(),context={...s.context,utm_campaign:'c'.repeat(300),utm_content:'a'.repeat(300)};
    await raw(s,[event()],casey,s.batch,context);
    const visit=sessionSchema.parse(await call('SELECT public.jobvance_admin_session($1,$2) result',[owner,s.session]));
    expect(visit.context.utm_campaign).toHaveLength(300);
    const analytics=analyticsSchema.parse(await call('SELECT public.jobvance_admin_analytics($1,30) result',[owner]));
    expect(analytics.sessions.find(row=>row.id===s.session).campaign).toHaveLength(603);
  });

  it('executes the actual new admin controller reads and audit allowlist against their SQL results', async () => {
    const calls: { name: string; args: Record<string, unknown> }[]=[];
    const port={rpc:async(name:string,args:Record<string,unknown>)=>{
      calls.push({name,args});
      try { const keys=Object.keys(args); return { data:await call(`SELECT public.${name}(${keys.map((key,index)=>`${key} => $${index+1}`).join(',')}) result`,Object.values(args)),error:null }; }
      catch(error) { return {data:null,error:{message:(error as Error).message}}; }
    }} as unknown as AdminDatabase;
    const actor={id:owner,role:'owner' as const};
    const analytics=await controlAdmin(port,actor,{action:'analytics',days:7},()=>undefined);
    expect(analyticsSchema.parse(analytics.analytics).coverage.status).toBe('partial');
    const contacts=await controlAdmin(port,actor,{action:'contacts'},()=>undefined);
    expect(contactsSchema.parse(contacts.contacts).some(row=>row.userId===casey)).toBe(true);
    const visit=await controlAdmin(port,actor,{action:'visit',id:adVisit},()=>undefined);
    expect(sessionSchema.parse(visit.visit).person.userId).toBe(casey);
    const person=await controlAdmin(port,actor,{action:'person',id:casey},()=>undefined);
    expect(personSchema.parse(person.person).userId).toBe(casey);
    const audited=calls.filter(row=>row.name==='jobvance_admin_record_event');
    expect(audited.map(row=>row.args)).toEqual([
      {p_actor:owner,p_action:'snapshot',p_details:{days:7}},
      {p_actor:owner,p_action:'snapshot',p_details:{count:(contacts.contacts as unknown[]).length}},
      {p_actor:owner,p_action:'snapshot',p_target:adVisit,p_details:{}},
      {p_actor:owner,p_action:'snapshot',p_target:casey,p_details:{}},
    ]);
    const records=(await db.query<{details:Record<string,unknown>}>('SELECT details FROM public.jobvance_admin_audit ORDER BY at,id')).rows;
    expect(records).toHaveLength(4);
    expect(JSON.stringify(records)).not.toMatch(/Casey|phone|work\.org|97150/);
    await db.query('UPDATE public.jobvance_admin_members SET active=false WHERE user_id=$1',[owner]);
    try { await expect(controlAdmin(port,actor,{action:'analytics',days:7},()=>undefined)).rejects.toMatchObject({code:'ADMIN_FORBIDDEN'}); }
    finally { await db.query('UPDATE public.jobvance_admin_members SET active=true WHERE user_id=$1',[owner]); }
    expect((await db.query<{n:number}>('SELECT count(*)::int n FROM public.jobvance_admin_audit')).rows[0].n).toBe(4);
  });
});
