// @vitest-environment node
import {beforeAll,afterAll,afterEach,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
let db:PGlite;const hash='a'.repeat(64);
beforeAll(async()=>{
  db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT ALL ON storage.objects TO anon,authenticated;`);
  for(const file of ['20261011010000_job_loop_cloud.sql','20261011020000_job_loop_revoke_all.sql','20261011030000_job_loop_recurring.sql'])await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
},30000);
afterAll(async()=>{await db?.close();});afterEach(async()=>{await db.exec('TRUNCATE auth.users CASCADE;TRUNCATE job_loop_budget_months CASCADE;UPDATE job_loop_scheduler_config SET enabled=false,last_dispatch_at=NULL');});
const data={profile:{name:'Fictional candidate'},claims:[],opportunities:[],inbox:[]};
const settings={cadence:'daily',timezone:'Asia/Dubai',localTime:'08:30',weeklyDay:null,provider:'rules',model:'grounded-rules-v1',modelConsent:false,inboxConsent:false};
async function account(){const id=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('SELECT job_loop_write_record($1,0,$2,true)',[id,data]);return id;}
async function start(user:string,request=randomUUID()){return(await db.query<{r:{id:string}}>("SELECT job_loop_start_run($1,$2,$3,$3,(SELECT version FROM job_loop_records WHERE user_id=$1),'rules','grounded-rules-v1','{}') r",[user,request,hash])).rows[0].r;}
async function schedule(user:string){await db.query("SELECT job_loop_save_schedule($1,0,$2,now()+interval '1 day')",[user,settings]);await db.query("UPDATE job_loop_schedules SET next_run_at=now()-interval '1 minute' WHERE user_id=$1",[user]);}
async function claimDue(lease=randomUUID()){return(await db.query<{r:{user_id:string;lease_token:string;next_run_at:string}[]}>('SELECT job_loop_claim_due($1,10) r',[lease])).rows[0].r;}
async function packet(user:string,run:string,opportunity:string){const id=randomUUID(),artifacts=Object.fromEntries(['docx','txt'].map(key=>[key,{path:`${user}/${id}/${hash}/${key}`,sha256:hash,byteSize:100}]));const p={id,runId:run,opportunityId:opportunity,inputHash:hash,status:'review_required',cvText:'Fictional confirmed CV text. '.repeat(5),holdReasons:[],pageCount:null,formatStatus:{pdf:{ready:false,reason:'PDF_FONT_UNSUPPORTED'},docx:{ready:true},txt:{ready:true}},artifacts};const lease=randomUUID();await db.query('SELECT job_loop_claim_run($1,$2)',[run,lease]);await db.query("SELECT job_loop_commit_phase($1,$2,3,'running','{}',$3)",[run,lease,[p]]);return p;}
describe('durable recurring cloud pilot in real PostgreSQL',()=>{
  it.each(['paused', 'cancelled'])('keeps %s schedule behavior explicit for a running scheduled job and rejects stale completion', async action => {
    const user=await account(); await schedule(user); const claimed=(await claimDue())[0];
    const result=(await db.query<{r:{id:string}}>("SELECT job_loop_start_scheduled_run($1,$2,$3,$4,$4,(SELECT version FROM job_loop_records WHERE user_id=$1),'rules','grounded-rules-v1','{\"model\":false,\"inbox\":false}') r",[user,claimed.lease_token,randomUUID(),hash])).rows[0].r;
    const runLease=randomUUID(); await db.query('SELECT job_loop_claim_run($1,$2)',[result.id,runLease]);
    await db.query('SELECT job_loop_schedule_action($1,1,$2)',[user,action]);
    const run=(await db.query<{status:string;lease_token:string|null}>('SELECT status,lease_token FROM job_loop_runs WHERE id=$1',[result.id])).rows[0];
    expect(run.status).toBe(action==='paused'?'running':'cancelled');
    expect(run.lease_token).toBe(action==='paused'?runLease:null);
    expect(await claimDue()).toHaveLength(0);
    if(action==='cancelled') await expect(db.query("SELECT job_loop_commit_phase($1,$2,1,'running','{}','[]')",[result.id,runLease])).rejects.toThrow(/LOOP_(LEASE_LOST|RUN_CANCELLED)/);
    else await db.query("SELECT job_loop_commit_phase($1,$2,1,'running','{}','[]')",[result.id,runLease]);
  });
  it('atomically limits cloud enrollment to ten accounts while leaving additional private records available',async()=>{
    const users=await Promise.all(Array.from({length:11},()=>account()));const results=await Promise.allSettled(users.map(user=>start(user)));
    expect(results.filter(value=>value.status==='fulfilled')).toHaveLength(10);expect(results.filter(value=>value.status==='rejected')).toHaveLength(1);
    expect((await db.query('SELECT * FROM job_loop_records')).rows).toHaveLength(11);expect((await db.query('SELECT * FROM job_loop_pilot_users WHERE active')).rows).toHaveLength(10);
  });
  it('claims a due occurrence once, recovers its expired lease and keeps pause authoritative',async()=>{
    const user=await account();await schedule(user);const first=await claimDue();expect(first).toHaveLength(1);expect(await claimDue()).toHaveLength(0);
    await db.query("UPDATE job_loop_schedules SET lease_until=now()-interval '1 second' WHERE user_id=$1",[user]);const recovered=await claimDue();expect(recovered).toHaveLength(1);expect(recovered[0].lease_token).not.toBe(first[0].lease_token);
    await db.query("SELECT job_loop_schedule_action($1,1,'paused')",[user]);await expect(db.query("SELECT job_loop_finish_schedule($1,$2,now()+interval '1 day','late')",[user,recovered[0].lease_token])).rejects.toThrow('LOOP_LEASE_LOST');expect(await claimDue()).toHaveLength(0);
  });
  it('binds scheduled run creation to the claimed settings and replays the same request without duplication',async()=>{
    const user=await account();await schedule(user);const claimed=(await claimDue())[0],request=randomUUID();const args=[user,claimed.lease_token,request,hash,settings.provider,settings.model];
    const sql="SELECT job_loop_start_scheduled_run($1,$2,$3,$4,$4,(SELECT version FROM job_loop_records WHERE user_id=$1),$5,$6,'{\"model\":false,\"inbox\":false}') r";
    const first=(await db.query<{r:{id:string}}>(sql,args)).rows[0].r;expect((await db.query<{r:{id:string}}>(sql,args)).rows[0].r.id).toBe(first.id);
    expect((await db.query('SELECT * FROM job_loop_runs')).rows).toHaveLength(1);await db.query("SELECT job_loop_schedule_action($1,1,'cancelled')",[user]);
    expect((await db.query<{status:string}>('SELECT status FROM job_loop_runs WHERE id=$1',[first.id])).rows[0].status).toBe('cancelled');
    await expect(db.query(sql,args)).rejects.toThrow('LOOP_LEASE_LOST');
  });
  it('enforces a lower shared cap and refuses an attempted increase above fifty dollars',async()=>{
    const user=await account(),run=await start(user),lease=randomUUID();await db.query('SELECT job_loop_claim_run($1,$2)',[run.id,lease]);
    await expect(db.query("SELECT job_loop_reserve($1,$2,$3,'bad','fixture',1,51000000)",[user,run.id,lease])).rejects.toThrow('LOOP_BUDGET_LIMIT');
    await db.query("SELECT job_loop_reserve($1,$2,$3,'first','fixture',4000000,5000000)",[user,run.id,lease]);
    await expect(db.query("SELECT job_loop_reserve($1,$2,$3,'next','fixture',2000000,5000000)",[user,run.id,lease])).rejects.toThrow('LOOP_BUDGET_LIMIT');
    expect(Number((await db.query<{committed_micros:number}>('SELECT committed_micros FROM job_loop_budget_months')).rows[0].committed_micros)).toBe(4000000);
  });
  it('limits new scheduled occurrences to one per UTC day and thirty per calendar month',async()=>{
    const user=await account();await schedule(user);const claimed=(await claimDue())[0];const sql="SELECT job_loop_start_scheduled_run($1,$2,$3,$4,$4,(SELECT version FROM job_loop_records WHERE user_id=$1),'rules','grounded-rules-v1','{\"model\":false,\"inbox\":false}')";
    await db.query("INSERT INTO job_loop_runs(user_id,request_id,request_hash,input_hash,input_version,snapshot,provider,model,consents,status) SELECT $1,gen_random_uuid(),$2,$2,1,$3,'rules','grounded-rules-v1','{\"scheduled\":true}','completed'",[user,hash,data]);
    await expect(db.query(sql,[user,claimed.lease_token,randomUUID(),hash])).rejects.toThrow('LOOP_DAILY_SCHEDULE_LIMIT');
    await db.query("UPDATE job_loop_runs SET created_at=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHERE user_id=$1",[user]);
    await db.query("INSERT INTO job_loop_runs(user_id,request_id,request_hash,input_hash,input_version,snapshot,provider,model,consents,status,created_at) SELECT $1,gen_random_uuid(),$2,$2,1,$3,'rules','grounded-rules-v1','{\"scheduled\":true}','completed',date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FROM generate_series(1,29)",[user,hash,data]);
    // The fixture uses an explicit mid-month server clock through created_at. On
    // the first UTC day, the daily guard is also sufficient to stop the extra run.
    await expect(db.query(sql,[user,claimed.lease_token,randomUUID(),hash])).rejects.toThrow(/LOOP_(MONTHLY|DAILY)_SCHEDULE_LIMIT/);
  });
  it('revokes only an edited vacancy packet while preserving unrelated approved exports and application history',async()=>{
    const user=await account(),a={id:randomUUID(),title:'Analyst A',description:'Original A',status:'interview'},b={id:randomUUID(),title:'Analyst B',description:'Original B',status:'saved'};
    await db.query('SELECT job_loop_write_record($1,1,$2,false)',[user,{...data,opportunities:[a,b]}]);const run=await start(user),pa=await packet(user,run.id,a.id),pb=await packet(user,run.id,b.id);
    await db.query('SELECT job_loop_approve_packet($1,$2,$3,$4)',[user,pb.id,hash,pb.cvText]);
    await db.query('SELECT job_loop_write_record($1,(SELECT version FROM job_loop_records WHERE user_id=$1),$2,true)',[user,{...data,opportunities:[{...a,description:'Corrected A'},b]}]);
    const packets=(await db.query<{id:string;status:string;input_version:number}>('SELECT id,status,input_version FROM job_loop_packets ORDER BY id')).rows;
    expect(packets.find(value=>value.id===pa.id)?.status).toBe('revoked');expect(packets.find(value=>value.id===pb.id)?.status).toBe('approved');expect((await db.query<{data:{opportunities:typeof a[]}}>('SELECT data FROM job_loop_records WHERE user_id=$1',[user])).rows[0].data.opportunities[0].status).toBe('interview');
  });
  it('approves valid DOCX and TXT independently of unsupported PDF and records candidate versus system activity',async()=>{
    const user=await account(),run=await start(user),p=await packet(user,run.id,randomUUID());await db.query('SELECT job_loop_approve_packet($1,$2,$3,$4)',[user,p.id,hash,p.cvText]);
    expect((await db.query<{status:string}>('SELECT status FROM job_loop_packets WHERE id=$1',[p.id])).rows[0].status).toBe('approved');
    const events=(await db.query<{actor:string;kind:string}>('SELECT actor,kind FROM job_loop_activity WHERE user_id=$1',[user])).rows;
    expect(events).toContainEqual({actor:'candidate',kind:'packet_status'});expect(events).toContainEqual({actor:'jobvance',kind:'packet_prepared'});
  });
  it('prevents browser callers reading scheduling/support or invoking privileged recurring functions',async()=>{
    const user=await account();await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await expect(tx.query('SELECT * FROM job_loop_schedules')).rejects.toThrow(/permission denied/);});
    await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await expect(tx.query('SELECT job_loop_enroll_pilot($1)',[user])).rejects.toThrow(/permission denied/);});
  });
  it('revokes access before erasure, erases private history and releases a pilot seat without refunding actual usage',async()=>{
    const user=await account(),run=await start(user),p=await packet(user,run.id,randomUUID());const lease=randomUUID();await db.query('SELECT job_loop_claim_run($1,$2)',[run.id,lease]);const usage=(await db.query<{r:{id:string}}>("SELECT job_loop_reserve($1,$2,$3,'cost','fixture',2000000) r",[user,run.id,lease])).rows[0].r;
    await db.query('SELECT job_loop_settle($1,1000000,\'{}\',false)',[usage.id]);await db.query('SELECT job_loop_begin_erase($1)',[user]);expect((await db.query<{status:string}>('SELECT status FROM job_loop_packets WHERE id=$1',[p.id])).rows[0].status).toBe('revoked');await db.query('SELECT job_loop_finish_erase($1)',[user]);
    expect((await db.query('SELECT * FROM job_loop_records')).rows).toHaveLength(0);expect((await db.query('SELECT * FROM job_loop_activity')).rows).toHaveLength(0);expect((await db.query<{active:boolean}>('SELECT active FROM job_loop_pilot_users WHERE user_id=$1',[user])).rows[0].active).toBe(false);expect(Number((await db.query<{committed_micros:number}>('SELECT committed_micros FROM job_loop_budget_months')).rows[0].committed_micros)).toBe(1000000);
  });
});
