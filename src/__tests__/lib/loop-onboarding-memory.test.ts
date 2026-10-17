import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { retainOnboardingDraft, recoverOnboardingDraft, type OnboardingDraft } from '@/lib/loop-onboarding-memory';
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
