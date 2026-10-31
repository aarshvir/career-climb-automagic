import { NavLink, Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { clearLoopWorkingDraft } from '@/lib/loop-draft-memory';
import { BRAND_MARK } from '@/lib/brand-mark';

const brandInner = <>
  <span className="jv-brand-mark" aria-hidden="true"><svg viewBox={BRAND_MARK.viewBox} fill="none"><g transform={BRAND_MARK.transform} stroke="currentColor" strokeWidth={BRAND_MARK.variants.small.stroke} strokeLinecap="round" strokeLinejoin="round"><path d={BRAND_MARK.hook} /><path d={BRAND_MARK.bar} /><circle cx={BRAND_MARK.dot.cx} cy={BRAND_MARK.dot.cy} r={BRAND_MARK.variants.small.dotRadius + BRAND_MARK.knockoutExtra} fill="var(--mark-tile)" stroke="none" /><circle cx={BRAND_MARK.dot.cx} cy={BRAND_MARK.dot.cy} r={BRAND_MARK.variants.small.dotRadius} fill="var(--jv-signal)" stroke="none" /></g></svg></span>
  <span className="jv-brand-name">jobvance<span className="jv-brand-period">.</span></span>
</>;
export function Brand() {
  return <Link to="/" className="jv-brand" aria-label="Jobvance home">{brandInner}</Link>;
}
/** The same J mark (the favicon glyph) and wordmark without a link, for product mocks. */
export function BrandLockup() {
  return <span className="jv-brand jv-brand--static" aria-hidden="true">{brandInner}</span>;
}
const audienceLinks = [["/for-students","Students and graduates"],["/for-mba","MBA career pivots"],["/for-career-switchers","Busy professionals"]];
const links = [["/job-loop","Automated Job Loop"],["/cv-check","Free CV Check"],["/pricing","Pricing"],["/guides","Guides"],["/help","Help"]];
// A stored Supabase session makes "signed in" likely. Only then is the signed-out footprint held invisible while the
// account check runs; everyone else (and the prerendered page) sees Sign in and Get started from the first paint.
function storedSessionLikely() {
  if (typeof window === "undefined") return false;
  try { return Object.keys(window.localStorage).some(key => /^sb-.*-auth-token$/.test(key)); } catch { return false; }
}
export default function MvpHeader() {
  const { user, loading, authError, signOut } = useAuth();
  const previousOwner = useRef(user?.id ?? null);
  useEffect(() => { if (previousOwner.current && previousOwner.current !== user?.id) clearLoopWorkingDraft(); previousOwner.current = user?.id ?? null; }, [user?.id]);
  const client = useQueryClient();
  const location = useLocation();
  const [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const [openPath,setOpenPath] = useState<string | null>(null);
  const [sessionLikely] = useState(storedSessionLikely);
  // Account holders go straight to the check; visitors get the public page that explains it (the check itself is not indexed).
  const navTo = (to: string) => to === "/cv-check" && user ? "/check" : to;
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const open = openPath === location.pathname;
  // Keep the panel mounted for 160ms after it closes so it can clip away (instant under reduced motion).
  const [closing,setClosing] = useState(false);
  const wasOpen = useRef(open);
  // Derived during render so the panel is never hidden for a frame between "open" and "closing".
  const canAnimateClose = typeof window !== "undefined" && !window.matchMedia?.("(min-width: 960px)").matches && !!window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches;
  const closingNow = closing || (wasOpen.current && !open && canAnimateClose);
  // Desktop hides the mobile controls. Release their modal state as well,
  // including when the viewport crosses the breakpoint while the menu is open.
  useEffect(() => {
    const desktop = window.matchMedia?.("(min-width: 960px)");
    if (!desktop) return;
    const closeOnDesktop = () => {
      if (!desktop.matches) return;
      setOpenPath(null);
      setClosing(false);
    };
    closeOnDesktop();
    if (desktop.addEventListener) {
      desktop.addEventListener("change", closeOnDesktop);
      return () => desktop.removeEventListener("change", closeOnDesktop);
    }
    desktop.addListener?.(closeOnDesktop);
    return () => desktop.removeListener?.(closeOnDesktop);
  }, []);
  useEffect(() => {
    if (wasOpen.current && !open && !window.matchMedia?.("(min-width: 960px)").matches && window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches) {
      setClosing(true);
      const timer = window.setTimeout(() => setClosing(false), 160);
      wasOpen.current = open;
      return () => window.clearTimeout(timer);
    }
    wasOpen.current = open;
    setClosing(false);
  }, [open]);
  // While the mobile menu is open: lock page scroll (html and body, for iOS Safari), make the page behind it inert,
  // keep Tab cycling between the toggle and the panel, and let Escape close it from anywhere.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const previousRoot = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const behind = [document.getElementById("main-content"), document.querySelector("footer")].filter((node): node is HTMLElement => !!node && !node.hasAttribute("inert"));
    behind.forEach(node => node.setAttribute("inert", ""));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpenPath(null); toggle.current?.focus(); return; }
      if (event.key !== "Tab") return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).filter(item => item.tabIndex >= 0 && item.getClientRects().length > 0);
      const last = items[items.length - 1];
      if (!last || !toggle.current) return;
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); toggle.current.focus(); }
      else if (event.shiftKey && document.activeElement === toggle.current) { event.preventDefault(); last.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.documentElement.style.overflow = previousRoot;
      behind.forEach(node => node.removeAttribute("inert"));
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const pending = !!authError || (loading && sessionLikely);
  const signedOut = !pending && !user;
  // On the pages that already are the start (the ad landing form and the sign-in screens) the header keeps only Sign in.
  const onEntry = /^\/(onboarding|auth)(\/|$)/.test(location.pathname);
  const signedOutActions = (hold: boolean) => <>
    <Link to="/auth?next=%2Floop" className="jv-btn jv-btn--ghost jv-btn--sm" tabIndex={hold ? -1 : undefined}>Sign in</Link>
    {!onEntry && <Link to="/onboarding" className="jv-btn jv-btn--primary jv-btn--sm" tabIndex={hold ? -1 : undefined}>Start my search</Link>}
  </>;
  const account = pending ? <>
    {/* Holds the signed-out footprint (invisible) while the account check runs, so nothing shifts. */}
    <span className="jv-account-pending" aria-hidden="true">{signedOutActions(true)}</span>
    <span className="jv-sr-only" role="status">Checking account…</span>
  </> : user ? <>
    <Link to="/loop" className="jv-btn jv-btn--primary jv-btn--sm">My Automated Job Loop</Link>
    <button type="button" className="jv-btn jv-btn--ghost jv-btn--sm" disabled={busy} aria-busy={busy || undefined} onClick={async () => {
      setBusy(true);setError("");
      try { await signOut(); clearLoopWorkingDraft(); client.clear(); setOpenPath(null); }
      catch { setError("Sign out failed. Please retry."); }
      finally { setBusy(false); }
    }}>{busy ? "Signing out…" : "Sign out"}</button>
  </> : signedOutActions(false);
  return <header className="jv-header" data-menu-open={open} data-entry={onEntry || undefined} {...(open ? { role: "dialog", "aria-modal": true, "aria-label": "Site menu" } : {})}>
    <a className="jv-skip" href="#main-content">Skip to content</a>
    <div className="jv-header-inner">
      <Brand />
      <nav aria-label="Main navigation" className="jv-header-nav">{links.map(([to,label])=><NavLink key={to} to={navTo(to)}>{label}</NavLink>)}</nav>
      <div className="jv-header-actions">{account}</div>
      {signedOut && !onEntry && <Link to="/onboarding" className="jv-btn jv-btn--primary jv-btn--sm jv-header-start">Start my search</Link>}
      <button ref={toggle} type="button" className="jv-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={()=>setOpenPath(open ? null : location.pathname)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
    </div>
    <nav ref={panel} id="mobile-navigation" aria-label="Mobile navigation" data-open={open} data-state={closingNow ? "closing" : undefined} className="jv-mobile-panel">
      <div className="jv-mobile-account" onClick={()=>setOpenPath(null)}>{account}</div>
      {links.map(([to,label])=><NavLink key={to} to={navTo(to)} onClick={()=>setOpenPath(null)}>{label}</NavLink>)}
      <div className="jv-mobile-who" role="group" aria-label="Who it's for"><p aria-hidden="true">Who it's for</p>{audienceLinks.map(([to,label])=><NavLink key={to} to={to} onClick={()=>setOpenPath(null)}>{label}</NavLink>)}</div>
    </nav>
    {(open || closingNow) && <div className="jv-menu-scrim" aria-hidden="true" data-state={closingNow ? "closing" : undefined} onClick={()=>setOpenPath(null)} />}
    {error && <p className="jv-header-error" role="alert">{error}</p>}
  </header>;
}
