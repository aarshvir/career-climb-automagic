import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { readAuthSession } from '@/utils/authSession';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { validatePassword } from '@/lib/security';

const ResetPassword = () => {
  const navigate = useNavigate();
  const { updatePassword, configurationError } = useAuth();
  const [linkState, setLinkState] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (configurationError) { setLinkState('invalid'); return; }
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (params.has('error') || hash.has('error')) {
      setLinkState('invalid');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    void readAuthSession().then(session => {
      if (active) setLinkState(session ? 'ready' : 'invalid');
    }).catch(() => {
      if (active) setLinkState('invalid');
    }).finally(() => {
      if (active) window.history.replaceState(null, '', window.location.pathname);
    });
    return () => { active = false; };
  }, [configurationError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || linkState !== 'ready') return;
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    const validation = validatePassword(password);
    if (!validation.valid) { setError(validation.errors.join('. ')); return; }
    setBusy(true);
    try {
      const result = await updatePassword(password);
      if (result.error) setError(result.error);
      else navigate('/loop', { replace: true });
    } catch { setError('Password update failed. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="jv-account-utility min-h-[70vh] flex items-center justify-center p-4">
      <Card className="jv-account-utility-card w-full max-w-md">
        <CardHeader><CardTitle>Set a new password</CardTitle><CardDescription>Use at least 8 characters, uppercase and lowercase letters, and a number.</CardDescription></CardHeader>
        <CardContent>
          {linkState === 'checking' ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Checking reset link...</p> : linkState === 'invalid' ? (
            <div className="space-y-4">
              <Alert variant="destructive" role="alert"><AlertDescription>{configurationError || 'This reset link is invalid or expired. Request a new link and open it in the browser where you requested it.'}</AlertDescription></Alert>
              <Button asChild><Link to="/auth/forgot-password">Request a new reset link</Link></Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /></div>
              <div className="space-y-2"><Label htmlFor="confirmPassword">Confirm password</Label><Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required disabled={busy} /></div>
              {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
              <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Updating password...' : 'Update password'}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
};
export default ResetPassword;

