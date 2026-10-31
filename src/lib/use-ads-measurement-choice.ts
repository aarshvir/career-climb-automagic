import { useEffect, useState } from 'react';
import { ADS_MEASUREMENT_CHANGED } from '@/lib/meta-pixel';

/** The event contains no account, page or advertising identifiers. */
export function useAdsMeasurementChoice(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision(value => value + 1);
    window.addEventListener(ADS_MEASUREMENT_CHANGED, changed);
    return () => window.removeEventListener(ADS_MEASUREMENT_CHANGED, changed);
  }, []);
  return revision;
}
