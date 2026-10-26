import { NavLink, Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';

export function Brand() {
  return <Link to="/" className="jv-brand" aria-label="Jobvance home">
    <span className="jv-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M16.5 8.5v7a5.5 5.5 0 0 1-11 0" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" /><circle cx="16.5" cy="4.75" r="1.75" className="jv-brand-signal" /></svg>
    </span>
    <span className="jv-wordmark">jobvance</span>
  </Link>;
}
const links = [["/job-loop","Automated Job Loop"],["/check","Free CV Check"],["/pricing","Pricing"],["/guides","Guides"],["/help","Help"]];
export default function MvpHeader() {
  const { user, loading, authError, signOut } = useAuth();
  const previousOwner = useRef(user?.id ?? null);
  useEffect(() => { if (previousOwner.current && previousOwner.current !== user?.id) clearLoopWorkingDraft(); previousOwner.current = user?.id ?? null; }, [user?.id]);
  const client = useQueryClient();
  const location = useLocation();
  const [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const [openPath,setOpenPath] = useState<string | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const open = openPath === location.pathname;
  // Lock page scroll behind the open mobile menu.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const signedOut = !loading && !authError && !user;
  const account = loading || authError ? <span className="jv-account-status">Checking account…</span> : user ? <>
    <Link to="/loop" className="jv-btn jv-btn--primary jv-btn--sm">My Automated Job Loop</Link>
    <button type="button" className="jv-btn jv-btn--ghost jv-btn--sm" disabled={busy} aria-busy={busy || undefined} onClick={async () => {
      setBusy(true);setError("");
      try { await signOut(); clearLoopWorkingDraft(); client.clear(); setOpenPath(null); }
      catch { setError("Sign out failed. Please retry."); }
      finally { setBusy(false); }
    }}>{busy ? "Signing out…" : "Sign out"}</button>
  </> : <><Link to="/auth?next=%2Floop" className="jv-btn jv-btn--ghost jv-btn--sm">Sign in</Link><Link to="/onboarding" className="jv-btn jv-btn--primary jv-btn--sm">Start free</Link></>;
  return <header className="jv-header">
    <a className="jv-skip" href="#main-content">Skip to content</a>
    <div className="jv-header-inner">
      <Brand />
      <nav aria-label="Main navigation" className="jv-header-nav">{links.map(([to,label])=><NavLink key={to} to={to}>{label}</NavLink>)}</nav>
      <div className="jv-header-actions">{account}</div>
      {signedOut && <Link to="/onboarding" className="jv-btn jv-btn--primary jv-btn--sm jv-header-start">Start free</Link>}
      <button ref={toggle} type="button" className="jv-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={()=>setOpenPath(open ? null : location.pathname)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
    </div>
    <nav id="mobile-navigation" aria-label="Mobile navigation" data-open={open} className="jv-mobile-panel" onKeyDown={event=>{if(event.key==="Escape"){setOpenPath(null);toggle.current?.focus();}}}>
      {links.map(([to,label])=><NavLink key={to} to={to} onClick={()=>setOpenPath(null)}>{label}</NavLink>)}
      <div className="jv-mobile-account" onClick={()=>setOpenPath(null)}>{account}</div>
    </nav>
    {error && <p className="jv-header-error" role="alert">{error}</p>}
  </header>;
}
