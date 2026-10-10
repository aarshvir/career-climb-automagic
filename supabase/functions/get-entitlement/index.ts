import { authenticatedClient, configuredBillingMode, databaseError, getBilling, json, serve } from '../_shared/runtime.ts';

serve(async req => {
  const { admin, user } = await authenticatedClient(req);
  const { data, error } = await admin.rpc('jobvance_get_entitlement', { p_user_id: user.id, p_billing_mode: configuredBillingMode() });
  databaseError(error);
  const billing = getBilling();
  return json(req, { ...data, billingConfigured: !!billing, billingMode: billing?.mode ?? null, paymentProvider: billing?.provider ?? null });
});
