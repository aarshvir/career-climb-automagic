import { AuthError, GoTrueClient } from '@supabase/auth-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
vi.unmock('@/contexts/AuthContext');
vi.unmock('react-router-dom');
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
const fixture = vi.hoisted(() => ({ client: null as GoTrueClient | null, invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null, supabase: { get auth() { if (!fixture.client) throw new Error('Fictional auth client not ready'); return fixture.client; }, functions: { invoke: fixture.invoke } } }));
import { readAuthSession } from '@/utils/authSession';
import { callJobLoop, requireLoopOwner } from '@/lib/job-loop-api';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Auth from '@/pages/Auth';
import AuthCallback from '@/pages/AuthCallback';
import LoopOnboarding from '@/pages/LoopOnboarding';
import { ContactGate } from '@/components/ContactDetails';
import { clearTrackingDraftMemory } from '@/lib/tracking-draft-memory';
import { rememberLoopReturn } from '@/lib/account-return';
const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const account = { id: owner, email: 'fictional-confirmed@example.test', email_confirmed_at: '2026-11-03T00:00:00Z', aud: 'authenticated', role: 'authenticated', created_at: '2026-11-03T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Fictional Confirmed Person' } };
const encoded = btoa(JSON.stringify({ sub: owner, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exp: Math.floor(Date.now()/1000)+3600 }));
const tokenReply = { access_token: `eyJhbGciOiJub25lIn0.${encoded}.fictional-signature`, refresh_token: 'fictional-refresh', token_type: 'bearer', expires_in: 3600, user: account };
const requests: string[] = [];
let clientNumber = 0;
function makeClient(failedCallback: boolean, expiredSession = false) {
  window.history.replaceState(null, '', failedCallback ? '/auth/callback#error=access_denied&error_code=otp_expired&error_description=Fictional+email+link+expired' : '/auth');
  const data = new Map<string, string>();
  const client = new GoTrueClient({ url: 'https://fictional.invalid/auth/v1', storageKey: `fictional-probe-${++clientNumber}`, persistSession: true, autoRefreshToken: false, detectSessionInUrl: true, flowType: 'pkce', storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string,v: string) => { data.set(k,v); }, removeItem: (k: string) => { data.delete(k); } }, fetch: async (url: string) => {
    requests.push(String(url));
    if (String(url) === 'https://fictional.invalid/auth/v1/token?grant_type=password') return new Response(JSON.stringify(expiredSession ? { ...tokenReply, expires_in: -3600 } : tokenReply), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (String(url) === 'https://fictional.invalid/auth/v1/token?grant_type=refresh_token') return new Response(JSON.stringify({ msg: 'Fictional expired session has no valid refresh token', error: 'invalid_grant', error_code: 'refresh_token_not_found' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    if (String(url) === 'https://fictional.invalid/auth/v1/user') return new Response(JSON.stringify(account), { status: 200, headers: { 'Content-Type': 'application/json' } });
    throw new Error('Unexpected SDK request blocked: ' + url);
  } });
  fixture.client = client;
  return client;
}
async function mockedPasswordSignIn(client: GoTrueClient) {
  return client.signInWithPassword({ email: account.email, password: 'FictionalPassword123' });
}
function AuthState() { const auth = useAuth(); return <output aria-label="Auth state">{auth.user?.id ?? 'signed-out'}|{auth.loading ? 'loading' : 'ready'}</output>; }
beforeEach(() => { requests.length = 0; vi.clearAllMocks(); clearTrackingDraftMemory(); sessionStorage.clear(); localStorage.clear(); fixture.invoke.mockResolvedValue({ data: { existingState: 'absent' }, error: null }); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Real network is forbidden by this probe'); })); });
afterEach(async () => { cleanup(); await fixture.client?.stopAutoRefresh(); vi.restoreAllMocks(); vi.unstubAllGlobals(); clearTrackingDraftMemory(); });
describe('historical initialization error after successful password sign-in', () => {
  it('recovers a current verified-owner load after the SDK cached an expired callback', async () => {
    const client = makeClient(true);
    const firstInit = await client.initialize();
    expect(firstInit.error?.message).toBe('Fictional email link expired');
    window.history.replaceState(null, '', '/auth?next=%2Fonboarding');
    const signed = await mockedPasswordSignIn(client);
    expect(signed.error).toBeNull(); expect(signed.data.user.id).toBe(owner);
    const liveSession = await client.getSession();
    expect(liveSession.error).toBeNull(); expect(liveSession.data.session.user.id).toBe(owner);
    expect((await client.getUser()).data.user.id).toBe(owner);
    expect((await client.initialize()).error).toBe(firstInit.error);
    await expect(readAuthSession()).resolves.toMatchObject({ user: { id: owner } });
    await expect(requireLoopOwner(owner)).resolves.toBeUndefined();
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => true)).resolves.toEqual({ existingState: 'absent' });
    expect(fixture.invoke).toHaveBeenCalledOnce();
  });
  it('opens the first setup question after callback recovery through the real provider and contact gate', async () => {
    const client = makeClient(true);
    await client.initialize(); rememberLoopReturn('/onboarding');
    render(<HelmetProvider><AuthProvider><MemoryRouter initialEntries={['/auth/callback']}><AuthState /><ContactGate><Routes><Route path="/auth/callback" element={<AuthCallback />} /><Route path="/auth" element={<Auth />} /><Route path="/onboarding" element={<LoopOnboarding />} /></Routes></ContactGate></MemoryRouter></AuthProvider></HelmetProvider>);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign in with email and password' }));
    await userEvent.setup().type(await screen.findByLabelText('Email address'), account.email);
    await userEvent.setup().type(screen.getByLabelText('Password', { exact: true }), 'FictionalPassword123');
    await userEvent.setup().click(screen.getByRole('button', { name: /^Sign in$/ }));
    await screen.findByRole('heading', { name: 'Which roles would you like to find?' });
    await waitFor(() => expect(screen.getByLabelText('Auth state').textContent).toBe(owner+'|ready'));
    expect(await screen.findByLabelText('Search or add a role')).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fixture.invoke).toHaveBeenCalledOnce();
    expect((await client.getSession()).data.session.user.id).toBe(owner);
  });
});
describe('current owner checks with clean initialization', () => {
  it('allows the fictional valid owner to perform the read-only onboarding load', async () => {
    const client = makeClient(false); expect((await client.initialize()).error).toBeNull(); await mockedPasswordSignIn(client);
    await expect(readAuthSession()).resolves.toMatchObject({ user: { id: owner } });
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => true)).resolves.toEqual({ existingState: 'absent' });
    expect(fixture.invoke).toHaveBeenCalledOnce();
  });
  it('rejects a genuine getSession error before the onboarding call', async () => {
    const client = makeClient(false); await client.initialize(); await mockedPasswordSignIn(client);
    vi.spyOn(client, 'getSession').mockResolvedValue({ data: { session: null }, error: new AuthError('Fictional live-session read failed') });
    await expect(readAuthSession()).rejects.toThrow('Fictional live-session read failed');
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => true)).rejects.toThrow('Please sign in again'); expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('rejects a genuinely missing session before the onboarding call', async () => {
    const client = makeClient(false); await client.initialize();
    await expect(readAuthSession()).resolves.toBeNull();
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => true)).rejects.toThrow('Please sign in again'); expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('rejects an expired session whose refresh is refused by the fictional SDK transport', async () => {
    const client = makeClient(false, true); await client.initialize();
    expect((await mockedPasswordSignIn(client)).error).toBeNull();
    await expect(readAuthSession()).rejects.toThrow('Fictional expired session has no valid refresh token');
    expect(requests).toContain('https://fictional.invalid/auth/v1/token?grant_type=refresh_token');
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => true)).rejects.toThrow('Please sign in again'); expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('rejects the wrong owner before the onboarding call', async () => {
    const client = makeClient(false); await client.initialize(); await mockedPasswordSignIn(client);
    await expect(callJobLoop(otherOwner, { action: 'get_existing' }, () => true)).rejects.toThrow('Your account changed'); expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('rejects a revoked caller authority before the onboarding call', async () => {
    const client = makeClient(false); await client.initialize(); await mockedPasswordSignIn(client);
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => false)).rejects.toThrow('Your setup or sign-in changed'); expect(fixture.invoke).not.toHaveBeenCalled();
  });
});


describe('recovered callback still requires current session authority', () => {
  it('keeps the initialization failure when no replacement session exists', async () => {
    const client = makeClient(true); await client.initialize();
    await expect(readAuthSession()).rejects.toThrow('Fictional email link expired');
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => true)).rejects.toThrow('Please sign in again');
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('surfaces a current session read failure instead of accepting an old cached session', async () => {
    const client = makeClient(true); await client.initialize(); await mockedPasswordSignIn(client);
    vi.spyOn(client, 'getSession').mockResolvedValue({ data: { session: null }, error: new AuthError('Fictional current read failure') });
    await expect(readAuthSession()).rejects.toThrow('Fictional current read failure');
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => true)).rejects.toThrow('Please sign in again');
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('rejects another owner even after a successful replacement sign-in', async () => {
    const client = makeClient(true); await client.initialize(); await mockedPasswordSignIn(client);
    await expect(callJobLoop(otherOwner, { action: 'get_existing' }, () => true)).rejects.toThrow('Your account changed');
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
  it('requires the current user verification after recovering a stored session', async () => {
    const client = makeClient(true); await client.initialize(); await mockedPasswordSignIn(client);
    vi.spyOn(client, 'getUser').mockResolvedValue({ data: { user: null }, error: new AuthError('Fictional user verification refused') });
    await expect(callJobLoop(owner, { action: 'get_existing' }, () => true)).rejects.toThrow('Please sign in again');
    expect(fixture.invoke).not.toHaveBeenCalled();
  });
});
