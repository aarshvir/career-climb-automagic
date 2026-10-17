import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from '@/pages/Auth';
import AuthCallback from '@/pages/AuthCallback';
import { retainCheckForGoogle, takeRetainedCheck, type CheckDraft } from '@/lib/check-draft';
import { authRateLimiter } from '@/lib/security';

vi.unmock('react-router-dom');
const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  signInWithEmail: vi.fn(), signUpWithEmail: vi.fn(), signInWithGoogle: vi.fn(), resetPassword: vi.fn(), readAuthSession: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: false, authError: null, configurationError: null,
  signInWithEmail: state.signInWithEmail, signUpWithEmail: state.signUpWithEmail, signInWithGoogle: state.signInWithGoogle, resetPassword: state.resetPassword }) }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: state.readAuthSession }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null }));

const fixture = 'A synthetic QA candidate built Python reports using generated inputs and documented test processes. '.repeat(3).trim();
const draft: CheckDraft = { jobTitle: 'Synthetic analyst', company: '', sourceText: fixture, reviewedText: fixture,
  jobDescription: 'A fictional vacancy for testing requires Python reports, careful documentation and analysis of generated inputs. No employer is contacted.' };
function InlinePage({ onBeforeGoogle }: { onBeforeGoogle?: () => boolean }) {
  const [text] = useState(fixture);
  return <><textarea aria-label="Unsaved CV fixture" value={text} readOnly /><Auth embedded onBeforeGoogle={onBeforeGoogle} /></>;
}
function Location() { return <p data-testid="current-path">{useLocation().pathname}</p>; }
function inlineTree(onBeforeGoogle?: () => boolean) {
  return <MemoryRouter initialEntries={['/check']}><Location /><Routes><Route path="/check" element={<InlinePage onBeforeGoogle={onBeforeGoogle} />} /><Route path="/loop" element={<p>Job Loop dashboard</p>} /><Route path="/auth/forgot-password" element={<p>Separate password page</p>} /></Routes></MemoryRouter>;
}
function RestoredCheck() {
  const [restored] = useState(() => takeRetainedCheck());
  return <><p>Check page</p><textarea aria-label="Restored CV fixture" value={restored?.sourceText ?? ''} readOnly /><p>Review and approve again</p></>;
}
function callbackTree() {
  return <MemoryRouter initialEntries={['/auth/callback']}><Location /><Routes><Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/check" element={<RestoredCheck />} /><Route path="/loop" element={<p>Job Loop dashboard</p>} /><Route path="/auth" element={<p>Sign-in page</p>} /></Routes></MemoryRouter>;
}
beforeEach(() => {
  vi.clearAllMocks(); state.user = null;
  state.signInWithEmail.mockResolvedValue({ error: null }); state.signUpWithEmail.mockResolvedValue({ error: null, requiresEmailConfirmation: false });
  state.signInWithGoogle.mockResolvedValue(undefined); state.resetPassword.mockResolvedValue({ error: null }); state.readAuthSession.mockResolvedValue(null);
  authRateLimiter.reset('qa-handoff@example.com');
  sessionStorage.clear(); localStorage.clear(); window.history.replaceState(null, '', '/check');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

describe('embedded email authentication keeps the current check mounted', () => {
  it('does not navigate away when email sign-in establishes an account', async () => {
    const view = render(inlineTree()); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'qa-handoff@example.com');
    await user.type(screen.getByLabelText('Password'), 'FixturePassword123');
    await user.click(screen.getByRole('button', { name: /^Sign in$/ }));
    await waitFor(() => expect(state.signInWithEmail).toHaveBeenCalledOnce());
    await act(async () => { state.user = { id: 'fixture-owner', email: 'qa-handoff@example.com' }; view.rerender(inlineTree()); });
    expect(screen.getByTestId('current-path')).toHaveTextContent('/check'); expect(screen.getByLabelText('Unsaved CV fixture')).toHaveValue(fixture);
    expect(sessionStorage.length).toBe(0);
  });
  it('requests an embedded reset without navigating or losing the draft', async () => {
    render(inlineTree()); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'qa-handoff@example.com'); await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    await waitFor(() => expect(state.resetPassword).toHaveBeenCalledWith('qa-handoff@example.com'));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/check'); expect(screen.getByLabelText('Unsaved CV fixture')).toHaveValue(fixture);
    expect(screen.getByRole('status')).toHaveTextContent('separate tab'); expect(sessionStorage.length).toBe(0);
  });
  it('validates the email before requesting an embedded reset', async () => {
    render(inlineTree()); await userEvent.setup().click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(state.resetPassword).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('CV check stays open');
    expect(screen.getByLabelText('Unsaved CV fixture')).toHaveValue(fixture);
  });
  it('preserves the check and shows an honest error on reset failure', async () => {
    state.resetPassword.mockRejectedValue(new Error('Synthetic transport failure'));
    render(inlineTree()); const user = userEvent.setup(); await user.type(screen.getByLabelText('Email address'), 'qa-handoff@example.com');
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CV check stays open'); expect(screen.getByTestId('current-path')).toHaveTextContent('/check');
  });
});

describe('Google authentication requires the page consent hook', () => {
  it('does not start Google when the draft-retention hook declines', async () => {
    const gate = vi.fn(() => false); render(inlineTree(gate));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(gate).toHaveBeenCalledOnce(); expect(state.signInWithGoogle).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0); expect(screen.getByLabelText('Unsaved CV fixture')).toHaveValue(fixture);
  });
  it('retains only the specifically consented check before starting Google', async () => {
    render(inlineTree(() => { retainCheckForGoogle(draft, true); return true; }));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(state.signInWithGoogle).toHaveBeenCalledOnce(); expect(localStorage.length).toBe(0);
    expect(takeRetainedCheck()).toEqual(draft);
  });
});

describe('OAuth callback returns to the consented check without restoring approval', () => {
  it('returns a successful session to /check and consumes the retained copy', async () => {
    retainCheckForGoogle(draft, true); window.history.replaceState(null, '', '/auth/callback?code=synthetic-code');
    state.readAuthSession.mockResolvedValue({ user: { id: 'fixture-owner' } }); render(callbackTree());
    expect(await screen.findByText('Check page')).toBeInTheDocument(); expect(screen.getByLabelText('Restored CV fixture')).toHaveValue(fixture);
    expect(screen.getByText('Review and approve again')).toBeInTheDocument(); expect(sessionStorage.length).toBe(0);
  });
  it('offers the retained check when the provider returns an error, without starting another login', async () => {
    retainCheckForGoogle(draft, true); window.history.replaceState(null, '', '/auth/callback?error=access_denied'); render(callbackTree());
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Return to your CV check' }));
    expect(state.readAuthSession).not.toHaveBeenCalled(); expect(state.signInWithGoogle).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Restored CV fixture')).toHaveValue(fixture); expect(sessionStorage.length).toBe(0);
  });
  it('offers the retained check after a failed session exchange', async () => {
    retainCheckForGoogle(draft, true); window.history.replaceState(null, '', '/auth/callback?code=synthetic-code');
    state.readAuthSession.mockRejectedValue(new Error('Synthetic exchange failure')); render(callbackTree());
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Return to your CV check' }));
    expect(screen.getByLabelText('Restored CV fixture')).toHaveValue(fixture);
  });
  it('does not navigate to an arbitrary stored return destination', async () => {
    sessionStorage.setItem('jobvance_check_oauth_return_v1', 'https://attacker.invalid'); window.history.replaceState(null, '', '/auth/callback');
    state.readAuthSession.mockResolvedValue({ user: { id: 'fixture-owner' } }); render(callbackTree());
    expect(await screen.findByText('Job Loop dashboard')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Return to your CV check' })).not.toBeInTheDocument();
  });
});
