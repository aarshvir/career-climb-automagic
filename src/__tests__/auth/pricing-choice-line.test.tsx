import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import { accountDestination, pricingChoiceFromReturn } from '@/lib/account-return';

vi.unmock('@/contexts/AuthContext');
vi.unmock('react-router-dom');

const sdk = vi.hoisted(() => ({
  initialize: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(),
  from: vi.fn(), invoke: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  configurationError: null,
  supabase: {
    auth: {
      initialize: sdk.initialize, getSession: sdk.getSession, onAuthStateChange: sdk.onAuthStateChange,
      signInWithOAuth: sdk.signInWithOAuth, signInWithPassword: sdk.signInWithPassword, signUp: sdk.signUp,
      resetPasswordForEmail: sdk.resetPasswordForEmail, updateUser: sdk.updateUser, signOut: sdk.signOut,
    },
    from: sdk.from, functions: { invoke: sdk.invoke },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  sdk.initialize.mockResolvedValue({ error: null });
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sdk.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  window.localStorage.clear(); sessionStorage.clear();
});
afterEach(cleanup);

const open = (search: string) => render(<AuthProvider><MemoryRouter initialEntries={[`/auth${search}`]}><Auth /></MemoryRouter></AuthProvider>);
const next = (path: string, extra = '') => `?next=${encodeURIComponent(path)}${extra}`;
const ready = () => screen.findByRole('heading', { name: /Sign in to Jobvance|Create your Jobvance account/ });
const line = () => document.querySelector('.ap-chosen');

describe('pricingChoiceFromReturn: names a choice only from a validated pricing return path', () => {
  it.each([
    ['/pricing?loopPlan=weekly', { product: 'loop', name: 'Starter' }],
    ['/pricing?loopPlan=active', { product: 'loop', name: 'Advanced' }],
    ['/pricing?loopPlan=daily&country=GB&currency=GBP', { product: 'loop', name: 'Pro Job Seeker' }],
    ['/pricing?loopPlan=active&country=other&currency=USD', { product: 'loop', name: 'Advanced' }],
    ['/pricing?plan=sprint_7d', { product: 'pass', name: 'Sprint' }],
    ['/pricing?plan=search_30d', { product: 'pass', name: 'Job Search' }],
    ['/pricing?plan=move_90d', { product: 'pass', name: 'Career Move' }],
  ])('%s gives %j', (value, expected) => { expect(pricingChoiceFromReturn(value)).toEqual(expected); });

  it.each([
    [null], [''], ['/loop'], ['/dashboard'], ['/check'], ['/onboarding'], ['/pricing'], ['/pricing?'],
    ['/pricing?loopPlan=platinum'], ['/pricing?plan=lifetime'], ['/pricing?loopPlan=active&plan=sprint_7d'],
    ['/pricing?loopPlan=active&country=XX&currency=GBP'], ['/pricing?loopPlan=active&country=GB&currency=GBP&extra=1'],
    ['/pricing?plan=sprint_7d&next=https://attacker.example'], ['https://attacker.example/pricing?loopPlan=active'],
    ['//attacker.example/pricing?loopPlan=active'], ['/pricing?loopPlan=active#x'], ['/PRICING?loopPlan=active'],
  ])('%j gives nothing', value => { expect(pricingChoiceFromReturn(value as string | null)).toBeNull(); });

  it('carries only a plan name: no price, no currency, no amount', () => {
    for (const value of ['/pricing?loopPlan=active&country=GB&currency=GBP', '/pricing?plan=move_90d', '/pricing?loopPlan=daily&country=AE&currency=AED']) {
      expect(JSON.stringify(pricingChoiceFromReturn(value))).not.toMatch(/[£$€]|\d|GBP|AED|USD/);
    }
  });

  it('does not change the redirect validation it builds on', () => {
    expect(accountDestination('/pricing?loopPlan=platinum')).toBe('/loop');
    expect(accountDestination('/pricing?plan=sprint_7d&next=https://attacker.example')).toBe('/loop');
    expect(accountDestination('/pricing?loopPlan=active&country=GB&currency=GBP')).toBe('/pricing?loopPlan=active&country=GB&currency=GBP');
    expect(accountDestination('/pricing?plan=search_30d')).toBe('/pricing?plan=search_30d');
  });
});

describe('sign-in page names what was chosen (F4)', () => {
  it('for a Loop plan chosen on Pricing: one line above the form, plan name only', async () => {
    open(next('/pricing?loopPlan=active&country=GB&currency=GBP'));
    await ready();
    const chosen = line() as HTMLElement;
    expect(chosen).not.toBeNull();
    expect(chosen).toHaveTextContent('Sign in to continue with the Advanced plan.');
    expect(chosen.textContent).not.toMatch(/[£$€]|\d|GBP/);
    expect(document.querySelectorAll('.ap-chosen')).toHaveLength(1);
    // It sits before the form, not inside or after it.
    const form = document.querySelector('form.ap-auth-form') as HTMLElement;
    expect(chosen.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('for a pass chosen on Pricing', async () => {
    open(next('/pricing?plan=search_30d'));
    await ready();
    expect(line()).toHaveTextContent('Sign in to continue with the Job Search pass.');
  });

  it('follows the sign-up mode, and is hidden once the confirmation e-mail screen replaces the form', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: { id: 'fixture-new-user' }, session: null }, error: null });
    open(next('/pricing?loopPlan=weekly&country=AE&currency=AED', '&mode=signup'));
    await screen.findByRole('heading', { name: /Create your Jobvance account/ });
    expect(line()).toHaveTextContent('Create your account to continue with the Starter plan.');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Fictional Casey' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'casey.fictional@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fictional1Pass' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(line()).toBeNull();
  });

  it.each([
    ['no destination', ''],
    ['a different private destination', next('/loop')],
    ['the CV Check', next('/check')],
    ['onboarding', next('/onboarding')],
    ['plain pricing with no choice', next('/pricing')],
    ['an unknown plan', next('/pricing?loopPlan=platinum')],
    ['an unknown pass', next('/pricing?plan=lifetime')],
    ['an unlisted market', next('/pricing?loopPlan=active&country=XX&currency=GBP')],
    ['a pass with a smuggled next', next('/pricing?plan=sprint_7d&next=https://attacker.example')],
    ['another site', next('https://attacker.example/pricing?loopPlan=active')],
    ['a protocol-relative address', next('//attacker.example/pricing?loopPlan=active')],
    ['a raw, unencoded return that fails validation', '?next=/pricing?loopPlan=platinum'],
  ])('shows nothing for %s', async (_label, search) => {
    open(search);
    await ready();
    expect(line()).toBeNull();
    expect(screen.queryByText(/to continue with/)).not.toBeInTheDocument();
  });

  it('never appears on the embedded sign-in used inside the CV Check', async () => {
    render(<AuthProvider><MemoryRouter initialEntries={[`/check${next('/pricing?loopPlan=active&country=GB&currency=GBP')}`]}><Auth embedded /></MemoryRouter></AuthProvider>);
    await screen.findByRole('heading', { name: /Sign in to Jobvance/ });
    expect(line()).toBeNull();
  });
});
