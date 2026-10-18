import { ApiError } from './core.ts';
import { DODO_PAYMENT_ID, DODO_SESSION_ID, DODO_SESSION_LIFETIME_MS, validateDodoCheckoutSession, validateDodoRefund, type DodoEvent } from './dodo.ts';
import { captureLoopBillingInput, isLoopBillingMetadata, LOOP_BILLING_PLANS, LOOP_SUBSCRIPTION_ID, loopCheckoutBody, validateLoopBillingProduct, validateLoopPaidPeriod, validateLoopSubscription, type LoopBillingConfig, type LoopSubscription } from './loop-billing.ts';

export interface LoopBillingPorts {
  rpc<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T>;
  provider(endpoint: string, body?: Record<string, unknown>, method?: 'GET'|'POST'|'PATCH'): Promise<Record<string, unknown>>;
  now?: () => number;
}
const unavailable = () => new ApiError(503, 'LOOP_BILLING_UNAVAILABLE', 'Job Loop subscriptions are temporarily unavailable. Your existing records remain available.');
const sqlPlan = (plan: string) => plan === 'active' ? 'three_weekly' : plan;
const publicPlan = (plan: unknown) => plan === 'three_weekly' ? 'active' : plan;
function publicSubscription(value: unknown) {
  if (!value) return null;
  const sub = record(value);
  return { subscriptionId: sub.subscriptionId, plan: publicPlan(sub.plan), status: sub.status, validUntil: sub.validUntil, periodStart: sub.periodStart,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd, revoked: sub.revoked, version: sub.revision, graceUntil: sub.graceUntil ?? null };
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable(); return value as Record<string, unknown>; }
export async function controlLoopBilling(ports: LoopBillingPorts, config: LoopBillingConfig | null, owner: string, authSession: string, raw: unknown, fallbackMode: 'test'|'live' = 'test') {
  // Immutable primitive-only intent is captured before any asynchronous operation.
  const input = captureLoopBillingInput(raw);
  const mode = config?.mode ?? fallbackMode;
  const base = { p_user: owner, p_auth_session: authSession };
  if (input.action === 'status') {
    const status = await ports.rpc('job_loop_billing_status', { ...base, p_mode: mode });
    const checkout = status.checkout ? record(status.checkout) : null;
    const cancel = status.cancelRequest ? record(status.cancelRequest) : null;
    return { generation: status.generation, entitlement: status.entitlement, fulfillmentPending: status.fulfillmentPending === true, subscription: publicSubscription(status.subscription), checkout: checkout ? { requestId: checkout.requestId, status: checkout.status, checkoutUrl: checkout.checkoutUrl, plan: publicPlan(checkout.plan) } : null,
      cancelRequest: cancel ? { requestId: cancel.requestId, subscriptionId: cancel.subscriptionId, status: cancel.status, version: cancel.version } : null, billingConfigured: !!config, billingMode: mode,
      plans: Object.entries(LOOP_BILLING_PLANS).map(([id, plan]) => ({ id, amount: plan.amount, runsPerWeek: plan.runsPerWeek, currency: 'USD', interval: 'month' })) };
  }
  if (!config) throw unavailable();
  const bound = { ...base, p_generation: input.generation, p_request: input.requestId };
  if (input.action === 'checkout') {
    validateLoopBillingProduct(await ports.provider(`products/${config.loopProducts[input.plan]}`), config, input.plan);
    const order = record(await ports.rpc('job_loop_billing_checkout_claim', { ...bound, p_mode: mode, p_plan: sqlPlan(input.plan), p_product: config.loopProducts[input.plan] }));
    if (!['creating','ready','uncertain','failed'].includes(String(order.state))) throw new ApiError(409, 'LOOP_CHECKOUT_FINISHED', 'This checkout is no longer open. Refresh your subscription.');
    let session: { sessionId: string; url: string };
    if (order.checkout_url) {
      if (typeof order.created_at !== 'string' || !(Date.parse(order.created_at) + DODO_SESSION_LIFETIME_MS > (ports.now?.() ?? Date.now()))) throw new ApiError(409, 'LOOP_CHECKOUT_EXPIRED', 'This checkout link expired. Contact support to reconcile any pending payment before another checkout.');
      session = validateDodoCheckoutSession({ session_id: order.session_id, checkout_url: order.checkout_url }, mode);
    } else {
      if (order.creationClaimAcquired !== true) throw new ApiError(409, 'LOOP_CHECKOUT_RECOVERY_REQUIRED', 'This checkout needs recovery. Keep the same request and contact support if it remains unavailable.');
      // No undocumented provider idempotency is assumed: an ambiguous POST is never repeated.
      try {
        session = validateDodoCheckoutSession(await ports.provider('checkouts', loopCheckoutBody(config, owner, input.requestId, input.generation, input.plan)), mode);
        await ports.rpc('job_loop_billing_checkout_finalize', { ...bound, p_session: session.sessionId, p_url: session.url });
      } catch (error) {
        await ports.rpc('job_loop_billing_checkout_fail', { ...bound, p_retryable: false }).catch(() => undefined);
        throw error;
      }
    }
    return { provider: 'dodo', billingMode: mode, requestId: input.requestId, generation: input.generation, plan: input.plan, sessionId: session.sessionId, url: session.url };
  }
  const claim = record(await ports.rpc('job_loop_billing_cancel_claim', { ...bound, p_mode: mode, p_subscription: input.subscriptionId, p_version: input.version }));
  let confirmed = false;
  let sub: LoopSubscription | null = null;
  try {
    sub = validateLoopSubscription(await ports.provider(`subscriptions/${input.subscriptionId}`), config);
    if (sub.userId !== owner || sub.subscriptionId !== input.subscriptionId) throw new ApiError(409, 'LOOP_BILLING_IDENTITY_CHANGED', 'This subscription no longer matches your account.');
    confirmed = sub.cancelAtPeriodEnd || ['cancelled','failed','expired'].includes(sub.status);
    if (!confirmed && claim.creationClaimAcquired === true) {
      await ports.provider(`subscriptions/${input.subscriptionId}`, { cancel_at_next_billing_date: true }, 'PATCH');
      sub = validateLoopSubscription(await ports.provider(`subscriptions/${input.subscriptionId}`), config);
      if (sub.userId !== owner || sub.subscriptionId !== input.subscriptionId) throw unavailable();
      confirmed = sub.cancelAtPeriodEnd || ['cancelled','failed','expired'].includes(sub.status);
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'LOOP_BILLING_IDENTITY_CHANGED') throw error;
    // An ambiguous cancellation may have succeeded at Dodo. Keep its original durable intent.
  }
  const result = await ports.rpc('job_loop_billing_cancel_finalize', { ...bound, p_mode: mode, p_subscription: input.subscriptionId, p_confirmed: confirmed });
  const status = await ports.rpc('job_loop_billing_status', { ...base, p_mode: mode });
  return { requestId: input.requestId, generation: input.generation, subscriptionId: input.subscriptionId, status: result.status === 'confirmed' ? 'confirmed' : 'uncertain', subscription: publicSubscription(status.subscription) };
}

export const LOOP_SUBSCRIPTION_EVENTS = new Set(['subscription.active','subscription.renewed','subscription.past_due','subscription.on_hold','subscription.cancelled','subscription.expired','subscription.failed','subscription.updated','subscription.paused','subscription.unpaused','subscription.plan_changed','subscription.update_payment_method']);
/** Read the original server-created checkout at Dodo. Metadata alone never establishes ownership. */
async function boundOrder(ports: LoopBillingPorts, config: LoopBillingConfig, sub: LoopSubscription) {
  const order = record(await ports.rpc('job_loop_billing_order', { p_user: sub.userId, p_request: sub.requestId, p_mode: config.mode }));
  if (order.user_id !== sub.userId || order.request_id !== sub.requestId || Number(order.generation) !== sub.generation || order.plan !== sqlPlan(sub.plan) || order.product_id !== sub.productId ||
    typeof order.session_id !== 'string' || !DODO_SESSION_ID.test(order.session_id)) throw new ApiError(409, 'LOOP_UNBOUND_SUBSCRIPTION', 'This subscription is not bound to a verified Job Loop checkout.');
  const checkout = await ports.provider(`checkouts/${order.session_id}`);
  if (checkout.id !== order.session_id || typeof checkout.payment_id !== 'string' || !DODO_PAYMENT_ID.test(checkout.payment_id)) throw new ApiError(409, 'LOOP_UNBOUND_SUBSCRIPTION', 'This subscription checkout has not been verified.');
  const original = await ports.provider(`payments/${checkout.payment_id}`);
  const customer = record(original.customer);
  if (original.payment_id !== checkout.payment_id || original.checkout_session_id !== order.session_id || original.subscription_id !== sub.subscriptionId || customer.customer_id !== sub.customerId) throw new ApiError(409, 'LOOP_UNBOUND_SUBSCRIPTION', 'This subscription does not match its original checkout.');
  return { ...order, originalPayment: original } as Record<string, unknown>;
}
async function payloadHash(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(byte => byte.toString(16).padStart(2,'0')).join('');
}
function signedOccurrence(event: DodoEvent) {
  const data = event.data;
  const metadata = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata) ? data.metadata as Record<string, unknown> : {};
  const customer = data.customer && typeof data.customer === 'object' && !Array.isArray(data.customer) ? data.customer as Record<string, unknown> : {};
  // Dodo documents snapshots refreshed at delivery, including retries. Lifecycle
  // state, billing dates and text can evolve; the signed occurrence identity may
  // not. A previously applied occurrence is acknowledged without a second grant.
  return { type: event.type, created: event.created, payloadType: data.payload_type ?? null,
    subscription: data.subscription_id ?? null, payment: data.payment_id ?? null, refund: data.refund_id ?? null, customer: customer.customer_id ?? null,
    metadata: { product: metadata.product ?? null, user: metadata.user_id ?? null, request: metadata.request_id ?? null, generation: metadata.generation ?? null, plan: metadata.plan ?? null } };
}
/** Called only after the exact body has passed Standard Webhooks signature verification. */
export async function applyLoopBillingWebhook(ports: LoopBillingPorts, config: LoopBillingConfig, event: DodoEvent, webhookId: string, verifiedRawBody?: string): Promise<Record<string, unknown> | null> {
  const hash = await payloadHash(signedOccurrence(event));
  const seen = await ports.rpc('job_loop_billing_event', { p_mode: config.mode, p_event: `dodo_${webhookId}`, p_payload_hash: hash });
  if (seen.duplicate === true) return { received: true, duplicate: true };
  let subscriptionId: string | null = null;
  let payment: Record<string, unknown> | null = null;
  let forceRevoke = false;
  if (LOOP_SUBSCRIPTION_EVENTS.has(event.type)) {
    if (!isLoopBillingMetadata(event.data.metadata)) return null;
    if (event.data.payload_type !== 'Subscription') throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Subscription event cannot be verified.');
    subscriptionId = typeof event.data.subscription_id === 'string' ? event.data.subscription_id : null;
    if (event.type === 'subscription.renewed') {
      if (typeof event.data.payment_id !== 'string' || !DODO_PAYMENT_ID.test(event.data.payment_id)) throw new ApiError(409, 'LOOP_PAYMENT_PROOF_REQUIRED', 'The renewal payment must be verified before extending access.');
      payment = await ports.provider(`payments/${event.data.payment_id}`);
      if (payment.payment_id !== event.data.payment_id) throw unavailable();
      if (payment.status !== 'succeeded') throw new ApiError(503, 'LOOP_PAYMENT_CONFIRMATION_PENDING', 'The renewal payment is still being confirmed. Delivery will be retried.');
    }
  } else if (event.type === 'payment.succeeded' || event.type === 'payment.failed') {
    if (typeof event.data.subscription_id !== 'string') return null;
    if (event.data.payload_type !== 'Payment') throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Payment event cannot be verified.');
    if (!LOOP_SUBSCRIPTION_ID.test(event.data.subscription_id) || typeof event.data.payment_id !== 'string' || !DODO_PAYMENT_ID.test(event.data.payment_id)) throw unavailable();
    subscriptionId = event.data.subscription_id;
    payment = await ports.provider(`payments/${event.data.payment_id}`);
    if (payment.payment_id !== event.data.payment_id) throw unavailable();
    if (event.type === 'payment.succeeded' && payment.status !== 'succeeded') throw new ApiError(503, 'LOOP_PAYMENT_CONFIRMATION_PENDING', 'The payment is still being confirmed. Delivery will be retried.');
  } else if (event.type === 'refund.succeeded') {
    if (event.data.payload_type !== 'Refund') throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Refund event cannot be verified.');
    const refund = validateDodoRefund(event.data);
    payment = await ports.provider(`payments/${refund.paymentId}`);
    if (payment.payment_id !== refund.paymentId) throw unavailable();
    if (typeof payment.subscription_id !== 'string') return null;
    subscriptionId = payment.subscription_id;
    // The signed Standard Webhooks refund supplies immutable refund identity; the
    // provider payment independently supplies owner, checkout and paid period. No
    // Refunds permission is needed, matching the established one-time refund path.
    if (refund.amount > Number(payment.total_amount)) throw unavailable();
    forceRevoke = true;
  } else return null;
  if (!subscriptionId || !LOOP_SUBSCRIPTION_ID.test(subscriptionId)) throw unavailable();
  const source = await ports.provider(`subscriptions/${subscriptionId}`);
  if (!isLoopBillingMetadata(source.metadata)) return null;
  const sub = validateLoopSubscription(source, config);
  if (sub.subscriptionId !== subscriptionId) throw unavailable();
  validateLoopBillingProduct(await ports.provider(`products/${sub.productId}`), config, sub.plan);
  const order = await boundOrder(ports, config, sub);
  if (!payment && event.type === 'subscription.active' && record(order.originalPayment).status === 'succeeded') payment = record(order.originalPayment);
  const paid = payment?.status === 'succeeded' ? validateLoopPaidPeriod(payment, sub) : null;
  if (payment && payment.subscription_id !== subscriptionId) throw unavailable();
  if (paid?.sessionId && paid.sessionId !== order.session_id) throw new ApiError(409, 'LOOP_UNBOUND_SUBSCRIPTION', 'The charge checkout differs from the original subscription checkout.');
  // Billing dates alone never extend paid access. A succeeded payment supplies immutable service_periods.
  let graceUntil: string | null = null;
  if (sub.status === 'past_due' && event.data.payload_type === 'Subscription' && event.data.status === 'past_due' && event.data.subscription_id === sub.subscriptionId && event.data.past_due_ends_at !== null && event.data.past_due_ends_at !== undefined) {
    const value = event.data.past_due_ends_at;
    if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw unavailable();
    graceUntil = new Date(value).toISOString();
  }
  const authority = { p_user: sub.userId, p_request: sub.requestId, p_mode: config.mode, p_plan: sqlPlan(sub.plan), p_product: sub.productId,
    p_session: order.session_id, p_subscription: sub.subscriptionId, p_customer: sub.customerId, p_status: sub.status,
    p_period_start: paid?.periodStart ?? sub.periodStart, p_valid_until: paid?.validUntil ?? sub.validUntil,
    p_cancel_at_period_end: sub.cancelAtPeriodEnd, p_event: `dodo_${webhookId}`, p_created: event.created,
    p_revoked: forceRevoke || paid?.revoked === true, p_payment: paid?.paymentId ?? null, p_paid_amount: paid?.amount ?? null, p_grace_until: graceUntil };
  const result = await ports.rpc('job_loop_billing_apply_event', { ...authority, p_payload_hash: hash });
  if (result.pendingFulfillment === true) throw new ApiError(503, 'LOOP_BILLING_FULFILLMENT_PENDING', 'Payment received; Job Loop access requires support reconciliation.');
  return { received: true, ...result };
}
