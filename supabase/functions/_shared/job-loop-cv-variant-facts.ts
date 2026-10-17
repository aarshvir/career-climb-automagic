import { validateClaim } from './job-loop-engine.ts';
import type { LoopClaim, LoopClaimInput, LoopCvVariant } from './job-loop-types.ts';

export interface CvVariantFactReadScope { expectedGeneration: number; variantId: string }
interface FactIntentBase extends CvVariantFactReadScope {
  expectedVersion: number; requestId: string; expectedVariantRevision: number; sourceHash: string;
  factId: string | null; expectedFactRevision: number;
}
export interface CvVariantFactSaveIntent extends FactIntentBase { claim: LoopClaimInput; saveConsent: true }
export interface CvVariantFactWithdrawIntent extends FactIntentBase { factId: string; withdrawConsent: true }
export interface CvVariantFactSnapshot extends LoopClaim {
  variantId: string; generation: number; variantRevision: number; sourceHash: string; updatedAt: string;
}
export interface CvVariantFactVariant { id: string; revision: number; sourceHash: string }
export interface CvVariantFactReceipt {
  generation: number; recordVersion: number; variant: CvVariantFactVariant; fact: CvVariantFactSnapshot;
  requestId: string; requestHash: string; savedRevision: number; sourceHash: string; variantRevision: number; reused: boolean;
}
export interface CvVariantFactsRead {
  generation: number; recordVersion: number; variant: CvVariantFactVariant; facts: CvVariantFactSnapshot[];
}
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
type FactIntent = Immutable<CvVariantFactSaveIntent | CvVariantFactWithdrawIntent>;
const BASE = ['expectedGeneration', 'expectedVersion', 'requestId', 'variantId', 'expectedVariantRevision', 'sourceHash', 'factId', 'expectedFactRevision'];
const CLAIM = ['sourceKind', 'sourceQuote', 'phrasing', 'context', 'kind', 'resultStatus', 'confirmed', 'shareable'];
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected a plain variant fact object.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !keys.includes(key)) || keys.some(key => !Object.prototype.hasOwnProperty.call(input, key))) throw new Error('Unknown or missing variant fact field.');
  return input;
}
function revision(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('Invalid original variant fact revision.');
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('Invalid variant fact identity.');
  return value.toLowerCase();
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid variant fact source fingerprint.');
  return value;
}
function instant(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80 || !Number.isFinite(Date.parse(value))) throw new Error('Invalid variant fact date.');
  return value;
}
function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length < minimum || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new Error('Variant facts need complete canonical text.');
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error('Invalid variant fact category.');
  return value as T;
}
function claim(value: unknown): LoopClaimInput {
  const c = object(value, CLAIM);
  if (typeof c.confirmed !== 'boolean' || typeof c.shareable !== 'boolean') throw new Error('Variant fact permissions require explicit choices.');
  return {
    sourceKind: choice(c.sourceKind, ['cv_passage', 'user_answer']), sourceQuote: text(c.sourceQuote, 8, 3000),
    phrasing: text(c.phrasing, 8, 1500), context: text(c.context, 1, 200),
    kind: choice(c.kind, ['employment', 'internship', 'academic_project', 'personal_project', 'volunteering', 'education', 'skill']),
    resultStatus: choice(c.resultStatus, ['measured', 'projected', 'not_measured']), confirmed: c.confirmed, shareable: c.shareable,
  };
}
function base(c: Record<string, unknown>): FactIntentBase {
  const factId = c.factId === null ? null : uuid(c.factId), expectedFactRevision = revision(c.expectedFactRevision, factId ? 1 : 0);
  if (factId === null && expectedFactRevision !== 0) throw new Error('A new fact must start at revision zero.');
  // Both counters will be incremented by a successful save. Reject overflow at capture.
  const expectedVersion = revision(c.expectedVersion);
  if (expectedVersion === Number.MAX_SAFE_INTEGER || expectedFactRevision === Number.MAX_SAFE_INTEGER) throw new Error('Variant fact revision cannot be incremented safely.');
  return { expectedGeneration: revision(c.expectedGeneration), expectedVersion, requestId: uuid(c.requestId), variantId: uuid(c.variantId), expectedVariantRevision: revision(c.expectedVariantRevision, 1), sourceHash: hash(c.sourceHash), factId, expectedFactRevision };
}
export function validateCvVariantFactReadScope(value: unknown): CvVariantFactReadScope {
  const c = object(value, ['expectedGeneration', 'variantId']);
  return { expectedGeneration: revision(c.expectedGeneration), variantId: uuid(c.variantId) };
}
export function validateCvVariantFactSaveIntent(value: unknown): CvVariantFactSaveIntent {
  const c = object(value, [...BASE, 'claim', 'saveConsent']);
  if (c.saveConsent !== true) throw new Error('Confirm private saving of this exact fact.');
  const saved = claim(c.claim);
  if (saved.confirmed !== true) throw new Error('Confirm this exact fact and its complete source context.');
  return { ...base(c), claim: saved, saveConsent: true };
}
export function validateCvVariantFactWithdrawIntent(value: unknown): CvVariantFactWithdrawIntent {
  const c = object(value, [...BASE, 'withdrawConsent']), original = base(c);
  if (c.withdrawConsent !== true || original.factId === null) throw new Error('Confirm withdrawal of an exact saved fact.');
  return { ...original, factId: original.factId, withdrawConsent: true };
}
function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value as Immutable<T>;
}
/** Capture synchronously before auth or network waits; never replace original revisions on retry. */
export function captureCvVariantFactSaveIntent(value: unknown): Immutable<CvVariantFactSaveIntent> { return freeze(validateCvVariantFactSaveIntent(value)); }
export function captureCvVariantFactWithdrawIntent(value: unknown): Immutable<CvVariantFactWithdrawIntent> { return freeze(validateCvVariantFactWithdrawIntent(value)); }
function sameClaim(a: LoopClaimInput, b: Readonly<LoopClaimInput>): boolean { return CLAIM.every(key => a[key as keyof LoopClaimInput] === b[key as keyof LoopClaimInput]); }
/** Fresh owner-checked source only. This validates evidence, not ownership or future preparation authority. */
export function validateCvVariantFactForSource(intent: Immutable<CvVariantFactSaveIntent>, currentVariant: LoopCvVariant): LoopClaimInput {
  if (currentVariant.id !== intent.variantId || currentVariant.generation !== intent.expectedGeneration || currentVariant.revision !== intent.expectedVariantRevision || currentVariant.sourceHash !== intent.sourceHash) throw new Error('The exact CV source changed. Review the fact again.');
  const validated = validateClaim(intent.claim, currentVariant.profile);
  if (!sameClaim(validated, intent.claim)) throw new Error('Confirm the complete canonical source passage and context before saving.');
  return validated;
}
export function validateCvVariantFactSnapshot(value: unknown, generation: number, variantId: string): CvVariantFactSnapshot {
  const c = object(value, [...CLAIM, 'id', 'revision', 'status', 'createdAt', 'variantId', 'generation', 'variantRevision', 'sourceHash', 'updatedAt']);
  const saved = claim(Object.fromEntries(CLAIM.map(key => [key, c[key]])));
  if (revision(c.generation) !== generation || uuid(c.variantId) !== variantId) throw new Error('The fact belongs to a different CV or workspace lifetime.');
  const status = choice(c.status, ['active', 'withdrawn']);
  if (status === 'active' ? !saved.confirmed : saved.confirmed || saved.shareable) throw new Error('The fact has contradictory current permissions.');
  return { ...saved, id: uuid(c.id), revision: revision(c.revision, 1), status, createdAt: instant(c.createdAt), updatedAt: instant(c.updatedAt), variantId, generation, variantRevision: revision(c.variantRevision, 1), sourceHash: hash(c.sourceHash) };
}
function variant(value: unknown, variantId: string): CvVariantFactVariant {
  const v = object(value, ['id', 'revision', 'sourceHash']);
  if (uuid(v.id) !== variantId) throw new Error('The receipt refers to another CV.');
  return { id: variantId, revision: revision(v.revision, 1), sourceHash: hash(v.sourceHash) };
}
function consistentSource(fact: CvVariantFactSnapshot, current: CvVariantFactVariant): void {
  if (fact.variantRevision > current.revision || (fact.variantRevision === current.revision && fact.sourceHash !== current.sourceHash)) throw new Error('The fact source does not match its exact CV revision.');
}
/** Receipts describe CURRENT facts plus ORIGINAL request provenance. They never confer future sharing authority. */
export function validateCvVariantFactReceipt(value: unknown, intent: FactIntent): CvVariantFactReceipt {
  const r = object(value, ['generation', 'recordVersion', 'variant', 'fact', 'requestId', 'requestHash', 'savedRevision', 'sourceHash', 'variantRevision', 'reused']);
  if (revision(r.generation) !== intent.expectedGeneration || uuid(r.requestId) !== intent.requestId || typeof r.reused !== 'boolean') throw new Error('The fact receipt belongs to another request.');
  const current = variant(r.variant, intent.variantId), fact = validateCvVariantFactSnapshot(r.fact, intent.expectedGeneration, intent.variantId);
  const savedRevision = revision(r.savedRevision, 1), recordVersion = revision(r.recordVersion), originalRevision = revision(r.variantRevision, 1), sourceHash = hash(r.sourceHash);
  if (savedRevision !== intent.expectedFactRevision + 1 || recordVersion < intent.expectedVersion + 1 || (!r.reused && recordVersion !== intent.expectedVersion + 1)
    || fact.revision < savedRevision || (!r.reused && fact.revision !== savedRevision) || (intent.factId !== null && fact.id !== intent.factId)
    || originalRevision !== intent.expectedVariantRevision || sourceHash !== intent.sourceHash || current.revision < originalRevision || (!r.reused && 'claim' in intent && current.revision !== originalRevision)
    || (current.revision === originalRevision && current.sourceHash !== sourceHash)) throw new Error('The fact receipt does not match the original revisions and source.');
  consistentSource(fact, current);
  if (fact.revision === savedRevision) {
    if (fact.variantRevision !== originalRevision || fact.sourceHash !== sourceHash) throw new Error('The saved fact changed original source association.');
    if ('claim' in intent ? fact.status !== 'active' || !sameClaim(fact, intent.claim) : fact.status !== 'withdrawn' || fact.confirmed || fact.shareable) throw new Error('The fact receipt does not match the exact confirmed change.');
  }
  return { generation: intent.expectedGeneration, recordVersion, variant: current, fact, requestId: intent.requestId, requestHash: hash(r.requestHash), savedRevision, sourceHash, variantRevision: originalRevision, reused: r.reused };
}
/** Structural read only. Old source facts remain inspectable but require a current exact-source authority check before use. */
export function validateCvVariantFactsRead(value: unknown, scope: CvVariantFactReadScope): CvVariantFactsRead {
  const r = object(value, ['generation', 'recordVersion', 'variant', 'facts']);
  if (revision(r.generation) !== scope.expectedGeneration || !Array.isArray(r.facts) || r.facts.length > 150) throw new Error('The CV fact list could not be confirmed.');
  const current = variant(r.variant, scope.variantId), facts = r.facts.map(value => validateCvVariantFactSnapshot(value, scope.expectedGeneration, scope.variantId));
  if (new Set(facts.map(f => f.id)).size !== facts.length) throw new Error('The CV fact list repeats an identity.');
  facts.forEach(fact => consistentSource(fact, current));
  return { generation: scope.expectedGeneration, recordVersion: revision(r.recordVersion), variant: current, facts };
}

/** Future admission must resolve exact references against a fresh owner-checked
 * fact read. This helper is not registered as a run or preparation action. */
export function resolveCurrentCvVariantFacts(currentVariant: LoopCvVariant, currentFacts: readonly CvVariantFactSnapshot[], orderedRefs: unknown): CvVariantFactSnapshot[] {
  if (!Array.isArray(orderedRefs) || orderedRefs.length > 150 || !Array.isArray(currentFacts) || currentFacts.length > 150) throw new Error('Choose at most 150 exact variant facts.');
  const seen = new Set<string>();
  return orderedRefs.map(value => {
    const ref = object(value, ['id', 'revision']), id = uuid(ref.id), expected = revision(ref.revision, 1);
    if (seen.has(id)) throw new Error('Choose distinct exact variant facts.');
    seen.add(id);
    const matches = currentFacts.filter(fact => fact.id === id);
    if (matches.length !== 1) throw new Error('A chosen variant fact is missing or conflicting.');
    const fact = validateCvVariantFactSnapshot(matches[0], currentVariant.generation, currentVariant.id);
    if (fact.revision !== expected || fact.variantRevision !== currentVariant.revision || fact.sourceHash !== currentVariant.sourceHash
      || fact.status !== 'active' || !fact.confirmed || !fact.shareable) throw new Error('A chosen variant fact changed or is no longer shareable for this exact source.');
    const input = claim(Object.fromEntries(CLAIM.map(key => [key, fact[key as keyof CvVariantFactSnapshot]])));
    if (!sameClaim(validateClaim(input, currentVariant.profile), input)) throw new Error('The variant fact requires confirmation with its complete source context.');
    return fact;
  });
}
