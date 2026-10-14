import { beforeEach, describe, expect, it } from 'vitest';
import { isSavedCheckContinuationPath, readSavedCheckContinuation, savedCheckContinuationPath } from '@/lib/saved-check-continuation';
import { accountDestination, rememberLoopReturn, takeLoopReturn } from '@/lib/account-return';

const id = 'afe62064-a331-4ce6-9e51-2849e091ba54';
const path = `/loop?fromCheck=${id}`;
describe('saved check selection through sign-in', () => {
  beforeEach(() => sessionStorage.clear());
  it('carries only an opaque selection, once, through the existing sign-in return', () => {
    expect(savedCheckContinuationPath(id)).toBe(path);
    expect(readSavedCheckContinuation(`?fromCheck=${id}`)).toBe(id);
    expect(accountDestination(path)).toBe(path);
    rememberLoopReturn(path, 1000);
    const stored = JSON.parse(sessionStorage.getItem('jobvance_account_return_v1')!);
    expect(Object.keys(stored).sort()).toEqual(['expiresAt', 'path']);
    expect(takeLoopReturn(1001)).toBe(path);
    expect(takeLoopReturn(1002)).toBeNull();
  });
  it('expires the same way as other account-return choices', () => {
    rememberLoopReturn(path, 1000);
    expect(takeLoopReturn(1801000)).toBeNull();
  });
  it.each([
    `/loop?fromCheck=${id}&fromCheck=${id}`, `/loop?fromCheck=${id}&next=//evil.test`,
    `/loop?fromCheck=${id}#token`, `/loop?fromCheck=${id}&cv=private`,
    '/loop?fromCheck=owner@example.test', '/loop?fromCheck=../admin',
    `https://evil.test${path}`, `/loop/../loop?fromCheck=${id}`,
    `/loop?fromCheck=%61${id.slice(1)}`, '/loop?fromCheck=',
  ])('rejects noncanonical selector %s', value => {
    expect(isSavedCheckContinuationPath(value)).toBe(false);
    expect(accountDestination(value)).toBe('/dashboard');
    rememberLoopReturn(value, 1000);
    expect(takeLoopReturn(1001)).toBeNull();
  });
  it('does not make an unsafe ID into a link', () => {
    for (const value of ['x', id + '&source=original', '', '../private', 'alex@example.test']) expect(savedCheckContinuationPath(value)).toBeNull();
    expect(isSavedCheckContinuationPath(null)).toBe(false);
  });
});
