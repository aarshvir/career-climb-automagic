// Server copy of the browser's Meta Pixel CompleteRegistration event (Conversions API).
// Pure helpers without network or environment access; the function supplies the request facts.
export const META_PIXEL_ID = '1912745166266087';
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;
const SITE_ORIGIN = 'https://jobvance.io';

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Must equal the browser's eventID (src/lib/meta-pixel.ts) so Meta counts the sign-up once. */
export async function registrationEventId(userId: string): Promise<string> {
  return `reg_${(await sha256Hex(userId)).slice(0, 32)}`;
}

/** The page's origin and path only; query strings and fragments are never sent. */
export function cleanSourceUrl(value: unknown): string {
  try {
    const url = new URL(String(value));
    return url.origin === SITE_ORIGIN && /^\/[a-z\d/-]{0,120}$/.test(url.pathname) ? `${SITE_ORIGIN}${url.pathname}` : `${SITE_ORIGIN}/`;
  } catch { return `${SITE_ORIGIN}/`; }
}

export function firstForwardedIp(header: string | null): string | null {
  const ip = header?.split(',')[0]?.trim() ?? '';
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || (/^[\da-f:]{2,39}$/i.test(ip) && ip.includes(':')) ? ip : null;
}

const meta = (value: unknown, pattern: RegExp) => typeof value === 'string' && value.length <= 600 && pattern.test(value) ? value : undefined;

export interface RegistrationFacts {
  userId: string; email?: string | null; createdAt?: string | null; pageUrl?: unknown; fbp?: unknown; fbc?: unknown;
  ip?: string | null; userAgent?: string | null; now: number;
}

/** A sign-up event for an account created in the last day, or null for an older account. */
export async function buildRegistrationEvent(facts: RegistrationFacts): Promise<Record<string, unknown> | null> {
  const created = Date.parse(facts.createdAt ?? '');
  if (!Number.isFinite(created) || facts.now - created > NEW_ACCOUNT_WINDOW_MS || created - facts.now > 5 * 60 * 1000) return null;
  const email = facts.email?.trim().toLowerCase();
  const userData: Record<string, unknown> = {
    external_id: [await sha256Hex(facts.userId)],
    ...(email && email.includes('@') ? { em: [await sha256Hex(email)] } : {}),
    ...(facts.ip ? { client_ip_address: facts.ip } : {}),
    ...(facts.userAgent && facts.userAgent.length <= 512 ? { client_user_agent: facts.userAgent } : {}),
    ...(meta(facts.fbp, /^fb\.\d\.\d{10,13}\.\d{1,20}$/) ? { fbp: facts.fbp } : {}),
    ...(meta(facts.fbc, /^fb\.\d\.\d{10,13}\.[\w-]{1,500}$/) ? { fbc: facts.fbc } : {}),
  };
  return {
    event_name: 'CompleteRegistration', event_time: Math.floor(facts.now / 1000), event_id: await registrationEventId(facts.userId),
    action_source: 'website', event_source_url: cleanSourceUrl(facts.pageUrl), user_data: userData,
  };
}
