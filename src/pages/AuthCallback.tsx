import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'

const AuthCallback = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Auth callback error:', error)
          navigate('/?error=auth_failed')
          return
        }

        if (data.session) {
          // Successfully authenticated, redirect to home
          navigate('/?auth=success')
        } else {
          // No session found, redirect with error
          navigate('/?error=no_session')
        }
      } catch (error) {
        console.error('Auth callback failed:', error)
        navigate('/?error=callback_failed')
      }
    }

    handleAuthCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-foreground">Completing sign in...</h2>
        <p className="text-muted-foreground mt-2">Please wait while we complete your authentication.</p>
      </div>
    </div>
  )
}

export default AuthCallback