import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { adminSessionScope } from './admin-api';

/** Render-time scope plus synchronous SDK epoch: a batched A→B→A event cannot revive cached PII. */
export function useAdminAuthority() {
  const { user, session, loading } = useAuth();
  const scope = adminSessionScope(session);
  const observed = useRef({ scope, epoch: 0 });
  const [, rerender] = useReducer(value => value + 1, 0);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const next = adminSessionScope(nextSession);
      if (event === 'SIGNED_OUT' || next !== observed.current.scope) {
        observed.current = { scope: next, epoch: observed.current.epoch + 1 };
        rerender();
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  const key = !loading && scope && scope === observed.current.scope && session?.user.id === user?.id ? `${observed.current.epoch}:${scope}` : null;
  const isCurrent = useCallback((expected: string) => `${observed.current.epoch}:${observed.current.scope}` === expected, []);
  return { userId: user?.id, authority: key, authLoading: loading, isCurrent };
}
