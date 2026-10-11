// @vitest-environment node
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
let db:PGlite;
const hash='a'.repeat(64),otherHash='b'.repeat(64);
beforeAll(async()=>{
  db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
  CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON storage.objects TO anon,authenticated;CREATE POLICY legacy_all ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);`);
  await db.exec(await readFile('supabase/migrations/20261011010000_job_loop_cloud.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261011020000_job_loop_revoke_all.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
const recordData={profile:{name:'Fictional person'},claims:[],opportunities:[],inbox:[]};
async function account(){const user=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query('SELECT job_loop_write_record($1,0,$2,true)',[user,recordData]);return user;}
async function run(user:string,request=randomUUID(),requestHash=hash){return(await db.query<{r:{id:string}}>("SELECT job_loop_start_run($1,$2,$3,$4,(SELECT version FROM job_loop_records WHERE user_id=$1),'rules','grounded-rules-v1','{}') AS r",[user,request,requestHash,hash])).rows[0].r;}
async function claim(id:string){const lease=randomUUID();await db.query('SELECT job_loop_claim_run($1,$2)',[id,lease]);return lease;}
async function reserve(user:string,id:string,lease:string,key:string,micros:number){return(await db.query<{r:{id:string;is_new:boolean;status:string}}>('SELECT job_loop_reserve($1,$2,$3,$4,$5,$6) AS r',[user,id,lease,key,'fixture',micros])).rows[0].r;}
async function asOwner<T>(user:string,fn:(tx:PGlite)=>Promise<T>){return db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);return fn(tx as unknown as PGlite);});}
function packet(user:string,runId:string,packetId=randomUUID()){const artifacts=Object.fromEntries(['pdf','docx','txt'].map(key=>[key,{path:`${user}/${packetId}/${hash}/${key}`,sha256:hash,byteSize:100}]));return{id:packetId,runId,opportunityId:randomUUID(),inputHash:hash,status:'review_required',cvText:'Source-backed fictional CV text. '.repeat(4),holdReasons:[],pageCount:1,artifacts};}
async function storePacket(user:string,runId:string,lease:string,value=packet(user,runId)){await db.query("SELECT job_loop_commit_phase($1,$2,3,'running','{}',$3,'[]')",[runId,lease,[value]]);return value;}

describe('real PostgreSQL cloud-loop invariants',()=>{
  it('revokes fresh export authority after a correction even for a reported interview, preserving its history',async()=>{
    const user=await account(),r=await run(user),lease=await claim(r.id),p=packet(user,r.id);
    const opportunity={id:p.opportunityId,status:'interview',notes:'User-reported interview history'};
    await db.query('UPDATE job_loop_records SET data=jsonb_set(data,\'{opportunities}\',$2) WHERE user_id=$1',[user,JSON.stringify([opportunity])]);
    await storePacket(user,r.id,lease,p);await db.query('SELECT job_loop_approve_packet($1,$2,$3,$4)',[user,p.id,p.inputHash,p.cvText]);
    await db.query('SELECT job_loop_write_record($1,(SELECT version FROM job_loop_records WHERE user_id=$1),$2,true)',[user,{...recordData,opportunities:[opportunity]}]);
    expect((await db.query<{status:string}>('SELECT status FROM job_loop_packets WHERE id=$1',[p.id])).rows[0].status).toBe('revoked');
    expect((await db.query<{data:{opportunities:unknown[]}}>('SELECT data FROM job_loop_records WHERE user_id=$1',[user])).rows[0].data.opportunities).toEqual([opportunity]);
  });
  it('keeps owner SELECT and forbids browser privileged writes/RPC/token access',async()=>{
    const a=await account(),b=await account();const r=await run(a);
    expect((await asOwner(b,tx=>tx.query('SELECT * FROM job_loop_runs WHERE id=$1',[r.id]))).rows).toHaveLength(0);
    await expect(asOwner(a,tx=>tx.query('UPDATE job_loop_records SET version=99'))).rejects.toThrow(/permission denied/i);
    await expect(asOwner(a,tx=>tx.query('SELECT job_loop_write_record($1,1,$2,true)',[a,recordData]))).rejects.toThrow(/permission denied/i);
    await expect(asOwner(a,tx=>tx.query('SELECT * FROM job_loop_connections'))).rejects.toThrow(/permission denied/i);
    await expect(asOwner(a,tx=>tx.query('SELECT * FROM job_loop_usage'))).rejects.toThrow(/permission denied/i);
  });
  it('uses record CAS without losing a concurrent correction',async()=>{
    const user=await account();await db.query('SELECT job_loop_write_record($1,1,$2,true)',[user,{...recordData,profile:{name:'Corrected fictional name'}}]);
    await expect(db.query('SELECT job_loop_write_record($1,1,$2,true)',[user,recordData])).rejects.toThrow('LOOP_VERSION_CONFLICT');
    expect((await db.query<{version:number}>('SELECT version FROM job_loop_records WHERE user_id=$1',[user])).rows[0].version).toBe(2);
  });
  it('replays one request, rejects changed inputs and permits only one active run',async()=>{
    const user=await account(),request=randomUUID();const first=await run(user,request);expect((await run(user,request)).id).toBe(first.id);
    await expect(run(user,request,otherHash)).rejects.toThrow('LOOP_REQUEST_CONFLICT');
    await expect(run(user)).rejects.toThrow('LOOP_ACTIVE_RUN');
  });
  it('permits three corrective runs and enforces the actual daily cap',async()=>{
    const user=await account();for(let i=0;i<3;i++){const r=await run(user);await db.query("SELECT job_loop_run_action($1,$2,'cancel')",[user,r.id]);}
    await expect(run(user)).rejects.toThrow('LOOP_DAILY_LIMIT');
  });
  it('atomically enforces the combined fifty-dollar cap across owners',async()=>{
    await db.exec('TRUNCATE job_loop_usage,job_loop_budget_months');const a=await account(),b=await account(),ra=await run(a),rb=await run(b),la=await claim(ra.id),lb=await claim(rb.id);
    const results=await Promise.allSettled([reserve(a,ra.id,la,'large',30000000),reserve(b,rb.id,lb,'large',30000000)]);
    expect(results.filter(item=>item.status==='fulfilled')).toHaveLength(1);expect(results.filter(item=>item.status==='rejected')).toHaveLength(1);
    expect(Number((await db.query<{committed_micros:number}>('SELECT committed_micros FROM job_loop_budget_months')).rows[0].committed_micros)).toBe(30000000);
  });
  it('retains uncertain reservations, replays them without duplicate charge and reconciles once',async()=>{
    await db.exec('TRUNCATE job_loop_usage,job_loop_budget_months');const user=await account(),r=await run(user),lease=await claim(r.id);const u=await reserve(user,r.id,lease,'one',5000000);
    await db.query('SELECT job_loop_settle($1,NULL,NULL,true)',[u.id]);const replay=await reserve(user,r.id,lease,'one',5000000);expect(replay.is_new).toBe(false);expect(replay.status).toBe('uncertain');
    expect(Number((await db.query<{committed_micros:number}>('SELECT committed_micros FROM job_loop_budget_months')).rows[0].committed_micros)).toBe(5000000);
    await db.query('SELECT job_loop_settle($1,2000000,$2,false)',[u.id,{actualMicros:2000000,claimIds:[]}]);await db.query('SELECT job_loop_settle($1,0,$2,false)',[u.id,{}]);
    expect(Number((await db.query<{committed_micros:number}>('SELECT committed_micros FROM job_loop_budget_months')).rows[0].committed_micros)).toBe(2000000);
  });
  it('rejects reservation for another owner and cancelled/stale stage commits',async()=>{
    const user=await account(),other=await account(),r=await run(user),lease=await claim(r.id);
    await expect(reserve(other,r.id,lease,'forged',1)).rejects.toThrow('LOOP_LEASE_LOST');
    await db.query("SELECT job_loop_run_action($1,$2,'cancel')",[user,r.id]);await expect(db.query("SELECT job_loop_commit_phase($1,$2,1,'running','{}')",[r.id,lease])).rejects.toThrow('LOOP_LEASE_LOST');
    const next=await run(user),nextLease=await claim(next.id);await db.query('SELECT job_loop_write_record($1,1,$2,true)',[user,recordData]);
    await expect(db.query("SELECT job_loop_commit_phase($1,$2,1,'running','{}')",[next.id,nextLease])).rejects.toThrow(/LOOP_(STALE_INPUT|LEASE_LOST)/);
  });
  it('requires exact text and real page checks, and revokes pending approval on correction',async()=>{
    const user=await account(),r=await run(user),lease=await claim(r.id);const p=await storePacket(user,r.id,lease);
    await expect(db.query('SELECT job_loop_approve_packet($1,$2,$3,$4)',[user,p.id,hash,'An invented new achievement.'])).rejects.toThrow('LOOP_REVIEW_CHANGED');
    await db.query('SELECT job_loop_approve_packet($1,$2,$3,$4)',[user,p.id,hash,p.cvText]);await db.query('SELECT job_loop_write_record($1,1,$2,true)',[user,recordData]);
    expect((await db.query<{status:string}>('SELECT status FROM job_loop_packets WHERE id=$1',[p.id])).rows[0].status).toBe('revoked');
  });
  it('rejects invalid artifact paths and null-page approval',async()=>{
    const user=await account(),r=await run(user),lease=await claim(r.id);const p=packet(user,r.id);p.artifacts.pdf.path='other/secret/pdf';
    await expect(db.query("SELECT job_loop_commit_phase($1,$2,3,'running','{}',$3)",[r.id,lease,[p]])).rejects.toThrow('LOOP_ARTIFACT_PATH');
    const held={...packet(user,r.id),pageCount:null};await storePacket(user,r.id,lease,held as ReturnType<typeof packet>);
    await expect(db.query('SELECT job_loop_approve_packet($1,$2,$3,$4)',[user,held.id,hash,held.cvText])).rejects.toThrow('LOOP_PACKET_HELD');
  });
  it('restricts storage to exact approved manifest paths and fences legacy writes',async()=>{
    const user=await account(),other=await account(),r=await run(user),lease=await claim(r.id),p=await storePacket(user,r.id,lease);
    const valid=p.artifacts.pdf.path,unused=`${user}/${p.id}/${otherHash}/pdf`;await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',$1),('job-loop-artifacts',$2)",[valid,unused]);
    expect((await asOwner(user,tx=>tx.query("SELECT name FROM storage.objects WHERE bucket_id='job-loop-artifacts'"))).rows).toHaveLength(0);
    await db.query('SELECT job_loop_approve_packet($1,$2,$3,$4)',[user,p.id,hash,p.cvText]);
    expect((await asOwner(user,tx=>tx.query("SELECT name FROM storage.objects WHERE bucket_id='job-loop-artifacts'"))).rows).toEqual([{name:valid}]);
    expect((await asOwner(other,tx=>tx.query("SELECT name FROM storage.objects WHERE bucket_id='job-loop-artifacts'"))).rows).toHaveLength(0);
    await expect(asOwner(user,tx=>tx.query("INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',$1)",[valid+'x']))).rejects.toThrow(/row-level security/i);
  });
  it('consumes expiring OAuth state exactly once',async()=>{
    const user=await account();await db.query("INSERT INTO job_loop_oauth_states(state_hash,user_id,allow_drafts,verifier_ciphertext,expires_at) VALUES($1,$2,false,'encrypted',now()+interval '1 minute')",[hash,user]);
    expect((await db.query('SELECT job_loop_consume_oauth_state($1)',[hash])).rows).toHaveLength(1);await expect(db.query('SELECT job_loop_consume_oauth_state($1)',[hash])).rejects.toThrow('LOOP_OAUTH_STATE');
    await db.query("INSERT INTO job_loop_oauth_states(state_hash,user_id,allow_drafts,verifier_ciphertext,expires_at) VALUES($1,$2,false,'encrypted',now()-interval '1 minute')",[otherHash,user]);await expect(db.query('SELECT job_loop_consume_oauth_state($1)',[otherHash])).rejects.toThrow('LOOP_OAUTH_STATE');
  });
  it('activates sealed-ticket connections only once for the bound authenticated owner',async()=>{
    const user=await account(),other=await account(),state='c'.repeat(64);await db.query("INSERT INTO job_loop_oauth_states(state_hash,user_id,allow_drafts,verifier_ciphertext,expires_at,consumed_at) VALUES($1,$2,true,'encrypted',now()+interval '1 minute',now())",[state,user]);
    await expect(db.query('SELECT job_loop_activate_gmail($1,$2,$3,$4,true)',[other,state,'encrypted-token-ciphertext-long-enough','mail@example.invalid'])).rejects.toThrow('LOOP_OAUTH_STATE');
    expect((await db.query('SELECT * FROM job_loop_connections')).rows).toHaveLength(0);
    await db.query('SELECT job_loop_activate_gmail($1,$2,$3,$4,true)',[user,state,'encrypted-token-ciphertext-long-enough','mail@example.invalid']);
    await expect(db.query('SELECT job_loop_activate_gmail($1,$2,$3,$4,true)',[user,state,'encrypted-token-ciphertext-long-enough','mail@example.invalid'])).rejects.toThrow('LOOP_OAUTH_STATE');
    expect((await db.query<{user_id:string}>('SELECT user_id FROM job_loop_connections')).rows).toEqual([{user_id:user}]);
  });
});
