import { ApiError } from '../_shared/core.ts';
import { authenticatedClient, json, readJson, serve } from '../_shared/runtime.ts';
import { verifiedAuthSession } from '../_shared/loop-billing.ts';
import { loopBillingTestConfiguration } from '../_shared/loop-billing-test-config.ts';
import { controlLoopBilling } from '../_shared/loop-billing-runtime.ts';
import { loopBillingProvider, loopBillingRpc } from '../_shared/loop-billing-edge.ts';

serve(async req => {
  const { admin, user } = await authenticatedClient(req);
  const authSession = verifiedAuthSession(req);
  const config = loopBillingTestConfiguration(name => Deno.env.get(name));
  if (!config) throw new ApiError(503, 'LOOP_TEST_BILLING_DISABLED', 'Isolated test payments are disabled.');
  if (!config.testOwnerIds.includes(user.id)) throw new ApiError(403, 'LOOP_TEST_OWNER_REQUIRED', 'This account is not an isolated payment test identity.');
  const result = await controlLoopBilling({ rpc: loopBillingRpc(admin), provider: (endpoint, body, method) => loopBillingProvider(config, endpoint, body, method) },
    config, user.id, authSession, await readJson(req), 'test');
  // The existing SQL status also reports effective LIVE entitlement. Test
  // acceptance must never present that as a grant from its test subscription.
  return json(req, { ...result, ...('entitlement' in result ? { entitlement: null } : {}), testModeOnly: true });
});
