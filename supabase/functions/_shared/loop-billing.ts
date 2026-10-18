import { ApiError, billingConfiguration, DODO_PRODUCT_ID, objectInput, uuid, type DodoBillingConfig } from './core.ts';
import { DODO_PAYMENT_ID, DODO_SESSION_ID, validateDodoCheckoutSession } from './dodo.ts';

export const LOOP_BILLING_PRODUCT = 'jobvance_loop_monthly_v1';
export const LOOP_BILLING_PLANS = {
  weekly: { amount: 2900, runsPerWeek: 1, productEnv: 'DODO_PRODUCT_LOOP_WEEKLY' },
  active: { amount: 5900, runsPerWeek: 3, productEnv: 'DODO_PRODUCT_LOOP_ACTIVE' },
  daily: { amount: 9900, runsPerWeek: 7, productEnv: 'DODO_PRODUCT_LOOP_DAILY' },
} as const;
export type LoopBillingPlan = keyof typeof LOOP_BILLING_PLANS;
export type LoopBillingConfig = DodoBillingConfig & { loopProducts: Record<LoopBillingPlan, string> };
export const LOOP_SUBSCRIPTION_ID = /^sub_[A-Za-z0-9_-]{1,100}$/;
export const LOOP_SUBSCRIPTION_STATUSES = ['pending', 'active', 'on_hold', 'paused', 'cancelled', 'failed', 'expired', 'past_due'] as const;
const invalid = (message = 'The subscription could not be verified.') => new ApiError(409, 'LOOP_BILLING_INVALID', message);
const absent = (value: unknown) => value === null || value === undefined;
export function loopBillingPlan(value: unknown): LoopBillingPlan {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(LOOP_BILLING_PLANS, value)) throw invalid('Choose a listed Job Loop plan.');
  return value as LoopBillingPlan;
}
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid();
  return new Date(value).toISOString();
}
function noDiscount(value: Record<string, unknown>) { return absent(value.discount_id) && (absent(value.discounts) || Array.isArray(value.discounts) && value.discounts.length === 0); }
export function loopBillingConfiguration(get: (key: string) => string | undefined): LoopBillingConfig | null {
  if (get('JOBVANCE_LOOP_BILLING_ENABLED') !== 'true' || get('JOBVANCE_PAYMENT_PROVIDER') !== 'dodo') return null;
  const loopProducts = Object.fromEntries(Object.entries(LOOP_BILLING_PLANS).map(([key, plan]) => [key, get(plan.productEnv) ?? ''])) as Record<LoopBillingPlan, string>;
  const ids = Object.values(loopProducts);
  if (ids.some(value => !DODO_PRODUCT_ID.test(value)) || new Set(ids).size !== 3) return null;
  // Reuse all merchant, legal, support, mode, key and origin gates without requiring a CV-pass product.
  const config = billingConfiguration(name => name === 'DODO_PRODUCT_ID' ? loopProducts.weekly : name === 'DODO_PRODUCT_SPRINT' || name === 'DODO_PRODUCT_SEARCH' || name === 'DODO_PRODUCT_MOVE' ? undefined : get(name));
  return config?.provider === 'dodo' ? { ...config, loopProducts } : null;
}
export function validateLoopBillingProduct(value: unknown, config: LoopBillingConfig, plan: LoopBillingPlan): void {
  const product = obj(value), price = obj(product.price);
  if (product.product_id !== config.loopProducts[plan] || product.is_recurring !== true || !absent(product.pricing_mode) || price.type !== 'recurring_price' ||
    price.currency !== 'USD' || price.price !== LOOP_BILLING_PLANS[plan].amount || price.payment_frequency_count !== 1 || price.payment_frequency_interval !== 'Month' ||
    price.subscription_period_count !== 20 || price.subscription_period_interval !== 'Year' || !(absent(price.trial_period_days) || price.trial_period_days === 0) ||
    !(absent(price.discount) || price.discount === 0) || !(absent(price.discount_bps) || price.discount_bps === 0) || price.purchasing_power_parity === true || price.pay_what_you_want === true ||
    !absent(price.trial_amount) || price.trial_payment_method_optional === true || price.tax_inclusive !== true) throw new ApiError(503, 'LOOP_BILLING_PRODUCT_UNAVAILABLE', 'This monthly Job Loop plan is not ready for checkout.');
}
export function loopCheckoutBody(config: LoopBillingConfig, userId: string, requestId: string, generation: number, plan: LoopBillingPlan) {
  return { product_cart: [{ product_id: config.loopProducts[plan], quantity: 1 }], billing_currency: 'USD',
    return_url: `${config.appUrl}/pricing?loop_checkout=success`, cancel_url: `${config.appUrl}/pricing?loop_checkout=cancelled`,
    metadata: { product: LOOP_BILLING_PRODUCT, user_id: userId, request_id: requestId, plan, generation: String(generation) },
    feature_flags: { allow_discount_code: false, allow_currency_selection: false }, subscription_data: { trial_period_days: 0 } };
}
export interface LoopSubscription {
  subscriptionId: string; userId: string; requestId: string; generation: number; plan: LoopBillingPlan; productId: string; customerId: string;
  status: typeof LOOP_SUBSCRIPTION_STATUSES[number]; periodStart: string; validUntil: string; cancelAtPeriodEnd: boolean; taxInclusive: boolean;
}
export function loopMetadata(value: unknown) {
  const fields = obj(value);
  if (fields.product !== LOOP_BILLING_PRODUCT || typeof fields.generation !== 'string' || !/^\d{1,12}$/.test(fields.generation)) throw invalid();
  const generation = Number(fields.generation);
  if (!Number.isSafeInteger(generation) || generation < 0) throw invalid();
  return { userId: uuid(fields.user_id, 'Account'), requestId: uuid(fields.request_id, 'Checkout request'), generation, plan: loopBillingPlan(fields.plan) };
}
export function isLoopBillingMetadata(value: unknown): boolean { return !!value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).product === LOOP_BILLING_PRODUCT; }
export function validateLoopSubscription(value: unknown, config: LoopBillingConfig): LoopSubscription {
  const sub = obj(value), identity = loopMetadata(sub.metadata), customer = obj(sub.customer);
  if (typeof sub.subscription_id !== 'string' || !LOOP_SUBSCRIPTION_ID.test(sub.subscription_id) || sub.product_id !== config.loopProducts[identity.plan] ||
    sub.quantity !== 1 || sub.currency !== 'USD' || !Number.isSafeInteger(sub.recurring_pre_tax_amount) || (sub.recurring_pre_tax_amount as number) < 1 ||
    (sub.tax_inclusive === true ? (sub.recurring_pre_tax_amount as number) > LOOP_BILLING_PLANS[identity.plan].amount : sub.recurring_pre_tax_amount !== LOOP_BILLING_PLANS[identity.plan].amount) || sub.payment_frequency_count !== 1 ||
    sub.payment_frequency_interval !== 'Month' || sub.subscription_period_count !== 20 || sub.subscription_period_interval !== 'Year' || sub.trial_period_days !== 0 || sub.on_demand !== false ||
    !noDiscount(sub) || sub.tax_inclusive !== true || typeof sub.cancel_at_next_billing_date !== 'boolean' ||
    !LOOP_SUBSCRIPTION_STATUSES.includes(sub.status as never) || typeof customer.customer_id !== 'string' || !/^cus_[A-Za-z0-9_-]{1,100}$/.test(customer.customer_id)) throw invalid();
  const periodStart = date(sub.previous_billing_date), validUntil = date(sub.next_billing_date);
  if (!(Date.parse(validUntil) > Date.parse(periodStart)) || Date.parse(validUntil) - Date.parse(periodStart) > 35 * 86400000) throw invalid();
  return { ...identity, subscriptionId: sub.subscription_id, productId: sub.product_id as string, customerId: customer.customer_id,
    status: sub.status as LoopSubscription['status'], periodStart, validUntil, cancelAtPeriodEnd: sub.cancel_at_next_billing_date, taxInclusive: sub.tax_inclusive };
}
export interface LoopPaidPeriod { paymentId: string; sessionId: string | null; periodStart: string; validUntil: string; amount: number; revoked: boolean }
export function validateLoopPaidPeriod(value: unknown, sub: LoopSubscription): LoopPaidPeriod {
  const payment = obj(value), customer = obj(payment.customer);
  const total = payment.total_amount, tax = payment.tax ?? 0;
  const ids = payment.subscription_ids;
  if (typeof payment.payment_id !== 'string' || !DODO_PAYMENT_ID.test(payment.payment_id) || payment.status !== 'succeeded' || payment.currency !== 'USD' ||
    payment.subscription_id !== sub.subscriptionId || (!absent(ids) && (!Array.isArray(ids) || ids.length !== 1 || ids[0] !== sub.subscriptionId)) || payment.is_multi_subscription === true || payment.is_update_payment_method === true ||
    customer.customer_id !== sub.customerId || !noDiscount(payment) || !Number.isSafeInteger(total) || !Number.isSafeInteger(tax) || (tax as number) < 0 || (tax as number) > (total as number) ||
    (sub.taxInclusive ? total !== LOOP_BILLING_PLANS[sub.plan].amount : (total as number) - (tax as number) !== LOOP_BILLING_PLANS[sub.plan].amount) || !Array.isArray(payment.service_periods) || payment.service_periods.length !== 1) throw invalid('This charge does not prove a paid Job Loop month.');
  const period = obj(payment.service_periods[0]);
  if (period.subscription_id !== sub.subscriptionId) throw invalid();
  const periodStart = date(period.starts_at), validUntil = date(period.ends_at);
  if (!(Date.parse(validUntil) > Date.parse(periodStart)) || Date.parse(validUntil) - Date.parse(periodStart) > 35 * 86400000) throw invalid();
  let sessionId: string | null = null;
  if (!absent(payment.checkout_session_id)) { if (typeof payment.checkout_session_id !== 'string' || !DODO_SESSION_ID.test(payment.checkout_session_id)) throw invalid(); sessionId = payment.checkout_session_id; }
  const refunds = payment.refunds;
  const revoked = (typeof payment.refund_status === 'string' && payment.refund_status !== 'none') || (Array.isArray(refunds) && refunds.some(item => obj(item).status === 'succeeded'));
  return { paymentId: payment.payment_id, sessionId, periodStart, validUntil, amount: total as number, revoked };
}
export function captureLoopBillingInput(value: unknown) {
  const input = objectInput(value);
  const allowed = input.action === 'status' ? ['action'] : input.action === 'checkout' ? ['action','requestId','plan','expectedGeneration','consent'] : ['action','requestId','expectedSubscriptionId','expectedVersion','expectedGeneration','consent'];
  if (Object.keys(input).some(key => !allowed.includes(key)) || !['status','checkout','cancel'].includes(String(input.action))) throw new ApiError(400, 'INVALID_INPUT', 'Choose a Job Loop billing action.');
  if (input.action === 'status') return { action: 'status' as const };
  if (input.consent !== true || !Number.isSafeInteger(input.expectedGeneration) || (input.expectedGeneration as number) < 0) throw new ApiError(400, 'LOOP_BILLING_CONSENT', 'Confirm this billing action for your current Job Loop.');
  const base = { requestId: uuid(input.requestId, 'Request'), generation: input.expectedGeneration as number };
  if (input.action === 'checkout') return { ...base, action: 'checkout' as const, plan: loopBillingPlan(input.plan) };
  if (typeof input.expectedSubscriptionId !== 'string' || !LOOP_SUBSCRIPTION_ID.test(input.expectedSubscriptionId) || !Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 1) throw invalid('Refresh your subscription before cancelling.');
  return { ...base, action: 'cancel' as const, subscriptionId: input.expectedSubscriptionId, version: input.expectedVersion as number };
}
/** Decode only after auth.getUser verifies this token; SQL independently checks that session still exists. */
export function verifiedAuthSession(req: Request): string {
  try {
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
    if (!token) throw invalid();
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return uuid(payload.session_id, 'Session');
  } catch { throw new ApiError(401, 'UNAUTHORIZED', 'Sign in again before managing billing.'); }
}
export { validateDodoCheckoutSession };
