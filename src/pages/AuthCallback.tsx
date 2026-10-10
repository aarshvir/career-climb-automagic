import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readAuthSession } from '@/utils/authSession';
import { configurationError } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(configurationError);
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
      if (!session) { setError('This sign-in link is invalid or expired. Please start again.'); return; }
      navigate('/dashboard', { replace: true });
    }).catch(() => {
      if (active) setError('We could not complete sign-in. Please request a new link or try signing in again.');
    }).finally(() => {
      if (active && window.location.pathname === '/auth/callback') window.history.replaceState(null, '', window.location.pathname);
    });
    return () => { active = false; };
  }, [navigate]);

  return (
    <main className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md text-center space-y-4">
        {error ? (
          <><h1 className="text-xl font-semibold">Sign-in could not be completed</h1><p role="alert">{error}</p><Button onClick={() => navigate('/auth', { replace: true })}>Back to sign in</Button></>
        ) : (
          <><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" aria-hidden="true" /><h1 className="text-xl font-semibold" role="status">Completing sign-in...</h1></>
        )}
      </div>
    </main>
  );
};
export default AuthCallback;
