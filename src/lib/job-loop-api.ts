import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { readAuthSession } from '@/utils/authSession';
import { listCvDocuments } from '@/lib/cv-documents';
import { safeDocumentFilename } from '@/lib/document-download';
import type { LoopAction, LoopResponse } from '../../supabase/functions/_shared/job-loop-types';

export type { LoopAction, LoopResponse, LoopSnapshot } from '../../supabase/functions/_shared/job-loop-types';
const text = z.string().max(60000), short = z.string().max(500), id = z.string().min(1).max(128);
const provider = z.enum(['anthropic', 'openai', 'moonshot']);
const status = z.enum(['saved', 'prepared', 'applied', 'interview', 'offer', 'rejected', 'withdrawn']);
const claimSchema = z.object({ sourceKind: z.enum(['cv_passage', 'user_answer']), sourceQuote: text, phrasing: text, context: short,
  kind: z.enum(['employment', 'internship', 'academic_project', 'personal_project', 'volunteering', 'education', 'skill']),
  resultStatus: z.enum(['measured', 'projected', 'not_measured']), confirmed: z.boolean(), shareable: z.boolean() });
const profileSchema = z.object({ audience: z.enum(['student', 'mba', 'professional']), name: short, contactLine: short,
  targetTitles: z.array(short).max(20), locations: z.array(short).max(20), experienceYears: z.number().min(0).max(80).nullable(),
  languages: z.array(short).max(20), pageTarget: z.union([z.literal(1), z.literal(2)]), discreetSearch: z.boolean(),
  sourceText: text, excludedTerms: z.array(short).max(100), compensation: z.object({ currency: z.string().max(10),
    period: z.enum(['monthly', 'annual', 'hourly']), minimum: z.number().nonnegative().nullable() }) });
const contactSchema = z.object({ name: short, title: short, email: short, sourceUrl: z.string().max(2000), sourceQuote: text,
  confirmedByUser: z.boolean(), inExistingThread: z.boolean() });
const opportunitySchema = z.object({ title: short, company: short, location: short, url: z.string().max(2000), description: text, contact: contactSchema.nullable() });
const scheduleSchema=z.object({cadence:z.enum(['daily','weekdays','weekly']),timezone:z.string().min(1).max(100),localTime:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),weeklyDay:z.number().int().min(0).max(6).nullable(),provider:z.union([provider,z.literal('rules')]),model:short,modelConsent:z.boolean(),inboxConsent:z.boolean()});
const laneSchema = z.object({ name: short, status: z.enum(['completed', 'partial', 'blocked', 'not_connected', 'not_run']), count: z.number().int().nonnegative(), checkedAt: short, message: text });
const snapshotSchema = z.object({
  recordVersion: z.number().int().nonnegative(), profile: profileSchema.extend({ revision: z.number().int().nonnegative(), updatedAt: short }).nullable(),
  claims: z.array(claimSchema.extend({ id, revision: z.number().int().nonnegative(), status: z.enum(['active', 'withdrawn']), createdAt: short })).max(1000),
  opportunities: z.array(opportunitySchema.extend({ id, source: z.enum(['manual', 'employer_api', 'web_search']), sourceKey: short, checkedAt: short,
    verification: z.enum(['user_provided', 'listed_on_source', 'unverified', 'closed_confirmed']), status, followUpAt: short.nullable(), notes: text })).max(2000),
  runs: z.array(z.object({ id, requestId: id, status: z.enum(['queued', 'running', 'completed', 'partial', 'blocked', 'cancelled', 'failed']),
    phase: short, startedAt: short, finishedAt: short.nullable(), inputHash: id, provider: z.union([provider, z.literal('rules')]), model: short,
    lanes: z.array(laneSchema).max(40), opportunityIds: z.array(id).max(2000), packetIds: z.array(id).max(2000), messages: z.array(text).max(100),
    nextAction: text, reservedUsd: z.number().nonnegative(), usageUsd: z.number().nonnegative() })).max(1000),
  packets: z.array(z.object({ id, runId: id, opportunityId: id, title: short, company: short, inputHash: id, profileRevision: z.number().int().nonnegative(),
    claimVersions: z.record(z.number().int().nonnegative()), cvText: text, evidenceText: text, coverLetterText: text,
    connectionNote: text, messageText: text, emailSubject: short, emailBody: text, contact: contactSchema.nullable(),
    assessment: z.object({ score: z.number().min(0).max(100), method: short, components: z.object({ role: z.number(), evidence: z.number(), constraints: z.number() }),
      gaps: z.array(text).max(200), flags: z.array(text).max(200), claimIds: z.array(id).max(1000) }),
    status: z.enum(['review_required', 'approved', 'held', 'revoked']), holdReasons: z.array(text).max(200), pageCount: z.number().int().positive().nullable(),
    createdAt: short, approvedAt: short.nullable(), model: z.object({ provider: z.union([provider, z.literal('rules')]), model: short, method: short }),
    artifacts: z.record(z.object({ path: z.string().max(2000), sha256: short, byteSize: z.number().int().nonnegative() })),
    formatStatus:z.object({pdf:z.object({ready:z.boolean(),reason:text.optional(),pageCount:z.number().int().positive().nullable().optional()}).optional(),docx:z.object({ready:z.boolean(),reason:text.optional(),pageCount:z.number().int().positive().nullable().optional()}).optional(),txt:z.object({ready:z.boolean(),reason:text.optional(),pageCount:z.number().int().positive().nullable().optional()}).optional()}).optional(),
    interviewBrief:z.array(z.object({title:short,prompt:text,evidenceClaimIds:z.array(id).max(1000),sourceQuote:text})).max(5).optional() })).max(2000),
  inbox: z.array(z.object({ id, bucket: z.enum(['action_needed', 'progress', 'rejected', 'noise']), subject: short, from: short, receivedAt: short,
    summary: text, draftReply: text, threadId: id, opportunityId: id.nullable(), roleUnconfirmed: z.boolean() })).max(2000),
  models: z.array(z.object({ provider, model: short, label: short, ready: z.boolean(), transport:z.enum(['direct','openrouter']).optional(), inputUsdPerMillion: z.number().nonnegative(), outputUsdPerMillion: z.number().nonnegative() })).max(100),
  capabilities: z.object({ cloudWorker: z.boolean(), rulesEngine: z.boolean(), webSearch: z.boolean(), gmailRead: z.boolean(), gmailDrafts: z.boolean(), monthlyUsageCapUsd: z.number().nonnegative(), dailyRunLimit: z.number().int().nonnegative(),scheduler:z.boolean().optional(),packetsPerRun:z.number().int().min(1).max(5).optional() }),
  gmail: z.object({ connected: z.boolean(), email: short.nullable(), status: short, allowDrafts: z.boolean() }),
  schedule:scheduleSchema.extend({version:z.number().int().nonnegative(),status:z.enum(['active','paused','cancelled']),nextRunAt:short.nullable(),lastRunId:id.nullable(),lastAttemptAt:short.nullable(),message:text}).nullable().optional(),
  budget:z.object({month:z.string().regex(/^\d{4}-\d{2}$/),capUsd:z.number().positive().max(50),committedUsd:z.number().nonnegative().max(50),remainingUsd:z.number().nonnegative().max(50),scope:z.literal('shared_ai_search'),maxPilotUsers:z.number().int().min(1).max(10)}).optional(),
  pilot:z.object({enrolled:z.boolean(),activeUsers:z.number().int().min(0).max(10),maxUsers:z.number().int().min(1).max(10)}).optional(),
  activity:z.array(z.object({id,kind:short,actor:z.enum(['candidate','jobvance']),at:short,summary:short,opportunityId:id.nullable(),runId:id.nullable()})).max(200).optional(),
  support:z.array(z.object({id,category:z.enum(['help','privacy','bug']),message:z.string().max(2000),status:z.enum(['received','in_review','resolved']),createdAt:short})).max(20).optional(),
  recurringReady:z.boolean().optional(),employerSources:z.array(z.object({provider:short,company:short,board:short})).max(4).optional(),
});
const responseSchema = z.object({ snapshot: snapshotSchema.optional(), runId: id.optional(), suggestions: z.array(claimSchema).max(1000).optional(),
  url: z.string().max(8000).optional(), filename: short.optional(), message: text.optional(), error: text.optional(), code: short.optional(),
  gmailPreview: z.object({ email: short.nullable(), allowDrafts: z.boolean(), expiresAt: short }).optional() });
const version = z.number().int().nonnegative();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get') }),
  z.object({ action: z.literal('save_profile'), expectedVersion: version, profile: profileSchema, saveConsent: z.boolean() }),
  z.object({ action: z.literal('suggest_claims') }),
  z.object({ action: z.literal('save_claim'), expectedVersion: version, id: id.optional(), claim: claimSchema }),
  z.object({ action: z.literal('withdraw_claim'), expectedVersion: version, id }),
  z.object({ action: z.literal('add_opportunity'), expectedVersion: version, opportunity: opportunitySchema }),
  z.object({ action: z.literal('update_opportunity'), expectedVersion: version, id, status, followUpAt: short.nullable(), notes: z.string().max(5000) }),
  z.object({ action: z.literal('start_run'), requestId: z.string().uuid(), provider: z.union([provider, z.literal('rules')]), model: short, modelConsent: z.boolean(), inboxConsent: z.boolean(),processingRoute:z.enum(['direct','openrouter']).optional() }),
  z.object({ action: z.literal('resume_run'), runId: id }), z.object({ action: z.literal('cancel_run'), runId: id }),
  z.object({ action: z.literal('approve_packet'), packetId: id, inputHash: id, reviewedText: text, confirmFacts: z.boolean(), confirmDisclosure: z.boolean() }),
  z.object({ action: z.literal('download'), packetId: id, format: z.enum(['pdf', 'docx', 'txt', 'report', 'letter']) }),
  z.object({action:z.literal('preview_packet'),packetId:id,inputHash:id}),
  z.object({action:z.literal('save_schedule'),expectedScheduleVersion:version,schedule:scheduleSchema,recurringConsent:z.boolean()}),
  z.object({action:z.literal('pause_schedule'),expectedScheduleVersion:version}),z.object({action:z.literal('cancel_schedule'),expectedScheduleVersion:version}),
  z.object({action:z.literal('erase_loop'),confirmErase:z.boolean()}),z.object({action:z.literal('erase_self'),confirmErase:z.boolean()}),
  z.object({action:z.literal('request_support'),category:z.enum(['help','privacy','bug']),message:z.string().min(5).max(2000)}),
  z.object({ action: z.literal('gmail_connect'), allowDrafts: z.boolean() }), z.object({ action: z.literal('gmail_disconnect') }),
  z.object({ action: z.literal('gmail_preview'), ticket: z.string().min(1).max(16000) }),
  z.object({ action: z.literal('gmail_finalize'), ticket: z.string().min(1).max(16000), confirmMailbox: z.boolean() }),
  z.object({ action: z.literal('gmail_create_draft'), packetId: id, requestId: z.string().uuid(), confirmRecipientAndAttachment: z.boolean() }),
]);

export function isLoopHttpsUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
function assertConsent(action: LoopAction) {
  if (action.action === 'save_profile' && !action.saveConsent) throw new Error('Choose private saving before saving your career record.');
  if (action.action === 'start_run' && action.provider !== 'rules' && !action.modelConsent) throw new Error('Allow processing by the selected provider before starting.');
  if (action.action === 'start_run' && action.provider === 'rules' && action.model !== 'grounded-rules-v1') throw new Error('Choose an available preparation method.');
  if (action.action === 'approve_packet' && (!action.confirmFacts || !action.confirmDisclosure)) throw new Error('Review the facts and disclosure before approving.');
  if (action.action === 'gmail_create_draft' && !action.confirmRecipientAndAttachment) throw new Error('Confirm the recipient and exact approved attachment before creating a Gmail draft.');
  if (action.action === 'gmail_finalize' && !action.confirmMailbox) throw new Error('Confirm the previewed mailbox and permissions before connecting it.');
  if (action.action === 'add_opportunity' && (!isLoopHttpsUrl(action.opportunity.url) || (action.opportunity.contact && !isLoopHttpsUrl(action.opportunity.contact.sourceUrl)))) throw new Error('Use a real HTTPS vacancy and contact source link, without embedded credentials.');
  if(action.action==='save_schedule'&&(!action.recurringConsent||action.schedule.provider!=='rules'&&!action.schedule.modelConsent))throw new Error('Explicitly allow recurring preparation and any selected provider processing.');
  if(action.action==='save_schedule'&&action.schedule.provider==='rules'&&action.schedule.model!=='grounded-rules-v1')throw new Error('Choose the available rules preparation method.');
  if((action.action==='erase_loop'||action.action==='erase_self')&&!action.confirmErase)throw new Error('Confirm erasing your private Job Loop record and documents.');
}
export async function requireLoopOwner(userId: string): Promise<void> {
  let session: Awaited<ReturnType<typeof readAuthSession>>;
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try { session = await readAuthSession(); result = await supabase.auth.getUser(); }
  catch { throw new Error('Please sign in again to access your Job Loop.'); }
  const { data, error } = result;
  if (error || !session?.user || !data.user) throw new Error('Please sign in again to access your Job Loop.');
  if (session.user.id !== userId || data.user.id !== userId) throw new Error('Your account changed. Previous account data has not been opened.');
}
function publicFailure(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') return payload.error.slice(0, 400);
  return fallback;
}

/** No caller-supplied owner, endpoints, API secrets, or pricing cross this boundary. */
export async function callJobLoop(userId: string, action: LoopAction): Promise<LoopResponse> {
  // This repository disables strictNullChecks, which makes Zod's inferred
  // properties optional in TypeScript. Runtime schemas still require every field.
  action = actionSchema.parse(action) as LoopAction;
  assertConsent(action);
  await requireLoopOwner(userId);
  const fallback = action.action === 'get' ? 'The Job Loop service is still being configured or could not be reached. Your free CV check and existing workspace remain available.' : 'This action could not be confirmed. Refresh your Job Loop before retrying.';
  let result: { data: unknown; error: unknown };
  try { result = await supabase.functions.invoke<unknown>('job-loop-control', { body: action }); }
  catch { await requireLoopOwner(userId); throw new Error(fallback); }
  const { data, error } = result;
  await requireLoopOwner(userId);
  if (error) {
    const response = (error as { context?: unknown }).context;
    const payload = response instanceof Response ? await response.clone().json().catch(() => null) : null;
    await requireLoopOwner(userId);
    throw new Error(publicFailure(payload, fallback));
  }
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success || (action.action === 'get' && !parsed.data.snapshot)) throw new Error(fallback);
  if (parsed.data.error) throw new Error(parsed.data.error.slice(0, 400));
  return parsed.data as LoopResponse;
}
export async function loadLoopSavedCvs(userId: string) {
  await requireLoopOwner(userId);
  const rows = await listCvDocuments(userId);
  await requireLoopOwner(userId);
  if (rows.some(row => row.user_id !== userId)) throw new Error('The saved CV list did not match your account.');
  return rows;
}
export function safeLoopDownloadUrl(value: string, userId: string): string {
  const project = new URL(import.meta.env.VITE_SUPABASE_URL || 'https://inert.invalid');
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
  if (url.protocol !== 'https:' || url.origin !== project.origin || url.username || url.password || url.hash ||
      parts.slice(0, 4).join('/') !== 'storage/v1/object/sign' || parts[4] !== 'job-loop-artifacts' || parts[5] !== userId || parts.some(part => part === '..' || part.includes('/'))) {
    throw new Error('The document link did not match your private account storage.');
  }
  return url.href;
}
export function safeLoopGmailUrl(value: string): string {
  const url = new URL(value);
  if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth' || url.username || url.password || url.hash) throw new Error('Gmail connection returned an unexpected address.');
  return url.href;
}
export async function getLoopDownload(userId: string, packetId: string, format: 'pdf' | 'docx' | 'txt' | 'report' | 'letter') {
  const result = await callJobLoop(userId, { action: 'download', packetId, format });
  return fetchLoopArtifact(userId,result);
}
export async function getLoopPreview(userId:string,packetId:string,inputHash:string){
  const result=await callJobLoop(userId,{action:'preview_packet',packetId,inputHash});
  return fetchLoopArtifact(userId,result);
}
export const LOOP_ARTIFACT_TIMEOUT_MS=45000;
async function fetchLoopArtifact(userId:string,result:LoopResponse){
  if (!result.url || !result.filename) throw new Error('The approved document is not available yet.');
  const url = safeLoopDownloadUrl(result.url, userId);
  const controller=new AbortController();
  let deadlineTimer:ReturnType<typeof setTimeout>;
  const deadline=new Promise<never>((_,reject)=>{deadlineTimer=setTimeout(()=>{controller.abort();reject(new Error('The document download timed out. Try again to request a fresh private link.'));},LOOP_ARTIFACT_TIMEOUT_MS);});
  const transfer=(async()=>{
    let response:Response;
    try { response=await fetch(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal}); }
    catch { throw new Error('The private document could not be loaded. Request a fresh link and retry.'); }
    if(!response.ok)throw new Error('The document could not be downloaded. Request a fresh link and retry.');
    if(Number(response.headers.get('content-length')||0)>10*1024*1024)throw new Error('The document exceeds the download limit.');
    return response.blob().catch(()=>{throw new Error('The private document could not be read. Request a fresh link and retry.');});
  })();
  let blob:Blob;
  try {blob=await Promise.race([transfer,deadline]);}
  finally {clearTimeout(deadlineTimer!);controller.abort();}
  await requireLoopOwner(userId);
  if (blob.size > 10 * 1024 * 1024) throw new Error('The document exceeds the download limit.');
  return { blob, filename: safeDocumentFilename(result.filename) };
}
