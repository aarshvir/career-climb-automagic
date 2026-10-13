// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import type { AdminConfig, AdminSnapshot } from '../../lib/admin-types';

let db: PGlite;
const owner='be619aa5-b1b8-4978-8780-b62461361980';
const candidate='00000000-0000-4000-8000-000000000002';
const qa='00000000-0000-4000-8000-000000000003';
const operator='00000000-0000-4000-8000-000000000004';
const run='00000000-0000-4000-8000-000000000005';
const lease='00000000-0000-4000-8000-000000000006';
const batch='00000000-0000-4000-8000-000000000007';
const request='00000000-0000-4000-8000-000000000008';
async function value<T=unknown>(sql:string,args:unknown[]=[]):Promise<T> { return (await db.query<{result:T}>(sql,args)).rows[0]?.result; }
async function reserve(micros=1000000,key='review',requestId=key==='review'?request:randomUUID()) { return value<{id:string;is_new:boolean;month:string}>("SELECT public.jobvance_admin_reserve($1,$2,$3,'independent_review',$4,'openrouter','moonshotai/kimi-k3',$5) AS result",[owner,requestId,key,batch,micros]); }
async function snapshot(days=30) { return value<AdminSnapshot>('SELECT public.jobvance_admin_snapshot($1,$2) AS result',[owner,days]); }
const config={schedulerEnabled:false,monthlyCapUsd:50,routerEnabled:false,defaultModel:'openai/gpt-6.1-sol',reasoning:'medium'};
async function updateConfig(actor=owner,version=0,input=config) { return value<AdminConfig>('SELECT public.jobvance_admin_update_config($1,$2,$3) AS result',[actor,version,JSON.stringify(input)]); }

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
    CREATE TABLE public.job_loop_budget_months(month text PRIMARY KEY,committed_micros bigint NOT NULL DEFAULT 0 CHECK(committed_micros BETWEEN 0 AND 50000000));
    CREATE TABLE public.job_loop_support_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,category text,message text,status text DEFAULT 'received',created_at timestamptz DEFAULT now());
    CREATE TABLE public.job_loop_scheduler_config(singleton boolean PRIMARY KEY,enabled boolean,last_dispatch_at timestamptz);
    INSERT INTO public.job_loop_scheduler_config VALUES(true,false,NULL);
    CREATE TABLE public.job_loop_records(user_id uuid PRIMARY KEY,input_version bigint DEFAULT 0,data jsonb);
    CREATE TABLE public.job_loop_runs(id uuid PRIMARY KEY,user_id uuid,status text,phase integer DEFAULT 0,provider text DEFAULT 'rules',model text DEFAULT 'rules',input_version bigint DEFAULT 0,lease_token uuid,lease_until timestamptz,created_at timestamptz DEFAULT now(),finished_at timestamptz);
    CREATE TABLE public.job_loop_packets(id uuid PRIMARY KEY,user_id uuid,status text,approved_at timestamptz);
    CREATE TABLE public.job_loop_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,run_id uuid,operation_key text,month text,provider text,reserved_micros bigint,actual_micros bigint,status text DEFAULT 'reserved',result jsonb,UNIQUE(run_id,operation_key));
    CREATE TABLE public.job_loop_pilot_users(user_id uuid PRIMARY KEY,active boolean);
    CREATE TABLE public.job_loop_schedules(user_id uuid PRIMARY KEY,status text,next_run_at timestamptz,lease_until timestamptz);
    CREATE TABLE public.job_loop_activity(user_id uuid,kind text,actor text,at timestamptz DEFAULT now());
    CREATE TABLE public.cv_checks(user_id uuid,status text,created_at timestamptz DEFAULT now());
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  await db.query('INSERT INTO auth.users(id,email,created_at) VALUES($1,$2,now()-interval \'20 days\')',[owner,'aarshvir@gmail.com']);
  await db.exec(await readFile('supabase/migrations/20261012180814_jobvance_admin_platform.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261012181402_jobvance_admin_snapshot.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261012183431_jobvance_admin_request_identity.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('RESET ROLE; TRUNCATE public.jobvance_admin_model_usage,public.jobvance_admin_task_tickets,public.jobvance_admin_audit,public.job_loop_usage,public.job_loop_budget_months,public.job_loop_records,public.job_loop_runs,public.job_loop_packets,public.job_loop_pilot_users,public.job_loop_schedules,public.job_loop_support_requests,public.job_loop_activity,public.cv_checks;');
  await db.query('DELETE FROM public.jobvance_admin_members WHERE user_id<>$1',[owner]);
  await db.query('UPDATE public.jobvance_admin_members SET active=true,role=\'owner\' WHERE user_id=$1',[owner]);
  await db.exec("UPDATE public.jobvance_admin_config SET version=0,monthly_cap_micros=50000000,router_enabled=false; UPDATE public.job_loop_scheduler_config SET enabled=false;");
  await db.query("INSERT INTO auth.users(id,email,created_at,raw_user_meta_data) VALUES($1,'real@work.org',now()-interval '18 days','{}'),($2,'jobvance-qa@example.com',now()-interval '18 days','{\"qa_fixture\":true}'),($3,'operator@work.org',now()-interval '100 days','{}') ON CONFLICT(id) DO NOTHING",[candidate,qa,operator]);
});

describe('private administration Postgres boundary',()=>{
  it('binds one owner UUID and denies browser table/RPC access even to that owner',async()=>{
    expect((await db.query('SELECT user_id,role FROM public.jobvance_admin_members')).rows).toEqual([{user_id:owner,role:'owner'}]);
    for(const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      for(const table of ['jobvance_admin_members','jobvance_admin_config','jobvance_admin_audit','jobvance_admin_task_tickets','jobvance_admin_model_usage']) await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/);
      await expect(snapshot()).rejects.toThrow(/permission denied/);
      await expect(db.query('SELECT public.jobvance_consume_admin_ticket($1,\'provider_status\')',[request])).rejects.toThrow(/permission denied/);
      await expect(db.query('SELECT public.jobvance_admin_support_detail($1,$2)',[owner,request])).rejects.toThrow(/permission denied/);
      await db.exec('RESET ROLE');
    }
  });
  it('denies nonmembers and honors revocation with an existing identity',async()=>{
    await expect(db.query('SELECT public.jobvance_admin_snapshot($1,30)',[candidate])).rejects.toThrow(/ADMIN_FORBIDDEN/);
    await db.query('UPDATE public.jobvance_admin_members SET active=false WHERE user_id=$1',[owner]);
    await expect(snapshot()).rejects.toThrow(/ADMIN_FORBIDDEN/);
    await expect(reserve()).rejects.toThrow(/ADMIN_FORBIDDEN/);
  });
  it('uses optimistic owner-only settings and keeps scheduler/config updates atomic',async()=>{
    await db.query("INSERT INTO public.jobvance_admin_members(user_id,role) VALUES($1,'operator')",[operator]);
    await expect(updateConfig(operator)).rejects.toThrow(/ADMIN_FORBIDDEN/);
    const saved=await updateConfig(owner,0,{...config,schedulerEnabled:true,monthlyCapUsd:12});
    expect(saved).toMatchObject({version:1,schedulerEnabled:true,monthlyCapUsd:12});
    await expect(updateConfig(owner,0)).rejects.toThrow(/ADMIN_VERSION_CONFLICT/);
    await expect(updateConfig(owner,1,{...config,monthlyCapUsd:13})).rejects.toThrow(/ADMIN_CONFIG_INVALID/);
    expect((await snapshot()).config.monthlyCapUsd).toBe(12);
  });
  it('atomically consumes a matching unexpired ticket once and checks active membership',async()=>{
    await db.query("INSERT INTO public.jobvance_admin_task_tickets(id,owner_id,action,payload,expires_at) VALUES($1,$2,'provider_status','{}',now()+interval '1 minute')",[request,owner]);
    await expect(db.query('SELECT public.jobvance_consume_admin_ticket($1,\'independent_review\')',[request])).rejects.toThrow(/ADMIN_TICKET_INVALID/);
    expect(await value('SELECT public.jobvance_consume_admin_ticket($1,\'provider_status\') AS result',[request])).toEqual({owner_id:owner,payload:{}});
    await expect(db.query('SELECT public.jobvance_consume_admin_ticket($1,\'provider_status\')',[request])).rejects.toThrow(/ADMIN_TICKET_INVALID/);
    await expect(db.query("INSERT INTO public.jobvance_admin_task_tickets(owner_id,action,expires_at) VALUES($1,'provider_status',now()+interval '3 minutes')",[owner])).rejects.toThrow(/check constraint/);
    await expect(db.query("INSERT INTO public.jobvance_admin_task_tickets(owner_id,action,created_at,expires_at) VALUES($1,'provider_status',now()+interval '1 day',now()+interval '1 day 1 minute')",[owner])).rejects.toThrow(/check constraint/);
    await db.query("INSERT INTO public.jobvance_admin_task_tickets(id,owner_id,action,created_at,expires_at) VALUES($1,$2,'provider_status',now()-interval '3 minutes',now()-interval '2 minutes')",[batch,owner]);
    await expect(db.query('SELECT public.jobvance_consume_admin_ticket($1,\'provider_status\')',[batch])).rejects.toThrow(/ADMIN_TICKET_INVALID/);
    await expect(db.query("INSERT INTO public.jobvance_admin_task_tickets(owner_id,action,payload,expires_at) VALUES($1,'provider_status',jsonb_build_object('text',repeat('X',150001)),now()+interval '1 minute')",[owner])).rejects.toThrow(/check constraint/);
    await db.query("INSERT INTO public.jobvance_admin_task_tickets(id,owner_id,action,expires_at) VALUES($1,$2,'provider_status',now()+interval '1 minute')",[run,owner]);
    await db.query('UPDATE public.jobvance_admin_members SET active=false WHERE user_id=$1',[owner]);
    await expect(db.query('SELECT public.jobvance_consume_admin_ticket($1,\'provider_status\')',[run])).rejects.toThrow(/ADMIN_FORBIDDEN/);
  });
  it('keeps sanitized audit append-only and support optimistic without exposing messages',async()=>{
    await db.query("INSERT INTO public.job_loop_support_requests(id,user_id,category,message) VALUES($1,$2,'privacy','PRIVATE CV SOURCE TEXT')",[request,candidate]);
    const saved=await value("SELECT public.jobvance_admin_update_support($1,$2,0,'in_review') AS result",[owner,request]);
    expect(saved).toEqual({id:request,status:'in_review',version:1});
    await expect(db.query("SELECT public.jobvance_admin_update_support($1,$2,0,'resolved')",[owner,request])).rejects.toThrow(/ADMIN_VERSION_CONFLICT/);
    await expect(db.query("UPDATE public.jobvance_admin_audit SET details='{}'")).rejects.toThrow(/ADMIN_AUDIT_IMMUTABLE/);
    await expect(db.query("DELETE FROM public.jobvance_admin_audit")).rejects.toThrow(/ADMIN_AUDIT_IMMUTABLE/);
    await expect(db.query("SELECT public.jobvance_admin_record_event($1,'snapshot',NULL,'{\"message\":\"private\"}')",[owner])).rejects.toThrow(/ADMIN_AUDIT_INVALID/);
    expect(JSON.stringify(await snapshot())).not.toContain('PRIVATE CV SOURCE TEXT');
  });
  it('opens only an explicit support receipt for active staff and audits metadata without its message',async()=>{
    const privateMessage='Saved support note. '+ 'X'.repeat(1980);
    expect(privateMessage.length).toBe(2000);
    await db.query("INSERT INTO public.jobvance_admin_members(user_id,role) VALUES($1,'operator')",[operator]);
    await db.query("INSERT INTO public.job_loop_support_requests(id,user_id,category,message) VALUES($1,$2,'privacy',$3),($4,$2,'help','Other private receipt')",[request,candidate,privateMessage,run]);
    await expect(db.query('SELECT public.jobvance_admin_support_detail($1,$2)',[candidate,request])).rejects.toThrow(/ADMIN_FORBIDDEN/);
    expect(await value('SELECT public.jobvance_admin_support_detail($1,$2) AS result',[operator,request])).toEqual({id:request,message:privateMessage});
    const audit=(await db.query<{action:string;target_id:string;details:unknown}>('SELECT action,target_id,details FROM public.jobvance_admin_audit')).rows;
    expect(audit).toEqual([{action:'support_detail',target_id:request,details:{version:0}}]);
    expect(JSON.stringify(await snapshot())).not.toContain(privateMessage);
    expect(JSON.stringify(await snapshot())).not.toContain('Other private receipt');
    await expect(db.query('SELECT public.jobvance_admin_support_detail($1,$2)',[owner,batch])).rejects.toThrow(/ADMIN_NOT_FOUND/);
    await db.query('UPDATE public.jobvance_admin_members SET active=false WHERE user_id=$1',[operator]);
    await expect(db.query('SELECT public.jobvance_admin_support_detail($1,$2)',[operator,request])).rejects.toThrow(/ADMIN_FORBIDDEN/);
  });
});
describe('shared atomic reservations and honest measurements',()=>{
  it('binds global request IDs to exact evidence and all call parameters, preserving the original reservation',async()=>{
    const original=await reserve();
    expect(await reserve()).toMatchObject({id:original.id,is_new:false});
    await expect(reserve(1000000,'changed-evidence',request)).rejects.toThrow(/ADMIN_REQUEST_CONFLICT/);
    await expect(reserve(999999,'review',request)).rejects.toThrow(/ADMIN_REQUEST_CONFLICT/);
    await expect(db.query("SELECT public.jobvance_admin_reserve($1,$2,'review','independent_review',$3,'openrouter','meta/muse-spark-1.3',1000000)",[owner,request,batch])).rejects.toThrow(/ADMIN_REQUEST_CONFLICT/);
    await expect(db.query("SELECT public.jobvance_admin_reserve($1,$2,'review','independent_review',$3,'openrouter','moonshotai/kimi-k3',1000000)",[owner,request,lease])).rejects.toThrow(/ADMIN_REQUEST_CONFLICT/);
    await expect(db.query("SELECT public.jobvance_admin_reserve($1,$2,'review','admin_commentary',NULL,'openrouter','moonshotai/kimi-k3',1000000)",[owner,request])).rejects.toThrow(/ADMIN_REQUEST_CONFLICT/);
    await expect(db.query("SELECT public.jobvance_admin_reserve($1,$2,'review','independent_review',$3,'other','moonshotai/kimi-k3',1000000)",[owner,request,batch])).rejects.toThrow(/ADMIN_REQUEST_CONFLICT/);
    await db.query("INSERT INTO public.jobvance_admin_members(user_id,role) VALUES($1,'owner')",[operator]);
    await expect(db.query("SELECT public.jobvance_admin_reserve($1,$2,'review','independent_review',$3,'openrouter','moonshotai/kimi-k3',1000000)",[operator,request,batch])).rejects.toThrow(/ADMIN_REQUEST_CONFLICT/);
    expect((await db.query('SELECT * FROM public.jobvance_admin_model_usage')).rows).toHaveLength(1);
    expect((await snapshot()).analytics.budget.committedUsd).toBe(1);
    await expect(db.query("INSERT INTO public.jobvance_admin_model_usage(actor_id,request_id,operation_key,action,batch_id,month,provider,model,reserved_micros) SELECT actor_id,request_id,'other',action,batch_id,month,provider,model,reserved_micros FROM public.jobvance_admin_model_usage")).rejects.toThrow(/unique constraint/);
  });
  it('serializes identical and conflicting concurrent request IDs before any second reservation',async()=>{
    const repeated=await Promise.all([reserve(),reserve()]);
    expect(repeated.filter(r=>r.is_new)).toHaveLength(1);
    expect(repeated[0].id).toBe(repeated[1].id);
    const changed=await Promise.allSettled([reserve(500000,'new',run),reserve(500000,'different',run)]);
    expect(changed.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(changed.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect((changed.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toContain('ADMIN_REQUEST_CONFLICT');
    expect((await snapshot()).analytics.budget.committedUsd).toBe(1.5);
  });
  it('keeps request identity across UTC months without reserving against a new month on replay',async()=>{
    const original=await reserve();
    await db.exec("INSERT INTO public.job_loop_budget_months(month,committed_micros) VALUES('2000-01',1000000)");
    await db.query("UPDATE public.jobvance_admin_model_usage SET month='2000-01' WHERE id=$1",[original.id]);
    await db.query('DELETE FROM public.job_loop_budget_months WHERE month=$1',[original.month]);
    expect(await reserve()).toMatchObject({id:original.id,is_new:false,month:'2000-01'});
    await expect(reserve(1000000,'changed-evidence',request)).rejects.toThrow(/ADMIN_REQUEST_CONFLICT/);
    expect((await db.query('SELECT * FROM public.job_loop_budget_months WHERE month=$1',[original.month])).rows).toHaveLength(0);
  });
  it('retains the five-dollar review batch ceiling across earlier and current UTC months',async()=>{
    const original=await reserve(3000000);
    await db.exec("INSERT INTO public.job_loop_budget_months(month,committed_micros) VALUES('2000-01',3000000)");
    await db.query("UPDATE public.jobvance_admin_model_usage SET month='2000-01' WHERE id=$1",[original.id]);
    await db.query('DELETE FROM public.job_loop_budget_months WHERE month=$1',[original.month]);
    await expect(reserve(3000000,'current-month',run)).rejects.toThrow(/ADMIN_REVIEW_BATCH_LIMIT/);
    expect((await db.query('SELECT * FROM public.jobvance_admin_model_usage')).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM public.job_loop_budget_months WHERE month=$1',[original.month])).rows).toHaveLength(0);
  });
  it('deduplicates review calls, retains uncertain reservations and releases only known actuals',async()=>{
    const u=await reserve(); expect(u.is_new).toBe(true); expect((await reserve()).is_new).toBe(false);
    await value('SELECT public.jobvance_admin_settle($1,NULL,\'{}\',true) AS result',[u.id]);
    expect((await snapshot()).analytics.budget).toMatchObject({committedUsd:1,uncertainUsd:1,reservedUsd:0,actualUsd:0});
    await expect(db.query('SELECT public.jobvance_admin_settle($1,1000001,\'{}\',false)',[u.id])).rejects.toThrow(/ADMIN_USAGE_INVALID/);
    await value('SELECT public.jobvance_admin_settle($1,250000,\'{}\',false) AS result',[u.id]);
    await value('SELECT public.jobvance_admin_settle($1,0,\'{}\',false) AS result',[u.id]);
    expect((await snapshot()).analytics.budget).toMatchObject({committedUsd:0.25,uncertainUsd:0,adminActualUsd:0.25});
  });
  it('bounds a review batch at five dollars and candidate+review ledger at configured cap',async()=>{
    await reserve(4000000); await expect(reserve(1000001,'review2')).rejects.toThrow(/ADMIN_REVIEW_BATCH_LIMIT/);
    await updateConfig(owner,0,{...config,monthlyCapUsd:5});
    await db.query("INSERT INTO public.job_loop_records(user_id,data) VALUES($1,'{\"profile\":null,\"claims\":[]}')",[candidate]);
    await db.query("INSERT INTO public.job_loop_runs(id,user_id,status,lease_token,lease_until) VALUES($1,$2,'running',$3,now()+interval '1 hour')",[run,candidate,lease]);
    await value('SELECT public.job_loop_reserve($1,$2,$3,\'search\',\'tavily\',1000000,50000000) AS result',[candidate,run,lease]);
    await expect(db.query('SELECT public.job_loop_reserve($1,$2,$3,\'search2\',\'tavily\',1,50000000)',[candidate,run,lease])).rejects.toThrow(/LOOP_BUDGET_LIMIT/);
    await expect(reserve(1,'review3')).rejects.toThrow(/ADMIN_BUDGET_LIMIT/);
    expect((await snapshot()).analytics.budget.committedUsd).toBe(5);
    expect((await db.query('SELECT * FROM public.job_loop_runs')).rows).toHaveLength(1);
  });
  it('serializes concurrent reservations without overshooting the shared monthly cap',async()=>{
    await updateConfig(owner,0,{...config,monthlyCapUsd:1});
    const result=await Promise.allSettled([reserve(600000,'a'),reserve(600000,'b')]);
    expect(result.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(result.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect((await snapshot()).analytics.budget.committedUsd).toBe(0.6);
  });
  it('serializes concurrent candidate and review calls on the same monthly budget row',async()=>{
    await updateConfig(owner,0,{...config,monthlyCapUsd:5});
    await db.query("INSERT INTO public.job_loop_records(user_id,data) VALUES($1,'{\"profile\":null,\"claims\":[]}')",[candidate]);
    await db.query("INSERT INTO public.job_loop_runs(id,user_id,status,lease_token,lease_until) VALUES($1,$2,'running',$3,now()+interval '1 hour')",[run,candidate,lease]);
    const result=await Promise.allSettled([reserve(3000000),value('SELECT public.job_loop_reserve($1,$2,$3,\'search\',\'tavily\',3000000,50000000) AS result',[candidate,run,lease])]);
    expect(result.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(result.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect((await snapshot()).analytics.budget.committedUsd).toBe(3);
  });
  it('excludes QA, masks email, omits CV text and separates zero denominators from untracked data',async()=>{
    await db.query("INSERT INTO public.job_loop_records(user_id,data) VALUES($1,'{\"profile\":{\"sourceText\":\"VERY PRIVATE CV\"},\"claims\":[{\"status\":\"active\",\"confirmed\":true,\"shareable\":true,\"sourceQuote\":\"VERY PRIVATE CV\"}]}'),($2,'{\"profile\":{},\"claims\":[]}')",[candidate,qa]);
    const s=await snapshot();
    expect(s.coverage).toMatchObject({excludedQaUsers:1,usersTotal:3,usersListed:3});
    expect(s.operations.users.find(x=>x.id===candidate)).toMatchObject({emailDisplay:'r***@work.org',hasProfile:true,claims:1,shareableClaims:1});
    expect(s.operations.users.some(x=>x.id===qa)).toBe(false);
    expect(JSON.stringify(s)).not.toContain('VERY PRIVATE CV');
    expect(s.analytics.funnel.find(x=>x.key==='completed')).toMatchObject({count:0,denominator:1,percent:0,smallSample:true});
    expect(s.analytics.funnel.find(x=>x.key==='approved')).toMatchObject({count:0,denominator:0,percent:null});
    expect(s.analytics.milestones.find(x=>x.key==='guest_visits')).toMatchObject({count:null,percent:null,availability:'untracked'});
    expect((await snapshot(7)).analytics.retention[0]).toMatchObject({count:0,denominator:0,percent:null});
    expect(s.analytics.revenue).toMatchObject({recognizedUsd:null,checkoutEnabled:false});
  });
  it('counts real terminal runs and candidate week-two returns with explicit strict funnel denominators',async()=>{
    await db.query("INSERT INTO public.job_loop_records(user_id,data) VALUES($1,'{\"profile\":{},\"claims\":[{\"status\":\"active\",\"confirmed\":true,\"shareable\":true}]}')",[candidate]);
    await db.query("INSERT INTO public.job_loop_runs(id,user_id,status,created_at,finished_at) VALUES($1,$2,'completed',now()-interval '2 days',now()-interval '1 day'),($3,$2,'failed',now()-interval '2 hours',now()-interval '1 hour'),($4,$5,'completed',now()-interval '2 days',now()-interval '1 day'),($6,$2,'blocked',now()-interval '3 hours',now()-interval '2 hours')",[run,candidate,request,batch,qa,lease]);
    await db.query("INSERT INTO public.job_loop_packets(id,user_id,status,approved_at) VALUES($1,$2,'approved',now()-interval '12 hours')",[run,candidate]);
    await db.query("INSERT INTO public.job_loop_activity(user_id,kind,actor,at) VALUES($1,'download_requested','candidate',now()-interval '8 hours'),($1,'evidence','candidate',(SELECT created_at+interval '8 days' FROM auth.users WHERE id=$1)),($2,'download_requested','candidate',now()-interval '8 hours')",[candidate,qa]);
    await db.exec("SET timezone='America/New_York'");
    const s=await snapshot();
    expect(s.window.timezone).toBe('UTC');
    expect(Date.parse(s.window.end)-Date.parse(s.window.start)).toBe(30*86400000);
    expect(s.analytics.funnel.find(x=>x.key==='signup')).toMatchObject({count:2});
    expect(s.analytics.funnel.find(x=>x.key==='profile')).toMatchObject({count:1,denominator:2,percent:50});
    expect(s.analytics.funnel.find(x=>x.key==='download_requested')).toMatchObject({count:1,denominator:1,percent:100});
    expect(s.analytics.retention[0]).toMatchObject({count:1,denominator:2,percent:50});
    expect(s.analytics.milestones.find(x=>x.key==='completed_runs')?.count).toBe(1);
    expect(s.analytics.milestones.find(x=>x.key==='failed_runs')?.count).toBe(1);
    expect(s.analytics.milestones.find(x=>x.key==='download_requests')?.count).toBe(1);
    await db.exec("SET timezone='UTC'");
  });
});
