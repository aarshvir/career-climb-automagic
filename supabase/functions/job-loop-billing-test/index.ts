import { ApiError } from '../_shared/core.ts';
import { adminClient, authenticatedClient, json, readJson, serve } from '../_shared/runtime.ts';
import { verifiedAuthSession } from '../_shared/loop-billing.ts';
import { loopBillingTestConfiguration } from '../_shared/loop-billing-test-config.ts';
import { controlLoopBilling } from '../_shared/loop-billing-runtime.ts';
import { loopBillingProvider, loopBillingRpc } from '../_shared/loop-billing-edge.ts';
import { authorizeTrialReminderDispatch, confirmTrialReminders, TRIAL_REMINDER_TICKET_HEADER } from '../_shared/loop-trial-reminders.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
serve(async req => {
  // Scheduled read of Dodo's test-mode trial-ending emails: records evidence, unreadable reads and delivery outcomes, never a confirmation (cron ticket, no user).
  if (req.headers.has(TRIAL_REMINDER_TICKET_HEADER)) {
    const config = loopBillingTestConfiguration(name => Deno.env.get(name));
    if (!config) throw new ApiError(503, 'LOOP_TEST_BILLING_DISABLED', 'Isolated test payments are disabled.');
    const admin = adminClient();
    await authorizeTrialReminderDispatch(req, await readJson(req), 'test', async (ticket, mode) =>
      (await admin.rpc('job_loop_billing_trial_reminder_consume_ticket', { p_ticket: ticket, p_mode: mode })).data);
    // Answer the scheduler at once; the provider reads continue in the background.
    EdgeRuntime.waitUntil(confirmTrialReminders({ rpc: loopBillingRpc(admin), provider: (endpoint, body, method) => loopBillingProvider(config, endpoint, body, method) }, 'test')
      .then(sweep => console.info('job_loop_trial_reminder_sweep', sweep))
      .catch(error => console.error('job_loop_trial_reminder_sweep_failed', { code: error instanceof ApiError ? error.code : 'LOOP_REMINDER_FAILED' })));
    return json(req, { accepted: true, testModeOnly: true }, 202);
  }
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
