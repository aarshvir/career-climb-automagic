import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { retainOnboardingDraft, recoverOnboardingDraft, moveRetainedOnboardingStep, type OnboardingDraft } from '@/lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority } from '@/lib/tracking-draft-memory';

const draft = (): OnboardingDraft => ({ profile: { ...blankLoopProfile(), targetTitles: ['Director, Engineering'] }, answers: { ...blankLoopCvAnswers(), education: 'Studied biology.' }, step: 1, roleQuery: '', locationQuery: 'Portland, Maine', rolesEdited: true, suggestionSource: '' });
const authority = () => trackingDraftAuthority('owner-a');
const retain = (generation: number | null = null) => retainOnboardingDraft({ owner: 'owner-a', authority: authority(), generation }, draft());
const recover = (generation: number | null = null) => recoverOnboardingDraft('owner-a', authority(), generation);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); });
afterEach(() => { clearTrackingDraftMemory(); vi.useRealTimers(); });

describe('onboarding route memory under actual auth and lifecycle authority', () => {
  it('keeps editable answers only in memory and isolates stored and returned copies', () => {
    const original = draft(); retainOnboardingDraft({ owner: 'owner-a', authority: authority(), generation: null }, original);
    original.profile.targetTitles.push('Wrong title');
    const first = recover()!; first.answers.education = 'Overwritten';
    expect(recover()).toEqual(draft());
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
    expect(recover()).not.toHaveProperty('consent'); expect(recover()).not.toHaveProperty('snapshot');
  });
  it('expires after thirty minutes and cannot be revived by a late stale writer', () => {
    retain(); vi.advanceTimersByTime(30 * 60 * 1000); expect(recover()).toBeNull();
    const oldAuthority = authority(); setTrackingDraftOwner(null);
    retainOnboardingDraft({ owner: 'owner-a', authority: oldAuthority, generation: null }, draft());
    setTrackingDraftOwner('owner-a', 'session-a2'); expect(recover()).toBeNull();
  });
  it('preserves a same-session token refresh but destroys same-owner new-session drafts', () => {
    retain(); setTrackingDraftOwner('owner-a', 'session-a'); expect(recover()).toEqual(draft());
    setTrackingDraftOwner('owner-a', 'session-a2'); expect(recover()).toBeNull();
  });
  it('does not recover A after switching A to B and back to A', () => {
    const oldAuthority = authority(); retain(); setTrackingDraftOwner('owner-b', 'session-b');
    expect(recoverOnboardingDraft('owner-a', oldAuthority, null)).toBeNull();
    setTrackingDraftOwner('owner-a', 'session-a'); expect(recover()).toBeNull();
  });
  it('adopts only the first generation-zero initialization without changing the original answers', () => {
    retain(); setTrackingLoopGeneration('owner-a', 0);
    expect(recover()).toBeNull(); expect(recover(0)).toEqual(draft());
    setTrackingLoopGeneration('owner-a', 1); expect(recover(1)).toBeNull();
  });
  it('does not adopt a previously erased lifecycle or expose a stale generation', () => {
    retain(); setTrackingLoopGeneration('owner-a', 3); expect(recover(3)).toBeNull();
    retain(3); setTrackingLoopGeneration('owner-a', 4); expect(recover(4)).toBeNull();
    setTrackingLoopGeneration('owner-a', 3); expect(recover(3)).toBeNull();
  });
  it('rejects stale or wrong owner writers while preserving the current valid draft', () => {
    retain(); retainOnboardingDraft({ owner: 'owner-b', authority: authority(), generation: null }, { ...draft(), roleQuery: 'wrong owner' });
    retainOnboardingDraft({ owner: 'owner-a', authority: authority() - 1, generation: null }, { ...draft(), roleQuery: 'old session' });
    expect(recover()).toEqual(draft());
  });
});

describe('a navigation-only step change (PR 72, round 2)', () => {
  const scope = (generation: number | null = null) => ({ owner: 'owner-a', authority: authority(), generation });
  const MINUTE = 60 * 1000;

  it('moves only the step and does not renew the 30 minutes', () => {
    retainOnboardingDraft(scope(), { ...draft(), touched: ['name'] });
    vi.advanceTimersByTime(29 * MINUTE);
    moveRetainedOnboardingStep(scope(), 4);
    expect(recover()).toEqual({ ...draft(), step: 4, touched: ['name'] });   // every other answer, and the provenance, exactly as they were
    vi.advanceTimersByTime(MINUTE);
    expect(recover()).toBeNull();                                           // gone at the original minute 30, not minute 59
  });

  it('keeps the original expiry itself, not only its timer: a timer that runs late cannot extend it', () => {
    retainOnboardingDraft(scope(), draft(), 1_000);
    moveRetainedOnboardingStep(scope(), 4, 1_000 + 29 * MINUTE);              // navigation at minute 29, with no timer delivered in between
    expect(recoverOnboardingDraft('owner-a', authority(), null, 1_000 + 29 * MINUTE + 59_000)?.step).toBe(4);
    expect(recoverOnboardingDraft('owner-a', authority(), null, 1_000 + 30 * MINUTE)).toBeNull();      // minute 30, not 59
  });

  it('never brings back an expired draft, even when the expiry timer has not run yet', () => {
    retainOnboardingDraft(scope(), draft(), 1_000);
    vi.setSystemTime(1_000 + 31 * MINUTE);                                    // time passed, the timer callback has not been delivered (a throttled background tab)
    moveRetainedOnboardingStep(scope(), 4);                                   // it must drop the expired draft itself, not leave it for a later read
    vi.setSystemTime(1_000);                                                  // read the clock as earlier again: nothing may be left to recover
    expect(recover()).toBeNull();
  });

  it('says whether it remembered the draft, so a draft that was not remembered is not mistaken for one with a deadline', () => {
    expect(retainOnboardingDraft(scope(), draft())).toBe(true);
    expect(retainOnboardingDraft({ owner: 'owner-b', authority: authority(), generation: null }, draft())).toBe(false);
    expect(retainOnboardingDraft({ owner: 'owner-a', authority: authority() - 1, generation: null }, draft())).toBe(false);
    expect(retainOnboardingDraft(scope(), { ...draft(), step: 6 })).toBe(false);
    expect(retainOnboardingDraft(scope(7), draft())).toBe(false);
    expect(recover()).toEqual(draft());                                       // the rejected writers left the remembered draft alone
  });

  it('does nothing when nothing is remembered, for another account, a stale session or a lifecycle that does not match, or a step out of range', () => {
    moveRetainedOnboardingStep(scope(), 2);
    expect(recover()).toBeNull();
    retain();
    moveRetainedOnboardingStep({ owner: 'owner-b', authority: authority(), generation: null }, 2);
    moveRetainedOnboardingStep({ owner: 'owner-a', authority: authority() - 1, generation: null }, 2);
    moveRetainedOnboardingStep(scope(7), 2);
    moveRetainedOnboardingStep(scope(), 9);
    moveRetainedOnboardingStep(scope(), -1);
    moveRetainedOnboardingStep(scope(), 1.5);
    expect(recover()).toEqual(draft());
  });
});
