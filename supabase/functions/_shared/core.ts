// Portable, dependency-free logic. The edge handlers supply authentication and persistence.
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const PASS = { product: 'jobvance_ten_pack_v1', amount: 2900, currency: 'usd', credits: 10, days: 30 } as const;
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
export type BillingConfig = StripeBillingConfig | PaddleBillingConfig;
export function billingConfiguration(get: (key: string) => string | undefined): BillingConfig | null {
  if (get('JOBVANCE_BILLING_ENABLED') !== 'true') return null;
  const mode = get('JOBVANCE_BILLING_MODE');
  const provider = get('JOBVANCE_PAYMENT_PROVIDER') ?? 'paddle';
  if (provider !== 'paddle' && provider !== 'stripe') return null;
  const secretKey = get(provider === 'paddle' ? 'PADDLE_API_KEY' : 'STRIPE_SECRET_KEY') ?? '';
  const webhookSecret = get(provider === 'paddle' ? 'PADDLE_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET') ?? '';
  const priceId = get('PADDLE_PRICE_ID') ?? '';
  const appUrl = get('APP_URL') ?? '';
  if (mode !== 'test' && mode !== 'live') return null;
  if (provider === 'stripe' && (!secretKey.startsWith(mode === 'test' ? 'sk_test_' : 'sk_live_') || !webhookSecret.startsWith('whsec_'))) return null;
  if (provider === 'paddle' && (!secretKey.startsWith(mode === 'test' ? 'pdl_sdbx_apikey_' : 'pdl_live_apikey_') || webhookSecret.length < 16 || webhookSecret.length > 512 || !/^pri_[a-z\d]{26}$/.test(priceId))) return null;
  if (mode === 'live' && (get('JOBVANCE_LIVE_BILLING_REVIEWED') !== 'true' || get('JOBVANCE_COMMERCIAL_TERMS_REVIEWED') !== 'true' || get('JOBVANCE_SELLER_ELIGIBILITY_REVIEWED') !== 'true' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get('SUPPORT_EMAIL') ?? '') || (provider === 'paddle' && get('JOBVANCE_PADDLE_MERCHANT_APPROVAL_REVIEWED') !== 'true'))) return null;
  try {
    const url = new URL(appUrl);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(mode === 'test' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return null;
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
