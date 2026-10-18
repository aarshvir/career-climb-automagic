import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Actual distinct PostgreSQL backends and observed lock waits. All records are
// isolated fixtures; provider writes and authentication are separate evidence.
export async function loopRefundRenewalSafetyNativeCases({observer,actor,check,blocking,quote}){
  const detail=(a,b,p)=>({distinctBackendPids:[a.pid,b.pid],blockingPids:p});
  const rejected=(promise,code)=>promise.then(()=>false,error=>error.message.includes(code));
  async function setup(){
    await observer.query('TRUNCATE auth.users CASCADE;');
    const f={user:randomUUID(),session:randomUUID(),request:randomUUID()},suffix=f.user.replaceAll('-','');
    Object.assign(f,{checkout:'cks_'+suffix,subscription:'sub_'+suffix,customer:'cus_'+suffix});
    await observer.query(`INSERT INTO auth.users(id) VALUES(${quote(f.user)});INSERT INTO auth.sessions(id,user_id) VALUES(${quote(f.session)},${quote(f.user)});SELECT job_loop_open_record(${quote(f.user)});`);
    Object.assign(f,await observer.json("SELECT jsonb_build_object('start',now()-interval '1 day','end',now()+interval '29 days','created',extract(epoch FROM now())::bigint-100);"));
    await observer.query(claim(f));
    await observer.query(`SELECT job_loop_billing_checkout_finalize(${quote(f.user)},${quote(f.session)},0,${quote(f.request)},${quote(f.checkout)},${quote('https://checkout.dodopayments.com/session/'+f.checkout)});`);
    await observer.query(event(f));return f;
  }
  const claim=(f,request=f.request)=>`SELECT job_loop_billing_checkout_claim(${quote(f.user)},${quote(f.session)},0,${quote(request)},'live','weekly','pdt_weekly');`;
  const event=(f,revoked=false)=>`SELECT job_loop_billing_apply_event(${quote(f.user)},${quote(f.request)},'live','weekly','pdt_weekly',${quote(f.checkout)},${quote(f.subscription)},${quote(f.customer)},'active',${quote(f.start)},${quote(f.end)},false,${quote('evt_'+randomUUID())},${f.created+(revoked?1:0)},${revoked},${quote('a'.repeat(64))},${quote('pay_'+f.request.replaceAll('-',''))},2900);`;
  const status=f=>`SELECT job_loop_billing_status(${quote(f.user)},${quote(f.session)},'live');`;
  const cancel=(f,id,version)=>`SELECT job_loop_billing_cancel_claim(${quote(f.user)},${quote(f.session)},0,${quote(id)},'live',${quote(f.subscription)},${version});`;
  const finalize=(f,id,confirmed)=>`SELECT job_loop_billing_cancel_finalize(${quote(f.user)},${quote(f.session)},0,${quote(id)},'live',${quote(f.subscription)},${confirmed});`;

  await check('refund and replacement checkout serialize without allowing a second renewable mandate',async()=>{
    const f=await setup(),a=await actor('refund-held',f.user,'service_role'),b=await actor('replacement-after-refund',f.user,'service_role');
    await a.query('BEGIN;');await a.query(event(f,true));const pending=rejected(b.query(claim(f,randomUUID())),'LOOP_SUBSCRIPTION_EXISTS'),p=await blocking(b,a);
    await a.query('COMMIT;');assert.equal(await pending,true);assert.equal((await observer.json(`SELECT job_loop_billing_entitlement(${quote(f.user)});`)).active,false);
    assert.equal(await observer.json('SELECT to_json(count(*)) FROM jobvance_private.loop_billing_orders;'),1);
    await a.end();await b.end();return detail(a,b,p);
  });
  await check('refunded consumed checkout cannot resume through its original request or status',async()=>{
    const f=await setup();await observer.query(event(f,true));
    const reader=await actor('consumed-original-retry',f.user,'service_role');assert.equal(await rejected(reader.query(claim(f)),'LOOP_CHECKOUT_FINISHED'),true);
    const view=await observer.json(status(f));assert.equal(view.checkout,null);assert.equal(view.subscription.revoked,true);assert.equal(view.subscription.cancelAtPeriodEnd,false);
    await reader.end();return{consumedOriginalRejected:true,checkoutRecoveryHidden:true,cancellationStillVisible:true};
  });
  await check('confirmed refunded cancellation serializes before deliberate replacement without restoring access',async()=>{
    const f=await setup();await observer.query(event(f,true));const id=randomUUID(),version=(await observer.json(status(f))).subscription.revision;
    await observer.query(cancel(f,id,version));const a=await actor('confirm-refunded-cancel',f.user,'service_role'),b=await actor('replacement-after-confirmed-cancel',f.user,'service_role');
    await a.query('BEGIN;');await a.query(finalize(f,id,true));const pending=b.json(claim(f,randomUUID())),p=await blocking(b,a);await a.query('COMMIT;');
    assert.equal((await pending).creationClaimAcquired,true);assert.equal((await observer.json(`SELECT job_loop_billing_entitlement(${quote(f.user)});`)).active,false);
    assert.equal((await observer.json(status(f))).subscription.cancelAtPeriodEnd,true);await a.end();await b.end();return detail(a,b,p);
  });
  await check('safe pre-write cancellation retry grants one winner and ambiguous attempts never reacquire',async()=>{
    const f=await setup(),id=randomUUID(),version=(await observer.json(status(f))).subscription.revision;
    await observer.query(cancel(f,id,version));await observer.query(`SELECT job_loop_billing_cancel_retryable(${quote(f.user)},${quote(f.session)},0,${quote(id)},'live',${quote(f.subscription)});`);
    const a=await actor('cancel-retry-winner',f.user,'service_role'),b=await actor('cancel-retry-reader',f.user,'service_role');
    await a.query('BEGIN;');assert.equal((await a.json(cancel(f,id,version))).creationClaimAcquired,true);
    const pending=b.json(cancel(f,id,version)),p=await blocking(b,a);await a.query('COMMIT;');assert.equal((await pending).creationClaimAcquired,false);
    await observer.query(finalize(f,id,false));assert.equal((await observer.json(cancel(f,id,version))).creationClaimAcquired,false);
    await a.end();await b.end();return detail(a,b,p);
  });
}
