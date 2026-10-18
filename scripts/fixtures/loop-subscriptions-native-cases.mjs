import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Independent native sessions exercise the actual migration. Provider HTTP,
// signature, frontend and real-money behavior belong to separate evidence.
export async function loopSubscriptionsNativeCases({observer,actor,check,blocking,quote}) {
  const hash='a'.repeat(64);
  const detail=(a,b,p)=>({distinctBackendPids:[a.pid,b.pid],blockingPids:p});
  const rejected=(promise,code)=>promise.then(()=>false,e=>e.message.includes(code));
  async function setup(reset=true){
    if(reset)await observer.query('TRUNCATE auth.users CASCADE;');
    const user=randomUUID(),session=randomUUID(),request=randomUUID(),suffix=user.replaceAll('-','');
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(user)}); INSERT INTO auth.sessions(id,user_id) VALUES(${quote(session)},${quote(user)}); SELECT job_loop_open_record(${quote(user)});`);
    const times=await observer.json("SELECT jsonb_build_object('start',now()-interval '1 day','end',now()+interval '29 days','renewStart',now()+interval '29 days','renewEnd',now()+interval '59 days','created',extract(epoch from now())::bigint-100);");
    return {user,session,request,checkout:'cks_'+suffix,subscription:'sub_'+suffix,customer:'cus_'+suffix,...times};
  }
  const claim=f=>`SELECT job_loop_billing_checkout_claim(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},'live','weekly','pdt_weekly');`;
  const finish=f=>`SELECT job_loop_billing_checkout_finalize(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},${quote(f.checkout)},${quote('https://checkout.dodopayments.com/session/'+f.checkout)});`;
  const event=(f,changes={})=>{
    const e={status:'active',start:f.start,end:f.end,cancel:false,event:'evt_'+randomUUID(),created:f.created,revoked:false,payment:'pay_'+f.request.replaceAll('-',''),amount:2900,...changes};
    return `SELECT job_loop_billing_apply_event(${quote(f.user)},${quote(f.request)},'live','weekly','pdt_weekly',${quote(f.checkout)},${quote(f.subscription)},${quote(f.customer)},${quote(e.status)},${quote(e.start)},${quote(e.end)},${e.cancel},${quote(e.event)},${e.created},${e.revoked},${quote(hash)},${e.payment?quote(e.payment):'NULL'},${e.amount??'NULL'}${e.grace?', '+quote(e.grace):''});`;
  };
  const entitlement=f=>`SELECT job_loop_billing_entitlement(${quote(f.user)});`;
  const paid=async f=>{await observer.query(claim(f));await observer.query(finish(f));await observer.query(event(f));};

  await check('concurrent checkout retries acquire one original provider-creation claim',async()=>{
    const f=await setup(),a=await actor('checkout-winner',f.user,'service_role'),b=await actor('checkout-retry',f.user,'service_role');
    await a.query('BEGIN;');assert.equal((await a.json(claim(f))).creationClaimAcquired,true);
    const pending=b.json(claim(f)),p=await blocking(b,a);await a.query('COMMIT;');
    assert.equal((await pending).creationClaimAcquired,false);assert.equal(await observer.json('SELECT to_json(count(*)) FROM jobvance_private.loop_billing_orders;'),1);
    await a.end();await b.end();return detail(a,b,p);
  });
  await check('first payment renewal and cancellation retain exact paid-through access',async()=>{
    const f=await setup();await paid(f);assert.equal((await observer.json(entitlement(f))).maxWeeklyRuns,1);
    const renewal=event(f,{start:f.renewStart,end:f.renewEnd,created:f.created+10,payment:'pay_renewal'});
    await observer.query(renewal);assert.equal(new Date((await observer.json(entitlement(f))).validUntil).toISOString(),new Date(f.renewEnd).toISOString());
    const version=await observer.json(`SELECT to_json(revision) FROM jobvance_private.loop_subscriptions WHERE subscription_id=${quote(f.subscription)};`),request=randomUUID();
    await observer.query(`SELECT job_loop_billing_cancel_claim(${quote(f.user)},${quote(f.session)},0,${quote(request)},'live',${quote(f.subscription)},${version}); SELECT job_loop_billing_cancel_finalize(${quote(f.user)},${quote(f.session)},0,${quote(request)},'live',${quote(f.subscription)},true);`);
    assert.equal((await observer.json(entitlement(f))).active,true);
    const status=await observer.json(`SELECT job_loop_billing_status(${quote(f.user)},${quote(f.session)},'live');`);assert.equal(status.subscription.cancelAtPeriodEnd,true);
    await observer.query(`UPDATE jobvance_private.loop_subscription_periods SET starts_at=now()-interval '32 days',ends_at=now()-interval '2 days'; UPDATE jobvance_private.loop_subscriptions SET valid_until=now()-interval '2 days';`);
    assert.equal((await observer.json(entitlement(f))).active,false);return {paidPeriods:2,cancellationKeptPaidAccess:true,expiredAccessRejected:true};
  });
  await check('concurrent duplicate renewal records one paid service period',async()=>{
    const f=await setup();await paid(f);const a=await actor('renewal-first',f.user,'service_role'),b=await actor('renewal-replay',f.user,'service_role');
    const renewal=event(f,{start:f.renewStart,end:f.renewEnd,created:f.created+10,payment:'pay_renewal',event:'evt_renewal'});
    await a.query('BEGIN;');await a.query(renewal);const pending=b.json(renewal),p=await blocking(b,a);await a.query('COMMIT;');assert.equal((await pending).duplicate,true);
    assert.equal(await observer.json('SELECT to_json(count(*)) FROM jobvance_private.loop_subscription_periods;'),2);await a.end();await b.end();return detail(a,b,p);
  });
  await check('refund revocation wins a concurrent later activation and remains permanent',async()=>{
    const f=await setup();await paid(f);const a=await actor('refund-first',f.user,'service_role'),b=await actor('activation-late',f.user,'service_role');
    await a.query('BEGIN;');await a.query(event(f,{revoked:true,created:f.created+10}));const pending=b.query(event(f,{created:f.created+20})),p=await blocking(b,a);await a.query('COMMIT;');await pending;
    assert.equal((await observer.json(entitlement(f))).active,false);assert.equal(await observer.json(`SELECT to_json(revoked) FROM jobvance_private.loop_subscriptions WHERE subscription_id=${quote(f.subscription)};`),true);
    await a.end();await b.end();return detail(a,b,p);
  });
  await check('fresh-session cancellation rejects a request after logout',async()=>{
    const f=await setup();await paid(f);await observer.query(`DELETE FROM auth.sessions WHERE id=${quote(f.session)};`);
    const current=await actor('logged-out',f.user,'service_role');assert.equal(await rejected(current.query(`SELECT job_loop_billing_cancel_claim(${quote(f.user)},${quote(f.session)},0,${quote(randomUUID())},'live',${quote(f.subscription)},1);`),'LOOP_BILLING_SESSION_STALE'),true);await current.end();return {revokedSessionRejected:true};
  });
  await check('verified past-due grace survives retry and stops exactly at its deadline',async()=>{
    const f=await setup();await paid(f);
    await observer.query(`UPDATE jobvance_private.loop_subscription_periods SET starts_at=now()-interval '32 days',ends_at=now()-interval '2 days'; UPDATE jobvance_private.loop_subscriptions SET valid_until=now()-interval '2 days';`);
    const times=await observer.json("SELECT jsonb_build_object('start',now()-interval '32 days','end',now()-interval '2 days','grace',now()+interval '2 days');");
    await observer.query(event(f,{...times,status:'past_due',payment:null,amount:null,created:f.created+10}));assert.equal((await observer.json(entitlement(f))).active,true);
    const before=await observer.json(`SELECT to_json(grace_until) FROM jobvance_private.loop_subscriptions WHERE subscription_id=${quote(f.subscription)};`);
    await observer.query(event(f,{...times,grace:null,status:'past_due',payment:null,amount:null,created:f.created+11}));
    assert.equal(await observer.json(`SELECT to_json(grace_until) FROM jobvance_private.loop_subscriptions WHERE subscription_id=${quote(f.subscription)};`),before);
    await observer.query(`UPDATE jobvance_private.loop_subscriptions SET grace_until=now()-interval '1 second';`);assert.equal((await observer.json(entitlement(f))).active,false);return {absoluteGraceDeadline:true,missingDeadlineDidNotExtend:true,expiredGraceRejected:true};
  });
  await check('uncertain cancellation recovery exposes original intent only to its current session',async()=>{
    const f=await setup();await paid(f);const request=randomUUID();
    const version=await observer.json(`SELECT to_json(revision) FROM jobvance_private.loop_subscriptions WHERE subscription_id=${quote(f.subscription)};`);
    await observer.query(`SELECT job_loop_billing_cancel_claim(${quote(f.user)},${quote(f.session)},0,${quote(request)},'live',${quote(f.subscription)},${version}); SELECT job_loop_billing_cancel_finalize(${quote(f.user)},${quote(f.session)},0,${quote(request)},'live',${quote(f.subscription)},false);`);
    const status=await observer.json(`SELECT job_loop_billing_status(${quote(f.user)},${quote(f.session)},'live');`);assert.equal(status.cancelRequest.requestId,request);
    const second=randomUUID();await observer.query(`INSERT INTO auth.sessions(id,user_id) VALUES(${quote(second)},${quote(f.user)});`);
    const other=await observer.json(`SELECT job_loop_billing_status(${quote(f.user)},${quote(second)},'live');`);assert.equal(other.cancelRequest,null);return {originalRequestRecovered:true,newSessionCannotReuseIntent:true};
  });
  await check('two last-seat checkout reservations serialize without overselling capacity',async()=>{
    const f=await setup(),g=await setup(false);await observer.query('UPDATE job_loop_pilot_users SET active=false;');
    for(let i=0;i<9;i++){const u=randomUUID();await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(u)}); INSERT INTO job_loop_pilot_users(user_id,active) VALUES(${quote(u)},true);`);}
    const a=await actor('seat-winner',f.user,'service_role'),b=await actor('seat-contender',g.user,'service_role');await a.query('BEGIN;');await a.query(claim(f));
    const pending=rejected(b.query(claim(g)),'LOOP_PILOT_FULL'),p=await blocking(b,a);await a.query('COMMIT;');assert.equal(await pending,true);
    assert.equal(await observer.json("SELECT to_json(count(*)) FROM jobvance_private.loop_billing_orders WHERE capacity_until>now();"),1);await a.end();await b.end();return detail(a,b,p);
  });
}
