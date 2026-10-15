// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../functions/_shared/core.ts';
import { controlLoop, validateControlInput } from '../functions/_shared/job-loop-runtime.ts';
import { LoopRepository, type LifecycleRow, type RecordRow } from '../functions/_shared/job-loop-repository.ts';

const owner='11111111-1111-4111-a111-111111111111';
const privateText='LOCAL_PRIVATE_CV_FIXTURE. Prepared reporting checklists for a synthetic operations team. No real candidate records are used.';
function fixture(){
  let lifecycle:LifecycleRow|null={user_id:owner,state:'active',generation:7};
  let record:RecordRow|null={user_id:owner,version:11,input_version:4,updated_at:'2026-10-15T00:00:00Z',data:{profile:{audience:'professional',name:'Local existing-read fixture',contactLine:'',sourceText:privateText,targetTitles:['Analyst'],locations:['Dubai'],experienceYears:null,languages:[],pageTarget:1,discreetSearch:true,excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-15T00:00:00Z'},claims:[],opportunities:[],inbox:[]}};
  const effects:{table:string;columns:string;key:string;value:unknown}[]=[];
  const rpc=vi.fn(async()=>{throw new Error('Passive reads must not invoke initialization or lifecycle-writing RPCs.');});
  const from=vi.fn((table:string)=>({select:(columns:string)=>({eq:(key:string,value:unknown)=>({maybeSingle:async()=>{
    effects.push({table,columns,key,value});
    if(key!=='user_id'||value!==owner)throw new Error('Every passive read must be owner scoped.');
    const data=table==='job_loop_lifecycle'?lifecycle:table==='job_loop_records'?record:undefined;
    if(data===undefined)throw new Error('Unexpected table read: '+table);
    return {data:structuredClone(data),error:null};
  }})})}));
  const repo=new LoopRepository({from,rpc} as never);
  const collections=vi.spyOn(repo,'collections').mockResolvedValue({runs:[],packets:[],usage:[],connection:null});
  const operational=vi.spyOn(repo,'operationalSnapshot').mockResolvedValue({schedule:null,activity:[],support:[],scheduler:{ready:false},budget:{month:'2026-10',capUsd:50,committedUsd:0,remainingUsd:50,enrolled:false,activeUsers:0}});
  return {repo,rpc,from,effects,collections,operational,setLifecycle:(next:LifecycleRow|null)=>{lifecycle=next;},setRecord:(next:RecordRow|null)=>{record=next;},getRecord:()=>record!,getLifecycle:()=>lifecycle!};
}
const env=(name:string)=>name==='JOB_LOOP_ENABLED'?'false':undefined;
const read=(h:ReturnType<typeof fixture>)=>controlLoop(h.repo,owner,{action:'get_existing'},env);
afterEach(()=>vi.restoreAllMocks());

describe('authenticated passive read of existing Loop records',()=>{
  it('returns an active existing snapshot with its exact owner lifetime and record version without RPC initialization',async()=>{
    const h=fixture(),result=await read(h);
    expect(result).toMatchObject({existingState:'active',snapshot:{lifecycleGeneration:7,recordVersion:11,profile:{sourceText:privateText}}});
    expect(h.effects).toEqual([
      {table:'job_loop_lifecycle',columns:'user_id,state,generation',key:'user_id',value:owner},
      {table:'job_loop_records',columns:'*',key:'user_id',value:owner},
      {table:'job_loop_records',columns:'*',key:'user_id',value:owner},
      {table:'job_loop_lifecycle',columns:'user_id,state,generation',key:'user_id',value:owner},
    ]);
    expect(h.collections).toHaveBeenCalledExactlyOnceWith(owner);expect(h.operational).toHaveBeenCalledExactlyOnceWith(owner,50);expect(h.rpc).not.toHaveBeenCalled();
    expect(h.getRecord().version).toBe(11);expect(h.getLifecycle().generation).toBe(7);
  });
  it('returns honest absence for an untouched account without creating lifecycle, record or enrollment rows',async()=>{
    const h=fixture();h.setLifecycle(null);h.setRecord(null);
    expect(await read(h)).toEqual({existingState:'absent'});
    expect(h.effects.map(effect=>effect.table)).toEqual(['job_loop_lifecycle','job_loop_records']);
    expect(h.collections).not.toHaveBeenCalled();expect(h.operational).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();
    expect(h.getLifecycle()).toBeNull();expect(h.getRecord()).toBeNull();
  });
  it('does not initialize an active metadata row with no career record',async()=>{
    const h=fixture();h.setRecord(null);
    expect(await read(h)).toEqual({existingState:'absent'});expect(h.collections).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();
  });
  it('does not reactivate an erased lifetime or disclose retained data',async()=>{
    const h=fixture();h.setLifecycle({user_id:owner,state:'erased',generation:8});
    expect(await read(h)).toEqual({existingState:'absent'});
    expect(h.effects.map(effect=>effect.table)).toEqual(['job_loop_lifecycle']);expect(h.collections).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();
  });
  it('reports erasing without reading private records or automatically continuing cleanup',async()=>{
    const h=fixture();h.setLifecycle({user_id:owner,state:'erasing',generation:8});
    expect(await read(h)).toEqual({existingState:'erasing',erasureGeneration:8});
    expect(h.effects.map(effect=>effect.table)).toEqual(['job_loop_lifecycle']);expect(h.collections).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();
  });
  it('reports an old record without durable lifetime as unavailable instead of creating metadata or pretending it is absent',async()=>{
    const h=fixture();h.setLifecycle(null);
    await expect(read(h)).rejects.toMatchObject({code:'LOOP_REQUEST_STALE',status:409});expect(h.rpc).not.toHaveBeenCalled();expect(h.collections).not.toHaveBeenCalled();
  });
  it.each(['erasing','erased'] as const)('discards a delayed private snapshot when the owner becomes %s',async state=>{
    const h=fixture();h.collections.mockImplementationOnce(async()=>{h.setLifecycle({user_id:owner,state,generation:8});return {runs:[],packets:[],usage:[],connection:null};});
    const result=await read(h);
    expect(result).toEqual(state==='erasing'?{existingState:'erasing',erasureGeneration:8}:{existingState:'absent'});
    expect(JSON.stringify(result)).not.toContain(privateText);expect(result).not.toHaveProperty('snapshot');expect(h.rpc).not.toHaveBeenCalled();
  });
  it('does not adopt a fresh generation after erasure while collections are loading',async()=>{
    const h=fixture();h.collections.mockImplementationOnce(async()=>{h.setLifecycle({user_id:owner,state:'active',generation:9});h.setRecord({...h.getRecord(),version:13,input_version:6});return {runs:[],packets:[],usage:[],connection:null};});
    const result=await read(h).catch(error=>error);
    expect(result).toMatchObject({code:'LOOP_REQUEST_STALE',status:409});expect(result.message).not.toContain(privateText);expect(h.rpc).not.toHaveBeenCalled();
    expect(h.collections).toHaveBeenCalledOnce();
  });
  it('rejects mixed record revisions instead of returning a current-looking snapshot',async()=>{
    const h=fixture();h.collections.mockImplementationOnce(async()=>{h.setRecord({...h.getRecord(),version:12});return {runs:[],packets:[],usage:[],connection:null};});
    await expect(read(h)).rejects.toMatchObject({code:'LOOP_VERSION_CONFLICT',status:409});expect(h.rpc).not.toHaveBeenCalled();
  });
  it('returns no old private snapshot if the record disappears during collection',async()=>{
    const h=fixture();h.collections.mockImplementationOnce(async()=>{h.setRecord(null);return {runs:[],packets:[],usage:[],connection:null};});
    expect(await read(h)).toEqual({existingState:'absent'});expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each(['lifecycle','record'] as const)('rejects a foreign-owner %s response before displaying private data',async target=>{
    const h=fixture();if(target==='lifecycle')h.setLifecycle({...h.getLifecycle(),user_id:'different-owner'});else h.setRecord({...h.getRecord(),user_id:'different-owner'});
    await expect(read(h)).rejects.toMatchObject({code:'LOOP_PERSISTENCE_FAILED',status:503});expect(h.collections).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();
  });
  it('propagates a failed collection read instead of calling it an empty successful account',async()=>{
    const h=fixture(),failure=new ApiError(503,'LOOP_PERSISTENCE_FAILED','Saved data could not be loaded.');h.collections.mockRejectedValueOnce(failure);
    await expect(read(h)).rejects.toBe(failure);expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each(['job_loop_lifecycle','job_loop_records'])('does not fall back to an initializing route when the %s read fails',async table=>{
    const h=fixture(),base=h.from.getMockImplementation()!;
    h.from.mockImplementation(name=>name===table?{select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:{message:'PRIVATE_DATABASE_DETAIL'}})})})} as never:base(name));
    const failure=await read(h).catch(error=>error);expect(failure).toMatchObject({code:'LOOP_PERSISTENCE_FAILED',status:503});expect(failure.message).not.toContain('PRIVATE_DATABASE_DETAIL');expect(h.rpc).not.toHaveBeenCalled();
  });
  it('accepts only the read action without caller-supplied authority or mutation fields',()=>{
    expect(validateControlInput({action:'get_existing'})).toEqual({action:'get_existing'});
    for(const extra of [{userId:'different-owner'},{p_user:'different-owner'},{expectedGeneration:7},{initialize:true},{saveConsent:true},{profile:{sourceText:privateText}}])expect(()=>validateControlInput({action:'get_existing',...extra})).toThrow();
  });
});
