// @vitest-environment node
// Native platform extensions cannot run inside PGlite. Their transport is
// explicitly stubbed; ticket authorization and SQL dispatch gates run for real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.job_loop_scheduler_config(singleton boolean PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,last_dispatch_at timestamptz);
    INSERT INTO public.job_loop_scheduler_config VALUES(true,false,null);
    CREATE TABLE public.job_loop_schedules(status text,next_run_at timestamptz,lease_until timestamptz);
    CREATE TABLE public.job_loop_runs(status text,lease_until timestamptz);
    CREATE SCHEMA cron; CREATE TABLE cron.job(jobname text PRIMARY KEY,schedule text,active boolean);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cron.job VALUES($1,$2,true) ON CONFLICT(jobname) DO UPDATE SET schedule=$2,active=true; RETURN 1; END $$;
    CREATE SCHEMA net; CREATE TABLE net.requests(id bigint GENERATED ALWAYS AS IDENTITY,url text,headers jsonb,body jsonb);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE id bigint; BEGIN INSERT INTO net.requests(url,headers,body) VALUES($1,$2,$3) RETURNING net.requests.id INTO id; RETURN id; END $$;`);
  await database.exec(await readFile('supabase/migrations/20261011040000_job_loop_scheduler_dispatch.sql', 'utf8'));
  const platform = await readFile('supabase/migrations/20261011050000_job_loop_cron_platform.sql', 'utf8');
  await database.exec(platform.replace(/^CREATE EXTENSION[^;]+;\s*$/gm, ''));
}, 30000);
afterAll(async () => { await database?.close(); });

describe('real SQL unattended dispatch boundaries', () => {
  it('denies browser reads, minting and ticket-consumption authority', async () => {
    for (const query of ['SELECT * FROM public.job_loop_dispatch_tickets', 'SELECT public.job_loop_dispatch_due()', `SELECT public.job_loop_consume_dispatch_ticket('${randomUUID()}')`]) {
      await expect(database.transaction(async tx => { await tx.exec('SET LOCAL ROLE authenticated'); return tx.query(query); })).rejects.toThrow(/permission denied/i);
    }
  });
  it('consumes one enabled, unexpired ticket exactly once; holds disabled or expired tickets', async () => {
    const ticket = randomUUID(), expired = randomUUID();
    await database.query('INSERT INTO job_loop_dispatch_tickets(ticket) VALUES($1)', [ticket]);
    expect((await database.query<{ valid: boolean }>('SELECT job_loop_consume_dispatch_ticket($1) AS valid', [ticket])).rows[0].valid).toBe(false);
    await database.exec('UPDATE job_loop_scheduler_config SET enabled=true');
    expect((await database.query<{ valid: boolean }>('SELECT job_loop_consume_dispatch_ticket($1) AS valid', [ticket])).rows[0].valid).toBe(true);
    expect((await database.query<{ valid: boolean }>('SELECT job_loop_consume_dispatch_ticket($1) AS valid', [ticket])).rows[0].valid).toBe(false);
    await database.query("INSERT INTO job_loop_dispatch_tickets(ticket,issued_at,expires_at) VALUES($1,now()-interval '3 minutes',now()-interval '1 minute')", [expired]);
    expect((await database.query<{ valid: boolean }>('SELECT job_loop_consume_dispatch_ticket($1) AS valid', [expired])).rows[0].valid).toBe(false);
  });
  it('keeps idle queues network-free and dispatches stalled work even without a currently due schedule', async () => {
    await database.exec("UPDATE job_loop_scheduler_config SET enabled=true,api_origin='https://fixture.supabase.co'");
    expect((await database.query<{ id: number | null }>('SELECT job_loop_dispatch_due() AS id')).rows[0].id).toBe(null);
    await database.exec("INSERT INTO job_loop_runs VALUES('queued',NULL)");
    const dispatched = (await database.query<{ id: number }>('SELECT job_loop_dispatch_due() AS id')).rows[0].id;
    expect(dispatched).toBeGreaterThan(0);
    const payload = (await database.query<{ url: string; headers: Record<string, string>; body: unknown }>('SELECT url,headers,body FROM net.requests WHERE id=$1', [dispatched])).rows[0];
    expect(payload.url).toBe('https://fixture.supabase.co/functions/v1/job-loop-worker');
    expect(payload.body).toEqual({ action: 'run_due' });
    expect(payload.headers).not.toHaveProperty('Authorization');
    expect(payload.headers['x-job-loop-schedule-ticket']).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('reports scheduler availability only with enabled configuration, recent dispatch and active cron', async () => {
    expect((await database.query<{ state: { ready: boolean } }>('SELECT job_loop_scheduler_state() AS state')).rows[0].state.ready).toBe(true);
    await database.exec('UPDATE cron.job SET active=false');
    expect((await database.query<{ state: { ready: boolean } }>('SELECT job_loop_scheduler_state() AS state')).rows[0].state.ready).toBe(false);
    await database.exec("UPDATE cron.job SET active=true; UPDATE job_loop_scheduler_config SET last_dispatch_at=now()-interval '16 minutes'");
    expect((await database.query<{ state: { ready: boolean } }>('SELECT job_loop_scheduler_state() AS state')).rows[0].state.ready).toBe(false);
  });
});
