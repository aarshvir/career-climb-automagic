import { ApiError, uuid } from './core.ts';
import { validateAction, validateProfile, validateClaim, validateOpportunity, suggestClaims, assessOpportunity, composePacket, eligibleLoopClaims, fingerprintLoopInputs } from './job-loop-engine.ts';
import { renderPacket } from './job-loop-render.ts';
import { LoopRepository, loopDatabaseError, publicRun, type RunRow, type RunState, type ScheduleRow, type CareerRecord, type RecordRow } from './job-loop-repository.ts';
import { configuredUsageCap, nextScheduledInstant } from './job-loop-schedule.ts';
import { buildInterviewBrief } from './job-loop-preparation.ts';
import { LIMITS, RULES_MODEL, digest, stableUuid, modelOptions, modelConfiguration, prepareModelRequest, callModel, searchReady, searchTavily, TAVILY_CREDIT_MICROS, employerFeeds, readEmployerFeed, safePublicUrl, type LoopEnv, type LoopFetch } from './job-loop-providers.ts';
import { beginGmail, createGmailDraft, gmailConfigured, readRecruitmentInbox,previewGmailTicket,finalizeGmailTicket } from '../job-loop-oauth/gmail.ts';
import type { LoopAction, LoopClaim, LoopLane, LoopOpportunity, LoopResponse, LoopSnapshot } from './job-loop-types.ts';
import { matchesDiscoveryTarget } from '../../../src/lib/employer-discovery.ts';
import { generationBoundAction } from './job-loop-request.ts';
export { matchesDiscoveryTarget } from '../../../src/lib/employer-discovery.ts';

export function validateControlInput(value: unknown): LoopAction {
  try { return validateAction(value); } catch(error) { throw new ApiError(400,'LOOP_INVALID_INPUT',error instanceof Error?error.message.slice(0,300):'Invalid loop input.'); }
}
export function selectPreparationOpportunities(profile:Parameters<typeof assessOpportunity>[0],claims:LoopClaim[],opportunities:LoopOpportunity[]):LoopOpportunity[]{
  return opportunities.filter(item=>['saved','prepared'].includes(item.status)&&item.verification!=='closed_confirmed').map(opportunity=>({opportunity,assessment:assessOpportunity(profile,claims,opportunity)}))
    .filter(item=>item.opportunity.source==='manual'||matchesDiscoveryTarget(profile,item.opportunity))
    .sort((a,b)=>Number(b.opportunity.source==='manual')-Number(a.opportunity.source==='manual')||Number(b.opportunity.status==='saved')-Number(a.opportunity.status==='saved')||b.assessment.score-a.assessment.score)
    .slice(0,LIMITS.packets).map(item=>item.opportunity);
}
export function workerEnabled(env: LoopEnv): boolean { return env('JOB_LOOP_ENABLED')!=='false' && !!env('SUPABASE_URL') && !!env('SUPABASE_SERVICE_ROLE_KEY'); }
export async function packetInputHash(profile:Parameters<typeof fingerprintLoopInputs>[0],claims:LoopClaim[],opportunity:LoopOpportunity):Promise<string>{
  return fingerprintLoopInputs(profile,claims,[{title:opportunity.title,company:opportunity.company,location:opportunity.location,url:opportunity.url,description:opportunity.description,contact:opportunity.contact}]);
}
/** Bind preparation to actual career/vacancy facts, while excluding listing
 * freshness timestamps, reminders and candidate-reported tracking metadata. */
export async function candidatePreparationHash(data:CareerRecord):Promise<string>{
  if(!data.profile)throw new ApiError(422,'LOOP_PROFILE_REQUIRED','Save a reviewed profile before starting.');
  const vacancies=[...data.opportunities].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(item=>({id:item.id,title:item.title,company:item.company,location:item.location,url:item.url,description:item.description,contact:item.contact,source:item.source,verification:item.verification}));
  return fingerprintLoopInputs(data.profile,data.claims,vacancies);
}
type PreparationChoices=Pick<Extract<LoopAction,{action:'start_run'}>,'provider'|'model'|'modelConsent'|'inboxConsent'|'processingRoute'>;
export async function preparationRequestHash(data:CareerRecord,choices:PreparationChoices):Promise<string>{return digest(JSON.stringify([choices.provider,choices.model,choices.modelConsent,choices.inboxConsent,await candidatePreparationHash(data),...(choices.provider==='rules'?[]:[choices.processingRoute??'direct'])]));}
export async function canReplayPreparation(run:RunRow,data:CareerRecord,action:PreparationChoices):Promise<boolean>{
  if(run.provider!==action.provider||run.model!==action.model||(run.consents.model===true)!==action.modelConsent||(run.consents.inbox===true)!==action.inboxConsent||!run.snapshot.profile||!data.profile)return false;
  if(run.provider!=='rules'&&(run.consents.processingRoute??'direct')!==(action.processingRoute??'direct'))return false;
  const originals=new Set(run.snapshot.opportunities.map(item=>item.id));
  if(data.opportunities.some(item=>item.source==='manual'&&!originals.has(item.id))||run.snapshot.opportunities.some(item=>!data.opportunities.some(current=>current.id===item.id)))return false;
  // Additional automatic discoveries belong to this run's output. Every
  // original vacancy must still have the same actual source facts, including
  // original automatically found vacancies; deletions and edits cannot hide.
  return await candidatePreparationHash(run.snapshot)===await candidatePreparationHash({...data,opportunities:data.opportunities.filter(item=>originals.has(item.id))});
}
export async function constantTimeEqual(left:string,right:string):Promise<boolean> {
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',new TextEncoder().encode(left)),crypto.subtle.digest('SHA-256',new TextEncoder().encode(right))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);let difference=0;for(let i=0;i<32;i++)difference|=x[i]^y[i];return difference===0;
}
export async function authenticateWorker(req:Request,env:LoopEnv):Promise<void> {
  const expected=env('JOB_LOOP_WORKER_SECRET')??env('SUPABASE_SERVICE_ROLE_KEY');
  const supplied=req.headers.get('x-job-loop-secret')??req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')??'';
  if(!expected||!await constantTimeEqual(supplied,expected))throw new ApiError(401,'LOOP_WORKER_UNAUTHORIZED','The background worker request is unauthorized.');
  if(!workerEnabled(env))throw new ApiError(503,'LOOP_DISABLED','Cloud runs are currently disabled.');
}
export async function dispatchWorker(runId:string,env:LoopEnv,fetcher:LoopFetch=fetch):Promise<void> {
  if(!workerEnabled(env))throw new ApiError(503,'LOOP_DISABLED','Cloud runs are currently disabled.');
  const endpoint=new URL('/functions/v1/job-loop-worker',env('SUPABASE_URL'));
  const response=await fetcher(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,'x-job-loop-secret':env('JOB_LOOP_WORKER_SECRET')??env('SUPABASE_SERVICE_ROLE_KEY')!},body:JSON.stringify({runId}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw new ApiError(503,'LOOP_WORKER_UNAVAILABLE','The run is saved, but the background worker could not be reached. Resume this run.');
}
export async function getLoopSnapshot(repo:LoopRepository,userId:string,env:LoopEnv,expectedGeneration?:number,initialize=false):Promise<LoopSnapshot> {
  let cap=50;try{cap=configuredUsageCap(env);}catch{/* Paid choices fail closed in modelOptions; the private record remains readable. */}
  if(expectedGeneration===undefined&&!initialize){
    const lifecycle=await repo.erasureStatus(userId);
    if(lifecycle.state==='erasing')throw new ApiError(409,'LOOP_ERASURE_IN_PROGRESS','Your Job Loop is being erased. Continue erasure before making another change.');
    if(lifecycle.state!=='active')throw new ApiError(409,'LOOP_REQUEST_STALE','Your Job Loop was erased. Refresh before continuing.');
    expectedGeneration=lifecycle.generation;
  }
  const record=await repo.record(userId,expectedGeneration,initialize);
  const snapshot=await snapshotFromRecord(repo,userId,env,record,cap);
  await repo.assertGeneration(userId,record.lifecycle_generation);
  return snapshot;
}
async function snapshotFromRecord(repo:LoopRepository,userId:string,env:LoopEnv,record:RecordRow,cap:number):Promise<LoopSnapshot> {
  const [collections,operations]=await Promise.all([repo.collections(userId),repo.operationalSnapshot(userId,cap)]);
  const available=workerEnabled(env);const gmailReady=gmailConfigured(env);const connected=!!collections.connection;
  return {lifecycleGeneration:record.lifecycle_generation,recordVersion:Number(record.version),profile:record.data.profile,claims:record.data.claims,opportunities:record.data.opportunities,runs:collections.runs.map(run=>publicRun(run,collections.usage)),packets:collections.packets.map(row=>({...row.data,status:row.status})),inbox:collections.runs.find(run=>run.data.inbox)?.data.inbox??record.data.inbox,models:modelOptions(env),capabilities:{cloudWorker:available,rulesEngine:available,webSearch:searchReady(env),gmailRead:gmailReady,gmailDrafts:gmailReady,monthlyUsageCapUsd:cap,dailyRunLimit:LIMITS.dailyRuns,scheduler:available&&operations.scheduler.ready,packetsPerRun:LIMITS.packets},gmail:{connected:gmailReady&&connected,email:gmailReady?collections.connection?.email??null:null,allowDrafts:gmailReady&&!!collections.connection?.allow_drafts,status:!gmailReady?'Mailbox integration is not configured.':connected?collections.connection?.allow_drafts?'Connected with read and draft permission.':'Connected read-only. Reconnect to request draft permission.':'Not connected. Google sign-in is separate.'},schedule:operations.schedule,activity:operations.activity,support:operations.support as LoopSnapshot['support'],budget:{month:String(operations.budget.month),capUsd:Number(operations.budget.capUsd),committedUsd:Number(operations.budget.committedUsd),remainingUsd:Number(operations.budget.remainingUsd),scope:'shared_ai_search',maxPilotUsers:10},pilot:{enrolled:operations.budget.enrolled===true,activeUsers:Number(operations.budget.activeUsers),maxUsers:10},recurringReady:available&&operations.scheduler.ready,employerSources:employerFeeds(env).map(feed=>({provider:feed.provider,board:feed.board,company:feed.company??feed.board}))};
}
/** A list/home read must never open, activate, enroll or continue erasure. Read
 * the durable lifetime again after all private collections so a delayed result
 * cannot cross erasure into a fresh workspace. No newer lifetime is adopted. */
export async function getExistingLoopSnapshot(repo:LoopRepository,userId:string,env:LoopEnv):Promise<LoopResponse> {
  const lifecycle=await repo.existingLifecycle(userId);
  if(lifecycle?.state==='erasing')return {existingState:'erasing',erasureGeneration:lifecycle.generation};
  if(lifecycle?.state==='erased')return {existingState:'absent'};
  const record=await repo.existingRecord(userId);
  if(!lifecycle){
    if(record)throw new ApiError(409,'LOOP_REQUEST_STALE','Open your saved Job Loop to confirm its current lifetime, then refresh Applications.');
    return {existingState:'absent'};
  }
  if(!record)return {existingState:'absent'};
  let cap=50;try{cap=configuredUsageCap(env);}catch{/* Existing private work remains readable without paid routing. */}
  const snapshot=await snapshotFromRecord(repo,userId,env,{...record,lifecycle_generation:lifecycle.generation},cap);
  const latestRecord=await repo.existingRecord(userId);
  const latestLifecycle=await repo.existingLifecycle(userId);
  if(latestLifecycle?.state==='erasing')return {existingState:'erasing',erasureGeneration:latestLifecycle.generation};
  if(!latestLifecycle||latestLifecycle.state==='erased')return {existingState:'absent'};
  if(latestLifecycle.generation!==lifecycle.generation)throw new ApiError(409,'LOOP_REQUEST_STALE','Your Job Loop changed lifetime while Applications loaded. Refresh before continuing.');
  if(!latestRecord)return {existingState:'absent'};
  if(latestRecord.version!==record.version||latestRecord.input_version!==record.input_version)throw new ApiError(409,'LOOP_VERSION_CONFLICT','Your Job Loop changed while Applications loaded. Refresh before continuing.');
  return {existingState:'active',snapshot};
}
export async function controlLoop(repo:LoopRepository,userId:string,action:LoopAction,env:LoopEnv,fetcher:LoopFetch=fetch):Promise<LoopResponse> {
  if(action.action==='get_existing')return getExistingLoopSnapshot(repo,userId,env);
  if(action.action==='get'){
    const lifecycle=await repo.erasureStatus(userId);
    if(lifecycle.state==='erasing')return {erasureGeneration:lifecycle.generation};
    return {snapshot:await getLoopSnapshot(repo,userId,env,undefined,true)};
  }
  // A retry must reach cleanup without first upserting a record through the
  // active-owner fence. Read a fresh empty snapshot only after verified finish.
  if(action.action==='erase_loop'||action.action==='erase_self'){
    if(!action.confirmErase)throw new ApiError(400,'LOOP_ERASE_CONFIRMATION','Confirm erasing the private record and generated documents.');
    await repo.eraseArtifacts(userId,action.expectedGeneration!);
    return {snapshot:await getLoopSnapshot(repo,userId,env,undefined,true),message:'Your Job Loop record, schedules, documents and mailbox connection were erased. Your sign-in account and separately saved workspace CVs remain; drafts already created in Gmail remain there.'};
  }
  if(generationBoundAction(action.action))await repo.assertGeneration(userId,action.expectedGeneration);
  const row=await repo.record(userId,action.expectedGeneration);const data=structuredClone(row.data);
  const finish=async(message?:string):Promise<LoopResponse>=>({snapshot:await getLoopSnapshot(repo,userId,env,action.expectedGeneration),...(message?{message}:{})});
  if(action.action==='save_schedule'){
    configuredUsageCap(env);if(!action.recurringConsent)throw new ApiError(400,'LOOP_RECURRING_CONSENT','Explicitly enable recurring preparation.');
    if(!data.profile||!eligibleLoopClaims(data.profile,data.claims).length)throw new ApiError(422,'LOOP_CLAIMS_REQUIRED','Save your target and confirm at least one shareable fact before scheduling.');
    if(action.schedule.provider==='rules'){if(action.schedule.model!==RULES_MODEL)throw new ApiError(400,'LOOP_MODEL_INVALID','Choose the current rules preparation method.');}
    else throw new ApiError(422,'LOOP_SCHEDULE_MODEL_UNAVAILABLE','Recurring preparation currently uses the rules method. Start a manual run to explicitly select a model and review its processing route.');
    const scheduler=await repo.rpc<{ready:boolean}>('job_loop_scheduler_state',{});if(!scheduler.ready)throw new ApiError(503,'LOOP_SCHEDULER_UNAVAILABLE','Recurring dispatch is not connected yet. Manual preparation remains available.');
    await repo.rpc('job_loop_save_schedule_bound',{p_user:userId,p_generation:action.expectedGeneration,p_expected:action.expectedScheduleVersion,p_settings:action.schedule,p_next:nextScheduledInstant(action.schedule)});return finish('Recurring preparation is enabled. You can pause or cancel it here; sending remains your choice.');
  }
  if(action.action==='pause_schedule'||action.action==='cancel_schedule'){await repo.rpc('job_loop_schedule_action_bound',{p_user:userId,p_generation:action.expectedGeneration,p_expected:action.expectedScheduleVersion,p_action:action.action==='pause_schedule'?'paused':'cancelled'});return finish();}
  if(action.action==='request_support'){
    await repo.rpc('job_loop_request_support',{p_user:userId,p_generation:action.expectedGeneration,p_category:action.category,p_message:action.message});
    return finish('Your request was saved privately with a receipt. It has not yet been reviewed; no response time is promised.');
  }
  if(action.action==='save_profile'){
    if(!action.saveConsent)throw new ApiError(400,'LOOP_STORAGE_CONSENT','Choose private record saving explicitly.');
    const profile=validateProfile(action.profile);data.profile={...profile,revision:(data.profile?.revision??0)+1,updatedAt:new Date().toISOString()};
    // A corrected source changes its provenance. Reconfirmation is required for imported passages.
    if(row.data.profile?.sourceText!==profile.sourceText)data.claims=data.claims.map(claim=>claim.sourceKind==='cv_passage'?{...claim,confirmed:false,shareable:false,revision:claim.revision+1}:claim);
    await repo.write(userId,action.expectedVersion,data,true);return finish('Career record saved. Review any claims that need reconfirmation.');
  }
  if(action.action==='suggest_claims'){if(!data.profile)throw new ApiError(422,'LOOP_PROFILE_REQUIRED','Save a reviewed career record first.');return {suggestions:suggestClaims(data.profile),snapshot:await getLoopSnapshot(repo,userId,env)};}
  if(action.action==='save_claim'){
    if(!data.profile)throw new ApiError(422,'LOOP_PROFILE_REQUIRED','Save a career record first.');
    let claim:ReturnType<typeof validateClaim>;
    try { claim=validateClaim(action.claim,data.profile); }
    catch(error) {
      if(error instanceof ApiError)throw error;
      throw new ApiError(422,'LOOP_CLAIM_INVALID','Review this claim’s complete source sentence and nearby course, project or employer heading, then save it again.');
    }
    const previous=action.id?data.claims.find(value=>value.id===action.id):undefined;
    if(action.id&&!previous)throw new ApiError(404,'LOOP_NOT_FOUND','That claim is unavailable in your record.');
    if(!previous&&data.claims.length>=150)throw new ApiError(422,'LOOP_RECORD_LIMIT','This pilot supports up to 150 recorded claims.');
    const saved:LoopClaim={...claim,id:previous?.id??crypto.randomUUID(),revision:(previous?.revision??0)+1,status:'active',createdAt:previous?.createdAt??new Date().toISOString()};
    data.claims=previous?data.claims.map(value=>value.id===previous.id?saved:value):[...data.claims,saved];await repo.write(userId,action.expectedVersion,data,true);return finish('Claim saved with its source and confirmation choices.');
  }
  if(action.action==='withdraw_claim'){
    if(!data.claims.some(claim=>claim.id===action.id))throw new ApiError(404,'LOOP_NOT_FOUND','That claim is unavailable.');
    data.claims=data.claims.map(claim=>claim.id===action.id?{...claim,status:'withdrawn',shareable:false,confirmed:false,revision:claim.revision+1}:claim);await repo.write(userId,action.expectedVersion,data,true);return finish('Claim withdrawn. Fresh outputs cannot reuse it.');
  }
  if(action.action==='link_saved_check'){
    // Validate again at the business boundary; no direct read/write pair may
    // replace the atomic owner/generation/source-checked database operation.
    const input=validateControlInput(action);
    if(input.action!=='link_saved_check')throw new ApiError(400,'LOOP_INVALID_ACTION','Choose a saved check.');
    const linked=await repo.linkSavedCheck(userId,input.expectedGeneration!,input.expectedVersion,input.checkId,input.opportunity,input.linkConsent);
    const snapshot=await getLoopSnapshot(repo,userId,env,input.expectedGeneration);
    const matches=snapshot.opportunities.filter(item=>item.sourceCheckId===input.checkId);
    if(matches.length!==1||matches[0].id!==linked.opportunityId||matches[0].source!=='manual'||matches[0].sourceKey!==`saved-check:${input.checkId}`)
      throw new ApiError(409,'LOOP_CHECK_LINK_CONFLICT','The linked vacancy changed before it could be confirmed. Refresh Applications before continuing.');
    return {snapshot,checkLink:{checkId:input.checkId,...linked},message:linked.reused
      ?'This saved check already has a linked vacancy. Its current details and application progress were kept.'
      :'Vacancy saved and linked to this check. Review your career facts before preparing documents.'};
  }
  if(action.action==='add_opportunity'){
    if(data.opportunities.length>=100)throw new ApiError(422,'LOOP_RECORD_LIMIT','This pilot supports up to 100 opportunities.');const input=validateOpportunity(action.opportunity);
    const sourceKey=input.url?`url:${await digest(safePublicUrl(input.url)??input.url)}`:`manual:${await digest(JSON.stringify([input.company,input.title,input.location,input.description]))}`;
    const existing=data.opportunities.find(item=>!item.sourceCheckId&&item.sourceKey===sourceKey);let changed=false;
    if(existing){changed=JSON.stringify([existing.title,existing.company,existing.location,existing.description,existing.contact,existing.source])!==JSON.stringify([input.title,input.company,input.location,input.description,input.contact,'manual']);data.opportunities=data.opportunities.map(item=>item.id===existing.id?{...item,...input,source:'manual',verification:'user_provided',checkedAt:new Date().toISOString()}:item);}
    else data.opportunities.push({...input,id:crypto.randomUUID(),source:'manual',sourceKey,checkedAt:new Date().toISOString(),verification:'user_provided',status:'saved',notes:'',followUpAt:null});
    await repo.write(userId,action.expectedVersion,data,changed);return finish(existing?'The opportunity source was updated from your reviewed text; application history was retained.':'Opportunity saved as user-provided text.');
  }
  if(action.action==='update_opportunity'){
    if(!data.opportunities.some(item=>item.id===action.id))throw new ApiError(404,'LOOP_NOT_FOUND','That opportunity is unavailable.');
    data.opportunities=data.opportunities.map(item=>item.id===action.id?{...item,status:action.status,notes:action.notes,followUpAt:action.followUpAt}:item);await repo.write(userId,action.expectedVersion,data,false);return finish('Application progress updated from your report.');
  }
  if(action.action==='start_run'){
    configuredUsageCap(env);
    if(!workerEnabled(env))throw new ApiError(503,'LOOP_DISABLED','Cloud runs are disabled.');if(!data.profile)throw new ApiError(422,'LOOP_PROFILE_REQUIRED','Save a reviewed profile before starting.');
    if(!eligibleLoopClaims(data.profile,data.claims).length)throw new ApiError(422,'LOOP_CLAIMS_REQUIRED','Confirm and allow sharing of at least one source-backed claim first.');
    const inputHash=await fingerprintLoopInputs(data.profile,data.claims,data.opportunities);const requestHash=await preparationRequestHash(data,action);
    const existing=await repo.requestRun(userId,action.requestId);
    // Existing deployments stored the whole discovery list in request_hash.
    // Compare their immutable saved candidate snapshot instead of rejecting an
    // honest retry just because the background worker found or refreshed jobs.
    if(existing&&!await canReplayPreparation(existing,data,action))throw new ApiError(409,'LOOP_REQUEST_CONFLICT','This request reference belongs to different career facts, original vacancy facts or processing choices. Start a new request.');
    if(!existing){if(action.provider==='rules'){if(action.model!==RULES_MODEL)throw new ApiError(400,'LOOP_MODEL_INVALID','Use the declared rules engine model.');}else{if(!action.modelConsent)throw new ApiError(400,'LOOP_MODEL_CONSENT','Allow the selected provider to process eligible claims and vacancy text explicitly.');const config=modelConfiguration(action.provider,action.model,env);if((config.transport??'direct')!==(action.processingRoute??'direct'))throw new ApiError(409,'LOOP_PROCESSING_ROUTE_CHANGED','The processing route changed. Refresh and explicitly review the named provider route before starting.');}}
    const run=existing??await repo.rpc<RunRow>('job_loop_start_run_bound',{p_user:userId,p_generation:action.expectedGeneration,p_request:action.requestId,p_request_hash:requestHash,p_input_hash:inputHash,p_expected:row.version,p_provider:action.provider,p_model:action.model,p_consents:{model:action.modelConsent,inbox:action.inboxConsent,...(action.provider!=='rules'?{processingRoute:action.processingRoute??'direct'}:{})}});
    let message=existing?'This request already has a saved run. Its current status is shown below; no second run was started.':'The run is saved and continues in the background.';try{if(['queued','running'].includes(run.status))await dispatchWorker(run.id,env,fetcher);}catch{message='The run is saved. The worker could not be reached; resume this run to continue.';}
    return {...await finish(message),runId:run.id};
  }
  if(action.action==='resume_run'||action.action==='cancel_run'){
    const run=await repo.rpc<RunRow>('job_loop_run_action',{p_user:userId,p_run:action.runId,p_action:action.action==='resume_run'?'resume':'cancel'});
    if(action.action==='resume_run'&&['queued','running'].includes(run.status))await dispatchWorker(run.id,env,fetcher);return {...await finish(),runId:run.id};
  }
  if(action.action==='approve_packet'){
    if(!action.confirmFacts||!action.confirmDisclosure)throw new ApiError(400,'LOOP_APPROVAL_REQUIRED','Confirm the facts and external disclosure separately before approval.');
    const packet=await repo.packet(userId,action.packetId);const opportunity=data.opportunities.find(item=>item.id===packet.data.opportunityId);
    if(!data.profile||!opportunity||await packetInputHash(data.profile,data.claims,opportunity)!==packet.data.inputHash)throw new ApiError(409,'LOOP_STALE_INPUT','The career record or vacancy changed. Build a current packet before approving.');
    await repo.rpc('job_loop_approve_packet',{p_user:userId,p_packet:action.packetId,p_hash:action.inputHash,p_text:action.reviewedText});return finish('This exact source-backed packet is approved.');
  }
  if(action.action==='download'){
    const packet=await repo.packet(userId,action.packetId);if(packet.status!=='approved'||packet.input_version!==row.input_version)throw new ApiError(409,'LOOP_APPROVAL_REQUIRED','Approve a current packet before downloading. Changed or withdrawn facts require a rebuild.');
    if(['pdf','docx','txt'].includes(action.format)&&packet.data.formatStatus?.[action.format as 'pdf'|'docx'|'txt']?.ready===false)throw new ApiError(422,'LOOP_FORMAT_UNAVAILABLE',packet.data.formatStatus[action.format as 'pdf'|'docx'|'txt']?.reason??'This format requires a document repair. Other ready formats remain available.');
    const url=await repo.signedArtifact(userId,packet.data,action.format);await repo.rpc('job_loop_add_activity',{p_user:userId,p_kind:'download_requested',p_actor:'candidate',p_summary:`You requested the approved ${action.format.toUpperCase()} download. Browser completion is not inferred.`,p_opportunity:packet.data.opportunityId,p_run:packet.data.runId});return {url,filename:`jobvance-${packet.id}.${action.format==='pdf'?'pdf':action.format==='docx'?'docx':'txt'}`};
  }
  if(action.action==='preview_packet'){
    const packet=await repo.packet(userId,action.packetId),opportunity=data.opportunities.find(item=>item.id===packet.data.opportunityId);
    if(!data.profile||!opportunity||packet.status==='revoked'||packet.input_version!==row.input_version||packet.data.inputHash!==action.inputHash||await packetInputHash(data.profile,data.claims,opportunity)!==action.inputHash)throw new ApiError(409,'LOOP_STALE_INPUT','This preview no longer matches your current career record or vacancy.');
    if(packet.data.holdReasons.length||!packet.data.artifacts.pdf)throw new ApiError(422,'LOOP_PREVIEW_UNAVAILABLE','An exact PDF preview is not available for this packet. Review the literal text and format warnings.');
    return {url:await repo.signedArtifact(userId,packet.data,'pdf'),filename:`jobvance-${packet.id}-preview.pdf`};
  }
  if(action.action==='gmail_connect')return {url:await beginGmail(repo,userId,action.allowDrafts,env,action.expectedGeneration!)};
  if(action.action==='gmail_preview')return {gmailPreview:await previewGmailTicket(repo,userId,action.ticket,env,action.expectedGeneration!)};
  if(action.action==='gmail_finalize'){if(!action.confirmMailbox)throw new ApiError(400,'LOOP_GMAIL_CONFIRMATION','Confirm the displayed mailbox identity and permissions.');await finalizeGmailTicket(repo,userId,action.ticket,env,action.expectedGeneration!);return finish('The displayed mailbox was explicitly connected to your account.');}
  if(action.action==='gmail_disconnect'){await repo.rpc('job_loop_disconnect_gmail',{p_user:userId,p_generation:action.expectedGeneration});return finish('Mailbox disconnected. Previously created drafts remain in your Gmail account.');}
  if(action.action==='gmail_create_draft'){
    if(!action.confirmRecipientAndAttachment)throw new ApiError(400,'LOOP_DRAFT_CONSENT','Confirm the exact recipient and attachment first.');const packet=await repo.packet(userId,action.packetId);
    if(packet.status!=='approved')throw new ApiError(409,'LOOP_APPROVAL_REQUIRED','Approve the packet before creating a draft.');return finish(await createGmailDraft(repo,userId,packet.data,action.requestId,env,fetcher,action.expectedGeneration!));
  }
  throw new ApiError(400,'LOOP_INVALID_ACTION','Unsupported loop operation.');
}

async function metered<T>(repo:LoopRepository,run:RunRow,key:string,provider:string,reserved:number,call:()=>Promise<T&{actualMicros:number}>,env:LoopEnv):Promise<T> {
  const reservation=await repo.reserve(run,key,provider,reserved,configuredUsageCap(env));
  if(!reservation.is_new){if(reservation.status==='settled'&&reservation.result)return reservation.result as T;throw new ApiError(409,'LOOP_PROVIDER_UNCERTAIN','A prior provider call is unconfirmed; its budget is retained and it will not be blindly repeated.');}
  try{const result=await call();await repo.settle(reservation.id,result.actualMicros,result);return result;}
  catch(error){if(error instanceof ApiError&&error.code==='LOOP_SEARCH_NOT_CONFIGURED')await repo.settle(reservation.id,0,{error:'Search disabled before its request began.'});else await repo.settle(reservation.id,null,null,true);throw error;}
}
const lane=(name:string,status:LoopLane['status'],count:number,message:string):LoopLane=>({name,status,count,message,checkedAt:new Date().toISOString()});
/** One occurrence is claimed durably before a run is created. A missed window
 * prepares once, then advances from now; it never floods users with catch-up runs. */
export async function processDueSchedules(repo:LoopRepository,env:LoopEnv,fetcher:LoopFetch=fetch):Promise<{claimed:number;started:number;recovered:number}> {
  configuredUsageCap(env);const scheduler=await repo.rpc<{ready:boolean}>('job_loop_scheduler_state',{});
  if(!scheduler.ready)throw new ApiError(503,'LOOP_SCHEDULER_UNAVAILABLE','Recurring dispatch is disabled.');
  let recovered=0;
  for(const run of await repo.recoverableRuns()){try{await dispatchWorker(run.id,env,fetcher);recovered++;}catch{/* Persisted queued work is retried by the next dispatcher tick. */}}
  const lease=crypto.randomUUID();const due=await repo.rpc<ScheduleRow[]>('job_loop_claim_due',{p_lease:lease,p_limit:10});let started=0;
  for(const schedule of due){let message='The scheduled occurrence did not produce a new preparation.';
    try{
      const record=await repo.record(schedule.user_id),profile=record.data.profile;
      if(!profile||!eligibleLoopClaims(profile,record.data.claims).length)throw new ApiError(422,'LOOP_CLAIMS_REQUIRED','Confirm current shareable evidence before the next scheduled preparation.');
      if(schedule.settings.provider==='rules'){if(schedule.settings.model!==RULES_MODEL)throw new ApiError(400,'LOOP_MODEL_INVALID','The scheduled preparation method is unavailable.');}
      else{if(!schedule.settings.modelConsent)throw new ApiError(400,'LOOP_MODEL_CONSENT','Recurring provider processing permission is missing.');modelConfiguration(schedule.settings.provider,schedule.settings.model,env);}
      const requestId=await stableUuid(`scheduled:${schedule.user_id}:${schedule.next_run_at}`),existing=await repo.requestRun(schedule.user_id,requestId);
      if(existing&&!await canReplayPreparation(existing,record.data,schedule.settings))throw new ApiError(409,'LOOP_REQUEST_CONFLICT','This occurrence already belongs to different candidate inputs. Its saved work is retained; the next scheduled occurrence can use current facts.');
      const inputHash=existing?.input_hash??await fingerprintLoopInputs(profile,record.data.claims,record.data.opportunities),requestHash=existing?.request_hash??await preparationRequestHash(record.data,schedule.settings);
      const run=await repo.rpc<RunRow>('job_loop_start_scheduled_run',{p_user:schedule.user_id,p_lease:lease,p_request:requestId,p_request_hash:requestHash,p_input_hash:inputHash,p_expected:record.version,p_provider:schedule.settings.provider,p_model:schedule.settings.model,p_consents:{model:schedule.settings.modelConsent,inbox:schedule.settings.inboxConsent}});
      if(['queued','running'].includes(run.status)){await dispatchWorker(run.id,env,fetcher);started++;message='Scheduled preparation queued. Review its actual progress below.';}else message='This scheduled occurrence already has a saved result; no duplicate run was started.';
    }catch(error){message=error instanceof ApiError?error.message:'The scheduled occurrence could not be confirmed. Saved work is retained; no completion is claimed.';}
    try{await repo.rpc('job_loop_finish_schedule',{p_user:schedule.user_id,p_lease:lease,p_next:nextScheduledInstant(schedule.settings),p_message:message});}catch{/* A pause, cancellation or lease recovery wins over this late scheduler result. */}
  }
  return {claimed:due.length,started,recovered};
}
export async function processLoopPhase(repo:LoopRepository,runId:string,env:LoopEnv,fetcher:LoopFetch=fetch):Promise<boolean> {
  const run=await repo.claimRun(uuid(runId,'Run ID'),crypto.randomUUID());if(!run)return false;
  const state:RunState={...run.data,lanes:[...(run.data.lanes??[])],messages:[...(run.data.messages??[])],packetIds:[...(run.data.packetIds??[])]};const profile=run.snapshot.profile;
  if(!profile){await repo.commit(run,run.phase,'blocked',{...state,nextAction:'Save a reviewed career record.'});return false;}
  try{
    if(run.phase===0){
      if(run.consents.inbox&&gmailConfigured(env)){try{const inbox=await readRecruitmentInbox(repo,run.user_id,env,fetcher,run.lifecycle_generation);state.inbox=inbox.signals;state.lanes!.push(lane('Recruitment inbox','partial',inbox.signals.length,`Bounded seven-day metadata/snippet triage${inbox.truncated?'; additional or unread messages remain':''}. Role receipts are unconfirmed; no applied status was inferred. Contextual reply drafts and existing-thread replies remain manual in Gmail.`));}catch{state.lanes!.push(lane('Recruitment inbox','not_connected',0,'Mailbox read was unavailable. No inbox check is claimed.'));}}
      else state.lanes!.push(lane('Recruitment inbox',run.consents.inbox?'not_connected':'not_run',0,run.consents.inbox?'Mailbox access is not configured or connected.':'Mailbox processing was not requested.'));
      state.lanes!.push(lane('LinkedIn inbox and browser sources','blocked',0,'No authorized hosted LinkedIn integration is connected. Use your own account and add source text manually.'));
      await repo.commit(run,1,'running',state);return true;
    }
    if(run.phase===1){
      const found:LoopOpportunity[]=[];
      const feeds=employerFeeds(env);
      if(!feeds.length)state.lanes!.push(lane('Employer API sources','not_connected',0,'No tested employer boards have been configured.'));
      const feedsRead=await Promise.allSettled(feeds.map(feed=>readEmployerFeed(feed,fetcher)));
      feedsRead.forEach((result,index)=>{if(result.status==='fulfilled'){found.push(...result.value.opportunities);state.lanes!.push(lane(`${feeds[index].provider}:${feeds[index].board}`,result.value.truncated?'partial':'completed',result.value.opportunities.length,`Published-list records read: ${result.value.total}. Listing evidence does not certify eligibility or guarantee the posting remains open.${result.value.truncated?' Source response was capped.':''}`));}else state.lanes!.push(lane(`${feeds[index].provider}:${feeds[index].board}`,'blocked',0,'Source read failed or was blocked; it was not treated as an empty market.'));});
      if(searchReady(env)){
        const queries=profile.targetTitles.slice(0,LIMITS.queries).map(title=>`${title} jobs ${profile.locations.join(' ')}`.slice(0,250));let count=0;let errors=0;
        for(let index=0;index<queries.length;index++){try{const result=await metered(repo,run,`search:${index}`,'tavily',TAVILY_CREDIT_MICROS,()=>searchTavily(queries[index],env,fetcher),env);if(result.error){errors++;continue;}for(const item of result.results){if(item.content.trim().length<80)continue;const sourceKey=`url:${await digest(item.url)}`;found.push({id:await stableUuid(sourceKey),title:item.title,company:'Employer not yet verified',location:'',url:item.url,description:item.content,contact:null,source:'web_search',sourceKey,checkedAt:new Date().toISOString(),verification:'unverified',status:'saved',followUpAt:null,notes:'Search text is discovery evidence only. Confirm the employer and full vacancy before using this opportunity.'});count++;}}catch(error){errors++;state.messages!.push(error instanceof ApiError?error.message:'A search query could not be confirmed.');}}
        state.lanes!.push(lane('Broad web search',errors||profile.targetTitles.length>LIMITS.queries?'partial':queries.length?'completed':'not_run',count,`${queries.length} bounded title/location queries attempted of ${profile.targetTitles.length} target titles. Search results and snippets are not proof that a vacancy is open.`));
      }else state.lanes!.push(lane('Broad web search','not_connected',0,'Search is disabled or its server key is missing. No market-wide search is claimed.'));
      const known=await repo.record(run.user_id);const indexed=new Map(known.data.opportunities.map(item=>[item.sourceKey,item]));const newFound:LoopOpportunity[]=[];
      let admitted=0;
      // Refresh source facts on existing discoveries even if they no longer fit;
      // retain their history, then apply the current target before preparation/reuse.
      for(const opportunity of found){const matches=matchesDiscoveryTarget(profile,opportunity);const existing=indexed.get(opportunity.sourceKey);if(existing&&existing.source!=='manual'){const refreshed={...opportunity,id:existing.id,status:existing.status,notes:existing.notes,followUpAt:existing.followUpAt};indexed.set(opportunity.sourceKey,refreshed);newFound.push(refreshed);if(matches)admitted++;}else if(matches&&!existing&&indexed.size<100){indexed.set(opportunity.sourceKey,opportunity);newFound.push(opportunity);admitted++;}}
      state.lanes!.push(lane('Targeted shortlist','completed',admitted,'Only declared role/location matches without a stated seniority, experience or comparable pay conflict are added. Unknown conditions remain unknown. Limited sources do not establish the size of the wider job market; eligibility and source conditions still need your review.'));
      const all=[...indexed.values()].filter(item=>['saved','prepared'].includes(item.status)&&item.verification!=='closed_confirmed'&&(item.source==='manual'||matchesDiscoveryTarget(profile,item)));
      const existingPackets=(await repo.collections(run.user_id)).packets.filter(item=>['review_required','approved'].includes(item.status));
      const reusable=new Map<string,string>();
      for(const opportunity of all){const currentHash=await packetInputHash(profile,run.snapshot.claims,opportunity),packet=existingPackets.find(item=>item.data.opportunityId===opportunity.id&&item.data.inputHash===currentHash);if(packet)reusable.set(opportunity.id,packet.id);}
      state.reusedPacketIds=[...reusable.values()];
      if(reusable.size)state.messages!.push(`${reusable.size} unchanged current packet${reusable.size===1?' was':'s were'} retained; no duplicate preparation or model charge was requested.`);
      const fresh=all.filter(item=>!reusable.has(item.id));const wanted=fresh.filter(item=>item.source==='manual'||matchesDiscoveryTarget(profile,item));
      state.opportunities=selectPreparationOpportunities(profile,run.snapshot.claims,fresh);state.opportunityIds=state.opportunities.map(item=>item.id);
      if(wanted.length>LIMITS.packets)state.messages!.push(`${wanted.length-LIMITS.packets} selected/qualifying opportunities remain outside this run's ${LIMITS.packets}-packet capacity.`);
      state.lanes!.push(lane('User-added opportunities','completed',known.data.opportunities.filter(item=>item.source==='manual').length,'User-provided text remains marked user-provided; application status is not inferred.'));
      await repo.commit(run,2,'running',state,[],newFound);return true;
    }
    if(run.phase>=2&&run.phase<=6){
      const opportunity=state.opportunities?.[run.phase-2];if(!opportunity){await repo.commit(run,7,'running',state);return true;}
      const current=await repo.record(run.user_id);const actual=current.data.opportunities.find(item=>item.id===opportunity.id);
      if(actual&&!['saved','prepared'].includes(actual.status)){state.messages!.push('An opportunity moved beyond preparation; its existing application history was preserved.');await repo.commit(run,run.phase+1,'running',state);return true;}
      if(opportunity.source!=='manual'&&!matchesDiscoveryTarget(profile,opportunity)){state.messages!.push('An automatically found vacancy does not match the declared target and stated constraints. It was kept in your history and skipped for preparation.');await repo.commit(run,run.phase+1,'running',state);return true;}
      const assessment=assessOpportunity(profile,run.snapshot.claims,opportunity);const allowed=eligibleLoopClaims(profile,run.snapshot.claims).filter(claim=>assessment.claimIds.includes(claim.id));let selectedClaimIds:string[]|undefined;let modelQuestions:{question:string;claimIds:string[]}[]=[];
      if(run.provider!=='rules'){
        if((modelConfiguration(run.provider,run.model,env).transport??'direct')!==(run.consents.processingRoute??'direct'))throw new ApiError(409,'LOOP_PROCESSING_ROUTE_CHANGED','The processing route changed after approval. No paid call was made; start again with explicit route consent.');
        const request=prepareModelRequest(run.provider,run.model,env,opportunity,allowed);const result=await metered(repo,run,`model:${opportunity.id}`,run.provider,request.reservedMicros,()=>callModel(request,fetcher),env);
        if(result.error)throw new ApiError(422,'LOOP_MODEL_OUTPUT_INVALID',result.error);selectedClaimIds=result.claimIds;modelQuestions=result.reviewQuestions??[];
      }
      const packetId=await stableUuid(`${run.id}:${opportunity.id}`);const packet=await composePacket({profile,claims:run.snapshot.claims,opportunity,assessment,selectedClaimIds,runId:run.id,packetId,inputHash:await packetInputHash(profile,run.snapshot.claims,opportunity),createdAt:run.created_at,model:{provider:run.provider,model:run.model,method:run.provider==='rules'?RULES_MODEL:'approved-claim-id-selection-v1'}});
      packet.interviewBrief=buildInterviewBrief(profile,run.snapshot.claims,opportunity,packet);
      if(modelQuestions.length){
        packet.interviewBrief=modelQuestions.map((item,index)=>({title:`AI review question ${index+1} — check before use`,prompt:item.question,evidenceClaimIds:item.claimIds,sourceQuote:item.claimIds.map(id=>allowed.find(claim=>claim.id===id)?.sourceQuote??'').join('\n')})).concat(packet.interviewBrief.slice(modelQuestions.length));
        packet.model.method='OpenRouter; approved evidence selection and reviewable questions; calculations remain deterministic';
      }
      packet.evidenceText+='\n\nINTERVIEW PREPARATION — FACTUAL PROMPTS, NOT PERFORMANCE SCORING\n'+packet.interviewBrief.map(item=>`${item.title}\n${item.prompt}\nSource: ${item.sourceQuote}\nEvidence IDs: ${item.evidenceClaimIds.join(', ')||'vacancy/conditions only'}`).join('\n\n');
      if(opportunity.source==='web_search'&&opportunity.verification==='unverified'){packet.holdReasons.push('The employer and complete vacancy are unverified. Add confirmed source text before using this packet.');packet.status='held';}
      const rendered=await renderPacket({packet,profile});packet.pageCount=rendered.pageCount;packet.formatStatus=rendered.packet.formatStatus;packet.holdReasons=[...new Set([...packet.holdReasons,...rendered.holdReasons])];if(packet.holdReasons.length)packet.status='held';
      const artifacts=await Promise.all(Object.entries(rendered.artifacts).map(async([key,value])=>{const path=await repo.upload(run,packet.id,key,value.bytes,value.mimeType);return [key,{path,sha256:value.sha256,byteSize:value.byteSize}] as const;}));packet.artifacts=Object.fromEntries(artifacts);
      state.packetIds!.push(packet.id);state.messages!.push(packet.status==='held'?'A packet is held for its listed source/document checks.':'A source-backed packet is ready for your review.');
      await repo.commit(run,run.phase+1,'running',state,[packet]);return true;
    }
    state.nextAction=state.inbox?.some(item=>item.bucket==='action_needed')?'Read the action-needed recruitment messages first.':state.packetIds?.length?'Review one source-backed packet and its factual/disclosure checks.':state.reusedPacketIds?.length?'Your unchanged packets were retained. Review the existing packet or add a new vacancy.':'Add a full vacancy and confirm relevant shareable career evidence.';
    const incomplete=state.lanes!.some(item=>['partial','blocked','not_connected'].includes(item.status));await repo.commit(run,7,incomplete?'partial':'completed',state);return false;
  }catch(error){
    if(error instanceof ApiError&&['LOOP_LEASE_LOST','LOOP_STALE_INPUT'].includes(error.code))return false;
    state.messages!.push(error instanceof ApiError?error.message:'This stage failed without producing a confirmed result. Resume the saved run after resolving the problem.');state.nextAction='Review the failed stage before resuming; uncertain provider calls will not be repeated.';
    try{await repo.commit(run,run.phase,'blocked',state);}catch{/* A cancelled/stale lease cannot publish late results. */}return false;
  }
}
