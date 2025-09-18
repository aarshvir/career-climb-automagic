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
    if (!user) {
      console.log('No user found, skipping form check')
      return
    }

    console.log('🔍 Checking existing form entry for user:', user.id)

    try {
      // With unique constraint, we can use maybeSingle() safely
      const { data, error } = await supabase
        .from('interest_forms')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      console.log('🔍 Database query result:', { data, error })

      if (error) {
        console.error('❌ Database error:', error)
        // On error, don't show form to be safe
        setHasFormEntry(true)
        setHasShownFormForUser(true)
        setShowInterestForm(false)
        return
      }

      if (!data) {
        // No entry found - user hasn't filled form yet
        console.log('✅ No form entry found, will show form for new user')
        setHasFormEntry(false)
        showFormForNewUser()
      } else {
        // Check if it's a real entry or just abandonment tracking
        const isRealEntry = data.name && 
                           data.name !== 'user dropped from dialog' && 
                           data.name !== 'Form abandoned'
        
        if (isRealEntry) {
          console.log('✅ Real form entry exists, NOT showing form')
          setHasFormEntry(true)
          setHasShownFormForUser(true)
          setShowInterestForm(false)
        } else {
          console.log('✅ Only abandonment entry exists, will show form for user')
          setHasFormEntry(false)
          showFormForNewUser()
        }
      }
    } catch (error) {
      console.error('❌ Error checking form entry:', error)
      // On error, don't show form to be safe
      setHasFormEntry(true)
      setHasShownFormForUser(true)
      setShowInterestForm(false)
    }
  }

  const showFormForNewUser = () => {
    console.log('🎯 showFormForNewUser called. hasShownFormForUser:', hasShownFormForUser)
    
    if (!hasShownFormForUser) {
      // Check localStorage for recent session to avoid showing immediately again
      const lastUserId = localStorage.getItem('last_user_id')
      const lastFormShown = localStorage.getItem('form_shown_timestamp')
      const now = Date.now()
      const oneHour = 60 * 60 * 1000 // 1 hour in milliseconds

      console.log('🎯 localStorage check:', { lastUserId, currentUserId: user?.id, lastFormShown })

      // Only show if it's a truly new session OR more than 1 hour has passed
      if (!lastUserId || lastUserId !== user?.id || 
          !lastFormShown || (now - parseInt(lastFormShown)) > oneHour) {
        
        console.log('🎯 Will show form after timeout')
        setTimeout(() => {
          console.log('🎯 Showing form now!')
          setShowInterestForm(true)
          setHasShownFormForUser(true)
          if (user) {
            localStorage.setItem('last_user_id', user.id)
            localStorage.setItem('form_shown_timestamp', now.toString())
          }
        }, 500) // Small delay to ensure smooth UX
      } else {
        console.log('🎯 Not showing form due to localStorage check')
        setHasShownFormForUser(true)
      }
    } else {
      console.log('🎯 Not showing form - already shown for this user')
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
