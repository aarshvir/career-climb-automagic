import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),require:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock('@/lib/job-loop-api',()=>({requireLoopOwner:mocks.require}));
import {captureLoopCheckoutIntent,createLoopSubscriptionCheckout,readLoopBilling} from '@/lib/loop-subscription-billing';
import {clearTrackingDraftMemory,setTrackingDraftOwner,trackingDraftAuthority} from '@/lib/tracking-draft-memory';
import {LOOP_TRIAL_DAYS,loopTrialDates,loopTrialTerms} from '@/lib/loop-trial';

const requestId='00000000-0000-4000-8000-000000000001';
const plans=[{id:'weekly',amount:2900,currency:'USD',interval:'month',runsPerWeek:1},{id:'active',amount:5900,currency:'USD',interval:'month',runsPerWeek:3},{id:'daily',amount:9900,currency:'USD',interval:'month',runsPerWeek:7}];
const status=(changes:Record<string,unknown>={})=>({billingConfigured:true,fulfillmentPending:false,billingMode:'live',plans,generation:0,entitlement:null,subscription:null,checkout:null,cancelRequest:null,...changes});
const receipt=(changes:Record<string,unknown>={})=>({provider:'dodo',billingMode:'live',generation:0,requestId,plan:'weekly',sessionId:'cks_example',url:'https://checkout.dodopayments.com/checkout/cks_example',...changes});
const scope=()=>({ownerId:'owner',authority:trackingDraftAuthority('owner')});
const invalidInput=()=>({data:null,error:{context:new Response(JSON.stringify({code:'INVALID_INPUT'}),{status:400})}});
beforeEach(()=>{clearTrackingDraftMemory();setTrackingDraftOwner('owner','session-a');mocks.invoke.mockReset();mocks.require.mockReset();mocks.require.mockResolvedValue(undefined);});
afterEach(()=>clearTrackingDraftMemory());

describe('seven-day trial billing boundary',()=>{
  it('states the trial terms with the cancel-before date, seven days ahead and a reminder two days before the first charge',()=>{
    const now=Date.parse('2026-11-11T09:00:00Z'),dates=loopTrialDates(now);
    expect(LOOP_TRIAL_DAYS).toBe(7);
    expect(dates.trialEndsAt.toISOString()).toBe('2026-11-18T09:00:00.000Z');
    expect(dates.firstChargeAt.toISOString()).toBe('2026-11-18T09:00:00.000Z');
    expect(dates.reminderAt.toISOString()).toBe('2026-11-16T09:00:00.000Z');
    expect(loopTrialTerms(dates.trialEndsAt)).toMatch(/^7-day free trial, card required\. Cancel before .+ and you will not be charged\.$/);
  });
  it('sends the trial flag only when the customer confirmed a trial',async()=>{
    expect(captureLoopCheckoutIntent('weekly',0,requestId)).not.toHaveProperty('trial');
    const intent=captureLoopCheckoutIntent('weekly',0,requestId,undefined,true);expect(intent).toMatchObject({trial:true});
    mocks.invoke.mockResolvedValue({data:receipt({trialDays:7}),error:null});
    await createLoopSubscriptionCheckout(scope(),intent);
    expect(mocks.invoke).toHaveBeenCalledWith('job-loop-billing',{body:{action:'checkout',plan:'weekly',expectedGeneration:0,requestId,consent:true,trial:true}});
  });
  it('rejects a receipt whose trial terms differ from the confirmed checkout',async()=>{
    mocks.invoke.mockResolvedValue({data:receipt(),error:null});
    await expect(createLoopSubscriptionCheckout(scope(),captureLoopCheckoutIntent('weekly',0,requestId,undefined,true))).rejects.toThrow(/free-trial terms/);
    mocks.invoke.mockResolvedValue({data:receipt({trialDays:7}),error:null});
    await expect(createLoopSubscriptionCheckout(scope(),captureLoopCheckoutIntent('weekly',0,requestId))).rejects.toThrow(/free-trial terms/);
    await expect(createLoopSubscriptionCheckout(scope(),{...captureLoopCheckoutIntent('weekly',0,requestId),trial:false} as never)).rejects.toThrow();
  });
  it('reads contract 3 trial status and falls back to contract 2 for an older billing function',async()=>{
    const trial={startsAt:'2026-11-11T09:00:00Z',endsAt:'2026-11-18T09:00:00Z',firstChargeAt:'2026-11-18T09:00:00Z',reminderAt:'2026-11-16T09:00:00Z',granted:true};
    const sub={subscriptionId:'sub_trial',plan:'weekly',status:'active',validUntil:trial.endsAt,periodStart:trial.startsAt,cancelAtPeriodEnd:false,revoked:false,graceUntil:null,version:2,pricing:null,trial};
    mocks.invoke.mockResolvedValue({data:status({trial:{available:true,eligible:false,days:7},subscription:sub}),error:null});
    expect(await readLoopBilling(scope())).toMatchObject({trial:{available:true,eligible:false,days:7},subscription:{trial}});
    mocks.invoke.mockReset();mocks.invoke.mockResolvedValueOnce(invalidInput()).mockResolvedValueOnce({data:status(),error:null});
    expect(await readLoopBilling(scope())).not.toHaveProperty('trial');
    expect(mocks.invoke.mock.calls.map(call=>call[1].body)).toEqual([{action:'status',contractVersion:3},{action:'status',contractVersion:2}]);
    mocks.invoke.mockReset();mocks.invoke.mockResolvedValue({data:status({trial:{available:true,eligible:true,days:14}}),error:null});
    await expect(readLoopBilling(scope())).rejects.toThrow();
  });
  it('explains a used trial without opening checkout',async()=>{
    mocks.invoke.mockResolvedValue({data:null,error:{context:new Response(JSON.stringify({code:'LOOP_TRIAL_USED'}),{status:409})}});
    await expect(createLoopSubscriptionCheckout(scope(),captureLoopCheckoutIntent('weekly',0,requestId,undefined,true))).rejects.toThrow(/already had an Automated Job Loop subscription or free trial/);
  });
});
