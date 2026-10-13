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
});
