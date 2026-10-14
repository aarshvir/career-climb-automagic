// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../functions/_shared/core.ts';
import { controlLoop } from '../functions/_shared/job-loop-runtime.ts';
import * as engine from '../functions/_shared/job-loop-engine.ts';
import type { LoopRepository, RecordRow } from '../functions/_shared/job-loop-repository.ts';
import type { LoopClaimInput } from '../functions/_shared/job-loop-types.ts';

const owner='11111111-1111-4111-a111-111111111111';
const generation=7;
const quote='Bachelor of Business Administration completed at Generated QA University in 2026.';
const context='Generated QA University | 2026';
const claim:LoopClaimInput={sourceKind:'cv_passage',sourceQuote:quote,phrasing:quote,context,kind:'education',resultStatus:'not_measured',confirmed:true,shareable:true};
function fixture() {
  const row:RecordRow={user_id:owner,version:1,input_version:1,lifecycle_generation:generation,updated_at:'2026-10-13T00:00:00Z',data:{profile:{audience:'student',name:'Fictional QA candidate',contactLine:'',targetTitles:['Graduate analyst'],locations:[],experienceYears:null,languages:[],pageTarget:1,discreetSearch:true,sourceText:['Fictional candidate, not a real job seeker.','EDUCATION',context,quote].join('\n'),excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-13T00:00:00Z'},claims:[],opportunities:[],inbox:[]}};
  const write=vi.fn(async(_user:string,_expected:number,data:RecordRow['data'])=>{row.data=structuredClone(data);row.version++;return structuredClone(row);});
  const record=vi.fn(async()=>structuredClone(row));
  const erasureStatus=vi.fn(async()=>({state:'active' as const,generation}));
  const assertGeneration=vi.fn(async(user:string,expected:unknown)=>{if(user!==owner||expected!==generation)throw new ApiError(409,'LOOP_REQUEST_STALE','The current workspace lifetime changed.');});
  const repo={record,erasureStatus,assertGeneration,write,collections:vi.fn(async()=>({runs:[],packets:[],usage:[],connection:null})),operationalSnapshot:vi.fn(async()=>({schedule:null,activity:[],support:[],scheduler:{ready:false},budget:{month:'2026-10',capUsd:50,committedUsd:0,remainingUsd:50,enrolled:false,activeUsers:0}}))} as unknown as LoopRepository;
  return {row,repo,write,record,erasureStatus,assertGeneration};
}
afterEach(()=>vi.restoreAllMocks());
describe('correctable claim rejection remains distinct from persistence failure',()=>{
  it.each(['missing-source','missing-context'] as const)('returns sanitized 422 for %s without writing or weakening provenance',async mode=>{
    const h=fixture();
    if(mode==='missing-source')h.row.data.profile!.sourceText='Fictional candidate, not a real job seeker.\nEDUCATION\n'+context+'\nA different complete source passage.';
    else h.row.data.profile!.sourceText=h.row.data.profile!.sourceText.replace(context+'\n','');
    const error=await controlLoop(h.repo,owner,{action:'save_claim',expectedVersion:1,claim},()=>undefined).catch(reason=>reason);
    expect(error).toBeInstanceOf(ApiError);expect(error).toMatchObject({status:422,code:'LOOP_CLAIM_INVALID'});
    expect(error.message).toContain('complete source sentence');expect(error.message).not.toContain(quote);expect(error.message).not.toContain(context);
    expect(h.write).not.toHaveBeenCalled();expect(h.row.data.claims).toEqual([]);
  });
  it('keeps a valid source-bound save and its confirmation choices unchanged',async()=>{
    const h=fixture();const result=await controlLoop(h.repo,owner,{action:'save_claim',expectedVersion:1,claim},()=>undefined);
    expect(h.write).toHaveBeenCalledOnce();expect(h.write.mock.calls[0][0]).toBe(owner);expect(result.snapshot?.claims).toHaveLength(1);
    expect(result.snapshot?.claims[0]).toMatchObject({...claim,status:'active',revision:1});
    expect(result.snapshot?.lifecycleGeneration).toBe(generation);
    expect(h.erasureStatus).toHaveBeenCalledExactlyOnceWith(owner);
    expect(h.record.mock.calls).toEqual([[owner,undefined],[owner,generation,false]]);
    expect(h.assertGeneration).toHaveBeenCalledExactlyOnceWith(owner,generation);
  });
  it('preserves an existing ApiError raised during validation',async()=>{
    const h=fixture(),original=new ApiError(409,'EXISTING_VALIDATION_ERROR','Existing static validation response.');
    vi.spyOn(engine,'validateClaim').mockImplementationOnce(()=>{throw original;});
    await expect(controlLoop(h.repo,owner,{action:'save_claim',expectedVersion:1,claim},()=>undefined)).rejects.toBe(original);
    expect(h.write).not.toHaveBeenCalled();
  });
  it('preserves a persistence 503 after successful validation',async()=>{
    const h=fixture(),original=new ApiError(503,'LOOP_PERSISTENCE_FAILED','The cloud loop could not save this change.');
    h.write.mockRejectedValueOnce(original);
    await expect(controlLoop(h.repo,owner,{action:'save_claim',expectedVersion:1,claim},()=>undefined)).rejects.toBe(original);
    expect(h.write).toHaveBeenCalledOnce();expect(h.row.data.claims).toEqual([]);
  });
});
