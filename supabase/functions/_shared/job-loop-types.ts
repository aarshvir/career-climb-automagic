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
}
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
  provider: LoopProviderId; model: string; label: string; ready: boolean;
  inputUsdPerMillion: number; outputUsdPerMillion: number;
}
export interface LoopSnapshot {
  recordVersion: number; profile: LoopProfile | null; claims: LoopClaim[];
  opportunities: LoopOpportunity[]; runs: LoopRun[]; packets: LoopPacket[]; inbox: LoopInboxSignal[];
  models: LoopModelOption[];
  capabilities: { cloudWorker: boolean; rulesEngine: boolean; webSearch: boolean; gmailRead: boolean; gmailDrafts: boolean; monthlyUsageCapUsd: number; dailyRunLimit: number };
  gmail: { connected: boolean; email: string | null; allowDrafts: boolean; status: string };
}
export type LoopAction =
  | { action: 'get' }
  | { action: 'save_profile'; expectedVersion: number; profile: LoopProfileInput; saveConsent: boolean }
  | { action: 'suggest_claims' }
  | { action: 'save_claim'; expectedVersion: number; id?: string; claim: LoopClaimInput }
  | { action: 'withdraw_claim'; expectedVersion: number; id: string }
  | { action: 'add_opportunity'; expectedVersion: number; opportunity: LoopOpportunityInput }
  | { action: 'update_opportunity'; expectedVersion: number; id: string; status: LoopApplicationStatus; followUpAt: string | null; notes: string }
  | { action: 'start_run'; requestId: string; provider: LoopProviderId | 'rules'; model: string; modelConsent: boolean; inboxConsent: boolean }
  | { action: 'resume_run'; runId: string }
  | { action: 'cancel_run'; runId: string }
  | { action: 'approve_packet'; packetId: string; inputHash: string; reviewedText: string; confirmFacts: boolean; confirmDisclosure: boolean }
  | { action: 'download'; packetId: string; format: 'pdf' | 'docx' | 'txt' | 'report' | 'letter' }
  | { action: 'gmail_connect'; allowDrafts: boolean }
  | { action: 'gmail_preview'; ticket: string }
  | { action: 'gmail_finalize'; ticket: string; confirmMailbox: boolean }
  | { action: 'gmail_disconnect' }
  | { action: 'gmail_create_draft'; packetId: string; requestId: string; confirmRecipientAndAttachment: boolean };
export type LoopResponse = { snapshot?: LoopSnapshot; runId?: string; suggestions?: LoopClaimInput[]; url?: string; filename?: string; message?: string; error?: string; code?: string; gmailPreview?: { email: string | null; allowDrafts: boolean; expiresAt: string } };
