import { createContext, useContext, useEffect, useState, useMemo } from 'react'
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
  
  const { isSupabaseReachable, dnsError, recheckConnectivity, isChecking } = useDNSConnectivity()
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
    }).catch((error) => {
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
    } catch (error) {
      console.warn('Error creating user profile:', error)
    }
  }

  const signInWithGoogle = async () => {
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
    } catch (error) {
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
  }

  const retryConnection = () => {
    recheckConnectivity()
    setShowDNSDialog(false)
  }

  const signInWithEmail = async (email: string, password: string) => {
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
    } catch (error: any) {
      console.error('Sign in failed:', error)
      return { error: error.message || 'Sign in failed' }
    }
  }

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      })
      
      if (error) {
        console.error('Email sign up error:', error)
        return { error: error.message }
      }
      
      // Check if user is immediately confirmed (email confirmation disabled)
      if (data.user && data.session) {
        console.log('User signed up and logged in immediately')
      }
      
      return {}
    } catch (error: any) {
      console.error('Sign up failed:', error)
      return { error: error.message || 'Sign up failed' }
    }
  }

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/auth/reset`
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      })
      
      if (error) {
        console.error('Password reset error:', error)
        return { error: error.message }
      }
      
      return {}
    } catch (error: any) {
      console.error('Password reset failed:', error)
      return { error: error.message || 'Password reset failed' }
    }
  }

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password
      })
      
      if (error) {
        console.error('Password update error:', error)
        return { error: error.message }
      }
      
      return {}
    } catch (error: any) {
      console.error('Password update failed:', error)
      return { error: error.message || 'Password update failed' }
    }
  }

  const checkEmailProvider = async (email: string) => {
    try {
      const response = await supabase.functions.invoke('check-email-provider', {
        body: { email }
      })
      
      if (response.error) {
        console.error('Error checking email provider:', response.error)
        // Fallback to basic existence check
        return {
          exists: false,
          providers: [],
          hasEmailProvider: false,
          hasGoogleProvider: false,
          canSignIn: false,
          shouldUseGoogle: false
        }
      }
      
      return response.data
    } catch (error) {
      console.error('Failed to check email provider:', error)
      // Fallback
      return {
        exists: false,
        providers: [],
        hasEmailProvider: false,
        hasGoogleProvider: false,
        canSignIn: false,
        shouldUseGoogle: false
      }
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Error signing out:', error)
        throw error
      }
    } catch (error) {
      console.warn('Sign out failed:', error)
    }
  }

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
  }), [user, session, loading, dnsError, isRetrying, environment, inIframe])

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