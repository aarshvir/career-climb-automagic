import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { resetPassword, checkEmailExists } = useAuth()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateEmail(email)) {
      setError('Please enter a valid email address')
      return
    }

    setError('')
    setLoading(true)

    try {
      // First check if email exists
      const emailExists = await checkEmailExists(email)
      
      if (!emailExists) {
        setError('No account found with that email address')
        setLoading(false)
        return
      }

      // Send reset email
      const { error } = await resetPassword(email)
      
      if (error) {
        setError(error)
      } else {
        setEmailSent(true)
        toast({
          title: 'Reset email sent',
          description: 'Check your inbox for password reset instructions.',
        })
      }
    } catch (error: any) {
      setError(error.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-success/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-success" />
            </div>
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="text-muted-foreground">
              We've sent password reset instructions to{' '}
              <span className="font-medium">{email}</span>
            </p>
          </div>

          <Card className="premium-card border-0 shadow-lg">
            <CardContent className="pt-6 space-y-4">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setEmailSent(false)}
                  className="w-full"
                >
                  Try again
                </Button>
              </div>

              <div className="text-center">
                <Button
                  variant="link"
                  onClick={() => navigate('/auth')}
                  className="text-sm"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to sign in
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold gradient-text">Reset Password</h1>
          <p className="text-muted-foreground">
            Enter your email address and we'll send you instructions to reset your password.
          </p>
        </div>

        <Card className="premium-card border-0 shadow-lg">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-xl">Forgot Password</CardTitle>
            <CardDescription>
              We'll check if your email is registered and send reset instructions
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                disabled={loading || !email}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking email...
                  </>
                ) : (
                  'Send Reset Instructions'
                )}
              </Button>

              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => navigate('/auth')}
                  className="text-sm"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to sign in
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ForgotPassword