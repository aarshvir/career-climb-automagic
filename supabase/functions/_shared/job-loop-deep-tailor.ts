import type { LoopClaim } from './job-loop-types.ts';
import { numbers, validateRewrite } from './cv-tailor.ts';

/** A display suggestion is never a replacement for an approved source claim. */
export type LoopClaimRewrite = Readonly<{
  claimId: string; revision: number; sourceQuote: string; sourcePhrasing: string;
  context: string; kind: LoopClaim['kind']; resultStatus: LoopClaim['resultStatus']; text: string;
}>;
export const LOOP_REWRITES_SCHEMA = {
  type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false,
    required: ['claimId', 'text'], properties: { claimId: { type: 'string' }, text: { type: 'string', minLength: 8, maxLength: 1500 } } },
};
export const LOOP_REWRITES_INSTRUCTION = 'You may also propose rewrites: an array of {claimId,text} for selected claims only. Rewrite each approved phrasing independently for clearer job relevance. Preserve every number, qualification, attribution, ownership level, negation and projected or uncertain result. Never combine claims or move facts between employers, courses, projects or CV variants. No new achievements or factual additions. An empty rewrites array is valid. These are unapproved suggestions for candidate review, not new source facts.';

/** Call only after resolving current variant/source authority. Capture before awaiting a provider. */
export function snapshotTailoringClaims(claims: LoopClaim[]): readonly Readonly<LoopClaim>[] {
  if (new Set(claims.map(claim => claim.id)).size !== claims.length) throw new Error('Duplicate claim authority.');
  return Object.freeze(claims.filter(claim => claim.status === 'active' && claim.confirmed && claim.shareable)
    .map(claim => Object.freeze({ ...claim })));
}

const negated = /\b(?:no|not|never|without|didn't|did not|cannot|can't|hasn't|haven't|wasn't|weren't)\b/iu;
const qualified = /\b(?:projected|estimated|expected|target|targeted|potential|forecast|forecasted|would|could|may|might|planned|proposed)\b/iu;
const mixedAttribution = /\b(?:supported|assisted|helped|contributed|participated|coordinated|(?:my|our|the)\s+(?:team|manager|colleague|supervisor))\b[\s\S]*\b(?:led|managed|owned|built|created|delivered|designed|ran)\b/iu;
const numberKey = (text: string) => numbers(text).sort().join('|');

/** Heuristic safety checks are bounded; the candidate still approves the exact final artifact. */
export function validateLoopRewrites(value: unknown, claims: readonly Readonly<LoopClaim>[], selectedIds: readonly string[]): LoopClaimRewrite[] {
  if (value === undefined) return []; // Older workers/provider responses may only select claims.
  if (!Array.isArray(value) || value.length > 16 || new Set(selectedIds).size !== selectedIds.length) throw new Error('Invalid tailoring suggestions.');
  const sources = new Map(claims.map(claim => [claim.id, claim]));
  if (sources.size !== claims.length) throw new Error('Duplicate claim authority.');
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).sort().join() !== 'claimId,text') throw new Error('Invalid tailoring suggestion shape.');
    const { claimId, text } = item as Record<string, unknown>;
    if (typeof claimId !== 'string' || !selectedIds.includes(claimId) || seen.has(claimId) || typeof text !== 'string' || text.length < 8 || text.length > 1500 || /[\r\n\u0000-\u001f<>]/u.test(text)) throw new Error('Invalid tailoring suggestion.');
    seen.add(claimId);
    const source = sources.get(claimId);
    if (!source || source.status !== 'active' || !source.confirmed || !source.shareable || !Number.isSafeInteger(source.revision) || source.revision < 1) throw new Error('The source claim is unavailable.');
    const proposed = text.trim();
    // Only the exact approved phrasing authorizes wording. A quote may contain other people's
    // achievements, so it is deliberately not pooled into the rewrite validation source.
    if (validateRewrite(proposed, [source.phrasing]) || numberKey(proposed) !== numberKey(source.phrasing)) throw new Error('The suggestion changes a source fact.');
    // Negated passages and projected results retain their original wording. A lexical check
    // cannot reliably prove the scope of a negation or turn a forecast into a measured result.
    if ((negated.test(source.phrasing) || qualified.test(source.phrasing) || mixedAttribution.test(source.phrasing) || source.resultStatus === 'projected') && proposed !== source.phrasing) throw new Error('Keep the exact qualified, attributed or negative source wording.');
    return Object.freeze({ claimId, revision: source.revision, sourceQuote: source.sourceQuote,
      sourcePhrasing: source.phrasing, context: source.context, kind: source.kind,
      resultStatus: source.resultStatus, text: proposed });
  });
}

/** Metered responses can survive retries. Their original source authority must survive too. */
export function validateLoopRewriteReceipts(value: readonly LoopClaimRewrite[] | undefined, claims: readonly Readonly<LoopClaim>[], selectedIds: readonly string[]): LoopClaimRewrite[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Invalid saved tailoring receipt.');
  const fields = ['claimId', 'revision', 'sourceQuote', 'sourcePhrasing', 'context', 'kind', 'resultStatus', 'text'].sort().join();
  for (const receipt of value) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).sort().join() !== fields) throw new Error('Invalid saved tailoring receipt.');
    const source = claims.find(claim => claim.id === receipt.claimId);
    if (!source || receipt.revision !== source.revision || receipt.sourceQuote !== source.sourceQuote || receipt.sourcePhrasing !== source.phrasing || receipt.context !== source.context || receipt.kind !== source.kind || receipt.resultStatus !== source.resultStatus) throw new Error('The saved tailoring source has changed.');
  }
  return validateLoopRewrites(value.map(receipt => ({ claimId: receipt.claimId, text: receipt.text })), claims, selectedIds);
}
