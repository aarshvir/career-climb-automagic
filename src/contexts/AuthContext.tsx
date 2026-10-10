import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { configurationError, supabase } from '@/integrations/supabase/client';
import { clearUserAuthCache, getGoogleOAuthOptions, isInIframe, getEnvironmentType } from '@/utils/authUtils';
import { readAuthSession } from '@/utils/authSession';

interface AuthResult { error?: string }
interface SignUpResult extends AuthResult { requiresEmailConfirmation?: boolean }

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  configurationError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string) => Promise<SignUpResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  dnsError: boolean;
  retryConnection: () => void;
  isRetrying: boolean;
  environment: string;
  inIframe: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

const authMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!configurationError);
  const [authError, setAuthError] = useState<string | null>(configurationError);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (configurationError) return;
    let active = true;
    let authRevision = 0;
    setLoading(true);

    // Register before reading persisted state. A later auth event must win over
    // a stale initial getSession response; no async SDK calls run in the callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      authRevision += 1;
      setSession(nextSession);
      setAuthError(null);
      setLoading(false);
    });
    const initialRevision = authRevision;
    void readAuthSession().then(nextSession => {
      if (!active || authRevision !== initialRevision) return;
      setSession(nextSession);
      setAuthError(null);
    }).catch(() => {
      if (!active || authRevision !== initialRevision) return;
      setSession(null);
      setAuthError('We could not restore your sign-in session. Please try signing in again.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [retryCount]);

  // Profile creation is owned by the database signup trigger. Signing in must
  // never overwrite an existing profile's plan, subscription or other metadata.
  const signInWithGoogle = useCallback(async () => {
    if (configurationError) throw new Error(configurationError);
    if (isInIframe()) throw new Error('Open JobVance in a full browser tab to continue with Google.');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: getGoogleOAuthOptions() });
    if (error) throw error;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (configurationError) return { error: configurationError };
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { error: error.message };
      if (!data.session) return { error: 'Sign-in did not complete. Please try again.' };
      setSession(data.session);
      setAuthError(null);
      return {};
    } catch (error) {
      return { error: authMessage(error, 'Sign-in failed. Please try again.') };
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    if (configurationError) return { error: configurationError };
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { emailRedirectTo: getGoogleOAuthOptions().redirectTo },
      });
      if (error) return { error: error.message };
      if (data.session) { setSession(data.session); setAuthError(null); }
      return { requiresEmailConfirmation: !data.session };
    } catch (error) {
      return { error: authMessage(error, 'Account creation failed. Please try again.') };
    }
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    if (configurationError) return { error: configurationError };
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/reset` });
      return error ? { error: error.message } : {};
    } catch (error) {
      return { error: authMessage(error, 'We could not send reset instructions. Please try again.') };
    }
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (configurationError) return { error: configurationError };
    try {
      if (!await readAuthSession()) return { error: 'This reset link is invalid or expired. Please request a new one.' };
      const { error } = await supabase.auth.updateUser({ password });
      return error ? { error: error.message } : {};
    } catch (error) {
      return { error: authMessage(error, 'Password update failed. Please request a new reset link.') };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (configurationError) { setSession(null); return; }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    clearUserAuthCache(session?.user.id);
    setSession(null);
    setAuthError(null);
  }, [session]);

  const retryConnection = useCallback(() => setRetryCount(count => count + 1), []);
  const value = useMemo(() => ({
    user: session?.user ?? null, session, loading, authError, configurationError,
    signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, updatePassword, signOut,
    dnsError: false, retryConnection, isRetrying: false,
    environment: getEnvironmentType(), inIframe: isInIframe(),
  }), [session, loading, authError, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, updatePassword, signOut, retryConnection]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
