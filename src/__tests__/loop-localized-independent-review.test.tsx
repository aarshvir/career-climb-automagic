import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const mock=vi.hoisted(()=>({auth:{user:{id:'owner'},session:{user:{id:'owner'}},loading:false,authError:null} as Record<string,any>,read:vi.fn(),quote:vi.fn(),checkout:vi.fn(),cancel:vi.fn(),open:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>mock.auth}));
vi.mock('@/lib/loop-subscription-billing',async original=>({...await original<typeof import('@/lib/loop-subscription-billing')>(),readLoopBilling:mock.read,requestLoopPriceQuote:mock.quote,createLoopSubscriptionCheckout:mock.checkout,cancelLoopSubscription:mock.cancel}));
vi.mock('@/lib/payment-checkout',()=>({openPaymentCheckout:mock.open}));
import LoopSubscriptionBilling from '@/components/LoopSubscriptionBilling';
import { LoopBillingError } from '@/lib/loop-subscription-billing';
import { clearTrackingDraftMemory,setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { LOOP_LOCAL_CURRENCIES,LOOP_LOCAL_PRICE_CATALOG_VERSION } from '@/lib/loop-local-prices';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const money=(currency='INR',quoteId:string|null=id(11),country:string|null='IN')=>({quoteId,country,currency,amountMinor:LOOP_LOCAL_CURRENCIES[currency].amounts.weekly,exponent:LOOP_LOCAL_CURRENCIES[currency].exponent,catalogVersion:quoteId?LOOP_LOCAL_PRICE_CATALOG_VERSION:'legacy-usd-v1',taxInclusive:true,interval:'month'});
const quote=(intent:any,n=11)=>({...money(intent.currency,id(n),intent.country),requestId:intent.requestId,generation:intent.expectedGeneration,plan:intent.plan,expiresAt:new Date(Date.now()+900000).toISOString()});
const status=()=>({billingConfigured:true,fulfillmentPending:false,billingMode:'live',generation:0,plans:[{id:'weekly',amount:2900,currency:'USD',interval:'month',runsPerWeek:1},{id:'active',amount:5900,currency:'USD',interval:'month',runsPerWeek:3},{id:'daily',amount:9900,currency:'USD',interval:'month',runsPerWeek:7}],entitlement:null,subscription:null,checkout:null,cancelRequest:null});
const page=(path='/pricing?loopPlan=weekly&country=IN&currency=INR')=><MemoryRouter initialEntries={[path]}><LoopSubscriptionBilling/></MemoryRouter>;
beforeEach(()=>{clearTrackingDraftMemory();setTrackingDraftOwner('owner','first-session');mock.auth={user:{id:'owner'},session:{user:{id:'owner'}},loading:false,authError:null};mock.read.mockReset().mockResolvedValue(status());mock.quote.mockReset().mockImplementation(async(_scope,intent)=>quote(intent));mock.checkout.mockReset().mockResolvedValue({provider:'dodo',billingMode:'live',url:'https://checkout.dodopayments.com/original',sessionId:'cks_original'});mock.cancel.mockReset();mock.open.mockReset();});
afterEach(()=>{cleanup();clearTrackingDraftMemory();});
describe('independent localized UI authority review',()=>{
  it('revokes consent synchronously across batched market A to B to A without reusing old price authority',async()=>{
    render(page());const first=await screen.findByRole('checkbox',{name:/I choose Starter/});fireEvent.click(first);expect(first).toBeChecked();
    const country=screen.getByRole('combobox',{name:'Billing country or region'});
    act(()=>{fireEvent.change(country,{target:{value:'JP'}});fireEvent.change(country,{target:{value:'IN'}});});
    await waitFor(()=>expect(mock.quote.mock.calls.length).toBeGreaterThan(1));expect(mock.quote.mock.calls[mock.quote.mock.calls.length-1][1]).toMatchObject({country:'IN',currency:'INR'});const next=await screen.findByRole('checkbox',{name:/I choose Starter/});expect(next).not.toBeChecked();
    fireEvent.click(screen.getByRole('button',{name:/Continue to secure checkout/}));expect(mock.checkout).not.toHaveBeenCalled();
    fireEvent.click(next);fireEvent.click(screen.getByRole('button',{name:/Continue to secure checkout/}));await waitFor(()=>expect(mock.checkout).toHaveBeenCalledTimes(1));expect(mock.checkout.mock.calls[0][0].pricing).toMatchObject({country:'IN',currency:'INR',amountMinor:299900});
  });
  it('ignores an old generation quote that resolves after the fresh generation price',async()=>{
    const pending:{intent:any,resolve:(v:any)=>void}[]=[];mock.quote.mockImplementation((_scope,intent)=>new Promise(resolve=>pending.push({intent,resolve})));render(page());await waitFor(()=>expect(pending).toHaveLength(1));
    mock.read.mockResolvedValue({...status(),generation:1});fireEvent.click(screen.getByRole('button',{name:'Refresh billing'}));await waitFor(()=>expect(pending).toHaveLength(2));
    await act(async()=>pending[1].resolve(quote(pending[1].intent,12)));await act(async()=>pending[0].resolve(quote(pending[0].intent,11)));
    const consent=await screen.findByRole('checkbox',{name:/I choose Starter/});fireEvent.click(consent);fireEvent.click(screen.getByRole('button',{name:/Continue to secure checkout/}));await waitFor(()=>expect(mock.checkout).toHaveBeenCalledTimes(1));expect(mock.checkout.mock.calls[0][1]).toMatchObject({expectedGeneration:1,quoteId:id(12)});
  });
  it('does not restore a late quote across a same-owner new authentication session',async()=>{
    let resolveOld:(v:any)=>void,oldIntent:any;mock.quote.mockImplementationOnce((_scope,intent)=>{oldIntent=intent;return new Promise(resolve=>resolveOld=resolve);});const view=render(page());await waitFor(()=>expect(mock.quote).toHaveBeenCalledTimes(1));
    setTrackingDraftOwner('owner','second-session');mock.auth={...mock.auth,session:{user:{id:'owner'},newSession:true}};view.rerender(page());await waitFor(()=>expect(mock.quote).toHaveBeenCalledTimes(2));await act(async()=>resolveOld(quote(oldIntent,99)));
    fireEvent.click(await screen.findByRole('checkbox',{name:/I choose Starter/}));fireEvent.click(screen.getByRole('button',{name:/Continue to secure checkout/}));await waitFor(()=>expect(mock.checkout).toHaveBeenCalled());expect(mock.checkout.mock.calls[0][1].quoteId).toBe(id(11));expect(mock.checkout.mock.calls[0][0].authority).toBeGreaterThan(0);
  });
  it('resumes only the original INR price and request instead of the newly selected JPY market',async()=>{
    mock.read.mockResolvedValue({...status(),checkout:{requestId:id(33),plan:'weekly',status:'ready',checkoutUrl:'https://checkout.dodopayments.com/original',pricing:money()}});render(page('/pricing?loopPlan=weekly&country=JP&currency=JPY'));
    await screen.findByText(/Original checkout price:/);expect(mock.quote).not.toHaveBeenCalled();expect(screen.getByRole('combobox',{name:'Billing country or region'})).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox',{name:/I choose Starter/}));fireEvent.click(screen.getByRole('button',{name:'Resume original secure checkout'}));await waitFor(()=>expect(mock.checkout).toHaveBeenCalledTimes(1));expect(mock.checkout.mock.calls[0][1]).toMatchObject({requestId:id(33),quoteId:id(11)});expect(mock.checkout.mock.calls[0][0].pricing).toMatchObject({currency:'INR',amountMinor:299900});
  });
  it('retains the original USD cancellation terms while the public cards show a JPY market',async()=>{
    const sub={subscriptionId:'sub_historical',plan:'weekly',status:'active',validUntil:'2030-11-18T10:00:00Z',periodStart:'2026-10-18T10:00:00Z',cancelAtPeriodEnd:false,revoked:false,graceUntil:null,version:7,pricing:money('USD',null,null)};
    mock.read.mockResolvedValue({...status(),subscription:sub});mock.cancel.mockResolvedValue({status:'confirmed',subscription:{...sub,cancelAtPeriodEnd:true,version:8}});render(page('/pricing?country=JP&currency=JPY'));
    expect(await screen.findByRole('heading',{name:'Starter · $29 USD/month'})).toBeInTheDocument();expect(mock.quote).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('checkbox',{name:/Cancel future monthly renewal/}));fireEvent.click(screen.getByRole('button',{name:'Cancel monthly renewal'}));
    await waitFor(()=>expect(mock.cancel).toHaveBeenCalledTimes(1));expect(mock.cancel.mock.calls[0][1]).toMatchObject({expectedSubscriptionId:'sub_historical',expectedVersion:7,expectedGeneration:0,contractVersion:2});expect(await screen.findByText(/Renewal is cancelled/)).toBeInTheDocument();expect(mock.checkout).not.toHaveBeenCalled();
  });
  it.each(['LOOP_BILLING_QUOTE_EXPIRED','LOOP_BILLING_PRICE_CHANGED'])('recovers known no-checkout %s with a new quote, new request and fresh consent',async code=>{
    let quotes=10;mock.quote.mockImplementation(async(_scope,intent)=>quote(intent,++quotes));mock.checkout.mockRejectedValueOnce(new LoopBillingError('No provider checkout was sent.',code));render(page());
    fireEvent.click(await screen.findByRole('checkbox',{name:/I choose Starter/}));fireEvent.click(screen.getByRole('button',{name:/Continue to secure checkout/}));await waitFor(()=>expect(mock.quote).toHaveBeenCalledTimes(2));
    const fresh=await screen.findByRole('checkbox',{name:/I choose Starter/});expect(fresh).not.toBeChecked();expect(screen.getByRole('combobox',{name:'Billing country or region'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:/Continue to secure checkout/}));expect(mock.checkout).toHaveBeenCalledTimes(1);
    fireEvent.click(fresh);fireEvent.click(screen.getByRole('button',{name:/Continue to secure checkout/}));await waitFor(()=>expect(mock.checkout).toHaveBeenCalledTimes(2));expect(mock.checkout.mock.calls[1][1].requestId).not.toBe(mock.checkout.mock.calls[0][1].requestId);expect(mock.checkout.mock.calls[1][1].quoteId).toBe(id(12));
  });
  it('keeps an unknown checkout write bound to the original request and price without requesting another quote',async()=>{
    mock.checkout.mockRejectedValue(new LoopBillingError('Outcome unknown.','UNCONFIRMED'));render(page());fireEvent.click(await screen.findByRole('checkbox',{name:/I choose Starter/}));fireEvent.click(screen.getByRole('button',{name:/Continue to secure checkout/}));
    await screen.findByRole('alert');expect(screen.getByRole('combobox',{name:'Billing country or region'})).toBeDisabled();expect(mock.quote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('checkbox',{name:/I choose Starter/}));fireEvent.click(screen.getByRole('button',{name:'Resume original secure checkout'}));await waitFor(()=>expect(mock.checkout).toHaveBeenCalledTimes(2));expect(mock.checkout.mock.calls[1][1]).toEqual(mock.checkout.mock.calls[0][1]);expect(mock.checkout.mock.calls[1][0].pricing).toEqual(mock.checkout.mock.calls[0][0].pricing);
  });
});
