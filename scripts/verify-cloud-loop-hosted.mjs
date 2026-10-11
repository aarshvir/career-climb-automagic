/** First-party hosted QA with new synthetic accounts only. No paid providers,
 * real mail, browser-session extraction, admin keys, sends or permanent deletes. */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

const PROJECT = 'gvftdfriujrkpptdueyb';
const ORIGIN = 'https://jobvance.io';
const API = `https://${PROJECT}.supabase.co`;
const CONFIG = 'https://raw.githubusercontent.com/aarshvir/career-climb-automagic/main/.env.production';
const report = { kind: 'hosted-cloud-loop-synthetic-qa', startedAt: new Date().toISOString(), status: 'running',
  accountsCreated: 0, paidCalls: 0, sentMessages: 0, applicationSubmissions: 0, permanentDeletes: 0, credentialsPrintedOrSaved: false, checks: [] };
class Stop extends Error { constructor(check, status = null, code = null) { super(check); this.check = check; this.status = status; this.code = code; } }
const check = (truth, name) => { if (!truth) throw new Stop(name); report.checks.push({ name, passed: true }); };
const safeCode = value => typeof value === 'string' && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function json(response) { const raw = await response.text(); if (Buffer.byteLength(raw) > 2500000) throw new Stop('bounded-json'); try { return JSON.parse(raw); } catch { return null; } }

async function main() {
  const configured = await fetch(CONFIG, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!configured.ok) throw new Stop('published-public-config', configured.status);
  const text = await configured.text();
  if (text.length > 20000) throw new Stop('public-config-size');
  const values = new Map(text.split(/\r?\n/).flatMap(line => { const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/.exec(line); return match ? [[match[1], match[2].trim()]] : []; }));
  const key = values.get('VITE_SUPABASE_PUBLISHABLE_KEY');
  let decoded; try { decoded = JSON.parse(Buffer.from(key?.split('.')[1] ?? '', 'base64url').toString()); } catch { throw new Stop('public-anon-key'); }
  check(values.get('VITE_SUPABASE_URL')?.replace(/\/$/, '') === API && decoded.role === 'anon' && decoded.ref === PROJECT, 'published-anon-project-bound');

  async function api(path, token, body, method = 'POST') {
    const url = new URL(path, API);
    if (url.origin !== API || !/^\/(?:auth\/v1\/(?:signup|user)|functions\/v1\/(?:job-loop-control|job-loop-worker|get-entitlement)|rest\/v1\/(?:job_loop_records|job_loop_runs|job_loop_packets|job_loop_budget_months|job_loop_connections|rpc\/job_loop_start_run))$/.test(url.pathname) || method === 'DELETE') throw new Stop('fixed-first-party-scope');
    const response = await fetch(url, { method, headers: { apikey: key, Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000) });
    return { response, body: await json(response) };
  }
  const tag = randomBytes(8).toString('hex'); report.qaRunId = tag;
  async function signup(suffix) {
    const result = await api('/auth/v1/signup', null, { email: `jobvance-loop-qa-${tag}-${suffix}@example.com`, password: `Aa1!${randomBytes(32).toString('base64url')}`, data: { qa_fixture: true, qa_run_id: tag } });
    if (result.body?.user?.id) report.accountsCreated++;
    if (!result.response.ok || !result.body?.access_token || !result.body?.user?.id) throw new Stop('synthetic-normal-signup', result.response.status, safeCode(result.body?.code));
    return { id: result.body.user.id, token: result.body.access_token };
  }
  async function control(actor, action) {
    const result = await api('/functions/v1/job-loop-control', actor.token, action);
    if (!result.response.ok) throw new Stop(`control-${action.action}`, result.response.status, safeCode(result.body?.code));
    return result.body;
  }
  const anonymous = await api('/functions/v1/job-loop-control', null, { action: 'get' });
  check(anonymous.response.status === 401, 'anonymous-control-denied');
  const actor = await signup('owner');
  const ownUser = await api('/auth/v1/user', actor.token, undefined, 'GET');
  check(ownUser.body?.id === actor.id, 'fresh-synthetic-session-is-own-user');
  let snapshot = (await control(actor, { action: 'get' })).snapshot;
  check(snapshot?.profile === null && snapshot?.recordVersion === 0 && snapshot?.packets.length === 0, 'fresh-cloud-record-is-empty');
  check(snapshot.capabilities.cloudWorker && snapshot.capabilities.rulesEngine && snapshot.capabilities.monthlyUsageCapUsd === 50 && snapshot.capabilities.dailyRunLimit === 3, 'cloud-rules-and-fixed-budget-available');
  check(!snapshot.capabilities.webSearch && !snapshot.capabilities.gmailRead && !snapshot.capabilities.gmailDrafts && snapshot.models.every(model => !model.ready), 'paid-and-mail-integrations-remain-disabled');
  const worker = await api('/functions/v1/job-loop-worker', actor.token, { runId: randomUUID() });
  check(worker.response.status === 401, 'ordinary-user-cannot-execute-worker');

  const workHeader = 'Generated QA Advisory | Operations Intern | 2025';
  const work = 'Supported the team that maintained a weekly operations tracker for a synthetic internship.';
  const educationHeader = 'Generated QA University | 2026';
  const education = 'Bachelor of Business Administration, completed in 2026.';
  const source = ['Synthetic QA candidate; not a real job seeker.', 'INTERNSHIPS', workHeader, work, 'EDUCATION', educationHeader, education].join('\n');
  const profile = { audience: 'student', name: `QA Candidate ${tag}`, contactLine: 'Synthetic fixture; no contact details.', targetTitles: ['Graduate Operations Analyst'], locations: ['Dubai'], experienceYears: null,
    languages: [], pageTarget: 1, discreetSearch: true, sourceText: source, excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null } };
  snapshot = (await control(actor, { action: 'save_profile', expectedVersion: snapshot.recordVersion, profile, saveConsent: true })).snapshot;
  check(snapshot.profile?.name === profile.name && snapshot.profile.experienceYears === null, 'private-profile-saved-with-explicit-consent');
  const input = { sourceKind: 'cv_passage', sourceQuote: work, phrasing: work, context: workHeader, kind: 'internship', resultStatus: 'not_measured', confirmed: false, shareable: false };
  snapshot = (await control(actor, { action: 'save_claim', expectedVersion: snapshot.recordVersion, claim: input })).snapshot;
  const notConfirmed = await api('/functions/v1/job-loop-control', actor.token, { action: 'start_run', requestId: randomUUID(), provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false });
  check(notConfirmed.response.status === 422, 'unconfirmed-facts-cannot-start-run');
  snapshot = (await control(actor, { action: 'save_claim', expectedVersion: snapshot.recordVersion, id: snapshot.claims[0].id, claim: { ...input, confirmed: true, shareable: true } })).snapshot;
  snapshot = (await control(actor, { action: 'save_claim', expectedVersion: snapshot.recordVersion, claim: { ...input, sourceQuote: education, phrasing: education, context: educationHeader, kind: 'education', confirmed: true, shareable: true } })).snapshot;
  snapshot = (await control(actor, { action: 'add_opportunity', expectedVersion: snapshot.recordVersion, opportunity: { title: 'QA Investment Graduate', company: 'Generated QA Employer', location: 'Dubai',
    url: `https://example.com/jobvance-qa/${tag}`, description: 'Synthetic vacancy for verification only. Examine investment mandates, evaluate treasury arrangements and assess distributed portfolio obligations. This is not a live employer listing.', contact: null } })).snapshot;
  check(snapshot.opportunities.length === 1 && snapshot.opportunities[0].source === 'manual' && snapshot.opportunities[0].verification === 'user_provided', 'manual-vacancy-provenance-not-invented');
  const requestId = randomUUID();
  const started = await control(actor, { action: 'start_run', requestId, provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false });
  const runId = started.runId; check(typeof runId === 'string', 'cloud-run-persisted');
  // No polling/continuation requests during this interval: the executor must progress itself.
  await new Promise(resolve => setTimeout(resolve, 12000));
  snapshot = (await control(actor, { action: 'get' })).snapshot;
  const progressed = snapshot.runs.find(run => run.id === runId);
  check(progressed && progressed.phase !== 'inbox', 'background-progress-without-client-polling');
  for (let attempt = 0; attempt < 12 && !snapshot.packets.length; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    snapshot = (await control(actor, { action: 'get' })).snapshot;
  }
  const packet = snapshot.packets.find(item => item.runId === runId);
  check(packet && packet.status === 'review_required' && packet.pageCount === 1, 'real-portal-packet-rendered-for-manual-low-overlap-vacancy');
  check(packet.assessment.score < 60 && packet.cvText.includes(work) && packet.cvText.includes(education) && !packet.cvText.includes('Led the team'), 'low-heuristic-score-does-not-drop-user-vacancy-or-promote-support');
  check(packet.messageText === '' && packet.emailBody === '', 'unknown-contact-does-not-create-outreach');
  const replay = await control(actor, { action: 'start_run', requestId, provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false });
  check(replay.runId === runId && replay.snapshot.runs.filter(run => run.id === runId).length === 1, 'same-run-reference-replays-without-new-run');
  const beforeApproval = await api('/functions/v1/job-loop-control', actor.token, { action: 'download', packetId: packet.id, format: 'pdf' });
  check(beforeApproval.response.status === 409, 'download-needs-exact-human-approval');
  snapshot = (await control(actor, { action: 'approve_packet', packetId: packet.id, inputHash: packet.inputHash, reviewedText: packet.cvText, confirmFacts: true, confirmDisclosure: true })).snapshot;
  check(snapshot.packets.find(item => item.id === packet.id)?.status === 'approved', 'exact-hash-factual-and-disclosure-approval-persisted');
  for (const format of ['pdf', 'docx', 'txt', 'report', 'letter']) {
    const link = await control(actor, { action: 'download', packetId: packet.id, format });
    const url = new URL(link.url); const path = decodeURIComponent(url.pathname);
    check(url.origin === API && path.startsWith(`/storage/v1/object/sign/job-loop-artifacts/${actor.id}/${packet.id}/`) && !url.username && !url.password, `private-manifest-signed-${format}-link`);
    const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    check(response.ok && bytes.length > 0 && sha(bytes) === packet.artifacts[format].sha256, `hosted-${format}-bytes-match-render-manifest`);
    if (format === 'pdf') check(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'hosted-export-is-actual-pdf');
    if (format === 'docx') {
      const xml = strFromU8(unzipSync(bytes)['word/document.xml']);
      check(xml.includes(work) && xml.includes('INTERNSHIPS') && xml.includes('EDUCATION'), 'hosted-docx-roundtrip-preserves-source-context');
    }
    if (format === 'txt') check(new TextDecoder().decode(bytes) === packet.cvText, 'hosted-txt-is-exact-reviewed-cv');
  }
  const stranger = await signup('observer');
  const hidden = await api('/rest/v1/job_loop_packets', stranger.token, undefined, 'GET');
  check(hidden.response.ok && Array.isArray(hidden.body) && hidden.body.length === 0, 'second-account-cannot-read-first-account-packets');
  const foreignDownload = await api('/functions/v1/job-loop-control', stranger.token, { action: 'download', packetId: packet.id, format: 'pdf' });
  check(foreignDownload.response.status === 404, 'second-account-cannot-sign-first-account-artifact');
  const directWrite = await api('/rest/v1/job_loop_runs', actor.token, { user_id: actor.id, request_id: randomUUID(), data: {} });
  check(!directWrite.response.ok, 'browser-cannot-forge-run-state');
  const budget = await api('/rest/v1/job_loop_budget_months', actor.token, undefined, 'GET');
  check(!budget.response.ok, 'browser-cannot-read-or-change-global-budget');
  const connections = await api('/rest/v1/job_loop_connections', actor.token, undefined, 'GET');
  check(!connections.response.ok, 'browser-cannot-read-mail-credentials');
  snapshot = (await control(actor, { action: 'update_opportunity', expectedVersion: snapshot.recordVersion, id: snapshot.opportunities[0].id, status: 'interview', followUpAt: '2026-10-20', notes: 'Synthetic user-reported interview; no application was submitted.' })).snapshot;
  const persisted = (await control(actor, { action: 'get' })).snapshot;
  check(persisted.opportunities[0].status === 'interview' && persisted.opportunities[0].notes.includes('Synthetic'), 'manual-tracking-survives-new-request');
  snapshot = (await control(actor, { action: 'withdraw_claim', expectedVersion: snapshot.recordVersion, id: snapshot.claims.find(item => item.kind === 'internship').id })).snapshot;
  check(snapshot.packets.find(item => item.id === packet.id)?.status === 'revoked', 'withdrawal-revokes-prior-approval');
  const revoked = await api('/functions/v1/job-loop-control', actor.token, { action: 'download', packetId: packet.id, format: 'pdf' });
  check(revoked.response.status === 409, 'revoked-packet-cannot-get-new-download-link');
  const entitlement = await api('/functions/v1/get-entitlement', actor.token, {});
  check(entitlement.body?.billingConfigured === false, 'existing-payments-remain-disabled');
  report.status = 'passed';
}
try { await main(); } catch (error) {
  report.status = 'stopped';
  report.failure = error instanceof Stop ? { check: error.check, httpStatus: error.status, publicCode: error.code } : { check: 'unexpected-network-or-format-error', type: error instanceof Error ? error.name : 'Error' };
} finally { report.finishedAt = new Date().toISOString(); process.stdout.write(JSON.stringify(report, null, 2) + '\n'); }
if (report.status !== 'passed') process.exitCode = 1;
