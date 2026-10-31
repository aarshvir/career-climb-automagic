import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adsOptedOut, isMeasuredPath, isUkAdsVisit, setUkAdsConsent, ukAdsChoice } from '@/lib/meta-pixel';
import { useAdsMeasurementChoice } from '@/lib/use-ads-measurement-choice';
import './UkAdsConsent.css';

/** An optional, in-flow choice. The site remains usable when ignored or rejected. */
export default function UkAdsConsent() {
  const { pathname } = useLocation();
  useAdsMeasurementChoice();
  const [error, setError] = useState('');
  if (!isUkAdsVisit() || navigator.globalPrivacyControl === true || !error && (adsOptedOut() || ukAdsChoice() !== 'unknown') || !isMeasuredPath(pathname)) return null;
  const choose = (accepted: boolean) => setError(setUkAdsConsent(accepted) ? '' : 'Your choice could not be saved. Advertising measurement stays off.');
  return <section className="jv-ads-choice" aria-labelledby="jv-ads-choice-title">
    <div><h2 id="jv-ads-choice-title">Allow advertising measurement?</h2>
      <p>With your permission, Meta Platforms can receive public-page visits and sign-up, checkout and first-payment notices to measure and improve our ads. This is optional. <Link to="/privacy#advertising-measurement">Read what is shared and change your choice</Link>.</p></div>
    <div className="jv-ads-choice-actions">
      <button type="button" className="jv-ads-choice-button" onClick={() => choose(true)}>Allow Meta measurement</button>
      <button type="button" className="jv-ads-choice-button" onClick={() => choose(false)}>Reject Meta measurement</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
