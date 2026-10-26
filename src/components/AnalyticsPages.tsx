import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { startAnalytics, trackPage } from '@/lib/analytics';

/** Page identity changes immediately, including rapid redirects and Back navigation. */
export default function AnalyticsPages() {
  const { pathname, search } = useLocation();
  useLayoutEffect(() => { startAnalytics(); trackPage({ pathname, search }); }, [pathname, search]);
  return null;
}
