/**
 * Deterministic, advisory measurements for the single approved Jobvance test.
 * No network, provider calls, secret access, writes, publishing or ad mutations.
 * All money uses minor units (paise/cents). The caller supplies the clock.
 * `verified` fields mean independently read-back evidence, never an assumption.
 */
export const APPROVED_SCOPE = Object.freeze({
  accountId: '1843729196384751',
  campaignId: '120252906111780325',
  adsetId: '120252906157150325',
  adId: '120252906172570325',
});

export const APPROVED_LIMITS = Object.freeze({
  currency: 'INR', dailyBudgetMinor: 40000, campaignCapMinor: 500000,
  dailyUsdMinor: 1000, lifetimeUsdMinor: 7000,
  start: '2026-10-17T13:00:00Z', end: '2026-10-24T13:00:00Z',
});

export const MEASUREMENT_POLICY = Object.freeze({
  healthMaxAgeMs: 30 * 60 * 1000,
  deliveryMaxAgeMs: 60 * 60 * 1000,
  metricsMaxAgeMs: 6 * 60 * 60 * 1000,
  fxMaxAgeMs: 24 * 60 * 60 * 1000,
  organicMaxAgeMs: 24 * 60 * 60 * 1000,
  paidMinimumLandingViews: 100,
  paidMinimumReviewedDownloads: 10,
  organicMinimumImpressions: 1000,
  organicMinimumBaselinePosts: 5,
  organicMinimumObservationSeconds: 48 * 60 * 60,
});

const HOUR = 3600000;
const DAY = 24 * HOUR;
const own = (value, key) => value != null && Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const prohibitedActions = Object.freeze(['activate', 'increase_budget', 'promote', 'modify_unrelated_campaigns']);

function instant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, ys, mos, ds, hs, mis, ss, ohs, oms] = match;
  const [year, month, day, hour, minute, second] = [ys, mos, ds, hs, mis, ss].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hour > 23 || minute > 59 || second > 59
    || (ohs !== undefined && (Number(ohs) > 23 || Number(oms) > 59))) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function clock(value) {
  const result = instant(value);
  if (result === null) throw new TypeError('now must be an explicit ISO timestamp with timezone');
  return result;
}

function exactScope(scope) {
  return object(scope) && Object.entries(APPROVED_SCOPE).every(([key, value]) => scope[key] === value);
}

function fresh(observedAt, now, maxAge) {
  const at = instant(observedAt);
  return at !== null && at <= now && now - at <= maxAge;
}

function provenance(value) {
  return object(value) && value.verified === true && nonempty(value.source) && nonempty(value.evidenceId);
}

function zonedParts(at, timeZone) {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  } catch { return null; }
}

function validMetaContext(value, now, maxAge) {
  return provenance(value) && exactScope(value.scope)
    && value.currency === APPROVED_LIMITS.currency && value.currencyVerified === true
    && value.timezoneVerified === true && nonempty(value.timezone)
    && zonedParts(now, value.timezone) !== null
    && fresh(value.observedAt, now, maxAge);
}

function validPeriod(period, kind, metrics, now) {
  if (!object(period) || period.complete !== true) return false;
  // A single-ad spend row cannot establish that the campaign-wide cap is safe.
  const aggregation = { daily: 'adset', lifetime: 'campaign', sevenDay: 'ad' }[kind];
  if (period.aggregation !== aggregation) return false;
  const start = instant(period.start), end = instant(period.end), observed = instant(metrics.observedAt);
  if (start === null || end === null || end !== observed || start > end) return false;
  if (kind === 'lifetime') return start === instant(APPROVED_LIMITS.start);
  if (kind === 'sevenDay') return end - start === 7 * DAY;
  if (kind === 'daily') {
    const a = zonedParts(start, metrics.timezone), b = zonedParts(end, metrics.timezone), current = zonedParts(now, metrics.timezone);
    return a !== null && b !== null && current !== null && a.year === b.year && a.month === b.month && a.day === b.day
      && b.year === current.year && b.month === current.month && b.day === current.day
      && a.hour === '00' && a.minute === '00' && a.second === '00' && start % 1000 === 0;
  }
  return false;
}

function outcomeCount(period, name) {
  return object(period?.outcomes) && count(period.outcomes[name]) ? period.outcomes[name] : null;
}

/**
 * Input:
 * { now, health?, delivery?, metrics?, fx? }
 * health: {verified,source,evidenceId,observedAt,url,available,offerAccurate}
 * delivery: {verified,source,evidenceId,observedAt,scope,currency,currencyVerified,
 *   timezone,timezoneVerified,status,dailyBudgetMinor,campaignCapMinor,end,
 *   permissionVerified?,permissionError?}
 * metrics: same verified context as delivery, plus daily/lifetime/sevenDay:
 *   {start,end,complete,aggregation,spendMinor?,landingViews?,impressions?,reach?,outcomes?}.
 *   aggregation is adset for daily spend, campaign for lifetime spend and ad
 *   for sevenDay performance. Never use one ad's spend for the campaign cap.
 *   Each period ends at observedAt. daily starts at account-local midnight;
 *   lifetime starts at approved start; sevenDay is exactly 168 trailing hours.
 *   outcomes only: accountsCreated, searchesSaved, reviewedDownloads,
 *   secondApplications, verifiedPurchases, verifiedNetRevenueMinor.
 *   Attribution requires {verified:true,deduplicationVerified:true,source,evidenceId}.
 * fx: {verified,source,evidenceId,observedAt,base:'USD',quote:'INR',inrPerUsd}.
 * Output is a recommendation, never an executed pause or activation.
 */
export function decideGrowthAction(input) {
  if (!object(input)) throw new TypeError('measurement input must be an object');
  const now = clock(input.now);
  const pause = [], review = [];
  const evidence = {
    dailySpendMinor: null, lifetimeSpendMinor: null, dailySpendUsdMinor: null,
    lifetimeSpendUsdMinor: null, sevenDayFrequency: null, reviewedDownloads: null,
    accountsCreated: null, searchesSaved: null, secondApplications: null,
    verifiedPurchases: null, verifiedNetRevenueMinor: null, costPerReviewedDownloadMinor: null,
    revenueToSpendRatio: null, sampleAssessment: 'inconclusive', currency: 'INR',
    performancePeriod: null, fxQuote: null,
    usdAmountsAre: 'current_quote_equivalents_not_settled_charges',
  };
  if (now >= instant(APPROVED_LIMITS.end)) pause.push('approved_test_expired');
  if (now < instant(APPROVED_LIMITS.start)) review.push('approved_test_not_started');

  const health = input.health;
  let healthUrl = false;
  try {
    const url = new URL(health?.url);
    healthUrl = url.origin === 'https://jobvance.io' && ['/onboarding', '/loop'].includes(url.pathname)
      && !url.username && !url.password;
  } catch { /* Missing/invalid evidence is not evidence of an outage. */ }
  if (provenance(health) && healthUrl && fresh(health.observedAt, now, MEASUREMENT_POLICY.healthMaxAgeMs)) {
    if (health.available === false) pause.push('landing_page_unavailable');
    if (health.offerAccurate === false) pause.push('offer_misleading');
    if (typeof health.available !== 'boolean' || typeof health.offerAccurate !== 'boolean') review.push('health_incomplete');
  } else review.push('health_missing_stale_or_unverified');

  const delivery = input.delivery;
  const deliveryValid = validMetaContext(delivery, now, MEASUREMENT_POLICY.deliveryMaxAgeMs);
  if (deliveryValid) {
    if (!['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'ARCHIVED'].includes(delivery.status)) review.push('delivery_status_unknown');
    if (!count(delivery.dailyBudgetMinor) || !count(delivery.campaignCapMinor)) review.push('budget_readback_missing');
    else {
      if (delivery.dailyBudgetMinor > APPROVED_LIMITS.dailyBudgetMinor) pause.push('daily_budget_above_approved_cap');
      if (delivery.campaignCapMinor === 0 || delivery.campaignCapMinor > APPROVED_LIMITS.campaignCapMinor) pause.push('campaign_spend_cap_absent_or_exceeded');
    }
    const end = instant(delivery.end);
    if (end === null) review.push('campaign_end_unverified');
    else if (end > instant(APPROVED_LIMITS.end)) pause.push('campaign_end_extended_beyond_approval');
    if (delivery.permissionVerified !== true) review.push('advertising_permission_not_verified');
    if (delivery.permissionVerified === true && nonempty(delivery.permissionError)) pause.push('advertising_permission_failure');
    if (delivery.status === 'DISAPPROVED') pause.push('ad_disapproved');
  } else review.push('delivery_missing_stale_or_scope_currency_timezone_unverified');

  const metrics = input.metrics;
  const metricsValid = validMetaContext(metrics, now, MEASUREMENT_POLICY.metricsMaxAgeMs);
  if (metricsValid) {
    for (const [kind, field, cap] of [['daily', 'dailySpendMinor', APPROVED_LIMITS.dailyBudgetMinor], ['lifetime', 'lifetimeSpendMinor', APPROVED_LIMITS.campaignCapMinor]]) {
      if (validPeriod(metrics[kind], kind, metrics, now) && count(metrics[kind].spendMinor)) {
        evidence[field] = metrics[kind].spendMinor;
        if (evidence[field] >= cap) pause.push(`${kind}_spend_cap_reached`);
      } else review.push(`${kind}_spend_missing_or_wrong_period`);
    }
    const seven = metrics.sevenDay;
    if (validPeriod(seven, 'sevenDay', metrics, now)) {
      evidence.performancePeriod = { start: seven.start, end: seven.end, durationHours: 168 };
      if (count(seven.impressions) && count(seven.reach) && seven.reach > 0 && seven.impressions >= seven.reach)
        evidence.sevenDayFrequency = seven.impressions / seven.reach;
      else review.push('seven_day_frequency_unavailable');

      const attribution = metrics.attribution;
      if (provenance(attribution) && attribution.deduplicationVerified === true) {
        for (const key of ['accountsCreated', 'searchesSaved', 'reviewedDownloads', 'secondApplications', 'verifiedPurchases', 'verifiedNetRevenueMinor'])
          evidence[key] = outcomeCount(seven, key);
        if (count(seven.landingViews) && seven.landingViews >= MEASUREMENT_POLICY.paidMinimumLandingViews
          && evidence.reviewedDownloads !== null && evidence.reviewedDownloads >= MEASUREMENT_POLICY.paidMinimumReviewedDownloads) {
          evidence.sampleAssessment = 'eligible_for_qualified_review';
          if (count(seven.spendMinor)) evidence.costPerReviewedDownloadMinor = seven.spendMinor / evidence.reviewedDownloads;
          if (count(seven.spendMinor) && seven.spendMinor > 0 && evidence.verifiedNetRevenueMinor !== null)
            evidence.revenueToSpendRatio = evidence.verifiedNetRevenueMinor / seven.spendMinor;
        } else review.push('qualified_activation_sample_small_or_missing');
      } else review.push('qualified_conversion_attribution_unverified');
      // Leads are deliberately never an alias for source-approved CV downloads.
      if (own(seven, 'leads') || own(seven.outcomes, 'leads')) review.push('generic_leads_excluded_from_qualified_outcomes');
    } else review.push('seven_day_metrics_missing_or_wrong_period');
  } else review.push('metrics_missing_stale_or_scope_currency_timezone_unverified');

  const fx = input.fx;
  const fxValid = provenance(fx) && fx.base === 'USD' && fx.quote === 'INR'
    && positive(fx.inrPerUsd) && fresh(fx.observedAt, now, MEASUREMENT_POLICY.fxMaxAgeMs);
  if (fxValid) {
    evidence.fxQuote = { observedAt: fx.observedAt, inrPerUsd: fx.inrPerUsd, source: fx.source, evidenceId: fx.evidenceId };
    // INR minor units / INR per USD = USD cents; no implicit/guessed FX rate.
    for (const [inr, usd, cap] of [['dailySpendMinor', 'dailySpendUsdMinor', APPROVED_LIMITS.dailyUsdMinor], ['lifetimeSpendMinor', 'lifetimeSpendUsdMinor', APPROVED_LIMITS.lifetimeUsdMinor]]) {
      if (evidence[inr] !== null) {
        evidence[usd] = evidence[inr] / fx.inrPerUsd;
        if (evidence[usd] >= cap) pause.push(`${inr.startsWith('daily') ? 'daily' : 'lifetime'}_usd_ceiling_reached`);
      }
    }
    if (deliveryValid && count(delivery.dailyBudgetMinor) && count(delivery.campaignCapMinor)) {
      if (delivery.dailyBudgetMinor / fx.inrPerUsd > APPROVED_LIMITS.dailyUsdMinor
        || delivery.campaignCapMinor / fx.inrPerUsd > APPROVED_LIMITS.lifetimeUsdMinor) pause.push('configured_inr_budget_exceeds_usd_authority');
    }
  } else review.push('usd_ceiling_requires_fresh_verified_fx');

  review.push('no_automatic_activation_scaling_or_promotion');
  return {
    action: pause.length ? 'pause' : 'review', target: { ...APPROVED_SCOPE },
    pauseReasons: [...new Set(pause)], reviewReasons: [...new Set(review)], evidence,
    limits: { ...APPROVED_LIMITS }, prohibitedActions: [...prohibitedActions],
    execution: 'recommendation_only',
  };
}

function organicPost(post) {
  if (!provenance(post) || !nonempty(post.postId) || !nonempty(post.assetSha256)
    || !/^[a-f0-9]{64}$/i.test(post.assetSha256) || !['instagram', 'facebook'].includes(post.platform)
    || !nonempty(post.accountId) || !count(post.impressions) || !count(post.saves)
    || post.saves > post.impressions || !positive(post.durationMilliseconds)
    || !count(post.observationSeconds) || post.observationSeconds < MEASUREMENT_POLICY.organicMinimumObservationSeconds
    || post.paid !== false) return false;
  const published = instant(post.publishedAt), observed = instant(post.observedAt);
  return published !== null && observed !== null && observed - published === post.observationSeconds * 1000;
}

/**
 * compareOrganic({now,candidate,baseline:{start,end,posts}}): compares saves per
 * 1,000 impressions. Candidate and each baseline post require verified provenance,
 * postId, 64-hex assetSha256, platform, accountId, paid:false, impressions, saves,
 * durationMilliseconds, observationSeconds, publishedAt and observedAt.
 * Baseline publication window is exactly 14 days ending at candidate publication;
 * >=5 distinct posts across >=7 days, each >=1,000 impressions, exact same video
 * duration and observation length. Current candidate >=48h and 1,000 impressions.
 * Differences are descriptive; neither significance nor paid success is inferred.
 */
export function compareOrganic(input) {
  if (!object(input)) throw new TypeError('organic comparison input must be an object');
  const now = clock(input.now), c = input.candidate, b = input.baseline;
  const reasons = [];
  const empty = () => ({ status: 'inconclusive', reasons, candidateSaveRatePer1000: null, baselineSaveRatePer1000: null, relativeLift: null, recommendation: 'collect_comparable_evidence', mayPromote: false });
  if (!organicPost(c) || !fresh(c?.observedAt, now, MEASUREMENT_POLICY.organicMaxAgeMs)
    || c.impressions < MEASUREMENT_POLICY.organicMinimumImpressions) {
    reasons.push('candidate_missing_stale_small_or_unverified'); return empty();
  }
  const start = instant(b?.start), end = instant(b?.end);
  if (!object(b) || start === null || end === null || end - start !== 14 * DAY || end !== instant(c.publishedAt)
    || !Array.isArray(b.posts) || b.posts.length < MEASUREMENT_POLICY.organicMinimumBaselinePosts) {
    reasons.push('complete_preceding_fourteen_day_baseline_required'); return empty();
  }
  const ids = new Set(), publishedTimes = [];
  for (const p of b.posts) {
    if (!organicPost(p) || p.impressions < MEASUREMENT_POLICY.organicMinimumImpressions
      || p.platform !== c.platform || p.accountId !== c.accountId
      || p.durationMilliseconds !== c.durationMilliseconds || p.observationSeconds !== c.observationSeconds
      || instant(p.publishedAt) < start || instant(p.publishedAt) >= end || instant(p.observedAt) > end
      || ids.has(p.postId) || p.postId === c.postId) {
      reasons.push('baseline_posts_not_distinct_organic_and_comparable'); return empty();
    }
    ids.add(p.postId); publishedTimes.push(instant(p.publishedAt));
  }
  if (Math.max(...publishedTimes) - Math.min(...publishedTimes) < 7 * DAY) {
    reasons.push('baseline_does_not_span_seven_publication_days'); return empty();
  }
  const impressions = b.posts.reduce((sum, p) => sum + p.impressions, 0);
  const saves = b.posts.reduce((sum, p) => sum + p.saves, 0);
  if (!Number.isSafeInteger(impressions) || !Number.isSafeInteger(saves)) {
    reasons.push('baseline_aggregate_out_of_range'); return empty();
  }
  const candidateRate = c.saves / c.impressions * 1000, baselineRate = saves / impressions * 1000;
  return {
    status: 'descriptive_comparison', reasons: ['organic_results_do_not_prove_paid_conversion', 'qualified_review_required'],
    candidateSaveRatePer1000: candidateRate, baselineSaveRatePer1000: baselineRate,
    relativeLift: baselineRate > 0 ? candidateRate / baselineRate - 1 : null,
    recommendation: 'review_creative_with_product_activation_evidence', mayPromote: false,
  };
}
