/** Private administration contract. Snapshots omit source text and messages;
 * selected support receipts can be opened explicitly by verified staff. */
export type AdminRole = 'owner' | 'operator';
export type AdminWindow = 7 | 30 | 90;
export type AdminSupportStatus = 'received' | 'in_review' | 'resolved';
export interface AdminGuestSupport {id:string;category:'help'|'privacy'|'bug';status:AdminSupportStatus;version:number;createdAt:string;updatedAt:string;expiresAt:string;hasReply:boolean}
export interface AdminGuestSupportDetail extends Omit<AdminGuestSupport,'hasReply'> {message:string;reply:string}
export interface AdminConfig {
  version: number;
  schedulerEnabled: boolean;
  monthlyCapUsd: number;
  routerEnabled: boolean;
  defaultModel: 'openai/gpt-6.1-sol' | 'anthropic/claude-sonnet-5.5';
  reasoning: 'medium';
  updatedAt: string;
}
export type AdminConfigInput = Omit<AdminConfig, 'version' | 'updatedAt'>;
export interface AdminMetric {
  key: string; label: string; count: number | null; denominator: number | null;
  percent: number | null; source: string; definition: string;
  availability: 'measured' | 'untracked' | 'disabled'; smallSample: boolean;
}
export interface AdminUser {
  id: string; emailDisplay: string; joinedAt: string;
  hasProfile: boolean; claims: number; shareableClaims: number;
  completedRuns: number; failedRuns: number; pilotActive: boolean;
}
export interface AdminSupport {
  id: string; userId: string; emailDisplay: string;
  category: 'help' | 'privacy' | 'bug'; status: AdminSupportStatus;
  createdAt: string; version: number;
  /** Receipt metadata only; candidates may paste private CV facts into messages. */
  messageAvailable: boolean;
}
export interface AdminRun {
  id: string; userId: string; status: string; phase: number;
  provider: string; model: string; createdAt: string; finishedAt: string | null;
}
export interface AdminProviderStatus {
  configured: boolean; valid: boolean | null;
  status: 'not_configured' | 'valid' | 'invalid' | 'unavailable';
  checkedAt: string; message: string;
}
export interface AdminBudget {
  month: string; capUsd: number; committedUsd: number; remainingUsd: number;
  actualUsd: number; reservedUsd: number; uncertainUsd: number;
  candidateActualUsd: number; adminActualUsd: number; reviewBatchCapUsd: 5;
  source: 'job_loop_budget_months + job_loop_usage + jobvance_admin_model_usage';
}
export interface AdminSnapshot {
  actor: { id: string; role: AdminRole };
  generatedAt: string;
  window: { days: AdminWindow; start: string; end: string; timezone: 'UTC' };
  coverage: { excludedQaUsers: number; usersTotal: number; usersListed: number; listLimit: number; notes: string[] };
  config: AdminConfig;
  operations: {
    users: AdminUser[]; support: AdminSupport[]; recentRuns: AdminRun[];
    scheduler: { enabled: boolean; ready: boolean; lastDispatchAt: string | null; activeSchedules: number; dueSchedules: number; staleLeases: number; message: string };
    pilot: { activeUsers: number; capacity: 10; qaOccupancy: number };
  };
  analytics: { milestones: AdminMetric[]; funnel: AdminMetric[]; retention: AdminMetric[]; revenue: { checkoutEnabled: false; recognizedUsd: null; message: string }; budget: AdminBudget };
  audit: { id: string; actorId: string; action: string; targetId: string | null; at: string; details: Record<string, string | number | boolean | null> }[];
  providerStatus: AdminProviderStatus | null;
}
/** The /admin dashboard. Test fixtures and admin staff are excluded server-side; emails are masked;
 * no CV text, messages or card details are returned. Validated in the browser by admin-dashboard.ts. */
type Kind = 'count' | 'usd' | 'percent';
export interface AdminDashboard {
  actor: { id: string; role: AdminRole };
  generatedAt: string;
  window: { days: AdminWindow; start: string; end: string };
  coverage: { realUsers: number; excludedTest: number; excludedStaff: number; notes: string[] };
  today: { key: string; label: string; today: number; yesterday: number; kind: Exclude<Kind, 'percent'> }[];
  kpis: { key: string; label: string; current: number; previous: number | null; kind: Kind; help: string }[];
  daily: { day: string; signups: number; cvChecks: number; runs: number; paidOrders: number; revenueUsd: number }[];
  funnel: { label: string; count: number; hint: string }[];
  cohorts: { week: string; size: number; weeks: (number | null)[] }[];
  revenue: {
    allTimeUsd: number; allTimeOrders: number; payingCustomers: number; unknownUsdPayments: number;
    subscriptions: { active: number; cancelling: number; pastDue: number; ended: number };
    places: { paidUsed: number; paidCapacity: number; pilotUsed: number; pilotCapacity: number };
    byPlan: { label: string; usd: number; orders: number }[];
    byCurrency: { currency: string; amountMinor: number; orders: number }[];
    recent: { at: string; userId: string | null; emailDisplay: string; plan: string; amountMinor: number; currency: string; usd: number | null; status: string }[];
    attention: { key: string; label: string; count: number; help: string }[];
  };
  users: { id: string; emailDisplay: string; joinedAt: string; lastSignInAt: string | null; lastActiveAt: string | null; plan: string | null; paidUsd: number; hasPaid: boolean; cvChecks: number; runs: number; failedRuns: number; hasProfile: boolean; pilot: boolean }[];
  ops: {
    schedulerEnabled: boolean; lastDispatchAt: string | null;
    checks: { key: string; label: string; count: number; danger: boolean; help: string }[];
    problems: { kind: string; at: string; userId: string | null; emailDisplay: string; detail: string }[];
    budget: { month: string; capUsd: number; committedUsd: number; actualUsd: number };
  };
  support: { id: string; userId: string; emailDisplay: string; category: 'help' | 'privacy' | 'bug'; status: AdminSupportStatus; createdAt: string; version: number }[];
}
export type AdminAction =
  | { action: 'guest_support_list' }
  | { action: 'guest_support_detail'; id:string }
  | { action: 'guest_support_update'; id:string; expectedVersion:number; status:AdminSupportStatus; reply:string }
  | { action: 'snapshot'; days: AdminWindow }
  | { action: 'dashboard'; days: AdminWindow }
  | { action: 'update_config'; expectedVersion: number; config: AdminConfigInput }
  | { action: 'update_support'; id: string; expectedVersion: number; status: AdminSupportStatus }
  | { action: 'support_detail'; id: string }
  | { action: 'provider_status' };
export interface AdminResponse { snapshot?: AdminSnapshot; dashboard?: AdminDashboard; providerStatus?: AdminProviderStatus; config?: AdminConfig; support?: { id: string; status: AdminSupportStatus; version: number }; supportDetail?: { id: string; message: string }; guestSupport?:AdminGuestSupport[]; guestSupportDetail?:AdminGuestSupportDetail }
