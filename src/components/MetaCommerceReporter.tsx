import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { flushMetaCommerce } from '@/lib/meta-commerce';

/**
 * Lets Meta know about a signed-in owner's first payment. It checks shortly after a visit (at most every
 * half hour per device) and, when the owner comes back from checkout, a few times while the payment is confirmed.
 */
export default function MetaCommerceReporter() {
  const { user } = useAuth();
  const { search } = useLocation();
  const returned = new URLSearchParams(search).get('loop_checkout') === 'success';
  const owner = user?.id ?? null;
  useEffect(() => {
    if (!owner) return;
    let done = false;
    const delays = returned ? [3000, 20000, 60000, 150000] : [4000];
    const timers = delays.map(delay => window.setTimeout(() => {
      if (!done) void flushMetaCommerce(owner, returned).then(sent => { if (sent) done = true; });
    }, delay));
    return () => { done = true; timers.forEach(timer => window.clearTimeout(timer)); };
  }, [owner, returned]);
  return null;
}
