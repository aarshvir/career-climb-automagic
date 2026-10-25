import { describe, expect, it } from 'vitest';
import * as rules from '../functions/_shared/marketing-rules.ts';
import { accountDay, recommend, totalsFor } from '../functions/_shared/marketing-rules.ts';
import type { MarketingDay, MarketingLaunch, MarketingSettings } from '../../src/lib/marketing-types.ts';

const now = new Date('2026-10-26T06:00:00Z'); // 11:30 IST, account day 2026-10-26
const settings: MarketingSettings = { version: 0, maxDailySpendMinor: 150000, maxTotalSpendMinor: 700000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2, lastSyncAt: null, updatedAt: '2026-10-24T00:00:00Z' };
const day = (d: string, impressions: number, linkClicks: number, landingPageViews: number, spendMinor: number, reach = Math.round(impressions * 0.8)): MarketingDay => ({ day: d, impressions, reach, clicks: linkClicks, linkClicks, landingPageViews, spendMinor });
function launch(id: string, days: MarketingDay[], patch: Partial<MarketingLaunch> = {}): MarketingLaunch {
  const metrics = patch.metrics ?? 'fresh';
  return { id, ideaId: 'idea', name: `Ad ${id}`, platform: 'meta', metaCampaignId: '120252906111780325', metaAdsetId: '120252906157150325', metaAdId: '120252906172570325', status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudgetMinor: 50000, currency: 'INR', endAt: '2026-10-30T13:00:00Z', lastSyncedAt: '2026-10-26T05:00:00Z', metrics, metricsIssue: null, totals: metrics === 'unknown' ? null : totalsFor(days), daily: metrics === 'unknown' ? [] : days, ...patch };
}

describe('marketing recommendation rules', () => {
  it('only advises: there is no auto-apply step and no resume advice', () => {
    expect(Object.keys(rules).sort()).toEqual(['ACCOUNT_UTC_OFFSET_MINUTES', 'accountDay', 'money', 'recommend', 'totalsFor']);
    const paused = [launch('a', [day('2026-10-25', 4000, 40, 20, 80000)], { status: 'PAUSED' }), launch('b', [day('2026-10-25', 4000, 40, 20, 80000)])];
    const recs = recommend(paused, settings, new Date('2026-10-27T06:00:00Z'));
    expect(recs.some(rec => rec.launchId === 'a')).toBe(false);
    for (const rec of recs) { expect(rec).not.toHaveProperty('autoEligible'); expect(rec.kind).not.toBe('resume'); }
  });

  it('uses the IST account day and sums totals without float drift', () => {
    expect(accountDay(new Date('2026-10-25T19:00:00Z'))).toBe('2026-10-26');
    const t = totalsFor([day('2026-10-24', 1000, 10, 5, 12345), day('2026-10-25', 3000, 20, 15, 30000)]);
    expect(t).toMatchObject({ impressions: 4000, linkClicks: 30, landingPageViews: 20, spendMinor: 42345, ctrPct: 0.75, costPerLpvMinor: 2117, days: 2, lastDay: '2026-10-25' });
  });

  it('waits until an ad has enough impressions before judging it', () => {
    const recs = recommend([launch('a', [day('2026-10-24', 900, 1, 0, 20000)]), launch('b', [day('2026-10-24', 800, 0, 0, 20000)])], settings, now);
    expect(recs.map(rec => rec.kind)).toEqual(['wait', 'wait']);
  });

  it('flags the clearly more expensive ad and names the winner', () => {
    const cheap = launch('a', [day('2026-10-25', 5000, 60, 40, 40000)]); // ₹10 per view
    const dear = launch('b', [day('2026-10-25', 5000, 30, 8, 40000)]);   // ₹50 per view
    const recs = recommend([cheap, dear], settings, now);
    expect(recs.filter(rec => rec.kind === 'pause')).toEqual([expect.objectContaining({ launchId: 'b', severity: 'action', title: 'Consider pausing Ad b' })]);
    expect(recs.find(rec => rec.kind === 'budget_review')).toMatchObject({ launchId: 'a', reason: expect.stringContaining('in Ads Manager') });
  });

  it('never advises switching every ad off for performance', () => {
    const recs = recommend([launch('a', [day('2026-10-25', 5000, 10, 4, 40000)]), launch('b', [day('2026-10-25', 5000, 5, 1, 40000)])], settings, now);
    const pauses = recs.filter(rec => rec.kind === 'pause');
    expect(pauses.map(rec => [rec.launchId, rec.severity])).toEqual([['a', 'warning'], ['b', 'action']]);
    expect(recommend([launch('a', [day('2026-10-25', 5000, 5, 1, 40000)])], settings, now).find(rec => rec.kind === 'pause')).toMatchObject({ severity: 'warning', title: 'Keep Ad a running for now' });
  });

  it('advises pausing every running ad at a cap, using known spend as a lower bound', () => {
    const today = [launch('a', [day('2026-10-26', 4000, 40, 20, 80000)]), launch('b', [day('2026-10-26', 4000, 40, 20, 75000)])];
    const capped = recommend(today, settings, now);
    expect(capped.map(rec => [rec.kind, rec.launchId])).toEqual([['spend_cap', 'a'], ['spend_cap', 'b']]);
    const withUnknown = recommend([...today, launch('c', [], { metrics: 'unknown' })], settings, now);
    expect(withUnknown.find(rec => rec.kind === 'spend_cap')!.reason).toContain('at least');
    const spent = [launch('a', [day('2026-10-25', 50000, 500, 300, 700000)])];
    expect(recommend(spent, settings, now)[0]).toMatchObject({ kind: 'spend_cap', reason: expect.stringContaining('total spend') });
  });

  it('never judges unknown or stale figures, and says so instead of treating them as zero', () => {
    const unknown = launch('u', [], { metrics: 'unknown', metricsIssue: 'currency_mismatch' });
    const stale = launch('s', [day('2026-10-25', 9000, 5, 1, 90000)], { metrics: 'stale' });
    const recs = recommend([unknown, stale], settings, now);
    expect(recs.map(rec => [rec.kind, rec.launchId, rec.title])).toEqual([['figures_unknown', 'u', 'Figures for Ad u are unknown'], ['figures_unknown', 's', 'Figures for Ad s are stale']]);
  });

  it('warns about fatigue, disapproval and ended ads', () => {
    const tired = launch('t', [day('2026-10-25', 9000, 90, 60, 60000, 2000)], { effectiveStatus: 'DISAPPROVED' });
    const kinds = recommend([tired], settings, now).map(rec => rec.kind);
    expect(kinds).toContain('refresh_creative');
    expect(kinds).toContain('check_delivery');
    expect(recommend([launch('e', [], { endAt: '2026-10-26T00:00:00Z' })], settings, now).map(rec => rec.kind)).toEqual(['ended']);
  });
});
