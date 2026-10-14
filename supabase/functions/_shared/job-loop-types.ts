/** Shared, platform-independent cloud-loop contract. No provider keys or runtime globals. */
export type LoopAudience = 'student' | 'mba' | 'professional';
export type LoopProviderId = 'anthropic' | 'openai' | 'moonshot';
export type LoopClaimKind = 'employment' | 'internship' | 'academic_project' | 'personal_project' | 'volunteering' | 'education' | 'skill';
export type LoopResultStatus = 'measured' | 'projected' | 'not_measured';
export type LoopApplicationStatus = 'saved' | 'prepared' | 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

export interface LoopProfileInput {
  audience: LoopAudience;
  name: string;
  contactLine: string;
  targetTitles: string[];
  locations: string[];
  experienceYears: number | null;
  languages: string[];
  pageTarget: 1 | 2;
  discreetSearch: boolean;
  sourceText: string;
  excludedTerms: string[];
  compensation: { currency: string; period: 'monthly' | 'annual' | 'hourly'; minimum: number | null };
}
export interface LoopProfile extends LoopProfileInput { revision: number; updatedAt: string }
export interface LoopClaimInput {
  sourceKind: 'cv_passage' | 'user_answer';
  sourceQuote: string;
  phrasing: string;
  context: string;
  kind: LoopClaimKind;
  resultStatus: LoopResultStatus;
  confirmed: boolean;
  shareable: boolean;
}
export interface LoopClaim extends LoopClaimInput {
  id: string; revision: number; status: 'active' | 'withdrawn'; createdAt: string;
}
export interface LoopContact {
  name: string; title: string; email: string; sourceUrl: string; sourceQuote: string;
  confirmedByUser: boolean; inExistingThread: boolean;
}
export interface LoopOpportunityInput {
  title: string; company: string; location: string; url: string; description: string;
  contact: LoopContact | null;
}
export interface LoopOpportunity extends LoopOpportunityInput {
  id: string; source: 'manual' | 'employer_api' | 'web_search'; sourceKey: string;
  checkedAt: string; verification: 'user_provided' | 'listed_on_source' | 'unverified' | 'closed_confirmed';
  status: LoopApplicationStatus; followUpAt: string | null; notes: string;
}
export type LoopLaneStatus = 'completed' | 'partial' | 'blocked' | 'not_connected' | 'not_run';
export interface LoopLane {
  name: string; status: LoopLaneStatus; count: number; checkedAt: string; message: string;
}
export interface LoopAssessment {
  score: number; method: string; components: { role: number; evidence: number; constraints: number };
  gaps: string[]; flags: string[]; claimIds: string[];
}
export interface LoopPacket {
  id: string; runId: string; opportunityId: string; title: string; company: string;
  inputHash: string; profileRevision: number; claimVersions: Record<string, number>;
  cvText: string; evidenceText: string; coverLetterText: string;
  connectionNote: string; messageText: string; emailSubject: string; emailBody: string;
  contact: LoopContact | null; assessment: LoopAssessment;
  status: 'review_required' | 'approved' | 'held' | 'revoked';
  holdReasons: string[]; pageCount: number | null; createdAt: string; approvedAt: string | null;
  model: { provider: LoopProviderId | 'rules'; model: string; method: string };
  artifacts: Record<string, { path: string; sha256: string; byteSize: number }>;
  formatStatus?: Partial<Record<'pdf' | 'docx' | 'txt', { ready: boolean; reason?: string; pageCount?: number | null }>>;
  interviewBrief?: { title: string; prompt: string; evidenceClaimIds: string[]; sourceQuote: string }[];
}
export interface LoopScheduleInput {
  cadence: 'daily' | 'weekdays' | 'weekly'; timezone: string; localTime: string; weeklyDay: number | null;
  provider: LoopProviderId | 'rules'; model: string; modelConsent: boolean; inboxConsent: boolean;
}
export interface LoopSchedule extends LoopScheduleInput {
  version: number; status: 'active' | 'paused' | 'cancelled'; nextRunAt: string | null;
  lastRunId: string | null; lastAttemptAt: string | null; message: string;
}
export interface LoopActivity { id: string; kind: string; actor: 'candidate' | 'jobvance'; at: string; summary: string; opportunityId: string | null; runId: string | null }
export interface LoopInboxSignal {
  id: string; bucket: 'action_needed' | 'progress' | 'rejected' | 'noise';
  subject: string; from: string; receivedAt: string; summary: string; draftReply: string;
  threadId: string; opportunityId: string | null; roleUnconfirmed: boolean;
}
export interface LoopRun {
  id: string; requestId: string; status: 'queued' | 'running' | 'completed' | 'partial' | 'blocked' | 'cancelled' | 'failed';
  phase: string; startedAt: string; finishedAt: string | null; inputHash: string;
  provider: LoopProviderId | 'rules'; model: string; lanes: LoopLane[];
  opportunityIds: string[]; packetIds: string[]; messages: string[]; nextAction: string;
  reservedUsd: number; usageUsd: number;
}
export interface LoopModelOption {
  transport?: 'openrouter' | 'direct';
  provider: LoopProviderId; model: string; label: string; ready: boolean;
  inputUsdPerMillion: number; outputUsdPerMillion: number;
}
export interface LoopSnapshot {
  lifecycleGeneration?: number;
  recordVersion: number; profile: LoopProfile | null; claims: LoopClaim[];
  opportunities: LoopOpportunity[]; runs: LoopRun[]; packets: LoopPacket[]; inbox: LoopInboxSignal[];
  models: LoopModelOption[];
  capabilities: { cloudWorker: boolean; rulesEngine: boolean; webSearch: boolean; gmailRead: boolean; gmailDrafts: boolean; monthlyUsageCapUsd: number; dailyRunLimit: number; scheduler?: boolean; packetsPerRun?: number };
  gmail: { connected: boolean; email: string | null; allowDrafts: boolean; status: string };
  schedule?: LoopSchedule | null;
  budget?: { month: string; capUsd: number; committedUsd: number; remainingUsd: number; scope: 'shared_ai_search'; maxPilotUsers: number };
  pilot?: { enrolled: boolean; activeUsers: number; maxUsers: number };
  activity?: LoopActivity[];
  recurringReady?: boolean;
  employerSources?: { provider: string; company: string; board: string }[];
  support?: { id: string; category: 'help'|'privacy'|'bug'; message: string; status: 'received'|'in_review'|'resolved'; createdAt: string }[];
}
export type LoopAction = (
  | { action: 'get' }
  | { action: 'save_profile'; expectedVersion: number; profile: LoopProfileInput; saveConsent: boolean }
  | { action: 'suggest_claims' }
  | { action: 'save_claim'; expectedVersion: number; id?: string; claim: LoopClaimInput }
  | { action: 'withdraw_claim'; expectedVersion: number; id: string }
  | { action: 'add_opportunity'; expectedVersion: number; opportunity: LoopOpportunityInput }
  | { action: 'update_opportunity'; expectedVersion: number; id: string; status: LoopApplicationStatus; followUpAt: string | null; notes: string }
  | { action: 'start_run'; requestId: string; provider: LoopProviderId | 'rules'; model: string; modelConsent: boolean; inboxConsent: boolean; processingRoute?: 'direct' | 'openrouter' }
  | { action: 'resume_run'; runId: string }
  | { action: 'cancel_run'; runId: string }
  | { action: 'save_schedule'; expectedScheduleVersion: number; schedule: LoopScheduleInput; recurringConsent: boolean }
  | { action: 'pause_schedule' | 'cancel_schedule'; expectedScheduleVersion: number }
  | { action: 'erase_loop' | 'erase_self'; confirmErase: boolean }
  | { action: 'request_support'; category: 'help' | 'privacy' | 'bug'; message: string }
  | { action: 'approve_packet'; packetId: string; inputHash: string; reviewedText: string; confirmFacts: boolean; confirmDisclosure: boolean }
  | { action: 'download'; packetId: string; format: 'pdf' | 'docx' | 'txt' | 'report' | 'letter' }
  | { action: 'preview_packet'; packetId: string; inputHash: string }
  | { action: 'gmail_connect'; allowDrafts: boolean }
  | { action: 'gmail_preview'; ticket: string }
  | { action: 'gmail_finalize'; ticket: string; confirmMailbox: boolean }
  | { action: 'gmail_disconnect' }
  | { action: 'gmail_create_draft'; packetId: string; requestId: string; confirmRecipientAndAttachment: boolean }) & { expectedGeneration?: number };
export type LoopResponse = { snapshot?: LoopSnapshot; erasureGeneration?: number; runId?: string; suggestions?: LoopClaimInput[]; url?: string; filename?: string; message?: string; error?: string; code?: string; gmailPreview?: { email: string | null; allowDrafts: boolean; expiresAt: string } };
