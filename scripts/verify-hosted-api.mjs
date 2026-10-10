/**
 * Authorized first-party hosted QA only. Uses published anon configuration and
 * fresh example.com fixtures. Never reads browser sessions, local .env files,
 * owner credentials, service keys or Google endpoints. Never deletes records.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';

const PROJECT = 'gvftdfriujrkpptdueyb';
const PUBLIC_CONFIG = 'https://raw.githubusercontent.com/aarshvir/career-climb-automagic/codex/jobvance-real-mvp/.env.production';
const EXPECTED_API = `https://${PROJECT}.supabase.co`;
const ORIGIN = 'https://jobvance.io';
const report = {
  kind: 'hosted-first-party-api-fixtures', startedAt: new Date().toISOString(),
  apiProject: PROJECT, originHeader: ORIGIN, browserE2E: false, paymentE2E: false,
  status: 'running', accountsCreated: 0, privateFilesUploaded: 0,
  cvRowsCreated: 0, packsCreated: 0, trackerRowsCreated: 0,
  permanentDeletes: 0, credentialsPrintedOrSaved: false, checks: [],
};

class VerificationStop extends Error {
  constructor(code, check, httpStatus = null, publicCode = null) {
    super(code); this.code = code; this.check = check; this.httpStatus = httpStatus; this.publicCode = publicCode;
  }
}
function safeCode(value) { return typeof value === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(value) ? value : null; }
function requireCheck(condition, name) { if (!condition) throw new VerificationStop('CHECK_FAILED', name); }
function passed(name) { report.checks.push({ name, passed: true }); }

export function parsePublishedConfiguration(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/.exec(line);
    if (match) values.set(match[1], match[2].trim());
  }
  const url = values.get('VITE_SUPABASE_URL')?.replace(/\/$/, '');
  const key = values.get('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (url !== EXPECTED_API || typeof key !== 'string' || key.startsWith('sb_secret_')) throw new VerificationStop('PUBLIC_CONFIG_REJECTED', 'published-config-is-public-and-target-bound');
  // This particular reviewed public config uses the project's legacy anon JWT.
  // Require that role/ref; reject every other key, even if it came from a public file.
  let claims;
  try { claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8')); }
  catch { throw new VerificationStop('PUBLIC_CONFIG_REJECTED', 'published-anon-role'); }
  if (claims.role !== 'anon' || claims.ref !== PROJECT) throw new VerificationStop('PUBLIC_CONFIG_REJECTED', 'published-anon-role');
  return { url, key };
}

async function boundedJson(response, limit = 1000000) {
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > limit) throw new VerificationStop('RESPONSE_LIMIT', 'bounded-response');
  try { return JSON.parse(raw); } catch { return null; }
}
function requireOk(response, body, name) {
  if (!response.ok) throw new VerificationStop('API_DECLINED', name, response.status, safeCode(body?.code ?? body?.error_code));
}
function fixtureAccount(runId, suffix) {
  const email = `jobvance-qa-${runId}-${suffix}@example.com`;
  const password = `Aa1!${randomBytes(32).toString('base64url')}`;
  return { email, password };
}
function signupSession(response, body, name) {
  if (!response.ok) throw new VerificationStop('SIGNUP_DECLINED', name, response.status, safeCode(body?.code ?? body?.error_code));
  if (body?.user?.id) report.accountsCreated++;
  if (!body?.access_token || !body?.user?.id) throw new VerificationStop('EMAIL_CONFIRMATION_REQUIRED', name, response.status);
  if (!/^[0-9a-f-]{36}$/i.test(body.user.id)) throw new VerificationStop('INVALID_SIGNUP_RESPONSE', name, response.status);
  return { userId: body.user.id, token: body.access_token };
}

async function main() {
  const publicResponse = await fetch(PUBLIC_CONFIG, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) });
  if (!publicResponse.ok) throw new VerificationStop('PUBLIC_CONFIG_UNAVAILABLE', 'read-only-published-configuration', publicResponse.status);
  const publicSource = await publicResponse.text();
  if (publicSource.length > 20000) throw new VerificationStop('PUBLIC_CONFIG_REJECTED', 'published-configuration-size');
  const config = parsePublishedConfiguration(publicSource);
  passed('published-anon-key-role-and-project-validated');
  const runId = randomBytes(8).toString('hex');
  report.qaRunId = runId; // A non-credential fixture tag for later private reconciliation.

  async function api(path, { method = 'GET', token = null, body, contentType = 'application/json', prefer } = {}) {
    // Only this known first-party project receives auth/session headers.
    const url = new URL(path, config.url);
    if (url.origin !== EXPECTED_API || !/^\/(auth\/v1\/(signup|user)|rest\/v1\/(cv_documents|application_packs|tracked_applications|profiles|rpc\/jobvance_get_entitlement)|storage\/v1\/object\/(?:authenticated\/|public\/)?cv-documents\/|functions\/v1\/(get-entitlement|tailor-cv|create-checkout))/.test(url.pathname)) {
      throw new VerificationStop('REQUEST_SCOPE_REJECTED', 'fixed-first-party-api-scope');
    }
    if (method === 'DELETE') throw new VerificationStop('DELETION_NOT_AUTHORIZED', 'retain-private-qa-records');
    const headers = { apikey: config.key, Origin: ORIGIN, 'Content-Type': contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(prefer ? { Prefer: prefer } : {}) };
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : (contentType === 'application/json' ? JSON.stringify(body) : body),
      redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    return { response, body: await boundedJson(response) };
  }
  async function jsonOk(path, options, name) {
    const result = await api(path, options); requireOk(result.response, result.body, name); return result.body;
  }
  async function signup(suffix) {
    const fixture = fixtureAccount(runId, suffix);
    const result = await api('/auth/v1/signup', { method: 'POST', body: { ...fixture, data: { qa_fixture: true, qa_run_id: runId } } });
    // No sign-in, confirmation bypass, admin operation or alternate provider on decline.
    return signupSession(result.response, result.body, `synthetic-${suffix}-standard-signup`);
  }

  const owner = await signup('owner');
  passed('first-synthetic-standard-signup-returned-own-session');
  const authenticated = await jsonOk('/auth/v1/user', { token: owner.token }, 'own-user-session');
  requireCheck(authenticated?.id === owner.userId, 'session-belongs-to-synthetic-user');
  passed('synthetic-owner-session-validated');
  const entitlementBefore = await jsonOk('/functions/v1/get-entitlement', { method: 'POST', token: owner.token, body: {} }, 'deployed-entitlement');
  requireCheck(entitlementBefore?.creditsRemaining === 1 && entitlementBefore?.billingConfigured === false, 'one-free-pack-and-billing-disabled-before-any-fixture-work');
  passed('one-free-pack-and-live-billing-disabled');

  const anonymous = await api('/functions/v1/get-entitlement', { method: 'POST', body: {} });
  requireCheck(anonymous.response.status === 401, 'anonymous-handler-denied');
  passed('anonymous-entitlement-request-denied');

  // All content below is generated synthetic test data, held only in this process.
  const text = [`QA Fixture ${runId}`, 'Synthetic data analyst; not a real job seeker.', 'EXPERIENCE', 'Generated QA organization | 2024–2026',
    '- Documented support procedures for a generated test project.', '- Built Python and SQL reports for synthetic analytics fixtures.',
    'EDUCATION', 'Synthetic training entry for verification only.'].join('\n');
  const documentId = randomUUID();
  const storagePath = `${owner.userId}/${documentId}.txt`;
  const storageRoute = storagePath.split('/').map(encodeURIComponent).join('/');
  const upload = await api(`/storage/v1/object/cv-documents/${storageRoute}`, { method: 'POST', token: owner.token, contentType: 'text/plain', body: text });
  requireOk(upload.response, upload.body, 'private-synthetic-txt-upload'); report.privateFilesUploaded++;
  const cv = await jsonOk('/rest/v1/cv_documents', { method: 'POST', token: owner.token, prefer: 'return=representation', body: {
    id: documentId, user_id: owner.userId, storage_path: storagePath, original_filename: 'synthetic-qa.txt', mime_type: 'text/plain', byte_size: Buffer.byteLength(text), text_content: text,
  } }, 'synthetic-reviewed-text-persistence');
  requireCheck(Array.isArray(cv) && cv.length === 1 && cv[0].id === documentId, 'synthetic-cv-row-confirmed'); report.cvRowsCreated++;
  passed('private-txt-upload-and-reviewed-text-row-confirmed');

  const ownDownload = await fetch(`${config.url}/storage/v1/object/authenticated/cv-documents/${storageRoute}`, { headers: { apikey: config.key, Authorization: `Bearer ${owner.token}`, Origin: ORIGIN }, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) });
  requireCheck(ownDownload.ok && await ownDownload.text() === text, 'owned-private-document-download');
  const publicDownload = await api(`/storage/v1/object/public/cv-documents/${storageRoute}`);
  requireCheck([400, 401, 403, 404].includes(publicDownload.response.status), 'private-file-not-public');
  passed('owner-can-read-private-file-and-public-download-is-denied');

  const requestId = randomUUID();
  const packInput = { resumeId: documentId, requestId, jobTitle: 'Synthetic QA analyst', company: 'Generated QA organization', jobUrl: 'https://example.com/qa-generated-role',
    jobDescription: 'This is a synthetic verification role using Python, SQL analytics, documentation and generated reports. It is not a real vacancy and no application will be submitted.' };
  const first = await jsonOk('/functions/v1/tailor-cv', { method: 'POST', token: owner.token, body: packInput }, 'deployed-free-pack');
  requireCheck(first?.pack?.id && first.pack.user_id === owner.userId && first.pack.original_text === text, 'owned-grounded-pack-created');
  const pack = first.pack; report.packsCreated++;
  const retry = await jsonOk('/functions/v1/tailor-cv', { method: 'POST', token: owner.token, body: packInput }, 'idempotent-pack-retry');
  requireCheck(retry?.pack?.id === pack.id, 'retry-returned-same-pack');
  const entitlementAfter = await jsonOk('/functions/v1/get-entitlement', { method: 'POST', token: owner.token, body: {} }, 'post-pack-entitlement');
  requireCheck(entitlementAfter?.creditsRemaining === 0 && entitlementAfter?.billingConfigured === false, 'exactly-one-credit-consumed');
  const persistedPacks = await jsonOk(`/rest/v1/application_packs?user_id=eq.${owner.userId}&request_id=eq.${requestId}&select=id`, { token: owner.token }, 'persisted-pack-count');
  requireCheck(Array.isArray(persistedPacks) && persistedPacks.length === 1 && persistedPacks[0].id === pack.id, 'one-persisted-pack-for-two-identical-requests');
  passed('real-handler-created-one-pack-and-retry-used-no-second-credit');

  const approved = await jsonOk(`/rest/v1/application_packs?id=eq.${pack.id}&user_id=eq.${owner.userId}`, { method: 'PATCH', token: owner.token, prefer: 'return=representation', body: { tailored_text: pack.tailored_text, status: 'approved' } }, 'approval-persistence');
  requireCheck(Array.isArray(approved) && approved.length === 1 && approved[0].status === 'approved', 'pack-approval-confirmed');
  const tracking = await jsonOk('/rest/v1/tracked_applications', { method: 'POST', token: owner.token, prefer: 'return=representation', body: {
    user_id: owner.userId, pack_id: pack.id, job_title: packInput.jobTitle, company: packInput.company, job_url: packInput.jobUrl,
    status: 'saved', notes: 'Generated QA record only; no employer contacted and no application submitted.',
  } }, 'synthetic-tracker-save');
  requireCheck(Array.isArray(tracking) && tracking.length === 1 && tracking[0].id, 'synthetic-tracker-row-created'); report.trackerRowsCreated++;
  const trackerId = tracking[0].id;
  await jsonOk(`/rest/v1/tracked_applications?id=eq.${trackerId}&user_id=eq.${owner.userId}`, { method: 'PATCH', token: owner.token, prefer: 'return=representation', body: { status: 'applied', applied_at: new Date().toISOString(), notes: 'Explicit synthetic QA status transition; no real submission.' } }, 'synthetic-tracker-status-update');
  const reloaded = await jsonOk(`/rest/v1/tracked_applications?id=eq.${trackerId}&select=id,status,applied_at`, { token: owner.token }, 'synthetic-tracker-reload');
  requireCheck(Array.isArray(reloaded) && reloaded.length === 1 && reloaded[0].status === 'applied' && reloaded[0].applied_at, 'tracker-update-survived-api-reload');
  passed('approval-and-manual-tracker-status-survived-api-reload');

  const checkout = await api('/functions/v1/create-checkout', { method: 'POST', token: owner.token, body: { requestId: randomUUID() } });
  requireCheck(checkout.response.status === 503 && checkout.body?.code === 'BILLING_UNAVAILABLE', 'checkout-disabled-without-a-payment-session');
  passed('disabled-checkout-returned-no-payment-session');

  const stranger = await signup('isolation');
  const secondUser = await jsonOk('/auth/v1/user', { token: stranger.token }, 'second-own-session');
  requireCheck(secondUser?.id === stranger.userId && stranger.userId !== owner.userId, 'second-distinct-account-session');
  passed('second-distinct-synthetic-account-created-and-validated');
  for (const [table, id] of [['cv_documents', documentId], ['application_packs', pack.id], ['tracked_applications', trackerId]]) {
    const hidden = await jsonOk(`/rest/v1/${table}?id=eq.${id}&select=id`, { token: stranger.token }, `second-account-${table}-read`);
    requireCheck(Array.isArray(hidden) && hidden.length === 0, `second-account-${table}-cannot-read-first`);
  }
  const hiddenUpdate = await api(`/rest/v1/application_packs?id=eq.${pack.id}`, { method: 'PATCH', token: stranger.token, prefer: 'return=representation', body: { status: 'draft' } });
  requireCheck((hiddenUpdate.response.ok && Array.isArray(hiddenUpdate.body) && hiddenUpdate.body.length === 0) || [401, 403].includes(hiddenUpdate.response.status), 'second-account-cannot-edit-first-pack');
  const foreignDownload = await api(`/storage/v1/object/authenticated/cv-documents/${storageRoute}`, { token: stranger.token });
  requireCheck([400, 403, 404].includes(foreignDownload.response.status), 'second-account-cannot-download-first-private-file');
  passed('second-account-cannot-read-or-edit-first-records-or-download-private-file');

  const privileged = await api('/rest/v1/rpc/jobvance_get_entitlement', { method: 'POST', token: stranger.token, body: { p_user_id: owner.userId, p_billing_mode: 'test' } });
  requireCheck([401, 403].includes(privileged.response.status), 'browser-role-cannot-call-privileged-credit-rpc');
  const planWrite = await api(`/rest/v1/profiles?id=eq.${stranger.userId}`, { method: 'PATCH', token: stranger.token, prefer: 'return=representation', body: { plan: 'elite' } });
  requireCheck([401, 403].includes(planWrite.response.status), 'browser-role-cannot-write-own-premium-plan');
  const profile = await jsonOk(`/rest/v1/profiles?id=eq.${stranger.userId}&select=plan`, { token: stranger.token }, 'profile-remains-server-owned');
  requireCheck(Array.isArray(profile) && profile.length === 1 && profile[0].plan === 'free', 'rejected-plan-write-left-free-profile');
  passed('privileged-credit-rpc-and-browser-premium-plan-write-denied');
  report.status = 'passed';
}

function selfTest() {
  const fixtureJwt = claims => `eyJmaXh0dXJlIjp0cnVlfQ.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
  const config = role => `VITE_SUPABASE_URL=${EXPECTED_API}\nVITE_SUPABASE_PUBLISHABLE_KEY=${fixtureJwt({ role, ref: PROJECT })}`;
  assert.equal(parsePublishedConfiguration(config('anon')).url, EXPECTED_API);
  assert.throws(() => parsePublishedConfiguration(config('service_role')), VerificationStop);
  assert.throws(() => parsePublishedConfiguration(config('authenticated')), VerificationStop);
  assert.throws(() => parsePublishedConfiguration(config('anon').replace(PROJECT, 'another-project')), VerificationStop);
  const account = fixtureAccount('fixture', 'owner');
  assert.ok(account.email.endsWith('@example.com') && account.password.length >= 40);
  assert.throws(() => signupSession({ ok: false, status: 400 }, { code: 'email_address_invalid' }, 'signup'), error => error.code === 'SIGNUP_DECLINED');
  assert.throws(() => signupSession({ ok: true, status: 200 }, { user: { id: randomUUID() } }, 'signup'), error => error.code === 'EMAIL_CONFIRMATION_REQUIRED');
  assert.equal(safeCode('token value that must not be printed'), null);
  console.log(JSON.stringify({ selfTest: 'passed', checks: 8, externalRequests: 0, credentialsPrintedOrSaved: false }));
}

if (process.argv.includes('--self-test')) selfTest();
else {
  try { await main(); }
  catch (error) {
    report.status = 'stopped';
    report.stop = error instanceof VerificationStop ? { code: error.code, check: error.check, httpStatus: error.httpStatus, publicCode: error.publicCode } : { code: 'NETWORK_OR_RUNTIME_ERROR', check: 'bounded-first-party-requests' };
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    // Project/status/counts/fixture tag only. Never log response bodies, addresses,
    // passwords, tokens, identifiers of private rows, or fixture CV content.
    console.log(JSON.stringify(report, null, 2));
  }
}
