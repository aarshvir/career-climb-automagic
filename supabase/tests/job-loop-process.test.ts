// @vitest-environment node
import { describe,it,expect,vi } from 'vitest';
import { processLoopPhase,canReplayPreparation } from '../functions/_shared/job-loop-runtime.ts';
import { LoopRepository,type RecordRow,type RunRow,type RunState } from '../functions/_shared/job-loop-repository.ts';
import { digest, DISCOVERY_BUDGET } from '../functions/_shared/job-loop-providers.ts';
import { ApiError } from '../functions/_shared/core.ts';
import type { LoopPacket,LoopOpportunity } from '../functions/_shared/job-loop-types.ts';
const owner='11111111-1111-4111-a111-111111111111';const id='22222222-2222-4222-a222-222222222222';const hash='a'.repeat(64);
function harness(){
  const opportunity:LoopOpportunity={id:'33333333-3333-4333-a333-333333333333',title:'Graduate analyst',company:'Fictional employer',location:'Dubai',url:'https://careers.example.com/graduate',description:'Analyse a new domain and communicate findings. The candidate may have transferable coursework evidence but this posting asks for different tools.',contact:null,source:'manual',sourceKey:'manual:explicit',checkedAt:'2026-10-11T00:00:00Z',verification:'user_provided',status:'saved',followUpAt:null,notes:''};
  const record:RecordRow={user_id:owner,version:1,input_version:1,updated_at:'2026-10-11T00:00:00Z',data:{profile:{audience:'student',name:'Fictional Candidate',contactLine:'',targetTitles:['Graduate analyst'],locations:['Dubai'],experienceYears:null,languages:[],pageTarget:1,discreetSearch:false,sourceText:'Academic project\nCoursework report\nPrepared a coursework report about fictional retail operations and documented the assumptions.',excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-11T00:00:00Z'},claims:[{id:'claim-one',revision:1,status:'active',createdAt:'2026-10-11T00:00:00Z',sourceKind:'cv_passage',sourceQuote:'Prepared a coursework report about fictional retail operations and documented the assumptions.',phrasing:'Prepared a coursework report about fictional retail operations and documented the assumptions.',context:'Coursework report',kind:'academic_project',resultStatus:'not_measured',confirmed:true,shareable:true}],opportunities:[opportunity],inbox:[]}};
  const run:RunRow={id,user_id:owner,request_id:id,request_hash:hash,input_hash:hash,input_version:1,snapshot:structuredClone(record.data),provider:'rules',model:'grounded-rules-v1',consents:{model:false,inbox:false},data:{},status:'queued',phase:0,lease_token:null,lease_until:null,created_at:'2026-10-11T00:00:00Z',finished_at:null};
  const packets:LoopPacket[]=[];const artifacts=new Map<string,Uint8Array>();let cancelledBeforeCommit=false;
  const mock={
    claimRun:vi.fn(async()=>{if(run.status==='cancelled')return null;run.lease_token=crypto.randomUUID();run.status='running';return structuredClone(run);}),
    record:vi.fn(async(user:string)=>{expect(user).toBe(owner);return structuredClone(record);}),
    collections:vi.fn(async()=>({runs:[],packets:packets.map(data=>({id:data.id,user_id:owner,input_version:1,status:data.status,data})),usage:[],connection:null})),
    commit:vi.fn(async(active:RunRow,phase:number,status:RunRow['status'],state:RunState,values:LoopPacket[]=[],opportunities:LoopOpportunity[]=[])=>{if(cancelledBeforeCommit||active.lease_token!==run.lease_token||record.input_version!==active.input_version)throw new ApiError(409,'LOOP_LEASE_LOST','cancelled');run.phase=phase;run.status=status;run.data=structuredClone(state);run.lease_token=null;packets.push(...structuredClone(values));record.data.opportunities.push(...opportunities);return structuredClone(run);}),
    upload:vi.fn(async(active:RunRow,packet:string,key:string,bytes:Uint8Array)=>{const path=`${active.user_id}/${packet}/${await digest(bytes)}/${key}`;artifacts.set(path,bytes);return path;}),
    reserve:vi.fn(()=>{throw new Error('A disabled paid provider must never be reached.');}),
  };
  return {repo:mock as unknown as LoopRepository,mock,record,run,packets,artifacts,cancelAtCommit:()=>{cancelledBeforeCommit=true;}};
}
describe('checkpointed actual rule-engine cloud phases',()=>{
  it('continues through persisted phases and builds a low-score manual student packet without any paid call',async()=>{
    const h=harness();const network=vi.fn(()=>{throw new Error('No external provider configured.');});const env=(name:string)=>name==='JOB_LOOP_EMPLOYER_FEEDS'?'[]':undefined;
    let again=true;let requests=0;while(again&&requests<10){again=await processLoopPhase(h.repo,id,env,network);requests++;}
    expect(requests).toBeGreaterThan(3);expect(h.run.status).toBe('partial');expect(h.packets).toHaveLength(1);expect(h.packets[0].status).toBe('review_required');expect(h.packets[0].pageCount).toBe(1);expect(h.packets[0].cvText).toContain('ACADEMIC PROJECTS');expect(h.packets[0].cvText).toContain('Prepared a coursework report');expect(h.packets[0].connectionNote).toBe('');expect(Object.keys(h.packets[0].artifacts)).toEqual(expect.arrayContaining(['pdf','docx','txt','report','letter']));
    expect(h.run.data.lanes).toEqual(expect.arrayContaining([expect.objectContaining({name:'Broad web search',status:'not_run'})]));expect(h.run.data.nextAction).toMatch(/prepared CV.*available/);expect(network).not.toHaveBeenCalled();expect(h.mock.reserve).not.toHaveBeenCalled();
    for(const artifact of Object.values(h.packets[0].artifacts)){expect(artifact.path).toContain(`/${artifact.sha256}/`);expect(await digest(h.artifacts.get(artifact.path)!)).toBe(artifact.sha256);}
  });
  it('cannot publish rendered results after cancellation or source-generation change',async()=>{
    const h=harness();h.run.phase=2;h.run.data={opportunities:[h.record.data.opportunities[0]],packetIds:[],lanes:[],messages:[]};h.cancelAtCommit();
    expect(await processLoopPhase(h.repo,id,()=>undefined)).toBe(false);expect(h.packets).toHaveLength(0);expect(h.artifacts.size).toBeGreaterThan(0);
  });
  it('does not prepare a newly applied opportunity from a stale discovery snapshot',async()=>{
    const h=harness();h.run.phase=2;h.run.data={opportunities:[structuredClone(h.record.data.opportunities[0])],packetIds:[],lanes:[],messages:[]};h.record.data.opportunities[0].status='applied';
    expect(await processLoopPhase(h.repo,id,()=>undefined)).toBe(true);expect(h.packets).toHaveLength(0);expect(h.mock.upload).not.toHaveBeenCalled();expect(h.run.data.messages?.join(' ')).toMatch(/history was preserved/);
  });
});

function selectedHarness(two=false){
  const h=harness();const first=h.record.data.opportunities[0];
  h.record.data.opportunities=[first,{...first,id:'44444444-4444-4444-a444-444444444444',title:'Second vacancy'},{...first,id:'55555555-5555-4555-a555-555555555555',title:'Third vacancy'}];
  h.run.lifecycle_generation=0;h.run.selected_generation=0;h.run.snapshot=structuredClone(h.record.data);h.run.selected_opportunity_ids=two?[h.record.data.opportunities[2].id,first.id]:[h.record.data.opportunities[2].id];return h;
}
const noNetwork=()=>{throw new Error('Selected preparation must not discover or read inbox.');};
async function drain(h:ReturnType<typeof harness>){let n=0;while(await processLoopPhase(h.repo,id,()=>undefined,noNetwork)){if(++n>10)throw new Error('Phase loop');}}
describe('explicit selected-vacancy worker foundation',()=>{
  it('prepares the third vacancy first and only that vacancy with real rendered artifacts',async()=>{
    const h=selectedHarness();await drain(h);expect(h.run.status).toBe('completed');expect(h.packets.map(p=>p.opportunityId)).toEqual(h.run.selected_opportunity_ids);expect(h.artifacts.size).toBeGreaterThan(0);expect(h.mock.reserve).not.toHaveBeenCalled();expect(h.run.data.lanes?.map(l=>l.name)).toEqual(['Selected vacancies']);
  });
  it('preserves the chosen two-vacancy order',async()=>{const h=selectedHarness(true);await drain(h);expect(h.packets.map(p=>p.opportunityId)).toEqual(h.run.selected_opportunity_ids);});
  it('ignores mutable phase wording and uses the admitted immutable source',async()=>{
    const h=selectedHarness();await processLoopPhase(h.repo,id,()=>undefined);await processLoopPhase(h.repo,id,()=>undefined);
    h.run.data.opportunities![0].title='Injected vacancy';h.run.data.opportunities![0].description='Injected body';await drain(h);expect(h.packets[0].title).not.toBe('Injected vacancy');expect(JSON.stringify(h.packets[0])).not.toContain('Injected body');expect(h.packets[0].opportunityId).toBe(h.run.selected_opportunity_ids![0]);
  });
  it.each(['omit','replace','reorder'] as const)('fails closed on %s phase selection',async mode=>{
    const h=selectedHarness(true);await processLoopPhase(h.repo,id,()=>undefined);await processLoopPhase(h.repo,id,()=>undefined);
    if(mode==='omit'){h.run.data.opportunities=[];h.run.data.opportunityIds=[];}
    if(mode==='replace'){h.run.data.opportunities=[h.record.data.opportunities[1]];h.run.data.opportunityIds=[h.record.data.opportunities[1].id];}
    if(mode==='reorder'){h.run.data.opportunities!.reverse();h.run.data.opportunityIds!.reverse();}
    await drain(h);expect(h.run.status).toBe('blocked');expect(h.mock.upload).not.toHaveBeenCalled();expect(h.mock.reserve).not.toHaveBeenCalled();
  });
  it.each(['changed','removed','closed','provenance'] as const)('blocks %s source before rendering',async mode=>{
    const h=selectedHarness();if(mode==='changed')h.record.data.opportunities[2].description+='Changed';else if(mode==='closed')h.record.data.opportunities[2].verification='closed_confirmed';else if(mode==='provenance')h.record.data.opportunities[2].sourceKey='manual:other';else h.record.data.opportunities.pop();await drain(h);expect(h.run.status).toBe('blocked');expect(h.mock.upload).not.toHaveBeenCalled();
  });
  it('preserves later applied progress without preparing it again',async()=>{const h=selectedHarness();h.record.data.opportunities[2].status='applied';await drain(h);expect(h.packets).toHaveLength(0);expect(h.record.data.opportunities[2].status).toBe('applied');});
  it('retains the exact existing packet without upload or another model reservation',async()=>{
    const h=selectedHarness();await drain(h);const original=h.packets[0];h.mock.upload.mockClear();h.run.phase=0;h.run.status='queued';h.run.data={};await drain(h);expect(h.packets).toHaveLength(1);expect(h.run.data.reusedPacketIds).toEqual([original.id]);expect(h.mock.upload).not.toHaveBeenCalled();expect(h.mock.reserve).not.toHaveBeenCalled();
  });
  it('rejects a selected snapshot from another lifecycle',async()=>{const h=selectedHarness();h.run.selected_generation=1;await drain(h);expect(h.run.status).toBe('blocked');expect(h.mock.upload).not.toHaveBeenCalled();});
  it('rejects inbox expansion and a discovery-wide replay of the selected intent',async()=>{
    const h=selectedHarness();expect(await canReplayPreparation(h.run,h.record.data,{provider:'rules',model:h.run.model,modelConsent:false,inboxConsent:false})).toBe(false);
    h.run.consents.inbox=true;await drain(h);expect(h.run.status).toBe('blocked');expect(h.mock.upload).not.toHaveBeenCalled();
  });
});


describe('first-result outcome guidance from actual worker phases', () => {
  const feed = JSON.stringify([{provider:'greenhouse',board:'example',company:'Example employer'}]);
  const env = (name:string) => name==='JOB_LOOP_EMPLOYER_FEEDS' ? feed : undefined;
  it.each(['empty','failed'] as const)('distinguishes a %s employer read without asking to reconfirm valid facts', async mode => {
    const h=harness(); h.record.data.opportunities=[]; h.run.snapshot=structuredClone(h.record.data);
    const fetcher=vi.fn(async()=>mode==='failed'?new Response('',{status:503}):Response.json({jobs:[]}));
    for(let n=0;n<12;n++) if(!await processLoopPhase(h.repo,id,env,fetcher)) break;
    expect(h.run.status).toBe(mode==='failed'?'partial':'completed');
    expect(h.run.data.nextAction).toMatch(mode==='failed'?/source checks could not finish/:/No new matching jobs.*sources checked/);
    expect(h.run.data.nextAction).not.toMatch(/confirm.*evidence/);
    expect(h.mock.reserve).not.toHaveBeenCalled(); expect(h.mock.upload).not.toHaveBeenCalled();
    expect(h.run.data.lanes?.some(l=>l.name.includes('LinkedIn'))).toBe(false);
  });
  it('reads the supported maximum of eight boards, one lane each, and reports the failed one on its own', async () => {
    const many = JSON.stringify(Array.from({length:8},(_,i)=>({provider:'greenhouse',board:`b${i}`,company:`Example employer ${i}`})));
    const manyEnv = (name:string) => name==='JOB_LOOP_EMPLOYER_FEEDS' ? many : undefined;
    const h=harness(); h.record.data.opportunities=[]; h.run.snapshot=structuredClone(h.record.data);
    const fetcher=vi.fn(async(url:unknown)=>String(url).includes('/boards/b3/')?new Response('',{status:503}):Response.json({jobs:[]}));
    for(let n=0;n<12;n++) if(!await processLoopPhase(h.repo,id,manyEnv,fetcher)) break;
    expect(fetcher).toHaveBeenCalledTimes(8);
    const lanes=h.run.data.lanes??[];
    expect(lanes.filter(l=>/^greenhouse:b\d$/.test(l.name))).toHaveLength(8);
    expect(lanes.find(l=>l.name==='greenhouse:b3')).toMatchObject({status:'blocked',count:0});
    expect(lanes.find(l=>l.name==='greenhouse:b0')).toMatchObject({status:'completed',count:0});
    expect(h.run.status).toBe('partial');
    expect(h.mock.reserve).not.toHaveBeenCalled(); expect(h.mock.upload).not.toHaveBeenCalled();
  });
  it.each([9,60])('rejects a %i-board override with an explicit blocked lane instead of an empty market', async count => {
    const feed = JSON.stringify(Array.from({length:count},(_,i)=>({provider:'greenhouse',board:`b${i}`,company:`Example employer ${i}`})));
    const tooMany = (name:string) => name==='JOB_LOOP_EMPLOYER_FEEDS' ? feed : undefined;
    const h=harness(); h.record.data.opportunities=[]; h.run.snapshot=structuredClone(h.record.data);
    const fetcher=vi.fn(async()=>Response.json({jobs:[]}));
    for(let n=0;n<12;n++) if(!await processLoopPhase(h.repo,id,tooMany,fetcher)) break;
    expect(fetcher).not.toHaveBeenCalled();
    expect(h.run.data.lanes?.find(l=>l.name==='Employer API sources')).toMatchObject({status:'blocked',count:0,message:expect.stringMatching(/more than 8 boards.*rejected.*no board was read/)});
    expect(h.run.status).toBe('partial');
    expect(h.run.data.nextAction).toMatch(/source checks could not finish/);
  });
  it.each(['held','missing'] as const)('does not call %s output ready', async state => {
    const h=selectedHarness();h.run.phase=7;h.run.data={packetIds:['p'],lanes:[],messages:[]};
    if(state==='held')h.packets.push({id:'p',status:'held'} as LoopPacket);
    await processLoopPhase(h.repo,id,env);
    expect(h.run.data.nextAction).toMatch(state==='held'?/needs attention/:/availability could not be confirmed/);
    expect(h.run.data.nextAction).not.toMatch(/available\./);expect(h.mock.upload).not.toHaveBeenCalled();
  });
  it('keeps selected-only no-work guidance about the selected application, not a search it never did', async () => {
    const h=selectedHarness();h.record.data.opportunities[2].status='applied';
    await drain(h);
    expect(h.run.data.nextAction).toContain('chosen vacancies no longer need a new CV');
    expect(h.run.data.nextAction).not.toMatch(/matching jobs|broader roles/);
  });
  it('can resume an unavailable final result read without another upload or provider call', async () => {
    const h=harness();h.run.phase=7;h.run.data={packetIds:['p'],lanes:[],messages:[]};
    h.mock.collections.mockRejectedValueOnce(new Error('Temporary read unavailable'));
    await processLoopPhase(h.repo,id,env);expect(h.run.status).toBe('blocked');
    await processLoopPhase(h.repo,id,env);expect(h.run.status).toBe('completed');
    expect(h.mock.upload).not.toHaveBeenCalled();expect(h.mock.reserve).not.toHaveBeenCalled();
  });
});


describe('one overall discovery time budget, in deterministic virtual time, through the actual phase', () => {
  const searchEnv = (feeds: string) => (name: string) => name === 'JOB_LOOP_EMPLOYER_FEEDS' ? feeds : name === 'JOB_LOOP_PAID_APIS_ENABLED' ? 'true' : name === 'JOB_LOOP_TAVILY_API_KEY' ? 'fixture-only' : undefined;
  const leverBoards = (count: number) => JSON.stringify(Array.from({ length: count }, (_, i) => ({ provider: 'lever', board: `l${i}`, company: `Lever ${i}` })));
  const page = () => Response.json(Array.from({ length: 100 }, (_, i) => ({ id: `p-${i}`, text: 'Warehouse Operator', hostedUrl: `https://jobs.example.com/${i}`, descriptionPlain: 'Pick and pack orders at a fictional depot.', categories: { location: 'Austin, TX' } })));
  const tavily = () => Response.json({ results: [], usage: { credits: 1 } });
  const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }); });
  /** Runs the actual phases with fake timers so every wait is virtual and exact; returns the virtual end time of the last request. */
  async function drainVirtual(h: ReturnType<typeof harness>, env: (name: string) => string | undefined, fetcher: (url: unknown, init?: RequestInit) => Promise<Response>) {
    vi.useFakeTimers();
    try {
      const started = Date.now(); let lastEnd = 0, done = false;
      const timed = async (url: unknown, init?: RequestInit) => { const response = await fetcher(url, init); lastEnd = Date.now() - started; return response; };
      const work = (async () => { for (let n = 0; n < 14; n++) if (!await processLoopPhase(h.repo, id, env, timed as never)) break; })().finally(() => { done = true; });
      for (let guard = 0; !done && guard < 6000; guard++) await vi.advanceTimersByTimeAsync(100);
      await work;
      return lastEnd;
    } finally { vi.useRealTimers(); }
  }
  function searchHarness() {
    const h = harness(); h.record.data.opportunities = [];
    h.record.data.profile.targetTitles = ['Graduate analyst', 'Operations analyst'];
    h.run.snapshot = structuredClone(h.record.data);
    const reserve = vi.fn(async () => ({ id: 'reservation-1', is_new: true, status: 'reserved' })), settle = vi.fn(async () => undefined);
    Object.assign(h.mock, { reserve, settle });
    return { h, reserve, settle };
  }

  it("the supported eight Lever boards, every page at 11.9 s and every search at 14.9 s, end inside the budget; unread boards and searches are reported, nothing is reserved", async () => {
    const { h, reserve } = searchHarness();
    const fetcher = vi.fn(async (url: unknown) => { const target = String(url); if (target.includes('api.tavily.com')) { await wait(14900); return tavily(); } await wait(11900); return page(); });
    const end = await drainVirtual(h, searchEnv(leverBoards(8)), fetcher);
    expect(end).toBeLessThanOrEqual(DISCOVERY_BUDGET.totalMs); // unbudgeted this was 142.8 s of board reads + 29.8 s of searches = 172.6 s
    expect(end).toBe(107100); // exact virtual time of the last request: boards 0-5 end at 107.1 s; board 6 would need to start at 107.1 s with 2.9 s left
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('api.lever.co'))).toHaveLength(18); // six boards x three pages; boards 6 and 7 never started
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('api.tavily.com'))).toHaveLength(0);
    expect(reserve).not.toHaveBeenCalled();
    const lanes = h.run.data.lanes ?? [];
    for (const name of ['lever:l0', 'lever:l1', 'lever:l2', 'lever:l3', 'lever:l4', 'lever:l5']) expect(lanes.find(l => l.name === name)).toMatchObject({ status: 'partial' });
    for (const name of ['lever:l6', 'lever:l7']) expect(lanes.find(l => l.name === name)).toMatchObject({ status: 'blocked', count: 0, message: expect.stringMatching(/^Not read: time budget.*not treated as an empty market/) });
    expect(lanes.find(l => l.name === 'Broad web search')).toMatchObject({ status: 'partial', message: expect.stringMatching(/Not attempted: time budget \(2 of 2 queries\)/) });
    expect(h.run.status).toBe('partial');
  });
  it('an optional search near the deadline: the first fits and is reserved and settled, the second is not started and not reserved', async () => {
    const { h, reserve, settle } = searchHarness();
    const fetcher = vi.fn(async (url: unknown) => { const target = String(url); if (target.includes('api.tavily.com')) { await wait(14900); return tavily(); } await wait(7500); return page(); });
    const end = await drainVirtual(h, searchEnv(leverBoards(8)), fetcher); // boards end at 90.0 s, the first search at 104.9 s
    expect(end).toBeLessThanOrEqual(DISCOVERY_BUDGET.totalMs);
    expect(end).toBe(104900);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('api.lever.co'))).toHaveLength(24);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('api.tavily.com'))).toHaveLength(1);
    expect(reserve).toHaveBeenCalledTimes(1); expect(settle).toHaveBeenCalledTimes(1);
    expect(h.run.data.lanes?.find(l => l.name === 'Broad web search')).toMatchObject({ status: 'partial', message: expect.stringMatching(/1 bounded title\/location queries attempted of 2 target titles\. Not attempted: time budget \(1 of 2 queries\)/) });
  });
  it('a mixed run is unchanged: fast boards complete, a hanging board and a failing board are plain failures (not time budget), both searches run and are reserved', async () => {
    const { h, reserve, settle } = searchHarness();
    const feeds = JSON.stringify([
      { provider: 'lever', board: 'fast-a', company: 'Fast A' }, { provider: 'lever', board: 'fast-b', company: 'Fast B' },
      { provider: 'greenhouse', board: 'ok-a', company: 'Ok A' }, { provider: 'greenhouse', board: 'ok-b', company: 'Ok B' },
      { provider: 'greenhouse', board: 'hangs', company: 'Hangs' }, { provider: 'greenhouse', board: 'fails', company: 'Fails' },
    ]);
    const fetcher = vi.fn(async (url: unknown) => {
      const target = String(url);
      if (target.includes('api.tavily.com')) { await wait(1000); return tavily(); }
      if (target.includes('/boards/hangs/')) { await wait(12000); throw new DOMException('timeout', 'TimeoutError'); } // its own 12 s request timeout
      if (target.includes('/boards/fails/')) { await wait(500); return new Response('', { status: 503 }); }
      await wait(1000);
      return target.includes('api.lever.co') ? Response.json([]) : Response.json({ jobs: [] });
    });
    const end = await drainVirtual(h, searchEnv(feeds), fetcher);
    expect(end).toBeLessThan(40000);
    const lanes = h.run.data.lanes ?? [];
    for (const name of ['lever:fast-a', 'lever:fast-b', 'greenhouse:ok-a', 'greenhouse:ok-b']) expect(lanes.find(l => l.name === name)).toMatchObject({ status: 'completed', count: 0 });
    for (const name of ['greenhouse:hangs', 'greenhouse:fails']) expect(lanes.find(l => l.name === name)).toMatchObject({ status: 'blocked', message: expect.stringMatching(/^Source read failed or was blocked/) });
    expect(lanes.some(l => /time budget/i.test(l.message))).toBe(false);
    expect(reserve).toHaveBeenCalledTimes(2); expect(settle).toHaveBeenCalledTimes(2);
    expect(lanes.find(l => l.name === 'Broad web search')).toMatchObject({ status: 'completed' });
  });
});
