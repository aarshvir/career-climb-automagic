import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { isValidEmail, validatePassword, authRateLimiter } from '@/lib/security';

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, authError, configurationError, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(searchParams.get('mode') === 'signup' ? 'sign-up' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);

  useEffect(() => {
    if (user && !authLoading) navigate('/dashboard', { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (searchParams.get('error')) setError('Sign-in could not be completed. Please try again or request a new email link.');
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || configurationError) return;
    setError('');
    if (!isValidEmail(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (!authRateLimiter.check(email.trim().toLowerCase())) { setError('Too many attempts. Please try again in a minute.'); return; }
    if (mode === 'sign-up') {
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
      const validation = validatePassword(password);
      if (!validation.valid) { setError(validation.errors.join('. ')); return; }
    }
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        const result = await signUpWithEmail(email, password);
        if (result.error) setError(result.error);
        else if (result.requiresEmailConfirmation) {
          setConfirmationSent(true);
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const result = await signInWithEmail(email, password);
        if (result.error) setError(result.error);
      }
    } catch {
      setError('We could not connect. Please try again.');
    } finally { setBusy(false); }
  };

  const handleGoogle = async () => {
    if (busy || configurationError) return;
    setError('');
    setBusy(true);
    try { await signInWithGoogle(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Google sign-in could not be started.'); }
    finally { setBusy(false); }
  };

  const changeMode = () => {
    setMode(current => current === 'sign-in' ? 'sign-up' : 'sign-in');
    setError('');
    setConfirmationSent(false);
    setPassword('');
    setConfirmPassword('');
  };

  if (authLoading) return (
    <div className="min-h-[70vh] flex items-center justify-center" role="status">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /><span className="sr-only">Checking sign-in...</span>
    </div>
  );

  const visibleError = configurationError || error || authError;

  return (
    <main className="min-h-[75vh] flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>{confirmationSent ? 'Check your email' : mode === 'sign-up' ? 'Create your JobVance account' : 'Sign in to JobVance'}</CardTitle>
          <CardDescription>
            {confirmationSent ? 'Confirm your email to finish creating your account.' : 'Prepare a CV for a role and keep track of your applications.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {visibleError && <Alert variant="destructive" role="alert"><AlertDescription>{visibleError}</AlertDescription></Alert>}
          {confirmationSent ? (
            <div className="space-y-4">
              <p role="status">If this address can be registered, confirmation instructions will be sent to <strong>{email.trim()}</strong>. Check your spam folder and open the link in this browser.</p>
              <p className="text-sm text-muted-foreground">After confirming, you can sign in below. If you already have an account, sign in or reset your password.</p>
              <Button className="w-full" onClick={changeMode}>Back to sign in</Button>
            </div>
          ) : (
            <>
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={busy || !!configurationError}>
                Continue with Google
              </Button>
              <p className="text-center text-xs text-muted-foreground">or use your email and password</p>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} className="pr-12" required disabled={busy} />
                    <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(current => !current)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {mode === 'sign-up' && <p className="text-xs text-muted-foreground">Use at least 8 characters, uppercase and lowercase letters, and a number.</p>}
                </div>
                {mode === 'sign-up' && <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input id="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required disabled={busy} />
                </div>}
                <Button type="submit" className="w-full" disabled={busy || !!configurationError}>
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Please wait...</> : mode === 'sign-up' ? 'Create account' : 'Sign in'}
                </Button>
              </form>
              {mode === 'sign-in' && <Button type="button" variant="link" className="w-full" onClick={() => navigate('/auth/forgot-password')} disabled={busy}>Forgot your password?</Button>}
              <div className="text-center text-sm">
                {mode === 'sign-up' ? 'Already have an account?' : 'New to JobVance?'}{' '}
                <Button type="button" variant="link" className="p-0 h-auto" onClick={changeMode} disabled={busy}>
                  {mode === 'sign-up' ? 'Sign in' : 'Create an account'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default Auth;
