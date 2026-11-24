import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: {} as { user: User | null; session: Session | null; loading: boolean; authError: string | null; retryConnection: () => void } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null, supabase: { auth: { initialize: vi.fn(), getSession: vi.fn(), updateUser: vi.fn() } } }));

import { ContactGate } from '@/components/ContactDetails';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';

const owner = '11111111-1111-4111-8111-111111111111';
const retry = vi.fn();
function signedIn(metadata: Record<string, unknown>): Session {
  const user = { id: owner, app_metadata: {}, user_metadata: metadata, aud: 'authenticated', created_at: '2026-11-24' } as User;
  return { user, access_token: `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: owner, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))}.signature`, token_type: 'bearer', expires_in: 3600, refresh_token: 'unused-test-refresh' };
}
/** The three account states the panel can see while no user is known: still loading, failed, and (after a retry) loading again with the earlier failure not yet cleared. */
const auth = (state: { loading?: boolean; error?: string | null; session?: Session | null }) => {
  const session = state.session ?? null;
  setTrackingDraftOwner(session?.user.id ?? null, cvVariantSessionIdentity(session));
  mocks.auth = { user: session?.user ?? null, session, loading: state.loading ?? false, authError: state.error ?? null, retryConnection: retry };
};
const FAILURE = 'We could not restore your sign-in session. Please try signing in again.';
const tree = (path = '/onboarding') => <MemoryRouter initialEntries={[path]}><ContactGate><Routes><Route path="*" element={<h1>Protected page</h1>} /></Routes></ContactGate></MemoryRouter>;
const dialog = () => screen.getByRole('dialog');

beforeEach(() => { vi.clearAllMocks(); clearTrackingDraftMemory(); });
afterEach(() => { cleanup(); clearTrackingDraftMemory(); });

describe('sign-in restore panel on a private page', () => {
  it('says plainly that the account is opening while the session loads, and offers no Retry for something that has not failed', () => {
    auth({ loading: true });
    render(tree());
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Opening your account…');
    expect(dialog()).not.toHaveTextContent(/workspace/i);
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog()).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Protected page' })).not.toBeInTheDocument();
  });

  it('keeps the way out while loading, however long it takes: Help, Plans and Account recovery stay reachable', () => {
    auth({ loading: true });
    render(tree());
    const nav = within(dialog()).getByRole('navigation', { name: 'Account help' });
    expect(within(nav).getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
    expect(within(nav).getByRole('link', { name: 'Plans' })).toHaveAttribute('href', '/pricing');
    expect(within(nav).getByRole('link', { name: 'Account recovery' })).toHaveAttribute('href', '/auth/forgot-password');
  });

  it('shows an alert with a Retry control that already has focus when the restore has failed', () => {
    auth({ error: FAILURE });
    render(tree());
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Your sign-in could not be restored.');
    const button = within(dialog()).getByRole('button', { name: 'Retry sign-in recovery' });
    expect(button).toHaveFocus();
    expect(button).toHaveProperty('tabIndex', 0); // a normal tab stop, not only reachable through the gate's focus trap
    expect(within(dialog()).queryByRole('status')).not.toBeInTheDocument();
    expect(within(within(dialog()).getByRole('navigation', { name: 'Account help' })).getAllByRole('link')).toHaveLength(3);
  });

  it.each([['Enter', '{Enter}'], ['Space', ' ']])('retries from the keyboard alone with %s on the Retry control', async (_name, key) => {
    auth({ error: FAILURE });
    render(tree());
    expect(within(dialog()).getByRole('button', { name: 'Retry sign-in recovery' })).toHaveFocus();
    await userEvent.setup().keyboard(key);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('reaches Retry with Tab after the focus has moved on, and the focus trap keeps the order Retry, Help, Plans, Account recovery', async () => {
    auth({ error: FAILURE });
    render(tree());
    const user = userEvent.setup();
    await user.tab(); expect(within(dialog()).getByRole('link', { name: 'Help' })).toHaveFocus();
    await user.tab(); await user.tab(); expect(within(dialog()).getByRole('link', { name: 'Account recovery' })).toHaveFocus();
    await user.tab(); expect(within(dialog()).getByRole('button', { name: 'Retry sign-in recovery' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('moves focus to Retry when a loading panel turns into a failure, hides it again while retrying, and returns it if the retry fails too', () => {
    auth({ loading: true });
    const view = render(tree());
    expect(within(dialog()).queryByRole('button')).not.toBeInTheDocument();
    auth({ error: FAILURE }); view.rerender(tree());
    expect(within(dialog()).getByRole('alert')).toBeInTheDocument();
    expect(within(dialog()).getByRole('button', { name: 'Retry sign-in recovery' })).toHaveFocus();
    // The provider sets loading again at once on Retry but only clears the old error on success.
    auth({ loading: true, error: FAILURE }); view.rerender(tree());
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Opening your account…');
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog()).queryByRole('button')).not.toBeInTheDocument();
    auth({ error: FAILURE }); view.rerender(tree());
    expect(within(dialog()).getByRole('button', { name: 'Retry sign-in recovery' })).toHaveFocus();
  });

  it('opens the page itself once a retry succeeds for an account that already has a name', async () => {
    auth({ error: FAILURE });
    const view = render(tree());
    expect(screen.queryByRole('heading', { name: 'Protected page' })).not.toBeInTheDocument();
    await act(async () => { auth({ session: signedIn({ full_name: 'Fixture Person' }) }); view.rerender(tree()); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Protected page' })).toBeInTheDocument();
  });

  it('is unchanged where it does not apply: a signed-out visitor with nothing to restore, and a public page while loading', () => {
    auth({});
    const view = render(tree());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Protected page' })).toBeInTheDocument();
    view.unmount();
    auth({ loading: true });
    render(tree('/pricing'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Protected page' })).toBeInTheDocument();
  });

  it('still asks a signed-in account without a name for it (the existing account check is untouched)', () => {
    auth({ session: signedIn({}) });
    render(tree());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog()).queryByText('Opening your account…')).toBeNull();
    expect(within(dialog()).queryByText('Your sign-in could not be restored.')).toBeNull();
  });
});
