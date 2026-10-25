import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { readAuthSession } from '@/utils/authSession';
import type { AdminAction, AdminResponse, AdminWindow } from '@/lib/admin-types';
import { dashboardSchema } from '@/lib/admin-dashboard';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';

const short = z.string().max(1000), id = z.string().min(1).max(128), count = z.number().int().nonnegative();
const days = z.union([z.literal(7), z.literal(30), z.literal(90)]);
const status = z.enum(['received', 'in_review', 'resolved']);
const configInput = z.object({ schedulerEnabled: z.boolean(), monthlyCapUsd: z.number().positive().max(50), routerEnabled: z.boolean(), defaultModel: z.enum(['openai/gpt-6.1-sol', 'anthropic/claude-sonnet-5.5']), reasoning: z.literal('medium') });
const config = configInput.extend({ version: count, updatedAt: short });
const provider = z.object({ configured: z.boolean(), valid: z.boolean().nullable(), status: z.enum(['not_configured', 'valid', 'invalid', 'unavailable']), checkedAt: short, message: short });
const metric = z.object({ key: short, label: short, count: count.nullable(), denominator: count.nullable(), percent: z.number().min(0).max(100).nullable(), source: short, definition: short, availability: z.enum(['measured', 'untracked', 'disabled']), smallSample: z.boolean() });
const snapshot = z.object({
  actor: z.object({ id, role: z.enum(['owner', 'operator']) }), generatedAt: short,
  window: z.object({ days, start: short, end: short, timezone: z.literal('UTC') }),
  coverage: z.object({ excludedQaUsers: count, usersTotal: count, usersListed: count, listLimit: count, notes: z.array(short).max(50) }), config,
  operations: z.object({
    users: z.array(z.object({ id, emailDisplay: short, joinedAt: short, hasProfile: z.boolean(), claims: count, shareableClaims: count, completedRuns: count, failedRuns: count, pilotActive: z.boolean() })).max(1000),
    support: z.array(z.object({ id, userId: id, emailDisplay: short, category: z.enum(['help', 'privacy', 'bug']), status, createdAt: short, version: count, messageAvailable: z.boolean() })).max(1000),
    recentRuns: z.array(z.object({ id, userId: id, status: short, phase: count, provider: short, model: short, createdAt: short, finishedAt: short.nullable() })).max(1000),
    scheduler: z.object({ enabled: z.boolean(), ready: z.boolean(), lastDispatchAt: short.nullable(), activeSchedules: count, dueSchedules: count, staleLeases: count, message: short }),
    pilot: z.object({ activeUsers: count, capacity: z.literal(10), qaOccupancy: count }),
  }),
  analytics: z.object({ milestones: z.array(metric).max(100), funnel: z.array(metric).max(100), retention: z.array(metric).max(100),
    revenue: z.object({ checkoutEnabled: z.literal(false), recognizedUsd: z.number().nonnegative().nullable(), message: short }),
    budget: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), capUsd: z.number().positive().max(50), committedUsd: z.number().nonnegative(), remainingUsd: z.number().nonnegative(), actualUsd: z.number().nonnegative(), reservedUsd: z.number().nonnegative(), uncertainUsd: z.number().nonnegative(), candidateActualUsd: z.number().nonnegative(), adminActualUsd: z.number().nonnegative(), reviewBatchCapUsd: z.literal(5), source: z.literal('job_loop_budget_months + job_loop_usage + jobvance_admin_model_usage') }),
  }),
  audit: z.array(z.object({ id, actorId: id, action: short, targetId: id.nullable(), at: short, details: z.record(z.union([short, z.number(), z.boolean(), z.null()])) })).max(1000), providerStatus: provider.nullable(),
});
const guestMeta=z.object({id,category:z.enum(['help','privacy','bug']),status,version:count,createdAt:short,updatedAt:short,expiresAt:short});
const guestDetail=guestMeta.extend({message:z.string().max(2000),reply:z.string().max(2000)});
const responseSchema = z.object({ snapshot: snapshot.optional(), dashboard: dashboardSchema.optional(), providerStatus: provider.optional(), config: config.optional(), support: z.object({ id, status, version: count }).optional(), supportDetail: z.object({ id, message: z.string().max(2000) }).optional(),guestSupport:z.array(guestMeta.extend({hasReply:z.boolean()})).max(100).optional(),guestSupportDetail:guestDetail.optional() });
const actionSchema = z.discriminatedUnion('action', [
  z.object({action:z.literal('guest_support_list')}),
  z.object({action:z.literal('guest_support_detail'),id}),
  z.object({action:z.literal('guest_support_update'),id,expectedVersion:count,status,reply:z.string().max(2000).refine(value=>!value.includes('\0'))}),
  z.object({ action: z.literal('snapshot'), days }),
  z.object({ action: z.literal('dashboard'), days }),
  z.object({ action: z.literal('update_config'), expectedVersion: count, config: configInput }),
  z.object({ action: z.literal('update_support'), id, expectedVersion: count, status }),
  z.object({ action: z.literal('support_detail'), id }),
  z.object({ action: z.literal('provider_status') }),
]);

export type AdminErrorKind = 'unauthenticated' | 'forbidden' | 'conflict' | 'unavailable';
export class AdminApiError extends Error {
  constructor(public kind: AdminErrorKind, message: string) { super(message); this.name = 'AdminApiError'; }
}
export function adminRange(value: string | null): AdminWindow { return value === '7' ? 7 : value === '90' ? 90 : 30; }

/** Session identity guards prevent a previous account's in-flight response returning after sign-out.
 * Administration membership is checked by the server on every invocation, never by email here. */
export function adminSessionScope(session: { user: { id: string }; access_token: string } | null | undefined): string | null {
  return session?.access_token ? `${session.user.id}:${cvVariantSessionIdentity(session) ?? session.access_token}` : null;
}
async function currentAccount(userId: string, expectedScope?: string, capture?: (scope: string) => void) {
  try {
    const session = await readAuthSession();
    const scope = adminSessionScope(session);
    if (!session || !scope || session.user.id !== userId || expectedScope && scope !== expectedScope) throw new Error();
    capture?.(scope);
    const verified = await supabase.auth.getUser(session.access_token);
    const current = await readAuthSession();
    if (verified.error || verified.data.user?.id !== userId || adminSessionScope(current) !== scope) throw new Error();
    return { session, scope };
  } catch { throw new AdminApiError('unauthenticated', 'Your account session changed or expired. Sign in again to open administration.'); }
}
function failure(httpStatus: number, payload?: unknown): AdminApiError {
  const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string' ? payload.code : '';
  if (httpStatus === 401 || ['unauthenticated', 'auth_required', 'UNAUTHORIZED'].includes(code)) return new AdminApiError('unauthenticated', 'Sign in again to open administration.');
  if (httpStatus === 403 || ['forbidden', 'ADMIN_FORBIDDEN'].includes(code)) return new AdminApiError('forbidden', 'This account does not have administration access. No private records have been opened.');
  if (httpStatus === 409 || ['version_conflict', 'ADMIN_VERSION_CONFLICT'].includes(code)) return new AdminApiError('conflict', 'This record changed in another session. Refresh to review the current version before saving again.');
  return new AdminApiError('unavailable', 'Administration could not confirm this request. Refresh before trying again.');
}

/** Only the fixed first-party function is called; no keys, endpoints or caller-supplied roles. */
export async function callAdmin(userId: string, action: AdminAction): Promise<AdminResponse> {
  const body = actionSchema.parse(action) as AdminAction;
  let scope: string | null = null, observedScope: string | null = null, invalidated = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const next = adminSessionScope(session);
    if (event === 'SIGNED_OUT' || session && session.user.id !== userId || scope && next !== scope || observedScope && next !== observedScope) invalidated = true;
    if (next) observedScope = next;
  });
  try {
  const original = await currentAccount(userId, undefined, next => {
    if (observedScope && observedScope !== next) invalidated = true;
    scope = next;
  });
  const assertCurrent = async () => {
    await currentAccount(userId, original.scope);
    if (invalidated) throw new AdminApiError('unauthenticated', 'Your session changed. Refresh to verify access again.');
  };
  if (invalidated) throw new AdminApiError('unauthenticated', 'Your session changed. Refresh to verify access again.');
  let result: { data: unknown; error: unknown };
  try { result = await supabase.functions.invoke<unknown>('jobvance-admin', { body, headers: { Authorization: `Bearer ${original.session.access_token}` } }); }
  catch { await assertCurrent(); throw failure(503); }
  await assertCurrent();
  if (result.error) {
    const context = (result.error as { context?: unknown }).context;
    const payload = context instanceof Response ? await context.clone().json().catch(() => null) : null;
    await assertCurrent();
    throw failure(context instanceof Response ? context.status : 503, payload);
  }
  if (result.data && typeof result.data === 'object' && 'error' in result.data) throw failure(503, result.data);
  const parsed = responseSchema.safeParse(result.data);
  if (!parsed.success) throw failure(503);
  if (body.action === 'snapshot' && (!parsed.data.snapshot || parsed.data.snapshot.actor.id !== userId || parsed.data.snapshot.window.days !== body.days)) throw failure(503);
  if (body.action === 'dashboard' && (!parsed.data.dashboard || parsed.data.dashboard.actor.id !== userId || parsed.data.dashboard.window.days !== body.days)) throw failure(503);
  if (body.action === 'update_config' && !parsed.data.config || body.action === 'update_support' && !parsed.data.support || body.action === 'provider_status' && !parsed.data.providerStatus) throw failure(503);
  if (body.action === 'support_detail' && (!parsed.data.supportDetail || parsed.data.supportDetail.id !== body.id)) throw failure(503);
  if (body.action === 'update_support' && parsed.data.support?.id !== body.id) throw failure(503);
  if(body.action==='guest_support_list'&&!parsed.data.guestSupport)throw failure(503);
  if(['guest_support_detail','guest_support_update'].includes(body.action)&&(!parsed.data.guestSupportDetail||parsed.data.guestSupportDetail.id!==('id' in body?body.id:'')))throw failure(503);
  return parsed.data as AdminResponse;
  } finally { subscription.unsubscribe(); }
}
