// @vitest-environment node
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { FIXED_ORIGIN, parsePublicConfig, parseTicketInput, readHiddenTicket, runAdminTicket, sanitizeWorkerResponse } from '../../../scripts/run-admin-ticket.mjs';

const ticket='00000000-0000-4000-8000-000000000002';
const usageId='00000000-0000-4000-8000-000000000005';
const jwt=(role='anon',ref='gvftdfriujrkpptdueyb')=>'e30.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.fictional-public-signature';
const config=(key=jwt(),origin=FIXED_ORIGIN)=>'VITE_SUPABASE_URL='+origin+'\nVITE_SUPABASE_PUBLISHABLE_KEY='+key+'\n';
describe('hidden-input administration runner',()=>{
  it('accepts only an action and UUID ticket, not payload or origin overrides',()=>{
    expect(parseTicketInput(JSON.stringify({action:'provider_status',ticket}))).toEqual({action:'provider_status',ticket});
    for(const bad of [{action:'provider_status',ticket,model:'override'},{action:'snapshot',ticket},{action:'provider_status',ticket:'not-a-ticket'},[],null])expect(()=>parseTicketInput(JSON.stringify(bad))).toThrow();
  });
  it('requires fixed-project public configuration and rejects privileged or foreign keys',()=>{
    expect(parsePublicConfig(config())).toEqual({url:FIXED_ORIGIN,key:jwt()});
    for(const bad of [config(jwt('service_role')),config(jwt('anon','other-project')),config('sb_secret_private'),config(jwt(),'https://attacker.invalid'),config()+'VITE_SUPABASE_URL='+FIXED_ORIGIN])expect(()=>parsePublicConfig(bad)).toThrow();
  });
  it('suppresses echo, restores terminal state and never writes the input to output',async()=>{
    const input=Object.assign(new EventEmitter(),{isTTY:true,isRaw:false,setRawMode:vi.fn(),resume:vi.fn(),pause:vi.fn()});
    const output={isTTY:true,write:vi.fn()}; const promise=readHiddenTicket(input,output);
    input.emit('data',Buffer.from(JSON.stringify({action:'provider_status',ticket})+'\r'));
    expect(await promise).toEqual({action:'provider_status',ticket}); expect(input.setRawMode.mock.calls).toEqual([[true],[false]]);
    expect(output.write.mock.calls.join('')).not.toContain(ticket);expect(input.listenerCount('data')).toBe(0);expect(input.pause).toHaveBeenCalled();
  });
  it('refuses piped stdin and cleans up after cancellation',async()=>{
    expect(()=>readHiddenTicket({isTTY:false},{isTTY:true})).toThrow();
    const input=Object.assign(new EventEmitter(),{isTTY:true,isRaw:false,setRawMode:vi.fn(),resume:vi.fn(),pause:vi.fn()});const output={isTTY:true,write:vi.fn()};const promise=readHiddenTicket(input,output);input.emit('data',Buffer.from('\u0003'));
    await expect(promise).rejects.toThrow('ADMIN_TICKET_INPUT_REJECTED'); expect(input.listenerCount('data')).toBe(0);expect(input.setRawMode).toHaveBeenLastCalledWith(false);
  });
  it('sends only a header ticket and action to the fixed worker, with redirect rejection',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({accepted:true,usageId,state:'reserved',rawHeaders:{secret:'must-not-be-output'},result:{reasoning:'must-not-be-output'}}),{status:202}));
    const result=await runAdminTicket({action:'independent_review',ticket},parsePublicConfig(config()),fetcher);
    expect(fetcher).toHaveBeenCalledWith(FIXED_ORIGIN+'/functions/v1/jobvance-review-worker',expect.objectContaining({method:'POST',redirect:'error',headers:{'Content-Type':'application/json',apikey:jwt(),'x-jobvance-task-ticket':ticket},body:'{"action":"independent_review"}'}));
    expect(result).toEqual({httpStatus:202,accepted:true,usageId,state:'reserved',resultAvailable:true}); expect(JSON.stringify(result)).not.toContain('must-not-be-output');
  });
  it('never sends a privileged key even through the exported invocation helper',async()=>{
    const fetcher=vi.fn();await expect(runAdminTicket({action:'provider_status',ticket},{url:FIXED_ORIGIN,key:jwt('service_role')},fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  });
  it('drops provider amounts, labels, messages and unknown error text from output',()=>{
    const status=sanitizeWorkerResponse({providerStatus:{configured:true,valid:true,status:'valid',checkedAt:'2026-10-12T00:00:00Z',message:'private text',usage:50,label:'private label'}},200);
    expect(status).toEqual({httpStatus:200,providerStatus:{configured:true,valid:true,status:'valid',checkedAt:'2026-10-12T00:00:00Z'}});
    expect(sanitizeWorkerResponse({code:'RAW_PROVIDER_SECRET',error:'private raw error'},503)).toEqual({httpStatus:503,code:'ADMIN_TICKET_RUNNER_FAILED'});
  });
});
