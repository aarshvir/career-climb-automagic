import { ApiError, isPassMetadata, objectInput } from '../_shared/core.ts';
import { PADDLE_EVENT_ID, PADDLE_TRANSACTION_ID, validateApprovedPaddleRefund, validatePaddleTransaction, verifyPaddleSignature } from '../_shared/paddle.ts';
import { adminClient, boundedBody, databaseError, getBilling, json, paddleRequest, serve } from '../_shared/runtime.ts';

serve(async req => {
  const billing = getBilling();
  if (!billing || billing.provider !== 'paddle') throw new ApiError(503, 'BILLING_UNAVAILABLE', 'Paddle payment processing is disabled.');
  const raw = await boundedBody(req, 262144);
  await verifyPaddleSignature(raw, req.headers.get('Paddle-Signature'), billing.webhookSecret);
  let event: Record<string, unknown>;
  try { event = objectInput(JSON.parse(raw)); } catch { throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Invalid payment event.'); }
  const occurred = typeof event.occurred_at === 'string' ? Date.parse(event.occurred_at) : NaN;
  if (typeof event.event_id !== 'string' || !PADDLE_EVENT_ID.test(event.event_id) || !Number.isFinite(occurred)) throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Payment event cannot be verified.');
  if (event.event_type !== 'transaction.completed' && event.event_type !== 'adjustment.created' && event.event_type !== 'adjustment.updated') return json(req, { received: true, ignored: true });
  const item = objectInput(event.data);
  const action = event.event_type === 'transaction.completed' ? 'paid' : 'refund';
  let transaction: Record<string, unknown>;
  if (action === 'paid') {
    if (!isPassMetadata(item.custom_data)) return json(req, { received: true, ignored: true });
    transaction = item;
  } else {
    // Pending/rejected requests and non-refund adjustments never remove credits.
    if (item.action !== 'refund' || item.status !== 'approved') return json(req, { received: true, ignored: true });
    if (typeof item.transaction_id !== 'string' || !PADDLE_TRANSACTION_ID.test(item.transaction_id)) throw new ApiError(400, 'INVALID_REFUND', 'The refund transaction cannot be verified.');
    transaction = await paddleRequest(billing, `transactions/${item.transaction_id}`);
    if (!isPassMetadata(transaction.custom_data)) return json(req, { received: true, ignored: true });
  }
  const verified = validatePaddleTransaction(transaction, billing.priceId);
  const refundAmount = action === 'refund' ? validateApprovedPaddleRefund(item, verified.transactionId) : 0;
  const admin = adminClient();
  const { data: order, error: orderError } = await admin.from('billing_orders').select('id').eq('user_id', verified.userId).eq('request_id', verified.requestId)
    .eq('provider', 'paddle').eq('billing_mode', billing.mode).eq('payment_intent', `paddle_${verified.transactionId}`).maybeSingle();
  databaseError(orderError);
  // A public Paddle token can create its own checkouts/custom data. Only transactions
  // created and bound by our authenticated backend may grant credits to an account.
  if (!order) throw new ApiError(409, 'UNBOUND_PAYMENT', 'This transaction is not bound to a verified checkout order.');
  const { data: result, error } = await admin.rpc('jobvance_apply_payment_event', { p_event_id: `paddle_${event.event_id}`, p_event_type: event.event_type,
    p_event_created: Math.floor(occurred / 1000), p_action: action, p_user_id: verified.userId, p_request_id: verified.requestId,
    p_payment_intent: `paddle_${verified.transactionId}`, p_session_id: action === 'paid' ? verified.transactionId : null, p_refund_amount: refundAmount,
    p_provider: 'paddle', p_billing_mode: billing.mode, p_refund_id: action === 'refund' ? `paddle_${item.id}` : null });
  databaseError(error);
  return json(req, { received: true, duplicate: result?.duplicate ?? false });
});
