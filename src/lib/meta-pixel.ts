// Meta Pixel advertising measurement: the public page a visit lands on, the moment the sign-up form
// is submitted (content-free), plus the moment a new account is created. It only starts on a fresh
// load of a public page, never on sign-in, reset, mailbox or checkout return URLs (which can carry
// login codes or payment references). Meta's history tracking is off, so nothing is reported as
// the visitor moves into private pages.
// It never sends CV, vacancy, document, payment or email data.
import { supabase } from '@/integrations/supabase/client';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';

export const META_PIXEL_ID = '1912745166266087';
const OPT_OUT_KEY = 'jobvance_ads_opt_out_v1';
const UK_CONSENT_KEY = 'jobvance_meta_uk_consent_v1';
const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;
export const ADS_MEASUREMENT_CHANGED = 'jobvance:ads-measurement-changed';
export const META_CHECKOUT_PENDING_KEY = 'jobvance_meta_checkout_pending_v1';
let privacyRevision = 0;
const SENT_KEY = 'jobvance_meta_registrations_v1';
const NEW_ACCOUNT_WINDOW = 24 * 60 * 60 * 1000;
type RegistrationScope = { owner: string; sessionId: string | null; epoch: number; key: string; privacy: string };
let authority = { owner: null as string | null, sessionId: null as string | null, epoch: 0 };
let pendingRegistration: RegistrationScope | null = null;
let pageOptOut: boolean | undefined;
const timers = new Set<number>();

function revokePending(): void {
  authority = { ...authority, epoch: authority.epoch + 1 };
  pendingRegistration = null;
  for (const timer of timers) window.clearTimeout(timer);
  timers.clear();
  // Old deployments stored a pending hash. It grants no authority after refresh.
  try { sessionStorage.removeItem('jobvance_meta_registration_pending_v1'); } catch { /* no recovery */ }
}
const current = (scope: RegistrationScope) => authority.owner === scope.owner && authority.sessionId === scope.sessionId && authority.epoch === scope.epoch && scope.privacy === adsMeasurementAuthority() && adsMeasurementAllowed();

const measuredPaths = new Set(['/', '/onboarding', '/auth', '/job-loop', '/pricing', '/how-it-works', '/faq', '/about', '/contact', '/privacy', '/terms', '/refund', '/help', '/guides', '/walkthroughs', '/for-students', '/for-mba', '/for-career-switchers']);
// The United Kingdom is an ad market (Europe/London, Europe/Belfast); every other European zone stays excluded.
const europeanZones = /^(Europe\/(?!(London|Belfast)$)|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$|Arctic\/Longyearbyen$)/;

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[][]; push: Fbq; loaded: boolean; version: string; disablePushState?: boolean; jobvanceLastPage?: string; jobvanceSignupAttempts?: string[] };
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

/** Public route names do not make auth/payment references in their query safe. */
function safePublicUrl(value: URL): boolean {
  if (!isMeasuredPath(value.pathname) || value.hash && !/^#[a-z][a-z\d-]{0,80}$/i.test(value.hash)) return false;
  for (const [key, content] of value.searchParams) {
    if (attributionKeys.includes(key) && content.length <= 300 && ![...content].some(char => char.charCodeAt(0) < 32)) continue;
    if (key === 'mode' && /^(signup|signin|login)$/.test(content)) continue;
    // `/check` is the signed-in CV Check: the sign-up page may name it as its destination, but the Check page itself is private
    // and never measured (it is not in measuredPaths), and a destination with its own query (`/check?savedCheck=...`) never matches.
    if (key === 'next' && ['/', '/onboarding', '/loop', '/dashboard', '/applications', '/check'].includes(content)) continue;
    if (['country', 'currency', 'plan', 'lang'].includes(key) && /^[a-z\d-]{2,30}$/i.test(content)) continue;
    return false;
  }
  return true;
}
function safeMeasurementContext(): boolean {
  if (!safePublicUrl(new URL(window.location.href))) return false;
  try {
    const referrer = document.referrer && new URL(document.referrer);
    return !referrer || referrer.origin !== window.location.origin || safePublicUrl(referrer);
  } catch { return false; }
}

export function adsOptedOut(): boolean {
  if (pageOptOut === true) return true;
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return pageOptOut !== false; }
}

/** The timezone is a conservative device signal, not verified location. */
export function isUkAdsVisit(): boolean {
  try { return ['Europe/London', 'Europe/Belfast'].includes(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return false; }
}

/** A missing, unreadable, expired or malformed choice never grants permission. */
export function ukAdsChoice(now = Date.now()): 'accepted' | 'rejected' | 'unknown' {
  try {
    const raw = localStorage.getItem(UK_CONSENT_KEY);
    if (!raw || raw.length > 300) return 'unknown';
    const saved = JSON.parse(raw);
    return saved?.version === 1 && ['accepted', 'rejected'].includes(saved.choice)
      && Number.isFinite(saved.at) && saved.at <= now && now - saved.at < CONSENT_LIFETIME
      && typeof saved.revision === 'string' && /^[a-f\d-]{36}$/i.test(saved.revision) ? saved.choice : 'unknown';
  } catch { return 'unknown'; }
}

/** Binds asynchronous notices to this exact choice, including changes in another tab. Never sent or logged. */
export function adsMeasurementAuthority(): string {
  try { return `${privacyRevision}:${localStorage.getItem(UK_CONSENT_KEY) ?? ''}:${localStorage.getItem(OPT_OUT_KEY) ?? ''}`; } catch { return `${privacyRevision}:unavailable`; }
}

/** GPC and opt-out always win; UK devices additionally require prior advertising consent. */
export function adsMeasurementAllowed(): boolean {
  if (typeof window === 'undefined' || navigator.globalPrivacyControl === true || adsOptedOut()) return false;
  try { const zone = Intl.DateTimeFormat().resolvedOptions().timeZone; return !!zone && !europeanZones.test(zone) && (!['Europe/London', 'Europe/Belfast'].includes(zone) || ukAdsChoice() === 'accepted'); } catch { return false; }
}

/** Revoke old work before notifying UI consumers, including after a cross-tab privacy change. */
export function refreshAdsMeasurement(): void {
  privacyRevision += 1;
  revokePending();
  if (!adsMeasurementAllowed()) {
    try { localStorage.removeItem(META_CHECKOUT_PENDING_KEY); } catch { /* no new notices can run */ }
  }
  try { window.fbq?.('consent', adsMeasurementAllowed() ? 'grant' : 'revoke'); } catch { /* a third-party error never blocks withdrawal */ }
  window.dispatchEvent(new Event(ADS_MEASUREMENT_CHANGED));
}

export function isAdsChoiceStorageKey(key: string | null): boolean {
  return key === null || key === UK_CONSENT_KEY || key === OPT_OUT_KEY;
}

export function setAdsOptOut(optOut: boolean): void {
  pageOptOut = optOut;
  try { if (optOut) localStorage.setItem(OPT_OUT_KEY, '1'); else localStorage.removeItem(OPT_OUT_KEY); } catch { /* the choice applies to this page only */ }
  refreshAdsMeasurement();
}

/** Only called by the informed UK Allow/Reject controls, never by signup, ad clicks or payment. */
export function setUkAdsConsent(accepted: boolean): boolean {
  if (!isUkAdsVisit() || accepted && navigator.globalPrivacyControl === true) return false;
  try {
    localStorage.setItem(UK_CONSENT_KEY, JSON.stringify({ version: 1, choice: accepted ? 'accepted' : 'rejected', at: Date.now(), revision: crypto.randomUUID() }));
    if (accepted) localStorage.removeItem(OPT_OUT_KEY); else localStorage.setItem(OPT_OUT_KEY, '1');
    pageOptOut = !accepted;
  } catch {
    pageOptOut = true;
    refreshAdsMeasurement();
    return !accepted;
  }
  refreshAdsMeasurement();
  return !accepted || adsMeasurementAllowed();
}

function ensurePixel(): Fbq | null {
  if (!import.meta.env.PROD || !adsMeasurementAllowed() || !safeMeasurementContext()) return null;
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

/** Manual public PageViews use Meta's trackSingle API with automatic history disabled. */
export function trackMetaPage(pathname: string): void {
  if (pathname !== window.location.pathname || !isMeasuredPath(pathname) || !safeMeasurementContext()) return;
  const fbq = ensurePixel();
  if (!fbq) return;
  if (fbq.jobvanceLastPage !== pathname) {
    fbq.jobvanceLastPage = pathname;
    fbq('trackSingle', META_PIXEL_ID, 'PageView');
  }
  flushRegistration(fbq);
}

/**
 * The sign-up form passed validation and was submitted. A browser-only funnel-intent signal, sent before email confirmation:
 * it is not a registration and has no server copy, so it never touches `CompleteRegistration` or its `reg_` event ID.
 * It takes exactly the PageView gating (production build, no opt-out, no GPC, not Europe, safe public URL and referrer),
 * is sent once per submit attempt, and carries no parameters at all (no name, email, phone, password or attempt ID).
 */
export function trackMetaSignupSubmitted(attemptId: string): boolean {
  if (!attemptId) return false;
  try {
    const fbq = ensurePixel();
    if (!fbq || fbq.jobvanceSignupAttempts?.includes(attemptId)) return false;
    fbq.jobvanceSignupAttempts = [...(fbq.jobvanceSignupAttempts ?? []), attemptId].slice(-20);
    fbq('trackSingleCustom', META_PIXEL_ID, 'SignupSubmitted');
    return true;
  } catch { return false; } // Measurement must never get in the way of creating an account.
}

async function accountKey(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function sentKeys(): string[] {
  try { const value = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(-20) : []; } catch { return []; }
}

function flushRegistration(fbq: Fbq): void {
  const scope = pendingRegistration;
  if (!scope || !current(scope) || !safeMeasurementContext() || sentKeys().includes(scope.key)) return;
  pendingRegistration = null;
  const { key } = scope;
  // The server copy uses the same event ID, so Meta counts this sign-up once.
  fbq('track', 'CompleteRegistration', {}, { eventID: `reg_${key}` });
  try { localStorage.setItem(SENT_KEY, JSON.stringify([...sentKeys(), key].slice(-20))); } catch { /* may repeat on this device only */ }
  sendServerRegistration(scope);
}

export const metaCookie = (name: '_fbp' | '_fbc') => adsMeasurementAllowed() ? document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) : undefined;

/** Asks the meta-conversions function for the server copy once Meta has set its cookies. */
function sendServerRegistration(scope: RegistrationScope, delay = 2000): void {
  const pageUrl = `${window.location.origin}${window.location.pathname}`; // the public page, even if the visitor moves on
  const timer = window.setTimeout(() => {
    timers.delete(timer);
    if (!current(scope) || !scope.sessionId) return;
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      const session = data.session;
      if (error || !session || !current(scope) || session.user.id !== scope.owner || cvVariantSessionIdentity(session) !== scope.sessionId) return;
      const body = { pageUrl, fbp: metaCookie('_fbp'), fbc: metaCookie('_fbc') };
      // Bind the verified original session; a later SDK auth switch cannot substitute another owner.
      await supabase.functions.invoke('meta-conversions', { body, headers: { Authorization: `Bearer ${session.access_token}` } });
    })().catch(() => undefined);
  }, delay);
  timers.add(timer);
}

/** A signed-in account created in the last day counts as a sign-up once per device. */
export async function noteAccountForMeta(user: { id: string; created_at?: string } | null | undefined, now = Date.now(), sessionId: string | null = null): Promise<void> {
  const owner = user?.id ?? null;
  if (authority.owner !== owner || authority.sessionId !== sessionId) {
    revokePending();
    authority = { owner, sessionId, epoch: authority.epoch };
  }
  if (!user?.created_at || !adsMeasurementAllowed()) return;
  const created = Date.parse(user.created_at);
  if (!Number.isFinite(created) || now - created > NEW_ACCOUNT_WINDOW || created - now > 5 * 60 * 1000) return;
  const original = { owner: user.id, sessionId, epoch: authority.epoch, key: '', privacy: adsMeasurementAuthority() };
  const key = await accountKey(user.id);
  if (!current(original) || sentKeys().includes(key)) return;
  pendingRegistration = { ...original, key };
  // Sent now from a public page; otherwise on the next one (never from a private page).
  if (isMeasuredPath(window.location.pathname)) { const fbq = ensurePixel(); if (fbq) flushRegistration(fbq); }
}
