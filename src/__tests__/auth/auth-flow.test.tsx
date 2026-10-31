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
import { rememberLoopReturn, peekLoopReturn } from '@/lib/account-return';
import { detectInAppBrowser } from '@/lib/in-app-browser';
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
  window.localStorage.clear(); sessionStorage.clear();
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
    await user.type(await screen.findByLabelText('Full name'), 'Casey Person');
    await user.type(screen.getByLabelText('Mobile number'), '415 555 0100');
    await user.type(screen.getByLabelText('Email address'), 'person@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
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
      <Route path="/loop" element={<h1>Automated Job Loop dashboard</h1>} />
    </Routes></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Completing sign-in');
    expect(sdk.getSession).not.toHaveBeenCalled();
    await act(async () => { initialized({ error: null }); });
    expect(await screen.findByText('Automated Job Loop dashboard')).toBeInTheDocument();
  });
});

it('cache cleanup also removes only the current account’s interest-form markers', () => {
  localStorage.setItem('last_user_id', 'account-b');
  localStorage.setItem('form_shown_timestamp', 'keep');
  clearUserAuthCache('account-a');
  expect(localStorage.getItem('last_user_id')).toBe('account-b');
  expect(localStorage.getItem('form_shown_timestamp')).toBe('keep');
});


describe('Automated Job Loop account entry and confirmation recovery', () => {
  it('keeps the Automated Job Loop outcome and first steps beside signup on mobile markup', async () => {
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup&next=%2Fonboarding']}><Auth /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText('Your Automated Job Loop')).toBeInTheDocument();
    expect(screen.getByRole('list', { name:'After creating your account' })).toHaveTextContent('run your first search');
    expect(screen.getByText(/Automated Job Loop plans from US\$29\/month/)).toBeInTheDocument();
    expect(sdk.signUp).not.toHaveBeenCalled();
  });
  it('tells an ad visitor what they get, what it costs and that they stay in control, before the form', async () => {
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup&next=%2Fonboarding&utm_source=meta']}><Auth /></MemoryRouter></AuthProvider>);
    const benefits = await screen.findByRole('list', { name:'What the Automated Job Loop does' });
    expect(benefits).toHaveTextContent('Roles matched to your CV.');
    expect(benefits).toHaveTextContent('A tailored CV for each role.');
    expect(benefits).toHaveTextContent('Written to fit each job’s requirements.');
    expect(benefits).toHaveTextContent('Built only from facts you confirm.');
    expect(screen.getByText('Your account also includes 3 AI-tailored CVs a month, free.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name:'See plans' })).toHaveAttribute('href', '/pricing');
    // The explanation sits above the form fields, and the form is unchanged.
    const form = screen.getByLabelText('Email address');
    expect(benefits.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });
  it('does not show the product explainer on an ordinary sign-in or after the confirmation email is sent', async () => {
    const { unmount } = render(<AuthProvider><MemoryRouter initialEntries={['/auth']}><Auth /></MemoryRouter></AuthProvider>);
    await screen.findByText('Sign in to Jobvance');
    expect(screen.queryByRole('list', { name:'What the Automated Job Loop does' })).not.toBeInTheDocument();
    unmount();
  });
  it.each(['Instagram 321.0','Mozilla [FBAN/FBIOS;FBAV/500]'])('offers email and browser guidance for %s without attempting blocked OAuth', async agent => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup&next=%2Fonboarding']}><Auth /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText('You’re in an app’s browser.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name:'Continue with Google' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeEnabled();
    expect(screen.getByRole('button', { name:'Copy sign-in link' })).toBeEnabled();
    expect(sdk.signInWithOAuth).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('does not confuse an ordinary mobile browser with a social-app webview', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit Safari/604.1')).toBeNull();
    expect(detectInAppBrowser('Mozilla/5.0 Android Chrome/130.0 Mobile')).toBeNull();
  });
  it('keeps the original setup destination when a callback cannot establish a session', async () => {
    rememberLoopReturn('/onboarding');
    render(<MemoryRouter initialEntries={['/auth/callback?code=already-used']}><Routes>
      <Route path='/auth/callback' element={<AuthCallback />} /><Route path='/auth' element={<p>Resume account sign-in</p>} />
    </Routes></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('password you chose');
    expect(peekLoopReturn()).toBe('/onboarding');
    await userEvent.setup().click(screen.getByRole('button', { name:'Sign in with email and password' }));
    expect(await screen.findByText('Resume account sign-in')).toBeInTheDocument();
  });
});


it('continues the same signup on one deliberate click without focus-triggered login', async () => {
  sdk.signUp.mockResolvedValue({data:{user:signedIn.user,session:null},error:null});
  sdk.signInWithPassword.mockResolvedValue({data:{user:signedIn.user,session:signedIn},error:null});
  render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup&next=%2Fonboarding']}><Routes><Route path='/auth' element={<Auth />} /><Route path='/onboarding' element={<h1>Choose your roles</h1>} /></Routes></MemoryRouter></AuthProvider>);
  const user=userEvent.setup();await user.type(await screen.findByLabelText('Full name'),'New Candidate');await user.type(screen.getByLabelText('Mobile number'),'415 555 0100');await user.type(screen.getByLabelText('Email address'),'new-candidate@example.test');await user.type(screen.getByLabelText('Password',{exact:true}),'Password123');await user.click(screen.getByRole('button',{name:'Create account'}));
  await screen.findByText('Check your email');await act(async()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});expect(sdk.signInWithPassword).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'I’ve confirmed my email, continue'}));expect(await screen.findByText('Choose your roles')).toBeInTheDocument();expect(sdk.signInWithPassword).toHaveBeenCalledTimes(1);
});
it('does not reuse pending signup credentials after an SDK account change and sign-out', async () => {
  sdk.signUp.mockResolvedValue({data:{user:signedIn.user,session:null},error:null});
  render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth embedded /></MemoryRouter></AuthProvider>);
  const user=userEvent.setup();await user.type(await screen.findByLabelText('Full name'),'Another Candidate');await user.type(screen.getByLabelText('Mobile number'),'415 555 0100');await user.type(screen.getByLabelText('Email address'),'another-candidate@example.test');await user.type(screen.getByLabelText('Password',{exact:true}),'Password123');await user.click(screen.getByRole('button',{name:'Create account'}));await screen.findByText('Check your email');
  act(()=>{sdk.listener!('SIGNED_IN',signedIn);sdk.listener!('SIGNED_OUT',null);});
  await user.click(screen.getByRole('button',{name:'I’ve confirmed my email, continue'}));expect(sdk.signInWithPassword).not.toHaveBeenCalled();expect(screen.getByLabelText('Password',{exact:true})).toHaveValue('');
});

describe('signup validation blocks submission and names each failing field', () => {
  const open = () => render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth /></MemoryRouter></AuthProvider>);

  it('makes no signUp call for a blank form and marks every required field invalid with its own message', async () => {
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(sdk.signUp).not.toHaveBeenCalled();
    const name = screen.getByLabelText('Full name'), phone = screen.getByLabelText('Mobile number'), email = screen.getByLabelText('Email address');
    const password = screen.getByLabelText('Password', { exact: true });
    for (const field of [name, phone, email, password]) expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Please enter your full name.')).toBeInTheDocument();
    expect(screen.getByText('Please enter a valid mobile number, including the country code.')).toBeInTheDocument();
    expect(screen.getAllByText('Please enter a valid email address.').length).toBeGreaterThan(0);
    expect(screen.getByText('Choose a password to continue.')).toBeInTheDocument();
    expect(name).toHaveFocus();
  });

  // Changed on purpose: sign-up no longer asks the visitor to retype the password. The single field keeps the show-password toggle and the rules.
  it('has one password field with its rules and the show-password toggle, and no confirm-password field', async () => {
    open();
    await screen.findByRole('button', { name: 'Create account' });
    expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll('input[autocomplete="new-password"], input[type="password"]')).toHaveLength(1);
    expect(screen.getByText('Use at least 8 characters, uppercase and lowercase letters, and a number.')).toBeInTheDocument();
    const password = screen.getByLabelText('Password', { exact: true });
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });

  it('makes no signUp call for a password that breaks the rules, and names the password field', async () => {
    open();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Casey Person');
    await user.type(screen.getByLabelText('Mobile number'), '415 555 0100');
    await user.type(screen.getByLabelText('Email address'), 'person@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(sdk.signUp).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(/uppercase|number/i);
  });

  it('clears a field message when that field is edited', async () => {
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Full name'), 'Casey Person');
    expect(screen.getByLabelText('Full name')).not.toHaveAttribute('aria-invalid');
  });
});

describe('round 8: free CV Check entry copy and the signup contract', () => {
  it('opens the free CV Check entry on its own headline, not the Automated Job Loop setup headline', async () => {
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup&next=%2Fcheck']}><Auth /></MemoryRouter></AuthProvider>);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Start your free CV Check.');
    expect(screen.getByText('Download PDF, Word or text')).toBeInTheDocument();
    expect(screen.queryByText(/Set up your Automated Job Loop/)).not.toBeInTheDocument();
  });
  it('keeps the Automated Job Loop headline for the onboarding entry', async () => {
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup&next=%2Fonboarding']}><Auth /></MemoryRouter></AuthProvider>);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Set up your Automated Job Loop and let it run.');
  });
  it('blocks an invalid signup per field, then sends the same contact details on a valid one', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: signedIn.user, session: null }, error: null });
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth /></MemoryRouter></AuthProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Casey Person');
    await user.type(screen.getByLabelText('Mobile number'), '12');
    await user.type(screen.getByLabelText('Email address'), 'not-an-email');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(sdk.signUp).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Mobile number')); await user.type(screen.getByLabelText('Mobile number'), '415 555 0100');
    await user.clear(screen.getByLabelText('Email address')); await user.type(screen.getByLabelText('Email address'), 'person@example.test');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(sdk.signUp).toHaveBeenCalledTimes(1);
    expect(sdk.signUp.mock.calls[0][0]).toMatchObject({ email: 'person@example.test', password: 'Password123' });
    expect(JSON.stringify(sdk.signUp.mock.calls[0][0])).toContain('Casey Person');
  });
  it('does not spend rate-limit attempts on blank or invalid submits: three blank submits, then a valid one, still signs up', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: signedIn.user, session: null }, error: null });
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth /></MemoryRouter></AuthProvider>);
    const user = userEvent.setup();
    const email = 'limiter-order@example.test';
    await user.type(await screen.findByLabelText('Email address'), email);
    for (let attempt = 0; attempt < 6; attempt++) await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(sdk.signUp).not.toHaveBeenCalled();
    expect(screen.queryByText(/Too many attempts/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Full name'), 'Casey Person');
    await user.type(screen.getByLabelText('Mobile number'), '415 555 0100');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(sdk.signUp).toHaveBeenCalledTimes(1);
  });
});
