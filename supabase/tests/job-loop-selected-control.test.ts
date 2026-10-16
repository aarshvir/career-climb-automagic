// @vitest-environment node
import { describe,it,expect,vi } from 'vitest';
import { controlLoop,validateControlInput,selectedPreparationHashes } from '../functions/_shared/job-loop-runtime';
import { LoopRepository,publicRun,type RunRow,type RecordRow } from '../functions/_shared/job-loop-repository';
import type { LoopAction } from '../functions/_shared/job-loop-types';
const owner='11111111-1111-4111-a111-111111111111',requestId='22222222-2222-4222-a222-222222222222';
const ids=['33333333-3333-4333-a333-333333333333','44444444-4444-4444-a444-444444444444','55555555-5555-4555-a555-555555555555'];
const quote='Built a reporting dashboard for a university operations project.';
const request=()=>({action:'start_selected_run' as const,expectedGeneration:7,expectedVersion:1,requestId,opportunityIds:[ids[2]],prepareConsent:true,provider:'rules' as const,model:'grounded-rules-v1',modelConsent:false});
const env=(name:string)=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',JOB_LOOP_EMPLOYER_FEEDS:'[]',JOB_LOOP_PAID_APIS_ENABLED:'false'}[name]);
function fixture(){
 let generation=7,run:RunRow|null=null,wait:Promise<void>|undefined,receiptWrong=false;
 const row:RecordRow={user_id:owner,version:1,input_version:1,lifecycle_generation:7,updated_at:'2026-10-16T00:00:00Z',data:{
 profile:{audience:'student',name:'Example Candidate',contactLine:'',targetTitles:['Analyst'],locations:['Dubai'],experienceYears:null,languages:[],pageTarget:1,discreetSearch:false,sourceText:'Academic projects\nUniversity operations project\n'+quote,excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-16T00:00:00Z'},
 claims:[{id:'claim',revision:1,status:'active',createdAt:'2026-10-16T00:00:00Z',sourceKind:'cv_passage',sourceQuote:quote,phrasing:quote,context:'University operations project',kind:'academic_project',resultStatus:'not_measured',confirmed:true,shareable:true}],
 opportunities:ids.map((id,i)=>({id,title:`Analyst ${i}`,company:'Example employer',location:'Dubai',url:`https://example.invalid/${i}`,description:'Review operational evidence and document findings for the analyst team. This is a created vacancy.',contact:null,source:'manual',sourceKey:`manual:${id}`,checkedAt:'2026-10-16T00:00:00Z',verification:'user_provided',status:'saved',followUpAt:null,notes:''})),inbox:[]}};
 const rpc=vi.fn(async(name:string,a:Record<string,any>)=>{
   if(name==='job_loop_start_selected_run_bound')await wait;
   if(a.p_generation!==generation)return {data:null,error:{message:'LOOP_REQUEST_STALE'}};
   if(name==='job_loop_assert_generation')return {data:null,error:null};
   if(name==='job_loop_read_record')return {data:{...structuredClone(row),lifecycle_generation:generation},error:null};
   if(name==='job_loop_start_selected_run_bound'){
     if(!run&&a.p_expected!==row.version)return {data:null,error:{message:'LOOP_VERSION_CONFLICT'}};
     run??={id:requestId,user_id:owner,request_id:a.p_request,request_hash:a.p_request_hash,input_hash:a.p_input_hash,input_version:row.input_version,selected_generation:a.p_generation,selected_opportunity_ids:a.p_selected,snapshot:structuredClone(row.data),provider:a.p_provider,model:a.p_model,consents:a.p_consents,data:{},status:'queued',phase:0,lease_token:null,lease_until:null,created_at:row.updated_at,finished_at:null};
     const receipt=structuredClone(run);if(receiptWrong)receipt.selected_opportunity_ids=[ids[0]];return {data:receipt,error:null};
   }
   throw new Error(`Unexpected RPC ${name}`);
 });
 const from=vi.fn(()=>{throw new Error('No direct database access');});const repo=new LoopRepository({rpc,from} as never);
 vi.spyOn(repo,'record').mockImplementation(async(_owner,epoch)=>repo.rpc('job_loop_read_record',{p_user:_owner,p_generation:epoch}));
 vi.spyOn(repo,'requestRun').mockImplementation(async()=>structuredClone(run));
 vi.spyOn(repo,'erasureStatus').mockImplementation(async()=>({state:'active',generation}));
 vi.spyOn(repo,'collections').mockImplementation(async()=>({runs:run?[structuredClone(run)]:[],packets:[],usage:[],connection:null}));
 vi.spyOn(repo,'operationalSnapshot').mockResolvedValue({schedule:null,activity:[],support:[],scheduler:{ready:false},budget:{month:'2026-10',capUsd:50,committedUsd:0,remainingUsd:50,enrolled:true,activeUsers:1}});
 const fetcher=vi.fn(async()=>new Response('{}',{status:202}));
 return {repo,rpc,from,row,fetcher,run:()=>run!,setEpoch:(n:number)=>{generation=n;},wrongReceipt:()=>{receiptWrong=true;},delay:()=>{let release!:()=>void;wait=new Promise<void>(resolve=>release=resolve);return release;}};
}
describe('selected preparation server contract, unpublished',()=>{
 it.each([{prepareConsent:false},{prepareConsent:'true'},{expectedGeneration:undefined},{expectedVersion:1.5},{opportunityIds:[]},{opportunityIds:ids},{opportunityIds:[ids[0],ids[0].toUpperCase()]},{opportunityIds:['title']},{userId:owner},{inputHash:'forged'},{inboxConsent:true},{scheduled:true},{processingRoute:'openrouter'},{provider:'openai',modelConsent:false}])('rejects unsafe selection/authority/consent before any persistence: %j',async patch=>{
  const f=fixture();await expect(controlLoop(f.repo,owner,{...request(),...patch} as LoopAction,env,f.fetcher)).rejects.toThrow();expect(f.rpc).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();
 });
 it('admits the exact third vacancy with server hashes and returns original selection scope',async()=>{
  const f=fixture(),result=await controlLoop(f.repo,owner,request(),env,f.fetcher);
  expect(f.rpc).toHaveBeenCalledWith('job_loop_start_selected_run_bound',expect.objectContaining({p_user:owner,p_generation:7,p_expected:1,p_selected:[ids[2]],p_consents:{model:false,inbox:false},p_request_hash:expect.stringMatching(/^[a-f0-9]{64}$/)}));
  expect(result.selectedRun).toEqual({requestId,runId:requestId,generation:7,opportunityIds:[ids[2]]});expect(result.snapshot?.runs[0].selection).toEqual({generation:7,opportunityIds:[ids[2]]});expect(result.snapshot?.runs[0].phase).toBe('selection');expect(f.from).not.toHaveBeenCalled();
 });
 it('preserves retry after unrelated source and selected tracking changes, without a new run',async()=>{
  const f=fixture();await controlLoop(f.repo,owner,request(),env,f.fetcher);const run=f.run();f.row.version++;f.row.data.opportunities[0].description+='unrelated';f.row.data.opportunities[2].status='applied';f.row.data.opportunities[2].notes='Keep progress';run.status='completed';
  const result=await controlLoop(f.repo,owner,request(),env,f.fetcher);expect(f.run()).toBe(run);expect(result.message).toContain('progress');expect(result.snapshot?.opportunities[2].notes).toBe('Keep progress');expect(f.rpc.mock.calls.filter(([n])=>n==='job_loop_start_selected_run_bound')).toHaveLength(2);
 });
 it.each(['source','profile','consent','order','legacy'] as const)('rejects conflicting retry %s before dispatch',async mode=>{
  const f=fixture(),a={...request(),opportunityIds:[ids[2],ids[0]]};await controlLoop(f.repo,owner,a,env,f.fetcher);f.fetcher.mockClear();
  if(mode==='source')f.row.data.opportunities[2].description+='changed';if(mode==='profile')f.row.data.profile!.name='Changed';if(mode==='consent')a.modelConsent=true;if(mode==='order')a.opportunityIds.reverse();if(mode==='legacy')f.run().selected_opportunity_ids=null;
  await expect(controlLoop(f.repo,owner,a,env,f.fetcher)).rejects.toMatchObject({code:'LOOP_REQUEST_CONFLICT'});expect(f.fetcher).not.toHaveBeenCalled();
 });
 it('rejects stale new selection version and missing source',async()=>{const f=fixture();f.row.version=2;await expect(controlLoop(f.repo,owner,request(),env,f.fetcher)).rejects.toMatchObject({code:'LOOP_VERSION_CONFLICT'});f.row.data.opportunities.pop();await expect(controlLoop(f.repo,owner,request(),env,f.fetcher)).rejects.toMatchObject({code:'LOOP_SELECTION_UNAVAILABLE'});});
 it('keeps original generation through delayed atomic admission',async()=>{const f=fixture(),release=f.delay();const pending=controlLoop(f.repo,owner,request(),env,f.fetcher),rejected=expect(pending).rejects.toMatchObject({code:'LOOP_REQUEST_STALE'});await vi.waitFor(()=>expect(f.rpc.mock.calls.some(([n])=>n==='job_loop_start_selected_run_bound')).toBe(true));f.setEpoch(9);release();await rejected;expect(f.fetcher).not.toHaveBeenCalled();});
 it('does not dispatch a mismatched saved selection receipt',async()=>{const f=fixture();f.wrongReceipt();await expect(controlLoop(f.repo,owner,request(),env,f.fetcher)).rejects.toMatchObject({code:'LOOP_SELECTION_INVALID'});expect(f.fetcher).not.toHaveBeenCalled();});
 it('retains saved request identity after worker dispatch failure',async()=>{const f=fixture();f.fetcher.mockRejectedValueOnce(new Error('offline'));const result=await controlLoop(f.repo,owner,request(),env,f.fetcher);expect(result.runId).toBe(requestId);expect(result.message).toContain('Resume this same run');});
 it('distinguishes source selection in fingerprints while ignoring unrelated opportunities',async()=>{const f=fixture(),a=request();const initial=await selectedPreparationHashes(f.row.data,a);f.row.data.opportunities[0].title='Other';expect(await selectedPreparationHashes(f.row.data,a)).toEqual(initial);f.row.data.opportunities[2].sourceKey='Different provenance';expect(await selectedPreparationHashes(f.row.data,a)).not.toEqual(initial);});
});
