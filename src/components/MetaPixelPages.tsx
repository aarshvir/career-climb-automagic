import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackMetaPage } from '@/lib/meta-pixel';

/** Starts the Meta Pixel on a public landing page and sends any waiting sign-up event. */
export default function MetaPixelPages() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => { trackMetaPage(pathname); }, [pathname, search, hash]);
  return null;
}
