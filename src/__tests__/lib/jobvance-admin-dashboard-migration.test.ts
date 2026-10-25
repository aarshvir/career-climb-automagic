// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { dashboardSchema } from '../../lib/admin-dashboard';
import type { AdminDashboard } from '../../lib/admin-types';

let db: PGlite;
const owner = 'be619aa5-b1b8-4978-8780-b62461361980';
const payer = '00000000-0000-4000-8000-000000000011';
const free = '00000000-0000-4000-8000-000000000012';
const qa = '00000000-0000-4000-8000-000000000013';
const operator = '00000000-0000-4000-8000-000000000014';
const old = '00000000-0000-4000-8000-000000000015';
const passBuyer = '00000000-0000-4000-8000-000000000016';
const request = '00000000-0000-4000-8000-000000000021';
const request2 = '00000000-0000-4000-8000-000000000022';
const quote = '00000000-0000-4000-8000-000000000031';
async function dashboard(actor = owner, days = 30) { return (await db.query<{ result: AdminDashboard }>('SELECT public.jobvance_admin_dashboard($1,$2) AS result', [actor, days])).rows[0].result; }

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
  await db.query(`INSERT INTO auth.users(id,email,created_at,last_sign_in_at,raw_user_meta_data) VALUES
    ($1,'payer@work.org',now()-interval '5 days',now()-interval '1 hour','{}'),
    ($2,'free@mail.com',now()-interval '2 days',NULL,'{}'),
    ($3,'jobvance-qa@example.com',now()-interval '3 days',NULL,'{"qa_fixture":true}'),
    ($4,'operator@work.org',now()-interval '100 days',NULL,'{}'),
    ($5,'old@mail.com',now()-interval '45 days',NULL,'{}'),
    ($6,'pass@mail.com',now()-interval '1 day',NULL,'{}')`, [payer, free, qa, operator, old, passBuyer]);
  await db.query(`INSERT INTO public.jobvance_admin_members(user_id,role,active) VALUES($1,'operator',true)`, [operator]);
  // The payer finished set-up, got a run and approved a pack; the free user only tailored a CV.
  await db.query(`INSERT INTO public.job_loop_records VALUES($1,0,'{"profile":{"name":"x"}}'),($2,0,'{"profile":null}')`, [payer, free]);
  await db.query(`INSERT INTO public.job_loop_runs(user_id,status,created_at,finished_at,data) VALUES
    ($1,'completed',now()-interval '4 days',now()-interval '4 days','{}'),
    ($1,'failed',now()-interval '1 day',now()-interval '1 day','{"messages":["Employer sources did not answer."]}'),
    ($1,'running',now()-interval '2 hours',NULL,'{}'),
    ($2,'completed',now()-interval '1 day',now()-interval '1 day','{}')`, [payer, qa]);
  await db.query(`INSERT INTO public.job_loop_packets(user_id,status,approved_at) VALUES($1,'approved',now()-interval '3 days')`, [payer]);
  await db.query(`INSERT INTO public.jobvance_tailor_usage(user_id,status,month,actual_micros,created_at) VALUES
    ($1,'settled',to_char(now(),'YYYY-MM'),2000,now()-interval '1 day'),(NULL,'settled',to_char(now(),'YYYY-MM'),1000,now()),($2,'settled',to_char(now(),'YYYY-MM'),1000,now()),($1,'uncertain',to_char(now(),'YYYY-MM'),NULL,now())`, [free, qa]);
  await db.query(`INSERT INTO public.job_loop_pilot_users VALUES($1,true),($2,true),($3,false)`, [qa, payer, free]);
  // Job Loop paid in INR (Dodo reported the USD amount) plus a Job Search pass, and a refunded pass.
  await db.query(`INSERT INTO jobvance_private.loop_billing_orders VALUES($1,$2,'live','weekly','ready',now()+interval '1 day',now()-interval '4 days'),($3,$4,'live','weekly','ready',now()+interval '2 days',now())`, [payer, request, free, request2]);
  await db.query(`INSERT INTO jobvance_private.loop_subscriptions VALUES('sub_a',$1,$2,'live','weekly','active',now()+interval '26 days',false,NULL,false,NULL,NULL)`, [payer, request]);
  await db.query(`INSERT INTO jobvance_private.loop_subscription_periods VALUES('live','pay_a','sub_a',now()-interval '4 days',now()+interval '26 days',249900,'INR',false),('test','pay_t','sub_a',now()-interval '4 days',now()+interval '26 days',2900,'USD',false)`);
  await db.query(`INSERT INTO jobvance_private.loop_provider_accounting VALUES('live','pay_a',2950)`);
  await db.query(`INSERT INTO public.billing_orders(user_id,request_id,billing_mode,payment_intent,status,amount,plan,created_at) VALUES
    ($1,$2,'live','dodo_pay_1','paid',1900,'search_30d',now()-interval '20 hours'),($3,$4,'live','dodo_pay_2','refunded',1900,'search_30d',now()-interval '3 days'),($1,$5,'test','dodo_pay_3','paid',1900,'search_30d',now())`, [passBuyer, request, payer, request2, quote]);
  await db.query(`INSERT INTO public.billing_payments(payment_intent,user_id,paid_at,refund_amount) VALUES('dodo_pay_1',$1,now()-interval '20 hours',0),('dodo_pay_2',$2,now()-interval '3 days',1900)`, [passBuyer, payer]);
  await db.query(`INSERT INTO public.jobvance_passes VALUES($1,'search_30d','live','active',now()+interval '29 days')`, [passBuyer]);
  await db.query(`INSERT INTO jobvance_private.loop_billing_pending_fulfillment(mode,event_id,user_id) VALUES('live','evt_1',$1)`, [free]);
  await db.query(`INSERT INTO public.job_loop_support_requests(user_id,category,message,created_at) VALUES($1,'bug','It broke',now()-interval '2 days'),($2,'help','qa',now())`, [payer, qa]);
  await db.query(`INSERT INTO public.jobvance_guest_support_requests(created_at) VALUES(now())`);
  await db.query(`INSERT INTO public.job_loop_schedules VALUES($1,'active',now()-interval '1 hour',NULL)`, [payer]);
}, 30000);
afterAll(async () => { await db?.close(); });

describe('admin dashboard SQL', () => {
  it('returns a payload the browser contract accepts', async () => {
    const result = await dashboard();
    expect(() => dashboardSchema.parse(result)).not.toThrow();
    expect(result.actor).toEqual({ id: owner, role: 'owner' });
    expect(result.window.days).toBe(30);
    expect(result.daily).toHaveLength(30);
  });

  it('leaves test and staff accounts out of people figures', async () => {
    const result = await dashboard();
    expect(result.coverage).toMatchObject({ realUsers: 4, excludedTest: 1, excludedStaff: 2 });
    expect(result.users.map(user => user.id).sort()).toEqual([payer, free, old, passBuyer].sort());
    expect(result.kpis.find(kpi => kpi.key === 'signups')).toMatchObject({ current: 3, previous: 1 });
    // The guest tailoring counts; the QA account's does not, nor does an unsettled one.
    expect(result.kpis.find(kpi => kpi.key === 'cv_checks')?.current).toBe(2);
    expect(result.kpis.find(kpi => kpi.key === 'runs')?.current).toBe(1);
  });

  it('shows full emails to the owner and masked emails to operators', async () => {
    expect((await dashboard()).users.find(user => user.id === payer)?.emailDisplay).toBe('payer@work.org');
    expect((await dashboard(operator)).users.find(user => user.id === payer)?.emailDisplay).toBe('p***@work.org');
  });

  it('counts live revenue from both ledgers after refunds', async () => {
    const { revenue, kpis } = await dashboard();
    // 29.50 from the INR subscription (Dodo's USD figure) + 19 from the pass; the refunded pass is 0.
    expect(revenue.allTimeUsd).toBeCloseTo(48.5);
    expect(revenue.allTimeOrders).toBe(2);
    expect(revenue.unknownUsdPayments).toBe(0);
    expect(revenue.payingCustomers).toBe(2);
    expect(revenue.byCurrency).toEqual(expect.arrayContaining([{ currency: 'INR', amountMinor: 249900, orders: 1 }, { currency: 'USD', amountMinor: 1900, orders: 1 }]));
    expect(revenue.subscriptions).toMatchObject({ active: 1, cancelling: 0, pastDue: 0 });
    expect(revenue.recent.find(row => row.status === 'refunded')?.usd).toBe(0);
    expect(revenue.attention.find(item => item.key === 'unfulfilled')?.count).toBe(1);
    expect(revenue.attention.find(item => item.key === 'refunds')?.count).toBe(1);
    expect(kpis.find(kpi => kpi.key === 'revenue')?.current).toBeCloseTo(48.5);
  });

  it('keeps localized money unknown when USD accounting is absent, while preserving the charged amount', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec("DELETE FROM jobvance_private.loop_provider_accounting WHERE payment_id='pay_a'");
      const result = await dashboard();
      expect(result.revenue).toMatchObject({ allTimeUsd: 19, allTimeOrders: 2, unknownUsdPayments: 1 });
      expect(result.revenue.recent.find(row => row.plan === 'Job Loop Starter')).toMatchObject({ amountMinor: 249900, currency: 'INR', usd: null, status: 'paid' });
      expect(result.revenue.byCurrency).toContainEqual({ currency: 'INR', amountMinor: 249900, orders: 1 });
      expect(result.coverage.notes.join(' ')).toContain('no list-price conversion is estimated');
      expect(() => dashboardSchema.parse(result)).not.toThrow();
    } finally { await db.exec('ROLLBACK'); }
  });

  it('keeps a historical payer marked paid even with unknown FX and no current paid plan', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec("DELETE FROM jobvance_private.loop_provider_accounting WHERE payment_id='pay_a'; UPDATE jobvance_private.loop_subscriptions SET status='expired',valid_until=now()-interval '1 day' WHERE subscription_id='sub_a'");
      const result = await dashboard();
      expect(result.users.find(row => row.id === payer)).toMatchObject({ plan: null, paidUsd: 0, hasPaid: true });
      expect(result.users.find(row => row.id === free)?.hasPaid).toBe(false);
      expect(result.revenue.unknownUsdPayments).toBe(1);
      expect(() => dashboardSchema.parse(result)).not.toThrow();
    } finally { await db.exec('ROLLBACK'); }
  });

  it('does not turn a revoked Loop period into an invented full monetary refund', async () => {
    await db.exec('BEGIN');
    try {
      // A partial refund or provider refund-status signal revokes access, but the
      // period ledger does not retain how much money was actually refunded.
      await db.exec("UPDATE jobvance_private.loop_subscription_periods SET revoked=true WHERE mode='live' AND payment_id='pay_a'");
      const result = await dashboard();
      expect(result.revenue).toMatchObject({ allTimeUsd: 19, allTimeOrders: 1, unknownUsdPayments: 1 });
      expect(result.revenue.recent.find(row => row.plan === 'Job Loop Starter')).toMatchObject({ amountMinor: 249900, currency: 'INR', usd: null, status: 'refund_or_access_revoked' });
      expect(result.revenue.byCurrency).toEqual([{ currency: 'USD', amountMinor: 1900, orders: 1 }]);
      expect(() => dashboardSchema.parse(result)).not.toThrow();
    } finally { await db.exec('ROLLBACK'); }
  });

  it('reports a partially refunded pass consistently across today, totals, plans and original charge details', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec("UPDATE public.billing_payments SET refund_amount=500,paid_at=now()-interval '1 minute' WHERE payment_intent='dodo_pay_1'; UPDATE public.billing_orders SET status='refunded' WHERE payment_intent='dodo_pay_1'");
      const result = await dashboard();
      expect(result.revenue).toMatchObject({ allTimeUsd: 43.5, allTimeOrders: 2, payingCustomers: 2, unknownUsdPayments: 0 });
      expect(result.today.find(item => item.key === 'revenue')?.today).toBe(14);
      expect(result.today.find(item => item.key === 'paid_orders')?.today).toBe(1);
      expect(result.kpis.find(item => item.key === 'revenue')?.current).toBe(43.5);
      expect(result.revenue.byPlan.find(item => item.label === 'Job Search pass')).toMatchObject({ usd: 14, orders: 1 });
      expect(result.revenue.byCurrency).toContainEqual({ currency: 'USD', amountMinor: 1400, orders: 1 });
      expect(result.revenue.recent.find(row => row.userId === passBuyer)).toMatchObject({ amountMinor: 1900, currency: 'USD', usd: 14, status: 'partial_refund' });
      expect(result.users.find(row => row.id === passBuyer)?.paidUsd).toBe(14);
      expect(() => dashboardSchema.parse(result)).not.toThrow();
    } finally { await db.exec('ROLLBACK'); }
  });

  it('distinguishes a fully refunded pass from a positive remaining net amount', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec("UPDATE public.billing_payments SET refund_amount=1900 WHERE payment_intent='dodo_pay_1'; UPDATE public.billing_orders SET status='refunded' WHERE payment_intent='dodo_pay_1'");
      const result = await dashboard();
      expect(result.revenue).toMatchObject({ allTimeUsd: 29.5, allTimeOrders: 1, unknownUsdPayments: 0 });
      expect(result.revenue.recent.find(row => row.userId === passBuyer)).toMatchObject({ usd: 0, status: 'refunded' });
    } finally { await db.exec('ROLLBACK'); }
  });

  it('does not show a paid plan from an old lifecycle generation as current access', async () => {
    await db.exec('BEGIN');
    try {
      await db.query("INSERT INTO public.job_loop_lifecycle VALUES($1,0,'active')", [payer]);
      await db.exec("UPDATE jobvance_private.loop_subscriptions SET generation=0,period_start=now()-interval '4 days' WHERE subscription_id='sub_a'");
      expect((await dashboard()).revenue.subscriptions.active).toBe(1);
      await db.query('UPDATE public.job_loop_lifecycle SET generation=1 WHERE user_id=$1', [payer]);
      const stale = await dashboard();
      expect(stale.revenue.subscriptions.active).toBe(0);
      expect(stale.users.find(row => row.id === payer)?.plan).toBeNull();
      // Financial history remains recorded even though career-data authority changed.
      expect(stale.revenue.allTimeUsd).toBe(48.5);
    } finally { await db.exec('ROLLBACK'); }
  });

  it('requires active lifecycle, a current non-revoked paid period and paid-through cancellation authority', async () => {
    await db.exec('BEGIN');
    try {
      await db.query("INSERT INTO public.job_loop_lifecycle VALUES($1,0,'active')", [payer]);
      await db.exec("UPDATE jobvance_private.loop_subscriptions SET generation=0,period_start=now()-interval '4 days' WHERE subscription_id='sub_a'");
      for (const mutation of [
        "UPDATE public.job_loop_lifecycle SET state='erasing'",
        "UPDATE jobvance_private.loop_subscriptions SET period_start=now()+interval '1 day'",
        "UPDATE jobvance_private.loop_subscription_periods SET starts_at=now()+interval '1 day' WHERE mode='live'",
        "UPDATE jobvance_private.loop_subscription_periods SET revoked=true WHERE mode='live'",
      ]) {
        await db.exec('SAVEPOINT authority_case');
        await db.exec(mutation);
        const result = await dashboard();
        expect(result.revenue.subscriptions.active, mutation).toBe(0);
        expect(result.users.find(row => row.id === payer)?.plan, mutation).toBeNull();
        await db.exec('ROLLBACK TO SAVEPOINT authority_case');
      }
      await db.exec("UPDATE jobvance_private.loop_subscriptions SET status='cancelled',cancel_at_period_end=false WHERE subscription_id='sub_a'");
      expect((await dashboard()).revenue.subscriptions.cancelling).toBe(0);
      expect((await dashboard()).users.find(row => row.id === payer)?.plan).toBeNull();
      await db.exec("UPDATE jobvance_private.loop_subscriptions SET cancel_at_period_end=true WHERE subscription_id='sub_a'");
      expect((await dashboard()).revenue.subscriptions.cancelling).toBe(1);
      expect((await dashboard()).users.find(row => row.id === payer)?.plan).toBe('Starter · cancelling');
    } finally { await db.exec('ROLLBACK'); }
  });

  it('does not join a live period to a subscription from a different provider mode', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec("UPDATE jobvance_private.loop_subscriptions SET mode='test' WHERE subscription_id='sub_a'");
      const result = await dashboard();
      expect(result.revenue).toMatchObject({ allTimeUsd: 19, allTimeOrders: 1, unknownUsdPayments: 0 });
      expect(result.revenue.recent.some(row => row.plan === 'Job Loop Starter')).toBe(false);
    } finally { await db.exec('ROLLBACK'); }
  });

  it('documents bounded retention and service-period dating instead of claiming complete return or cash-flow data', async () => {
    const { coverage } = await dashboard();
    expect(coverage.notes.join(' ')).toContain('at most 200 events per account');
    expect(coverage.notes.join(' ')).toContain('login-only returns are not counted');
    expect(coverage.notes.join(' ')).toContain('paid service-period start');
    expect(coverage.notes.join(' ')).toContain('not a refund cash-flow ledger');
    expect(coverage.notes.join(' ')).toContain('latest 500');
  });

  it('allows only the server role to invoke the administrator-checked dashboard and fixes its execution context', async () => {
    const facts = (await db.query<{ definer: boolean; config: string[]; server: boolean; browser: boolean; guest: boolean }>(`SELECT p.prosecdef AS definer,p.proconfig AS config,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS server,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS browser,
      has_function_privilege('anon',p.oid,'EXECUTE') AS guest
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='jobvance_admin_dashboard'`)).rows[0];
    expect(facts).toMatchObject({ definer: true, server: true, browser: false, guest: false });
    expect(facts.config).toEqual(expect.arrayContaining(['search_path=""', 'TimeZone=UTC']));
    await db.exec('SET ROLE service_role');
    try {
      expect((await dashboard()).actor).toEqual({ id: owner, role: 'owner' });
      await expect(dashboard(payer)).rejects.toThrow(/ADMIN_FORBIDDEN/);
    } finally { await db.exec('RESET ROLE'); }
  });

  it('reports places as the capacity rules see them, including test holders', async () => {
    const result = await dashboard();
    // Paid: the payer's subscription plus the free user's unpaid checkout hold.
    expect(result.revenue.places).toEqual({ paidUsed: 2, paidCapacity: 100, pilotUsed: 2, pilotCapacity: 10 });
    expect(result.coverage.notes.join(' ')).toContain('1 of the 2 free Job Loop places are held by test or staff accounts');
    expect(result.coverage.notes.join(' ')).toContain('includes unpaid checkout reservations for up to 96 hours');
    expect(result.users.find(user => user.id === payer)).toMatchObject({ plan: 'Starter', paidUsd: 29.5, runs: 1, failedRuns: 1, hasProfile: true, pilot: true });
    expect(result.users.find(user => user.id === passBuyer)?.plan).toBe('Job Search pass');
  });

  it('builds a nested sign-up funnel for the window', async () => {
    const { funnel } = await dashboard();
    expect(funnel.map(stage => stage.count)).toEqual([3, 2, 1, 1, 1]);
  });

  it('flags failed, stuck and waiting work on the ops page', async () => {
    const { ops } = await dashboard();
    const count = (key: string) => ops.checks.find(check => check.key === key)?.count;
    expect(count('failed_runs')).toBe(1);
    expect(count('stuck_runs')).toBe(1);
    expect(count('overdue_schedules')).toBe(1);
    expect(count('unfulfilled')).toBe(1);
    expect(count('support_waiting')).toBe(1);
    expect(count('holding')).toBe(1);
    expect(ops.problems.find(problem => problem.kind === 'Failed run')?.detail).toBe('Employer sources did not answer.');
    expect(ops.budget.actualUsd).toBeCloseTo(0.004);
    expect(ops.schedulerEnabled).toBe(true);
  });

  it('refuses non-admins and keeps the functions away from browser roles', async () => {
    await expect(dashboard(payer)).rejects.toThrow(/ADMIN_FORBIDDEN/);
    await expect(db.query('SELECT public.jobvance_admin_dashboard($1,7)', [owner])).resolves.toBeTruthy();
    await expect(db.query('SELECT public.jobvance_admin_dashboard($1,14)', [owner])).rejects.toThrow(/ADMIN_INPUT_INVALID/);
    await expect(db.query('SELECT public.jobvance_admin_dashboard($1,NULL)', [owner])).rejects.toThrow(/ADMIN_INPUT_INVALID/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      for (const call of ['public.jobvance_admin_dashboard($1,30)', 'public.jobvance_admin_people()', 'public.jobvance_admin_payments()', "public.jobvance_admin_email('customer@work.org',true)"]) {
        await expect(db.query(`SELECT ${call}`, call.includes('$1') ? [owner] : [])).rejects.toThrow(/permission denied/);
      }
      await db.exec('RESET ROLE');
    }
  });
});
