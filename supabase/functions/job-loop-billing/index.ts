import { ApiError } from '../_shared/core.ts';
import { authenticatedClient, configuredBillingMode, json, readJson, serve } from '../_shared/runtime.ts';
import { loopBillingConfiguration, verifiedAuthSession } from '../_shared/loop-billing.ts';
import { controlLoopBilling, type LoopBillingPorts } from '../_shared/loop-billing-runtime.ts';
import { loopBillingProvider, loopBillingRpc } from '../_shared/loop-billing-edge.ts';
serve(async req => {
  const { admin, user } = await authenticatedClient(req);
  const authSession = verifiedAuthSession(req);
  const config = loopBillingConfiguration(name => Deno.env.get(name));
  const ports: LoopBillingPorts = { rpc: loopBillingRpc(admin), provider: (endpoint, body, method) => {
    if (!config) throw new ApiError(503, 'LOOP_BILLING_UNAVAILABLE', 'Automated Job Loop subscriptions are unavailable.');
    return loopBillingProvider(config, endpoint, body, method);
  } };
  return json(req, await controlLoopBilling(ports, config, user.id, authSession, await readJson(req), configuredBillingMode()));
});
