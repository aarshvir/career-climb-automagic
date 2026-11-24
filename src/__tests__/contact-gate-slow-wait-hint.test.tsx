import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({
  auth: {} as { user: User | null; session: Session | null; loading: boolean; authError: string | null; retryConnection: () => void },
  sdk: { initialize: vi.fn(), getSession: vi.fn(), updateUser: vi.fn() },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null, supabase: { auth: mocks.sdk } }));

import { ContactGate, SLOW_WAIT_MS } from '@/components/ContactDetails';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';

// Fake timers make Date and the timers virtual; any real asynchronous work must still get real event-loop turns. Same idea as supabase/tests/virtual-time.ts:
// advance virtual time in steps and yield real turns after every step, so the virtual clock never runs ahead of work that really happens (a past CI flake came from that).
// The yield is captured before fake timers are installed (vitest fakes setImmediate by default).
const realSetImmediate = globalThis.setImmediate.bind(globalThis);
const realYield = () => new Promise<void>(resolve => realSetImmediate(resolve));
async function advance(totalMs: number, stepMs = 500) {
  for (let done = 0; done < totalMs; done += stepMs) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(stepMs, totalMs - done)); });
    await realYield();
  }
}

const retry = vi.fn();
// Any attempt to reload or navigate is recorded here: location is replaced for the test by an object whose reload, assign, replace and href setter are spies.
const navigation = { reload: vi.fn(), assign: vi.fn(), replace: vi.fn(), setHref: vi.fn() };
function stubLocation() {
  const real = window.location;
  vi.stubGlobal('location', Object.defineProperties({ pathname: real.pathname, search: real.search, hash: real.hash, origin: real.origin, host: real.host, hostname: real.hostname, protocol: real.protocol, port: real.port,
    reload: navigation.reload, assign: navigation.assign, replace: navigation.replace, toString: () => real.href }, { href: { enumerable: true, get: () => real.href, set: navigation.setHref } }));
}
const FAILURE = 'We could not restore your sign-in session. Please try signing in again.';
const HINT = 'This is taking longer than usual. You can reload the page to try again.';
const owner = '11111111-1111-4111-8111-111111111111';
function signedIn(metadata: Record<string, unknown>): Session {
  const user = { id: owner, app_metadata: {}, user_metadata: metadata, aud: 'authenticated', created_at: '2026-11-24' } as User;
  return { user, access_token: `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: owner, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))}.signature`, token_type: 'bearer', expires_in: 3600, refresh_token: 'unused-test-refresh' };
}
const auth = (state: { loading?: boolean; error?: string | null; session?: Session | null }) => {
  const session = state.session ?? null;
  setTrackingDraftOwner(session?.user.id ?? null, cvVariantSessionIdentity(session));
  mocks.auth = { user: session?.user ?? null, session, loading: state.loading ?? false, authError: state.error ?? null, retryConnection: retry };
};
const tree = (path = '/onboarding?utm_source=meta&utm_campaign=test_entry') => <MemoryRouter initialEntries={[path]}><ContactGate><Routes><Route path="*" element={<main><h1>Protected page</h1><input aria-label="Draft" defaultValue="" /></main>} /></Routes></ContactGate></MemoryRouter>;
const dialog = () => screen.getByRole('dialog');
const hint = () => within(dialog()).queryByText(HINT);
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); stubLocation(); clearTrackingDraftMemory(); consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); consoleError.mockRestore(); clearTrackingDraftMemory(); });

describe('slow-wait hint on the opening panel', () => {
  it('stays quiet through the ordinary wait and appears exactly at the threshold on the /onboarding entry', async () => {
    auth({ loading: true });
    render(tree());
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Opening your account…');
    expect(SLOW_WAIT_MS).toBe(10_000);
    await advance(SLOW_WAIT_MS - 1);
    expect(hint()).not.toBeInTheDocument();
    await advance(1);
    expect(hint()).toBeInTheDocument();
    expect(within(dialog()).getByText('Opening your account…')).toBeInTheDocument();
  });

  it('never appears for a restore that answers within the threshold (the 5 s delayed success included)', async () => {
    auth({ loading: true });
    const view = render(tree());
    await advance(5000);
    expect(hint()).not.toBeInTheDocument();
    await act(async () => { auth({ session: signedIn({ full_name: 'Fixture Person' }) }); view.rerender(tree()); });
    await advance(20_000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Protected page' })).toBeInTheDocument();
  });

  it('is text only: no button or link of its own, and it triggers no reload, no retry and no SDK call', async () => {
    auth({ loading: true });
    const location = window.location.href;
    render(tree());
    await advance(SLOW_WAIT_MS + 20_000);
    const text = hint()!;
    expect(text).toBeInTheDocument();
    expect(text.querySelector('a, button')).toBeNull();
    expect(within(dialog()).queryByRole('button')).not.toBeInTheDocument();
    expect(within(within(dialog()).getByRole('navigation', { name: 'Account help' })).getAllByRole('link').map(link => link.textContent)).toEqual(['Help', 'Plans', 'Account recovery']);
    expect(retry).not.toHaveBeenCalled();
    expect(mocks.sdk.initialize).not.toHaveBeenCalled(); expect(mocks.sdk.getSession).not.toHaveBeenCalled(); expect(mocks.sdk.updateUser).not.toHaveBeenCalled();
    expect(navigation.reload).not.toHaveBeenCalled(); expect(navigation.assign).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled(); expect(navigation.setHref).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(window.location.href).toBe(location);
  });

  // Names are read as the browser and the installed auth client read them (URLSearchParams, percent-decoded, in the query and in the fragment), compared without regard to case.
  it.each([
    ['an OAuth or PKCE code in the query', '/onboarding?code=synthetic-code&utm_source=meta'],
    ['an auth error in the query', '/onboarding?error=access_denied&error_code=otp_expired'],
    ['an implicit-grant token in the hash', '/onboarding#access_token=synthetic&token_type=bearer'],
    ['a recovery return', '/onboarding#access_token=synthetic&type=recovery'],
    ['a token hash in the query', '/onboarding?token_hash=synthetic&type=email'],
    ['an auth error in the hash', '/onboarding#error=access_denied&error_description=expired'],
    ['a mailbox return ticket in the hash', '/onboarding#gmail_ticket=synthetic'],
    ['a refresh token in the query', '/onboarding?refresh_token=synthetic'],
    ['a provider token in the query', '/onboarding?provider_token=synthetic'],
    ['a recovery type alone in the query', '/onboarding?type=recovery'],
    ['a percent-encoded error field name in the query (error%5Fdescription)', '/onboarding?error%5Fdescription=fixture'],
    ['a percent-encoded error field name in the fragment (error%5Fdescription)', '/onboarding#error%5Fdescription=fixture'],
    ['a mixed-case error field name in the query', '/onboarding?Error_Description=fixture'],
    ['an upper-case error field name in the fragment', '/onboarding#ERROR_DESCRIPTION=fixture'],
    ['an error alone in the query', '/onboarding?error=access_denied'],
    ['a token hash alone in the query', '/onboarding?token_hash=synthetic'],
    ['an upper-case code in the query', '/onboarding?CODE=synthetic-code'],
    ['an upper-case code in the fragment', '/onboarding#CODE=synthetic-code'],
    ['a name whose first letter is percent-encoded in the query (%63ode)', '/onboarding?%63ode=synthetic'],
    ['a name whose first letter is percent-encoded in the fragment (%72efresh_token)', '/onboarding#%72efresh_token=synthetic'],
    ['an encoded name and an upper-case type in the fragment', '/onboarding#access%5Ftoken=synthetic&TYPE=recovery'],
    ['an encoded error code beside the campaign tags in the query', '/onboarding?utm_source=meta&utm_medium=paid_social&utm_campaign=test_entry&error%5Fcode=otp_expired'],
    ['an error code in the fragment', '/onboarding#error_code=otp_expired'],
  ])('is not offered on an address with %s', async (_name, path) => {
    auth({ loading: true });
    render(tree(path));
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Opening your account…');
    await advance(SLOW_WAIT_MS * 3);
    expect(hint()).not.toBeInTheDocument();
  });

  it.each([
    ['the ordinary entry with the five campaign tags', '/onboarding?utm_source=meta&utm_medium=paid_social&utm_campaign=test_entry&utm_content=C_partner_first&utm_term=000'],
    ['campaign tags whose values look like auth names', '/onboarding?utm_content=code&utm_term=error_description'],
    ['names that only contain or extend an auth name', '/onboarding?mycode=1&codes=2&error_description_extra=3&typed=1'],
    ['a plain fragment', '/onboarding?utm_source=meta#section-one'],
    ['an unrelated key in the fragment', '/onboarding#utm_source=meta'],
    ['a plus sign, which is a space in a decoded name, not an underscore', '/onboarding?error+description=x'],
    ['no query at all', '/onboarding'],
  ])('is still offered after the threshold on %s', async (_name, path) => {
    auth({ loading: true });
    render(tree(path));
    await advance(SLOW_WAIT_MS - 1);
    expect(hint()).not.toBeInTheDocument();
    await advance(1);
    expect(hint()).toBeInTheDocument();
  });

  it.each(['/dashboard', '/loop', '/check', '/applications'])('is not offered on %s, which was not part of the verified entry', async path => {
    auth({ loading: true });
    render(tree(path));
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Opening your account…');
    await advance(SLOW_WAIT_MS * 3);
    expect(hint()).not.toBeInTheDocument();
  });

  it('is not offered, and the page behind it keeps what was typed, when the page was already open (a reload would discard the edits)', async () => {
    auth({ session: signedIn({ full_name: 'Fixture Person' }) });
    const view = render(tree());
    expect(screen.getByRole('heading', { name: 'Protected page' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'half-written draft' } });
    await act(async () => { auth({ loading: true }); view.rerender(tree()); });
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Opening your account…');
    await advance(SLOW_WAIT_MS * 3);
    expect(hint()).not.toBeInTheDocument();
    expect((document.querySelector('input[aria-label="Draft"]') as HTMLInputElement).value).toBe('half-written draft');
  });

  it('is not shown with a genuine error, where the alert and the Retry control are, however long it lasts', async () => {
    auth({ error: FAILURE });
    render(tree());
    await advance(SLOW_WAIT_MS * 3);
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Your sign-in could not be restored.');
    expect(within(dialog()).getByRole('button', { name: 'Retry sign-in recovery' })).toHaveFocus();
    expect(hint()).not.toBeInTheDocument();
  });

  it('starts a fresh count for each loading stretch: a retry after a failure is quiet again for the full threshold', async () => {
    auth({ loading: true });
    const view = render(tree());
    await advance(SLOW_WAIT_MS - 1000);
    await act(async () => { auth({ error: FAILURE }); view.rerender(tree()); });
    expect(hint()).not.toBeInTheDocument();
    await advance(5000);
    await act(async () => { auth({ loading: true, error: FAILURE }); view.rerender(tree()); });
    await advance(SLOW_WAIT_MS - 1);
    expect(hint()).not.toBeInTheDocument();
    await advance(1);
    expect(hint()).toBeInTheDocument();
  });

  it('leaves no timer behind when the restore ends before the threshold, so nothing can fire later', async () => {
    auth({ loading: true });
    const view = render(tree());
    await advance(3000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => { auth({ session: signedIn({ full_name: 'Fixture Person' }) }); view.rerender(tree()); });
    expect(vi.getTimerCount()).toBe(0);
    await advance(SLOW_WAIT_MS * 2);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(navigation.reload).not.toHaveBeenCalled();
  });

  it('goes away with the panel when the restore ends after the hint, and leaves no timer behind', async () => {
    auth({ loading: true });
    const view = render(tree());
    await advance(SLOW_WAIT_MS + 1000);
    expect(hint()).toBeInTheDocument();
    await act(async () => { auth({}); view.rerender(tree()); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
