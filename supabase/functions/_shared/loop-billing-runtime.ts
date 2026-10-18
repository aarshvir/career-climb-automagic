import { ApiError } from './core.ts';
import { DODO_PAYMENT_ID, DODO_SESSION_ID, DODO_SESSION_LIFETIME_MS, validateDodoCheckoutSession, type DodoEvent } from './dodo.ts';
import { captureLoopBillingInput, isLoopBillingMetadata, LOOP_BILLING_PLANS, LOOP_SUBSCRIPTION_ID, loopCheckoutBody, loopMetadata, validateLoopBillingProduct, validateLoopPaidPeriod, validateLoopRefund, validateLoopSubscription, validateLoopSubscriptionToStop, type LoopBillingConfig, type LoopSubscription } from './loop-billing.ts';
import { loopPricePreviewBody, parseLoopQuote, publicLoopPrice, publicLoopQuote, quoteCheckoutBody, storedLoopPrice, validateLoopPriceCandidate, verifyLoopPricePreview, verifyLoopPriceRule, type LoopPriceQuote, type LoopPriceSnapshot } from './loop-billing-pricing.ts';
import { accountingBindArgs, currentLoopAccountingPeriod, knownLoopAccounting, knownLoopPaymentAccounting, proveLoopAccounting } from './loop-billing-accounting.ts';

export interface LoopBillingPorts {
  rpc<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T>;
  provider(endpoint: string, body?: Record<string, unknown>, method?: 'GET'|'POST'|'PATCH'): Promise<Record<string, unknown>>;
  now?: () => number;
}
const unavailable = () => new ApiError(503, 'LOOP_BILLING_UNAVAILABLE', 'Job Loop subscriptions are temporarily unavailable. Your existing records remain available.');
const sqlPlan = (plan: string) => plan === 'active' ? 'three_weekly' : plan;
const publicPlan = (plan: unknown) => plan === 'three_weekly' ? 'active' : plan;
function publicSubscription(value: unknown, version = 1) {
  if (!value) return null;
  const sub = record(value);
  return { subscriptionId: sub.subscriptionId, plan: publicPlan(sub.plan), status: sub.status, validUntil: sub.validUntil, periodStart: sub.periodStart,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd, revoked: sub.revoked, version: sub.revision, graceUntil: sub.graceUntil ?? null,
    ...(version === 2 ? { pricing: publicLoopPrice(storedLoopPrice({ pricing:sub.pricing }, publicPlan(sub.plan) as never)) } : {}) };
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable(); return value as Record<string, unknown>; }
async function verifiedPrice(ports: LoopBillingPorts, config: LoopBillingConfig, pricing: LoopPriceSnapshot) {
  const product = await ports.provider(`products/${pricing.productId}`);
  const rules = pricing.currency === 'USD' ? null : await ports.provider(`products/${pricing.productId}/localized-prices`);
  const rule = await verifyLoopPriceRule(product, rules, config, pricing);
  const previewHash = await verifyLoopPricePreview(await ports.provider('checkouts/preview', loopPricePreviewBody(pricing)), pricing);
  return { ...rule, previewHash };
}
function sameQuote(quote: LoopPriceQuote, identity: {plan:string;generation:number;quoteId?:string}, mode:string) {
  if (quote.mode !== mode || quote.plan !== identity.plan || quote.generation !== identity.generation || identity.quoteId && quote.quoteId !== identity.quoteId) throw new ApiError(409,'LOOP_BILLING_PRICE_CHANGED','This quote belongs to a different billing action. Refresh the price.');
}
export async function controlLoopBilling(ports: LoopBillingPorts, config: LoopBillingConfig | null, owner: string, authSession: string, raw: unknown, fallbackMode: 'test'|'live' = 'test') {
  // Immutable primitive-only intent is captured before any asynchronous operation.
  const input = captureLoopBillingInput(raw);
  const mode = config?.mode ?? fallbackMode;
  const base = { p_user: owner, p_auth_session: authSession };
  if (input.action === 'status') {
    const status = await ports.rpc(input.contractVersion === 2 ? 'job_loop_billing_status_v2' : 'job_loop_billing_status', { ...base, p_mode: mode });
    const checkout = status.checkout ? record(status.checkout) : null;
    const cancel = status.cancelRequest ? record(status.cancelRequest) : null;
    if (input.contractVersion !== 2 && [status.subscription,checkout].some(value => value && record(value).pricing && record(record(value).pricing).currency !== 'USD')) throw new ApiError(409,'LOOP_BILLING_CONTRACT_REQUIRED','Refresh this page to manage your subscription in its original currency.');
    return { generation: status.generation, entitlement: status.entitlement, fulfillmentPending: status.fulfillmentPending === true, subscription: publicSubscription(status.subscription,input.contractVersion), checkout: checkout ? { requestId: checkout.requestId, status: checkout.status, checkoutUrl: checkout.checkoutUrl, plan: publicPlan(checkout.plan),
      ...(input.contractVersion === 2 ? { pricing:publicLoopPrice(storedLoopPrice({pricing:checkout.pricing},publicPlan(checkout.plan) as never)) } : {}) } : null,
      cancelRequest: cancel ? { requestId: cancel.requestId, subscriptionId: cancel.subscriptionId, status: cancel.status, version: cancel.version } : null, billingConfigured: !!config, billingMode: mode,
      plans: Object.entries(LOOP_BILLING_PLANS).map(([id, plan]) => ({ id, amount: plan.amount, runsPerWeek: plan.runsPerWeek, currency: 'USD', interval: 'month' })) };
  }
  if (!config) throw unavailable();
  const bound = { ...base, p_generation: input.generation, p_request: input.requestId };
  if (input.action === 'quote') {
    const selected = { ...bound,p_mode:mode,p_plan:sqlPlan(input.plan),p_country:input.country,p_currency:input.currency };
    const candidate = record(await ports.rpc('job_loop_billing_quote_candidate',selected));
    if (candidate.quote) {
      const quote=parseLoopQuote(candidate.quote);sameQuote(quote,input,mode);
      if(quote.requestId!==input.requestId||quote.country!==input.country||quote.currency!==input.currency)throw new ApiError(409,'LOOP_BILLING_PRICE_CHANGED','This price request belongs to another selection. Request a fresh price.');
      return publicLoopQuote(quote);
    }
    const pricing=validateLoopPriceCandidate(candidate.catalog,config,input);
    const verified=await verifiedPrice(ports,config,pricing);
    const quote=parseLoopQuote(await ports.rpc('job_loop_billing_quote_issue',{...selected,p_catalog_version:pricing.catalogVersion,p_product:pricing.productId,p_rule:verified.localizedPriceId,p_provider_revision:verified.providerRevision,p_preview_hash:verified.previewHash,p_initial_amount:pricing.amountMinor,p_recurring_amount:pricing.amountMinor}));
    sameQuote(quote,input,mode);
    if(quote.requestId!==input.requestId||quote.country!==input.country||quote.currency!==input.currency||quote.amountMinor!==pricing.amountMinor||quote.catalogVersion!==pricing.catalogVersion)throw unavailable();
    return publicLoopQuote(quote);
  }
  if (input.action === 'checkout') {
    let quote:LoopPriceQuote|null=null;
    if(input.quoteId){quote=parseLoopQuote(await ports.rpc('job_loop_billing_quote_read',{...base,p_generation:input.generation,p_mode:mode,p_quote:input.quoteId}));sameQuote(quote,input,mode);}
    else validateLoopBillingProduct(await ports.provider(`products/${config.loopProducts[input.plan]}`), config, input.plan);
    const order = record(await ports.rpc(quote?'job_loop_billing_checkout_claim_v2':'job_loop_billing_checkout_claim', { ...bound, p_mode: mode, p_plan: sqlPlan(input.plan), p_product: quote?.productId??config.loopProducts[input.plan],...(quote?{p_quote:quote.quoteId}:{}) }));
    if(quote){const original=storedLoopPrice(order,input.plan);if(original.quoteId!==quote.quoteId||original.amountMinor!==quote.amountMinor||original.currency!==quote.currency||original.productId!==quote.productId)throw unavailable();}
    if (!['creating','ready','uncertain','failed'].includes(String(order.state))) throw new ApiError(409, 'LOOP_CHECKOUT_FINISHED', 'This checkout is no longer open. Refresh your subscription.');
    let session: { sessionId: string; url: string };
    if (order.checkout_url) {
      if (typeof order.created_at !== 'string' || !(Date.parse(order.created_at) + DODO_SESSION_LIFETIME_MS > (ports.now?.() ?? Date.now()))) throw new ApiError(409, 'LOOP_CHECKOUT_EXPIRED', 'This checkout link expired. Contact support to reconcile any pending payment before another checkout.');
      session = validateDodoCheckoutSession({ session_id: order.session_id, checkout_url: order.checkout_url }, mode);
    } else {
      if (order.creationClaimAcquired !== true) throw new ApiError(409, 'LOOP_CHECKOUT_RECOVERY_REQUIRED', 'This checkout needs recovery. Keep the same request and contact support if it remains unavailable.');
      // No undocumented provider idempotency is assumed: an ambiguous POST is never repeated.
      if(quote){
        try{
          if(!(Date.parse(quote.expiresAt)>(ports.now?.()??Date.now())))throw new ApiError(409,'LOOP_BILLING_QUOTE_EXPIRED','This price quote expired. Request a fresh quote before checkout.');
          const verified=await verifiedPrice(ports,config,quote);
          if(verified.localizedPriceId!==quote.localizedPriceId||verified.providerRevision!==quote.providerRevision||verified.previewHash!==quote.previewHash)throw new ApiError(409,'LOOP_BILLING_PRICE_CHANGED','This price changed. Request a fresh quote before checkout.');
        }catch(error){await ports.rpc('job_loop_billing_checkout_fail',{...bound,p_retryable:true});throw error;}
      }
      try {
        session = validateDodoCheckoutSession(await ports.provider('checkouts', quote?quoteCheckoutBody(config, owner, input.requestId, input.generation, quote):loopCheckoutBody(config, owner, input.requestId, input.generation, input.plan)), mode);
        await ports.rpc('job_loop_billing_checkout_finalize', { ...bound, p_session: session.sessionId, p_url: session.url });
      } catch (error) {
        await ports.rpc('job_loop_billing_checkout_fail', { ...bound, p_retryable: false }).catch(() => undefined);
        throw error;
      }
    }
    return { provider: 'dodo', billingMode: mode, requestId: input.requestId, generation: input.generation, plan: input.plan, sessionId: session.sessionId, url: session.url,...(quote?{pricing:publicLoopPrice(quote)}:{}) };
  }
  const claim = record(await ports.rpc('job_loop_billing_cancel_claim', { ...bound, p_mode: mode, p_subscription: input.subscriptionId, p_version: input.version }));
  let confirmed = false;
  let writeAttempted = false;
  let sub: LoopSubscription | null = null;
  try {
    const source=await ports.provider(`subscriptions/${input.subscriptionId}`),identity=loopMetadata(source.metadata);
    if(identity.userId!==owner)throw new ApiError(409,'LOOP_BILLING_IDENTITY_CHANGED','This subscription no longer matches your account.');
    const order=record(await ports.rpc('job_loop_billing_order',{p_user:owner,p_request:identity.requestId,p_mode:mode}));
    if(order.user_id!==owner||order.request_id!==identity.requestId||order.plan!==sqlPlan(identity.plan)||Number(order.generation)!==identity.generation)throw new ApiError(409,'LOOP_BILLING_IDENTITY_CHANGED','This subscription no longer matches your account.');
    const pricing=storedLoopPrice(order,identity.plan);
    sub = validateLoopSubscriptionToStop(source, config,pricing);
    if (sub.userId !== owner || sub.subscriptionId !== input.subscriptionId) throw new ApiError(409, 'LOOP_BILLING_IDENTITY_CHANGED', 'This subscription no longer matches your account.');
    await boundOrder(ports,config,sub,order);
    const originalCustomer=sub.customerId;
    confirmed = sub.cancelAtPeriodEnd || ['cancelled','failed','expired'].includes(sub.status);
    if (!confirmed && claim.creationClaimAcquired === true) {
      writeAttempted = true;
      await ports.provider(`subscriptions/${input.subscriptionId}`, { cancel_at_next_billing_date: true }, 'PATCH');
      sub = validateLoopSubscriptionToStop(await ports.provider(`subscriptions/${input.subscriptionId}`), config,pricing);
      if (sub.userId !== owner || sub.subscriptionId !== input.subscriptionId || sub.customerId!==originalCustomer) throw unavailable();
      confirmed = sub.cancelAtPeriodEnd || ['cancelled','failed','expired'].includes(sub.status);
    }
  } catch (error) {
    if (claim.creationClaimAcquired === true && !writeAttempted) {
      // The only write-authorized caller failed before starting a provider write.
      // Release that exact intent durably; an ambiguous PATCH can never use this path.
      await ports.rpc('job_loop_billing_cancel_retryable', { ...bound, p_mode: mode, p_subscription: input.subscriptionId });
      if (error instanceof ApiError && error.code === 'LOOP_BILLING_IDENTITY_CHANGED') throw error;
      throw new ApiError(503, 'LOOP_CANCELLATION_RETRYABLE', 'Cancellation was not sent. Retry the same cancellation request after billing becomes available.');
    }
    if (error instanceof ApiError && error.code === 'LOOP_BILLING_IDENTITY_CHANGED') throw error;
    // An ambiguous cancellation may have succeeded at Dodo. Keep its original durable intent.
  }
  const result = await ports.rpc('job_loop_billing_cancel_finalize', { ...bound, p_mode: mode, p_subscription: input.subscriptionId, p_confirmed: confirmed });
  const status = await ports.rpc(input.contractVersion===2?'job_loop_billing_status_v2':'job_loop_billing_status', { ...base, p_mode: mode });
  return { requestId: input.requestId, generation: input.generation, subscriptionId: input.subscriptionId, status: result.status === 'confirmed' ? 'confirmed' : 'uncertain', subscription: publicSubscription(status.subscription,input.contractVersion) };
}

export const LOOP_SUBSCRIPTION_EVENTS = new Set(['subscription.active','subscription.renewed','subscription.past_due','subscription.on_hold','subscription.cancelled','subscription.expired','subscription.failed','subscription.updated','subscription.paused','subscription.unpaused','subscription.plan_changed','subscription.update_payment_method']);
/** Read the original server-created checkout at Dodo. Metadata alone never establishes ownership. */
async function boundOrder(ports: LoopBillingPorts, config: LoopBillingConfig, sub: Pick<LoopSubscription,'userId'|'requestId'|'generation'|'plan'|'productId'|'subscriptionId'|'customerId'>, originalOrder?:Record<string,unknown>) {
  const order = originalOrder??record(await ports.rpc('job_loop_billing_order', { p_user: sub.userId, p_request: sub.requestId, p_mode: config.mode }));
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
    ...(typeof data.currency==='string'&&data.currency!=='USD'?{currency:data.currency}:{}),
    metadata: { product: metadata.product ?? null, user: metadata.user_id ?? null, request: metadata.request_id ?? null, generation: metadata.generation ?? null, plan: metadata.plan ?? null,
      ...(metadata.quote_id!==undefined&&metadata.quote_id!==null?{quote:metadata.quote_id}:{}) } };
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
    const refund = validateLoopRefund(event.data);
    payment = await ports.provider(`payments/${refund.paymentId}`);
    if (payment.payment_id !== refund.paymentId) throw unavailable();
    if (typeof payment.subscription_id !== 'string') return null;
    subscriptionId = payment.subscription_id;
    // The signed Standard Webhooks refund supplies immutable refund identity; the
    // provider payment independently supplies owner, checkout and paid period. No
    // Refunds permission is needed, matching the established one-time refund path.
    if (refund.amount > Number(payment.total_amount) || refund.currency!==null && refund.currency!==payment.currency) throw unavailable();
    forceRevoke = true;
  } else return null;
  if (!subscriptionId || !LOOP_SUBSCRIPTION_ID.test(subscriptionId)) throw unavailable();
  const source = await ports.provider(`subscriptions/${subscriptionId}`);
  if (!isLoopBillingMetadata(source.metadata)) return null;
  const identity=loopMetadata(source.metadata);
  const originalOrder=record(await ports.rpc('job_loop_billing_order',{p_user:identity.userId,p_request:identity.requestId,p_mode:config.mode}));
  const pricing=storedLoopPrice(originalOrder,identity.plan);
  if(source.subscription_id!==subscriptionId)throw unavailable();
  const subject={...identity,subscriptionId,productId:source.product_id as string,customerId:record(source.customer).customer_id as string};
  // The original owned order is price authority. Changing today's catalogue or
  // archiving its localized rule must never prevent historical renewal/cancel.
  const order = await boundOrder(ports, config, subject,originalOrder);
  if (!payment && event.type === 'subscription.active' && record(order.originalPayment).status === 'succeeded') payment = record(order.originalPayment);
  const negativeStatus=['failed','on_hold','paused','expired','cancelled'].includes(String(source.status));
  const negativeEvent=['payment.failed','subscription.failed','subscription.on_hold','subscription.paused','subscription.expired','subscription.cancelled'].includes(event.type);
  const negativeOnly=negativeStatus&&negativeEvent&&(event.type==='payment.failed'?payment?.status==='failed':event.data.status===source.status);
  let accounting=knownLoopAccounting(order,source,pricing);
  const historicalPaidAnchor=!forceRevoke&&!negativeOnly&&payment?.status==='succeeded'&&knownLoopPaymentAccounting(order,source,payment,pricing);
  if(pricing.quoteId&&pricing.currency!=='USD'&&source.currency==='USD'&&!forceRevoke&&!negativeOnly){
    // A genuine localized payment may have a separate USD accounting tuple.
    // Only an exact quote-currency succeeded paid cycle can authorize a new
    // immutable tuple. Repeated/older refunds never rebind that payment.
    const proof=payment?.status==='succeeded'?payment:!accounting&&record(order.originalPayment).status==='succeeded'?record(order.originalPayment):null;
    if(proof&&!historicalPaidAnchor&&currentLoopAccountingPeriod(source,proof)){
      const anchor=proveLoopAccounting(source,proof,config,pricing);
      await ports.rpc('job_loop_billing_accounting_bind',{p_user:identity.userId,p_request:identity.requestId,p_mode:config.mode,...accountingBindArgs(anchor)});
      accounting={currency:anchor.accountingCurrency,amountMinor:anchor.accountingAmountMinor};
    }
  }
  const sub=forceRevoke||negativeOnly||!accounting&&historicalPaidAnchor?validateLoopSubscriptionToStop(source,config,pricing):validateLoopSubscription(source,config,pricing,accounting);
  const paid = !negativeOnly&&payment?.status === 'succeeded' ? validateLoopPaidPeriod(payment, sub) : null;
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
  const result = await ports.rpc(sub.quoteId?'job_loop_billing_apply_event_v2':'job_loop_billing_apply_event', { ...authority, p_payload_hash: hash,...(sub.quoteId?{p_quote:sub.quoteId,p_currency:sub.currency}:{}) });
  if (result.pendingFulfillment === true) throw new ApiError(503, 'LOOP_BILLING_FULFILLMENT_PENDING', 'Payment received; Job Loop access requires support reconciliation.');
  return { received: true, ...result };
}
