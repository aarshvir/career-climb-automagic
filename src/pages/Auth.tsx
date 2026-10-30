import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { RunCard } from '@/components/marketing/ProductCards';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Check, Loader2, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { isValidEmail, validatePassword, authRateLimiter } from '@/lib/security';
import { accountDestination, rememberLoopReturn } from '@/lib/account-return';
import { trackingAuthEpoch } from '@/lib/tracking-draft-memory';
import { detectInAppBrowser } from '@/lib/in-app-browser';
import { ContactFields } from '@/components/ContactDetails';
import { blankContact, checkContact } from '@/lib/contact-details';
import './AccountPilot.css';

const Auth = ({ embedded = false, onBeforeGoogle }: { embedded?: boolean; onBeforeGoogle?: () => boolean }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, authError, configurationError, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(searchParams.get('mode') === 'signup' ? 'sign-up' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [contact, setContact] = useState(() => blankContact());
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const socialBrowser = detectInAppBrowser();
  const loopEntry = !embedded && accountDestination(searchParams.get('next')) === '/onboarding';
  const fieldId = useId();
  // Only the newly submitted signup is retained, in this mounted tab for ten minutes.
  // Continuation is deliberate; focus/visibility never starts a password login.
  const pending = useRef<{ email:string; password:string; expiresAt:number; epoch:number } | null>(null);
  const alive = useRef(true), continuing = useRef(false), attempt = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; pending.current = null; attempt.current++; }; }, []);
  useEffect(() => { if (user || authLoading || authError) { pending.current = null; attempt.current++; } }, [user, authLoading, authError]);

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
    const details = mode === 'sign-up' ? checkContact(contact) : null;
    if (typeof details === 'string') { setError(details); return; }
    if (mode === 'sign-up') {
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
      const validation = validatePassword(password);
      if (!validation.valid) { setError(validation.errors.join('. ')); return; }
    }
    setBusy(true);
    const turn = ++attempt.current, epoch = trackingAuthEpoch();
    try {
      if (!embedded && mode === 'sign-up') rememberLoopReturn(searchParams.get('next'));
      if (mode === 'sign-up') {
        const result = await signUpWithEmail(email, password, details ?? undefined);
        if (!alive.current || attempt.current !== turn || trackingAuthEpoch() !== epoch) return;
        if (result.error) setError(result.error);
        else if (result.requiresEmailConfirmation) {
          pending.current = { email:email.trim(), password, expiresAt:Date.now()+10*60*1000, epoch };
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
    if (socialBrowser) { setError('Open this page in Safari or Chrome to continue with Google. You can also use email and password here.'); return; }
    if (onBeforeGoogle && !onBeforeGoogle()) return;
    rememberLoopReturn(embedded ? null : searchParams.get('next'));
    setError('');
    setBusy(true);
    try { await signInWithGoogle(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Google sign-in could not be started.'); }
    finally { setBusy(false); }
  };

  const changeMode = () => {
    pending.current = null; attempt.current++;
    setMode(current => current === 'sign-in' ? 'sign-up' : 'sign-in');
    setError('');
    setConfirmationSent(false);
    setPassword('');
    setConfirmPassword('');
  };

  async function continueSignup() {
    if (busy || continuing.current || configurationError || authLoading || authError || user) return;
    const details = pending.current;
    if (!details || details.epoch !== trackingAuthEpoch() || details.expiresAt <= Date.now()) {
      pending.current = null; setConfirmationSent(false); setMode('sign-in');
      setError('Sign in with your email and password to continue. Your setup destination is unchanged.'); return;
    }
    continuing.current = true; setBusy(true); setError('');
    const turn = ++attempt.current;
    try {
      const result = await signInWithEmail(details.email, details.password);
      if (!alive.current || pending.current !== details || attempt.current !== turn) return;
      if (result.error) setError(/confirm/i.test(result.error) ? 'Your email is not confirmed yet. Open the confirmation email, then return and continue.' : result.error);
      else pending.current = null;
    } catch { if (alive.current && pending.current === details && attempt.current === turn) setError('We could not connect. Please try again.'); }
    finally { continuing.current = false; if (alive.current) setBusy(false); }
  }

  async function copyBrowserLink() {
    const target = new URL('/auth', window.location.origin);
    target.searchParams.set('next', accountDestination(searchParams.get('next')));
    if (mode === 'sign-up') target.searchParams.set('mode', 'signup');
    try { await navigator.clipboard.writeText(target.href); setCopied(true); }
    catch { setError('Use this app’s menu to open this page in Safari or Chrome.'); }
  }

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
        <p className="ap-eyebrow"><span className="ap-dot" aria-hidden="true" /> AUTOMATED JOB LOOP</p>
        <h2 id={`${fieldId}-story`}>{mode === 'sign-up' || loopEntry ? <>Set up your Automated Job Loop <span>in minutes.</span></> : <>Keep your CVs and applications <span>together.</span></>}</h2>
        <p className="ap-story-description">Choose your roles and locations once. Automated Job Loop finds the best-matching jobs and prepares a tailored, role-specific CV for each.</p>
        <div className="ap-story-card"><RunCard /></div>
        <p className="ap-story-footnote"><LockKeyhole size={16} aria-hidden="true" /> Choose what you save in your account.</p>
        <Link to="/job-loop" className="ap-story-link">See how the Automated Job Loop works <ArrowRight size={17} aria-hidden="true" /></Link>
      </aside>}
      <div className="ap-auth-panel">
        <div className="ap-auth-heading">
          {!embedded && <p className="ap-eyebrow">{loopEntry ? 'YOUR AUTOMATED JOB LOOP STARTS HERE' : 'YOUR JOBVANCE WORKSPACE'}</p>}
          <Title>{confirmationSent ? 'Check your email' : mode === 'sign-up' ? 'Create your Jobvance account' : 'Sign in to Jobvance'}</Title>
          {!(loopEntry && !confirmationSent) && <p>{confirmationSent ? 'Confirm your email to finish creating your account.' : embedded ? 'Sign in here to save your reviewed check privately.' : 'Keep your reviewed CVs and applications in one place.'}</p>}
          {loopEntry && !confirmationSent && <div className="ap-loop-entry">
            <ul className="ap-benefits" aria-label="What the Automated Job Loop does">
              <li><Check size={18} aria-hidden="true" /><span><strong>Roles matched to your CV.</strong> Each run searches the employer job boards we cover for the roles you choose.</span></li>
              <li><Check size={18} aria-hidden="true" /><span><strong>A tailored CV for each role.</strong> Built only from facts you confirm. Nothing is invented.</span></li>
              <li><Check size={18} aria-hidden="true" /><span><strong>Built for a high ATS match.</strong> Role-specific CVs written to fit each job’s requirements.</span></li>
            </ul>
            <p className="ap-benefits-price">Automated Job Loop plans from US$29/month. <Link to="/pricing">See plans</Link> · <Link to="/job-loop">How it works</Link></p>
            <p className="ap-benefits-free">Your account also includes 3 AI-tailored CVs a month, free.</p>
            <details className="ap-steps"><summary>What happens after you sign up</summary><ol aria-label="After creating your account"><li>Add your CV and search preferences</li><li>Review your facts, then run your first search</li><li>Review your results; choose a schedule when ready</li></ol></details>
          </div>}
        </div>
        <div className="ap-auth-content">
          {visibleError && <Alert variant="destructive" role="alert" id={`${fieldId}-error`} className="ap-auth-alert"><AlertDescription>{visibleError}</AlertDescription></Alert>}
          {resetSent && <p role="status" className="ap-auth-notice">If this email has an account, reset instructions were requested. Open the link in a separate tab, then sign in here to keep this CV check open.</p>}
          {socialBrowser && <div className="ap-auth-notice" role="note"><strong>You’re in an app’s browser.</strong><p>For Google sign-in, use the app’s menu to open this page in Safari or Chrome. Email and password are available here. If your confirmation email opens another browser, return here and sign in with your password after confirming.</p>{!embedded && <Button type="button" variant="outline" onClick={() => void copyBrowserLink()}>{copied ? 'Link copied' : 'Copy sign-in link'}</Button>}</div>}
          {confirmationSent ? (
            <div className="ap-confirmation">
              <p role="status">If this address can be registered, confirmation instructions will be sent to <strong>{email.trim()}</strong>. Check your spam folder. Open the link in this browser when possible.</p>
              <p>If the email opens a different browser, confirm there, then return here and press Continue. After ten minutes or a page reload, sign in with your password instead. If you already have an account, sign in or reset your password.</p>
              <Button className="ap-primary ap-auth-submit" disabled={busy} onClick={() => void continueSignup()}>{busy ? 'Checking…' : "I’ve confirmed my email, continue"}</Button>
              <Button variant="link" disabled={busy} onClick={changeMode}>Back to sign in <ArrowRight size={16} aria-hidden="true" /></Button>
            </div>
          ) : (
            <>
              {!socialBrowser && <Button type="button" variant="outline" className="ap-google-button" onClick={handleGoogle} disabled={busy || !!configurationError}>
                <svg className="ap-google-mark" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.81Z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28v-3.1H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.1Z"/><path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z"/></svg>
                Continue with Google
              </Button>}
              {!socialBrowser && <div className="ap-auth-divider"><span>or use your email and password</span></div>}
              <form className="ap-auth-form" onSubmit={handleSubmit}>
                {mode === 'sign-up' && <ContactFields value={contact} onChange={setContact} disabled={busy} />}
                <div className="ap-field">
                  <Label htmlFor={`${fieldId}-email`}>Email address</Label>
                  <Input id={`${fieldId}-email`} type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={visibleError ? true : undefined} aria-describedby={visibleError ? `${fieldId}-error` : undefined} value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} />
                </div>
                <div className="ap-field">
                  <Label htmlFor={`${fieldId}-password`}>Password</Label>
                  <div className="ap-password-field">
                    <Input id={`${fieldId}-password`} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} aria-invalid={visibleError ? true : undefined} aria-describedby={[mode === 'sign-up' ? `${fieldId}-password-help` : '', visibleError ? `${fieldId}-error` : ''].filter(Boolean).join(' ') || undefined} value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} />
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
        {!embedded && <p className="ap-auth-footnote"><LockKeyhole size={14} aria-hidden="true" /> Your account keeps your CVs, search preferences and applications together.</p>}
      </div>
    </Container>
  );
};

export default Auth;
