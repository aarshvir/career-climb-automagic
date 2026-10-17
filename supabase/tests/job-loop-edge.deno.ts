// Actual Deno handler boundary, hermetic: every runtime fetch is intercepted.
type Handler=(request:Request)=>Promise<Response>;
const handlers:Handler[]=[];const originalServe=Deno.serve;
Deno.serve=((handler:Handler)=>{handlers.push(handler);return undefined;}) as unknown as typeof Deno.serve;
if(Deno.env.get('JOBVANCE_LOOP_UI_BUNDLES')==='true'){
  const bundleRoot=new URL('../../docs/supabase-loop-ui/',import.meta.url);await import(new URL('job-loop-control.js',bundleRoot).href);await import(new URL('job-loop-worker.js',bundleRoot).href);await import(new URL('job-loop-oauth.js',bundleRoot).href);
}else{await import('../functions/job-loop-control/index.ts');await import('../functions/job-loop-worker/index.ts');await import('../functions/job-loop-oauth/index.ts');}Deno.serve=originalServe;
const owner='11111111-1111-4111-a111-111111111111',runId='22222222-2222-4222-a222-222222222222';const calls:{url:string;body:Record<string,unknown>|null}[]=[];const pending:Promise<unknown>[]=[];
(globalThis as unknown as {EdgeRuntime:{waitUntil(promise:Promise<unknown>):void}}).EdgeRuntime={waitUntil:promise=>{pending.push(promise);}};
function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
let selectedFixtureRun:import('../functions/_shared/job-loop-repository.ts').RunRow|null=null;
let cvVariantReceipt:Record<string,unknown>|null=null;
let cvVariantSaveFailure:string|null=null,cvVariantEraseAfterRpc=false;
function setup(){selectedFixtureRun=null;cvVariantReceipt=null;cvVariantSaveFailure=null;cvVariantEraseAfterRpc=false;for(const [key,value] of Object.entries({SUPABASE_URL:'https://supabase.fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-only',APP_URL:'https://jobvance.fixture.invalid',ALLOWED_ORIGINS:'https://jobvance.fixture.invalid',JOB_LOOP_ENABLED:'true',JOB_LOOP_PAID_APIS_ENABLED:'false',JOB_LOOP_GMAIL_ENABLED:'false'}))Deno.env.set(key,value);Deno.env.delete('JOB_LOOP_WORKER_SECRET');calls.length=0;pending.length=0;writeFailure=false;existingLifecycleAbsent=false;existingRecordAbsent=false;record.version=0;record.input_version=0;record.data={profile:null,claims:[],opportunities:[],inbox:[]};}
let writeFailure=false;
let existingLifecycleAbsent=false,existingRecordAbsent=false;
let maintenanceTicketValid=false;
let maintenanceFile=false,maintenanceClaimed=false,maintenanceRemoved=false;
let maintenanceToken='';
const maintenancePath=`${owner}/33333333-3333-4333-a333-333333333333/${'a'.repeat(64)}/txt`;
let lifecycle:{state:'active'|'erasing'|'erased';generation:number}={state:'active',generation:0};
const record:import('../functions/_shared/job-loop-repository.ts').RecordRow={user_id:owner,version:0,input_version:0,data:{profile:null,claims:[],opportunities:[],inbox:[]},updated_at:'2026-10-11T00:00:00Z'};
globalThis.fetch=async(input:Request|string|URL,init?:RequestInit)=>{
  const url=new URL(input instanceof Request?input.url:String(input));const body=typeof init?.body==='string'?JSON.parse(init.body):null;calls.push({url:url.href,body});
  if(url.hostname!=='supabase.fixture.invalid')throw new Error('A real or paid endpoint is blocked in this test.');
  if(url.pathname==='/rest/v1/rpc/job_loop_gc_consume_ticket'){assert(body?.p_ticket==='a2d317db-7aac-4444-a074-489ef031d278','Maintenance consumes only its dedicated credential.');const valid=maintenanceTicketValid;maintenanceTicketValid=false;return Response.json(valid);}
  if(url.pathname==='/rest/v1/rpc/job_loop_gc_claim'){assert(body?.p_limit===200&&typeof body.p_token==='string','Maintenance uses a server-bounded claim.');if(maintenanceFile&&!maintenanceClaimed){maintenanceClaimed=true;maintenanceToken=body.p_token;return Response.json([{user_id:owner,path:maintenancePath,generation:0,token:body.p_token}]);}return Response.json([]);}
  if(url.pathname==='/storage/v1/object/job-loop-artifacts'){assert(init?.method==='DELETE'&&JSON.stringify(body?.prefixes)===JSON.stringify([maintenancePath]),'Storage removal uses the fixed bucket and exact server-claimed path.');maintenanceRemoved=true;return Response.json([{name:maintenancePath}]);}
  if(url.pathname==='/rest/v1/rpc/job_loop_gc_finish'){assert(maintenanceRemoved&&body?.p_user===owner&&body.p_generation===0&&body.p_token===maintenanceToken&&JSON.stringify(body.p_paths)===JSON.stringify([maintenancePath]),'Exact claim is settled only after Storage response.');maintenanceFile=false;return Response.json(1);}
  if(url.pathname==='/auth/v1/user'){if(new Headers(init?.headers).get('Authorization')!=='Bearer fixture-user')return Response.json({error:'invalid'},{status:401});return Response.json({id:owner,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-11T00:00:00Z'});}
  if(url.pathname==='/rest/v1/rpc/job_loop_erasure_status'){assert(body?.p_user===owner,'Lifecycle read binds authenticated owner.');return Response.json(lifecycle);}
  if(url.pathname==='/rest/v1/rpc/job_loop_assert_generation'){assert(body?.p_user===owner,'Generation guard binds authenticated owner.');return body?.p_generation===lifecycle.generation?Response.json(null):Response.json({message:'LOOP_REQUEST_STALE'},{status:400});}
  if(['/rest/v1/rpc/job_loop_open_record','/rest/v1/rpc/job_loop_read_record'].includes(url.pathname)){assert(body?.p_user===owner,'Atomic record read binds authenticated owner.');return Response.json({...record,lifecycle_generation:lifecycle.generation});}
  if(url.pathname==='/rest/v1/job_loop_lifecycle'){assert(url.searchParams.get('user_id')===`eq.${owner}`&&!body,'Passive lifecycle read binds owner without creating metadata.');return Response.json(existingLifecycleAbsent?null:{...lifecycle,user_id:owner});}
  if(url.pathname==='/rest/v1/rpc/job_loop_save_cv_variant_bound'){
    assert(body?.p_user===owner&&body.p_generation===lifecycle.generation,'Variant save derives the authenticated owner and retains the original lifetime.');
    assert(body.p_request==='66666666-6666-4666-a666-666666666666'&&body.p_expected===1&&body.p_variant===null&&body.p_variant_expected===0&&body.p_save_consent===true,'Variant save sends the captured original intent to the atomic RPC.');
    assert(JSON.stringify(body.p_claims)===JSON.stringify([{id:'claim-one',revision:1}])&&typeof body.p_profile==='object'&&body.p_label==='Operations CV','Variant references, profile and label reach the actual SDK HTTP body.');
    if(cvVariantSaveFailure)return Response.json({message:cvVariantSaveFailure,code:'P0001'},{status:400});
    if(cvVariantReceipt){if(cvVariantEraseAfterRpc)lifecycle={state:'erasing',generation:lifecycle.generation+1};return Response.json({...cvVariantReceipt,recordVersion:record.version,reused:true});}
    const sourceHash='b'.repeat(64),variant={id:'77777777-7777-4777-a777-777777777777',generation:lifecycle.generation,revision:1,label:body.p_label,profile:structuredClone(body.p_profile),claims:structuredClone(record.data.claims),sourceHash,createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z'};
    record.version++;
    cvVariantReceipt={variant,recordVersion:record.version,requestId:body.p_request,requestHash:'a'.repeat(64),sourceHash,savedRevision:1,reused:false};
    if(cvVariantEraseAfterRpc)lifecycle={state:'erasing',generation:lifecycle.generation+1};
    return Response.json(cvVariantReceipt);
  }
  if(url.pathname==='/rest/v1/rpc/job_loop_read_cv_variants_bound'){
    assert(body?.p_user===owner&&body.p_generation===lifecycle.generation,'Variant read derives owner and binds the original generation.');
    const response={generation:lifecycle.generation,recordVersion:record.version,variants:cvVariantReceipt?[cvVariantReceipt.variant]:[]};
    if(cvVariantEraseAfterRpc)lifecycle={state:'erasing',generation:lifecycle.generation+1};
    return Response.json(response);
  }
  if(url.pathname==='/rest/v1/job_loop_records'){assert(url.searchParams.get('user_id')===`eq.${owner}`||body?.user_id===owner,'Every record query binds the authenticated owner.');return init?.method==='POST'?new Response(null,{status:201}):Response.json(existingRecordAbsent?null:record);}
  if(url.pathname==='/rest/v1/job_loop_runs'&&selectedFixtureRun){assert(url.searchParams.get('user_id')===`eq.${owner}`,'Selected run reads derive owner.');return Response.json(url.searchParams.has('request_id')?selectedFixtureRun:[selectedFixtureRun]);}
  if(url.pathname==='/rest/v1/job_loop_runs'&&url.searchParams.has('request_id'))return Response.json(null);
  if(url.pathname==='/rest/v1/rpc/job_loop_start_selected_run_bound'){
    assert(body?.p_user===owner&&body.p_generation===lifecycle.generation&&JSON.stringify(body.p_selected)===JSON.stringify([record.data.opportunities[2].id]),'Atomic selected admission retains exact third vacancy and owner/lifetime.');
    assert(body.p_expected===record.version&&(body.p_consents as {inbox:boolean}).inbox===false&&/^[a-f0-9]{64}$/.test(String(body.p_request_hash)),'Version, restricted consent and server-derived fingerprint supplied.');
    selectedFixtureRun??={id:runId,user_id:owner,request_id:String(body.p_request),request_hash:String(body.p_request_hash),input_hash:String(body.p_input_hash),input_version:record.input_version,selected_generation:lifecycle.generation,selected_opportunity_ids:body.p_selected as string[],snapshot:structuredClone(record.data),provider:'rules',model:'grounded-rules-v1',consents:{model:false,inbox:false},data:{},status:'queued',phase:0,lease_token:null,lease_until:null,created_at:'2026-10-16T00:00:00Z',finished_at:null};
    return Response.json(selectedFixtureRun);
  }
  if(url.pathname==='/functions/v1/job-loop-worker'){assert(body?.runId===runId,'Dispatch retains exact persisted run.');return Response.json({accepted:true},{status:202});}
  if(['/rest/v1/job_loop_runs','/rest/v1/job_loop_packets','/rest/v1/job_loop_usage','/rest/v1/job_loop_connections','/rest/v1/job_loop_schedules','/rest/v1/job_loop_activity','/rest/v1/job_loop_support_requests'].includes(url.pathname)){assert(url.searchParams.get('user_id')===`eq.${owner}`,'Collection must bind owner.');return Response.json([]);}
  if(url.pathname==='/rest/v1/rpc/job_loop_budget_snapshot'){assert(body?.p_user===owner&&body?.p_cap_micros===50000000,'Budget read binds the authenticated owner and ceiling.');return Response.json({month:'2026-10',capUsd:50,committedUsd:0,remainingUsd:50,scope:'shared_ai_search',maxPilotUsers:10,enrolled:false,activeUsers:0,maxUsers:10});}
  if(url.pathname==='/rest/v1/rpc/job_loop_scheduler_state')return Response.json({ready:false,lastDispatchAt:null});
  if(url.pathname==='/rest/v1/rpc/job_loop_link_saved_check'){
    assert(body?.p_user===owner&&body.p_generation===lifecycle.generation&&body.p_link_consent===true,'Link uses verified owner, captured lifetime and explicit consent.');
    assert(body.p_check==='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','Only the exact fixture check is linked.');
    const prior=record.data.opportunities.find(item=>item.sourceCheckId===body.p_check);
    if(prior)return Response.json({record,opportunityId:prior.id,reused:true});
    assert(body.p_expected===record.version,'First link retains expected version.');
    const opportunity={...body.p_opportunity as import('../functions/_shared/job-loop-types.ts').LoopOpportunityInput,id:'33333333-3333-4333-a333-333333333333',sourceCheckId:body.p_check as string,source:'manual' as const,sourceKey:`saved-check:${body.p_check}`,checkedAt:'2026-10-15T00:00:00Z',verification:'user_provided' as const,status:'saved' as const,notes:'',followUpAt:null};
    record.data.opportunities.push(opportunity);record.version++;record.input_version++;
    return Response.json({record,opportunityId:opportunity.id,reused:false});
  }
  if(url.pathname==='/rest/v1/rpc/job_loop_claim_run'){assert(body?.p_run===runId,'Internal run reference is bound.');return Response.json(null);}
  if(url.pathname==='/rest/v1/rpc/job_loop_write_record'){
    assert(body?.p_user===owner&&body.p_expected===record.version,'Claim write binds its authenticated owner and expected version.');
    if(writeFailure)return Response.json({message:'PRIVATE_DATABASE_ERROR_MUST_NOT_RETURN',code:'XX000'},{status:500});
    record.data=body.p_data as typeof record.data;record.version++;record.input_version++;return Response.json(record);
  }
  throw new Error('Unexpected request blocked by hermetic handler fixture.');
};
const req=(body:unknown,authorization:string|null='Bearer fixture-user')=>new Request('https://edge.fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify(body)});
Deno.test('control rejects absent/invalid identity and caller-supplied owner before persistence',async()=>{
  setup();assert((await handlers[0](req({action:'get'},null))).status===401,'Missing auth rejected.');assert(calls.length===0,'No persistence without auth.');
  assert((await handlers[0](req({action:'get'},'Bearer invalid'))).status===401,'Invalid user rejected.');calls.length=0;
  assert((await handlers[0](req({action:'get',userId:'forged'}))).status===400,'Privileged payload rejected.');assert(calls.every(call=>call.url.includes('/auth/v1/user')),'No persistence for privileged payload.');
});
Deno.test('snapshot remains available with no model/mail/search keys and no paid calls',async()=>{
  setup();const response=await handlers[0](req({action:'get'}));assert(response.status===200,'Authenticated snapshot succeeds.');const body=await response.json();assert(body.snapshot.recordVersion===0,'Initial real record version.');assert(body.snapshot.capabilities.rulesEngine===true&&body.snapshot.capabilities.dailyRunLimit===3,'Rules capability and cap declared.');assert(body.snapshot.models.every((model:{ready:boolean})=>!model.ready),'No paid model is claimed ready.');assert(body.snapshot.gmail.connected===false,'Sign-in is not mailbox connection.');assert(calls.every(call=>call.url.startsWith('https://supabase.fixture.invalid/')),'Only fixture persistence/auth calls.');
});
Deno.test('actual saved-check link handler composes atomic RPC and returns exact retry identity without preparation',async()=>{
  setup();lifecycle={state:'active',generation:0};
  const action={action:'link_saved_check',expectedGeneration:0,expectedVersion:0,checkId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',linkConsent:true,opportunity:{title:'Analyst',company:'Example employer',location:'Dubai',url:'https://example.test/job',description:'Review customer research, document evidence and prepare reports for the product team.',contact:null}};
  const first=await handlers[0](req(action)),body=await first.json();
  assert(first.status===200&&body.checkLink.checkId===action.checkId&&!body.checkLink.reused,'First link has exact receipt.');
  const retry=await handlers[0](req(action)),again=await retry.json();
  assert(retry.status===200&&again.checkLink.opportunityId===body.checkLink.opportunityId&&again.checkLink.reused,'Lost-response retry returns the same opportunity.');
  assert(again.snapshot.opportunities.length===1&&again.snapshot.opportunities[0].sourceCheckId===action.checkId,'Exact provenance survives the handler response.');
  assert(!calls.some(call=>/open_record|write_record|start_run|reserve|storage/.test(new URL(call.url).pathname)),'No initialization, generic record rewrite, preparation, spend or upload.');
});
Deno.test('actual saved-check handler refuses missing consent, forged authority and stale generation before link persistence',async()=>{
  setup();lifecycle={state:'active',generation:7};
  const action={action:'link_saved_check',expectedGeneration:7,expectedVersion:0,checkId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',linkConsent:true,opportunity:{title:'Analyst',company:'Example employer',location:'Dubai',url:'https://example.test/job',description:'Review customer research, document evidence and prepare reports for the product team.',contact:null}};
  for(const patch of [{linkConsent:false},{userId:'another-owner'},{expectedGeneration:undefined},{opportunity:{...action.opportunity,sourceCheckId:action.checkId}}])assert((await handlers[0](req({...action,...patch}))).status===400,'Invalid link payload rejected.');
  assert((await handlers[0](req({...action,expectedGeneration:0}))).status===409,'Old generation rejected.');
  assert(!calls.some(call=>/link_saved_check|open_record|write_record/.test(call.url)),'No rejected request reaches a link or record mutation.');
  lifecycle={state:'active',generation:0};
});
Deno.test('passive home read uses authenticated owner, requires no caller authority and rejects forged fields',async()=>{
  setup();lifecycle={state:'active',generation:0};
  assert((await handlers[0](req({action:'get_existing'},null))).status===401,'No identity cannot inspect existing work.');assert(calls.length===0,'No query without identity.');
  assert((await handlers[0](req({action:'get_existing',userId:'forged'}))).status===400,'Caller cannot select another owner.');assert(calls.every(call=>call.url.includes('/auth/v1/user')),'Forged owner never reaches records.');
  calls.length=0;const response=await handlers[0](req({action:'get_existing'})),body=await response.json();
  assert(response.status===200&&body.existingState==='active'&&body.snapshot.lifecycleGeneration===0,'Existing active snapshot is bound to the current lifetime.');
  assert(!calls.some(call=>/open_record|erasure_status|assert_generation|enroll|storage/.test(call.url)),'No initialization, lifecycle-creating guard, enrollment or Storage.');
  assert(calls.every(call=>call.url.startsWith('https://supabase.fixture.invalid/')),'No model, mailbox or search call.');
});
Deno.test('passive home read distinguishes missing and erased work from an active empty snapshot without initializing',async()=>{
  for(const state of ['missing','erased'] as const){
    setup();existingLifecycleAbsent=state==='missing';existingRecordAbsent=true;lifecycle={state:state==='erased'?'erased':'active',generation:2};
    const response=await handlers[0](req({action:'get_existing'})),body=await response.json();
    assert(response.status===200&&body.existingState==='absent'&&!body.snapshot,'Absent records are not a fabricated empty saved workspace.');
    assert(!calls.some(call=>/\/rpc\/|job_loop_pilot|storage/.test(call.url)),'Absence never opens, enrolls or calls operational RPCs.');
  }
  lifecycle={state:'active',generation:0};
});
Deno.test('passive home read exposes only erasure continuation state while cleanup is incomplete',async()=>{
  setup();lifecycle={state:'erasing',generation:3};const response=await handlers[0](req({action:'get_existing'})),body=await response.json();
  assert(response.status===200&&body.existingState==='erasing'&&body.erasureGeneration===3&&!body.snapshot,'No private snapshot while erasing.');
  assert(!calls.some(call=>/\/rpc\/|job_loop_records|storage/.test(call.url)),'No private read, cleanup or activation occurs.');lifecycle={state:'active',generation:0};
});
Deno.test('actual handler rejects stale or generationless permission intents before opening a new workspace',async()=>{
  setup();lifecycle={state:'active',generation:2};
  const response=await handlers[0](req({action:'gmail_disconnect',expectedGeneration:0}));const body=await response.json();
  assert(response.status===409&&body.code==='LOOP_REQUEST_STALE','Old disconnect cannot affect a fresh workspace.');
  assert(!calls.some(call=>/job_loop_open_record|job_loop_disconnect_gmail/.test(call.url)),'Rejected intent neither opens nor mutates records.');
  calls.length=0;const legacy=await handlers[0](req({action:'erase_loop',confirmErase:true}));
  assert(legacy.status===400,'Old generationless erase requires a refreshed interface.');assert(calls.every(call=>call.url.includes('/auth/v1/user')),'Legacy erase never reaches persistence.');
  lifecycle={state:'active',generation:0};
});
Deno.test('erasure-only read is refresh-safe and never activates or deletes a candidate record',async()=>{
  setup();lifecycle={state:'erasing',generation:1};const response=await handlers[0](req({action:'get'}));const body=await response.json();
  assert(response.status===200&&body.erasureGeneration===1&&!body.snapshot,'Authenticated continuation gets the exact erasure generation.');
  assert(!calls.some(call=>/job_loop_open_record|begin_erase|storage/.test(call.url)),'A continuation read performs no activation or deletion.');lifecycle={state:'active',generation:0};
});
Deno.test('actual handler distinguishes correctable source/context 422, database 503 and a valid claim save',async()=>{
  setup();const quote='Bachelor of Business Administration completed at Generated QA University in 2026.',context='Generated QA University | 2026';
  record.version=1;record.input_version=1;record.data.profile={audience:'student',name:'Fictional Candidate',contactLine:'',targetTitles:['Graduate analyst'],locations:[],experienceYears:null,languages:[],pageTarget:1,discreetSearch:true,sourceText:['Fictional candidate, not a real job seeker.','EDUCATION',context,quote].join('\n'),excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-13T00:00:00Z'};
  const claim={sourceKind:'cv_passage',sourceQuote:quote,phrasing:quote,context,kind:'education',resultStatus:'not_measured',confirmed:true,shareable:true};
  const rejected=await handlers[0](req({action:'save_claim',expectedVersion:1,claim:{...claim,context:'Missing literal source header'}}));const rejectedBody=await rejected.json();
  assert(rejected.status===422&&rejectedBody.code==='LOOP_CLAIM_INVALID','Correctable context returns a public 422.');assert(!JSON.stringify(rejectedBody).includes(quote)&&!JSON.stringify(rejectedBody).includes(context),'Validation response never echoes source facts or context.');assert(!calls.some(call=>call.url.endsWith('/rpc/job_loop_write_record')),'Invalid provenance never writes.');
  writeFailure=true;const unavailable=await handlers[0](req({action:'save_claim',expectedVersion:1,claim}));const unavailableBody=await unavailable.json();
  assert(unavailable.status===503&&unavailableBody.code==='LOOP_PERSISTENCE_FAILED','Persistence failure remains a public 503.');assert(!JSON.stringify(unavailableBody).includes('PRIVATE_DATABASE_ERROR'),'Database internals never return.');
  writeFailure=false;const saved=await handlers[0](req({action:'save_claim',expectedVersion:1,claim}));const savedBody=await saved.json();
  assert(saved.status===200&&savedBody.snapshot.claims.length===1&&savedBody.snapshot.claims[0].confirmed===true&&savedBody.snapshot.claims[0].sourceQuote===quote,'A valid source-bound claim still saves unchanged.');assert(calls.every(call=>call.url.startsWith('https://supabase.fixture.invalid/')),'Every request remains hermetic and no provider is called.');
});
Deno.test('worker rejects candidate credentials and returns accepted while owned background work completes independently',async()=>{
  setup();assert((await handlers[1](req({runId}))).status===401,'Candidate token cannot run internal worker.');assert(calls.length===0,'No worker persistence before internal auth.');
  assert((await handlers[1](req({runId},'Bearer fixture-service-only'))).status===202,'Internal invocation accepted.');assert(pending.length===1,'Work registered with waitUntil, independent of browser.');await Promise.all(pending);assert(calls.some(call=>call.url.includes('/rpc/job_loop_claim_run')),'Actual stage lease claim attempted.');
});
Deno.test('worker denies body owner injection and OAuth cannot choose an arbitrary return target',async()=>{
  setup();assert((await handlers[1](req({runId,userId:owner},'Bearer fixture-service-only'))).status===400,'Worker accepts runId only.');assert(calls.length===0,'No forged worker persistence.');
  const response=await handlers[2](new Request('https://edge.fixture.invalid?return_url=https://evil.example.com'));assert(response.status===303,'Missing code returns fixed application route.');assert(response.headers.get('Location')==='https://jobvance.fixture.invalid/loop?gmail=unavailable','Return target is operator configured, never caller supplied.');assert(calls.length===0,'No OAuth exchange without state/code.');
});
Deno.test('maintenance is purpose-ticket-only and runs with preparation disabled without provider or Storage calls',async()=>{
  setup();Deno.env.set('JOB_LOOP_ENABLED','false');
  for(const authority of ['Bearer fixture-user','Bearer fixture-service-only']){assert((await handlers[1](req({action:'artifact_gc'},authority))).status===401,'Candidate and ordinary worker credentials cannot authorize maintenance.');}
  assert(calls.length===0,'Rejected authorities never reach persistence.');
  const maintenance=(body:unknown)=>new Request('https://edge.fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json','x-job-loop-maintenance-ticket':'a2d317db-7aac-4444-a074-489ef031d278'},body:JSON.stringify(body)});
  maintenanceTicketValid=true;
  assert((await handlers[1](maintenance({action:'artifact_gc',userId:owner}))).status===400,'Owner overrides rejected before consuming a ticket.');assert(calls.length===0,'No forged collection reaches persistence.');
  assert((await handlers[1](maintenance({action:'artifact_gc'}))).status===202,'Dedicated maintenance accepted independently of preparation readiness.');
  await Promise.all(pending);assert(calls.some(call=>call.url.endsWith('/rpc/job_loop_gc_claim')),'Bounded claim executed.');
  assert(calls.every(call=>/\/rpc\/job_loop_gc_(consume_ticket|claim)$/.test(new URL(call.url).pathname)),'No model, search, mailbox, preparation, or Storage requests for an empty/disabled collection.');
  assert((await handlers[1](maintenance({action:'artifact_gc'}))).status===401,'A consumed ticket cannot replay.');
});
Deno.test('actual maintenance handler composes a validated claim, exact Storage HTTP removal and guarded settlement',async()=>{
  setup();Deno.env.set('JOB_LOOP_ENABLED','false');maintenanceTicketValid=true;maintenanceFile=true;maintenanceClaimed=false;maintenanceRemoved=false;
  const response=await handlers[1](new Request('https://edge.fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json','x-job-loop-maintenance-ticket':'a2d317db-7aac-4444-a074-489ef031d278'},body:JSON.stringify({action:'artifact_gc'})}));
  assert(response.status===202,'Dedicated maintenance accepted.');await Promise.all(pending);
  assert(maintenanceRemoved&&!maintenanceFile,'Fixture HTTP removal and exact bound settlement completed.');
  assert(calls.filter(call=>call.url.includes('/storage/')).length===1&&calls.filter(call=>call.url.endsWith('/rpc/job_loop_gc_finish')).length===1,'One exact removal and one guarded settlement.');
  assert(calls.every(call=>call.url.includes('/rpc/job_loop_gc_')||call.url.endsWith('/storage/v1/object/job-loop-artifacts')),'No candidate preparation, model, search, email or other bucket request.');
  maintenanceFile=false;maintenanceClaimed=false;maintenanceRemoved=false;
});
Deno.test('actual Deno phase composes and renders grounded student artifacts without provider calls',async()=>{
  setup();const {processLoopPhase}=await import('../functions/_shared/job-loop-runtime.ts');const {digest}=await import('../functions/_shared/job-loop-providers.ts');
  const opportunity={id:'33333333-3333-4333-a333-333333333333',title:'Graduate analyst',company:'Fictional employer',location:'',url:'https://careers.example.com/graduate',description:'A graduate role whose requested domain differs from the supplied academic coursework. Review the source evidence and the explicit gaps.',contact:null,source:'manual' as const,sourceKey:'manual:one',checkedAt:'2026-10-11T00:00:00Z',verification:'user_provided' as const,status:'saved' as const,followUpAt:null,notes:''};
  const profile={audience:'student' as const,name:'Fictional Candidate',contactLine:'',targetTitles:['Graduate analyst'],locations:[],experienceYears:null,languages:[],pageTarget:1 as const,discreetSearch:false,sourceText:'Academic project\nCoursework report\nPrepared a coursework report about fictional retail operations and documented assumptions.',excludedTerms:[],compensation:{currency:'',period:'monthly' as const,minimum:null},revision:1,updatedAt:'2026-10-11T00:00:00Z'};
  const claims=[{id:'claim-one',revision:1,status:'active' as const,createdAt:profile.updatedAt,sourceKind:'cv_passage' as const,sourceQuote:'Prepared a coursework report about fictional retail operations and documented assumptions.',phrasing:'Prepared a coursework report about fictional retail operations and documented assumptions.',context:'Coursework report',kind:'academic_project' as const,resultStatus:'not_measured' as const,confirmed:true,shareable:true}];
  const lease=crypto.randomUUID();const run={id:runId,user_id:owner,request_id:runId,request_hash:'a'.repeat(64),input_hash:'a'.repeat(64),input_version:1,snapshot:{profile,claims,opportunities:[opportunity],inbox:[]},provider:'rules' as const,model:'grounded-rules-v1',consents:{model:false,inbox:false},data:{opportunities:[opportunity],lanes:[],messages:[],packetIds:[]},status:'running' as const,phase:2,lease_token:lease,lease_until:null,created_at:profile.updatedAt,finished_at:null};
  const packets:import('../functions/_shared/job-loop-types.ts').LoopPacket[]=[];let pdf:Uint8Array|undefined;
  const repo={claimRun:async()=>run,record:async()=>({user_id:owner,version:1,input_version:1,data:run.snapshot,updated_at:profile.updatedAt}),upload:async(active:typeof run,packet:string,key:string,bytes:Uint8Array)=>{assert(active.user_id===owner&&active.lease_token===lease,'Uploads retain the current owner and stage lease.');if(key==='pdf')pdf=bytes;return `${active.user_id}/${packet}/${await digest(bytes)}/${key}`;},commit:async(_run:unknown,_phase:number,_status:string,_data:unknown,built:typeof packets=[])=>{packets.push(...built);return run;}} as unknown as import('../functions/_shared/job-loop-repository.ts').LoopRepository;
  assert(await processLoopPhase(repo,runId,()=>undefined),'A rendered packet checkpoint asks for the next stage.');assert(packets.length===1&&packets[0].status==='review_required'&&packets[0].pageCount===1,'Actual Deno renderer produces a one-page reviewable packet.');assert(pdf&&new TextDecoder().decode(pdf.slice(0,5))==='%PDF-','Actual PDF bytes are generated.');assert(packets[0].cvText.includes('ACADEMIC PROJECTS'),'Academic context survives.');assert(calls.length===0,'No paid/external runtime request occurred.');
});

Deno.test('actual selected preparation handler binds third vacancy, server hashes and retry scope',async()=>{
 setup();lifecycle={state:'active',generation:7};record.version=1;record.input_version=1;
 const quote='Prepared an academic operations report and documented its assumptions.';
 record.data.profile={audience:'student',name:'Example Candidate',contactLine:'',targetTitles:['Analyst'],locations:[],experienceYears:null,languages:[],pageTarget:1,discreetSearch:false,sourceText:'Academic project\n'+quote,excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-16T00:00:00Z'};
 record.data.claims=[{id:'claim-one',revision:1,status:'active',createdAt:'2026-10-16T00:00:00Z',sourceKind:'cv_passage',sourceQuote:quote,phrasing:quote,context:'Academic project',kind:'academic_project',resultStatus:'not_measured',confirmed:true,shareable:true}];
 const ids=['33333333-3333-4333-a333-333333333333','44444444-4444-4444-a444-444444444444','55555555-5555-4555-a555-555555555555'];
 record.data.opportunities=ids.map((id,i)=>({id,title:`Analyst ${i}`,company:'Example employer',location:'',url:`https://example.invalid/${i}`,description:'Review source evidence and prepare reports. This created vacancy contains sufficient text for bounded preparation.',contact:null,source:'manual',sourceKey:`manual:${id}`,checkedAt:'2026-10-16T00:00:00Z',verification:'user_provided',status:'saved',followUpAt:null,notes:''}));
 const action={action:'start_selected_run',expectedGeneration:7,expectedVersion:1,requestId:runId,opportunityIds:[ids[2]],prepareConsent:true,provider:'rules',model:'grounded-rules-v1',modelConsent:false};
 for(const patch of [{prepareConsent:false},{inboxConsent:true},{userId:owner},{opportunityIds:[ids[2],ids[2]]}])assert((await handlers[0](req({...action,...patch}))).status===400,'Unsafe selected intent rejected.');
 assert(!calls.some(c=>c.url.includes('start_selected_run')),'Invalid inputs never admit a run.');
 const first=await handlers[0](req(action));assert(first.status===200,'Selected handler succeeds.');const firstBody=await first.json();assert(firstBody.selectedRun.runId===runId&&firstBody.snapshot.runs[0].selection.opportunityIds[0]===ids[2],'Exact selection is returned through receipt and snapshot.');
 record.data.opportunities[2].notes='Keep later progress';record.data.opportunities[2].status='applied';
 const retry=await handlers[0](req(action));assert(retry.status===200,'Same request retains later progress.');const next=await retry.json();assert(next.selectedRun.runId===runId&&next.snapshot.opportunities[2].notes==='Keep later progress','Retry does not replace the application.');
 assert(calls.every(c=>new URL(c.url).hostname==='supabase.fixture.invalid'),'No real provider or customer request.');
 lifecycle={state:'active',generation:0};
});

function cvVariantAction(){
  setup();lifecycle={state:'active',generation:7};record.version=1;record.input_version=1;
  const quote='Prepared an operations report and documented its assumptions.';
  const profile={audience:'professional' as const,name:'Example Candidate',contactLine:'',targetTitles:['Operations analyst'],locations:['Dubai'],experienceYears:null,languages:['English'],pageTarget:1 as const,discreetSearch:true,sourceText:'Example Candidate\nEXPERIENCE\nExample employer\n'+quote,excludedTerms:[],compensation:{currency:'',period:'monthly' as const,minimum:null}};
  record.data.profile={...profile,revision:1,updatedAt:'2026-10-17T00:00:00Z'};
  record.data.claims=[{id:'claim-one',revision:1,status:'active',createdAt:'2026-10-17T00:00:00Z',sourceKind:'cv_passage',sourceQuote:quote,phrasing:quote,context:'Example employer',kind:'employment',resultStatus:'not_measured',confirmed:true,shareable:true}];
  return {action:'save_cv_variant',expectedGeneration:7,expectedVersion:1,requestId:'66666666-6666-4666-a666-666666666666',variantId:null,expectedVariantRevision:0,label:'Operations CV',profile,claimRefs:[{id:'claim-one',revision:1}],saveConsent:true};
}
function assertVariantOnlyCalls(){
  assert(calls.every(call=>new URL(call.url).hostname==='supabase.fixture.invalid'),'Every variant request uses intercepted fixture HTTP only.');
  assert(!calls.some(call=>/\/functions\/|open_record|write_record|start_.*run|reserve|\/storage\/|job_loop_(packets|usage|connections|schedules|pilot|runs)/.test(new URL(call.url).pathname)),'Variant actions never initialize work, dispatch a worker, spend, upload, prepare or approve a CV.');
  assert(pending.length===0,'No worker background task was scheduled.');
}
Deno.test('actual variant save/read handlers derive owner and compose exact source receipt without preparation',async()=>{
  const action=cvVariantAction(),before=JSON.stringify(record.data);
  const response=await handlers[0](req(action)),body=await response.json();
  assert(response.status===200&&body.variantSave.generation===7&&body.variantSave.requestId===action.requestId&&!body.variantSave.reused,'Variant save returns the original generation/request receipt.');
  assert(body.variantSave.recordVersion===2&&body.variantSave.savedRevision===1&&body.variantSave.variant.profile.sourceText===action.profile.sourceText,'Saved revision and exact reviewed source remain available.');
  assert(JSON.stringify(record.data)===before&&record.input_version===1,'Fixture save advances record ordering only, not source or preparation input.');
  const read=await handlers[0](req({action:'read_cv_variants',expectedGeneration:7})),readBody=await read.json();
  assert(read.status===200&&readBody.cvVariants.generation===7&&readBody.cvVariants.recordVersion===2&&readBody.cvVariants.variants.length===1,'Bound read returns one exact current variant.');
  assert(readBody.cvVariants.variants[0].id===body.variantSave.variant.id&&readBody.cvVariants.variants[0].claims[0].id==='claim-one','The response retains variant and source-fact identity.');
  assertVariantOnlyCalls();lifecycle={state:'active',generation:0};
});
Deno.test('actual variant retry retains its original intent after later source and record edits',async()=>{
  const action=cvVariantAction();const first=await handlers[0](req(action));assert(first.status===200,'Initial variant save succeeds.');
  record.version=5;record.input_version=2;record.data.profile!.sourceText='A later independent source edit';record.data.claims[0].revision=2;record.data.claims[0].confirmed=false;
  const response=await handlers[0](req(action)),body=await response.json();
  assert(response.status===200&&body.variantSave.reused&&body.variantSave.recordVersion===5&&body.variantSave.savedRevision===1,'Lost-response retry reaches the atomic receipt with the original version.');
  assert(body.variantSave.variant.profile.sourceText===action.profile.sourceText&&record.data.profile!.sourceText==='A later independent source edit','Retry exposes the original saved variant without restoring stale workspace content.');
  assert(calls.filter(call=>call.url.endsWith('/rpc/job_loop_save_cv_variant_bound')).length===2,'Both attempts reach bound atomic save rather than guessing success client-side.');
  assertVariantOnlyCalls();lifecycle={state:'active',generation:0};
});
Deno.test('actual variant handlers reject missing identity, forged ownership, consent and generation before variant access',async()=>{
  const action=cvVariantAction();
  assert((await handlers[0](req(action,null))).status===401,'Save requires authentication.');
  assert((await handlers[0](req({action:'read_cv_variants',expectedGeneration:7},null))).status===401,'Read requires authentication.');
  assert(calls.length===0,'No persistence without identity.');
  for(const patch of [{userId:owner},{saveConsent:false},{saveConsent:'true'},{expectedGeneration:undefined},{expectedVariantRevision:1},{claimRefs:[{id:'claim-one',revision:1,confirmed:true}]}])assert((await handlers[0](req({...action,...patch}))).status===400,'Forged or incomplete save intent is rejected.');
  for(const input of [{action:'read_cv_variants',expectedGeneration:7,userId:owner},{action:'read_cv_variants'}])assert((await handlers[0](req(input))).status===400,'Read cannot choose owner or omit its original lifetime.');
  assert(calls.every(call=>call.url.endsWith('/auth/v1/user')),'Structurally invalid requests never access stored source or variants.');
  assert((await handlers[0](req({...action,expectedGeneration:6}))).status===409,'Stale save generation fails closed.');
  assert((await handlers[0](req({action:'read_cv_variants',expectedGeneration:6}))).status===409,'Stale read generation fails closed.');
  assert(!calls.some(call=>/job_loop_(save|read)_cv_variants?_bound/.test(call.url)),'Stale generation never reaches variant SQL.');
  assertVariantOnlyCalls();lifecycle={state:'active',generation:0};
});
Deno.test('actual variant handler returns a public conflict when atomic save rejects a stale variant revision',async()=>{
  const action=cvVariantAction();cvVariantSaveFailure='LOOP_VARIANT_REVISION_CONFLICT';
  const response=await handlers[0](req(action)),body=await response.json();
  assert(response.status===409&&body.code==='LOOP_VARIANT_REVISION_CONFLICT','Atomic revision conflict has its intended public response.');
  assert(!body.variantSave&&!JSON.stringify(body).includes(action.profile.sourceText),'A rejection never returns an apparently saved variant or private source text.');
  assert(record.version===1&&cvVariantReceipt===null,'Rejected fixture save produces no receipt or record change.');
  assertVariantOnlyCalls();lifecycle={state:'active',generation:0};
});
Deno.test('actual variant save and read discard returned source when erasure wins before response publication',async()=>{
  for(const mode of ['save','read']){
    const action=cvVariantAction();
    if(mode==='read')assert((await handlers[0](req(action))).status===200,'Read race begins with a saved fixture variant.');
    cvVariantEraseAfterRpc=true;
    const response=await handlers[0](req(mode==='save'?action:{action:'read_cv_variants',expectedGeneration:7})),body=await response.json();
    assert(response.status===409&&body.code==='LOOP_ERASURE_IN_PROGRESS','Response is rejected after erasure starts.');
    assert(!body.variantSave&&!body.cvVariants&&!JSON.stringify(body).includes(action.profile.sourceText),'Erased-lifetime source cannot be published from a delayed response.');
    assertVariantOnlyCalls();
  }
  lifecycle={state:'active',generation:0};
});
Deno.test('actual variant reads do not initialize missing work and fresh saves reject withdrawn facts before atomic persistence',async()=>{
  cvVariantAction();existingLifecycleAbsent=true;
  const missing=await handlers[0](req({action:'read_cv_variants',expectedGeneration:7})),missingBody=await missing.json();
  assert(missing.status===409&&missingBody.code==='LOOP_REQUEST_STALE','An absent workspace cannot return fabricated saved variants.');
  assert(!calls.some(call=>new URL(call.url).pathname.includes('/rpc/')),'Missing workspace read does not initialize lifecycle, a record or storage.');
  const action=cvVariantAction();record.data.claims[0].shareable=false;
  const withdrawn=await handlers[0](req(action)),withdrawnBody=await withdrawn.json();
  assert(withdrawn.status===422&&withdrawnBody.code==='LOOP_VARIANT_CLAIM_INVALID','Current withdrawn facts require explicit review.');
  assert(!calls.some(call=>call.url.endsWith('/rpc/job_loop_save_cv_variant_bound')),'A fresh invalid fact never reaches atomic save.');
  assertVariantOnlyCalls();lifecycle={state:'active',generation:0};
});
