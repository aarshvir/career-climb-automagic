import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import { META_PIXEL_ID, setAdsOptOut, trackMetaPage } from '@/lib/meta-pixel';
import { authRateLimiter } from '@/lib/security';

vi.unmock('@/contexts/AuthContext');
vi.unmock('react-router-dom');

const sdk = vi.hoisted(() => ({
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  initialize: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(),
  signInWithOAuth: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), from: vi.fn(), invoke: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  configurationError: null,
  supabase: {
    auth: { initialize: sdk.initialize, getSession: sdk.getSession, onAuthStateChange: sdk.onAuthStateChange, signInWithOAuth: sdk.signInWithOAuth, signInWithPassword: sdk.signInWithPassword, signUp: sdk.signUp, signOut: vi.fn() },
    from: sdk.from, functions: { invoke: sdk.invoke },
  },
}));

const calls = () => (window.fbq?.queue ?? []).map(args => [...args]);
const submitted = () => calls().filter(args => args[0] === 'trackSingleCustom' && args[1] === META_PIXEL_ID && args[2] === 'SignupSubmitted');
const registrations = () => calls().filter(args => args[0] === 'track' && args[1] === 'CompleteRegistration');
const adUrl = '/auth?mode=signup&next=%2Fonboarding&utm_source=instagram&utm_medium=paid&utm_content=c01&fbclid=abc123';

function open(url = adUrl, embedded = false) {
  window.history.replaceState(null, '', url);
  return render(<AuthProvider><MemoryRouter initialEntries={[url]}><Auth embedded={embedded} /></MemoryRouter></AuthProvider>);
}
async function fill(user: ReturnType<typeof userEvent.setup>, email = 'person@example.test', password = 'Password123') {
  await user.type(await screen.findByLabelText('Full name'), 'Casey Person');
  await user.type(screen.getByLabelText('Mobile number'), '415 555 0100');
  if (email) await user.type(screen.getByLabelText('Email address'), email);
  if (password) await user.type(screen.getByLabelText('Password', { exact: true }), password);
}

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('PROD', true);
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone: 'America/New_York' }) } as Intl.DateTimeFormat);
  sdk.initialize.mockResolvedValue({ error: null });
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sdk.signUp.mockResolvedValue({ data: { user: { id: 'account-a', email: 'person@example.test' }, session: null }, error: null });
  sdk.onAuthStateChange.mockImplementation(callback => { sdk.listener = callback; return { data: { subscription: { unsubscribe: sdk.unsubscribe } } }; });
  localStorage.clear(); sessionStorage.clear();
  authRateLimiter.reset('person@example.test'); authRateLimiter.reset('limited@example.test');
});
afterEach(() => {
  cleanup(); setAdsOptOut(false);
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  delete window.fbq; delete window._fbq;
  document.querySelectorAll('script[src*="fbevents"]').forEach(node => node.remove());
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
});

describe('sign-up submitted funnel event', () => {
  it('fires one content-free SignupSubmitted when a valid sign-up is submitted, and no registration', async () => {
    open();
    const user = userEvent.setup();
    await fill(user);
    expect(submitted()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(sdk.signUp).toHaveBeenCalledTimes(1);
    expect(submitted()).toEqual([['trackSingleCustom', META_PIXEL_ID, 'SignupSubmitted']]);
    expect(registrations()).toHaveLength(0);
    expect(JSON.stringify(calls())).not.toMatch(/Casey|person@|Password123|415|5550100|example\.test/);
  });

  it('fires nothing while the form is invalid, and nothing for sign-in', async () => {
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    await fill(user, 'not-an-email', 'password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(sdk.signUp).not.toHaveBeenCalled();
    expect(submitted()).toHaveLength(0);
    cleanup();
    open('/auth?utm_source=instagram');
    await user.type(await screen.findByLabelText('Email address'), 'person@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    sdk.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(sdk.signInWithPassword).toHaveBeenCalled();
    expect(submitted()).toHaveLength(0);
  });

  it('counts each real submit once, so a retry after a failed attempt is a second attempt', async () => {
    sdk.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'Network request failed' } });
    open();
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('alert');
    expect(submitted()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(submitted()).toHaveLength(2);
  });

  it('does not count a submit that the sixth-attempt limiter blocked', async () => {
    const email = 'limited@example.test';
    for (let i = 0; i < 5; i++) expect(authRateLimiter.check(email)).toBe(true); // the sixth attempt in a minute is the one that is blocked
    open();
    const user = userEvent.setup();
    await fill(user, email);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    expect(sdk.signUp).not.toHaveBeenCalled();
    expect(submitted()).toHaveLength(0);
  });

  it.each([
    ['an opted-out visitor', () => setAdsOptOut(true)],
    ['a Global Privacy Control signal', () => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })],
  ])('sends nothing for %s, and the account is still created', async (_name, apply) => {
    open();
    apply();
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(sdk.signUp).toHaveBeenCalledTimes(1);
    expect(window.fbq).toBeUndefined();
  });

  it('sends nothing from a URL that carries a token or an unknown query key, and the account is still created', async () => {
    open('/auth?mode=signup&next=%2Fonboarding&token=private&utm_source=instagram');
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(window.fbq).toBeUndefined();
  });

  it('sends nothing on the private CV Check page, where the embedded form can appear, even if the pixel is already running', async () => {
    open(adUrl);
    trackMetaPage('/auth'); // the sign-up page's PageView started the pixel
    expect(window.fbq).toBeDefined();
    const user = userEvent.setup();
    await fill(user);
    window.history.replaceState(null, '', '/check');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(submitted()).toHaveLength(0);
  });

  it('is invisible outside a production build', async () => {
    vi.stubEnv('PROD', false);
    open();
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(window.fbq).toBeUndefined();
  });
});
