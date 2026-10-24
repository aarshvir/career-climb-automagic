import type { MarketingDay, MarketingLaunch, MarketingRecommendation, MarketingSettings, MarketingTotals, PauseReason } from '../../../src/lib/marketing-types.ts';

// Pure rules: no network, no clock reads (callers pass `now`). Auto mode may only
// pause or resume existing ads inside the owner's caps; it never creates ads,
// raises a budget or resumes an ad the owner paused.

/** Meta reports insights by the ad account's day; the account bills in INR (IST, UTC+5:30). */
export function accountDay(now: Date, offsetMinutes = 330): string {
  return new Date(now.getTime() + offsetMinutes * 60000).toISOString().slice(0, 10);
}

export function totalsFor(days: MarketingDay[]): MarketingTotals {
  const sum = (key: keyof Omit<MarketingDay, 'day'>) => days.reduce((total, day) => total + day[key], 0);
  const impressions = sum('impressions'), reach = sum('reach'), linkClicks = sum('linkClicks'), landingPageViews = sum('landingPageViews'), spendMinor = sum('spendMinor');
  const sorted = days.map(day => day.day).sort();
  return {
    impressions, reach, linkClicks, landingPageViews, spendMinor,
    ctrPct: impressions > 0 ? Math.round(linkClicks / impressions * 10000) / 100 : null,
    costPerLpvMinor: landingPageViews > 0 ? Math.round(spendMinor / landingPageViews) : null,
    // Reach is not additive across days, so this is an upper bound on frequency.
    frequency: reach > 0 ? Math.round(impressions / reach * 100) / 100 : null,
    days: days.length, lastDay: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

export function money(minor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export function recommend(launches: MarketingLaunch[], settings: MarketingSettings, now: Date): MarketingRecommendation[] {
  const recs: MarketingRecommendation[] = [];
  const today = accountDay(now);
  const currency = launches[0]?.currency ?? 'INR';
  const totalSpend = launches.reduce((total, launch) => total + launch.totals.spendMinor, 0);
  const todaySpend = launches.reduce((total, launch) => total + launch.daily.filter(day => day.day === today).reduce((s, day) => s + day.spendMinor, 0), 0);
  const active = launches.filter(launch => launch.status === 'ACTIVE');
  const pause = (launch: MarketingLaunch, kind: 'pause' | 'spend_cap', reason: PauseReason, title: string, why: string, autoEligible: boolean) =>
    recs.push({ id: `${kind}:${launch.id}`, launchId: launch.id, kind, severity: 'action', title, reason: why, autoEligible, pauseReason: reason });

  const capReason: PauseReason | null = totalSpend >= settings.maxTotalSpendMinor ? 'total_cap' : todaySpend >= settings.maxDailySpendMinor ? 'daily_cap' : null;
  if (capReason) {
    const cap = capReason === 'total_cap' ? `total spend ${money(totalSpend, currency)} has reached the ${money(settings.maxTotalSpendMinor, currency)} cap` : `today's spend ${money(todaySpend, currency)} has reached the ${money(settings.maxDailySpendMinor, currency)} daily cap`;
    for (const launch of active) pause(launch, 'spend_cap', capReason, `Pause ${launch.name}`, `The ${cap}.`, true);
  }

  for (const launch of launches.filter(item => item.status === 'PAUSED' && item.pausedBy === 'auto')) {
    const clear = launch.pausedReason === 'daily_cap' ? !capReason : launch.pausedReason === 'total_cap' ? totalSpend < settings.maxTotalSpendMinor && !capReason : false;
    if (clear && !(launch.endAt && Date.parse(launch.endAt) <= now.getTime()))
      recs.push({ id: `resume:${launch.id}`, launchId: launch.id, kind: 'resume', severity: 'action', title: `Resume ${launch.name}`, reason: launch.pausedReason === 'daily_cap' ? 'Auto mode paused it for the daily cap, and a new day has started.' : 'Auto mode paused it for the total cap, and the cap has been raised.', autoEligible: true });
  }
  if (capReason) return recs;

  const judged = active.filter(launch => launch.totals.impressions >= settings.minImpressions);
  const withCost = judged.filter(launch => launch.totals.costPerLpvMinor !== null);
  const best = withCost.reduce<MarketingLaunch | null>((top, launch) => !top || launch.totals.costPerLpvMinor! < top.totals.costPerLpvMinor! ? launch : top, null);
  const bestCost = best?.totals.costPerLpvMinor ?? null;

  for (const launch of active) {
    const t = launch.totals;
    if (launch.endAt && Date.parse(launch.endAt) <= now.getTime()) { recs.push({ id: `ended:${launch.id}`, launchId: launch.id, kind: 'ended', severity: 'info', title: `${launch.name} has passed its end date`, reason: 'Meta stops delivery at the end date. Extend it in Ads Manager if you want it to keep running.', autoEligible: false }); continue; }
    if (launch.effectiveStatus && ['DISAPPROVED', 'WITH_ISSUES'].includes(launch.effectiveStatus)) recs.push({ id: `check:${launch.id}`, launchId: launch.id, kind: 'check_delivery', severity: 'warning', title: `${launch.name} is not delivering`, reason: `Meta reports ${launch.effectiveStatus.toLowerCase().replace(/_/g, ' ')}. Open the ad in Ads Manager to see why.`, autoEligible: false });
    if (t.impressions < settings.minImpressions) { recs.push({ id: `wait:${launch.id}`, launchId: launch.id, kind: 'wait', severity: 'info', title: `Keep ${launch.name} running`, reason: `${t.impressions.toLocaleString('en-IN')} of ${settings.minImpressions.toLocaleString('en-IN')} impressions so far. Judging earlier would be noise.`, autoEligible: false }); continue; }
    const otherJudged = judged.length > 1;
    if (t.ctrPct !== null && t.ctrPct < settings.pauseCtrBelowPct) pause(launch, 'pause', 'low_ctr', `Pause ${launch.name}`, `Link click-through rate is ${t.ctrPct.toFixed(2)}%, below your ${settings.pauseCtrBelowPct.toFixed(2)}% floor after ${t.impressions.toLocaleString('en-IN')} impressions.`, otherJudged);
    else if (bestCost !== null && best && best.id !== launch.id && (t.costPerLpvMinor === null ? t.spendMinor > bestCost * settings.costPerLpvRatio : t.costPerLpvMinor > bestCost * settings.costPerLpvRatio))
      pause(launch, 'pause', 'high_cost', `Pause ${launch.name}`, t.costPerLpvMinor === null ? `It has spent ${money(t.spendMinor, launch.currency)} with no landing page views, while ${best.name} gets them for ${money(bestCost, launch.currency)} each.` : `Each landing page view costs ${money(t.costPerLpvMinor, launch.currency)}, more than ${settings.costPerLpvRatio}x ${best.name}'s ${money(bestCost, launch.currency)}.`, otherJudged);
    if (t.frequency !== null && t.frequency > 3) recs.push({ id: `refresh:${launch.id}`, launchId: launch.id, kind: 'refresh_creative', severity: 'warning', title: `Refresh the creative for ${launch.name}`, reason: `People have seen it about ${t.frequency.toFixed(1)} times on average. A new cut usually lowers cost once frequency passes 3.`, autoEligible: false });
  }
  if (best && bestCost !== null) {
    const runnerUp = withCost.filter(launch => launch.id !== best.id).sort((a, b) => a.totals.costPerLpvMinor! - b.totals.costPerLpvMinor!)[0];
    if (runnerUp && bestCost < runnerUp.totals.costPerLpvMinor! * 0.7) recs.push({ id: `budget:${best.id}`, launchId: best.id, kind: 'budget_review', severity: 'info', title: `${best.name} is the current winner`, reason: `${money(bestCost, best.currency)} per landing page view against ${money(runnerUp.totals.costPerLpvMinor!, best.currency)} for ${runnerUp.name}. Consider moving budget to it in Ads Manager. Auto mode never raises spend.`, autoEligible: false });
  }

  // Never let performance rules switch every ad off: keep the cheapest one running.
  const perf = recs.filter(rec => rec.kind === 'pause' && rec.autoEligible);
  if (active.length && perf.length >= active.length) {
    const keep = [...active].sort((a, b) => (a.totals.costPerLpvMinor ?? Number.MAX_SAFE_INTEGER) - (b.totals.costPerLpvMinor ?? Number.MAX_SAFE_INTEGER) || (b.totals.ctrPct ?? 0) - (a.totals.ctrPct ?? 0))[0];
    for (const rec of perf) if (rec.launchId === keep.id) { rec.autoEligible = false; rec.reason += ' Auto mode keeps it running because it is the best remaining ad.'; }
  }
  return recs;
}

export interface AutoChange { launchId: string; status: 'ACTIVE' | 'PAUSED'; reason: PauseReason | null; recommendationId: string }
/** At most `limit` changes per run, so one bad metrics read cannot flip everything. */
export function autoChanges(recs: MarketingRecommendation[], limit = 4): AutoChange[] {
  return recs.filter(rec => rec.autoEligible && rec.launchId && (rec.kind === 'pause' || rec.kind === 'spend_cap' || rec.kind === 'resume')).slice(0, limit)
    .map(rec => ({ launchId: rec.launchId!, status: rec.kind === 'resume' ? 'ACTIVE' : 'PAUSED', reason: rec.kind === 'resume' ? null : rec.pauseReason ?? null, recommendationId: rec.id }));
}
