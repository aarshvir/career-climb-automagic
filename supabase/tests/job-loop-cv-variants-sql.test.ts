// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
let db:PGlite,owner:string,other:string,version:number,generation:number,claimId:string;
const profile=()=>({audience:'professional',name:'Created Candidate',contactLine:'',targetTitles:['Analyst'],locations:['Dubai'],experienceYears:3,languages:['English'],pageTarget:1,discreetSearch:false,sourceText:'Created Employer\nPrepared weekly reports with the operations team.\nEducation\nCreated University business degree.',excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null}});
const query=(sql:string,args:unknown[]=[])=>db.query<Record<string,any>>(sql,args);
async function record(){return (await query('SELECT * FROM job_loop_records WHERE user_id=$1',[owner])).rows[0];}
async function service(sql:string,args:unknown[]){await db.exec('SET ROLE service_role');try{return (await query(sql,args)).rows[0]?.result;}finally{await db.exec('RESET ROLE');}}
function intent(overrides:Record<string,unknown>={}){return {user:owner,generation,expected:version,request:randomUUID(),variant:null,revision:0,label:'Operations CV',profile:profile(),claims:[{id:claimId,revision:1}],consent:true,...overrides};}
async function save(i= intent()) {return service('SELECT job_loop_save_cv_variant_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',Object.values(i));}
async function read(user=owner,gen=generation){return service('SELECT job_loop_read_cv_variants_bound($1,$2) result',[user,gen]);}
beforeAll(async()=>{db=new PGlite();await db.exec(await checkLoopSchema());await db.exec(await readFile(new URL('../migrations/20261017013000_job_loop_cv_variants.sql',import.meta.url),'utf8'));},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE;');owner=randomUUID();other=randomUUID();claimId=randomUUID();
  await query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other]);
  const opened=(await query('SELECT job_loop_open_record($1) result',[owner])).rows[0].result;generation=opened.lifecycle_generation;
  const data={profile:{...profile(),revision:1,updatedAt:'2026-10-17T00:00:00Z'},claims:[{id:claimId,revision:1,status:'active',confirmed:true,shareable:true,sourceKind:'cv_passage',sourceQuote:'Prepared weekly reports with the operations team.',phrasing:'Prepared weekly reports with the operations team.',context:'Created Employer',kind:'employment',resultStatus:'not_measured',createdAt:'2026-10-17T00:00:00Z'}],opportunities:[],inbox:[]};
  version=(await query('SELECT job_loop_write_record($1,$2,$3,true) result',[owner,opened.version,data])).rows[0].result.version;
});
describe('isolated CV variant SQL storage foundation (not deployed)',()=>{
  it('stores an exact independent snapshot while preserving legacy inputs and input version',async()=>{
    const before=await record(),result=await save(),after=await record();
    expect(result.variant).toMatchObject({revision:1,generation,label:'Operations CV',profile:profile(),claims:before.data.claims});
    expect(result.variant.profile).not.toHaveProperty('revision');expect(result.variant.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sourceHash).toBe(result.variant.sourceHash);expect(result.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(after.data).toEqual(before.data);expect(after.input_version).toBe(before.input_version);expect(after.version).toBe(before.version+1);
    expect((await read()).variants).toEqual([result.variant]);expect((await query('SELECT * FROM job_loop_runs')).rows).toHaveLength(0);
  });
  it('allows a genuinely different CV as an empty-claim draft without swapping global source',async()=>{
    const before=await record(),different={...profile(),sourceText:'Different Education\nIndependent first CV content. '.repeat(3)};
    const result=await save(intent({profile:different,claims:[]}));expect(result.variant.profile).toEqual(different);expect(result.variant.claims).toEqual([]);expect((await record()).data).toEqual(before.data);
  });
  it.each(['queued','running'])('preserves an existing %s run and approved packet, including across a legacy whole-record write',async status=>{
    const before=await record(),hash='a'.repeat(64),opportunity=randomUUID();
    const run=(await query("SELECT job_loop_start_run_bound($1,$2,$3,$4,$4,$5,'rules','grounded-rules-v1','{}') result",[owner,generation,randomUUID(),hash,version])).rows[0].result;
    if(status==='running')await query("UPDATE job_loop_runs SET status='running',lease_token=$2,lease_until=now()+interval '1 minute' WHERE id=$1",[run.id,randomUUID()]);
    await query("INSERT INTO job_loop_packets(id,user_id,run_id,opportunity_id,input_version,input_hash,data,status,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,'approved',now())",[randomUUID(),owner,run.id,opportunity,before.input_version,hash,{opportunityId:opportunity,status:'approved',approval:{inputHash:hash,approved:true},artifacts:{}}]);
    const runs=(await query('SELECT * FROM job_loop_runs')).rows,packets=(await query('SELECT * FROM job_loop_packets')).rows;
    const saved=await save();
    expect((await query('SELECT * FROM job_loop_runs')).rows).toEqual(runs);expect((await query('SELECT * FROM job_loop_packets')).rows).toEqual(packets);expect((await record()).input_version).toBe(before.input_version);
    await query('SELECT job_loop_write_record($1,$2,$3,false)',[owner,saved.recordVersion,{...before.data,inbox:[]}]);
    expect((await read()).variants).toEqual([saved.variant]);expect((await record()).data).toEqual(before.data);
    expect((await query('SELECT * FROM job_loop_runs')).rows).toEqual(runs);expect((await query('SELECT * FROM job_loop_packets')).rows).toEqual(packets);
  });
  it('binds explicit claim order into the source fingerprint and request identity',async()=>{
    const r=await record(),second={...r.data.claims[0],id:randomUUID(),sourceKind:'user_answer'};r.data.claims.push(second);
    await query('UPDATE job_loop_records SET data=$2 WHERE user_id=$1',[owner,r.data]);
    const refs=[{id:claimId,revision:1},{id:second.id,revision:1}],original=intent({claims:refs}),first=await save(original);version=first.recordVersion;
    await expect(save({...original,claims:[...refs].reverse()})).rejects.toThrow('LOOP_REQUEST_CONFLICT');
    const reverse=await save(intent({claims:[...refs].reverse()}));expect(reverse.sourceHash).not.toBe(first.sourceHash);expect(reverse.variant.claims.map((c:any)=>c.id)).toEqual([second.id,claimId]);
  });
  it('rejects copying confirmed CV passages onto a changed source',async()=>{await expect(save(intent({profile:{...profile(),sourceText:profile().sourceText+'\nChanged source'}}))).rejects.toThrow('LOOP_VARIANT_SOURCE_CHANGED');});
  it('limits owned variants to three and updates the same opaque ID',async()=>{
    const first=await save();version=first.recordVersion;
    for(let n=0;n<2;n++)version=(await save(intent({label:`Variant ${n}`}))).recordVersion;
    await expect(save()).rejects.toThrow('LOOP_VARIANT_LIMIT');
    const update=await save(intent({variant:first.variant.id,revision:1,label:'Edited label'}));expect(update.variant.id).toBe(first.variant.id);expect(update.variant.revision).toBe(2);expect((await read()).variants).toHaveLength(3);
  });
  it('preserves an ambiguous retry after unrelated progress and after a later variant edit',async()=>{
    const original=intent(),first=await save(original);version=first.recordVersion;
    const changed=await save(intent({variant:first.variant.id,revision:1,label:'Newer draft'}));
    const retry=await save(original);expect(retry.reused).toBe(true);expect(retry.savedRevision).toBe(1);expect(retry.variant).toEqual(changed.variant);expect(retry.requestHash).toBe(first.requestHash);
    expect((await record()).version).toBe(changed.recordVersion);expect((await read()).variants).toHaveLength(1);
  });
  it('does not let a reused request overwrite a different payload',async()=>{const i=intent();await save(i);await expect(save({...i,label:'Substitution'})).rejects.toThrow('LOOP_REQUEST_CONFLICT');});
  it('rejects stale record or variant revisions atomically',async()=>{
    await expect(save(intent({expected:version-1}))).rejects.toThrow('LOOP_VERSION_CONFLICT');const saved=await save();version=saved.recordVersion;
    await expect(save(intent({variant:saved.variant.id,revision:2}))).rejects.toThrow('LOOP_VARIANT_REVISION_CONFLICT');expect((await read()).variants[0].revision).toBe(1);
  });
  it.each([{consent:false},{consent:null}])('requires explicit private-save consent %j',async overrides=>{await expect(save(intent(overrides))).rejects.toThrow();expect((await read()).variants).toEqual([]);});
  it.each(['withdrawn','unshared','unconfirmed','revision','missing','duplicate'])('rejects unavailable claim authority: %s',async kind=>{
    const r=await record(),c=r.data.claims[0];if(kind==='withdrawn')c.status='withdrawn';if(kind==='unshared')c.shareable=false;if(kind==='unconfirmed')c.confirmed=false;if(kind==='revision')c.revision=2;if(kind==='missing')r.data.claims=[];if(kind==='duplicate')r.data.claims.push({...c});
    await query('UPDATE job_loop_records SET data=$2 WHERE user_id=$1',[owner,r.data]);await expect(save()).rejects.toThrow('LOOP_VARIANT_CLAIM_UNAVAILABLE');
  });
  it('resolves only owned claims and rejects duplicate or injected refs',async()=>{
    await expect(save(intent({claims:[{id:randomUUID(),revision:1}]}))).rejects.toThrow('LOOP_VARIANT_CLAIM_UNAVAILABLE');
    await expect(save(intent({claims:[{id:claimId,revision:1},{id:claimId,revision:1}]}))).rejects.toThrow('LOOP_VARIANT_INVALID');
    await expect(save(intent({claims:[{id:claimId,revision:1,confirmed:true}]}))).rejects.toThrow('LOOP_VARIANT_INVALID');
  });
  it.each([{user:null},{generation:null},{expected:null},{request:null},{revision:null},{claims:[{id:'claim',revision:null}]},{label:'unsafe\u007f'}])('rejects missing authority or malformed references %j',async overrides=>{
    await expect(save(intent(overrides))).rejects.toThrow();expect((await read()).variants).toEqual([]);
  });
  it('rejects stale generation reads and does not activate an absent owner record',async()=>{
    await expect(read(owner,generation+1)).rejects.toThrow('LOOP_REQUEST_STALE');
    await expect(read(other,generation)).rejects.toThrow(/LOOP_REQUEST_STALE|LOOP_VARIANT_UNAVAILABLE/);
    expect((await query('SELECT * FROM job_loop_records WHERE user_id=$1',[other])).rows).toEqual([]);
  });
  it.each([null,{...profile(),audience:null},{...profile(),revision:2},{...profile(),sourceText:'short'},{...profile(),compensation:{currency:'',period:null,minimum:null}},{...profile(),targetTitles:['same','SAME']},{...profile(),name:'unsafe\u202e'}])('rejects invalid or privileged profile %j',async p=>{await expect(save(intent({profile:p}))).rejects.toThrow('LOOP_VARIANT_INVALID');});
  it('does not expose or change another owner’s variant',async()=>{
    const first=await save();const second=(await query('SELECT job_loop_open_record($1) result',[other])).rows[0].result;
    expect((await read(other,second.lifecycle_generation)).variants).toEqual([]);
    await expect(save(intent({user:other,generation:second.lifecycle_generation,expected:second.version,variant:first.variant.id,revision:1,claims:[]}))).rejects.toThrow('LOOP_VARIANT_UNAVAILABLE');
  });
  it('hides erasing data immediately and cascades both CV bytes and receipts through the actual finisher',async()=>{
    const original=intent();await save(original);const erasure=(await query('SELECT job_loop_begin_erase($1,$2) result',[owner,generation])).rows[0].result;
    await expect(read()).rejects.toThrow(/LOOP_REQUEST_STALE|LOOP_ERASURE_IN_PROGRESS/);
    await expect(save(original)).rejects.toThrow(/LOOP_REQUEST_STALE|LOOP_ERASURE_IN_PROGRESS/);
    const life=(await query('SELECT generation FROM job_loop_lifecycle WHERE user_id=$1',[owner])).rows[0];
    await query('SELECT job_loop_finish_erase($1,$2)',[owner,life.generation]);
    expect((await query('SELECT * FROM jobvance_private.loop_cv_variants')).rows).toEqual([]);expect((await query('SELECT * FROM jobvance_private.loop_cv_variant_requests')).rows).toEqual([]);
    const fresh=(await query('SELECT job_loop_open_record($1) result',[owner])).rows[0].result;expect((await read(owner,fresh.lifecycle_generation)).variants).toEqual([]);
    await expect(save(original)).rejects.toThrow('LOOP_REQUEST_STALE');expect(erasure).toBeDefined();
  });
  it.each(['anon','authenticated','service_role'])('denies %s direct table access',async role=>{
    await db.exec(`SET ROLE ${role}`);try{await expect(query('SELECT * FROM jobvance_private.loop_cv_variants')).rejects.toThrow(/permission denied/);await expect(query('DELETE FROM jobvance_private.loop_cv_variant_requests')).rejects.toThrow(/permission denied/);}finally{await db.exec('RESET ROLE');}
  });
  it.each(['anon','authenticated'])('denies %s save/read RPCs',async role=>{
    await db.exec(`SET ROLE ${role}`);try{await expect(query('SELECT job_loop_read_cv_variants_bound($1,$2)',[owner,generation])).rejects.toThrow(/permission denied/);await expect(query('SELECT job_loop_save_cv_variant_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',Object.values(intent()))).rejects.toThrow(/permission denied/);}finally{await db.exec('RESET ROLE');}
  });
  it('fixes routine search paths and keeps source-free retry metadata',async()=>{
    await save();const routines=(await query("SELECT proconfig FROM pg_proc WHERE proname IN('save_cv_variant_bound','job_loop_save_cv_variant_bound','job_loop_read_cv_variants_bound','valid_cv_variant_profile')")).rows;
    expect(routines).toHaveLength(4);for(const routine of routines)expect(routine.proconfig).toEqual(['search_path=""']);
    const receipt=(await query('SELECT * FROM jobvance_private.loop_cv_variant_requests')).rows[0];expect(JSON.stringify(receipt)).not.toContain('Created Employer');
  });
});
