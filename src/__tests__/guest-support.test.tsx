import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminGuestSupport, AdminGuestSupportDetail } from '@/lib/admin-types';
import type { GuestReceipt } from '@/lib/guest-support';

vi.unmock('react-router-dom');
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), admin: vi.fn(), download: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke }, auth: { getUser: mocks.getUser, getSession: mocks.getSession } } }));
vi.mock('@/lib/admin-api', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/admin-api')>(), callAdmin: mocks.admin }));
vi.mock('@/lib/document-download', () => ({ downloadBlob: mocks.download }));
import GuestSupport from '@/pages/GuestSupport';
import GuestSupportInbox from '@/pages/admin/GuestSupportInbox';
import { AdminApiError } from '@/lib/admin-api';
import { guestReceiptCode } from '@/lib/guest-support';

const id = '00000000-0000-4000-8000-000000000004';
const otherId = '00000000-0000-4000-8000-000000000005';
const reference = { requestId: id, receiptKey: 'a'.repeat(64) };
const date = '2026-10-14T08:00:00.000Z';
const expiry = '2027-01-12T08:00:00.000Z';
function publicReceipt(requestId = id, changes: Partial<GuestReceipt> = {}): GuestReceipt {
  return { id: requestId, category: 'help', status: 'received', reply: '', createdAt: date, updatedAt: date, expiresAt: expiry, ...changes };
}
function metadata(): AdminGuestSupport {
  return { id, category: 'privacy', status: 'received', version: 3, createdAt: date, updatedAt: date, expiresAt: expiry, hasReply: false };
}
function privateDetail(changes: Partial<AdminGuestSupportDetail> = {}): AdminGuestSupportDetail {
  return { id, category: 'privacy', status: 'received', version: 3, createdAt: date, updatedAt: date, expiresAt: expiry, message: 'Private guest message <img src=x onerror=alert(1)>.', reply: '', ...changes };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function showGuest() { return render(<MemoryRouter initialEntries={['/contact']}><GuestSupport /></MemoryRouter>); }
function lookupPanel() { return screen.getByText('Check an existing support receipt').closest('details') as HTMLDetailsElement; }
async function fillGuest(user: ReturnType<typeof userEvent.setup>, message = 'I cannot finish the review step.') {
  await user.type(screen.getByLabelText('What happened?'), message);
  await user.click(screen.getByRole('checkbox', { name: /Store this message privately/ }));
}
async function openExisting(user: ReturnType<typeof userEvent.setup>, code = guestReceiptCode(reference)) {
  await user.click(screen.getByText('Check an existing support receipt'));
  await user.type(within(lookupPanel()).getByLabelText('Private receipt code'), code);
  await user.click(within(lookupPanel()).getByRole('button', { name: 'Check receipt status' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockImplementation(async (_name, options) => ({ data: { receipt: publicReceipt(options.body.requestId) }, error: null }));
  mocks.admin.mockImplementation(async (_actor, action) => {
    if (action.action === 'guest_support_list') return { guestSupport: [metadata()] };
    if (action.action === 'guest_support_detail') return { guestSupportDetail: privateDetail() };
    return { guestSupportDetail: privateDetail({ version: action.expectedVersion + 1, status: action.status, reply: action.reply }) };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('support without an account', () => {
  it('requires consent and a useful message, then saves without authentication, email or attachments', async () => {
    const user = userEvent.setup();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    showGuest();
    expect(screen.getByRole('heading', { name: 'Tell us what you need help with.' })).toBeInTheDocument();
    expect(screen.getByText(/A receipt confirms storage/)).toHaveTextContent('does not mean someone has reviewed the request or promise a response time');
    await user.click(screen.getByRole('button', { name: 'Save support request' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write at least five characters and confirm private storage.');
    await user.type(screen.getByLabelText('What happened?'), 'The review step is stuck.');
    await user.click(screen.getByRole('button', { name: 'Save support request' }));
    expect(mocks.invoke).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save support request' }));
    expect(await screen.findByRole('heading', { name: 'Your private support receipt' })).toBeInTheDocument();
    const body = mocks.invoke.mock.calls[0][1].body;
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.invoke.mock.calls[0][0]).toBe('jobvance-guest-support');
    expect(body).toEqual({ action: 'create', requestId: expect.stringMatching(/^[a-f\d-]{36}$/), receiptKey: expect.stringMatching(/^[a-f\d]{64}$/), category: 'help', message: 'The review step is stuck.', consent: true, website: '' });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(document.querySelector('input[type=email],input[type=file]')).toBeNull();
    const code = screen.getAllByLabelText('Private receipt code').find(element => (element as HTMLTextAreaElement).readOnly) as HTMLTextAreaElement;
    expect(code.value).toBe(guestReceiptCode(body));
    expect(screen.getByLabelText('What happened?')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText('No reply has been recorded yet.')).toBeInTheDocument();
    expect(storage).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain(body.receiptKey);
    expect(document.cookie).not.toContain(body.receiptKey);
    await user.click(screen.getByRole('button', { name: 'Download receipt code' }));
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'Jobvance-private-support-receipt.txt');
  });

  it('keeps the draft and the exact request reference after an ambiguous failure, then clears the draft on confirmation', async () => {
    const user = userEvent.setup();
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Ambiguous server result' } });
    showGuest();
    await fillGuest(user);
    await user.selectOptions(screen.getByLabelText('Request type'), 'bug');
    await user.click(screen.getByRole('button', { name: 'Save support request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Keep your draft and retry.');
    const original = structuredClone(mocks.invoke.mock.calls[0][1].body);
    expect(screen.getByLabelText('What happened?')).toHaveValue('I cannot finish the review step.');
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.queryByRole('heading', { name: 'Your private support receipt' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save support request' }));
    await screen.findByRole('heading', { name: 'Your private support receipt' });
    expect(mocks.invoke.mock.calls[1][1].body).toEqual(original);
    expect(screen.getByLabelText('What happened?')).toHaveValue('');
  });

  it('allocates a fresh reference when the user changes a failed request and prevents editing while pending', async () => {
    const user = userEvent.setup();
    const pending = deferred<{ data: unknown; error: null }>();
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Unconfirmed' } });
    showGuest(); await fillGuest(user);
    await user.click(screen.getByRole('button', { name: 'Save support request' }));
    await screen.findByRole('alert');
    const original = mocks.invoke.mock.calls[0][1].body;
    await user.type(screen.getByLabelText('What happened?'), ' More context.');
    mocks.invoke.mockReturnValueOnce(pending.promise);
    await user.click(screen.getByRole('button', { name: 'Save support request' }));
    expect(mocks.invoke.mock.calls[1][1].body.requestId).not.toBe(original.requestId);
    expect(mocks.invoke.mock.calls[1][1].body.receiptKey).not.toBe(original.receiptKey);
    expect(screen.getByLabelText('What happened?')).toBeDisabled();
    expect(screen.getByLabelText('Request type')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recording your request…' })).toBeDisabled();
    await act(async () => pending.resolve({ data: { receipt: publicReceipt(mocks.invoke.mock.calls[1][1].body.requestId) }, error: null }));
    await screen.findByRole('heading', { name: 'Your private support receipt' });
  });

  it('validates a pasted code before lookup and renders status and a reply as text without storing or linking the secret', async () => {
    const user = userEvent.setup();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const reply = 'Review complete <img src=x onerror=alert(1)>.';
    mocks.invoke.mockResolvedValue({ data: { receipt: publicReceipt(id, { status: 'resolved', reply }) }, error: null });
    const { container } = showGuest();
    await openExisting(user, 'not a private receipt');
    expect(await screen.findByRole('alert')).toHaveTextContent('Paste the complete private receipt code');
    expect(mocks.invoke).not.toHaveBeenCalled();
    await user.clear(within(lookupPanel()).getByLabelText('Private receipt code'));
    await user.type(within(lookupPanel()).getByLabelText('Private receipt code'), guestReceiptCode(reference));
    await user.click(within(lookupPanel()).getByRole('button', { name: 'Check receipt status' }));
    expect(await screen.findByText(reply)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('resolved');
    expect(container.querySelector('img')).toBeNull();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('jobvance-guest-support', { body: { action: 'receipt', ...reference } });
    expect(storage).not.toHaveBeenCalled();
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toContain(reference.receiptKey);
    expect(window.location.href).not.toContain(reference.receiptKey);
  });

  it('never displays a malformed or wrong-ID lookup response', async () => {
    const user = userEvent.setup();
    mocks.invoke.mockResolvedValue({ data: { receipt: publicReceipt(otherId, { reply: 'Private reply from another receipt' }) }, error: null });
    showGuest(); await openExisting(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('The receipt could not be verified.');
    expect(screen.queryByRole('heading', { name: 'Your private support receipt' })).not.toBeInTheDocument();
    expect(screen.queryByText('Private reply from another receipt')).not.toBeInTheDocument();
  });

  it.each(['create', 'receipt'])('ignores a late %s result after the support view unmounts', async action => {
    const user = userEvent.setup();
    const pending = deferred<{ data: unknown; error: null }>();
    mocks.invoke.mockReturnValue(pending.promise);
    const first = showGuest();
    if (action === 'create') { await fillGuest(user); await user.click(screen.getByRole('button', { name: 'Save support request' })); }
    else await openExisting(user);
    const expectedId = mocks.invoke.mock.calls[0][1].body.requestId;
    first.unmount();
    showGuest();
    await act(async () => pending.resolve({ data: { receipt: publicReceipt(expectedId, { reply: 'Late private reply' }) }, error: null }));
    expect(screen.queryByRole('heading', { name: 'Your private support receipt' })).not.toBeInTheDocument();
    expect(screen.queryByText('Late private reply')).not.toBeInTheDocument();
    expect(screen.getByLabelText('What happened?')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save support request' })).toBeEnabled();
  });
});

describe('staff guest support inbox', () => {
  it('loads only metadata, opens one explicitly selected message and clears private text on close', async () => {
    const user = userEvent.setup();
    const message = privateDetail().message;
    render(<GuestSupportInbox actorId="owner-a" />);
    const trigger = await screen.findByRole('button', { name: /Open guest receipt/ });
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith('owner-a', { action: 'guest_support_list' });
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    await user.click(trigger);
    const selected = await screen.findByRole('region', { name: 'Selected guest support request' });
    expect(within(selected).getByText(message)).toBeInTheDocument();
    expect(selected.querySelector('img')).toBeNull();
    expect(mocks.admin).toHaveBeenLastCalledWith('owner-a', { action: 'guest_support_detail', id });
    await user.type(within(selected).getByLabelText('Reply shown to the private receipt holder'), 'Unsaved private reply');
    await user.click(within(selected).getByRole('button', { name: 'Close private request' }));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Unsaved private reply')).not.toBeInTheDocument();
    expect(mocks.admin).toHaveBeenCalledTimes(2);
  });

  it('saves only on explicit action with the opened version, and labels the reply as private receipt content', async () => {
    const user = userEvent.setup();
    render(<GuestSupportInbox actorId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: /Open guest receipt/ }));
    const selected = await screen.findByRole('region', { name: 'Selected guest support request' });
    await user.selectOptions(within(selected).getByLabelText('Receipt status'), 'resolved');
    await user.type(within(selected).getByLabelText('Reply shown to the private receipt holder'), 'A private answer for the receipt holder.');
    expect(mocks.admin).toHaveBeenCalledTimes(2);
    expect(selected).toHaveTextContent('No email, message outreach or model call is triggered.');
    await user.click(within(selected).getByRole('button', { name: 'Save guest receipt update' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Status and receipt reply saved. No email was sent.');
    expect(mocks.admin).toHaveBeenLastCalledWith('owner-a', { action: 'guest_support_update', id, expectedVersion: 3, status: 'resolved', reply: 'A private answer for the receipt holder.' });
    expect(screen.getByText(/Expiry/)).toHaveTextContent('Version 4');
    expect(screen.getByText(/Receipt 00000000/)).toHaveTextContent('Reply recorded');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('stops further saves after a version conflict until the staff member reopens current detail', async () => {
    const user = userEvent.setup();
    mocks.admin.mockImplementation(async (_actor, action) => {
      if (action.action === 'guest_support_update') throw new AdminApiError('conflict', 'Refresh current version');
      return action.action === 'guest_support_list' ? { guestSupport: [metadata()] } : { guestSupportDetail: privateDetail() };
    });
    render(<GuestSupportInbox actorId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: /Open guest receipt/ }));
    await user.click(await screen.findByRole('button', { name: 'Save guest receipt update' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Close and reopen');
    expect(screen.getByRole('button', { name: 'Save guest receipt update' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Close private request' }));
    await user.click(screen.getByRole('button', { name: /Open guest receipt/ }));
    expect(await screen.findByRole('button', { name: 'Save guest receipt update' })).toBeEnabled();
  });

  it.each(['forbidden', 'unauthenticated'] as const)('clears private detail and metadata when a save reports %s access', async kind => {
    const user = userEvent.setup();
    mocks.admin.mockImplementation(async (_actor, action) => {
      if (action.action === 'guest_support_update') throw new AdminApiError(kind, 'Access revoked');
      return action.action === 'guest_support_list' ? { guestSupport: [metadata()] } : { guestSupportDetail: privateDetail({ reply: 'Private existing reply' }) };
    });
    render(<GuestSupportInbox actorId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: /Open guest receipt/ }));
    await user.click(await screen.findByRole('button', { name: 'Save guest receipt update' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(privateDetail().message)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Private existing reply')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open guest receipt/ })).not.toBeInTheDocument();
  });

  it('discards old-account private detail while a new account loads its own list', async () => {
    const user = userEvent.setup();
    const pending = deferred<{ guestSupportDetail: AdminGuestSupportDetail }>();
    mocks.admin.mockImplementation(async (actor, action) => {
      if (action.action === 'guest_support_detail') return pending.promise;
      return { guestSupport: actor === 'owner-a' ? [metadata()] : [] };
    });
    const shown = render(<GuestSupportInbox actorId="owner-a" />);
    await user.click(await screen.findByRole('button', { name: /Open guest receipt/ }));
    shown.rerender(<GuestSupportInbox actorId="owner-b" />);
    await waitFor(() => expect(mocks.admin).toHaveBeenCalledWith('owner-b', { action: 'guest_support_list' }));
    await act(async () => pending.resolve({ guestSupportDetail: privateDetail({ message: 'Late old-account private message' }) }));
    expect(screen.queryByText('Late old-account private message')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected guest support request' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open guest receipt/ })).not.toBeInTheDocument();
  });
});
