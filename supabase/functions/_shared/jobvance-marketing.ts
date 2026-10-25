import { ApiError } from './core.ts';
import { ACCOUNT_UTC_OFFSET_MINUTES, accountDay, money, recommend, totalsFor } from './marketing-rules.ts';
import { metaConfig, readAccount, readAd, readInsights, type MetaAccount, type MetaEnv, type MetaFetch } from './meta-ads.ts';
import type { IdeaStatus, LaunchStatus, MarketingAction, MarketingAudit, MarketingCreative, MarketingDay, MarketingIdea, MarketingLaunch, MarketingOverview, MarketingRequest, MarketingResponse, MarketingRole, MarketingSettings, MarketingSettingsInput, MetricsIssue, MetricsState } from '../../../src/lib/marketing-types.ts';

// Read-only towards Meta. Pausing, resuming, launching and auto mode are deferred until each
// change is bound to the exact approved creative, fresh account/spend state and durable
// fencing (Codex review of PR #26). Writes here go only to our own marketing tables.

// ---------- storage boundary (service-role tables; see 20261024090000 migration) ----------
export interface IdeaRow { id: string; slug: string; title: string; angle: string; status: IdeaStatus; source_path: string | null; created_at: string; updated_at: string }
export interface CreativeRow { id: string; idea_id: string; label: string; kind: 'video' | 'copy'; format: string | null; file_name: string | null; sha256: string | null; approved: boolean; approved_at: string | null; notes: string }
export interface LaunchRow { id: string; idea_id: string; name: string; platform: 'meta'; meta_campaign_id: string; meta_adset_id: string; meta_ad_id: string; status: LaunchStatus; effective_status: string | null; daily_budget_minor: number | null; currency: string; end_at: string | null; last_synced_at: string | null; metrics_state: MetricsState; metrics_issue: MetricsIssue | null; created_at: string }
export interface MetricRow { launch_id: string; day: string; impressions: number; reach: number; clicks: number; link_clicks: number; landing_page_views: number; spend_minor: number }
export interface RequestRow { id: string; idea_id: string; kind: 'create_ad'; status: MarketingRequest['status']; note: string; created_at: string }
export interface SettingsRow { version: number; max_daily_spend_minor: number; max_total_spend_minor: number; min_impressions: number; pause_ctr_below_pct: number | string; cost_per_lpv_ratio: number | string; last_sync_at: string | null; updated_at: string }
export interface AuditRow { id: string; actor_id: string | null; action: string; target_id: string | null; details: Record<string, string | number | boolean | null>; at: string }
export interface MarketingRows { ideas: IdeaRow[]; creatives: CreativeRow[]; launches: LaunchRow[]; metrics: MetricRow[]; requests: RequestRow[]; settings: SettingsRow; audit: AuditRow[] }

export interface MarketingStore {
  rows(): Promise<MarketingRows>;
  updateLaunch(id: string, patch: Partial<LaunchRow>): Promise<void>;
  upsertMetrics(rows: MetricRow[]): Promise<void>;
  insertIdea(row: { slug: string; title: string; angle: string }): Promise<string>;
  setIdeaStatus(id: string, status: IdeaStatus): Promise<void>;
  insertRequest(row: { idea_id: string; note: string; created_by: string }): Promise<string>;
  /** Returns false when expectedVersion is stale. */
  updateSettings(expectedVersion: number, patch: Record<string, unknown>): Promise<boolean>;
  touchSettings(patch: { last_sync_at: string }): Promise<void>;
  audit(row: { actor_id: string | null; action: string; target_id: string | null; details: Record<string, string | number | boolean | null> }): Promise<void>;
}

// ---------- input boundary ----------
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
function invalid(): never { throw new ApiError(400, 'MARKETING_INPUT_INVALID', 'Choose a supported marketing action and complete every field.'); }
function exact(item: Record<string, unknown>, keys: string[]): void { if (Object.keys(item).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(item, key))) invalid(); }
const text = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !value.includes('\0');
const int = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const num = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function validateMarketingAction(value: unknown): MarketingAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const item = value as Record<string, unknown>;
  if (item.action === 'set_status' || item.action === 'run_auto') throw new ApiError(409, 'MARKETING_CONTROL_DISABLED', 'Pausing, resuming, launching and auto mode are not available yet. Make ad changes in Meta Ads Manager.');
  if (item.action === 'overview' || item.action === 'sync') { exact(item, ['action']); return { action: item.action }; }
  if (item.action === 'request_creation') { exact(item, ['action', 'ideaId', 'note']); if (typeof item.ideaId !== 'string' || !uuid.test(item.ideaId) || !text(item.note, 0, 1000)) invalid(); return { action: 'request_creation', ideaId: item.ideaId, note: (item.note as string).trim() }; }
  if (item.action === 'create_idea') { exact(item, ['action', 'title', 'angle']); if (!text(item.title, 3, 140) || !text(item.angle, 0, 600)) invalid(); return { action: 'create_idea', title: (item.title as string).trim(), angle: (item.angle as string).trim() }; }
  if (item.action === 'update_settings') {
    exact(item, ['action', 'expectedVersion', 'settings']);
    if (!int(item.expectedVersion, 0, Number.MAX_SAFE_INTEGER) || !item.settings || typeof item.settings !== 'object' || Array.isArray(item.settings)) invalid();
    const s = item.settings as Record<string, unknown>;
    // No autoMode key: auto mode cannot be switched on in this release.
    exact(s, ['maxDailySpendMinor', 'maxTotalSpendMinor', 'minImpressions', 'pauseCtrBelowPct', 'costPerLpvRatio']);
    if (!int(s.maxDailySpendMinor, 1, 10_000_000) || !int(s.maxTotalSpendMinor, 1, 100_000_000) || !int(s.minImpressions, 100, 1_000_000) || !num(s.pauseCtrBelowPct, 0, 10) || !num(s.costPerLpvRatio, 1.2, 10)) invalid();
    if ((s.maxDailySpendMinor as number) > (s.maxTotalSpendMinor as number)) invalid();
    return { action: 'update_settings', expectedVersion: item.expectedVersion as number, settings: s as unknown as MarketingSettingsInput };
  }
  invalid();
}

// ---------- mapping ----------
/** Complete figures older than this are shown as stale; there is no scheduled sync. */
export const STALE_AFTER_MS = 6 * 3600000;
const settingsOf = (row: SettingsRow): MarketingSettings => ({ version: Number(row.version), maxDailySpendMinor: Number(row.max_daily_spend_minor), maxTotalSpendMinor: Number(row.max_total_spend_minor), minImpressions: Number(row.min_impressions), pauseCtrBelowPct: Number(row.pause_ctr_below_pct), costPerLpvRatio: Number(row.cost_per_lpv_ratio), lastSyncAt: row.last_sync_at, updatedAt: row.updated_at });
const dayOf = (row: MetricRow): MarketingDay => ({ day: row.day, impressions: Number(row.impressions), reach: Number(row.reach), clicks: Number(row.clicks), linkClicks: Number(row.link_clicks), landingPageViews: Number(row.landing_page_views), spendMinor: Number(row.spend_minor) });
function launchOf(row: LaunchRow, metrics: MetricRow[], now: Date): MarketingLaunch {
  const metricsState: MetricsState = row.metrics_state === 'fresh' && (!row.last_synced_at || now.getTime() - Date.parse(row.last_synced_at) > STALE_AFTER_MS) ? 'stale' : row.metrics_state;
  const daily = metricsState === 'unknown' ? [] : metrics.filter(metric => metric.launch_id === row.id).map(dayOf).sort((a, b) => a.day.localeCompare(b.day));
  return { id: row.id, ideaId: row.idea_id, name: row.name, platform: 'meta', metaCampaignId: row.meta_campaign_id, metaAdsetId: row.meta_adset_id, metaAdId: row.meta_ad_id, status: row.status, effectiveStatus: row.effective_status, dailyBudgetMinor: row.daily_budget_minor === null ? null : Number(row.daily_budget_minor), currency: row.currency, endAt: row.end_at, lastSyncedAt: row.last_synced_at, metrics: metricsState, metricsIssue: row.metrics_issue, totals: metricsState === 'unknown' ? null : totalsFor(daily), daily };
}

export async function buildOverview(store: MarketingStore, actor: { id: string; role: MarketingRole }, env: MetaEnv, now: Date): Promise<MarketingOverview> {
  const rows = await store.rows();
  const settings = settingsOf(rows.settings);
  const launches = rows.launches.map(row => launchOf(row, rows.metrics, now));
  const config = metaConfig(env);
  const today = accountDay(now);
  const sum = (pick: (launch: MarketingLaunch) => number) => launches.reduce((total, launch) => total + (launch.totals ? pick(launch) : 0), 0);
  return {
    actor, generatedAt: now.toISOString(),
    meta: config ? { configured: true, adAccountId: config.adAccountId, message: settings.lastSyncAt ? 'Connected read-only. Figures come from the last complete sync with Meta.' : 'Connected read-only. Press "Sync now" to read live figures.' } : { configured: false, adAccountId: null, message: 'Meta is not connected yet. The owner adds a read-only (ads_read) token as META_ACCESS_TOKEN, and META_AD_ACCOUNT_ID, to the jobvance-marketing function secrets. Until then this page shows recorded launches only.' },
    settings,
    ideas: rows.ideas.map((row): MarketingIdea => ({ id: row.id, slug: row.slug, title: row.title, angle: row.angle, status: row.status, sourcePath: row.source_path, createdAt: row.created_at, updatedAt: row.updated_at })),
    creatives: rows.creatives.map((row): MarketingCreative => ({ id: row.id, ideaId: row.idea_id, label: row.label, kind: row.kind, format: row.format, fileName: row.file_name, sha256: row.sha256, approved: row.approved, approvedAt: row.approved_at, notes: row.notes })),
    launches, requests: rows.requests.map((row): MarketingRequest => ({ id: row.id, ideaId: row.idea_id, kind: row.kind, status: row.status, note: row.note, createdAt: row.created_at })),
    recommendations: recommend(launches, settings, now),
    totals: { spendMinor: sum(l => l.totals!.spendMinor), todaySpendMinor: sum(l => l.daily.filter(d => d.day === today).reduce((t, d) => t + d.spendMinor, 0)), impressions: sum(l => l.totals!.impressions), landingPageViews: sum(l => l.totals!.landingPageViews), activeLaunches: launches.filter(l => l.status === 'ACTIVE').length, incompleteLaunches: launches.filter(l => l.status !== 'DELETED' && l.metrics !== 'fresh').length, currency: launches[0]?.currency ?? 'INR' },
    audit: rows.audit.slice(0, 100).map((row): MarketingAudit => ({ id: row.id, actorId: row.actor_id, action: row.action, targetId: row.target_id, at: row.at, details: row.details })),
  };
}

// ---------- Meta sync (GET only) ----------
const issueOf = (error: ApiError): MetricsIssue => error.code === 'META_DATA_INVALID' ? 'invalid' : error.code === 'META_DATA_INCOMPLETE' ? 'incomplete' : error.code === 'META_CURRENCY_MISMATCH' ? 'currency_mismatch' : error.code === 'META_ACCOUNT_MISMATCH' ? 'account_mismatch' : 'meta_error';
const mismatch = (code: 'META_CURRENCY_MISMATCH' | 'META_ACCOUNT_MISMATCH') => new ApiError(409, code, 'Meta no longer matches the recorded launch, so its figures are shown as unknown.');

/** Figures are stored only from a complete, validated read; otherwise the launch is marked stale or unknown and the sync is not stamped. */
export async function syncFromMeta(store: MarketingStore, env: MetaEnv, fetcher: MetaFetch, now: Date): Promise<{ synced: number; incomplete: number }> {
  const config = metaConfig(env);
  if (!config) throw new ApiError(409, 'META_NOT_CONFIGURED', 'Connect Meta first: add a read-only META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to the jobvance-marketing function secrets.');
  const launches = (await store.rows()).launches.filter(row => row.status !== 'DELETED');
  const unverified = (launch: LaunchRow, issue: MetricsIssue) => store.updateLaunch(launch.id, { metrics_state: launch.last_synced_at ? 'stale' : 'unknown', metrics_issue: issue });
  let account: MetaAccount;
  try { account = await readAccount(config, fetcher); }
  catch (error) { if (error instanceof ApiError) for (const launch of launches) await unverified(launch, issueOf(error)); throw error; }
  const today = accountDay(now);
  let synced = 0;
  for (const launch of launches) {
    try {
      if (account.currency !== launch.currency) throw mismatch('META_CURRENCY_MISMATCH');
      if (account.utcOffsetMinutes !== ACCOUNT_UTC_OFFSET_MINUTES) throw mismatch('META_ACCOUNT_MISMATCH');
      const state = await readAd(config, fetcher, launch.meta_ad_id);
      if (state.accountId !== config.adAccountId || state.campaignId !== launch.meta_campaign_id || state.adsetId !== launch.meta_adset_id) throw mismatch('META_ACCOUNT_MISMATCH');
      const days = await readInsights(config, fetcher, launch.meta_ad_id, today);
      if (days.length) await store.upsertMetrics(days.map(day => ({ launch_id: launch.id, day: day.day, impressions: day.impressions, reach: day.reach, clicks: day.clicks, link_clicks: day.linkClicks, landing_page_views: day.landingPageViews, spend_minor: day.spendMinor })));
      await store.updateLaunch(launch.id, { status: state.status, effective_status: state.effectiveStatus, daily_budget_minor: state.dailyBudgetMinor, end_at: state.endAt, last_synced_at: now.toISOString(), metrics_state: 'fresh', metrics_issue: null });
      synced++;
    } catch (error) {
      if (!(error instanceof ApiError) || !error.code.startsWith('META_')) throw error;
      await unverified(launch, issueOf(error));
    }
  }
  if (synced === launches.length) await store.touchSettings({ last_sync_at: now.toISOString() });
  return { synced, incomplete: launches.length - synced };
}

// ---------- actions ----------
function ownerOnly(actor: { role: MarketingRole }): void { if (actor.role !== 'owner') throw new ApiError(403, 'MARKETING_FORBIDDEN', 'Only the owner can change these settings.'); }

function slugFor(title: string, suffix: string): string {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'idea';
  return `${/^[a-z0-9]/.test(base) ? base : `i-${base}`}-${suffix}`.slice(0, 63);
}

export async function controlMarketing(store: MarketingStore, actor: { id: string; role: MarketingRole }, action: MarketingAction, env: MetaEnv, fetcher: MetaFetch, now: Date, randomSuffix: () => string = () => crypto.randomUUID().slice(0, 6)): Promise<MarketingResponse> {
  const overview = () => buildOverview(store, actor, env, now);
  if (action.action === 'overview') return { overview: await overview() };
  if (action.action === 'sync') {
    const { synced, incomplete } = await syncFromMeta(store, env, fetcher, now);
    await store.audit({ actor_id: actor.id, action: 'sync', target_id: null, details: { launches: synced, incomplete } });
    return { overview: await overview(), result: { changed: synced, message: incomplete ? `Read ${synced} of ${synced + incomplete} ads from Meta. Figures for ${incomplete} ${incomplete === 1 ? 'ad are' : 'ads are'} unknown or stale; each row says why.` : `Read ${synced} ad${synced === 1 ? '' : 's'} from Meta. Nothing in Meta was changed.` } };
  }
  if (action.action === 'request_creation') {
    const rows = await store.rows();
    const idea = rows.ideas.find(row => row.id === action.ideaId);
    if (!idea) throw new ApiError(404, 'MARKETING_NOT_FOUND', 'That idea is unavailable.');
    if (rows.requests.some(row => row.idea_id === idea.id && (row.status === 'queued' || row.status === 'in_progress'))) throw new ApiError(409, 'MARKETING_ALREADY_QUEUED', 'This idea is already in the production queue.');
    const id = await store.insertRequest({ idea_id: idea.id, note: action.note, created_by: actor.id });
    if (idea.status === 'idea' || idea.status === 'retired') await store.setIdeaStatus(idea.id, 'in_production');
    await store.audit({ actor_id: actor.id, action: 'request_creation', target_id: id, details: { ideaId: idea.id } });
    return { overview: await overview(), result: { changed: 1, message: `"${idea.title}" is in the production queue. The ad team builds it with the locked workflow and asks you to approve the files before anything goes live.` } };
  }
  if (action.action === 'create_idea') {
    const id = await store.insertIdea({ slug: slugFor(action.title, randomSuffix()), title: action.title, angle: action.angle });
    await store.audit({ actor_id: actor.id, action: 'create_idea', target_id: id, details: { title: action.title.slice(0, 140) } });
    return { overview: await overview(), result: { changed: 1, message: `Idea "${action.title}" saved.` } };
  }
  ownerOnly(actor);
  const s = action.settings;
  const saved = await store.updateSettings(action.expectedVersion, { max_daily_spend_minor: s.maxDailySpendMinor, max_total_spend_minor: s.maxTotalSpendMinor, min_impressions: s.minImpressions, pause_ctr_below_pct: s.pauseCtrBelowPct, cost_per_lpv_ratio: s.costPerLpvRatio });
  if (!saved) throw new ApiError(409, 'MARKETING_VERSION_CONFLICT', 'Settings changed in another session. Refresh before saving again.');
  await store.audit({ actor_id: actor.id, action: 'update_settings', target_id: null, details: { maxDaily: money(s.maxDailySpendMinor), maxTotal: money(s.maxTotalSpendMinor), minImpressions: s.minImpressions, pauseCtrBelowPct: s.pauseCtrBelowPct, costPerLpvRatio: s.costPerLpvRatio } });
  return { overview: await overview(), result: { changed: 1, message: 'Saved. These caps and thresholds only shape the recommendations on this page; nothing changes in Meta.' } };
}

// ---------- Supabase-backed store ----------
type DbResult = { data: unknown; error: { message?: string } | null };
interface Chain extends PromiseLike<DbResult> {
  select(columns?: string): Chain; insert(values: unknown): Chain; update(values: unknown): Chain; upsert(values: unknown, options?: Record<string, unknown>): Chain;
  eq(column: string, value: unknown): Chain; order(column: string, options?: Record<string, unknown>): Chain; limit(count: number): Chain; single(): Chain; maybeSingle(): Chain;
}
export interface SupabaseLike { from(table: string): Chain }
function checked<T>(result: DbResult): T {
  if (result.error) throw new ApiError(503, 'MARKETING_PERSISTENCE_FAILED', 'The marketing workspace could not be saved. Refresh and try again.');
  return result.data as T;
}
export function supabaseStore(db: SupabaseLike): MarketingStore {
  return {
    async rows() {
      const [ideas, creatives, launches, metrics, requests, settings, audit] = await Promise.all([
        db.from('jobvance_marketing_ideas').select('*').order('created_at', { ascending: false }),
        db.from('jobvance_marketing_creatives').select('*').order('created_at', { ascending: true }),
        db.from('jobvance_marketing_launches').select('*').order('created_at', { ascending: true }),
        db.from('jobvance_marketing_metrics').select('*').order('day', { ascending: true }).limit(5000),
        db.from('jobvance_marketing_requests').select('*').order('created_at', { ascending: false }).limit(200),
        db.from('jobvance_marketing_settings').select('*').eq('singleton', true).single(),
        db.from('jobvance_marketing_audit').select('*').order('at', { ascending: false }).limit(100),
      ]);
      return { ideas: checked(ideas), creatives: checked(creatives), launches: checked(launches), metrics: checked(metrics), requests: checked(requests), settings: checked(settings), audit: checked(audit) };
    },
    async updateLaunch(id, patch) { checked(await db.from('jobvance_marketing_launches').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)); },
    async upsertMetrics(rows) { checked(await db.from('jobvance_marketing_metrics').upsert(rows.map(row => ({ ...row, fetched_at: new Date().toISOString() })), { onConflict: 'launch_id,day' })); },
    async insertIdea(row) { return checked<{ id: string }>(await db.from('jobvance_marketing_ideas').insert(row).select('id').single()).id; },
    async setIdeaStatus(id, status) { checked(await db.from('jobvance_marketing_ideas').update({ status, updated_at: new Date().toISOString() }).eq('id', id)); },
    async insertRequest(row) { return checked<{ id: string }>(await db.from('jobvance_marketing_requests').insert(row).select('id').single()).id; },
    async updateSettings(expectedVersion, patch) {
      const saved = checked<unknown[]>(await db.from('jobvance_marketing_settings').update({ ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() }).eq('singleton', true).eq('version', expectedVersion).select('version'));
      return Array.isArray(saved) && saved.length === 1;
    },
    async touchSettings(patch) { checked(await db.from('jobvance_marketing_settings').update(patch).eq('singleton', true)); },
    async audit(row) { checked(await db.from('jobvance_marketing_audit').insert(row)); },
  };
}
