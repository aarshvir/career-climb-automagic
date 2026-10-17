import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Disposable owners, actual PostgreSQL locks and independent connections only.
// This proves admission ordering, not hosted authentication or worker behavior.
export async function cvVariantFactsNativeCases({observer,actor,check,blocking,quote}) {
  const json=value=>`${quote(JSON.stringify(value))}::jsonb`;
  const profile={audience:'professional',name:'Native Example',contactLine:'',targetTitles:['Analyst'],locations:['Remote'],experienceYears:null,languages:['English'],pageTarget:1,discreetSearch:true,sourceText:'Independent Example Group\nHelped prepare an operations tracker covering six workstreams.\nEducation: Business studies.',excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null}};
  const claim={sourceKind:'cv_passage',sourceQuote:'Helped prepare an operations tracker covering six workstreams.',phrasing:'Helped prepare an operations tracker covering six workstreams.',context:'Independent Example Group',kind:'employment',resultStatus:'not_measured',confirmed:true,shareable:true};
  const server=(name,f)=>actor(name,f.owner,'service_role');
  const read=f=>observer.json(`SELECT to_jsonb(r) FROM job_loop_records r WHERE user_id=${quote(f.owner)};`);
  const facts=f=>observer.json(`SELECT COALESCE(jsonb_agg(snapshot ORDER BY id),'[]'::jsonb) FROM jobvance_private.loop_cv_variant_facts WHERE user_id=${quote(f.owner)};`);
  const counts=f=>observer.json(`SELECT jsonb_build_object('facts',(SELECT count(*) FROM jobvance_private.loop_cv_variant_facts WHERE user_id=${quote(f.owner)}),'requests',(SELECT count(*) FROM jobvance_private.loop_cv_variant_fact_requests WHERE user_id=${quote(f.owner)}),'history',(SELECT count(*) FROM jobvance_private.loop_cv_variant_fact_history h JOIN jobvance_private.loop_cv_variant_facts f ON f.id=h.fact_id WHERE f.user_id=${quote(f.owner)}));`);
  const save=(f,{expected=f.record.version,request=f.request,revision=f.variant.revision,hash=f.variant.sourceHash,fact=null,factRevision=0,input=claim}={})=>`SELECT job_loop_save_cv_variant_fact_bound(${quote(f.owner)},${f.generation},${expected},${quote(request)},${quote(f.variant.id)},${revision},${quote(hash)},${fact?quote(fact):'NULL'},${factRevision},${json(input)},true);`;
  const withdraw=(f,fact,{expected=f.record.version,request=randomUUID()}={})=>`SELECT job_loop_withdraw_cv_variant_fact_bound(${quote(f.owner)},${f.generation},${expected},${quote(request)},${quote(f.variant.id)},${fact.variantRevision},${quote(fact.sourceHash)},${quote(fact.id)},${fact.revision},true);`;
  const edit=(f,{expected=f.record.version,source={...profile,sourceText:profile.sourceText+'\nNew source detail.'}}={})=>`SELECT job_loop_save_cv_variant_bound(${quote(f.owner)},${f.generation},${expected},${quote(randomUUID())},${quote(f.variant.id)},${f.variant.revision},'Independent CV',${json(source)},'[]'::jsonb,true);`;
  const rejected=(promise,code)=>promise.then(()=>false,error=>error.message.includes(code));
  const detail=(first,second,blockingPids)=>({distinctBackendPids:[first.pid,second.pid],blockingPids});
  async function setup() {
    const owner=randomUUID();await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(owner)});`);
    const opened=await observer.json(`SELECT job_loop_open_record(${quote(owner)});`);
    const data={profile:{...profile,sourceText:'Global source remains unchanged and separate. '.repeat(3),revision:1},claims:[],opportunities:[],inbox:[]};
    const record=await observer.json(`SELECT job_loop_write_record(${quote(owner)},${opened.version},${json(data)},true);`);
    const variant=await observer.json(`SELECT job_loop_save_cv_variant_bound(${quote(owner)},${opened.lifecycle_generation},${record.version},${quote(randomUUID())},NULL,0,'Independent CV',${json(profile)},'[]'::jsonb,true);`);
    return {owner,generation:opened.lifecycle_generation,record:{...record,version:variant.recordVersion},variant:variant.variant,request:randomUUID()};
  }
  await check('identical fact saves serialize to one identity and receipt, preserving global input',async()=>{
    const f=await setup(),a=await server('fact-duplicate-first',f),b=await server('fact-duplicate-retry',f);
    await a.query('BEGIN;');const saved=await a.json(save(f)),pending=b.json(save(f)),blocked=await blocking(b,a);
    assert.deepEqual(await counts(f),{facts:0,requests:0,history:0});await a.query('COMMIT;');const retry=await pending;
    assert.deepEqual(retry,{...saved,reused:true});assert.deepEqual(await counts(f),{facts:1,requests:1,history:1});
    const current=await read(f);assert.deepEqual(current.data,f.record.data);assert.equal(current.input_version,f.record.input_version);assert.equal(current.version,f.record.version+1);
    await a.end();await b.end();return detail(a,b,blocked);
  });
  await check('conflicting simultaneous fact request rejects changed sharing intent',async()=>{
    const f=await setup(),a=await server('fact-conflict-first',f),b=await server('fact-conflict-loser',f);
    await a.query('BEGIN;');const saved=await a.json(save(f)),pending=rejected(b.query(save(f,{input:{...claim,shareable:false}})),'LOOP_REQUEST_CONFLICT'),blocked=await blocking(b,a);
    await a.query('COMMIT;');assert.equal(await pending,true);assert.deepEqual(await facts(f),[saved.fact]);assert.deepEqual(await counts(f),{facts:1,requests:1,history:1});
    await a.end();await b.end();return detail(a,b,blocked);
  });
  await check('variant source edit first rejects stale confirmation even with a fresh record version',async()=>{
    const f=await setup(),a=await server('fact-source-edit',f),b=await server('fact-after-source-edit',f);
    await a.query('BEGIN;');const changed=await a.json(edit(f)),pending=rejected(b.query(save(f)),'LOOP_VERSION_CONFLICT'),blocked=await blocking(b,a);
    await a.query('COMMIT;');assert.equal(await pending,true);const fresh=await server('fact-old-source-fresh-record',f);
    assert.equal(await rejected(fresh.query(save(f,{expected:changed.recordVersion,request:randomUUID()})),'LOOP_VARIANT_FACT_SOURCE_CHANGED'),true);
    assert.deepEqual(await facts(f),[]);await a.end();await b.end();await fresh.end();return detail(a,b,blocked);
  });
  await check('fact save first preserves original provenance across a subsequent variant edit',async()=>{
    const f=await setup(),a=await server('fact-before-source-edit',f),b=await server('fact-source-edit-later',f);
    await a.query('BEGIN;');const saved=await a.json(save(f)),pending=b.json(edit(f,{expected:saved.recordVersion})),blocked=await blocking(b,a);
    await a.query('COMMIT;');const changed=await pending;assert.deepEqual(await facts(f),[saved.fact]);
    const retry=await a.json(save(f));assert.equal(retry.savedRevision,1);assert.equal(retry.variant.revision,2);assert.equal(retry.fact.variantRevision,1);assert.equal(retry.sourceHash,saved.sourceHash);assert.equal(retry.reused,true);
    const withdrawn=await a.json(withdraw(f,saved.fact,{expected:changed.recordVersion}));assert.equal(withdrawn.fact.status,'withdrawn');assert.equal(withdrawn.fact.variantRevision,1);
    await a.end();await b.end();return detail(a,b,blocked);
  });
  await check('withdrawal wins against stale reconfirmation and old save retry never reactivates the fact',async()=>{
    const f=await setup(),a=await server('fact-withdraw-first',f),seed=await a.json(save(f)),b=await server('fact-stale-reconfirm',f);f.record.version=seed.recordVersion;
    const originalSave=save(f,{expected:seed.recordVersion-1});
    await a.query('BEGIN;');const removed=await a.json(withdraw(f,seed.fact)),pending=rejected(b.query(save(f,{request:randomUUID(),fact:seed.fact.id,factRevision:1})),'LOOP_VERSION_CONFLICT'),blocked=await blocking(b,a);
    await a.query('COMMIT;');assert.equal(await pending,true);const fresh=await server('fact-stale-revision-fresh-record',f);
    assert.equal(await rejected(fresh.query(save(f,{expected:removed.recordVersion,request:randomUUID(),fact:seed.fact.id,factRevision:1})),'LOOP_VARIANT_FACT_REVISION_CONFLICT'),true);
    const retry=await a.json(originalSave);assert.equal(retry.savedRevision,1);assert.equal(retry.fact.revision,2);assert.equal(retry.fact.status,'withdrawn');assert.equal(retry.fact.shareable,false);assert.equal(retry.reused,true);
    assert.deepEqual(await counts(f),{facts:1,requests:2,history:2});await a.end();await b.end();await fresh.end();return detail(a,b,blocked);
  });
  await check('reconfirmation wins and a delayed withdrawal cannot revoke the newer fact revision',async()=>{
    const f=await setup(),a=await server('fact-reconfirm-first',f),seed=await a.json(save(f)),b=await server('fact-stale-withdraw',f);f.record.version=seed.recordVersion;
    await a.query('BEGIN;');const updated=await a.json(save(f,{request:randomUUID(),fact:seed.fact.id,factRevision:1,input:{...claim,shareable:false}})),pending=rejected(b.query(withdraw(f,seed.fact)),'LOOP_VERSION_CONFLICT'),blocked=await blocking(b,a);
    await a.query('COMMIT;');assert.equal(await pending,true);const fresh=await server('fact-stale-withdraw-fresh-record',f);
    assert.equal(await rejected(fresh.query(withdraw(f,seed.fact,{expected:updated.recordVersion})),'LOOP_VARIANT_FACT_REVISION_CONFLICT'),true);assert.deepEqual(await facts(f),[updated.fact]);
    await a.end();await b.end();await fresh.end();return detail(a,b,blocked);
  });
  await check('erasure fences blocked fact saves and reads, then cascades all fact history',async()=>{
    const f=await setup(),a=await server('fact-erasure-first',f),seed=await a.json(save(f)),b=await server('fact-after-erasure',f),reader=await server('fact-read-after-erasure',f);
    f.record.version=seed.recordVersion;await a.query('BEGIN;');const erase=await a.json(`SELECT job_loop_begin_erase(${quote(f.owner)},${f.generation});`);
    const pending=rejected(b.query(save(f,{request:randomUUID()})),'LOOP_REQUEST_STALE'),readPending=rejected(reader.query(`SELECT job_loop_read_cv_variant_facts_bound(${quote(f.owner)},${f.generation},${quote(f.variant.id)});`),'LOOP_REQUEST_STALE');
    const blocked=await blocking(b,a),readBlocked=await blocking(reader,a);await a.query('COMMIT;');assert.equal(await pending,true);assert.equal(await readPending,true);
    await a.query(`SELECT job_loop_finish_erase(${quote(f.owner)},${erase.generation});`);assert.deepEqual(await counts(f),{facts:0,requests:0,history:0});
    const fresh=await a.json(`SELECT job_loop_open_record(${quote(f.owner)});`);assert(fresh.lifecycle_generation>f.generation);
    await a.end();await b.end();await reader.end();return {...detail(a,b,blocked),readBackendPid:reader.pid,readBlockingPids:readBlocked};
  });
  await check('fact save completes before erasure and cannot survive its later cascade',async()=>{
    const f=await setup(),a=await server('fact-before-erasure',f),b=await server('fact-erasure-later',f);
    await a.query('BEGIN;');await a.json(save(f));const pending=b.json(`SELECT job_loop_begin_erase(${quote(f.owner)},${f.generation});`),blocked=await blocking(b,a);
    await a.query('COMMIT;');const erase=await pending;assert.deepEqual(await counts(f),{facts:1,requests:1,history:1});
    await b.query(`SELECT job_loop_finish_erase(${quote(f.owner)},${erase.generation});`);assert.deepEqual(await counts(f),{facts:0,requests:0,history:0});
    await a.end();await b.end();return detail(a,b,blocked);
  });
  await check('legacy global writes serialize with fact saves and cannot discard independent facts',async()=>{
    const f=await setup(),a=await server('fact-before-legacy-write',f),b=await server('fact-legacy-write',f);
    await a.query('BEGIN;');const saved=await a.json(save(f)),data={...f.record.data,profile:{...f.record.data.profile,sourceText:f.record.data.profile.sourceText+'\nNew global detail.'}};
    const pending=b.json(`SELECT job_loop_write_record(${quote(f.owner)},${saved.recordVersion},${json(data)},true);`),blocked=await blocking(b,a);
    await a.query('COMMIT;');const changed=await pending;assert.deepEqual(await facts(f),[saved.fact]);assert.deepEqual((await read(f)).data,data);assert.equal(changed.version,saved.recordVersion+1);
    const retry=await a.json(save(f));assert.deepEqual(retry.fact,saved.fact);assert.equal(retry.reused,true);
    await a.end();await b.end();return detail(a,b,blocked);
  });
}
