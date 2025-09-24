import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Mail, Lock, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

interface PasswordStrengthProps {
  password: string
}

const PasswordStrengthIndicator: React.FC<PasswordStrengthProps> = ({ password }) => {
  const getStrength = (password: string) => {
    let score = 0
    if (password.length >= 8) score++
    if (/[a-z]/.test(password)) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    return score
  }

  const strength = getStrength(password)
  const getStrengthText = () => {
    if (strength === 0) return ''
    if (strength <= 2) return 'Weak'
    if (strength <= 3) return 'Fair'
    if (strength <= 4) return 'Good'
    return 'Strong'
  }

  const getStrengthColor = () => {
    if (strength <= 2) return 'bg-destructive'
    if (strength <= 3) return 'bg-warning'
    if (strength <= 4) return 'bg-info'
    return 'bg-success'
  }

  if (!password) return null

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn("h-full transition-all duration-300", getStrengthColor())}
            style={{ width: `${(strength / 5) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{getStrengthText()}</span>
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1">
          {password.length >= 8 ? (
            <CheckCircle className="w-3 h-3 text-success" />
          ) : (
            <XCircle className="w-3 h-3 text-muted-foreground" />
          )}
          <span>At least 8 characters</span>
        </div>
        <div className="flex items-center gap-1">
          {/[A-Z]/.test(password) && /[a-z]/.test(password) ? (
            <CheckCircle className="w-3 h-3 text-success" />
          ) : (
            <XCircle className="w-3 h-3 text-muted-foreground" />
          )}
          <span>Mixed case letters</span>
        </div>
        <div className="flex items-center gap-1">
          {/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password) ? (
            <CheckCircle className="w-3 h-3 text-success" />
          ) : (
            <XCircle className="w-3 h-3 text-muted-foreground" />
          )}
          <span>Number or special character</span>
        </div>
      </div>
    </div>
  )
}

const Auth: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { 
    user, 
    loading: authLoading, 
    signInWithGoogle, 
    signInWithEmail, 
    signUpWithEmail, 
    checkEmailProvider 
  } = useAuth()

  const [mode, setMode] = useState<'email-entry' | 'sign-in' | 'sign-up'>('email-entry')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailChecking, setEmailChecking] = useState(false)
  const [passwordsMatch, setPasswordsMatch] = useState(true)

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/dashboard')
    }
  }, [user, authLoading, navigate])

  // Handle auth errors from URL params
  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      let message = 'Authentication failed. Please try again.'
      if (error === 'access_denied') {
        message = 'Access denied. Please try again or contact support.'
      }
      toast({
        title: 'Authentication Error',
        description: message,
        variant: 'destructive',
      })
    }
  }, [searchParams, toast])

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateEmail(email)) {
      setError('Please enter a valid email address')
      return
    }

    setError('')
    setEmailChecking(true)

    try {
      const result = await checkEmailProvider(email)
      
      if (result.shouldUseGoogle) {
        setError('Account exists with Google login. Please use "Continue with Google" to sign in.')
        setEmailChecking(false)
        return
      }
      
      if (result.exists && result.hasEmailProvider) {
        setMode('sign-in')
      } else if (result.exists && !result.hasEmailProvider) {
        setError('This email is associated with a social login. Please use the appropriate sign-in method.')
        setEmailChecking(false)
        return
      } else {
        setMode('sign-up')
      }
    } catch (error) {
      setError('Unable to verify email. Please try again.')
    } finally {
      setEmailChecking(false)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'sign-up') {
        if (password !== confirmPassword) {
          setError('Passwords do not match')
          setLoading(false)
          return
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters long')
          setLoading(false)
          return
        }

        const { error } = await signUpWithEmail(email, password)
        if (error) {
          setError(error)
        } else {
          toast({
            title: 'Account created successfully!',
            description: 'Welcome to JobVance! You are now signed in.',
          })
          // Don't navigate immediately - let the auth state change handle it
        }
      } else {
        const { error } = await signInWithEmail(email, password)
        if (error) {
          setError(error)
        } else {
          toast({
            title: 'Welcome back!',
            description: 'You have been signed in successfully.',
          })
          // Navigate will happen automatically via useEffect when user state changes
        }
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Authentication failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    try {
      await signInWithGoogle()
    } catch (error: unknown) {
      toast({
        title: 'Sign in failed',
        description: getErrorMessage(error, 'Unable to sign in with Google'),
        variant: 'destructive',
      })
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold gradient-text">Welcome to JobVance</h1>
          <p className="text-muted-foreground">
            {mode === 'sign-up' ? 'Create your account to get started' : 
             mode === 'sign-in' ? 'Welcome back! Sign in to continue' :
             'Sign in to your account or create a new one'}
          </p>
        </div>

        <Card className="premium-card border-0 shadow-lg">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-xl">
              {mode === 'sign-up' ? 'Create Account' : 
               mode === 'sign-in' ? 'Sign In' : 
               'Get Started'}
            </CardTitle>
            <CardDescription>
              {mode === 'sign-up' ? 'Enter your details to create your account' :
               mode === 'sign-in' ? 'Enter your credentials to access your account' :
               'Choose how you\'d like to continue'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {mode === 'email-entry' && (
              <>
                {/* Google OAuth Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  onClick={handleGoogleAuth}
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or continue with email</span>
                  </div>
                </div>

                {/* Email Entry Form */}
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-primary" 
                    disabled={emailChecking || !email}
                  >
                    {emailChecking ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      'Continue'
                    )}
                  </Button>
                </form>
              </>
            )}

            {(mode === 'sign-in' || mode === 'sign-up') && (
              <>
                <div className="text-sm text-center">
                  <span className="text-muted-foreground">Signing in as: </span>
                  <span className="font-medium">{email}</span>
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto text-xs ml-1"
                    onClick={() => {
                      setMode('email-entry')
                      setPassword('')
                      setConfirmPassword('')
                      setError('')
                    }}
                  >
                    Change
                  </Button>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    {mode === 'sign-up' && <PasswordStrengthIndicator password={password} />}
                  </div>

                  {mode === 'sign-up' && (
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                         <Input
                           id="confirmPassword"
                           type={showConfirmPassword ? 'text' : 'password'}
                           placeholder="Confirm your password"
                           value={confirmPassword}
                           onChange={(e) => {
                             setConfirmPassword(e.target.value)
                             setPasswordsMatch(e.target.value === password)
                           }}
                           className={cn(
                             "pl-10 pr-10",
                             confirmPassword && !passwordsMatch && "border-destructive focus-visible:ring-destructive"
                           )}
                           required
                         />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                         </Button>
                       </div>
                       {confirmPassword && !passwordsMatch && (
                         <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                       )}
                     </div>
                   )}

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                   <Button 
                     type="submit" 
                     className="w-full bg-gradient-primary" 
                     disabled={loading || (mode === 'sign-up' && (!passwordsMatch || password.length < 8))}
                   >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {mode === 'sign-up' ? 'Creating account...' : 'Signing in...'}
                      </>
                    ) : (
                      mode === 'sign-up' ? 'Create Account' : 'Sign In'
                    )}
                  </Button>

                  {mode === 'sign-in' && (
                    <div className="text-center">
                      <Button
                        type="button"
                        variant="link"
                        className="text-sm"
                        onClick={() => navigate('/auth/forgot-password')}
                      >
                        Forgot your password?
                      </Button>
                    </div>
                  )}
                </form>

                <Separator />

                <div className="text-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogleAuth}
                  >
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </Button>
                </div>

                <div className="text-center text-sm">
                  <span className="text-muted-foreground">
                    {mode === 'sign-up' ? 'Already have an account?' : 'Don\'t have an account?'}
                  </span>{' '}
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto font-medium"
                    onClick={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}
                  >
                    {mode === 'sign-up' ? 'Sign in' : 'Sign up'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          By continuing, you agree to our{' '}
          <Button variant="link" className="p-0 h-auto text-xs" asChild>
            <span>Terms of Service</span>
          </Button>{' '}
          and{' '}
          <Button variant="link" className="p-0 h-auto text-xs" asChild>
            <span>Privacy Policy</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default Auth;
