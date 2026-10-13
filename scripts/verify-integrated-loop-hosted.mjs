/** Authorized hosted verification using new synthetic accounts only.
 * Public configuration is read locally. Credentials exist only in process memory.
 * No funded providers, OAuth grants, messages, application submissions or Auth deletion.
 * Run with --execute only after deployment. A stdin gate lets the operator make
 * this freshly created QA schedule due using authenticated database tools. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { unzipSync, strFromU8 } from 'fflate';

const PROJECT = 'gvftdfriujrkpptdueyb';
const ORIGIN = 'https://jobvance.io';
const API = `https://${PROJECT}.supabase.co`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULES = { provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false };
const actors = [];
const report = { kind: 'hosted-integrated-job-loop-synthetic-qa', startedAt: new Date().toISOString(), status: 'prepared',
  accountsCreated: 0, paidCalls: 0, sentMessages: 0, applicationSubmissions: 0, authAccountsDeleted: 0,
  syntheticLoopsErased: 0, credentialsPrintedOrSaved: false, signedLinksPrintedOrSaved: false, checks: [] };
class Stop extends Error { constructor(check, status = null, code = null) { super(check); this.check = check; this.status = status; this.code = code; } }
const check = (truth, name) => { if (!truth) throw new Stop(name); report.checks.push({ name, passed: true }); };
const safeCode = value => typeof value === 'string' && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let publicKey = '', tag = '';

async function readPublicConfiguration() {
  const source = await readFile(new URL('../.env.production', import.meta.url), 'utf8');
  if (source.length > 20000) throw new Stop('local-public-config-size');
  const values = new Map(source.split(/\r?\n/).flatMap(line => {
    const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/.exec(line);
    return match ? [[match[1], match[2].trim()]] : [];
  }));
  publicKey = values.get('VITE_SUPABASE_PUBLISHABLE_KEY');
  let anon; try { anon = JSON.parse(Buffer.from(publicKey?.split('.')[1] ?? '', 'base64url').toString()); } catch { anon = null; }
  const publicShape = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publicKey ?? '') || anon?.role === 'anon' && anon?.ref === PROJECT;
  check(values.get('VITE_SUPABASE_URL')?.replace(/\/$/, '') === API && publicShape, 'local-public-key-is-project-bound-and-not-privileged');
}

async function boundedJson(response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 2500000) throw new Stop('bounded-json-header');
  const text = await response.text(); if (Buffer.byteLength(text) > 2500000) throw new Stop('bounded-json-body');
  try { return JSON.parse(text); } catch { return null; }
}
async function api(path, actor, body, method = 'POST') {
  const url = new URL(path, API);
  const allowed = /^\/(?:auth\/v1\/(?:settings|signup|user)|functions\/v1\/(?:job-loop-control|job-loop-worker|get-entitlement)|rest\/v1\/(?:job_loop_packets|job_loop_runs|job_loop_records|job_loop_budget_months|job_loop_connections|job_loop_schedules|job_loop_activity|job_loop_support_requests))$/;
  if (url.origin !== API || !allowed.test(url.pathname) || !['POST', 'GET'].includes(method)) throw new Stop('fixed-first-party-request-scope');
  const response = await fetch(url, { method, headers: { apikey: publicKey, Origin: ORIGIN, 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(25000) });
  return { response, body: await boundedJson(response) };
}
const allowedActions = new Set(['get','save_profile','save_claim','suggest_claims','withdraw_claim','add_opportunity','update_opportunity','start_run','approve_packet','preview_packet','download','save_schedule','pause_schedule','cancel_schedule','request_support','erase_loop']);
async function control(actor, action) {
  if (!actors.includes(actor) || !allowedActions.has(action.action)) throw new Stop('new-synthetic-owner-and-safe-actions-only');
  if (['start_run','save_schedule'].includes(action.action)) {
    const preparation = action.action === 'start_run' ? action : action.schedule;
    if (preparation.provider !== RULES.provider || preparation.model !== RULES.model || preparation.modelConsent || preparation.inboxConsent) throw new Stop('unfunded-rules-only-preparation');
  }
  const result = await api('/functions/v1/job-loop-control', actor, action);
  if (!result.response.ok) throw new Stop(`control-${action.action}`, result.response.status, safeCode(result.body?.code));
  return result.body;
}
async function signup(suffix) {
  const result = await api('/auth/v1/signup', null, { email: `jobvance-integrated-qa-${tag}-${suffix}@example.com`,
    password: `Aa1!${randomBytes(32).toString('base64url')}`, data: { qa_fixture: true, qa_run_id: tag } });
  if (!result.response.ok || !UUID.test(result.body?.user?.id ?? '') || !result.body?.access_token) throw new Stop('fresh-synthetic-signup', result.response.status, safeCode(result.body?.code));
  const actor = { id: result.body.user.id, token: result.body.access_token };
  actors.push(actor); report.accountsCreated++;
  const identity = await api('/auth/v1/user', actor, undefined, 'GET');
  check(identity.response.ok && identity.body?.id === actor.id && identity.body?.user_metadata?.qa_fixture === true && identity.body?.user_metadata?.qa_run_id === tag, `fresh-${suffix}-identity-is-own-synthetic-account`);
  return actor;
}
function requireRulesOnlyTestConfiguration(snapshot) {
  check(snapshot.capabilities?.cloudWorker === true && snapshot.capabilities?.rulesEngine === true, 'cloud-worker-and-source-rules-available');
  check(snapshot.capabilities?.monthlyUsageCapUsd === 50 && snapshot.capabilities?.packetsPerRun === 2, 'fifty-dollar-shared-cap-and-two-packets-per-run-reported');
  check(snapshot.budget?.capUsd === 50 && snapshot.budget?.scope === 'shared_ai_search' && snapshot.budget?.maxPilotUsers === 10 && snapshot.pilot?.maxUsers === 10 && snapshot.pilot.activeUsers <= 10, 'ten-user-shared-budget-is-reported-without-client-override');
  check(!snapshot.capabilities.webSearch && !snapshot.capabilities.gmailRead && !snapshot.capabilities.gmailDrafts, 'paid-search-and-mail-integrations-remain-disabled');
  // Live model availability is separate from this explicitly rules-only test.
  // finishRun checks the actual provider/model and both zero usage/reservation.
  check(snapshot.capabilities.scheduler === true, 'cloud-scheduler-reports-ready');
}
async function finishRun(actor, runId, idleFirst = true) {
  // No polling or continuation during this interval: processing must run itself.
  if (idleFirst) await wait(12000);
  let snapshot;
  for (let attempt = 0; attempt < 20; attempt++) {
    snapshot = (await control(actor, { action: 'get' })).snapshot;
    const run = snapshot.runs.find(value => value.id === runId);
    if (run && ['completed','partial','blocked','failed','cancelled'].includes(run.status)) {
      check(['completed','partial'].includes(run.status), 'cloud-run-reaches-an-observable-completion-state');
      check(run.provider === 'rules' && run.model === RULES.model && run.usageUsd === 0 && run.reservedUsd === 0, 'run-incurs-no-funded-provider-usage');
      return snapshot;
    }
    if (attempt < 19) await wait(3000);
  }
  throw new Stop('cloud-run-completion-timeout');
}
async function artifact(actor, packet, format, preview = false) {
  const link = await control(actor, preview ? { action: 'preview_packet', packetId: packet.id, inputHash: packet.inputHash } : { action: 'download', packetId: packet.id, format });
  const url = new URL(link.url), path = decodeURIComponent(url.pathname), expected = `/storage/v1/object/sign/job-loop-artifacts/${actor.id}/${packet.id}/${packet.artifacts[format]?.sha256}/${format}`;
  check(url.origin === API && path === expected && !url.username && !url.password && !url.hash, `private-exact-manifest-${preview ? 'preview' : format}-link`);
  const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000) });
  if (Number(response.headers.get('content-length') || 0) > 5 * 1024 * 1024) throw new Stop('bounded-artifact-header');
  const bytes = new Uint8Array(await response.arrayBuffer());
  check(response.ok && bytes.byteLength > 0 && bytes.byteLength <= 5 * 1024 * 1024 && sha(bytes) === packet.artifacts[format].sha256, `hosted-${preview ? 'preview' : format}-bytes-match-manifest`);
  return bytes;
}
async function waitForOperatorDispatch(actor, snapshot) {
  process.stdout.write(JSON.stringify({ stage: 'waiting-dispatch', qaRunId: tag, qaOwnerId: actor.id,
    scheduleVersion: snapshot.schedule.version, initialNextRunAt: snapshot.schedule.nextRunAt,
    command: `dispatch-ready ${tag}`, checksCompleted: report.checks.length }) + '\n');
  const input = createInterface({ input: process.stdin, terminal: false });
  let timeout;
  try {
    const line = await Promise.race([input.question(''), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Stop('operator-dispatch-gate-timeout')), 15 * 60 * 1000); })]);
    if (line.trim() !== `dispatch-ready ${tag}`) throw new Stop('operator-dispatch-gate-not-resumed');
  } finally { clearTimeout(timeout); input.close(); }
  const initialRunIds = new Set(snapshot.runs.map(run => run.id));
  let dispatched;
  for (let attempt = 0; attempt < 30; attempt++) {
    const fresh = (await control(actor, { action: 'get' })).snapshot;
    if (fresh.schedule?.lastRunId && !initialRunIds.has(fresh.schedule.lastRunId) && Date.parse(fresh.schedule.nextRunAt) > Date.now()) { dispatched = fresh; break; }
    if (attempt < 29) await wait(3000);
  }
  check(!!dispatched, 'operator-made-qa-schedule-dispatches-through-cloud-service');
  check(dispatched.schedule.status === 'active' && Number.isFinite(Date.parse(dispatched.schedule.nextRunAt)) && Date.parse(dispatched.schedule.nextRunAt) > Date.now(), 'scheduled-dispatch-advances-real-next-run');
  const finished = await finishRun(actor, dispatched.schedule.lastRunId, false);
  check(finished.activity.some(event => event.actor === 'jobvance' && event.runId === finished.schedule.lastRunId), 'scheduled-progress-has-jobvance-actor-history');
  return finished;
}

async function main() {
  await readPublicConfiguration();
  if (!process.argv.includes('--execute')) { report.instructions = 'Prepared only; no network or accounts. Run with --execute after deployment. Resume the emitted dispatch gate only after making its new QA owner schedule due.'; return; }
  report.status = 'running'; tag = randomBytes(8).toString('hex'); report.qaRunId = tag;
  const settings = await api('/auth/v1/settings', null, undefined, 'GET');
  check(settings.response.ok && settings.body?.mailer_autoconfirm === true, 'public-auth-settings-confirm-signup-sends-no-confirmation-email');
  const anonymous = await api('/functions/v1/job-loop-control', null, { action: 'get' });
  check(anonymous.response.status === 401, 'anonymous-private-loop-access-denied');
  const actor = await signup('student');
  let snapshot = (await control(actor, { action: 'get' })).snapshot;
  requireRulesOnlyTestConfiguration(snapshot);
  check(snapshot.profile === null && snapshot.claims.length === 0 && snapshot.opportunities.length === 0 && snapshot.runs.length === 0 && snapshot.activity.length === 0 && snapshot.packets.length === 0 && snapshot.schedule === null, 'fresh-student-record-has-no-fake-activity');
  check(snapshot.pilot.enrolled || snapshot.pilot.activeUsers < 10, 'new-synthetic-pilot-has-available-capacity');
  const deniedWorker = await api('/functions/v1/job-loop-worker', actor, { action: 'run_due' });
  check(deniedWorker.response.status === 401, 'candidate-cannot-trigger-privileged-shared-worker');
  const budgetBaseline = snapshot.budget.committedUsd;

  const projectHeading = 'ACADEMIC PROJECTS\nGenerated QA University | Operations project | 2026';
  const projectContext = 'Generated QA University | Operations project | 2026';
  const project = 'Built a dashboard for a synthetic university operations project using fictional data.';
  const internshipContext = 'Generated QA Advisory | Operations Intern | 2025';
  const internship = 'Supported the team that maintained a weekly operations tracker during a synthetic internship.';
  const educationContext = 'Generated QA University | Education | 2026';
  const education = 'Bachelor of Business Administration, completed in 2026.';
  const profile = { audience: 'student', name: `Synthetic QA Candidate ${tag}`, contactLine: 'Fictional test only; no contact details.', targetTitles: ['Graduate Operations Analyst'], locations: ['Dubai'], experienceYears: null,
    languages: [], pageTarget: 1, discreetSearch: true, sourceText: ['Synthetic candidate, not a real job seeker.', projectHeading, project, 'INTERNSHIPS', internshipContext, internship, 'EDUCATION', educationContext, education].join('\n'), excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null } };
  snapshot = (await control(actor, { action: 'save_profile', expectedVersion: snapshot.recordVersion, profile, saveConsent: true })).snapshot;
  check(snapshot.profile?.audience === 'student' && snapshot.profile.name === profile.name && snapshot.profile.experienceYears === null, 'student-record-saved-with-no-inferred-employment-years');
  const claim = { sourceKind: 'cv_passage', sourceQuote: project, phrasing: project, context: projectContext, kind: 'academic_project', resultStatus: 'not_measured', confirmed: false, shareable: false };
  snapshot = (await control(actor, { action: 'save_claim', expectedVersion: snapshot.recordVersion, claim })).snapshot;
  const unconfirmed = await api('/functions/v1/job-loop-control', actor, { action: 'start_run', requestId: randomUUID(), ...RULES });
  check(unconfirmed.response.status === 422, 'unconfirmed-source-facts-cannot-start-preparation');
  snapshot = (await control(actor, { action: 'save_claim', expectedVersion: snapshot.recordVersion, id: snapshot.claims[0].id, claim: { ...claim, confirmed: true, shareable: true } })).snapshot;
  for (const input of [{ ...claim, sourceQuote: internship, phrasing: internship, context: internshipContext, kind: 'internship', confirmed: true, shareable: true }, { ...claim, sourceQuote: education, phrasing: education, context: educationContext, kind: 'education', confirmed: true, shareable: true }]) snapshot = (await control(actor, { action: 'save_claim', expectedVersion: snapshot.recordVersion, claim: input })).snapshot;
  const sourceClaims = snapshot.claims.map(item => [item.id, item.revision]);
  const vacancy = { title: 'Synthetic Graduate Operations Analyst', company: 'Generated QA Employer', location: 'Dubai', url: `https://example.com/jobvance-integrated-qa/${tag}/first`, description: 'Synthetic vacancy for verification only, not a live employer listing. Build reporting dashboards, support weekly operations tracking and explain project findings. Undergraduate coursework may be discussed clearly as academic project work. No application should be sent.', contact: null };
  snapshot = (await control(actor, { action: 'add_opportunity', expectedVersion: snapshot.recordVersion, opportunity: vacancy })).snapshot;
  const firstOpportunity = snapshot.opportunities.find(item => item.url === vacancy.url);
  check(firstOpportunity?.source === 'manual' && firstOpportunity.verification === 'user_provided', 'manual-vacancy-is-labelled-as-user-provided-not-live-verified');
  const requestId = randomUUID(), first = await control(actor, { action: 'start_run', requestId, ...RULES });
  check(UUID.test(first.runId ?? ''), 'first-application-run-is-persisted');
  snapshot = await finishRun(actor, first.runId);
  const packet = snapshot.packets.find(item => item.runId === first.runId && item.opportunityId === firstOpportunity.id);
  check(packet?.status === 'review_required' && packet.pageCount === 1 && packet.formatStatus?.pdf.ready && packet.formatStatus?.docx.ready && packet.formatStatus?.txt.ready, 'student-application-is-rendered-and-awaits-human-review');
  check(packet.cvText.includes(project) && packet.cvText.includes(internship) && packet.cvText.includes(education) && !packet.cvText.includes('Led the team'), 'source-context-and-supporting-contribution-survive-preparation');
  check(packet.interviewBrief?.length === 5 && packet.interviewBrief.every(point => point.evidenceClaimIds.every(id => snapshot.claims.some(item => item.id === id && item.confirmed && item.shareable))), 'light-interview-preparation-references-cleared-evidence');
  check(!packet.messageText && !packet.emailBody && !packet.connectionNote, 'unknown-recipient-does-not-produce-outreach');
  const preview = await artifact(actor, packet, 'pdf', true);
  check(new TextDecoder().decode(preview.slice(0,5)) === '%PDF-', 'unapproved-preview-is-a-real-saved-pdf');
  const unapproved = await api('/functions/v1/job-loop-control', actor, { action: 'download', packetId: packet.id, format: 'pdf' });
  check(unapproved.response.status === 409, 'unapproved-packet-cannot-be-downloaded');
  snapshot = (await control(actor, { action: 'approve_packet', packetId: packet.id, inputHash: packet.inputHash, reviewedText: packet.cvText, confirmFacts: true, confirmDisclosure: true })).snapshot;
  check(snapshot.packets.find(item => item.id === packet.id)?.status === 'approved', 'approval-is-bound-to-exact-source-hash-and-reviewed-text');
  for (const format of ['pdf','docx','txt','report','letter']) {
    const bytes = await artifact(actor, packet, format);
    if (format === 'pdf') check(sha(bytes) === sha(preview), 'download-is-identical-to-preview-bytes');
    if (format === 'docx') { const xml = strFromU8(unzipSync(bytes)['word/document.xml']); check(xml.includes(project) && xml.includes('ACADEMIC PROJECTS') && xml.includes('INTERNSHIPS'), 'word-roundtrip-preserves-academic-and-work-context'); }
    if (format === 'txt') check(new TextDecoder().decode(bytes) === packet.cvText, 'text-download-is-exact-reviewed-cv');
  }
  const replay = await control(actor, { action: 'start_run', requestId, ...RULES });
  check(replay.runId === first.runId, 'same-request-replays-without-extra-run');
  snapshot = replay.snapshot;
  const secondVacancy = { ...vacancy, title: 'Synthetic Reporting Analyst', url: `https://example.com/jobvance-integrated-qa/${tag}/second`, description: vacancy.description + ' Prepare a reporting summary for the next application.' };
  snapshot = (await control(actor, { action: 'add_opportunity', expectedVersion: snapshot.recordVersion, opportunity: secondVacancy })).snapshot;
  const secondOpportunity = snapshot.opportunities.find(item => item.url === secondVacancy.url), second = await control(actor, { action: 'start_run', requestId: randomUUID(), ...RULES });
  snapshot = await finishRun(actor, second.runId);
  check(snapshot.packets.some(item => item.opportunityId === secondOpportunity.id && item.status === 'review_required') && JSON.stringify(snapshot.claims.map(item => [item.id,item.revision])) === JSON.stringify(sourceClaims), 'second-application-reuses-confirmed-facts-without-reentering-them');
  snapshot = (await control(actor, { action: 'update_opportunity', expectedVersion: snapshot.recordVersion, id: firstOpportunity.id, status: 'interview', followUpAt: '2026-10-20', notes: 'Synthetic candidate-reported interview; no application submitted by this test.' })).snapshot;
  check(snapshot.opportunities.find(item => item.id === firstOpportunity.id)?.followUpAt === '2026-10-20', 'follow-up-stays-a-calendar-date-without-invented-utc-noon');
  check(snapshot.activity.some(event => event.actor === 'candidate' && event.opportunityId === firstOpportunity.id && /interview/i.test(event.summary)), 'tracking-is-recorded-as-candidate-reported-progress');
  snapshot = (await control(actor, { action: 'request_support', category: 'bug', message: `Synthetic verification receipt ${tag}; no response or outreach requested.` })).snapshot;
  const receipt = snapshot.support.find(item => item.message.includes(tag));
  check(UUID.test(receipt?.id ?? '') && receipt.status === 'received', 'support-has-a-persisted-unreviewed-receipt');

  const observer = await signup('observer');
  const observerSnapshot = (await control(observer, { action: 'get' })).snapshot;
  check(observerSnapshot.profile === null && observerSnapshot.packets.length === 0 && observerSnapshot.support.length === 0, 'second-account-sees-none-of-first-account-private-work');
  const foreign = await api('/functions/v1/job-loop-control', observer, { action: 'preview_packet', packetId: packet.id, inputHash: packet.inputHash });
  check(foreign.response.status === 404, 'second-account-cannot-preview-first-account-artifact');
  for (const table of ['job_loop_packets','job_loop_records','job_loop_schedules','job_loop_activity','job_loop_support_requests']) {
    const result = await api(`/rest/v1/${table}?user_id=eq.${actor.id}`, observer, undefined, 'GET');
    check([401,403].includes(result.response.status) || result.response.ok && Array.isArray(result.body) && result.body.length === 0, `direct-api-cannot-leak-foreign-${table}`);
  }
  for (const table of ['job_loop_budget_months','job_loop_connections']) { const result = await api(`/rest/v1/${table}`, actor, undefined, 'GET'); check([401,403].includes(result.response.status), `browser-cannot-open-privileged-${table}`); }
  const forged = await api('/rest/v1/job_loop_runs', actor, { user_id: actor.id, request_id: randomUUID(), data: {} });
  check([401,403].includes(forged.response.status), 'candidate-cannot-forge-background-run-state');
  const entitlement = await api('/functions/v1/get-entitlement', actor, {});
  check(entitlement.response.ok && entitlement.body?.billingConfigured === false, 'real-money-checkout-remains-disabled');
  const settingsInput = { cadence: 'daily', timezone: 'Asia/Dubai', localTime: '08:00', weeklyDay: null, ...RULES };
  snapshot = (await control(actor, { action: 'save_schedule', expectedScheduleVersion: 0, schedule: settingsInput, recurringConsent: true })).snapshot;
  check(snapshot.schedule?.status === 'active' && snapshot.schedule.provider === 'rules' && Date.parse(snapshot.schedule.nextRunAt) > Date.now(), 'explicit-opt-in-persists-a-future-dubai-schedule');
  snapshot = await waitForOperatorDispatch(actor, snapshot);
  check(snapshot.budget.committedUsd === budgetBaseline, 'manual-and-scheduled-rules-runs-do-not-consume-paid-allowance');
  snapshot = (await control(actor, { action: 'pause_schedule', expectedScheduleVersion: snapshot.schedule.version })).snapshot;
  check(snapshot.schedule.status === 'paused' && snapshot.schedule.nextRunAt === null, 'pause-removes-the-next-scheduled-run');
  snapshot = (await control(actor, { action: 'save_schedule', expectedScheduleVersion: snapshot.schedule.version, schedule: settingsInput, recurringConsent: true })).snapshot;
  check(snapshot.schedule.status === 'active' && Date.parse(snapshot.schedule.nextRunAt) > Date.now(), 'explicit-resume-restores-a-future-schedule');
  snapshot = (await control(actor, { action: 'cancel_schedule', expectedScheduleVersion: snapshot.schedule.version })).snapshot;
  check(snapshot.schedule.status === 'cancelled' && snapshot.schedule.nextRunAt === null, 'cancel-stops-future-scheduled-preparation');
  snapshot = (await control(actor, { action: 'withdraw_claim', expectedVersion: snapshot.recordVersion, id: snapshot.claims.find(item => item.kind === 'academic_project').id })).snapshot;
  check(snapshot.packets.find(item => item.id === packet.id)?.status === 'revoked', 'withdrawing-evidence-revokes-the-earlier-approved-packet');
  const stalePreview = await api('/functions/v1/job-loop-control', actor, { action: 'preview_packet', packetId: packet.id, inputHash: packet.inputHash });
  check(stalePreview.response.status === 409, 'revoked-document-cannot-get-a-new-preview-link');
  report.status = 'passed';
}

try { await main(); }
catch (error) { report.status = 'stopped'; report.failure = error instanceof Stop ? { check: error.check, httpStatus: error.status, publicCode: error.code } : { check: 'unexpected-network-or-format-error', type: error instanceof Error ? error.name : 'Error' }; }
finally {
  if (process.argv.includes('--execute')) for (const actor of actors) {
    try {
      const identity = await api('/auth/v1/user', actor, undefined, 'GET');
      if (identity.body?.id !== actor.id || identity.body?.user_metadata?.qa_fixture !== true || identity.body?.user_metadata?.qa_run_id !== tag) throw new Stop('cleanup-requires-new-own-qa-account');
      const erased = await control(actor, { action: 'erase_loop', confirmErase: true });
      check(erased.snapshot?.profile === null && erased.snapshot?.claims.length === 0 && erased.snapshot?.packets.length === 0 && erased.snapshot?.runs.length === 0 && erased.snapshot?.schedule === null && erased.snapshot?.support.length === 0 && erased.snapshot?.pilot.enrolled === false, 'only-this-new-synthetic-loop-is-erased');
      const account = await api('/auth/v1/user', actor, undefined, 'GET');
      check(account.response.ok && account.body?.id === actor.id, 'synthetic-auth-account-is-preserved-after-loop-erasure');
      report.syntheticLoopsErased++;
    } catch (error) { report.cleanupFailure = error instanceof Stop ? { check: error.check, httpStatus: error.status, publicCode: error.code } : { check: 'synthetic-cleanup-not-confirmed', type: error instanceof Error ? error.name : 'Error' }; report.status = 'stopped'; }
  }
  report.finishedAt = new Date().toISOString();
  if (process.argv.includes('--save-report')) await writeFile(new URL('../docs/INTEGRATED-JOB-LOOP-HOSTED-VALIDATION.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
if (!['passed','prepared'].includes(report.status)) process.exitCode = 1;
