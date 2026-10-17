import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VariantRecovery, VariantRecoveryScope } from '@/lib/loop-cv-variant-recovery';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const nextSessionId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const now = Date.parse('2026-10-17T02:00:00Z');
const ttl = 30 * 60 * 1000;
function session(id = sessionId, userId = owner) {
  return { user: { id: userId }, access_token: `header.${btoa(JSON.stringify({ sub: userId, session_id: id, exp: 2000000000 }))}.never-store-this-signature` };
}
function value(): VariantRecovery {
  const draft = { expectedVersion: 10, variantId: null, expectedVariantRevision: 0, label: 'Operations',
    profile: { audience: 'professional' as const, name: 'Alex Example', contactLine: '', targetTitles: ['Analyst'], locations: ['Dubai'],
      experienceYears: null, languages: ['English'], pageTarget: 1 as const, discreetSearch: true,
      sourceText: 'Example Group\nHelped prepare an operations tracker covering six workstreams.\nEducation: Business studies.',
      excludedTerms: [], compensation: { currency: '', period: 'monthly' as const, minimum: null } }, claimRefs: [] };
  return { draft, pending: { ...structuredClone(draft), expectedGeneration: 7, requestId, saveConsent: true } };
}
async function modules() {
  const recovery = await import('@/lib/loop-cv-variant-recovery');
  const tracking = await import('@/lib/tracking-draft-memory');
  return { recovery, tracking };
}
async function ready(id = sessionId, userId = owner, generation = 7) {
  const state = await modules(); const sdkSession = session(id, userId);
  state.tracking.setTrackingDraftOwner(userId, state.recovery.cvVariantSessionIdentity(sdkSession));
  state.recovery.observeCvVariantRecoverySession(sdkSession);
  state.tracking.setTrackingLoopGeneration(userId, generation);
  return { ...state, scope: { ownerId: userId, authority: state.tracking.trackingDraftAuthority(userId), generation } satisfies VariantRecoveryScope };
}
function stored() { return Array.from({ length: sessionStorage.length }, (_, index) => ({ key: sessionStorage.key(index)!, raw: sessionStorage.getItem(sessionStorage.key(index)!)! })); }
beforeEach(() => { vi.resetModules(); sessionStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('independent CV variant recovery lifetime and ambiguous-request regressions', () => {
  it('keeps a newer editable draft separate from the original immutable pending request', async () => {
    const { recovery, scope } = await ready(); const original = value(); original.draft.label = 'Newer unsaved label';
    const kept = recovery.retainCvVariantRecovery(scope, original, { rememberOnDevice: false });
    original.pending!.profile.sourceText = 'Mutated by caller'; original.draft.profile.locations.push('London');
    const restored = recovery.recoverCvVariantRecovery(scope)!;
    expect(kept).toEqual({ retained: true, refreshRecovery: false });
    expect(restored.draft.label).toBe('Newer unsaved label'); expect(restored.pending!.label).toBe('Operations');
    expect(restored.pending!.profile.sourceText).toBe(value().pending!.profile.sourceText);
    expect(restored.draft.profile.locations).toEqual(['Dubai']); expect(stored()).toEqual([]);
    restored.pending!.label = 'Consumer mutation'; expect(recovery.recoverCvVariantRecovery(scope)!.pending!.label).toBe('Operations');
  });

  it('does not silently grant refresh recovery when only page memory was requested', async () => {
    const { recovery, scope } = await ready(); recovery.retainCvVariantRecovery(scope, value(), { rememberOnDevice: false });
    vi.resetModules(); const refreshed = await ready();
    expect(refreshed.recovery.recoverCvVariantRecovery(refreshed.scope)).toBeNull();
  });

  it('preserves opted-in original request through unknown bootstrap and same-session module reload', async () => {
    const initial = await ready(); const original = value();
    expect(initial.recovery.retainCvVariantRecovery(initial.scope, original, { rememberOnDevice: true }).refreshRecovery).toBe(true);
    const envelope = stored(); expect(envelope).toHaveLength(1);
    expect(envelope[0].raw).not.toContain(session().access_token); expect(envelope[0].raw).not.toContain('never-store-this-signature');
    vi.resetModules(); const fresh = await modules();
    expect(fresh.recovery.recoverCvVariantRecovery(initial.scope)).toBeNull(); expect(stored()).toEqual(envelope);
    fresh.tracking.setTrackingDraftOwner(owner, sessionId); fresh.recovery.observeCvVariantRecoverySession(session());
    expect(fresh.recovery.recoverCvVariantRecovery(initial.scope)).toBeNull(); expect(stored()).toEqual(envelope);
    fresh.tracking.setTrackingLoopGeneration(owner, 7);
    const scope = { ...initial.scope, authority: fresh.tracking.trackingDraftAuthority(owner) };
    expect(fresh.recovery.recoverCvVariantRecovery(scope)).toEqual(original);
  });

  it('keeps intentionally emptied fields without restoring current save consent', async () => {
    const initial = await ready(), original = value();
    original.draft.label = ''; original.draft.profile.name = ''; original.draft.profile.sourceText = ''; original.draft.profile.targetTitles = [];
    expect(initial.recovery.retainCvVariantRecovery(initial.scope, original, { rememberOnDevice: true }).retained).toBe(true);
    vi.resetModules(); const fresh = await ready(), restored = fresh.recovery.recoverCvVariantRecovery(fresh.scope)!;
    expect(restored.draft).toMatchObject({ label: '', profile: { name: '', sourceText: '', targetTitles: [] } });
    expect(restored.draft).not.toHaveProperty('saveConsent'); expect(restored.draft).not.toHaveProperty('approved');
    expect(restored.pending!.saveConsent).toBe(true); // Historical request, not a renewed form checkbox.
  });

  it('keeps token refresh within one session but revokes old writers for same-owner new sign-in', async () => {
    const current = await ready(); current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true });
    const tokenRefresh = { ...session(), access_token: session().access_token.replace('header.', 'new-header.') };
    current.tracking.setTrackingDraftOwner(owner, current.recovery.cvVariantSessionIdentity(tokenRefresh)); current.recovery.observeCvVariantRecoverySession(tokenRefresh);
    expect(current.tracking.trackingDraftAuthority(owner)).toBe(current.scope.authority);
    expect(current.recovery.recoverCvVariantRecovery(current.scope)).not.toBeNull();
    const replacement = session(nextSessionId);
    current.tracking.setTrackingDraftOwner(owner, current.recovery.cvVariantSessionIdentity(replacement)); current.recovery.observeCvVariantRecoverySession(replacement);
    current.tracking.setTrackingLoopGeneration(owner, 7);
    expect(current.tracking.trackingDraftAuthority(owner)).not.toBe(current.scope.authority);
    expect(current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true }).retained).toBe(false);
    expect(stored()).toEqual([]);
  });

  it('rejects same-owner recovery after refresh into a different SDK session', async () => {
    const initial = await ready(); initial.recovery.retainCvVariantRecovery(initial.scope, value(), { rememberOnDevice: true });
    vi.resetModules(); const replacement = await ready(nextSessionId);
    expect(replacement.recovery.recoverCvVariantRecovery(replacement.scope)).toBeNull(); expect(stored()).toEqual([]);
  });

  it('rejects an A→B→A delayed cleanup or retain without touching newer A work', async () => {
    const first = await ready(); first.recovery.retainCvVariantRecovery(first.scope, value(), { rememberOnDevice: true });
    await ready(nextSessionId, other); const back = await ready(nextSessionId, owner); const newer = value(); newer.pending!.requestId = other;
    expect(back.recovery.retainCvVariantRecovery(back.scope, newer, { rememberOnDevice: true }).retained).toBe(true);
    first.recovery.clearCvVariantRecovery(first.scope);
    expect(first.recovery.retainCvVariantRecovery(first.scope, value(), { rememberOnDevice: true }).retained).toBe(false);
    expect(back.recovery.recoverCvVariantRecovery(back.scope)!.pending!.requestId).toBe(other);
  });

  it('cannot clear a newer pending request with an older completion ID', async () => {
    const { recovery, scope } = await ready(); const newer = value(); newer.pending!.requestId = other;
    recovery.retainCvVariantRecovery(scope, newer, { rememberOnDevice: true }); recovery.clearCvVariantRecovery(scope, requestId);
    expect(recovery.recoverCvVariantRecovery(scope)!.pending!.requestId).toBe(other);
    recovery.clearCvVariantRecovery(scope, other); expect(recovery.recoverCvVariantRecovery(scope)).toBeNull(); expect(stored()).toEqual([]);
  });

  it('refuses a newer lifecycle and cannot move recovery generation backwards', async () => {
    const current = await ready(); current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true });
    current.tracking.setTrackingLoopGeneration(owner, 8); current.tracking.setTrackingLoopGeneration(owner, 7);
    expect(current.recovery.recoverCvVariantRecovery(current.scope)).toBeNull();
    expect(current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true }).retained).toBe(false);
    expect(stored()).toEqual([]);
  });

  it.each(['getter', 'write', 'read'] as const)('keeps page memory honestly when browser storage %s is denied', async mode => {
    const current = await ready();
    if (mode === 'getter') vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    else vi.spyOn(Storage.prototype, mode === 'write' ? 'setItem' : 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'QuotaExceededError'); });
    expect(current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true })).toEqual({ retained: true, refreshRecovery: false });
    expect(current.recovery.recoverCvVariantRecovery(current.scope)).toEqual(value());
  });

  it('does not claim successful refresh recovery when the storage write silently does nothing', async () => {
    const current = await ready(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    expect(current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true })).toEqual({ retained: true, refreshRecovery: false });
  });

  it.each(['expired', 'future', 'wrongOwner', 'wrongGeneration', 'pendingGeneration', 'extraApproval', 'malformed'] as const)('rejects corrupt or stale stored recovery: %s', async mode => {
    const initial = await ready(); initial.recovery.retainCvVariantRecovery(initial.scope, value(), { rememberOnDevice: true });
    const item = stored()[0], envelope = JSON.parse(item.raw);
    if (mode === 'expired') envelope.expiresAt = now;
    if (mode === 'future') envelope.expiresAt = now + ttl + 1;
    if (mode === 'wrongOwner') envelope.ownerId = other;
    if (mode === 'wrongGeneration') envelope.generation = 8;
    if (mode === 'pendingGeneration') envelope.value.pending.expectedGeneration = 8;
    if (mode === 'extraApproval') envelope.value.draft.approved = true;
    sessionStorage.setItem(item.key, mode === 'malformed' ? '{invalid' : JSON.stringify(envelope));
    vi.resetModules(); const fresh = await ready(); expect(fresh.recovery.recoverCvVariantRecovery(fresh.scope)).toBeNull(); expect(stored()).toEqual([]);
  });

  it('expires page memory at the same thirty-minute boundary', async () => {
    const current = await ready(); current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: false });
    vi.setSystemTime(now + ttl); expect(current.recovery.recoverCvVariantRecovery(current.scope)).toBeNull();
  });

  it('actively removes opted-in private draft bytes when their timer expires', async () => {
    const current = await ready(); current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true });
    expect(stored()).toHaveLength(1); vi.advanceTimersByTime(ttl);
    expect(stored()).toEqual([]); expect(current.recovery.recoverCvVariantRecovery(current.scope)).toBeNull();
  });

  it('rejects a malformed replacement without erasing the last valid original retry', async () => {
    const current = await ready(); current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true });
    const invalid = value(); invalid.pending!.expectedGeneration = 8;
    expect(current.recovery.retainCvVariantRecovery(current.scope, invalid, { rememberOnDevice: true })).toEqual({ retained: false, refreshRecovery: false });
    expect(current.recovery.recoverCvVariantRecovery(current.scope)).toEqual(value());
  });

  it('ignores a delayed different-owner session observation without replacing current recovery authority', async () => {
    const current = await ready(); current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true });
    current.recovery.observeCvVariantRecoverySession(session(nextSessionId, other));
    expect(current.recovery.recoverCvVariantRecovery(current.scope)).toEqual(value());
  });

  it('still rejects old-session bytes when browser deletion is denied during sign-out', async () => {
    const current = await ready(); current.recovery.retainCvVariantRecovery(current.scope, value(), { rememberOnDevice: true });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    current.tracking.setTrackingDraftOwner(null, null); current.recovery.observeCvVariantRecoverySession(null);
    expect(current.recovery.recoverCvVariantRecovery(current.scope)).toBeNull();
    vi.restoreAllMocks(); vi.resetModules(); const fresh = await ready(nextSessionId);
    expect(fresh.recovery.recoverCvVariantRecovery(fresh.scope)).toBeNull(); expect(stored()).toEqual([]);
  });

  it.each(['missing', 'malformed', 'foreignSubject'] as const)('uses only page memory without a confirmed session discriminator: %s', async mode => {
    const state = await modules(); const sdkSession = session();
    if (mode === 'missing') sdkSession.access_token = `header.${btoa(JSON.stringify({ sub: owner }))}.signature`;
    if (mode === 'malformed') sdkSession.access_token = 'not-a-token';
    if (mode === 'foreignSubject') sdkSession.access_token = session(sessionId, other).access_token;
    expect(state.recovery.cvVariantSessionIdentity(sdkSession)).toBeNull();
    state.tracking.setTrackingDraftOwner(owner, null); state.recovery.observeCvVariantRecoverySession(sdkSession); state.tracking.setTrackingLoopGeneration(owner, 7);
    const scope = { ownerId: owner, generation: 7, authority: state.tracking.trackingDraftAuthority(owner) };
    expect(state.recovery.retainCvVariantRecovery(scope, value(), { rememberOnDevice: true })).toEqual({ retained: true, refreshRecovery: false });
    expect(stored()).toEqual([]);
  });
});
