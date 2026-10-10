import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'

const AuthErrorHandler = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    const error = searchParams.get('error')
    const authSuccess = searchParams.get('auth')

    if (error) {
      let errorMessage = 'Authentication failed. Please try again.'
      
      switch (error) {
        case 'auth_failed':
          errorMessage = 'Authentication failed. Please check your connection and try again.'
          break
        case 'no_session':
          errorMessage = 'Sign in was not completed. Please try again.'
          break
        case 'callback_failed':
          errorMessage = 'There was a problem completing your sign in. Please try again.'
          break
        case 'dns_error':
          errorMessage = 'Connection issue detected. Please check your internet connection or try using a different DNS (like 8.8.8.8).'
          break
        case 'popup_blocked':
          errorMessage = 'Sign-in popup was blocked. Please allow popups for this site and try again.'
          break
        case 'iframe_restriction':
          errorMessage = 'Authentication restricted in preview mode. Try opening in a new tab for full functionality.'
          break
      }

      toast({
        title: 'Sign In Error',
        description: errorMessage,
        variant: 'destructive',
      })

      // Clear error from URL
      searchParams.delete('error')
      setSearchParams(searchParams, { replace: true })
    }

    if (authSuccess === 'success') {
      toast({
        title: 'Welcome!',
        description: 'You have successfully signed in.',
      })

      // Clear success from URL
      searchParams.delete('auth')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, toast])

  return null
}

export default AuthErrorHandler