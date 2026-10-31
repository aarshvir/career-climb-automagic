import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ auth: {} as { user: User | null; session: Session | null; loading: boolean; authError: string | null; retryConnection: () => void }, session: null as Session | null, initialize: vi.fn(), getSession: vi.fn(), updateUser: vi.fn(), fetch: vi.fn(), action: vi.fn(), mounts: 0 }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ configurationError: null, supabase: { auth: { initialize: mocks.initialize, getSession: mocks.getSession, updateUser: mocks.updateUser } } }));

import { ContactGate } from '@/components/ContactDetails';
import ContactForm from '@/components/ContactForm';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { captureContactAuthority, contactAuthorityKey, currentContactAuthority, readContactDetails, saveContactDetails } from '@/lib/contact-details';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';
import { clearTrackingDraftMemory, setTrackingDraftOwner } from '@/lib/tracking-draft-memory';

const ownerA = '11111111-1111-4111-8111-111111111111', ownerB = '22222222-2222-4222-8222-222222222222';
const sessionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sessionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const details = { fullName: 'Casey Example', phone: '+447700900123' };
function session(owner = ownerA, identity = sessionA, metadata: Record<string, unknown> = {}, suffix = 'signature'): Session {
  const user = { id: owner, app_metadata: {}, user_metadata: metadata, aud: 'authenticated', created_at: '2026-10-26' } as User;
  return { user, access_token: `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ sub: owner, session_id: identity }))}.${suffix}`, token_type: 'bearer', expires_in: 3600, refresh_token: 'unused-test-refresh' };
}
function adopt(value: Session | null, options: { loading?: boolean; error?: string | null } = {}) {
  mocks.session = value;
  setTrackingDraftOwner(value?.user.id ?? null, cvVariantSessionIdentity(value));
  mocks.auth = { user: value?.user ?? null, session: value, loading: options.loading ?? false, authError: options.error ?? null, retryConnection: vi.fn() };
}
const receiptUser = (owner = ownerA, metadata: Record<string, unknown> = { full_name: details.fullName, phone: details.phone }) => ({ ...session(owner).user, user_metadata: metadata });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function scope() { return captureContactAuthority(mocks.auth.user, mocks.auth.session, mocks.auth.loading, mocks.auth.authError)!; }
function tree(child: React.ReactNode = <h1>Workspace draft</h1>, path = '/loop') {
  return <MemoryRouter initialEntries={[path]}><ContactGate><Routes><Route path="*" element={child} /></Routes></ContactGate></MemoryRouter>;
}

beforeEach(() => {
  vi.clearAllMocks(); clearTrackingDraftMemory(); mocks.mounts = 0;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_public-fixture');
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.initialize.mockResolvedValue({ error: null });
  mocks.getSession.mockImplementation(async () => ({ data: { session: mocks.session }, error: null }));
  mocks.fetch.mockImplementation(async (_url, init) => json(init?.method === 'PUT' ? receiptUser() : receiptUser(ownerA, {})));
  adopt(session());
});
afterEach(() => { cleanup(); clearTrackingDraftMemory(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('contact save original account authority', () => {
  it('dispatches with the original captured token after a same-session token refresh and validates exact contact metadata', async () => {
    const original = scope(), pending = deferred<Awaited<ReturnType<typeof mocks.getSession>>>();
    mocks.getSession.mockReturnValueOnce(pending.promise);
    const save = saveContactDetails(original, details, () => true);
    adopt(session(ownerA, sessionA, {}, 'refreshed-token'));
    pending.resolve({ data: { session: mocks.session }, error: null });
    const saved = await save;
    expect(saved).toEqual({ ownerId: ownerA, epoch: original.epoch, sessionId: sessionA, ...details });
    expect(mocks.fetch).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/user', expect.objectContaining({ method: 'PUT', credentials: 'omit', headers: expect.objectContaining({ Authorization: `Bearer ${original.token}`, apikey: 'sb_publishable_public-fixture' }), body: JSON.stringify({ data: { full_name: details.fullName, phone: details.phone } }) }));
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(JSON.stringify(saved)).not.toContain(original.token);
  });

  it.each(['different owner', 'A to B to A', 'same owner new session'] as const)('rejects %s before a delayed SDK session can choose the request owner', async mode => {
    const original = scope(), pending = deferred<{ data: { session: Session | null }; error: null }>();
    mocks.getSession.mockReturnValueOnce(pending.promise);
    const result = saveContactDetails(original, details, () => true).catch(error => error);
    if (mode === 'same owner new session') adopt(session(ownerA, sessionB));
    else { adopt(session(ownerB, sessionB)); if (mode === 'A to B to A') adopt(session(ownerA, sessionA)); }
    pending.resolve({ data: { session: mocks.session }, error: null });
    expect(await result).toBeInstanceOf(Error); expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('rejects a stale different-session SDK receipt even without an auth callback', async () => {
    const original = scope(); mocks.getSession.mockResolvedValueOnce({ data: { session: session(ownerA, sessionB) }, error: null });
    await expect(saveContactDetails(original, details, () => true)).rejects.toThrow('sign-in changed');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not acknowledge a response after A to B to A, even when its metadata is exact', async () => {
    const original = scope(), pending = deferred<Response>(); mocks.fetch.mockReturnValueOnce(pending.promise);
    const result = saveContactDetails(original, details, () => true).catch(error => error);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    adopt(session(ownerB, sessionB)); adopt(session(ownerA, sessionA)); pending.resolve(json(receiptUser()));
    expect(await result).toBeInstanceOf(Error);
  });

  it.each([
    ['different user', () => receiptUser(ownerB)],
    ['different phone', () => receiptUser(ownerA, { full_name: details.fullName, phone: '+14155550100' })],
    ['different name', () => receiptUser(ownerA, { full_name: 'Someone Else', phone: details.phone })],
    ['fallback name instead of saved full_name', () => receiptUser(ownerA, { name: details.fullName, phone: details.phone })],
    ['coerced contact metadata', () => receiptUser(ownerA, { full_name: [details.fullName], phone: [details.phone] })],
    ['wrapped receipt', () => ({ user: receiptUser() })],
  ] as const)('rejects a successful HTTP response with %s', async (_name, value) => {
    mocks.fetch.mockResolvedValueOnce(json(value()));
    await expect(saveContactDetails(scope(), details, () => true)).rejects.toThrow(/confirm/);
  });

  it('a blank phone is never sent, so it cannot clear a number already saved on the account', async () => {
    const nameOnly = { fullName: details.fullName, phone: '' };
    mocks.fetch.mockResolvedValueOnce(json(receiptUser(ownerA, { full_name: details.fullName, phone: details.phone })));
    const saved = await saveContactDetails(scope(), nameOnly, () => true);
    expect(mocks.fetch.mock.calls[0][1].body).toBe(JSON.stringify({ data: { full_name: details.fullName } }));
    expect(saved).toMatchObject({ fullName: details.fullName, phone: details.phone });
    mocks.fetch.mockResolvedValueOnce(json(receiptUser(ownerA, { full_name: 'Someone Else' })));
    await expect(saveContactDetails(scope(), nameOnly, () => true)).rejects.toThrow(/confirm/);
    await expect(saveContactDetails(scope(), { fullName: details.fullName, phone: '12345' }, () => true)).rejects.toThrow('valid mobile number');
  });

  it('keeps a failed or ambiguous save retryable using the same original draft and exact current owner', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Network interrupted')).mockResolvedValueOnce(json(receiptUser()));
    const original = scope();
    await expect(saveContactDetails(original, details, () => true)).rejects.toThrow('Network interrupted');
    await expect(saveContactDetails(original, details, () => true)).resolves.toMatchObject(details);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[0][1].body).toBe(mocks.fetch.mock.calls[1][1].body);
  });

  it('recovers an accepted save by a bound read after a lost response, without another write', async () => {
    mocks.fetch.mockResolvedValueOnce(json(receiptUser()));
    await expect(readContactDetails(scope(), () => true)).resolves.toMatchObject(details);
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/v1/user'), expect.objectContaining({ method: 'GET' }));
  });

  it('cannot capture unknown or unconfirmed authority, even with apparently complete metadata', () => {
    const complete = session(ownerA, sessionA, { full_name: details.fullName, phone: details.phone });
    expect(captureContactAuthority(complete.user, complete, true, null)).toBeNull();
    expect(captureContactAuthority(complete.user, complete, false, 'Unknown sign-in')).toBeNull();
    expect(captureContactAuthority(complete.user, { ...complete, access_token: 'no-session-id' }, false, null)).toBeNull();
    adopt(session(ownerB, sessionB)); expect(captureContactAuthority(complete.user, complete, false, null)).toBeNull();
  });
});

describe('contact form and stable private draft gate', () => {
  it('retains typed name and phone after failure and completes only after an exact save receipt', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(json(receiptUser()));
    const saved = vi.fn(), user = userEvent.setup();
    render(<ContactForm user={mocks.auth.user!} onSaved={saved} />);
    await user.type(screen.getByLabelText('Full name'), details.fullName);
    await user.selectOptions(screen.getByLabelText('Country code'), '+44');
    await user.type(screen.getByLabelText('Mobile number (optional)'), '07700 900123');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.getByLabelText('Full name')).toHaveValue(details.fullName); expect(screen.getByLabelText('Mobile number (optional)')).toHaveValue('07700 900123');
    expect(saved).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining(details)));
  });

  it('does not rebind an old rendered form to an A to B to A SDK epoch before React updates', async () => {
    const user = userEvent.setup(), saved = vi.fn();
    render(<ContactForm user={mocks.auth.user!} onSaved={saved} />);
    await user.type(screen.getByLabelText('Full name'), details.fullName); await user.type(screen.getByLabelText('Mobile number (optional)'), '+447700900123');
    const previousAuth = mocks.auth;
    adopt(session(ownerB, sessionB)); adopt(session(ownerA, sessionA)); mocks.auth = previousAuth;
    fireEvent.submit(screen.getByRole('button', { name: /Continue/ }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed');
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
  });

  function Draft({ portal = false }: { portal?: boolean }) {
    const [value, setValue] = useState('');
    const [host] = useState(() => document.createElement('div'));
    useEffect(() => { mocks.mounts++; if (portal) document.body.appendChild(host); return () => { host.remove(); }; }, [host, portal]);
    return <><label>Unsaved CV<textarea value={value} onChange={event => setValue(event.target.value)} /></label><form onSubmit={event => { event.preventDefault(); mocks.action(); }}><button>Run private action</button></form>{portal && createPortal(<button onClick={mocks.action}>Portalled private action</button>, host)}</>;
  }

  it('keeps a real unsaved child draft mounted while the gate opens/completes, and blocks private/portal actions', async () => {
    adopt(session(ownerA, sessionA, { full_name: details.fullName, phone: details.phone }));
    const user = userEvent.setup(), view = render(tree(<Draft portal />));
    await user.type(screen.getByLabelText('Unsaved CV'), 'Draft kept exactly');
    const privateButton = screen.getByRole('button', { name: 'Run private action' }), portalledButton = screen.getByRole('button', { name: 'Portalled private action' });
    adopt(session(ownerA, sessionA, {})); view.rerender(tree(<Draft portal />));
    await screen.findByRole('heading', { name: 'One last step' });
    expect(screen.queryByRole('textbox', { name: 'Unsaved CV' })).not.toBeInTheDocument();
    expect(privateButton.closest('[hidden]')).not.toBeNull(); expect(portalledButton.closest('[hidden]')).not.toBeNull();
    fireEvent.click(privateButton); fireEvent.submit(privateButton.closest('form')!); fireEvent.click(portalledButton);
    expect(mocks.action).not.toHaveBeenCalled(); expect(mocks.mounts).toBe(1);
    await user.type(screen.getByLabelText('Full name'), details.fullName);
    await user.selectOptions(screen.getByLabelText('Country code'), '+44'); await user.type(screen.getByLabelText('Mobile number (optional)'), '07700 900123');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Unsaved CV')).toHaveValue('Draft kept exactly'); expect(mocks.mounts).toBe(1);
    expect(portalledButton.closest('[hidden]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Portalled private action' })); expect(mocks.action).toHaveBeenCalledTimes(1);
  });

  it('does not mount a first-blocked private subtree and does not unlock on an unknown loading session', async () => {
    adopt(session(ownerA, sessionA, { full_name: details.fullName, phone: details.phone }), { loading: true });
    render(tree(<Draft />));
    await screen.findByRole('heading', { name: 'One last step' });
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled(); expect(mocks.mounts).toBe(0); expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('suspends an actual Radix private dialog/focus trap without losing its unsaved draft', async () => {
    function PrivateDialog() {
      const [value, setValue] = useState('');
      return <Dialog open><DialogContent aria-describedby={undefined}><DialogTitle>Private edit</DialogTitle><label>Dialog draft<input value={value} onChange={event => setValue(event.target.value)} /></label><button onClick={mocks.action}>Save private edit</button></DialogContent></Dialog>;
    }
    adopt(session(ownerA, sessionA, { full_name: details.fullName, phone: details.phone }));
    const user = userEvent.setup(), view = render(tree(<PrivateDialog />));
    await user.type(await screen.findByLabelText('Dialog draft'), 'Unsaved modal text');
    const privateSave = screen.getByRole('button', { name: 'Save private edit' });
    adopt(session(ownerA, sessionA, {})); view.rerender(tree(<PrivateDialog />));
    await screen.findByRole('heading', { name: 'One last step' });
    expect(screen.queryByRole('heading', { name: 'Private edit' })).not.toBeInTheDocument();
    fireEvent.click(privateSave); expect(mocks.action).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Full name'), details.fullName);
    await user.selectOptions(screen.getByLabelText('Country code'), '+44');
    await user.type(screen.getByLabelText('Mobile number (optional)'), '07700 900123');
    expect(screen.getByLabelText('Mobile number (optional)')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(await screen.findByLabelText('Dialog draft')).toHaveValue('Unsaved modal text');
    await user.click(screen.getByRole('button', { name: 'Save private edit' })); expect(mocks.action).toHaveBeenCalledTimes(1);
  });

  it('a confirmed contact read can recover after remount but only for the same current session', async () => {
    mocks.fetch.mockResolvedValueOnce(json(receiptUser()));
    render(tree(<Draft />));
    await screen.findByLabelText('Unsaved CV'); expect(mocks.mounts).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1); expect(mocks.fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('does not discard newly typed contact details when a delayed recovery read returns older complete metadata', async () => {
    const pending = deferred<Response>(); mocks.fetch.mockReturnValueOnce(pending.promise);
    render(tree(<Draft />));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Full name'), 'Casey Edited');
    await act(async () => { pending.resolve(json(receiptUser())); await pending.promise; });
    expect(screen.getByRole('heading', { name: 'One last step' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Casey Edited'); expect(mocks.mounts).toBe(0);
  });

  it('keeps the typed contact draft through same-session token refresh and saves using that current render', async () => {
    const user = userEvent.setup(), view = render(tree(<Draft />));
    await user.type(await screen.findByLabelText('Full name'), details.fullName);
    await user.selectOptions(screen.getByLabelText('Country code'), '+44'); await user.type(screen.getByLabelText('Mobile number (optional)'), '07700 900123');
    adopt(session(ownerA, sessionA, {}, 'new-refresh-signature')); view.rerender(tree(<Draft />));
    expect(screen.getByLabelText('Full name')).toHaveValue(details.fullName); expect(screen.getByLabelText('Mobile number (optional)')).toHaveValue('07700 900123');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByLabelText('Unsaved CV');
    const put = mocks.fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(put[1].headers.Authorization).toBe(`Bearer ${mocks.session!.access_token}`);
  });

  it('a newer same-session SDK user with missing details revokes an older save receipt', async () => {
    mocks.fetch.mockResolvedValueOnce(json(receiptUser()));
    const view = render(tree(<Draft />));
    await screen.findByLabelText('Unsaved CV');
    adopt(session(ownerA, sessionA, {})); view.rerender(tree(<Draft />));
    await screen.findByRole('heading', { name: 'One last step' });
    expect(screen.queryByRole('textbox', { name: 'Unsaved CV' })).not.toBeInTheDocument(); expect(mocks.mounts).toBe(1);
  });

  it('resets a save latch and discards a previous owner draft for a later same-owner new session', async () => {
    mocks.fetch.mockResolvedValueOnce(json(receiptUser()));
    const user = userEvent.setup(), view = render(tree(<Draft />));
    await user.type(await screen.findByLabelText('Unsaved CV'), 'Previous session draft');
    adopt(session(ownerA, sessionB)); view.rerender(tree(<Draft />));
    await screen.findByRole('heading', { name: 'One last step' });
    expect(screen.queryByRole('textbox', { name: 'Unsaved CV' })).not.toBeInTheDocument();
    expect(mocks.mounts).toBe(1);
  });

  it('public pages and account recovery bypass missing/unknown contact details', () => {
    adopt(session(), { loading: true });
    const view = render(tree(<h1>Public help</h1>, '/help'));
    expect(screen.getByRole('heading', { name: 'Public help' })).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount(); render(tree(<h1>Recover account</h1>, '/auth/forgot-password'));
    expect(screen.getByRole('heading', { name: 'Recover account' })).toBeInTheDocument();
  });
});
