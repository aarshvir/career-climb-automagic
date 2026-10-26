import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { cvVariantSessionIdentity } from '@/lib/loop-cv-variant-recovery';
import { cleanTrackContext } from '../../supabase/functions/_shared/jobvance-track';

/** Best-effort measurement: immutable original actor/visit, credentials in memory only,
 * and incremental visible time belonging to a particular page exposure. */
type Kind = 'page_view' | 'page_leave' | 'click' | 'form_submit' | 'identify';
interface TrackedEvent { id: string; pageId: string; kind: Kind; at: string; path: string; title?: string; label?: string; href?: string; durationMs?: number; props?: { maxScroll?: number; hidden?: boolean } }
interface Actor { key: string; userId: string | null; token: string | null; verified: boolean }
interface Segment { visitorId: string; sessionId: string; actor: Actor | null; context: Record<string, string | boolean>; last: number; events: TrackedEvent[] }
interface Page { id: string; path: string; segment: Segment; visibleSince: number | null; visibleMs: number; maxScroll: number }
interface Pending { visitorId: string; sessionId: string; batchId: string; context: Segment['context']; events: TrackedEvent[]; actor: Actor; attempts: number; created: number; due: number }
const VISITOR = 'jv_visitor_v2', VISIT = 'jv_visit_v2', IDLE_MS = 30 * 60_000, FLUSH_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEPT_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'audience', 'mode', 'plan', 'loopPlan', 'tab', 'days'];
let started = false, run = 0, revision = 0, actor: Actor | null = null, segment: Segment | null = null, page: Page | null = null;
let lastLocation: { pathname: string; search: string } | null = null, timer: number | undefined, sending = false;
const pending: Pending[] = [], disposers: Array<() => void> = [];
const uuid = () => crypto.randomUUID();
const text = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
function read(key: string, tab = false): unknown { try { return JSON.parse((tab ? window.sessionStorage : window.localStorage).getItem(key) ?? 'null'); } catch { return null; } }
function write(key: string, value: unknown, tab = false) { try { (tab ? window.sessionStorage : window.localStorage).setItem(key, JSON.stringify(value)); } catch { /* IDs remain available in memory. */ } }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function endpoint(): string | null { const base = import.meta.env.VITE_SUPABASE_URL as string | undefined; return base && /^https:\/\//.test(base) ? `${base.replace(/\/$/, '')}/functions/v1/jobvance-track` : null; }

export function cleanPath(value: { pathname: string; search: string }): string {
  let path = value.pathname.startsWith('/') && !value.pathname.startsWith('//') ? value.pathname.replace(/[\u0000-\u001f\u007f\\#]/g, '') : '/';
  if (path.length > 250) path = '/';
  const source = new URLSearchParams(value.search), kept = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const item = text(source.get(key) ?? '', 100);
    if (!item) continue;
    kept.set(key, item);
    if (path.length + kept.toString().length + 1 > 300) kept.delete(key);
  }
  return path + (kept.size ? `?${kept}` : '');
}
function destination(raw: string): string | undefined {
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') return url.protocol;
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    if (url.host === window.location.host) return cleanPath(url);
    const result = `${url.host}${url.pathname}`;
    if (result.length <= 200 && !/[\u0000-\u001f\u007f\\]/.test(result)) return result;
  } catch { /* Malformed destinations are omitted. */ }
}
function visitContext(): Segment['context'] {
  const params = new URLSearchParams(window.location.search), result: Segment['context'] = { landing: cleanPath(lastLocation ?? window.location) };
  for (const key of KEPT_PARAMS.slice(0, 5)) { const value = text(params.get(key) ?? '', 100); if (value) result[key] = value; }
  if (params.has('fbclid')) result.fbclid = true;
  if (params.has('gclid')) result.gclid = true;
  try { if (document.referrer && new URL(document.referrer).host !== window.location.host) { const referrer = destination(document.referrer); if (referrer) result.referrer = referrer; } } catch { /* No usable external referrer. */ }
  result.screen = `${Math.min(99999, Math.max(0, Math.round(window.screen?.width ?? 0)))}x${Math.min(99999, Math.max(0, Math.round(window.screen?.height ?? 0)))}`;
  return result;
}
function persist() {
  if (segment?.actor) write(VISIT, { id: segment.sessionId, visitorId: segment.visitorId, actorKey: segment.actor.key, last: segment.last, context: segment.context }, true);
}
function createSegment(next: Actor | null, now: number, rotate = false, initial = false): Segment {
  const saved = read(VISITOR);
  let visitorId = segment?.visitorId ?? uuid();
  if (next) {
    const eligible = record(saved) && typeof saved.id === 'string' && UUID.test(saved.id) && (saved.ownerId === next.userId || saved.ownerId === null && next.verified);
    visitorId = !rotate && eligible ? String(saved.id) : !rotate && segment ? segment.visitorId : uuid();
    write(VISITOR, { id: visitorId, ownerId: next.userId });
  }
  let sessionId: string = uuid(), context = visitContext();
  const visit = initial && next ? read(VISIT, true) : null;
  const savedContext = record(visit) ? cleanTrackContext(visit.context) : null;
  if (record(visit) && typeof visit.id === 'string' && UUID.test(visit.id) && visit.visitorId === visitorId && visit.actorKey === next?.key && typeof visit.last === 'number' && visit.last <= now && now - visit.last < IDLE_MS && savedContext) {
    sessionId = visit.id; context = savedContext;
  }
  return { visitorId, sessionId, actor: next, context, last: now, events: [] };
}
function schedule(delay = FLUSH_MS) {
  if (!started || timer !== undefined) return;
  timer = window.setTimeout(() => { timer = undefined; seal(); void dispatch(); }, Math.max(1, delay));
}
function seal(target = segment) {
  if (!target?.actor) return;
  while (target.events.length) {
    const events = target.events.splice(0, 25);
    pending.push({ visitorId: target.visitorId, sessionId: target.sessionId, batchId: uuid(), context: { ...target.context }, events, actor: target.actor, attempts: 0, created: Date.now(), due: 0 });
    if (pending.length > 32) pending.shift();
  }
}
function acknowledged(value: unknown, batch: Pending) {
  return record(value) && Object.keys(value).length === 4 && value.batchId === batch.batchId && value.accepted === batch.events.length && typeof value.duplicate === 'boolean' && Number.isSafeInteger(value.inserted) && Number(value.inserted) >= 0 && Number(value.inserted) <= batch.events.length;
}
async function dispatch(leaving = false) {
  if (!started || sending || !endpoint()) return;
  sending = true;
  const thisRun = run;
  try {
    while (started && thisRun === run && pending.length) {
      const batch = pending[0], now = Date.now();
      if (now - batch.created >= IDLE_MS || batch.attempts >= 8) { pending.shift(); continue; }
      if (batch.due > now && !leaving) { schedule(batch.due - now); break; }
      const body = JSON.stringify({ visitorId: batch.visitorId, sessionId: batch.sessionId, batchId: batch.batchId, token: batch.actor.token, context: batch.context, events: batch.events });
      if (new TextEncoder().encode(body).length > 65536) { pending.shift(); continue; }
      batch.attempts++;
      let delivered = false, terminal = false;
      const controller = new AbortController();
      let deadline: number | undefined;
      try {
        const request = (async () => {
          const response = await fetch(endpoint()!, { method: 'POST', body, keepalive: true, signal: controller.signal, headers: { 'Content-Type': 'text/plain' } });
          return { status: response.status, value: await response.json().catch(() => null) as unknown };
        })();
        const timeout = new Promise<never>((_resolve, reject) => { deadline = window.setTimeout(() => { controller.abort(); reject(new Error('Measurement acknowledgement timed out')); }, 15_000); });
        const response = await Promise.race([request, timeout]);
        if (!started || thisRun !== run) return;
        const value = response.value;
        delivered = response.status === 200 && acknowledged(value, batch);
        terminal = [400, 401, 403, 409, 413].includes(response.status) || response.status === 202 && record(value) && value.ignored === true && value.reason === 'bot';
      } catch { /* An ambiguous attempt retries the same immutable batch. */ }
      finally { window.clearTimeout(deadline); }
      if (!started || thisRun !== run) return;
      if (pending[0] !== batch) continue;
      if (delivered || terminal) { pending.shift(); continue; }
      batch.due = Date.now() + Math.min(60_000, 1000 * 2 ** (batch.attempts - 1));
      schedule(batch.due - Date.now()); break;
    }
  } finally { if (thisRun === run) sending = false; }
}
function emit(target: Segment, pageId: string, event: Omit<TrackedEvent, 'id' | 'pageId' | 'at'>) {
  target.events.push({ ...event, id: uuid(), pageId, at: new Date().toISOString() });
  if (!target.actor && target.events.length > 100) target.events.shift();
  if (target.actor && target.events.length >= 25) { seal(target); void dispatch(); }
  else schedule();
}
function reportTime(hidden = false, now = Date.now()) {
  if (!page) return;
  const elapsed = page.visibleMs + (page.visibleSince === null ? 0 : Math.max(0, now - page.visibleSince));
  emit(page.segment, page.id, { kind: 'page_leave', path: page.path, durationMs: Math.min(86_400_000, Math.round(elapsed)), props: { maxScroll: page.maxScroll, hidden } });
  page.visibleMs = 0; page.visibleSince = hidden ? null : now;
}
function closePage(now = Date.now()) { if (page) reportTime(false, now); page = null; }
function publicPath(path: string) { return !/^\/(loop|dashboard|onboarding|applications|workspace|account|auth|check)(?:[/?]|$)/.test(path); }
function openPage(now = Date.now()) {
  if (!segment || !lastLocation || lastLocation.pathname.startsWith('/admin')) return;
  const path = cleanPath(lastLocation);
  page = { id: uuid(), path, segment, visibleSince: document.visibilityState === 'hidden' ? null : now, visibleMs: 0, maxScroll: 0 };
  const title = publicPath(path) ? text(document.title, 160) : 'Account page';
  emit(segment, page.id, { kind: 'page_view', path, ...(title ? { title } : {}) });
}
function activity(now = Date.now()) {
  if (!segment) return;
  if (now - segment.last >= IDLE_MS) { closePage(now); seal(); segment = createSegment(actor, now); openPage(now); }
  segment.last = now; persist();
}
function observeSession(next: Session | null) {
  if (!started) return;
  const marker = cvVariantSessionIdentity(next);
  const nextActor: Actor = next && marker ? { key: `${next.user.id}:${marker}`, userId: next.user.id, token: next.access_token, verified: true }
    : next ? { key: `unattributed:${uuid()}`, userId: null, token: null, verified: false } : { key: 'anonymous', userId: null, token: null, verified: true };
  if (actor?.key === nextActor.key) { actor.token = nextActor.token; return; }
  const now = Date.now(), initial = actor === null;
  if (initial) {
    const provisional = segment;
    segment = createSegment(nextActor, now, !nextActor.verified, true);
    if (provisional) { segment.events = provisional.events; if (page?.segment === provisional) page.segment = segment; }
  } else {
    closePage(now); seal();
    const firstLogin = actor?.userId === null && actor.verified && nextActor.userId !== null;
    segment = createSegment(nextActor, now, (!firstLogin && actor?.userId !== nextActor.userId) || !nextActor.verified);
  }
  actor = nextActor; persist();
  if (!initial) openPage(now);
  if (nextActor.userId && segment && lastLocation && !lastLocation.pathname.startsWith('/admin')) emit(segment, page?.id ?? uuid(), { kind: 'identify', path: cleanPath(lastLocation), label: 'Signed in' });
  seal(); void dispatch();
}
function describe(element: Element): { label: string; href?: string } {
  const label = !publicPath(page?.path ?? '/') ? element.tagName.toLowerCase() : text(element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || element.tagName, 100);
  const anchor = element.closest('a'), href = anchor ? destination(anchor.getAttribute('href') ?? '') : undefined;
  return { label: label || 'Control', ...(href ? { href } : {}) };
}

/** Synchronous route boundaries keep rapid routes and Back clicks in their own exposure. */
export function trackPage(next: { pathname: string; search: string }) {
  if (!started) return;
  const now = Date.now(), path = cleanPath(next);
  lastLocation = { ...next }; activity(now);
  if (page?.path === path) return;
  closePage(now); openPage(now);
}
/** Idempotent startup. A failed bootstrap remains unknown until an SDK callback confirms it. */
export function startAnalytics({ inTests = false } = {}) {
  if (started || typeof window === 'undefined' || !endpoint() || import.meta.env.MODE === 'test' && !inTests) return;
  started = true; run++; revision = 0; actor = null; lastLocation = { pathname: window.location.pathname, search: window.location.search };
  segment = createSegment(null, Date.now());
  const thisRun = run, bootstrapRevision = revision;
  const subscription = supabase.auth.onAuthStateChange((_event, next) => { if (started && run === thisRun) { revision++; observeSession(next); } });
  disposers.push(() => subscription.data.subscription.unsubscribe());
  void supabase.auth.getSession().then(({ data, error }) => { if (started && run === thisRun && revision === bootstrapRevision && !error) observeSession(data.session); }).catch(() => {});
  function listen(target: EventTarget, name: string, handler: EventListener, options?: AddEventListenerOptions) { target.addEventListener(name, handler, options); disposers.push(() => target.removeEventListener(name, handler, options)); }
  listen(document, 'click', event => {
    const target = event.target instanceof Element ? event.target.closest('a, button, [role="button"], summary, label, select, input[type="checkbox"], input[type="radio"], input[type="submit"]') : null;
    if (!target || !page || target.closest('[data-analytics="off"]')) return;
    activity(); if (page) emit(page.segment, page.id, { kind: 'click', path: page.path, ...describe(target) });
  }, { capture: true });
  listen(document, 'submit', event => {
    const form = event.target instanceof Element ? event.target : null;
    if (!form || !page || form.closest('[data-analytics="off"]')) return;
    activity(); if (page) emit(page.segment, page.id, { kind: 'form_submit', path: page.path, label: publicPath(page.path) ? text(form.getAttribute('aria-label') || 'Form', 100) || 'Form' : 'Form' });
  }, { capture: true });
  listen(window, 'scroll', () => {
    if (!page) return;
    activity(); if (!page) return;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    page.maxScroll = Math.max(page.maxScroll, height > 0 ? Math.min(100, Math.max(0, Math.round(window.scrollY / height * 100))) : 100);
  }, { passive: true });
  listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') { reportTime(true); seal(); void dispatch(true); }
    else { activity(); if (page) page.visibleSince = Date.now(); else openPage(); }
  });
  listen(window, 'pagehide', () => { closePage(); seal(); void dispatch(true); });
  listen(window, 'pageshow', event => { if ((event as PageTransitionEvent).persisted) { activity(); if (!page) openPage(); } });
}
/** Clears listeners, pending requests and ephemeral credentials; useful for an app teardown. */
export function stopAnalytics() {
  started = false; run++; window.clearTimeout(timer); timer = undefined;
  disposers.splice(0).forEach(dispose => dispose());
  pending.length = 0; page = null; segment = null; actor = null; lastLocation = null; sending = false;
}
