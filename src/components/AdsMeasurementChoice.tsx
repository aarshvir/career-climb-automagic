import { useState } from 'react';
import { adsOptedOut, setAdsOptOut } from '@/lib/meta-pixel';

/** Per-device opt-out from the Meta Pixel; a Global Privacy Control signal always wins. */
export default function AdsMeasurementChoice() {
  const [optedOut, setOptedOut] = useState(adsOptedOut);
  if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true)
    return <p role="status">Your browser sends a Global Privacy Control signal, so the Meta Pixel is not loaded for you.</p>;
  const toggle = () => { setAdsOptOut(!optedOut); setOptedOut(!optedOut); };
  return <p>
    <span role="status">Advertising measurement is turned {optedOut ? 'off' : 'on'} for this device. </span>
    <button type="button" className="product-text-link" onClick={toggle}>{optedOut ? 'Turn it back on' : 'Don’t share my visits with Meta'}</button>
  </p>;
}
