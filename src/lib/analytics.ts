import { supabase } from '@/integrations/supabase/client';

/** First-party analytics: which pages each visitor opens, how many seconds they stay (while the tab
 * is visible), what they click, how far they scroll and which forms they submit. Typed values are
 * never read. Once someone signs in, their earlier anonymous visits are linked to the account. */
type Kind = 'page_view' | 'page_leave' | 'click' | 'form_submit' | 'identify';
interface TrackedEvent { kind: Kind; at: string; path: string; title?: string; label?: string; href?: string; durationMs?: number; props?: Record<string, string | number | boolean> }

const VISITOR = 'jv_vid', SESSION = 'jv_sid', IDLE_MS = 30 * 60_000, FLUSH_MS = 5_000, MAX_QUEUE = 25;
// URL parameters worth keeping; anything else (codes, tokens, emails) is dropped.
const KEPT_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'audience', 'mode', 'plan', 'loopPlan', 'tab', 'days'];

const uuid = () => crypto.randomUUID();
function stored(key: string, storage: Storage): string | null { try { return storage.getItem(key); } catch { return null; } }
function store(key: string, value: string, storage: Storage) { try { storage.setItem(key, value); } catch { /* private mode: the id lives for this page only */ } }

let visitorId = '', session = { id: '', last: 0, fresh: false }, token: string | null = null;
const queue: TrackedEvent[] = [];
let timer: number | undefined, started = false;
let page: { path: string; visibleSince: number | null; visibleMs: number; maxScroll: number } | null = null;
let context: Record<string, string | boolean> = {};

export function cleanPath(location: { pathname: string; search: string }): string {
  const params = new URLSearchParams(location.search), kept = new URLSearchParams();
  for (const key of KEPT_PARAMS) { const value = params.get(key); if (value) kept.set(key, value.slice(0, 100)); }
  const query = kept.toString();
  return `${location.pathname}${query ? `?${query}` : ''}`.slice(0, 300);
}

function touchSession(now = Date.now()) {
  if (!session.id || now - session.last > IDLE_MS) {
    const saved = (() => { try { return JSON.parse(stored(SESSION, localStorage) ?? 'null') as { id: string; last: number } | null; } catch { return null; } })();
    session = saved && now - saved.last <= IDLE_MS ? { id: saved.id, last: saved.last, fresh: false } : { id: uuid(), last: now, fresh: true };
  }
  session.last = now;
  store(SESSION, JSON.stringify({ id: session.id, last: now }), localStorage);
}

/** Where this visit came from: campaign tags, the ad click marker and the referring site. */
function visitContext(): Record<string, string | boolean> {
  const params = new URLSearchParams(location.search), result: Record<string, string | boolean> = { landing: cleanPath(location) };
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) { const value = params.get(key); if (value) result[key] = value.slice(0, 100); }
  if (params.has('fbclid')) result.fbclid = true;
  if (params.has('gclid')) result.gclid = true;
  try { const referrer = document.referrer ? new URL(document.referrer) : null; if (referrer && referrer.host !== location.host) result.referrer = `${referrer.host}${referrer.pathname}`.slice(0, 200); } catch { /* unreadable referrer */ }
  result.screen = `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`;
  return result;
}

function endpoint(): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return base && /^https:\/\//.test(base) ? `${base.replace(/\/$/, '')}/functions/v1/jobvance-track` : null;
}

function flush(leaving = false) {
  window.clearTimeout(timer); timer = undefined;
  const url = endpoint();
  if (!url || !queue.length) return;
  const events = queue.splice(0, 50);
  const body = JSON.stringify({ visitorId, sessionId: session.id, token, context: session.fresh ? context : undefined, events });
  session.fresh = false;
  // text/plain avoids a CORS preflight, so the request also survives the page closing.
  void fetch(url, { method: 'POST', body, keepalive: leaving || body.length < 60_000, headers: { 'Content-Type': 'text/plain' } }).catch(() => { /* analytics never blocks the page */ });
  if (queue.length) flush(leaving);
}

function push(event: Omit<TrackedEvent, 'at'>) {
  touchSession();
  queue.push({ ...event, at: new Date().toISOString() });
  if (queue.length >= MAX_QUEUE) flush(); else if (!timer) timer = window.setTimeout(() => flush(), FLUSH_MS);
}

function visibleTime(now = Date.now()) { return page ? page.visibleMs + (page.visibleSince === null ? 0 : now - page.visibleSince) : 0; }

function leavePage(leaving: boolean) {
  if (!page) return;
  push({ kind: 'page_leave', path: page.path, durationMs: Math.round(visibleTime()), props: { maxScroll: page.maxScroll } });
  page = null;
  if (leaving) flush(true);
}

/** Call on every route change. */
export function trackPage(location: { pathname: string; search: string }) {
  if (!started || location.pathname.startsWith('/admin')) { if (started) leavePage(false); return; }
  const path = cleanPath(location);
  if (page?.path === path) return;
  leavePage(false);
  page = { path, visibleSince: document.visibilityState === 'visible' ? Date.now() : null, visibleMs: 0, maxScroll: 0 };
  push({ kind: 'page_view', path, title: document.title.slice(0, 160) });
}

function describe(element: Element): { label: string; href?: string } {
  const text = (element.getAttribute('aria-label') || (element as HTMLElement).innerText || element.textContent || element.getAttribute('title') || element.getAttribute('name') || element.tagName).replace(/\s+/g, ' ').trim().slice(0, 100);
  const anchor = element.closest('a');
  let href: string | undefined;
  if (anchor?.href) { try { const target = new URL(anchor.href); href = target.host === location.host ? cleanPath(target) : `${target.protocol === 'mailto:' || target.protocol === 'tel:' ? target.protocol : ''}${target.host}${target.pathname}`.slice(0, 200); } catch { /* unusual link */ } }
  return { label: text, href };
}

/** Starts tracking once per page load. Safe to call more than once. */
export function startAnalytics({ inTests = false } = {}) {
  // Automated tests render the whole app; they only record when a test asks for it.
  if (started || typeof window === 'undefined' || !endpoint() || import.meta.env.MODE === 'test' && !inTests) return;
  started = true;
  visitorId = stored(VISITOR, localStorage) ?? uuid();
  store(VISITOR, visitorId, localStorage);
  touchSession(); context = visitContext();
  void supabase.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null; }).catch(() => {});
  supabase.auth.onAuthStateChange((_event, next) => {
    const signedIn = !token && !!next?.access_token;
    token = next?.access_token ?? null;
    // Link this visitor to the account straight away, so earlier visits join it.
    if (signedIn) { push({ kind: 'identify', path: page?.path ?? cleanPath(location), label: 'Signed in' }); flush(); }
  });
  document.addEventListener('click', event => {
    const target = (event.target as Element | null)?.closest('a, button, [role="button"], summary, label, select, input[type="checkbox"], input[type="radio"], input[type="submit"]');
    if (!target || !page || target.closest('[data-analytics="off"]')) return;
    push({ kind: 'click', path: page.path, ...describe(target) });
  }, { capture: true });
  document.addEventListener('submit', event => {
    const form = event.target as HTMLFormElement;
    if (!page || form.closest('[data-analytics="off"]')) return;
    const heading = form.getAttribute('aria-label') || form.querySelector('h1, h2, h3, legend')?.textContent || form.closest('section, main')?.querySelector('h1, h2, h3')?.textContent || 'Form';
    push({ kind: 'form_submit', path: page.path, label: heading.replace(/\s+/g, ' ').trim().slice(0, 100) });
  }, { capture: true });
  window.addEventListener('scroll', () => {
    if (!page) return;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const depth = height > 0 ? Math.min(100, Math.round(window.scrollY / height * 100)) : 100;
    if (depth > page.maxScroll) page.maxScroll = depth;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!page) return;
    if (document.visibilityState === 'hidden') {
      if (page.visibleSince !== null) { page.visibleMs += Date.now() - page.visibleSince; page.visibleSince = null; }
      // Report time so far; the page stays open in case the visitor comes back.
      push({ kind: 'page_leave', path: page.path, durationMs: Math.round(page.visibleMs), props: { maxScroll: page.maxScroll, hidden: true } });
      page.visibleMs = 0;
      flush(true);
    } else { page.visibleSince = Date.now(); touchSession(); }
  });
  window.addEventListener('pagehide', () => leavePage(true));
}
