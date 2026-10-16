import { ApiError, PASS, paymentMetadata, type DodoBillingConfig } from './core.ts';

// Dodo publishes no identifier grammar. These follow the prefixes in its documented examples
// (pay_…, ref_…, cks_…) and bound the rest to a URL- and SQL-safe character set.
export const DODO_PAYMENT_ID = /^pay_[A-Za-z0-9_-]{1,100}$/;
export const DODO_REFUND_ID = /^ref_[A-Za-z0-9_-]{1,100}$/;
export const DODO_SESSION_ID = /^cks_[A-Za-z0-9_-]{1,100}$/;
// Standard Webhooks message IDs are opaque strings; bound them before they become ledger keys.
export const DODO_WEBHOOK_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
export const DODO_CHECKOUT_HOST = { test: 'test.checkout.dodopayments.com', live: 'checkout.dodopayments.com' } as const;
// Sessions expire 24 hours after creation (15 minutes only with confirm=true, which is never sent).
export const DODO_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
// The Standard Webhooks reference libraries accept a five-minute clock difference.
export const DODO_SIGNATURE_TOLERANCE_SECONDS = 300;

function record(value: unknown, error: () => ApiError): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw error();
  return value as Record<string, unknown>;
}
const absent = (value: unknown) => value === null || value === undefined;

/** The configured product must be the one-time, base-priced USD $29 pass before any checkout is opened. */
export function validateDodoProduct(value: unknown, productId: string): Record<string, unknown> {
  const invalid = () => new ApiError(503, 'INVALID_PASS_PRICE', 'The configured pass must be a one-time USD $29 product.');
  const product = record(value, invalid);
  const price = record(product.price, invalid);
  if (product.product_id !== productId || product.is_recurring !== false || !absent(product.pricing_mode) || price.type !== 'one_time_price' || price.price !== PASS.amount ||
    price.currency !== 'USD' || price.pay_what_you_want === true || price.purchasing_power_parity === true || !(absent(price.discount_bps) || price.discount_bps === 0) ||
    !(absent(price.discount) || price.discount === 0)) throw invalid();
  return product;
}

/** Server-fixed checkout request: the browser can choose neither the product, the quantity nor the identity. */
export function dodoCheckoutBody(config: DodoBillingConfig, userId: string, requestId: string): Record<string, unknown> {
  return {
    product_cart: [{ product_id: config.productId, quantity: 1 }],
    return_url: `${config.appUrl}/dashboard?checkout=success`,
    cancel_url: `${config.appUrl}/dashboard?checkout=cancelled`,
    metadata: { user_id: userId, request_id: requestId, product: PASS.product },
    // Codes and currency switching would change the amount that the webhook verifies.
    feature_flags: { allow_discount_code: false, allow_currency_selection: false },
  };
}

export function validateDodoCheckoutSession(value: unknown, mode: 'test' | 'live'): { sessionId: string; url: string } {
  const invalid = () => new ApiError(503, 'INVALID_PAYMENT_SESSION', 'The checkout session could not be verified.');
  const session = record(value, invalid);
  if (typeof session.session_id !== 'string' || !DODO_SESSION_ID.test(session.session_id) || typeof session.checkout_url !== 'string' || session.checkout_url.length > 2000) throw invalid();
  let url: URL;
  try { url = new URL(session.checkout_url); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.hostname !== DODO_CHECKOUT_HOST[mode] || url.port || url.username || url.password) throw invalid();
  return { sessionId: session.session_id, url: session.checkout_url };
}

/** Dodo returns no expiry, so a stored session is treated as expiring 24 hours after its order was claimed. */
export function dodoCheckoutExpiry(order: { checkout_expires_at?: unknown; created_at?: unknown }): number {
  if (typeof order.checkout_expires_at === 'string') return Date.parse(order.checkout_expires_at);
  return typeof order.created_at === 'string' ? Date.parse(order.created_at) + DODO_SESSION_LIFETIME_MS : NaN;
}

/** Returns the signing key bytes of a Standard Webhooks secret, or null when it is not valid base64. */
export function dodoSigningKey(secret: string): ArrayBuffer | null {
  const encoded = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  if (encoded.length < 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  try {
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    return bytes.length > 0 ? bytes.buffer : null;
  } catch { return null; }
}

export interface DodoSignatureHeaders { id: string | null; timestamp: string | null; signature: string | null }

/**
 * Standard Webhooks verification over the exact raw body: HMAC-SHA256 of `id.timestamp.body`,
 * base64-encoded, matched in constant time against any space-separated `v1,<signature>` entry.
 * Returns the authenticated webhook ID for idempotent ledger writes.
 */
export async function verifyDodoSignature(raw: string, headers: DodoSignatureHeaders, secret: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || raw.length > 262144 || signature.length > 4096 || !DODO_WEBHOOK_ID.test(id) || !/^\d{1,12}$/.test(timestamp)) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid payment signature.');
  if (Math.abs(now - Number(timestamp)) > DODO_SIGNATURE_TOLERANCE_SECONDS) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid or expired payment signature.');
  const signatures = signature.split(' ').filter(Boolean).map(entry => entry.split(','))
    .filter(([version, value, ...rest]) => version === 'v1' && rest.length === 0 && /^[A-Za-z0-9+/]{43}=$/.test(value ?? '')).map(([, value]) => value);
  const keyBytes = dodoSigningKey(secret);
  if (signatures.length === 0 || !keyBytes) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid payment signature.');
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${raw}`)));
  const expected = btoa(String.fromCharCode(...digest));
  const valid = signatures.some(candidate => {
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ candidate.charCodeAt(index);
    return difference === 0;
  });
  if (!valid) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid payment signature.');
  return id;
}

export interface DodoEvent { type: string; created: number; data: Record<string, unknown> }
export function parseDodoEvent(raw: string): DodoEvent {
  let event: Record<string, unknown>;
  try { event = record(JSON.parse(raw), () => new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Invalid payment event.')); }
  catch { throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Invalid payment event.'); }
  const created = typeof event.timestamp === 'string' ? Math.floor(Date.parse(event.timestamp) / 1000) : NaN;
  if (typeof event.type !== 'string' || !Number.isSafeInteger(created) || created < 0) throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Payment event cannot be verified.');
  return { type: event.type, created, data: record(event.data, () => new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Payment event cannot be verified.')) };
}

export interface VerifiedDodoPayment { paymentId: string; sessionId: string; totalAmount: number; userId: string; requestId: string }
/**
 * A succeeded USD purchase of exactly one configured pass, made through a checkout session, whose
 * price before tax is $29. Dodo is the merchant of record and may add tax on top or include it.
 */
export function validateDodoPayment(value: unknown, productId: string): VerifiedDodoPayment {
  const invalid = () => new ApiError(400, 'INVALID_PAYMENT', 'The payment does not match this one-time pass.');
  const payment = record(value, invalid);
  const cart = payment.product_cart;
  const total = payment.total_amount;
  const tax = absent(payment.tax) ? 0 : payment.tax;
  if (typeof payment.payment_id !== 'string' || !DODO_PAYMENT_ID.test(payment.payment_id) || typeof payment.checkout_session_id !== 'string' || !DODO_SESSION_ID.test(payment.checkout_session_id) ||
    payment.status !== 'succeeded' || payment.currency !== 'USD' || !absent(payment.subscription_id) || (Array.isArray(payment.subscription_ids) && payment.subscription_ids.length > 0) ||
    !absent(payment.discount_id) || (Array.isArray(payment.discounts) && payment.discounts.length > 0) || !Array.isArray(cart) || cart.length !== 1) throw invalid();
  const item = record(cart[0], invalid);
  if (item.product_id !== productId || item.quantity !== 1) throw invalid();
  if (typeof total !== 'number' || typeof tax !== 'number' || !Number.isSafeInteger(total) || !Number.isSafeInteger(tax) || tax < 0 || (total !== PASS.amount && total - tax !== PASS.amount)) throw invalid();
  return { paymentId: payment.payment_id, sessionId: payment.checkout_session_id, totalAmount: total, ...paymentMetadata(payment.metadata) };
}

export interface VerifiedDodoRefund { refundId: string; paymentId: string; amount: number }
export function validateDodoRefund(value: unknown): VerifiedDodoRefund {
  const invalid = () => new ApiError(400, 'INVALID_REFUND', 'The refund context could not be verified.');
  const refund = record(value, invalid);
  if (typeof refund.refund_id !== 'string' || !DODO_REFUND_ID.test(refund.refund_id) || typeof refund.payment_id !== 'string' || !DODO_PAYMENT_ID.test(refund.payment_id) ||
    refund.status !== 'succeeded' || !(absent(refund.currency) || refund.currency === 'USD') || typeof refund.amount !== 'number' || !Number.isSafeInteger(refund.amount) || refund.amount < 1) throw invalid();
  return { refundId: refund.refund_id, paymentId: refund.payment_id, amount: refund.amount };
}

/**
 * The ledger records refunds in pass-price units (at most $29 before tax), as Paddle's subtotal and
 * Stripe's untaxed amount do. Any refund still revokes the unused paid grant in full.
 */
export function dodoLedgerRefundAmount(refund: VerifiedDodoRefund, payment: VerifiedDodoPayment): number {
  if (refund.paymentId !== payment.paymentId || refund.amount > payment.totalAmount) throw new ApiError(400, 'INVALID_REFUND', 'The refund does not match this pass.');
  return Math.max(1, Math.floor(refund.amount * PASS.amount / payment.totalAmount));
}
