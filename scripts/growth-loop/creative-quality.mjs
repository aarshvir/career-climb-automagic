import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const HASH = /^[a-f0-9]{64}$/;
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const sha = (value) => createHash('sha256').update(value).digest('hex');

function canonical(value, stack = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if ((!Array.isArray(value) && !plain(value)) || stack.has(value)) throw new TypeError('Manifest must contain finite JSON values without cycles.');
  stack.add(value);
  const result = Array.isArray(value)
    ? `[${Array.from(value, (item) => canonical(item, stack)).join(',')}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key], stack)}`).join(',')}}`;
  stack.delete(value);
  return result;
}

/** Digest covers every manifest field except the approval that signs this digest. */
export function digestCreativeManifest(manifest) {
  if (!plain(manifest)) throw new TypeError('Expected a manifest object.');
  const { approval: _approval, ...content } = manifest;
  return sha(canonical(content));
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Fail-closed local publication gate; never publishes or invokes a provider.
 * Measurements and full-viewing reviews are explicit accountable attestations,
 * not inferred from a thumbnail or presented as automated semantic/video QA.
 * Call again immediately before publishing: a previous pass is not a file lease.
 */
export async function validateCreativeManifest(manifest, { assetRoot, now = Date.now() } = {}) {
  const errors = [];
  const assets = [];
  const fail = (code, field, message) => errors.push({ code, path: field, message });
  const timestamp = (value) => text(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
  let manifestDigest = null;
  let root;
  // Capture the complete original intent before the first filesystem await.
  // A caller editing the object during hashing cannot replace copy or approval.
  try { manifest = JSON.parse(canonical(manifest)); }
  catch { fail('INVALID_MANIFEST', '', 'A finite JSON manifest object is required.'); return { ok: false, errors, manifestDigest, assets, reviewed: false, validatedAt: now }; }
  if (!Number.isFinite(now)) fail('INVALID_CLOCK', 'now', 'A finite current timestamp is required.');
  try { root = await realpath(assetRoot); } catch { fail('ASSET_ROOT_UNAVAILABLE', 'assetRoot', 'The local asset root is unavailable.'); }
  try { manifestDigest = digestCreativeManifest(manifest); } catch { fail('INVALID_MANIFEST', '', 'A finite JSON manifest object is required.'); }
  if (!plain(manifest) || !manifestDigest) return { ok: false, errors, manifestDigest, assets, reviewed: false, validatedAt: now };
  if (manifest.version !== 1 || !text(manifest.id) || !Number.isSafeInteger(manifest.revision) || manifest.revision < 1) fail('INVALID_IDENTITY', 'revision', 'Version 1, a creative ID and a positive integer revision are required.');
  if (manifest.product !== 'job_loop') fail('WRONG_PRODUCT', 'product', 'This campaign promotes recurring Job Loop.');
  try {
    const url = new URL(manifest.destinationUrl);
    if (!['https://jobvance.io', 'https://www.jobvance.io'].includes(url.origin) || url.username || url.password || url.hash) throw new Error();
  } catch { fail('INVALID_DESTINATION', 'destinationUrl', 'Use an HTTPS Jobvance destination without credentials or a fragment.'); }
  const copy = manifest.copy;
  if (!plain(copy) || !['headline', 'body', 'cta', 'transcript'].every((key) => typeof copy[key] === 'string') || !['headline', 'body', 'cta'].every((key) => text(copy[key]))) fail('MISSING_COPY', 'copy', 'Headline, body, CTA and the complete transcript field are required.');
  const words = plain(copy) ? Object.values(copy).filter((value) => typeof value === 'string').join(' ').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ') : '';
  if (!/job\s*loop/i.test(words) || !/\b(account|sign\s*up|register)\b/i.test(words) || !/\b(recurring|schedule|scheduled|daily|weekly|every day|every week)\b/i.test(words)) fail('MISSING_PRODUCT_MESSAGE', 'copy', 'Copy must identify Job Loop, its account journey and recurring search.');
  const prohibited = [
    [/\b(no|without|skip)\s+(an?\s+)?(account|sign[ -]?up|registration)\b|\b(account|sign[ -]?up|registration)\s+(is\s+)?(not\s+required|optional)\b/i, 'Account-free claims conflict with the product.'],
    [/\b(mandatory|required|compulsory)\s+quiz\b|\bquiz\s+(is\s+)?(mandatory|required|compulsory)\b/i, 'Guided setup is optional.'],
    [/\b(guaranteed?\s+(job|interview|offer|hiring)|100%\s+(success|placement)|automatically\s+appl(?:y|ies)|appl(?:y|ies)\s+for\s+you)\b/i, 'Do not promise outcomes or automatic employer applications.'],
    [/\b(beta|no-signup|no-account)\b/i, 'Use the approved account-required product positioning.'],
  ];
  for (const [pattern, message] of prohibited) if (pattern.test(words)) fail('UNSUPPORTED_COPY', 'copy', message);
  const claims = manifest.claims;
  if (!plain(claims) || claims.accountRequired !== true || claims.quizOptional !== true || claims.recurringJobLoop !== true || claims.automaticApplications !== false || claims.guaranteedOutcome !== false) fail('INVALID_PRODUCT_CLAIMS', 'claims', 'Explicit account-required, optional-quiz, recurring-search and no-guarantee/application claims are required.');
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) fail('MISSING_ASSETS', 'assets', 'At least one actual local asset is required.');
  const ids = new Set();
  const paths = new Set();
  for (const [index, asset] of (Array.isArray(manifest.assets) ? manifest.assets : []).entries()) {
    const field = `assets[${index}]`;
    if (!plain(asset)) { fail('INVALID_ASSET', field, 'Expected an asset object.'); continue; }
    if (!text(asset.id) || ids.has(asset.id)) fail('DUPLICATE_ASSET_ID', `${field}.id`, 'Every asset needs a unique nonempty ID.');
    ids.add(asset.id);
    if (!['video', 'image'].includes(asset.kind)) fail('INVALID_MEDIA_KIND', `${field}.kind`, 'Only reviewed video and image assets are supported.');
    if (!HASH.test(asset.sha256 ?? '') || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1) fail('INVALID_FILE_RECEIPT', field, 'A SHA-256 digest and positive byte count are required.');
    let actualFile;
    try {
      if (!root || !text(asset.path) || path.isAbsolute(asset.path) || path.win32.isAbsolute(asset.path) || asset.path.includes('\0')) throw new Error();
      actualFile = await realpath(path.resolve(root, asset.path));
      if (!inside(root, actualFile) || paths.has(actualFile)) throw new Error();
      paths.add(actualFile);
      const before = await stat(actualFile);
      if (!before.isFile() || before.size < 1) throw new Error();
      const actualHash = await hashFile(actualFile);
      const after = await stat(actualFile);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) fail('ASSET_CHANGED_DURING_CHECK', field, 'The file changed during validation.');
      if (actualHash !== asset.sha256 || before.size !== asset.bytes) fail('ASSET_BYTES_MISMATCH', field, 'Local bytes do not match the approved asset receipt.');
      assets.push({ id: asset.id, sha256: actualHash, bytes: before.size });
    } catch { fail('ASSET_UNAVAILABLE', `${field}.path`, 'The asset is missing, duplicated, not a file, or outside the asset root.'); }
    const provenance = asset.provenance;
    if (!plain(provenance) || !['synthetic_presenter', 'product_capture', 'licensed_media'].includes(provenance.origin) || provenance.testimonial !== false || !text(provenance.licenseEvidence)) fail('MISSING_PROVENANCE', `${field}.provenance`, 'Declare origin, rights evidence and that this is not a customer testimonial.');
    const measurements = asset.measurements;
    if (!plain(measurements) || !Number.isSafeInteger(measurements.width) || measurements.width < 1 || !Number.isSafeInteger(measurements.height) || measurements.height < 1 || measurements.assetSha256 !== asset.sha256 || !text(measurements.measuredBy) || !timestamp(measurements.measuredAt) || (asset.kind === 'video' && (!Number.isFinite(measurements.durationSeconds) || measurements.durationSeconds <= 0))) fail('MISSING_MEASUREMENTS', `${field}.measurements`, 'Dimensions and video duration need a dated measurement record bound to these exact bytes.');
    const review = asset.review;
    if (!plain(review) || !text(review.reviewer) || !timestamp(review.reviewedAt) || review.assetSha256 !== asset.sha256 || !((review.reviewerType === 'human' && review.method === 'human_full_asset') || (review.reviewerType === 'agent' && ((asset.kind === 'image' && review.method === 'agent_visual_full_asset') || (asset.kind === 'video' && review.method === 'agent_full_asset' && text(review.evidence))))) || review.coverage !== 'full' || review.visual !== true || review.copyAndClaims !== true || (asset.kind === 'video' && (review.audio !== true || review.captions !== true || (provenance?.origin === 'synthetic_presenter' && review.lipSync !== true)))) fail('FULL_REVIEW_REQUIRED', `${field}.review`, 'Every final asset needs an identified full visual/copy review; videos need full audio/captions review and synthetic presenters need lip-sync review.');
    if (asset.kind === 'video' && !text(copy?.transcript)) fail('MISSING_TRANSCRIPT', 'copy.transcript', 'The complete final video transcript is required for claims review.');
  }
  const approval = manifest.approval;
  if (!plain(approval) || approval.revision !== manifest.revision || approval.manifestDigest !== manifestDigest || !text(approval.approvedBy) || !timestamp(approval.approvedAt)) fail('EXACT_APPROVAL_REQUIRED', 'approval', 'Approval must identify the reviewer, time, exact revision and manifest digest.');
  if (plain(approval) && Array.isArray(manifest.assets) && manifest.assets.some((asset) => timestamp(asset?.review?.reviewedAt) && Date.parse(asset.review.reviewedAt) > Date.parse(approval.approvedAt))) fail('APPROVAL_PRECEDES_REVIEW', 'approval.approvedAt', 'Approval cannot predate full asset review.');
  return { ok: errors.length === 0, errors, manifestDigest, assets, reviewed: errors.length === 0, validatedAt: now };
}
