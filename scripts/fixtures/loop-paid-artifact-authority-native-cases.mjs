import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Native sessions on the full deployed billing chain plus the paid artifact
// authority migration. Storage is the local storage.objects fixture; its writer
// session stands in for the Storage service role, so the real BEFORE triggers run.
export async function loopPaidArtifactAuthorityNativeCases({observer,actor,check,blocking,quote}){
  const hash='a'.repeat(64),j=value=>`${quote(JSON.stringify(value))}::jsonb`;
  const career={profile:{name:'Native paid fixture'},claims:[],opportunities:[],inbox:[]};
  const detail=(a,b,p)=>({distinctBackendPids:[a.pid,b.pid],blockingPids:p});
  const rejected=(promise,code)=>promise.then(()=>false,error=>error.message.includes(code));
  const named=(name,args)=>`SELECT ${name}(${Object.entries(args).map(([key,value])=>`${key}=>${value===null?'NULL':typeof value==='number'||typeof value==='boolean'?value:quote(value)}`).join(',')});`;
  async function account(){
    const f={user:randomUUID(),session:randomUUID()};
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(f.user)});INSERT INTO auth.sessions(id,user_id) VALUES(${quote(f.session)},${quote(f.user)});`);
    const opened=await observer.json(`SELECT job_loop_open_record(${quote(f.user)});`);f.generation=opened.lifecycle_generation;
    await observer.query(`SELECT job_loop_write_record(${quote(f.user)},${opened.version},${j(career)},true);`);return f;
  }
  // Current production purchase: v3 USD quote, quoted claim, provider-read first payment.
  async function paid(){
    const f=await account(),suffix=f.user.replaceAll('-','');Object.assign(f,{request:randomUUID(),checkout:'cks_'+suffix,subscription:'sub_'+suffix,customer:'cus_'+suffix,payment:'pay_'+suffix});
    Object.assign(f,await observer.json("SELECT jsonb_build_object('start',now()-interval '1 day','end',now()+interval '29 days','created',extract(epoch FROM now())::bigint-100);"));
    const base={p_user:f.user,p_auth_session:f.session,p_generation:f.generation,p_request:randomUUID(),p_mode:'live',p_plan:'weekly',p_country:'US',p_currency:'USD'};
    const catalog=(await observer.json(named('job_loop_billing_quote_candidate',base))).catalog;
    f.quote=await observer.json(named('job_loop_billing_quote_issue',{...base,p_catalog_version:catalog.catalogVersion,p_product:catalog.productId,p_rule:null,p_provider_revision:'b'.repeat(64),p_preview_hash:'c'.repeat(64),p_initial_amount:catalog.amountMinor,p_recurring_amount:catalog.amountMinor}));
    await observer.query(`SELECT job_loop_billing_checkout_claim_v2(${quote(f.user)},${quote(f.session)},${f.generation},${quote(f.request)},'live','weekly',${quote(f.quote.productId)},${quote(f.quote.quoteId)});SELECT job_loop_billing_checkout_finalize(${quote(f.user)},${quote(f.session)},${f.generation},${quote(f.request)},${quote(f.checkout)},${quote('https://checkout.dodopayments.com/session/'+f.checkout)});`);
    await observer.query(event(f));assert.equal((await observer.json(entitlement(f))).active,true);return f;
  }
  const event=(f,changes={})=>{const e={created:f.created,revoked:false,...changes};return `SELECT job_loop_billing_apply_event_v2(${quote(f.user)},${quote(f.request)},'live','weekly',${quote(f.quote.productId)},${quote(f.checkout)},${quote(f.subscription)},${quote(f.customer)},'active',${quote(f.start)},${quote(f.end)},false,${quote('evt_'+randomUUID())},${e.created},${e.revoked},${quote(hash)},${quote(f.payment)},${f.quote.amountMinor},NULL,${quote(f.quote.quoteId)},'USD');`;};
  const entitlement=f=>`SELECT job_loop_billing_entitlement(${quote(f.user)});`;
  // psql prints SQL NULL as an empty line, so absence is reported explicitly.
  const seat=async f=>observer.json(`SELECT to_json(COALESCE((SELECT active::text FROM job_loop_pilot_users WHERE user_id=${quote(f.user)}),'none'));`);
  async function start(f){
    const record=await observer.json(`SELECT job_loop_read_record(${quote(f.user)},${f.generation});`);
    const run=await observer.json(`SELECT job_loop_start_run_bound(${quote(f.user)},${f.generation},${quote(randomUUID())},${quote(hash)},${quote(hash)},${record.version},'rules','grounded-rules-v1','{}'::jsonb);`);
    f.run=run.id;f.lease=randomUUID();assert.equal((await observer.json(`SELECT job_loop_claim_run(${quote(f.run)},${quote(f.lease)});`)).lease_token,f.lease);return f;
  }
  const authorize=f=>`SELECT to_json(job_loop_authorize_artifact(${quote(f.user)},${quote(f.run)},${quote(f.lease)},${quote(randomUUID())},${quote(hash)},'txt'));`;
  const store=path=>`INSERT INTO storage.objects(bucket_id,name) VALUES('job-loop-artifacts',${quote(path)});`;
  const stored=async path=>observer.json(`SELECT to_json(count(*)) FROM storage.objects WHERE bucket_id='job-loop-artifacts' AND name=${quote(path)};`);
  // ON_ERROR_STOP ends a psql session on error, so each expected refusal uses its own backend.
  const refused=async(name,f,role,sql,code)=>{const s=await actor(name,f.user,role);const result=await rejected(s.query(sql),code);await s.end();return result;};

  await check('paid-only subscriber authorizes and stores a run document without taking a pilot seat',async()=>{
    await observer.query('TRUNCATE auth.users CASCADE;');
    const f=await start(await paid()),service=await actor('paid-authorizer',f.user,'service_role'),writer=await actor('storage-writer',f.user,'fixture_admin');
    const path=await service.json(authorize(f));assert.equal(path,`${f.user}/${path.split('/')[1]}/${hash}/txt`);
    await writer.query(store(path));assert.equal(await stored(path),1);
    assert.equal(await seat(f),'none');assert.equal(await observer.json('SELECT to_json(count(*)) FROM job_loop_pilot_users;'),0);
    await service.end();await writer.end();return {distinctBackendPids:[service.pid,writer.pid],pilotSeatCreated:false};
  });
  await check('a committed refund serializes ahead of a concurrent paid storage write and refuses it',async()=>{
    await observer.query('TRUNCATE auth.users CASCADE;');
    const f=await start(await paid()),path=await observer.json(authorize(f)),refund=await actor('refund-first',f.user,'service_role'),writer=await actor('upload-after-refund',f.user,'fixture_admin');
    await refund.query('BEGIN;');await refund.query(event(f,{revoked:true,created:f.created+10}));
    const pending=rejected(writer.query(store(path)),'LOOP_ARTIFACT_UNAUTHORIZED'),p=await blocking(writer,refund);await refund.query('COMMIT;');
    assert.equal(await pending,true);assert.equal(await stored(path),0);assert.equal((await observer.json(entitlement(f))).active,false);
    await refund.end();await writer.end();return detail(refund,writer,p);
  });
  await check('a paid storage write holding the owner lock commits before a concurrent refund, which then stops later authorization',async()=>{
    await observer.query('TRUNCATE auth.users CASCADE;');
    const f=await start(await paid()),path=await observer.json(authorize(f)),writer=await actor('upload-first',f.user,'fixture_admin'),refund=await actor('refund-after-upload',f.user,'service_role');
    await writer.query('BEGIN;');await writer.query(store(path));
    const pending=refund.json(event(f,{revoked:true,created:f.created+10})),p=await blocking(refund,writer);await writer.query('COMMIT;');
    assert.equal((await pending).duplicate,false);assert.equal(await stored(path),1);
    assert.equal(await refused('authorize-after-refund',f,'service_role',authorize(f),'LOOP_LEASE_LOST'),true);
    await writer.end();await refund.end();return detail(writer,refund,p);
  });
  await check('lapsed subscriber without a seat stays refused while a pilot seat is unchanged',async()=>{
    await observer.query('TRUNCATE auth.users CASCADE;');
    const lapsed=await start(await paid()),earlier=await observer.json(authorize(lapsed));
    await observer.query(`UPDATE jobvance_private.loop_subscription_periods SET starts_at=now()-interval '32 days',ends_at=now()-interval '2 days' WHERE subscription_id=${quote(lapsed.subscription)};UPDATE jobvance_private.loop_subscriptions SET valid_until=now()-interval '2 days' WHERE subscription_id=${quote(lapsed.subscription)};`);
    assert.equal((await observer.json(entitlement(lapsed))).active,false);
    assert.equal(await refused('lapsed-authorize',lapsed,'service_role',authorize(lapsed),'LOOP_LEASE_LOST'),true);
    assert.equal(await refused('lapsed-storage',lapsed,'fixture_admin',store(earlier),'LOOP_ARTIFACT_UNAUTHORIZED'),true);
    const pilot=await start(await account());assert.equal(await seat(pilot),'true');
    const path=await observer.json(authorize(pilot));await observer.query(store(path));assert.equal(await stored(path),1);
    return {lapsedAuthorizationRefused:true,lapsedStorageRefused:true,pilotSeatStored:true};
  });
}
