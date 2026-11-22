import { describe, expect, it } from 'vitest';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { draftState, lateSaveOutcome, profileMatches, submittedForm } from '@/lib/loop-onboarding-readback';

/**
 * The one rule behind every read of the saved setup on the Automated Job Loop setup page (PR 68, review round 4). A saved setup settles the page (clear the draft, say
 * saved) only when it is the write the page sent AND the page still holds exactly that write's draft: profile, CV-builder answers, role text and location text.
 * Fictional data only.
 */
const profile = () => ({ ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Research assistant'], locations: ['Boston'], sourceText: 'Alex Example\nEducation\nFieldwork.' });
const answers = () => ({ ...blankLoopCvAnswers() });
const draft = (patch: { profile?: ReturnType<typeof profile>; answers?: unknown; roleQuery?: string; locationQuery?: string } = {}) =>
  draftState(patch.profile ?? profile(), patch.answers ?? answers(), patch.roleQuery ?? '', patch.locationQuery ?? '');
const savedFrom = (value: ReturnType<typeof profile>) => ({ ...submittedForm(value), revision: 1, updatedAt: '2026-11-22T00:00:00.000Z' });

describe('lateSaveOutcome', () => {
  it('settles only when the saved setup is the sent write and the page still holds exactly the sent draft', () => {
    expect(lateSaveOutcome(savedFrom(profile()), draft(), draft())).toBe('settled');
  });

  it('settles when only surrounding whitespace differs, because the save itself trims it', () => {
    const padded = { ...profile(), name: '  Alex Example  ', sourceText: `  ${profile().sourceText}\n\n` };
    expect(lateSaveOutcome(savedFrom(profile()), draft(), draft({ profile: padded }))).toBe('settled');
  });

  it.each([
    ['a CV-builder answer added after the write was sent', { answers: { ...answers(), summary: 'Newer builder notes' } }],
    ['role text typed but not added', { roleQuery: 'Data analyst' }],
    ['location text typed but not added', { locationQuery: 'Lisbon' }],
    ['a changed name', { profile: { ...profile(), name: 'Alex Revised' } }],
    ['a changed CV text', { profile: { ...profile(), sourceText: `${profile().sourceText}\nAdded line.` } }],
    ['a changed role', { profile: { ...profile(), targetTitles: ['Data analyst'] } }],
    ['a changed minimum pay', { profile: { ...profile(), compensation: { ...profile().compensation, minimum: 50000, currency: 'USD' } } }],
  ])('keeps the draft apart from the saved setup when the page holds %s', (_label, newer) => {
    expect(lateSaveOutcome(savedFrom(profile()), draft(), draft(newer))).toBe('earlier');
  });

  it('settles when the builder answers and queries were already on the page, unchanged, when the write was sent', () => {
    const sent = draft({ answers: { ...answers(), summary: 'Already there' }, roleQuery: 'Pending role', locationQuery: 'Pending place' });
    const now = draft({ answers: { ...answers(), summary: 'Already there' }, roleQuery: 'Pending role', locationQuery: 'Pending place' });
    expect(lateSaveOutcome(savedFrom(profile()), sent, now)).toBe('settled');
  });

  it('never settles for a write this page did not send (another tab, or an attempt that gave up before it wrote)', () => {
    expect(lateSaveOutcome(savedFrom(profile()), null, draft())).toBe('other');
  });

  it('never settles for a saved setup that differs from the write that was sent, however unchanged the page is', () => {
    const different = { ...profile(), targetTitles: ['Someone else'] };
    expect(lateSaveOutcome(savedFrom(different), draft(), draft())).toBe('other');
    expect(profileMatches(savedFrom(different), submittedForm(profile()))).toBe(false);
  });
});
