import { ApiError } from './core.ts';
import { accountDay, autoChanges, money, recommend, totalsFor } from './marketing-rules.ts';
import { metaConfig, readAd, readInsights, setDelivery, type MetaEnv, type MetaFetch } from './meta-ads.ts';
import type { IdeaStatus, LaunchStatus, MarketingAction, MarketingAudit, MarketingCreative, MarketingDay, MarketingIdea, MarketingLaunch, MarketingOverview, MarketingRequest, MarketingResponse, MarketingRole, MarketingSettings, MarketingSettingsInput, PauseReason } from '../../../src/lib/marketing-types.ts';

// ---------- storage boundary (service-role tables; see 20261024090000 migration) ----------
export interface IdeaRow { id: string; slug: string; title: string; angle: string; status: IdeaStatus; source_path: string | null; created_at: string; updated_at: string }
export interface CreativeRow { id: string; idea_id: string; label: string; kind: 'video' | 'copy'; format: string | null; file_name: string | null; sha256: string | null; approved: boolean; approved_at: string | null; notes: string }
export interface LaunchRow { id: string; idea_id: string; name: string; platform: 'meta'; meta_campaign_id: string; meta_adset_id: string; meta_ad_id: string; status: LaunchStatus; effective_status: string | null; daily_budget_minor: number | null; currency: string; end_at: string | null; paused_by: 'owner' | 'auto' | null; paused_reason: PauseReason | null; last_synced_at: string | null; created_at: string }
export interface MetricRow { launch_id: string; day: string; impressions: number; reach: number; clicks: number; link_clicks: number; landing_page_views: number; spend_minor: number }
export interface RequestRow { id: string; idea_id: string; kind: 'create_ad'; status: MarketingRequest['status']; note: string; created_at: string }
export interface SettingsRow { version: number; auto_mode: boolean; max_daily_spend_minor: number; max_total_spend_minor: number; min_impressions: number; pause_ctr_below_pct: number | string; cost_per_lpv_ratio: number | string; last_sync_at: string | null; last_auto_run_at: string | null; updated_at: string }
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
  touchSettings(patch: { last_sync_at?: string; last_auto_run_at?: string }): Promise<void>;
  audit(row: { actor_id: string | null; action: string; target_id: string | null; details: Record<string, string | number | boolean | null> }): Promise<void>;
  consumeTicket(ticket: string): Promise<boolean>;
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
  if (item.action === 'overview' || item.action === 'sync' || item.action === 'run_auto') { exact(item, ['action']); return { action: item.action }; }
  if (item.action === 'set_status') { exact(item, ['action', 'launchId', 'status']); if (typeof item.launchId !== 'string' || !uuid.test(item.launchId) || (item.status !== 'ACTIVE' && item.status !== 'PAUSED')) invalid(); return { action: 'set_status', launchId: item.launchId, status: item.status }; }
  if (item.action === 'request_creation') { exact(item, ['action', 'ideaId', 'note']); if (typeof item.ideaId !== 'string' || !uuid.test(item.ideaId) || !text(item.note, 0, 1000)) invalid(); return { action: 'request_creation', ideaId: item.ideaId, note: (item.note as string).trim() }; }
  if (item.action === 'create_idea') { exact(item, ['action', 'title', 'angle']); if (!text(item.title, 3, 140) || !text(item.angle, 0, 600)) invalid(); return { action: 'create_idea', title: (item.title as string).trim(), angle: (item.angle as string).trim() }; }
  if (item.action === 'update_settings') {
    exact(item, ['action', 'expectedVersion', 'settings']);
    if (!int(item.expectedVersion, 0, Number.MAX_SAFE_INTEGER) || !item.settings || typeof item.settings !== 'object' || Array.isArray(item.settings)) invalid();
    const s = item.settings as Record<string, unknown>;
    exact(s, ['autoMode', 'maxDailySpendMinor', 'maxTotalSpendMinor', 'minImpressions', 'pauseCtrBelowPct', 'costPerLpvRatio']);
    if (typeof s.autoMode !== 'boolean' || !int(s.maxDailySpendMinor, 1, 10_000_000) || !int(s.maxTotalSpendMinor, 1, 100_000_000) || !int(s.minImpressions, 100, 1_000_000) || !num(s.pauseCtrBelowPct, 0, 10) || !num(s.costPerLpvRatio, 1.2, 10)) invalid();
    if ((s.maxDailySpendMinor as number) > (s.maxTotalSpendMinor as number)) invalid();
    return { action: 'update_settings', expectedVersion: item.expectedVersion as number, settings: s as unknown as MarketingSettingsInput };
  }
  invalid();
}

// ---------- mapping ----------
const settingsOf = (row: SettingsRow): MarketingSettings => ({ version: Number(row.version), autoMode: row.auto_mode, maxDailySpendMinor: Number(row.max_daily_spend_minor), maxTotalSpendMinor: Number(row.max_total_spend_minor), minImpressions: Number(row.min_impressions), pauseCtrBelowPct: Number(row.pause_ctr_below_pct), costPerLpvRatio: Number(row.cost_per_lpv_ratio), lastSyncAt: row.last_sync_at, lastAutoRunAt: row.last_auto_run_at, updatedAt: row.updated_at });
const dayOf = (row: MetricRow): MarketingDay => ({ day: row.day, impressions: Number(row.impressions), reach: Number(row.reach), clicks: Number(row.clicks), linkClicks: Number(row.link_clicks), landingPageViews: Number(row.landing_page_views), spendMinor: Number(row.spend_minor) });
function launchOf(row: LaunchRow, metrics: MetricRow[]): MarketingLaunch {
  const daily = metrics.filter(metric => metric.launch_id === row.id).map(dayOf).sort((a, b) => a.day.localeCompare(b.day));
  return { id: row.id, ideaId: row.idea_id, name: row.name, platform: 'meta', metaCampaignId: row.meta_campaign_id, metaAdsetId: row.meta_adset_id, metaAdId: row.meta_ad_id, status: row.status, effectiveStatus: row.effective_status, dailyBudgetMinor: row.daily_budget_minor === null ? null : Number(row.daily_budget_minor), currency: row.currency, endAt: row.end_at, pausedBy: row.paused_by, pausedReason: row.paused_reason, lastSyncedAt: row.last_synced_at, totals: totalsFor(daily), daily };
}

export async function buildOverview(store: MarketingStore, actor: { id: string; role: MarketingRole }, env: MetaEnv, now: Date): Promise<MarketingOverview> {
  const rows = await store.rows();
  const settings = settingsOf(rows.settings);
  const launches = rows.launches.map(row => launchOf(row, rows.metrics));
  const config = metaConfig(env);
  const today = accountDay(now);
  return {
    actor, generatedAt: now.toISOString(),
    meta: config ? { configured: true, adAccountId: config.adAccountId, message: settings.lastSyncAt ? 'Connected. Figures come from the last sync with Meta.' : 'Connected. Press "Sync from Meta" to load live figures.' } : { configured: false, adAccountId: null, message: 'Meta is not connected yet. Add META_ACCESS_TOKEN (and META_AD_ACCOUNT_ID) to the jobvance-marketing function secrets. Until then this page shows recorded launches only, and buttons that change ads are disabled.' },
    settings,
    ideas: rows.ideas.map((row): MarketingIdea => ({ id: row.id, slug: row.slug, title: row.title, angle: row.angle, status: row.status, sourcePath: row.source_path, createdAt: row.created_at, updatedAt: row.updated_at })),
    creatives: rows.creatives.map((row): MarketingCreative => ({ id: row.id, ideaId: row.idea_id, label: row.label, kind: row.kind, format: row.format, fileName: row.file_name, sha256: row.sha256, approved: row.approved, approvedAt: row.approved_at, notes: row.notes })),
    launches, requests: rows.requests.map((row): MarketingRequest => ({ id: row.id, ideaId: row.idea_id, kind: row.kind, status: row.status, note: row.note, createdAt: row.created_at })),
    recommendations: recommend(launches, settings, now),
    totals: { spendMinor: launches.reduce((s, l) => s + l.totals.spendMinor, 0), todaySpendMinor: launches.reduce((s, l) => s + l.daily.filter(d => d.day === today).reduce((t, d) => t + d.spendMinor, 0), 0), impressions: launches.reduce((s, l) => s + l.totals.impressions, 0), landingPageViews: launches.reduce((s, l) => s + l.totals.landingPageViews, 0), activeLaunches: launches.filter(l => l.status === 'ACTIVE').length, currency: launches[0]?.currency ?? 'INR' },
    audit: rows.audit.slice(0, 100).map((row): MarketingAudit => ({ id: row.id, actorId: row.actor_id, action: row.action, targetId: row.target_id, at: row.at, details: row.details })),
  };
}

// ---------- Meta sync ----------
export async function syncFromMeta(store: MarketingStore, env: MetaEnv, fetcher: MetaFetch, now: Date): Promise<number> {
  const config = metaConfig(env);
  if (!config) throw new ApiError(409, 'META_NOT_CONFIGURED', 'Connect Meta first: add META_ACCESS_TOKEN to the jobvance-marketing function secrets.');
  const rows = await store.rows();
  const until = accountDay(now), since = accountDay(new Date(now.getTime() - 29 * 86400000));
  let synced = 0;
  for (const launch of rows.launches.filter(row => row.status !== 'DELETED')) {
    const state = await readAd(config, fetcher, launch.meta_ad_id);
    const days = await readInsights(config, fetcher, launch.meta_ad_id, since, until);
    // Meta is the source of truth for delivery; keep who paused it unless it now runs.
    await store.updateLaunch(launch.id, { status: state.status, effective_status: state.effectiveStatus, daily_budget_minor: state.dailyBudgetMinor, end_at: state.endAt ?? launch.end_at, last_synced_at: now.toISOString(), ...(state.status === 'ACTIVE' ? { paused_by: null, paused_reason: null } : launch.paused_by ? {} : { paused_by: 'owner', paused_reason: 'owner' }) });
    if (days.length) await store.upsertMetrics(days.map(day => ({ launch_id: launch.id, day: day.day, impressions: day.impressions, reach: day.reach, clicks: day.clicks, link_clicks: day.linkClicks, landing_page_views: day.landingPageViews, spend_minor: day.spendMinor })));
    synced++;
  }
  await store.touchSettings({ last_sync_at: now.toISOString() });
  return synced;
}

// ---------- actions ----------
function ownerOnly(actor: { role: MarketingRole } | null): void { if (actor && actor.role !== 'owner') throw new ApiError(403, 'MARKETING_FORBIDDEN', 'Only the owner can change ads or auto mode.'); }

async function changeDelivery(store: MarketingStore, env: MetaEnv, fetcher: MetaFetch, rows: MarketingRows, launchId: string, next: 'ACTIVE' | 'PAUSED', pausedBy: 'owner' | 'auto', reason: PauseReason | null, now: Date): Promise<LaunchRow> {
  const config = metaConfig(env);
  if (!config) throw new ApiError(409, 'META_NOT_CONFIGURED', 'Connect Meta first: add META_ACCESS_TOKEN to the jobvance-marketing function secrets.');
  const launch = rows.launches.find(row => row.id === launchId);
  if (!launch || launch.status === 'DELETED' || launch.status === 'ARCHIVED') throw new ApiError(404, 'MARKETING_NOT_FOUND', 'That launch is unavailable.');
  if (next === 'ACTIVE') {
    // Owner rule: nothing goes live without an owner-approved video for that idea.
    if (!rows.creatives.some(item => item.idea_id === launch.idea_id && item.kind === 'video' && item.approved)) throw new ApiError(409, 'MARKETING_NOT_APPROVED', 'This idea has no owner-approved video yet, so it cannot go live.');
    if (launch.end_at && Date.parse(launch.end_at) <= now.getTime()) throw new ApiError(409, 'MARKETING_ENDED', 'This ad set has passed its end date. Extend it in Ads Manager first.');
  }
  await setDelivery(config, fetcher, { campaignId: launch.meta_campaign_id, adsetId: launch.meta_adset_id, adId: launch.meta_ad_id }, next);
  await store.updateLaunch(launch.id, { status: next, ...(next === 'ACTIVE' ? { paused_by: null, paused_reason: null } : { paused_by: pausedBy, paused_reason: reason ?? 'owner' }) });
  return launch;
}

export async function runAuto(store: MarketingStore, actor: { id: string } | null, env: MetaEnv, fetcher: MetaFetch, now: Date): Promise<{ changed: number; message: string }> {
  const before = settingsOf((await store.rows()).settings);
  if (!metaConfig(env)) return { changed: 0, message: 'Meta is not connected, so auto mode cannot read results or change ads.' };
  await syncFromMeta(store, env, fetcher, now);
  const rows = await store.rows();
  const settings = settingsOf(rows.settings);
  const recs = recommend(rows.launches.map(row => launchOf(row, rows.metrics)), settings, now);
  await store.touchSettings({ last_auto_run_at: now.toISOString() });
  if (!before.autoMode || !settings.autoMode) {
    await store.audit({ actor_id: actor?.id ?? null, action: 'run_auto', target_id: null, details: { autoMode: false, recommendations: recs.length } });
    return { changed: 0, message: 'Auto mode is off: figures were synced and recommendations refreshed, but no ad was changed.' };
  }
  let changed = 0;
  for (const change of autoChanges(recs)) {
    const launch = await changeDelivery(store, env, fetcher, rows, change.launchId, change.status, 'auto', change.reason, now);
    await store.audit({ actor_id: actor?.id ?? null, action: change.status === 'ACTIVE' ? 'auto_resume' : 'auto_pause', target_id: launch.id, details: { reason: change.reason ?? 'cap_cleared', recommendation: change.recommendationId, metaAdId: launch.meta_ad_id } });
    changed++;
  }
  await store.audit({ actor_id: actor?.id ?? null, action: 'run_auto', target_id: null, details: { autoMode: true, changed, recommendations: recs.length } });
  return { changed, message: changed ? `Auto mode changed ${changed} ad${changed === 1 ? '' : 's'}. Each change is in the audit log.` : 'Auto mode checked every ad. Nothing needed changing.' };
}

function slugFor(title: string, suffix: string): string {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'idea';
  return `${/^[a-z0-9]/.test(base) ? base : `i-${base}`}-${suffix}`.slice(0, 63);
}

export async function controlMarketing(store: MarketingStore, actor: { id: string; role: MarketingRole }, action: MarketingAction, env: MetaEnv, fetcher: MetaFetch, now: Date, randomSuffix: () => string = () => crypto.randomUUID().slice(0, 6)): Promise<MarketingResponse> {
  const overview = () => buildOverview(store, actor, env, now);
  if (action.action === 'overview') return { overview: await overview() };
  if (action.action === 'sync') {
    const synced = await syncFromMeta(store, env, fetcher, now);
    await store.audit({ actor_id: actor.id, action: 'sync', target_id: null, details: { launches: synced } });
    return { overview: await overview(), result: { changed: synced, message: `Synced ${synced} ad${synced === 1 ? '' : 's'} from Meta.` } };
  }
  if (action.action === 'set_status') {
    ownerOnly(actor);
    const rows = await store.rows();
    const launch = await changeDelivery(store, env, fetcher, rows, action.launchId, action.status, 'owner', action.status === 'PAUSED' ? 'owner' : null, now);
    const idea = rows.ideas.find(row => row.id === launch.idea_id);
    if (action.status === 'ACTIVE' && idea && idea.status !== 'launched') await store.setIdeaStatus(idea.id, 'launched');
    await store.audit({ actor_id: actor.id, action: 'set_status', target_id: launch.id, details: { status: action.status, metaAdId: launch.meta_ad_id } });
    return { overview: await overview(), result: { changed: 1, message: action.status === 'ACTIVE' ? `${launch.name} is switched on in Meta.` : `${launch.name} is paused in Meta.` } };
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
  if (action.action === 'update_settings') {
    ownerOnly(actor);
    const s = action.settings;
    const saved = await store.updateSettings(action.expectedVersion, { auto_mode: s.autoMode, max_daily_spend_minor: s.maxDailySpendMinor, max_total_spend_minor: s.maxTotalSpendMinor, min_impressions: s.minImpressions, pause_ctr_below_pct: s.pauseCtrBelowPct, cost_per_lpv_ratio: s.costPerLpvRatio });
    if (!saved) throw new ApiError(409, 'MARKETING_VERSION_CONFLICT', 'Settings changed in another session. Refresh before saving again.');
    await store.audit({ actor_id: actor.id, action: 'update_settings', target_id: null, details: { autoMode: s.autoMode, maxDaily: money(s.maxDailySpendMinor), maxTotal: money(s.maxTotalSpendMinor), minImpressions: s.minImpressions, pauseCtrBelowPct: s.pauseCtrBelowPct, costPerLpvRatio: s.costPerLpvRatio } });
    return { overview: await overview(), result: { changed: 1, message: s.autoMode ? 'Saved. Auto mode is on: it checks every hour and can only pause or resume ads inside your caps.' : 'Saved. Auto mode is off.' } };
  }
  ownerOnly(actor);
  const result = await runAuto(store, actor, env, fetcher, now);
  return { overview: await overview(), result };
}

// ---------- Supabase-backed store ----------
type DbResult = { data: unknown; error: { message?: string } | null };
interface Chain extends PromiseLike<DbResult> {
  select(columns?: string): Chain; insert(values: unknown): Chain; update(values: unknown): Chain; upsert(values: unknown, options?: Record<string, unknown>): Chain;
  eq(column: string, value: unknown): Chain; order(column: string, options?: Record<string, unknown>): Chain; limit(count: number): Chain; single(): Chain; maybeSingle(): Chain;
}
export interface SupabaseLike { from(table: string): Chain; rpc(name: string, args: Record<string, unknown>): PromiseLike<DbResult> }
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
    async consumeTicket(ticket) { return checked<boolean>(await db.rpc('jobvance_marketing_consume_ticket', { p_ticket: ticket })) === true; },
  };
}
