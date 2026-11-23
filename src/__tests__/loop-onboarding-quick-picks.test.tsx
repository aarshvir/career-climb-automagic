import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoopOnboarding from '@/pages/LoopOnboarding';
import LoopPreferencePicker from '@/components/LoopPreferencePicker';
import { blankLoopProfile } from '@/lib/job-loop-audiences';
import { locationChoices, roleChoices } from '@/lib/loop-role-suggestions';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';

/**
 * Change A of the onboarding-friction branch: the Roles and Locations steps showed only a search box with a datalist (no tappable choices).
 * Up to six suggestions that are not selected yet are now also shown as "Add <name>" buttons. Same local lists, no network call, no storage,
 * and the saved profile is exactly what typing the same answers produced before. All data is fictional.
 */
vi.unmock('react-router-dom');
const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a' }, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/lib/job-loop-api', async () => ({ callJobLoop: state.call, boundLoopAction: (await import('../../supabase/functions/_shared/job-loop-request')).boundLoopAction }));

const SOURCE = 'Alex Example\nEducation\nStudied biology at Example University. Recorded local plant species for a university fieldwork project.';
const snapshot = (profile: unknown = null, generation = 3, version = 0) => ({ lifecycleGeneration: generation, recordVersion: version, profile });
const open = () => render(<MemoryRouter initialEntries={['/onboarding']}><LoopOnboarding /></MemoryRouter>);
const quickPicks = () => screen.queryAllByRole('button', { name: /^Add \S/ });
const quickNames = () => quickPicks().map(button => button.textContent);
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

beforeEach(() => {
  state.call.mockReset(); clearTrackingDraftMemory(); setTrackingDraftOwner('owner-a', 'session-a');
  state.call.mockImplementation(async (_owner, action) => action.action === 'get_existing' ? { snapshot: snapshot(null, 7, 22), existingState: 'active' } : { snapshot: snapshot({ ...action.profile, revision: 1 }, 7, 23) });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External transport prohibited'));
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); vi.restoreAllMocks(); });

describe('Roles step: one-tap choices', () => {
  it('shows the first six unselected roles as "Add <name>" buttons, each with its own accessible name, beside the unchanged "Add" button', async () => {
    open(); await screen.findByLabelText('Target roles');
    expect(quickNames()).toEqual(roleChoices.slice(0, 6).map(role => `Add ${role}`));
    expect(new Set(quickNames()).size).toBe(6);
    expect(screen.getByRole('group', { name: 'Quick picks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();           // the typed-text button is still the only button called exactly "Add"
    expect(screen.getByRole('combobox', { name: 'Search or add a role' })).toHaveAttribute('list', 'oq-roles-options');
    expect(document.querySelectorAll('#oq-roles-options option').length).toBe(roleChoices.length);   // the datalist is kept
  });

  it('puts specific job titles first: none of the first six is a broad "Any ... level" pick, and those stay in the list, last', async () => {
    open(); await screen.findByLabelText('Target roles');
    expect(quickNames().every(name => !/^Add Any /.test(name ?? ''))).toBe(true);
    expect(quickNames()).toEqual(['Add Business analyst', 'Add Data analyst', 'Add Data scientist', 'Add Software engineer', 'Add Product manager', 'Add Project manager']);
    const broad = roleChoices.filter(role => role.startsWith('Any '));
    expect(broad).toEqual(['Any director-level role', 'Any manager-level role', 'Any vice president-level role']);
    expect(roleChoices.slice(-3)).toEqual(broad);
    const options = [...document.querySelectorAll('#oq-roles-options option')].map(option => option.getAttribute('value'));
    expect(options).toEqual(roleChoices);
    fireEvent.change(screen.getByLabelText('Search or add a role'), { target: { value: 'Any manager-level role' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Remove Any manager-level role' })).toBeInTheDocument();   // a broad pick can still be typed
  });

  it('tapping one adds it to the list and the editable list, removes it from the choices and brings the next unselected one in', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' }));
    expect(screen.getByRole('button', { name: 'Remove Business analyst' })).toBeInTheDocument();
    expect(screen.getByLabelText('Target roles')).toHaveValue('Business analyst');
    expect(screen.queryByRole('button', { name: 'Add Business analyst' })).not.toBeInTheDocument();
    expect(quickNames()).toEqual(roleChoices.slice(1, 7).map(role => `Add ${role}`));
    expect(document.querySelector('#oq-roles-options option[value="Business analyst"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Data analyst' }));
    expect(screen.getByLabelText('Target roles')).toHaveValue('Business analyst\nData analyst');
    expect(quickNames()).toHaveLength(6);
  });

  it('does not offer a role that is already selected, whatever its capitals', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.change(screen.getByLabelText('Search or add a role'), { target: { value: 'business ANALYST' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Remove business ANALYST' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Business analyst' })).not.toBeInTheDocument();
  });

  it('leaves the text in the search box alone, and Next still includes it as before', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.change(screen.getByLabelText('Search or add a role'), { target: { value: 'Climate policy adviser' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' }));
    expect(screen.getByLabelText('Search or add a role')).toHaveValue('Climate policy adviser');
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Target roles')).toHaveValue('Business analyst\nClimate policy adviser');
  });

  it('a role chosen with one tap lets Next through, with no error, and the choice is kept on Back', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Data scientist' }));
    next();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Where would you like to work?');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Target roles')).toHaveValue('Data scientist');
  });

  it('Next without any choice still asks for a role, and the quick picks do not choose one for the person', async () => {
    open(); await screen.findByLabelText('Target roles');
    next();
    expect(screen.getByRole('alert')).toHaveTextContent('Add between one and ten role titles');
    expect(screen.getByLabelText('Target roles')).toHaveValue('');
  });

  it('moves focus to the next quick pick after a tap instead of dropping it on the page', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Data analyst' }));
    expect(screen.getByRole('group', { name: 'Quick picks' }).querySelector('button')).toHaveFocus();
  });

  it('hides the quick picks once ten are selected (nothing more can be added) and brings them back after one is removed', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.change(screen.getByLabelText('Target roles'), { target: { value: Array.from({ length: 10 }, (_, index) => `Role ${index}`).join('\n') } });
    expect(quickPicks()).toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'Quick picks' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Role 3' }));
    expect(quickPicks()).toHaveLength(6);
  });
});

describe('Locations step: one-tap choices', () => {
  it('shows the first six unselected locations and adds one with a tap', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' })); next();
    await screen.findByLabelText('Cities or countries');
    expect(quickNames()).toEqual(locationChoices.slice(0, 6).map(place => `Add ${place}`));
    fireEvent.click(screen.getByRole('button', { name: 'Add Remote' }));
    expect(screen.getByLabelText('Cities or countries')).toHaveValue('Remote');
    expect(quickNames()).toEqual(locationChoices.slice(1, 7).map(place => `Add ${place}`));
    next();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What compensation would you consider?');
  });
});

/**
 * Keyboard use (a real Tab, then Enter or Space) and the boundary where the last quick pick is gone: choosing the TENTH entry removes the whole group, so there is no chip left for
 * the focus effect to move to. Focus must land on a stable control (the list of selected entries), never on the page body. Roles and Locations are the same component.
 */
describe('keyboard selection and the ten-entry boundary', () => {
  const nine = (prefix: string) => Array.from({ length: 9 }, (_, index) => `${prefix} ${index}`).join('\n');
  const selectedList = (label: RegExp) => screen.getByRole('list', { name: label });
  async function tabToFirstQuickPick(user: ReturnType<typeof userEvent.setup>, searchLabel: string) {
    await user.click(screen.getByLabelText(searchLabel));      // the search box; the typed-text "Add" button is disabled while it is empty, so the next Tab stop is the first quick pick
    await user.tab();
    return document.activeElement as HTMLElement;
  }

  it.each([['Enter', '{Enter}'], ['Space', ' ']])('Tab to a quick pick and press %s: it is added, and focus moves to the next quick pick', async (_name, key) => {
    const user = userEvent.setup();
    open(); await screen.findByLabelText('Target roles');
    const first = await tabToFirstQuickPick(user, 'Search or add a role');
    expect(first).toHaveAccessibleName('Add Business analyst');
    await user.keyboard(key);
    expect(screen.getByLabelText('Target roles')).toHaveValue('Business analyst');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toHaveAccessibleName('Add Data analyst');
    expect(screen.getByRole('group', { name: 'Quick picks' })).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard(key);
    expect(screen.getByLabelText('Target roles')).toHaveValue('Business analyst\nData analyst');
    expect(document.activeElement).toHaveAccessibleName('Add Data scientist');
  });

  it.each([['Enter', '{Enter}'], ['Space', ' ']])('Roles: choosing the tenth role with %s removes the group and focus lands on the list of selected roles, not the page', async (_name, key) => {
    const user = userEvent.setup();
    open(); await screen.findByLabelText('Target roles');
    fireEvent.change(screen.getByLabelText('Target roles'), { target: { value: nine('Role') } });
    expect(quickPicks()).toHaveLength(6);
    const first = await tabToFirstQuickPick(user, 'Search or add a role');
    expect(first).toHaveAccessibleName('Add Business analyst');
    await user.keyboard(key);
    expect(screen.getByRole('button', { name: 'Remove Business analyst' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Quick picks' })).not.toBeInTheDocument();     // the group is gone ...
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(selectedList(/^Selected target roles$/));              // ... and focus is on a stable control
    await user.tab();                                                                           // the next Tab stop is inside the list: the Remove buttons
    expect(document.activeElement).toHaveAccessibleName('Remove Role 0');
  });

  it.each([['Enter', '{Enter}'], ['Space', ' ']])('Locations: choosing the tenth place with %s removes the group and focus lands on the list of selected places, not the page', async (_name, key) => {
    const user = userEvent.setup();
    open(); await screen.findByLabelText('Target roles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' })); next();
    await screen.findByLabelText('Cities or countries');
    fireEvent.change(screen.getByLabelText('Cities or countries'), { target: { value: nine('Place') } });
    expect(quickPicks()).toHaveLength(6);
    const first = await tabToFirstQuickPick(user, 'Search or add a location');
    expect(first).toHaveAccessibleName('Add Remote');
    await user.keyboard(key);
    expect(screen.getByRole('button', { name: 'Remove Remote' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Quick picks' })).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(selectedList(/^Selected cities or countries$/));
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName('Remove Place 0');
  });

  it('a click on the tenth quick pick lands focus in the same place', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.change(screen.getByLabelText('Target roles'), { target: { value: nine('Role') } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Data scientist' }));
    expect(quickPicks()).toHaveLength(0);
    expect(document.activeElement).toBe(selectedList(/^Selected target roles$/));
  });

  it('does not move focus anywhere when nothing was tapped (typing, Add and Remove behave as before)', async () => {
    open(); await screen.findByLabelText('Target roles');
    const search = screen.getByLabelText('Search or add a role');
    search.focus();
    fireEvent.change(search, { target: { value: 'Climate policy adviser' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Remove Climate policy adviser' })).toBeInTheDocument();
    expect(document.activeElement).not.toBe(selectedList(/^Selected target roles$/));
    expect(document.activeElement).not.toHaveAccessibleName(/^Add \S/);
  });
});

describe('the saved setup is the same one typing the answers produced', () => {
  it('saves exactly the profile that typed answers saved, after one-tap roles and locations, with no extra call and nothing stored', async () => {
    open(); await screen.findByLabelText('Target roles');
    fireEvent.click(screen.getByRole('button', { name: 'Add Business analyst' })); next();
    fireEvent.click(screen.getByRole('button', { name: 'Add United States' })); next();
    next(); next();
    fireEvent.change(screen.getByLabelText('Name on your CV'), { target: { value: 'Alex Example' } });
    fireEvent.change(screen.getByLabelText('Your CV text'), { target: { value: SOURCE } });
    next();
    fireEvent.click(screen.getByRole('checkbox', { name: /Save this CV text/ })); fireEvent.click(screen.getByRole('button', { name: 'Save my setup' }));
    await screen.findByRole('heading', { name: 'Your setup is saved.' });
    const expected = { ...blankLoopProfile('professional'), name: 'Alex Example', targetTitles: ['Business analyst'], locations: ['United States'], sourceText: SOURCE };
    expect(state.call).toHaveBeenLastCalledWith('owner-a', { action: 'save_profile', expectedVersion: 22, saveConsent: true, profile: expected }, expect.any(Function));
    expect(state.call.mock.calls.map(call => call[1].action)).toEqual(['get_existing', 'save_profile']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
  });
});

describe('LoopPreferencePicker on its own', () => {
  function Harness({ choices, initial = [], onChange = () => {} }: { choices: string[]; initial?: string[]; onChange?: (values: string[]) => void }) {
    const [query, setQuery] = useState(''), [values, setValues] = useState(initial);
    return <LoopPreferencePicker id="t" label="Target roles" searchLabel="Search or add a role" values={values} query={query} choices={choices} onQuery={setQuery} description="Pick roles." onChange={next => { setValues(next); onChange(next); }} />;
  }
  it('shows fewer than six when fewer are left, and none when there are none', () => {
    const view = render(<Harness choices={['One', 'Two']} />);
    expect(quickNames()).toEqual(['Add One', 'Add Two']);
    view.unmount(); render(<Harness choices={[]} />);
    expect(quickPicks()).toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'Quick picks' })).not.toBeInTheDocument();
  });
  it('passes exactly the chosen entry on, without the text in the box', () => {
    const changed = vi.fn(); render(<Harness choices={['One', 'Two', 'Three']} initial={['Two']} onChange={changed} />);
    expect(quickNames()).toEqual(['Add One', 'Add Three']);
    fireEvent.click(within(screen.getByRole('group', { name: 'Quick picks' })).getByRole('button', { name: 'Add Three' }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(['Two', 'Three']);
  });
});
