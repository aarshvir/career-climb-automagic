import { ApiError } from './core.ts';
import type { adminClient } from './runtime.ts';
import type { LoopCvSelection, LoopActivity, LoopClaim, LoopInboxSignal, LoopOpportunity, LoopOpportunityInput, LoopPacket, LoopProfile, LoopRun, LoopSchedule, LoopScheduleInput } from './job-loop-types.ts';
import { digest } from './job-loop-providers.ts';
import { eraseLoopArtifacts } from './job-loop-erasure.ts';
import { validLoopGeneration } from './job-loop-request.ts';
import { collectLoopArtifacts } from './job-loop-artifact-gc.ts';
import { captureCvVariantSaveIntent, validateCvVariantSaveReceipt, validateCvVariantsRead } from './job-loop-cv-variants.ts';
import { captureCvVariantFactSaveIntent, captureCvVariantFactWithdrawIntent, validateCvVariantFactReadScope, validateCvVariantFactReceipt, validateCvVariantFactsRead } from './job-loop-cv-variant-facts.ts';

export type LoopAdmin = ReturnType<typeof adminClient>;
export interface CareerRecord { cvSelection?: LoopCvSelection; profile: LoopProfile | null; claims: LoopClaim[]; opportunities: LoopOpportunity[]; inbox: LoopInboxSignal[] }
export interface RecordRow { user_id: string; version: number; input_version: number; lifecycle_generation?: number; data: CareerRecord; updated_at: string }
export interface LifecycleRow { user_id: string; state: 'active' | 'erasing' | 'erased'; generation: number }
export interface RunRow { id: string; user_id: string; request_id: string; request_hash: string; input_hash: string; input_version: number; lifecycle_generation?: number; selected_opportunity_ids?: string[] | null; selected_generation?: number | null; snapshot: CareerRecord; provider: LoopRun['provider']; model: string; consents: { model: boolean; inbox: boolean; processingRoute?: 'direct' | 'openrouter' }; data: RunState; status: LoopRun['status']; phase: number; lease_token: string | null; lease_until: string | null; created_at: string; finished_at: string | null }
export interface RunState { lanes?: LoopRun['lanes']; messages?: string[]; nextAction?: string; opportunityIds?: string[]; packetIds?: string[]; reusedPacketIds?:string[]; opportunities?: LoopOpportunity[]; inbox?: LoopInboxSignal[] }
export interface UsageRow { id: string; reserved_micros: number; actual_micros: number | null; status: 'reserved' | 'settled' | 'uncertain'; result: unknown; is_new: boolean }
export interface PacketRow { id: string; user_id: string; input_version: number; status: LoopPacket['status']; data: LoopPacket }
export interface ScheduleRow { occurrence_request?:string|null; bound_generation?:number|null; user_id:string;version:number;status:LoopSchedule['status'];settings:LoopScheduleInput;next_run_at:string|null;lease_token:string|null;lease_until:string|null;last_run_id:string|null;last_attempt_at:string|null;message:string }
const ERRORS: [string, number, string][] = [
  ['LOOP_SCHEDULE_ENTITLEMENT',403,'This cadence is not included in your current Job Loop access. Choose an included schedule.'],
  ['LOOP_WEEKLY_SCHEDULE_LIMIT',429,'This week’s included scheduled runs have been used. Your next scheduled occurrence remains available.'],
  ['LOOP_SCHEDULE_SOURCE_CHANGED',409,'The CV or facts changed. Choose the current source and confirm recurring preparation again.'],
  ['LOOP_RECURRING_AI_CONSENT',400,'Confirm recurring AI processing for this exact CV, model and provider route.'],
  ['LOOP_SUBSCRIPTION_REQUIRED',403,'Active Job Loop access is required for this preparation.'],
  ['LOOP_VARIANT_FACT_CONSENT_REQUIRED',400,'Confirm saving or withdrawing this exact fact.'],
  ['LOOP_VARIANT_FACT_REVISION_CONFLICT',409,'This fact changed. Refresh it before confirming another change.'],
  ['LOOP_VARIANT_FACT_SOURCE_CHANGED',409,'The saved CV source changed. Review this fact against its exact source.'],
  ['LOOP_VARIANT_FACT_UNAVAILABLE',404,'That fact is no longer available for this CV in your account.'],
  ['LOOP_VARIANT_FACT_LIMIT',422,'This CV supports up to 150 saved facts. Update an existing fact.'],
  ['LOOP_VARIANT_FACT_INVALID',422,'Review the complete fact, source context and sharing choice before saving.'],
  ['LOOP_VARIANT_CONSENT_REQUIRED',400,'Choose private saving for this CV variant.'],
  ['LOOP_VARIANT_REVISION_CONFLICT',409,'This CV variant changed. Refresh it before saving.'],
  ['LOOP_VARIANT_CLAIM_UNAVAILABLE',409,'A chosen fact changed or is no longer shareable. Review it again.'],
  ['LOOP_VARIANT_SOURCE_CHANGED',409,'CV passage confirmation belongs to a different source. Review the new source first.'],
  ['LOOP_VARIANT_UNAVAILABLE',404,'That CV variant or Job Loop is no longer available in your account.'],
  ['LOOP_VARIANT_LIMIT',422,'You can save up to three CV variants. Update an existing variant.'],
  ['LOOP_VARIANT_INVALID',422,'Review the CV variant name, source and selected facts before saving.'],
  ['LOOP_CHECK_LINK_CONSENT',400,'Choose to save this vacancy linked to the saved check.'],
  ['LOOP_CHECK_UNAVAILABLE',404,'This saved check is no longer available in your account. Reopen your saved checks before continuing.'],
  ['LOOP_CHECK_SOURCE_CHANGED',409,'The vacancy differs from the saved check. Restore its vacancy text or deliberately save a separate vacancy.'],
  ['LOOP_CHECK_LINK_CONFLICT',409,'This saved check has conflicting vacancy links. Refresh Applications before continuing.'],
  ['LOOP_CHECK_LINK_INVALID',422,'Review the saved check and vacancy details before linking them.'],
  ['LOOP_OPPORTUNITY_LIMIT',422,'This pilot supports up to 100 opportunities.'],
  ['LOOP_SELECTION_INVALID',409,'The saved vacancy selection could not be confirmed. Refresh and review the chosen vacancies.'],
  ['LOOP_SELECTION_UNAVAILABLE',409,'A chosen vacancy is unavailable. Refresh and review your selection.'],
  ['LOOP_VERSION_CONFLICT',409,'Your record changed. Refresh it before saving.'],['LOOP_REQUEST_CONFLICT',409,'This request reference belongs to different inputs.'],
  ['LOOP_DAILY_LIMIT',429,'This free pilot permits three new runs per account per UTC day, including corrective rebuilds. Resume an existing run instead.'],['LOOP_ACTIVE_RUN',409,'An active run already exists. Resume or cancel it before starting another.'],['LOOP_BUDGET_LIMIT',429,'The shared monthly AI/search usage limit has been reached.'],
  ['LOOP_STALE_INPUT',409,'The record changed. Confirm the current facts and build a new packet.'],['LOOP_LEASE_LOST',409,'This stage was cancelled or claimed by another worker.'],
  ['LOOP_REVIEW_CHANGED',422,'Update and confirm your career record before adding factual edits. This approval must match the generated CV.'],
  ['LOOP_PACKET_HELD',422,'This packet has unresolved document checks and cannot be approved.'],['LOOP_OAUTH_STATE',400,'The connection link expired or was already used. Start a new connection.'],
  ['LOOP_NOT_FOUND',404,'That record is unavailable in your account.'],
  ['LOOP_PILOT_FULL',429,'All ten free cloud pilot places are currently in use. Your record and free CV check remain available.'],
  ['LOOP_SCHEDULE_CONFLICT',409,'Your recurring settings changed. Refresh before updating them.'],
  ['LOOP_SCHEDULE_INVALID',422,'The recurring settings could not be saved. Choose a valid timezone and future time.'],
  ['LOOP_DAILY_SCHEDULE_LIMIT',429,'One scheduled preparation has already run today. Your next scheduled occurrence remains available.'],
  ['LOOP_MONTHLY_SCHEDULE_LIMIT',429,'This pilot includes up to thirty scheduled preparations per account per calendar month.'],
  ['LOOP_ERASURE_IN_PROGRESS',409,'Your Job Loop is being erased. Continue erasure before making another change.'],
  ['LOOP_ERASURE_RETRY',503,'Preparation is stopped and documents are revoked. Continue erasure to remove the remaining files.'],
  ['LOOP_ERASURE_STALE',409,'This erasure attempt is no longer current. Refresh before continuing.'],
  ['LOOP_ARTIFACT_UNAUTHORIZED',409,'This preparation no longer has permission to store a document. Start or resume the current run.'],
  ['LOOP_REQUEST_GENERATION_REQUIRED',409,'Refresh Jobvance before continuing. This action needs the current workspace lifetime.'],
  ['LOOP_REQUEST_STALE',409,'Your Job Loop was erased or restarted. Refresh it and review this action again.'],
  ['LOOP_SUPPORT_LIMIT',429,'Five requests have already been recorded today. Your existing requests remain visible.'],
  ['LOOP_GMAIL_NOT_CONNECTED',403,'Connect Gmail with the required read or draft permission first.'],
];
export function loopDatabaseError(error: { message?: string } | null): void {
  if (!error) return; for (const [code,status,message] of ERRORS) if (error.message?.includes(code)) throw new ApiError(status,code,message);
  throw new ApiError(503,'LOOP_PERSISTENCE_FAILED','The cloud loop could not save this change. Retry with the same request reference.');
}
export class LoopRepository {
  constructor(public admin: LoopAdmin) {}
  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const { data,error } = await this.admin.rpc(name,args); loopDatabaseError(error); return data as T; }
  /** Passive reads never call owner-lock RPCs that create lifecycle metadata. */
  async existingLifecycle(userId: string): Promise<LifecycleRow | null> {
    const {data,error}=await this.admin.from('job_loop_lifecycle').select('user_id,state,generation').eq('user_id',userId).maybeSingle();loopDatabaseError(error);
    if(!data)return null;
    if(data.user_id!==userId||!['active','erasing','erased'].includes(data.state)||!validLoopGeneration(Number(data.generation)))throw new ApiError(503,'LOOP_PERSISTENCE_FAILED','The existing Job Loop lifetime could not be confirmed.');
    return {...data,generation:Number(data.generation)} as LifecycleRow;
  }
  async existingRecord(userId: string): Promise<RecordRow | null> {
    const {data,error}=await this.admin.from('job_loop_records').select('*').eq('user_id',userId).maybeSingle();loopDatabaseError(error);
    if(!data)return null;
    if(data.user_id!==userId||!Number.isSafeInteger(Number(data.version))||Number(data.version)<0||!Number.isSafeInteger(Number(data.input_version))||Number(data.input_version)<0)throw new ApiError(503,'LOOP_PERSISTENCE_FAILED','The existing Job Loop record could not be confirmed.');
    return {...data,version:Number(data.version),input_version:Number(data.input_version)} as RecordRow;
  }
  async record(userId: string, expectedGeneration?: number, initialize = false): Promise<RecordRow> {
    if(expectedGeneration!==undefined)return this.rpc<RecordRow>('job_loop_read_record',{p_user:userId,p_generation:expectedGeneration});
    if(initialize)return this.rpc<RecordRow>('job_loop_open_record',{p_user:userId});
    const {data,error}=await this.admin.from('job_loop_records').select('*').eq('user_id',userId).maybeSingle();loopDatabaseError(error);
    if(!data)throw new ApiError(404,'LOOP_NOT_FOUND','That Job Loop record is no longer available. Refresh before continuing.');
    return data as RecordRow;
  }
  async assertGeneration(userId:string,generation:unknown):Promise<void> {
    if(!validLoopGeneration(generation))throw new ApiError(409,'LOOP_REQUEST_GENERATION_REQUIRED','Refresh Jobvance before continuing. This action needs the current workspace lifetime.');
    await this.rpc('job_loop_assert_generation',{p_user:userId,p_generation:generation});
  }
  erasureStatus(userId:string) { return this.rpc<{state:'active'|'erasing'|'erased';generation:number}>('job_loop_erasure_status',{p_user:userId}); }
  async readCvVariants(userId:string,generation:number) {
    const result=await this.rpc<unknown>('job_loop_read_cv_variants_bound',{p_user:userId,p_generation:generation});
    try{return validateCvVariantsRead(result,generation);}catch{throw new ApiError(503,'LOOP_VARIANT_RECEIPT_INVALID','The saved CV variant list could not be confirmed. Refresh before continuing.');}
  }
  async readCvVariantFacts(userId:string,value:unknown) {
    const scope=validateCvVariantFactReadScope(value);
    const result=await this.rpc<unknown>('job_loop_read_cv_variant_facts_bound',{p_user:userId,p_generation:scope.expectedGeneration,p_variant:scope.variantId});
    try{return validateCvVariantFactsRead(result,scope);}catch{throw new ApiError(503,'LOOP_VARIANT_FACT_RECEIPT_INVALID','The saved facts could not be confirmed. Refresh before continuing.');}
  }
  async writeCvVariantFact(userId:string,value:unknown,withdraw=false) {
    const intent=withdraw?captureCvVariantFactWithdrawIntent(value):captureCvVariantFactSaveIntent(value);
    const args={p_user:userId,p_generation:intent.expectedGeneration,p_expected:intent.expectedVersion,p_request:intent.requestId,
      p_variant:intent.variantId,p_variant_expected:intent.expectedVariantRevision,p_source_hash:intent.sourceHash,
      p_fact:intent.factId,p_fact_expected:intent.expectedFactRevision};
    const result=await this.rpc<unknown>(withdraw?'job_loop_withdraw_cv_variant_fact_bound':'job_loop_save_cv_variant_fact_bound',
      'claim' in intent?{...args,p_claim:intent.claim,p_save_consent:intent.saveConsent}:{...args,p_withdraw_consent:intent.withdrawConsent});
    try{return validateCvVariantFactReceipt(result,intent);}catch{throw new ApiError(503,'LOOP_VARIANT_FACT_RECEIPT_INVALID','The fact change could not be confirmed. Retry the original request before changing it again.');}
  }
  async saveCvVariant(userId:string,value:unknown) {
    const intent=captureCvVariantSaveIntent(value);
    const result=await this.rpc<Record<string,unknown>>('job_loop_save_cv_variant_bound',{
      p_user:userId,p_generation:intent.expectedGeneration,p_expected:intent.expectedVersion,p_request:intent.requestId,
      p_variant:intent.variantId,p_variant_expected:intent.expectedVariantRevision,p_label:intent.label,p_profile:intent.profile,
      p_claims:intent.claimRefs,p_save_consent:intent.saveConsent,
    });
    try{
      if(!result||Object.prototype.hasOwnProperty.call(result,'generation'))throw new Error('Unexpected SQL receipt generation.');
      return validateCvVariantSaveReceipt({...result,generation:intent.expectedGeneration},intent);
    }catch{throw new ApiError(503,'LOOP_VARIANT_RECEIPT_INVALID','The CV save receipt could not be confirmed. Retry the original request before saving again.');}
  }
  write(userId: string, expected: number, data: CareerRecord, inputsChanged: boolean) { return this.rpc<RecordRow>('job_loop_write_record',{ p_user:userId,p_expected:expected,p_data:data,p_inputs_changed:inputsChanged }); }
  async linkSavedCheck(userId: string, generation: number, expected: number, checkId: string, opportunity: LoopOpportunityInput, linkConsent: boolean) {
    const result = await this.rpc<{ record: RecordRow; opportunityId: string; reused: boolean }>('job_loop_link_saved_check', {
      p_user: userId, p_generation: generation, p_expected: expected, p_check: checkId, p_opportunity: opportunity, p_link_consent: linkConsent,
    });
    const opportunities = result?.record?.data?.opportunities;
    const matches = Array.isArray(opportunities) ? opportunities.filter(item => item?.sourceCheckId === checkId) : [];
    if (result?.record?.user_id !== userId || typeof result?.reused !== 'boolean' || typeof result?.opportunityId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result.opportunityId) || matches.length !== 1
      || matches[0].id !== result.opportunityId || matches[0].source !== 'manual' || matches[0].sourceKey !== `saved-check:${checkId}`) {
      throw new ApiError(503,'LOOP_CHECK_LINK_INVALID','The saved vacancy link could not be confirmed. Retry the same saved check after refreshing.');
    }
    return { opportunityId: result.opportunityId, reused: result.reused };
  }
  async run(userId: string, id: string): Promise<RunRow> {
    const { data,error } = await this.admin.from('job_loop_runs').select('*').eq('user_id',userId).eq('id',id).maybeSingle(); loopDatabaseError(error); if (!data) throw new ApiError(404,'LOOP_NOT_FOUND','That run is unavailable in your account.'); return data as RunRow;
  }
  async requestRun(userId: string, request: string): Promise<RunRow | null> { const { data,error } = await this.admin.from('job_loop_runs').select('*').eq('user_id',userId).eq('request_id',request).maybeSingle(); loopDatabaseError(error); return data as RunRow | null; }
  async packet(userId: string, id: string): Promise<PacketRow> { const { data,error } = await this.admin.from('job_loop_packets').select('*').eq('user_id',userId).eq('id',id).maybeSingle(); loopDatabaseError(error); if (!data) throw new ApiError(404,'LOOP_NOT_FOUND','That packet is unavailable in your account.'); return data as PacketRow; }
  async collections(userId: string) {
    const [runs,packets,usage,connection] = await Promise.all([
      this.admin.from('job_loop_runs').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(30),
      this.admin.from('job_loop_packets').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(150),
      this.admin.from('job_loop_usage').select('run_id,reserved_micros,actual_micros,status').eq('user_id',userId).limit(1000),
      this.admin.from('job_loop_connections').select('email,allow_drafts').eq('user_id',userId).maybeSingle(),
    ]); for (const result of [runs,packets,usage,connection]) loopDatabaseError(result.error);
    return { runs:(runs.data ?? []) as RunRow[],packets:(packets.data ?? []) as PacketRow[],usage:usage.data ?? [],connection:connection.data as {email:string|null;allow_drafts:boolean}|null };
  }
  async claimRun(id: string, lease: string) { return this.rpc<RunRow | null>('job_loop_claim_run',{p_run:id,p_lease:lease}); }
  commit(run: RunRow, phase: number, status: LoopRun['status'], data: RunState, packets: LoopPacket[] = [], opportunities: LoopOpportunity[] = []) {
    return this.rpc<RunRow>('job_loop_commit_phase',{p_run:run.id,p_lease:run.lease_token,p_phase:phase,p_status:status,p_data:data,p_packets:packets,p_opportunities:opportunities});
  }
  reserve(run: RunRow,key: string,provider: string,micros: number,capUsd=50) { return this.rpc<UsageRow>('job_loop_reserve',{p_user:run.user_id,p_run:run.id,p_lease:run.lease_token,p_key:key,p_provider:provider,p_micros:micros,p_cap_micros:Math.floor(capUsd*1000000)}); }
  async operationalSnapshot(userId:string,capUsd:number) {
    const [schedule,activity,support,budget,scheduler]=await Promise.all([
      this.admin.from('job_loop_schedules').select('*').eq('user_id',userId).maybeSingle(),
      this.admin.from('job_loop_activity').select('*').eq('user_id',userId).order('at',{ascending:false}).limit(100),
      this.admin.from('job_loop_support_requests').select('id,category,message,status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(20),
      this.rpc<Record<string,unknown>>('job_loop_budget_snapshot',{p_user:userId,p_cap_micros:Math.floor(capUsd*1000000)}),
      this.rpc<{ready:boolean}>('job_loop_scheduler_state',{}),
    ]);
    for(const result of [schedule,activity,support])loopDatabaseError(result.error);
    return {schedule:schedule.data?publicSchedule(schedule.data as ScheduleRow):null,
      activity:(activity.data??[]).map(item=>({id:item.id,kind:item.kind,actor:item.actor,at:item.at,summary:item.summary,opportunityId:item.opportunity_id,runId:item.run_id})) as LoopActivity[],
      support:(support.data??[]).map(item=>({id:item.id,category:item.category,message:item.message,status:item.status,createdAt:item.created_at})),budget,scheduler};
  }
  async recoverableRuns():Promise<RunRow[]> {
    const {data,error}=await this.admin.from('job_loop_runs').select('*').in('status',['queued','running']).order('created_at',{ascending:true}).limit(20);loopDatabaseError(error);
    return (data??[]).filter(item=>!item.lease_until||Date.parse(item.lease_until)<Date.now()) as RunRow[];
  }
  async eraseArtifacts(userId:string,expectedGeneration:number) {
    await eraseLoopArtifacts({rpc:<T>(name:string,args:Record<string,unknown>)=>this.rpc<T>(name,args),remove:paths=>this.admin.storage.from('job-loop-artifacts').remove(paths)},userId,expectedGeneration);
  }
  collectTerminalArtifacts() {
    return collectLoopArtifacts({rpc:<T>(name:string,args:Record<string,unknown>)=>this.rpc<T>(name,args),remove:paths=>this.admin.storage.from('job-loop-artifacts').remove(paths)});
  }
  settle(id: string, actual: number | null, result: unknown, uncertain = false) { return this.rpc<UsageRow>('job_loop_settle',{p_usage:id,p_actual:actual,p_result:result,p_uncertain:uncertain}); }
  async upload(run: RunRow, packetId: string, key: string, bytes: Uint8Array, mimeType: string): Promise<string> {
    if (!['pdf','docx','txt','report','letter'].includes(key) || bytes.byteLength>5242880) throw new ApiError(422,'LOOP_ARTIFACT_INVALID','The generated artifact cannot be stored.');
    if(!run.lease_token)throw new ApiError(409,'LOOP_ARTIFACT_UNAUTHORIZED','This stage no longer owns its preparation lease.');
    const hash=await digest(bytes);const path=`${run.user_id}/${packetId}/${hash}/${key}`;
    const authorized=await this.rpc<string>('job_loop_authorize_artifact',{p_user:run.user_id,p_run:run.id,p_lease:run.lease_token,p_packet:packetId,p_hash:hash,p_key:key});
    if(authorized!==path)throw new ApiError(503,'LOOP_ARTIFACT_UNAUTHORIZED','The private artifact authorization did not match this document.');
    const {error}=await this.admin.storage.from('job-loop-artifacts').upload(path,bytes,{contentType:mimeType.split(';')[0],upsert:false});
    if(error){const existing=await this.admin.storage.from('job-loop-artifacts').download(path);if(existing.error||!existing.data||await digest(new Uint8Array(await existing.data.arrayBuffer()))!==hash)loopDatabaseError(error);}return path;
  }
  async signedArtifact(userId: string, packet: LoopPacket, key: string): Promise<string> {
    const path=packet.artifacts[key]?.path;
    if (!path || !/^[a-f0-9]{64}$/.test(packet.artifacts[key].sha256) || path!==`${userId}/${packet.id}/${packet.artifacts[key].sha256}/${key}`) throw new ApiError(404,'LOOP_ARTIFACT_MISSING','That approved artifact is unavailable.');
    const stored=await this.admin.storage.from('job-loop-artifacts').download(path);loopDatabaseError(stored.error);if(!stored.data||await digest(new Uint8Array(await stored.data.arrayBuffer()))!==packet.artifacts[key].sha256)throw new ApiError(409,'LOOP_ARTIFACT_CHANGED','The stored artifact no longer matches the approved manifest.');
    if(packet.cvSelection)await this.rpc('job_loop_assert_packet_cv_authority',{p_user:userId,p_packet:packet.id});
    const {data,error}=await this.admin.storage.from('job-loop-artifacts').createSignedUrl(path,120); loopDatabaseError(error); if (!data?.signedUrl) throw new ApiError(503,'LOOP_ARTIFACT_MISSING','The download could not be opened.'); return data.signedUrl;
  }
}
export function publicSchedule(row:ScheduleRow):LoopSchedule{return {...row.settings,version:Number(row.version),status:row.status,nextRunAt:row.next_run_at,lastRunId:row.last_run_id,lastAttemptAt:row.last_attempt_at,message:row.message};}

export function publicRun(row: RunRow, usage: {run_id:string;reserved_micros:number;actual_micros:number|null;status:string}[]): LoopRun {
  const owned=usage.filter(item=>item.run_id===row.id);
  return {...(row.snapshot.cvSelection?{cvSelection:row.snapshot.cvSelection}:{}),...(row.selected_opportunity_ids!=null?{selection:{generation:row.selected_generation!,opportunityIds:[...row.selected_opportunity_ids]}}:{}),id:row.id,requestId:row.request_id,status:row.status,phase:(row.selected_opportunity_ids!=null&&row.phase<2?'selection':['inbox','discovery','prepare_1','prepare_2','prepare_3','prepare_4','prepare_5','report'][row.phase] ?? 'report'),startedAt:row.created_at,finishedAt:row.finished_at,inputHash:row.input_hash,provider:row.provider,model:row.model,lanes:row.data.lanes??[],messages:row.data.messages??[],nextAction:row.data.nextAction??'This run is awaiting its next background stage.',opportunityIds:row.data.opportunityIds??[],packetIds:row.data.packetIds??[],reservedUsd:owned.filter(item=>item.status!=='settled').reduce((sum,item)=>sum+Number(item.reserved_micros),0)/1000000,usageUsd:owned.reduce((sum,item)=>sum+Number(item.actual_micros??0),0)/1000000};
}
