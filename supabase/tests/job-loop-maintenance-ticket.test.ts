import { describe, expect, it, vi } from 'vitest';
import { consumeMaintenanceTicket } from '../functions/_shared/job-loop-maintenance-ticket';

const ticket='a2d317db-7aac-4444-a074-489ef031d278';
const env=(name:string)=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-key',JOB_LOOP_ENABLED:'false',JOB_LOOP_PAID_APIS_ENABLED:'false'}[name]);
const request=(headers:Record<string,string>={})=>new Request('https://fixture.supabase.co/functions/v1/job-loop-worker',{method:'POST',headers});
describe('purpose-bound maintenance dispatch',()=>{
  it.each([{}, {'x-job-loop-schedule-ticket':ticket}, {Authorization:'Bearer candidate'}, {'x-job-loop-secret':'fixture-server-key'}, {'x-job-loop-maintenance-ticket':'invalid'}])('rejects another authority without persistence: %j',async headers=>{
    const fetcher=vi.fn(async()=>{throw Error('Unauthorized request reached persistence');});
    expect(await consumeMaintenanceTicket(request(headers),env,fetcher)).toBe(false);expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses only the fixed first-party purpose RPC and does not depend on preparation readiness',async()=>{
    let consumed=false;
    const fetcher=vi.fn(async(url,init)=>{
      expect(String(url)).toBe('https://fixture.supabase.co/rest/v1/rpc/job_loop_gc_consume_ticket');
      expect(init.redirect).toBe('error');expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fixture-server-key');
      expect(JSON.parse(init.body)).toEqual({p_ticket:ticket});const valid=!consumed;consumed=true;return Response.json(valid);
    });
    expect(await consumeMaintenanceTicket(request({'x-job-loop-maintenance-ticket':ticket}),env,fetcher)).toBe(true);
    expect(await consumeMaintenanceTicket(request({'x-job-loop-maintenance-ticket':ticket}),env,fetcher)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([new Response('unavailable',{status:503}),Response.json('true'),Response.json({ok:true}),new Response('not json'),new Response(' '.repeat(21)+'true')])('fails closed on an invalid service response',async response=>{
    expect(await consumeMaintenanceTicket(request({'x-job-loop-maintenance-ticket':ticket}),env,async()=>response)).toBe(false);
  });
  it('does not contact insecure or missing origins and treats network errors as rejection',async()=>{
    const fetcher=vi.fn(async()=>{throw Error('network fixture');});
    expect(await consumeMaintenanceTicket(request({'x-job-loop-maintenance-ticket':ticket}),()=>undefined,fetcher)).toBe(false);
    expect(await consumeMaintenanceTicket(request({'x-job-loop-maintenance-ticket':ticket}),name=>name==='SUPABASE_URL'?'http://fixture.supabase.co':env(name),fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await consumeMaintenanceTicket(request({'x-job-loop-maintenance-ticket':ticket}),env,fetcher)).toBe(false);
  });
});
