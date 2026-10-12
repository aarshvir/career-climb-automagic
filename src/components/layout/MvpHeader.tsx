import { NavLink, Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';

export function Brand() {
  return <Link to="/" className="jv-brand" aria-label="Jobvance home">
    <span className="jv-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 17h4v-4h4V9h5M13 5h6v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
    <span>jobvance<span style={{color:"var(--jv-blue)"}}>.</span></span>
  </Link>;
}
const links = [["/check","Free CV check"],["/loop","Job Loop"],["/how-it-works","How it works"],["/pricing","Plans"]];
export default function MvpHeader() {
  const { user, loading, signOut } = useAuth();
  const previousOwner = useRef(user?.id ?? null);
  useEffect(() => { if (previousOwner.current && previousOwner.current !== user?.id) clearLoopWorkingDraft(); previousOwner.current = user?.id ?? null; }, [user?.id]);
  const client = useQueryClient();
  const location = useLocation();
  const [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const [openPath,setOpenPath] = useState<string | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const open = openPath === location.pathname;
  const account = loading ? <span className="text-xs text-muted-foreground">Checking account…</span> : user ? <>
    <Button asChild size="sm"><Link to="/loop">My Job Loop <ArrowUpRight size={14} /></Link></Button>
    <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
      setBusy(true);setError("");
      try { await signOut(); clearLoopWorkingDraft(); client.clear(); setOpenPath(null); }
      catch { setError("Sign out failed. Please retry."); }
      finally { setBusy(false); }
    }}>{busy ? "Signing out…" : "Sign out"}</Button>
  </> : <><Button asChild size="sm" variant="ghost"><Link to="/auth">Sign in</Link></Button><Button asChild size="sm"><Link to="/check">Get started free <ArrowUpRight size={14} /></Link></Button></>;
  return <header className="jv-header">
    <a className="jv-skip" href="#main-content">Skip to content</a>
    <div className="jv-header-inner">
      <Brand /><span className="jv-beta">Free beta</span>
      <nav aria-label="Main navigation" className="jv-header-nav">{links.map(([to,label])=><NavLink key={to} to={to}>{label}</NavLink>)}</nav>
      <div className="jv-header-actions">{account}</div>
      <Button ref={toggle} variant="ghost" size="icon" className="jv-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={()=>setOpenPath(open ? null : location.pathname)}>{open ? <X /> : <Menu />}</Button>
    </div>
    <nav id="mobile-navigation" aria-label="Mobile navigation" data-open={open} className="jv-mobile-panel" onKeyDown={event=>{if(event.key==="Escape"){setOpenPath(null);toggle.current?.focus();}}}>
      {links.map(([to,label])=><NavLink key={to} to={to} onClick={()=>setOpenPath(null)}>{label}</NavLink>)}
      <div className="jv-mobile-account" onClick={()=>setOpenPath(null)}>{account}</div>
    </nav>
    {error && <p className="jv-header-error" role="alert">{error}</p>}
  </header>;
}

