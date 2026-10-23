import { ApiError } from './core.ts';
import type { LaunchStatus, MarketingDay } from '../../../src/lib/marketing-types.ts';

// Server-side Meta Marketing API client. The token lives only in the function's
// secrets (META_ACCESS_TOKEN); it is never logged, returned or sent anywhere but graph.facebook.com.

export type MetaEnv = (name: string) => string | undefined;
export type MetaFetch = (input: string, init?: RequestInit) => Promise<Response>;
export interface MetaConfig { token: string; adAccountId: string | null; version: string }

const idPattern = /^[0-9]{6,24}$/;
export function metaConfig(env: MetaEnv): MetaConfig | null {
  const token = env('META_ACCESS_TOKEN')?.trim();
  if (!token) return null;
  const version = env('META_GRAPH_VERSION')?.trim() || 'v22.0';
  if (!/^v\d{2}\.\d$/.test(version)) throw new ApiError(503, 'META_NOT_CONFIGURED', 'META_GRAPH_VERSION must look like v22.0.');
  const account = env('META_AD_ACCOUNT_ID')?.trim().replace(/^act_/, '') || null;
  return { token, version, adAccountId: account && idPattern.test(account) ? account : null };
}

function failure(payload: unknown): ApiError {
  const error = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error?: { code?: number } }).error : undefined;
  const code = error?.code;
  if (code === 190) return new ApiError(502, 'META_TOKEN_INVALID', 'Meta rejected the access token. Generate a new system-user token and update META_ACCESS_TOKEN.');
  if (code === 10 || code === 200 || code === 294) return new ApiError(502, 'META_PERMISSION', 'The Meta token is missing ads_management or ads_read permission for this ad account.');
  if (code === 4 || code === 17 || code === 613 || code === 80004) return new ApiError(429, 'META_RATE_LIMITED', 'Meta is rate-limiting requests. Try again in a few minutes.');
  return new ApiError(502, 'META_REQUEST_FAILED', 'Meta did not accept the request. Check the ad in Ads Manager.');
}

async function graph(config: MetaConfig, fetcher: MetaFetch, path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET'): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/${config.version}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: config.token });
  if (method === 'GET') url.search = body.toString();
  let response: Response;
  try {
    response = await fetcher(url.toString(), method === 'GET' ? { signal: AbortSignal.timeout(15000) } : { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000) });
  } catch {
    // Network errors can echo the URL, which carries the token: never surface them.
    throw new ApiError(503, 'META_UNAVAILABLE', 'Meta could not be reached. Try again shortly.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw failure(payload);
  return payload as Record<string, unknown>;
}

const status = (value: unknown): LaunchStatus => typeof value === 'string' && ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'].includes(value) ? value as LaunchStatus : 'UNKNOWN';
const count = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; };

export interface MetaAdState { status: LaunchStatus; effectiveStatus: string | null; dailyBudgetMinor: number | null; endAt: string | null }
export async function readAd(config: MetaConfig, fetcher: MetaFetch, adId: string): Promise<MetaAdState> {
  if (!idPattern.test(adId)) throw new ApiError(400, 'MARKETING_INPUT_INVALID', 'That ad id is invalid.');
  const ad = await graph(config, fetcher, adId, { fields: 'status,effective_status,adset{status,daily_budget,end_time}' });
  const adset = ad.adset && typeof ad.adset === 'object' ? ad.adset as Record<string, unknown> : {};
  const budget = adset.daily_budget === undefined ? null : count(adset.daily_budget);
  // Meta writes offsets as +0530; ISO parsing needs +05:30.
  const endRaw = typeof adset.end_time === 'string' ? adset.end_time.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : '';
  const end = endRaw && Number.isFinite(Date.parse(endRaw)) ? new Date(endRaw).toISOString() : null;
  // An ad only delivers when its ad set is active too, so report the stricter of the two.
  const adStatus = status(ad.status), setStatus = status(adset.status);
  return { status: adStatus === 'ACTIVE' && setStatus !== 'UNKNOWN' && setStatus !== 'ACTIVE' ? setStatus : adStatus, effectiveStatus: typeof ad.effective_status === 'string' ? ad.effective_status.slice(0, 40) : null, dailyBudgetMinor: budget, endAt: end };
}

export async function readInsights(config: MetaConfig, fetcher: MetaFetch, adId: string, since: string, until: string): Promise<MarketingDay[]> {
  if (!idPattern.test(adId) || !/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new ApiError(400, 'MARKETING_INPUT_INVALID', 'The insights range is invalid.');
  const result = await graph(config, fetcher, `${adId}/insights`, { fields: 'impressions,reach,clicks,inline_link_clicks,spend,actions', time_increment: '1', time_range: JSON.stringify({ since, until }), limit: '100' });
  const rows = Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
  return rows.filter(row => typeof row.date_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date_start)).map(row => {
    const actions = Array.isArray(row.actions) ? row.actions as { action_type?: string; value?: string }[] : [];
    const spend = Number(row.spend);
    return {
      day: row.date_start as string, impressions: count(row.impressions), reach: count(row.reach), clicks: count(row.clicks), linkClicks: count(row.inline_link_clicks),
      landingPageViews: count(actions.find(action => action.action_type === 'landing_page_view')?.value),
      spendMinor: Number.isFinite(spend) && spend >= 0 ? Math.round(spend * 100) : 0,
    };
  });
}

/** Switching on turns on the campaign, ad set and ad; pausing stops the ad set and ad only. */
export async function setDelivery(config: MetaConfig, fetcher: MetaFetch, ids: { campaignId: string; adsetId: string; adId: string }, next: 'ACTIVE' | 'PAUSED'): Promise<void> {
  for (const id of [ids.campaignId, ids.adsetId, ids.adId]) if (!idPattern.test(id)) throw new ApiError(400, 'MARKETING_INPUT_INVALID', 'That ad id is invalid.');
  const order = next === 'ACTIVE' ? [ids.campaignId, ids.adsetId, ids.adId] : [ids.adId, ids.adsetId];
  for (const id of order) await graph(config, fetcher, id, { status: next }, 'POST');
}
