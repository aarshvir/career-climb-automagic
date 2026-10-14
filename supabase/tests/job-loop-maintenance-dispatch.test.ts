// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db:PGlite;
afterEach(async()=>{await db?.close();});
async function fixture(){
  db=new PGlite();
  await db.exec(`
    CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA cron;CREATE SCHEMA net;
    CREATE TABLE public.job_loop_gc_config(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean NOT NULL DEFAULT false,allowed_owner_ids uuid[] NOT NULL DEFAULT '{}');
    INSERT INTO public.job_loop_gc_config DEFAULT VALUES;
    CREATE TABLE public.job_loop_scheduler_config(singleton boolean PRIMARY KEY DEFAULT true,enabled boolean DEFAULT false,api_origin text,publishable_key text);
    INSERT INTO public.job_loop_scheduler_config VALUES(true,false,'https://fixture.supabase.co','fixture-publishable');
    CREATE TABLE cron.job(jobname text PRIMARY KEY,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(job_name text,schedule text,command text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO cron.job VALUES(job_name,schedule,command,true);RETURN 1;END $$;
    CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,headers jsonb,body jsonb);
    CREATE FUNCTION net.http_post(url text,body jsonb DEFAULT '{}',params jsonb DEFAULT '{}',headers jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 2000)
      RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE result bigint;BEGIN
      INSERT INTO net.calls(url,headers,body)VALUES(url,headers,body)RETURNING id INTO result;RETURN result;END $$;
  `);
  await db.exec(await readFile('supabase/migrations/20261014161304_job_loop_artifact_maintenance_dispatch.sql','utf8'));
  return db;
}
async function value<T>(sql:string):Promise<T>{const result=await db.query<{v:T}>(sql);return result.rows[0].v;}
const enable="UPDATE public.job_loop_gc_config SET enabled=true,allowed_owner_ids=ARRAY['11111111-1111-4111-a111-111111111111']::uuid[];";

describe('independent, gated terminal maintenance clock',()=>{
  it('installs an inert hourly clock without issuing a request or ticket',async()=>{
    await fixture();expect(await value('SELECT public.job_loop_gc_dispatch() AS v')).toBeNull();
    expect(await value<number>('SELECT count(*)::integer AS v FROM net.calls')).toBe(0);
    expect(await value<number>('SELECT count(*)::integer AS v FROM public.job_loop_gc_dispatch_tickets')).toBe(0);
    const job=await db.query('SELECT * FROM cron.job');expect(job.rows).toEqual([{jobname:'jobvance-artifact-maintenance',schedule:'17 * * * *',command:'SELECT public.job_loop_gc_dispatch();',active:true}]);
  });
  it('an enabled flag with an empty allowlist still does nothing',async()=>{
    await fixture();await db.exec('UPDATE public.job_loop_gc_config SET enabled=true;');
    expect(await value('SELECT public.job_loop_gc_issue_ticket() AS v')).toBeNull();expect(await value('SELECT public.job_loop_gc_dispatch() AS v')).toBeNull();
    expect(await value<number>('SELECT count(*)::integer AS v FROM net.calls')).toBe(0);
  });
  it('wakes for terminal-only work with preparation disabled and issues a single-use two-minute purpose ticket',async()=>{
    await fixture();await db.exec(enable);
    expect(await value<number>('SELECT public.job_loop_gc_dispatch() AS v')).toBe(1);
    const {rows}=await db.query<{url:string;headers:Record<string,string>;body:unknown}>('SELECT url,headers,body FROM net.calls');const call=rows[0];
    expect(call.url).toBe('https://fixture.supabase.co/functions/v1/job-loop-worker');expect(call.body).toEqual({action:'artifact_gc'});
    expect(Object.keys(call.headers).sort()).toEqual(['Content-Type','apikey','x-job-loop-maintenance-ticket'].sort());
    expect(call.headers.apikey).toBe('fixture-publishable');
    const ticket=call.headers['x-job-loop-maintenance-ticket'];
    expect(await value<boolean>(`SELECT public.job_loop_gc_consume_ticket('${ticket}'::uuid) AS v`)).toBe(true);
    expect(await value<boolean>(`SELECT public.job_loop_gc_consume_ticket('${ticket}'::uuid) AS v`)).toBe(false);
    expect(await value<boolean>('SELECT last_dispatch_at IS NOT NULL AND last_dispatch_request=1 AS v FROM public.job_loop_gc_config')).toBe(true);
  });
  it('rejects expired or disabled-after-dispatch tickets',async()=>{
    await fixture();await db.exec(enable);const ticket=await value<string>('SELECT public.job_loop_gc_issue_ticket() AS v');
    await db.exec('UPDATE public.job_loop_gc_config SET enabled=false;');expect(await value<boolean>(`SELECT public.job_loop_gc_consume_ticket('${ticket}') AS v`)).toBe(false);
    await db.exec(enable+"UPDATE public.job_loop_gc_dispatch_tickets SET expires_at=now()-interval '1 second';");expect(await value<boolean>(`SELECT public.job_loop_gc_consume_ticket('${ticket}') AS v`)).toBe(false);
  });
  it('requires a fixed secure project origin and bounds ticket cleanup even while disabled',async()=>{
    await fixture();await db.exec(enable+"UPDATE public.job_loop_scheduler_config SET api_origin='https://untrusted.invalid';");
    expect(await value('SELECT public.job_loop_gc_dispatch() AS v')).toBeNull();
    await db.exec("INSERT INTO public.job_loop_gc_dispatch_tickets(expires_at) SELECT now()-interval '2 days' FROM generate_series(1,1001);UPDATE public.job_loop_gc_config SET enabled=false;");
    await value('SELECT public.job_loop_gc_dispatch() AS v');expect(await value<number>('SELECT count(*)::integer AS v FROM public.job_loop_gc_dispatch_tickets')).toBe(801);
    expect(await value<number>('SELECT count(*)::integer AS v FROM net.calls')).toBe(0);
  });
  it('keeps maintenance tickets and routines out of browser roles',async()=>{
    await fixture();
    for(const role of ['anon','authenticated']){
      for(const signature of ['job_loop_gc_issue_ticket()','job_loop_gc_consume_ticket(uuid)','job_loop_gc_dispatch()'])expect(await value<boolean>(`SELECT has_function_privilege('${role}','public.${signature}','EXECUTE') AS v`)).toBe(false);
      expect(await value<boolean>(`SELECT has_table_privilege('${role}','public.job_loop_gc_dispatch_tickets','SELECT') AS v`)).toBe(false);
    }
    expect(await value<boolean>("SELECT relrowsecurity AS v FROM pg_class WHERE oid='public.job_loop_gc_dispatch_tickets'::regclass")).toBe(true);
    for(const permission of ['SELECT','INSERT','UPDATE','DELETE'])expect(await value<boolean>(`SELECT has_table_privilege('service_role','public.job_loop_gc_dispatch_tickets','${permission}') AS v`)).toBe(false);
  });
});
