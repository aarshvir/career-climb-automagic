import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Check, FileText, Loader2, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { isValidEmail, validatePassword, authRateLimiter } from '@/lib/security';
import { accountDestination, rememberLoopReturn } from '@/lib/account-return';
import './AccountPilot.css';

const Auth = ({ embedded = false, onBeforeGoogle }: { embedded?: boolean; onBeforeGoogle?: () => boolean }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, authError, configurationError, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(searchParams.get('mode') === 'signup' ? 'sign-up' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const fieldId = useId();

  useEffect(() => {
    if (user && !authLoading && !embedded) navigate(accountDestination(searchParams.get('next')), { replace: true });
  }, [user, authLoading, navigate, embedded, searchParams]);

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
    if (onBeforeGoogle && !onBeforeGoogle()) return;
    rememberLoopReturn(embedded ? null : searchParams.get('next'));
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

  const handleForgot = async () => {
    if (!embedded) { navigate('/auth/forgot-password'); return; }
    if (!isValidEmail(email.trim())) { setError('Enter your email above, then request a reset link. Your CV check stays open.'); return; }
    setBusy(true); setError('');
    try { const result = await resetPassword(email); if (result.error) setError(result.error); else setResetSent(true); }
    catch { setError('We could not request a reset link. Your CV check stays open.'); }
    finally { setBusy(false); }
  };

  if (authLoading) return (
    <div className={embedded ? 'ap-auth-loading ap-auth-loading--embedded' : 'ap-auth-loading'} role="status">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /><span className="sr-only">Checking sign-in...</span>
    </div>
  );

  const visibleError = configurationError || error || authError;

  const Container = embedded ? 'section' : 'main';
  const Title = embedded ? 'h3' : 'h1';
  return (
    <Container aria-label={embedded ? 'Save with your account' : undefined} className={`jv-account ${embedded ? 'jv-account--embedded' : 'jv-account--standalone'}`}>
      {!embedded && <aside className="ap-account-story" aria-labelledby={`${fieldId}-story`}>
        <p className="ap-eyebrow"><span className="ap-dot" aria-hidden="true" /> SAVE YOUR WORK FOR THE NEXT APPLICATION</p>
        <h2 id={`${fieldId}-story`}>Keep your CVs and applications <span>together.</span></h2>
        <p className="ap-story-description">Bring your actual experience to the next role. Review your wording, keep your versions, and decide what to share.</p>
        <div className="ap-document-scene" aria-label="Example CV review">
          <div className="ap-document-back" aria-hidden="true" />
          <div className="ap-document-sheet">
            <div className="ap-document-heading"><span className="ap-document-icon"><FileText size={20} aria-hidden="true" /></span><span>YOUR REVIEWED CV<br /><small>Example application</small></span><span className="ap-document-index">01</span></div>
            <div className="ap-document-lines" aria-hidden="true"><span /><span /><span /></div>
            <p className="ap-document-label">EXPERIENCE</p>
            <p className="ap-document-passage">Helped design a pilot, with projected savings.</p>
            <div className="ap-document-note"><Check size={16} aria-hidden="true" /><p>Your contribution stays clear.<br /><strong>Projected stays projected.</strong></p></div>
            <div className="ap-document-lines ap-document-lines--short" aria-hidden="true"><span /><span /></div>
          </div>
          <div className="ap-review-stamp"><Check size={16} aria-hidden="true" /> Reviewed by you</div>
        </div>
        <p className="ap-story-footnote"><LockKeyhole size={16} aria-hidden="true" /> Choose what you save in your account.</p>
        <Link to="/check" className="ap-story-link">Try the free CV check without an account <ArrowRight size={17} aria-hidden="true" /></Link>
      </aside>}
      <div className="ap-auth-panel">
        <div className="ap-auth-heading">
          {!embedded && <p className="ap-eyebrow">YOUR JOBVANCE WORKSPACE</p>}
          <Title>{confirmationSent ? 'Check your email' : mode === 'sign-up' ? 'Create your Jobvance account' : 'Sign in to Jobvance'}</Title>
          <p>{confirmationSent ? 'Confirm your email to finish creating your account.' : embedded ? 'Sign in here to save your reviewed check privately.' : 'Keep your reviewed CVs and applications in one place.'}</p>
        </div>
        <div className="ap-auth-content">
          {visibleError && <Alert variant="destructive" role="alert" className="ap-auth-alert"><AlertDescription>{visibleError}</AlertDescription></Alert>}
          {resetSent && <p role="status" className="ap-auth-notice">If this email has an account, reset instructions were requested. Open the link in a separate tab, then sign in here to keep this CV check open.</p>}
          {confirmationSent ? (
            <div className="ap-confirmation">
              <p role="status">If this address can be registered, confirmation instructions will be sent to <strong>{email.trim()}</strong>. Check your spam folder and open the link in this browser.</p>
              <p>After confirming, you can sign in below. If you already have an account, sign in or reset your password.</p>
              <Button className="ap-primary ap-auth-submit" onClick={changeMode}>Back to sign in <ArrowRight size={16} aria-hidden="true" /></Button>
            </div>
          ) : (
            <>
              <Button type="button" variant="outline" className="ap-google-button" onClick={handleGoogle} disabled={busy || !!configurationError}>
                <span className="ap-google-mark" aria-hidden="true">G</span>
                Continue with Google
              </Button>
              <div className="ap-auth-divider"><span>or use your email and password</span></div>
              <form className="ap-auth-form" onSubmit={handleSubmit}>
                <div className="ap-field">
                  <Label htmlFor={`${fieldId}-email`}>Email address</Label>
                  <Input id={`${fieldId}-email`} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} />
                </div>
                <div className="ap-field">
                  <Label htmlFor={`${fieldId}-password`}>Password</Label>
                  <div className="ap-password-field">
                    <Input id={`${fieldId}-password`} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} aria-describedby={mode === 'sign-up' ? `${fieldId}-password-help` : undefined} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} />
                    <Button type="button" variant="ghost" size="sm" className="ap-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(current => !current)}>
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </Button>
                  </div>
                  {mode === 'sign-up' && <p id={`${fieldId}-password-help`} className="ap-field-help">Use at least 8 characters, uppercase and lowercase letters, and a number.</p>}
                </div>
                {mode === 'sign-up' && <div className="ap-field">
                  <Label htmlFor={`${fieldId}-confirm`}>Confirm password</Label>
                  <Input id={`${fieldId}-confirm`} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required disabled={busy} />
                </div>}
                <Button type="submit" className="ap-primary ap-auth-submit" disabled={busy || !!configurationError}>
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Please wait...</> : <>{mode === 'sign-up' ? 'Create account' : 'Sign in'}<ArrowRight size={17} aria-hidden="true" /></>}
                </Button>
              </form>
              {mode === 'sign-in' && <Button type="button" variant="link" className="ap-auth-forgot" onClick={handleForgot} disabled={busy || !!configurationError}>Forgot your password?</Button>}
              <div className="ap-auth-switch">
                {mode === 'sign-up' ? 'Already have an account?' : 'New to Jobvance?'}{' '}
                <Button type="button" variant="link" className="ap-mode-link" onClick={changeMode} disabled={busy}>
                  {mode === 'sign-up' ? 'Sign in' : 'Create an account'}
                </Button>
              </div>
            </>
          )}
        </div>
        {!embedded && <p className="ap-auth-footnote"><LockKeyhole size={14} aria-hidden="true" /> Account saving is optional. Free CV checks need no account.</p>}
      </div>
    </Container>
  );
};

export default Auth;
