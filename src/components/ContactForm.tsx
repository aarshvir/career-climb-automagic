import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { accountName, blankContact, captureContactAuthority, checkContact, contactAuthorityKey, currentContactAuthority, saveContactDetails, type ContactReceipt } from '@/lib/contact-details';
import { ContactFields } from './ContactDetails';
import '@/pages/AccountPilot.css';

/** "One last step": a signed-in account without a name or mobile number adds them here. */
export default function ContactForm({ user, onSaved, onEdited }: { user: User; onSaved: (receipt: ContactReceipt) => void; onEdited?: () => void }) {
  const auth = useAuth();
  const authority = useMemo(() => captureContactAuthority(auth.user, auth.session, auth.loading, auth.authError), [auth.user, auth.session, auth.loading, auth.authError]);
  const [value, setValue] = useState(() => blankContact(accountName(user.user_metadata)));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), submitting = useRef(false), attempt = useRef(0);
  const latest = useRef(authority); latest.current = authority;
  const invalidate = useCallback(() => { alive.current = false; attempt.current++; }, []);
  useEffect(() => { alive.current = true; return invalidate; }, [invalidate]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const checked = checkContact(value);
    if (typeof checked === 'string') { setError(checked); return; }
    const scope = authority;
    if (!scope || !currentContactAuthority(scope) || scope.ownerId !== user.id) { setError('Your sign-in could not be confirmed. Please retry after sign-in is restored.'); return; }
    const turn = ++attempt.current;
    const current = () => {
      const next = latest.current;
      return alive.current && attempt.current === turn && !!next && currentContactAuthority(scope) && contactAuthorityKey(next) === contactAuthorityKey(scope);
    };
    submitting.current = true;
    setBusy(true); setError('');
    try {
      const receipt = await saveContactDetails(scope, checked, current);
      if (current()) onSaved(receipt);
    } catch (failure) { if (alive.current && attempt.current === turn) setError(failure instanceof Error ? failure.message : 'We could not connect. Your details are still here; please retry.'); }
    finally { submitting.current = false; if (alive.current && attempt.current === turn) setBusy(false); }
  }
  const ready = !!authority && currentContactAuthority(authority) && auth.user?.id === user.id;
  return <section className="jv-account jv-account-utility min-h-[70vh] flex items-center justify-center p-4">
    <form className="jv-account-utility-card ap-auth-form max-w-md w-full space-y-4 p-8" onSubmit={event => void submit(event)} aria-labelledby="contact-title">
      <h1 id="contact-title" className="text-xl font-semibold">One last step</h1>
      <p>Add your name and mobile number to continue to your Jobvance workspace.</p>
      {error && <p role="alert" className="ap-field-error">{error}</p>}
      {!ready && <p role="status">Restoring your sign-in before details can be saved…</p>}
      <ContactFields value={value} onChange={next => { onEdited?.(); setValue(next); }} disabled={busy} />
      <Button type="submit" className="ap-primary ap-auth-submit w-full" disabled={busy || !ready}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Saving...</> : <>Continue <ArrowRight size={16} aria-hidden="true" /></>}</Button>
    </form>
  </section>;
}
