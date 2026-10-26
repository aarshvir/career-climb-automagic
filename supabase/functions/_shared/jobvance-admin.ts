import { ApiError } from './core.ts';
import type { AdminAction, AdminConfigInput, AdminDashboard, AdminRole, AdminSnapshot, AdminResponse } from '../../../src/lib/admin-types.ts';
import type { LoopEnv, LoopFetch } from './job-loop-providers.ts';
import { checkOpenRouterKey } from './jobvance-openrouter.ts';

export interface AdminDatabase {
  auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(name: string): { select(columns: string): { eq(column: string, value: unknown): { eq(column: string, value: unknown): { maybeSingle(): Promise<{ data: { role: string } | null; error: unknown }> } } } };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}
const uuidPattern = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
function invalid(): never { throw new ApiError(400, 'ADMIN_INPUT_INVALID', 'Choose a supported administration action and complete settings.'); }
function exact(item: Record<string, unknown>, keys: string[]): void { if (Object.keys(item).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(item, key))) invalid(); }
export function validateAdminAction(value: unknown): AdminAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const item = value as Record<string, unknown>;
  if(item.action==='guest_support_list'){exact(item,['action']);return {action:'guest_support_list'};}
  if(item.action==='guest_support_detail'){exact(item,['action','id']);if(typeof item.id!=='string'||!uuidPattern.test(item.id))invalid();return {action:'guest_support_detail',id:item.id};}
  if(item.action==='guest_support_update'){exact(item,['action','id','expectedVersion','status','reply']);if(typeof item.id!=='string'||!uuidPattern.test(item.id)||!Number.isSafeInteger(item.expectedVersion)||Number(item.expectedVersion)<0||typeof item.status!=='string'||!['received','in_review','resolved'].includes(item.status)||typeof item.reply!=='string'||item.reply.length>2000||item.reply.includes('\0'))invalid();return item as unknown as AdminAction;}
  if (item.action === 'contacts') { exact(item, ['action']); return { action: 'contacts' }; }
  if (item.action === 'visit' || item.action === 'person') { exact(item, ['action', 'id']); if (typeof item.id !== 'string' || !uuidPattern.test(item.id)) invalid(); return { action: item.action, id: item.id.toLowerCase() }; }
  if (item.action === 'snapshot' || item.action === 'dashboard' || item.action === 'analytics') { exact(item, ['action', 'days']); if (![7,30,90].includes(Number(item.days)) || typeof item.days !== 'number') invalid(); return item as unknown as AdminAction; }
  if (item.action === 'provider_status') { exact(item, ['action']); return { action: 'provider_status' }; }
  if (item.action === 'support_detail') { exact(item,['action','id']); if (typeof item.id !== 'string' || !uuidPattern.test(item.id)) invalid(); return { action:'support_detail',id:item.id }; }
  if (item.action === 'update_support') {
    exact(item, ['action','id','expectedVersion','status']);
    if (typeof item.id !== 'string' || !uuidPattern.test(item.id) || !Number.isSafeInteger(item.expectedVersion) || Number(item.expectedVersion)<0 || !['received','in_review','resolved'].includes(String(item.status))) invalid();
    return item as unknown as AdminAction;
  }
  if (item.action === 'update_config') {
    exact(item, ['action','expectedVersion','config']);
    if (!Number.isSafeInteger(item.expectedVersion) || Number(item.expectedVersion)<0 || !item.config || typeof item.config !== 'object' || Array.isArray(item.config)) invalid();
    const config = item.config as Record<string, unknown>;
    exact(config, ['schedulerEnabled','monthlyCapUsd','routerEnabled','defaultModel','reasoning']);
    if (typeof config.schedulerEnabled !== 'boolean' || typeof config.routerEnabled !== 'boolean' || typeof config.monthlyCapUsd !== 'number' || !Number.isFinite(config.monthlyCapUsd) || config.monthlyCapUsd<=0 || config.monthlyCapUsd>50 || !Number.isInteger(config.monthlyCapUsd*1000000) || !['openai/gpt-6.1-sol','anthropic/claude-sonnet-5.5'].includes(String(config.defaultModel)) || config.reasoning !== 'medium') invalid();
    return { action:'update_config',expectedVersion:Number(item.expectedVersion),config:config as unknown as AdminConfigInput };
  }
  invalid();
}
export function adminDatabaseError(error: { message?: string } | null): void {
  if (!error) return;
  const errors: [string,number,string][] = [
    ['ADMIN_FORBIDDEN',403,'Your account does not have access to this administration action.'],
    ['ADMIN_VERSION_CONFLICT',409,'This item changed. Refresh before saving again.'],
    ['ADMIN_REQUEST_CONFLICT',409,'This request reference belongs to different inputs. Use a new request reference.'],
    ['ADMIN_CONFIG_INVALID',422,'Choose supported settings. The monthly cap can only be lowered.'],
    ['ADMIN_NOT_FOUND',404,'This administration item is unavailable.'],
    ['ADMIN_INPUT_INVALID',400,'The administration action is invalid.'],
    ['ADMIN_BUDGET_LIMIT',429,'The shared monthly AI/search ceiling has been reached.'],
    ['ADMIN_REVIEW_BATCH_LIMIT',429,'The independent review batch ceiling has been reached.'],
  ];
  for (const [code,status,message] of errors) if (error.message?.includes(code)) throw new ApiError(status,code,message);
  throw new ApiError(503,'ADMIN_PERSISTENCE_FAILED','Administration is temporarily unavailable. Retry after refreshing.');
}
/** Custom auth.getUser verification plus a fresh private membership lookup on
 * EVERY request. User metadata, role claims and email are never authorization. */
export async function authenticateAdmin(req: Request, db: AdminDatabase): Promise<{ id: string; role: AdminRole }> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!match) throw new ApiError(401,'UNAUTHORIZED','Sign in to continue.');
  const identity = await db.auth.getUser(match[1]);
  if (identity.error || !identity.data.user) throw new ApiError(401,'UNAUTHORIZED','Your session has expired. Sign in again.');
  const id = identity.data.user.id;
  const membership = await db.from('jobvance_admin_members').select('role').eq('user_id',id).eq('active',true).maybeSingle();
  if (membership.error) throw new ApiError(503,'ADMIN_PERSISTENCE_FAILED','Administration is temporarily unavailable.');
  if (!membership.data || !['owner','operator'].includes(membership.data.role)) throw new ApiError(403,'ADMIN_FORBIDDEN','Your account does not have administration access.');
  return { id,role:membership.data.role as AdminRole };
}
async function rpc<T>(db: AdminDatabase, name: string, args: Record<string, unknown>): Promise<T> { const result = await db.rpc(name,args); adminDatabaseError(result.error); return result.data as T; }
export async function controlAdmin(db: AdminDatabase, actor: { id: string; role: AdminRole }, action: AdminAction, env: LoopEnv, fetcher: LoopFetch = fetch): Promise<AdminResponse> {
  if(action.action==='guest_support_list')return {guestSupport:await rpc(db,'jobvance_admin_guest_support_list',{p_actor:actor.id})};
  if(action.action==='guest_support_detail')return {guestSupportDetail:await rpc(db,'jobvance_admin_guest_support_detail',{p_actor:actor.id,p_id:action.id})};
  if(action.action==='guest_support_update')return {guestSupportDetail:await rpc(db,'jobvance_admin_guest_support_update',{p_actor:actor.id,p_id:action.id,p_expected_version:action.expectedVersion,p_status:action.status,p_reply:action.reply})};
  // Recheck inside each SQL RPC to fence role revocation after the HTTP lookup.
  if (action.action === 'snapshot') {
    const snapshot = await rpc<AdminSnapshot>(db,'jobvance_admin_snapshot',{p_actor:actor.id,p_days:action.days});
    snapshot.operations.scheduler.ready = snapshot.operations.scheduler.enabled && env('JOB_LOOP_ENABLED')!=='false' && !!env('SUPABASE_URL') && !!env('SUPABASE_SERVICE_ROLE_KEY');
    if (snapshot.operations.scheduler.ready) snapshot.operations.scheduler.message = 'The global scheduler is enabled and server worker configuration is present. Last dispatch is observed separately; future successful dispatch is unverified. Schedule counts include QA occupancy.';
    if (snapshot.operations.scheduler.enabled && !snapshot.operations.scheduler.ready) snapshot.operations.scheduler.message = 'Globally enabled, but the server worker configuration is incomplete. No successful dispatch is inferred.';
    await rpc(db,'jobvance_admin_record_event',{p_actor:actor.id,p_action:'snapshot',p_details:{days:action.days}});
    return { snapshot };
  }
  if (action.action === 'dashboard') {
    // Membership is rechecked inside the RPC; the existing audit action records the read.
    const dashboard = await rpc<AdminDashboard>(db,'jobvance_admin_dashboard',{p_actor:actor.id,p_days:action.days});
    await rpc(db,'jobvance_admin_record_event',{p_actor:actor.id,p_action:'snapshot',p_details:{days:action.days}});
    return { dashboard };
  }
  if (action.action === 'analytics') {
    const analytics = await rpc<unknown>(db,'jobvance_admin_analytics',{p_actor:actor.id,p_days:action.days});
    await rpc(db,'jobvance_admin_record_event',{p_actor:actor.id,p_action:'snapshot',p_details:{days:action.days}});
    return { analytics };
  }
  if (action.action === 'contacts') {
    const contacts = await rpc<unknown[]>(db,'jobvance_admin_contacts',{p_actor:actor.id});
    await rpc(db,'jobvance_admin_record_event',{p_actor:actor.id,p_action:'snapshot',p_details:{count:Array.isArray(contacts)?contacts.length:0}});
    return { contacts };
  }
  if (action.action === 'visit') {
    const visit = await rpc<unknown>(db,'jobvance_admin_session',{p_actor:actor.id,p_session:action.id});
    await rpc(db,'jobvance_admin_record_event',{p_actor:actor.id,p_action:'snapshot',p_target:action.id,p_details:{}});
    return { visit };
  }
  if (action.action === 'person') {
    const person = await rpc<unknown>(db,'jobvance_admin_person',{p_actor:actor.id,p_user:action.id});
    await rpc(db,'jobvance_admin_record_event',{p_actor:actor.id,p_action:'snapshot',p_target:action.id,p_details:{}});
    return { person };
  }
  if (action.action === 'update_config') {
    if (actor.role !== 'owner') throw new ApiError(403,'ADMIN_FORBIDDEN','Only an owner can change global settings.');
    return { config: await rpc(db,'jobvance_admin_update_config',{p_actor:actor.id,p_expected:action.expectedVersion,p_config:action.config}) };
  }
  if (action.action === 'update_support') return { support: await rpc(db,'jobvance_admin_update_support',{p_actor:actor.id,p_id:action.id,p_expected:action.expectedVersion,p_status:action.status}) };
  if (action.action === 'support_detail') return { supportDetail: await rpc(db,'jobvance_admin_support_detail',{p_actor:actor.id,p_id:action.id}) };
  await rpc(db,'jobvance_assert_admin',{p_actor:actor.id});
  const providerStatus = await checkOpenRouterKey(env,fetcher);
  await rpc(db,'jobvance_admin_record_event',{p_actor:actor.id,p_action:'provider_status',p_details:{configured:providerStatus.configured,valid:providerStatus.valid}});
  return { providerStatus };
}
