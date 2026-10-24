import { beforeEach, describe, expect, it, vi } from 'vitest';
import { controlMarketing, runAuto, validateMarketingAction, type MarketingRows, type MarketingStore } from '../functions/_shared/jobvance-marketing.ts';
import { ApiError } from '../functions/_shared/core.ts';

const owner = { id: 'be619aa5-b1b8-4978-8780-b62461361980', role: 'owner' as const };
const operator = { id: '11111111-2222-4333-8444-555555555555', role: 'operator' as const };
const ideaA = 'aaaaaaaa-0000-4000-8000-000000000001', ideaC = 'aaaaaaaa-0000-4000-8000-000000000003';
const launchA = 'bbbbbbbb-0000-4000-8000-000000000001', launchC = 'bbbbbbbb-0000-4000-8000-000000000003';
const now = new Date('2026-10-26T06:00:00Z');
const token = 'fictional-meta-token-never-real';
const connected = (name: string) => ({ META_ACCESS_TOKEN: token, META_AD_ACCOUNT_ID: 'act_1843729196384751' } as Record<string, string>)[name];
const disconnected = () => undefined;

let rows: MarketingRows; let store: MarketingStore; let audits: { action: string; actor_id: string | null; target_id: string | null }[];
function freshRows(): MarketingRows {
  return {
    ideas: [
      { id: ideaA, slug: 'version-a', title: 'A: Search. Rewrite. Repeat?', angle: '', status: 'launched', source_path: null, created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' },
      { id: ideaC, slug: 'version-c', title: 'C: Drama', angle: '', status: 'idea', source_path: null, created_at: '2026-10-24T00:00:00Z', updated_at: '2026-10-24T00:00:00Z' },
    ],
    creatives: [{ id: 'cccccccc-0000-4000-8000-000000000001', idea_id: ideaA, label: 'A 4x5', kind: 'video', format: '4x5', file_name: 'a.mp4', sha256: null, approved: true, approved_at: '2026-10-23T00:00:00Z', notes: '' }],
    launches: [
      { id: launchA, idea_id: ideaA, name: 'Version A', platform: 'meta', meta_campaign_id: '120252906111780325', meta_adset_id: '120252906157150325', meta_ad_id: '120252906172570325', status: 'PAUSED', effective_status: 'PAUSED', daily_budget_minor: 50000, currency: 'INR', end_at: '2026-10-30T13:00:00Z', paused_by: 'owner', paused_reason: 'owner', last_synced_at: null, created_at: '2026-10-23T00:00:00Z' },
      { id: launchC, idea_id: ideaC, name: 'Version C', platform: 'meta', meta_campaign_id: '120252906111780325', meta_adset_id: '120252906157150399', meta_ad_id: '120252906172570399', status: 'PAUSED', effective_status: 'PAUSED', daily_budget_minor: 50000, currency: 'INR', end_at: '2026-10-30T13:00:00Z', paused_by: 'owner', paused_reason: 'owner', last_synced_at: null, created_at: '2026-10-24T00:00:00Z' },
    ],
    metrics: [], requests: [],
    settings: { version: 3, auto_mode: false, max_daily_spend_minor: 150000, max_total_spend_minor: 700000, min_impressions: 1500, pause_ctr_below_pct: '0.40', cost_per_lpv_ratio: '2.00', last_sync_at: null, last_auto_run_at: null, updated_at: '2026-10-24T00:00:00Z' },
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
    consumeTicket: vi.fn(async () => true),
  };
});

function meta(insights: Record<string, unknown[]> = {}) {
  const calls: { url: string; method: string; body: string }[] = [];
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url: url.pathname + url.search.replace(token, '<token>'), method: init?.method ?? 'GET', body: String(init?.body ?? '').replace(token, '<token>') });
    expect(url.origin).toBe('https://graph.facebook.com');
    if (init?.method === 'POST') return new Response(JSON.stringify({ success: true }));
    const id = url.pathname.split('/')[2];
    if (url.pathname.endsWith('/insights')) return new Response(JSON.stringify({ data: insights[id] ?? [] }));
    return new Response(JSON.stringify({ status: 'ACTIVE', effective_status: 'ACTIVE', adset: { status: 'ACTIVE', daily_budget: '50000', end_time: '2026-10-30T18:30:00+0530' } }));
  });
  return { fetcher, calls };
}

describe('marketing input boundary', () => {
  it('accepts exact shapes only', () => {
    expect(validateMarketingAction({ action: 'set_status', launchId: launchA, status: 'PAUSED' })).toEqual({ action: 'set_status', launchId: launchA, status: 'PAUSED' });
    for (const bad of [{ action: 'set_status', launchId: launchA, status: 'DELETED' }, { action: 'set_status', launchId: 'x', status: 'PAUSED' }, { action: 'overview', extra: 1 }, { action: 'create_idea', title: 'ab', angle: '' }, { action: 'delete_campaign' }, { action: 'update_settings', expectedVersion: 0, settings: { autoMode: true, maxDailySpendMinor: 900000, maxTotalSpendMinor: 100000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2 } }, { action: 'update_settings', expectedVersion: 0, settings: { autoMode: true, maxDailySpendMinor: 1, maxTotalSpendMinor: 2, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2, metaToken: 'x' } }])
      expect(() => validateMarketingAction(bad)).toThrow(ApiError);
  });
});

describe('marketing control', () => {
  it('shows recorded launches and an honest not-connected message without Meta', async () => {
    const result = await controlMarketing(store, owner, { action: 'overview' }, disconnected, vi.fn(), now);
    expect(result.overview.meta.configured).toBe(false);
    expect(result.overview.launches).toHaveLength(2);
    await expect(controlMarketing(store, owner, { action: 'set_status', launchId: launchA, status: 'ACTIVE' }, disconnected, vi.fn(), now)).rejects.toMatchObject({ code: 'META_NOT_CONFIGURED' });
  });

  it('launches an approved idea in Meta (campaign, ad set, ad) and audits it', async () => {
    const { fetcher, calls } = meta();
    const result = await controlMarketing(store, owner, { action: 'set_status', launchId: launchA, status: 'ACTIVE' }, connected, fetcher, now);
    expect(calls.map(call => `${call.method} ${call.url.split('?')[0]}`)).toEqual(['POST /v22.0/120252906111780325', 'POST /v22.0/120252906157150325', 'POST /v22.0/120252906172570325']);
    expect(calls.every(call => call.body.includes('status=ACTIVE'))).toBe(true);
    expect(result.overview.launches.find(l => l.id === launchA)).toMatchObject({ status: 'ACTIVE', pausedBy: null });
    expect(audits).toEqual([{ actor_id: owner.id, action: 'set_status', target_id: launchA, details: { status: 'ACTIVE', metaAdId: '120252906172570325' } }]);
  });

  it('refuses to switch on an idea with no owner-approved video, and refuses operators', async () => {
    const { fetcher } = meta();
    await expect(controlMarketing(store, owner, { action: 'set_status', launchId: launchC, status: 'ACTIVE' }, connected, fetcher, now)).rejects.toMatchObject({ code: 'MARKETING_NOT_APPROVED' });
    await expect(controlMarketing(store, operator, { action: 'set_status', launchId: launchA, status: 'PAUSED' }, connected, fetcher, now)).rejects.toMatchObject({ status: 403 });
    await expect(controlMarketing(store, operator, { action: 'update_settings', expectedVersion: 3, settings: { autoMode: true, maxDailySpendMinor: 100000, maxTotalSpendMinor: 700000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2 } }, connected, fetcher, now)).rejects.toMatchObject({ status: 403 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('queues an idea for ad creation once', async () => {
    const result = await controlMarketing(store, operator, { action: 'request_creation', ideaId: ideaC, note: 'Woman presenter' }, disconnected, vi.fn(), now);
    expect(result.overview.requests).toHaveLength(1);
    expect(result.overview.ideas.find(i => i.id === ideaC)?.status).toBe('in_production');
    await expect(controlMarketing(store, owner, { action: 'request_creation', ideaId: ideaC, note: '' }, disconnected, vi.fn(), now)).rejects.toMatchObject({ code: 'MARKETING_ALREADY_QUEUED' });
  });

  it('syncs daily insights into integer minor units, including landing page views', async () => {
    const { fetcher } = meta({ '120252906172570325': [{ date_start: '2026-10-25', impressions: '4200', reach: '3900', clicks: '80', inline_link_clicks: '61', spend: '487.53', actions: [{ action_type: 'landing_page_view', value: '37' }] }] });
    const result = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now);
    const a = result.overview.launches.find(l => l.id === launchA)!;
    expect(a.totals).toMatchObject({ impressions: 4200, linkClicks: 61, landingPageViews: 37, spendMinor: 48753 });
    expect(a.status).toBe('ACTIVE');
    expect(a.endAt).toBe('2026-10-30T13:00:00.000Z');
  });

  it('rejects stale settings saves', async () => {
    const settings = { autoMode: true, maxDailySpendMinor: 100000, maxTotalSpendMinor: 700000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2 };
    await expect(controlMarketing(store, owner, { action: 'update_settings', expectedVersion: 2, settings }, disconnected, vi.fn(), now)).rejects.toMatchObject({ code: 'MARKETING_VERSION_CONFLICT' });
    const saved = await controlMarketing(store, owner, { action: 'update_settings', expectedVersion: 3, settings }, disconnected, vi.fn(), now);
    expect(saved.overview.settings).toMatchObject({ version: 4, autoMode: true, maxDailySpendMinor: 100000 });
  });

  it('auto mode off: syncs and recommends but never changes an ad', async () => {
    const { fetcher, calls } = meta();
    expect((await runAuto(store, null, connected, fetcher, now)).changed).toBe(0);
    expect(calls.some(call => call.method === 'POST')).toBe(false);
  });

  it('auto mode on: pauses the clear loser through Meta and records auto as the actor', async () => {
    rows.settings.auto_mode = true;
    const both = { ...rows.launches[1], id: launchC, idea_id: ideaA };
    rows.launches = [rows.launches[0], both];
    const { fetcher, calls } = meta({
      '120252906172570325': [{ date_start: '2026-10-25', impressions: '5000', reach: '4000', inline_link_clicks: '60', spend: '400', actions: [{ action_type: 'landing_page_view', value: '40' }] }],
      '120252906172570399': [{ date_start: '2026-10-25', impressions: '5000', reach: '4000', inline_link_clicks: '30', spend: '400', actions: [{ action_type: 'landing_page_view', value: '8' }] }],
    });
    const result = await runAuto(store, null, connected, fetcher, now);
    expect(result.changed).toBe(1);
    expect(calls.filter(call => call.method === 'POST').map(call => call.url.split('?')[0])).toEqual(['/v22.0/120252906172570399', '/v22.0/120252906157150399']);
    expect(rows.launches.find(l => l.id === launchC)).toMatchObject({ status: 'PAUSED', paused_by: 'auto', paused_reason: 'high_cost' });
    expect(audits.map(a => [a.action, a.actor_id])).toEqual([['auto_pause', null], ['run_auto', null]]);
  });

  it('never surfaces the Meta token, even when Meta errors', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, message: `Invalid token ${token}` } }), { status: 400 }));
    const failure = await controlMarketing(store, owner, { action: 'sync' }, connected, fetcher, now).catch(error => error);
    expect(failure).toMatchObject({ code: 'META_TOKEN_INVALID' });
    expect(JSON.stringify({ message: failure.message, code: failure.code })).not.toContain(token);
    const offline = vi.fn(async () => { throw new Error(`fetch failed for https://graph.facebook.com/?access_token=${token}`); });
    const network = await controlMarketing(store, owner, { action: 'sync' }, connected, offline, now).catch(error => error);
    expect(network.message).not.toContain(token);
  });
});
