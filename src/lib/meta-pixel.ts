// Meta Pixel advertising measurement: the public page a visit lands on, plus the moment a new
// account is created. It only starts on a fresh load of a public page, never on sign-in, reset,
// mailbox or checkout return URLs (which can carry login codes or payment references). Meta's
// history tracking is off, so nothing is reported as the visitor moves into private pages.
// It never sends CV, vacancy, document, payment or email data.
import { supabase } from '@/integrations/supabase/client';

export const META_PIXEL_ID = '1912745166266087';
const OPT_OUT_KEY = 'jobvance_ads_opt_out_v1';
const SENT_KEY = 'jobvance_meta_registrations_v1';
const PENDING_KEY = 'jobvance_meta_registration_pending_v1';
const NEW_ACCOUNT_WINDOW = 24 * 60 * 60 * 1000;

const measuredPaths = new Set(['/', '/onboarding', '/auth', '/job-loop', '/pricing', '/how-it-works', '/faq', '/about', '/contact', '/privacy', '/terms', '/refund', '/help', '/guides', '/walkthroughs', '/for-students', '/for-mba', '/for-career-switchers']);
const europeanZones = /^(Europe\/|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$|Arctic\/Longyearbyen$)/;

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[][]; push: Fbq; loaded: boolean; version: string; disablePushState?: boolean; jobvanceLastPage?: string };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } interface Navigator { globalPrivacyControl?: boolean } }

const attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];

/** Ad campaign tags to carry through a sign-in redirect, as `&key=value` pairs. */
export function adAttributionQuery(search: string): string {
  const source = new URLSearchParams(search), kept = new URLSearchParams();
  for (const key of attributionKeys) { const value = source.get(key); if (value && value.length <= 300) kept.set(key, value); }
  const query = kept.toString();
  return query ? `&${query}` : '';
}

/** Exact public paths and guide articles: the only pages where the pixel may start. */
export function isMeasuredPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return measuredPaths.has(path) || /^\/guides\/[a-z\d-]{1,120}$/.test(path);
}

export function adsOptedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
}

/** Visitors in Europe, with a do-not-share browser signal or a saved opt-out are never measured. */
export function adsMeasurementAllowed(): boolean {
  if (typeof window === 'undefined' || navigator.globalPrivacyControl === true || adsOptedOut()) return false;
  try { return !europeanZones.test(Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''); } catch { return true; }
}

export function setAdsOptOut(optOut: boolean): void {
  try { if (optOut) localStorage.setItem(OPT_OUT_KEY, '1'); else localStorage.removeItem(OPT_OUT_KEY); } catch { /* the choice applies to this page only */ }
  window.fbq?.('consent', optOut ? 'revoke' : 'grant');
}

function ensurePixel(): Fbq | null {
  if (!import.meta.env.PROD || !adsMeasurementAllowed()) return null;
  if (window.fbq) return window.fbq;
  const fbq = function (...args: unknown[]) { if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue.push(args); } as Fbq;
  fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
  fbq.disablePushState = true; // No automatic PageViews when the app changes page.
  window.fbq = fbq; window._fbq = fbq;
  const script = document.createElement('script');
  script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  fbq('set', 'autoConfig', false, META_PIXEL_ID); // No automatic button or page-content collection.
  fbq('init', META_PIXEL_ID);
  return fbq;
}

// The signed-in account last seen, and its key once confirmed new; a sign-out or switch clears both.
let currentAccount: string | null = null;
let currentKey: string | null = null;

/** Called on each page change: a PageView for public pages only, then any waiting sign-up.
 * `trackSingle` avoids fbevents' one-PageView-per-document rule, as Meta's GTM template does. */
export function trackMetaPage(pathname: string): void {
  if (!isMeasuredPath(pathname) || !isMeasuredPath(window.location.pathname)) return;
  const fbq = ensurePixel();
  if (!fbq) return;
  if (fbq.jobvanceLastPage !== pathname) { fbq.jobvanceLastPage = pathname; fbq('trackSingle', META_PIXEL_ID, 'PageView'); }
  flushRegistration(fbq);
}

async function accountKey(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function sentKeys(): string[] {
  try { const value = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(-20) : []; } catch { return []; }
}

function flushRegistration(fbq: Fbq): void {
  let key: string | null = null;
  try { key = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); } catch { return; }
  // A waiting sign-up belongs only to the account still signed in.
  if (!key || key !== currentKey || sentKeys().includes(key)) return;
  // The server copy uses the same event ID, so Meta counts this sign-up once.
  fbq('track', 'CompleteRegistration', {}, { eventID: `reg_${key}` });
  try { localStorage.setItem(SENT_KEY, JSON.stringify([...sentKeys(), key].slice(-20))); } catch { /* may repeat on this device only */ }
  sendServerRegistration(key);
}

const metaCookie = (name: '_fbp' | '_fbc') => document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);

/** Asks the meta-conversions function for the server copy once Meta has set its cookies.
 * Cancelled if the visitor signs out, switches account or opts out during the wait. */
function sendServerRegistration(key: string, delay = 2000): void {
  const pageUrl = `${window.location.origin}${window.location.pathname}`; // the public page, even if the visitor moves on
  window.setTimeout(() => {
    if (key !== currentKey || !adsMeasurementAllowed()) return;
    void supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session || await accountKey(session.user.id) !== key || key !== currentKey || !adsMeasurementAllowed()) return;
      const body = { pageUrl, fbp: metaCookie('_fbp'), fbc: metaCookie('_fbc') };
      await supabase.functions.invoke('meta-conversions', { body, headers: { Authorization: `Bearer ${session.access_token}` } });
    }).catch(() => undefined);
  }, delay);
}

/** A signed-in account created in the last day counts as a sign-up once per device. */
export async function noteAccountForMeta(user: { id: string; created_at?: string } | null | undefined, now = Date.now()): Promise<void> {
  if ((user?.id ?? null) !== currentAccount) { currentAccount = user?.id ?? null; currentKey = null; }
  if (!user?.created_at || !adsMeasurementAllowed()) return;
  const created = Date.parse(user.created_at);
  if (!Number.isFinite(created) || now - created > NEW_ACCOUNT_WINDOW || created - now > 5 * 60 * 1000) return;
  const key = await accountKey(user.id);
  // Signed out or switched account while hashing: this result is stale.
  if (currentAccount !== user.id || sentKeys().includes(key)) return;
  currentKey = key;
  try { sessionStorage.setItem(PENDING_KEY, key); } catch { return; }
  // Sent now from a public page; otherwise on the next one (never from a private page).
  if (isMeasuredPath(window.location.pathname)) { const fbq = ensurePixel(); if (fbq) flushRegistration(fbq); }
}
