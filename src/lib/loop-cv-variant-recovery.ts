import { captureCvVariantSaveIntent, type CvVariantSaveIntent } from '../../supabase/functions/_shared/job-loop-cv-variants';

export interface VariantRecoveryScope { ownerId: string; authority: number; generation: number }
export type VariantWorkingDraft = Omit<CvVariantSaveIntent, 'requestId' | 'saveConsent' | 'expectedGeneration'>;
export interface VariantRecovery { draft: VariantWorkingDraft; pending: CvVariantSaveIntent | null }
const KEY = 'jobvance.loop.cv-variant-recovery.v1';
const TTL = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let owner: string | null | undefined, authority = -1, generation: number | undefined;
let sessionId: string | null | undefined;
let retained: { scope: VariantRecoveryScope; expiresAt: number; value: VariantRecovery } | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
function scheduleExpiry(delay: number) { if (expiry !== null) clearTimeout(expiry); expiry=setTimeout(() => { retained=null;removeStored();expiry=null; },Math.max(1,delay)); }
function stopExpiry() { if(expiry!==null)clearTimeout(expiry);expiry=null; }
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function storage(): Storage | null { try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; } }
function removeStored() { try { storage()?.removeItem(KEY); } catch { /* A denied browser store cannot grant recovery. */ } }
function allowed(scope: VariantRecoveryScope) { return !!owner && scope.ownerId === owner && scope.authority === authority && authority >= 0 && integer(scope.generation) && generation === scope.generation; }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Invalid recovery data');
  return value as Record<string, unknown>;
}
/** Drafts may be incomplete. Validate their shape with placeholders, but retain
 * the exact editable text, including intentionally cleared fields. */
function copyValue(value: unknown, expectedGeneration: number): VariantRecovery {
  const root = object(value, ['draft', 'pending']);
  const d = object(root.draft, ['expectedVersion', 'variantId', 'expectedVariantRevision', 'label', 'profile', 'claimRefs']);
  const profile = object(d.profile, ['audience','name','contactLine','targetTitles','locations','experienceYears','languages','pageTarget','discreetSearch','sourceText','excludedTerms','compensation']);
  if (typeof d.label !== 'string' || d.label.length > 80 || typeof profile.name !== 'string' || profile.name.length > 120 || typeof profile.sourceText !== 'string' || profile.sourceText.length > 60000) throw new Error('Invalid recovery fields');
  if ([d.label,profile.name,profile.sourceText].some(text => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text as string))) throw new Error('Unsupported recovery text');
  captureCvVariantSaveIntent({ ...d, expectedGeneration, requestId:'00000000-0000-4000-8000-000000000001', saveConsent:true, label:d.label.trim() ? d.label : 'Draft', profile:{...profile,name:profile.name.trim() ? profile.name : 'Draft', sourceText:profile.sourceText.trim().length >= 80 ? profile.sourceText : 'Draft source '.repeat(8)} });
  const pending = root.pending === null ? null : captureCvVariantSaveIntent(root.pending);
  if (pending && pending.expectedGeneration !== expectedGeneration) throw new Error('Wrong recovery generation');
  return structuredClone({draft:d as unknown as VariantWorkingDraft,pending}) as VariantRecovery;
}
/** Called only from confirmed identity transitions, never an unknown bootstrap. */
export function syncCvVariantRecoveryOwner(next: string | null, nextAuthority: number) {
  if (owner !== undefined && (owner !== next || authority !== nextAuthority)) { retained = null; stopExpiry(); sessionId = undefined; removeStored(); }
  owner = next; authority = nextAuthority; generation = undefined;
  if (next === null) { retained = null; stopExpiry(); sessionId = null; removeStored(); }
}
export function syncCvVariantRecoveryGeneration(ownerId: string, next: number) {
  if (owner !== ownerId || !integer(next) || generation !== undefined && next < generation) return;
  if (generation !== undefined && generation !== next) { retained = null; stopExpiry(); removeStored(); }
  generation = next;
}
/** The SDK supplied session remains the authority. Only its non-secret session
 * UUID is used to distinguish refresh from a different same-owner sign-in.
 * The access/refresh token itself is never retained here or written to storage. */
export function cvVariantSessionIdentity(session: { user: { id: string }; access_token: string } | null): string | null {
  let next: string | null = null;
  try {
    if (session && typeof session.access_token === 'string' && session.access_token.length < 16000) {
      const encoded = session.access_token.split('.')[1];
      const payload = JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));
      if (payload.sub === session.user.id && typeof payload.session_id === 'string' && UUID.test(payload.session_id)) next = payload.session_id.toLowerCase();
    }
  } catch { /* No stable SDK session marker: memory-only recovery. */ }
  return next;
}
export function observeCvVariantRecoverySession(session: { user: { id: string }; access_token: string } | null) {
  if (owner === undefined || session && session.user.id !== owner) return;
  const next = cvVariantSessionIdentity(session);
  if (sessionId !== undefined && sessionId !== next) { retained = null; stopExpiry(); removeStored(); }
  sessionId = next;
  if (!next) removeStored();
}
export function retainCvVariantRecovery(scope: VariantRecoveryScope, value: VariantRecovery, options: { rememberOnDevice: boolean }, now = Date.now()): { retained: boolean; refreshRecovery: boolean } {
  if (!allowed(scope) || !Number.isFinite(now)) return {retained:false,refreshRecovery:false};
  let copied: VariantRecovery;
  try { copied = copyValue(value, scope.generation); } catch { return {retained:false,refreshRecovery:false}; }
  retained = {scope:{...scope},expiresAt:now+TTL,value:copied}; scheduleExpiry(TTL);
  removeStored();
  if (!options.rememberOnDevice || !sessionId) return {retained:true,refreshRecovery:false};
  try {
    const target = storage(); if (!target) return {retained:true,refreshRecovery:false};
    const payload = JSON.stringify({ownerId:scope.ownerId,sessionId,generation:scope.generation,expiresAt:now+TTL,value:copied});
    target.setItem(KEY,payload);
    return {retained:true,refreshRecovery:target.getItem(KEY) === payload};
  } catch { return {retained:true,refreshRecovery:false}; }
}
export function recoverCvVariantRecovery(scope: VariantRecoveryScope, now = Date.now()): VariantRecovery | null {
  if (!allowed(scope) || !Number.isFinite(now)) return null;
  if (retained) {
    const row = retained;
    if (row.scope.authority === scope.authority && row.scope.ownerId === scope.ownerId && row.scope.generation === scope.generation && row.expiresAt > now && row.expiresAt <= now+TTL) return structuredClone(row.value);
    retained = null; stopExpiry(); removeStored(); return null;
  }
  if (!sessionId) return null;
  try {
    const raw = storage()?.getItem(KEY); if (!raw) return null;
    if (raw.length > 300000) throw new Error('Oversized recovery');
    const data = object(JSON.parse(raw), ['ownerId','sessionId','generation','expiresAt','value']);
    if (data.ownerId !== owner || data.sessionId !== sessionId || data.generation !== scope.generation || typeof data.expiresAt !== 'number' || data.expiresAt <= now || data.expiresAt > now+TTL) throw new Error('Expired recovery');
    const value = copyValue(data.value,scope.generation);
    retained = {scope:{...scope},expiresAt:data.expiresAt,value}; scheduleExpiry(data.expiresAt-now);
    return structuredClone(value);
  } catch { removeStored(); return null; }
}
export function clearCvVariantRecovery(scope: VariantRecoveryScope, pendingRequestId?: string) {
  if (!allowed(scope)) return;
  if (pendingRequestId !== undefined && recoverCvVariantRecovery(scope)?.pending?.requestId !== pendingRequestId) return;
  retained = null; stopExpiry(); removeStored();
}
/** Test/reset and confirmed explicit memory reset; unknown bootstrap never calls this. */
export function resetCvVariantRecovery() { stopExpiry();retained=null;owner=undefined;authority=-1;generation=undefined;sessionId=undefined;removeStored(); }
