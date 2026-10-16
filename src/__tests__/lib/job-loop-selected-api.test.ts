import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopAction } from '../../../supabase/functions/_shared/job-loop-types';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: sdk.getUser }, functions: { invoke: sdk.invoke } } }));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: vi.fn() }));
import { boundLoopAction, callJobLoop } from '@/lib/job-loop-api';

const owner = '11111111-1111-4111-a111-111111111111', checkId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', opportunityId = '33333333-3333-4333-a333-333333333333';
const opportunity = { title: 'Analyst', company: 'Example employer', location: 'Dubai', url: 'https://example.test/jobs/1', description: 'Review customer research, document evidence and prepare reports for the product team.', contact: null };
const request = (): LoopAction => ({action:'start_selected_run',expectedGeneration:7,expectedVersion:1,requestId:checkId,opportunityIds:[opportunityId],prepareConsent:true,provider:'rules',model:'grounded-rules-v1',modelConsent:false});
function response() {
  return { runId:checkId,selectedRun:{requestId:checkId,runId:checkId,generation:7,opportunityIds:[opportunityId]}, snapshot: {
    lifecycleGeneration: 7, recordVersion: 2, profile: null, claims: [], runs: [], packets: [], inbox: [], models: [],
    opportunities: [{ ...opportunity, id: opportunityId, sourceCheckId: checkId, source: 'manual', sourceKey: `saved-check:${checkId}`, checkedAt: '2026-10-15T00:00:00Z', verification: 'user_provided', status: 'interview', notes: 'Keep this progress', followUpAt: '2026-10-20' }],
    capabilities: { cloudWorker: true, rulesEngine: true, webSearch: false, gmailRead: false, gmailDrafts: false, monthlyUsageCapUsd: 50, dailyRunLimit: 3 },
    gmail: { connected: false, email: null, status: 'Not connected', allowDrafts: false },
  } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks(); clearTrackingDraftMemory(); setTrackingDraftOwner(owner);
  sdk.session.mockResolvedValue({ user: { id: owner } });
  sdk.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  sdk.invoke.mockResolvedValue({ data: response(), error: null });
});
afterEach(() => { clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('selected preparation browser boundary, unpublished',()=>{
 it('sends only explicit chosen scope and keeps the exact receipt',async()=>{const result=await callJobLoop(owner,request());expect(sdk.invoke.mock.calls[0][1].body).toEqual(request());expect(result.selectedRun?.opportunityIds).toEqual([opportunityId]);});
 it.each([{prepareConsent:false},{expectedGeneration:undefined},{expectedVersion:1.5},{opportunityIds:[]},{opportunityIds:[opportunityId,opportunityId]},{userId:owner},{inboxConsent:false},{inputHash:'forged'},{processingRoute:'openrouter'},{provider:'openai',modelConsent:false}])('rejects unsafe action before auth or dispatch: %j',async patch=>{await expect(callJobLoop(owner,{...request(),...patch} as LoopAction)).rejects.toThrow();expect(sdk.getUser).not.toHaveBeenCalled();expect(sdk.invoke).not.toHaveBeenCalled();});
 it('captures the selection before awaiting auth',async()=>{const auth=deferred<unknown>();sdk.getUser.mockReturnValueOnce(auth.promise);const a=request(),pending=callJobLoop(owner,a);await vi.waitFor(()=>expect(sdk.getUser).toHaveBeenCalled());if(a.action==='start_selected_run'){a.opportunityIds[0]=owner;a.expectedGeneration=9;}auth.resolve({data:{user:{id:owner}},error:null});await pending;expect(sdk.invoke.mock.calls[0][1].body).toEqual(request());});
 it.each(['before','after'])('rejects same-owner sign-out/return %s dispatch',async phase=>{const wait=deferred<unknown>();if(phase==='before')sdk.getUser.mockReturnValueOnce(wait.promise);else sdk.invoke.mockReturnValueOnce(wait.promise);const pending=callJobLoop(owner,request()),rejected=expect(pending).rejects.toThrow('sign-in changed');await vi.waitFor(()=>expect(phase==='before'?sdk.getUser:sdk.invoke).toHaveBeenCalled());setTrackingDraftOwner(null);setTrackingDraftOwner(owner);wait.resolve(phase==='before'?{data:{user:{id:owner}},error:null}:{data:response(),error:null});await rejected;if(phase==='before')expect(sdk.invoke).not.toHaveBeenCalled();});
 it.each(['missing','request','run','generation','snapshot','selection'])('rejects mismatched %s receipt',async mode=>{const value=response();if(mode==='missing')delete value.selectedRun;if(mode==='request')value.selectedRun.requestId=owner;if(mode==='run')value.runId=owner;if(mode==='generation')value.selectedRun.generation=9;if(mode==='snapshot')value.snapshot.lifecycleGeneration=9;if(mode==='selection')value.selectedRun.opportunityIds=[owner];sdk.invoke.mockResolvedValue({data:value,error:null});await expect(callJobLoop(owner,request())).rejects.toThrow('could not be confirmed');});
 it('retains request identity after an ambiguous response',async()=>{sdk.invoke.mockRejectedValueOnce(new Error('offline'));await expect(callJobLoop(owner,request())).rejects.toThrow();await callJobLoop(owner,request());expect(sdk.invoke.mock.calls[0][1].body).toEqual(sdk.invoke.mock.calls[1][1].body);});
});
