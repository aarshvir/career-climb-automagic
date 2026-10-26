import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readAuthSession } from '@/utils/authSession';
import { configurationError } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { checkAuthReturnAvailable, takeCheckAuthReturn } from '@/lib/check-draft';
import { accountDestination, peekLoopReturn, takeLoopReturn } from '@/lib/account-return';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(configurationError);
  const [returnToCheck] = useState(checkAuthReturnAvailable);
  // A failed code exchange must not consume the original same-tab destination.
  const [returnPath] = useState(peekLoopReturn);
  const signInPath = returnPath ? `/auth?next=${encodeURIComponent(accountDestination(returnPath))}` : '/auth';
  useEffect(() => {
    let active = true;
    if (configurationError) return;
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (params.has('error') || hash.has('error')) {
      setError('Sign-in was cancelled or the email link expired. Please start again.');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    void readAuthSession().then(session => {
      if (!active) return;
      if (!session) { setError('We could not finish signing in from this link. If you confirmed your email in another browser, sign in with the password you chose. Otherwise, request a new confirmation link.'); return; }
      navigate(takeLoopReturn() ?? takeCheckAuthReturn(), { replace: true });
    }).catch(() => {
      if (active) setError('We could not complete sign-in. Please request a new link or try signing in again.');
    }).finally(() => {
      if (active && window.location.pathname === '/auth/callback') window.history.replaceState(null, '', window.location.pathname);
    });
    return () => { active = false; };
  }, [navigate, returnPath]);

  return (
    <main className="jv-account-utility min-h-[70vh] flex items-center justify-center p-4">
      <div className="jv-account-utility-card max-w-md text-center space-y-4 p-8">
        {error ? (
          <><h1 className="text-xl font-semibold">Continue signing in</h1><p role="alert">{error}</p>{returnToCheck && <Button onClick={() => navigate('/check', { replace: true })}>Return to your CV check</Button>}<Button variant={returnToCheck ? 'outline' : 'default'} onClick={() => navigate(signInPath, { replace: true })}>Sign in with email and password</Button></>
        ) : (
          <><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" aria-hidden="true" /><h1 className="text-xl font-semibold" role="status">Completing sign-in...</h1></>
        )}
      </div>
    </main>
  );
};
export default AuthCallback;

