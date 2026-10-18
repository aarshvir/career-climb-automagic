import { ApiError } from '../_shared/core.ts';
import { parseDodoEvent, validateDodoRefund, verifyDodoSignature } from '../_shared/dodo.ts';
import { adminClient, boundedBody, json, serve } from '../_shared/runtime.ts';
import { loopBillingTestConfiguration } from '../_shared/loop-billing-test-config.ts';
import { applyLoopBillingWebhook } from '../_shared/loop-billing-runtime.ts';
import { loopBillingProvider, loopBillingRpc } from '../_shared/loop-billing-edge.ts';
import { isLoopBillingMetadata, loopMetadata } from '../_shared/loop-billing.ts';

serve(async req => {
  const config = loopBillingTestConfiguration(name => Deno.env.get(name));
  if (!config) throw new ApiError(503, 'LOOP_TEST_BILLING_DISABLED', 'Isolated test payments are disabled.');
  const raw = await boundedBody(req, 262144);
  const webhookId = await verifyDodoSignature(raw, { id: req.headers.get('webhook-id'), timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature') }, config.webhookSecret);
  const event = parseDodoEvent(raw);
  let metadata = event.data.metadata;
  const cache = new Map<string, Record<string, unknown>>();
  // Refund webhooks carry refund metadata, not original payment metadata. After
  // raw signature verification, one strictly bounded Test-host read establishes
  // whether the payment belongs to an allowlisted synthetic identity.
  if (event.type === 'refund.succeeded') {
    if (event.data.payload_type !== 'Refund') throw new ApiError(400, 'INVALID_PAYMENT_EVENT', 'Refund event cannot be verified.');
    const refund = validateDodoRefund(event.data);
    const payment = await loopBillingProvider(config, `payments/${refund.paymentId}`);
    if (payment.payment_id !== refund.paymentId) throw new ApiError(409, 'LOOP_TEST_PAYMENT_INVALID', 'The test payment could not be verified.');
    metadata = payment.metadata;
    cache.set(`payments/${refund.paymentId}`, payment);
  }
  if (!isLoopBillingMetadata(metadata)) return json(req, { received: true, ignored: true, billingMode: 'test', testModeOnly: true });
  if (!config.testOwnerIds.includes(loopMetadata(metadata).userId)) throw new ApiError(403, 'LOOP_TEST_OWNER_REQUIRED', 'The payment is not bound to an isolated test identity.');
  const result = await applyLoopBillingWebhook({ rpc: loopBillingRpc(adminClient()), provider: async (endpoint, body, method) => {
    const result = !body && (!method || method === 'GET') && cache.has(endpoint) ? cache.get(endpoint)! : await loopBillingProvider(config, endpoint, body, method);
    if (endpoint.startsWith('subscriptions/') && (!isLoopBillingMetadata(result.metadata) || !config.testOwnerIds.includes(loopMetadata(result.metadata).userId))) {
      throw new ApiError(403, 'LOOP_TEST_OWNER_REQUIRED', 'The subscription is not bound to an isolated test identity.');
    }
    return result;
  } }, config, event, webhookId, raw);
  return json(req, { ...(result ?? { received: true, ignored: true }), billingMode: 'test', testModeOnly: true });
});
