import { useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { accountName, blankContact, checkContact } from '@/lib/contact-details';
import { ContactFields } from './ContactDetails';
import '@/pages/AccountPilot.css';

/** "One last step": a signed-in account without a name or mobile number adds them here. */
export default function ContactForm({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [value, setValue] = useState(() => blankContact(accountName(user.user_metadata)));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = checkContact(value);
    if (typeof checked === 'string') { setError(checked); return; }
    setBusy(true); setError('');
    try {
      const { error: failure } = await supabase.auth.updateUser({ data: { full_name: checked.fullName, phone: checked.phone } });
      if (failure) setError('We could not save your details. Please try again.'); else onSaved();
    } catch { setError('We could not connect. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="jv-account jv-account-utility min-h-[70vh] flex items-center justify-center p-4">
    <form className="jv-account-utility-card ap-auth-form max-w-md w-full space-y-4 p-8" onSubmit={event => void submit(event)} aria-labelledby="contact-title">
      <h1 id="contact-title" className="text-xl font-semibold">One last step</h1>
      <p>Add your name and mobile number to continue to your Jobvance workspace.</p>
      {error && <p role="alert" className="ap-field-error">{error}</p>}
      <ContactFields value={value} onChange={setValue} disabled={busy} />
      <Button type="submit" className="ap-primary ap-auth-submit w-full" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Saving...</> : <>Continue <ArrowRight size={16} aria-hidden="true" /></>}</Button>
    </form>
  </main>;
}
