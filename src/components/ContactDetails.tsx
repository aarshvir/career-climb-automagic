import { Suspense, lazy, useId, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { countryCodes, hasContactDetails, type ContactValue } from '@/lib/contact-details';
const ContactForm = lazy(() => import('./ContactForm'));

export function ContactFields({ value, onChange, disabled }: { value: ContactValue; onChange: (next: ContactValue) => void; disabled?: boolean }) {
  const id = useId();
  return <>
    <div className="ap-field">
      <Label htmlFor={`${id}-name`}>Full name</Label>
      <Input id={`${id}-name`} autoComplete="name" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} required disabled={disabled} maxLength={120} />
    </div>
    <div className="ap-field">
      <Label htmlFor={`${id}-phone`}>Mobile number</Label>
      <div className="ap-phone-field">
        <select aria-label="Country code" value={value.countryCode} onChange={event => onChange({ ...value, countryCode: event.target.value })} disabled={disabled}>
          {countryCodes.map(([code, dial, name]) => <option key={code} value={dial} aria-label={`${name} ${dial}`}>{code} {dial}</option>)}
        </select>
        <Input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Number" value={value.phone} onChange={event => onChange({ ...value, phone: event.target.value })} required disabled={disabled} maxLength={24} />
      </div>
    </div>
  </>;
}

const PRIVATE = /^\/(loop|onboarding|dashboard|applications|check)(\/|$)/;

/** Every signed-in account gives a name and mobile number before using the private pages. */
export function ContactGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [saved, setSaved] = useState<string | null>(null);
  if (!user || !PRIVATE.test(pathname) || saved === user.id || hasContactDetails(user.user_metadata)) return <>{children}</>;
  return <Suspense fallback={<p className="p-8" role="status">Opening your workspace…</p>}><ContactForm key={user.id} user={user} onSaved={() => setSaved(user.id)} /></Suspense>;
}
