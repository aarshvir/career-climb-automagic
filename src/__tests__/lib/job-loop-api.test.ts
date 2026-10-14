import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopAction } from '../../../supabase/functions/_shared/job-loop-types';
const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn(), cvs: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: sdk.getUser, onAuthStateChange: sdk.onAuthStateChange }, functions: { invoke: sdk.invoke } } }));
vi.mock('@/lib/cv-documents', () => ({ listCvDocuments: sdk.cvs }));
import { callJobLoop, getLoopDownload, getLoopPreview, isLoopHttpsUrl, loadLoopSavedCvs, safeLoopDownloadUrl, safeLoopGmailUrl, LOOP_ARTIFACT_TIMEOUT_MS, LOOP_ARTIFACT_MAX_BYTES } from '@/lib/job-loop-api';
import { validateAction as validateControlInput } from '../../../supabase/functions/_shared/job-loop-engine';
import { LoopServiceError } from '@/lib/loop-service-error';

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('VITE_SUPABASE_URL', 'https://qa.supabase.co');
  sdk.session.mockResolvedValue({ user: { id: 'owner-a' } }); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
  sdk.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: sdk.unsubscribe } } });
  sdk.invoke.mockResolvedValue({ data: { message: 'Synthetic action confirmed' }, error: null });
});
afterEach(() => { vi.useRealTimers();vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('cloud loop API privacy and owner boundaries', () => {
  it('keeps the paid route consent across browser parsing and server action validation',async()=>{
    const action={action:'start_run',requestId:'00000000-0000-4000-8000-000000000001',provider:'openai',model:'gpt-6.1-sol',modelConsent:true,inboxConsent:false,processingRoute:'openrouter'} as const;
    sdk.invoke.mockImplementationOnce(async(_name,options)=>{expect(validateControlInput(options.body)).toEqual(action);return{data:{message:'Synthetic action confirmed'},error:null};});
    await callJobLoop('owner-a',action);expect(sdk.invoke).toHaveBeenCalledWith('job-loop-control',{body:action});
  });
  it('keeps the existing rules action valid without any external route',async()=>{
    const action={action:'start_run',requestId:'00000000-0000-4000-8000-000000000001',provider:'rules',model:'grounded-rules-v1',modelConsent:false,inboxConsent:false} as const;
    sdk.invoke.mockImplementationOnce(async(_name,options)=>{expect(validateControlInput(options.body)).toEqual(action);return{data:{message:'Synthetic action confirmed'},error:null};});
    await callJobLoop('owner-a',action);
  });
  it('preserves the named router transport in a parsed server snapshot',async()=>{
    const snapshot={recordVersion:0,profile:null,claims:[],opportunities:[],runs:[],packets:[],inbox:[],models:[{provider:'openai',model:'gpt-6.1-sol',label:'GPT via OpenRouter',ready:true,transport:'openrouter',inputUsdPerMillion:2,outputUsdPerMillion:10}],capabilities:{cloudWorker:true,rulesEngine:true,webSearch:false,gmailRead:false,gmailDrafts:false,monthlyUsageCapUsd:50,dailyRunLimit:3},gmail:{connected:false,email:null,status:'Not connected',allowDrafts:false}};
    sdk.invoke.mockResolvedValueOnce({data:{snapshot},error:null});const result=await callJobLoop('owner-a',{action:'get'});expect(result.snapshot?.models[0].transport).toBe('openrouter');
  });
  it('strips unknown owner/endpoint/pricing fields instead of forwarding them', async () => {
    const action = { action: 'start_run', requestId: '00000000-0000-4000-8000-000000000001', provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false } as const;
    await callJobLoop('owner-a', { ...action, userId: 'owner-b', endpoint: 'https://untrusted.invalid', price: 0 } as unknown as LoopAction);
    expect(sdk.invoke).toHaveBeenCalledWith('job-loop-control', { body: action });
  });
  it.each([
    { action: 'start_run', requestId: '00000000-0000-4000-8000-000000000001', provider: 'openai', model: 'configured-test-model', modelConsent: false, inboxConsent: false },
    { action: 'approve_packet', packetId: 'packet-a', inputHash: 'hash-a', reviewedText: 'Synthetic CV', confirmFacts: true, confirmDisclosure: false },
    { action: 'gmail_create_draft', packetId: 'packet-a', requestId: '00000000-0000-4000-8000-000000000001', confirmRecipientAndAttachment: false },
    { action: 'gmail_finalize', ticket: 'synthetic-sealed-ticket', confirmMailbox: false },
    { action: 'save_schedule', expectedScheduleVersion:0, schedule:{cadence:'daily',timezone:'Asia/Dubai',localTime:'08:30',weeklyDay:null,provider:'rules',model:'grounded-rules-v1',modelConsent:false,inboxConsent:false}, recurringConsent:false },
    { action: 'erase_loop', confirmErase:false },
  ])('blocks missing contextual consent before any account or control request', async action => {
    await expect(callJobLoop('owner-a', action as LoopAction)).rejects.toThrow();
    expect(sdk.session).not.toHaveBeenCalled(); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('rejects an account mismatch before opening records', async () => {
    await expect(callJobLoop('owner-b', { action: 'get' })).rejects.toThrow('account changed'); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('does not return an in-flight response after the authenticated owner changes', async () => {
    let finish!: (response: unknown) => void;
    sdk.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = callJobLoop('owner-a', { action: 'suggest_claims' });
    await vi.waitFor(() => expect(sdk.invoke).toHaveBeenCalledOnce());
    sdk.session.mockResolvedValue({ user: { id: 'owner-b' } }); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-b' } }, error: null });
    finish({ data: { message: 'Private owner-a fixture must not return' }, error: null });
    await expect(pending).rejects.toThrow('account changed');
  });
  it('requires actual capability/record fields instead of treating malformed service data as an empty successful snapshot', async () => {
    sdk.invoke.mockResolvedValue({ data: { snapshot: { recordVersion: 0, models: [], capabilities: {} } }, error: null });
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('still being configured');
  });
  it('uses only the public JSON error field, never raw SDK debug output', async () => {
    sdk.invoke.mockResolvedValue({ data: null, error: { message: 'SYNTHETIC_PRIVATE_DEBUG', context: new Response(JSON.stringify({ debug: 'SYNTHETIC_PRIVATE_DEBUG' }), { status: 503 }) } });
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('still being configured');
    sdk.invoke.mockResolvedValue({ data: null, error: { message: 'SYNTHETIC_PRIVATE_DEBUG', context: new Response(JSON.stringify({ error: 'A configured processing allowance is unavailable.' }), { status: 503 }) } });
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('configured processing allowance');
  });
  it.each(['LOOP_ERASURE_IN_PROGRESS', 'LOOP_ERASURE_RETRY'])('preserves safe %s recovery codes after checking the owner again', async code => {
    sdk.invoke.mockResolvedValue({ data: null, error: {
      message: 'SYNTHETIC_PRIVATE_DEBUG',
      context: new Response(JSON.stringify({ error: 'Your Job Loop cleanup needs another confirmed attempt.', code, debug: 'SYNTHETIC_PRIVATE_DEBUG' }), { status: 409 }),
    } });
    const failure = await callJobLoop('owner-a', { action: 'get' }).catch(error => error);
    expect(failure).toBeInstanceOf(LoopServiceError);
    expect(failure).toMatchObject({ message: 'Your Job Loop cleanup needs another confirmed attempt.', code });
    expect(failure.message).not.toContain('SYNTHETIC_PRIVATE_DEBUG');
    expect(sdk.getUser).toHaveBeenCalledTimes(3);
  });
  it('preserves an erasure retry code in a validated service error response as well as HTTP errors', async () => {
    sdk.invoke.mockResolvedValue({ data: { error: 'Private cleanup still has documents to remove.', code: 'LOOP_ERASURE_RETRY' }, error: null });
    const failure = await callJobLoop('owner-a', { action: 'erase_loop', confirmErase: true }).catch(error => error);
    expect(failure).toBeInstanceOf(LoopServiceError);
    expect(failure).toMatchObject({ message: 'Private cleanup still has documents to remove.', code: 'LOOP_ERASURE_RETRY' });
  });
  it.each([
    'ERASURE_IN_PROGRESS', 'LOOP_ERASURE_RETRY\nPRIVATE_DEBUG', 'LOOP_<script>', 'LOOP_' + 'A'.repeat(81), { debug: 'PRIVATE_DEBUG' },
  ])('does not promote an invalid public error code into recovery state: %j', async code => {
    sdk.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'This operation needs review.', code }), { status: 503 }) } });
    const failure = await callJobLoop('owner-a', { action: 'get' }).catch(error => error);
    expect(failure).toBeInstanceOf(LoopServiceError);
    expect(failure.code).toBeNull();
    expect(failure.message).toBe('This operation needs review.');
  });
  it('suppresses a previous owner\'s erasure error when ownership changes while its public payload is being read', async () => {
    sdk.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({
      error: 'OWNER_A_PRIVATE_ERASURE_MESSAGE', code: 'LOOP_ERASURE_IN_PROGRESS',
    }), { status: 409 }) } });
    sdk.getUser.mockResolvedValueOnce({ data: { user: { id: 'owner-a' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'owner-a' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'owner-b' } }, error: null });
    const failure = await callJobLoop('owner-a', { action: 'get' }).catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(LoopServiceError);
    expect(failure.message).toContain('account changed');
    expect(failure.message).not.toContain('OWNER_A_PRIVATE_ERASURE_MESSAGE');
    expect(failure.code).toBeUndefined();
    expect(sdk.getUser).toHaveBeenCalledTimes(3);
  });
  it('does not surface raw exceptions thrown by SDK or auth initialization', async () => {
    sdk.invoke.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_DEBUG'));
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('still being configured');
    sdk.session.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_DEBUG'));
    await expect(callJobLoop('owner-a', { action: 'get' })).rejects.toThrow('sign in again');
  });
  it('rejects saved CV rows from another owner even when an unexpected client response includes them', async () => {
    sdk.cvs.mockResolvedValue([{ id: 'cv-b', user_id: 'owner-b', text_content: 'Synthetic private CV' }]);
    await expect(loadLoopSavedCvs('owner-a')).rejects.toThrow('did not match');
  });
  it('retains validated schedule, budget and attributed activity instead of silently dropping progress fields',async()=>{
    const snapshot={recordVersion:1,profile:null,claims:[],opportunities:[],runs:[],packets:[],inbox:[],models:[],capabilities:{cloudWorker:true,rulesEngine:true,webSearch:false,gmailRead:false,gmailDrafts:false,monthlyUsageCapUsd:50,dailyRunLimit:3,scheduler:true,packetsPerRun:2},gmail:{connected:false,email:null,status:'Not connected',allowDrafts:false},schedule:{version:1,status:'active',cadence:'daily',timezone:'Asia/Dubai',localTime:'08:30',weeklyDay:null,provider:'rules',model:'grounded-rules-v1',modelConsent:false,inboxConsent:false,nextRunAt:'2026-10-12T04:30:00Z',lastRunId:null,lastAttemptAt:null,message:'Enabled by you.'},budget:{month:'2026-10',capUsd:50,committedUsd:10,remainingUsd:40,scope:'shared_ai_search',maxPilotUsers:10},pilot:{enrolled:true,activeUsers:1,maxUsers:10},activity:[{id:'activity-one',kind:'application_status',actor:'candidate',at:'2026-10-11T10:00:00Z',summary:'You marked this opportunity applied.',opportunityId:'role-one',runId:null}]};
    sdk.invoke.mockResolvedValue({data:{snapshot},error:null});expect((await callJobLoop('owner-a',{action:'get'})).snapshot).toEqual(snapshot);
    sdk.invoke.mockResolvedValue({data:{snapshot:{...snapshot,budget:{...snapshot.budget,capUsd:51}}},error:null});await expect(callJobLoop('owner-a',{action:'get'})).rejects.toThrow('still being configured');
  });
  it('fetches only the exact owner-scoped current PDF preview and retains the immutable review hash',async()=>{
    const inputHash='a'.repeat(64),url='https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/packet/hash/pdf?token=synthetic';
    sdk.invoke.mockResolvedValue({data:{url,filename:'review.pdf'},error:null});const fetcher=vi.fn(async(_input:Request|string|URL)=>new Response(new Uint8Array([37,80,68,70]),{headers:{'Content-Type':'application/pdf'}}));vi.stubGlobal('fetch',fetcher);
    const preview=await getLoopPreview('owner-a','packet',inputHash);expect(preview.filename).toBe('review.pdf');expect(preview.blob.size).toBe(4);expect(sdk.invoke).toHaveBeenCalledWith('job-loop-control',{body:{action:'preview_packet',packetId:'packet',inputHash}});expect(fetcher.mock.calls[0][0]).toBe(url);
  });
});
describe('private document and OAuth destinations', () => {
  it.each(['session', 'getUser', 'invoke'] as const)('bounds a stalled %s prerequisite before requesting document bytes', async stage => {
    vi.useFakeTimers(); sdk[stage].mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn());
    const pending = getLoopDownload('owner-a', 'packet-a', 'pdf');
    const rejected = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(LOOP_ARTIFACT_TIMEOUT_MS); await rejected;
    expect(fetch).not.toHaveBeenCalled(); expect(sdk.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('ignores a late timed-out link and permits a fresh successful retry', async () => {
    vi.useFakeTimers();
    let finish!: (result: unknown) => void;
    sdk.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const url = 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf';
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]))); vi.stubGlobal('fetch', fetcher);
    const pending = getLoopPreview('owner-a', 'packet-a', 'a'.repeat(64));
    const rejected = expect(pending).rejects.toThrow('timed out');
    await vi.waitFor(() => expect(sdk.invoke).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(LOOP_ARTIFACT_TIMEOUT_MS); await rejected;
    finish({ data: { url: url + '?token=late', filename: 'fixture.pdf' }, error: null });
    await vi.advanceTimersByTimeAsync(0); expect(fetcher).not.toHaveBeenCalled();
    sdk.invoke.mockResolvedValueOnce({ data: { url: url + '?token=fresh', filename: 'fixture.pdf' }, error: null });
    expect((await getLoopPreview('owner-a', 'packet-a', 'a'.repeat(64))).blob.size).toBe(4);
    expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0][0]).toBe(url + '?token=fresh');
    expect(sdk.unsubscribe).toHaveBeenCalledTimes(2);
  });
  it.each(['headers','body'])('releases a stalled private %s transfer before a minute without losing owner checks',async(stage)=>{
    vi.useFakeTimers();
    sdk.invoke.mockResolvedValue({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.txt?token=synthetic',filename:'fixture.txt'},error:null});
    const cancel=vi.fn();
    const response=new Response(new ReadableStream<Uint8Array>({start(stream){stream.enqueue(new Uint8Array([65]));},cancel}));
    const fetcher=vi.fn((_url:unknown,_options:RequestInit)=>stage==='headers'?new Promise<Response>(()=>{}):Promise.resolve(response));vi.stubGlobal('fetch',fetcher);
    const pending=getLoopDownload('owner-a','packet-a','txt');const rejected=expect(pending).rejects.toThrow(/timed out/);
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());
    expect(LOOP_ARTIFACT_TIMEOUT_MS).toBeLessThan(60000);
    await vi.advanceTimersByTimeAsync(LOOP_ARTIFACT_TIMEOUT_MS+1);await rejected;
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
    if(stage==='body')expect(cancel).toHaveBeenCalledOnce();
    expect(sdk.unsubscribe).toHaveBeenCalledOnce();
  });
  it.each([undefined, '1'])('stops an actual oversized streamed body when its declared length is %s', async contentLength => {
    sdk.invoke.mockResolvedValue({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.txt?token=synthetic',filename:'fixture.txt'},error:null});
    const cancel=vi.fn();let bytesOffered=0;
    const stream=new ReadableStream<Uint8Array>({
      pull(controller){const size=bytesOffered<LOOP_ARTIFACT_MAX_BYTES?1024*1024:1;bytesOffered+=size;controller.enqueue(new Uint8Array(size));},
      cancel,
    },{highWaterMark:0});
    const headers=contentLength?{'content-length':contentLength}:undefined;
    const fetcher=vi.fn(async(_url:unknown,_options:RequestInit)=>new Response(stream,{headers}));vi.stubGlobal('fetch',fetcher);
    await expect(getLoopDownload('owner-a','packet-a','txt')).rejects.toThrow('exceeds the download limit');
    expect(bytesOffered).toBe(LOOP_ARTIFACT_MAX_BYTES+1);expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);expect(sdk.unsubscribe).toHaveBeenCalledOnce();
  });
  it('cancels before reading an oversized declared response',async()=>{
    sdk.invoke.mockResolvedValue({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.txt?token=synthetic',filename:'fixture.txt'},error:null});
    const pull=vi.fn(),cancel=vi.fn();
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new ReadableStream<Uint8Array>({pull,cancel},{highWaterMark:0}),{headers:{'content-length':String(LOOP_ARTIFACT_MAX_BYTES+1)}})));
    await expect(getLoopDownload('owner-a','packet-a','txt')).rejects.toThrow('exceeds the download limit');
    expect(pull).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledOnce();
  });
  it('returns complete streamed bytes at the limit with the original content type',async()=>{
    sdk.invoke.mockResolvedValue({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf?token=synthetic',filename:'fixture.pdf'},error:null});
    let sent=false;
    const stream=new ReadableStream<Uint8Array>({pull(controller){if(sent){controller.close();return;}sent=true;const chunk=new Uint8Array(LOOP_ARTIFACT_MAX_BYTES);chunk[0]=37;chunk[chunk.length-1]=70;controller.enqueue(chunk);}},{highWaterMark:0});
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(stream,{headers:{'content-type':'application/pdf'}})));
    const result=await getLoopDownload('owner-a','packet-a','pdf');
    expect(result.blob.size).toBe(LOOP_ARTIFACT_MAX_BYTES);expect(result.blob.type).toBe('application/pdf');
    const bytes=new Uint8Array(await new Promise<ArrayBuffer>((resolve,reject)=>{const file=new FileReader();file.onload=()=>resolve(file.result as ArrayBuffer);file.onerror=()=>reject(file.error);file.readAsArrayBuffer(result.blob);}));
    expect(bytes[0]).toBe(37);expect(bytes[bytes.length-1]).toBe(70);
    expect(sdk.getUser).toHaveBeenCalledTimes(3);expect(sdk.unsubscribe).toHaveBeenCalledOnce();
  });
  it.each(['owner-b',null])('immediately cancels an unfinished body when the authenticated owner becomes %s',async nextOwner=>{
    sdk.invoke.mockResolvedValue({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf?token=synthetic',filename:'fixture.pdf'},error:null});
    const cancel=vi.fn(),pull=vi.fn();
    const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array([37,80,68,70]));},pull,cancel});
    const fetcher=vi.fn(async(_url:unknown,_options:RequestInit)=>new Response(stream));vi.stubGlobal('fetch',fetcher);
    const pending=getLoopPreview('owner-a','packet-a','hash-a');const rejected=expect(pending).rejects.toThrow('account changed');
    await vi.waitFor(()=>expect(stream.locked).toBe(true));
    const nextSession=nextOwner?{user:{id:nextOwner}}:null;
    sdk.session.mockResolvedValue(nextSession);sdk.getUser.mockResolvedValue({data:{user:nextSession?.user??null},error:null});
    sdk.onAuthStateChange.mock.calls[0][0](nextOwner?'SIGNED_IN':'SIGNED_OUT',nextSession);
    await rejected;expect(cancel).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(sdk.unsubscribe).toHaveBeenCalledOnce();expect(stream.locked).toBe(false);
  });
  it('keeps the transfer alive for an auth refresh of the same owner',async()=>{
    sdk.invoke.mockResolvedValue({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf?token=synthetic',filename:'fixture.pdf'},error:null});
    let body!:ReadableStreamDefaultController<Uint8Array>;
    const stream=new ReadableStream<Uint8Array>({start(controller){body=controller;}});
    const fetcher=vi.fn(async(_url:unknown,_options:RequestInit)=>new Response(stream));vi.stubGlobal('fetch',fetcher);
    const pending=getLoopPreview('owner-a','packet-a','hash-a');
    await vi.waitFor(()=>expect(stream.locked).toBe(true));
    sdk.onAuthStateChange.mock.calls[0][0]('TOKEN_REFRESHED',{user:{id:'owner-a'}});
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(false);
    body.enqueue(new Uint8Array([37,80,68,70]));body.close();expect((await pending).blob.size).toBe(4);
  });
  it.each(['headers','body'])('immediately settles caller cancellation during %s, without waiting for the deadline',async(stage)=>{
    sdk.invoke.mockResolvedValue({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf?token=synthetic',filename:'fixture.pdf'},error:null});
    const controller=new AbortController(),cancel=vi.fn();
    const stream=new ReadableStream<Uint8Array>({cancel});
    const fetcher=vi.fn((_url:unknown,_options:RequestInit)=>stage==='headers'?new Promise<Response>(()=>{}):Promise.resolve(new Response(stream)));vi.stubGlobal('fetch',fetcher);
    const pending=getLoopDownload('owner-a','packet-a','pdf',controller.signal);const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await vi.waitFor(()=>{expect(fetcher).toHaveBeenCalledOnce();if(stage==='body')expect(stream.locked).toBe(true);});
    controller.abort();await rejected;
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);if(stage==='body')expect(cancel).toHaveBeenCalledOnce();
    expect(sdk.unsubscribe).toHaveBeenCalledOnce();
  });
  it('never requests a link for a caller that already cancelled',async()=>{
    const controller=new AbortController();controller.abort();vi.stubGlobal('fetch',vi.fn());
    await expect(getLoopDownload('owner-a','packet-a','pdf',controller.signal)).rejects.toMatchObject({name:'AbortError'});
    expect(sdk.invoke).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(sdk.onAuthStateChange).not.toHaveBeenCalled();
  });
  it('prevents a late signed link from starting a download after caller cancellation',async()=>{
    let finish!:(result:unknown)=>void;sdk.invoke.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const controller=new AbortController();vi.stubGlobal('fetch',vi.fn());
    const pending=getLoopDownload('owner-a','packet-a','pdf',controller.signal);const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await vi.waitFor(()=>expect(sdk.invoke).toHaveBeenCalledOnce());controller.abort();await rejected;
    finish({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf?token=late',filename:'fixture.pdf'},error:null});
    await vi.waitFor(()=>expect(sdk.getUser).toHaveBeenCalledTimes(2));expect(fetch).not.toHaveBeenCalled();expect(sdk.unsubscribe).toHaveBeenCalledOnce();
  });
  it('uses one deadline across delayed headers and an unfinished body',async()=>{
    vi.useFakeTimers();
    sdk.invoke.mockResolvedValue({data:{url:'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf?token=synthetic',filename:'fixture.pdf'},error:null});
    const cancel=vi.fn();const stream=new ReadableStream<Uint8Array>({cancel});
    let headers!:(response:Response)=>void;
    const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{headers=resolve;}));vi.stubGlobal('fetch',fetcher);
    const pending=getLoopDownload('owner-a','packet-a','pdf');const rejected=expect(pending).rejects.toThrow('timed out');
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(40000);headers(new Response(stream));
    await vi.advanceTimersByTimeAsync(1);expect(stream.locked).toBe(true);expect(cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);await rejected;expect(cancel).toHaveBeenCalledOnce();
  });
  it('requests a fresh signed link after an expired-link failure',async()=>{
    const path='https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf';
    sdk.invoke.mockResolvedValueOnce({data:{url:path+'?token=expired',filename:'fixture.pdf'},error:null}).mockResolvedValueOnce({data:{url:path+'?token=fresh',filename:'fixture.pdf'},error:null});
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('Expired',{status:403})).mockResolvedValueOnce(new Response(new Uint8Array([37,80,68,70])));vi.stubGlobal('fetch',fetcher);
    await expect(getLoopDownload('owner-a','packet-a','pdf')).rejects.toThrow('Request a fresh link');
    expect((await getLoopDownload('owner-a','packet-a','pdf')).blob.size).toBe(4);
    expect(fetcher.mock.calls.map(call=>call[0])).toEqual([path+'?token=expired',path+'?token=fresh']);expect(sdk.invoke).toHaveBeenCalledTimes(2);expect(sdk.unsubscribe).toHaveBeenCalledTimes(2);
  });
  it.each(['http://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf?token=fixture', 'https://untrusted.invalid/storage/v1/object/sign/job-loop-artifacts/owner-a/file.pdf', 'https://qa.supabase.co/storage/v1/object/sign/cv-documents/owner-a/file.pdf', 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-b/file.pdf', 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/%2Fother/file.pdf'])('rejects an unsafe document destination', url => {
    expect(() => safeLoopDownloadUrl(url, 'owner-a')).toThrow();
  });
  it('accepts only the exact project, signed-document bucket and owner path', () => {
    const url = 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/packet/file.pdf?token=synthetic';
    expect(safeLoopDownloadUrl(url, 'owner-a')).toBe(url);
  });
  it('rechecks owner after document bytes arrive and never hands them to a newly signed-in account', async () => {
    sdk.invoke.mockResolvedValue({ data: { url: 'https://qa.supabase.co/storage/v1/object/sign/job-loop-artifacts/owner-a/file.txt?token=synthetic', filename: 'fixture.txt' }, error: null });
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const pending = getLoopDownload('owner-a', 'packet-a', 'txt');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    sdk.session.mockResolvedValue({ user: { id: 'owner-b' } }); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-b' } }, error: null });
    finish(new Response('Fictional text'));
    await expect(pending).rejects.toThrow('account changed'); vi.unstubAllGlobals();
  });
  it('does not accept generic Google-looking or arbitrary OAuth URLs', () => {
    expect(() => safeLoopGmailUrl('https://accounts.google.com.untrusted.invalid/o/oauth2/v2/auth')).toThrow();
    expect(() => safeLoopGmailUrl('https://accounts.google.com/other')).toThrow();
    expect(() => safeLoopGmailUrl('https://accounts.google.com:444/o/oauth2/v2/auth')).toThrow();
    expect(safeLoopGmailUrl('https://accounts.google.com/o/oauth2/v2/auth?state=synthetic')).toContain('accounts.google.com');
    expect(isLoopHttpsUrl('https://user:password@example.test/job')).toBe(false);
    expect(isLoopHttpsUrl('javascript:alert(1)')).toBe(false);
  });
});
