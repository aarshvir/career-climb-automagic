import { validateCreativeManifest } from './creative-quality.mjs';
import { decideGrowthAction, compareOrganic } from './measurement.mjs';
import { TARGETS, digest, canonical } from './receipt-store.mjs';

function caption(manifest) {
  return [manifest.copy.headline, manifest.copy.body, manifest.copy.cta].join('\n\n');
}
function operation(manifest, platform, quality) {
  return { kind: 'organic_post', platform, target: TARGETS[platform], content: {
    creativeId: manifest.id, revision: manifest.revision, manifestDigest: quality.manifestDigest,
    assetHashes: quality.assets.map(asset => asset.sha256), caption: caption(manifest), destinationUrl: manifest.destinationUrl,
  } };
}
/** Validate the actual local asset before queueing. No generation or network writes. */
export async function preparePost(store, manifest, { assetRoot, platform, now = Date.now() }) {
  manifest = JSON.parse(canonical(manifest));
  const quality = await validateCreativeManifest(manifest, { assetRoot, now });
  if (!quality.ok) return { status: 'blocked', quality };
  const queued = store.enqueue(operation(manifest, platform, quality), now);
  return { ...queued, quality };
}
/** Claim once immediately before a native connector/browser publication. Persist first.
 * Reconcile any interrupted attempt; never call this again to retry a platform write.
 */
export async function dispatchPost(store, id, manifest, { assetRoot, now = Date.now() }) {
  manifest = JSON.parse(canonical(manifest));
  const quality = await validateCreativeManifest(manifest, { assetRoot, now });
  if (!quality.ok) return { status: 'blocked', quality };
  const row = store.get(id);
  if (row.body.kind !== 'organic_post' || digest(row.body) !== digest(operation(manifest, row.body.platform, quality))) throw new Error('Queued content differs from the current reviewed manifest');
  const attempt = store.claim(id, { now, manifestDigest: quality.manifestDigest, quality });
  return { ...attempt, bodyDigest: digest(attempt.body), assetPaths: manifest.assets.map(asset => asset.path),
    next: 'Publish the exact asset and copy once through the connected platform. Read back its ID, URL and content before confirming. An uncertain result requires reconciliation.' };
}
/** Store aggregate evidence and deterministic recommendations, not invented delivery. */
export function assess(store, input, { organic } = {}) {
  const decision = decideGrowthAction(input);
  const decisionId = store.observe('measurement_decision', { input, decision }, input.now);
  const comparison = organic ? compareOrganic(organic) : null;
  if (comparison) store.observe('organic_comparison', { input: organic, comparison }, input.now);
  let queuedPause = null;
  if (decision.action === 'pause') queuedPause = store.enqueue({ kind: 'pause_campaign', platform: 'meta', target: TARGETS.campaign, content: { accountId: TARGETS.adAccount, reason: decision.pauseReasons.join('; '), decisionId } }, input.now);
  return { decisionId, decision, comparison, queuedPause, externalActionPerformed: false };
}
/** Pause recommendations must be re-evaluated against current evidence before dispatch. */
export function dispatchPause(store, id, input) {
  const decision = decideGrowthAction(input);
  const row = store.get(id);
  if (row.body.kind !== 'pause_campaign' || decision.action !== 'pause') throw new Error('A current stop decision is required');
  const observation = store.report().observations.find(item => item.id === row.body.content.decisionId);
  const withoutClock = ({now: _now, ...evidence}) => evidence;
  if (!observation || observation.kind !== 'measurement_decision' || digest(withoutClock(observation.body.input)) !== digest(withoutClock(input))) throw new Error('Pause must bind the exact evaluated evidence');
  store.observe('pause_dispatch_decision', {operationId:id,input,decision},input.now);
  const attempt = store.claim(id, { now: input.now });
  return { ...attempt, bodyDigest: digest(attempt.body), next: 'Pause only this campaign through the approved connected Meta account; verify platform status before confirming.' };
}
export function status(store, now = Date.now()) {
  const recovered = store.recover(now);
  return { generatedAt: new Date(now).toISOString(), recovered, ...store.report(),
    boundaries: { externalWrites: 'Native platform connector or browser with exact durable attempt and readback', purchases: false, automatedScale: false, customerData: false, coldEmail: 'draft_only' } };
}
