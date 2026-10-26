import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { startAnalytics, trackPage } from '@/lib/analytics';

/** Records each page a visitor opens (see lib/analytics). Waits a moment so the page title is set. */
export default function AnalyticsPages() {
  const { pathname, search } = useLocation();
  useEffect(() => { startAnalytics(); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => trackPage({ pathname, search }), 250);
    return () => window.clearTimeout(timer);
  }, [pathname, search]);
  return null;
}
