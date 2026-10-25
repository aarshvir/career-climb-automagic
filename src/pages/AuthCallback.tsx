import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readAuthSession } from '@/utils/authSession';
import { configurationError } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { checkAuthReturnAvailable, takeCheckAuthReturn } from '@/lib/check-draft';
import { takeLoopReturn } from '@/lib/account-return';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(configurationError);
  const [returnToCheck] = useState(checkAuthReturnAvailable);
  // A confirmation link carries a code only after Supabase has confirmed the address. If the
  // code cannot become a session here, the link was opened in a different browser.
  const [confirmedElsewhere, setConfirmedElsewhere] = useState(false);
  useEffect(() => {
    let active = true;
    if (configurationError) return;
    const params = new URLSearchParams(window.location.search);
    const hadCode = params.has('code');
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (params.has('error') || hash.has('error')) {
      setError('Sign-in was cancelled or the email link expired. Please start again.');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    void readAuthSession().then(session => {
      if (!active) return;
      if (!session) { if (hadCode) setConfirmedElsewhere(true); else setError('This sign-in link is invalid or expired. Please start again.'); return; }
      navigate(takeLoopReturn() ?? takeCheckAuthReturn(), { replace: true });
    }).catch(() => {
      if (active) setError('We could not complete sign-in. Please request a new link or try signing in again.');
    }).finally(() => {
      if (active && window.location.pathname === '/auth/callback') window.history.replaceState(null, '', window.location.pathname);
    });
    return () => { active = false; };
  }, [navigate]);

  return (
    <main className="jv-account-utility min-h-[70vh] flex items-center justify-center p-4">
      <div className="jv-account-utility-card max-w-md text-center space-y-4 p-8">
        {confirmedElsewhere ? (
          <><h1 className="text-xl font-semibold">Your email is confirmed</h1><p role="status">Go back to the app where you started, such as Instagram or Facebook, and you'll continue automatically.</p><p>Or sign in here with your email and password.</p><Button onClick={() => navigate('/auth', { replace: true })}>Sign in here</Button></>
        ) : error ? (
          <><h1 className="text-xl font-semibold">Sign-in could not be completed</h1><p role="alert">{error}</p>{returnToCheck && <Button onClick={() => navigate('/check', { replace: true })}>Return to your CV check</Button>}<Button variant={returnToCheck ? 'outline' : 'default'} onClick={() => navigate('/auth', { replace: true })}>Back to sign in</Button></>
        ) : (
          <><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" aria-hidden="true" /><h1 className="text-xl font-semibold" role="status">Completing sign-in...</h1></>
        )}
      </div>
    </main>
  );
};
export default AuthCallback;

