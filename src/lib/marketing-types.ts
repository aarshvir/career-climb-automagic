// Shared by the /marketing-admin page and the jobvance-marketing edge function.
// Money is always integer minor units (paise for INR) to avoid float drift.

export type MarketingRole = 'owner' | 'operator';
export type IdeaStatus = 'idea' | 'in_production' | 'ready' | 'launched' | 'retired';
export type LaunchStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED' | 'UNKNOWN';
export type PauseReason = 'owner' | 'daily_cap' | 'total_cap' | 'low_ctr' | 'high_cost';

export interface MarketingIdea { id: string; slug: string; title: string; angle: string; status: IdeaStatus; sourcePath: string | null; createdAt: string; updatedAt: string }
export interface MarketingCreative { id: string; ideaId: string; label: string; kind: 'video' | 'copy'; format: string | null; fileName: string | null; sha256: string | null; approved: boolean; approvedAt: string | null; notes: string }
export interface MarketingDay { day: string; impressions: number; reach: number; clicks: number; linkClicks: number; landingPageViews: number; spendMinor: number }
export interface MarketingTotals { impressions: number; reach: number; linkClicks: number; landingPageViews: number; spendMinor: number; ctrPct: number | null; costPerLpvMinor: number | null; frequency: number | null; days: number; lastDay: string | null }
export interface MarketingLaunch {
  id: string; ideaId: string; name: string; platform: 'meta'; metaCampaignId: string; metaAdsetId: string; metaAdId: string;
  status: LaunchStatus; effectiveStatus: string | null; dailyBudgetMinor: number | null; currency: string; endAt: string | null;
  pausedBy: 'owner' | 'auto' | null; pausedReason: PauseReason | null; lastSyncedAt: string | null; totals: MarketingTotals; daily: MarketingDay[];
}
export interface MarketingRequest { id: string; ideaId: string; kind: 'create_ad'; status: 'queued' | 'in_progress' | 'done' | 'cancelled'; note: string; createdAt: string }
export interface MarketingSettingsInput { autoMode: boolean; maxDailySpendMinor: number; maxTotalSpendMinor: number; minImpressions: number; pauseCtrBelowPct: number; costPerLpvRatio: number }
export interface MarketingSettings extends MarketingSettingsInput { version: number; lastSyncAt: string | null; lastAutoRunAt: string | null; updatedAt: string }
export type RecommendationKind = 'wait' | 'pause' | 'resume' | 'budget_review' | 'refresh_creative' | 'spend_cap' | 'check_delivery' | 'ended';
export interface MarketingRecommendation { id: string; launchId: string | null; kind: RecommendationKind; severity: 'info' | 'warning' | 'action'; title: string; reason: string; autoEligible: boolean; pauseReason?: PauseReason }
export interface MarketingAudit { id: string; actorId: string | null; action: string; targetId: string | null; at: string; details: Record<string, string | number | boolean | null> }
export interface MarketingOverview {
  actor: { id: string; role: MarketingRole }; generatedAt: string;
  meta: { configured: boolean; adAccountId: string | null; message: string };
  settings: MarketingSettings; ideas: MarketingIdea[]; creatives: MarketingCreative[]; launches: MarketingLaunch[];
  requests: MarketingRequest[]; recommendations: MarketingRecommendation[];
  totals: { spendMinor: number; todaySpendMinor: number; impressions: number; landingPageViews: number; activeLaunches: number; currency: string };
  audit: MarketingAudit[];
}

export type MarketingAction =
  | { action: 'overview' }
  | { action: 'sync' }
  | { action: 'set_status'; launchId: string; status: 'ACTIVE' | 'PAUSED' }
  | { action: 'request_creation'; ideaId: string; note: string }
  | { action: 'create_idea'; title: string; angle: string }
  | { action: 'update_settings'; expectedVersion: number; settings: MarketingSettingsInput }
  | { action: 'run_auto' };

export interface MarketingResult { changed: number; message: string }
export interface MarketingResponse { overview: MarketingOverview; result?: MarketingResult }
