import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MvpApp from '@/MvpApp';
import { authRateLimiter } from '@/lib/security';

vi.unmock('react-router-dom');
vi.unmock('@tanstack/react-query');
const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  loading: false,
  signInWithEmail: vi.fn(), signUpWithEmail: vi.fn(), signInWithGoogle: vi.fn(), resetPassword: vi.fn(), readAuthSession: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ user: state.user, loading: state.loading, authError: null, configurationError: null,
    signInWithEmail: state.signInWithEmail, signUpWithEmail: state.signUpWithEmail,
    signInWithGoogle: state.signInWithGoogle, resetPassword: state.resetPassword }),
}));
vi.mock('@/utils/authSession', () => ({ readAuthSession: state.readAuthSession }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null }));
vi.mock('@/components/layout/Header', () => ({ default: () => null }));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));
vi.mock('@/components/RouteNavigation', () => ({ default: () => null }));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/pages/ProductPage', () => ({ default: () => <p>Public page</p> }));
vi.mock('@/pages/Workspace', () => ({ default: () => <WorkspaceDestination /> }));

function WorkspaceDestination() {
  const location = useLocation();
  return <main><h1>Workspace for {state.user?.id}</h1><p data-testid="workspace-path">{location.pathname}{location.search}</p></main>;
}
const owner = { id: 'return-fixture-owner', email: 'return-fixture@example.test' };
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
  await act(async () => { state.user = owner; view.rerender(<MvpApp />); });
}
beforeEach(() => {
  vi.clearAllMocks(); state.user = null; state.loading = false;
  state.signInWithEmail.mockResolvedValue({ error: null });
  state.signUpWithEmail.mockResolvedValue({ error: null, requiresEmailConfirmation: false });
  state.signInWithGoogle.mockResolvedValue(undefined); state.resetPassword.mockResolvedValue({ error: null });
  state.readAuthSession.mockResolvedValue({ user: owner });
  authRateLimiter.reset(owner.email); sessionStorage.clear(); localStorage.clear();
});
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

describe('protected legacy workspace return through real app routes', () => {
  it.each([
    ['/applications', 'tracker'], ['/resume-management', 'cv'], ['/resumes', 'cv'],
    ['/job-preferences', 'tailor'], ['/preferences', 'tailor'], ['/settings', 'billing'], ['/thank-you', 'billing'],
  ])('preserves %s as its requested tab before sign-in', async (path, tab) => {
    open(path);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 1 });
    expect(window.location.pathname).toBe('/auth');
    expect(new URLSearchParams(window.location.search).get('next')).toBe(`/dashboard?tab=${tab}`);
    expect(screen.queryByTestId('workspace-path')).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  });

  it.each(['cv', 'tailor', 'tracker', 'billing'])('returns an email sign-in to the requested %s tab', async tab => {
    const view = open(`/dashboard?tab=${tab}`);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 1 });
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(`/dashboard?tab=${tab}`);
    expect(screen.getByRole('heading', { name: `Workspace for ${owner.id}` })).toBeInTheDocument();
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  });

  it.each(['cv', 'tailor', 'tracker', 'billing'])('returns a Google callback to the requested %s tab once', async tab => {
    const view = open(`/dashboard?tab=${tab}`);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 1 });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(state.signInWithGoogle).toHaveBeenCalledOnce();
    const retained = sessionStorage.getItem('jobvance_account_return_v1');
    expect(JSON.parse(retained!).path).toBe(`/dashboard?tab=${tab}`);
    expect(localStorage.length).toBe(0);
    view.unmount(); state.user = owner;
    open('/auth/callback?code=synthetic-return-code');
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(`/dashboard?tab=${tab}`);
    expect(state.readAuthSession).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('jobvance_account_return_v1')).toBeNull();
  });

  it('waits for auth resolution and strips unrelated query and hash data from the return', async () => {
    state.loading = true;
    const view = open('/dashboard?email=private@example.test&tab=tracker&next=https://evil.example#private-fragment');
    expect(screen.getByRole('status')).toHaveTextContent('Loading your account');
    expect(window.location.pathname).toBe('/dashboard');
    await act(async () => { state.loading = false; view.rerender(<MvpApp />); });
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 1 });
    expect(window.location.pathname + window.location.search).toBe('/auth?next=%2Fdashboard%3Ftab%3Dtracker');
    expect(window.location.hash).toBe('');
    expect(sessionStorage.length).toBe(0);
  });

  it('keeps the ordinary sign-in default at /dashboard', async () => {
    const view = open('/auth');
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 1 });
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(/^\/dashboard$/);
  });

  it('falls back to /dashboard for an arbitrary supplied email return', async () => {
    const view = open(`/auth?next=${encodeURIComponent('//evil.example/dashboard?tab=tracker')}`);
    await screen.findByRole('heading', { name: 'Sign in to Jobvance', level: 1 });
    await finishEmail(view);
    expect(await screen.findByTestId('workspace-path')).toHaveTextContent(/^\/dashboard$/);
  });
});
