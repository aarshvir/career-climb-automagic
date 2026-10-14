// @vitest-environment node
import { describe,it,expect,vi } from 'vitest';
import { processLoopPhase } from '../functions/_shared/job-loop-runtime.ts';
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
