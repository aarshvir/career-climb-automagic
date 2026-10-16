import { ApiError, isPassMetadata } from '../_shared/core.ts';
import { dodoLedgerRefundAmount, parseDodoEvent, validateDodoPayment, validateDodoRefund, verifyDodoSignature, type VerifiedDodoRefund } from '../_shared/dodo.ts';
import { adminClient, boundedBody, databaseError, dodoRequest, getBilling, json, serve } from '../_shared/runtime.ts';

serve(async req => {
  const billing = getBilling();
  if (!billing || billing.provider !== 'dodo') throw new ApiError(503, 'BILLING_UNAVAILABLE', 'Dodo payment processing is disabled.');
  const raw = await boundedBody(req, 262144);
  const webhookId = await verifyDodoSignature(raw, { id: req.headers.get('webhook-id'), timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature') }, billing.webhookSecret);
  const event = parseDodoEvent(raw);
  if (event.type !== 'payment.succeeded' && event.type !== 'refund.succeeded') return json(req, { received: true, ignored: true });
  const action = event.type === 'payment.succeeded' ? 'paid' : 'refund';
  let payment: Record<string, unknown>;
  let refund: VerifiedDodoRefund | null = null;
  if (action === 'paid') {
    if (event.data.payload_type !== 'Payment') throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Payment event cannot be verified.');
    if (!isPassMetadata(event.data.metadata)) return json(req, { received: true, ignored: true });
    payment = event.data;
  } else {
    if (event.data.payload_type !== 'Refund') throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Payment event cannot be verified.');
    refund = validateDodoRefund(event.data);
    // A refund carries its own metadata, not the payment's. Load the server-side payment so a refund
    // that arrives before payment.succeeded still writes a tombstone for the correct order.
    payment = await dodoRequest(billing, `payments/${refund.paymentId}`);
    if (!isPassMetadata(payment.metadata)) return json(req, { received: true, ignored: true });
  }
  const verified = validateDodoPayment(payment, billing.productId);
  const refundAmount = refund ? dodoLedgerRefundAmount(refund, verified) : 0;
  const admin = adminClient();
  const { data: order, error: orderError } = await admin.from('billing_orders').select('id').eq('user_id', verified.userId).eq('request_id', verified.requestId)
    .eq('provider', 'dodo').eq('billing_mode', billing.mode).eq('checkout_session_id', verified.sessionId).maybeSingle();
  databaseError(orderError);
  // Static payment links accept arbitrary metadata. Only a session that our authenticated backend
  // created and stored for this user and request may grant or revoke credits.
  if (!order) throw new ApiError(409, 'UNBOUND_PAYMENT', 'This payment is not bound to a verified checkout order.');
  const { data: result, error } = await admin.rpc('jobvance_apply_payment_event', { p_event_id: `dodo_${webhookId}`, p_event_type: event.type,
    p_event_created: event.created, p_action: action, p_user_id: verified.userId, p_request_id: verified.requestId,
    p_payment_intent: `dodo_${verified.paymentId}`, p_session_id: verified.sessionId, p_refund_amount: refundAmount,
    p_provider: 'dodo', p_billing_mode: billing.mode, p_refund_id: refund ? `dodo_${refund.refundId}` : null });
  databaseError(error);
  return json(req, { received: true, duplicate: result?.duplicate ?? false });
});
