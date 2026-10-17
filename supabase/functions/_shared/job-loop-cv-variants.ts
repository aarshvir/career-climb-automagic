import { validateClaim, validateProfile } from './job-loop-engine.ts';
import type { LoopClaim, LoopProfileInput, LoopCvVariant, LoopCvVariantSaveReceipt, LoopCvVariants } from './job-loop-types.ts';

/** CV variant contract. Candidate UI integration is deliberately separate.
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
    if ((Object.keys(validated) as Array<keyof typeof validated>).some(key => validated[key] !== input[key])) {
      throw new Error('The saved fact needs confirmation with its complete source context.');
    }
    return { ...validated, id, revision, status, createdAt };
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  const stable = (value: unknown): string => value && typeof value === 'object'
    ? Array.isArray(value) ? `[${value.map(stable).join(',')}]` : `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable((value as Record<string,unknown>)[key])}`).join(',')}}`
    : JSON.stringify(value);
  return stable(left) === stable(right);
}
function completeObject(value: unknown, keys: string[]): Record<string, unknown> {
  const result=object(value,keys);
  if(keys.some(key=>!Object.prototype.hasOwnProperty.call(result,key)))throw new Error('The saved CV variant receipt is incomplete.');
  return result;
}
function hash(value: unknown): string {
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new Error('The saved CV variant fingerprint is invalid.');
  return value;
}
function instant(value: unknown): string {
  if(typeof value!=='string'||value.length>80||!Number.isFinite(Date.parse(value)))throw new Error('The saved CV variant date is invalid.');
  return value;
}
export function validateCvVariantSnapshot(value: unknown, generation: number): LoopCvVariant {
  const v=completeObject(value,['id','generation','revision','label','profile','claims','sourceHash','createdAt','updatedAt']);
  if(revision(v.generation)!==generation)throw new Error('The CV variant belongs to a different workspace lifetime.');
  if(typeof v.label!=='string'||v.label!==v.label.trim()||!v.label||v.label.length>80||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v.label))throw new Error('The saved CV variant name is invalid.');
  const profile=validateProfile(v.profile);
  if(!sameJson(profile,v.profile))throw new Error('The saved CV source is not canonical.');
  if(!Array.isArray(v.claims)||v.claims.length>150)throw new Error('The saved CV facts are invalid.');
  const ids=new Set<string>();
  const claims=v.claims.map(value=>{
    const c=completeObject(value,['id','revision','status','createdAt','sourceKind','sourceQuote','phrasing','context','kind','resultStatus','confirmed','shareable']);
    if(typeof c.id!=='string'||!CLAIM_ID.test(c.id)||ids.has(c.id)||c.status!=='active'||c.confirmed!==true||c.shareable!==true)throw new Error('The saved CV fact authority is invalid.');
    ids.add(c.id);
    const {id,revision:claimRevision,status,createdAt,...input}=c;
    // Structural validation only: archived facts may later require fresh
    // confirmation. A receipt is never current approval or sharing authority.
    const savedInput={...input};
    for(const [key,max,min] of [['sourceQuote',3000,8],['phrasing',1500,8],['context',200,1]] as const){
      const text=savedInput[key];if(typeof text!=='string'||text.length>max||text.trim().length<min||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/u.test(text))throw new Error('The saved CV fact text is invalid.');
    }
    if(typeof input.sourceKind!=='string'||!['cv_passage','user_answer'].includes(input.sourceKind)
      ||typeof input.kind!=='string'||!['employment','internship','academic_project','personal_project','volunteering','education','skill'].includes(input.kind)
      ||typeof input.resultStatus!=='string'||!['measured','projected','not_measured'].includes(input.resultStatus))throw new Error('The saved CV fact category is invalid.');
    return {...savedInput,id,revision:revision(claimRevision,1),status,createdAt:instant(createdAt)} as LoopClaim;
  });
  return {id:uuid(v.id),generation,revision:revision(v.revision,1),label:v.label,profile,claims,sourceHash:hash(v.sourceHash),createdAt:instant(v.createdAt),updatedAt:instant(v.updatedAt)};
}
export function validateCvVariantSaveReceipt(value: unknown, intent: Immutable<CvVariantSaveIntent>): LoopCvVariantSaveReceipt {
  const r=completeObject(value,['variant','recordVersion','requestId','requestHash','sourceHash','savedRevision','reused','generation']);
  if(revision(r.generation)!==intent.expectedGeneration||uuid(r.requestId)!==intent.requestId||typeof r.reused!=='boolean')throw new Error('The CV save receipt belongs to a different request.');
  const variant=validateCvVariantSnapshot(r.variant,intent.expectedGeneration),savedRevision=revision(r.savedRevision,1),recordVersion=revision(r.recordVersion);
  if(savedRevision!==intent.expectedVariantRevision+1||recordVersion<intent.expectedVersion+1||(!r.reused&&recordVersion!==intent.expectedVersion+1)
    ||variant.revision<savedRevision||(!r.reused&&variant.revision!==savedRevision)||(intent.variantId!==null&&variant.id!==intent.variantId))throw new Error('The CV save receipt does not match the original revision.');
  const sourceHash=hash(r.sourceHash);
  if(variant.revision===savedRevision&&(!sameJson(variant.profile,intent.profile)||variant.label!==intent.label
    ||!sameJson(variant.claims.map(claim=>({id:claim.id,revision:claim.revision})),intent.claimRefs)||variant.sourceHash!==sourceHash))throw new Error('The CV save receipt does not match the original source.');
  return {variant,recordVersion,requestId:intent.requestId,requestHash:hash(r.requestHash),sourceHash,savedRevision,reused:r.reused,generation:intent.expectedGeneration};
}
export function validateCvVariantsRead(value: unknown, generation: number): LoopCvVariants {
  const r=completeObject(value,['generation','recordVersion','variants']);
  if(revision(r.generation)!==generation||!Array.isArray(r.variants)||r.variants.length>3)throw new Error('The CV variant list could not be confirmed.');
  const variants=r.variants.map(value=>validateCvVariantSnapshot(value,generation));
  if(new Set(variants.map(v=>v.id)).size!==variants.length)throw new Error('The CV variant list contains conflicting identities.');
  return {generation,recordVersion:revision(r.recordVersion),variants};
}
