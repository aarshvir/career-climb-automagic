import { act, render, renderHook, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AuthCallback from '@/pages/AuthCallback';
import { clearUserAuthCache } from '@/utils/authUtils';

vi.unmock('@/contexts/AuthContext');
vi.unmock('react-router-dom');

const sdk = vi.hoisted(() => ({
  configurationError: null as string | null,
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  initialize: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(),
  signInWithOAuth: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(),
  from: vi.fn(), invoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  get configurationError() { return sdk.configurationError; },
  supabase: {
    auth: {
      initialize: sdk.initialize, getSession: sdk.getSession,
      onAuthStateChange: sdk.onAuthStateChange, signInWithOAuth: sdk.signInWithOAuth,
      signInWithPassword: sdk.signInWithPassword, signUp: sdk.signUp,
      resetPasswordForEmail: sdk.resetPasswordForEmail, updateUser: sdk.updateUser,
      signOut: sdk.signOut,
    },
    from: sdk.from, functions: { invoke: sdk.invoke },
  },
}));

const signedIn = {
  user: { id: 'account-a', email: 'person@example.test' },
  access_token: 'test-session', refresh_token: 'test-refresh', expires_at: 4102444800,
} as Session;

beforeEach(() => {
  vi.clearAllMocks();
  sdk.configurationError = null;
  sdk.listener = null;
  sdk.initialize.mockResolvedValue({ error: null });
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sdk.signInWithOAuth.mockResolvedValue({ error: null });
  sdk.signOut.mockResolvedValue({ error: null });
  sdk.resetPasswordForEmail.mockResolvedValue({ error: null });
  sdk.updateUser.mockResolvedValue({ error: null });
  sdk.onAuthStateChange.mockImplementation(callback => {
    sdk.listener = callback;
    return { data: { subscription: { unsubscribe: sdk.unsubscribe } } };
  });
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('real auth provider', () => {
  it('does not restore a stale persisted session after a newer signed-out event', async () => {
    let finishRead!: (response: { data: { session: Session }; error: null }) => void;
    sdk.getSession.mockReturnValue(new Promise(resolve => { finishRead = resolve; }));
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(sdk.getSession).toHaveBeenCalled());
    act(() => {
      sdk.listener!('SIGNED_IN', signedIn);
      sdk.listener!('SIGNED_OUT', null);
    });
    await act(async () => { finishRead({ data: { session: signedIn }, error: null }); });
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('never rewrites a profile or paid plan when a user signs in', async () => {
    const { result, unmount } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => sdk.listener!('SIGNED_IN', signedIn));
    expect(result.current.user?.id).toBe('account-a');
    expect(sdk.from).not.toHaveBeenCalled();
    unmount();
    expect(sdk.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('treats a confirmation-required signup as success without pretending the user is signed in', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: signedIn.user, session: null }, error: null });
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let outcome;
    await act(async () => { outcome = await result.current.signUpWithEmail(' person@example.test ', 'Password123'); });
    expect(outcome).toEqual({ requiresEmailConfirmation: true });
    expect(result.current.user).toBeNull();
    expect(sdk.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'person@example.test', options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    }));
  });

  it('starts OAuth directly without a provider lookup or unrelated DNS probe', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.signInWithGoogle(); });
    expect(sdk.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(sdk.invoke).not.toHaveBeenCalled();
  });

  it('does not call an inert backend when configuration is missing', async () => {
    sdk.configurationError = 'Sign-in is unavailable until the site is configured.';
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();
    expect(await result.current.signUpWithEmail('person@example.test', 'Password123')).toEqual({ error: sdk.configurationError });
    await expect(result.current.signInWithGoogle()).rejects.toThrow(sdk.configurationError);
    expect(sdk.getSession).not.toHaveBeenCalled();
    expect(sdk.signUp).not.toHaveBeenCalled();
    expect(sdk.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('signs out locally and removes only this account’s application cache', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: signedIn }, error: null });
    localStorage.setItem('plan_account-a', 'paid');
    localStorage.setItem('daily_usage_account-a_2026-10-10', '2');
    localStorage.setItem('plan_account-b', 'other');
    localStorage.setItem('other_application_setting', 'keep');
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.user?.id).toBe('account-a'));
    await act(async () => { await result.current.signOut(); });
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('plan_account-a')).toBeNull();
    expect(localStorage.getItem('daily_usage_account-a_2026-10-10')).toBeNull();
    expect(localStorage.getItem('plan_account-b')).toBe('other');
    expect(localStorage.getItem('other_application_setting')).toBe('keep');
  });

  it('reports sign-out failure instead of pretending the persisted session was removed', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: signedIn }, error: null });
    sdk.signOut.mockResolvedValue({ error: new Error('Connection failed') });
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.user?.id).toBe('account-a'));
    await expect(result.current.signOut()).rejects.toThrow('Connection failed');
    expect(result.current.user?.id).toBe('account-a');
  });
});

describe('signup and password recovery screens', () => {
  it('shows confirmation instructions after signup without displaying an error or looking up the account', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: signedIn.user, session: null }, error: null });
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth /></MemoryRouter></AuthProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email address'), 'person@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await user.type(screen.getByLabelText('Confirm password'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sdk.invoke).not.toHaveBeenCalled();
  });

  it('requests reset instructions without account/provider enumeration', async () => {
    render(<AuthProvider><MemoryRouter><ForgotPassword /></MemoryRouter></AuthProvider>);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'unknown@example.test');
    await user.click(screen.getByRole('button', { name: 'Send Reset Instructions' }));
    expect(await screen.findByText(/If a password account exists, reset instructions will be sent to/)).toBeInTheDocument();
    expect(sdk.resetPasswordForEmail).toHaveBeenCalledWith('unknown@example.test', expect.any(Object));
    expect(sdk.invoke).not.toHaveBeenCalled();
  });

  it('accepts an SDK-established recovery session without raw tokens in the query string', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: signedIn }, error: null });
    render(<AuthProvider><MemoryRouter><ResetPassword /></MemoryRouter></AuthProvider>);
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(screen.queryByText(/This reset link is invalid/)).not.toBeInTheDocument();
  });

  it('does not allow a password update without an established session', async () => {
    render(<AuthProvider><MemoryRouter><ResetPassword /></MemoryRouter></AuthProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(sdk.updateUser).not.toHaveBeenCalled();
  });

  it('updates the password only after recovery has established a session', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: signedIn }, error: null });
    render(<AuthProvider><MemoryRouter><ResetPassword /></MemoryRouter></AuthProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('New password'), 'NewPassword123');
    await user.type(screen.getByLabelText('Confirm password'), 'NewPassword123');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(sdk.updateUser).toHaveBeenCalledWith({ password: 'NewPassword123' }));
  });

  it('waits for the SDK code exchange before reading the callback session and navigating', async () => {
    let initialized!: (response: { error: null }) => void;
    sdk.initialize.mockReturnValue(new Promise(resolve => { initialized = resolve; }));
    sdk.getSession.mockResolvedValue({ data: { session: signedIn }, error: null });
    render(<MemoryRouter initialEntries={['/auth/callback?code=example-once']}><Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/loop" element={<h1>Job Loop dashboard</h1>} />
    </Routes></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Completing sign-in');
    expect(sdk.getSession).not.toHaveBeenCalled();
    await act(async () => { initialized({ error: null }); });
    expect(await screen.findByText('Job Loop dashboard')).toBeInTheDocument();
  });
});

it('cache cleanup also removes only the current account’s interest-form markers', () => {
  localStorage.setItem('last_user_id', 'account-b');
  localStorage.setItem('form_shown_timestamp', 'keep');
  clearUserAuthCache('account-a');
  expect(localStorage.getItem('last_user_id')).toBe('account-b');
  expect(localStorage.getItem('form_shown_timestamp')).toBe('keep');
});

describe('sign-up from Instagram and Facebook ads', () => {
  const instagramIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0';
  const facebookAndroid = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]';
  const signUpForm = async () => {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email address'), 'person@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await user.type(screen.getByLabelText('Confirm password'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    return user;
  };
  const tree = () => <AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Routes><Route path="/auth" element={<Auth />} /><Route path="/loop" element={<h1>Job Loop dashboard</h1>} /></Routes></MemoryRouter></AuthProvider>;
  afterEach(() => vi.restoreAllMocks());

  it('hides Google inside Instagram and offers the phone browser instead', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(instagramIphone);
    render(tree());
    expect(await screen.findByText('You\'re in the Instagram browser.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Safari to use Google' }).getAttribute('href')).toMatch(/^x-safari-https?:\/\//);
  });

  it('sends Facebook on Android to Chrome', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(facebookAndroid);
    render(tree());
    expect((await screen.findByRole('link', { name: 'Open in Chrome to use Google' })).getAttribute('href')).toMatch(/^intent:\/\/.*package=com\.android\.chrome/);
  });

  it('keeps Google in normal browsers', async () => {
    render(tree());
    expect(await screen.findByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });

  it('continues by itself when the person comes back after confirming in another browser', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: signedIn.user, session: null }, error: null });
    sdk.signInWithPassword.mockResolvedValue({ data: { session: signedIn, user: signedIn.user }, error: null });
    render(tree());
    await signUpForm();
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(sdk.signInWithPassword).toHaveBeenCalledWith({ email: 'person@example.test', password: 'Password123' }));
    expect(await screen.findByText('Job Loop dashboard')).toBeInTheDocument();
  });

  it('explains plainly when the email is not confirmed yet', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: signedIn.user, session: null }, error: null });
    sdk.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: { message: 'Email not confirmed' } });
    render(tree());
    const user = await signUpForm();
    await user.click(await screen.findByRole('button', { name: /I've confirmed my email, continue/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your email isn’t confirmed yet.');
  });

  it('says the email is confirmed when the link opens in a different browser', async () => {
    window.history.replaceState(null, '', '/auth/callback?code=from-another-browser');
    render(<MemoryRouter initialEntries={['/auth/callback?code=from-another-browser']}><Routes><Route path="/auth/callback" element={<AuthCallback />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Your email is confirmed' })).toBeInTheDocument();
    expect(screen.queryByText(/invalid or expired/)).not.toBeInTheDocument();
  });
});
