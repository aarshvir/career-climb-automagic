import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MvpApp from '@/MvpApp';
import { authRateLimiter } from '@/lib/security';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';

vi.unmock('react-router-dom');
vi.unmock('@tanstack/react-query');
const state = vi.hoisted(() => ({
  user: null as User | null,
  session: null as Session | null,
  loading: false,
  signInWithEmail: vi.fn(), signUpWithEmail: vi.fn(), signInWithGoogle: vi.fn(), resetPassword: vi.fn(), readAuthSession: vi.fn(),
  retryConnection: vi.fn(), initialize: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ user: state.user, session: state.session, loading: state.loading, authError: null, configurationError: null,
    signInWithEmail: state.signInWithEmail, signUpWithEmail: state.signUpWithEmail,
    signInWithGoogle: state.signInWithGoogle, resetPassword: state.resetPassword, retryConnection: state.retryConnection }),
}));
vi.mock('@/utils/authSession', () => ({ readAuthSession: state.readAuthSession }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null, supabase: { auth: { initialize: state.initialize, getSession: state.getSession, onAuthStateChange: state.onAuthStateChange } } }));
vi.mock('@/components/layout/Header', () => ({ default: () => null }));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));
vi.mock('@/components/RouteNavigation', () => ({ default: () => null }));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/pages/ProductPage', () => ({ default: () => <p>Public page</p> }));
vi.mock('@/pages/Workspace', () => ({ default: () => <WorkspaceDestination /> }));
vi.mock('@/pages/JobLoop', () => ({ default: () => <WorkspaceDestination /> }));
vi.mock('@/pages/CvCheck', () => ({ default: () => <WorkspaceDestination /> }));

function WorkspaceDestination() {
  const location = useLocation();
  return <main><h1>Workspace for {state.user?.id}</h1><p data-testid="workspace-path">{location.pathname}{location.search}</p></main>;
}
const owner = { id: 'return-fixture-owner', email: 'return-fixture@example.test', app_metadata: {}, aud: 'authenticated', created_at: '2026-10-26', user_metadata: { full_name: 'Fixture Person', phone: '+15555550100' } } as User;
/** Mirrors AuthProvider's synchronous SDK owner/session observation before render. */
function adoptOwner() {
  state.user = owner;
  state.session = { user: owner, access_token: `header.${btoa(JSON.stringify({ sub: owner.id, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))}.fixture`, token_type: 'bearer', expires_in: 3600, refresh_token: 'unused-fixture' };
  setTrackingDraftOwner(owner.id, cvVariantSessionIdentity(state.session));
}
function open(path: string) {
  window.history.replaceState(null, '', path);
  return render(<MvpApp />);
}
async function finishEmail(view: ReturnType<typeof render>) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), owner.email);
  await user.type(screen.getByLabelText('Password'), 'FixturePassword123');
  await user.click(screen.getByRole('button', { name: /^Sign in$/ }));
  await waitFor(() => expect(state.signInWithEmail).toHaveBeenCalledWith(owner.email, 'FixturePassword123'));
  await act(async () => { adoptOwner(); view.rerender(<MvpApp />); });
}
beforeEach(() => {
  vi.clearAllMocks(); clearTrackingDraftMemory(); state.user = null; state.session = null; state.loading = false; setTrackingDraftOwner(null, null);
  state.signInWithEmail.mockResolvedValue({ error: null });
  state.signUpWithEmail.mockResolvedValue({ error: null, requiresEmailConfirmation: false });
  state.signInWithGoogle.mockResolvedValue(undefined); state.resetPassword.mockResolvedValue({ error: null });
  state.readAuthSession.mockImplementation(async () => state.session);
  state.initialize.mockResolvedValue({ error: null }); state.getSession.mockImplementation(async () => ({ data: { session: state.session }, error: null }));
  state.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  authRateLimiter.reset(owner.email); sessionStorage.clear(); localStorage.clear();
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); sessionStorage.clear(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

describe('protected legacy workspace return through real app routes', () => {
  it('opens the main Automated Job Loop dashboard for a signed-in bare dashboard visit', async () => {
    adoptOwner(); open('/dashboard');
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(/^\/loop$/);
  });
  it('returns a signed-out bare dashboard visit to your Automated Job Loop after sign-in', async () => {
    const view = open('/dashboard');
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/loop');
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(/^\/loop$/);
  });
  it.each([
    '/dashboard?tab=billing&checkout=success',
    '/dashboard?pack=afe62064-a331-4ce6-9e51-2849e091ba54',
    '/dashboard?tracked=afe62064-a331-4ce6-9e51-2849e091ba54',
  ])('preserves an explicit signed-in legacy destination %s', async path => {
    adoptOwner(); open(path);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(path);
  });
  it('normalizes a signed-out payment return to billing without carrying payment query data', async () => {
    const view = open('/dashboard?tab=billing&checkout=success');
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/dashboard?tab=billing');
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent('/dashboard?tab=billing');
  });
  it('requires account creation before opening CV Check and returns an existing user to the check', async () => {
    const view = open('/check');
    await screen.findByRole('heading', { name: 'Create your Jobvance account' });
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/check');
    expect(screen.queryByTestId('workspace-path')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(/^\/check$/);
  });
  it('keeps only the ad campaign tags when a signed-out ad click on CV Check is sent to sign-up', async () => {
    open('/check?utm_source=instagram&utm_medium=paid&utm_campaign=free-cv-check&utm_content=c01&fbclid=abc123&savedCheck=afe62064-a331-4ce6-9e51-2849e091ba54&reuseCheck=x&code=private-code');
    await screen.findByRole('heading', { name: 'Create your Jobvance account' });
    expect(window.location.pathname).toBe('/auth');
    const query = new URLSearchParams(window.location.search);
    expect(Object.fromEntries(query)).toEqual({ mode: 'signup', next: '/check', utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'free-cv-check', utm_content: 'c01', fbclid: 'abc123' });
    expect(screen.queryByTestId('workspace-path')).not.toBeInTheDocument();
  });
  it('sends a signed-out CV Check visit with no campaign tags to the same sign-up page as before', async () => {
    open('/check');
    await screen.findByRole('heading', { name: 'Create your Jobvance account' });
    expect(window.location.search).toBe('?mode=signup&next=%2Fcheck');
  });
  it('preserves the account-only CV Check destination through Google sign-in', async () => {
    const view = open('/check');
    await screen.findByRole('heading', { name: 'Create your Jobvance account' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(JSON.parse(sessionStorage.getItem('jobvance_account_return_v1')!).path).toBe('/check');
    view.unmount(); adoptOwner(); open('/auth/callback?code=synthetic-return-code');
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(/^\/check$/);
    expect(sessionStorage.getItem('jobvance_account_return_v1')).toBeNull();
  });
  it('remembers only the exact quiz route before an email confirmation redirect', async () => {
    state.signUpWithEmail.mockResolvedValue({ requiresEmailConfirmation: true });
    open('/auth?mode=signup&next=%2Fonboarding');
    await screen.findByRole('heading', { name: 'Create your Jobvance account' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Fixture Person');
    await user.type(screen.getByLabelText('Mobile number (optional)'), '555 555 0100');
    await user.type(screen.getByLabelText('Email address'), owner.email);
    await user.type(screen.getByLabelText('Password'), 'FixturePassword123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(state.signUpWithEmail).toHaveBeenCalledWith(owner.email, 'FixturePassword123', { fullName: 'Fixture Person', phone: '+15555550100' });
    expect(JSON.parse(sessionStorage.getItem('jobvance_account_return_v1')!).path).toBe('/onboarding');
    expect(localStorage.length).toBe(0);
  });
  it.each([
    ['/applications', 'tracker'], ['/resume-management', 'cv'], ['/resumes', 'cv'],
    ['/job-preferences', 'tailor'], ['/preferences', 'tailor'], ['/settings', 'billing'], ['/thank-you', 'billing'],
  ])('preserves %s as its requested tab before sign-in', async (path, tab) => {
    open(path);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    expect(window.location.pathname).toBe('/auth');
    expect(new URLSearchParams(window.location.search).get('next')).toBe(path === '/applications' ? '/applications' : `/dashboard?tab=${tab}`);
    expect(screen.queryByTestId('workspace-path')).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  });

  it.each(['cv', 'tailor', 'tracker', 'billing'])('returns an email sign-in to the requested %s tab', async tab => {
    const view = open(`/dashboard?tab=${tab}`);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(`/dashboard?tab=${tab}`);
    expect(screen.getByRole('heading', { name: `Workspace for ${owner.id}` })).toBeInTheDocument();
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  });

  it.each(['cv', 'tailor', 'tracker', 'billing'])('returns a Google callback to the requested %s tab once', async tab => {
    const view = open(`/dashboard?tab=${tab}`);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(state.signInWithGoogle).toHaveBeenCalledOnce();
    const retained = sessionStorage.getItem('jobvance_account_return_v1');
    expect(JSON.parse(retained!).path).toBe(`/dashboard?tab=${tab}`);
    expect(localStorage.length).toBe(0);
    view.unmount(); adoptOwner();
    open('/auth/callback?code=synthetic-return-code');
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(`/dashboard?tab=${tab}`);
    expect(state.readAuthSession).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('jobvance_account_return_v1')).toBeNull();
  });

  it('waits for auth resolution and strips unrelated query and hash data from the return', async () => {
    state.loading = true;
    const view = open('/dashboard?email=private@example.test&tab=tracker&next=https://evil.example#private-fragment');
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your sign-in');
    expect(window.location.pathname).toBe('/dashboard');
    await act(async () => { state.loading = false; view.rerender(<MvpApp />); });
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    expect(window.location.pathname + window.location.search).toBe('/auth?next=%2Fdashboard%3Ftab%3Dtracker');
    expect(window.location.hash).toBe('');
    expect(sessionStorage.length).toBe(0);
  });

  it('keeps the ordinary sign-in default at /loop', async () => {
    const view = open('/auth');
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(/^\/loop$/);
  });

  it('falls back to /loop for an arbitrary supplied email return', async () => {
    const view = open(`/auth?next=${encodeURIComponent('//evil.example/dashboard?tab=tracker')}`);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(/^\/loop$/);
  });
  it('preserves a saved-check selector through email sign-in without carrying its text', async () => {
    const path = '/loop?fromCheck=afe62064-a331-4ce6-9e51-2849e091ba54';
    const view = open(path);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    expect(new URLSearchParams(window.location.search).get('next')).toBe(path);
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(path);
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  });
  it('preserves a saved-check selector through the Google callback once', async () => {
    const path = '/loop?fromCheck=afe62064-a331-4ce6-9e51-2849e091ba54';
    const view = open(path);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 2 });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(JSON.parse(sessionStorage.getItem('jobvance_account_return_v1')!).path).toBe(path);
    view.unmount(); adoptOwner();
    open('/auth/callback?code=synthetic-return-code');
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(path);
    expect(sessionStorage.getItem('jobvance_account_return_v1')).toBeNull();
  });

});
