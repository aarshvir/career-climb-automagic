// @vitest-environment node
// Actual integrated PostgreSQL SQL; provider refund/cancellation authority is
// already verified at the edge. No real provider calls, money or customer data.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { controlLoopBilling, type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime.ts';
import { LOOP_BILLING_PRODUCT, loopBillingConfiguration } from '../functions/_shared/loop-billing.ts';
import { dodoEnvironment } from './dodo-fixtures';

let db:PGlite,owner:string,session:string,request:string,start:string,end:string,epoch:number;
const migration='20261018091955_job_loop_refund_renewal_safety.sql';
const raw=(sql:string,args:unknown[]=[])=>db.query<Record<string,any>>(sql,args);
async function rpc(sql:string,args:unknown[]=[]){await db.exec('SET ROLE service_role');try{return(await raw(sql,args)).rows[0]?.r;}finally{await db.exec('RESET ROLE');}}
const claim=(id=request,mode='live')=>rpc('SELECT job_loop_billing_checkout_claim($1,$2,0,$3,$4,\'weekly\',\'pdt_fixture\') r',[owner,session,id,mode]);
const status=(mode='live')=>rpc('SELECT job_loop_billing_status($1,$2,$3) r',[owner,session,mode]);
const entitlement=()=>rpc('SELECT job_loop_billing_entitlement($1) r',[owner]);
function evidence(changes:Record<string,unknown>={}){return {user:owner,request,mode:'live',plan:'weekly',product:'pdt_fixture',checkout:'cks_fixture',subscription:'sub_fixture',customer:'cus_fixture',status:'active',start,end,cancel:false,event:'evt_initial',created:epoch,revoked:false,hash:'a'.repeat(64),payment:'pay_fixture',amount:2900,...changes};}
const apply=(event=evidence())=>rpc('SELECT job_loop_billing_apply_event('+Object.keys(event).map((_,i)=>'$'+(i+1)).join(',')+') r',Object.values(event));
async function paid(mode='live'){
  await claim(request,mode);await rpc('SELECT job_loop_billing_checkout_finalize($1,$2,0,$3,\'cks_fixture\',$4) r',[owner,session,request,`https://${mode==='test'?'test.':''}checkout.dodopayments.com/session/cks_fixture`]);
  await apply(evidence({mode}));
}
async function confirmedCancel(){const id=randomUUID(),version=(await status()).subscription.revision;await rpc('SELECT job_loop_billing_cancel_claim($1,$2,0,$3,\'live\',\'sub_fixture\',$4) r',[owner,session,id,version]);await rpc('SELECT job_loop_billing_cancel_finalize($1,$2,0,$3,\'live\',\'sub_fixture\',true) r',[owner,session,id]);}
beforeAll(async()=>{
  db=new PGlite();await db.exec(await checkLoopSchema());await db.exec('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz)');
  for(const file of ['20261017122000_job_loop_dodo_entitlements.sql','20261018073501_job_loop_subscription_lifecycle.sql',migration])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE; TRUNCATE jobvance_private.loop_billing_events');owner=randomUUID();session=randomUUID();request=randomUUID();
  await raw('INSERT INTO auth.users(id) VALUES($1)',[owner]);await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[session,owner]);await raw('SELECT job_loop_open_record($1)',[owner]);
  const time=(await raw("SELECT (now()-interval '1 day')::text start,(now()+interval '29 days')::text end,extract(epoch FROM now())::bigint-100 epoch")).rows[0];start=time.start;end=time.end;epoch=Number(time.epoch);
});

describe('refunded access and independent provider billing authority',()=>{
  it.each(['active','pending','on_hold','paused','past_due'])('blocks a second subscription for revoked but provider-renewable %s',async state=>{
    await paid();await apply(evidence({event:'evt_refund',created:epoch+1,revoked:true,status:state}));
    expect(await entitlement()).toMatchObject({active:false});await expect(claim(randomUUID())).rejects.toThrow('LOOP_SUBSCRIPTION_EXISTS');
    expect((await raw('SELECT * FROM jobvance_private.loop_billing_orders')).rows).toHaveLength(1);
    expect((await status()).subscription).toMatchObject({revoked:true,status:state,cancelAtPeriodEnd:false});expect((await status()).checkout).toBeNull();
  });
  it('blocks active provider billing even after the recorded paid period expires',async()=>{
    await paid();await raw("UPDATE jobvance_private.loop_subscriptions SET valid_until=now()-interval '1 day'");
    expect(await entitlement()).toMatchObject({active:false});await expect(claim(randomUUID())).rejects.toThrow('LOOP_SUBSCRIPTION_EXISTS');
  });
  it('reuses an exact unpaid checkout but rejects the same original request after its subscription consumed it',async()=>{
    await claim();await rpc('SELECT job_loop_billing_checkout_finalize($1,$2,0,$3,\'cks_fixture\',\'https://checkout.dodopayments.com/session/cks_fixture\') r',[owner,session,request]);
    expect(await claim()).toMatchObject({creationClaimAcquired:false,session_id:'cks_fixture'});await apply();
    await expect(claim()).rejects.toThrow('LOOP_CHECKOUT_FINISHED');
    await apply(evidence({event:'evt_refund',created:epoch+1,revoked:true}));await expect(claim()).rejects.toThrow('LOOP_CHECKOUT_FINISHED');
  });
  it.each(['pending','on_hold','paused','past_due'])('keeps unresolved %s payment recovery blocked despite a cancel-next flag',async state=>{
    await paid();await apply(evidence({event:'evt_refund',created:epoch+1,revoked:true,status:state,cancel:true}));
    await expect(claim(randomUUID())).rejects.toThrow('LOOP_SUBSCRIPTION_EXISTS');
  });
  it('lets the owner cancel revoked provider billing, never restores refunded access, then permits deliberate replacement',async()=>{
    await paid();await apply(evidence({event:'evt_refund',created:epoch+1,revoked:true}));await confirmedCancel();
    expect(await entitlement()).toMatchObject({active:false});expect((await status()).subscription).toMatchObject({revoked:true,cancelAtPeriodEnd:true});
    const next=randomUUID();expect(await claim(next)).toMatchObject({creationClaimAcquired:true,request_id:next});expect((await status()).checkout.requestId).toBe(next);
  });
  it('preserves non-refunded paid-through cancellation and does not sell overlapping paid access',async()=>{
    await paid();await confirmedCancel();expect(await entitlement()).toMatchObject({active:true});
    await expect(claim(randomUUID())).rejects.toThrow('LOOP_SUBSCRIPTION_EXISTS');expect((await status()).checkout).toBeNull();
  });
  it.each(['failed','expired','cancelled'])('permits a new deliberate checkout after confirmed provider-terminal %s and revocation',async state=>{
    await paid();await apply(evidence({event:'evt_terminal_refund',created:epoch+1,status:state,revoked:true}));
    const next=randomUUID();expect(await claim(next)).toMatchObject({creationClaimAcquired:true});expect((await status()).checkout.requestId).toBe(next);
  });
  it('protects a definitively failed old checkout retry after another subscription begins billing',async()=>{
    const failed=randomUUID();await claim(failed);await rpc('SELECT job_loop_billing_checkout_fail($1,$2,0,$3,true) r',[owner,session,failed]);
    await paid();await apply(evidence({event:'evt_refund',created:epoch+1,revoked:true}));
    await expect(claim(failed)).rejects.toThrow('LOOP_SUBSCRIPTION_EXISTS');
    expect((await raw('SELECT state FROM jobvance_private.loop_billing_orders WHERE request_id=$1',[failed])).rows[0].state).toBe('failed');
  });
  it('does not let Test provider billing block a separately scoped Live checkout',async()=>{
    await paid('test');await apply(evidence({mode:'test',event:'evt_test_refund',created:epoch+1,revoked:true}));
    expect(await claim(randomUUID(),'live')).toMatchObject({creationClaimAcquired:true,mode:'live'});
  });
  it('prioritizes a refunded still-billable subscription over newer terminal history so cancellation remains available',async()=>{
    await paid();await apply(evidence({event:'evt_refund',created:epoch+1,revoked:true}));
    const old=randomUUID();await raw("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id) VALUES($1,$2,'live','daily','pdt_old')",[owner,old]);
    await raw("INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created,updated_at) VALUES('sub_old',$1,$2,'live','daily','cus_old','failed',now(),1,now()+interval '1 hour')",[owner,old]);
    expect((await status()).subscription).toMatchObject({subscriptionId:'sub_fixture',revoked:true,cancelAtPeriodEnd:false});expect((await status()).checkout).toBeNull();
  });
  it('exposes a pre-fix refunded mandate for cancellation even if a later paid subscription also exists',async()=>{
    await paid();await apply(evidence({event:'evt_refund',created:epoch+1,revoked:true}));
    const next=randomUUID();await raw("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id) VALUES($1,$2,'live','daily','pdt_new')",[owner,next]);
    await raw("INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created) VALUES('sub_new_paid',$1,$2,'live','daily','cus_new','active',now()+interval '29 days',1)",[owner,next]);
    expect((await status()).subscription).toMatchObject({subscriptionId:'sub_fixture',revoked:true,cancelAtPeriodEnd:false});
    await confirmedCancel();expect((await status()).subscription).toMatchObject({subscriptionId:'sub_new_paid',revoked:false,status:'active'});
  });
  it('keeps the real SQL three_weekly plan rank above weekly without introducing public active into the SQL enum',async()=>{
    await paid();const next=randomUUID();await raw("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id) VALUES($1,$2,'live','three_weekly','pdt_three')",[owner,next]);
    await raw("INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created) VALUES('sub_three',$1,$2,'live','three_weekly','cus_three','active',now()+interval '29 days',1)",[owner,next]);
    expect((await status()).subscription).toMatchObject({subscriptionId:'sub_three',plan:'three_weekly'});
    await expect(raw("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id) VALUES($1,$2,'live','active','pdt_bad')",[owner,randomUUID()])).rejects.toThrow(/plan_check/);
  });
  it('releases only a known pre-PATCH failure for the original cancellation and preserves recovery across read-only reconciliation',async()=>{
    await paid();const id=randomUUID(),version=(await status()).subscription.revision;
    const args=[owner,session,0,id,'live','sub_fixture',version];
    expect(await rpc('SELECT job_loop_billing_cancel_claim($1,$2,$3,$4,$5,$6,$7) r',args)).toMatchObject({creationClaimAcquired:true});
    await rpc('SELECT job_loop_billing_cancel_retryable($1,$2,0,$3,\'live\',\'sub_fixture\') r',[owner,session,id]);
    expect((await status()).cancelRequest).toMatchObject({requestId:id,status:'creating',version});
    await rpc('SELECT job_loop_billing_cancel_finalize($1,$2,0,$3,\'live\',\'sub_fixture\',false) r',[owner,session,id]);
    expect((await raw('SELECT state FROM jobvance_private.loop_billing_cancel_requests WHERE request_id=$1',[id])).rows[0].state).toBe('retryable');
    expect(await rpc('SELECT job_loop_billing_cancel_claim($1,$2,$3,$4,$5,$6,$7) r',args)).toMatchObject({creationClaimAcquired:true});
    expect(await rpc('SELECT job_loop_billing_cancel_claim($1,$2,$3,$4,$5,$6,$7) r',args)).toMatchObject({creationClaimAcquired:false});
  });
  it('executes the real control-to-SQL pre-read recovery journey with exactly one later provider PATCH',async()=>{
    await paid();const id=randomUUID(),version=(await status()).subscription.revision;
    const environment=dodoEnvironment({JOBVANCE_LOOP_BILLING_ENABLED:'true',DODO_PRODUCT_LOOP_WEEKLY:'pdt_fixture',DODO_PRODUCT_LOOP_ACTIVE:'pdt_active',DODO_PRODUCT_LOOP_DAILY:'pdt_daily'});
    // Isolated ports exercise the Live SQL namespace without real credentials or HTTP.
    const config={...loopBillingConfiguration(key=>environment[key])!,mode:'live' as const};
    expect(config.mode).toBe('live');let gets=0,patches=0,cancelled=false;
    const ports:LoopBillingPorts={rpc:async<T>(name:string,args:Record<string,unknown>)=>{
      if(!/^job_loop_billing_[a-z_]+$/.test(name)||Object.keys(args).some(key=>!/^p_[a-z_]+$/.test(key)))throw Error('Unexpected SQL boundary');
      return await rpc('SELECT '+name+'('+Object.keys(args).map((key,index)=>key+'=>$'+(index+1)).join(',')+') r',Object.values(args)) as T;
    },provider:async(endpoint,_body,method)=>{
      if(endpoint==='checkouts/cks_fixture')return{id:'cks_fixture',payment_id:'pay_fixture'};
      if(endpoint==='payments/pay_fixture')return{payment_id:'pay_fixture',checkout_session_id:'cks_fixture',subscription_id:'sub_fixture',customer:{customer_id:'cus_fixture'},status:'succeeded',currency:'USD',total_amount:2900};
      expect(endpoint).toBe('subscriptions/sub_fixture');
      if(method==='PATCH'){patches++;cancelled=true;return{};}
      if(++gets===1)throw Error('Isolated provider read unavailable before any write');
      return{subscription_id:'sub_fixture',product_id:'pdt_fixture',quantity:1,currency:'USD',recurring_pre_tax_amount:2900,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:cancelled,status:'active',previous_billing_date:new Date(start).toISOString(),next_billing_date:new Date(end).toISOString(),customer:{customer_id:'cus_fixture'},metadata:{product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly'}};
    }};
    const intent={action:'cancel',requestId:id,expectedGeneration:0,expectedSubscriptionId:'sub_fixture',expectedVersion:version,consent:true};
    await expect(controlLoopBilling(ports,config,owner,session,intent)).rejects.toMatchObject({code:'LOOP_CANCELLATION_RETRYABLE'});
    expect(patches).toBe(0);expect((await raw('SELECT state FROM jobvance_private.loop_billing_cancel_requests WHERE request_id=$1',[id])).rows[0].state).toBe('retryable');
    expect(await controlLoopBilling(ports,config,owner,session,intent)).toMatchObject({status:'confirmed'});expect(patches).toBe(1);
    expect(await controlLoopBilling(ports,config,owner,session,intent)).toMatchObject({status:'confirmed'});expect(patches).toBe(1);
    expect((await status()).subscription).toMatchObject({cancelAtPeriodEnd:true,revoked:false});expect(await entitlement()).toMatchObject({active:true});
  });
  it('never automatically reacquires an ambiguous provider PATCH and cannot undo confirmed cancellation',async()=>{
    await paid();const id=randomUUID(),version=(await status()).subscription.revision,args=[owner,session,0,id,'live','sub_fixture',version];
    await rpc('SELECT job_loop_billing_cancel_claim($1,$2,$3,$4,$5,$6,$7) r',args);await rpc('SELECT job_loop_billing_cancel_finalize($1,$2,0,$3,\'live\',\'sub_fixture\',false) r',[owner,session,id]);
    expect(await rpc('SELECT job_loop_billing_cancel_claim($1,$2,$3,$4,$5,$6,$7) r',args)).toMatchObject({creationClaimAcquired:false,status:'uncertain'});
    await rpc('SELECT job_loop_billing_cancel_finalize($1,$2,0,$3,\'live\',\'sub_fixture\',true) r',[owner,session,id]);
    expect(await rpc('SELECT job_loop_billing_cancel_retryable($1,$2,0,$3,\'live\',\'sub_fixture\') r',[owner,session,id])).toMatchObject({status:'confirmed'});
    expect(await rpc('SELECT job_loop_billing_cancel_claim($1,$2,$3,$4,$5,$6,$7) r',args)).toMatchObject({creationClaimAcquired:false,status:'confirmed'});
  });
  it('rejects retryable cancellation release under a different session or generation',async()=>{
    await paid();const id=randomUUID(),version=(await status()).subscription.revision;
    await rpc('SELECT job_loop_billing_cancel_claim($1,$2,0,$3,\'live\',\'sub_fixture\',$4) r',[owner,session,id,version]);
    const fresh=randomUUID();await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[fresh,owner]);
    await expect(rpc('SELECT job_loop_billing_cancel_retryable($1,$2,0,$3,\'live\',\'sub_fixture\') r',[owner,fresh,id])).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
    await expect(rpc('SELECT job_loop_billing_cancel_retryable($1,$2,1,$3,\'live\',\'sub_fixture\') r',[owner,session,id])).rejects.toThrow('LOOP_REQUEST_STALE');
    await raw('DELETE FROM auth.sessions WHERE id=$1',[session]);await expect(rpc('SELECT job_loop_billing_cancel_retryable($1,$2,0,$3,\'live\',\'sub_fixture\') r',[owner,session,id])).rejects.toThrow('LOOP_BILLING_SESSION_STALE');
  });
  it('lets a fresh session explicitly reconcile an older cancellation without acquiring provider write permission',async()=>{
    await paid();const original=randomUUID(),version=(await status()).subscription.revision;
    await rpc('SELECT job_loop_billing_cancel_claim($1,$2,0,$3,\'live\',\'sub_fixture\',$4) r',[owner,session,original,version]);
    await rpc('SELECT job_loop_billing_cancel_finalize($1,$2,0,$3,\'live\',\'sub_fixture\',false) r',[owner,session,original]);
    const fresh=randomUUID(),reconcile=randomUUID();await raw('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[fresh,owner]);
    await expect(rpc('SELECT job_loop_billing_cancel_claim($1,$2,0,$3,\'live\',\'sub_fixture\',$4) r',[owner,fresh,original,version])).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
    expect(await rpc('SELECT job_loop_billing_cancel_claim($1,$2,0,$3,\'live\',\'sub_fixture\',$4) r',[owner,fresh,reconcile,version])).toMatchObject({creationClaimAcquired:false,status:'uncertain'});
    await rpc('SELECT job_loop_billing_cancel_finalize($1,$2,0,$3,\'live\',\'sub_fixture\',false) r',[owner,fresh,reconcile]);
    expect(await rpc('SELECT job_loop_billing_cancel_claim($1,$2,0,$3,\'live\',\'sub_fixture\',$4) r',[owner,fresh,reconcile,version])).toMatchObject({creationClaimAcquired:false});
    await expect(rpc('SELECT job_loop_billing_cancel_claim($1,$2,0,$3,\'live\',\'sub_fixture\',$4) r',[owner,fresh,randomUUID(),version])).rejects.toThrow('LOOP_CANCELLATION_PENDING');
    await rpc('SELECT job_loop_billing_cancel_finalize($1,$2,0,$3,\'live\',\'sub_fixture\',true) r',[owner,fresh,reconcile]);
    expect((await rpc('SELECT job_loop_billing_status($1,$2,\'live\') r',[owner,fresh])).subscription.cancelAtPeriodEnd).toBe(true);
  });
  it('retains fixed search paths, service-only status and an internal trigger with no directly callable client privilege',async()=>{
    expect((await raw("SELECT count(*)::int n FROM pg_trigger WHERE tgname='job_loop_billing_provider_state_guard' AND NOT tgisinternal")).rows[0].n).toBe(1);
    for(const role of ['anon','authenticated','service_role'])expect((await raw("SELECT has_function_privilege($1,'jobvance_private.guard_loop_checkout_provider_state()','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
    for(const role of ['anon','authenticated'])expect((await raw("SELECT has_function_privilege($1,'job_loop_billing_status(uuid,uuid,text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
    for(const role of ['anon','authenticated'])expect((await raw("SELECT has_function_privilege($1,'job_loop_billing_cancel_retryable(uuid,uuid,bigint,uuid,text,text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
    expect((await raw("SELECT proconfig FROM pg_proc WHERE oid='jobvance_private.guard_loop_checkout_provider_state()'::regprocedure")).rows[0].proconfig).toEqual(['search_path=""']);
  });
  it('leaves the already-applied subscription migration unchanged',async()=>{
    const source=await readFile(new URL('../migrations/20261018073501_job_loop_subscription_lifecycle.sql',import.meta.url));
    expect(createHash('sha256').update(source).digest('hex')).toBe('7b3294149ba3b62d2b7274c0d939be47314ab8c3d261e6d77839625acc8386af');
  });
});
