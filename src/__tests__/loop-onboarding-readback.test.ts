import { describe, expect, it } from 'vitest';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { draftState, holdsUnsavedAnswers, lateSaveOutcome, profileMatches, submittedForm } from '@/lib/loop-onboarding-readback';

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

/**
 * Opening setup again while a setup is already saved (22 Nov, the boundary PR 68 left): a draft this tab still remembers is kept beside the saved setup only when it holds
 * something the saved setup does not. Whatever equals the saved setup, or was never filled in, is cleared as before. Fictional data only.
 */
describe('holdsUnsavedAnswers', () => {
  const held = (patch: Partial<{ profile: ReturnType<typeof profile>; answers: ReturnType<typeof answers>; roleQuery: string; locationQuery: string; rolesEdited: boolean; touched: string[] }> = {}) =>
    ({ profile: profile(), answers: answers(), roleQuery: '', locationQuery: '', rolesEdited: true, ...patch });
  const saved = () => savedFrom(profile());

  it('holds nothing newer when the draft equals the saved setup (unchanged-draft control)', () => {
    expect(holdsUnsavedAnswers(saved(), held())).toBe(false);
  });

  it('holds nothing newer when only surrounding whitespace differs, because a save trims it', () => {
    expect(holdsUnsavedAnswers(saved(), held({ profile: { ...profile(), name: '  Alex Example  ', sourceText: `\n${profile().sourceText}\n\n` } }))).toBe(false);
  });

  it('holds nothing when the draft was never filled in, however different the saved setup is from the blank page', () => {
    expect(holdsUnsavedAnswers(saved(), held({ profile: blankLoopProfile('professional'), rolesEdited: false }))).toBe(false);
  });

  it('does not count roles that were only suggested and never confirmed, but counts them once the person has confirmed or edited them', () => {
    const suggested = { ...blankLoopProfile('professional'), targetTitles: ['Suggested role'] };
    expect(holdsUnsavedAnswers(saved(), held({ profile: suggested, rolesEdited: false }))).toBe(false);
    expect(holdsUnsavedAnswers(saved(), held({ profile: suggested, rolesEdited: true }))).toBe(true);
  });

  it('does not count a blank field nobody edited, or fields the page never lets a person type', () => {
    expect(holdsUnsavedAnswers(saved(), held({ profile: { ...profile(), name: '' } }))).toBe(false);
    expect(holdsUnsavedAnswers(saved(), held({ profile: { ...profile(), audience: 'student', pageTarget: 2, languages: ['Portuguese'] } }))).toBe(false);
    expect(holdsUnsavedAnswers(saved(), held({ profile: { ...profile(), name: '' }, touched: ['locations'] }))).toBe(false);      // another field was edited, not this one
    expect(holdsUnsavedAnswers(saved(), held({ profile: { ...profile(), audience: 'student', pageTarget: 2, languages: ['Portuguese'] }, touched: ['audience', 'languages'] }))).toBe(false);
  });

  // Round 2 (23 Nov): an intentional clear or reset equals the blank page, so the blank-page rule alone dropped it. Edit provenance keeps it, and only it.
  describe('a field the person emptied or reset on purpose (edit provenance)', () => {
    const withContact = () => ({ ...profile(), contactLine: 'alex@example.test', experienceYears: 4, excludedTerms: ['Confidential client'], compensation: { currency: 'USD', period: 'annual' as const, minimum: 50000 }, discreetSearch: !blankLoopProfile('professional').discreetSearch });
    const savedWith = () => savedFrom(withContact());
    it.each([
      ['contactLine', { contactLine: '' }],
      ['name', { name: '' }],
      ['sourceText', { sourceText: '' }],
      ['locations', { locations: [] }],
      ['excludedTerms', { excludedTerms: [] }],
      ['experienceYears', { experienceYears: null }],
      ['compensation', { compensation: { currency: '', period: 'annual' as const, minimum: null } }],
      ['discreetSearch', { discreetSearch: blankLoopProfile('professional').discreetSearch }],
    ])('keeps an edited %s that now equals the blank page but differs from the saved setup, and drops it when nobody edited it', (field, change) => {
      const emptied = { ...withContact(), ...change };
      expect(holdsUnsavedAnswers(savedWith(), held({ profile: emptied, touched: [field] }))).toBe(true);
      expect(holdsUnsavedAnswers(savedWith(), held({ profile: emptied }))).toBe(false);
      expect(holdsUnsavedAnswers(savedWith(), held({ profile: emptied, touched: [] }))).toBe(false);
    });
    it('keeps emptied roles only when the person confirmed or edited them, never suggested ones', () => {
      const emptied = { ...profile(), targetTitles: [] };
      expect(holdsUnsavedAnswers(saved(), held({ profile: emptied, touched: ['targetTitles'], rolesEdited: true }))).toBe(true);
      expect(holdsUnsavedAnswers(saved(), held({ profile: emptied, touched: ['targetTitles'], rolesEdited: false }))).toBe(false);
      expect(holdsUnsavedAnswers(saved(), held({ profile: emptied, rolesEdited: true }))).toBe(false);
    });
    it('holds nothing when an edited field ended up equal to the saved setup (edited, then put back)', () => {
      expect(holdsUnsavedAnswers(saved(), held({ touched: ['name', 'locations', 'targetTitles', 'sourceText'] }))).toBe(false);
    });
    it('treats an empty private-terms box as no terms, so clearing it beside a setup that has none is nothing', () => {
      expect(holdsUnsavedAnswers(saved(), held({ profile: { ...profile(), excludedTerms: [''] }, touched: ['excludedTerms'] }))).toBe(false);
      expect(holdsUnsavedAnswers(saved(), held({ profile: { ...profile(), excludedTerms: ['  ', '	'] }, touched: ['excludedTerms'] }))).toBe(false);
      expect(holdsUnsavedAnswers(savedWith(), held({ profile: { ...withContact(), excludedTerms: [''] }, touched: ['excludedTerms'] }))).toBe(true);
    });
    it('does not let provenance replace the other rules: whitespace is nothing, and a draft equal to the saved setup stays nothing', () => {
      expect(holdsUnsavedAnswers(saved(), held({ profile: { ...profile(), name: '  Alex Example  ' }, touched: ['name'] }))).toBe(false);
      expect(holdsUnsavedAnswers(saved(), held({ touched: ['contactLine'] }))).toBe(false);
    });
  });

  it.each([
    ['a CV-builder answer', { answers: { ...answers(), summary: 'Builder notes' } }],
    ['role text typed but not added', { roleQuery: 'Data analyst' }],
    ['location text typed but not added', { locationQuery: 'Lisbon' }],
    ['a different name', { profile: { ...profile(), name: 'Alex Revised' } }],
    ['a different CV text', { profile: { ...profile(), sourceText: `${profile().sourceText}\nAdded line.` } }],
    ['different roles the person confirmed', { profile: { ...profile(), targetTitles: ['Data analyst'] } }],
    ['different locations', { profile: { ...profile(), locations: ['Lisbon'] } }],
    ['a minimum pay', { profile: { ...profile(), compensation: { ...profile().compensation, minimum: 50000, currency: 'USD' } } }],
    ['private terms', { profile: { ...profile(), excludedTerms: ['Confidential client'] } }],
    ['a contact line', { profile: { ...profile(), contactLine: 'alex@example.test' } }],
    ['years of experience', { profile: { ...profile(), experienceYears: 4 } }],
    ['a changed discreet-search choice', { profile: { ...profile(), discreetSearch: !profile().discreetSearch } }],
  ])('holds something newer when the draft has %s', (_label, patch) => {
    expect(holdsUnsavedAnswers(saved(), held(patch))).toBe(true);
  });
});
