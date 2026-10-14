import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAction } from '@/lib/admin-types';
const sdk = vi.hoisted(() => ({ invoke: vi.fn(), getUser: vi.fn(), session: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: sdk.invoke }, auth: { getUser: sdk.getUser } } }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
import { createGuestSupport, guestReceiptCode, lookupGuestSupport, newGuestReference, parseGuestReceiptCode } from '@/lib/guest-support';
import { callAdmin } from '@/lib/admin-api';

const requestId = '00000000-0000-4000-8000-000000000004';
const reference = { requestId, receiptKey: 'a'.repeat(64) };
const receipt = { id: requestId, category: 'privacy', status: 'in_review', reply: 'Private reply', createdAt: '2026-10-14T08:00:00.000Z', updatedAt: '2026-10-14T09:00:00.000Z', expiresAt: '2027-01-12T08:00:00.000Z' };
const guestDetail = { ...receipt, version: 3, message: 'Private support message' };
beforeEach(() => {
  vi.clearAllMocks();
  sdk.session.mockResolvedValue({ user: { id: 'owner-a' } });
  sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
  sdk.invoke.mockResolvedValue({ data: { receipt }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('private guest receipt API boundary', () => {
  it('generates a fresh UUID plus 256-bit bearer secret and round-trips only a complete private code', () => {
    const first = newGuestReference(), second = newGuestReference();
    expect(first.requestId).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
    expect(first.receiptKey).toMatch(/^[a-f\d]{64}$/);
    expect(second).not.toEqual(first);
    expect(second.receiptKey).not.toBe(first.receiptKey);
    expect(parseGuestReceiptCode(guestReceiptCode(first))).toEqual(first);
    expect(parseGuestReceiptCode(`  ${guestReceiptCode(first).toUpperCase()}\n`)).toEqual(first);
    for (const malformed of [
      '', requestId, reference.receiptKey, `JVS-${requestId}`, `${requestId}.${reference.receiptKey}`,
      `https://jobvance.io/contact?receipt=${guestReceiptCode(reference)}`,
      `${guestReceiptCode(reference)}.extra`, `JVS-${requestId}.${'a'.repeat(63)}`,
      `JVS-${requestId}.${'a'.repeat(65)}`, `JVS-${requestId}.${'z'.repeat(64)}`,
      `JVS-00000000-0000-1000-8000-000000000004.${reference.receiptKey}`,
    ]) expect(parseGuestReceiptCode(malformed), malformed).toBeNull();
  });

  it('uses only the fixed public function and exact action fields without any auth call', async () => {
    expect(await createGuestSupport(reference, 'privacy', 'A private question.')).toEqual(receipt);
    expect(sdk.invoke).toHaveBeenCalledWith('jobvance-guest-support', { body: { action: 'create', ...reference, category: 'privacy', message: 'A private question.', consent: true, website: '' } });
    expect(await lookupGuestSupport(reference)).toEqual(receipt);
    expect(sdk.invoke).toHaveBeenLastCalledWith('jobvance-guest-support', { body: { action: 'receipt', ...reference } });
    expect(sdk.getUser).not.toHaveBeenCalled();
    expect(sdk.session).not.toHaveBeenCalled();
  });

  it('rejects missing, malformed, oversized and wrong-receipt responses', async () => {
    for (const data of [
      null, {}, { receipt: null }, { receipt: { ...receipt, id: '00000000-0000-4000-8000-000000000005' } },
      { receipt: { ...receipt, status: 'sent' } }, { receipt: { ...receipt, reply: 'X'.repeat(2001) } },
      { receipt: { ...receipt, category: 'billing' } }, { receipt: { ...receipt, updatedAt: 'not a date' } },
      { receipt: { ...receipt, expiresAt: null } }, { receipt: { ...receipt, reply: undefined } },
    ]) {
      sdk.invoke.mockResolvedValueOnce({ data, error: null });
      await expect(lookupGuestSupport(reference)).rejects.toThrow('The receipt could not be verified. Keep your draft and retry.');
    }
  });

  it.each([[404, 'incorrect, expired or unavailable'], [429, 'Too many new requests'], [503, 'Keep your draft and retry']])('maps HTTP %s without leaking raw service details or secrets', async (status, safeText) => {
    sdk.invoke.mockResolvedValue({ data: null, error: { message: `PRIVATE SQL ${reference.receiptKey}`, context: new Response(`PRIVATE SQL ${reference.receiptKey}`, { status: Number(status) }) } });
    await expect(lookupGuestSupport(reference)).rejects.toThrow(String(safeText));
    await expect(lookupGuestSupport(reference)).rejects.not.toThrow('PRIVATE SQL');
    await expect(lookupGuestSupport(reference)).rejects.not.toThrow(reference.receiptKey);
  });

  it('sanitizes thrown transport exceptions as an unconfirmed request without exposing debug contents', async () => {
    sdk.invoke.mockRejectedValue(new Error(`PRIVATE SDK DEBUG ${reference.receiptKey}`));
    await expect(createGuestSupport(reference, 'help', 'A private question.')).rejects.toThrow('Keep your draft and retry');
    await expect(createGuestSupport(reference, 'help', 'A private question.')).rejects.not.toThrow('PRIVATE SDK DEBUG');
  });

  it('times out after 30 seconds without replacing an unconfirmed result when the SDK resolves later', async () => {
    vi.useFakeTimers();
    let finish!: (result: unknown) => void;
    sdk.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = lookupGuestSupport(reference);
    const outcome = pending.then(() => null, failure => failure as Error);
    await vi.advanceTimersByTimeAsync(29999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const failure = await outcome;
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toContain('Keep your draft and retry');
    finish({ data: { receipt }, error: null });
    await expect(pending).rejects.toBe(failure);
    expect(sdk.invoke).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('staff guest support response boundary', () => {
  it('keeps list metadata free of accidentally returned message, reply and receipt secret fields', async () => {
    const metadata = { id: requestId, category: 'privacy', status: 'received', version: 3, createdAt: receipt.createdAt, updatedAt: receipt.updatedAt, expiresAt: receipt.expiresAt, hasReply: false };
    sdk.invoke.mockResolvedValue({ data: { guestSupport: [{ ...metadata, message: 'Unexpected private message', reply: 'Unexpected private reply', receiptKey: reference.receiptKey, rateHash: 'b'.repeat(64) }] }, error: null });
    const saved = await callAdmin('owner-a', { action: 'guest_support_list' });
    expect(saved).toEqual({ guestSupport: [metadata] });
    expect(sdk.invoke).toHaveBeenCalledWith('jobvance-admin', { body: { action: 'guest_support_list' } });
  });

  it.each(['guest_support_detail', 'guest_support_update'] as const)('requires a matching bounded private receipt from %s', async action => {
    const input: AdminAction = action === 'guest_support_detail'
      ? { action, id: requestId }
      : { action, id: requestId, expectedVersion: 3, status: 'resolved', reply: 'Private answer' };
    sdk.invoke.mockResolvedValue({ data: { guestSupportDetail: guestDetail }, error: null });
    expect((await callAdmin('owner-a', input)).guestSupportDetail).toEqual(guestDetail);
    for (const response of [
      {}, { guestSupportDetail: { ...guestDetail, id: '00000000-0000-4000-8000-000000000005' } },
      { guestSupportDetail: { ...guestDetail, version: -1 } },
      { guestSupportDetail: { ...guestDetail, message: 'X'.repeat(2001) } },
      { guestSupportDetail: { ...guestDetail, reply: 'X'.repeat(2001) } },
    ]) {
      sdk.invoke.mockResolvedValueOnce({ data: response, error: null });
      await expect(callAdmin('owner-a', input)).rejects.toMatchObject({ kind: 'unavailable' });
    }
  });
});
