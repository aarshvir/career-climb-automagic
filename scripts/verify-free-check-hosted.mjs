/** Authorized first-party synthetic QA. No customer reads, file uploads, payments or deletes. */
import { randomBytes, randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'gvftdfriujrkpptdueyb';
const EXPECTED_API = `https://${PROJECT}.supabase.co`;
const ORIGIN = 'https://jobvance.io';
const CONFIG_SOURCES = {
  main: 'https://raw.githubusercontent.com/aarshvir/career-climb-automagic/main/.env.production',
  'reviewed-branch': 'https://raw.githubusercontent.com/aarshvir/career-climb-automagic/codex/jobvance-real-mvp/.env.production',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class VerificationStop extends Error {
  constructor(code, label, httpStatus = null) { super(code); this.code = code; this.label = label; this.httpStatus = httpStatus; }
}
function requireCheck(condition, label, status = null) {
  if (!condition) throw new VerificationStop('CHECK_FAILED', label, status);
}
function jwtClaims(token) {
  try {
    if (typeof token !== 'string' || token.length > 10000 || token.split('.').length !== 3) throw new Error();
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch { throw new VerificationStop('CREDENTIAL_REJECTED', 'token-format'); }
}

export function parsePublishedConfiguration(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 20000) throw new VerificationStop('CONFIG_REJECTED', 'bounded-published-config');
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/.exec(line);
    if (match) {
      if (values.has(match[1])) throw new VerificationStop('CONFIG_REJECTED', 'unambiguous-published-config');
      values.set(match[1], match[2].trim());
    }
  }
  const url = values.get('VITE_SUPABASE_URL')?.replace(/\/$/, '');
  const key = values.get('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (url !== EXPECTED_API || !key || key.startsWith('sb_secret_')) throw new VerificationStop('CONFIG_REJECTED', 'fixed-project-public-key');
  const claims = jwtClaims(key);
  if (claims.role !== 'anon' || claims.ref !== PROJECT) throw new VerificationStop('CONFIG_REJECTED', 'published-anon-role-and-project');
  return { url, key };
}

export function validateRequestScope(config, path, { method = 'GET', token = null, body } = {}, scope) {
  const url = new URL(path, config.url);
  if (config.url !== EXPECTED_API || url.origin !== EXPECTED_API || url.username || url.password || url.hash) throw new VerificationStop('SCOPE_REJECTED', 'fixed-first-party-token-recipient');
  if (method === 'DELETE') throw new VerificationStop('DELETION_BLOCKED', 'retain-private-fixtures');
  const allowed = {
    '/auth/v1/signup': ['POST'], '/auth/v1/user': ['GET'],
    '/rest/v1/cv_checks': ['GET', 'POST', 'PATCH'], '/functions/v1/get-entitlement': ['POST'],
  };
  if (!allowed[url.pathname]?.includes(method)) throw new VerificationStop('SCOPE_REJECTED', 'exact-path-and-method-allowlist');
  if (token) {
    const userId = scope.tokens.get(token);
    const claims = jwtClaims(token);
    if (!userId || claims.role !== 'authenticated' || claims.sub !== userId || claims.iss !== `${EXPECTED_API}/auth/v1`) throw new VerificationStop('CREDENTIAL_REJECTED', 'fresh-fixture-session-only');
  }
  if (url.pathname === '/auth/v1/signup') {
    if (token || url.search || !scope.emails.has(body?.email) || typeof body?.password !== 'string' || body.password.length < 40) throw new VerificationStop('SCOPE_REJECTED', 'standard-synthetic-signup-only');
  } else if (url.pathname === '/auth/v1/user') {
    if (!token || url.search || body !== undefined) throw new VerificationStop('SCOPE_REJECTED', 'own-fixture-session-only');
  } else if (url.pathname === '/functions/v1/get-entitlement') {
    if (!token || url.search || !body || Object.keys(body).length) throw new VerificationStop('SCOPE_REJECTED', 'read-only-entitlement-body');
  } else {
    const permittedKeys = new Set(['id', 'user_id', 'request_id', 'select']);
    for (const [key, value] of url.searchParams) {
      if (!permittedKeys.has(key) || url.searchParams.getAll(key).length !== 1) throw new VerificationStop('SCOPE_REJECTED', 'bounded-fixture-query');
      if (key === 'select' && value !== 'id,user_id,request_id,status,job_title,original_text,reviewed_text,method_version') throw new VerificationStop('SCOPE_REJECTED', 'fixed-fixture-columns');
    }
    const ownFilter = url.searchParams.get('user_id');
    const ownerId = ownFilter?.replace(/^eq\./, '');
    if (method === 'GET' || method === 'PATCH') {
      if (!ownFilter?.startsWith('eq.') || !scope.users.has(ownerId)) throw new VerificationStop('SCOPE_REJECTED', 'fresh-fixture-owner-filter-required');
      const recordFilter = url.searchParams.get('id');
      if (recordFilter && (!recordFilter.startsWith('eq.') || !scope.rows.has(recordFilter.slice(3)))) throw new VerificationStop('SCOPE_REJECTED', 'known-synthetic-row-only');
      const requestFilter = url.searchParams.get('request_id');
      if (requestFilter && (!requestFilter.startsWith('eq.') || !scope.requests.has(requestFilter.slice(3)))) throw new VerificationStop('SCOPE_REJECTED', 'known-fixture-request-only');
      if (method === 'PATCH' && (!token || !recordFilter)) throw new VerificationStop('SCOPE_REJECTED', 'bounded-synthetic-update-probe');
    } else if (url.search || !token || !scope.users.has(body?.user_id) || !scope.requests.has(body?.request_id)) {
      throw new VerificationStop('SCOPE_REJECTED', 'synthetic-insert-only');
    }
    if (body !== undefined && Buffer.byteLength(JSON.stringify(body)) > 150000) throw new VerificationStop('SCOPE_REJECTED', 'bounded-synthetic-payload');
  }
  return url;
}

async function boundedText(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new VerificationStop('RESPONSE_LIMIT', 'bounded-first-party-response'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function boundedJson(response) {
  const text = await boundedText(response, 1000000);
  try { return JSON.parse(text); } catch { return null; }
}

export function signupSession(response, body, fixture) {
  if (!response.ok) throw new VerificationStop('SIGNUP_DECLINED', 'standard-signup-no-bypass', response.status);
  if (!body?.access_token || !body?.user?.id) throw new VerificationStop('EMAIL_CONFIRMATION_REQUIRED', 'standard-signup-no-bypass', response.status);
  const claims = jwtClaims(body.access_token);
  if (!UUID.test(body.user.id) || body.user.email !== fixture.email || claims.role !== 'authenticated' || claims.sub !== body.user.id || claims.iss !== `${EXPECTED_API}/auth/v1`) throw new VerificationStop('SIGNUP_RESPONSE_REJECTED', 'new-fixture-identity-bound-to-session');
  return { userId: body.user.id, token: body.access_token };
}

async function main(configSource) {
  const fixtureTag = randomBytes(8).toString('hex');
  const report = { status: 'running', fixtureTag, counts: { accountsCreated: 0, checksCreated: 0, rejectedWrites: 0, networkRequests: 0, deletions: 0, privateFilesUploaded: 0, credentialsPrintedOrSaved: 0 }, checks: [] };
  const scope = { emails: new Set(), users: new Set(), tokens: new Map(), rows: new Set(), requests: new Set() };
  const pass = label => report.checks.push({ label, status: 'passed' });
  try {
  report.counts.networkRequests++;
  const configResponse = await fetch(CONFIG_SOURCES[configSource], { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) });
  if (!configResponse.ok) throw new VerificationStop('CONFIG_UNAVAILABLE', 'read-only-published-config', configResponse.status);
  const config = parsePublishedConfiguration(await boundedText(configResponse, 20000));
  pass('published-anon-role-and-exact-project-validated');
  async function api(path, options = {}) {
    const url = validateRequestScope(config, path, options, scope);
    const { method = 'GET', token, body } = options;
    report.counts.networkRequests++;
    const response = await fetch(url, { method, headers: { apikey: config.key, Origin: ORIGIN, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method === 'POST' && url.pathname === '/rest/v1/cv_checks' || method === 'PATCH' ? { Prefer: 'return=representation' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    return { response, body: await boundedJson(response) };
  }
  async function ok(path, options, label) {
    const result = await api(path, options);
    if (!result.response.ok) throw new VerificationStop('API_DECLINED', label, result.response.status);
    return result.body;
  }
  async function signup(suffix) {
    const fixture = { email: `jobvance-free-check-qa-${fixtureTag}-${suffix}@example.com`, password: `Aa1!${randomBytes(32).toString('base64url')}` };
    scope.emails.add(fixture.email);
    const result = await api('/auth/v1/signup', { method: 'POST', body: { ...fixture, data: { qa_fixture: true, qa_fixture_tag: fixtureTag } } });
    if (result.body?.user?.id) report.counts.accountsCreated++;
    const session = signupSession(result.response, result.body, fixture);
    scope.users.add(session.userId); scope.tokens.set(session.token, session.userId);
    const user = await ok('/auth/v1/user', { token: session.token }, 'synthetic-session-authenticated');
    requireCheck(user?.id === session.userId && user?.email === fixture.email, 'synthetic-user-session-validated');
    return session;
  }
  function requestId() { const id = randomUUID(); scope.requests.add(id); return id; }
  const columns = 'id,user_id,request_id,status,job_title,original_text,reviewed_text,method_version';
  function readPath(userId, request = null, id = null) { return `/rest/v1/cv_checks?user_id=eq.${userId}${request ? `&request_id=eq.${request}` : ''}${id ? `&id=eq.${id}` : ''}&select=${columns}`; }
  async function denied(path, options, label, statuses, sqlCode) {
    const result = await api(path, options);
    requireCheck(statuses.includes(result.response.status) && (!sqlCode || result.body?.code === sqlCode), label, result.response.status);
    if (options.method === 'POST' || options.method === 'PATCH') report.counts.rejectedWrites++;
    pass(label);
  }
  const owner = await signup('owner');
  pass('first-synthetic-standard-signup-and-own-session');
  const before = await ok('/functions/v1/get-entitlement', { method: 'POST', token: owner.token, body: {} }, 'entitlement-before-free-checks');
  requireCheck(Number.isInteger(before?.creditsRemaining) && before.creditsRemaining >= 0 && before.billingConfigured === false, 'billing-disabled-before-free-checks');
  pass('baseline-credits-read-and-billing-disabled');
  const source = [`Synthetic QA fixture ${fixtureTag}; not a real candidate.`, 'Alex Morgan at Example Advisory / Example Group (all fictional).', 'Helped design a procurement pilot across five units, with projected savings.', 'Created a tracker covering six workstreams. Prepared twelve leadership briefings.'].join('\n');
  const base = { user_id: owner.userId, company: 'Fictional QA Example Group', job_description: 'Synthetic vacancy for verification only: contribute to pilot design, track workstreams and prepare leadership briefings. No employer will be contacted.', original_text: source, reviewed_text: source, method_version: 'hosted-qa-v1', status: 'approved' };
  const first = { ...base, request_id: requestId(), job_title: `Synthetic QA ${fixtureTag} Strategy` };
  const second = { ...base, request_id: requestId(), job_title: `Synthetic QA ${fixtureTag} Transformation` };
  const saved = [];
  for (const payload of [first, second]) {
    const rows = await ok('/rest/v1/cv_checks', { method: 'POST', token: owner.token, body: payload }, 'owned-synthetic-snapshot-insert');
    requireCheck(Array.isArray(rows) && rows.length === 1 && UUID.test(rows[0]?.id) && rows[0].user_id === owner.userId && rows[0].request_id === payload.request_id && rows[0].status === 'approved' && rows[0].original_text === source && rows[0].reviewed_text === source, 'owned-approved-snapshot-response');
    scope.rows.add(rows[0].id); saved.push(rows[0]); report.counts.checksCreated++;
  }
  pass('two-owned-immutable-snapshots-created');
  await denied('/rest/v1/cv_checks', { method: 'POST', token: owner.token, body: first }, 'raw-retry-uniqueness-enforced', [409], '23505');
  const repeated = await ok(readPath(owner.userId, first.request_id), { token: owner.token }, 'retry-owned-row-read');
  requireCheck(Array.isArray(repeated) && repeated.length === 1 && repeated[0].id === saved[0].id && repeated[0].reviewed_text === source, 'retry-reconciles-to-one-existing-row');
  pass('fresh-owned-read-confirms-one-row-for-retried-request');
  const ownerRead = await ok(readPath(owner.userId), { token: owner.token }, 'two-owned-snapshot-read');
  requireCheck(Array.isArray(ownerRead) && ownerRead.length === 2 && ownerRead.every(row => scope.rows.has(row.id)), 'fresh-owner-read-only-synthetic-rows');
  pass('fresh-owner-read-confirms-both-snapshots');
  for (const [field, value] of [['original_text', 'A'.repeat(80) + ' '.repeat(60000)], ['reviewed_text', 'A'.repeat(80) + ' '.repeat(60000)], ['job_description', 'A'.repeat(80) + ' '.repeat(20000)], ['job_title', 'QA' + ' '.repeat(200)]]) {
    await denied('/rest/v1/cv_checks', { method: 'POST', token: owner.token, body: { ...first, request_id: requestId(), [field]: value } }, `server-raw-${field}-limit-enforced`, [400], '23514');
  }
  await denied(readPath(owner.userId, null, saved[0].id), { method: 'PATCH', token: owner.token, body: { reviewed_text: source + '\nSynthetic change.', status: 'draft' } }, 'owner-text-and-status-update-denied', [401, 403]);
  const stranger = await signup('isolation');
  requireCheck(stranger.userId !== owner.userId, 'two-distinct-fresh-accounts');
  pass('second-synthetic-standard-signup-and-own-session');
  const hidden = await ok(readPath(owner.userId, null, saved[0].id), { token: stranger.token }, 'foreign-synthetic-row-read');
  requireCheck(Array.isArray(hidden) && hidden.length === 0, 'foreign-read-is-empty');
  pass('foreign-read-cannot-see-first-fixture');
  await denied('/rest/v1/cv_checks', { method: 'POST', token: stranger.token, body: { ...first, request_id: requestId() } }, 'foreign-owner-impersonation-insert-denied', [401, 403]);
  await denied(readPath(owner.userId, null, saved[0].id), { method: 'PATCH', token: stranger.token, body: { reviewed_text: source + '\nSynthetic foreign change.' } }, 'foreign-update-denied', [401, 403]);
  await denied(readPath(owner.userId, null, saved[0].id), {}, 'anonymous-read-denied', [401, 403]);
  const finalRows = await ok(readPath(owner.userId), { token: owner.token }, 'final-owned-snapshot-read');
  requireCheck(Array.isArray(finalRows) && finalRows.length === 2 && finalRows.every(row => scope.rows.has(row.id) && row.status === 'approved' && row.reviewed_text === source), 'rejected-probes-left-snapshots-unchanged');
  pass('rejected-probes-did-not-change-owned-snapshots');
  const after = await ok('/functions/v1/get-entitlement', { method: 'POST', token: owner.token, body: {} }, 'entitlement-after-free-checks');
  requireCheck(after?.creditsRemaining === before.creditsRemaining && after?.billingConfigured === false, 'free-checks-consume-no-credits-and-billing-stays-disabled');
  pass('free-checks-consume-no-credits-and-billing-stays-disabled');
  report.status = 'passed';
  } catch (error) {
    report.status = 'stopped';
    report.stop = error instanceof VerificationStop ? { code: error.code, label: error.label, httpStatus: error.httpStatus } : { code: 'NETWORK_OR_RUNTIME_ERROR', label: 'bounded-first-party-requests' };
    process.exitCode = 1;
  }
  return report;
}

function selfTest() {
  let checks = 0;
  const test = fn => { fn(); checks++; };
  const fakeJwt = claims => `eyJ0ZXN0Ijp0cnVlfQ.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
  const publicKey = fakeJwt({ role: 'anon', ref: PROJECT });
  const source = `VITE_SUPABASE_URL=${EXPECTED_API}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}`;
  const config = parsePublishedConfiguration(source);
  const userId = randomUUID(); const rowId = randomUUID(); const request = randomUUID();
  const token = fakeJwt({ role: 'authenticated', sub: userId, iss: `${EXPECTED_API}/auth/v1` });
  const email = 'jobvance-free-check-qa-offline-owner@example.com';
  const scope = { emails: new Set([email]), users: new Set([userId]), tokens: new Map([[token, userId]]), rows: new Set([rowId]), requests: new Set([request]) };
  const own = `/rest/v1/cv_checks?user_id=eq.${userId}&id=eq.${rowId}`;
  const rejects = fn => assert.throws(fn, VerificationStop);
  test(() => assert.equal(config.url, EXPECTED_API));
  test(() => rejects(() => parsePublishedConfiguration(source.replace(publicKey, fakeJwt({ role: 'service_role', ref: PROJECT })))));
  test(() => rejects(() => parsePublishedConfiguration(source.replace(publicKey, 'sb_secret_fixture'))));
  test(() => rejects(() => parsePublishedConfiguration(source.replace(PROJECT, 'wrong-project'))));
  test(() => rejects(() => parsePublishedConfiguration(source.replace(publicKey, fakeJwt({ role: 'anon', ref: 'wrong-project' })))));
  test(() => rejects(() => parsePublishedConfiguration(source + '\nVITE_SUPABASE_URL=' + EXPECTED_API)));
  test(() => rejects(() => parsePublishedConfiguration('x'.repeat(20001))));
  test(() => rejects(() => validateRequestScope(config, 'https://example.com/rest/v1/cv_checks', { token }, scope)));
  test(() => rejects(() => validateRequestScope(config, `/rest/v1/cv_checks_extra?user_id=eq.${userId}`, { token }, scope)));
  test(() => rejects(() => validateRequestScope(config, '/auth/v1/admin/users', { method: 'POST', token }, scope)));
  test(() => rejects(() => validateRequestScope(config, '/functions/v1/tailor-cv', { method: 'POST', token, body: {} }, scope)));
  test(() => rejects(() => validateRequestScope(config, own, { method: 'DELETE', token }, scope)));
  test(() => rejects(() => validateRequestScope(config, '/rest/v1/cv_checks', { token }, scope)));
  test(() => rejects(() => validateRequestScope(config, `/rest/v1/cv_checks?user_id=eq.${randomUUID()}`, { token }, scope)));
  test(() => rejects(() => validateRequestScope(config, own + '&or=(id.not.is.null)', { token }, scope)));
  test(() => rejects(() => validateRequestScope(config, own + '&id=eq.' + rowId, { token }, scope)));
  test(() => rejects(() => validateRequestScope(config, '/functions/v1/get-entitlement', { method: 'GET', token }, scope)));
  test(() => rejects(() => validateRequestScope(config, own, { method: 'PATCH', token, body: { reviewed_text: 'x'.repeat(150001) } }, scope)));
  test(() => rejects(() => validateRequestScope(config, '/auth/v1/signup', { method: 'POST', body: { email: 'not-a-fixture@example.com', password: 'Aa1!' + 'x'.repeat(40) } }, scope)));
  test(() => rejects(() => validateRequestScope(config, own, { token: fakeJwt({ role: 'service_role', sub: userId, iss: `${EXPECTED_API}/auth/v1` }) }, scope)));
  test(() => assert.equal(validateRequestScope(config, own, { token }, scope).origin, EXPECTED_API));
  test(() => rejects(() => signupSession({ ok: false, status: 400 }, { error: 'declined' }, { email })));
  test(() => rejects(() => signupSession({ ok: true, status: 200 }, { user: { id: userId } }, { email })));
  test(() => rejects(() => signupSession({ ok: true, status: 200 }, { user: { id: userId, email: 'different@example.com' }, access_token: token }, { email })));
  test(() => rejects(() => signupSession({ ok: true, status: 200 }, { user: { id: userId, email }, access_token: fakeJwt({ role: 'authenticated', sub: userId, iss: 'https://wrong-project.supabase.co/auth/v1' }) }, { email })));
  test(() => assert.equal(signupSession({ ok: true, status: 200 }, { user: { id: userId, email }, access_token: token }, { email }).userId, userId));
  console.log(JSON.stringify({ status: 'offline-self-test-passed', checks, externalRequests: 0, credentialsPrintedOrSaved: 0 }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2);
  if (flags.length === 1 && flags[0] === '--self-test') selfTest();
  else if (flags.length === 0 || flags.length === 1 && /^--config-source=(main|reviewed-branch)$/.test(flags[0])) {
    try { console.log(JSON.stringify(await main(flags[0]?.split('=')[1] ?? 'reviewed-branch'), null, 2)); }
    catch (error) {
      const stop = error instanceof VerificationStop ? { code: error.code, label: error.label, httpStatus: error.httpStatus } : { code: 'NETWORK_OR_RUNTIME_ERROR', label: 'bounded-first-party-requests' };
      console.log(JSON.stringify({ status: 'stopped', stop, credentialsPrintedOrSaved: 0, deletions: 0 }));
      process.exitCode = 1;
    }
  } else {
    console.log(JSON.stringify({ status: 'stopped', stop: { code: 'ARGUMENT_REJECTED', label: 'no-credential-or-arbitrary-target-flags' }, externalRequests: 0 }));
    process.exitCode = 1;
  }
}
