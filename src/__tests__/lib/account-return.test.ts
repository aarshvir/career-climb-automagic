import { beforeEach, describe, expect, it } from 'vitest';
import { accountDestination, rememberLoopReturn, takeLoopReturn } from '@/lib/account-return';

describe('account destinations', () => {
  beforeEach(() => sessionStorage.clear());
  it('accepts only fixed in-app routes', () => {
    expect(accountDestination('/loop')).toBe('/loop');
    expect(accountDestination('/check')).toBe('/check');
    for (const value of ['https://evil.example', '//evil.example', '/loop?token=x', '/loop/../admin', null]) expect(accountDestination(value)).toBe('/dashboard');
  });
  it('consumes a fresh return once and expires it', () => {
    rememberLoopReturn('/loop', 1000);
    expect(takeLoopReturn(1001)).toBe('/loop');
    expect(takeLoopReturn(1001)).toBeNull();
    rememberLoopReturn('/loop', 1000);
    expect(takeLoopReturn(1801000)).toBeNull();
  });
  it('carries only a fixed audience preference through sign-in', () => {
    for (const audience of ['student', 'mba', 'professional']) {
      const path = `/loop?audience=${audience}`;
      expect(accountDestination(path)).toBe(path);
      rememberLoopReturn(path, 1000);
      expect(takeLoopReturn(1001)).toBe(path);
    }
    for (const path of ['/loop?audience=executive', '/loop?audience=mba&next=https://evil.example', '/loop?audience=mba#token', '/loop?email=private@example.test']) expect(accountDestination(path)).toBe('/dashboard');
  });
  it('rejects tampered paths and clears an old loop return for other sign-ins', () => {
    sessionStorage.setItem('jobvance_account_return_v1', JSON.stringify({ path: '//evil.example', expiresAt: 2000 }));
    expect(takeLoopReturn(1000)).toBeNull();
    rememberLoopReturn('/loop', 1000);
    rememberLoopReturn('/check', 1001);
    expect(takeLoopReturn(1002)).toBeNull();
  });
});
