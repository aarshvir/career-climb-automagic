// Shared by the /marketing-admin page and the jobvance-marketing edge function.
// Money is always integer minor units (paise for INR) to avoid float drift.
// This release only reads from Meta: nothing here can pause, resume or launch an ad.

export type MarketingRole = 'owner' | 'operator';
export type IdeaStatus = 'idea' | 'in_production' | 'ready' | 'launched' | 'retired';
export type LaunchStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED' | 'UNKNOWN';
/** fresh: the last sync read complete figures; stale: only older complete figures; unknown: never read completely. */
export type MetricsState = 'fresh' | 'stale' | 'unknown';
export type MetricsIssue = 'invalid' | 'incomplete' | 'currency_mismatch' | 'account_mismatch' | 'meta_error';

export interface MarketingIdea { id: string; slug: string; title: string; angle: string; status: IdeaStatus; sourcePath: string | null; createdAt: string; updatedAt: string }
export interface MarketingCreative { id: string; ideaId: string; label: string; kind: 'video' | 'copy'; format: string | null; fileName: string | null; sha256: string | null; approved: boolean; approvedAt: string | null; notes: string }
export interface MarketingDay { day: string; impressions: number; reach: number; clicks: number; linkClicks: number; landingPageViews: number; spendMinor: number }
export interface MarketingTotals { impressions: number; reach: number; linkClicks: number; landingPageViews: number; spendMinor: number; ctrPct: number | null; costPerLpvMinor: number | null; frequency: number | null; days: number; lastDay: string | null }
export interface MarketingLaunch {
  id: string; ideaId: string; name: string; platform: 'meta'; metaCampaignId: string; metaAdsetId: string; metaAdId: string;
  status: LaunchStatus; effectiveStatus: string | null; dailyBudgetMinor: number | null; currency: string; endAt: string | null;
  lastSyncedAt: string | null; metrics: MetricsState; metricsIssue: MetricsIssue | null;
  /** null while the figures are unknown, so they are never shown as zero. */
  totals: MarketingTotals | null; daily: MarketingDay[];
}
export interface MarketingRequest { id: string; ideaId: string; kind: 'create_ad'; status: 'queued' | 'in_progress' | 'done' | 'cancelled'; note: string; createdAt: string }
export interface MarketingSettingsInput { maxDailySpendMinor: number; maxTotalSpendMinor: number; minImpressions: number; pauseCtrBelowPct: number; costPerLpvRatio: number }
export interface MarketingSettings extends MarketingSettingsInput { version: number; lastSyncAt: string | null; updatedAt: string }
export type RecommendationKind = 'wait' | 'pause' | 'budget_review' | 'refresh_creative' | 'spend_cap' | 'check_delivery' | 'ended' | 'figures_unknown';
/** Advice for the owner to act on in Meta Ads Manager. Nothing applies it automatically. */
export interface MarketingRecommendation { id: string; launchId: string | null; kind: RecommendationKind; severity: 'info' | 'warning' | 'action'; title: string; reason: string }
export interface MarketingAudit { id: string; actorId: string | null; action: string; targetId: string | null; at: string; details: Record<string, string | number | boolean | null> }
export interface MarketingOverview {
  actor: { id: string; role: MarketingRole }; generatedAt: string;
  meta: { configured: boolean; adAccountId: string | null; message: string };
  settings: MarketingSettings; ideas: MarketingIdea[]; creatives: MarketingCreative[]; launches: MarketingLaunch[];
  requests: MarketingRequest[]; recommendations: MarketingRecommendation[];
  /** Sums of known figures only; incompleteLaunches > 0 means the true totals may be higher. */
  totals: { spendMinor: number; todaySpendMinor: number; impressions: number; landingPageViews: number; activeLaunches: number; incompleteLaunches: number; currency: string };
  audit: MarketingAudit[];
}

export type MarketingAction =
  | { action: 'overview' }
  | { action: 'sync' }
  | { action: 'request_creation'; ideaId: string; note: string }
  | { action: 'create_idea'; title: string; angle: string }
  | { action: 'update_settings'; expectedVersion: number; settings: MarketingSettingsInput };

export interface MarketingResult { changed: number; message: string }
export interface MarketingResponse { overview: MarketingOverview; result?: MarketingResult }
