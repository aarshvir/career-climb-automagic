import { describe, expect, it } from 'vitest';
import { accountDay, autoChanges, recommend, totalsFor } from '../functions/_shared/marketing-rules.ts';
import type { MarketingDay, MarketingLaunch, MarketingSettings } from '../../src/lib/marketing-types.ts';

const now = new Date('2026-10-26T06:00:00Z'); // 11:30 IST, account day 2026-10-26
const settings: MarketingSettings = { version: 0, autoMode: true, maxDailySpendMinor: 150000, maxTotalSpendMinor: 700000, minImpressions: 1500, pauseCtrBelowPct: 0.4, costPerLpvRatio: 2, lastSyncAt: null, lastAutoRunAt: null, updatedAt: '2026-10-24T00:00:00Z' };
const day = (d: string, impressions: number, linkClicks: number, landingPageViews: number, spendMinor: number, reach = Math.round(impressions * 0.8)): MarketingDay => ({ day: d, impressions, reach, clicks: linkClicks, linkClicks, landingPageViews, spendMinor });
function launch(id: string, days: MarketingDay[], patch: Partial<MarketingLaunch> = {}): MarketingLaunch {
  return { id, ideaId: 'idea', name: `Ad ${id}`, platform: 'meta', metaCampaignId: '120252906111780325', metaAdsetId: '120252906157150325', metaAdId: '120252906172570325', status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudgetMinor: 50000, currency: 'INR', endAt: '2026-10-30T13:00:00Z', pausedBy: null, pausedReason: null, lastSyncedAt: null, totals: totalsFor(days), daily: days, ...patch };
}

describe('marketing recommendation rules', () => {
  it('uses the IST account day and sums totals without float drift', () => {
    expect(accountDay(new Date('2026-10-25T19:00:00Z'))).toBe('2026-10-26');
    const t = totalsFor([day('2026-10-24', 1000, 10, 5, 12345), day('2026-10-25', 3000, 20, 15, 30000)]);
    expect(t).toMatchObject({ impressions: 4000, linkClicks: 30, landingPageViews: 20, spendMinor: 42345, ctrPct: 0.75, costPerLpvMinor: 2117, days: 2, lastDay: '2026-10-25' });
  });

  it('waits until an ad has enough impressions before judging it', () => {
    const recs = recommend([launch('a', [day('2026-10-24', 900, 1, 0, 20000)]), launch('b', [day('2026-10-24', 800, 0, 0, 20000)])], settings, now);
    expect(recs.map(rec => rec.kind)).toEqual(['wait', 'wait']);
    expect(autoChanges(recs)).toEqual([]);
  });

  it('flags the clearly more expensive ad and lets auto mode pause it, while keeping the winner on', () => {
    const cheap = launch('a', [day('2026-10-25', 5000, 60, 40, 40000)]); // ₹10 per view
    const dear = launch('b', [day('2026-10-25', 5000, 30, 8, 40000)]);   // ₹50 per view
    const recs = recommend([cheap, dear], settings, now);
    const pause = recs.find(rec => rec.kind === 'pause');
    expect(pause).toMatchObject({ launchId: 'b', autoEligible: true, pauseReason: 'high_cost' });
    expect(recs.find(rec => rec.kind === 'budget_review')).toMatchObject({ launchId: 'a', autoEligible: false });
    expect(autoChanges(recs)).toEqual([{ launchId: 'b', status: 'PAUSED', reason: 'high_cost', recommendationId: 'pause:b' }]);
  });

  it('never lets performance rules switch every ad off', () => {
    const recs = recommend([launch('a', [day('2026-10-25', 5000, 10, 4, 40000)]), launch('b', [day('2026-10-25', 5000, 5, 1, 40000)])], settings, now);
    const pauses = recs.filter(rec => rec.kind === 'pause');
    expect(pauses).toHaveLength(2);
    expect(pauses.filter(rec => rec.autoEligible)).toHaveLength(1);
    expect(autoChanges(recs).map(change => change.launchId)).toEqual(['b']);
  });

  it('does not auto-pause the only ad for performance', () => {
    const recs = recommend([launch('a', [day('2026-10-25', 5000, 5, 1, 40000)])], settings, now);
    expect(recs.find(rec => rec.kind === 'pause')).toMatchObject({ autoEligible: false });
    expect(autoChanges(recs)).toEqual([]);
  });

  it('pauses everything at the daily cap and resumes only what auto mode paused once a new day starts', () => {
    const today = [launch('a', [day('2026-10-26', 4000, 40, 20, 80000)]), launch('b', [day('2026-10-26', 4000, 40, 20, 75000)])];
    const capped = recommend(today, settings, now);
    expect(capped.every(rec => rec.kind === 'spend_cap' && rec.pauseReason === 'daily_cap')).toBe(true);
    expect(autoChanges(capped).map(change => change.status)).toEqual(['PAUSED', 'PAUSED']);
    const nextDay = new Date('2026-10-26T20:00:00Z'); // 01:30 IST on 27 Oct
    const paused = [launch('a', today[0].daily, { status: 'PAUSED', pausedBy: 'auto', pausedReason: 'daily_cap' }), launch('b', today[1].daily, { status: 'PAUSED', pausedBy: 'owner', pausedReason: 'owner' })];
    expect(autoChanges(recommend(paused, settings, nextDay))).toEqual([{ launchId: 'a', status: 'ACTIVE', reason: null, recommendationId: 'resume:a' }]);
  });

  it('stops at the total cap and never resumes after the end date', () => {
    const spent = [launch('a', [day('2026-10-25', 50000, 500, 300, 700000)])];
    expect(recommend(spent, settings, now)[0]).toMatchObject({ kind: 'spend_cap', pauseReason: 'total_cap', autoEligible: true });
    const ended = [launch('a', [day('2026-10-25', 50000, 500, 300, 100000)], { status: 'PAUSED', pausedBy: 'auto', pausedReason: 'daily_cap', endAt: '2026-10-26T00:00:00Z' })];
    expect(autoChanges(recommend(ended, settings, now))).toEqual([]);
  });

  it('caps auto changes per run and warns about fatigue and disapproval', () => {
    const many = Array.from({ length: 6 }, (_, i) => launch(String(i), [day('2026-10-26', 2000, 20, 10, 30000)]));
    expect(autoChanges(recommend(many, settings, now))).toHaveLength(4);
    const tired = launch('t', [day('2026-10-25', 9000, 90, 60, 60000, 2000)], { effectiveStatus: 'DISAPPROVED' });
    const kinds = recommend([tired], settings, now).map(rec => rec.kind);
    expect(kinds).toContain('refresh_creative');
    expect(kinds).toContain('check_delivery');
  });
});
