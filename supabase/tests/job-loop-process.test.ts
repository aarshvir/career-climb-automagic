// @vitest-environment node
import { describe,it,expect,vi } from 'vitest';
import { processLoopPhase,canReplayPreparation } from '../functions/_shared/job-loop-runtime.ts';
import { LoopRepository,type RecordRow,type RunRow,type RunState } from '../functions/_shared/job-loop-repository.ts';
import { digest } from '../functions/_shared/job-loop-providers.ts';
import { ApiError } from '../functions/_shared/core.ts';
import type { LoopPacket,LoopOpportunity } from '../functions/_shared/job-loop-types.ts';
const owner='11111111-1111-4111-a111-111111111111';const id='22222222-2222-4222-a222-222222222222';const hash='a'.repeat(64);
function harness(){
  const opportunity:LoopOpportunity={id:'33333333-3333-4333-a333-333333333333',title:'Graduate analyst',company:'Fictional employer',location:'Dubai',url:'https://careers.example.com/graduate',description:'Analyse a new domain and communicate findings. The candidate may have transferable coursework evidence but this posting asks for different tools.',contact:null,source:'manual',sourceKey:'manual:explicit',checkedAt:'2026-10-11T00:00:00Z',verification:'user_provided',status:'saved',followUpAt:null,notes:''};
  const record:RecordRow={user_id:owner,version:1,input_version:1,updated_at:'2026-10-11T00:00:00Z',data:{profile:{audience:'student',name:'Fictional Candidate',contactLine:'',targetTitles:['Graduate analyst'],locations:['Dubai'],experienceYears:null,languages:[],pageTarget:1,discreetSearch:false,sourceText:'Academic project\nCoursework report\nPrepared a coursework report about fictional retail operations and documented the assumptions.',excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-11T00:00:00Z'},claims:[{id:'claim-one',revision:1,status:'active',createdAt:'2026-10-11T00:00:00Z',sourceKind:'cv_passage',sourceQuote:'Prepared a coursework report about fictional retail operations and documented the assumptions.',phrasing:'Prepared a coursework report about fictional retail operations and documented the assumptions.',context:'Coursework report',kind:'academic_project',resultStatus:'not_measured',confirmed:true,shareable:true}],opportunities:[opportunity],inbox:[]}};
  const run:RunRow={id,user_id:owner,request_id:id,request_hash:hash,input_hash:hash,input_version:1,snapshot:structuredClone(record.data),provider:'rules',model:'grounded-rules-v1',consents:{model:false,inbox:false},data:{},status:'queued',phase:0,lease_token:null,lease_until:null,created_at:'2026-10-11T00:00:00Z',finished_at:null};
  const packets:LoopPacket[]=[];const artifacts=new Map<string,Uint8Array>();let cancelledBeforeCommit=false;
  const mock={
    claimRun:vi.fn(async()=>{if(run.status==='cancelled')return null;run.lease_token=crypto.randomUUID();run.status='running';return structuredClone(run);}),
    record:vi.fn(async(user:string)=>{expect(user).toBe(owner);return structuredClone(record);}),
    collections:vi.fn(async()=>({runs:[],packets:packets.map(data=>({id:data.id,user_id:owner,input_version:1,status:data.status,data})),usage:[],connection:null})),
    commit:vi.fn(async(active:RunRow,phase:number,status:RunRow['status'],state:RunState,values:LoopPacket[]=[],opportunities:LoopOpportunity[]=[])=>{if(cancelledBeforeCommit||active.lease_token!==run.lease_token||record.input_version!==active.input_version)throw new ApiError(409,'LOOP_LEASE_LOST','cancelled');run.phase=phase;run.status=status;run.data=structuredClone(state);run.lease_token=null;packets.push(...structuredClone(values));record.data.opportunities.push(...opportunities);return structuredClone(run);}),
    upload:vi.fn(async(active:RunRow,packet:string,key:string,bytes:Uint8Array)=>{const path=`${active.user_id}/${packet}/${await digest(bytes)}/${key}`;artifacts.set(path,bytes);return path;}),
    reserve:vi.fn(()=>{throw new Error('A disabled paid provider must never be reached.');}),
  };
  return {repo:mock as unknown as LoopRepository,mock,record,run,packets,artifacts,cancelAtCommit:()=>{cancelledBeforeCommit=true;}};
}
describe('checkpointed actual rule-engine cloud phases',()=>{
  it('continues through persisted phases and builds a low-score manual student packet without any paid call',async()=>{
    const h=harness();const network=vi.fn(()=>{throw new Error('No external provider configured.');});const env=(name:string)=>name==='JOB_LOOP_EMPLOYER_FEEDS'?'[]':undefined;
    let again=true;let requests=0;while(again&&requests<10){again=await processLoopPhase(h.repo,id,env,network);requests++;}
    expect(requests).toBeGreaterThan(3);expect(h.run.status).toBe('partial');expect(h.packets).toHaveLength(1);expect(h.packets[0].status).toBe('review_required');expect(h.packets[0].pageCount).toBe(1);expect(h.packets[0].cvText).toContain('ACADEMIC PROJECTS');expect(h.packets[0].cvText).toContain('Prepared a coursework report');expect(h.packets[0].connectionNote).toBe('');expect(Object.keys(h.packets[0].artifacts)).toEqual(expect.arrayContaining(['pdf','docx','txt','report','letter']));
    expect(h.run.data.lanes).toEqual(expect.arrayContaining([expect.objectContaining({name:'Broad web search',status:'not_connected'}),expect.objectContaining({name:'LinkedIn inbox and browser sources',status:'blocked'})]));expect(h.run.data.nextAction).toMatch(/Review one/);expect(network).not.toHaveBeenCalled();expect(h.mock.reserve).not.toHaveBeenCalled();
    for(const artifact of Object.values(h.packets[0].artifacts)){expect(artifact.path).toContain(`/${artifact.sha256}/`);expect(await digest(h.artifacts.get(artifact.path)!)).toBe(artifact.sha256);}
  });
  it('cannot publish rendered results after cancellation or source-generation change',async()=>{
    const h=harness();h.run.phase=2;h.run.data={opportunities:[h.record.data.opportunities[0]],packetIds:[],lanes:[],messages:[]};h.cancelAtCommit();
    expect(await processLoopPhase(h.repo,id,()=>undefined)).toBe(false);expect(h.packets).toHaveLength(0);expect(h.artifacts.size).toBeGreaterThan(0);
  });
  it('does not prepare a newly applied opportunity from a stale discovery snapshot',async()=>{
    const h=harness();h.run.phase=2;h.run.data={opportunities:[structuredClone(h.record.data.opportunities[0])],packetIds:[],lanes:[],messages:[]};h.record.data.opportunities[0].status='applied';
    expect(await processLoopPhase(h.repo,id,()=>undefined)).toBe(true);expect(h.packets).toHaveLength(0);expect(h.mock.upload).not.toHaveBeenCalled();expect(h.run.data.messages?.join(' ')).toMatch(/history was preserved/);
  });
});

function selectedHarness(two=false){
  const h=harness();const first=h.record.data.opportunities[0];
  h.record.data.opportunities=[first,{...first,id:'44444444-4444-4444-a444-444444444444',title:'Second vacancy'},{...first,id:'55555555-5555-4555-a555-555555555555',title:'Third vacancy'}];
  h.run.lifecycle_generation=0;h.run.selected_generation=0;h.run.snapshot=structuredClone(h.record.data);h.run.selected_opportunity_ids=two?[h.record.data.opportunities[2].id,first.id]:[h.record.data.opportunities[2].id];return h;
}
const noNetwork=()=>{throw new Error('Selected preparation must not discover or read inbox.');};
async function drain(h:ReturnType<typeof harness>){let n=0;while(await processLoopPhase(h.repo,id,()=>undefined,noNetwork)){if(++n>10)throw new Error('Phase loop');}}
describe('explicit selected-vacancy worker foundation',()=>{
  it('prepares the third vacancy first and only that vacancy with real rendered artifacts',async()=>{
    const h=selectedHarness();await drain(h);expect(h.run.status).toBe('completed');expect(h.packets.map(p=>p.opportunityId)).toEqual(h.run.selected_opportunity_ids);expect(h.artifacts.size).toBeGreaterThan(0);expect(h.mock.reserve).not.toHaveBeenCalled();expect(h.run.data.lanes?.map(l=>l.name)).toEqual(['Selected vacancies']);
  });
  it('preserves the chosen two-vacancy order',async()=>{const h=selectedHarness(true);await drain(h);expect(h.packets.map(p=>p.opportunityId)).toEqual(h.run.selected_opportunity_ids);});
  it('ignores mutable phase wording and uses the admitted immutable source',async()=>{
    const h=selectedHarness();await processLoopPhase(h.repo,id,()=>undefined);await processLoopPhase(h.repo,id,()=>undefined);
    h.run.data.opportunities![0].title='Injected vacancy';h.run.data.opportunities![0].description='Injected body';await drain(h);expect(h.packets[0].title).not.toBe('Injected vacancy');expect(JSON.stringify(h.packets[0])).not.toContain('Injected body');expect(h.packets[0].opportunityId).toBe(h.run.selected_opportunity_ids![0]);
  });
  it.each(['omit','replace','reorder'] as const)('fails closed on %s phase selection',async mode=>{
    const h=selectedHarness(true);await processLoopPhase(h.repo,id,()=>undefined);await processLoopPhase(h.repo,id,()=>undefined);
    if(mode==='omit'){h.run.data.opportunities=[];h.run.data.opportunityIds=[];}
    if(mode==='replace'){h.run.data.opportunities=[h.record.data.opportunities[1]];h.run.data.opportunityIds=[h.record.data.opportunities[1].id];}
    if(mode==='reorder'){h.run.data.opportunities!.reverse();h.run.data.opportunityIds!.reverse();}
    await drain(h);expect(h.run.status).toBe('blocked');expect(h.mock.upload).not.toHaveBeenCalled();expect(h.mock.reserve).not.toHaveBeenCalled();
  });
  it.each(['changed','removed','closed','provenance'] as const)('blocks %s source before rendering',async mode=>{
    const h=selectedHarness();if(mode==='changed')h.record.data.opportunities[2].description+='Changed';else if(mode==='closed')h.record.data.opportunities[2].verification='closed_confirmed';else if(mode==='provenance')h.record.data.opportunities[2].sourceKey='manual:other';else h.record.data.opportunities.pop();await drain(h);expect(h.run.status).toBe('blocked');expect(h.mock.upload).not.toHaveBeenCalled();
  });
  it('preserves later applied progress without preparing it again',async()=>{const h=selectedHarness();h.record.data.opportunities[2].status='applied';await drain(h);expect(h.packets).toHaveLength(0);expect(h.record.data.opportunities[2].status).toBe('applied');});
  it('retains the exact existing packet without upload or another model reservation',async()=>{
    const h=selectedHarness();await drain(h);const original=h.packets[0];h.mock.upload.mockClear();h.run.phase=0;h.run.status='queued';h.run.data={};await drain(h);expect(h.packets).toHaveLength(1);expect(h.run.data.reusedPacketIds).toEqual([original.id]);expect(h.mock.upload).not.toHaveBeenCalled();expect(h.mock.reserve).not.toHaveBeenCalled();
  });
  it('rejects a selected snapshot from another lifecycle',async()=>{const h=selectedHarness();h.run.selected_generation=1;await drain(h);expect(h.run.status).toBe('blocked');expect(h.mock.upload).not.toHaveBeenCalled();});
  it('rejects inbox expansion and a discovery-wide replay of the selected intent',async()=>{
    const h=selectedHarness();expect(await canReplayPreparation(h.run,h.record.data,{provider:'rules',model:h.run.model,modelConsent:false,inboxConsent:false})).toBe(false);
    h.run.consents.inbox=true;await drain(h);expect(h.run.status).toBe('blocked');expect(h.mock.upload).not.toHaveBeenCalled();
  });
});
