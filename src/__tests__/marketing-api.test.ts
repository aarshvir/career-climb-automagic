import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: null as null | {user:{id:string};access_token:string}, invoke: vi.fn(), getUser: vi.fn(), listener: null as null | ((event: string, session: unknown) => void), unsubscribe: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: async () => mocks.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getUser: mocks.getUser,
  onAuthStateChange: (callback: typeof mocks.listener) => { mocks.listener = callback; return {data:{subscription:{unsubscribe:mocks.unsubscribe}}}; },
}, functions: { invoke: mocks.invoke } } }));
import { callMarketing } from '@/lib/marketing-api';
const session = (id: string, marker = '11111111-1111-4111-8111-111111111111', refresh = 'old') => ({user:{id},access_token:`${refresh}.${btoa(JSON.stringify({sub:id,session_id:marker}))}.signature`});
beforeEach(() => { vi.clearAllMocks(); mocks.session=session('owner'); mocks.listener=null; mocks.getUser.mockImplementation(async () => ({data:{user:{id:'owner'}},error:null})); mocks.invoke.mockResolvedValue({data:null,error:null}); });
describe('marketing request identity', () => {
  it('binds the explicit original token and clones the action before waiting', async () => {
    const original = mocks.session!.access_token;
    const action = {action:'create_idea' as const,title:'Original idea',angle:'original'};
    const pending = callMarketing('owner',action); action.title='later edit';
    await expect(pending).rejects.toMatchObject({kind:'unavailable'});
    expect(mocks.invoke).toHaveBeenCalledWith('jobvance-marketing',{body:{action:'create_idea',title:'Original idea',angle:'original'},headers:{Authorization:`Bearer ${original}`}});
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it.each(['owner switch','same-owner new session','A to B to A'])('rejects a result after %s', async change => {
    mocks.invoke.mockImplementation(async () => {
      const original=mocks.session;
      mocks.session=change==='same-owner new session'?session('owner','22222222-2222-4222-8222-222222222222'):session('other');
      mocks.listener!('SIGNED_IN',mocks.session);
      if(change==='A to B to A'){ mocks.session=original; mocks.listener!('SIGNED_IN',original); }
      return {data:null,error:null};
    });
    await expect(callMarketing('owner',{action:'overview'})).rejects.toMatchObject({kind:'unauthenticated'});
  });
  it('keeps a refreshed token in the same SDK session valid for response validation', async () => {
    mocks.invoke.mockImplementation(async () => { mocks.session=session('owner',undefined,'refreshed'); mocks.listener!('TOKEN_REFRESHED',mocks.session); return {data:null,error:null}; });
    // An invalid response reaches the shape check, rather than being rejected as a new session.
    await expect(callMarketing('owner',{action:'overview'})).rejects.toMatchObject({kind:'unavailable'});
  });
  it('does not contact the function when verified ownership differs', async () => {
    mocks.getUser.mockResolvedValue({data:{user:{id:'other'}},error:null});
    await expect(callMarketing('owner',{action:'sync'})).rejects.toMatchObject({kind:'unauthenticated'});
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('cancels before dispatch when A to B to A happens during initial verification', async () => {
    mocks.getUser.mockImplementationOnce(async () => {
      const original=mocks.session;
      mocks.session=session('other'); mocks.listener!('SIGNED_IN',mocks.session);
      mocks.session=original; mocks.listener!('SIGNED_IN',original);
      return {data:{user:{id:'owner'}},error:null};
    });
    await expect(callMarketing('owner',{action:'create_idea',title:'Original idea',angle:''})).rejects.toMatchObject({kind:'unauthenticated'});
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
