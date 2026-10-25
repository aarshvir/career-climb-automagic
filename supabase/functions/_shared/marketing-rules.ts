import type { MarketingDay, MarketingLaunch, MarketingRecommendation, MarketingSettings, MarketingTotals } from '../../../src/lib/marketing-types.ts';

// Pure rules: no network, no clock reads (callers pass `now`). They only produce advice for
// the owner to act on in Meta Ads Manager; nothing in this release applies them to an ad.

/** Meta reports insights by the ad account's day; the account bills in INR (IST, UTC+5:30). */
export const ACCOUNT_UTC_OFFSET_MINUTES = 330;
export function accountDay(now: Date, offsetMinutes = ACCOUNT_UTC_OFFSET_MINUTES): string {
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

type Measured = MarketingLaunch & { totals: MarketingTotals };
const measured = (launch: MarketingLaunch): launch is Measured => launch.totals !== null;

export function recommend(launches: MarketingLaunch[], settings: MarketingSettings, now: Date): MarketingRecommendation[] {
  const recs: MarketingRecommendation[] = [];
  const today = accountDay(now);
  const currency = launches[0]?.currency ?? 'INR';
  const live = launches.filter(launch => launch.status !== 'DELETED' && launch.status !== 'ARCHIVED');
  for (const launch of live.filter(item => item.metrics !== 'fresh'))
    recs.push({ id: `figures:${launch.id}`, launchId: launch.id, kind: 'figures_unknown', severity: 'warning', title: launch.metrics === 'unknown' ? `Figures for ${launch.name} are unknown` : `Figures for ${launch.name} are stale`, reason: launch.metrics === 'unknown' ? 'There is no complete read from Meta yet, so its spend is not counted and it is not judged. Sync now, or check it in Ads Manager.' : 'Only older figures are available, so it is not judged until a fresh sync and its spend may be higher than shown.' });

  // Unknown figures are left out, so these sums are lower bounds: they can show that a cap
  // was reached, never that spend is safely under it.
  const known = launches.filter(measured);
  const partial = live.some(launch => launch.metrics !== 'fresh') ? 'at least ' : '';
  const totalSpend = known.reduce((total, launch) => total + launch.totals.spendMinor, 0);
  const todaySpend = known.reduce((total, launch) => total + launch.daily.filter(day => day.day === today).reduce((s, day) => s + day.spendMinor, 0), 0);
  const active = launches.filter(launch => launch.status === 'ACTIVE');
  const cap = totalSpend >= settings.maxTotalSpendMinor ? `total spend of ${partial}${money(totalSpend, currency)} has reached the ${money(settings.maxTotalSpendMinor, currency)} cap`
    : todaySpend >= settings.maxDailySpendMinor ? `today's spend of ${partial}${money(todaySpend, currency)} has reached the ${money(settings.maxDailySpendMinor, currency)} daily cap` : null;
  if (cap) {
    for (const launch of active) recs.push({ id: `spend_cap:${launch.id}`, launchId: launch.id, kind: 'spend_cap', severity: 'action', title: `Pause ${launch.name} in Ads Manager`, reason: `The ${cap}.` });
    return recs;
  }

  const judged = active.filter(measured).filter(launch => launch.metrics === 'fresh' && launch.totals.impressions >= settings.minImpressions);
  const withCost = judged.filter(launch => launch.totals.costPerLpvMinor !== null);
  const best = withCost.reduce<Measured | null>((top, launch) => !top || launch.totals.costPerLpvMinor! < top.totals.costPerLpvMinor! ? launch : top, null);
  const bestCost = best?.totals.costPerLpvMinor ?? null;
  const pause = (launch: MarketingLaunch, reason: string) => recs.push({ id: `pause:${launch.id}`, launchId: launch.id, kind: 'pause', severity: 'action', title: `Consider pausing ${launch.name}`, reason });

  for (const launch of active) {
    if (launch.endAt && Date.parse(launch.endAt) <= now.getTime()) { recs.push({ id: `ended:${launch.id}`, launchId: launch.id, kind: 'ended', severity: 'info', title: `${launch.name} has passed its end date`, reason: 'Meta stops delivery at the end date. Extend it in Ads Manager if you want it to keep running.' }); continue; }
    if (launch.effectiveStatus && ['DISAPPROVED', 'WITH_ISSUES'].includes(launch.effectiveStatus)) recs.push({ id: `check:${launch.id}`, launchId: launch.id, kind: 'check_delivery', severity: 'warning', title: `${launch.name} is not delivering`, reason: `Meta reports ${launch.effectiveStatus.toLowerCase().replace(/_/g, ' ')}. Open the ad in Ads Manager to see why.` });
    const t = launch.metrics === 'fresh' ? launch.totals : null;
    if (!t) continue;
    if (t.impressions < settings.minImpressions) { recs.push({ id: `wait:${launch.id}`, launchId: launch.id, kind: 'wait', severity: 'info', title: `Keep ${launch.name} running`, reason: `${t.impressions.toLocaleString('en-IN')} of ${settings.minImpressions.toLocaleString('en-IN')} impressions so far. Judging earlier would be noise.` }); continue; }
    if (t.ctrPct !== null && t.ctrPct < settings.pauseCtrBelowPct) pause(launch, `Link click-through rate is ${t.ctrPct.toFixed(2)}%, below your ${settings.pauseCtrBelowPct.toFixed(2)}% floor after ${t.impressions.toLocaleString('en-IN')} impressions.`);
    else if (bestCost !== null && best && best.id !== launch.id && (t.costPerLpvMinor === null ? t.spendMinor > bestCost * settings.costPerLpvRatio : t.costPerLpvMinor > bestCost * settings.costPerLpvRatio))
      pause(launch, t.costPerLpvMinor === null ? `It has spent ${money(t.spendMinor, launch.currency)} with no landing page views, while ${best.name} gets them for ${money(bestCost, launch.currency)} each.` : `Each landing page view costs ${money(t.costPerLpvMinor, launch.currency)}, more than ${settings.costPerLpvRatio}x ${best.name}'s ${money(bestCost, launch.currency)}.`);
    if (t.frequency !== null && t.frequency > 3) recs.push({ id: `refresh:${launch.id}`, launchId: launch.id, kind: 'refresh_creative', severity: 'warning', title: `Refresh the creative for ${launch.name}`, reason: `People have seen it about ${t.frequency.toFixed(1)} times on average. A new cut usually lowers cost once frequency passes 3.` });
  }
  if (best && bestCost !== null) {
    const runnerUp = withCost.filter(launch => launch.id !== best.id).sort((a, b) => a.totals.costPerLpvMinor! - b.totals.costPerLpvMinor!)[0];
    if (runnerUp && bestCost < runnerUp.totals.costPerLpvMinor! * 0.7) recs.push({ id: `budget:${best.id}`, launchId: best.id, kind: 'budget_review', severity: 'info', title: `${best.name} is the current winner`, reason: `${money(bestCost, best.currency)} per landing page view against ${money(runnerUp.totals.costPerLpvMinor!, best.currency)} for ${runnerUp.name}. Consider moving budget to it in Ads Manager.` });
  }

  // Never advise switching every ad off for performance: keep the best one running.
  const pauses = recs.filter(rec => rec.kind === 'pause');
  if (active.length && pauses.length >= active.length) {
    const keep = [...judged].sort((a, b) => (a.totals.costPerLpvMinor ?? Number.MAX_SAFE_INTEGER) - (b.totals.costPerLpvMinor ?? Number.MAX_SAFE_INTEGER) || (b.totals.ctrPct ?? 0) - (a.totals.ctrPct ?? 0))[0];
    for (const rec of pauses) if (rec.launchId === keep?.id) { rec.severity = 'warning'; rec.title = `Keep ${keep.name} running for now`; rec.reason += ' It is the best remaining ad, so keep it on until a better one is live.'; }
  }
  return recs;
}
