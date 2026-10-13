/** Run only after the release owner confirms that the router is active.
 * Default mode performs no network request. --execute creates one fictional QA
 * account and starts ONE candidate GPT run. No retry/resume, schedule, mailbox,
 * outreach, application, payment, account deletion or privileged key is used.
 * Output is sanitized metadata only; credentials remain in process memory.
 */
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { FIXED_ORIGIN, parsePublicConfig } from './run-admin-ticket.mjs';

const ORIGIN = 'https://jobvance.io';
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const MODEL = { provider: 'openai', model: 'gpt-6.1-sol', modelConsent: true, inboxConsent: false, processingRoute: 'openrouter' };
const TERMINAL = new Set(['completed', 'partial', 'blocked', 'failed', 'cancelled']);
const RUN_STATUSES = new Set(['queued', 'running', ...TERMINAL]);
const SAFE_CODES = new Set(['ADMIN_FORBIDDEN', 'UNAUTHORIZED', 'LOOP_PILOT_FULL', 'LOOP_BUDGET_LIMIT', 'LOOP_MODEL_NOT_CONFIGURED', 'LOOP_PROCESSING_ROUTE_CHANGED', 'LOOP_PROVIDER_UNCERTAIN', 'LOOP_ACTIVE_RUN', 'LOOP_DAILY_LIMIT', 'LOOP_DISABLED', 'LOOP_PERSISTENCE_FAILED']);
const pause = milliseconds => new Promise(done => setTimeout(done, milliseconds));
class Stop extends Error {
  constructor(check, httpStatus = null, publicCode = null) { super('HOSTED_QA_STOPPED'); this.check = check; this.httpStatus = httpStatus; this.publicCode = SAFE_CODES.has(publicCode) ? publicCode : null; }
}
function report() {
  return { kind: 'one-candidate-openrouter-synthetic-qa', startedAt: new Date().toISOString(), status: 'prepared', accountsCreated: 0, runStartRequests: 0,
    maximumModelCalls: 1, requestedModel: 'openai/gpt-6.1-sol', requestedRoute: 'openrouter', mediumEffortEvidence: 'source contract; provider request not observable through candidate API',
    sentMessages: 0, applicationSubmissions: 0, payments: 0, schedulesCreated: 0, accountsDeleted: 0, credentialsPrintedOrSaved: false,
    recordsRetainedForReconciliation: true, checks: [], limits: ['One synthetic vacancy proves this bounded path only, not live vacancy coverage or customer value.', 'Candidate API does not expose provider-returned model IDs or raw token usage.', 'No concurrent budget load test is performed. Unknown/pending usage is retained; this harness never retries or resumes a run.'] };
}
async function boundedJson(response) {
  if (!response.body || Number(response.headers.get('Content-Length') || 0) > 2500000) throw new Stop('bounded-response');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 2500000) { await reader.cancel(); throw new Stop('bounded-response'); } chunks.push(Buffer.from(part.value)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Stop('valid-json-response'); }
}
/** Compile the actual self-contained source matcher, rather than copying its
 * rule into the harness. The isolated module receives no host/network APIs. */
export async function loadDiscoveryMatcher() {
  const [source, adapterSource, engineSource, manifestText, ts] = await Promise.all([
    readFile(new URL('../supabase/functions/_shared/job-loop-runtime.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/_shared/job-loop-providers.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/_shared/job-loop-engine.ts', import.meta.url), 'utf8'),
    readFile(new URL('../docs/supabase-loop-ui/manifest.json', import.meta.url), 'utf8'),
    import('typescript'),
  ]);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const manifest = JSON.parse(manifestText);
  function declaredHash(path) {
    const found = [];
    function visit(value) { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') { if (value.path === path && typeof value.sha256 === 'string') found.push(value.sha256); Object.values(value).forEach(visit); } }
    visit(manifest); if (!found.length || found.some(value => value !== found[0])) throw new Stop('source-proof-present-in-release-manifest'); return found[0];
  }
  if (hash(source) !== declaredHash('supabase/functions/_shared/job-loop-runtime.ts') || hash(adapterSource) !== declaredHash('supabase/functions/_shared/job-loop-providers.ts') || hash(engineSource) !== declaredHash('supabase/functions/_shared/job-loop-engine.ts')) throw new Stop('source-proof-matches-release-manifest');
  // The public feed may override its configured company. Include the actual
  // response companies too; a metadata-only company proof would be incomplete.
  if (!adapterSource.includes('company: text(row.company,200)||feed.company||feed.board') || !adapterSource.includes('entries.slice(0, 100)')) throw new Stop('employer-company-mapping-contract-unchanged');
  const ast = ts.createSourceFile('matcher.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'matchesDiscoveryTarget');
  if (functions.length !== 1) throw new Stop('actual-discovery-matcher-found');
  const emitted = ts.transpileModule(functions[0].getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Script(emitted).runInNewContext({ exports }, { timeout: 1000 });
  if (typeof exports.matchesDiscoveryTarget !== 'function') throw new Stop('actual-discovery-matcher-loaded');
  const engineAst = ts.createSourceFile('engine.ts', engineSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  // All actual profile/claim helpers are retained. Unused schedule imports are
  // removed so this isolated proof has no module, network or filesystem access.
  const engineModule = ts.transpileModule(engineAst.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(engineAst)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  function validateFixtures(profile, claims) {
    const context = { exports: {}, serialized: JSON.stringify({ profile, claims }) };
    new Script(`${engineModule}\nconst fixture=JSON.parse(serialized); const profile=exports.validateProfile(fixture.profile); for(const claim of fixture.claims) exports.validateClaim(claim,profile);`).runInNewContext(context, { timeout: 1000 });
  }
  return { matches: exports.matchesDiscoveryTarget, validateFixtures, sourceSha256: hash(source), adapterSha256: hash(adapterSource), engineSha256: hash(engineSource) };
}
function feedIdentities(sources) {
  if (!Array.isArray(sources) || sources.length > 4) throw new Stop('bounded-configured-employer-feeds');
  return sources.map(source => {
    if (!source || !['greenhouse', 'lever'].includes(source.provider) || typeof source.board !== 'string' || !/^[a-z\d_-]{1,80}$/i.test(source.board) || typeof source.company !== 'string' || source.company.length > 200) throw new Stop('supported-public-feed-identities');
    return { provider: source.provider, board: source.board, company: source.company };
  });
}
async function exclusionProof(sources, profile, manual, fetcher, matcher) {
  const companies = sources.flatMap(source => [source.company || source.board, source.board]);
  let observedRows = 0;
  for (const feed of sources) {
    const url = feed.provider === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${feed.board}/jobs?content=true` : `https://api.lever.co/v0/postings/${feed.board}?mode=json&limit=100`;
    // Public employer GET only. Never attach Supabase or provider credentials.
    const response = await fetcher(url, { method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Stop('public-employer-feed-proof-readable', response.status);
    const payload = await boundedJson(response), rows = feed.provider === 'greenhouse' ? payload?.jobs : payload;
    if (!Array.isArray(rows)) throw new Stop('public-employer-feed-proof-shape');
    for (const row of rows.slice(0, 100)) { const company = typeof row?.company === 'string' ? row.company.slice(0, 200) : ''; companies.push(company || feed.company || feed.board); observedRows++; }
  }
  const terms = [...new Set(companies.map(company => company.trim().slice(0, 150).toLowerCase()))];
  if (terms.some(term => !term) || terms.length > 100) throw new Stop('employer-exclusions-fit-real-profile-contract');
  profile.excludedTerms = terms;
  const manualText = `${manual.title} ${manual.company} ${manual.description}`.toLowerCase();
  if (terms.some(term => manualText.includes(term) || profile.sourceText.toLowerCase().includes(term))) throw new Stop('feed-exclusions-do-not-restrict-fictional-manual-facts-or-company');
  // Worst-case matching title/location forces this test to rely on the explicit
  // exclusions. It covers every declared board/company and all response-company
  // overrides in the adapter's first 100 rows, including malformed job rows.
  for (const company of companies) if (matcher.matches(profile, { title: profile.targetTitles[0], location: profile.locations[0], company, description: 'Public feed exclusion challenge.' }) !== false) throw new Stop('actual-engine-blocks-every-feed-company-and-board');
  if (matcher.matches(profile, manual) !== true) throw new Stop('actual-engine-still-matches-fictional-manual-vacancy');
  return { feedCount: sources.length, observedRows, exclusionCount: terms.length };
}
export async function verifyCandidateOpenRouter({ execute = false, sourceReader = () => readFile(new URL('../.env.production', import.meta.url), 'utf8'), fetcher = fetch, sleep = pause } = {}) {
  const result = report();
  const check = (condition, name) => { if (!condition) throw new Stop(name); result.checks.push({ name, passed: true }); };
  if (!execute) { result.finishedAt = new Date().toISOString(); return result; }
  result.status = 'running';
  try {
    const config = parsePublicConfig(await sourceReader());
    check(config.url === FIXED_ORIGIN, 'public-only-project-bound-configuration');
    const tag = randomBytes(8).toString('hex'); result.qaRunId = tag;
    let actor;
    async function api(path, body, method = 'POST') {
      const url = new URL(path, FIXED_ORIGIN);
      const routes = new Map([['/auth/v1/signup', 'POST'], ['/auth/v1/user', 'GET'], ['/functions/v1/jobvance-admin', 'POST'], ['/functions/v1/job-loop-control', 'POST'], ['/rest/v1/job_loop_runs', 'GET']]);
      if (url.origin !== FIXED_ORIGIN || routes.get(url.pathname) !== method || (actor === undefined && url.pathname !== '/auth/v1/signup')) throw new Stop('fixed-first-party-endpoint-scope');
      if (url.pathname === '/rest/v1/job_loop_runs' && (!actor || url.searchParams.get('user_id') !== `eq.${actor.id}` || url.searchParams.get('id') !== `eq.${result.candidateRunId}` || url.searchParams.get('select') !== 'id,provider,model,consents,status' || [...url.searchParams].length !== 3)) throw new Stop('only-own-new-synthetic-run-read');
      const response = await fetcher(url.href, { method, headers: { apikey: config.key, Origin: ORIGIN, 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(25000) });
      return { status: response.status, ok: response.ok, body: await boundedJson(response) };
    }
    async function control(action) {
      if (!['get', 'save_profile', 'save_claim', 'add_opportunity', 'start_run'].includes(action.action)) throw new Stop('narrow-candidate-action-scope');
      if (action.action === 'start_run') {
        if (result.runStartRequests !== 0 || JSON.stringify(Object.fromEntries(Object.keys(MODEL).map(key => [key, action[key]]))) !== JSON.stringify(MODEL)) throw new Stop('exactly-one-consented-gpt-router-run');
        result.runStartRequests++;
      }
      const answer = await api('/functions/v1/job-loop-control', action);
      if (!answer.ok) throw new Stop(`control-${action.action}`, answer.status, answer.body?.code);
      return answer.body;
    }
    const signed = await api('/auth/v1/signup', { email: `jobvance-router-qa-${tag}@example.com`, password: `Aa1!${randomBytes(32).toString('base64url')}`, data: { qa_fixture: true, qa_run_id: tag } });
    if (UUID.test(signed.body?.user?.id || '')) result.accountsCreated = 1;
    check(signed.ok && UUID.test(signed.body?.user?.id || '') && typeof signed.body?.access_token === 'string' && signed.body.access_token.length > 20, 'new-standard-synthetic-signup-session');
    actor = { id: signed.body.user.id, token: signed.body.access_token }; result.qaUserId = actor.id;
    const identity = await api('/auth/v1/user', undefined, 'GET');
    check(identity.ok && identity.body?.id === actor.id && identity.body?.user_metadata?.qa_fixture === true && identity.body?.user_metadata?.qa_run_id === tag, 'verified-own-new-qa-session');
    const denied = await api('/functions/v1/jobvance-admin', { action: 'snapshot', days: 7 });
    check(denied.status === 403 && denied.body?.code === 'ADMIN_FORBIDDEN' && Object.keys(denied.body).every(key => ['code', 'error'].includes(key)), 'ordinary-qa-user-admin-api-403-without-private-records');
    result.adminDeniedHttpStatus = denied.status;
    function preflight(snapshot, fresh = false) {
      check(snapshot && snapshot.capabilities?.cloudWorker === true && snapshot.models?.some(option => option.provider === MODEL.provider && option.model === MODEL.model && option.ready === true && option.transport === 'openrouter'), 'gpt-openrouter-route-reports-ready');
      check(snapshot.capabilities.webSearch === false, 'no-paid-search');
      feedIdentities(snapshot.employerSources);
      check(snapshot.gmail?.connected === false && snapshot.schedule === null, 'no-connected-mailbox-or-candidate-schedule');
      check(snapshot.budget?.scope === 'shared_ai_search' && snapshot.budget.capUsd > 0 && snapshot.budget.capUsd <= 50 && snapshot.budget.remainingUsd >= 0.35, 'shared-bounded-ledger-has-conservative-one-call-headroom');
      if (fresh) check(snapshot.profile === null && snapshot.recordVersion === 0 && snapshot.claims?.length === 0 && snapshot.opportunities?.length === 0 && snapshot.runs?.length === 0 && snapshot.packets?.length === 0, 'brand-new-empty-candidate-record');
    }
    let snapshot = (await control({ action: 'get' })).snapshot; preflight(snapshot, true);
    const context = 'Generated QA Advisory | Operations Intern | 2025';
    const fact = 'Supported a weekly operations tracker and documented reporting procedures during a synthetic internship.';
    const education = 'Bachelor of Business Administration completed at Generated QA University in 2026.';
    const educationHeader = 'Generated QA University | 2026';
    const sourceText = ['Fictional QA candidate, not a real job seeker.', 'INTERNSHIPS', context, fact, 'EDUCATION', educationHeader, education].join('\n');
    // A unique fictional location is a second guard if public feed companies
    // change between the proof read and the worker's independent feed read.
    const location = `Fictional QA zone ${tag}`;
    const profile = { audience: 'student', name: `QA Router Candidate ${tag}`, contactLine: 'Fictional fixture; no contact details.', targetTitles: ['Graduate Operations Analyst'], locations: [location], experienceYears: null, languages: [], pageTarget: 1, discreetSearch: true, sourceText, excludedTerms: [], compensation: { currency: '', period: 'monthly', minimum: null } };
    const manual = { title: 'Graduate Operations Analyst', company: 'Generated QA Employer', location, url: `https://example.com/jobvance-router-qa/${tag}`, description: 'Fictional verification vacancy, not a real employer listing. Assist the operations team with a weekly operations tracker, reporting procedures and business administration tasks. Internship evidence is acceptable. No application will be submitted.', contact: null };
    const sources = feedIdentities(snapshot.employerSources), matcher = await loadDiscoveryMatcher();
    const proof = await exclusionProof(sources, profile, manual, fetcher, matcher);
    const claims = [{ sourceQuote: fact, context, kind: 'internship' }, { sourceQuote: education, context: educationHeader, kind: 'education' }].map(entry => ({ ...entry, sourceKind: 'cv_passage', phrasing: entry.sourceQuote, resultStatus: 'not_measured', confirmed: true, shareable: true }));
    try { matcher.validateFixtures(profile, claims); } catch { throw new Stop('fictional-profile-and-claims-pass-actual-provenance-validation'); }
    result.fixtureProvenanceProof = { claimCount: claims.length, candidateEngineSha256: matcher.engineSha256 };
    check(true, 'both-fictional-claims-pass-actual-source-context-validation-before-saving');
    result.feedExclusionProof = { ...proof, matcherSourceSha256: matcher.sourceSha256, employerAdapterSha256: matcher.adapterSha256 };
    check(true, 'actual-release-engine-blocks-feed-exclusions-and-preserves-manual-vacancy');
    snapshot = (await control({ action: 'save_profile', expectedVersion: snapshot.recordVersion, saveConsent: true, profile })).snapshot;
    for (const claim of claims) snapshot = (await control({ action: 'save_claim', expectedVersion: snapshot.recordVersion, claim })).snapshot;
    snapshot = (await control({ action: 'add_opportunity', expectedVersion: snapshot.recordVersion, opportunity: manual })).snapshot;
    check(snapshot.opportunities.length === 1 && snapshot.opportunities[0].source === 'manual' && snapshot.opportunities[0].verification === 'user_provided', 'one-explicitly-fictional-manual-vacancy');
    preflight(snapshot);
    check(JSON.stringify(feedIdentities(snapshot.employerSources)) === JSON.stringify(sources) && JSON.stringify(snapshot.profile?.excludedTerms) === JSON.stringify(profile.excludedTerms), 'saved-exclusions-and-feed-identities-unchanged-before-start');
    const requestId = randomUUID(); result.candidateRequestId = requestId;
    const started = await control({ action: 'start_run', requestId, ...MODEL });
    check(UUID.test(started.runId || ''), 'single-candidate-run-persisted'); result.candidateRunId = started.runId;
    const params = new URLSearchParams({ select: 'id,provider,model,consents,status', id: `eq.${started.runId}`, user_id: `eq.${actor.id}` });
    const owned = await api(`/rest/v1/job_loop_runs?${params}`, undefined, 'GET');
    check(owned.ok && Array.isArray(owned.body) && owned.body.length === 1 && owned.body[0].id === started.runId && owned.body[0].provider === MODEL.provider && owned.body[0].model === MODEL.model && owned.body[0].consents?.model === true && owned.body[0].consents?.inbox === false && owned.body[0].consents?.processingRoute === 'openrouter', 'own-saved-run-has-explicit-openrouter-processing-consent');
    let finished;
    for (let attempt = 0; attempt < 80; attempt++) {
      await sleep(5000); snapshot = (await control({ action: 'get' })).snapshot;
      const run = snapshot.runs.find(item => item.id === started.runId);
      if (run) {
        check(RUN_STATUSES.has(run.status) && Number.isFinite(run.usageUsd) && run.usageUsd >= 0 && run.usageUsd <= 50 && Number.isFinite(run.reservedUsd) && run.reservedUsd >= 0 && run.reservedUsd <= 50, 'bounded-run-status-and-cost-metadata');
        result.observedRunStatus = run.status; result.recordedCostUsd = run.usageUsd; result.retainedReservationUsd = run.reservedUsd;
      }
      if (run && TERMINAL.has(run.status)) { finished = run; break; }
    }
    check(finished, 'saved-run-reaches-terminal-state-without-retry-or-resume');
    check(['completed', 'partial'].includes(finished.status), 'candidate-model-path-completed-or-honestly-partial');
    check(snapshot.runs.length === 1 && finished.provider === MODEL.provider && finished.model === MODEL.model && finished.usageUsd > 0 && finished.usageUsd <= 0.35 && finished.reservedUsd === 0, 'one-run-has-positive-bounded-settled-model-usage');
    const packets = snapshot.packets.filter(item => item.runId === started.runId);
    check(packets.length === 1 && packets[0].status === 'review_required' && packets[0].cvText?.includes(fact), 'one-source-backed-packet-awaits-human-review');
    check(packets[0].messageText === '' && packets[0].emailBody === '', 'missing-recipient-produces-no-outreach');
    result.packetCount = packets.length; result.status = 'passed';
  } catch (error) {
    result.status = 'stopped'; result.failure = error instanceof Stop ? { check: error.check, httpStatus: error.httpStatus, publicCode: error.publicCode } : { check: 'unexpected-network-or-format-error', type: ['TypeError', 'AbortError', 'TimeoutError', 'SyntaxError'].includes(error?.name) ? error.name : 'Error' };
  }
  result.finishedAt = new Date().toISOString(); return result;
}
export async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || args.length === 1 && args[0] !== '--execute') { process.stdout.write(JSON.stringify({ status: 'stopped', failure: { check: 'use-default-preview-or-execute-only' } }) + '\n'); process.exitCode = 1; return; }
  const result = await verifyCandidateOpenRouter({ execute: args[0] === '--execute' });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n'); if (!['prepared', 'passed'].includes(result.status)) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { process.stderr.write('Hosted synthetic verification could not produce its sanitized report.\n'); process.exitCode = 1; });
