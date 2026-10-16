import { TAILOR_LIMITS } from '../_shared/core.ts';
import { authenticatedClient, configuredBillingMode, databaseError, getBilling, json, serve } from '../_shared/runtime.ts';

serve(async req => {
  const { admin, user } = await authenticatedClient(req);
  const mode = configuredBillingMode();
  const { data, error } = await admin.rpc('jobvance_get_entitlement', { p_user_id: user.id, p_billing_mode: mode });
  databaseError(error);
  // The AI-tailoring summary (free CVs left this month, active passes) is additive: if it cannot be
  // read, the existing pack fields are still returned and the browser simply shows no plan line.
  let tailorAccess: unknown = null;
  try {
    const access = await admin.rpc('jobvance_get_tailor_access', { p_user_id: user.id, p_billing_mode: mode, p_free_monthly: TAILOR_LIMITS.freeMonthly, p_pass_daily: TAILOR_LIMITS.passDaily });
    if (!access.error) tailorAccess = access.data ?? null;
  } catch { tailorAccess = null; }
  const billing = getBilling();
  return json(req, { ...data, tailorAccess, billingConfigured: !!billing, billingMode: billing?.mode ?? null, paymentProvider: billing?.provider ?? null });
});
