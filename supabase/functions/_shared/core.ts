// Portable, dependency-free logic. The edge handlers supply authentication and persistence.
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

// Legacy pack: still honoured when configured, but no longer offered anywhere in the UI.
export const PASS = { product: 'jobvance_ten_pack_v1', amount: 2900, currency: 'usd', credits: 10, days: 30 } as const;
/**
 * One-time job-search passes (USD cents). These mirror the rows seeded into public.jobvance_pass_plans
 * exactly; the database row decides what a paid order grants, and these values decide what is sold.
 */
export const PASS_PLANS = {
  sprint_7d: { name: 'Sprint', amount: 900, days: 7, tailorQuota: 25, productEnv: 'DODO_PRODUCT_SPRINT' },
  search_30d: { name: 'Job Search', amount: 1900, days: 30, tailorQuota: 100, productEnv: 'DODO_PRODUCT_SEARCH' },
  move_90d: { name: 'Career Move', amount: 3900, days: 90, tailorQuota: 300, productEnv: 'DODO_PRODUCT_MOVE' },
} as const;
export type PassPlanKey = keyof typeof PASS_PLANS;
export const PASS_PLAN_KEYS = Object.keys(PASS_PLANS) as PassPlanKey[];
export function isPassPlan(value: unknown): value is PassPlanKey { return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PASS_PLANS, value); }
/** Checkout metadata marker for a pass; the legacy pack keeps PASS.product. */
export const JOB_PASS_PRODUCT = 'jobvance_job_pass_v1';
/** AI-tailoring allowances passed to jobvance_tailor_reserve and jobvance_get_tailor_access. */
export const TAILOR_LIMITS = { freeMonthly: 3, passDaily: 40, guestDaily: 1, guestGlobalDaily: 200 } as const;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_INPUT', 'A JSON object is required.');
  return value as Record<string, unknown>;
}

export function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, 'INVALID_INPUT', `${label} must be a UUID.`);
  return value.toLowerCase();
}

function boundedText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || value.includes('\u0000')) {
    throw new ApiError(400, 'INVALID_INPUT', `${label} must contain ${min}–${max} characters.`);
  }
  return value.trim();
}

export interface TailorInput { resumeId: string; requestId: string; jobTitle: string; company: string; jobUrl: string | null; jobDescription: string }
export function validateTailorInput(value: unknown): TailorInput {
  const body = objectInput(value);
  let jobUrl: string | null = null;
  if (body.jobUrl !== null && body.jobUrl !== undefined && body.jobUrl !== '') {
    if (typeof body.jobUrl !== 'string' || body.jobUrl.length > 2000) throw new ApiError(400, 'INVALID_INPUT', 'Job URL is invalid.');
    try {
      const parsed = new URL(body.jobUrl);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
      jobUrl = parsed.href;
    } catch { throw new ApiError(400, 'INVALID_INPUT', 'Use a valid HTTPS job URL.'); }
  }
  return { resumeId: uuid(body.resumeId, 'Resume ID'), requestId: uuid(body.requestId, 'Request ID'), jobTitle: boundedText(body.jobTitle, 'Job title', 1, 200),
    company: boundedText(body.company, 'Company', 0, 200), jobUrl, jobDescription: boundedText(body.jobDescription, 'Job description', 80, 20000) };
}

const STOP = new Set(('the and for are you your with will this that from have has our their they them into who can all about work working role candidate candidates job company team teams opportunity responsibilities required requirements qualification qualifications looking seek seeking experience years year strong excellent ability skills including include must should preferred provide also such each across join position apply career successful success professional professionals').split(' '));
function tokens(text: string): string[] {
  return (text.toLowerCase().match(/\.net\b|[a-z][a-z0-9]*(?:[+#]{1,2})?(?:[.-][a-z0-9]+)*/g) ?? []).filter(word => word.length >= 3 && !STOP.has(word));
}

export interface GroundedResult { originalText: string; tailoredText: string; matchedKeywords: string[]; missingKeywords: string[] }
export function groundedTailor(original: string, description: string): GroundedResult {
  if (typeof original !== 'string' || original.trim().length < 80 || original.length > 60000 || original.includes('\u0000')) {
    throw new ApiError(422, 'CV_NEEDS_REVIEW', 'Review the extracted CV text before creating a pack (80–60000 characters).');
  }
  const counts = new Map<string, number>();
  for (const word of tokens(description)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const vocabulary = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b)).slice(0, 40);
  const existing = new Set(tokens(original));
  const matchedKeywords = vocabulary.filter(word => existing.has(word));
  const missingKeywords = vocabulary.filter(word => !existing.has(word));
  const relevant = new Set(matchedKeywords);
  const lines = original.replace(/\r\n?/g, '\n').split('\n');
  const bullet = /^\s*[-*•▪‣]\s+/;
  // Reorder only contiguous, explicitly marked bullet lines. Preserve sections, factual
  // wording, headings, contact details and unmarked continuation lines exactly.
  for (let start = 0; start < lines.length; start++) {
    if (!bullet.test(lines[start])) continue;
    let end = start + 1;
    while (end < lines.length && bullet.test(lines[end])) end++;
    // A following sentence or indented line may continue the final bullet. Leave the
    // whole block in place rather than detach that continuation from its factual claim.
    const next = lines[end];
    if (next && (/^[ \t]+\S/.test(next) || !/^[A-Z][A-Z &/:-]{2,40}$/.test(next.trim()))) { start = end - 1; continue; }
    const ranked = lines.slice(start, end).map((line, index) => ({ line, index, rank: [...new Set(tokens(line))].filter(word => relevant.has(word)).length }));
    ranked.sort((a, b) => b.rank - a.rank || a.index - b.index);
    lines.splice(start, end - start, ...ranked.map(item => item.line));
    start = end - 1;
  }
  return { originalText: original, tailoredText: lines.join('\n'), matchedKeywords, missingKeywords };
}

export async function fingerprint(input: TailorInput, original: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...input, original }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

interface BillingBase { mode: 'test' | 'live'; secretKey: string; webhookSecret: string; appUrl: string }
export interface StripeBillingConfig extends BillingBase { provider: 'stripe' }
export interface PaddleBillingConfig extends BillingBase { provider: 'paddle'; priceId: string }
/** productId is the legacy $29 pack (optional); planProducts maps each pass to its own Dodo product. */
export interface DodoBillingConfig extends BillingBase { provider: 'dodo'; productId: string | null; planProducts: Partial<Record<PassPlanKey, string>>; apiBaseUrl: string }
export type BillingConfig = StripeBillingConfig | PaddleBillingConfig | DodoBillingConfig;
// Dodo documents one API host per mode; a key created in one mode never authenticates on the other.
export const DODO_API_BASE_URL = { test: 'https://test.dodopayments.com', live: 'https://live.dodopayments.com' } as const;
export const DODO_PRODUCT_ID = /^pdt_[A-Za-z0-9_-]{1,100}$/;
// Dodo publishes no API key grammar, so accept any header-safe token. A key visibly carrying the
// other mode's prefix is still refused, so a live key can never be paired with test mode.
export function isDodoApiKey(value: string, mode: 'test' | 'live'): boolean {
  return /^[\x21-\x7e]{1,512}$/.test(value) && !value.startsWith(mode === 'test' ? 'dodo_live_' : 'dodo_test_');
}
// Standard Webhooks secret: an optional `whsec_` prefix followed by the base64-encoded signing key.
export function isDodoWebhookKey(value: string): boolean {
  const encoded = value.startsWith('whsec_') ? value.slice(6) : value;
  return encoded.length >= 4 && encoded.length <= 512 && encoded.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded);
}
export function billingConfiguration(get: (key: string) => string | undefined): BillingConfig | null {
  if (get('JOBVANCE_BILLING_ENABLED') !== 'true') return null;
  const mode = get('JOBVANCE_BILLING_MODE');
  const provider = get('JOBVANCE_PAYMENT_PROVIDER') ?? 'paddle';
  if (provider !== 'paddle' && provider !== 'stripe' && provider !== 'dodo') return null;
  const canonicalDodoKey = get('DODO_PAYMENTS_API_KEY') || '';
  const aliasDodoKey = get('DODO_PAYMENT_API_KEY') || '';
  // The owner's existing secure entry used the singular name. Accept that known
  // alias only when unambiguous; never silently choose between different keys.
  if (provider === 'dodo' && canonicalDodoKey && aliasDodoKey && canonicalDodoKey !== aliasDodoKey) return null;
  const secretKey = provider === 'dodo' ? canonicalDodoKey || aliasDodoKey : get(provider === 'paddle' ? 'PADDLE_API_KEY' : 'STRIPE_SECRET_KEY') ?? '';
  const webhookSecret = get(provider === 'paddle' ? 'PADDLE_WEBHOOK_SECRET' : provider === 'dodo' ? 'DODO_PAYMENTS_WEBHOOK_KEY' : 'STRIPE_WEBHOOK_SECRET') ?? '';
  const priceId = get('PADDLE_PRICE_ID') ?? '';
  const productId = get('DODO_PRODUCT_ID') || null;
  const planProducts: Partial<Record<PassPlanKey, string>> = {};
  for (const key of PASS_PLAN_KEYS) { const value = get(PASS_PLANS[key].productEnv); if (value) planProducts[key] = value; }
  // Every configured Dodo product must be well formed and distinct, and at least one must exist.
  const productIds = [productId, ...Object.values(planProducts)].filter((value): value is string => !!value);
  const appUrl = get('APP_URL') ?? '';
  if (mode !== 'test' && mode !== 'live') return null;
  if (provider === 'stripe' && (!secretKey.startsWith(mode === 'test' ? 'sk_test_' : 'sk_live_') || !webhookSecret.startsWith('whsec_'))) return null;
  if (provider === 'paddle' && (!secretKey.startsWith(mode === 'test' ? 'pdl_sdbx_apikey_' : 'pdl_live_apikey_') || webhookSecret.length < 16 || webhookSecret.length > 512 || !/^pri_[a-z\d]{26}$/.test(priceId))) return null;
  if (provider === 'dodo' && (!isDodoApiKey(secretKey, mode) || !isDodoWebhookKey(webhookSecret) || productIds.length === 0 ||
    productIds.some(value => !DODO_PRODUCT_ID.test(value)) || new Set(productIds).size !== productIds.length)) return null;
  if (mode === 'live' && (get('JOBVANCE_LIVE_BILLING_REVIEWED') !== 'true' || get('JOBVANCE_COMMERCIAL_TERMS_REVIEWED') !== 'true' || get('JOBVANCE_SELLER_ELIGIBILITY_REVIEWED') !== 'true' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get('SUPPORT_EMAIL') ?? '') || (provider === 'paddle' && get('JOBVANCE_PADDLE_MERCHANT_APPROVAL_REVIEWED') !== 'true') || (provider === 'dodo' && get('JOBVANCE_DODO_MERCHANT_APPROVAL_REVIEWED') !== 'true'))) return null;
  try {
    const url = new URL(appUrl);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(mode === 'test' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return null;
    if (provider === 'dodo') return { provider, mode, secretKey, webhookSecret, appUrl: url.origin, productId, planProducts, apiBaseUrl: DODO_API_BASE_URL[mode] };
    return provider === 'paddle' ? { provider, mode, secretKey, webhookSecret, appUrl: url.origin, priceId } : { provider, mode, secretKey, webhookSecret, appUrl: url.origin };
  } catch { return null; }
}

export async function verifyStripeSignature(raw: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): Promise<void> {
  if (!header || raw.length > 262144) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid payment signature.');
  const parts = header.split(',').map(part => part.split('='));
  const timestamps = parts.filter(([name]) => name === 't');
  const signatures = parts.filter(([name, value]) => name === 'v1' && /^[0-9a-f]{64}$/i.test(value ?? '')).map(([, value]) => value.toLowerCase());
  const timestamp = timestamps.length === 1 && /^\d{1,12}$/.test(timestamps[0][1] ?? '') ? Number(timestamps[0][1]) : NaN;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300 || signatures.length === 0) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid or expired payment signature.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const expected = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const matches = signatures.some(signature => {
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    return difference === 0;
  });
  if (!matches) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid payment signature.');
}

export function paymentMetadata(value: unknown): { userId: string; requestId: string } {
  const metadata = objectInput(value);
  if (metadata.product !== PASS.product) throw new ApiError(400, 'INVALID_PAYMENT', 'Unknown payment product.');
  return { userId: uuid(metadata.user_id, 'Payment user'), requestId: uuid(metadata.request_id, 'Payment request') };
}

export function isPassMetadata(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).product === PASS.product;
}
