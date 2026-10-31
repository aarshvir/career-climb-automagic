import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import LoopOrbit from '@/components/marketing/LoopOrbit';
import { MiniRun } from '@/components/marketing/BrandCards';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Check, CircleAlert, Loader2, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { isValidEmail, validatePassword, authRateLimiter } from '@/lib/security';
import { accountDestination, rememberLoopReturn } from '@/lib/account-return';
import { trackingAuthEpoch } from '@/lib/tracking-draft-memory';
import { detectInAppBrowser } from '@/lib/in-app-browser';
import { trackMetaSignupSubmitted } from '@/lib/meta-pixel';
import { ContactFields } from '@/components/ContactDetails';
import { blankContact, normalizePhone, PHONE_ERROR, validName } from '@/lib/contact-details';
import './AccountPilot.css';

const Auth = ({ embedded = false, onBeforeGoogle }: { embedded?: boolean; onBeforeGoogle?: () => boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, authError, configurationError, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(searchParams.get('mode') === 'signup' ? 'sign-up' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [contact, setContact] = useState(() => blankContact());
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; email?: string; password?: string }>({});
  const clearField = (key: 'name' | 'phone' | 'email' | 'password') => setFieldErrors(current => current[key] ? { ...current, [key]: undefined } : current);
  const socialBrowser = detectInAppBrowser();
  const loopEntry = !embedded && accountDestination(searchParams.get('next')) === '/onboarding';
  // The free CV Check entry (next=/check) opens on its own promise, not the Automated Job Loop setup headline. Copy only.
  const checkEntry = !embedded && accountDestination(searchParams.get('next')) === '/check';
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
    // Native validation bubbles are transient and unannounced. Every failing field gets its own message, and focus moves to the first one.
    const form = event.currentTarget as HTMLFormElement;
    const found: typeof fieldErrors = {}, summary: string[] = [];
    if (!isValidEmail(email.trim())) { found.email = 'Please enter a valid email address.'; summary.push(found.email); }
    // One validation source: validName and normalizePhone (the same checks checkContact applies) decide each field, and their results are the details sent.
    // The mobile number is optional: blank is fine, but a number that is typed must be valid.
    const phoneTyped = mode === 'sign-up' && contact.phone.trim() !== '';
    const phone = phoneTyped ? normalizePhone(contact.phone, contact.countryCode) : null;
    const details = mode === 'sign-up' && validName(contact.name) && (phone || !phoneTyped) ? { fullName: contact.name.trim(), ...(phone && { phone }) } : null;
    if (mode === 'sign-up') {
      if (!validName(contact.name)) { found.name = 'Please enter your full name.'; summary.push(found.name); }
      if (phoneTyped && !phone) { found.phone = PHONE_ERROR; if (!found.name) summary.push(found.phone); }
    }
    if (!password) { found.password = mode === 'sign-up' ? 'Choose a password to continue.' : 'Enter your password to continue.'; summary.push(found.password); }
    else if (mode === 'sign-up') {
      // One password field with the show-password toggle and the rules beneath it; no second "confirm" box to retype on a phone.
      const validation = validatePassword(password);
      if (!validation.valid) { found.password = validation.errors.join('. '); summary.push(found.password); }
    }
    if (summary.length) {
      const invalid = Object.keys(found).length;
      setFieldErrors(found); setError(invalid > 1 ? `Please fix the ${invalid} highlighted fields below.` : summary[0] ?? Object.values(found)[0] ?? '');
      const target = found.name ? form.querySelector<HTMLElement>('input:not([type=hidden])') : found.phone ? form.querySelector<HTMLElement>('.ap-phone-field input') : found.email ? document.getElementById(`${fieldId}-email`) : document.getElementById(`${fieldId}-password`);
      target?.focus();
      return;
    }
    setFieldErrors({});
    // The limiter counts real attempts only: it runs once every field has passed, immediately before the network call (blank or wrong submits never use one up).
    if (!authRateLimiter.check(email.trim().toLowerCase())) { setError('Too many attempts. Please try again in a minute.'); return; }
    setBusy(true);
    const turn = ++attempt.current, epoch = trackingAuthEpoch();
    // A valid, real (not rate-limited) sign-up submit: one content-free funnel-intent signal per attempt, before the network call.
    // It never carries the form's values and does not touch CompleteRegistration, which still fires only for a confirmed new account.
    if (mode === 'sign-up') trackMetaSignupSubmitted(`${fieldId}:${turn}`);
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
    setFieldErrors({});
    setConfirmationSent(false);
    setPassword('');
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
  // The outcome card leads on the loop headline (onboarding entry and sign-up), never beside a different lead.
  const showBenefits = !embedded && !confirmationSent && (loopEntry || mode === 'sign-up');

  const Container = embedded ? 'section' : 'main';
  const Title = embedded ? 'h3' : 'h2';
  const pageTitle = checkEntry ? 'Start your free CV Check | Jobvance' : loopEntry || mode === 'sign-up' ? 'Set up your Automated Job Loop | Jobvance' : 'Sign in | Jobvance';
  return (
    <Container aria-label={embedded ? 'Save with your account' : undefined} className={`jv-account ${embedded ? 'jv-account--embedded' : 'jv-account--standalone'}`}>
      {!embedded && <Helmet><title>{pageTitle}</title><meta name="description" content={checkEntry ? 'Create your free Jobvance account to compare your CV with a job ad, review changes and download after you approve.' : 'Create your free Jobvance account, then set up your Automated Job Loop: choose roles and locations once and come back to matched jobs and tailored CVs.'} /><meta property="og:url" content={`https://jobvance.io${location.pathname}`} /><meta name="robots" content="noindex,nofollow" /></Helmet>}
      {!embedded && <aside className="ap-account-story jv-dark" aria-labelledby={`${fieldId}-story`}>
        <div className="ap-story-inner">
          <p className="ap-eyebrow"><span className="ap-dot" aria-hidden="true" />{checkEntry ? 'Free CV Check' : 'Automated Job Loop'}</p>
          <h1 id={`${fieldId}-story`}>{checkEntry ? <>Start your free <span>CV Check.</span></> : mode === 'sign-up' || loopEntry ? <>Set up your <span className="jv-nb">Automated Job Loop</span> <span>and let it run.</span></> : <>Keep your CVs and applications <span>together.</span></>}</h1>
          <p className="ap-story-description">{checkEntry ? 'Bring a CV and a job description, review the suggested changes and download your approved version.' : <>Choose your roles and locations once. <span className="jv-nb">Automated Job Loop</span> finds the best-matching jobs and prepares role-specific CVs from the facts you confirm.</>}</p>
          {showBenefits && <ul className="ap-story-ticks" aria-label="At a glance">{checkEntry ? <><li>Compare your CV with a job</li><li>Review every change</li><li>Download PDF, Word or text</li></> : <><li>Roles matched to your CV</li><li>CVs for matching roles</li><li>Review before you download</li></>}</ul>}
          {showBenefits && <p className="ap-story-free">Free account · 3 tailored CVs a month</p>}
          {!checkEntry && <MiniRun className="ap-story-run" />}
          <Link to="/job-loop" className="ap-story-link">See how the Automated Job Loop works <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
      </aside>}
      <div className="ap-auth-panel">
        <div className="ap-auth-heading">
          {!embedded && <p className="ap-eyebrow ap-eyebrow--form"><span className="ap-dot" aria-hidden="true" />{checkEntry ? 'Your free CV Check' : loopEntry ? 'Your Automated Job Loop' : 'Your Jobvance workspace'}</p>}
          <Title>{confirmationSent ? 'Check your email' : mode === 'sign-up' ? 'Create your Jobvance account' : 'Sign in to Jobvance'}</Title>
          {!showBenefits && <p>{confirmationSent ? 'Confirm your email to finish creating your account.' : embedded ? 'Sign in here to save your reviewed check privately.' : 'Keep your reviewed CVs and applications in one place.'}</p>}
          {/* A visitor from the free CV Check ad is told about the CV Check, never the Job Loop's outcome list. */}
          {showBenefits && checkEntry && <div className="ap-loop-entry ap-check-entry">
            <ul className="ap-benefits" aria-label="What the free CV Check does">
              <li><Check size={18} aria-hidden="true" /><span><strong>Compare your CV with a job ad.</strong><span className="ap-benefit-detail"> See which requirements it shows.</span></span></li>
              <li><Check size={18} aria-hidden="true" /><span><strong>Review every change.</strong><span className="ap-benefit-detail"> With AI, each change sits beside your original.</span></span></li>
              <li><Check size={18} aria-hidden="true" /><span><strong>Download after you approve.</strong><span className="ap-benefit-detail"> You tick that your CV is accurate first.</span></span></li>
            </ul>
            <p className="ap-benefits-free">Your account is free. Unlimited comparisons without AI. 3 free AI-tailored CVs per calendar month.</p>
          </div>}
          {showBenefits && !checkEntry && <div className="ap-loop-entry">
            <ul className="ap-benefits" aria-label="What the Automated Job Loop does">
              <li><Check size={18} aria-hidden="true" /><span><strong>Roles matched to your CV.</strong><span className="ap-benefit-detail"> Searches connected employer career sites.</span></span></li>
              <li><Check size={18} aria-hidden="true" /><span><strong>Tailored CVs for matching roles.</strong><span className="ap-benefit-detail"> Based on facts you confirm.</span></span></li>
              <li><Check size={18} aria-hidden="true" /><span><strong>Review before you download.</strong><span className="ap-benefit-detail"> Read and approve the prepared CV first.</span></span></li>
            </ul>
            <p className="ap-benefits-free">Your account also includes 3 AI-tailored CVs a month, free.</p>
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
              <form className="ap-auth-form" onSubmit={handleSubmit} noValidate>
                {mode === 'sign-up' && <ContactFields value={contact} onChange={next => { setContact(next); if (next.name !== contact.name) clearField('name'); if (next.phone !== contact.phone) clearField('phone'); }} disabled={busy} errors={fieldErrors} />}
                <div className="ap-field">
                  <Label htmlFor={`${fieldId}-email`}>Email address</Label>
                  <Input id={`${fieldId}-email`} type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={fieldErrors.email ? true : undefined} aria-describedby={fieldErrors.email ? `${fieldId}-email-error` : undefined} value={email} onChange={event => { setEmail(event.target.value); clearField('email'); }} required disabled={busy} />
                  {fieldErrors.email && <p id={`${fieldId}-email-error`} className="ap-field-error"><CircleAlert size={15} aria-hidden="true" />{fieldErrors.email}</p>}
                </div>
                <div className="ap-field">
                  <Label htmlFor={`${fieldId}-password`}>Password</Label>
                  <div className="ap-password-field">
                    <Input id={`${fieldId}-password`} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} aria-invalid={fieldErrors.password ? true : undefined} aria-describedby={[mode === 'sign-up' ? `${fieldId}-password-help` : '', fieldErrors.password ? `${fieldId}-password-error` : ''].filter(Boolean).join(' ') || undefined} value={password} onChange={event => { setPassword(event.target.value); clearField('password'); }} required disabled={busy} />
                    <Button type="button" variant="ghost" size="sm" className="ap-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(current => !current)}>
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </Button>
                  </div>
                  {fieldErrors.password && <p id={`${fieldId}-password-error`} className="ap-field-error"><CircleAlert size={15} aria-hidden="true" />{fieldErrors.password}</p>}
                  {mode === 'sign-up' && <p id={`${fieldId}-password-help`} className="ap-field-help">Use at least 8 characters, uppercase and lowercase letters, and a number.</p>}
                </div>
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
        {showBenefits && <div className="ap-loop-more">
          <p className="ap-benefits-price">Automated Job Loop plans from US$29/month.</p>
          <p className="ap-benefits-links"><Link to="/pricing">See plans</Link><Link to="/job-loop">How it works</Link></p>
          <details className="ap-steps"><summary>What happens after you sign up</summary><ol aria-label="After creating your account"><li>Add your CV and search preferences</li><li>Review your facts, then run your first search</li><li>Review your results; choose a schedule when ready</li></ol><p className="ap-steps-free">Includes 3 AI-tailored CVs a month, free.</p></details>
        </div>}
        {!embedded && <p className="ap-auth-footnote"><LockKeyhole size={14} aria-hidden="true" /> Your account keeps your CVs, search preferences and applications together.</p>}
      </div>
    </Container>
  );
};

export default Auth;
