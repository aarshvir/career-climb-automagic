// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {controlLoop,processDueSchedules,canReplayPreparation,preparationRequestHash} from '../functions/_shared/job-loop-runtime.ts';
import {fingerprintLoopInputs} from '../functions/_shared/job-loop-engine.ts';
import {digest,stableUuid} from '../functions/_shared/job-loop-providers.ts';
import type {CareerRecord,LoopRepository,RecordRow,RunRow,ScheduleRow} from '../functions/_shared/job-loop-repository.ts';
import type {LoopAction,LoopClaim,LoopOpportunity,LoopProfile} from '../functions/_shared/job-loop-types.ts';

const owner='11111111-1111-4111-a111-111111111111',id='22222222-2222-4222-a222-222222222222';
const choice={provider:'rules' as const,model:'grounded-rules-v1',modelConsent:false,inboxConsent:false};
const action:Extract<LoopAction,{action:'start_run'}>={action:'start_run',expectedGeneration:0,requestId:id,...choice};
const env=(name:string)=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fictional-service-only',JOB_LOOP_EMPLOYER_FEEDS:'[]'}[name]);
const profile:LoopProfile={audience:'student',name:'Fictional QA candidate',contactLine:'',targetTitles:['Graduate Operations Analyst'],locations:['Dubai'],experienceYears:null,languages:[],pageTarget:1,discreetSearch:true,sourceText:'Academic project\nFictional operations project\nBuilt a dashboard for a fictional university operations project.',excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-12T00:00:00Z'};
const claim:LoopClaim={id:'confirmed-project',revision:1,status:'active',createdAt:profile.updatedAt,sourceKind:'cv_passage',sourceQuote:'Built a dashboard for a fictional university operations project.',phrasing:'Built a dashboard for a fictional university operations project.',context:'Fictional operations project',kind:'academic_project',resultStatus:'not_measured',confirmed:true,shareable:true};
const vacancy:LoopOpportunity={id:'33333333-3333-4333-a333-333333333333',title:'Fictional Graduate Operations Analyst',company:'Fictional employer',location:'Dubai',url:'https://careers.example.com/fictional',description:'A fictional vacancy asks candidates to build reporting dashboards, document assumptions and explain their contribution. This is not a real employer listing.',contact:null,source:'manual',sourceKey:'manual:fictional',checkedAt:profile.updatedAt,verification:'user_provided',status:'saved',followUpAt:null,notes:''};
const record:CareerRecord={profile,claims:[claim],opportunities:[vacancy],inbox:[]};
const auto={...vacancy,id:'44444444-4444-4444-a444-444444444444',source:'employer_api' as const,sourceKey:'greenhouse:fictional:1',verification:'listed_on_source' as const,url:'https://careers.example.com/automatic',checkedAt:'2026-10-12T01:00:00Z'};
async function fixture(){
  const inputHash=await fingerprintLoopInputs(profile,[claim],[vacancy]),legacyHash=await digest(JSON.stringify([choice.provider,choice.model,false,false,inputHash]));
  const run:RunRow={id,user_id:owner,request_id:id,request_hash:legacyHash,input_hash:inputHash,input_version:1,snapshot:structuredClone(record),provider:'rules',model:choice.model,consents:{model:false,inbox:false},data:{lanes:[],messages:[],packetIds:[]},status:'completed',phase:7,lease_token:null,lease_until:null,created_at:profile.updatedAt,finished_at:'2026-10-12T01:00:00Z'};
  const row:RecordRow={lifecycle_generation:0,user_id:owner,version:2,input_version:1,data:{...structuredClone(record),opportunities:[{...vacancy,checkedAt:'2026-10-12T01:00:00Z'},auto]},updated_at:'2026-10-12T01:00:00Z'};
  const rpc=vi.fn(async()=>{throw Error('A completed replay must not create or dispatch another run.');});
  const repo={assertGeneration:vi.fn(async(user:string,generation:number)=>{expect(user).toBe(owner);expect(generation).toBe(0);}),erasureStatus:vi.fn(async()=>({state:'active',generation:0})),record:vi.fn(async()=>structuredClone(row)),requestRun:vi.fn(async(user:string,request:string)=>{expect(user).toBe(owner);expect(request).toBe(id);return structuredClone(run);}),rpc,
    collections:vi.fn(async()=>({runs:[run],packets:[],usage:[],connection:null})),operationalSnapshot:vi.fn(async()=>({schedule:null,activity:[],support:[],scheduler:{ready:false},budget:{month:'2026-10',capUsd:50,committedUsd:0,remainingUsd:50,enrolled:true,activeUsers:1}}))} as unknown as LoopRepository;
  return {repo,row,run,rpc};
}
describe('candidate-input idempotence after real background discovery',()=>{
  it('binds paid processing consent and request identity to the reviewed routing service',async()=>{
    const h=await fixture();h.run.provider='openai';h.run.model='gpt-6.1-sol';h.run.consents={model:true,inbox:false,processingRoute:'openrouter'};
    const routed={provider:'openai' as const,model:'gpt-6.1-sol',modelConsent:true,inboxConsent:false,processingRoute:'openrouter' as const};
    expect(await canReplayPreparation(h.run,h.row.data,routed)).toBe(true);
    expect(await canReplayPreparation(h.run,h.row.data,{...routed,processingRoute:'direct'})).toBe(false);
    expect(await preparationRequestHash(h.row.data,routed)).not.toBe(await preparationRequestHash(h.row.data,{...routed,processingRoute:'direct'}));
  });
  it('requires renewed route consent before a new OpenRouter run and reserves nothing on stale direct consent',async()=>{
    const h=await fixture();vi.mocked(h.repo.requestRun).mockResolvedValue(null);
    const routedEnv=(name:string)=>name==='JOB_LOOP_OPENROUTER_API_KEY'?'fictional-test-credential':name==='JOB_LOOP_OPENROUTER_ENABLED'?'true':env(name);
    const request={...action,provider:'openai' as const,model:'gpt-6.1-sol',modelConsent:true};
    await expect(controlLoop(h.repo,owner,request,routedEnv)).rejects.toMatchObject({code:'LOOP_PROCESSING_ROUTE_CHANGED'});
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('replays the owned legacy request after listings and freshness timestamps change without creating a new run or paid call',async()=>{
    const h=await fixture(),network=vi.fn(async()=>{throw Error('A completed replay must not make network calls.');});
    expect(await fingerprintLoopInputs(h.row.data.profile!,h.row.data.claims,h.row.data.opportunities)).not.toBe(h.run.input_hash);
    expect(await canReplayPreparation(h.run,h.row.data,choice)).toBe(true);
    const result=await controlLoop(h.repo,owner,action,env,network);expect(result.runId).toBe(id);expect(result.message).toContain('no second run');expect(h.rpc).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
  });
  it('keeps tracking status, private notes and reminder changes outside the preparation request identity',async()=>{
    const h=await fixture();h.row.data.opportunities[0]={...h.row.data.opportunities[0],status:'interview',notes:'Candidate-reported fictional interview',followUpAt:'2026-10-20'};
    const result=await controlLoop(h.repo,owner,action,env);expect(result.runId).toBe(id);expect(result.snapshot?.opportunities[0].status).toBe('interview');expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each(['profile','claim_revision','vacancy_text','new_manual_vacancy','deleted_vacancy','original_automatic_vacancy','provider','model_consent','inbox_consent'] as const)('rejects reuse after a meaningful %s change instead of hiding it behind successful replay',async kind=>{
    const h=await fixture(),request={...action};
    if(kind==='profile')h.row.data.profile={...h.row.data.profile!,sourceText:profile.sourceText+'\nA new factual source passage.'};
    if(kind==='claim_revision')h.row.data.claims[0]={...claim,revision:2};
    if(kind==='vacancy_text')h.row.data.opportunities[0]={...vacancy,description:vacancy.description+' A new mandatory qualification.'};
    if(kind==='new_manual_vacancy')h.row.data.opportunities.push({...vacancy,id:'55555555-5555-4555-a555-555555555555',url:'https://careers.example.com/second-manual'});
    if(kind==='deleted_vacancy')h.row.data.opportunities=h.row.data.opportunities.filter(item=>item.id!==vacancy.id);
    if(kind==='original_automatic_vacancy'){h.run.snapshot.opportunities.push(structuredClone(auto));h.row.data.opportunities[1]={...auto,description:auto.description+' A changed requirement in an original source.'};}
    if(kind==='provider'){request.provider='openai';request.model='different-model';request.modelConsent=true;}
    if(kind==='model_consent')request.modelConsent=true;if(kind==='inbox_consent')request.inboxConsent=true;
    await expect(controlLoop(h.repo,owner,request,env)).rejects.toMatchObject({code:'LOOP_REQUEST_CONFLICT',status:409});expect(h.rpc).not.toHaveBeenCalled();
  });
  it('binds new request identity to factual vacancies while excluding tracking and freshness metadata',async()=>{
    const h=await fixture();expect(await preparationRequestHash(h.row.data,choice)).not.toBe(await preparationRequestHash(h.run.snapshot,choice));
    const same=structuredClone(h.run.snapshot);same.opportunities[0]={...same.opportunities[0],checkedAt:'2026-10-12T02:00:00Z',status:'interview',notes:'Private progress',followUpAt:'2026-10-20'};
    expect(await preparationRequestHash(same,choice)).toBe(await preparationRequestHash(h.run.snapshot,choice));
    h.run.snapshot.opportunities.push(structuredClone(auto));h.row.data.opportunities[1]={...auto,checkedAt:'2026-10-12T02:00:00Z'};
    expect(await canReplayPreparation(h.run,h.row.data,choice)).toBe(true);
  });
  it('recovers a scheduled legacy occurrence with its original stored request hash despite discovery changes',async()=>{
    const h=await fixture();const settings={cadence:'daily' as const,timezone:'Asia/Dubai',localTime:'08:30',weeklyDay:null,...choice};
    const schedule:ScheduleRow={user_id:owner,version:1,status:'active',settings,next_run_at:'2026-10-12T04:30:00Z',lease_token:null,lease_until:null,last_run_id:id,last_attempt_at:null,message:''};
    h.run.request_id=await stableUuid(`scheduled:${owner}:${schedule.next_run_at}`);
    const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>name==='job_loop_scheduler_state'?{ready:true}:name==='job_loop_claim_due'?[{...schedule,lease_token:args.p_lease}]:name==='job_loop_start_scheduled_run'?structuredClone(h.run):null);
    const repo={...h.repo,rpc,requestRun:vi.fn(async()=>structuredClone(h.run)),recoverableRuns:vi.fn(async()=>[])} as unknown as LoopRepository;
    const network=vi.fn(async()=>{throw Error('A completed scheduled occurrence must not dispatch twice.');});
    expect(await processDueSchedules(repo,env,network)).toEqual({claimed:1,started:0,recovered:0});
    expect(rpc.mock.calls.find(item=>item[0]==='job_loop_start_scheduled_run')?.[1]).toMatchObject({p_request_hash:h.run.request_hash,p_input_hash:h.run.input_hash,p_request:h.run.request_id});expect(network).not.toHaveBeenCalled();
  });
});
