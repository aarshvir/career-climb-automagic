import { beforeEach, describe, expect, it } from 'vitest';
import { accountDestination, rememberLoopReturn, takeLoopReturn, workspaceReturnPath } from '@/lib/account-return';

describe('account destinations', () => {
  beforeEach(() => sessionStorage.clear());
  it('accepts only fixed in-app routes', () => {
    expect(accountDestination('/loop')).toBe('/loop');
    expect(accountDestination('/check')).toBe('/check');
    for (const value of ['https://evil.example', '//evil.example', '/loop?token=x', '/loop/../admin', null]) expect(accountDestination(value)).toBe('/loop');
  });
  it('consumes a fresh return once and expires it', () => {
    rememberLoopReturn('/loop', 1000);
    expect(takeLoopReturn(1001)).toBe('/loop');
    expect(takeLoopReturn(1001)).toBeNull();
    rememberLoopReturn('/loop', 1000);
    expect(takeLoopReturn(1801000)).toBeNull();
  });
  it('normalizes an old generic dashboard return to Job Loop without losing explicit tabs', () => {
    expect(accountDestination('/dashboard')).toBe('/loop');
    rememberLoopReturn('/dashboard', 1000);
    expect(takeLoopReturn(1001)).toBe('/loop');
    expect(takeLoopReturn(1002)).toBeNull();
  });
  it('carries only a fixed audience preference through sign-in', () => {
    for (const audience of ['student', 'mba', 'professional']) {
      const path = `/loop?audience=${audience}`;
      expect(accountDestination(path)).toBe(path);
      rememberLoopReturn(path, 1000);
      expect(takeLoopReturn(1001)).toBe(path);
    }
    for (const path of ['/loop?audience=executive', '/loop?audience=mba&next=https://evil.example', '/loop?audience=mba#token', '/loop?email=private@example.test']) expect(accountDestination(path)).toBe('/loop');
  });
  it('rejects tampered paths and clears an old loop return for other sign-ins', () => {
    sessionStorage.setItem('jobvance_account_return_v1', JSON.stringify({ path: '//evil.example', expiresAt: 2000 }));
    expect(takeLoopReturn(1000)).toBeNull();
    rememberLoopReturn('/loop', 1000);
    rememberLoopReturn('/check', 1001);
    expect(takeLoopReturn(1002)).toBe('/check');
    rememberLoopReturn('/onboarding', 1003);
    expect(takeLoopReturn(1004)).toBe('/onboarding');
    rememberLoopReturn('/loop', 1005);
    rememberLoopReturn('/onboarding?email=private@example.test', 1006);
    expect(takeLoopReturn(1007)).toBeNull();
  });
  it('accepts only bounded administration return routes, preserving the evidence range', () => {
    for (const path of ['/admin', '/admin2', '/admin?days=7', '/admin2?days=30', '/admin2?days=90']) {
      expect(accountDestination(path)).toBe(path); rememberLoopReturn(path, 1000); expect(takeLoopReturn(1001)).toBe(path);
    }
    for (const path of ['/admin?days=365', '/admin2?days=30&next=https://evil.example', '/admin?role=owner', '/admin#token', '/admin/../dashboard']) expect(accountDestination(path)).toBe('/loop');
  });
  it('preserves only fixed workspace tabs through an expiring, single-use return', () => {
    for (const path of ['/dashboard?tab=cv', '/dashboard?tab=tailor', '/dashboard?tab=tracker', '/dashboard?tab=billing']) {
      expect(accountDestination(path)).toBe(path);
      rememberLoopReturn(path, 1000);
      expect(takeLoopReturn(1001)).toBe(path);
      expect(takeLoopReturn(1002)).toBeNull();
    }
    rememberLoopReturn('/dashboard?tab=tracker', 1000);
    expect(takeLoopReturn(1801000)).toBeNull();
    for (const path of ['/dashboard?tab=unknown', '/dashboard?tab=tracker&next=//evil.example', '/dashboard?tab=tracker#token', '/dashboard?tab=tracker&tab=billing', '//evil.example/dashboard?tab=tracker']) {
      expect(accountDestination(path)).toBe('/loop');
      rememberLoopReturn(path, 1000);
      expect(takeLoopReturn(1001)).toBeNull();
    }
  });
  it('normalizes a protected workspace request without retaining unrelated query data', () => {
    for (const tab of ['cv', 'tailor', 'tracker', 'billing']) expect(workspaceReturnPath(`?tab=${tab}`)).toBe(`/dashboard?tab=${tab}`);
    expect(workspaceReturnPath('?email=private@example.test&tab=tracker&next=https://evil.example')).toBe('/dashboard?tab=tracker');
    for (const search of ['', '?tab=', '?tab=unknown', '?tab=tracker&tab=billing', '?tab=tracker%23token', '?tab=%2F%2Fevil.example']) expect(workspaceReturnPath(search)).toBe('/loop');
  });
});
