// Meta Pixel advertising measurement: page visits plus the moment a new account is created.
// It only starts on a fresh load of a public page, never on sign-in, reset, mailbox or
// checkout return URLs (which can carry login codes or payment references). Once started,
// Meta's own history tracking reports later in-app page changes; in-app addresses hold
// only fixed paths and opaque IDs. It never sends CV, vacancy, document, payment or email data.
import { supabase } from '@/integrations/supabase/client';

export const META_PIXEL_ID = '1912745166266087';
const OPT_OUT_KEY = 'jobvance_ads_opt_out_v1';
const SENT_KEY = 'jobvance_meta_registrations_v1';
const PENDING_KEY = 'jobvance_meta_registration_pending_v1';
const NEW_ACCOUNT_WINDOW = 24 * 60 * 60 * 1000;

const measuredPaths = new Set(['/', '/onboarding', '/auth', '/job-loop', '/pricing', '/how-it-works', '/faq', '/about', '/contact', '/privacy', '/terms', '/refund', '/help', '/guides', '/walkthroughs', '/for-students', '/for-mba', '/for-career-switchers']);
const europeanZones = /^(Europe\/|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$|Arctic\/Longyearbyen$)/;

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[][]; push: Fbq; loaded: boolean; version: string };
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
  window.fbq = fbq; window._fbq = fbq;
  const script = document.createElement('script');
  script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  fbq('set', 'autoConfig', false, META_PIXEL_ID); // No automatic button or page-content collection.
  fbq('init', META_PIXEL_ID);
  return fbq;
}

/** Called on each page change. Meta drops a second manual PageView in one page load,
 * so only the first is sent here; later page changes come from Meta's history tracking. */
export function trackMetaPage(pathname: string): void {
  let fbq = window.fbq ?? null;
  if (!fbq) {
    if (!isMeasuredPath(pathname) || !isMeasuredPath(window.location.pathname)) return;
    fbq = ensurePixel();
    if (!fbq) return;
    fbq('track', 'PageView');
  }
  if (adsMeasurementAllowed()) flushRegistration(fbq);
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
  if (!key || !/^[a-f\d]{32}$/.test(key) || sentKeys().includes(key)) return;
  // The server copy uses the same event ID, so Meta counts this sign-up once.
  fbq('track', 'CompleteRegistration', {}, { eventID: `reg_${key}` });
  try { localStorage.setItem(SENT_KEY, JSON.stringify([...sentKeys(), key].slice(-20))); } catch { /* may repeat on this device only */ }
  sendServerRegistration();
}

const metaCookie = (name: '_fbp' | '_fbc') => document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);

/** Asks the meta-conversions function for the server copy once Meta has set its cookies. */
function sendServerRegistration(delay = 2000): void {
  window.setTimeout(() => {
    const body = { pageUrl: `${window.location.origin}${window.location.pathname}`, fbp: metaCookie('_fbp'), fbc: metaCookie('_fbc') };
    void supabase.functions.invoke('meta-conversions', { body }).catch(() => undefined);
  }, delay);
}

/** A signed-in account created in the last day counts as a sign-up once per device. */
export async function noteAccountForMeta(user: { id: string; created_at?: string } | null | undefined, now = Date.now()): Promise<void> {
  if (!user?.created_at || !adsMeasurementAllowed()) return;
  const created = Date.parse(user.created_at);
  if (!Number.isFinite(created) || now - created > NEW_ACCOUNT_WINDOW || created - now > 5 * 60 * 1000) return;
  const key = await accountKey(user.id);
  if (sentKeys().includes(key)) return;
  try { sessionStorage.setItem(PENDING_KEY, key); } catch { return; }
  // Sent now if the pixel runs or this is a public page; otherwise on the next public page.
  if (window.fbq || isMeasuredPath(window.location.pathname)) { const fbq = ensurePixel(); if (fbq) flushRegistration(fbq); }
}
