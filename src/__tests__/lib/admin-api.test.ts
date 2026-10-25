import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAction } from '@/lib/admin-types';
import { adminSnapshot } from '../fixtures/admin-snapshot';
import { adminDashboard } from '../fixtures/admin-dashboard';
const sdk = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), invoke: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(), listeners: new Set<(event: string, session: unknown) => void>() }));
vi.mock('@/utils/authSession', () => ({ readAuthSession: sdk.session }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: sdk.getUser, onAuthStateChange: sdk.onAuthStateChange }, functions: { invoke: sdk.invoke } } }));
import { adminRange, callAdmin } from '@/lib/admin-api';
const token = (sessionId = 'session-a', version = 1, owner = 'owner-a') => `header.${btoa(JSON.stringify({ sub: owner, session_id: sessionId === 'session-a' ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002', version }))}.signature`;
const session = (owner = 'owner-a', sessionId = 'session-a', version = 1) => ({ user: { id: owner }, access_token: token(sessionId, version, owner) });
const emit = (event: string, value: unknown) => sdk.listeners.forEach(listener => listener(event, value));
beforeEach(() => {
  vi.clearAllMocks(); sdk.listeners.clear();
  sdk.onAuthStateChange.mockImplementation(listener => { sdk.listeners.add(listener); return { data: { subscription: { unsubscribe: () => { sdk.unsubscribe(); sdk.listeners.delete(listener); } } } }; });
  sdk.session.mockResolvedValue(session()); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null }); sdk.invoke.mockResolvedValue({ data: { snapshot: adminSnapshot() }, error: null });
});

describe('private administration API boundary', () => {
  it('uses the fixed first-party API with no caller-defined role, endpoint or key', async () => {
    const action = { action: 'snapshot', days: 30 } as const;
    await callAdmin('owner-a', { ...action, role: 'owner', userId: 'owner-b', key: 'SYNTHETIC_NOT_A_KEY', endpoint: 'https://invalid.example' } as unknown as AdminAction);
    expect(sdk.invoke).toHaveBeenCalledWith('jobvance-admin', { body: action, headers: { Authorization: `Bearer ${token()}` } });
  });
  it.each([[401, 'UNAUTHORIZED', 'unauthenticated'], [403, 'ADMIN_FORBIDDEN', 'forbidden'], [409, 'ADMIN_VERSION_CONFLICT', 'conflict']])('classifies HTTP %s without leaking private server fields', async (status, code, kind) => {
    sdk.invoke.mockResolvedValue({ data: null, error: { message: 'SYNTHETIC_PRIVATE_DEBUG', context: new Response(JSON.stringify({ code, error: 'SYNTHETIC_PRIVATE_DEBUG' }), { status: Number(status) }) } });
    await expect(callAdmin('owner-a', { action: 'snapshot', days: 30 })).rejects.toMatchObject({ kind });
    await expect(callAdmin('owner-a', { action: 'snapshot', days: 30 })).rejects.not.toThrow('SYNTHETIC_PRIVATE_DEBUG');
  });
  it('refuses a mismatched account before any private request', async () => { await expect(callAdmin('owner-b', { action: 'snapshot', days: 30 })).rejects.toMatchObject({ kind: 'unauthenticated' }); expect(sdk.invoke).not.toHaveBeenCalled(); });
  it('discards in-flight records after account change', async () => {
    let finish: (value: unknown) => void;
    sdk.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = callAdmin('owner-a', { action: 'snapshot', days: 30 });
    await vi.waitFor(() => expect(sdk.invoke).toHaveBeenCalledOnce());
    sdk.session.mockResolvedValue(session('owner-b')); sdk.getUser.mockResolvedValue({ data: { user: { id: 'owner-b' } }, error: null }); finish({ data: { snapshot: adminSnapshot() }, error: null });
    await expect(pending).rejects.toMatchObject({ kind: 'unauthenticated' });
  });
  it('requires the expected owner and range in the response', async () => {
    const snapshot = adminSnapshot(); snapshot.actor.id = 'owner-b'; sdk.invoke.mockResolvedValue({ data: { snapshot }, error: null });
    await expect(callAdmin('owner-a', { action: 'snapshot', days: 30 })).rejects.toMatchObject({ kind: 'unavailable' });
    snapshot.actor.id = 'owner-a'; snapshot.window.days = 7;
    await expect(callAdmin('owner-a', { action: 'snapshot', days: 30 })).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('retains unknown metrics and rejects malformed data instead of inventing zero counts', async () => {
    const result = await callAdmin('owner-a', { action: 'snapshot', days: 30 }); expect(result.snapshot.analytics.funnel[0].count).toBeNull(); expect(result.snapshot.analytics.revenue.recognizedUsd).toBeNull();
    sdk.invoke.mockResolvedValue({ data: { snapshot: { actor: { id: 'owner-a', role: 'owner' } } }, error: null });
    await expect(callAdmin('owner-a', { action: 'snapshot', days: 30 })).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it.each([51, 0, -1])('blocks invalid $%s controls before invocation', async cap => {
    const snapshot = adminSnapshot(); await expect(callAdmin('owner-a', { action: 'update_config', expectedVersion: 3, config: { ...snapshot.config, monthlyCapUsd: cap } })).rejects.toThrow(); expect(sdk.invoke).not.toHaveBeenCalled();
  });
  it('normalizes range to the fixed 7/30/90 choices', () => { expect(adminRange('7')).toBe(7); expect(adminRange('90')).toBe(90); for (const range of [null, '365', '0', 'https://evil.example']) expect(adminRange(range)).toBe(30); });
  it('returns support text only for the explicitly requested receipt and rejects a mismatched receipt response', async () => {
    const id = '00000000-0000-4000-8000-000000000001'; sdk.invoke.mockResolvedValue({ data: { supportDetail: { id, message: 'Fictional private support request.' } }, error: null });
    expect((await callAdmin('owner-a', { action: 'support_detail', id })).supportDetail.message).toBe('Fictional private support request.'); expect(sdk.invoke).toHaveBeenCalledWith('jobvance-admin', { body: { action: 'support_detail', id }, headers: { Authorization: `Bearer ${token()}` } });
    sdk.invoke.mockResolvedValue({ data: { supportDetail: { id: 'another-receipt', message: 'Fictional wrong receipt.' } }, error: null }); await expect(callAdmin('owner-a', { action: 'support_detail', id })).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it.each(['same-owner', 'A-B-A', 'sign-out-back-in'])('rejects an in-flight response after %s SDK authority changes even when the final owner matches', async transition => {
    let finish!: (value: unknown) => void;
    sdk.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = callAdmin('owner-a', { action: 'snapshot', days: 30 });
    await vi.waitFor(() => expect(sdk.invoke).toHaveBeenCalledOnce());
    if (transition === 'same-owner') { sdk.session.mockResolvedValue(session('owner-a', 'session-new')); emit('SIGNED_IN', session('owner-a', 'session-new')); }
    if (transition === 'A-B-A') { emit('SIGNED_IN', session('owner-b', 'session-b')); emit('SIGNED_IN', session()); }
    if (transition === 'sign-out-back-in') { emit('SIGNED_OUT', null); emit('SIGNED_IN', session()); }
    finish({ data: { snapshot: adminSnapshot() }, error: null });
    await expect(pending).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(sdk.listeners.size).toBe(0);
  });
  it('preserves a token refresh in the same SDK session', async () => {
    sdk.invoke.mockImplementation(async () => {
      sdk.session.mockResolvedValue(session('owner-a', 'session-a', 2)); emit('TOKEN_REFRESHED', session('owner-a', 'session-a', 2));
      return { data: { snapshot: adminSnapshot() }, error: null };
    });
    await expect(callAdmin('owner-a', { action: 'snapshot', days: 30 })).resolves.toHaveProperty('snapshot');
    expect(sdk.invoke.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token()}`);
    expect(sdk.listeners.size).toBe(0);
  });
  it('rejects a new same-owner session during the initial getUser verification before sending anything', async () => {
    sdk.getUser.mockImplementationOnce(async () => {
      sdk.session.mockResolvedValue(session('owner-a', 'new-session'));
      return { data: { user: { id: 'owner-a' } }, error: null };
    });
    await expect(callAdmin('owner-a', { action: 'snapshot', days: 30 })).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(sdk.invoke).not.toHaveBeenCalled(); expect(sdk.listeners.size).toBe(0);
  });
  it('captures and validates the original action before any authentication await', async () => {
    const action: AdminAction = { action: 'snapshot', days: 30 };
    sdk.session.mockImplementationOnce(async () => { action.days = 90; return session(); });
    await callAdmin('owner-a', action);
    expect(sdk.invoke.mock.calls[0][1].body).toEqual({ action: 'snapshot', days: 30 });
  });
  it('binds dashboard actor and range, and rejects a mixed receipt', async () => {
    const dashboard = adminDashboard();
    sdk.invoke.mockResolvedValue({ data: { dashboard }, error: null });
    await expect(callAdmin('owner-a', { action: 'dashboard', days: 30 })).resolves.toHaveProperty('dashboard');
    dashboard.actor.id = 'owner-b';
    await expect(callAdmin('owner-a', { action: 'dashboard', days: 30 })).rejects.toMatchObject({ kind: 'unavailable' });
    dashboard.actor.id = 'owner-a'; dashboard.window.days = 7;
    await expect(callAdmin('owner-a', { action: 'dashboard', days: 30 })).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('rejects a support save receipt for another request', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    sdk.invoke.mockResolvedValue({ data: { support: { id: 'other-request', status: 'resolved', version: 2 } }, error: null });
    await expect(callAdmin('owner-a', { action: 'update_support', id, expectedVersion: 1, status: 'resolved' })).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
