import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ user: null as null | { id: string; user_metadata: Record<string, string> }, updateUser: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { updateUser: mocks.updateUser, getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } } }));
import { ContactGate } from '@/components/ContactDetails';
import { normalizePhone, defaultCountryCode, hasContactDetails } from '@/lib/contact-details';
import { cleanPath, startAnalytics, trackPage } from '@/lib/analytics';

const tree = (path: string) => <MemoryRouter initialEntries={[path]}><ContactGate><Routes><Route path="*" element={<h1>Destination</h1>} /></Routes></ContactGate></MemoryRouter>;
beforeEach(() => { vi.clearAllMocks(); mocks.user = null; mocks.updateUser.mockResolvedValue({ error: null }); });
afterEach(cleanup);

describe('name and mobile number for every account', () => {
  it('normalizes numbers typed in common ways', () => {
    expect(normalizePhone('050 123 4567', '+971')).toBe('+971501234567');
    expect(normalizePhone('+1 (415) 555-0100', '+971')).toBe('+14155550100');
    expect(normalizePhone('00971501234567', '+1')).toBe('+971501234567');
    expect(normalizePhone('123', '+1')).toBeNull();
    expect(defaultCountryCode('en-AE')).toBe('+971');
    expect(defaultCountryCode('fr')).toBe('+1');
    expect(hasContactDetails({ full_name: 'Casey', phone: '+971501234567' })).toBe(true);
    expect(hasContactDetails({ name: 'Casey' })).toBe(false);
  });

  it('asks a signed-in person without a phone number before opening their workspace', async () => {
    mocks.user = { id: 'google-user', user_metadata: { full_name: 'Casey Google' } };
    render(tree('/loop'));
    expect(await screen.findByRole('heading', { name: 'One last step' })).toBeInTheDocument();
    expect(screen.queryByText('Destination')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Casey Google');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Country code'), '+44');
    await user.type(screen.getByLabelText('Mobile number'), '07700 900123');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ data: { full_name: 'Casey Google', phone: '+447700900123' } }));
    expect(await screen.findByText('Destination')).toBeInTheDocument();
  });

  it('rejects a number that is too short', async () => {
    mocks.user = { id: 'google-user', user_metadata: { full_name: 'Casey Google' } };
    render(tree('/onboarding'));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Mobile number'), '12');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid mobile number');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('lets people with details, and public pages, straight through', () => {
    mocks.user = { id: 'done', user_metadata: { full_name: 'Casey', phone: '+971501234567' } };
    render(tree('/loop'));
    expect(screen.getByText('Destination')).toBeInTheDocument();
    cleanup();
    mocks.user = { id: 'missing', user_metadata: {} };
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
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'signed-in-token' } } });
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
    expect(fetch).toHaveBeenCalled();
    const [url, init] = fetch.mock.calls.at(-1)!;
    expect(url).toBe('https://project.supabase.co/functions/v1/jobvance-track');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ token: 'signed-in-token', context: { utm_source: 'instagram', fbclid: true, landing: '/job-loop?utm_source=instagram' } });
    expect(body.events.map((event: { kind: string }) => event.kind)).toEqual(['page_view', 'click', 'page_leave']);
    expect(body.events[1]).toMatchObject({ label: 'Start Job Loop', path: '/job-loop?utm_source=instagram' });
    expect(init.body).not.toContain('private typed text');
    expect(init.keepalive).toBe(true);
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); button.remove(); field.remove();
  });
});
