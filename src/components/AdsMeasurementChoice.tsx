import { useState } from 'react';
import { adsMeasurementAllowed, adsOptedOut, isUkAdsVisit, setAdsOptOut, setUkAdsConsent } from '@/lib/meta-pixel';
import { useAdsMeasurementChoice } from '@/lib/use-ads-measurement-choice';

/** Per-device opt-out from the Meta Pixel; a Global Privacy Control signal always wins. */
export default function AdsMeasurementChoice() {
  useAdsMeasurementChoice();
  const optedOut = adsOptedOut();
  const [error, setError] = useState('');
  if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true)
    return <p role="status">Your browser sends a Global Privacy Control signal, so the Meta Pixel is not loaded for you.</p>;
  if (isUkAdsVisit()) return <div>
    <p role="status">Advertising measurement is {adsMeasurementAllowed() ? 'on with your permission' : 'off'} for this device.</p>
    <p>Allow Meta Platforms to receive the advertising notices described above, or keep them off. Your access to Jobvance is the same either way. You can change this choice here at any time.</p>
    <div className="jv-ads-choice-actions">
      <button type="button" className="jv-ads-choice-button" onClick={() => setError(setUkAdsConsent(true) ? '' : 'Your choice could not be saved. Advertising measurement stays off.')}>Allow Meta measurement</button>
      <button type="button" className="jv-ads-choice-button" onClick={() => { setUkAdsConsent(false); setError(''); }}>{adsMeasurementAllowed() ? 'Withdraw permission' : 'Reject Meta measurement'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
  if (!optedOut && !adsMeasurementAllowed()) return <p role="status">Advertising measurement is off for this visit.</p>;
  const toggle = () => setAdsOptOut(!optedOut);
  return <p>
    <span role="status">Advertising measurement is turned {optedOut ? 'off' : 'on'} for this device. </span>
    <button type="button" className="product-text-link" onClick={toggle}>{optedOut ? 'Turn it back on' : 'Don’t share my visits with Meta'}</button>
  </p>;
}
