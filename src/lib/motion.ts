import { useEffect, useState } from 'react';

/** Scroll behaviour that honours prefers-reduced-motion: an explicit 'smooth' in script overrides the CSS opt-out, so every script scroll goes through here. */
export function smoothBehavior(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

/** True while the visitor allows motion. It follows the OS setting live, so toggling it mid-session arms or tears down observers without a reload. */
export function useMotionAllowed(): boolean {
  const read = () => typeof window !== 'undefined' && !!window.matchMedia?.(MOTION_QUERY).matches;
  const [allowed, setAllowed] = useState(read);
  useEffect(() => {
    const query = window.matchMedia?.(MOTION_QUERY);
    if (!query) return;
    const sync = () => setAllowed(query.matches);
    sync();
    if (query.addEventListener) { query.addEventListener('change', sync); return () => query.removeEventListener('change', sync); }
    query.addListener?.(sync);
    return () => query.removeListener?.(sync);
  }, []);
  return allowed;
}
