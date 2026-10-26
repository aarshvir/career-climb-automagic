import { detectInAppBrowser } from '../../../src/lib/in-app-browser.ts';

/** Input checks for the analytics endpoint. Anything unexpected is dropped, never stored. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(['page_view', 'page_leave', 'click', 'form_submit', 'identify']);
const CONTEXT_KEYS = ['landing', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'screen'];
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime/i;

export interface TrackEvent { kind: string; at: string; path: string; title?: string; label?: string; href?: string; durationMs?: number; props?: Record<string, string | number | boolean> }
export interface TrackBatch { visitorId: string; sessionId: string; token: string | null; context: Record<string, string | boolean>; events: TrackEvent[] }

const short = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined;

export function cleanBatch(raw: unknown, now = Date.now()): TrackBatch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.visitorId !== 'string' || !UUID.test(body.visitorId) || typeof body.sessionId !== 'string' || !UUID.test(body.sessionId) || !Array.isArray(body.events)) return null;
  const events: TrackEvent[] = [];
  for (const item of body.events.slice(0, 60)) {
    if (!item || typeof item !== 'object') continue;
    const event = item as Record<string, unknown>;
    const at = typeof event.at === 'string' ? Date.parse(event.at) : NaN;
    if (!KINDS.has(String(event.kind)) || !Number.isFinite(at) || at > now + 5 * 60_000 || typeof event.path !== 'string' || !event.path.startsWith('/')) continue;
    const props: Record<string, string | number | boolean> = {};
    if (event.props && typeof event.props === 'object' && !Array.isArray(event.props)) {
      for (const [key, value] of Object.entries(event.props).slice(0, 10)) if (/^[a-zA-Z]{1,30}$/.test(key) && ['string', 'number', 'boolean'].includes(typeof value)) props[key] = typeof value === 'string' ? value.slice(0, 100) : value as number | boolean;
    }
    const duration = Number(event.durationMs);
    events.push({
      kind: String(event.kind), at: new Date(at).toISOString(), path: event.path.slice(0, 300),
      title: short(event.title, 160), label: short(event.label, 100), href: short(event.href, 200),
      durationMs: Number.isInteger(duration) && duration >= 0 ? Math.min(duration, 86_400_000) : undefined,
      props: Object.keys(props).length ? props : undefined,
    });
  }
  const context: Record<string, string | boolean> = {};
  if (body.context && typeof body.context === 'object' && !Array.isArray(body.context)) {
    const given = body.context as Record<string, unknown>;
    for (const key of CONTEXT_KEYS) { const value = short(given[key], 300); if (value) context[key] = value; }
    if (given.fbclid === true) context.fbclid = true;
    if (given.gclid === true) context.gclid = true;
  }
  const token = typeof body.token === 'string' && body.token.length < 4000 ? body.token : null;
  return { visitorId: body.visitorId.toLowerCase(), sessionId: body.sessionId.toLowerCase(), token, context, events };
}

export function describeDevice(userAgent: string, country: string | null) {
  const inApp = detectInAppBrowser(userAgent);
  const os = /iPhone|iPad|iPod/.test(userAgent) ? 'iOS' : /Android/.test(userAgent) ? 'Android' : /Windows/.test(userAgent) ? 'Windows' : /Macintosh|Mac OS X/.test(userAgent) ? 'macOS' : /CrOS/.test(userAgent) ? 'ChromeOS' : /Linux/.test(userAgent) ? 'Linux' : 'Other';
  const browser = inApp ?? (/Edg\//.test(userAgent) ? 'Edge' : /SamsungBrowser/.test(userAgent) ? 'Samsung Internet' : /OPR\//.test(userAgent) ? 'Opera' : /Firefox|FxiOS/.test(userAgent) ? 'Firefox' : /CriOS|Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Other');
  const device = /iPad|Tablet/.test(userAgent) ? 'tablet' : /Mobi|iPhone|Android/.test(userAgent) ? 'mobile' : 'desktop';
  return { device, browser, os, inApp, country: country && /^[A-Z]{2}$/.test(country) ? country : null };
}

export const isBot = (userAgent: string) => !userAgent || BOT.test(userAgent);
