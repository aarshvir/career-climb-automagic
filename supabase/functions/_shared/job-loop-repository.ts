import { ApiError } from './core.ts';
import type { adminClient } from './runtime.ts';
import type { LoopActivity, LoopClaim, LoopInboxSignal, LoopOpportunity, LoopPacket, LoopProfile, LoopRun, LoopSchedule, LoopScheduleInput } from './job-loop-types.ts';
import { digest } from './job-loop-providers.ts';

export type LoopAdmin = ReturnType<typeof adminClient>;
export interface CareerRecord { profile: LoopProfile | null; claims: LoopClaim[]; opportunities: LoopOpportunity[]; inbox: LoopInboxSignal[] }
export interface RecordRow { user_id: string; version: number; input_version: number; data: CareerRecord; updated_at: string }
export interface RunRow { id: string; user_id: string; request_id: string; request_hash: string; input_hash: string; input_version: number; snapshot: CareerRecord; provider: LoopRun['provider']; model: string; consents: { model: boolean; inbox: boolean }; data: RunState; status: LoopRun['status']; phase: number; lease_token: string | null; lease_until: string | null; created_at: string; finished_at: string | null }
export interface RunState { lanes?: LoopRun['lanes']; messages?: string[]; nextAction?: string; opportunityIds?: string[]; packetIds?: string[]; reusedPacketIds?:string[]; opportunities?: LoopOpportunity[]; inbox?: LoopInboxSignal[] }
export interface UsageRow { id: string; reserved_micros: number; actual_micros: number | null; status: 'reserved' | 'settled' | 'uncertain'; result: unknown; is_new: boolean }
export interface PacketRow { id: string; user_id: string; input_version: number; status: LoopPacket['status']; data: LoopPacket }
export interface ScheduleRow { user_id:string;version:number;status:LoopSchedule['status'];settings:LoopScheduleInput;next_run_at:string|null;lease_token:string|null;lease_until:string|null;last_run_id:string|null;last_attempt_at:string|null;message:string }
const ERRORS: [string, number, string][] = [
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
];
export function loopDatabaseError(error: { message?: string } | null): void {
  if (!error) return; for (const [code,status,message] of ERRORS) if (error.message?.includes(code)) throw new ApiError(status,code,message);
  throw new ApiError(503,'LOOP_PERSISTENCE_FAILED','The cloud loop could not save this change. Retry with the same request reference.');
}
export class LoopRepository {
  constructor(public admin: LoopAdmin) {}
  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const { data,error } = await this.admin.rpc(name,args); loopDatabaseError(error); return data as T; }
  async record(userId: string): Promise<RecordRow> {
    const inserted = await this.admin.from('job_loop_records').upsert({ user_id:userId },{ onConflict:'user_id',ignoreDuplicates:true }); loopDatabaseError(inserted.error);
    const { data,error } = await this.admin.from('job_loop_records').select('*').eq('user_id',userId).single(); loopDatabaseError(error); if (!data) throw new ApiError(503,'LOOP_PERSISTENCE_FAILED','Your record could not be opened.'); return data as RecordRow;
  }
  write(userId: string, expected: number, data: CareerRecord, inputsChanged: boolean) { return this.rpc<RecordRow>('job_loop_write_record',{ p_user:userId,p_expected:expected,p_data:data,p_inputs_changed:inputsChanged }); }
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
  async eraseArtifacts(userId:string) {
    await this.rpc('job_loop_begin_erase',{p_user:userId});
    const folders=[userId];const paths:string[]=[];let scanned=0;
    while(folders.length){const prefix=folders.shift()!;let offset=0;
      for(;;){const {data,error}=await this.admin.storage.from('job-loop-artifacts').list(prefix,{limit:1000,offset});loopDatabaseError(error);
        for(const item of data??[]){if(++scanned>10000)throw new ApiError(503,'LOOP_ERASURE_RETRY','Preparation is stopped and documents are revoked. Erasure needs another retry or owner support.');
          const path=`${prefix}/${item.name}`;if(!path.startsWith(`${userId}/`)||path.split('/').some(part=>part==='..'||!part||part.includes('\\')))throw new ApiError(503,'LOOP_ERASURE_PATH','A private storage path could not be safely erased.');
          if(item.id)paths.push(path);else folders.push(path);
        }
        if((data?.length??0)<1000)break;offset+=1000;
      }
    }
    for(let index=0;index<paths.length;index+=100){const {error}=await this.admin.storage.from('job-loop-artifacts').remove(paths.slice(index,index+100));loopDatabaseError(error);}
    await this.rpc('job_loop_finish_erase',{p_user:userId});
  }
  settle(id: string, actual: number | null, result: unknown, uncertain = false) { return this.rpc<UsageRow>('job_loop_settle',{p_usage:id,p_actual:actual,p_result:result,p_uncertain:uncertain}); }
  async upload(userId: string, packetId: string, key: string, bytes: Uint8Array, mimeType: string): Promise<string> {
    if (!['pdf','docx','txt','report','letter'].includes(key) || bytes.byteLength>5242880) throw new ApiError(422,'LOOP_ARTIFACT_INVALID','The generated artifact cannot be stored.');
    const hash=await digest(bytes);const path=`${userId}/${packetId}/${hash}/${key}`; const {error}=await this.admin.storage.from('job-loop-artifacts').upload(path,bytes,{contentType:mimeType.split(';')[0],upsert:false});
    if(error){const existing=await this.admin.storage.from('job-loop-artifacts').download(path);if(existing.error||!existing.data||await digest(new Uint8Array(await existing.data.arrayBuffer()))!==hash)loopDatabaseError(error);}return path;
  }
  async signedArtifact(userId: string, packet: LoopPacket, key: string): Promise<string> {
    const path=packet.artifacts[key]?.path;
    if (!path || !/^[a-f0-9]{64}$/.test(packet.artifacts[key].sha256) || path!==`${userId}/${packet.id}/${packet.artifacts[key].sha256}/${key}`) throw new ApiError(404,'LOOP_ARTIFACT_MISSING','That approved artifact is unavailable.');
    const stored=await this.admin.storage.from('job-loop-artifacts').download(path);loopDatabaseError(stored.error);if(!stored.data||await digest(new Uint8Array(await stored.data.arrayBuffer()))!==packet.artifacts[key].sha256)throw new ApiError(409,'LOOP_ARTIFACT_CHANGED','The stored artifact no longer matches the approved manifest.');
    const {data,error}=await this.admin.storage.from('job-loop-artifacts').createSignedUrl(path,120); loopDatabaseError(error); if (!data?.signedUrl) throw new ApiError(503,'LOOP_ARTIFACT_MISSING','The download could not be opened.'); return data.signedUrl;
  }
}
export function publicSchedule(row:ScheduleRow):LoopSchedule{return {...row.settings,version:Number(row.version),status:row.status,nextRunAt:row.next_run_at,lastRunId:row.last_run_id,lastAttemptAt:row.last_attempt_at,message:row.message};}

export function publicRun(row: RunRow, usage: {run_id:string;reserved_micros:number;actual_micros:number|null;status:string}[]): LoopRun {
  const owned=usage.filter(item=>item.run_id===row.id);
  return {id:row.id,requestId:row.request_id,status:row.status,phase:['inbox','discovery','prepare_1','prepare_2','prepare_3','prepare_4','prepare_5','report'][row.phase] ?? 'report',startedAt:row.created_at,finishedAt:row.finished_at,inputHash:row.input_hash,provider:row.provider,model:row.model,lanes:row.data.lanes??[],messages:row.data.messages??[],nextAction:row.data.nextAction??'This run is awaiting its next background stage.',opportunityIds:row.data.opportunityIds??[],packetIds:row.data.packetIds??[],reservedUsd:owned.filter(item=>item.status!=='settled').reduce((sum,item)=>sum+Number(item.reserved_micros),0)/1000000,usageUsd:owned.reduce((sum,item)=>sum+Number(item.actual_micros??0),0)/1000000};
}
