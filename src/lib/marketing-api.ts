import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { readAuthSession } from '@/utils/authSession';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';
import type { MarketingAction, MarketingResponse } from '@/lib/marketing-types';

const short = z.string().max(2000), id = z.string().min(1).max(128), count = z.number().int().nonnegative(), when = z.string().max(64);
const day = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), impressions: count, reach: count, clicks: count, linkClicks: count, landingPageViews: count, spendMinor: count });
const totals = z.object({ impressions: count, reach: count, linkClicks: count, landingPageViews: count, spendMinor: count, ctrPct: z.number().nullable(), costPerLpvMinor: count.nullable(), frequency: z.number().nullable(), days: count, lastDay: short.nullable() });
const settings = z.object({ version: count, maxDailySpendMinor: count, maxTotalSpendMinor: count, minImpressions: count, pauseCtrBelowPct: z.number(), costPerLpvRatio: z.number(), lastSyncAt: when.nullable(), updatedAt: when });
const overview = z.object({
  actor: z.object({ id, role: z.enum(['owner', 'operator']) }), generatedAt: when,
  meta: z.object({ configured: z.boolean(), adAccountId: short.nullable(), message: short }), settings,
  ideas: z.array(z.object({ id, slug: short, title: short, angle: short, status: z.enum(['idea', 'in_production', 'ready', 'launched', 'retired']), sourcePath: short.nullable(), createdAt: when, updatedAt: when })).max(2000),
  creatives: z.array(z.object({ id, ideaId: id, label: short, kind: z.enum(['video', 'copy']), format: short.nullable(), fileName: short.nullable(), sha256: short.nullable(), approved: z.boolean(), approvedAt: when.nullable(), notes: short })).max(5000),
  launches: z.array(z.object({ id, ideaId: id, name: short, platform: z.literal('meta'), metaCampaignId: short, metaAdsetId: short, metaAdId: short, status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', 'UNKNOWN']), effectiveStatus: short.nullable(), dailyBudgetMinor: count.nullable(), currency: z.string().length(3), endAt: when.nullable(), lastSyncedAt: when.nullable(), metrics: z.enum(['fresh', 'stale', 'unknown']), metricsIssue: z.enum(['invalid', 'incomplete', 'currency_mismatch', 'account_mismatch', 'meta_error']).nullable(), totals: totals.nullable(), daily: z.array(day).max(2000) })).max(500),
  requests: z.array(z.object({ id, ideaId: id, kind: z.literal('create_ad'), status: z.enum(['queued', 'in_progress', 'done', 'cancelled']), note: short, createdAt: when })).max(500),
  recommendations: z.array(z.object({ id: short, launchId: id.nullable(), kind: z.enum(['wait', 'pause', 'budget_review', 'refresh_creative', 'spend_cap', 'check_delivery', 'ended', 'figures_unknown']), severity: z.enum(['info', 'warning', 'action']), title: short, reason: short })).max(1000),
  totals: z.object({ spendMinor: count, todaySpendMinor: count, impressions: count, landingPageViews: count, activeLaunches: count, incompleteLaunches: count, currency: z.string().length(3) }),
  audit: z.array(z.object({ id, actorId: id.nullable(), action: short, targetId: id.nullable(), at: when, details: z.record(z.union([short, z.number(), z.boolean(), z.null()])) })).max(200),
});
const responseSchema = z.object({ overview, result: z.object({ changed: count, message: short }).optional() });

export type MarketingErrorKind = 'unauthenticated' | 'forbidden' | 'conflict' | 'not_connected' | 'unavailable';
export class MarketingApiError extends Error {
  constructor(public kind: MarketingErrorKind, message: string) { super(message); this.name = 'MarketingApiError'; }
}

export function marketingSessionScope(session: { user: { id: string }; access_token: string } | null | undefined): string | null {
  return session?.access_token ? `${session.user.id}:${cvVariantSessionIdentity(session) ?? session.access_token}` : null;
}
async function currentAccount(userId: string, expectedScope?: string, capture?: (scope: string) => void) {
  try {
    const session = await readAuthSession();
    const scope = marketingSessionScope(session);
    if (!session || !scope || session.user.id !== userId || expectedScope && scope !== expectedScope) throw new Error();
    capture?.(scope);
    const verified = await supabase.auth.getUser(session.access_token);
    const current = await readAuthSession();
    if (verified.error || verified.data.user?.id !== userId || marketingSessionScope(current) !== scope) throw new Error();
    return { session, scope };
  } catch { throw new MarketingApiError('unauthenticated', 'Your session changed or expired. Sign in again to open the marketing workspace.'); }
}
function failure(httpStatus: number, payload?: unknown): MarketingApiError {
  const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string' ? payload.code : '';
  const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error.slice(0, 400) : '';
  if (httpStatus === 401 || code === 'UNAUTHORIZED') return new MarketingApiError('unauthenticated', 'Sign in again to open the marketing workspace.');
  if (httpStatus === 403 || code === 'ADMIN_FORBIDDEN' || code === 'MARKETING_FORBIDDEN') return new MarketingApiError('forbidden', message || 'This account does not have access to the marketing workspace.');
  if (code === 'META_NOT_CONFIGURED') return new MarketingApiError('not_connected', message);
  if (httpStatus === 409) return new MarketingApiError('conflict', message || 'This changed in another session. Refresh and try again.');
  return new MarketingApiError('unavailable', message || 'The marketing workspace could not confirm this request. Refresh before trying again.');
}

/** Calls only the fixed first-party function; access is re-verified by the server on every call. */
export async function callMarketing(userId: string, action: MarketingAction): Promise<MarketingResponse> {
  const intent = structuredClone(action);
  let scope: string | null = null, observedScope: string | null = null, invalidated = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const next = marketingSessionScope(session);
    if (event === 'SIGNED_OUT' || session && session.user.id !== userId || scope && next !== scope || observedScope && next !== observedScope) invalidated = true;
    if (next) observedScope = next;
  });
  try {
  const original = await currentAccount(userId, undefined, next => {
    if (observedScope && observedScope !== next) invalidated = true;
    scope = next;
  });
  if (invalidated) throw new MarketingApiError('unauthenticated', 'Your session changed. Refresh to verify access again.');
  let result: { data: unknown; error: unknown };
  try { result = await supabase.functions.invoke<unknown>('jobvance-marketing', { body: intent, headers: { Authorization: `Bearer ${original.session.access_token}` } }); }
  catch { throw failure(503); }
  await currentAccount(userId, original.scope);
  if (invalidated) throw new MarketingApiError('unauthenticated', 'Your session changed. Refresh to verify access again.');
  if (result.error) {
    const context = (result.error as { context?: unknown }).context;
    const payload = context instanceof Response ? await context.clone().json().catch(() => null) : null;
    throw failure(context instanceof Response ? context.status : 503, payload);
  }
  const parsed = responseSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.overview.actor.id !== userId) throw failure(503);
  return parsed.data as MarketingResponse;
  } finally { subscription.unsubscribe(); }
}

export function inr(minor: number | null, currency = 'INR'): string {
  if (minor === null) return 'n/a';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}
