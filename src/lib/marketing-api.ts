import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { readAuthSession } from '@/utils/authSession';
import type { MarketingAction, MarketingResponse } from '@/lib/marketing-types';

const short = z.string().max(2000), id = z.string().min(1).max(128), count = z.number().int().nonnegative(), when = z.string().max(64);
const day = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), impressions: count, reach: count, clicks: count, linkClicks: count, landingPageViews: count, spendMinor: count });
const totals = z.object({ impressions: count, reach: count, linkClicks: count, landingPageViews: count, spendMinor: count, ctrPct: z.number().nullable(), costPerLpvMinor: count.nullable(), frequency: z.number().nullable(), days: count, lastDay: short.nullable() });
const settings = z.object({ version: count, autoMode: z.boolean(), maxDailySpendMinor: count, maxTotalSpendMinor: count, minImpressions: count, pauseCtrBelowPct: z.number(), costPerLpvRatio: z.number(), lastSyncAt: when.nullable(), lastAutoRunAt: when.nullable(), updatedAt: when });
const overview = z.object({
  actor: z.object({ id, role: z.enum(['owner', 'operator']) }), generatedAt: when,
  meta: z.object({ configured: z.boolean(), adAccountId: short.nullable(), message: short }), settings,
  ideas: z.array(z.object({ id, slug: short, title: short, angle: short, status: z.enum(['idea', 'in_production', 'ready', 'launched', 'retired']), sourcePath: short.nullable(), createdAt: when, updatedAt: when })).max(2000),
  creatives: z.array(z.object({ id, ideaId: id, label: short, kind: z.enum(['video', 'copy']), format: short.nullable(), fileName: short.nullable(), sha256: short.nullable(), approved: z.boolean(), approvedAt: when.nullable(), notes: short })).max(5000),
  launches: z.array(z.object({ id, ideaId: id, name: short, platform: z.literal('meta'), metaCampaignId: short, metaAdsetId: short, metaAdId: short, status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', 'UNKNOWN']), effectiveStatus: short.nullable(), dailyBudgetMinor: count.nullable(), currency: z.string().length(3), endAt: when.nullable(), pausedBy: z.enum(['owner', 'auto']).nullable(), pausedReason: z.enum(['owner', 'daily_cap', 'total_cap', 'low_ctr', 'high_cost']).nullable(), lastSyncedAt: when.nullable(), totals, daily: z.array(day).max(400) })).max(500),
  requests: z.array(z.object({ id, ideaId: id, kind: z.literal('create_ad'), status: z.enum(['queued', 'in_progress', 'done', 'cancelled']), note: short, createdAt: when })).max(500),
  recommendations: z.array(z.object({ id: short, launchId: id.nullable(), kind: z.enum(['wait', 'pause', 'resume', 'budget_review', 'refresh_creative', 'spend_cap', 'check_delivery', 'ended']), severity: z.enum(['info', 'warning', 'action']), title: short, reason: short, autoEligible: z.boolean(), pauseReason: z.enum(['owner', 'daily_cap', 'total_cap', 'low_ctr', 'high_cost']).optional() })).max(1000),
  totals: z.object({ spendMinor: count, todaySpendMinor: count, impressions: count, landingPageViews: count, activeLaunches: count, currency: z.string().length(3) }),
  audit: z.array(z.object({ id, actorId: id.nullable(), action: short, targetId: id.nullable(), at: when, details: z.record(z.union([short, z.number(), z.boolean(), z.null()])) })).max(200),
});
const responseSchema = z.object({ overview, result: z.object({ changed: count, message: short }).optional() });

export type MarketingErrorKind = 'unauthenticated' | 'forbidden' | 'conflict' | 'not_connected' | 'unavailable';
export class MarketingApiError extends Error {
  constructor(public kind: MarketingErrorKind, message: string) { super(message); this.name = 'MarketingApiError'; }
}

async function currentAccount(userId: string) {
  try {
    const session = await readAuthSession();
    const verified = await supabase.auth.getUser();
    if (!session?.user || verified.error || !verified.data.user || session.user.id !== userId || verified.data.user.id !== userId) throw new Error();
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
  await currentAccount(userId);
  let result: { data: unknown; error: unknown };
  try { result = await supabase.functions.invoke<unknown>('jobvance-marketing', { body: action }); }
  catch { throw failure(503); }
  await currentAccount(userId);
  if (result.error) {
    const context = (result.error as { context?: unknown }).context;
    const payload = context instanceof Response ? await context.clone().json().catch(() => null) : null;
    throw failure(context instanceof Response ? context.status : 503, payload);
  }
  const parsed = responseSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.overview.actor.id !== userId) throw failure(503);
  return parsed.data as MarketingResponse;
}

export function inr(minor: number | null, currency = 'INR'): string {
  if (minor === null) return 'n/a';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}
