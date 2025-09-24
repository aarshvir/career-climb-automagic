import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { useDNSConnectivity } from '@/hooks/useDNSConnectivity'
import DNSErrorDialog from '@/components/DNSErrorDialog'
import { useAuthRetry } from '@/hooks/useAuthRetry'
import { getGoogleOAuthOptions, isInIframe, getEnvironmentType } from '@/utils/authUtils'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<{error?: string}>
  signUpWithEmail: (email: string, password: string) => Promise<{error?: string}>
  resetPassword: (email: string) => Promise<{error?: string}>
  updatePassword: (password: string) => Promise<{error?: string}>
  checkEmailProvider: (email: string) => Promise<{
    exists: boolean
    providers: string[]
    hasEmailProvider: boolean
    hasGoogleProvider: boolean
    canSignIn: boolean
    shouldUseGoogle: boolean
  }>
  signOut: () => Promise<void>
  dnsError: boolean
  retryConnection: () => void
  isRetrying: boolean
  environment: string
  inIframe: boolean
}

type EmailProviderCheckResult = {
  exists: boolean
  providers: string[]
  hasEmailProvider: boolean
  hasGoogleProvider: boolean
  canSignIn: boolean
  shouldUseGoogle: boolean
}

const DEFAULT_PROVIDER_CHECK: EmailProviderCheckResult = {
  exists: false,
  providers: [],
  hasEmailProvider: false,
  hasGoogleProvider: false,
  canSignIn: false,
  shouldUseGoogle: false
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDNSDialog, setShowDNSDialog] = useState(false)
  
  const { dnsError, recheckConnectivity, isChecking } = useDNSConnectivity()
  const { executeWithRetry, isRetrying } = useAuthRetry()
  
  // Environment detection
  const environment = getEnvironmentType()
  const inIframe = isInIframe()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    }).catch((error: unknown) => {
      console.warn('Supabase connection failed:', error)
      setLoading(false)
    })

    // Listen for auth changes - CRITICAL: No async operations in callback
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      // Defer profile creation to prevent auth deadlock
      if (event === 'SIGNED_IN' && session?.user) {
        setTimeout(() => {
          createUserProfile(session.user)
        }, 0)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Separate function for profile creation to avoid auth deadlock
  const createUserProfile = async (user: User) => {
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email!,
        plan: 'free'
      }, {
        onConflict: 'id'
      })
    } catch (error: unknown) {
      console.warn('Error creating user profile:', error)
    }
  }

  const signInWithGoogle = useCallback(async () => {
    const attemptSignIn = async () => {
      console.log('Starting Google Sign-In process...', {
        environment,
        inIframe,
        hostname: window.location.hostname,
        origin: window.location.origin
      });

      // Check DNS connectivity before attempting auth
      if (dnsError) {
        setShowDNSDialog(true)
        throw new Error('DNS_CONNECTIVITY_ISSUE')
      }

      // Get optimal OAuth options based on environment
      const oauthOptions = getGoogleOAuthOptions()
      
      console.log('OAuth Options:', oauthOptions);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: oauthOptions
      })
      
      if (error) {
        console.error('Google OAuth Error:', {
          error,
          message: error.message,
          status: error.status,
          details: error
        })
        
        // Enhanced error handling for different error types
        if (error.message.includes('popup') || error.message.includes('blocked')) {
          throw new Error('POPUP_BLOCKED')
        }
        
        if (error.message.includes('fetch') || error.message.includes('network')) {
          setShowDNSDialog(true)
          throw new Error('NETWORK_ERROR')
        }
        
        if (error.message.includes('origin') || error.message.includes('redirect')) {
          throw new Error('REDIRECT_ERROR')
        }
        
        throw error
      }
      
      console.log('Google OAuth initiated successfully')
    }

    try {
      await executeWithRetry(
        attemptSignIn,
        inIframe ? 2 : 3, // Fewer retries in iframe environment
        'Google Sign-In failed. This might be due to popup blocking or iframe restrictions.'
      )
    } catch (error: unknown) {
      console.error('Final sign in failure:', error)

      // Show appropriate error dialog based on error type
      if (error instanceof Error) {
        if (error.message.includes('POPUP_BLOCKED')) {
          // Could show a specific popup blocked dialog here
          setShowDNSDialog(true)
        } else if (error.message.includes('DNS_CONNECTIVITY_ISSUE') || 
                   error.message.includes('NETWORK_ERROR') || 
                   error.message.includes('fetch')) {
          setShowDNSDialog(true)
        }
      }
      throw error
    }
  }, [dnsError, environment, executeWithRetry, inIframe])

  const retryConnection = useCallback(() => {
    recheckConnectivity()
    setShowDNSDialog(false)
  }, [recheckConnectivity])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Email sign in error:', error)
        return { error: error.message }
      }

      return {}
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sign in failed'
      console.error('Sign in failed:', error)
      return { error: message }
    }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });
      
      if (error) {
        console.error('Signup error:', error);
        return { error: error.message };
      }
      
      // Check if user was created and session established
      if (data.user && data.session) {
        console.log('Signup successful with immediate session:', data);
        // Session will be automatically set by onAuthStateChange
        return { error: undefined };
      } else if (data.user && !data.session) {
        console.log('User created but needs email confirmation');
        return { error: 'Please check your email to confirm your account before signing in.' };
      }
      
      return { error: undefined };
    } catch (error: unknown) {
      console.error('Signup exception:', error);
      return { error: 'An unexpected error occurred during signup' };
    } finally {
      setLoading(false);
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://jobvance.io'
      const redirectUrl = `${origin}/auth/reset`

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      })

      if (error) {
        console.error('Password reset error:', error)
        return { error: error.message }
      }

      return {}
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Password reset failed'
      console.error('Password reset failed:', error)
      return { error: message }
    }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password
      })
      
      if (error) {
        console.error('Password update error:', error)
        return { error: error.message }
      }

      return {}
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Password update failed'
      console.error('Password update failed:', error)
      return { error: message }
    }
  }, [])

  const checkEmailProvider = useCallback(async (email: string) => {
    try {
      const { data, error } = await supabase.functions.invoke<EmailProviderCheckResult>('check-email-provider', {
        body: { email }
      })

      if (error) {
        console.error('Error checking email provider:', error)
        return DEFAULT_PROVIDER_CHECK
      }

      return data ?? DEFAULT_PROVIDER_CHECK
    } catch (error: unknown) {
      console.error('Failed to check email provider:', error)
      return DEFAULT_PROVIDER_CHECK
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Error signing out:', error)
        throw error
      }
    } catch (error: unknown) {
      console.warn('Sign out failed:', error)
    }
  }, [])

  const value = useMemo(() => ({
    user,
    session,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    updatePassword,
    checkEmailProvider,
    signOut,
    dnsError,
    retryConnection,
    isRetrying,
    environment,
    inIframe
  }), [
    user,
    session,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    updatePassword,
    checkEmailProvider,
    signOut,
    dnsError,
    retryConnection,
    isRetrying,
    environment,
    inIframe
  ])

  return (
    <AuthContext.Provider value={value}>
      {children}
      <DNSErrorDialog
        open={showDNSDialog}
        onClose={() => setShowDNSDialog(false)}
        onRetry={retryConnection}
        isRetrying={isChecking}
      />
    </AuthContext.Provider>
  )
}
