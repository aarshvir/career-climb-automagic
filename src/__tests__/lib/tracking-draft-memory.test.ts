import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTrackingDraft, clearTrackingDraftMemory, pruneTrackingApplications, recoverTrackingDraft, registerTrackingDraftOwner, retainTrackingDraft, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftScope, type TrackingDraft } from '@/lib/tracking-draft-memory';

const value: TrackingDraft = { status: 'interview', followUp: '2026-10-20', notes: 'Synthetic interview reminder' };
beforeEach(() => { clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a'); setTrackingLoopGeneration('owner-a', 7); });
afterEach(clearTrackingDraftMemory);

describe('bounded private tracking memory', () => {
  it('recovers only the same owner, application and surface as a copy, without permissions', () => {
    const scope = trackingDraftScope('workspace', 'owner-a', 'application-a');
    retainTrackingDraft(scope, { ...value, attested: true, approved: true } as TrackingDraft, 1000);
    const restored = recoverTrackingDraft(scope, 1001)!;
    expect(restored).toEqual(value);
    expect(restored).not.toHaveProperty('attested'); expect(restored).not.toHaveProperty('approved');
    restored.notes = 'Changed returned copy';
    expect(recoverTrackingDraft(scope, 1002)?.notes).toBe(value.notes);
    expect(recoverTrackingDraft(trackingDraftScope('workspace', 'owner-a', 'application-b'), 1002)).toBeNull();
    expect(recoverTrackingDraft(trackingDraftScope('loop', 'owner-a', 'application-a', 7), 1002)).toBeNull();
  });
  it('expires at thirty minutes and has a maximum of one hundred application drafts', () => {
    const first = trackingDraftScope('workspace', 'owner-a', 'application-0');
    for (let i = 0; i < 101; i++) retainTrackingDraft(trackingDraftScope('workspace', 'owner-a', `application-${i}`), value, 1000);
    expect(recoverTrackingDraft(first, 1001)).toBeNull();
    const last = trackingDraftScope('workspace', 'owner-a', 'application-100');
    expect(recoverTrackingDraft(last, 1_800_999)).toEqual(value);
    expect(recoverTrackingDraft(last, 1_801_000)).toBeNull();
  });
  it('rejects an old writer after A to B to A, even when the field snapshot is identical', () => {
    const old = trackingDraftScope('workspace', 'owner-a', 'same-application'); retainTrackingDraft(old, value);
    setTrackingDraftOwner('owner-b'); setTrackingDraftOwner('owner-a');
    const fresh = trackingDraftScope('workspace', 'owner-a', 'same-application'); retainTrackingDraft(fresh, value);
    clearTrackingDraft(old, value); retainTrackingDraft(old, { ...value, notes: 'Stale A result' });
    expect(recoverTrackingDraft(old)).toBeNull(); expect(recoverTrackingDraft(fresh)).toEqual(value);
  });
  it('does not let resolved-parent fallback reauthorize an older different owner', () => {
    setTrackingDraftOwner('owner-b'); registerTrackingDraftOwner('owner-a');
    const old = trackingDraftScope('workspace', 'owner-a', 'a'); retainTrackingDraft(old, value);
    expect(recoverTrackingDraft(old)).toBeNull();
    const fresh = trackingDraftScope('workspace', 'owner-b', 'b'); retainTrackingDraft(fresh, value);
    expect(recoverTrackingDraft(fresh)).toEqual(value);
  });
  it('clears only Loop drafts on a new generation and refuses a late older generation', () => {
    const workspace = trackingDraftScope('workspace', 'owner-a', 'a'), old = trackingDraftScope('loop', 'owner-a', 'a', 7);
    retainTrackingDraft(workspace, value); retainTrackingDraft(old, value);
    setTrackingLoopGeneration('owner-a', 9);
    const fresh = trackingDraftScope('loop', 'owner-a', 'a', 9); retainTrackingDraft(fresh, { ...value, notes: 'Fresh generation' });
    setTrackingLoopGeneration('owner-a', 7); retainTrackingDraft(old, value); clearTrackingDraft(old);
    expect(recoverTrackingDraft(old)).toBeNull(); expect(recoverTrackingDraft(workspace)).toEqual(value);
    expect(recoverTrackingDraft(fresh)?.notes).toBe('Fresh generation');
  });
  it('acknowledges only exact submitted notes, date and status, leaving later edits intact', () => {
    const scope = trackingDraftScope('workspace', 'owner-a', 'a');
    for (const patch of [{ notes: 'Newer text' }, { followUp: '2026-10-21' }, { status: 'offer' }]) {
      retainTrackingDraft(scope, { ...value, ...patch }); clearTrackingDraft(scope, value);
      expect(recoverTrackingDraft(scope)).toEqual({ ...value, ...patch });
      clearTrackingDraft(scope, { ...value, ...patch }); expect(recoverTrackingDraft(scope)).toBeNull();
    }
  });
  it('removes deleted applications from authoritative membership without touching other applications', () => {
    const a = trackingDraftScope('workspace', 'owner-a', 'a'), b = trackingDraftScope('workspace', 'owner-a', 'b');
    retainTrackingDraft(a, value); retainTrackingDraft(b, value);
    pruneTrackingApplications('workspace', 'owner-a', ['b']);
    expect(recoverTrackingDraft(a)).toBeNull(); expect(recoverTrackingDraft(b)).toEqual(value);
  });
  it('rejects malformed or excessive fields and unavailable Loop authority', () => {
    const scope = trackingDraftScope('workspace', 'owner-a', 'a');
    for (const patch of [{ status: 'automatic_submission' }, { status: 'prepared' }, { followUp: 'not-a-date' }, { notes: 'x'.repeat(5001) }]) retainTrackingDraft(scope, { ...value, ...patch });
    expect(recoverTrackingDraft(scope)).toBeNull();
    const missing = trackingDraftScope('loop', 'owner-a', 'a'); retainTrackingDraft(missing, value);
    expect(recoverTrackingDraft(missing)).toBeNull();
  });
});
