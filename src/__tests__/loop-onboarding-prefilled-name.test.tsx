import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { blankLoopCvAnswers } from '@/lib/loop-cv-builder';
import { accountFullName } from '@/lib/loop-role-suggestions';
import { holdsUnsavedAnswers } from '@/lib/loop-onboarding-readback';
import { recoverOnboardingDraft, retainOnboardingDraft } from '@/lib/loop-onboarding-memory';
import { clearTrackingDraftMemory, setTrackingDraftOwner, setTrackingLoopGeneration, trackingDraftAuthority } from '@/lib/tracking-draft-memory';
import type { LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';

/**
 * Change C of the onboarding-friction branch: the CV step no longer asks for a name the person already gave at sign-up (it is filled in from `full_name`), and the optional
 * contact line and years of experience sit in a closed "Optional details" section. The filled-in name is the page's own starting value, NOT an edit: it is not in `touched`,
 * and a draft that holds nothing else is not treated as a retained newer answer (PR 72's reopened-draft behaviour). All data is fictional and nothing leaves the test.
 */
vi.unmock('react-router-dom');
const mock = vi.hoisted(() => ({ call: vi.fn(), metadata: undefined as unknown }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a', user_metadata: mock.metadata }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: mock.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));

const SOURCE = 'Alex Example\nEducation\nRecorded local plant species in a supervised university fieldwork project with documented observations.';
const SIGN_UP_NAME = 'Alex E.';
const baseProfile = (): LoopProfileInput => ({ ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Research assistant'], locations: ['Boston'], sourceText: SOURCE });
const view = () => <MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>;
async function flush() { await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
const names = () => mock.call.mock.calls.map(([, action]) => action.action);
const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
const nameField = () => screen.getByLabelText('Name on your CV') as HTMLInputElement;
const memory = (generation: number | null = 7) => recoverOnboardingDraft('owner-a', trackingDraftAuthority('owner-a'), generation);
const optional = () => document.querySelector('details.oq-optional') as HTMLDetailsElement;

/** A fresh visit, through the real steps, up to the CV step (one-tap role and place; pay and privacy left alone). */
async function toCvStep() {
  render(view()); await screen.findByLabelText('Search or add a role');
  fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' })); next();
  fireEvent.click(screen.getByRole('button', { name: 'Add United States' })); next();
  next(); next();
  await screen.findByLabelText('Your CV text');
}

beforeEach(() => {
  clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); mock.call.mockReset(); mock.metadata = { full_name: SIGN_UP_NAME };
  mock.call.mockImplementation(async (_owner: string, action: { action: string; profile?: unknown; expectedVersion?: number }) => {
    if (action.action === 'get_existing') return { existingState: 'active', snapshot: { lifecycleGeneration: 7, recordVersion: 22, profile: null } };
    if (action.action === 'save_profile') return { snapshot: { lifecycleGeneration: 7, recordVersion: 23, profile: { ...(action.profile as object), revision: 1, updatedAt: '2026-11-23T00:00:00.000Z' } } };
    throw new Error(`Unexpected action ${action.action}`);
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External transport prohibited'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('accountFullName: the starting value of the name question', () => {
  it('takes the sign-up name, trimmed', () => {
    expect(accountFullName({ full_name: '  Alex Example  ' })).toBe('Alex Example');
    expect(accountFullName({ full_name: 'Zoë Müller' })).toBe('Zoë Müller');
    expect(accountFullName({ full_name: 'x'.repeat(120) })).toHaveLength(120);
  });
  it.each([
    ['no details', undefined], ['null', null], ['an array', ['Alex']], ['text instead of details', 'Alex'],
    ['no full_name', { email: 'alex@example.invalid' }], ['a number', { full_name: 42 }], ['an array name', { full_name: ['Alex'] }], ['an empty name', { full_name: '   ' }],
    ['a name over 120 characters', { full_name: 'x'.repeat(121) }], ['a line break', { full_name: 'Alex\nExample' }], ['a control character', { full_name: 'Alex\u0007' }],
    ['a text-direction mark', { full_name: 'Alex\u202eExample' }], ['only a fallback name field', { name: 'Alex Example' }],
  ])('fills in nothing for %s', (_label, metadata) => { expect(accountFullName(metadata)).toBe(''); });
});

describe('holdsUnsavedAnswers: the prefilled name is the blank page, not an answer', () => {
  const saved = (): LoopProfileInput => baseProfile();
  const draft = (patch: Partial<LoopProfileInput> = {}, touched: string[] = []) => ({ profile: { ...baseProfile(), ...patch }, answers: blankLoopCvAnswers(), roleQuery: '', locationQuery: '', rolesEdited: true, touched });

  it('a name that is still the sign-up name and was never edited holds nothing, even though it differs from the saved name', () => {
    expect(holdsUnsavedAnswers(saved(), draft({ name: SIGN_UP_NAME }), SIGN_UP_NAME)).toBe(false);
    expect(holdsUnsavedAnswers(saved(), draft({ name: `  ${SIGN_UP_NAME}  ` }), ` ${SIGN_UP_NAME} `)).toBe(false);       // surrounding spaces are nothing, as in a save
  });
  it('the same draft WITHOUT the starting name is the old behaviour (a name that differs from the blank page is kept): that is what the third argument changes', () => {
    expect(holdsUnsavedAnswers(saved(), draft({ name: SIGN_UP_NAME }))).toBe(true);
  });
  it('a name the person changed is an answer', () => {
    expect(holdsUnsavedAnswers(saved(), draft({ name: 'Alex Revised' }, ['name']), SIGN_UP_NAME)).toBe(true);
  });
  it('a name the person cleared on purpose is an answer (a deliberate clear), and is not mistaken for the starting value', () => {
    expect(holdsUnsavedAnswers(saved(), draft({ name: '' }, ['name']), SIGN_UP_NAME)).toBe(true);
  });
  it('a name edited and then typed back to the sign-up name is still an edit the person made (provenance sticks), unless it equals the saved name', () => {
    expect(holdsUnsavedAnswers(saved(), draft({ name: SIGN_UP_NAME }, ['name']), SIGN_UP_NAME)).toBe(true);
    expect(holdsUnsavedAnswers(saved(), draft({ name: 'Alex Example' }, ['name']), SIGN_UP_NAME)).toBe(false);
  });
  it('a name that differs from the starting value with no provenance at all is kept (the safe direction)', () => {
    expect(holdsUnsavedAnswers(saved(), draft({ name: 'Alex Revised' }, []), SIGN_UP_NAME)).toBe(true);
  });
  it('the starting name never hides another answer: any other newer field, builder answer or typed text still counts', () => {
    expect(holdsUnsavedAnswers(saved(), draft({ name: SIGN_UP_NAME, contactLine: 'alex@example.invalid' }, ['contactLine']), SIGN_UP_NAME)).toBe(true);
    expect(holdsUnsavedAnswers(saved(), { ...draft({ name: SIGN_UP_NAME }), answers: { ...blankLoopCvAnswers(), summary: 'Newer note' } }, SIGN_UP_NAME)).toBe(true);
    expect(holdsUnsavedAnswers(saved(), { ...draft({ name: SIGN_UP_NAME }), roleQuery: 'Data analyst' }, SIGN_UP_NAME)).toBe(true);
  });
});

describe('the CV step starts with the sign-up name', () => {
  it('fills the name in without it counting as an edit, and sends nothing before the confirmation tick', async () => {
    await toCvStep();
    expect(nameField()).toHaveValue(SIGN_UP_NAME);
    expect(memory()?.profile.name).toBe(SIGN_UP_NAME);
    expect(memory()?.touched).not.toContain('name');
    expect(names()).toEqual(['get_existing']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
  });

  it('saves the sign-up name (and otherwise the same profile) only after the tick; the name is not asked a second time', async () => {
    await toCvStep();
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } });
    next();                                                                                    // no name was typed: Next is not stopped
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Review your Automated Job Loop setup');
    expect(screen.getByText(new RegExp(`^${SIGN_UP_NAME.replace('.', '\\.')} · `))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save my setup' })).toBeDisabled();
    expect(names()).toEqual(['get_existing']);
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    const expected = { ...blankLoopProfile('professional'), name: SIGN_UP_NAME, targetTitles: ['Business analyst'], locations: ['United States'], sourceText: SOURCE };
    expect(mock.call).toHaveBeenLastCalledWith('owner-a', { action: 'save_profile', expectedVersion: 22, saveConsent: true, profile: expected }, expect.any(Function));
    expect(names()).toEqual(['get_existing', 'save_profile']);
  });

  it('a name the person changes is theirs: it is saved as typed and is recorded as an edit', async () => {
    await toCvStep();
    fireEvent.change(nameField(), { target: { value: 'Alex Revised' } });
    expect(memory()?.touched).toContain('name');
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } }); next();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    expect(mock.call.mock.calls.at(-1)![1].profile.name).toBe('Alex Revised');
  });

  it('clearing the name still stops Next with the same message, and records a deliberate clear', async () => {
    await toCvStep();
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } });
    fireEvent.change(nameField(), { target: { value: '' } });
    next();
    expect(screen.getByRole('alert')).toHaveTextContent('Add the name you want on your CV, up to 120 characters.');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bring your experience');
    expect(nameField()).toHaveValue('');
    expect(memory()?.touched).toContain('name');
    expect(memory()?.profile.name).toBe('');
  });

  it.each([
    ['no sign-up details', undefined], ['a name with a control character', { full_name: 'Alex\u0007E.' }], ['a name over 120 characters', { full_name: 'x'.repeat(121) }],
    ['only a Google-style "name" field and no full_name (this release reads full_name only)', { name: 'Alex Example', email: 'alex@example.invalid' }],
  ])('with %s the name starts empty and is asked for, as before', async (_label, metadata) => {
    mock.metadata = metadata;
    await toCvStep();
    expect(nameField()).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } }); next();
    expect(screen.getByRole('alert')).toHaveTextContent('Add the name you want on your CV');
  });

  it('the guided CV builder still fills an EMPTY name', async () => {
    await toCvStep();
    fireEvent.change(nameField(), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('What name should appear on your CV?'), { target: { value: 'Alex Example' } });
    fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: 'Studied biology at Example University. Recorded plant species for a university fieldwork project.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' })); fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));
    expect(nameField()).toHaveValue('Alex Example');
  });

  it('the guided CV builder does not replace a name that is already there', async () => {
    await toCvStep();
    fireEvent.change(screen.getByLabelText('What name should appear on your CV?'), { target: { value: 'Alex Example' } });
    fireEvent.change(screen.getByLabelText('What have you studied or trained in?'), { target: { value: 'Studied biology at Example University. Recorded plant species for a university fieldwork project.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview my CV draft' })); fireEvent.click(screen.getByRole('button', { name: 'Use this CV draft' }));
    expect(nameField()).toHaveValue(SIGN_UP_NAME);
    expect(memory()?.touched).not.toContain('name');
  });
});

describe('the contact line and years of experience are in a closed "Optional details" section', () => {
  it('starts closed with the name and CV in plain view and the two optional fields out of the way', async () => {
    await toCvStep();
    expect(optional()).toBeTruthy();
    expect(optional()).not.toHaveAttribute('open');
    expect(optional().querySelector('summary')).toHaveTextContent('Optional details');
    expect(nameField()).toBeVisible(); expect(screen.getByLabelText('Your CV text')).toBeVisible(); expect(screen.getByLabelText('Upload a CV or LinkedIn PDF')).toBeVisible();
    expect(screen.getByLabelText('Contact line for your CV (optional)')).not.toBeVisible();
    expect(screen.getByLabelText('Years of relevant experience (optional)')).not.toBeVisible();
  });

  it('opens on a tap, keeps its labels, and what is typed there is saved (unchanged payload fields), while leaving it closed saves empty values', async () => {
    await toCvStep();
    fireEvent.click(screen.getByText('Optional details'));
    expect(optional()).toHaveAttribute('open');
    expect(screen.getByLabelText('Contact line for your CV (optional)')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Contact line for your CV (optional)'), { target: { value: 'alex@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Years of relevant experience (optional)'), { target: { value: '4.5' } });
    expect(memory()?.touched).toEqual(expect.arrayContaining(['contactLine', 'experienceYears']));
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } }); next();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    expect(mock.call.mock.calls.at(-1)![1].profile).toMatchObject({ contactLine: 'alex@example.invalid', experienceYears: 4.5 });
  });

  it('left closed, the saved contact line and years are the empty ones', async () => {
    await toCvStep();
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } }); next();
    expect(screen.getByText('Not included')).toBeInTheDocument(); expect(screen.getByText('Not specified')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    expect(mock.call.mock.calls.at(-1)![1].profile).toMatchObject({ contactLine: '', experienceYears: null });
  });

  it('opens by itself when only the years of experience are filled in, and stays closed when both are empty', async () => {
    await toCvStep();
    expect(optional()).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Optional details'));
    fireEvent.change(screen.getByLabelText('Years of relevant experience (optional)'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(optional()).toHaveAttribute('open');
    expect(screen.getByLabelText('Years of relevant experience (optional)')).toBeVisible();
    expect(screen.getByLabelText('Years of relevant experience (optional)')).toHaveValue(4);
    fireEvent.change(screen.getByLabelText('Years of relevant experience (optional)'), { target: { value: '' } });
    expect(optional()).toHaveAttribute('open');                                       // emptying it while typing does not close the box under the cursor
    fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(optional()).not.toHaveAttribute('open');                                   // both empty again on the next visit: closed
  });

  it('opens by itself when a value is already there, so a person is never shown a closed box that holds their own entry', async () => {
    await toCvStep();
    fireEvent.click(screen.getByText('Optional details'));
    fireEvent.change(screen.getByLabelText('Contact line for your CV (optional)'), { target: { value: 'alex@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(optional()).toHaveAttribute('open');
    expect(screen.getByLabelText('Contact line for your CV (optional)')).toBeVisible();
    expect(screen.getByLabelText('Contact line for your CV (optional)')).toHaveValue('alex@example.invalid');
  });

  it.each([
    ['a contact line over 500 characters', 'Contact line for your CV (optional)', 'x'.repeat(501), /contact line under 500/],
    ['years of experience out of range', 'Years of relevant experience (optional)', '99', /number from 0 to 80/],
  ])('opens by itself when %s stops Next, so the field to correct is in view', async (_label, field, value, message) => {
    await toCvStep();
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } });
    expect(optional()).not.toHaveAttribute('open');
    fireEvent.change(screen.getByLabelText(field), { target: { value } });
    next();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(optional()).toHaveAttribute('open');
    expect(screen.getByLabelText(field)).toBeVisible();
  });
});

/**
 * Round 3 (Codex, review of a8d3bcd): enter 81 for years, CLOSE Optional details, press Next. The page said to use 0 to 80 but the input stayed hidden, because the box
 * had already been told "invalid" while the value was typed, so nothing ran again when Next rejected it. A Next that rejects a concealed optional field must reopen it,
 * keep what was typed, and let the person correct it and go on; a valid value must still be collapsible, and nothing else reopens it.
 */
describe('Next that rejects a concealed optional field reopens Optional details', () => {
  const YEARS = 'Years of relevant experience (optional)', CONTACT = 'Contact line for your CV (optional)';
  const hidden = `alex${String.fromCharCode(0x202e)}@example.invalid`;
  const toggle = async () => { fireEvent.click(screen.getByText('Optional details')); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
  const heading = () => screen.getByRole('heading', { level: 1 });
  /** The CV step with a good CV text; the section opened, the value typed, and the section closed again by the person. */
  async function concealed(field: string, value: string) {
    await toCvStep();
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } });
    await toggle();
    expect(optional()).toHaveAttribute('open');
    fireEvent.change(screen.getByLabelText(field), { target: { value } });
    await toggle();
    expect(optional()).not.toHaveAttribute('open');
    expect(screen.getByLabelText(field)).not.toBeVisible();
  }
  const kept = (field: string, value: string) => (field === YEARS ? Number(value) : value);

  it.each([
    ['years 81 (the reported case)', YEARS, '81', /number from 0 to 80/, '5'],
    ['years below 0', YEARS, '-1', /number from 0 to 80/, '0'],
    ['years just over 80', YEARS, '80.5', /number from 0 to 80/, '80'],
    ['a contact line over 500 characters', CONTACT, 'x'.repeat(501), /contact line under 500/, 'alex@example.invalid'],
    ['a contact line with a hidden text-direction character', CONTACT, hidden, /contact line has an invisible/, 'alex@example.invalid'],
  ])('%s: closed, then Next, reopens it with the value kept, and correcting it lets the person go on', async (_label, field, bad, message, good) => {
    await concealed(field, bad);
    next();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(heading()).toHaveTextContent('Bring your experience');
    expect(optional()).toHaveAttribute('open');                                       // the section is open again ...
    expect(screen.getByLabelText(field)).toBeVisible();                               // ... so the field the message is about is in view ...
    expect(screen.getByLabelText(field)).toHaveValue(kept(field, bad));               // ... with exactly what was typed
    expect(memory()?.profile[field === YEARS ? 'experienceYears' : 'contactLine']).toBe(field === YEARS ? Number(bad) : bad);
    fireEvent.change(screen.getByLabelText(field), { target: { value: good } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(optional()).toHaveAttribute('open');                                       // correcting it does not close the box under the cursor
    next();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(heading()).toHaveTextContent('Review your Automated Job Loop setup');
    expect(names()).toEqual(['get_existing']);                                        // nothing was written
  });

  it('the person can close it again and press Next again: it reopens every time it rejects, and not otherwise', async () => {
    await concealed(YEARS, '81');
    for (let round = 0; round < 3; round += 1) {
      next();
      expect(screen.getByRole('alert')).toHaveTextContent('number from 0 to 80');
      expect(optional()).toHaveAttribute('open');
      expect(screen.getByLabelText(YEARS)).toBeVisible();
      await toggle();                                                                 // the person closes it again, still invalid
      expect(optional()).not.toHaveAttribute('open');                                 // closing is allowed; nothing reopens it until Next rejects again
    }
    next();
    expect(optional()).toHaveAttribute('open');
    expect(screen.getByLabelText(YEARS)).toHaveValue(81);
  });

  it('when both optional fields are invalid, both are in view after Next', async () => {
    await concealed(YEARS, '99');
    await toggle(); fireEvent.change(screen.getByLabelText(CONTACT), { target: { value: 'x'.repeat(501) } }); await toggle();
    expect(optional()).not.toHaveAttribute('open');
    next();
    expect(optional()).toHaveAttribute('open');
    expect(screen.getByLabelText(YEARS)).toBeVisible(); expect(screen.getByLabelText(CONTACT)).toBeVisible();
  });

  it('an error about the name or the CV reopens it too when an optional field is also wrong, but not when the optional fields are fine', async () => {
    await concealed(YEARS, '99');
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: '' } });
    next();
    expect(screen.getByRole('alert')).toHaveTextContent('Add the name you want on your CV');
    expect(optional()).toHaveAttribute('open');                                       // a concealed optional field is wrong as well, so it is shown
    cleanup(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a'); mock.call.mockClear();
    await concealed(YEARS, '5');
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: 'Too short.' } });
    next();
    expect(screen.getByRole('alert')).toHaveTextContent(/Too little readable CV text/);
    expect(optional()).not.toHaveAttribute('open');                                   // nothing about it is wrong, so it is left as the person closed it
  });

  it('a VALID value stays collapsible: closed it stays closed through other edits and through Next, which goes on', async () => {
    await concealed(YEARS, '5');
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: `${SOURCE} A little more detail.` } });
    expect(optional()).not.toHaveAttribute('open');
    await toggle(); expect(optional()).toHaveAttribute('open');                       // it can be opened again by hand
    await toggle(); expect(optional()).not.toHaveAttribute('open');
    next();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(heading()).toHaveTextContent('Review your Automated Job Loop setup');
    expect(screen.getByText('5 years')).toBeInTheDocument();                          // and the value it held is part of the review
  });

  it('a valid contact line behaves the same: collapsible, kept, and Next goes on', async () => {
    await concealed(CONTACT, 'alex@example.invalid');
    next();
    expect(heading()).toHaveTextContent('Review your Automated Job Loop setup');
    expect(screen.getByText('alex@example.invalid')).toBeInTheDocument();
  });

  it('a draft saved at the review step with a bad optional value: Save says so, and Back shows the field already open', async () => {
    setTrackingLoopGeneration('owner-a', 7);
    retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: 7 }, {
      profile: { ...baseProfile(), name: SIGN_UP_NAME, contactLine: 'x'.repeat(501) }, answers: blankLoopCvAnswers(), step: 5, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '', touched: ['contactLine'],
    });
    render(view());
    fireEvent.click(await screen.findByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    expect(screen.getByRole('alert')).toHaveTextContent('contact line under 500');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(optional()).toHaveAttribute('open');
    expect(screen.getByLabelText(CONTACT)).toBeVisible();
    fireEvent.change(screen.getByLabelText(CONTACT), { target: { value: 'alex@example.invalid' } });
    next();
    expect(heading()).toHaveTextContent('Review your Automated Job Loop setup');
    expect(names()).toEqual(['get_existing']);
  });
});

/**
 * PR 72's behaviour, with the prefilled name: a tab that remembered a draft for a setup that has since been saved keeps it (and shows it beside the saved setup) only when it
 * holds answers the saved setup does not. The prefilled name is not one of them. The saved setup's name is 'Alex Example'; the sign-up name is 'Alex E.'.
 */
describe('reopening setup beside a saved setup, with a prefilled name', () => {
  const panel = () => screen.queryByRole('region', { name: 'A setup is already saved in your account.' });
  const readyHeading = () => screen.queryByRole('heading', { name: 'Your Automated Job Loop is ready to continue.' });
  const copyText = () => (screen.getByLabelText(/Read them here/) as HTMLTextAreaElement).value;
  function savedOnServer() {
    mock.call.mockImplementation(async (_owner: string, action: { action: string }) => {
      if (action.action === 'get_existing') return { existingState: 'active', snapshot: { lifecycleGeneration: 0, recordVersion: 1, profile: { ...baseProfile(), revision: 1, updatedAt: '2026-11-22T00:00:00.000Z' } } };
      throw new Error(`Unexpected action ${action.action}`);
    });
  }
  function remember(patch: { profile?: Partial<LoopProfileInput>; touched?: string[]; answers?: Record<string, string> }) {
    setTrackingLoopGeneration('owner-a', 0);
    retainOnboardingDraft({ owner: 'owner-a', authority: trackingDraftAuthority('owner-a'), generation: 0 }, {
      profile: { ...baseProfile(), ...patch.profile }, answers: { ...blankLoopCvAnswers(), ...patch.answers }, step: 4, roleQuery: '', locationQuery: '', rolesEdited: true, suggestionSource: '', touched: patch.touched ?? [],
    });
  }
  async function reopen() { render(view()); await flush(); }

  it('CONTROL: a draft whose only difference is the untouched prefilled name holds nothing: it is cleared and the normal page shows, with no write', async () => {
    savedOnServer(); remember({ profile: { name: SIGN_UP_NAME }, touched: [] });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(memory(0)).toBeNull();
    expect(names()).toEqual(['get_existing']);
  });

  it('CONTROL: a name the person changed is retained and shown beside the saved setup, without any write', async () => {
    savedOnServer(); remember({ profile: { name: 'Alex Revised' }, touched: ['name'] });
    await reopen();
    expect(panel()).toBeInTheDocument();
    expect(panel()).toHaveTextContent('Retained in this tab and not part of the saved setup: Name on your CV.');
    expect(copyText()).toContain('Name on your CV: Alex Revised');
    expect(readyHeading()).not.toBeInTheDocument();
    expect(memory(0)).not.toBeNull();
    expect(names()).toEqual(['get_existing']);
  });

  it('CONTROL: a name cleared on purpose is retained as a deliberate clear', async () => {
    savedOnServer(); remember({ profile: { name: '' }, touched: ['name'] });
    await reopen();
    expect(panel()).toBeInTheDocument();
    expect(copyText()).toContain('Name on your CV: (empty)');
    expect(memory(0)).not.toBeNull();
    expect(names()).toEqual(['get_existing']);
  });

  it('when the panel is shown for another answer, an untouched prefilled name is not listed among the answers held, but the copyable draft still has the whole page', async () => {
    savedOnServer(); remember({ profile: { name: SIGN_UP_NAME }, touched: [], answers: { summary: 'Newer builder notes never sent' } });
    await reopen();
    expect(panel()).toBeInTheDocument();
    expect(screen.getByText(/^Retained in this tab and not part of the saved setup:/).textContent).toBe('Retained in this tab and not part of the saved setup: CV builder answers.');
    expect(copyText()).toContain(`Name on your CV: ${SIGN_UP_NAME}`);
    expect(names()).toEqual(['get_existing']);
  });

  it('when the panel is shown for another answer and the name WAS edited, the name is listed too', async () => {
    savedOnServer(); remember({ profile: { name: 'Alex Revised' }, touched: ['name'], answers: { summary: 'Newer builder notes never sent' } });
    await reopen();
    expect(screen.getByText(/^Retained in this tab and not part of the saved setup:/).textContent).toBe('Retained in this tab and not part of the saved setup: Name on your CV, CV builder answers.');
  });

  it('a name that equals the saved one holds nothing, prefilled or not', async () => {
    mock.metadata = { full_name: 'Alex Example' };
    savedOnServer(); remember({ profile: { name: 'Alex Example' }, touched: [] });
    await reopen();
    expect(readyHeading()).toBeInTheDocument();
    expect(memory(0)).toBeNull();
  });

  it('a draft remembered by this page that was reopened keeps its provenance: the prefilled name stays out of the edits when the person walks back through the steps', async () => {
    savedOnServer(); remember({ profile: { name: SIGN_UP_NAME }, touched: [], answers: { summary: 'Newer builder notes never sent' } });
    await reopen();
    expect(panel()).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(memory(0)?.touched).not.toContain('name');
    expect(memory(0)?.profile.name).toBe(SIGN_UP_NAME);
  });
});
