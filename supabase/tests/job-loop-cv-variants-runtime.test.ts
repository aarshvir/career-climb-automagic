// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { controlLoop, validateControlInput } from '../functions/_shared/job-loop-runtime';
import { LoopRepository, type RecordRow } from '../functions/_shared/job-loop-repository';
import { validateCvVariantSaveReceipt, validateCvVariantsRead } from '../functions/_shared/job-loop-cv-variants';
import type { LoopAction } from '../functions/_shared/job-loop-types';
const owner='11111111-1111-4111-a111-111111111111',request='22222222-2222-4222-a222-222222222222',variantId='33333333-3333-4333-a333-333333333333';
const hash='a'.repeat(64),date='2026-10-17T00:00:00Z';
const profile={audience:'professional' as const,name:'Created Candidate',contactLine:'',targetTitles:['Analyst'],locations:['Dubai'],experienceYears:3,languages:['English'],pageTarget:1 as const,discreetSearch:false,sourceText:'Created Employer\nPrepared weekly reports with the operations team.\nEducation\nCreated University business degree.',excludedTerms:[],compensation:{currency:'',period:'monthly' as const,minimum:null}};
const intent={expectedGeneration:7,expectedVersion:1,requestId:request,variantId:null,expectedVariantRevision:0,label:'Operations CV',profile,claimRefs:[],saveConsent:true as const};
const action=()=>({action:'save_cv_variant',...structuredClone(intent)} as Extract<LoopAction,{action:'save_cv_variant'}>);
const variant=()=>({id:variantId,generation:7,revision:1,label:intent.label,profile:structuredClone(profile),claims:[],sourceHash:hash,createdAt:date,updatedAt:date});
const receipt=()=>({variant:variant(),recordVersion:2,requestId:request,requestHash:hash,sourceHash:hash,savedRevision:1,reused:false,generation:7});
function fixture(){
  const row:RecordRow={user_id:owner,version:1,input_version:1,lifecycle_generation:7,updated_at:date,data:{profile:null,claims:[],opportunities:[],inbox:[]}};
  let epoch=7,state:'active'|'erasing'|'erased'='active';
  const rpc=vi.fn(async(name:string,_args:Record<string,unknown>)=>{
    if(name==='job_loop_read_record')return {data:structuredClone(row),error:null};
    if(name==='job_loop_save_cv_variant_bound'){const {generation:_generation,...result}=receipt();return {data:result,error:null};}
    if(name==='job_loop_read_cv_variants_bound')return {data:{generation:7,recordVersion:2,variants:[variant()]},error:null};
    throw new Error(`Unexpected RPC ${name}`);
  });
  const from=vi.fn(()=>{throw new Error('No table shortcut');}),repo=new LoopRepository({rpc,from} as never);
  const lifecycle=vi.spyOn(repo,'existingLifecycle').mockImplementation(async()=>({user_id:owner,state,generation:epoch}));
  const fetcher=vi.fn(async()=>{throw new Error('No provider dispatch');});
  return {repo,rpc,row,lifecycle,from,fetcher,setLifetime:(generation:number,next=state)=>{epoch=generation;state=next;}};
}
afterEach(()=>vi.restoreAllMocks());
describe('CV variant control and response contract',()=>{
  it('derives the RPC owner and returns only the bound save receipt',async()=>{
    const f=fixture(),result=await controlLoop(f.repo,owner,action(),()=>undefined,f.fetcher);
    expect(f.rpc).toHaveBeenCalledWith('job_loop_save_cv_variant_bound',{p_user:owner,p_generation:7,p_expected:1,p_request:request,p_variant:null,p_variant_expected:0,p_label:intent.label,p_profile:profile,p_claims:[],p_save_consent:true});
    expect(result).toEqual({variantSave:receipt()});expect(f.fetcher).not.toHaveBeenCalled();expect(f.from).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['job_loop_read_record','job_loop_save_cv_variant_bound']);
  });
  it('reads without opening a record, budget enrollment, worker or global snapshot',async()=>{
    const f=fixture();expect(await controlLoop(f.repo,owner,{action:'read_cv_variants',expectedGeneration:7},()=>undefined,f.fetcher)).toEqual({cvVariants:{generation:7,recordVersion:2,variants:[variant()]}});
    expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['job_loop_read_cv_variants_bound']);expect(f.lifecycle).toHaveBeenCalledTimes(2);expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([{userId:'other'},{owner:'other'},{requestHash:hash},{sourceHash:hash},{prepareConsent:true},{expectedGeneration:undefined},{saveConsent:'true'},{saveConsent:false},{claimRefs:[{id:'test',revision:1,confirmed:true}]}])('rejects caller authority or malformed consent %j',patch=>{
    expect(()=>validateControlInput({...action(),...patch})).toThrow();
  });
  it.each([{expectedVersion:1},{userId:owner},{generation:7},{saveConsent:true}])('rejects unscoped read additions %j',patch=>{
    expect(()=>validateControlInput({action:'read_cv_variants',expectedGeneration:7,...patch})).toThrow();
  });
  it('rejects invalid input at the business boundary before any async authority lookup',async()=>{
    const f=fixture();await expect(controlLoop(f.repo,owner,{...action(),saveConsent:false} as never,()=>undefined)).rejects.toMatchObject({code:'LOOP_INVALID_INPUT'});expect(f.lifecycle).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each(['save_cv_variant','read_cv_variants'] as const)('does not return %s data after post-RPC erasure or a new lifetime',async kind=>{
    const f=fixture();f.lifecycle.mockResolvedValueOnce({user_id:owner,state:'active',generation:7}).mockResolvedValue({user_id:owner,state:'active',generation:8});
    await expect(controlLoop(f.repo,owner,kind==='save_cv_variant'?action():{action:kind,expectedGeneration:7},()=>undefined)).rejects.toMatchObject({code:'LOOP_REQUEST_STALE'});
  });
  it.each(['absent','erasing','erased'])('does not activate %s work',async state=>{
    const f=fixture();f.lifecycle.mockResolvedValue(state==='absent'?null:{user_id:owner,state:state as 'erasing'|'erased',generation:7});
    await expect(controlLoop(f.repo,owner,{action:'read_cv_variants',expectedGeneration:7},()=>undefined)).rejects.toThrow();expect(f.rpc).not.toHaveBeenCalled();
  });
  it('rejects a foreign or mismatched record before resolving facts or saving',async()=>{
    const f=fixture();f.row.user_id='foreign';await expect(controlLoop(f.repo,owner,action(),()=>undefined)).rejects.toMatchObject({code:'LOOP_VARIANT_RECEIPT_INVALID'});expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['request','generation','saved-revision','record-version','current-revision','label','source','profile','refs','injected','newer-without-reuse'])('rejects malformed or substituted receipt: %s',mode=>{
    const r=receipt() as any;
    if(mode==='request')r.requestId=owner;if(mode==='generation')r.generation=8;if(mode==='saved-revision')r.savedRevision=2;if(mode==='record-version')r.recordVersion=1;if(mode==='current-revision')r.variant.revision=0;
    if(mode==='label')r.variant.label='Other';if(mode==='source')r.sourceHash='b'.repeat(64);if(mode==='profile')r.variant.profile.name='Other';if(mode==='refs')r.variant.claims=[{}];if(mode==='injected')r.owner=owner;if(mode==='newer-without-reuse')r.variant.revision=2;
    expect(()=>validateCvVariantSaveReceipt(r,intent)).toThrow();
  });
  it('keeps original receipt source distinct from a later current variant on exact replay',()=>{
    const r=receipt();r.reused=true;r.recordVersion=4;r.variant.revision=2;r.variant.label='Newer draft';r.variant.profile.name='Newer name';r.variant.sourceHash='b'.repeat(64);
    const parsed=validateCvVariantSaveReceipt(r,intent);expect(parsed.sourceHash).toBe(hash);expect(parsed.variant.sourceHash).toBe('b'.repeat(64));expect(parsed.savedRevision).toBe(1);
  });
  it.each(['duplicate','over-limit','generation','version','foreign-field'])('rejects invalid read list %s',mode=>{
    const r:any={generation:7,recordVersion:2,variants:[variant()]};if(mode==='duplicate')r.variants.push(variant());if(mode==='over-limit')r.variants=Array(4).fill(variant());if(mode==='generation')r.generation=8;if(mode==='version')r.recordVersion=-1;if(mode==='foreign-field')r.variants[0].owner=owner;
    expect(()=>validateCvVariantsRead(r,7)).toThrow();
  });
  it.each(['LOOP_VARIANT_LIMIT','LOOP_VARIANT_REVISION_CONFLICT','LOOP_VARIANT_CLAIM_UNAVAILABLE','LOOP_VARIANT_SOURCE_CHANGED','LOOP_VARIANT_INVALID'])('maps %s without disclosing database source text',async code=>{
    const repo=new LoopRepository({rpc:vi.fn(async()=>({data:null,error:{message:`${code}: private source must not escape`}}))} as never);
    await expect(repo.saveCvVariant(owner,intent)).rejects.toMatchObject({code});await expect(repo.saveCvVariant(owner,intent)).rejects.not.toThrow('private source');
  });
});
