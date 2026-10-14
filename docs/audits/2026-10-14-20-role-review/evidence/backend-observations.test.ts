import { describe, it, expect, vi } from 'vitest';
import { prepareModelRequest, callModel } from '../../../supabase/functions/_shared/job-loop-providers.ts';
import { LoopRepository } from '../../../supabase/functions/_shared/job-loop-repository.ts';
import { processLoopPhase } from '../../../supabase/functions/_shared/job-loop-runtime.ts';

const env=(name:string)=>({JOB_LOOP_OPENROUTER_ENABLED:'true',JOB_LOOP_OPENROUTER_API_KEY:'fixture-only',JOB_LOOP_EMPLOYER_FEEDS:'[]'}[name]);
const claim={id:'claim-one',revision:1,status:'active',createdAt:'2026-10-14T00:00:00Z',sourceKind:'cv_passage',sourceQuote:'Prepared a coursework report about fictional retail operations.',phrasing:'Prepared a coursework report about fictional retail operations.',context:'Academic project',kind:'academic_project',resultStatus:'not_measured',confirmed:true,shareable:true} as const;
const opportunity={id:'33333333-3333-4333-a333-333333333333',source:'manual',sourceKey:'manual:fixture',checkedAt:'2026-10-14T00:00:00Z',verification:'user_provided',title:'Graduate analyst',company:'Fictional employer',location:'Dubai',description:'Prepare reports and communicate findings about fictional retail operations using approved source evidence.',url:'https://careers.example.com/job/one',contact:null,status:'saved',notes:'',followUpAt:null} as const;

describe('independent backend audit probes',()=>{
  it('accepts an unsupported factual presupposition as a review question',async()=>{
    const request=prepareModelRequest('openai','gpt-6.1-sol',env,opportunity,[claim]);
    const question='How did you lead the global merger team as managing director?';
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({model:'openai/gpt-6.1-sol',id:'fixture',usage:{prompt_tokens:10,completion_tokens:20,cost:.0001},choices:[{message:{content:JSON.stringify({claimIds:['claim-one'],reviewQuestions:[{question,claimIds:['claim-one']}]})}}]})));
    const result=await callModel(request,fetcher);
    expect(result.error).toBeNull();expect(result.reviewQuestions?.[0].question).toBe(question);expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('makes no deletion progress on either retry once an account exceeds the scan ceiling',async()=>{
    const rows=Array.from({length:10001},(_,i)=>({id:`object-${i}`,name:`artifact-${i}`}));
    const remove=vi.fn(async()=>({error:null}));const rpc=vi.fn(async()=>({data:null,error:null}));
    const repo=new LoopRepository({rpc,storage:{from:()=>({list:vi.fn(async(_prefix:string,{offset}:{offset:number})=>({data:rows.slice(offset,offset+1000),error:null})),remove})}} as never);
    for(let attempt=0;attempt<2;attempt++)await expect(repo.eraseArtifacts('11111111-1111-4111-a111-111111111111')).rejects.toMatchObject({code:'LOOP_ERASURE_RETRY'});
    expect(remove).not.toHaveBeenCalled();expect(rpc.mock.calls.every(call=>call[0]==='job_loop_begin_erase')).toBe(true);
  });
  it('retains a spending reservation even for a known pre-provider rejection',async()=>{
    const profile={audience:'student',name:'Fictional candidate',contactLine:'',targetTitles:['Graduate analyst'],locations:['Dubai'],experienceYears:null,languages:[],pageTarget:1,discreetSearch:false,sourceText:'Academic project\nPrepared a coursework report about fictional retail operations.',excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-14T00:00:00Z'};
    const record={user_id:'11111111-1111-4111-a111-111111111111',version:1,input_version:1,data:{profile,claims:[claim],opportunities:[opportunity],inbox:[]}};
    const run={id:'22222222-2222-4222-a222-222222222222',user_id:record.user_id,request_id:'22222222-2222-4222-a222-222222222222',request_hash:'a'.repeat(64),input_hash:'a'.repeat(64),input_version:1,snapshot:record.data,provider:'openai',model:'gpt-6.1-sol',consents:{model:true,inbox:false,processingRoute:'openrouter'},data:{opportunities:[opportunity],packetIds:[],lanes:[],messages:[]},status:'running',phase:2,lease_token:'44444444-4444-4444-a444-444444444444',lease_until:'2099-01-01T00:00:00Z',created_at:'2026-10-14T00:00:00Z',finished_at:null};
    const settle=vi.fn(async()=>({}));const reserve=vi.fn(async()=>({id:'usage-fixture',is_new:true,status:'reserved'}));const commit=vi.fn(async()=>run);
    const repo={claimRun:vi.fn(async()=>run),record:vi.fn(async()=>record),reserve,settle,commit} as unknown as LoopRepository;
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:{message:'fixture-only pre-provider rejection'}}),{status:429}));
    expect(await processLoopPhase(repo,run.id,env,fetcher)).toBe(false);
    expect(settle).toHaveBeenCalledWith('usage-fixture',null,null,true);expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
