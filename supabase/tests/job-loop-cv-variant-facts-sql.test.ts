// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
let db:PGlite, owner:string, other:string, generation:number, version:number, variant:any;
const source='Independent Employer\nPrepared weekly operations reports with the team.\nEducation\nCreated University business degree.';
const profile=(sourceText=source)=>({audience:'professional',name:'Created Candidate',contactLine:'',targetTitles:['Analyst'],locations:['Dubai'],experienceYears:3,languages:['English'],pageTarget:1,discreetSearch:false,sourceText,excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null}});
const claim=()=>({sourceKind:'cv_passage',sourceQuote:'Prepared weekly operations reports with the team.',phrasing:'Prepared weekly operations reports with the team.',context:'Independent Employer',kind:'employment',resultStatus:'not_measured',confirmed:true,shareable:true});
const query=(sql:string,args:unknown[]=[])=>db.query<Record<string,any>>(sql,args);
async function service(sql:string,args:unknown[]){await db.exec('SET ROLE service_role');try{return (await query(sql,args)).rows[0]?.result;}finally{await db.exec('RESET ROLE');}}
const record=async()=>(await query('SELECT * FROM job_loop_records WHERE user_id=$1',[owner])).rows[0];
function intent(overrides:Record<string,unknown>={}){return {user:owner,generation,expected:version,request:randomUUID(),variant:variant.id,variantExpected:variant.revision,sourceHash:variant.sourceHash,fact:null,factExpected:0,claim:claim(),consent:true,...overrides};}
const save=(i=intent())=>service('SELECT job_loop_save_cv_variant_fact_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',Object.values(i));
const read=(user=owner,gen=generation,id=variant.id)=>service('SELECT job_loop_read_cv_variant_facts_bound($1,$2,$3) result',[user,gen,id]);
function withdrawIntent(f:any,overrides:Record<string,unknown>={}){return {user:owner,generation,expected:version,request:randomUUID(),variant:f.variantId,variantExpected:f.variantRevision,sourceHash:f.sourceHash,fact:f.id,factExpected:f.revision,consent:true,...overrides};}
const withdraw=(i:any)=>service('SELECT job_loop_withdraw_cv_variant_fact_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',Object.values(i));
async function editVariant(sourceText=source+'\nNew source line.'){const result=await service('SELECT job_loop_save_cv_variant_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,true) result',[owner,generation,version,randomUUID(),variant.id,variant.revision,'Independent CV',profile(sourceText),[]]);version=result.recordVersion;variant=result.variant;return result;}
beforeAll(async()=>{db=new PGlite();await db.exec(await checkLoopSchema());for(const file of ['20261017013000_job_loop_cv_variants.sql','20261017080000_job_loop_cv_variant_facts.sql'])await db.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE');owner=randomUUID();other=randomUUID();await query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other]);
  const opened=(await query('SELECT job_loop_open_record($1) result',[owner])).rows[0].result;generation=opened.lifecycle_generation;
  const original={profile:{...profile('Global CV source remains independent. '.repeat(4)),revision:1,updatedAt:'2026-10-17T00:00:00Z'},claims:[],opportunities:[],inbox:[]};
  version=(await query('SELECT job_loop_write_record($1,$2,$3,true) result',[owner,opened.version,original])).rows[0].result.version;
  const created=await service('SELECT job_loop_save_cv_variant_bound($1,$2,$3,$4,NULL,0,$5,$6,$7,true) result',[owner,generation,version,randomUUID(),'Independent CV',profile(),[]]);variant=created.variant;version=created.recordVersion;
});
describe('independent per-variant fact SQL authority (isolated, unpublished)',()=>{
  it('confirms different-source facts independently, increments record version only and preserves history',async()=>{
    const before=await record(),v=structuredClone(variant),result=await save();
    expect(result.fact).toMatchObject({...claim(),generation,variantId:v.id,variantRevision:1,sourceHash:v.sourceHash,status:'active',revision:1});
    expect(result.variant).toEqual({id:v.id,revision:1,sourceHash:v.sourceHash});expect(result.savedRevision).toBe(1);expect(result.reused).toBe(false);
    const after=await record();expect(after.version).toBe(before.version+1);expect(after.input_version).toBe(before.input_version);expect(after.data).toEqual(before.data);
    expect((await query('SELECT snapshot FROM jobvance_private.loop_cv_variants')).rows[0].snapshot).toEqual(v);
    expect((await read()).facts).toEqual([result.fact]);expect((await query('SELECT snapshot FROM jobvance_private.loop_cv_variant_fact_history')).rows[0].snapshot).toEqual(result.fact);
  });
  it('allows a private confirmed user answer while keeping sharing false',async()=>{
    const answer={...claim(),sourceKind:'user_answer',sourceQuote:'Independent Employer: Supported reporting with the operations team.',phrasing:'Supported reporting with the operations team.',shareable:false};
    expect((await save(intent({claim:answer}))).fact).toMatchObject(answer);
  });
  it('supports full multiline literal passages including bullet normalization',async()=>{
    const passage='- Prepared weekly operations reports with the team.\n- Supported planning for the team.';await editVariant('Independent Employer\n'+passage+'\nEducation\nCreated University business degree.');
    const result=await save(intent({claim:{...claim(),sourceQuote:passage,phrasing:'Prepared weekly operations reports with the team.\nSupported planning for the team.'}}));expect(result.fact.sourceQuote).toBe(passage);
  });
  it.each(['Prepared weekly operations reports','weekly operations reports with the team.','Invented source statement.'])('rejects missing/cropped passage %s',async sourceQuote=>{await expect(save(intent({claim:{...claim(),sourceQuote,phrasing:sourceQuote}}))).rejects.toThrow('LOOP_VARIANT_FACT_SOURCE_CHANGED');expect((await read()).facts).toEqual([]);});
  it('rejects changed wording rather than infer fact equivalence',async()=>{await expect(save(intent({claim:{...claim(),phrasing:'Led the team and delivered all reporting.'}}))).rejects.toThrow('LOOP_VARIANT_FACT_SOURCE_CHANGED');});
  it('keeps exact retry idempotent after source edits and fact withdrawal',async()=>{
    const i=intent(),first=await save(i);version=first.recordVersion;await editVariant();
    const withdrawn=await withdraw(withdrawIntent(first.fact));version=withdrawn.recordVersion;
    const retry=await save(i);expect(retry.savedRevision).toBe(1);expect(retry.sourceHash).toBe(i.sourceHash);expect(retry.variantRevision).toBe(1);expect(retry.fact).toEqual(withdrawn.fact);expect(retry.variant.revision).toBe(2);expect(retry.reused).toBe(true);expect((await record()).version).toBe(version);
    expect((await query('SELECT * FROM jobvance_private.loop_cv_variant_fact_history')).rows).toHaveLength(2);
  });
  it('rejects a reused request with changed claim, provenance or action',async()=>{
    const i=intent(),saved=await save(i);version=saved.recordVersion;
    await expect(save({...i,claim:{...claim(),shareable:false}})).rejects.toThrow('LOOP_REQUEST_CONFLICT');
    await expect(save({...i,sourceHash:'f'.repeat(64)})).rejects.toThrow('LOOP_REQUEST_CONFLICT');
    await expect(withdraw(withdrawIntent(saved.fact,{request:i.request}))).rejects.toThrow('LOOP_REQUEST_CONFLICT');
  });
  it('withdraws after source edit, retries without repeated mutation, and never removes old provenance',async()=>{
    const saved=await save();version=saved.recordVersion;await editVariant();const i=withdrawIntent(saved.fact),result=await withdraw(i);version=result.recordVersion;
    expect(result.fact).toMatchObject({revision:2,status:'withdrawn',confirmed:false,shareable:false,variantRevision:1,sourceHash:saved.fact.sourceHash});
    const retry=await withdraw(i);expect(retry.reused).toBe(true);expect(retry.fact).toEqual(result.fact);expect((await record()).version).toBe(version);
  });
  it('allows explicit reconfirmation against a changed source but rejects old withdrawal revision',async()=>{
    const first=await save();version=first.recordVersion;const old=withdrawIntent(first.fact);await editVariant();
    const next=await save(intent({fact:first.fact.id,factExpected:1}));version=next.recordVersion;
    expect(next.fact).toMatchObject({id:first.fact.id,revision:2,variantRevision:2,sourceHash:variant.sourceHash,status:'active'});
    await expect(withdraw({...old,expected:version})).rejects.toThrow('LOOP_VARIANT_FACT_REVISION_CONFLICT');
  });
  it('rejects source A to B to A with the original variant revision',async()=>{
    const i=intent();await editVariant();await editVariant(source);
    expect(variant.sourceHash).toBe(i.sourceHash);await expect(save({...i,expected:version})).rejects.toThrow('LOOP_VARIANT_FACT_SOURCE_CHANGED');
  });
  it('rejects stale record and stale fact versions',async()=>{
    await expect(save(intent({expected:version-1}))).rejects.toThrow('LOOP_VERSION_CONFLICT');const f=await save();version=f.recordVersion;
    await expect(save(intent({fact:f.fact.id,factExpected:2}))).rejects.toThrow('LOOP_VARIANT_FACT_REVISION_CONFLICT');
  });
  it.each([{user:null},{generation:null},{expected:null},{expected:9007199254740991},{request:null},{variant:null},{variantExpected:null},{sourceHash:null},{factExpected:null},{consent:false},{consent:null},{factExpected:1}])('rejects missing or invalid authority %j',async override=>{await expect(save(intent(override))).rejects.toThrow();expect((await read()).facts).toEqual([]);});
  it.each([null,{...claim(),confirmed:false},{...claim(),shareable:null},{...claim(),kind:['employment']},{...claim(),id:randomUUID()},{...claim(),sourceQuote:'Unsafe\u007f source'},{...claim(),resultStatus:null}])('rejects malformed claim input %j',async value=>{await expect(save(intent({claim:value}))).rejects.toThrow('LOOP_VARIANT_FACT_INVALID');});
  it('does not expose foreign facts, initialize absent owners, or accept a foreign variant',async()=>{
    const f=await save();version=f.recordVersion;await expect(read(other)).rejects.toThrow();expect((await query('SELECT * FROM job_loop_records WHERE user_id=$1',[other])).rows).toHaveLength(0);
    const opened=(await query('SELECT job_loop_open_record($1) result',[other])).rows[0].result;
    await expect(save(intent({user:other,generation:opened.lifecycle_generation,expected:opened.version}))).rejects.toThrow('LOOP_VARIANT_UNAVAILABLE');
    await expect(read(other,opened.lifecycle_generation)).rejects.toThrow('LOOP_VARIANT_UNAVAILABLE');
  });
  it('survives legacy whole-record writes without changing global claims or history',async()=>{
    const saved=await save(),before=await record();await query('SELECT job_loop_write_record($1,$2,$3,false)',[owner,saved.recordVersion,{...before.data,inbox:[]}]);
    expect((await read()).facts).toEqual([saved.fact]);expect((await record()).data.claims).toEqual([]);expect((await record()).input_version).toBe(before.input_version);
  });
  it('preserves running work and approved packet bytes through fact changes',async()=>{
    const before=await record(),hash='a'.repeat(64),run=(await query("SELECT job_loop_start_run_bound($1,$2,$3,$4,$4,$5,'rules','grounded-rules-v1','{}') result",[owner,generation,randomUUID(),hash,version])).rows[0].result;
    await query("UPDATE job_loop_runs SET status='running',lease_token=$2,lease_until=now()+interval '1 minute' WHERE id=$1",[run.id,randomUUID()]);
    await query("INSERT INTO job_loop_packets(id,user_id,run_id,opportunity_id,input_version,input_hash,data,status,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,'approved',now())",[randomUUID(),owner,run.id,randomUUID(),before.input_version,hash,{status:'approved',artifacts:{}}]);
    const runs=(await query('SELECT * FROM job_loop_runs')).rows,packets=(await query('SELECT * FROM job_loop_packets')).rows;
    const saved=await save();version=saved.recordVersion;await withdraw(withdrawIntent(saved.fact));expect((await query('SELECT * FROM job_loop_runs')).rows).toEqual(runs);expect((await query('SELECT * FROM job_loop_packets')).rows).toEqual(packets);
  });
  it('hides data during erasure and cascades facts, history and receipts through actual finisher',async()=>{
    const i=intent();await save(i);await query('SELECT job_loop_begin_erase($1,$2)',[owner,generation]);await expect(read()).rejects.toThrow();await expect(save(i)).rejects.toThrow();
    const life=(await query('SELECT generation FROM job_loop_lifecycle WHERE user_id=$1',[owner])).rows[0];await query('SELECT job_loop_finish_erase($1,$2)',[owner,life.generation]);
    for(const table of ['loop_cv_variant_facts','loop_cv_variant_fact_history','loop_cv_variant_fact_requests'])expect((await query(`SELECT * FROM jobvance_private.${table}`)).rows).toEqual([]);
  });
  it.each(['anon','authenticated','service_role'])('denies %s direct table access',async role=>{
    await db.exec(`SET ROLE ${role}`);try{for(const table of ['loop_cv_variant_facts','loop_cv_variant_fact_history','loop_cv_variant_fact_requests'])await expect(query(`SELECT * FROM jobvance_private.${table}`)).rejects.toThrow(/permission denied/);}finally{await db.exec('RESET ROLE');}
  });
  it.each(['anon','authenticated'])('denies %s RPC access',async role=>{await db.exec(`SET ROLE ${role}`);try{await expect(query('SELECT job_loop_read_cv_variant_facts_bound($1,$2,$3)',[owner,generation,variant.id])).rejects.toThrow(/permission denied/);await expect(query('SELECT job_loop_save_cv_variant_fact_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',Object.values(intent()))).rejects.toThrow(/permission denied/);}finally{await db.exec('RESET ROLE');}});
  it('bounds all current identities to 150 facts, including withdrawn identities',async()=>{
    const seed=await save();version=seed.recordVersion;await query(`INSERT INTO jobvance_private.loop_cv_variant_facts(id,user_id,generation,variant_id,revision,snapshot) SELECT gen_random_uuid(),$1,$2,$3,1,$4 FROM generate_series(1,149)`,[owner,generation,variant.id,seed.fact]);
    await expect(save()).rejects.toThrow('LOOP_VARIANT_FACT_LIMIT');const result=await withdraw(withdrawIntent(seed.fact));version=result.recordVersion;await expect(save()).rejects.toThrow('LOOP_VARIANT_FACT_LIMIT');
  });
});
