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

export interface PersonFacts {
  userId: string; email?: string | null; pageUrl?: unknown; fbp?: unknown; fbc?: unknown;
  ip?: string | null; userAgent?: string | null; now: number;
}
export interface RegistrationFacts extends PersonFacts { createdAt?: string | null }

/** Hashed identifiers Meta uses to match the person; nothing else about them is sent. */
async function buildUserData(facts: PersonFacts): Promise<Record<string, unknown>> {
  const email = facts.email?.trim().toLowerCase();
  return {
    external_id: [await sha256Hex(facts.userId)],
    ...(email && email.includes('@') ? { em: [await sha256Hex(email)] } : {}),
    ...(facts.ip ? { client_ip_address: facts.ip } : {}),
    ...(facts.userAgent && facts.userAgent.length <= 512 ? { client_user_agent: facts.userAgent } : {}),
    ...(meta(facts.fbp, /^fb\.\d\.\d{10,13}\.\d{1,20}$/) ? { fbp: facts.fbp } : {}),
    ...(meta(facts.fbc, /^fb\.\d\.\d{10,13}\.[\w-]{1,500}$/) ? { fbc: facts.fbc } : {}),
  };
}

/** A sign-up event for an account created in the last day, or null for an older account. */
export async function buildRegistrationEvent(facts: RegistrationFacts): Promise<Record<string, unknown> | null> {
  const created = Date.parse(facts.createdAt ?? '');
  if (!Number.isFinite(created) || facts.now - created > NEW_ACCOUNT_WINDOW_MS || created - facts.now > 5 * 60 * 1000) return null;
  return {
    event_name: 'CompleteRegistration', event_time: Math.floor(facts.now / 1000), event_id: await registrationEventId(facts.userId),
    action_source: 'website', event_source_url: cleanSourceUrl(facts.pageUrl), user_data: await buildUserData(facts),
  };
}

export type CommerceKind = 'checkout' | 'purchase';

/** Stable per order or payment, so a retried send is counted by Meta once. */
export async function commerceEventId(kind: CommerceKind, key: string): Promise<string> {
  return `${kind === 'purchase' ? 'pur' : 'chk'}_${(await sha256Hex(key)).slice(0, 32)}`;
}

/** What jobvance_meta_claim_purchases returns for one first paid cycle. */
export interface PurchaseRow {
  event_key: string; occurred_at: string; plan_label: string; amount_minor: number | string; currency: string; usd: number | string | null;
}

const ZERO_DECIMAL_CURRENCIES = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

/** Dollars when the ledger proves them, otherwise the charged amount in its own currency (Meta converts). */
export function purchaseValue(row: Pick<PurchaseRow, 'amount_minor' | 'currency' | 'usd'>): { value: number; currency: string } | null {
  const usd = row.usd === null || row.usd === undefined ? NaN : Number(row.usd);
  if (Number.isFinite(usd) && usd > 0) return { value: Math.round(usd * 100) / 100, currency: 'USD' };
  const currency = String(row.currency ?? '').toUpperCase();
  const minor = Number(row.amount_minor);
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(minor) || minor <= 0) return null;
  return { value: Math.round((ZERO_DECIMAL_CURRENCIES.has(currency) ? minor : minor / 100) * 100) / 100, currency };
}

const planName = (value: unknown) => (typeof value === 'string' && /^[\w .-]{1,60}$/.test(value) ? value : 'Job Loop');

/** A Purchase for a first paid cycle, or null when the amount or time is unusable. Dated at the payment. */
export async function buildPurchaseEvent(facts: PersonFacts, row: PurchaseRow): Promise<Record<string, unknown> | null> {
  const paid = Date.parse(row.occurred_at);
  const amount = purchaseValue(row);
  if (!Number.isFinite(paid) || !amount) return null;
  return {
    event_name: 'Purchase', event_time: Math.floor(Math.min(paid, facts.now) / 1000), event_id: await commerceEventId('purchase', row.event_key),
    action_source: 'website', event_source_url: cleanSourceUrl(facts.pageUrl), user_data: await buildUserData(facts),
    custom_data: { value: amount.value, currency: amount.currency, content_name: planName(row.plan_label), content_type: 'product', num_items: 1 },
  };
}

/** InitiateCheckout for an order that reached the payment provider's checkout page. */
export async function buildCheckoutEvent(facts: PersonFacts, row: { event_key: string; plan_label: string }): Promise<Record<string, unknown>> {
  return {
    event_name: 'InitiateCheckout', event_time: Math.floor(facts.now / 1000), event_id: await commerceEventId('checkout', row.event_key),
    action_source: 'website', event_source_url: cleanSourceUrl(facts.pageUrl), user_data: await buildUserData(facts),
    custom_data: { content_name: planName(row.plan_label), content_type: 'product', num_items: 1 },
  };
}
