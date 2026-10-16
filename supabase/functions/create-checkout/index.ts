import { ApiError, isPassPlan, objectInput, PASS, uuid, type PassPlanKey } from '../_shared/core.ts';
import { dodoCheckoutBody, dodoCheckoutExpiry, dodoExpectedProduct, validateDodoCheckoutSession, validateDodoProduct } from '../_shared/dodo.ts';
import { validatePaddlePrice, validatePaddleTransaction } from '../_shared/paddle.ts';
import { authenticatedClient, databaseError, dodoRequest, getBilling, json, paddleRequest, readJson, serve, stripeRequest } from '../_shared/runtime.ts';

serve(async req => {
  const { admin, user } = await authenticatedClient(req);
  const billing = getBilling();
  if (!billing) throw new ApiError(503, 'BILLING_UNAVAILABLE', 'Payments are not enabled yet.');
  const input = objectInput(await readJson(req));
  const requestId = uuid(input.requestId, 'Request ID');
  // A pass names only its plan key. Omitted means the legacy pack, exactly as before.
  let plan: PassPlanKey | null = null;
  if (input.plan !== undefined && input.plan !== null) {
    if (!isPassPlan(input.plan)) throw new ApiError(400, 'INVALID_INPUT', 'Choose one of the listed passes.');
    plan = input.plan;
  }
  if (plan && billing.provider !== 'dodo') throw new ApiError(503, 'BILLING_UNAVAILABLE', 'Passes are not on sale yet.');
  if (billing.provider === 'paddle') validatePaddlePrice(await paddleRequest(billing, `prices/${billing.priceId}`), billing.priceId);
  if (billing.provider === 'dodo') {
    // Fail closed unless the configured product is a one-time USD price equal to this plan's price.
    const expected = dodoExpectedProduct(billing, plan);
    validateDodoProduct(await dodoRequest(billing, `products/${expected.productId}`), expected.productId, expected.amount);
  }
  const planArgument = plan ? { p_plan: plan } : {};
  const { data: order, error } = await admin.rpc('jobvance_begin_checkout', { p_user_id: user.id, p_request_id: requestId, p_provider: billing.provider, p_billing_mode: billing.mode, ...planArgument });
  databaseError(error);
  if (order.status !== 'created') throw new ApiError(409, 'CHECKOUT_FINISHED', 'This checkout was already completed. Refresh your pack balance.');
  if (billing.provider === 'paddle') {
    let transaction: Record<string, unknown>;
    if (order.checkout_session_id) transaction = await paddleRequest(billing, `transactions/${order.checkout_session_id}`);
    else {
      if (!order.creationClaimAcquired) throw new ApiError(409, 'CHECKOUT_RECOVERY_REQUIRED', 'This checkout is still being prepared or needs recovery. Retry shortly; if it remains unavailable, start a new checkout or contact support.');
      // A durable claim prevents concurrent duplicate transaction creation. We do not
      // assume undocumented provider idempotency after an ambiguous network failure.
      transaction = await paddleRequest(billing, 'transactions', { collection_mode: 'automatic', currency_code: 'USD',
        items: [{ price_id: billing.priceId, quantity: 1 }], custom_data: { user_id: user.id, request_id: requestId, product: PASS.product } });
    }
    const verified = validatePaddleTransaction(transaction, billing.priceId, false);
    if (verified.userId !== user.id || verified.requestId !== requestId) throw new ApiError(409, 'REQUEST_CONFLICT', 'The checkout identity does not match this request.');
    if (transaction.status !== 'draft' && transaction.status !== 'ready') throw new ApiError(409, 'CHECKOUT_FINISHED', 'This checkout is no longer open. Refresh your pack balance or start a new checkout.');
    const { error: savedError } = await admin.rpc('jobvance_finish_checkout', { p_user_id: user.id, p_request_id: requestId, p_session_id: verified.transactionId,
      p_url: null, p_expires_at: null, p_provider: billing.provider, p_billing_mode: billing.mode });
    databaseError(savedError);
    return json(req, { provider: 'paddle', transactionId: verified.transactionId, billingMode: billing.mode });
  }
  if (billing.provider === 'dodo') {
    if (order.checkout_url) {
      if (!(dodoCheckoutExpiry(order) > Date.now())) throw new ApiError(409, 'CHECKOUT_EXPIRED', 'This checkout expired. Start a new checkout.');
      return json(req, { provider: 'dodo', url: order.checkout_url, sessionId: order.checkout_session_id, billingMode: billing.mode });
    }
    if (!order.creationClaimAcquired) throw new ApiError(409, 'CHECKOUT_RECOVERY_REQUIRED', 'This checkout is still being prepared or needs recovery. Retry shortly; if it remains unavailable, start a new checkout or contact support.');
    // The durable claim prevents concurrent duplicate sessions. Dodo documents no idempotency key
    // for checkout sessions, so an ambiguous failure is never retried against the provider.
    const session = validateDodoCheckoutSession(await dodoRequest(billing, 'checkouts', dodoCheckoutBody(billing, user.id, requestId, plan)), billing.mode);
    const { error: savedError } = await admin.rpc('jobvance_finish_checkout', { p_user_id: user.id, p_request_id: requestId, p_session_id: session.sessionId,
      p_url: session.url, p_expires_at: null, p_provider: billing.provider, p_billing_mode: billing.mode, ...planArgument });
    databaseError(savedError);
    return json(req, { provider: 'dodo', url: session.url, sessionId: session.sessionId, billingMode: billing.mode });
  }
  if (order.checkout_url) {
    if (Date.parse(order.checkout_expires_at) <= Date.now()) throw new ApiError(409, 'CHECKOUT_EXPIRED', 'This checkout expired. Start a new checkout.');
    return json(req, { provider: 'stripe', url: order.checkout_url, sessionId: order.checkout_session_id, billingMode: billing.mode });
  }
  const form = new URLSearchParams({ mode: 'payment', 'payment_method_types[0]': 'card', client_reference_id: user.id,
    success_url: `${billing.appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${billing.appUrl}/dashboard?checkout=cancelled`,
    'line_items[0][price_data][currency]': PASS.currency, 'line_items[0][price_data][unit_amount]': String(PASS.amount),
    'line_items[0][price_data][product_data][name]': 'Jobvance: 10 application packs, valid 30 days', 'line_items[0][quantity]': '1',
  });
  for (const [name, value] of Object.entries({ user_id: user.id, request_id: requestId, product: PASS.product })) {
    form.set(`metadata[${name}]`, value); form.set(`payment_intent_data[metadata][${name}]`, value);
  }
  const session = await stripeRequest(billing, 'checkout/sessions', form, `jobvance:${user.id}:${requestId}`);
  if (typeof session.id !== 'string' || typeof session.url !== 'string' || typeof session.expires_at !== 'number' || session.livemode !== (billing.mode === 'live')) throw new ApiError(503, 'INVALID_PAYMENT_SESSION', 'The checkout session could not be verified.');
  const { error: savedError } = await admin.rpc('jobvance_finish_checkout', { p_user_id: user.id, p_request_id: requestId, p_session_id: session.id, p_url: session.url, p_expires_at: new Date(session.expires_at * 1000).toISOString(), p_provider: billing.provider, p_billing_mode: billing.mode });
  databaseError(savedError);
  return json(req, { provider: 'stripe', url: session.url, sessionId: session.id, billingMode: billing.mode });
});
