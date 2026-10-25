import { ApiError } from './core.ts';
import type { LaunchStatus, MarketingDay } from '../../../src/lib/marketing-types.ts';

// Server-side, read-only Meta Marketing API client: it only sends GET requests, so this
// release cannot pause, resume, launch or re-budget anything. The token (META_ACCESS_TOKEN,
// ads_read) lives only in the function's secrets; it is never logged, returned or sent anywhere but graph.facebook.com.

export type MetaEnv = (name: string) => string | undefined;
export type MetaFetch = (input: string, init?: RequestInit) => Promise<Response>;
export interface MetaConfig { token: string; adAccountId: string; version: string }

const idPattern = /^[0-9]{6,24}$/, dayPattern = /^\d{4}-\d{2}-\d{2}$/;
/** Insights pages followed per ad (100 daily rows each) before the read counts as incomplete. */
export const MAX_INSIGHT_PAGES = 10;

export function metaConfig(env: MetaEnv): MetaConfig | null {
  const token = env('META_ACCESS_TOKEN')?.trim();
  const account = env('META_AD_ACCOUNT_ID')?.trim().replace(/^act_/, '');
  if (!token || !account || !idPattern.test(account)) return null;
  const version = env('META_GRAPH_VERSION')?.trim() || 'v22.0';
  if (!/^v\d{2}\.\d$/.test(version)) throw new ApiError(503, 'META_NOT_CONFIGURED', 'META_GRAPH_VERSION must look like v22.0.');
  return { token, version, adAccountId: account };
}

function failure(payload: unknown): ApiError {
  const error = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error?: { code?: number } }).error : undefined;
  const code = error?.code;
  if (code === 190) return new ApiError(502, 'META_TOKEN_INVALID', 'Meta rejected the access token. Generate a new read-only system-user token and update META_ACCESS_TOKEN.');
  if (code === 10 || code === 200 || code === 294) return new ApiError(502, 'META_PERMISSION', 'The Meta token is missing ads_read permission for this ad account.');
  if (code === 4 || code === 17 || code === 613 || code === 80004) return new ApiError(429, 'META_RATE_LIMITED', 'Meta is rate-limiting requests. Try again in a few minutes.');
  return new ApiError(502, 'META_REQUEST_FAILED', 'Meta did not answer the read. Check the ad in Ads Manager.');
}
const invalidData = () => new ApiError(502, 'META_DATA_INVALID', 'Meta returned figures in an unexpected shape, so they are shown as unknown.');

async function graph(config: MetaConfig, fetcher: MetaFetch, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/${config.version}/${path}`);
  url.search = new URLSearchParams({ ...params, access_token: config.token }).toString();
  let response: Response;
  try {
    response = await fetcher(url.toString(), { method: 'GET', signal: AbortSignal.timeout(15000) });
  } catch {
    // Network errors can echo the URL, which carries the token: never surface them.
    throw new ApiError(503, 'META_UNAVAILABLE', 'Meta could not be reached. Try again shortly.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw failure(payload);
  return payload as Record<string, unknown>;
}

const record = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const status = (value: unknown): LaunchStatus => typeof value === 'string' && ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'].includes(value) ? value as LaunchStatus : 'UNKNOWN';
/** Meta sends counts as decimal strings. Anything else is invalid, never zero. */
function whole(value: unknown): number {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\d{1,15}$/.test(text)) throw invalidData();
  return Number(text);
}
/** Spend in major units ("487.53") to minor units, for two-decimal currencies such as INR. */
function minor(value: unknown): number {
  const text = typeof value === 'number' ? String(value) : value;
  const match = typeof text === 'string' ? /^(\d{1,13})(?:\.(\d{1,6}))?$/.exec(text) : null;
  if (!match) throw invalidData();
  return Number(match[1]) * 100 + Math.round(Number(`0.${match[2] ?? '0'}`) * 100);
}
// Meta leaves out zero-valued counts and action types; a present but malformed value is invalid.
const optional = (value: unknown) => value === undefined ? 0 : whole(value);

export interface MetaAccount { currency: string; utcOffsetMinutes: number }
export async function readAccount(config: MetaConfig, fetcher: MetaFetch): Promise<MetaAccount> {
  const account = await graph(config, fetcher, `act_${config.adAccountId}`, { fields: 'currency,timezone_offset_hours_utc' });
  const offset = typeof account.timezone_offset_hours_utc === 'number' ? account.timezone_offset_hours_utc : typeof account.timezone_offset_hours_utc === 'string' && /^-?\d{1,2}(\.\d+)?$/.test(account.timezone_offset_hours_utc) ? Number(account.timezone_offset_hours_utc) : NaN;
  if (typeof account.currency !== 'string' || !/^[A-Z]{3}$/.test(account.currency) || !Number.isFinite(offset)) throw invalidData();
  return { currency: account.currency, utcOffsetMinutes: Math.round(offset * 60) };
}

export interface MetaAdState { status: LaunchStatus; effectiveStatus: string | null; accountId: string; campaignId: string; adsetId: string; dailyBudgetMinor: number | null; endAt: string | null }
export async function readAd(config: MetaConfig, fetcher: MetaFetch, adId: string): Promise<MetaAdState> {
  if (!idPattern.test(adId)) throw new ApiError(400, 'MARKETING_INPUT_INVALID', 'That ad id is invalid.');
  const ad = await graph(config, fetcher, adId, { fields: 'status,effective_status,account_id,campaign_id,adset_id,adset{status,daily_budget,end_time}' });
  const adset = record(ad.adset);
  const ids = [ad.account_id, ad.campaign_id, ad.adset_id];
  if (!adset || !ids.every(id => typeof id === 'string' && idPattern.test(id)) || (adset.end_time !== undefined && typeof adset.end_time !== 'string')) throw invalidData();
  // Meta writes offsets as +0530; ISO parsing needs +05:30.
  const endRaw = typeof adset.end_time === 'string' ? adset.end_time.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : '';
  if (endRaw && !Number.isFinite(Date.parse(endRaw))) throw invalidData();
  // An ad only delivers when its ad set is active too, so report the stricter of the two.
  const adStatus = status(ad.status), adsetStatus = status(adset.status);
  return {
    status: adStatus === 'ACTIVE' && adsetStatus !== 'UNKNOWN' && adsetStatus !== 'ACTIVE' ? adsetStatus : adStatus,
    effectiveStatus: typeof ad.effective_status === 'string' ? ad.effective_status.slice(0, 40) : null,
    accountId: ad.account_id as string, campaignId: ad.campaign_id as string, adsetId: ad.adset_id as string,
    dailyBudgetMinor: adset.daily_budget === undefined ? null : whole(adset.daily_budget), endAt: endRaw ? new Date(endRaw).toISOString() : null,
  };
}

function insightDay(value: unknown, today: string): MarketingDay {
  const row = record(value);
  if (!row || typeof row.date_start !== 'string' || !dayPattern.test(row.date_start) || row.date_stop !== row.date_start || row.date_start > today) throw invalidData();
  const actions = row.actions === undefined ? [] : Array.isArray(row.actions) ? row.actions.map(record) : null;
  if (!actions || actions.some(action => !action)) throw invalidData();
  const views = actions.filter(action => action?.action_type === 'landing_page_view');
  if (views.length > 1) throw invalidData();
  return {
    day: row.date_start, impressions: whole(row.impressions), reach: optional(row.reach), clicks: optional(row.clicks), linkClicks: optional(row.inline_link_clicks),
    landingPageViews: views.length ? whole(views[0]?.value) : 0, spendMinor: minor(row.spend),
  };
}

/** Lifetime daily figures for one ad, every page. A malformed, duplicate or future row, or more pages than the bound, fails the whole read. */
export async function readInsights(config: MetaConfig, fetcher: MetaFetch, adId: string, today: string): Promise<MarketingDay[]> {
  if (!idPattern.test(adId) || !dayPattern.test(today)) throw new ApiError(400, 'MARKETING_INPUT_INVALID', 'The insights request is invalid.');
  const days = new Map<string, MarketingDay>();
  let after: string | null = null;
  for (let page = 0; page < MAX_INSIGHT_PAGES; page++) {
    const result = await graph(config, fetcher, `${adId}/insights`, { fields: 'date_start,date_stop,impressions,reach,clicks,inline_link_clicks,spend,actions', date_preset: 'maximum', time_increment: '1', limit: '100', ...(after ? { after } : {}) });
    const paging = result.paging === undefined ? {} : record(result.paging);
    if (!Array.isArray(result.data) || !paging) throw invalidData();
    for (const row of result.data) { const day = insightDay(row, today); if (days.has(day.day)) throw invalidData(); days.set(day.day, day); }
    if (paging.next === undefined) return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
    // Request the next page ourselves with Meta's cursor; never fetch a URL taken from a response.
    const cursor = record(paging.cursors)?.after;
    if (typeof paging.next !== 'string' || typeof cursor !== 'string' || !cursor || cursor.length > 512) throw invalidData();
    after = cursor;
  }
  throw new ApiError(502, 'META_DATA_INCOMPLETE', 'Meta had more pages of figures than this page reads, so they are shown as unknown.');
}
