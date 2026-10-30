import { Suspense, lazy, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { captureContactAuthority, contactAuthorityKey, countryCodes, currentContactAuthority, hasContactDetails, readContactDetails, type ContactReceipt, type ContactValue } from '@/lib/contact-details';
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
          {countryCodes.map(([code, dial, name]) => <option key={code} value={dial} aria-label={`${code} ${dial}, ${name}`}>{code} {dial}</option>)}
        </select>
        <Input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Number" value={value.phone} onChange={event => onChange({ ...value, phone: event.target.value })} required disabled={disabled} maxLength={24} />
      </div>
    </div>
  </>;
}

const PRIVATE = /^\/(loop|onboarding|dashboard|applications|check)(\/|$)/;

/** Every signed-in account gives a name and mobile number before using the private pages. */
export function ContactGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { user } = auth;
  const { pathname } = useLocation();
  const authority = useMemo(() => captureContactAuthority(user, auth.session, auth.loading, auth.authError), [user, auth.session, auth.loading, auth.authError]);
  const key = authority ? contactAuthorityKey(authority) : null;
  const [saved, setSaved] = useState<ContactReceipt | null>(null);
  const savedAgainst = useRef<typeof user>(null);
  const admitted = useRef<string | null>(null), priorScope = useRef<string | null>(null);
  const editing = useRef(false);
  if (key && key !== priorScope.current) { priorScope.current = key; admitted.current = null; editing.current = false; }
  const privatePage = PRIVATE.test(pathname);
  const signedOut = auth.loading === false && auth.authError === null && user === null;
  const complete = !!authority && currentContactAuthority(authority) && (!editing.current && hasContactDetails(user?.user_metadata) || !!saved && contactAuthorityKey(saved) === key && savedAgainst.current === user);
  if (complete) admitted.current = key;
  const blocked = privatePage && !signedOut && !complete;
  // An already mounted stable-session route stays alive while details are added.
  // A newly blocked route is never mounted merely to hide it afterwards.
  const mountChildren = !privatePage || signedOut || admitted.current !== null;
  const content = useRef<HTMLDivElement>(null), gate = useRef<HTMLDivElement>(null);
  const latest = useRef({ authority, privatePage, signedOut, complete, user });
  latest.current = { authority, privatePage, signedOut, complete, user };
  const shouldBlock = () => {
    const next = latest.current;
    return next.privatePage && !next.signedOut && (!next.complete || !next.authority || !currentContactAuthority(next.authority));
  };
  const guard = (event: SyntheticEvent) => { if (shouldBlock()) { event.preventDefault(); event.stopPropagation(); } };

  useEffect(() => {
    if (!blocked || !authority) return;
    let active = true;
    const current = () => active && latest.current.user === user && !!latest.current.authority && currentContactAuthority(authority) && contactAuthorityKey(latest.current.authority) === contactAuthorityKey(authority);
    // A previous accepted save may have outlived a lost response or route remount.
    // Read only; a missing or failed receipt never unlocks the gate.
    void readContactDetails(authority, current).then(receipt => { if (receipt && current() && !editing.current) { savedAgainst.current = latest.current.user; setSaved(receipt); } }).catch(() => undefined);
    return () => { active = false; };
  }, [blocked, authority, key, user]);

  useLayoutEffect(() => {
    const boundary = content.current;
    if (!boundary) return;
    if (blocked) boundary.setAttribute('inert', ''); else boundary.removeAttribute('inert');
  }, [blocked]);

  useLayoutEffect(() => {
    const foreground = gate.current, background = content.current;
    if (!blocked || !foreground || !background) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const hidden = new Map<HTMLElement, { hidden: boolean; inert: string | null; aria: string | null; display: string; priority: string }>();
    const isolate = () => {
      for (const child of document.body.children) {
        if (!(child instanceof HTMLElement) || child.contains(foreground) || child.contains(background) || ['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
        if (!hidden.has(child)) hidden.set(child, { hidden: child.hidden, inert: child.getAttribute('inert'), aria: child.getAttribute('aria-hidden'), display: child.style.getPropertyValue('display'), priority: child.style.getPropertyPriority('display') });
        child.hidden = true; child.setAttribute('inert', ''); child.setAttribute('aria-hidden', 'true'); child.style.setProperty('display', 'none', 'important');
      }
      // Existing Radix dialogs may hide new body siblings. This foreground is the
      // active modal; old dialogs remain mounted and isolated, preserving drafts.
      foreground.removeAttribute('aria-hidden'); foreground.removeAttribute('inert');
    };
    const focusables = () => [...foreground.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex="0"]')];
    const focusFirst = () => (focusables()[0] ?? foreground).focus();
    const focus = (event: FocusEvent) => {
      // Suspend an old portalled focus trap while the contact modal is active.
      event.stopImmediatePropagation();
      if (!(event.target instanceof Node) || !foreground.contains(event.target)) focusFirst();
    };
    const focusOut = (event: FocusEvent) => { event.stopImmediatePropagation(); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const values = focusables(), first = values[0], last = values.at(-1);
      event.stopImmediatePropagation();
      if (!first) { event.preventDefault(); foreground.focus(); }
      else if (!foreground.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last! : first).focus(); }
    };
    isolate();
    const observer = new MutationObserver(isolate);
    observer.observe(document.body, { childList: true });
    window.addEventListener('focusin', focus, true); window.addEventListener('focusout', focusOut, true); window.addEventListener('keydown', keyboard, true);
    focusFirst();
    return () => {
      observer.disconnect(); window.removeEventListener('focusin', focus, true); window.removeEventListener('focusout', focusOut, true); window.removeEventListener('keydown', keyboard, true);
      for (const [node, before] of hidden) {
        node.hidden = before.hidden;
        if (before.inert === null) node.removeAttribute('inert'); else node.setAttribute('inert', before.inert);
        if (before.aria === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', before.aria);
        if (before.display) node.style.setProperty('display', before.display, before.priority); else node.style.removeProperty('display');
      }
      if (previousFocus?.isConnected && !previousFocus.closest('[hidden], [inert]')) previousFocus.focus();
    };
  }, [blocked, key]);

  const acknowledge = (receipt: ContactReceipt) => {
    const now = latest.current.authority;
    if (now && currentContactAuthority(now) && contactAuthorityKey(receipt) === contactAuthorityKey(now) && hasContactDetails({ full_name: receipt.fullName, phone: receipt.phone })) { savedAgainst.current = latest.current.user; setSaved(receipt); }
  };
  return <>
    <div key={key ?? admitted.current ?? 'contact-guest'} ref={content} hidden={blocked} aria-hidden={blocked || undefined} style={blocked ? { display: 'none' } : undefined} onClickCapture={guard} onSubmitCapture={guard} onKeyDownCapture={guard} onPointerDownCapture={guard}>
      {mountChildren && children}
    </div>
    {blocked && createPortal(<div ref={gate} role="dialog" aria-modal="true" aria-labelledby={user ? 'contact-title' : undefined} aria-label={user ? undefined : 'Restore your sign-in'} tabIndex={-1} style={{ position: 'fixed', inset: 0, zIndex: 100, overflowY: 'auto', background: '#fff', pointerEvents: 'auto' }}>
      {user ? <Suspense fallback={<p className="p-8" role="status">Opening your account details…</p>}><ContactForm key={key ?? priorScope.current ?? user.id} user={user} onSaved={acknowledge} onEdited={() => { editing.current = true; }} /></Suspense> : <div className="p-8"><p role="status">Restoring your sign-in before opening your workspace…</p><button type="button" onClick={auth.retryConnection}>Retry sign-in recovery</button></div>}
      <nav aria-label="Account help" className="flex flex-wrap justify-center gap-6 p-4"><Link to="/help">Help</Link><Link to="/pricing">Plans</Link><Link to="/auth/forgot-password">Account recovery</Link></nav>
    </div>, document.body)}
  </>;
}
