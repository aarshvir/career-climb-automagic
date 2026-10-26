import { detectInAppBrowser } from '../../../src/lib/in-app-browser.ts';

export const TRACK_MAX_BYTES = 64 * 1024;
export const TRACK_MAX_EVENTS = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(['page_view', 'page_leave', 'click', 'form_submit', 'identify']);
const PATH_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'audience', 'mode', 'plan', 'loopPlan', 'tab', 'days']);
const CONTEXT_KEYS = new Set(['landing', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'screen', 'fbclid', 'gclid']);
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime/i;
const own = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export interface TrackEvent {
  id: string; pageId: string; kind: 'page_view' | 'page_leave' | 'click' | 'form_submit' | 'identify'; at: string; path: string;
  title?: string; label?: string; href?: string; durationMs?: number; props?: { maxScroll?: number; hidden?: boolean };
}
export interface TrackBatch {
  visitorId: string; sessionId: string; batchId: string; token: string | null;
  context: Record<string, string | boolean>; events: TrackEvent[];
}
export interface TrackAcknowledgement { batchId: string; accepted: number; inserted: number; duplicate: boolean }

function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every(key => own(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

/** A measurement URL is already sanitized, never a second source of query or contact data. */
export function safeTrackPath(value: unknown): value is string {
  if (!text(value, 300) || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('#')) return false;
  try {
    const url = new URL(value, 'https://measurement.invalid');
    if (url.origin !== 'https://measurement.invalid' || url.pathname !== value.split('?')[0] || /[\u0000-\u001f\u007f\\]/.test(decodeURIComponent(url.pathname))) return false;
    const seen = new Set<string>();
    for (const [key, item] of url.searchParams) {
      if (!PATH_PARAMS.has(key) || seen.has(key) || !text(item, 100)) return false;
      seen.add(key);
    }
    return true;
  } catch { return false; }
}

function safeDestination(value: unknown, max = 200): value is string {
  if (!text(value, max)) return false;
  if (value === 'mailto:' || value === 'tel:') return true;
  if (value.startsWith('/')) return safeTrackPath(value);
  if (value.includes('\\')) return false;
  try {
    const explicit = value.startsWith('https://');
    if (!explicit && value.includes(':')) return false;
    const url = new URL(explicit ? value : 'https://' + value);
    return url.protocol === 'https:' && !!url.hostname && (url.hostname.includes('.') || url.hostname === 'localhost') && !url.username && !url.password && !url.search && !url.hash && !/[\u0000-\u001f\u007f\\]/.test(decodeURIComponent(url.pathname));
  } catch { return false; }
}

/** A restored visit must satisfy the same immutable context contract as a fresh request. */
export function cleanTrackContext(raw: unknown): Record<string, string | boolean> | null {
  if (!object(raw) || !safeTrackPath(raw.landing) || Object.keys(raw).some(key => !CONTEXT_KEYS.has(key))) return null;
  const context: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'fbclid' || key === 'gclid') { if (value !== true) return null; }
    else if (key === 'landing') { if (!safeTrackPath(value)) return null; }
    else if (key === 'referrer') { if (!safeDestination(value) || value === 'mailto:' || value === 'tel:') return null; }
    else if (key === 'screen') { if (typeof value !== 'string' || !/^\d{1,5}x\d{1,5}$/.test(value)) return null; }
    else if (!text(value, 100)) return null;
    context[key] = value as string | boolean;
  }
  return context;
}

/** Admit the entire immutable batch or none of it. No slicing, coercion or partial filtering. */
export function cleanBatch(raw: unknown, now = Date.now()): TrackBatch | null {
  if (!object(raw) || !keys(raw, ['visitorId', 'sessionId', 'batchId', 'token', 'context', 'events'])) return null;
  if (!uuid(raw.visitorId) || !uuid(raw.sessionId) || !uuid(raw.batchId) || !(raw.token === null || text(raw.token, 8192) && !/\s/.test(raw.token))) return null;
  const context = cleanTrackContext(raw.context);
  if (!context) return null;
  if (!Array.isArray(raw.events) || raw.events.length < 1 || raw.events.length > TRACK_MAX_EVENTS) return null;
  const ids = new Set<string>(), events: TrackEvent[] = [];
  for (const event of raw.events) {
    if (!object(event) || !keys(event, ['id', 'pageId', 'kind', 'at', 'path'], ['title', 'label', 'href', 'durationMs', 'props'])) return null;
    if (!uuid(event.id) || !uuid(event.pageId) || typeof event.kind !== 'string' || !KINDS.has(event.kind) || !safeTrackPath(event.path)) return null;
    const id = event.id.toLowerCase(); if (ids.has(id)) return null; ids.add(id);
    const at = typeof event.at === 'string' ? Date.parse(event.at) : NaN;
    if (!Number.isFinite(at) || new Date(at).toISOString() !== event.at || at < now - 86_400_000 || at > now + 300_000) return null;
    if (own(event, 'title') && !text(event.title, 160) || own(event, 'label') && !text(event.label, 100) || own(event, 'href') && !safeDestination(event.href)) return null;
    if (own(event, 'durationMs') && (event.kind !== 'page_leave' || !Number.isSafeInteger(event.durationMs) || Number(event.durationMs) < 0 || Number(event.durationMs) > 86_400_000)) return null;
    if (event.kind === 'page_leave' && !own(event, 'durationMs')) return null;
    if (own(event, 'props')) {
      if (!object(event.props) || Object.keys(event.props).some(key => key !== 'maxScroll' && key !== 'hidden')) return null;
      if (own(event.props, 'maxScroll') && (typeof event.props.maxScroll !== 'number' || !Number.isFinite(event.props.maxScroll) || event.props.maxScroll < 0 || event.props.maxScroll > 100)) return null;
      if (own(event.props, 'hidden') && typeof event.props.hidden !== 'boolean') return null;
    }
    events.push({ ...event, id, pageId: event.pageId.toLowerCase() } as unknown as TrackEvent);
  }
  return { visitorId: raw.visitorId.toLowerCase(), sessionId: raw.sessionId.toLowerCase(), batchId: raw.batchId.toLowerCase(), token: raw.token as string | null, context, events };
}

/** The client only receives an actual, exact RPC acknowledgement for this admitted batch. */
export function trackAcknowledgement(value: unknown, batch: TrackBatch): TrackAcknowledgement | null {
  if (!object(value) || !keys(value, ['batchId', 'accepted', 'inserted', 'duplicate']) || value.batchId !== batch.batchId || value.accepted !== batch.events.length || !Number.isSafeInteger(value.inserted) || Number(value.inserted) < 0 || Number(value.inserted) > batch.events.length || typeof value.duplicate !== 'boolean') return null;
  return value as unknown as TrackAcknowledgement;
}

export function describeDevice(userAgent: string, country: string | null) {
  const inApp = detectInAppBrowser(userAgent);
  const os = /iPhone|iPad|iPod/.test(userAgent) ? 'iOS' : /Android/.test(userAgent) ? 'Android' : /Windows/.test(userAgent) ? 'Windows' : /Macintosh|Mac OS X/.test(userAgent) ? 'macOS' : /CrOS/.test(userAgent) ? 'ChromeOS' : /Linux/.test(userAgent) ? 'Linux' : 'Other';
  const browser = inApp ?? (/Edg\//.test(userAgent) ? 'Edge' : /SamsungBrowser/.test(userAgent) ? 'Samsung Internet' : /OPR\//.test(userAgent) ? 'Opera' : /Firefox|FxiOS/.test(userAgent) ? 'Firefox' : /CriOS|Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Other');
  const device = /iPad|Tablet/.test(userAgent) ? 'tablet' : /Mobi|iPhone|Android/.test(userAgent) ? 'mobile' : 'desktop';
  return { device, browser, os, inApp, country: country && /^[A-Z]{2}$/.test(country) ? country : null };
}

export const isBot = (userAgent: string) => !userAgent || BOT.test(userAgent);
