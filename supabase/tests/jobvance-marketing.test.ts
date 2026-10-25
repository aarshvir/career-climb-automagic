import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as handler from '../functions/_shared/jobvance-marketing.ts';
import * as metaAds from '../functions/_shared/meta-ads.ts';
import { controlMarketing, validateMarketingAction, type MarketingRows, type MarketingStore } from '../functions/_shared/jobvance-marketing.ts';
import { ApiError } from '../functions/_shared/core.ts';

const owner = { id: 'be619aa5-b1b8-4978-8780-b62461361980', role: 'owner' as const };
const operator = { id: '11111111-2222-4333-8444-555555555555', role: 'operator' as const };
const ideaA = 'aaaaaaaa-0000-4000-8000-000000000001', ideaC = 'aaaaaaaa-0000-4000-8000-000000000003';
const launchA = 'bbbbbbbb-0000-4000-8000-000000000001', launchC = 'bbbbbbbb-0000-4000-8000-000000000003';
const adA = '120252906172570325', adC = '120252906172570399', campaign = '120252906111780325', account = '1843729196384751';
const now = new Date('2026-10-26T06:00:00Z');
const token = 'fictional-meta-token-never-real';
const connected = (name: string) => ({ META_ACCESS_TOKEN: token, META_AD_ACCOUNT_ID: `act_${account}` } as Record<string, string>)[name];
const disconnected = () => undefined;
const settings = { maxDailySpendMinor: 100000, maxTotalSpendMinor: 700000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2 };

let rows: MarketingRows; let store: MarketingStore; let audits: { action: string; actor_id: string | null; target_id: string | null; details: unknown }[];
function freshRows(): MarketingRows {
  return {
    ideas: [
      { id: ideaA, slug: 'version-a', title: 'A: Search. Rewrite. Repeat?', angle: '', status: 'launched', source_path: null, created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' },
      { id: ideaC, slug: 'version-c', title: 'C: Drama', angle: '', status: 'idea', source_path: null, created_at: '2026-10-24T00:00:00Z', updated_at: '2026-10-24T00:00:00Z' },
    ],
    creatives: [{ id: 'cccccccc-0000-4000-8000-000000000001', idea_id: ideaA, label: 'A 4x5', kind: 'video', format: '4x5', file_name: 'a.mp4', sha256: null, approved: true, approved_at: '2026-10-23T00:00:00Z', notes: '' }],
    launches: [
      { id: launchA, idea_id: ideaA, name: 'Version A', platform: 'meta', meta_campaign_id: campaign, meta_adset_id: '120252906157150325', meta_ad_id: adA, status: 'UNKNOWN', effective_status: null, daily_budget_minor: 50000, currency: 'INR', end_at: '2026-10-30T13:00:00Z', last_synced_at: null, metrics_state: 'unknown', metrics_issue: null, created_at: '2026-10-23T00:00:00Z' },
      { id: launchC, idea_id: ideaC, name: 'Version C', platform: 'meta', meta_campaign_id: campaign, meta_adset_id: '120252906157150399', meta_ad_id: adC, status: 'UNKNOWN', effective_status: null, daily_budget_minor: 50000, currency: 'INR', end_at: '2026-10-30T13:00:00Z', last_synced_at: null, metrics_state: 'unknown', metrics_issue: null, created_at: '2026-10-24T00:00:00Z' },
    ],
    metrics: [], requests: [],
    settings: { version: 3, max_daily_spend_minor: 150000, max_total_spend_minor: 700000, min_impressions: 1500, pause_ctr_below_pct: '0.40', cost_per_lpv_ratio: '2.00', last_sync_at: null, updated_at: '2026-10-24T00:00:00Z' },
    audit: [],
  };
}
beforeEach(() => {
  rows = freshRows(); audits = [];
  store = {
    rows: vi.fn(async () => structuredClone(rows)),
    updateLaunch: vi.fn(async (id, patch) => { rows.launches = rows.launches.map(row => row.id === id ? { ...row, ...patch } : row); }),
    upsertMetrics: vi.fn(async metrics => { rows.metrics = [...rows.metrics.filter(m => !metrics.some(n => n.launch_id === m.launch_id && n.day === m.day)), ...metrics]; }),
    insertIdea: vi.fn(async idea => { const id = 'dddddddd-0000-4000-8000-000000000001'; rows.ideas.push({ id, ...idea, status: 'idea', source_path: null, created_at: now.toISOString(), updated_at: now.toISOString() }); return id; }),
    setIdeaStatus: vi.fn(async (id, status) => { rows.ideas = rows.ideas.map(row => row.id === id ? { ...row, status } : row); }),
    insertRequest: vi.fn(async request => { const id = 'eeeeeeee-0000-4000-8000-000000000001'; rows.requests.push({ id, idea_id: request.idea_id, kind: 'create_ad', status: 'queued', note: request.note, created_at: now.toISOString() }); return id; }),
    updateSettings: vi.fn(async (expected, patch) => { if (Number(rows.settings.version) !== expected) return false; rows.settings = { ...rows.settings, ...patch, version: expected + 1 } as MarketingRows['settings']; return true; }),
    touchSettings: vi.fn(async patch => { rows.settings = { ...rows.settings, ...patch }; }),
    audit: vi.fn(async row => { audits.push(row); }),
  };
});

const day = (date: string, impressions: string, spend: string, extra: Record<string, unknown> = {}) => ({ date_start: date, date_stop: date, impressions, reach: impressions, clicks: '80', inline_link_clicks: '61', spend, actions: [{ action_type: 'landing_page_view', value: '37' }], ...extra });
type Page = { data?: unknown; paging?: unknown } | unknown;
/** A fake Graph API: insights[adId] is a list of pages served in order of the `after` cursor. */
function meta({ insights = {}, accountBody = { currency: 'INR', timezone_offset_hours_utc: 5.5, id: `act_${account}` }, ad = {} }: { insights?: Record<string, Page[]>; accountBody?: unknown; ad?: Record<string, Record<string, unknown>> } = {}) {
  const calls: { path: string; params: URLSearchParams; init?: RequestInit }[] = [];
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    expect(url.origin).toBe('https://graph.facebook.com');
    calls.push({ path: url.pathname, params: url.searchParams, init });
    const [, , id, edge] = url.pathname.split('/');
    if (id === `act_${account}`) return Response.json(accountBody);
    if (edge === 'insights') { const pages = insights[id] ?? [{ data: [] }]; const after = url.searchParams.get('after'); return Response.json(pages[after ? Number(after.replace('page', '')) : 0]); }
    const adset = id === adA ? '120252906157150325' : '120252906157150399';
    return Response.json({ status: 'ACTIVE', effective_status: 'ACTIVE', account_id: account, campaign_id: campaign, adset_id: adset, adset: { status: 'ACTIVE', daily_budget: '50000', end_time: '2026-10-30T18:30:00+0530' }, ...ad[id] });
  });
  return { fetcher, calls };
}
const launch = (id: string) => rows.launches.find(row => row.id === id)!;

describe('read-only release: nothing can change Meta', () => {
  it('refuses pause, resume, launch and auto runs for every role, before touching Meta or the database', async () => {
    for (const body of [{ action: 'set_status', launchId: launchA, status: 'ACTIVE' }, { action: 'set_status', launchId: launchA, status: 'PAUSED' }, { action: 'run_auto' }, { action: 'set_status' }])
      expect(() => validateMarketingAction(body)).toThrow(expect.objectContaining({ status: 409, code: 'MARKETING_CONTROL_DISABLED' }));
    expect(handler).not.toHaveProperty('runAuto');
    expect(handler).not.toHaveProperty('changeDelivery');
  });

  it('keeps no Meta write function: the client only exports reads and only sends GET', async () => {
    expect(Object.keys(metaAds).sort()).toEqual(['MAX_INSIGHT_PAGES', 'metaConfig', 'readAccount', 'readAd', 'readInsights']);
    const source = await readFile('supabase/functions/_shared/meta-ads.ts', 'utf8');
    expect(source).not.toMatch(/\b(POST|PUT|PATCH|DELETE|setDelivery|setStatus)\b|method:\s*'(?!GET')/);
    const entry = await readFile('supabase/functions/jobvance-marketing/index.ts', 'utf8');
    expect(entry).not.toMatch(/ticket|runAuto|run_auto/);
    const { fetcher, calls } = meta({ insights: { [adA]: [{ data: [day('2026-10-25', '5000', '400')] }] } });
    await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(call => call.init?.method === 'GET' && call.init.body === undefined && !call.params.has('status'))).toBe(true);
  });

  it('cannot switch auto mode on through settings', async () => {
    expect(() => validateMarketingAction({ action: 'update_settings', expectedVersion: 3, settings: { ...settings, autoMode: true } })).toThrow(expect.objectContaining({ code: 'MARKETING_INPUT_INVALID' }));
    const saved = await controlMarketing(store, owner, validateMarketingAction({ action: 'update_settings', expectedVersion: 3, settings }), disconnected, vi.fn(), now);
    expect(saved.overview.settings).not.toHaveProperty('autoMode');
    expect(vi.mocked(store.updateSettings).mock.calls[0][1]).not.toHaveProperty('auto_mode');
  });
});

describe('marketing input boundary', () => {
  it('accepts exact shapes only', () => {
    expect(validateMarketingAction({ action: 'sync' })).toEqual({ action: 'sync' });
    for (const bad of [{ action: 'overview', extra: 1 }, { action: 'create_idea', title: 'ab', angle: '' }, { action: 'delete_campaign' }, { action: 'update_settings', expectedVersion: 0, settings: { ...settings, maxDailySpendMinor: 900000, maxTotalSpendMinor: 100000 } }, { action: 'update_settings', expectedVersion: 0, settings: { ...settings, metaToken: 'x' } }])
      expect(() => validateMarketingAction(bad)).toThrow(ApiError);
  });
});

describe('marketing control', () => {
  it('shows recorded launches as unknown, never zero, and an honest not-connected message without Meta', async () => {
    const result = await controlMarketing(store, owner, { action: 'overview' }, disconnected, vi.fn(), now);
    expect(result.overview.meta.configured).toBe(false);
    expect(result.overview.launches.map(l => [l.status, l.metrics, l.totals])).toEqual([['UNKNOWN', 'unknown', null], ['UNKNOWN', 'unknown', null]]);
    expect(result.overview.totals.incompleteLaunches).toBe(2);
    await expect(controlMarketing(store, owner, { action: 'sync' }, disconnected, vi.fn(), now)).rejects.toMatchObject({ code: 'META_NOT_CONFIGURED' });
    // A token alone is not enough: the account id ties currency and ancestry checks to one account.
    expect((await controlMarketing(store, owner, { action: 'overview' }, name => name === 'META_ACCESS_TOKEN' ? token : undefined, vi.fn(), now)).overview.meta.configured).toBe(false);
  });

  it('queues an idea for ad creation once, without touching Meta', async () => {
    const fetcher = vi.fn();
    const result = await controlMarketing(store, operator, { action: 'request_creation', ideaId: ideaC, note: 'Woman presenter' }, connected, fetcher, now);
    expect(result.overview.requests).toHaveLength(1);
    expect(result.overview.ideas.find(i => i.id === ideaC)?.status).toBe('in_production');
    await expect(controlMarketing(store, owner, { action: 'request_creation', ideaId: ideaC, note: '' }, connected, fetcher, now)).rejects.toMatchObject({ code: 'MARKETING_ALREADY_QUEUED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects stale settings saves and operators', async () => {
    await expect(controlMarketing(store, owner, { action: 'update_settings', expectedVersion: 2, settings }, disconnected, vi.fn(), now)).rejects.toMatchObject({ code: 'MARKETING_VERSION_CONFLICT' });
    await expect(controlMarketing(store, operator, { action: 'update_settings', expectedVersion: 3, settings }, disconnected, vi.fn(), now)).rejects.toMatchObject({ status: 403 });
    const saved = await controlMarketing(store, owner, { action: 'update_settings', expectedVersion: 3, settings }, disconnected, vi.fn(), now);
    expect(saved.overview.settings).toMatchObject({ version: 4, maxDailySpendMinor: 100000 });
  });

  it('syncs lifetime daily insights into integer minor units and stamps a complete sync', async () => {
    const { fetcher, calls } = meta({ insights: { [adA]: [{ data: [day('2026-10-25', '4200', '487.53')] }] } });
    const result = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now);
    const a = result.overview.launches.find(l => l.id === launchA)!;
    expect(a).toMatchObject({ status: 'ACTIVE', metrics: 'fresh', metricsIssue: null, lastSyncedAt: now.toISOString(), endAt: '2026-10-30T13:00:00.000Z' });
    expect(a.totals).toMatchObject({ impressions: 4200, linkClicks: 61, landingPageViews: 37, spendMinor: 48753 });
    // An ad with no delivery is a complete, empty answer: zero is known here, not assumed.
    expect(result.overview.launches.find(l => l.id === launchC)).toMatchObject({ metrics: 'fresh', totals: { spendMinor: 0, days: 0 } });
    expect(rows.settings.last_sync_at).toBe(now.toISOString());
    expect(calls.find(call => call.path.endsWith('/insights'))!.params.get('date_preset')).toBe('maximum');
    expect(result.result?.message).toMatch(/Nothing in Meta was changed/);
    expect(audits).toEqual([{ actor_id: owner.id, action: 'sync', target_id: null, details: { launches: 2, incomplete: 0 } }]);
  });

  it('follows insights pages with our own cursor request, and gives up past the bound', async () => {
    const pageOne = { data: [day('2026-10-24', '1000', '100.00')], paging: { cursors: { after: 'page1' }, next: 'https://evil.example/steal?access_token=x' } };
    const pageTwo = { data: [day('2026-10-25', '2000', '200.50')], paging: { cursors: { before: 'page1' } } };
    const { fetcher, calls } = meta({ insights: { [adA]: [pageOne, pageTwo] } });
    const result = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now);
    expect(result.overview.launches.find(l => l.id === launchA)!.totals).toMatchObject({ impressions: 3000, spendMinor: 30050, days: 2 });
    expect(calls.filter(call => call.path === `/v22.0/${adA}/insights`).map(call => call.params.get('after'))).toEqual([null, 'page1']);
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('https://graph.facebook.com/'))).toBe(true);

    rows = freshRows(); calls.length = 0;
    const endless = Array.from({ length: metaAds.MAX_INSIGHT_PAGES + 1 }, (_, i) => ({ data: [day(`2026-09-${String(i + 1).padStart(2, '0')}`, '10', '1')], paging: { cursors: { after: `page${i + 1}` }, next: 'https://graph.facebook.com/next' } }));
    const capped = await controlMarketing(store, owner, { action: 'sync' }, connected, meta({ insights: { [adA]: endless } }).fetcher, now);
    expect(capped.overview.launches.find(l => l.id === launchA)).toMatchObject({ metrics: 'unknown', metricsIssue: 'incomplete', totals: null });
    expect(rows.metrics.filter(m => m.launch_id === launchA)).toEqual([]);
    expect(rows.settings.last_sync_at).toBeNull();
  });

  it.each([
    ['no data array', { paging: {} }],
    ['data is not a list', { data: 'oops' }],
    ['non-numeric spend', { data: [day('2026-10-25', '5000', 'abc')] }],
    ['missing spend', { data: [day('2026-10-25', '5000', '1', { spend: undefined })] }],
    ['negative impressions', { data: [day('2026-10-25', '-5', '1')] }],
    ['fractional count', { data: [day('2026-10-25', '5000', '1', { inline_link_clicks: '2.5' })] }],
    ['malformed landing page views', { data: [day('2026-10-25', '5000', '1', { actions: [{ action_type: 'landing_page_view', value: 'many' }] })] }],
    ['multi-day row', { data: [day('2026-10-25', '5000', '1', { date_stop: '2026-10-26' })] }],
    ['future day', { data: [day('2026-10-27', '5000', '1')] }],
    ['duplicate day', { data: [day('2026-10-25', '5000', '1'), day('2026-10-25', '5000', '1')] }],
    ['next page without a cursor', { data: [], paging: { next: 'https://graph.facebook.com/next' } }],
  ])('treats %s as unknown: no zeros written and no successful sync stamped', async (_label, page) => {
    const { fetcher } = meta({ insights: { [adA]: [page] } });
    const result = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now);
    const a = result.overview.launches.find(l => l.id === launchA)!;
    expect(a).toMatchObject({ metrics: 'unknown', metricsIssue: 'invalid', totals: null, status: 'UNKNOWN' });
    expect(rows.metrics.filter(m => m.launch_id === launchA)).toEqual([]);
    expect(launch(launchA).last_synced_at).toBeNull();
    expect(rows.settings.last_sync_at).toBeNull();
    expect(result.result?.message).toMatch(/Read 1 of 2 ads/);
    expect(audits[0].details).toEqual({ launches: 1, incomplete: 1 });
  });

  it('keeps previously complete figures but marks them stale when a later read is partial', async () => {
    await controlMarketing(store, owner, { action: 'sync' }, connected, meta({ insights: { [adA]: [{ data: [day('2026-10-25', '4200', '487.53')] }] } }).fetcher, now);
    const later = new Date(now.getTime() + 3600000);
    const { fetcher } = meta({ insights: { [adA]: [{ data: [day('2026-10-25', '9999', 'NaN')] }] } });
    const result = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, later);
    const a = result.overview.launches.find(l => l.id === launchA)!;
    expect(a).toMatchObject({ metrics: 'stale', metricsIssue: 'invalid', lastSyncedAt: now.toISOString(), totals: { impressions: 4200, spendMinor: 48753 } });
    expect(rows.settings.last_sync_at).toBe(now.toISOString());
    expect(result.overview.totals.incompleteLaunches).toBe(1);
    expect(result.overview.recommendations.find(rec => rec.launchId === launchA)).toMatchObject({ kind: 'figures_unknown' });
  });

  it('marks complete figures stale once they are older than the bound', async () => {
    await controlMarketing(store, owner, { action: 'sync' }, connected, meta().fetcher, now);
    const later = new Date(now.getTime() + handler.STALE_AFTER_MS + 1000);
    expect((await controlMarketing(store, owner, { action: 'overview' }, connected, vi.fn(), later)).overview.launches.map(l => l.metrics)).toEqual(['stale', 'stale']);
  });

  it('treats an account currency that differs from the launch as unknown', async () => {
    const { fetcher, calls } = meta({ accountBody: { currency: 'USD', timezone_offset_hours_utc: 5.5 }, insights: { [adA]: [{ data: [day('2026-10-25', '4200', '487.53')] }] } });
    const result = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now);
    expect(result.overview.launches.map(l => [l.metrics, l.metricsIssue, l.totals])).toEqual([['unknown', 'currency_mismatch', null], ['unknown', 'currency_mismatch', null]]);
    expect(calls.some(call => call.path.endsWith('/insights'))).toBe(false);
    expect(rows.metrics).toEqual([]);
    expect(rows.settings.last_sync_at).toBeNull();
  });

  it('treats an ad outside the recorded account, campaign or ad set, or a changed time zone, as unknown', async () => {
    const moved = await controlMarketing(store, owner, { action: 'sync' }, connected, meta({ ad: { [adA]: { account_id: '999999999999' } } }).fetcher, now);
    expect(moved.overview.launches.find(l => l.id === launchA)).toMatchObject({ metrics: 'unknown', metricsIssue: 'account_mismatch' });
    rows = freshRows();
    const zone = await controlMarketing(store, owner, { action: 'sync' }, connected, meta({ accountBody: { currency: 'INR', timezone_offset_hours_utc: 0 } }).fetcher, now);
    expect(zone.overview.launches.map(l => l.metricsIssue)).toEqual(['account_mismatch', 'account_mismatch']);
  });

  it('marks every launch unverified and reports the error when the account itself cannot be read', async () => {
    const result = await controlMarketing(store, owner, { action: 'sync' }, connected, meta({ accountBody: { currency: 42 } }).fetcher, now).catch(error => error);
    expect(result).toMatchObject({ code: 'META_DATA_INVALID' });
    expect(rows.launches.map(l => [l.metrics_state, l.metrics_issue])).toEqual([['unknown', 'invalid'], ['unknown', 'invalid']]);
    expect(rows.settings.last_sync_at).toBeNull();
  });

  it('recommends from fresh figures for display only', async () => {
    const both = { ...rows.launches[1], idea_id: ideaA };
    rows.launches = [rows.launches[0], both];
    const { fetcher, calls } = meta({ insights: {
      [adA]: [{ data: [day('2026-10-25', '5000', '400', { inline_link_clicks: '60', actions: [{ action_type: 'landing_page_view', value: '40' }] })] }],
      [adC]: [{ data: [day('2026-10-25', '5000', '400', { inline_link_clicks: '30', actions: [{ action_type: 'landing_page_view', value: '8' }] })] }],
    } });
    const result = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now);
    expect(result.overview.recommendations.find(rec => rec.kind === 'pause')).toMatchObject({ launchId: launchC, title: 'Consider pausing Version C' });
    expect(calls.every(call => call.init?.method === 'GET')).toBe(true);
    expect(rows.launches.map(l => l.status)).toEqual(['ACTIVE', 'ACTIVE']);
  });

  it('never surfaces the Meta token, even when Meta errors', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, message: `Invalid token ${token}` } }), { status: 400 }));
    const failure = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now).catch(error => error);
    expect(failure).toMatchObject({ code: 'META_TOKEN_INVALID' });
    expect(JSON.stringify({ message: failure.message, code: failure.code })).not.toContain(token);
    expect(rows.launches.map(l => l.metrics_issue)).toEqual(['meta_error', 'meta_error']);
    const offline = vi.fn(async () => { throw new Error(`fetch failed for https://graph.facebook.com/?access_token=${token}`); });
    const network = await controlMarketing(store, owner, { action: 'sync' }, connected, offline, now).catch(error => error);
    expect(network.message).not.toContain(token);
  });
});
