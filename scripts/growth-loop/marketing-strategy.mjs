import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const JOB_LOOP_POSITIONING = 'Jobvance automates your job search end to end.';
export const STRATEGY_FRESHNESS_DAYS = Object.freeze({
  owner_feedback: 90, research: 90, customer_interview: 180,
  competitor_claim: 30, product_receipt: 7, synthetic: 30,
});
const DAY = 86_400_000;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const text = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 4_000;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const calendarDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

function canonical(value, stack = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if ((!Array.isArray(value) && !plain(value)) || stack.has(value)) throw new TypeError('Strategy must contain finite JSON values without cycles.');
  stack.add(value);
  const result = Array.isArray(value)
    ? `[${Array.from(value, (v) => canonical(v, stack)).join(',')}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key], stack)}`).join(',')}}`;
  stack.delete(value);
  return result;
}

/** Every strategy field is bound, including Claude dispositions and test decisions. */
export function digestMarketingStrategyBrief(brief) {
  if (!plain(brief)) throw new TypeError('Expected a strategy brief object.');
  return sha(canonical(brief));
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Read one exact file identity. Callers must revalidate immediately before a
// dependent action; a successful local check is not a filesystem lease.
async function readBoundFile(root, relative, maxBytes) {
  if (!root || !text(relative) || path.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.includes('\0')) throw new Error('Invalid relative path.');
  const requested = path.resolve(root, relative);
  const resolved = await realpath(requested);
  if (!inside(root, resolved)) throw new Error('Outside evidence root.');
  const handle = await open(resolved, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > maxBytes) throw new Error('Invalid file size or type.');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const current = await stat(resolved);
    const same = (a, b) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino && a.dev === b.dev;
    if (!same(before, after) || !same(after, current) || bytes.length !== before.size || await realpath(requested) !== resolved) throw new Error('File changed during verification.');
    return { bytes, sha256: sha(bytes), size: bytes.length, identity: resolved };
  } finally { await handle.close(); }
}

const result = (errors, now, extra = {}) => ({
  ok: errors.length === 0, readyForCreative: errors.length === 0,
  errors, validatedAt: now, publicationAllowed: false, generationAllowed: false,
  ...extra,
});

/**
 * Evidence-backed creative admission, not audience validation or ad approval.
 * Source classes and summaries are accountable analyst attestations: hashes
 * establish which bytes were reviewed, not that every statement in them is true.
 * Evidence files must be bounded, sanitized text/reports (maximum 5 MiB each).
 */
export async function validateMarketingStrategyBrief(original, { evidenceRoot, now = Date.now() } = {}) {
  const errors = [];
  const fail = (code, field, message) => errors.push({ code, path: field, message });
  let brief;
  let strategyDigest = null;
  // Snapshot all caller intent synchronously before any filesystem await.
  try {
    if (!plain(original)) throw new Error();
    brief = JSON.parse(canonical(original));
    strategyDigest = digestMarketingStrategyBrief(brief);
  } catch { fail('INVALID_STRATEGY', '', 'A finite JSON strategy object is required.'); return result(errors, now, { strategyDigest }); }
  if (!Number.isFinite(now)) { fail('INVALID_CLOCK', 'now', 'A finite current timestamp is required.'); return result(errors, now, { strategyDigest }); }
  const date = (v) => typeof v === 'string' && DATE.test(v) && calendarDay(v.slice(0, 10)) && Number.isFinite(Date.parse(v)) && Date.parse(v) <= now;
  const shape = (v, keys, field) => {
    if (!plain(v)) { fail('INVALID_CATEGORY', field, 'Expected an object, not an array or null.'); return false; }
    if (Object.keys(v).some((key) => !keys.includes(key))) fail('UNKNOWN_FIELD', field, 'Unrecognized fields cannot extend strategy authority.');
    return true;
  };
  const list = (v, field, { min = 1, max = 50 } = {}) => {
    if (!Array.isArray(v) || v.length < min || v.length > max) { fail('INVALID_LIST', field, `Expected ${min} to ${max} items.`); return []; }
    return v;
  };
  const refs = (v, field, index, acceptedKinds) => {
    const values = list(v, field);
    const seen = new Set();
    for (const id of values) {
      if (typeof id !== 'string' || !index.has(id) || seen.has(id)) fail('INVALID_REFERENCE', field, 'References must identify distinct existing entries.');
      seen.add(id);
    }
    const rows = values.map((id) => index.get(id)).filter(Boolean);
    if (acceptedKinds && !rows.some((row) => acceptedKinds.includes(row.kind))) fail('WRONG_EVIDENCE_CLASS', field, `Requires source class ${acceptedKinds.join(' or ')}.`);
    return rows;
  };
  const indexed = (v, field, keys, check) => {
    const map = new Map();
    for (const [i, row] of list(v, field).entries()) {
      const at = `${field}[${i}]`;
      if (!shape(row, keys, at)) continue;
      if (!ID.test(typeof row.id === 'string' ? row.id : '') || map.has(row.id)) { fail('INVALID_ENTRY_ID', `${at}.id`, 'Every entry needs a distinct stable ID.'); continue; }
      map.set(row.id, row);
      check(row, at);
    }
    return map;
  };
  shape(brief, ['version', 'id', 'revision', 'createdAt', 'product', 'context', 'evidence', 'pains', 'alternatives', 'productProof', 'angles', 'tests', 'claudeInputs', 'selectedAngleId', 'readyForCreative'], '');
  if (brief.version !== 1 || !ID.test(typeof brief.id === 'string' ? brief.id : '') || !Number.isSafeInteger(brief.revision) || brief.revision < 1 || !date(brief.createdAt)) fail('INVALID_STRATEGY_IDENTITY', '', 'Version 1, stable ID, positive revision and nonfuture dated creation are required.');
  if (brief.product !== 'job_loop' || brief.readyForCreative !== true) fail('STRATEGY_NOT_ADMITTED', 'readyForCreative', 'The analyst must deliberately admit the recurring Job Loop brief for creative work.');
  const context = brief.context;
  if (shape(context, ['owner', 'market', 'audience', 'positioning', 'accountRequired', 'quizOptional'], 'context')) {
    if (context.owner !== 'Jobvance' || context.market !== 'US' || context.positioning !== JOB_LOOP_POSITIONING || context.accountRequired !== true || context.quizOptional !== true) fail('WRONG_PRODUCT_CONTEXT', 'context', 'Keep the US scope, exact owner positioning, Job Loop account requirement and optional quiz.');
    const audience = list(context.audience, 'context.audience', { max: 10 });
    if (audience.some((v) => !text(v))) fail('MISSING_AUDIENCE', 'context.audience', 'Name the actual audience, without inferred personal candidate data.');
    const normalized = audience.filter((v) => typeof v === 'string').join(' ').replace(/[-_]/g, ' ');
    if (!/\bjob\s*seekers?\b/i.test(normalized) || !/\bfinal\s+year\s+students?\b/i.test(normalized)) fail('WRONG_AUDIENCE_SCOPE', 'context.audience', 'Retain the authorized US job-seeker and final-year-student audiences.');
  }
  let root;
  try { root = await realpath(evidenceRoot); } catch { fail('EVIDENCE_ROOT_UNAVAILABLE', 'evidenceRoot', 'The explicit local evidence root is unavailable.'); }
  const evidence = indexed(brief.evidence, 'evidence', ['id', 'kind', 'observedAt', 'publicationDate', 'summary', 'path', 'sha256', 'bytes', 'url'], (row, at) => {
    const knownKind = typeof row.kind === 'string' && Object.hasOwn(STRATEGY_FRESHNESS_DAYS, row.kind);
    if (!knownKind) fail('INVALID_EVIDENCE_CLASS', `${at}.kind`, 'Use an explicit supported evidence class.');
    if (!date(row.observedAt)) fail('INVALID_OBSERVATION_TIME', `${at}.observedAt`, 'An actual nonfuture observation timestamp is required.');
    else if (knownKind && now - Date.parse(row.observedAt) > STRATEGY_FRESHNESS_DAYS[row.kind] * DAY) fail('STALE_EVIDENCE', at, 'Recheck this evidence before using it in a current creative strategy.');
    if (Object.hasOwn(row, 'publicationDate') && row.publicationDate !== null && (!calendarDay(row.publicationDate) || Date.parse(row.publicationDate) > Date.parse(row.observedAt))) fail('INVALID_PUBLICATION_DATE', `${at}.publicationDate`, 'Keep the original source publication date separately from verification time; use null if unknown.');
    if (!text(row.summary) || !HASH.test(typeof row.sha256 === 'string' ? row.sha256 : '') || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > 5 * 1024 * 1024) fail('INVALID_EVIDENCE_RECEIPT', at, 'A concise source summary and exact bounded file SHA-256/size are required.');
    if (Object.hasOwn(row, 'url')) {
      try { const u = new URL(row.url); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error(); }
      catch { fail('INVALID_SOURCE_URL', `${at}.url`, 'Use the actual public source URL without credentials.'); }
    }
  });
  const verifiedEvidence = [];
  const identities = new Set();
  for (const row of evidence.values()) {
    try {
      const actual = await readBoundFile(root, row.path, 5 * 1024 * 1024);
      if (identities.has(actual.identity)) fail('DUPLICATE_EVIDENCE_FILE', `evidence.${row.id}.path`, 'One source file may support many findings; list it once.');
      identities.add(actual.identity);
      if (actual.sha256 !== row.sha256 || actual.size !== row.bytes) fail('EVIDENCE_BYTES_MISMATCH', `evidence.${row.id}`, 'Current evidence bytes do not match the original source receipt.');
      verifiedEvidence.push({ id: row.id, kind: row.kind, observedAt: row.observedAt, publicationDate: row.publicationDate ?? null, path: row.path, sha256: actual.sha256, bytes: actual.size });
    } catch { fail('EVIDENCE_UNAVAILABLE', `evidence.${row.id}.path`, 'Evidence is missing, changed during reading, oversized, or outside the evidence root.'); }
  }
  const pains = indexed(brief.pains, 'pains', ['id', 'problem', 'sourceIds', 'status'], (row, at) => {
    if (!text(row.problem) || !['observed', 'hypothesis'].includes(row.status)) fail('INVALID_PAIN', at, 'State a concrete customer problem and its observed/hypothesis status.');
    const sources = refs(row.sourceIds, `${at}.sourceIds`, evidence, ['owner_feedback', 'research', 'customer_interview']);
    if (row.status === 'observed' && !sources.some((source) => ['research', 'customer_interview'].includes(source.kind))) fail('UNSUPPORTED_CUSTOMER_OBSERVATION', at, 'Owner feedback and synthetic scenarios alone are customer hypotheses, not observed customer validation.');
  });
  const alternatives = indexed(brief.alternatives, 'alternatives', ['id', 'name', 'sourceIds', 'tradeoff'], (row, at) => {
    if (!text(row.name) || !text(row.tradeoff)) fail('INVALID_ALTERNATIVE', at, 'Name the competitor or current workaround and the specific tradeoff.');
    refs(row.sourceIds, `${at}.sourceIds`, evidence, ['competitor_claim']);
  });
  const productProof = indexed(brief.productProof, 'productProof', ['id', 'capability', 'sourceIds', 'limitation'], (row, at) => {
    if (!text(row.capability) || !text(row.limitation)) fail('INVALID_PRODUCT_PROOF', at, 'State what the current product proves and the practical limit of that proof.');
    refs(row.sourceIds, `${at}.sourceIds`, evidence, ['product_receipt']);
  });
  const angles = indexed(brief.angles, 'angles', ['id', 'painIds', 'alternativeIds', 'proofIds', 'headline', 'promise', 'mechanism', 'cta'], (row, at) => {
    for (const key of ['headline', 'promise', 'mechanism', 'cta']) if (!text(row[key])) fail('MISSING_ANGLE_MESSAGE', `${at}.${key}`, 'Give the customer benefit, proof mechanism and action to create an account.');
    refs(row.painIds, `${at}.painIds`, pains);
    refs(row.alternativeIds, `${at}.alternativeIds`, alternatives);
    refs(row.proofIds, `${at}.proofIds`, productProof);
    // This is a narrow contradiction check, not a semantic fidelity score.
    const words = [row.headline, row.promise, row.mechanism, row.cta].filter((v) => typeof v === 'string').join(' ');
    if (/\b(?:guaranteed?\s+(?:job|interview|offer|hiring)|automatically\s+appl(?:y|ies)|appl(?:y|ies)\s+for\s+you|never\s+miss\s+(?:a|any|another)\s+job|(?:no|without)\s+(?:an?\s+)?account|(?:required|mandatory|compulsory)\s+quiz|90\s*%\s+(?:of\s+)?(?:the\s+)?work)\b|300\s*%/i.test(words)) fail('UNSUPPORTED_ANGLE_PROMISE', at, 'Do not promote unsupported guarantees, automation scope or account/quiz claims.');
  });
  if (typeof brief.selectedAngleId !== 'string' || !angles.has(brief.selectedAngleId)) fail('MISSING_SELECTED_ANGLE', 'selectedAngleId', 'Deliberately select one existing evidence-backed angle.');
  const selected = angles.get(brief.selectedAngleId);
  const researchedPain = Array.isArray(selected?.painIds) && selected.painIds.some((id) => {
    const pain = pains.get(id);
    return Array.isArray(pain?.sourceIds) && pain.sourceIds.some((sourceId) => ['research', 'customer_interview'].includes(evidence.get(sourceId)?.kind));
  });
  if (selected && !researchedPain) fail('SELECTED_PAIN_RESEARCH_REQUIRED', 'selectedAngleId', 'The selected angle must address at least one pain informed by retained customer interviews or external research; owner/model hypotheses alone are insufficient.');
  const tested = new Set();
  for (const [i, row] of list(brief.tests, 'tests').entries()) {
    const at = `tests[${i}]`;
    if (!shape(row, ['angleId', 'hypothesis', 'primaryMetric', 'guardrailMetric', 'decisionRule'], at)) continue;
    if (typeof row.angleId !== 'string' || !angles.has(row.angleId) || tested.has(row.angleId)) fail('INVALID_TEST_ANGLE', `${at}.angleId`, 'Give each tested angle one distinct existing angle reference.');
    tested.add(row.angleId);
    if (!['hypothesis', 'primaryMetric', 'guardrailMetric', 'decisionRule'].every((key) => text(row[key]))) fail('MISSING_TEST_DECISION', at, 'State a falsifiable hypothesis, actual primary/guardrail metrics and a decision rule; no manufactured target result.');
  }
  if (!tested.has(brief.selectedAngleId)) fail('SELECTED_ANGLE_UNTESTED', 'tests', 'The selected message needs a test hypothesis and measurement decision.');
  const claudeSources = new Set();
  for (const [i, row] of list(brief.claudeInputs, 'claudeInputs').entries()) {
    const at = `claudeInputs[${i}]`;
    if (!shape(row, ['evidenceId', 'disposition', 'reason'], at)) continue;
    if (typeof row.evidenceId !== 'string' || !evidence.has(row.evidenceId) || claudeSources.has(row.evidenceId)) fail('INVALID_CLAUDE_SOURCE', `${at}.evidenceId`, 'Bind each reviewed Claude input to a distinct retained evidence source.');
    claudeSources.add(row.evidenceId);
    if (!['adopt', 'adapt', 'defer', 'reject'].includes(row.disposition) || !text(row.reason)) fail('INVALID_CLAUDE_DECISION', at, 'Record whether to adopt, adapt, defer or reject the input, and why.');
  }
  return result(errors, now, {
    strategyDigest, strategyId: brief.id, revision: brief.revision,
    selectedAngleId: brief.selectedAngleId,
    selectedAngle: selected ?? null, evidence: verifiedEvidence,
  });
}

/** Read an exact strategy file and verify every dependency again for a new action. */
export async function validateCreativeStrategyBinding(original, { evidenceRoot, now = Date.now() } = {}) {
  const errors = [];
  const fail = (code, field, message) => errors.push({ code, path: field, message });
  let binding;
  try {
    if (!plain(original)) throw new Error();
    binding = JSON.parse(canonical(original));
  } catch { fail('STRATEGY_BINDING_REQUIRED', 'strategy', 'A current exact strategy file binding is required before fresh creative preparation or dispatch.'); return result(errors, now); }
  if (!Number.isFinite(now)) { fail('INVALID_CLOCK', 'now', 'A finite current timestamp is required.'); return result(errors, now); }
  if (Object.keys(binding).some((key) => !['path', 'sha256', 'bytes', 'strategyId', 'revision', 'strategyDigest', 'angleId'].includes(key)) || !text(binding.path) || !HASH.test(typeof binding.sha256 === 'string' ? binding.sha256 : '') || !Number.isSafeInteger(binding.bytes) || binding.bytes < 1 || binding.bytes > 1024 * 1024 || !ID.test(typeof binding.strategyId === 'string' ? binding.strategyId : '') || !Number.isSafeInteger(binding.revision) || binding.revision < 1 || !HASH.test(typeof binding.strategyDigest === 'string' ? binding.strategyDigest : '') || !ID.test(typeof binding.angleId === 'string' ? binding.angleId : '')) {
    fail('INVALID_STRATEGY_BINDING', 'strategy', 'Bind exact file bytes, canonical strategy digest, ID, revision and selected angle.'); return result(errors, now);
  }
  let brief;
  try {
    const root = await realpath(evidenceRoot);
    const actual = await readBoundFile(root, binding.path, 1024 * 1024);
    if (actual.sha256 !== binding.sha256 || actual.size !== binding.bytes) fail('STRATEGY_BYTES_MISMATCH', 'strategy', 'The strategy file differs from the original creative binding.');
    brief = JSON.parse(actual.bytes.toString('utf8'));
  } catch { fail('STRATEGY_FILE_UNAVAILABLE', 'strategy.path', 'The bound strategy JSON is missing, invalid, changed during reading, oversized or outside the evidence root.'); return result(errors, now); }
  const checked = await validateMarketingStrategyBrief(brief, { evidenceRoot, now });
  errors.push(...checked.errors.map((error) => ({ ...error, path: `strategy.${error.path}` })));
  if (checked.strategyId !== binding.strategyId || checked.revision !== binding.revision || checked.strategyDigest !== binding.strategyDigest || checked.selectedAngleId !== binding.angleId) fail('STRATEGY_IDENTITY_MISMATCH', 'strategy', 'The original strategy ID, revision, digest and selected angle must all match.');
  return { ...checked, ...result(errors, now), binding };
}
