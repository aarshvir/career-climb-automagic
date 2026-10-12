// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
import {configuredUsageCap,nextScheduledInstant,normalizeFollowUp,validateScheduleInput} from '../functions/_shared/job-loop-schedule.ts';
import {modelOptions,employerFeeds,readEmployerFeed} from '../functions/_shared/job-loop-providers.ts';
import {validateControlInput,processDueSchedules,matchesDiscoveryTarget} from '../functions/_shared/job-loop-runtime.ts';
import {buildInterviewBrief} from '../functions/_shared/job-loop-preparation.ts';
import {composePacket} from '../functions/_shared/job-loop-engine.ts';
import {renderPacket} from '../functions/_shared/job-loop-render.ts';
import type {LoopRepository,ScheduleRow} from '../functions/_shared/job-loop-repository.ts';
import type {LoopScheduleInput,LoopProfile,LoopClaim,LoopOpportunity,LoopPacket} from '../functions/_shared/job-loop-types.ts';
const schedule:LoopScheduleInput={cadence:'daily',timezone:'Asia/Dubai',localTime:'08:30',weeklyDay:null,provider:'rules',model:'grounded-rules-v1',modelConsent:false,inboxConsent:false};
const profile:LoopProfile={audience:'professional',name:'Fictional candidate',contactLine:'',targetTitles:['Business analyst'],locations:['Dubai'],experienceYears:7,languages:[],pageTarget:2,discreetSearch:true,sourceText:'Fictional employer\nPrepared a detailed business analysis and documented the assumptions.',excludedTerms:[],compensation:{currency:'AED',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-11T00:00:00Z'};
const claim:LoopClaim={id:'fictional-claim',revision:1,status:'active',createdAt:profile.updatedAt,sourceKind:'cv_passage',sourceQuote:'Prepared a detailed business analysis and documented the assumptions.',phrasing:'Prepared a detailed business analysis and documented the assumptions.',context:'Fictional employer',kind:'employment',resultStatus:'not_measured',confirmed:true,shareable:true};
const opportunity:LoopOpportunity={id:'22222222-2222-4222-a222-222222222222',title:'Business Analyst',company:'Fictional employer',location:'Dubai, United Arab Emirates',url:'https://careers.example.com/fictional',description:'Prepare detailed business analysis and document assumptions. At least 5 years of relevant experience. Sponsorship is not offered for this role.',contact:null,source:'employer_api',sourceKey:'fixture',checkedAt:profile.updatedAt,verification:'listed_on_source',status:'saved',followUpAt:null,notes:''};
describe('recurring schedule and grounded preparation boundaries',()=>{
  it('calculates local Dubai, weekday and weekly times without using the server timezone',()=>{
    expect(nextScheduledInstant(schedule,new Date('2026-10-11T03:00:00Z'))).toBe('2026-10-11T04:30:00.000Z');
    expect(nextScheduledInstant(schedule,new Date('2026-10-11T04:30:00Z'))).toBe('2026-10-12T04:30:00.000Z');
    expect(nextScheduledInstant({...schedule,cadence:'weekdays'},new Date('2026-10-09T04:31:00Z'))).toBe('2026-10-12T04:30:00.000Z');
    expect(nextScheduledInstant({...schedule,cadence:'weekly',weeklyDay:1},new Date('2026-10-11T03:00:00Z'))).toBe('2026-10-12T04:30:00.000Z');
  });
  it('skips a nonexistent daylight-saving time and runs a repeated local hour only once',()=>{
    expect(nextScheduledInstant({...schedule,timezone:'America/New_York',localTime:'02:30'},new Date('2026-03-08T06:00:00Z'))).toBe('2026-03-09T06:30:00.000Z');
    expect(nextScheduledInstant({...schedule,timezone:'America/New_York',localTime:'01:30'},new Date('2026-11-01T04:00:00Z'))).toBe('2026-11-01T05:30:00.000Z');
    expect(nextScheduledInstant({...schedule,timezone:'America/New_York',localTime:'01:30'},new Date('2026-11-01T05:45:00Z'))).toBe('2026-11-02T06:30:00.000Z');
  });
  it('fails closed on invalid schedule consent, timezone, privileged fields and an increased paid budget',()=>{
    expect(()=>validateScheduleInput({...schedule,timezone:'MadeUp/Zone'})).toThrow(/timezone/);expect(()=>validateScheduleInput({...schedule,provider:'openai',modelConsent:false})).toThrow(/permission/);
    expect(()=>validateControlInput({action:'save_schedule',expectedScheduleVersion:0,schedule,recurringConsent:false})).toThrow(/permission/);
    expect(()=>validateControlInput({action:'save_schedule',expectedScheduleVersion:0,schedule:{...schedule,userId:'forged'},recurringConsent:true})).toThrow(/unsupported/);
    const env=(name:string)=>({JOB_LOOP_MONTHLY_CAP_USD:'51',JOB_LOOP_PAID_APIS_ENABLED:'true',OPENAI_API_KEY:'fixture-only'}[name]);
    expect(()=>configuredUsageCap(env)).toThrow(/at most US\$50/);expect(modelOptions(env).every(item=>!item.ready)).toBe(true);expect(configuredUsageCap(name=>name==='JOB_LOOP_MONTHLY_CAP_USD'?'5':undefined)).toBe(5);
  });
  it('keeps date-only reminders as calendar dates and rejects impossible or timezone-less dates',()=>{
    expect(normalizeFollowUp('2026-10-15')).toBe('2026-10-15');expect(normalizeFollowUp('2026-10-15T12:00:00+04:00')).toBe('2026-10-15T08:00:00.000Z');
    for(const value of ['2026-02-30','2026-10-15T12:00:00','2026-10-15T24:00:00Z','2026-02-30T12:00:00Z'])expect(()=>normalizeFollowUp(value)).toThrow();
  });
  it('uses only three documented feed defaults and preserves encoded employer conditions in full text',async()=>{
    expect(employerFeeds(()=>undefined).map(item=>item.board)).toEqual(['careem','gocardless','duolingo']);
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({jobs:[{id:1,title:'Business Analyst',absolute_url:opportunity.url,location:{name:opportunity.location},content:'&lt;p&gt;Prepare business analysis and document assumptions.&lt;/p&gt;&lt;p&gt;We do not provide sponsorship. Applicants need at least five years of experience.&lt;/p&gt;'}]})));
    const result=await readEmployerFeed({provider:'greenhouse',board:'fictional',company:'Fictional employer'},fetcher);expect(result.opportunities[0].description).toContain('We do not provide sponsorship.');expect(result.opportunities[0].description).not.toContain('&lt;');expect(result.opportunities[0].description).not.toContain('<p>');expect(fetcher).toHaveBeenCalledTimes(1);
    expect(matchesDiscoveryTarget(profile,result.opportunities[0])).toBe(true);expect(matchesDiscoveryTarget(profile,{...result.opportunities[0],location:'London'})).toBe(false);
  });
  it('produces five prompts using approved evidence and preserves projections without creating a recruiter recipient',()=>{
    const packet={claimVersions:{[claim.id]:1},assessment:{gaps:['Sponsorship is not offered for this role.']},contact:null} as unknown as LoopPacket;
    const brief=buildInterviewBrief(profile,[claim,{...claim,id:'withdrawn',status:'withdrawn',phrasing:'An invented achievement to exclude.'}],opportunity,packet);
    expect(brief).toHaveLength(5);expect(brief[1].evidenceClaimIds).toEqual([claim.id]);expect(JSON.stringify(brief)).toContain(claim.sourceQuote);expect(JSON.stringify(brief)).not.toContain('invented achievement');expect(brief[4].prompt).toContain('No recipient has been verified');
  });
  it('selects a bounded CV from a long confirmed record while retaining every employment and education context',async()=>{
    const facts=Array.from({length:48},(_,index)=>{const context=index<40?`Fictional employer ${index%5}`:'Fictional university';const phrasing=`Prepared business analysis and documented the assumptions for a fictional internal review. ${'Kept the original evidence and explained the limitations to the project team. '.repeat(2)}Reviewed item ${index}.`;return {...claim,id:`bounded-${index}`,sourceKind:'user_answer' as const,context,kind:index<40?'employment' as const:'education' as const,sourceQuote:`${context}: ${phrasing}`,phrasing};});
    const packet=await composePacket({profile:{...profile,pageTarget:2},claims:facts,opportunity,runId:'11111111-1111-4111-a111-111111111111'});
    expect(Object.keys(packet.claimVersions).length).toBeLessThanOrEqual(16);for(const context of new Set(facts.map(value=>value.context)))expect(packet.cvText).toContain(context);
    for(const line of packet.cvText.split('\n').filter(value=>value.startsWith('• ')))expect(facts.some(fact=>line===`• ${fact.phrasing}`)).toBe(true);
    const rendered=await renderPacket({profile:{...profile,pageTarget:2},packet});expect(rendered.pageCount).toBeLessThanOrEqual(2);expect(rendered.packet.formatStatus?.pdf.ready).toBe(true);
  });
  it('dispatches a durable occurrence with stable request ID, recovers saved work and advances without catch-up flooding',async()=>{
    const owner='11111111-1111-4111-a111-111111111111';const row:ScheduleRow={user_id:owner,version:1,status:'active',settings:schedule,next_run_at:'2026-10-10T04:30:00Z',lease_token:null,lease_until:null,last_run_id:null,last_attempt_at:null,message:''};
    const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>name==='job_loop_scheduler_state'?{ready:true}:name==='job_loop_claim_due'?[{...row,lease_token:args.p_lease}]:name==='job_loop_start_scheduled_run'?{id:opportunity.id,status:'queued'}:null);
    const repo={rpc,record:vi.fn(async()=>({version:1,data:{profile,claims:[claim],opportunities:[opportunity],inbox:[]}})),requestRun:vi.fn(async()=>null),recoverableRuns:vi.fn(async()=>[{id:'33333333-3333-4333-a333-333333333333'}])} as unknown as LoopRepository;
    const fetcher=vi.fn(async()=>new Response('{}',{status:202})),env=(name:string)=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'}[name]);
    expect(await processDueSchedules(repo,env,fetcher)).toEqual({claimed:1,started:1,recovered:1});const first=rpc.mock.calls.find(item=>item[0]==='job_loop_start_scheduled_run')?.[1].p_request;
    await processDueSchedules(repo,env,fetcher);expect(rpc.mock.calls.filter(item=>item[0]==='job_loop_start_scheduled_run')[1][1].p_request).toBe(first);
    const finish=rpc.mock.calls.find(item=>item[0]==='job_loop_finish_schedule')?.[1];expect(Date.parse(String(finish?.p_next))).toBeGreaterThan(Date.now());expect(fetcher.mock.calls.every(item=>String(item[0]).startsWith('https://fixture.supabase.co/functions/v1/job-loop-worker'))).toBe(true);
  });
});
