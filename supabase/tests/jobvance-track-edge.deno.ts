// Actual entrypoint and real Supabase SDK; every outbound runtime request is intercepted.
type Handler=(request:Request)=>Promise<Response>;
let handler:Handler;
const originalServe=Deno.serve;
Deno.serve=((value:Handler)=>{handler=value;}) as unknown as typeof Deno.serve;
await import('../functions/jobvance-track/index.ts');
Deno.serve=originalServe;
const owner='11111111-1111-4111-8111-111111111111',visitor='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',batch='44444444-4444-4444-8444-444444444444',event='55555555-5555-4555-8555-555555555555',page='66666666-6666-4666-8666-666666666666';
const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message);};
let calls:{url:URL;body:Record<string,unknown>|null;authorization:string|null}[]=[];
let authStatus=200,rpcStatus=200,rpcMessage='TRACK_BATCH_CONFLICT',malformedAck=false;
function setup(){
 calls=[];authStatus=200;rpcStatus=200;rpcMessage='TRACK_BATCH_CONFLICT';malformedAck=false;
 Deno.env.set('SUPABASE_URL','https://tracking.fixture.invalid');
 Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fictional-service-only');
 Deno.env.set('ALLOWED_ORIGINS','https://preview.fixture.invalid');
 Deno.env.set('APP_URL','https://jobvance.io');
 globalThis.fetch=async(input:Request|string|URL,init?:RequestInit)=>{
  const req=input instanceof Request?input:null,url=new URL(req?.url??String(input));
  const headers=new Headers(init?.headers??req?.headers);
  const body=typeof init?.body==='string'?JSON.parse(init.body):null;
  calls.push({url,body,authorization:headers.get('authorization')});
  assert(url.origin==='https://tracking.fixture.invalid','No external or paid provider calls permitted.');
  if(url.pathname==='/auth/v1/user'){
   if(authStatus!==200)return Response.json({code:'bad_jwt',msg:'Synthetic invalid identity'}, {status:authStatus});
   return Response.json({id:owner,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-26T00:00:00.000Z'});
  }
  if(url.pathname==='/rest/v1/rpc/jobvance_track'){
   if(rpcStatus!==200)return Response.json({code:'P0001',message:rpcMessage},{status:rpcStatus});
   assert(body?.p_batch===batch&&body?.p_visitor===visitor&&body?.p_session===session,'Actual SDK body retains immutable request IDs.');
   assert(!JSON.stringify(body).includes('fictional-user-token'),'User token never reaches SQL arguments.');
   return Response.json({batchId:malformedAck?visitor:batch,accepted:1,inserted:1,duplicate:false});
  }
  throw new Error('Unexpected fixture request.');
 };
}
const body=(token:string|null=null)=>({visitorId:visitor,sessionId:session,batchId:batch,token,context:{landing:'/job-loop',utm_source:'instagram',utm_medium:'organic'},events:[{id:event,pageId:page,kind:'page_view',at:new Date().toISOString(),path:'/job-loop',title:'Jobvance'}]});
const request=(value:unknown,extra:Record<string,string>={})=>new Request('https://edge.fixture.invalid',{method:'POST',headers:{Origin:'https://jobvance.io','Content-Type':'text/plain','User-Agent':'Mozilla/5.0 Chrome/130.0',...extra},body:typeof value==='string'?value:JSON.stringify(value)});
Deno.test('track actual SDK: anonymous acknowledgement and exact scoped SQL composition',async()=>{
 setup();const response=await handler(request(body()));assert(response.status===200,'Anonymous intake accepted.');
 const ack=await response.json();assert(ack.batchId===batch&&ack.accepted===1&&ack.inserted===1&&ack.duplicate===false,'Only original matching RPC receipt is returned.');
 assert(calls.length===1&&calls[0].body?.p_user===null,'No auth round trip for anonymous intake.');
 assert(calls[0].authorization==='Bearer fictional-service-only','Only service SDK authority calls private RPC.');
});
Deno.test('track actual SDK: every supplied token is reverified and revoked token never downgrades',async()=>{
 setup();let response=await handler(request(body('fictional-user-token')));assert(response.status===200,'Verified account admitted.');
 assert(calls[0].url.pathname==='/auth/v1/user'&&calls[0].authorization==='Bearer fictional-user-token','Real SDK verifies the captured supplied token.');
 assert(calls[1].body?.p_user===owner,'Only verified returned owner is forwarded.');
 authStatus=401;response=await handler(request(body('fictional-user-token')));assert(response.status===401,'Revoked same token not cached.');
 assert(calls.length===3&&calls[2].url.pathname==='/auth/v1/user','Invalid identity makes no second SQL call.');
});
Deno.test('track actual SDK: DB conflict/unavailability and wrong ack do not report accepted counts',async()=>{
 setup();rpcStatus=400;let response=await handler(request(body()));assert(response.status===409,'Bound identity conflict is terminal.');
 rpcStatus=503;rpcMessage='database unavailable';response=await handler(request(body()));assert(response.status===503,'Unavailable SQL remains retryable failure.');
 rpcStatus=200;malformedAck=true;response=await handler(request(body()));assert(response.status===503&&(await response.json()).code==='TRACK_ACK_INVALID','Mixed or wrong receipt is rejected.');
});
Deno.test('track actual SDK: upstream auth outage does not become anonymous storage',async()=>{
 setup();authStatus=503;const response=await handler(request(body('fictional-user-token')));
 assert(response.status===503&&(await response.json()).code==='TRACK_AUTH_UNAVAILABLE','Auth upstream failure remains unavailable.');
 assert(calls.length>0&&calls.every(call=>call.url.pathname==='/auth/v1/user'),'No SQL write follows unavailable auth.');
});
Deno.test('track actual SDK: origins/method/body validation precedes all SDK calls',async()=>{
 setup();
 assert((await handler(request(body(),{Origin:'https://jobvance.io.evil.invalid'}))).status===403,'Foreign origin denied.');
 assert((await handler(new Request('https://edge.fixture.invalid',{headers:{Origin:'https://jobvance.io'}}))).status===405,'GET denied.');
 assert((await handler(request({...body(),events:[...body().events,{...body().events[0],id:'invalid'}]}))).status===400,'Mixed invalid batch rejected wholly.');
 assert((await handler(request('é'.repeat(33000),{'Content-Length':'2'}))).status===413,'Actual UTF8 bytes bounded despite forged Content-Length.');
 assert(calls.length===0,'No SDK calls before admission.');
});
Deno.test('track actual SDK: preflight/config and ignored bots are explicit without fabricated rows',async()=>{
 setup();const preflight=await handler(new Request('https://edge.fixture.invalid',{method:'OPTIONS',headers:{Origin:'https://jobvance.io'}}));
 assert(preflight.status===204&&preflight.headers.get('access-control-allow-origin')==='https://jobvance.io','Exact approved preflight.');
 let response=await handler(request(body(),{'User-Agent':'facebookexternalhit/1.1'}));assert(response.status===202&&(await response.json()).ignored===true,'Bot ignored separately from accepted receipt.');
 Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');response=await handler(request(body()));assert(response.status===503&&(await response.json()).code==='TRACK_NOT_CONFIGURED','Configuration absence is honest.');
 assert(calls.length===0,'Preflight/bot/config absence use no SDK requests.');
});
