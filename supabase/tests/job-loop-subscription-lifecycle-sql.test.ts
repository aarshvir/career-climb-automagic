// @vitest-environment node
// Actual PostgreSQL billing journey. Auth identity and provider API/signature
// verification belong to the edge tests; no real charges or provider calls here.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
import { applyLoopBillingWebhook, controlLoopBilling, type LoopBillingPorts } from '../functions/_shared/loop-billing-runtime';
import { LOOP_BILLING_PRODUCT, type LoopBillingConfig } from '../functions/_shared/loop-billing';

const migration='20261018073501_job_loop_subscription_lifecycle.sql';
let db:PGlite,owner:string,other:string,session:string,otherSession:string,request:string,epoch:number,start:string,end:string;
const hash='a'.repeat(64);
const query=(q:string,a:unknown[]=[])=>db.query<Record<string,any>>(q,a);
async function rpc(q:string,a:unknown[]=[]){await db.exec('SET ROLE service_role');try{return(await query(q,a)).rows[0]?.r;}finally{await db.exec('RESET ROLE');}}
const claim=(overrides:unknown[]=[])=>rpc('SELECT job_loop_billing_checkout_claim($1,$2,$3,$4,$5,$6,$7) r',overrides.length?overrides:[owner,session,0,request,'live','weekly','pdt_weekly']);
const finish=(args:unknown[]=[owner,session,0,request,'cks_fixture','https://checkout.dodopayments.com/session/cks_fixture'])=>rpc('SELECT job_loop_billing_checkout_finalize($1,$2,$3,$4,$5,$6) r',args);
const entitlement=(user=owner)=>rpc('SELECT job_loop_billing_entitlement($1) r',[user]);
const status=(user=owner,auth=session,mode='live')=>rpc('SELECT job_loop_billing_status($1,$2,$3) r',[user,auth,mode]);
function event(overrides:Record<string,unknown>={}){return {user:owner,request,mode:'live',plan:'weekly',product:'pdt_weekly',checkout:'cks_fixture',subscription:'sub_fixture',customer:'cus_fixture',status:'active',start,end,cancel:false,event:'evt_initial',created:epoch,revoked:false,hash,payment:'pay_initial',amount:2900,...overrides};}
const apply=(e:Record<string,unknown>=event())=>rpc('SELECT job_loop_billing_apply_event('+Object.keys(e).map((_,i)=>'$'+(i+1)).join(',')+') r',Object.values(e));
async function paid(overrides:Record<string,unknown>={}){await claim();await finish();return apply(event(overrides));}
const cancelClaim=async(id=randomUUID(),auth=session,gen=0,user=owner,mode='live',sub='sub_fixture',revision?:number)=>rpc('SELECT job_loop_billing_cancel_claim($1,$2,$3,$4,$5,$6,$7) r',[user,auth,gen,id,mode,sub,revision??(await query('SELECT subscription_revision FROM jobvance_private.loop_billing_cancel_requests WHERE user_id=$1 AND request_id=$2',[user,id])).rows[0]?.subscription_revision??(await query('SELECT revision FROM jobvance_private.loop_subscriptions WHERE subscription_id=$1',[sub])).rows[0]?.revision??1]);
const cancelFinish=(id:string,confirmed=true,auth=session,gen=0)=>rpc('SELECT job_loop_billing_cancel_finalize($1,$2,$3,$4,$5,$6,$7) r',[owner,auth,gen,id,'live','sub_fixture',confirmed]);

beforeAll(async()=>{
  db=new PGlite(); await db.exec(await checkLoopSchema());await db.exec('CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,not_after timestamptz)');
  for(const file of ['20261015223000_job_loop_selected_preparation.sql','20261017013000_job_loop_cv_variants.sql','20261017080000_job_loop_cv_variant_facts.sql','20261017122000_job_loop_dodo_entitlements.sql','20261017130000_job_loop_variant_execution.sql','20261017131000_job_loop_recurring_product.sql',migration]){
    try{await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));}catch(e){throw Error(file+': '+(e as Error).message);}
  }
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE; TRUNCATE jobvance_private.loop_billing_events');owner=randomUUID();other=randomUUID();session=randomUUID();otherSession=randomUUID();request=randomUUID();
  await query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other]);await query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4)',[session,owner,otherSession,other]);await query('SELECT job_loop_open_record($1)',[owner]);
  const time=(await query("SELECT extract(epoch FROM now())::bigint-100 epoch,(now()-interval '1 day')::text start,(now()+interval '29 days')::text end")).rows[0];epoch=Number(time.epoch);start=time.start;end=time.end;
});

describe('monthly Job Loop subscription authority and full SQL lifecycle',()=>{
  it.each([['weekly',2900,1],['three_weekly',5900,3],['daily',9900,7]])('grants %s only after a verified paid monthly service period',async(plan,amount,allowance)=>{
    await claim([owner,session,0,request,'live',plan,'pdt_'+plan]);await finish();
    expect(await entitlement()).toMatchObject({active:false,maxWeeklyRuns:0});
    await apply(event({plan,product:'pdt_'+plan,amount}));
    const paid=await entitlement();expect(paid).toMatchObject({active:true,plan,cadence:plan,variantLimit:3,maxWeeklyRuns:allowance});expect(new Date(paid.validUntil).getTime()).toBe(new Date(end).getTime());
    await rpc('SELECT job_loop_assert_schedule_entitlement($1,$2) r',[owner,plan]);
    if(plan!=='daily')await expect(rpc("SELECT job_loop_assert_schedule_entitlement($1,'daily') r",[owner])).rejects.toThrow('LOOP_SCHEDULE_ENTITLEMENT');
  });
  it('keeps checkout immutable and captures original session/generation before provider work',async()=>{
    const first=await claim();expect(first.creationClaimAcquired).toBe(true);expect(await claim()).toMatchObject({creationClaimAcquired:false,request_id:request});
    for(const args of [[owner,session,0,request,'test','weekly','pdt_weekly'],[owner,session,0,request,'live','daily','pdt_daily']])await expect(claim(args)).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
    await expect(claim([owner,randomUUID(),0,request,'live','weekly','pdt_weekly'])).rejects.toThrow('LOOP_BILLING_SESSION_STALE');
    await expect(claim([owner,session,1,request,'live','weekly','pdt_weekly'])).rejects.toThrow('LOOP_REQUEST_STALE');
    await expect(claim([owner,null,0,request,'live','weekly','pdt_weekly'])).rejects.toThrow('LOOP_BILLING_INVALID');
  });
  it('does not duplicate an ambiguous checkout under a new request',async()=>{
    await claim();await rpc('SELECT job_loop_billing_checkout_fail($1,$2,0,$3,false) r',[owner,session,request]);
    expect(await claim()).toMatchObject({creationClaimAcquired:false,state:'uncertain'});
    await expect(claim([owner,session,0,randomUUID(),'live','weekly','pdt_weekly'])).rejects.toThrow('LOOP_CHECKOUT_PENDING');
  });
  it('retries only a provider-confirmed no-session failure',async()=>{
    await claim();await rpc('SELECT job_loop_billing_checkout_fail($1,$2,0,$3,true) r',[owner,session,request]);expect(await claim()).toMatchObject({creationClaimAcquired:true});
    await finish();await rpc('SELECT job_loop_billing_checkout_fail($1,$2,0,$3,true) r',[owner,session,request]);expect(await claim()).toMatchObject({creationClaimAcquired:false,state:'ready'});
  });
  it('binds final checkout host, provider session, auth session and original request',async()=>{
    await claim();await expect(finish([owner,session,0,request,'cks_fixture','https://checkout.dodopayments.com.evil.test/session/x'])).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
    await expect(finish([owner,session,0,request,'cks_fixture','https://test.checkout.dodopayments.com/session/x'])).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
    await finish();expect(await finish()).toMatchObject({state:'ready',session_id:'cks_fixture'});
    await expect(finish([owner,session,0,request,'cks_other','https://checkout.dodopayments.com/session/cks_other'])).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
  });
  it('does not grant a subscription from next_billing_date without a succeeded payment service period',async()=>{
    await claim();await finish();await expect(apply(event({payment:null,amount:null}))).rejects.toThrow('LOOP_BILLING_PAID_PERIOD_REQUIRED');
    await apply(event({status:'pending',payment:null,amount:null}));expect(await entitlement()).toMatchObject({active:false});
    await apply(event({event:'evt_subscription_active',created:epoch+1,payment:null,amount:null}));expect(await entitlement()).toMatchObject({active:false});
  });
  it('renews once, carries exact paid-through time and rejects reuse of a payment for another cycle',async()=>{
    await paid();const renewal=event({event:'evt_renewal',created:epoch+10,payment:'pay_renewal',start:end,end:new Date(new Date(end).getTime()+30*86400000).toISOString()});
    expect(await apply(renewal)).toMatchObject({duplicate:false});expect(await apply(renewal)).toEqual({duplicate:true});
    expect(await entitlement()).toMatchObject({active:true});expect(new Date((await entitlement()).validUntil).getTime()).toBe(new Date(renewal.end as string).getTime());
    await expect(apply({...renewal,event:'evt_wrong_period',created:epoch+11,end:new Date(new Date(renewal.end as string).getTime()+1000).toISOString()})).rejects.toThrow('LOOP_BILLING_PAYMENT_CONFLICT');
    expect((await query('SELECT * FROM jobvance_private.loop_subscription_periods')).rows).toHaveLength(2);
  });
  it('records late paid renewal evidence after a newer status event without undoing newer cancellation or hold',async()=>{
    await paid();await apply(event({event:'evt_newer_status',created:epoch+20,payment:null,amount:null}));
    const laterEnd=new Date(new Date(end).getTime()+30*86400000).toISOString();
    expect(await apply(event({event:'evt_late_paid',created:epoch+10,payment:'pay_late',start:end,end:laterEnd}))).toMatchObject({stale:true});
    expect(new Date((await entitlement()).validUntil).getTime()).toBe(new Date(laterEnd).getTime());
    await apply(event({event:'evt_newer_hold',created:epoch+30,status:'on_hold',payment:null,amount:null}));
    await apply(event({event:'evt_old_paid_after_hold',created:epoch+25,payment:'pay_late',start:end,end:laterEnd}));
    expect(await entitlement()).toMatchObject({active:false});expect((await status()).subscription.status).toBe('on_hold');
    expect((await query('SELECT * FROM jobvance_private.loop_subscription_periods')).rows).toHaveLength(2);
  });
  it('a distinct verified payment resolves a same-second hold but an old payment replay cannot',async()=>{
    await paid();await apply(event({event:'evt_same_second_hold',created:epoch+10,status:'on_hold',payment:null,amount:null}));
    await apply(event({event:'evt_old_payment_replay',created:epoch+10}));expect(await entitlement()).toMatchObject({active:false});
    await apply(event({event:'evt_fresh_payment',created:epoch+10,payment:'pay_fresh'}));expect(await entitlement()).toMatchObject({active:true});
  });
  it('rejects conflicting duplicate event IDs even if the supplied hash is unchanged',async()=>{
    await paid();await expect(apply(event({cancel:true}))).rejects.toThrow('LOOP_BILLING_EVENT_CONFLICT');
    await expect(apply(event({hash:'b'.repeat(64)}))).rejects.toThrow('LOOP_BILLING_EVENT_CONFLICT');
    expect((await query('SELECT * FROM jobvance_private.loop_billing_events')).rows).toHaveLength(1);
  });
  it('ignores older status events and cannot resurrect a refund with late activation',async()=>{
    await paid();await apply(event({event:'evt_hold',created:epoch+10,status:'on_hold',payment:null,amount:null}));
    expect(await apply(event({event:'evt_older_active',created:epoch+1}))).toMatchObject({stale:true});expect(await entitlement()).toMatchObject({active:false});
    await apply(event({event:'evt_older_refund',created:epoch-1,revoked:true}));
    await apply(event({event:'evt_new_active',created:epoch+20}));expect(await entitlement()).toMatchObject({active:false});
    expect((await status()).subscription.revoked).toBe(true);
  });
  it('records refund-before-activation safely and retains permanent revocation',async()=>{
    await paid({event:'evt_refund_first',revoked:true});await apply(event({event:'evt_activated_later',created:epoch+2}));
    expect(await entitlement()).toMatchObject({active:false});expect((await status()).subscription.revoked).toBe(true);
  });
  it('retains paid access when cancellation is scheduled and stops exactly at expiry',async()=>{
    await paid();const id=randomUUID();expect(await cancelClaim(id)).toMatchObject({creationClaimAcquired:true});
    expect(await cancelFinish(id)).toEqual({subscriptionId:'sub_fixture',status:'confirmed'});
    expect(await cancelClaim(id)).toMatchObject({creationClaimAcquired:false,status:'confirmed'});expect(await entitlement()).toMatchObject({active:true});
    expect((await status()).subscription).toMatchObject({cancelAtPeriodEnd:true});expect(new Date((await status()).subscription.validUntil).getTime()).toBe(new Date(end).getTime());
    await apply(event({event:'evt_cancelled',created:epoch+5,status:'cancelled',cancel:true,payment:null,amount:null}));expect(await entitlement()).toMatchObject({active:true});
    await query("UPDATE jobvance_private.loop_subscriptions SET valid_until=now() WHERE user_id=$1",[owner]);expect(await entitlement()).toMatchObject({active:false});
  });
  it.each(['cancelled','failed','expired','past_due','on_hold','paused'])('stops new recurring work on immediate provider state %s',async state=>{
    await paid();await apply(event({event:'evt_terminal',created:epoch+10,status:state,cancel:false,payment:null,amount:null}));expect(await entitlement()).toMatchObject({active:false});
    await expect(rpc("SELECT job_loop_assert_schedule_entitlement($1,'weekly') r",[owner])).rejects.toThrow('LOOP_SUBSCRIPTION_REQUIRED');
  });
  it('cannot cancel another owner, another mode or a different subscription via replay',async()=>{
    await paid();const id=randomUUID();await expect(cancelClaim(id,otherSession,0,other)).rejects.toThrow('LOOP_SUBSCRIPTION_NOT_FOUND');
    await expect(cancelClaim(id,session,0,owner,'test')).rejects.toThrow('LOOP_SUBSCRIPTION_NOT_FOUND');
    await cancelClaim(id);await expect(cancelClaim(id,randomUUID())).rejects.toThrow('LOOP_BILLING_SESSION_STALE');
    await expect(cancelFinish(id,true,randomUUID())).rejects.toThrow('LOOP_BILLING_SESSION_STALE');
    await cancelFinish(id,false);expect(await cancelClaim(id)).toMatchObject({creationClaimAcquired:false,status:'uncertain'});
    await expect(cancelClaim()).rejects.toThrow('LOOP_CANCELLATION_PENDING');
    await cancelFinish(id,true);expect((await status()).subscription.cancelAtPeriodEnd).toBe(true);
  });
  it('hides former-session checkout recovery and never initializes a workspace on status read',async()=>{
    await claim();await finish();expect((await status()).checkout.requestId).toBe(request);const fresh=randomUUID();await query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[fresh,owner]);expect((await status(owner,fresh)).checkout).toBeNull();
    expect((await status(other,otherSession)).generation).toBe(0);expect((await query('SELECT * FROM job_loop_lifecycle WHERE user_id=$1',[other])).rows).toHaveLength(0);
  });
  it('does not use test subscription periods as live paid entitlement',async()=>{
    await claim([owner,session,0,request,'test','weekly','pdt_weekly']);await finish([owner,session,0,request,'cks_fixture','https://test.checkout.dodopayments.com/session/cks_fixture']);
    await apply(event({mode:'test'}));expect(await entitlement()).toMatchObject({active:false});
    expect((await status(owner,session,'test')).subscription.status).toBe('active');
  });
  it('keeps financial receipts after erasure, blocks old grants, and permits deliberate billing cancellation',async()=>{
    await paid();await query('SELECT job_loop_begin_erase($1,0)',[owner]);
    expect(await entitlement()).toMatchObject({active:false});await expect(claim()).rejects.toThrow('LOOP_REQUEST_STALE');
    expect(await apply(event({event:'evt_later_renewal',created:epoch+10,payment:'pay_later'}))).toMatchObject({lifecycleStale:true});
    const gen=(await status()).generation;expect(gen).toBe(1);const id=randomUUID();expect(await cancelClaim(id,session,gen)).toMatchObject({creationClaimAcquired:true});await cancelFinish(id,true,session,gen);
    expect((await query('SELECT state FROM job_loop_lifecycle WHERE user_id=$1',[owner])).rows[0].state).toBe('erasing');
    expect((await query('SELECT * FROM jobvance_private.loop_subscription_periods')).rows).toHaveLength(2);
  });
  it('does not grant a future paid service period before its start or in an unpaid gap',async()=>{
    await paid({start:new Date(Date.now()+86400000).toISOString(),end:new Date(Date.now()+31*86400000).toISOString()});expect(await entitlement()).toMatchObject({active:false});
  });
  it('holds a fixed verified past-due grace deadline without sliding it on retries',async()=>{
    await paid();const deadline=new Date(Date.now()+2*86400000).toISOString();
    await apply({...event({event:'evt_past_due',created:epoch+10,status:'past_due',payment:null,amount:null}),grace:deadline});
    expect(await entitlement()).toMatchObject({active:true,plan:'weekly'});expect(new Date((await entitlement()).validUntil).getTime()).toBe(new Date(deadline).getTime());
    await apply({...event({event:'evt_past_due_updated',created:epoch+20,status:'past_due',payment:null,amount:null}),grace:null});
    expect(new Date((await status()).subscription.graceUntil).getTime()).toBe(new Date(deadline).getTime());
    await apply({...event({event:'evt_stale_later_grace',created:epoch+5,status:'past_due',payment:null,amount:null}),grace:new Date(Date.now()+5*86400000).toISOString()});
    expect(new Date((await status()).subscription.graceUntil).getTime()).toBe(new Date(deadline).getTime());
    await query('UPDATE jobvance_private.loop_subscriptions SET grace_until=now() WHERE user_id=$1',[owner]);expect(await entitlement()).toMatchObject({active:false});
  });
  it('does not offer grace without any paid receipt and clears old grace after a paid renewal',async()=>{
    await claim();await finish();const deadline=new Date(Date.now()+86400000).toISOString();
    await apply({...event({event:'evt_free_grace',status:'past_due',payment:null,amount:null}),grace:deadline});expect(await entitlement()).toMatchObject({active:false});
    await apply(event({event:'evt_first_paid',created:epoch+1}));expect((await status()).subscription.graceUntil).toBeNull();expect(await entitlement()).toMatchObject({active:true});
  });
  it('checks durable signed-event hash before re-reading changed provider state',async()=>{
    expect(await rpc('SELECT job_loop_billing_event($1,$2,$3) r',['live','evt_initial',hash])).toEqual({duplicate:false});await paid();
    expect(await rpc('SELECT job_loop_billing_event($1,$2,$3) r',['live','evt_initial',hash])).toEqual({duplicate:true});
    await expect(rpc('SELECT job_loop_billing_event($1,$2,$3) r',['live','evt_initial','b'.repeat(64)])).rejects.toThrow('LOOP_BILLING_EVENT_CONFLICT');
    expect(await rpc('SELECT job_loop_billing_event($1,$2,$3) r',['test','evt_initial',hash])).toEqual({duplicate:false});
  });
  it('requires a still-owned unexpired SDK auth session for billing mutations and reads',async()=>{
    await expect(claim([owner,otherSession,0,request,'live','weekly','pdt_weekly'])).rejects.toThrow('LOOP_BILLING_SESSION_STALE');
    await claim();await query('UPDATE auth.sessions SET not_after=now() WHERE id=$1',[session]);
    await expect(finish()).rejects.toThrow('LOOP_BILLING_SESSION_STALE');await expect(status()).rejects.toThrow('LOOP_BILLING_SESSION_STALE');
    await query('DELETE FROM auth.sessions WHERE id=$1',[session]);await expect(claim()).rejects.toThrow('LOOP_BILLING_SESSION_STALE');
    expect((await query('SELECT session_id FROM jobvance_private.loop_billing_orders')).rows[0].session_id).toBeNull();
  });
  it('rejects a cancellation from an obsolete displayed subscription revision',async()=>{
    await paid();const before=(await status()).subscription.revision;await apply(event({event:'evt_new_cycle',created:epoch+10,payment:'pay_new'}));
    await expect(cancelClaim(randomUUID(),session,0,owner,'live','sub_fixture',before)).rejects.toThrow('LOOP_BILLING_SUBSCRIPTION_CHANGED');
    const request=randomUUID(),original=(await status()).subscription.revision;await cancelClaim(request);await cancelFinish(request);expect(await cancelClaim(request,session,0,owner,'live','sub_fixture',original)).toMatchObject({status:'confirmed',creationClaimAcquired:false});
  });
  it('recovers the original ambiguous cancellation after remount without restoring consent',async()=>{
    await paid();const id=randomUUID(),version=(await status()).subscription.revision;
    await cancelClaim(id);await cancelFinish(id,false);
    expect((await status()).cancelRequest).toEqual({requestId:id,subscriptionId:'sub_fixture',status:'uncertain',version,generation:0});
    const fresh=randomUUID();await query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[fresh,owner]);expect((await status(owner,fresh)).cancelRequest).toBeNull();
    await apply(event({event:'evt_later_changed_status',created:epoch+10,status:'on_hold',payment:null,amount:null}));
    expect((await status()).cancelRequest.version).toBe(version);expect(await cancelClaim(id,session,0,owner,'live','sub_fixture',version)).toMatchObject({creationClaimAcquired:false,status:'uncertain'});
    await cancelFinish(id,true);expect((await status()).cancelRequest).toMatchObject({requestId:id,status:'confirmed',version});
  });
  it('rejects a changed displayed revision under the same original cancel request',async()=>{
    await paid();const id=randomUUID(),version=(await status()).subscription.revision;await cancelClaim(id);
    await expect(cancelClaim(id,session,0,owner,'live','sub_fixture',version+1)).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
    expect(await cancelClaim(id,session,0,owner,'live','sub_fixture',version)).toMatchObject({creationClaimAcquired:false});
  });
  it('reserves the tenth live service seat before checkout while an existing pilot can upgrade',async()=>{
    for(let i=0;i<9;i++){const user=randomUUID();await query('INSERT INTO auth.users(id) VALUES($1)',[user]);await query('SELECT job_loop_enroll_pilot($1)',[user]);}
    expect(await claim()).toMatchObject({creationClaimAcquired:true});
    await expect(rpc('SELECT job_loop_billing_checkout_claim($1,$2,0,$3,\'live\',\'weekly\',\'pdt_weekly\') r',[other,otherSession,randomUUID()])).rejects.toThrow('LOOP_PILOT_FULL');
    await expect(rpc('SELECT job_loop_enroll_pilot($1) r',[other])).rejects.toThrow('LOOP_PILOT_FULL');
    const pilot=(await query('SELECT user_id FROM job_loop_pilot_users WHERE active LIMIT 1')).rows[0].user_id,auth=randomUUID();await query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[auth,pilot]);
    expect(await rpc('SELECT job_loop_billing_checkout_claim($1,$2,0,$3,\'live\',\'weekly\',\'pdt_weekly\') r',[pilot,auth,randomUUID()])).toMatchObject({creationClaimAcquired:true});
    expect((await query('SELECT capacity_until-created_at duration FROM jobvance_private.loop_billing_orders WHERE user_id=$1',[owner])).rows).toHaveLength(1);
  });
  it('releases finite checkout reservations and preserves safe ambiguity for the original request',async()=>{
    await claim();await finish();await query("UPDATE jobvance_private.loop_billing_orders SET created_at=now()-interval '97 hours',capacity_until=now()-interval '1 hour' WHERE user_id=$1",[owner]);
    for(let i=0;i<10;i++){const user=randomUUID();await query('INSERT INTO auth.users(id) VALUES($1)',[user]);await query('SELECT job_loop_enroll_pilot($1)',[user]);}
    expect(await apply()).toEqual({duplicate:false,pendingFulfillment:true,reason:'LOOP_PILOT_FULL'});
    expect((await query('SELECT * FROM jobvance_private.loop_billing_pending_fulfillment')).rows).toHaveLength(1);expect(await entitlement()).toMatchObject({active:false});
    expect((await status()).fulfillmentPending).toBe(true);expect((await status(other,otherSession)).fulfillmentPending).toBe(false);expect((await status(owner,session,'test')).fulfillmentPending).toBe(false);
    expect(await rpc('SELECT job_loop_billing_event($1,$2,$3) r',['live','evt_initial',hash])).toEqual({duplicate:false});
    await query('UPDATE job_loop_pilot_users SET active=false WHERE user_id=(SELECT user_id FROM job_loop_pilot_users LIMIT 1)');
    expect(await apply()).toMatchObject({duplicate:false});expect(await entitlement()).toMatchObject({active:true});
    expect((await query('SELECT resolved FROM jobvance_private.loop_billing_pending_fulfillment')).rows[0].resolved).toBe(true);
    expect((await status()).fulfillmentPending).toBe(false);
  });
  it('reconciles pending paid fulfillment after provider status changes but rejects changed payment identity',async()=>{
    await claim();await finish();await query("UPDATE jobvance_private.loop_billing_orders SET capacity_until=now()-interval '1 hour' WHERE user_id=$1",[owner]);
    for(let i=0;i<10;i++){const user=randomUUID();await query('INSERT INTO auth.users(id) VALUES($1)',[user]);await query('SELECT job_loop_enroll_pilot($1)',[user]);}
    expect(await apply()).toMatchObject({pendingFulfillment:true});
    await expect(apply(event({payment:'pay_changed'}))).rejects.toThrow('LOOP_BILLING_EVENT_CONFLICT');
    expect(await apply(event({status:'on_hold',cancel:true}))).toMatchObject({pendingFulfillment:true});
    await query('UPDATE job_loop_pilot_users SET active=false WHERE user_id=(SELECT user_id FROM job_loop_pilot_users LIMIT 1)');
    await apply(event({status:'on_hold',cancel:true}));expect((await status()).subscription).toMatchObject({status:'on_hold',cancelAtPeriodEnd:true});
    expect((await status()).fulfillmentPending).toBe(false);expect(await entitlement()).toMatchObject({active:false});
  });
  it('keeps actual paid subscription cancellation visible after a delayed historical failure',async()=>{
    await paid();const oldRequest=randomUUID();await query("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id) VALUES($1,$2,'live','daily','pdt_old')",[owner,oldRequest]);
    await query("INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created,updated_at) VALUES('sub_old_failed',$1,$2,'live','daily','cus_old','failed',now()-interval '1 day',1,now()+interval '1 hour')",[owner,oldRequest]);
    expect((await status()).subscription).toMatchObject({subscriptionId:'sub_fixture',plan:'weekly',status:'active'});expect(await entitlement()).toMatchObject({active:true,plan:'weekly'});
    const id=randomUUID();await cancelClaim(id);await cancelFinish(id);expect((await status()).subscription).toMatchObject({subscriptionId:'sub_fixture',cancelAtPeriodEnd:true});
    expect((await status()).cancelRequest.requestId).toBe(id);
  });
  it('preserves the bounded free pilot and legacy live paid receipts',async()=>{
    await query('SELECT job_loop_enroll_pilot($1)',[owner]);expect(await entitlement()).toMatchObject({active:true,plan:'pilot'});
    await query("INSERT INTO jobvance_private.loop_billing_orders(user_id,request_id,mode,plan,product_id) VALUES($1,$2,'live','three_weekly','pdt_legacy')",[other,randomUUID()]);
    await query("INSERT INTO jobvance_private.loop_subscriptions(subscription_id,user_id,request_id,mode,plan,customer_id,status,valid_until,event_created) SELECT 'sub_legacy',$1,request_id,'live','three_weekly','cus_legacy','active',now()+interval '1 month',1 FROM jobvance_private.loop_billing_orders WHERE user_id=$1",[other]);
    expect(await entitlement(other)).toMatchObject({active:true,plan:'three_weekly',maxWeeklyRuns:3});
  });
  it('executes actual edge checkout, provider-confirmed payment, renewal, dashboard and cancellation against integrated SQL',async()=>{
    const config={mode:'live',provider:'dodo',appUrl:'https://jobvance.io',loopProducts:{weekly:'pdt_weekly',active:'pdt_active',daily:'pdt_daily'}} as LoopBillingConfig;
    const meta={product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly'};
    let cancelled=false,renewed=false,posts=0,patches=0,reads=0;
    const providerSub=()=>({subscription_id:'sub_fixture',product_id:'pdt_weekly',quantity:1,currency:'USD',recurring_pre_tax_amount:2900,payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,on_demand:false,tax_inclusive:true,cancel_at_next_billing_date:cancelled,status:'active',previous_billing_date:new Date(renewed?end:start).toISOString(),next_billing_date:renewed?new Date(new Date(end).getTime()+30*86400000).toISOString():new Date(end).toISOString(),customer:{customer_id:'cus_fixture'},metadata:meta});
    const providerPayment=(id:string)=>({payment_id:id,status:'succeeded',currency:'USD',subscription_id:'sub_fixture',subscription_ids:['sub_fixture'],is_multi_subscription:false,is_update_payment_method:false,customer:{customer_id:'cus_fixture'},total_amount:2900,tax:0,checkout_session_id:id==='pay_initial'?'cks_fixture':null,service_periods:[{subscription_id:'sub_fixture',starts_at:new Date(id==='pay_initial'?start:end).toISOString(),ends_at:id==='pay_initial'?new Date(end).toISOString():new Date(new Date(end).getTime()+30*86400000).toISOString()}]});
    const ports:LoopBillingPorts={rpc:async<T>(name:string,args:Record<string,unknown>)=>{
      if(!/^job_loop_billing_[a-z_]+$/.test(name))throw Error('Unexpected SQL '+name);
      return await rpc('SELECT '+name+'('+Object.keys(args).map((key,i)=>key+' => $'+(i+1)).join(',')+') r',Object.values(args)) as T;
    },provider:async(path,body,method)=>{
      reads++;
      if(path==='products/pdt_weekly')return {product_id:'pdt_weekly',is_recurring:true,price:{type:'recurring_price',price:2900,currency:'USD',payment_frequency_count:1,payment_frequency_interval:'Month',subscription_period_count:20,subscription_period_interval:'Year',trial_period_days:0,tax_inclusive:true}};
      if(path==='checkouts'){posts++;expect(body).toMatchObject({subscription_data:{trial_period_days:0},metadata:meta});return {session_id:'cks_fixture',checkout_url:'https://checkout.dodopayments.com/session/cks_fixture'};}
      if(path==='checkouts/cks_fixture')return{id:'cks_fixture',payment_id:'pay_initial'};
      if(path==='subscriptions/sub_fixture'){if(method==='PATCH'){patches++;expect(body).toEqual({cancel_at_next_billing_date:true});cancelled=true;}return providerSub();}
      if(path==='payments/pay_initial')return providerPayment('pay_initial');if(path==='payments/pay_renewal')return providerPayment('pay_renewal');
      throw Error('External network forbidden: '+path);
    }};
    const input={action:'checkout',requestId:request,expectedGeneration:0,plan:'weekly',consent:true};
    const checkout=await controlLoopBilling(ports,config,owner,session,input);expect(checkout).toMatchObject({sessionId:'cks_fixture',provider:'dodo'});
    await controlLoopBilling(ports,config,owner,session,input);expect(posts).toBe(1);expect(await entitlement()).toMatchObject({active:false});
    const activation={type:'subscription.active',created:epoch,data:{payload_type:'Subscription',subscription_id:'sub_fixture',metadata:meta}};
    expect(await applyLoopBillingWebhook(ports,config,activation as any,'msg_initial')).toMatchObject({received:true,duplicate:false});
    expect(await entitlement()).toMatchObject({active:true,plan:'weekly',maxWeeklyRuns:1});
    const before=reads;expect(await applyLoopBillingWebhook(ports,config,activation as any,'msg_initial')).toEqual({received:true,duplicate:true});expect(reads).toBe(before);
    renewed=true;
    expect(await applyLoopBillingWebhook(ports,config,{type:'subscription.renewed',created:epoch+10,data:{payload_type:'Subscription',subscription_id:'sub_fixture',payment_id:'pay_renewal',metadata:meta}} as any,'msg_renewal')).toMatchObject({received:true});
    expect((await query('SELECT * FROM jobvance_private.loop_subscription_periods')).rows).toHaveLength(2);
    const dashboard=await controlLoopBilling(ports,config,owner,session,{action:'status'});expect(dashboard).toMatchObject({billingConfigured:true,subscription:{status:'active',cancelAtPeriodEnd:false}});
    const cancel={action:'cancel',requestId:randomUUID(),expectedGeneration:0,expectedSubscriptionId:'sub_fixture',expectedVersion:dashboard.subscription!.version,consent:true};
    expect(await controlLoopBilling(ports,config,owner,session,cancel)).toMatchObject({status:'confirmed',subscription:{cancelAtPeriodEnd:true}});
    await controlLoopBilling(ports,config,owner,session,cancel);expect(patches).toBe(1);expect(await entitlement()).toMatchObject({active:true});
    await query('UPDATE jobvance_private.loop_subscriptions SET valid_until=now() WHERE user_id=$1',[owner]);expect(await entitlement()).toMatchObject({active:false});
  });
  it.each(['subscription.active','payment.succeeded','refund.succeeded'])('rejects missing or incorrect signed payload_type on %s before any provider read',async type=>{
    const config={mode:'live',provider:'dodo',appUrl:'https://jobvance.io',loopProducts:{weekly:'pdt_weekly',active:'pdt_active',daily:'pdt_daily'}} as LoopBillingConfig;
    let external=0;const ports:LoopBillingPorts={rpc:async<T>(name,args)=>await rpc('SELECT '+name+'('+Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')+') r',Object.values(args)) as T,provider:async()=>{external++;throw Error('Unexpected provider read');}};
    for(const payload_type of [undefined,'WrongType']){
      const data={payload_type,subscription_id:'sub_fixture',payment_id:'pay_initial',refund_id:'ref_fixture',amount:2900,status:'succeeded',metadata:{product:LOOP_BILLING_PRODUCT,user_id:owner,request_id:request,generation:'0',plan:'weekly'}};
      await expect(applyLoopBillingWebhook(ports,config,{type,created:epoch,data},'msg_bad_shape')).rejects.toThrow();
    }
    expect(external).toBe(0);expect((await query('SELECT * FROM jobvance_private.loop_billing_events')).rows).toHaveLength(0);expect(await entitlement()).toMatchObject({active:false});
  });
  it('rejects cross-owner/mode/session grant attempts and deleted-account events never recreate identities',async()=>{
    await paid();for(const e of [event({user:other,event:'evt_other'}),event({mode:'test',event:'evt_mode'}),event({checkout:'cks_other',event:'evt_checkout'})])await expect(apply(e)).rejects.toThrow('LOOP_BILLING_REQUEST_CONFLICT');
    await query('DELETE FROM auth.users WHERE id=$1',[owner]);expect(await apply(event({event:'evt_deleted'}))).toEqual({accountDeleted:true});
    expect((await query('SELECT * FROM jobvance_private.loop_subscriptions')).rows).toHaveLength(0);
  });
  it.each([{amount:0},{amount:2800},{payment:'not-a-payment'},{hash:'bad'},{created:999999999999},{customer:'wrong_customer'},{start:'infinity'},{end:start}])('rejects malformed payment authority %j',async bad=>{
    await claim();await finish();await expect(apply(event(bad))).rejects.toThrow();expect(await entitlement()).toMatchObject({active:false});
  });
  it('keeps every new privileged routine service-only, private tables inaccessible and weaker write contracts retired',async()=>{
    const f=(await query("SELECT p.oid::regprocedure::text signature,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('job_loop_billing_checkout_claim','job_loop_billing_checkout_finalize','job_loop_billing_checkout_fail','job_loop_billing_apply_event','job_loop_billing_status','job_loop_billing_cancel_claim','job_loop_billing_cancel_finalize','job_loop_billing_assert_session','job_loop_billing_assert_capacity','job_loop_billing_event')")).rows;
    expect(f).toHaveLength(10);for(const row of f){expect(row.proconfig).toEqual(['search_path=""']);expect((await query("SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed",[row.signature])).rows[0].allowed).toBe(true);for(const role of ['anon','authenticated'])expect((await query('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,row.signature])).rows[0].allowed).toBe(false);}
    await db.exec('SET ROLE authenticated');await expect(query('SELECT * FROM jobvance_private.loop_subscription_periods')).rejects.toThrow(/permission denied/);await db.exec('RESET ROLE');
    expect((await query("SELECT has_function_privilege('service_role','job_loop_begin_billing_checkout(uuid,uuid,text,text,text)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  });
});
