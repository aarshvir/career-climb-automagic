import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({getSession:vi.fn(),onAuthStateChange:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:mocks}}));
import { startAnalytics,stopAnalytics,trackPage } from '@/lib/analytics';
import { cleanBatch } from '../../../supabase/functions/_shared/jobvance-track';

interface Event {id:string;pageId:string;kind:string;path:string;at:string;durationMs?:number;label?:string}
interface Batch {visitorId:string;sessionId:string;batchId:string;token:string|null;context:Record<string,unknown>;events:Event[]}
const ownerA='11111111-1111-4111-8111-111111111111',ownerB='22222222-2222-4222-8222-222222222222';
const sessionA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const jwt=(owner:string,session:string,version=1)=>'fixture.'+btoa(JSON.stringify({sub:owner,session_id:session,version})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')+'.signature';
const sdk=(owner:string,session:string,version=1)=>({access_token:jwt(owner,session,version),refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:owner,aud:'authenticated',role:'authenticated',email:'qa@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-10-26T00:00:00.000Z'}} as Session);
let callback:((event:string,session:Session|null)=>void)|undefined,batches:Batch[],requests:RequestInit[],visibility:DocumentVisibilityState;
const ack=(body:Batch)=>Response.json({batchId:body.batchId,accepted:body.events.length,inserted:body.events.length,duplicate:false});
const settle=async()=>{for(let i=0;i<64;i++)await Promise.resolve();};
async function begin(initial:Session|null=null){
 mocks.getSession.mockResolvedValue({data:{session:initial},error:null});
 startAnalytics({inTests:true});trackPage({pathname:'/job-loop',search:''});await settle();
}
function leave(){window.dispatchEvent(new Event('pagehide'));}
function click(label='Start'){
 const button=document.createElement('button');button.textContent=label;document.body.appendChild(button);button.click();button.remove();
}
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'));vi.clearAllMocks();
 window.localStorage.clear();window.sessionStorage.clear();window.history.replaceState(null,'','/job-loop');
 visibility='visible';vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visibility);
 vi.stubEnv('VITE_SUPABASE_URL','https://tracking.fixture.invalid');
 batches=[];requests=[];callback=undefined;
 mocks.onAuthStateChange.mockImplementation((next:typeof callback)=>{callback=next;return {data:{subscription:{unsubscribe:vi.fn()}}};});
 vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(String(init.body)) as Batch;batches.push(body);requests.push(init);return ack(body);}));
});
afterEach(()=>{stopAnalytics();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});

describe('independent analytics authority and exposure regressions',()=>{
 it('does not let a delayed SDK bootstrap overwrite a confirmed different session',async()=>{
  let resolve!: (value:unknown)=>void;
  mocks.getSession.mockReturnValue(new Promise(value=>{resolve=value;}));
  startAnalytics({inTests:true});trackPage({pathname:'/job-loop',search:''});
  callback?.('SIGNED_IN',sdk(ownerB,sessionB));await settle();
  resolve({data:{session:sdk(ownerA,sessionA)},error:null});await settle();
  click();leave();await settle();
  expect(batches.length).toBeGreaterThan(0);
  expect(batches.every(batch=>batch.token===jwt(ownerB,sessionB))).toBe(true);
 });
 it('keeps distinct A→B→A visits and never restamps events with a later account',async()=>{
  await begin(sdk(ownerA,sessionA));click('A action');
  callback?.('SIGNED_IN',sdk(ownerB,sessionB));await settle();click('B action');
  callback?.('SIGNED_IN',sdk(ownerA,sessionA,2));await settle();click('A return');leave();await settle();
  const events=batches.flatMap(batch=>batch.events.filter(event=>event.kind==='click').map(event=>({label:event.label,token:batch.token,sessionId:batch.sessionId})));
  expect(events.map(event=>[event.label,event.token])).toEqual([['A action',jwt(ownerA,sessionA)],['B action',jwt(ownerB,sessionB)],['A return',jwt(ownerA,sessionA,2)]]);
  expect(new Set(events.map(event=>event.sessionId)).size).toBe(3);
 });
 it('retries the identical measured batch after ambiguity, allowing only same-session token refresh',async()=>{
  let first=true;
  vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(String(init.body)) as Batch;batches.push(body);if(first){first=false;return Response.json({code:'unavailable'},{status:503});}return ack(body);}));
  await begin(sdk(ownerA,sessionA));callback?.('TOKEN_REFRESHED',sdk(ownerA,sessionA,2));
  await vi.advanceTimersByTimeAsync(5001);await settle();
  expect(batches.length).toBeGreaterThanOrEqual(2);
  const [a,b]=batches;expect(a.batchId).toBe(b.batchId);
  expect({...a,token:null}).toEqual({...b,token:null});expect(a.token).toBe(jwt(ownerA,sessionA));expect(b.token).toBe(jwt(ownerA,sessionA,2));
 });
 it('does not reuse corrupt persisted visit context that strict intake would reject',async()=>{
  const persistedVisitor='33333333-3333-4333-8333-333333333333',persistedVisit='44444444-4444-4444-8444-444444444444';
  window.localStorage.setItem('jv_visitor_v2',JSON.stringify({id:persistedVisitor,ownerId:ownerA}));
  window.sessionStorage.setItem('jv_visit_v2',JSON.stringify({id:persistedVisit,visitorId:persistedVisitor,actorKey:ownerA+':'+sessionA,last:Date.now()-1000,context:{landing:'/job-loop',unrecognized:'wrong'}}));
  await begin(sdk(ownerA,sessionA));leave();await settle();
  expect(batches.length).toBeGreaterThan(0);
  expect(batches.every(batch=>cleanBatch(batch)!==null)).toBe(true);
  expect(batches[0].sessionId).not.toBe(persistedVisit);
 });
 it('bounds a hung request, then recovers future delivery rather than freezing sending forever',async()=>{
  let first=true;
  vi.stubGlobal('fetch',vi.fn((_url:unknown,init:RequestInit)=>{
   const body=JSON.parse(String(init.body)) as Batch;batches.push(body);requests.push(init);
   if(first){first=false;return new Promise<Response>((_resolve,reject)=>init.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));}
   return Promise.resolve(ack(body));
  }));
  await begin(sdk(ownerA,sessionA));trackPage({pathname:'/pricing',search:''});leave();
  await vi.advanceTimersByTimeAsync(20_001);await settle();
  expect(requests[0].signal?.aborted).toBe(true);
  expect(batches.length).toBeGreaterThan(1);
 });
 it('bounds a stalled response JSON body as well as the initial network request',async()=>{
  let first=true;
  vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{
   const body=JSON.parse(String(init.body)) as Batch;batches.push(body);requests.push(init);
   if(first){first=false;return {status:200,json:()=>new Promise(()=>{})} as Response;}
   return ack(body);
  }));
  await begin(sdk(ownerA,sessionA));leave();await vi.advanceTimersByTimeAsync(20_001);await settle();
  expect(requests[0].signal?.aborted).toBe(true);expect(batches.length).toBeGreaterThan(1);
  expect(batches[0].batchId).toBe(batches[1].batchId);
 });
 it('reuses a valid visit only for the exact same SDK session, not a new same-owner session',async()=>{
  const visitor='33333333-3333-4333-8333-333333333333',visit='44444444-4444-4444-8444-444444444444';
  const saved={id:visit,visitorId:visitor,actorKey:ownerA+':'+sessionA,last:Date.now()-1000,context:{landing:'/job-loop',utm_source:'instagram',screen:'390x844'}};
  window.localStorage.setItem('jv_visitor_v2',JSON.stringify({id:visitor,ownerId:ownerA}));window.sessionStorage.setItem('jv_visit_v2',JSON.stringify(saved));
  await begin(sdk(ownerA,sessionA));leave();await settle();
  expect(batches[0].sessionId).toBe(visit);expect(batches[0].context).toEqual(saved.context);
  stopAnalytics();batches=[];window.sessionStorage.setItem('jv_visit_v2',JSON.stringify(saved));
  await begin(sdk(ownerA,sessionB));leave();await settle();
  expect(batches[0].sessionId).not.toBe(visit);expect(batches[0].visitorId).toBe(visitor);
  expect(batches.every(batch=>cleanBatch(batch)!==null)).toBe(true);
 });
 it('closes old visible time under the old visit before idle rollover and refreshes the landing',async()=>{
  await begin(null);const oldVisit=batches[0].sessionId;
  await vi.advanceTimersByTimeAsync(31*60_000);trackPage({pathname:'/pricing',search:''});leave();await settle();
  const oldLeave=batches.find(batch=>batch.events.some(event=>event.kind==='page_leave'&&event.path==='/job-loop'))!;
  const next=batches.find(batch=>batch.events.some(event=>event.kind==='page_view'&&event.path==='/pricing'))!;
  expect(oldLeave.sessionId).toBe(oldVisit);expect(next.sessionId).not.toBe(oldVisit);expect(next.context.landing).toBe('/pricing');
  expect(oldLeave.events.find(event=>event.kind==='page_leave')?.durationMs).toBe(31*60_000);
 });
 it('restores a new exposure after BFCache without counting hidden time twice',async()=>{
  await begin(null);await vi.advanceTimersByTimeAsync(1200);
  visibility='hidden';document.dispatchEvent(new Event('visibilitychange'));await settle();leave();await settle();
  await vi.advanceTimersByTimeAsync(60_000);
  visibility='visible';
  const show=new Event('pageshow');Object.defineProperty(show,'persisted',{value:true});window.dispatchEvent(show);
  click('Returned');await vi.advanceTimersByTimeAsync(800);leave();await settle();
  const events=batches.flatMap(batch=>batch.events);
  const views=events.filter(event=>event.kind==='page_view');expect(views).toHaveLength(2);expect(views[0].pageId).not.toBe(views[1].pageId);
  expect(events.filter(event=>event.kind==='page_leave').reduce((sum,event)=>sum+(event.durationMs??0),0)).toBe(2000);
  expect(events.some(event=>event.kind==='click'&&event.label==='Returned')).toBe(true);
 });
 it('records rapid routes immediately, with each page id and click on its actual source path',async()=>{
  await begin(null);trackPage({pathname:'/pricing',search:'?loopPlan=weekly'});click('Start pricing');
  trackPage({pathname:'/job-loop',search:''});click('Back result');leave();await settle();
  const events=batches.flatMap(batch=>batch.events);
  expect(events.filter(event=>event.kind==='page_view').map(event=>event.path)).toEqual(['/job-loop','/pricing?loopPlan=weekly','/job-loop']);
  expect(events.filter(event=>event.kind==='click').map(event=>[event.label,event.path])).toEqual([['Start pricing','/pricing?loopPlan=weekly'],['Back result','/job-loop']]);
  expect(batches.every(batch=>cleanBatch(batch)!==null)).toBe(true);
 });
 it('keeps the Check candidate route on fixed control labels rather than recording document text',async()=>{
  await begin(sdk(ownerA,sessionA));trackPage({pathname:'/check',search:''});click('Experience passage from a private CV');leave();await settle();
  expect(batches.flatMap(batch=>batch.events).filter(event=>event.kind==='click').map(event=>event.label)).toEqual(['button']);
  expect(JSON.stringify(batches)).not.toContain('Experience passage');
 });
});
