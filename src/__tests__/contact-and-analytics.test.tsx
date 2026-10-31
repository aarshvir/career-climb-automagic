import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: null as User | null, session: null as Session | null, initialize: vi.fn(), updateUser: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn(), contactFetch: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, session: mocks.session, loading: false, authError: null, retryConnection: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null, supabase: { auth: { initialize: mocks.initialize, updateUser: mocks.updateUser, getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } } }));
import { ContactGate } from '@/components/ContactDetails';
import { normalizePhone, defaultCountryCode, hasContactDetails } from '@/lib/contact-details';
import { cleanPath, startAnalytics, stopAnalytics, trackPage } from '@/lib/analytics';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';

function adoptContactUser(id: string, user_metadata: Record<string, string>) {
  mocks.user = { id, user_metadata, app_metadata: {}, aud: 'authenticated', created_at: '2026-10-26' } as User;
  mocks.session = { user: mocks.user, access_token: `header.${btoa(JSON.stringify({ sub: id, session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))}.fixture`, token_type: 'bearer', expires_in: 3600, refresh_token: 'unused-fixture' };
  setTrackingDraftOwner(id, cvVariantSessionIdentity(mocks.session));
}

const tree = (path: string) => <MemoryRouter initialEntries={[path]}><ContactGate><Routes><Route path="*" element={<h1>Destination</h1>} /></Routes></ContactGate></MemoryRouter>;
beforeEach(() => {
  vi.clearAllMocks(); clearTrackingDraftMemory(); mocks.user = null; mocks.session = null; setTrackingDraftOwner(null, null);
  mocks.initialize.mockResolvedValue({ error: null }); mocks.getSession.mockImplementation(async () => ({ data: { session: mocks.session }, error: null }));
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.contactFetch.mockImplementation(async (_url, init) => new Response(JSON.stringify({ ...mocks.user, user_metadata: { ...mocks.user?.user_metadata, ...(init?.method === 'PUT' ? JSON.parse(init.body).data : {}) } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_public-fixture'); vi.stubGlobal('fetch', mocks.contactFetch);
});
afterEach(() => { stopAnalytics(); cleanup(); clearTrackingDraftMemory(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('name and mobile number for every account', () => {
  it('normalizes numbers typed in common ways', () => {
    expect(normalizePhone('050 123 4567', '+971')).toBe('+971501234567');
    expect(normalizePhone('+1 (415) 555-0100', '+971')).toBe('+14155550100');
    expect(normalizePhone('00971501234567', '+1')).toBe('+971501234567');
    expect(normalizePhone('123', '+1')).toBeNull();
    expect(defaultCountryCode('en-AE')).toBe('+971');
    expect(defaultCountryCode('fr')).toBe('+1');
    expect(hasContactDetails({ full_name: 'Casey', phone: '+971501234567' })).toBe(true);
    expect(hasContactDetails({ full_name: 'Casey' })).toBe(true);
    expect(hasContactDetails({ name: 'Casey' })).toBe(true);
    expect(hasContactDetails({ phone: '+971501234567' })).toBe(false);
    expect(hasContactDetails({ full_name: 'C' })).toBe(false);
    expect(hasContactDetails({})).toBe(false);
  });

  it('lets a signed-in person with a name but no phone number straight into their workspace', () => {
    adoptContactUser('google-user', { full_name: 'Casey Google' });
    render(tree('/loop'));
    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'One last step' })).not.toBeInTheDocument();
  });

  it('asks a signed-in person without a name before opening their workspace, and saves an optional phone too', async () => {
    adoptContactUser('google-user', {});
    render(tree('/loop'));
    expect(await screen.findByRole('heading', { name: 'One last step' })).toBeInTheDocument();
    expect(screen.queryByText('Destination')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Casey Google');
    await user.selectOptions(screen.getByLabelText('Country code'), '+44');
    await user.type(screen.getByLabelText('Mobile number (optional)'), '07700 900123');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(mocks.contactFetch).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/user', expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ Authorization: `Bearer ${mocks.session!.access_token}` }), body: JSON.stringify({ data: { full_name: 'Casey Google', phone: '+447700900123' } }) })));
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(await screen.findByText('Destination')).toBeInTheDocument();
  });

  it('saves just a name when the phone is left blank, without sending a phone', async () => {
    adoptContactUser('google-user', {});
    render(tree('/loop'));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Casey Google');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(mocks.contactFetch).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/user', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ data: { full_name: 'Casey Google' } }) })));
    expect(await screen.findByText('Destination')).toBeInTheDocument();
  });

  it('rejects a number that is too short', async () => {
    adoptContactUser('google-user', {});
    render(tree('/onboarding'));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Casey Google');
    await user.type(screen.getByLabelText('Mobile number (optional)'), '12');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid mobile number');
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.contactFetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('lets people with details, and public pages, straight through', () => {
    adoptContactUser('done', { full_name: 'Casey', phone: '+971501234567' });
    render(tree('/loop'));
    expect(screen.getByText('Destination')).toBeInTheDocument();
    cleanup();
    adoptContactUser('missing', {});
    render(tree('/pricing'));
    expect(screen.getByText('Destination')).toBeInTheDocument();
  });
});

describe('visit tracking', () => {
  it('keeps only campaign and page parameters in recorded addresses', () => {
    expect(cleanPath({ pathname: '/auth/callback', search: '?code=secret&email=a@b.c&utm_source=instagram&utm_content=C-man' })).toBe('/auth/callback?utm_source=instagram&utm_content=C-man');
    expect(cleanPath({ pathname: '/pricing', search: '?loopPlan=weekly' })).toBe('/pricing?loopPlan=weekly');
  });

  it('records pages, clicks and visible time, and sends the sign-in token so visits join the account', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    const fetch = vi.fn().mockImplementation(async (_url, init) => { const body = JSON.parse(init.body); return new Response(JSON.stringify({ batchId: body.batchId, accepted: body.events.length, inserted: body.events.length, duplicate: false }), { status: 200 }); });
    vi.stubGlobal('fetch', fetch);
    adoptContactUser('11111111-1111-4111-8111-111111111111', { full_name: 'Casey' });
    mocks.getSession.mockResolvedValue({ data: { session: mocks.session }, error: null });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    window.history.replaceState(null, '', '/job-loop?utm_source=instagram&fbclid=abc');
    startAnalytics({ inTests: true });
    await act(async () => { await Promise.resolve(); });
    document.title = 'Job Loop';
    trackPage({ pathname: '/job-loop', search: '?utm_source=instagram&fbclid=abc' });
    const button = document.createElement('button'); button.textContent = 'Start Job Loop'; document.body.appendChild(button);
    button.click();
    const field = document.createElement('input'); field.value = 'private typed text'; document.body.appendChild(field);
    field.click();
    window.dispatchEvent(new Event('pagehide'));
    await act(async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); });
    expect(fetch).toHaveBeenCalled();
    const [url, init] = fetch.mock.calls.at(-1)!;
    expect(url).toBe('https://project.supabase.co/functions/v1/jobvance-track');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ token: mocks.session!.access_token, context: { utm_source: 'instagram', fbclid: true, landing: '/job-loop?utm_source=instagram' } });
    expect(body.events.map((event: { kind: string }) => event.kind)).toEqual(['page_view', 'click', 'page_leave']);
    expect(body.events[1]).toMatchObject({ label: 'Start Job Loop', path: '/job-loop?utm_source=instagram' });
    expect(init.body).not.toContain('private typed text');
    expect(init.keepalive).toBe(true);
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); button.remove(); field.remove();
  });
});
