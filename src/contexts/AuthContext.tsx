import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
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
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existingProfile) {
        await supabase.from('profiles').insert({
          id: user.id,
          email: user.email!,
          full_name: user.user_metadata.full_name || user.user_metadata.name,
          avatar_url: user.user_metadata.avatar_url,
          subscription_plan: 'starter',
          subscription_status: 'inactive'
        })
      }
    } catch (error) {
      console.warn('Error creating user profile:', error)
    }
  }

  const signInWithGoogle = async () => {
    try {
      // Use absolute URL to avoid DNS resolution issues
      const redirectUrl = 'https://jobvance.io/auth/callback'
      
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
        throw error
      }
    } catch (error) {
      console.error('Sign in failed:', error)
      throw error
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
    signOut
  }), [user, session, loading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}