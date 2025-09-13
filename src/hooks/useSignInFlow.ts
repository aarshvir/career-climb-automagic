import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export const useSignInFlow = () => {
  const { user, signInWithGoogle } = useAuth()

  const handleSignInOrAction = useCallback(async (action: () => void) => {
    if (!user) {
      try {
        await signInWithGoogle()
      } catch (error) {
        console.error('Sign in failed:', error)
      }
      return
    }
    
    action()
  }, [user, signInWithGoogle])

  return { handleSignInOrAction, user }
}