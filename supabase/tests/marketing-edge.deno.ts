// Actual HTTP entry point with the real SDK; all outbound requests are intercepted.
type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const serve = Deno.serve;
Deno.serve = ((next: Handler) => { handler = next; }) as unknown as typeof Deno.serve;
if (Deno.env.get('JOBVANCE_MARKETING_UI_BUNDLE') === 'true') await import('../../docs/supabase-loop-ui/jobvance-marketing.js');
else await import('../functions/jobvance-marketing/index.ts');
Deno.serve = serve;
const owner='11111111-1111-4111-8111-111111111111';
let member = true;
let calls: {url:URL;method:string}[]=[];
const assert = (value: unknown, message: string) => { if(!value) throw new Error(message); };
function setup(){
  member=true; calls=[];
  Deno.env.set('SUPABASE_URL','https://marketing.fixture.invalid');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','fixture-service');
  Deno.env.set('ALLOWED_ORIGINS','https://jobvance.io');
  Deno.env.delete('META_ACCESS_TOKEN'); Deno.env.delete('META_AD_ACCOUNT_ID');
  globalThis.fetch=async(input:Request|string|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    calls.push({url,method:init?.method??'GET'});
    assert(url.hostname==='marketing.fixture.invalid','No actual Meta or external network is allowed.');
    if(url.pathname==='/auth/v1/user') return Response.json({id:owner,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-25T00:00:00Z'});
    if(url.pathname.endsWith('/jobvance_admin_members')){
      assert(url.searchParams.get('user_id')===`eq.${owner}`&&url.searchParams.get('active')==='eq.true','Fresh exact owner membership required.');
      return Response.json(member?{role:'owner'}:null);
    }
    if(url.pathname.endsWith('/jobvance_marketing_settings')) return Response.json({version:0,max_daily_spend_minor:300000,max_total_spend_minor:1300000,min_impressions:1500,pause_ctr_below_pct:'0.40',cost_per_lpv_ratio:'2.00',last_sync_at:null,updated_at:'2026-10-25T00:00:00Z'});
    if(url.pathname.startsWith('/rest/v1/jobvance_marketing_')) return Response.json([]);
    throw new Error('Unexpected fixture request');
  };
}
async function request(body:unknown,auth=true){return handler(new Request('https://fixture.invalid',{method:'POST',headers:{Origin:'https://jobvance.io','Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture-user'}:{})},body:JSON.stringify(body)}));}
Deno.test('marketing: unauthorized and fake scheduler have no authority',async()=>{
  setup();for(const headers of [new Headers(),new Headers({'x-marketing-cron':'fixture'})]){
    const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers,body:'{"action":"sync"}'}));
    assert(response.status===401,'No caller token must return401');
  }assert(calls.length===0,'No DB/Meta reads without a caller token');
});
Deno.test('marketing: inactive/nonmember is forbidden before marketing data reads',async()=>{
  setup();member=false;const response=await request({action:'overview'});
  assert(response.status===403,'Nonmember must return403');assert(calls.length===2,'Only identity and membership may be read');
});
Deno.test('marketing: both ad-changing actions return409 and never touch Meta',async()=>{
  setup();for(const action of ['set_status','run_auto']){const response=await request({action});assert(response.status===409&& (await response.json()).code==='MARKETING_CONTROL_DISABLED','Disabled action must return409');}
  assert(calls.every(call=>call.method==='GET'),'Only identity/membership GETs permitted');
});
Deno.test('marketing: admin can open an unconfigured honest overview',async()=>{
  setup();const response=await request({action:'overview'});const payload=await response.json();
  assert(response.status===200&&payload.overview.actor.id===owner&&!payload.overview.meta.configured,'Unconfigured workspace must open for verified owner');
  assert(calls.every(call=>call.method==='GET'),'Opening the dashboard has no writes');
});
Deno.test('marketing: disconnected sync is409 with no marketing writes',async()=>{
  setup();const response=await request({action:'sync'});assert(response.status===409&&(await response.json()).code==='META_NOT_CONFIGURED','Disconnected sync must not pretend success');
  assert(calls.every(call=>call.method==='GET'),'Disconnected sync writes nothing');
});
Deno.test('marketing: method and CORS boundaries run before auth',async()=>{
  setup();assert((await handler(new Request('https://fixture.invalid'))).status===405,'GET is405');
  const response=await handler(new Request('https://fixture.invalid',{method:'OPTIONS',headers:{Origin:'https://jobvance.io'}}));
  assert(response.status===204&&response.headers.get('access-control-allow-origin')==='https://jobvance.io','Allowed preflight');assert(calls.length===0,'No DB calls for preflight');
});
