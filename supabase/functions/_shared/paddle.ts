import { ApiError, objectInput, PASS, paymentMetadata } from './core.ts';

export const PADDLE_TRANSACTION_ID = /^txn_[a-z\d]{26}$/;
export const PADDLE_EVENT_ID = /^evt_[a-z\d]{26}$/;
export const PADDLE_ADJUSTMENT_ID = /^adj_[a-z\d]{26}$/;

export function validatePaddlePrice(value: unknown, expectedId: string): Record<string, unknown> {
  const price = objectInput(value);
  const amount = objectInput(price.unit_price);
  if (price.id !== expectedId || price.status !== 'active' || price.billing_cycle !== null || price.trial_period !== null || price.tax_mode !== 'external' || amount.amount !== String(PASS.amount) || amount.currency_code !== 'USD' || (Array.isArray(price.unit_price_overrides) && price.unit_price_overrides.length > 0)) {
    throw new ApiError(503, 'INVALID_PASS_PRICE', 'The configured pass must be a one-time USD $29 price before applicable tax.');
  }
  return price;
}

export function validatePaddleTransaction(value: unknown, priceId: string, requireCompleted = true) {
  const transaction = objectInput(value);
  if (typeof transaction.id !== 'string' || !PADDLE_TRANSACTION_ID.test(transaction.id) || transaction.currency_code !== 'USD' || transaction.collection_mode !== 'automatic' || transaction.subscription_id !== null || (requireCompleted && transaction.status !== 'completed') || !Array.isArray(transaction.items) || transaction.items.length !== 1) {
    throw new ApiError(400, 'INVALID_PAYMENT', 'The transaction does not match this one-time pass.');
  }
  const item = objectInput(transaction.items[0]);
  if (item.quantity !== 1) throw new ApiError(400, 'INVALID_PAYMENT', 'The transaction quantity does not match this pass.');
  validatePaddlePrice(item.price, priceId);
  const details = objectInput(transaction.details);
  const totals = objectInput(details.totals);
  if (totals.subtotal !== String(PASS.amount) || totals.discount !== '0' || totals.currency_code !== 'USD' || !Array.isArray(details.line_items) || details.line_items.length !== 1) throw new ApiError(400, 'INVALID_PAYMENT', 'The transaction total does not match this pass.');
  const line = objectInput(details.line_items[0]);
  const lineTotals = objectInput(line.totals);
  if (line.price_id !== priceId || line.quantity !== 1 || lineTotals.subtotal !== String(PASS.amount) || lineTotals.discount !== '0') throw new ApiError(400, 'INVALID_PAYMENT', 'The paid line item does not match this pass.');
  return { transactionId: transaction.id, ...paymentMetadata(transaction.custom_data) };
}

export function validateApprovedPaddleRefund(value: unknown, transactionId: string): number {
  const adjustment = objectInput(value);
  const totals = objectInput(adjustment.totals);
  if (typeof adjustment.id !== 'string' || !PADDLE_ADJUSTMENT_ID.test(adjustment.id) || adjustment.transaction_id !== transactionId || adjustment.action !== 'refund' || adjustment.status !== 'approved' || adjustment.currency_code !== 'USD' || totals.currency_code !== 'USD' || typeof totals.subtotal !== 'string' || !/^\d+$/.test(totals.subtotal)) throw new ApiError(400, 'INVALID_REFUND', 'The refund context could not be verified.');
  const amount = Number(totals.subtotal);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > PASS.amount) throw new ApiError(400, 'INVALID_REFUND', 'The refund does not match this pass.');
  return amount;
}

export async function verifyPaddleSignature(raw: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): Promise<void> {
  if (!header || raw.length > 262144) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid payment signature.');
  const parts = header.split(';').map(part => part.trim().split('='));
  const times = parts.filter(([name]) => name === 'ts');
  const signatures = parts.filter(([name, value]) => name === 'h1' && /^[0-9a-f]{64}$/i.test(value ?? '')).map(([, value]) => value.toLowerCase());
  const timestamp = times.length === 1 && /^\d{1,12}$/.test(times[0][1] ?? '') ? Number(times[0][1]) : NaN;
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 5 || signatures.length === 0) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid or expired payment signature.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}:${raw}`));
  const expected = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const valid = signatures.some(signature => {
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    return difference === 0;
  });
  if (!valid) throw new ApiError(400, 'BAD_SIGNATURE', 'Invalid payment signature.');
}
