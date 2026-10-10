import { ApiError, isPassMetadata, objectInput, PASS, paymentMetadata, verifyStripeSignature } from '../_shared/core.ts';
import { adminClient, boundedBody, databaseError, getBilling, json, serve, stripeRequest } from '../_shared/runtime.ts';

serve(async req => {
  const billing = getBilling();
  if (!billing || billing.provider !== 'stripe') throw new ApiError(503, 'BILLING_UNAVAILABLE', 'Stripe payment processing is disabled.');
  const raw = await boundedBody(req, 262144);
  await verifyStripeSignature(raw, req.headers.get('stripe-signature'), billing.webhookSecret);
  let event: Record<string, unknown>;
  try { event = objectInput(JSON.parse(raw)); } catch { throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Invalid payment event.'); }
  if (typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) || !Number.isSafeInteger(event.created) || event.livemode !== (billing.mode === 'live')) throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Payment event cannot be verified.');
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded' && event.type !== 'charge.refunded') return json(req, { received: true, ignored: true });
  const data = objectInput(event.data);
  const item = objectInput(data.object);
  let metadata: { userId: string; requestId: string };
  let paymentIntent: string;
  let sessionId: string | null = null;
  let refundAmount = 0;
  const action = event.type === 'charge.refunded' ? 'refund' : 'paid';
  if (action === 'paid') {
    if (item.payment_status !== 'paid') return json(req, { received: true, ignored: true });
    if (!isPassMetadata(item.metadata)) return json(req, { received: true, ignored: true });
    if (item.mode !== 'payment' || item.amount_total !== PASS.amount || item.currency !== PASS.currency || typeof item.payment_intent !== 'string' || typeof item.id !== 'string') throw new ApiError(400, 'INVALID_PAYMENT', 'Payment does not match this pass.');
    metadata = paymentMetadata(item.metadata);
    paymentIntent = item.payment_intent;
    sessionId = item.id;
  } else {
    if (typeof item.payment_intent !== 'string') return json(req, { received: true, ignored: true });
    paymentIntent = item.payment_intent;
    if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntent)) throw new ApiError(400, 'INVALID_PAYMENT', 'Invalid payment reference.');
    // Retrieve server-owned intent metadata so refunds arriving before checkout-complete
    // still write a tombstone for the correct order and cannot resurrect credits later.
    const intent = await stripeRequest(billing, `payment_intents/${paymentIntent}`);
    if (!isPassMetadata(intent.metadata)) return json(req, { received: true, ignored: true });
    metadata = paymentMetadata(intent.metadata);
    if (item.amount !== PASS.amount || item.currency !== PASS.currency || intent.amount !== PASS.amount || intent.currency !== PASS.currency || !Number.isSafeInteger(item.amount_refunded) || Number(item.amount_refunded) < 1 || Number(item.amount_refunded) > PASS.amount) throw new ApiError(400, 'INVALID_PAYMENT', 'Refund does not match this pass.');
    refundAmount = Number(item.amount_refunded);
  }
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntent) || (sessionId && !/^cs_[A-Za-z0-9_]+$/.test(sessionId))) throw new ApiError(400, 'INVALID_PAYMENT', 'Invalid payment reference.');
  const { data: result, error } = await adminClient().rpc('jobvance_apply_payment_event', { p_event_id: event.id, p_event_type: event.type, p_event_created: event.created,
    p_action: action, p_user_id: metadata.userId, p_request_id: metadata.requestId, p_payment_intent: paymentIntent, p_session_id: sessionId, p_refund_amount: refundAmount, p_provider: billing.provider, p_billing_mode: billing.mode });
  databaseError(error);
  return json(req, { received: true, duplicate: result?.duplicate ?? false });
});
