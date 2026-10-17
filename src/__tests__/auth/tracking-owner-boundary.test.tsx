import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

vi.unmock('@/contexts/AuthContext');
const sdk = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: Session | null) => void),
  getSession: vi.fn(), signOut: vi.fn(), setOwner: vi.fn(),
}));
vi.mock('@/lib/tracking-draft-memory', () => ({ setTrackingDraftOwner: sdk.setOwner }));
vi.mock('@/integrations/supabase/client', () => ({
  configurationError: null,
  supabase: { auth: {
    initialize: vi.fn(async () => ({ error: null })),
    getSession: sdk.getSession,
    onAuthStateChange: (listener: typeof sdk.listener) => {
      sdk.listener = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
    signOut: sdk.signOut,
  } },
}));
const session = { user: { id: 'fictional-owner-a' }, access_token: 'fixture' } as Session;

beforeEach(() => {
  vi.clearAllMocks();
  sdk.listener = null;
  sdk.getSession.mockResolvedValue({ data: { session }, error: null });
  sdk.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe('tracking drafts follow confirmed auth ownership on every route', () => {
  it('passes the stable SDK session identity on same-owner sign-in and token refresh', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const secondId = '10000000-0000-4000-8000-000000000002';
    const token = (sessionId: string, suffix: string) => ({...session, access_token: 'header.' + btoa(JSON.stringify({sub:session.user.id,session_id:sessionId})) + '.' + suffix});
    sdk.getSession.mockResolvedValue({data:{session:token(id,'first')},error:null});
    const {result} = renderHook(useAuth,{wrapper:AuthProvider});
    await waitFor(() => expect(result.current.user?.id).toBe(session.user.id));
    expect(sdk.setOwner).toHaveBeenLastCalledWith(session.user.id,id);
    act(() => sdk.listener!('TOKEN_REFRESHED',token(id,'refreshed')));
    expect(sdk.setOwner).toHaveBeenLastCalledWith(session.user.id,id);
    act(() => sdk.listener!('SIGNED_IN',token(secondId,'new-session')));
    expect(sdk.setOwner).toHaveBeenLastCalledWith(session.user.id,secondId);
  });

  it('revokes the old owner synchronously on the SDK event, before React settles', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.user?.id).toBe(session.user.id));
    expect(sdk.setOwner).toHaveBeenLastCalledWith(session.user.id, null);
    act(() => {
      sdk.listener!('SIGNED_OUT', null);
      expect(sdk.setOwner).toHaveBeenLastCalledWith(null, null);
    });
    expect(result.current.user).toBeNull();
  });

  it('cannot reauthorize a stale initial session after a newer signed-out event', async () => {
    let finish!: (response: unknown) => void;
    sdk.getSession.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(sdk.getSession).toHaveBeenCalled());
    act(() => sdk.listener!('SIGNED_OUT', null));
    await act(async () => { finish({ data: { session }, error: null }); });
    expect(result.current.user).toBeNull();
    expect(sdk.setOwner.mock.calls).toEqual([[null, null]]);
  });

  it('does not treat unknown or failed bootstrap as confirmed sign-out', async () => {
    sdk.getSession.mockRejectedValue(new Error('fixture transport failed'));
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    expect(sdk.setOwner).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.authError).toBeTruthy());
    expect(sdk.setOwner).not.toHaveBeenCalled();
  });

  it('keeps draft authority when explicit sign-out fails and clears it on success', async () => {
    const { result } = renderHook(useAuth, { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.user?.id).toBe(session.user.id));
    sdk.setOwner.mockClear();
    sdk.signOut.mockResolvedValueOnce({ error: new Error('fixture sign-out failed') });
    await expect(result.current.signOut()).rejects.toThrow('fixture sign-out failed');
    expect(sdk.setOwner).not.toHaveBeenCalled();
    await act(async () => { await result.current.signOut(); });
    expect(sdk.setOwner).toHaveBeenLastCalledWith(null);
  });
});
