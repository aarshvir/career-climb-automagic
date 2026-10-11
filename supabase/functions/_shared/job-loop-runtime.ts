import { ApiError, uuid } from './core.ts';
import { validateAction, validateProfile, validateClaim, validateOpportunity, suggestClaims, assessOpportunity, composePacket, eligibleLoopClaims, fingerprintLoopInputs } from './job-loop-engine.ts';
import { renderPacket } from './job-loop-render.ts';
import { LoopRepository, loopDatabaseError, publicRun, type RunRow, type RunState } from './job-loop-repository.ts';
import { LIMITS, RULES_MODEL, digest, stableUuid, modelOptions, modelConfiguration, prepareModelRequest, callModel, searchReady, searchTavily, TAVILY_CREDIT_MICROS, employerFeeds, readEmployerFeed, safePublicUrl, type LoopEnv, type LoopFetch } from './job-loop-providers.ts';
import { beginGmail, createGmailDraft, gmailConfigured, readRecruitmentInbox,previewGmailTicket,finalizeGmailTicket } from '../job-loop-oauth/gmail.ts';
import type { LoopAction, LoopClaim, LoopLane, LoopOpportunity, LoopResponse, LoopSnapshot } from './job-loop-types.ts';

export function validateControlInput(value: unknown): LoopAction {
  try { return validateAction(value); } catch(error) { throw new ApiError(400,'LOOP_INVALID_INPUT',error instanceof Error?error.message.slice(0,300):'Invalid loop input.'); }
}
export function selectPreparationOpportunities(profile:Parameters<typeof assessOpportunity>[0],claims:LoopClaim[],opportunities:LoopOpportunity[]):LoopOpportunity[]{
  return opportunities.filter(item=>['saved','prepared'].includes(item.status)&&item.verification!=='closed_confirmed').map(opportunity=>({opportunity,assessment:assessOpportunity(profile,claims,opportunity)}))
    .filter(item=>item.opportunity.source==='manual'||item.assessment.score>=60)
    .sort((a,b)=>Number(b.opportunity.source==='manual')-Number(a.opportunity.source==='manual')||Number(b.opportunity.status==='saved')-Number(a.opportunity.status==='saved')||b.assessment.score-a.assessment.score)
    .slice(0,LIMITS.packets).map(item=>item.opportunity);
}
export function workerEnabled(env: LoopEnv): boolean { return env('JOB_LOOP_ENABLED')!=='false' && !!env('SUPABASE_URL') && !!env('SUPABASE_SERVICE_ROLE_KEY'); }
export async function packetInputHash(profile:Parameters<typeof fingerprintLoopInputs>[0],claims:LoopClaim[],opportunity:LoopOpportunity):Promise<string>{
  return fingerprintLoopInputs(profile,claims,[{title:opportunity.title,company:opportunity.company,location:opportunity.location,url:opportunity.url,description:opportunity.description,contact:opportunity.contact}]);
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
export async function getLoopSnapshot(repo:LoopRepository,userId:string,env:LoopEnv):Promise<LoopSnapshot> {
  const [record,collections]=await Promise.all([repo.record(userId),repo.collections(userId)]);
  const available=workerEnabled(env);const gmailReady=gmailConfigured(env);const connected=!!collections.connection;
  return {recordVersion:Number(record.version),profile:record.data.profile,claims:record.data.claims,opportunities:record.data.opportunities,runs:collections.runs.map(run=>publicRun(run,collections.usage)),packets:collections.packets.map(row=>({...row.data,status:row.status})),inbox:collections.runs.find(run=>run.data.inbox)?.data.inbox??record.data.inbox,models:modelOptions(env),capabilities:{cloudWorker:available,rulesEngine:available,webSearch:searchReady(env),gmailRead:gmailReady,gmailDrafts:gmailReady,monthlyUsageCapUsd:LIMITS.monthlyUsd,dailyRunLimit:LIMITS.dailyRuns},gmail:{connected:gmailReady&&connected,email:gmailReady?collections.connection?.email??null:null,allowDrafts:gmailReady&&!!collections.connection?.allow_drafts,status:!gmailReady?'Mailbox integration is not configured.':connected?collections.connection?.allow_drafts?'Connected with read and draft permission.':'Connected read-only. Reconnect to request draft permission.':'Not connected. Google sign-in is separate.'}};
}
export async function controlLoop(repo:LoopRepository,userId:string,action:LoopAction,env:LoopEnv,fetcher:LoopFetch=fetch):Promise<LoopResponse> {
  if(action.action==='get')return {snapshot:await getLoopSnapshot(repo,userId,env)};
  const row=await repo.record(userId);const data=structuredClone(row.data);
  const finish=async(message?:string):Promise<LoopResponse>=>({snapshot:await getLoopSnapshot(repo,userId,env),...(message?{message}:{})});
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
    const claim=validateClaim(action.claim,data.profile);const previous=action.id?data.claims.find(value=>value.id===action.id):undefined;
    if(action.id&&!previous)throw new ApiError(404,'LOOP_NOT_FOUND','That claim is unavailable in your record.');
    if(!previous&&data.claims.length>=150)throw new ApiError(422,'LOOP_RECORD_LIMIT','This pilot supports up to 150 recorded claims.');
    const saved:LoopClaim={...claim,id:previous?.id??crypto.randomUUID(),revision:(previous?.revision??0)+1,status:'active',createdAt:previous?.createdAt??new Date().toISOString()};
    data.claims=previous?data.claims.map(value=>value.id===previous.id?saved:value):[...data.claims,saved];await repo.write(userId,action.expectedVersion,data,true);return finish('Claim saved with its source and confirmation choices.');
  }
  if(action.action==='withdraw_claim'){
    if(!data.claims.some(claim=>claim.id===action.id))throw new ApiError(404,'LOOP_NOT_FOUND','That claim is unavailable.');
    data.claims=data.claims.map(claim=>claim.id===action.id?{...claim,status:'withdrawn',shareable:false,confirmed:false,revision:claim.revision+1}:claim);await repo.write(userId,action.expectedVersion,data,true);return finish('Claim withdrawn. Fresh outputs cannot reuse it.');
  }
  if(action.action==='add_opportunity'){
    if(data.opportunities.length>=100)throw new ApiError(422,'LOOP_RECORD_LIMIT','This pilot supports up to 100 opportunities.');const input=validateOpportunity(action.opportunity);
    const sourceKey=input.url?`url:${await digest(safePublicUrl(input.url)??input.url)}`:`manual:${await digest(JSON.stringify([input.company,input.title,input.location,input.description]))}`;
    const existing=data.opportunities.find(item=>item.sourceKey===sourceKey);let changed=false;
    if(existing){changed=JSON.stringify([existing.title,existing.company,existing.location,existing.description,existing.contact,existing.source])!==JSON.stringify([input.title,input.company,input.location,input.description,input.contact,'manual']);data.opportunities=data.opportunities.map(item=>item.id===existing.id?{...item,...input,source:'manual',verification:'user_provided',checkedAt:new Date().toISOString()}:item);}
    else data.opportunities.push({...input,id:crypto.randomUUID(),source:'manual',sourceKey,checkedAt:new Date().toISOString(),verification:'user_provided',status:'saved',notes:'',followUpAt:null});
    await repo.write(userId,action.expectedVersion,data,changed);return finish(existing?'The opportunity source was updated from your reviewed text; application history was retained.':'Opportunity saved as user-provided text.');
  }
  if(action.action==='update_opportunity'){
    if(!data.opportunities.some(item=>item.id===action.id))throw new ApiError(404,'LOOP_NOT_FOUND','That opportunity is unavailable.');
    data.opportunities=data.opportunities.map(item=>item.id===action.id?{...item,status:action.status,notes:action.notes,followUpAt:action.followUpAt}:item);await repo.write(userId,action.expectedVersion,data,false);return finish('Application progress updated from your report.');
  }
  if(action.action==='start_run'){
    if(!workerEnabled(env))throw new ApiError(503,'LOOP_DISABLED','Cloud runs are disabled.');if(!data.profile)throw new ApiError(422,'LOOP_PROFILE_REQUIRED','Save a reviewed profile before starting.');
    if(!eligibleLoopClaims(data.profile,data.claims).length)throw new ApiError(422,'LOOP_CLAIMS_REQUIRED','Confirm and allow sharing of at least one source-backed claim first.');
    const inputHash=await fingerprintLoopInputs(data.profile,data.claims,data.opportunities);const requestHash=await digest(JSON.stringify([action.provider,action.model,action.modelConsent,action.inboxConsent,inputHash]));
    const existing=await repo.requestRun(userId,action.requestId);
    if(existing&&existing.request_hash!==requestHash)throw new ApiError(409,'LOOP_REQUEST_CONFLICT','This run reference belongs to different inputs. Start a new request.');
    if(!existing){if(action.provider==='rules'){if(action.model!==RULES_MODEL)throw new ApiError(400,'LOOP_MODEL_INVALID','Use the declared rules engine model.');}else{if(!action.modelConsent)throw new ApiError(400,'LOOP_MODEL_CONSENT','Allow the selected provider to process eligible claims and vacancy text explicitly.');modelConfiguration(action.provider,action.model,env);}}
    const run=existing??await repo.rpc<RunRow>('job_loop_start_run',{p_user:userId,p_request:action.requestId,p_request_hash:requestHash,p_input_hash:inputHash,p_expected:row.version,p_provider:action.provider,p_model:action.model,p_consents:{model:action.modelConsent,inbox:action.inboxConsent}});
    let message='The run is saved and continues in the background.';try{if(['queued','running'].includes(run.status))await dispatchWorker(run.id,env,fetcher);}catch{message='The run is saved. The worker could not be reached; resume this run to continue.';}
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
    const url=await repo.signedArtifact(userId,packet.data,action.format);return {url,filename:`jobvance-${packet.id}.${action.format==='pdf'?'pdf':action.format==='docx'?'docx':'txt'}`};
  }
  if(action.action==='gmail_connect')return {url:await beginGmail(repo,userId,action.allowDrafts,env)};
  if(action.action==='gmail_preview')return {gmailPreview:await previewGmailTicket(repo,userId,action.ticket,env)};
  if(action.action==='gmail_finalize'){if(!action.confirmMailbox)throw new ApiError(400,'LOOP_GMAIL_CONFIRMATION','Confirm the displayed mailbox identity and permissions.');await finalizeGmailTicket(repo,userId,action.ticket,env);return finish('The displayed mailbox was explicitly connected to your account.');}
  if(action.action==='gmail_disconnect'){const removed=await repo.admin.from('job_loop_connections').delete().eq('user_id',userId);loopDatabaseError(removed.error);const states=await repo.admin.from('job_loop_oauth_states').delete().eq('user_id',userId);loopDatabaseError(states.error);return finish('Mailbox disconnected. Previously created drafts remain in your Gmail account.');}
  if(action.action==='gmail_create_draft'){
    if(!action.confirmRecipientAndAttachment)throw new ApiError(400,'LOOP_DRAFT_CONSENT','Confirm the exact recipient and attachment first.');const packet=await repo.packet(userId,action.packetId);
    if(packet.status!=='approved')throw new ApiError(409,'LOOP_APPROVAL_REQUIRED','Approve the packet before creating a draft.');return finish(await createGmailDraft(repo,userId,packet.data,action.requestId,env,fetcher));
  }
  throw new ApiError(400,'LOOP_INVALID_ACTION','Unsupported loop operation.');
}

async function metered<T>(repo:LoopRepository,run:RunRow,key:string,provider:string,reserved:number,call:()=>Promise<T&{actualMicros:number}>):Promise<T> {
  const reservation=await repo.reserve(run,key,provider,reserved);
  if(!reservation.is_new){if(reservation.status==='settled'&&reservation.result)return reservation.result as T;throw new ApiError(409,'LOOP_PROVIDER_UNCERTAIN','A prior provider call is unconfirmed; its budget is retained and it will not be blindly repeated.');}
  try{const result=await call();await repo.settle(reservation.id,result.actualMicros,result);return result;}
  catch(error){if(error instanceof ApiError&&error.code==='LOOP_SEARCH_NOT_CONFIGURED')await repo.settle(reservation.id,0,{error:'Search disabled before its request began.'});else await repo.settle(reservation.id,null,null,true);throw error;}
}
const lane=(name:string,status:LoopLane['status'],count:number,message:string):LoopLane=>({name,status,count,message,checkedAt:new Date().toISOString()});
export async function processLoopPhase(repo:LoopRepository,runId:string,env:LoopEnv,fetcher:LoopFetch=fetch):Promise<boolean> {
  const run=await repo.claimRun(uuid(runId,'Run ID'),crypto.randomUUID());if(!run)return false;
  const state:RunState={...run.data,lanes:[...(run.data.lanes??[])],messages:[...(run.data.messages??[])],packetIds:[...(run.data.packetIds??[])]};const profile=run.snapshot.profile;
  if(!profile){await repo.commit(run,run.phase,'blocked',{...state,nextAction:'Save a reviewed career record.'});return false;}
  try{
    if(run.phase===0){
      if(run.consents.inbox&&gmailConfigured(env)){try{const inbox=await readRecruitmentInbox(repo,run.user_id,env,fetcher);state.inbox=inbox.signals;state.lanes!.push(lane('Recruitment inbox','partial',inbox.signals.length,`Bounded seven-day metadata/snippet triage${inbox.truncated?'; additional or unread messages remain':''}. Role receipts are unconfirmed; no applied status was inferred. Contextual reply drafts and existing-thread replies remain manual in Gmail.`));}catch{state.lanes!.push(lane('Recruitment inbox','not_connected',0,'Mailbox read was unavailable. No inbox check is claimed.'));}}
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
        for(let index=0;index<queries.length;index++){try{const result=await metered(repo,run,`search:${index}`,'tavily',TAVILY_CREDIT_MICROS,()=>searchTavily(queries[index],env,fetcher));if(result.error){errors++;continue;}for(const item of result.results){if(item.content.trim().length<80)continue;const sourceKey=`url:${await digest(item.url)}`;found.push({id:await stableUuid(sourceKey),title:item.title,company:'Employer not yet verified',location:'',url:item.url,description:item.content,contact:null,source:'web_search',sourceKey,checkedAt:new Date().toISOString(),verification:'unverified',status:'saved',followUpAt:null,notes:'Search text is discovery evidence only. Confirm the employer and full vacancy before using this opportunity.'});count++;}}catch(error){errors++;state.messages!.push(error instanceof ApiError?error.message:'A search query could not be confirmed.');}}
        state.lanes!.push(lane('Broad web search',errors||profile.targetTitles.length>LIMITS.queries?'partial':queries.length?'completed':'not_run',count,`${queries.length} bounded title/location queries attempted of ${profile.targetTitles.length} target titles. Search results and snippets are not proof that a vacancy is open.`));
      }else state.lanes!.push(lane('Broad web search','not_connected',0,'Search is disabled or its server key is missing. No market-wide search is claimed.'));
      const known=await repo.record(run.user_id);const indexed=new Map(known.data.opportunities.map(item=>[item.sourceKey,item]));const newFound:LoopOpportunity[]=[];
      for(const opportunity of found){const existing=indexed.get(opportunity.sourceKey);if(existing&&existing.source!=='manual'){const refreshed={...opportunity,id:existing.id,status:existing.status,notes:existing.notes,followUpAt:existing.followUpAt};indexed.set(opportunity.sourceKey,refreshed);newFound.push(refreshed);}else if(!existing&&indexed.size<100){indexed.set(opportunity.sourceKey,opportunity);newFound.push(opportunity);}}
      const all=[...indexed.values()].filter(item=>['saved','prepared'].includes(item.status)&&item.verification!=='closed_confirmed');
      const wanted=all.filter(item=>item.source==='manual'||assessOpportunity(profile,run.snapshot.claims,item).score>=60);
      state.opportunities=selectPreparationOpportunities(profile,run.snapshot.claims,all);state.opportunityIds=state.opportunities.map(item=>item.id);
      if(wanted.length>LIMITS.packets)state.messages!.push(`${wanted.length-LIMITS.packets} selected/qualifying opportunities remain outside this run's five-packet capacity.`);
      state.lanes!.push(lane('User-added opportunities','completed',known.data.opportunities.filter(item=>item.source==='manual').length,'User-provided text remains marked user-provided; application status is not inferred.'));
      await repo.commit(run,2,'running',state,[],newFound);return true;
    }
    if(run.phase>=2&&run.phase<=6){
      const opportunity=state.opportunities?.[run.phase-2];if(!opportunity){await repo.commit(run,7,'running',state);return true;}
      const current=await repo.record(run.user_id);const actual=current.data.opportunities.find(item=>item.id===opportunity.id);
      if(actual&&!['saved','prepared'].includes(actual.status)){state.messages!.push('An opportunity moved beyond preparation; its existing application history was preserved.');await repo.commit(run,run.phase+1,'running',state);return true;}
      const assessment=assessOpportunity(profile,run.snapshot.claims,opportunity);const allowed=eligibleLoopClaims(profile,run.snapshot.claims).filter(claim=>assessment.claimIds.includes(claim.id));let selectedClaimIds:string[]|undefined;
      if(run.provider!=='rules'){
        const request=prepareModelRequest(run.provider,run.model,env,opportunity,allowed);const result=await metered(repo,run,`model:${opportunity.id}`,run.provider,request.reservedMicros,()=>callModel(request,fetcher));
        if(result.error)throw new ApiError(422,'LOOP_MODEL_OUTPUT_INVALID',result.error);selectedClaimIds=result.claimIds;
      }
      const packetId=await stableUuid(`${run.id}:${opportunity.id}`);const packet=await composePacket({profile,claims:run.snapshot.claims,opportunity,assessment,selectedClaimIds,runId:run.id,packetId,inputHash:await packetInputHash(profile,run.snapshot.claims,opportunity),createdAt:run.created_at,model:{provider:run.provider,model:run.model,method:run.provider==='rules'?RULES_MODEL:'approved-claim-id-selection-v1'}});
      if(opportunity.source==='web_search'&&opportunity.verification==='unverified'){packet.holdReasons.push('The employer and complete vacancy are unverified. Add confirmed source text before using this packet.');packet.status='held';}
      const rendered=await renderPacket({packet,profile});packet.pageCount=rendered.pageCount;packet.holdReasons=[...new Set([...packet.holdReasons,...rendered.holdReasons])];if(packet.holdReasons.length)packet.status='held';
      const artifacts=await Promise.all(Object.entries(rendered.artifacts).map(async([key,value])=>{const path=await repo.upload(run.user_id,packet.id,key,value.bytes,value.mimeType);return [key,{path,sha256:value.sha256,byteSize:value.byteSize}] as const;}));packet.artifacts=Object.fromEntries(artifacts);
      state.packetIds!.push(packet.id);state.messages!.push(packet.status==='held'?'A packet is held for its listed source/document checks.':'A source-backed packet is ready for your review.');
      await repo.commit(run,run.phase+1,'running',state,[packet]);return true;
    }
    state.nextAction=state.inbox?.some(item=>item.bucket==='action_needed')?'Read the action-needed recruitment messages first.':state.packetIds?.length?'Review one source-backed packet and its factual/disclosure checks.':'Add a full vacancy and confirm relevant shareable career evidence.';
    const incomplete=state.lanes!.some(item=>['partial','blocked','not_connected'].includes(item.status));await repo.commit(run,7,incomplete?'partial':'completed',state);return false;
  }catch(error){
    if(error instanceof ApiError&&['LOOP_LEASE_LOST','LOOP_STALE_INPUT'].includes(error.code))return false;
    state.messages!.push(error instanceof ApiError?error.message:'This stage failed without producing a confirmed result. Resume the saved run after resolving the problem.');state.nextAction='Review the failed stage before resuming; uncertain provider calls will not be repeated.';
    try{await repo.commit(run,run.phase,'blocked',state);}catch{/* A cancelled/stale lease cannot publish late results. */}return false;
  }
}
