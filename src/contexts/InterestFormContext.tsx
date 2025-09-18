import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

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
  const [hasFormEntry, setHasFormEntry] = useState<boolean | null>(null)
  const { user, loading } = useAuth()

  useEffect(() => {
    if (user && !loading) {
      checkExistingFormEntry()
    }
  }, [user, loading])

  const checkExistingFormEntry = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('interest_forms')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (error && error.code === 'PGRST116') {
        // No rows found - user hasn't filled form yet
        setHasFormEntry(false)
        showFormForNewUser()
      } else if (data) {
        // User has already filled the form
        setHasFormEntry(true)
        setHasShownFormForUser(true)
      }
    } catch (error) {
      console.error('Error checking form entry:', error)
      // On error, don't show form to be safe
      setHasFormEntry(true)
      setHasShownFormForUser(true)
    }
  }

  const showFormForNewUser = () => {
    if (!hasShownFormForUser) {
      // Check localStorage for recent session to avoid showing immediately again
      const lastUserId = localStorage.getItem('last_user_id')
      const lastFormShown = localStorage.getItem('form_shown_timestamp')
      const now = Date.now()
      const oneHour = 60 * 60 * 1000 // 1 hour in milliseconds

      // Only show if it's a truly new session OR more than 1 hour has passed
      if (!lastUserId || lastUserId !== user?.id || 
          !lastFormShown || (now - parseInt(lastFormShown)) > oneHour) {
        
        setTimeout(() => {
          setShowInterestForm(true)
          setHasShownFormForUser(true)
          if (user) {
            localStorage.setItem('last_user_id', user.id)
            localStorage.setItem('form_shown_timestamp', now.toString())
          }
        }, 500) // Small delay to ensure smooth UX
      } else {
        setHasShownFormForUser(true)
      }
    }
  }

  useEffect(() => {
    // Reset state when user signs out
    if (!user && !loading) {
      setHasShownFormForUser(false)
      setHasFormEntry(null)
      localStorage.removeItem('last_user_id')
      localStorage.removeItem('form_shown_timestamp')
    }
  }, [user, loading])

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
