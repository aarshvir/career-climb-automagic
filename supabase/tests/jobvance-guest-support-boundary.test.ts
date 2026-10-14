// @vitest-environment node
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../functions/_shared/core.ts';
import { guestSupportError, supportHash, supportRateHash, validateGuestSupport } from '../functions/_shared/jobvance-guest-support.ts';

const requestId = '00000000-0000-4000-8000-000000000004';
const receiptKey = 'f'.repeat(64);
const create = { action: 'create', requestId, receiptKey, category: 'privacy', message: 'A private support question.', consent: true, website: '' };
const receipt = { action: 'receipt', requestId, receiptKey };

describe('guest support JSON boundary and private hashing', () => {
  it('accepts only the exact create or receipt schemas and bounded plain-text messages', () => {
    expect(validateGuestSupport(create)).toEqual(create);
    expect(validateGuestSupport(receipt)).toEqual(receipt);
    expect(validateGuestSupport({ ...create, message: '12345' })).toMatchObject({ message: '12345' });
    expect(validateGuestSupport({ ...create, message: 'X'.repeat(2000) })).toMatchObject({ message: 'X'.repeat(2000) });
    for (const category of ['help', 'bug', 'privacy']) expect(validateGuestSupport({ ...create, category })).toMatchObject({ category });
    for (const input of [
      null, [], 'create', {}, { ...create, message: 'tiny' }, { ...create, message: '     ' },
      { ...create, message: 'X'.repeat(2001) }, { ...create, message: 'Bad\u0000message' },
      { ...create, message: ['private message'] }, { ...create, consent: false }, { ...create, consent: 'true' },
      { ...create, website: 'https://spam.invalid' }, { ...create, category: 'billing' },
      { ...create, category: ['help'] }, { ...receipt, action: ['receipt'] },
      { ...create, requestId: '00000000-0000-1000-8000-000000000004' }, { ...create, requestId: 'not-a-uuid' },
      { ...create, receiptKey: 'A'.repeat(64) }, { ...create, receiptKey: 'f'.repeat(63) },
      { ...create, receiptKey: 'f'.repeat(65) }, { ...create, receiptKey: null },
      { ...create, email: 'private@example.test' }, { ...create, attachments: ['cv.pdf'] },
      { ...create, model: 'paid/model' }, { ...receipt, message: 'Unexpected private message' },
      { action: 'create', requestId, receiptKey, category: 'help', message: 'message', consent: true },
      { action: 'receipt', requestId },
    ]) expect(() => validateGuestSupport(input), JSON.stringify(input)).toThrow(ApiError);
  });

  it('stores a SHA-256 bearer hash and rate HMAC without returning the receipt, secret or network address', async () => {
    const hash = await supportHash(receiptKey);
    expect(hash).toBe(createHash('sha256').update(receiptKey).digest('hex'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(receiptKey);
    expect(await supportHash('e'.repeat(64))).not.toBe(hash);
    const ip = '192.0.2.4', secret = 'fictional-server-only-rate-secret';
    const rate = await supportRateHash(ip, secret);
    expect(rate).toBe(createHmac('sha256', secret).update(ip).digest('hex'));
    expect(rate).not.toContain(ip);
    expect(rate).not.toContain(secret);
    expect(await supportRateHash(ip, secret)).toBe(rate);
    expect(await supportRateHash('192.0.2.5', secret)).not.toBe(rate);
    expect(await supportRateHash(ip, 'a different secret')).not.toBe(rate);
    expect(await supportRateHash('X'.repeat(101), secret)).toBe(createHmac('sha256', secret).update('X'.repeat(100)).digest('hex'));
  });

  it('maps expected database failures and sanitizes all database details', () => {
    expect(guestSupportError(null)).toBeUndefined();
    for (const [code, status] of [
      ['GUEST_SUPPORT_INVALID', 400], ['GUEST_SUPPORT_CONFLICT', 409],
      ['GUEST_SUPPORT_LIMIT', 429], ['GUEST_SUPPORT_NOT_FOUND', 404],
    ] as const) {
      try {
        guestSupportError({ message: `${code}: private SQL details, ${receiptKey}` });
        expect.fail('The database failure must not appear successful.');
      } catch (error) {
        expect(error).toMatchObject({ status, code });
        expect((error as Error).message).not.toContain('private SQL');
        expect((error as Error).message).not.toContain(receiptKey);
      }
    }
    try {
      guestSupportError({ message: `Internal table failure ${receiptKey}` });
      expect.fail('Unknown database failures must fail closed.');
    } catch (error) {
      expect(error).toMatchObject({ status: 503, code: 'GUEST_SUPPORT_UNAVAILABLE' });
      expect((error as Error).message).not.toContain('Internal table');
      expect((error as Error).message).not.toContain(receiptKey);
    }
  });
});
