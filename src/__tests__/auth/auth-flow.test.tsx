import { act, render, renderHook, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AuthCallback from '@/pages/AuthCallback';
import { rememberLoopReturn, peekLoopReturn } from '@/lib/account-return';
import { detectInAppBrowser } from '@/lib/in-app-browser';
import { clearUserAuthCache } from '@/utils/authUtils';
import MvpHeader from '@/components/layout/MvpHeader';

vi.unmock('@/contexts/AuthContext');
vi.unmock('react-router-dom');

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));

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
    await user.type(screen.getByLabelText('Mobile number (optional)'), '415 555 0100');
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
  it('gives the free CV Check entry CV Check steps, with no Job Loop price or search steps', async () => {
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup&next=%2Fcheck']}><Auth /></MemoryRouter></AuthProvider>);
    const steps = await screen.findByRole('list', { name: 'After creating your free CV Check account' });
    expect(steps).toHaveTextContent('Add your CV and the job ad');
    expect(steps).toHaveTextContent('tick that your CV is accurate, then download');
    expect(steps).not.toHaveTextContent(/search|schedule/i);
    expect(screen.queryByText(/Automated Job Loop plans from US\$29\/month/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'After creating your account' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
  });
  it('tells an ad visitor what they get, what it costs and that they stay in control, before the form', async () => {
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup&next=%2Fonboarding&utm_source=meta']}><Auth /></MemoryRouter></AuthProvider>);
    const benefits = await screen.findByRole('list', { name:'What the Automated Job Loop does' });
    expect(benefits).toHaveTextContent('Roles matched to your CV.');
    expect(benefits).toHaveTextContent('Tailored CVs for matching roles.');
    expect(benefits).toHaveTextContent('Read and approve the prepared CV first.');
    expect(benefits).toHaveTextContent('Based on facts you confirm.');
    expect(screen.getByText('Your account also includes 3 AI-tailored CVs a month, free.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name:'See plans' })).toHaveAttribute('href', '/pricing');
    // The explanation sits above the form fields, and the form is unchanged.
    const form = screen.getByLabelText('Email address');
    expect(benefits.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile number (optional)')).toBeInTheDocument();
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
  const user=userEvent.setup();await user.type(await screen.findByLabelText('Full name'),'New Candidate');await user.type(screen.getByLabelText('Mobile number (optional)'),'415 555 0100');await user.type(screen.getByLabelText('Email address'),'new-candidate@example.test');await user.type(screen.getByLabelText('Password',{exact:true}),'Password123');await user.click(screen.getByRole('button',{name:'Create account'}));
  await screen.findByText('Check your email');await act(async()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});expect(sdk.signInWithPassword).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'I’ve confirmed my email, continue'}));expect(await screen.findByText('Choose your roles')).toBeInTheDocument();expect(sdk.signInWithPassword).toHaveBeenCalledTimes(1);
});
it('does not reuse pending signup credentials after an SDK account change and sign-out', async () => {
  sdk.signUp.mockResolvedValue({data:{user:signedIn.user,session:null},error:null});
  render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth embedded /></MemoryRouter></AuthProvider>);
  const user=userEvent.setup();await user.type(await screen.findByLabelText('Full name'),'Another Candidate');await user.type(screen.getByLabelText('Mobile number (optional)'),'415 555 0100');await user.type(screen.getByLabelText('Email address'),'another-candidate@example.test');await user.type(screen.getByLabelText('Password',{exact:true}),'Password123');await user.click(screen.getByRole('button',{name:'Create account'}));await screen.findByText('Check your email');
  act(()=>{sdk.listener!('SIGNED_IN',signedIn);sdk.listener!('SIGNED_OUT',null);});
  await user.click(screen.getByRole('button',{name:'I’ve confirmed my email, continue'}));expect(sdk.signInWithPassword).not.toHaveBeenCalled();expect(screen.getByLabelText('Password',{exact:true})).toHaveValue('');
});

describe('signup validation blocks submission and names each failing field', () => {
  const open = () => render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth /></MemoryRouter></AuthProvider>);

  it('makes no signUp call for a blank form and marks every required field invalid with its own message (the mobile number is optional)', async () => {
    open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(sdk.signUp).not.toHaveBeenCalled();
    const name = screen.getByLabelText('Full name'), phone = screen.getByLabelText('Mobile number (optional)'), email = screen.getByLabelText('Email address');
    const password = screen.getByLabelText('Password', { exact: true });
    for (const field of [name, email, password]) expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(phone).not.toHaveAttribute('aria-invalid'); expect(phone).not.toBeRequired();
    expect(screen.getByText('Please enter your full name.')).toBeInTheDocument();
    expect(screen.queryByText(/valid mobile number/i)).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText('Mobile number (optional)'), '415 555 0100');
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
    await user.type(screen.getByLabelText('Mobile number (optional)'), '12');
    await user.type(screen.getByLabelText('Email address'), 'not-an-email');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(sdk.signUp).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Mobile number (optional)')); await user.type(screen.getByLabelText('Mobile number (optional)'), '415 555 0100');
    await user.clear(screen.getByLabelText('Email address')); await user.type(screen.getByLabelText('Email address'), 'person@example.test');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(sdk.signUp).toHaveBeenCalledTimes(1);
    expect(sdk.signUp.mock.calls[0][0]).toMatchObject({ email: 'person@example.test', password: 'Password123' });
    expect(JSON.stringify(sdk.signUp.mock.calls[0][0])).toContain('Casey Person');
  });
  it('signs up with only a name, email and password, sending no phone at all', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: signedIn.user, session: null }, error: null });
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth /></MemoryRouter></AuthProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Casey Person');
    await user.type(screen.getByLabelText('Email address'), 'no-phone@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(sdk.signUp).toHaveBeenCalledTimes(1);
    expect(sdk.signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Casey Person' });
  });
  it('still rejects a mobile number that is typed but invalid, and names the field', async () => {
    render(<AuthProvider><MemoryRouter initialEntries={['/auth?mode=signup']}><Auth /></MemoryRouter></AuthProvider>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Casey Person');
    await user.type(screen.getByLabelText('Mobile number (optional)'), '12');
    await user.type(screen.getByLabelText('Email address'), 'bad-phone@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(sdk.signUp).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Mobile number (optional)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText('Please enter a valid mobile number with the country code, or leave it blank.').length).toBeGreaterThan(0);
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
    await user.type(screen.getByLabelText('Mobile number (optional)'), '415 555 0100');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(sdk.signUp).toHaveBeenCalledTimes(1);
  });
});

describe('same-route account navigation', () => {
  function entry(path = '/auth?mode=signup&next=%2Fcheck') {
    return <AuthProvider><MemoryRouter initialEntries={[path]}><MvpHeader /><Link to="/auth?next=%2Fcheck">Use existing account</Link><Auth /></MemoryRouter></AuthProvider>;
  }
  it('changes to the sign-in form when another link navigates within /auth', async () => {
    render(entry());
    await screen.findByRole('heading', { name: 'Create your Jobvance account' });
    await userEvent.setup().click(screen.getByRole('link', { name: 'Use existing account' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to Jobvance' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(sdk.signInWithPassword).not.toHaveBeenCalled();
  });
  it('keeps the CV Check destination and allowed campaign tags in the header sign-in link', async () => {
    render(entry('/auth?mode=signup&next=%2Fcheck&utm_source=meta&utm_medium=paid_social&utm_campaign=fixture-campaign&code=synthetic-code'));
    await screen.findByRole('heading', { name: 'Create your Jobvance account' });
    const link = screen.getAllByRole('link', { name: /^Sign in$/ })[0];
    const url = new URL(link.getAttribute('href')!, 'https://jobvance.io');
    expect(url.searchParams.get('next')).toBe('/check');
    expect(url.searchParams.get('utm_campaign')).toBe('fixture-campaign');
    expect(url.searchParams.has('code')).toBe(false);
    await userEvent.setup().click(link);
    expect(await screen.findByRole('heading', { name: 'Sign in to Jobvance' })).toBeInTheDocument();
  });
  it('does not revive a pending signup confirmation after navigating to sign in', async () => {
    let finish!: (value: unknown) => void;
    sdk.signUp.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(entry());
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Fixture Person');
    await user.type(screen.getByLabelText('Email address'), 'navigation-fixture@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'FixturePassword123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(sdk.signUp).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('link', { name: 'Use existing account' }));
    await act(async () => { finish({ data: { user: signedIn.user, session: null }, error: null }); });
    expect(await screen.findByRole('heading', { name: 'Sign in to Jobvance' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmed my email/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(sdk.signInWithPassword).not.toHaveBeenCalled();
  });
  it('clears an already displayed signup continuation when navigating to sign in', async () => {
    sdk.signUp.mockResolvedValue({ data: { user: signedIn.user, session: null }, error: null });
    render(entry());
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Fixture Person');
    await user.type(screen.getByLabelText('Email address'), 'confirmed-navigation@example.test');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'FixturePassword123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('button', { name: /confirmed my email/ });
    await user.click(screen.getByRole('link', { name: 'Use existing account' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to Jobvance' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmed my email/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(sdk.signInWithPassword).not.toHaveBeenCalled();
  });
  it.each([
    ['/auth?mode=signup&next=https%3A%2F%2Foutside.invalid', '/loop'],
    ['/auth?mode=signup&next=%2Fcheck%3Fcode%3Dsynthetic-code', '/loop'],
    ['/auth?mode=signup&next=%2Fpricing%3Fplan%3Dsprint_7d', '/pricing?plan=sprint_7d'],
  ])('keeps the bounded return contract for %s', async (path, destination) => {
    render(entry(path));
    await screen.findByRole('heading', { name: 'Create your Jobvance account' });
    const url = new URL(screen.getAllByRole('link', { name: /^Sign in$/ })[0].getAttribute('href')!, 'https://jobvance.io');
    expect(url.searchParams.get('next')).toBe(destination);
    expect(sdk.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('copies the bounded destination and campaign tags for an external browser, without auth tokens', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Instagram 321.0');
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    try {
      render(entry('/auth?mode=signup&next=%2Fcheck&utm_source=meta&utm_medium=paid_social&utm_campaign=fixture-campaign&fbclid=fixture-click&code=synthetic-code&access_token=synthetic-token#private-fragment'));
      await user.click(await screen.findByRole('button', { name: 'Copy sign-in link' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      const copied = new URL(writeText.mock.calls[0][0]);
      expect(copied.pathname).toBe('/auth');
      expect(copied.searchParams.get('mode')).toBe('signup');
      expect(copied.searchParams.get('next')).toBe('/check');
      expect(copied.searchParams.get('utm_campaign')).toBe('fixture-campaign');
      expect(copied.searchParams.get('fbclid')).toBe('fixture-click');
      expect(copied.searchParams.has('code')).toBe(false);
      expect(copied.searchParams.has('access_token')).toBe(false);
      expect(copied.hash).toBe('');
      expect(sdk.signInWithOAuth).not.toHaveBeenCalled();
      expect(sdk.signUp).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });
});
