import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.unmock('react-router-dom');
const m=vi.hoisted(()=>({auth:{user:{id:'owner'},session:{user:{id:'owner'}},loading:false,authError:null} as Record<string,any>,read:vi.fn(),quote:vi.fn(),checkout:vi.fn(),cancel:vi.fn(),open:vi.fn(),report:vi.fn()}));
vi.mock('@/lib/meta-commerce',()=>({reportMetaCheckout:m.report}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>m.auth}));
vi.mock('@/lib/loop-subscription-billing',async original=>({...await original<typeof import('@/lib/loop-subscription-billing')>(),readLoopBilling:m.read,requestLoopPriceQuote:m.quote,createLoopSubscriptionCheckout:m.checkout,cancelLoopSubscription:m.cancel}));
vi.mock('@/lib/payment-checkout',()=>({openPaymentCheckout:m.open}));
import LoopSubscriptionBilling from '@/components/LoopSubscriptionBilling';
import {clearTrackingDraftMemory,setTrackingDraftOwner} from '@/lib/tracking-draft-memory';
import {LOOP_LOCAL_CURRENCIES} from '@/lib/loop-local-prices';
import {loopTrialDay} from '@/lib/loop-trial';

const DAY=86400000;
const price=()=>({quoteId:null,country:null,currency:'USD',amountMinor:LOOP_LOCAL_CURRENCIES.USD.amounts.weekly,exponent:2,catalogVersion:'legacy-usd-v1',taxInclusive:true,interval:'month'});
const plans=[{id:'weekly',amount:2900,currency:'USD',interval:'month',runsPerWeek:1},{id:'active',amount:5900,currency:'USD',interval:'month',runsPerWeek:3},{id:'daily',amount:9900,currency:'USD',interval:'month',runsPerWeek:7}];
const status=(changes:Record<string,unknown>={})=>({billingConfigured:true,fulfillmentPending:false,billingMode:'live',generation:0,plans,entitlement:null,subscription:null,checkout:null,cancelRequest:null,trial:{available:true,eligible:true,days:7},...changes});
const renderPage=(path='/pricing?loopPlan=weekly&country=other')=>render(<MemoryRouter initialEntries={[path]}><LoopSubscriptionBilling/></MemoryRouter>);
beforeEach(()=>{clearTrackingDraftMemory();setTrackingDraftOwner('owner','session');m.auth={user:{id:'owner'},session:{user:{id:'owner'}},loading:false,authError:null};
  for(const fn of [m.read,m.quote,m.checkout,m.cancel,m.open,m.report])fn.mockReset();m.report.mockResolvedValue(undefined);m.read.mockResolvedValue(status());});
afterEach(()=>{cleanup();clearTrackingDraftMemory();});

describe('seven-day free trial journey',()=>{
  it('shows the price, trial end and first-charge date before any card is entered, with nothing pre-ticked',async()=>{
    renderPage();
    const box=await screen.findByRole('checkbox',{name:/I start a 7-day free trial of Starter/});
    expect(box).not.toBeChecked();
    const end=loopTrialDay(new Date(Date.now()+7*DAY));
    expect(screen.getByText(`7-day free trial, card required. Cancel before ${end} and you will not be charged.`)).toBeInTheDocument();
    const dates=screen.getByRole('list',{name:'Free trial dates and price'});
    expect(dates).toHaveTextContent('Due today: $0 USD');
    expect(dates).toHaveTextContent(`Trial ends: ${end}`);
    expect(dates).toHaveTextContent(`First charge: $29 USD, tax included, on ${end}`);
    expect(screen.getByRole('button',{name:/Start 7-day free trial · card required/})).toBeDisabled();
    // No countdown, scarcity or extra purchase option accompanies the offer.
    expect(screen.queryByText(/hurry|only today|left at this price|ends in/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox',{checked:true})).not.toBeInTheDocument();
  });
  it('sends the explicit trial intent after consent',async()=>{
    m.checkout.mockImplementation(async (_scope,intent)=>({provider:'dodo',billingMode:'live',generation:0,requestId:intent.requestId,plan:'weekly',sessionId:'cks_trial',url:'https://checkout.dodopayments.com/s',trialDays:7}));
    renderPage();
    fireEvent.click(await screen.findByRole('checkbox',{name:/I start a 7-day free trial/}));
    fireEvent.click(screen.getByRole('button',{name:/Start 7-day free trial/}));
    await waitFor(()=>expect(m.checkout).toHaveBeenCalledTimes(1));
    expect(m.checkout.mock.calls[0][1]).toMatchObject({action:'checkout',plan:'weekly',trial:true,consent:true});
    expect(await screen.findByText(/free trial starts only after Dodo Payments confirms your card/)).toBeInTheDocument();
  });
  it('charges today, without trial copy, for an account that is not eligible',async()=>{
    m.read.mockResolvedValue(status({trial:{available:true,eligible:false,days:7}}));
    renderPage();
    expect(await screen.findByRole('checkbox',{name:/I choose Starter at \$29 USD each month/})).toBeInTheDocument();
    expect(screen.queryByRole('checkbox',{name:/free trial/})).not.toBeInTheDocument();
    expect(screen.getByText(/so this checkout is charged today/)).toBeInTheDocument();
  });
  it('keeps the original no-trial copy when the server has trials switched off',async()=>{
    m.read.mockResolvedValue(status({trial:{available:false,eligible:false,days:7}}));
    renderPage();
    expect(await screen.findByRole('checkbox',{name:/I choose Starter/})).toBeInTheDocument();
    expect(screen.getAllByText(/No trial or subscription starts automatically/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/7-day free trial/)).not.toBeInTheDocument();
  });
  it('cancels a trial in two clicks so the first charge does not happen',async()=>{
    const start=Date.now()-DAY,end=start+7*DAY;
    const trial={startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),firstChargeAt:new Date(end).toISOString(),reminderAt:new Date(end-2*DAY).toISOString(),granted:true};
    const sub={subscriptionId:'sub_trial',plan:'weekly',status:'active',validUntil:trial.endsAt,periodStart:trial.startsAt,cancelAtPeriodEnd:false,revoked:false,graceUntil:null,version:2,pricing:price(),trial};
    m.read.mockResolvedValue(status({trial:{available:true,eligible:false,days:7},subscription:sub,entitlement:{active:true,plan:'weekly',cadence:'weekly',variantLimit:3,maxWeeklyRuns:1,validUntil:trial.endsAt}}));
    // The actual contract-2 cancellation receipt carries no trial fields.
    const {trial:_omitted,...receiptSub}={...sub,cancelAtPeriodEnd:true,version:3};
    m.cancel.mockResolvedValue({requestId:'00000000-0000-4000-8000-000000000009',generation:0,subscriptionId:'sub_trial',status:'confirmed',subscription:receiptSub});
    renderPage('/pricing');
    expect(await screen.findByText('Status: free trial.')).toBeInTheDocument();
    expect(screen.getByLabelText('Free trial')).toHaveTextContent(/First charge: \$29 USD, tax included,/);
    expect(screen.queryByText(/Paid access through/)).not.toBeInTheDocument();
    const confirm=screen.getByRole('checkbox',{name:/Cancel this free trial\. You will not be charged \$29 USD/});
    const button=screen.getByRole('button',{name:'Cancel free trial'});expect(button).toBeDisabled();
    fireEvent.click(confirm);fireEvent.click(button);
    await waitFor(()=>expect(m.cancel).toHaveBeenCalledTimes(1));
    expect(m.cancel.mock.calls[0][1]).toMatchObject({action:'cancel',expectedSubscriptionId:'sub_trial',expectedVersion:2,consent:true});
    expect(await screen.findByText(/Free trial cancelled\. You will not be charged\. Trial access continues until/)).toBeInTheDocument();
    // The panel keeps its trial state without a refresh, never paid-period copy.
    expect(screen.getByText('Status: free trial.')).toBeInTheDocument();
    expect(screen.getByLabelText('Free trial')).toHaveTextContent(`Trial cancelled. You will not be charged. Trial access ends`);
    expect(screen.queryByText(/Recorded paid period ends/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Renewal is cancelled/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Cancel free trial'})).not.toBeInTheDocument();
    expect(m.read).toHaveBeenCalledTimes(1);
  });
  it('does not attach a trial from another subscription to a cancellation receipt',async()=>{
    const start=Date.now()-DAY,end=start+7*DAY;
    const trial={startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),firstChargeAt:new Date(end).toISOString(),reminderAt:new Date(end-2*DAY).toISOString(),granted:true};
    const sub={subscriptionId:'sub_trial',plan:'weekly',status:'active',validUntil:trial.endsAt,periodStart:trial.startsAt,cancelAtPeriodEnd:false,revoked:false,graceUntil:null,version:2,pricing:price(),trial};
    m.read.mockResolvedValue(status({trial:{available:true,eligible:false,days:7},subscription:sub}));
    m.cancel.mockResolvedValue({requestId:'00000000-0000-4000-8000-000000000009',generation:0,subscriptionId:'sub_trial',status:'confirmed',subscription:{subscriptionId:'sub_other',plan:'weekly',status:'active',validUntil:trial.endsAt,periodStart:trial.startsAt,cancelAtPeriodEnd:true,revoked:false,graceUntil:null,version:3,pricing:price()}});
    renderPage('/pricing');
    fireEvent.click(await screen.findByRole('checkbox',{name:/Cancel this free trial/}));fireEvent.click(screen.getByRole('button',{name:'Cancel free trial'}));
    await waitFor(()=>expect(m.cancel).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(screen.queryByText('Status: free trial.')).not.toBeInTheDocument());
  });
});
