import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Navigation waits for lazy content and respects the actual help anchor.
 * Query-only edits keep the user's place in a form or administration page. */
export default function RouteNavigation() {
  const { pathname, hash } = useLocation();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const initial = previous.current === null;
    const changedPage = previous.current !== pathname;
    previous.current = pathname;
    // A fresh page load keeps focus at the top so the first Tab reaches the skip link.
    if (initial && !hash) return;
    if (!changedPage && !hash) return;
    let fragment = '';
    try { fragment = decodeURIComponent(hash.slice(1)); } catch { /* malformed fragment has no target */ }
    const targetId = /^[a-zA-Z][a-zA-Z\d_:-]{0,99}$/.test(fragment) ? fragment : '';
    if (!changedPage && !targetId) return;
    if (changedPage && !targetId) window.scrollTo(0, 0);
    let active = true;
    let observer: MutationObserver | undefined;
    const move = () => {
      if (!active) return false;
      const target = targetId ? document.getElementById(targetId) : document.querySelector<HTMLElement>('main h1');
      if (!target) return false;
      if (targetId) target.scrollIntoView({ block: 'start', behavior: 'auto' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      observer?.disconnect();
      return true;
    };
    if (!move()) { observer = new MutationObserver(move); observer.observe(document.getElementById('main-content') ?? document.body, { childList:true, subtree:true }); }
    const timeout = window.setTimeout(() => observer?.disconnect(), 3000);
    return () => { active=false; observer?.disconnect(); window.clearTimeout(timeout); };
  }, [pathname, hash]);
  return null;
}
