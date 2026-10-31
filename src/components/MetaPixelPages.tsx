import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isAdsChoiceStorageKey, refreshAdsMeasurement, trackMetaPage } from '@/lib/meta-pixel';
import { useAdsMeasurementChoice } from '@/lib/use-ads-measurement-choice';

/** Starts the Meta Pixel on a public landing page and sends any waiting sign-up event. */
export default function MetaPixelPages() {
  const { pathname, search, hash } = useLocation();
  const revision = useAdsMeasurementChoice();
  useEffect(() => { trackMetaPage(pathname); }, [pathname, search, hash, revision]);
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (isAdsChoiceStorageKey(event.key)) refreshAdsMeasurement(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return null;
}
