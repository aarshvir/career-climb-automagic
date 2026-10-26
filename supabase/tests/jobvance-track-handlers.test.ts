// @vitest-environment node
// Actual deployed entrypoint with Request/Response; SDK boundaries are intercepted, no external calls.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
type Handler=(request:Request)=>Promise<Response>;
const owner='11111111-1111-4111-8111-111111111111';
const ids={visitorId:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333',batchId:'44444444-4444-4444-8444-444444444444',id:'55555555-5555-4555-8555-555555555555',pageId:'66666666-6666-4666-8666-666666666666'};
const state=vi.hoisted(()=>({authCalls:[] as string[],rpcCalls:[] as {name:string,args:Record<string,unknown>}[],authError:null as unknown,missingUser:false,rpcError:null as unknown,rpcData:undefined as unknown,throwAuth:false,throwRpc:false}));
vi.mock('https://esm.sh/@supabase/supabase-js@2.57.4',()=>({createClient:()=>({
 auth:{getUser:async(token:string)=>{state.authCalls.push(token);if(state.throwAuth)throw new Error('sensitive transport detail');return {data:{user:state.missingUser?null:{id:'11111111-1111-4111-8111-111111111111'}},error:state.authError};}},
 rpc:async(name:string,args:Record<string,unknown>)=>{state.rpcCalls.push({name,args});if(state.throwRpc)throw new Error('sensitive database detail');return {data:state.rpcData===undefined?{batchId:args.p_batch,accepted:(args.p_events as unknown[]).length,inserted:(args.p_events as unknown[]).length,duplicate:false}:state.rpcData,error:state.rpcError};}
})}));
let handler:Handler,env:Record<string,string|undefined>;
const fixture=()=>({visitorId:ids.visitorId,sessionId:ids.sessionId,batchId:ids.batchId,token:null as string|null,context:{landing:'/job-loop',utm_source:'instagram',utm_medium:'organic'},events:[{id:ids.id,pageId:ids.pageId,kind:'page_view',at:new Date().toISOString(),path:'/job-loop',title:'Jobvance'}]});
const request=(body:unknown,headers:Record<string,string>={},method='POST')=>new Request('https://edge.fixture.invalid',{method,headers:{Origin:'https://jobvance.io','Content-Type':'text/plain','User-Agent':'Mozilla/5.0 Chrome/130.0',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
beforeAll(async()=>{
 vi.stubGlobal('Deno',{env:{get:(name:string)=>env[name]},serve:(value:Handler)=>{handler=value;}});
 await import('../functions/jobvance-track/index.ts');
});
beforeEach(()=>{
 env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fictional-service',ALLOWED_ORIGINS:'https://preview.fixture.invalid'};
 state.authCalls=[];state.rpcCalls=[];state.authError=null;state.missingUser=false;state.rpcError=null;state.rpcData=undefined;state.throwAuth=false;state.throwRpc=false;
});
afterAll(()=>vi.unstubAllGlobals());

describe('actual analytics edge HTTP composition',()=>{
 it('allows exact approved CORS preflight and rejects missing/foreign origins before any DB call',async()=>{
  const preflight=await handler(request(null,{},'OPTIONS'));
  expect(preflight.status).toBe(204);expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://jobvance.io');expect(preflight.headers.get('Vary')).toBe('Origin');
  for(const origin of ['', 'https://jobvance.io.evil.invalid','null','http://jobvance.io']) {
   const response=await handler(request(fixture(),{Origin:origin}));expect(response.status).toBe(403);expect(response.headers.has('access-control-allow-origin')).toBe(false);
  }
  expect(state.authCalls).toHaveLength(0);expect(state.rpcCalls).toHaveLength(0);
 });
 it('rejects method/content type and absent config without accidental writes',async()=>{
  expect((await handler(request(null,{},'GET'))).status).toBe(405);
  expect((await handler(request(fixture(),{'Content-Type':'application/x-www-form-urlencoded'}))).status).toBe(415);
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  const response=await handler(request(fixture()));expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'TRACK_NOT_CONFIGURED'});expect(state.rpcCalls).toHaveLength(0);
 });
 it('admits anonymous batches with immutable ids/context, no auth and exact original retry receipt',async()=>{
  const body=fixture(),response=await handler(request(body));
  expect(response.status).toBe(200);const receipt=await response.json();expect(receipt).toEqual({batchId:ids.batchId,accepted:1,inserted:1,duplicate:false});
  expect(response.headers.get('Cache-Control')).toBe('no-store');expect(state.authCalls).toHaveLength(0);
  expect(state.rpcCalls[0]).toEqual({name:'jobvance_track',args:{p_visitor:ids.visitorId,p_session:ids.sessionId,p_batch:ids.batchId,p_user:null,p_context:body.context,p_events:body.events,p_device:{device:'desktop',browser:'Chrome',os:'Other',inApp:null,country:null}}});
  state.rpcData=receipt;const retry=await handler(request(body));expect(await retry.json()).toEqual(receipt);
 });
 it('derives owner by fresh verified token on each attempt and never passes credentials into SQL/ack',async()=>{
  const body={...fixture(),token:'fictional-user-token'};const response=await handler(request(body));
  expect(response.status).toBe(200);expect(state.authCalls).toEqual(['fictional-user-token']);expect(state.rpcCalls[0].args.p_user).toBe(owner);
  expect(JSON.stringify(state.rpcCalls)).not.toContain('fictional-user-token');expect(await response.text()).not.toContain('fictional-user-token');
  state.authError={status:401,message:'expired token detail'};
  const revoked=await handler(request(body));expect(revoked.status).toBe(401);expect(state.authCalls).toHaveLength(2);expect(state.rpcCalls).toHaveLength(1);
 });
 it('does not silently downgrade invalid supplied identity to anonymous and distinguishes auth outages',async()=>{
  const body={...fixture(),token:'invalid-token'};
  state.missingUser=true;expect((await handler(request(body))).status).toBe(401);expect(state.rpcCalls).toHaveLength(0);
  state.missingUser=false;state.authError={status:503,message:'sensitive upstream'};
  let response=await handler(request(body));expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'TRACK_AUTH_UNAVAILABLE'});
  state.authError={status:429};expect((await handler(request(body))).status).toBe(503);
  state.authError=null;state.throwAuth=true;response=await handler(request(body));expect(response.status).toBe(503);expect(await response.text()).not.toContain('sensitive');
  expect(state.rpcCalls).toHaveLength(0);
 });
 it('reports DB failure/conflict and never fabricates successful acknowledgement',async()=>{
  state.rpcError={message:'database unavailable sensitive'};let response=await handler(request(fixture()));expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'TRACK_STORAGE_UNAVAILABLE'});
  state.rpcError={message:'TRACK_BATCH_CONFLICT'};response=await handler(request(fixture()));expect(response.status).toBe(409);expect(await response.json()).toEqual({code:'TRACK_CONFLICT'});
  state.rpcError=null;state.rpcData={batchId:ids.sessionId,accepted:1,inserted:1,duplicate:false};response=await handler(request(fixture()));expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'TRACK_ACK_INVALID'});
  state.rpcData={batchId:ids.batchId,accepted:1,inserted:0,duplicate:true};response=await handler(request(fixture()));expect(response.status).toBe(200);
 });
 it('rejects malformed or mixed invalid payloads wholesale before SDK composition',async()=>{
  for(const body of ['{', {...fixture(),events:[...fixture().events,{...fixture().events[0],id:'bad'}]}, {...fixture(),userId:owner}, {...fixture(),token:''}]) expect((await handler(request(body))).status).toBe(400);
  expect(state.authCalls).toHaveLength(0);expect(state.rpcCalls).toHaveLength(0);
 });
 it('counts actual streaming bytes, including multi-byte UTF8 and forged content length',async()=>{
  const oversized='é'.repeat(33000);const response=await handler(request(oversized,{'Content-Length':'2'}));expect(response.status).toBe(413);
  expect((await handler(request('{}',{'Content-Length':'65537'}))).status).toBe(413);
  const malformed=new Request('https://edge.fixture.invalid',{method:'POST',headers:{Origin:'https://jobvance.io','Content-Type':'text/plain','User-Agent':'Mozilla'},body:new Uint8Array([0xc3,0x28])});
  expect((await handler(malformed)).status).toBe(400);expect(state.rpcCalls).toHaveLength(0);
 });
 it('caps unknown-length streams and stops reading after the byte limit',async()=>{
  let reads=0,cancelled=false;
  const stream=new ReadableStream<Uint8Array>({pull(controller){reads++;controller.enqueue(new Uint8Array(40000));},cancel(){cancelled=true;}});
  const init={method:'POST',headers:{Origin:'https://jobvance.io','Content-Type':'text/plain','User-Agent':'Mozilla'},body:stream,duplex:'half'} as RequestInit;
  const response=await handler(new Request('https://edge.fixture.invalid',init));expect(response.status).toBe(413);expect(cancelled).toBe(true);expect(reads).toBeLessThanOrEqual(3);
 });
 it('returns an explicit ignored bot receipt without fabricated accepted rows',async()=>{
  const response=await handler(request(fixture(),{'User-Agent':'facebookexternalhit/1.1'}));expect(response.status).toBe(202);expect(await response.json()).toEqual({ignored:true,reason:'bot'});expect(state.authCalls).toHaveLength(0);expect(state.rpcCalls).toHaveLength(0);
 });
});
