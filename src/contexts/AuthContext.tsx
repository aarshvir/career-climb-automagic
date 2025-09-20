import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { useDNSConnectivity } from '@/hooks/useDNSConnectivity'
import DNSErrorDialog from '@/components/DNSErrorDialog'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  dnsError: boolean
  retryConnection: () => void
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
    try {
      // Check DNS connectivity before attempting auth
      if (dnsError) {
        setShowDNSDialog(true)
        throw new Error('DNS_CONNECTIVITY_ISSUE')
      }

      // Use dynamic redirect URL for better compatibility
      const redirectUrl = `${window.location.origin}/auth/callback`
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      if (error) {
        console.error('Error signing in with Google:', error)
        
        // Check if error might be DNS-related
        if (error.message.includes('fetch') || error.message.includes('network')) {
          setShowDNSDialog(true)
        }
        throw error
      }
    } catch (error) {
      console.error('Sign in failed:', error)
      
      // Show DNS dialog for connectivity issues
      if (error instanceof Error && 
          (error.message.includes('DNS_CONNECTIVITY_ISSUE') || 
           error.message.includes('fetch') || 
           error.message.includes('NetworkError'))) {
        setShowDNSDialog(true)
      }
      throw error
    }
  }

  const retryConnection = () => {
    recheckConnectivity()
    setShowDNSDialog(false)
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
    signOut,
    dnsError,
    retryConnection
  }), [user, session, loading, dnsError])

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