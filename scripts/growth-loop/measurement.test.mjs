import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_SCOPE, APPROVED_LIMITS, decideGrowthAction, compareOrganic } from './measurement.mjs';

const now = '2026-10-18T13:00:00Z';
const proof = { verified: true, source: 'isolated test evidence', evidenceId: 'synthetic-receipt' };
function fixture() {
  const context = { ...proof, observedAt: now, scope: { ...APPROVED_SCOPE }, currency: 'INR', currencyVerified: true, timezone: 'Asia/Kolkata', timezoneVerified: true };
  return {
    now,
    health: { ...proof, observedAt: now, url: 'https://jobvance.io/onboarding?utm_source=instagram', available: true, offerAccurate: true },
    delivery: { ...context, status: 'PAUSED', dailyBudgetMinor: 40000, campaignCapMinor: 500000, end: APPROVED_LIMITS.end, permissionVerified: true, permissionError: null },
    metrics: {
      ...context,
      daily: { aggregation: 'adset', start: '2026-10-17T18:30:00Z', end: now, complete: true, spendMinor: 1000 },
      lifetime: { aggregation: 'campaign', start: APPROVED_LIMITS.start, end: now, complete: true, spendMinor: 2000 },
      sevenDay: { aggregation: 'ad', start: '2026-10-11T13:00:00Z', end: now, complete: true, spendMinor: 2000, impressions: 2000, reach: 1000, landingViews: 200,
        outcomes: { accountsCreated: 30, searchesSaved: 20, reviewedDownloads: 10, secondApplications: 4, verifiedPurchases: 0, verifiedNetRevenueMinor: 0 } },
      attribution: { ...proof, deduplicationVerified: true },
    },
    // Synthetic quote tests arithmetic; this is not a statement of a real FX rate.
    fx: { ...proof, observedAt: now, base: 'USD', quote: 'INR', inrPerUsd: 100 },
  };
}

test('healthy exact-scope evidence produces review, never activate or promote', () => {
  const result = decideGrowthAction(fixture());
  assert.equal(result.action, 'review');
  assert.deepEqual(result.target, APPROVED_SCOPE);
  assert.deepEqual(result.pauseReasons, []);
  assert.equal(result.evidence.sampleAssessment, 'eligible_for_qualified_review');
  assert.equal(result.evidence.sevenDayFrequency, 2);
  assert.equal(result.evidence.costPerReviewedDownloadMinor, 200);
  assert.equal(result.evidence.revenueToSpendRatio, 0);
  assert.equal(result.execution, 'recommendation_only');
  assert.ok(result.prohibitedActions.includes('increase_budget'));
  assert.ok(result.prohibitedActions.includes('activate'));
});

for (const [name, mutate, reason] of [
  ['unavailable landing', f => { f.health.available = false; }, 'landing_page_unavailable'],
  ['misleading offer', f => { f.health.offerAccurate = false; }, 'offer_misleading'],
  ['daily configured budget exceeded', f => { f.delivery.dailyBudgetMinor++; }, 'daily_budget_above_approved_cap'],
  ['campaign configured cap exceeded', f => { f.delivery.campaignCapMinor++; }, 'campaign_spend_cap_absent_or_exceeded'],
  ['zero platform cap means unbounded', f => { f.delivery.campaignCapMinor = 0; }, 'campaign_spend_cap_absent_or_exceeded'],
  ['unauthorized extended end', f => { f.delivery.end = '2026-10-25T13:00:00Z'; }, 'campaign_end_extended_beyond_approval'],
  ['permission failure', f => { f.delivery.permissionError = '1815199'; }, 'advertising_permission_failure'],
  ['disapproved creative', f => { f.delivery.status = 'DISAPPROVED'; }, 'ad_disapproved'],
  ['daily spend exactly at cap', f => { f.metrics.daily.spendMinor = 40000; }, 'daily_spend_cap_reached'],
  ['lifetime spend over cap', f => { f.metrics.lifetime.spendMinor = 500001; }, 'lifetime_spend_cap_reached'],
  ['USD daily ceiling despite INR below cap', f => { f.fx.inrPerUsd = 10; f.metrics.daily.spendMinor = 10000; }, 'daily_usd_ceiling_reached'],
  ['USD lifetime ceiling despite INR below cap', f => { f.fx.inrPerUsd = 10; f.metrics.lifetime.spendMinor = 70000; }, 'lifetime_usd_ceiling_reached'],
  ['USD configuration limit', f => { f.fx.inrPerUsd = 70; }, 'configured_inr_budget_exceeds_usd_authority'],
]) {
  test(`pauses only approved target for ${name}`, () => {
    const f = fixture(); mutate(f);
    const r = decideGrowthAction(f);
    assert.equal(r.action, 'pause'); assert.ok(r.pauseReasons.includes(reason));
    assert.deepEqual(r.target, APPROVED_SCOPE);
  });
}

test('deadline is hard even without metrics and cannot be extended by input', () => {
  const r = decideGrowthAction({ now: APPROVED_LIMITS.end, limits: { end: '2030-01-01T00:00:00Z' } });
  assert.equal(r.action, 'pause'); assert.ok(r.pauseReasons.includes('approved_test_expired'));
});

test('one millisecond before deadline is not expired', () => {
  const r = decideGrowthAction({ now: '2026-10-24T12:59:59.999Z' });
  assert.equal(r.action, 'review');
});

test('before approval window remains review, not permission to start', () => {
  const r = decideGrowthAction({ now: '2026-10-17T12:59:59Z' });
  assert.ok(r.reviewReasons.includes('approved_test_not_started'));
  assert.ok(r.prohibitedActions.includes('activate'));
});

test('missing metrics remain null, including conversions and revenue', () => {
  const r = decideGrowthAction({ now });
  for (const key of ['dailySpendMinor', 'lifetimeSpendMinor', 'reviewedDownloads', 'verifiedPurchases', 'verifiedNetRevenueMinor', 'costPerReviewedDownloadMinor', 'revenueToSpendRatio']) assert.equal(r.evidence[key], null);
  assert.equal(r.evidence.sampleAssessment, 'inconclusive');
});

for (const key of Object.keys(APPROVED_SCOPE)) {
  test(`wrong ${key} cannot attribute another campaign's spend or issue a measurement-based pause`, () => {
    const f = fixture();
    f.metrics.scope[key] = 'unrelated'; f.delivery.scope[key] = 'unrelated';
    f.metrics.daily.spendMinor = 999999; f.delivery.dailyBudgetMinor = 999999;
    const r = decideGrowthAction(f);
    assert.equal(r.action, 'review'); assert.equal(r.evidence.dailySpendMinor, null);
    assert.deepEqual(r.target, APPROVED_SCOPE);
  });
}

for (const [name, mutate] of [
  ['stale', v => { v.observedAt = '2026-10-17T00:00:00Z'; }],
  ['future', v => { v.observedAt = '2026-10-19T00:00:00Z'; }],
  ['wrong currency', v => { v.currency = 'USD'; }],
  ['unverified currency', v => { v.currencyVerified = false; }],
  ['unverified timezone', v => { v.timezoneVerified = false; }],
  ['invalid timezone', v => { v.timezone = 'not/a/timezone'; }],
  ['missing provenance', v => { delete v.evidenceId; }],
  ['unverified evidence', v => { v.verified = false; }],
]) {
  test(`${name} metrics excluded rather than coerced to zero`, () => {
    const f = fixture(); mutate(f.metrics);
    const r = decideGrowthAction(f); assert.equal(r.evidence.dailySpendMinor, null);
    assert.equal(r.evidence.reviewedDownloads, null); assert.equal(r.action, 'review');
  });
}

test('daily period respects verified account timezone, not UTC midnight', () => {
  const f = fixture(); f.metrics.daily.start = '2026-10-18T00:00:00Z';
  assert.equal(decideGrowthAction(f).evidence.dailySpendMinor, null);
  f.metrics.timezone = 'UTC';
  assert.equal(decideGrowthAction(f).evidence.dailySpendMinor, 1000);
});

test('recent previous-day totals cannot stand in for the current account day', () => {
  const f = fixture(); f.now = '2026-10-18T18:31:00Z';
  const r = decideGrowthAction(f);
  assert.equal(r.evidence.dailySpendMinor, null);
  assert.ok(r.reviewReasons.includes('daily_spend_missing_or_wrong_period'));
});

test('lifetime spend must begin at this test start, not account lifetime', () => {
  const f = fixture(); f.metrics.lifetime.start = '2020-01-01T00:00:00Z';
  f.metrics.lifetime.spendMinor = 999999;
  const r = decideGrowthAction(f); assert.equal(r.evidence.lifetimeSpendMinor, null); assert.equal(r.action, 'review');
});

test('single-ad spend does not establish adset or campaign budget usage', () => {
  const f = fixture(); f.metrics.daily.aggregation = 'ad'; f.metrics.lifetime.aggregation = 'ad';
  const r = decideGrowthAction(f);
  assert.equal(r.evidence.dailySpendMinor, null); assert.equal(r.evidence.lifetimeSpendMinor, null);
  assert.equal(r.evidence.sevenDayFrequency, 2);
});

test('lifetime frequency cannot be described as seven-day fatigue', () => {
  const f = fixture(); f.metrics.sevenDay.start = '2020-01-01T00:00:00Z';
  const r = decideGrowthAction(f);
  assert.equal(r.evidence.sevenDayFrequency, null); assert.equal(r.evidence.performancePeriod, null);
  assert.equal(r.evidence.reviewedDownloads, null);
});

test('generic leads are never approved downloads or qualified acquisition', () => {
  const f = fixture(); delete f.metrics.sevenDay.outcomes.reviewedDownloads;
  f.metrics.sevenDay.outcomes.leads = 500;
  const r = decideGrowthAction(f);
  assert.equal(r.evidence.reviewedDownloads, null); assert.equal(r.evidence.costPerReviewedDownloadMinor, null);
  assert.equal(r.evidence.sampleAssessment, 'inconclusive');
  assert.ok(r.reviewReasons.includes('generic_leads_excluded_from_qualified_outcomes'));
});

test('conversion attribution and deduplication must both be verified', () => {
  const f = fixture(); f.metrics.attribution.deduplicationVerified = false;
  const r = decideGrowthAction(f); assert.equal(r.evidence.reviewedDownloads, null);
});

test('small conversion sample never kills or scales a creative', () => {
  const f = fixture(); f.metrics.sevenDay.outcomes.reviewedDownloads = 9;
  const r = decideGrowthAction(f); assert.equal(r.action, 'review');
  assert.equal(r.evidence.sampleAssessment, 'inconclusive'); assert.equal(r.evidence.costPerReviewedDownloadMinor, null);
});

test('small landing sample stays inconclusive even with ten download events', () => {
  const f = fixture(); f.metrics.sevenDay.landingViews = 99;
  assert.equal(decideGrowthAction(f).evidence.sampleAssessment, 'inconclusive');
});

test('no guessed exchange rate when FX is absent, stale or reversed', () => {
  for (const change of [f => { delete f.fx; }, f => { f.fx.observedAt = '2026-10-16T13:00:00Z'; }, f => { f.fx.base = 'INR'; f.fx.quote = 'USD'; }, f => { f.fx.inrPerUsd = 0; }]) {
    const f = fixture(); change(f); const r = decideGrowthAction(f);
    assert.equal(r.evidence.dailySpendUsdMinor, null);
    assert.ok(r.reviewReasons.includes('usd_ceiling_requires_fresh_verified_fx'));
  }
});

test('unrelated health URL and stale outage cannot cause a pause', () => {
  for (const mutate of [h => { h.url = 'https://unrelated.example/onboarding'; }, h => { h.url = 'https://jobvance.io.evil.example/onboarding'; }, h => { h.observedAt = '2026-10-17T13:00:00Z'; }]) {
    const f = fixture(); f.health.available = false; mutate(f.health);
    assert.equal(decideGrowthAction(f).action, 'review');
  }
});

test('malformed numbers, partial periods and string counts are unavailable', () => {
  for (const spend of [undefined, null, '40000', NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture(); f.metrics.daily.spendMinor = spend;
    assert.equal(decideGrowthAction(f).evidence.dailySpendMinor, null);
  }
  const f = fixture(); f.metrics.daily.complete = false;
  assert.equal(decideGrowthAction(f).evidence.dailySpendMinor, null);
});

test('inputs are unchanged and decisions repeat exactly', () => {
  const f = fixture(), saved = structuredClone(f);
  assert.deepEqual(decideGrowthAction(f), decideGrowthAction(f)); assert.deepEqual(f, saved);
});

test('caller must provide a clock', () => {
  assert.throws(() => decideGrowthAction({}), /now must/);
  assert.throws(() => decideGrowthAction({ now: '2026-10-18' }), /now must/);
  assert.throws(() => decideGrowthAction({ now: '2026-02-30T00:00:00Z' }), /now must/);
  assert.throws(() => decideGrowthAction({ now: '2026-10-18T24:00:00Z' }), /now must/);
});

function organicFixture() {
  const common = { ...proof, assetSha256: 'a'.repeat(64), platform: 'instagram', accountId: '17841415488116661', paid: false, durationMilliseconds: 30000, observationSeconds: 172800, impressions: 2000, saves: 10 };
  return {
    now: '2026-10-17T13:00:00Z',
    candidate: { ...common, postId: 'candidate', publishedAt: '2026-10-15T13:00:00Z', observedAt: '2026-10-17T13:00:00Z', saves: 20 },
    baseline: {
      start: '2026-10-01T13:00:00Z', end: '2026-10-15T13:00:00Z',
      posts: [1, 3, 5, 8, 11].map((day, i) => ({ ...common, postId: `baseline-${i}`, publishedAt: `2026-10-${String(day).padStart(2, '0')}T13:00:00Z`, observedAt: `2026-10-${String(day + 2).padStart(2, '0')}T13:00:00Z` })),
    },
  };
}

test('organic comparison uses exact 14-day baseline and normalized outcomes but never promotes', () => {
  const r = compareOrganic(organicFixture());
  assert.equal(r.status, 'descriptive_comparison');
  assert.equal(r.candidateSaveRatePer1000, 10); assert.equal(r.baselineSaveRatePer1000, 5);
  assert.equal(r.relativeLift, 1); assert.equal(r.mayPromote, false);
});

for (const [name, mutate] of [
  ['150 views', f => { f.candidate.impressions = 150; }],
  ['only four comparison posts', f => { f.baseline.posts.pop(); }],
  ['different video duration', f => { f.baseline.posts[0].durationMilliseconds = 29999; }],
  ['different observation duration', f => { f.baseline.posts[0].observationSeconds = 172801; }],
  ['wrong fourteen-day period', f => { f.baseline.start = '2026-10-02T13:00:00Z'; }],
  ['baseline after candidate publication', f => { f.baseline.end = '2026-10-16T13:00:00Z'; }],
  ['duplicate post receipt', f => { f.baseline.posts[1].postId = f.baseline.posts[0].postId; }],
  ['candidate in baseline', f => { f.baseline.posts[0].postId = f.candidate.postId; }],
  ['paid post in organic baseline', f => { f.baseline.posts[0].paid = true; }],
  ['different account', f => { f.baseline.posts[0].accountId = 'unrelated'; }],
  ['different platform', f => { f.baseline.posts[0].platform = 'facebook'; }],
  ['missing provenance', f => { delete f.candidate.evidenceId; }],
  ['stale observation', f => { f.now = '2026-10-19T13:00:01Z'; }],
  ['missing saves', f => { delete f.candidate.saves; }],
  ['impossible save count', f => { f.candidate.saves = 2001; }],
  ['malformed asset hash', f => { f.candidate.assetSha256 = 'unknown'; }],
  ['baseline sample small', f => { f.baseline.posts[2].impressions = 999; }],
]) {
  test(`organic comparison inconclusive for ${name}`, () => {
    const f = organicFixture(); mutate(f); const r = compareOrganic(f);
    assert.equal(r.status, 'inconclusive'); assert.equal(r.mayPromote, false);
    assert.equal(r.relativeLift, null);
  });
}

test('zero baseline saves never invent infinite uplift', () => {
  const f = organicFixture(); f.baseline.posts.forEach(p => { p.saves = 0; });
  const r = compareOrganic(f); assert.equal(r.relativeLift, null); assert.equal(r.baselineSaveRatePer1000, 0);
});
