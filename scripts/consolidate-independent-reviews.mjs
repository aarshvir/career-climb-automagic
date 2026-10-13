/** Offline, strict consolidation. Reads only the nine named sanitized reviews and public evidence. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_COMMIT, DIMENSIONS, canonicalEvidenceJson } from './build-independent-review-evidence.mjs';

export const PERSONAS = ['student', 'mba', 'professional'];
export const MODELS = [
  { key: 'gpt61-sol', label: 'GPT 6.1 Sol', requestedModel: 'gpt-6.1-sol', method: 'native_public_synthetic_journey_and_source' },
  { key: 'kimi-k3', label: 'Kimi K3', requestedModel: 'moonshotai/kimi-k3', method: 'external_frozen_source_packet' },
  { key: 'muse-spark-13', label: 'Muse Spark 1.3', requestedModel: 'meta/muse-spark-1.3', method: 'external_frozen_source_packet' },
];
const sha = value => createHash('sha256').update(value).digest('hex');
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const token = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Map(DIMENSIONS.map(([key]) => [token(key), key]));
// Operational trace supplied by the root from native worker logs and the shared ledger.
// This was not another logical review and contains no score or provider completion result.
const INTERRUPTED_ATTEMPT = {
  persona: 'mba', requestedModel: 'meta/muse-spark-1.3', effort: 'max',
  failure: 'WallClockTime', confirmedCause: 'The original attempt exceeded the free worker 150-second wall-clock limit.',
  status: 'uncertain', heldReservationMicros: 225976, heldReservationUsd: 0.225976, actualCostUsd: null,
  evidenceBasis: 'Root confirmed native worker logs and retained the original full reservation in the shared ledger; this consolidation did not inspect private production logs or credentials.',
  recovery: 'Root corrected the request timeout to 120 seconds and made one controlled replacement within the original $5 review-batch cap. It produced the saved MBA Muse review; the original reservation remains held.',
};
for (const [key, label] of DIMENSIONS) aliases.set(token(label), key);
for (const [key, names] of [
  ['user_need_value', ['userneed/value', 'need/value', 'need_value', 'user need and value']],
  ['ux_accessibility_mobile', ['UI/accessibility/mobile', 'ux/mobile/accessibility', 'UI UX accessibility mobile']],
  ['evidence_trust_document_quality', ['evidence/document trust', 'evidence/documenttrust', 'evidence document trust', 'evidence/document quality']],
  ['job_coverage_relevance', ['job coverage', 'jobcoverage/relevance']],
  ['automation_effort', ['automation/effort', 'automation effort']],
  ['tracking_actionability', ['tracking/actionability']],
  ['reliability_recovery', ['reliability/recovery']],
  ['privacy_control', ['privacy/control']],
  ['willingness_to_pay', ['willingness-to-pay', 'willingness to pay']],
]) for (const name of names) aliases.set(token(name), key);

/** Exact aliases only; a missing dimension is never inferred from a total or narrative. */
export function normalizeScores(review) {
  const candidate = review?.scores ?? review?.scoring?.categories ?? review?.category_scores
    ?? review?.parameter_scores ?? review?.parameters ?? review?.categories;
  let rows;
  if (Array.isArray(candidate)) rows = candidate;
  else if (candidate && typeof candidate === 'object') rows = Object.entries(candidate).map(([key, item]) =>
    item && typeof item === 'object' ? { ...item, category: key } : { category: key, score: item });
  else return { valid: false, errors: ['No supported category-score collection.'], values: null, mean: null };
  const values = {}, errors = [];
  for (const row of rows) {
    const originalName = row?.key ?? row?.category ?? row?.parameter ?? row?.name ?? row?.label;
    const key = aliases.get(token(originalName));
    if (!key) { errors.push(`Unknown category: ${String(originalName)}.`); continue; }
    if (Object.hasOwn(values, key)) { errors.push(`Duplicate category: ${key}.`); continue; }
    const value = row?.score;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 100) {
      errors.push(`Invalid 1–100 numeric score: ${key}.`); continue;
    }
    values[key] = value;
  }
  for (const [key] of DIMENSIONS) if (!Object.hasOwn(values, key)) errors.push(`Missing category: ${key}.`);
  if (rows.length !== 10) errors.push(`Expected ten category rows; found ${rows.length}.`);
  if (errors.length) return { valid: false, errors, values: null, mean: null };
  const ordered = Object.fromEntries(DIMENSIONS.map(([key]) => [key, values[key]]));
  return { valid: true, errors: [], values: ordered, sum: Object.values(ordered).reduce((sum, value) => sum + value, 0), mean: average(Object.values(ordered)) };
}

export function summarizeSpread(values) {
  if (!values.length) return { count: 0, mean: null, min: null, max: null, spread: null };
  const min = Math.min(...values), max = Math.max(...values);
  return { count: values.length, mean: average(values), min, max, spread: max - min };
}

function claimedMean(review) {
  const value = review?.consolidated_score ?? review?.scoring?.consolidated_equal_weight_mean
    ?? review?.overall_score ?? review?.overallScore ?? review?.consolidatedScore ?? review?.overall;
  if (typeof value === 'number') return value;
  return value?.equal_weight_mean ?? value?.mean ?? null;
}

export function consolidate(records, manifest) {
  const reviewerRows = PERSONAS.flatMap(persona => MODELS.map(model => {
    const sourceFile = `independent/${persona}-${model.key}.json`;
    const input = records[`${persona}/${model.key}`];
    const base = { persona, model: model.key, modelLabel: model.label, sourceFile, method: model.method };
    if (!input) return { ...base, status: 'missing', errors: ['Review file absent.'], computedMean: null, categories: null, original: null };
    if (input.readError) return { ...base, status: 'invalid', errors: [input.readError], computedMean: null, categories: null, original: null };
    const original = input.original;
    if (!original || typeof original !== 'object' || Array.isArray(original)) return {
      ...base, status: 'invalid', errors: ['Review payload must be a JSON object.'], inputSha256: input.sha256 ?? null,
      computedMean: null, categories: null, original,
    };
    const external = model.key !== 'gpt61-sol';
    const review = external ? original.review : original;
    const normalized = normalizeScores(review);
    const errors = [...normalized.errors], warnings = [];
    const sourceCommit = external ? original.baselineCommit : original.source_commit ?? original.scope?.source_commit;
    const nativeEffort = original.reviewer_provenance?.configured_reasoning_effort ?? original.reviewer_provenance?.reasoning_effort;
    if (sourceCommit !== BASELINE_COMMIT) errors.push('Baseline source commit missing or mismatched.');
    if (!external && original.reviewer_provenance?.configured_model !== model.requestedModel) errors.push('Native configured-model provenance missing or mismatched.');
    if (!external && nativeEffort !== 'high') errors.push('Native high reasoning configuration missing or mismatched.');
    if (external && original.evidenceSha256 !== manifest.evidenceSha256) errors.push('Frozen evidence hash missing or mismatched.');
    if (external && original.requestedModel !== model.requestedModel) errors.push('Requested model does not match the named review slot.');
    if (external && !(typeof original.returnedModel === 'string' && original.returnedModel)) errors.push('Actual returned-model provenance missing.');
    if (external && original.returnedModel !== original.requestedModel) errors.push('Returned model differs from requested model; no substitute review is counted.');
    if (external && original.effort !== 'max') errors.push('External review maximum reasoning configuration missing or mismatched.');
    if (external && original.persona !== persona) errors.push('External persona does not match the named review slot.');
    const stated = claimedMean(review);
    if (typeof stated === 'number' && normalized.valid && Math.abs(stated - normalized.mean) > 0.051) warnings.push('Reviewer-stated aggregate differs from the independently calculated mean; original is retained.');
    return {
      ...base, status: errors.length ? 'invalid' : 'complete', errors, warnings,
      provenance: external ? {
        kind: original.kind, requestedModel: original.requestedModel, returnedModel: original.returnedModel,
        effort: original.effort, evidenceSha256: original.evidenceSha256, usage: original.usage,
      } : {
        kind: 'native_agent_configuration', requestedModel: original.reviewer_provenance?.configured_model,
        returnedModel: null, effort: nativeEffort,
        qualification: 'Configured GPT 6.1 Sol/high from fresh-agent orchestration; no independent provider/runtime model introspection. Did not receive the external packet as its sole evidence.',
      },
      sourceCommit, inputSha256: input.sha256 ?? null, statedMean: stated,
      computedSum: errors.length ? null : normalized.sum,
      computedMean: errors.length ? null : normalized.mean,
      categories: errors.length ? null : normalized.values,
      original,
    };
  }));
  const valid = reviewerRows.filter(row => row.status === 'complete');
  const personas = PERSONAS.map(persona => {
    const rows = valid.filter(row => row.persona === persona);
    const complete = rows.length === MODELS.length;
    const categories = Object.fromEntries(DIMENSIONS.map(([key]) => [key, {
      ...summarizeSpread(rows.map(row => row.categories[key])),
      equalModelMean: complete ? average(rows.map(row => row.categories[key])) : null,
    }]));
    return {
      persona, status: complete ? 'complete' : 'incomplete', expectedModels: MODELS.length, completedModels: rows.length,
      equalModelMean: complete ? average(rows.map(row => row.computedMean)) : null,
      availableModelMean: average(rows.map(row => row.computedMean)),
      reviewerDisagreement: summarizeSpread(rows.map(row => row.computedMean)), categories,
    };
  });
  const complete = valid.length === PERSONAS.length * MODELS.length;
  const external = reviewerRows.filter(row => row.model !== 'gpt61-sol');
  const knownCosts = external.map(row => row.original?.usage?.actualMicros).filter(value => Number.isSafeInteger(value) && value >= 0);
  const confirmedMicros = knownCosts.reduce((sum, value) => sum + value, 0);
  const categoryMatrix = DIMENSIONS.map(([key, label]) => {
    const values = valid.map(row => row.categories[key]);
    return { key, label, reviews: Object.fromEntries(reviewerRows.map(row => [`${row.persona}/${row.model}`, row.categories?.[key] ?? null])),
      personaEqualModelMeans: Object.fromEntries(personas.map(row => [row.persona, row.categories[key].equalModelMean])),
      equalPersonaMean: complete ? average(personas.map(row => row.categories[key].equalModelMean)) : null,
      availableReviewDisagreement: summarizeSpread(values),
    };
  });
  return {
    version: 1, auditDate: '2026-10-12', baseline: { productionVersion: 12, sourceCommit: BASELINE_COMMIT, externalEvidenceSha256: manifest.evidenceSha256 },
    finalConsolidationDate: '2026-10-13',
    status: complete ? 'complete' : 'incomplete', expectedReviews: 9, completedReviews: valid.length,
    missingOrInvalid: reviewerRows.filter(row => row.status !== 'complete').map(({ persona, model, status, errors }) => ({ persona, model, status, errors })),
    method: {
      rubric: DIMENSIONS.map(([key, label]) => ({ key, label, weight: 0.1 })),
      formula: 'Each reviewer = sum(ten category scores)/10; each persona = sum(three reviewer means)/3; whole = sum(three persona means)/3. No weighting by cost, evidence volume, confidence or preferred outcome. Use unrounded numbers until display.',
      incomplete: 'Any missing/invalid review leaves that persona and the whole equal-weight mean null. Available means are labelled partial and are not the nine-review result. Missing is never zero.',
      disagreement: 'Min, max and max−min are descriptive reviewer disagreement, not a confidence interval or sampling error estimate.',
      noAnchoring: 'Original independent scores are preserved; improvement targets never enter the calculations.',
    },
    evidenceLimitations: [
      'Native GPT reviewers observed public pages and ephemeral synthetic guest journeys and inspected baseline source; their report-specific scopes and export checks differ. They did not authenticate or establish exact live deployment/source parity.',
      'External reviewers received the identical frozen public text/source packet, a persona-specific brief and the same rubric. They did not browse, log in or directly operate the product. The packet hash is comparable between external reviews, not proof of equivalent evidence to native observations.',
      'All included reviews assess production version 12 / source 2e134180a8cdbb248c5fa5dca01b1a1bf8b1fb69. Later guest coursework/page-target corrections and administration/router work are postbaseline and do not retroactively alter these scores.',
      'No real human usability study, measured first/second-application effort, representative vacancy benchmark, actual purchasing behavior, interview or employment outcomes are established. Willingness to pay is persona judgment.',
      'Code paths, test passes, available download links and fictional product examples are not evidence of successful authenticated journeys, completed downloads, recurring execution or human outcomes.',
      'Configured model provenance and actual returned provider model IDs are distinguished. Raw reports, provenance, usage and per-file hashes are retained below and in the immutable input files.',
      'The original MBA Muse call ended at the free worker WallClockTime limit without a review result. Its full USD 0.225976 reservation remains held as uncertain, not recorded as zero or released. Root made one controlled replacement after correcting the timeout; only its actual completed review occupies that logical model/persona slot.',
    ],
    externalExecutionAccounting: {
      completedCostRecords: knownCosts.length, expectedCostRecords: 6,
      confirmedCompletedCostMicros: knownCosts.length === 6 ? confirmedMicros : null,
      confirmedCompletedCostUsd: knownCosts.length === 6 ? confirmedMicros / 1000000 : null,
      knownAvailableCostUsd: confirmedMicros / 1000000,
      interruptedAttempt: INTERRUPTED_ATTEMPT,
      chargedOrHeldExposureUsd: knownCosts.length === 6 ? (confirmedMicros + INTERRUPTED_ATTEMPT.heldReservationMicros) / 1000000 : null,
      qualification: 'Completed costs come from the six sanitized usage.actualMicros records. The interrupted attempt has no known actual cost or completed score. Native Codex-provider usage/cost was not available in these files. Server HTTP 200 key validation was reported by root and is not a candidate-journey or customer-outcome proof.',
      limits: 'All external review attempts, including the retained uncertain reservation, share the original $5 batch limit and the $50 UTC-month AI/search ceiling. No new provider call is made by consolidation.',
    },
    whole: {
      equalPersonaMean: complete ? average(personas.map(row => row.equalModelMean)) : null,
      availableReviewMean: average(valid.map(row => row.computedMean)),
      availableMeanStatus: complete ? 'complete_nine_reviews' : 'partial_only_not_final',
      reviewerDisagreement: summarizeSpread(valid.map(row => row.computedMean)),
    }, personas, categoryMatrix, reviewerRows,
  };
}

const display = value => value === null || value === undefined ? '—' : value.toFixed(2);
export function markdown(result) {
  const lines = [
    '# Consolidated independent baseline review', '',
    `12 October 2026 · production version **12** · source \`${result.baseline.sourceCommit}\`.`, '',
    `**${result.status.toUpperCase()}: ${result.completedReviews}/9 valid reviews. Whole equal-persona score: ${display(result.whole.equalPersonaMean)}/100.**`, '',
    result.status === 'complete' ? 'This is a model-review baseline, not evidence of customer or hiring success.' : `The nine-review result is incomplete. The available-review mean (${display(result.whole.availableReviewMean)}) is partial; it must not be reported as the final score.`, '',
    '| Persona | GPT 6.1 Sol | Kimi K3 | Muse Spark 1.3 | Equal-model mean | Reviewer min–max | Spread |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const persona of result.personas) {
    const rows = MODELS.map(model => result.reviewerRows.find(row => row.persona === persona.persona && row.model === model.key));
    const spread = persona.reviewerDisagreement;
    lines.push(`| ${persona.persona} | ${rows.map(row => display(row.computedMean)).join(' | ')} | ${display(persona.equalModelMean)} | ${display(spread.min)}–${display(spread.max)} | ${display(spread.spread)} |`);
  }
  lines.push('', `Across valid reviewer means: ${display(result.whole.reviewerDisagreement.min)}–${display(result.whole.reviewerDisagreement.max)}, spread ${display(result.whole.reviewerDisagreement.spread)}. A spread is disagreement, not a confidence interval.`, '',
    '## Ten-category matrix', '',
    '| Category | Student GPT | Student Kimi | Student Muse | MBA GPT | MBA Kimi | MBA Muse | Professional GPT | Professional Kimi | Professional Muse | Equal-persona mean | Min–max | Spread |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const slots = PERSONAS.flatMap(persona => MODELS.map(model => `${persona}/${model.key}`));
  for (const row of result.categoryMatrix) {
    const spread = row.availableReviewDisagreement;
    lines.push(`| ${row.label} | ${slots.map(slot => display(row.reviews[slot])).join(' | ')} | ${display(row.equalPersonaMean)} | ${display(spread.min)}–${display(spread.max)} | ${display(spread.spread)} |`);
  }
  lines.push('', 'Each reviewer is recalculated from ten equal-weight scores. Each persona weights its three models equally; the whole weights its three personas equally. The JSON retains full precision; tables display two decimals. No prior reviewer mean, target, model cost or test count determines the score.', '',
    '## Provenance and review records', '',
    `Frozen external packet SHA-256: \`${result.baseline.externalEvidenceSha256}\`.`, '',
    '| Persona / reviewer | Status | Requested model | Returned model | Reasoning | Original report |',
    '|---|---|---|---|---|---|');
  for (const row of result.reviewerRows) {
    const p = row.provenance ?? {};
    const original = row.status === 'missing' ? 'Absent' : `[JSON](${row.sourceFile})`;
    const returned = p.returnedModel ?? (row.model === 'gpt61-sol' && row.provenance ? 'Unavailable (native configuration only)' : '—');
    lines.push(`| ${row.persona} / ${row.modelLabel} | ${row.status} | ${p.requestedModel ?? '—'} | ${returned} | ${p.effort ?? '—'} | ${original} |`);
  }
  for (const row of result.reviewerRows) for (const issue of [...(row.errors ?? []), ...(row.warnings ?? [])]) lines.push(`\n- ${row.persona} / ${row.modelLabel}: ${issue}`);
  lines.push('', 'Native narrative reports: [student](independent/student-gpt61-sol.md), [MBA](independent/mba-gpt61-sol.md), [professional](independent/professional-gpt61-sol.md). Full sanitized inputs and source-file hashes are embedded unchanged in [the consolidated JSON](CONSOLIDATED-REVIEW.json).', '',
    '## Execution accounting', '',
    `Final consolidation completed **13 October 2026**; the baseline and review directory intentionally remain 12 October. Six completed external reviews have confirmed cost **USD ${result.externalExecutionAccounting.confirmedCompletedCostUsd ?? 'unavailable'}**, independently summed from their usage records. The original interrupted MBA Muse attempt retains **USD 0.225976** as a fully held, uncertain reservation, so charged-or-held exposure is **USD ${result.externalExecutionAccounting.chargedOrHeldExposureUsd ?? 'unavailable'}**; actual interrupted-call cost is unknown.`, '',
    'Root confirmed the original free-worker **WallClockTime** failure, corrected the request timeout from the 150-second worker boundary to 120 seconds, and made one controlled replacement under the original $5 batch cap. The actual replacement scored 53.8 and cost USD 0.080038; its saved report is included once. No grade was supplied for the interrupted attempt, its reservation was not released, and no score or average was changed to compensate. Worker/ledger trace is root-reported; this offline script did not access production logs or credentials. Server HTTP 200 key validation was reported separately and does not prove a candidate journey or customer outcome.', '',
    '## Evidence boundaries', '', ...result.evidenceLimitations.map(item => `- ${item}`), '',
    '## Improvement and re-review', '',
    'The largest recurring native concerns are suitable vacancy coverage, first-use setup, second-application effort and proof that scheduled preparation works. Evidence truthfulness and explicit user control are relative strengths, with PDF/mobile, practical-condition extraction, support and erasure checks still needed. Read each external report for its independent judgment; the matrix preserves disagreement.', '',
    'The [ordered improvement plan](IMPROVEMENT-PLAN.md) defines engineering work, a ten-person free pilot, metric owners and acceptance checks. A 95+ ambition is an **UNVALIDATED target**, not a forecast or newly achieved grade. Need/value and willingness to pay require real customer evidence; code-only reruns cannot establish them.', '',
    'Reproduce offline with `node scripts/consolidate-independent-reviews.mjs`. Inputs remain unchanged. No provider call, production credential, account record, payment, outreach, deployment or application submission is used by this script.', '',
  );
  return lines.join('\n');
}

export async function main() {
  if (process.argv.length !== 2) throw new Error('This fixed offline consolidation accepts no overrides.');
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const audit = resolve(root, 'docs/audits/2026-10-12');
  const manifest = JSON.parse(await readFile(resolve(audit, 'evidence/manifest.json'), 'utf8'));
  const evidence = JSON.parse(await readFile(resolve(audit, 'evidence/public-source-baseline.json'), 'utf8'));
  if (manifest.sourceCommit !== BASELINE_COMMIT || evidence.sourceCommit !== BASELINE_COMMIT
    || sha(canonicalEvidenceJson(evidence)) !== manifest.evidenceSha256
    || JSON.stringify(evidence.rubric) !== JSON.stringify(DIMENSIONS.map(([key, label]) => ({ key, label })))) {
    throw new Error('Frozen public evidence provenance/rubric does not match the baseline.');
  }
  const records = {};
  await Promise.all(PERSONAS.flatMap(persona => MODELS.map(async model => {
    const key = `${persona}/${model.key}`;
    let content;
    try { content = await readFile(resolve(audit, 'independent', `${persona}-${model.key}.json`), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') records[key] = { readError: 'Review file could not be read.' }; return; }
    try { records[key] = { original: JSON.parse(content), sha256: sha(content) }; }
    catch { records[key] = { readError: 'Review file is not valid JSON.' }; }
  })));
  const result = consolidate(records, manifest);
  await writeFile(resolve(audit, 'CONSOLIDATED-REVIEW.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  await writeFile(resolve(audit, 'CONSOLIDATED-REVIEW.md'), markdown(result), 'utf8');
  // The marked baseline table in the plan is derived, never a predicted/achieved grade.
  const planPath = resolve(audit, 'IMPROVEMENT-PLAN.md');
  try {
    const plan = await readFile(planPath, 'utf8');
    const table = ['<!-- derived-baseline-start -->',
      `Baseline consolidation: **${result.status}, ${result.completedReviews}/9 valid reviews; whole mean ${display(result.whole.equalPersonaMean)}/100**. Missing or invalid reviews leave the final baseline unavailable.`, '',
      '| Category | Baseline equal-persona score | Stage-1 re-review target | Eventual target after customer validation |',
      '|---|---:|---|---|',
      ...result.categoryMatrix.map(row => `| ${row.label} | ${display(row.equalPersonaMean)} | ${['user_need_value', 'willingness_to_pay'].includes(row.key) ? 'No code-only score promise' : '85–92, UNVALIDATED'} | 95–98, UNVALIDATED |`),
      '<!-- derived-baseline-end -->'].join('\n');
    if (/<!-- derived-baseline-start -->[\s\S]*?<!-- derived-baseline-end -->/.test(plan)) await writeFile(planPath, plan.replace(/<!-- derived-baseline-start -->[\s\S]*?<!-- derived-baseline-end -->/, table), 'utf8');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  process.stdout.write(JSON.stringify({ status: result.status, completedReviews: result.completedReviews, whole: result.whole.equalPersonaMean, personas: result.personas.map(({ persona, equalModelMean }) => ({ persona, mean: equalModelMean })), missingOrInvalid: result.missingOrInvalid }) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  process.stderr.write(`Offline review consolidation failed: ${error.message}\n`); process.exitCode = 1;
});
