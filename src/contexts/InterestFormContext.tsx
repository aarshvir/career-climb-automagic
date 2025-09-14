import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface InterestFormContextType {
  showInterestForm: boolean
  setShowInterestForm: (show: boolean) => void
  hasShownFormForUser: boolean
}

const InterestFormContext = createContext<InterestFormContextType | undefined>(undefined)

export const useInterestForm = () => {
  const context = useContext(InterestFormContext)
  if (context === undefined) {
    throw new Error('useInterestForm must be used within an InterestFormProvider')
  }
  return context
}

export const InterestFormProvider = ({ children }: { children: React.ReactNode }) => {
  const [showInterestForm, setShowInterestForm] = useState(false)
  const [hasShownFormForUser, setHasShownFormForUser] = useState(false)
  const { user, loading } = useAuth()

  useEffect(() => {
    // Automatically show interest form for newly signed-in users
    if (user && !loading && !hasShownFormForUser) {
      // Check if this is a new session (user just signed in)
      const lastUserId = localStorage.getItem('last_user_id')
      
      if (!lastUserId || lastUserId !== user.id) {
        // New user session - show the interest form
        setTimeout(() => {
          setShowInterestForm(true)
          setHasShownFormForUser(true)
          localStorage.setItem('last_user_id', user.id)
        }, 500) // Small delay to ensure smooth UX
      } else {
        // Existing session - mark as already shown
        setHasShownFormForUser(true)
      }
    }
    
    // Reset state when user signs out
    if (!user && !loading) {
      setHasShownFormForUser(false)
      localStorage.removeItem('last_user_id')
    }
  }, [user, loading, hasShownFormForUser])

  return (
    <InterestFormContext.Provider value={{
      showInterestForm,
      setShowInterestForm,
      hasShownFormForUser
    }}>
      {children}
    </InterestFormContext.Provider>
  )
}
