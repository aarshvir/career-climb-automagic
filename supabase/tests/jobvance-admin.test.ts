import { describe, expect, it, vi } from 'vitest';
import { authenticateAdmin, controlAdmin, validateAdminAction, type AdminDatabase } from '../functions/_shared/jobvance-admin.ts';
import { ApiError } from '../functions/_shared/core.ts';
import type { AdminSnapshot } from '../../src/lib/admin-types.ts';

const owner='be619aa5-b1b8-4978-8780-b62461361980';
function database(role:string|null='owner') {
  const membership=vi.fn(async()=>({data:role?{role}:null,error:null}));
  const eq=vi.fn(); const select=vi.fn(); const from=vi.fn();
  const maybeSingle=membership;
  eq.mockReturnValue({eq,maybeSingle}); select.mockReturnValue({eq}); from.mockReturnValue({select});
  const rpc=vi.fn(async()=>({data:{},error:null}));
  const getUser=vi.fn(async()=>({data:{user:{id:owner,user_metadata:{admin:true,role:'owner'}}},error:null}));
  const db={auth:{getUser},from,rpc} as unknown as AdminDatabase;
  return {db,membership,from,select,eq,rpc,getUser};
}
const request=()=>new Request('https://private.invalid',{headers:{Authorization:'Bearer fictional-test-token'}});
describe('server administration authorization and input boundary',()=>{
  it('validates tokens through auth.getUser and rereads UUID membership for every request',async()=>{
    const m=database();
    expect(await authenticateAdmin(request(),m.db)).toEqual({id:owner,role:'owner'});
    expect(await authenticateAdmin(request(),m.db)).toEqual({id:owner,role:'owner'});
    expect(m.getUser).toHaveBeenCalledTimes(2); expect(m.membership).toHaveBeenCalledTimes(2);
    expect(m.from).toHaveBeenCalledWith('jobvance_admin_members');
    expect(m.eq).toHaveBeenCalledWith('user_id',owner); expect(m.eq).toHaveBeenCalledWith('active',true);
    m.membership.mockResolvedValueOnce({data:null,error:null});
    await expect(authenticateAdmin(request(),m.db)).rejects.toMatchObject({status:403,code:'ADMIN_FORBIDDEN'});
  });
  it('denies missing/expired sessions and editable metadata cannot grant an administrator',async()=>{
    const m=database(null);
    await expect(authenticateAdmin(request(),m.db)).rejects.toMatchObject({status:403});
    await expect(authenticateAdmin(new Request('https://private.invalid'),m.db)).rejects.toMatchObject({status:401});
    expect(m.getUser).toHaveBeenCalledTimes(1);
    m.getUser.mockResolvedValueOnce({data:{user:null},error:new Error('expired')} as unknown as Awaited<ReturnType<typeof m.getUser>>);
    await expect(authenticateAdmin(request(),m.db)).rejects.toMatchObject({status:401});
  });
  it('rejects unbounded controls, unsupported routes/reasoning, credentials and role-management payloads',()=>{
    const config={schedulerEnabled:false,monthlyCapUsd:50,routerEnabled:false,defaultModel:'openai/gpt-6.1-sol',reasoning:'medium'};
    expect(validateAdminAction({action:'update_config',expectedVersion:0,config})).toEqual({action:'update_config',expectedVersion:0,config});
    for(const change of [{monthlyCapUsd:51},{monthlyCapUsd:NaN},{monthlyCapUsd:0},{monthlyCapUsd:0.0000001},{reasoning:'max'},{defaultModel:'arbitrary/model'},{apiKey:'fictional'}]) expect(()=>validateAdminAction({action:'update_config',expectedVersion:0,config:{...config,...change}})).toThrow(ApiError);
    expect(validateAdminAction({action:'support_detail',id:owner})).toEqual({action:'support_detail',id:owner});
    for(const input of [{action:'snapshot',days:14},{action:'snapshot',days:'30'},{action:'provider_status',apiKey:'fictional'},{action:'set_role',userId:owner,role:'owner'},{action:'update_support',id:owner,expectedVersion:-1,status:'resolved'},{action:'support_detail'},{action:'support_detail',id:owner,allMessages:true},{action:'support_detail',id:'not-a-uuid'}]) expect(()=>validateAdminAction(input)).toThrow(ApiError);
  });
  it('fences a revoked role inside the RPC and never calls a provider after denial',async()=>{
    const m=database(); m.rpc.mockResolvedValueOnce({data:null,error:{message:'ADMIN_FORBIDDEN secret database detail'}} as unknown as Awaited<ReturnType<typeof m.rpc>>);
    const fetcher=vi.fn();
    await expect(controlAdmin(m.db,{id:owner,role:'owner'},{action:'provider_status'},()=>undefined,fetcher)).rejects.toMatchObject({status:403,message:'Your account does not have access to this administration action.'});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('makes operator controls fail closed, leaving settings unchanged',async()=>{
    const m=database('operator'); const config={schedulerEnabled:true,monthlyCapUsd:50,routerEnabled:true,defaultModel:'openai/gpt-6.1-sol',reasoning:'medium'} as const;
    await expect(controlAdmin(m.db,{id:owner,role:'operator'},{action:'update_config',expectedVersion:0,config},()=>undefined)).rejects.toMatchObject({status:403});
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('returns sanitized provider status without a paid model probe and appends safe audit metadata',async()=>{
    const m=database();const fetcher=vi.fn();
    const response=await controlAdmin(m.db,{id:owner,role:'owner'},{action:'provider_status'},()=>undefined,fetcher);
    expect(response.providerStatus).toMatchObject({configured:false,valid:null,status:'not_configured'});
    expect(fetcher).not.toHaveBeenCalled();
    expect(m.rpc).toHaveBeenLastCalledWith('jobvance_admin_record_event',{p_actor:owner,p_action:'provider_status',p_details:{configured:false,valid:null}});
    expect(JSON.stringify(response)).not.toContain('fictional-test-token');
  });
  it('requests only the selected support receipt via its fresh-role RPC and never contacts a model',async()=>{
    const m=database('operator');
    m.rpc.mockResolvedValueOnce({data:{id:owner,message:'Explicitly selected saved support note'},error:null} as unknown as Awaited<ReturnType<typeof m.rpc>>);
    const fetcher=vi.fn();
    const response=await controlAdmin(m.db,{id:owner,role:'operator'},{action:'support_detail',id:owner},()=>undefined,fetcher);
    expect(response).toEqual({supportDetail:{id:owner,message:'Explicitly selected saved support note'}});
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('jobvance_admin_support_detail',{p_actor:owner,p_id:owner});
    expect(fetcher).not.toHaveBeenCalled();
    m.rpc.mockResolvedValueOnce({data:null,error:{message:'ADMIN_FORBIDDEN private detail'}} as unknown as Awaited<ReturnType<typeof m.rpc>>);
    await expect(controlAdmin(m.db,{id:owner,role:'operator'},{action:'support_detail',id:owner},()=>undefined,fetcher)).rejects.toMatchObject({status:403,code:'ADMIN_FORBIDDEN'});
  });
  it('makes scheduler readiness depend on live server configuration and records the requested window',async()=>{
    const m=database(); const snapshot={operations:{scheduler:{enabled:true,ready:false,message:''}}} as AdminSnapshot;
    m.rpc.mockResolvedValueOnce({data:snapshot,error:null} as unknown as Awaited<ReturnType<typeof m.rpc>>);
    const response=await controlAdmin(m.db,{id:owner,role:'owner'},{action:'snapshot',days:7},()=>undefined);
    expect(response.snapshot?.operations.scheduler.ready).toBe(false);
    expect(m.rpc).toHaveBeenLastCalledWith('jobvance_admin_record_event',{p_actor:owner,p_action:'snapshot',p_details:{days:7}});
  });
  it('routes bounded dashboard reads through the actor-checked RPC and records only safe read metadata',async()=>{
    const m=database(); const fetcher=vi.fn();
    for (const days of [7,30,90]) expect(validateAdminAction({action:'dashboard',days})).toEqual({action:'dashboard',days});
    for (const input of [{action:'dashboard',days:null},{action:'dashboard',days:'30'},{action:'dashboard',days:365},{action:'dashboard',days:30,p_actor:'someone-else'}]) expect(()=>validateAdminAction(input)).toThrow(ApiError);
    const response=await controlAdmin(m.db,{id:owner,role:'owner'},{action:'dashboard',days:90},()=>undefined,fetcher);
    expect(response).toEqual({dashboard:{}});
    expect(m.rpc.mock.calls).toEqual([
      ['jobvance_admin_dashboard',{p_actor:owner,p_days:90}],
      ['jobvance_admin_record_event',{p_actor:owner,p_action:'snapshot',p_details:{days:90}}],
    ]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a revoked dashboard role without returning data or auditing a successful read',async()=>{
    const m=database(); const fetcher=vi.fn();
    m.rpc.mockResolvedValueOnce({data:null,error:{message:'ADMIN_FORBIDDEN private details'}} as unknown as Awaited<ReturnType<typeof m.rpc>>);
    await expect(controlAdmin(m.db,{id:owner,role:'owner'},{action:'dashboard',days:30},()=>undefined,fetcher)).rejects.toMatchObject({status:403,code:'ADMIN_FORBIDDEN'});
    expect(m.rpc).toHaveBeenCalledExactlyOnceWith('jobvance_admin_dashboard',{p_actor:owner,p_days:30});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('routes analytics, contact, visit and person reads through actor-checked RPCs with safe audit metadata',async()=>{
    const m=database(); const visit='00000000-0000-4000-8000-0000000000b1';
    m.rpc.mockImplementation(async(name:string)=>({data:name==='jobvance_admin_contacts'?[{userId:owner},{userId:visit}]:{},error:null}));
    expect(validateAdminAction({action:'analytics',days:7})).toEqual({action:'analytics',days:7});
    expect(validateAdminAction({action:'contacts'})).toEqual({action:'contacts'});
    expect(validateAdminAction({action:'visit',id:visit.toUpperCase()})).toEqual({action:'visit',id:visit});
    expect(validateAdminAction({action:'person',id:owner})).toEqual({action:'person',id:owner});
    for(const input of [{action:'analytics',days:14},{action:'contacts',all:true},{action:'visit',id:'not-a-uuid'},{action:'person'},{action:'person',id:owner,phone:'+1'}]) expect(()=>validateAdminAction(input)).toThrow(ApiError);
    await controlAdmin(m.db,{id:owner,role:'owner'},{action:'analytics',days:30},()=>undefined);
    expect(await controlAdmin(m.db,{id:owner,role:'operator'},{action:'contacts'},()=>undefined)).toEqual({contacts:[{userId:owner},{userId:visit}]});
    await controlAdmin(m.db,{id:owner,role:'owner'},{action:'visit',id:visit},()=>undefined);
    await controlAdmin(m.db,{id:owner,role:'owner'},{action:'person',id:owner},()=>undefined);
    expect(m.rpc.mock.calls).toEqual([
      ['jobvance_admin_analytics',{p_actor:owner,p_days:30}],['jobvance_admin_record_event',{p_actor:owner,p_action:'snapshot',p_details:{days:30}}],
      ['jobvance_admin_contacts',{p_actor:owner}],['jobvance_admin_record_event',{p_actor:owner,p_action:'snapshot',p_details:{count:2}}],
      ['jobvance_admin_session',{p_actor:owner,p_session:visit}],['jobvance_admin_record_event',{p_actor:owner,p_action:'snapshot',p_target:visit,p_details:{}}],
      ['jobvance_admin_person',{p_actor:owner,p_user:owner}],['jobvance_admin_record_event',{p_actor:owner,p_action:'snapshot',p_target:owner,p_details:{}}],
    ]);
  });
});
