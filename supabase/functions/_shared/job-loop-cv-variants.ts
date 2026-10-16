import { validateClaim, validateProfile } from './job-loop-engine.ts';
import type { LoopClaim, LoopProfileInput } from './job-loop-types.ts';

/** Source-only contract foundation. Not registered as a public control action.
 * Authentication, ownership, lifecycle locks, limits and SQL fingerprints remain
 * server responsibilities; saving a variant never grants preparation approval. */
export interface CvVariantSaveIntent {
  expectedGeneration: number;
  expectedVersion: number;
  requestId: string;
  variantId: string | null;
  expectedVariantRevision: number;
  label: string;
  profile: LoopProfileInput;
  claimRefs: Array<{ id: string; revision: number }>;
  saveConsent: true;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAIM_ID = /^[A-Za-z0-9_-]{1,80}$/;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected a plain variant input.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) throw new Error('Unknown or privileged variant field.');
  return result;
}
function revision(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('Refresh the original variant revision before continuing.');
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Invalid variant request identity.');
  return value.toLowerCase();
}

export function validateCvVariantSaveIntent(value: unknown): CvVariantSaveIntent {
  const input = object(value, ['expectedGeneration', 'expectedVersion', 'requestId', 'variantId', 'expectedVariantRevision', 'label', 'profile', 'claimRefs', 'saveConsent']);
  if (input.saveConsent !== true) throw new Error('Confirm private saving of this CV variant.');
  const variantId = input.variantId === null ? null : uuid(input.variantId);
  const expectedVariantRevision = revision(input.expectedVariantRevision, variantId ? 1 : 0);
  if (variantId === null && expectedVariantRevision !== 0) throw new Error('A new variant must start at revision zero.');
  if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 80
    || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(input.label)) throw new Error('Use a short, readable CV variant name.');
  if (!Array.isArray(input.claimRefs) || input.claimRefs.length > 150) throw new Error('Choose at most 150 exact facts.');
  const seen = new Set<string>();
  const claimRefs = input.claimRefs.map(value => {
    const ref = object(value, ['id', 'revision']);
    if (typeof ref.id !== 'string' || !CLAIM_ID.test(ref.id) || seen.has(ref.id)) throw new Error('Choose distinct exact fact references.');
    seen.add(ref.id);
    return { id: ref.id, revision: revision(ref.revision, 1) };
  });
  return {
    expectedGeneration: revision(input.expectedGeneration), expectedVersion: revision(input.expectedVersion),
    requestId: uuid(input.requestId), variantId, expectedVariantRevision,
    label: input.label.trim(), profile: validateProfile(input.profile), claimRefs, saveConsent: true,
  };
}

type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}

/** Call synchronously before any auth/network await. No later displayed version,
 * mutable form reference or renewed consent may replace this original intent. */
export function captureCvVariantSaveIntent(value: unknown): Immutable<CvVariantSaveIntent> {
  return freeze(validateCvVariantSaveIntent(value));
}

/** Only pass a freshly owner-checked record here. This semantic check complements
 * the SQL's locked reference resolution; it is not an ownership check. Copied
 * permissions must be checked again at future admission and artifact approval. */
export function resolveCvVariantClaims(
  intent: Immutable<CvVariantSaveIntent>,
  currentProfile: LoopProfileInput | null,
  currentClaims: readonly LoopClaim[],
): LoopClaim[] {
  return intent.claimRefs.map(ref => {
    const matches = currentClaims.filter(claim => claim.id === ref.id);
    const claim = matches.length === 1 ? matches[0] : undefined;
    if (!claim || claim.revision !== ref.revision || claim.status !== 'active' || !claim.confirmed || !claim.shareable) {
      throw new Error('A chosen fact changed or is no longer shareable. Review it again.');
    }
    if (claim.sourceKind === 'cv_passage' && (!currentProfile || currentProfile.sourceText !== intent.profile.sourceText)) {
      throw new Error('CV passage confirmation belongs to a different source. Review the new source first.');
    }
    const { id, revision, status, createdAt, ...input } = claim;
    const validated = validateClaim(input, intent.profile as LoopProfileInput);
    if (Object.keys(validated).some(key => validated[key] !== input[key])) {
      throw new Error('The saved fact needs confirmation with its complete source context.');
    }
    return { ...validated, id, revision, status, createdAt };
  });
}
