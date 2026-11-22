import { ApiError } from '../_shared/core.ts';
import { adminClient, authenticatedClient, configuredBillingMode, json, readJson, serve } from '../_shared/runtime.ts';
import { loopBillingConfiguration, verifiedAuthSession } from '../_shared/loop-billing.ts';
import { controlLoopBilling, type LoopBillingPorts } from '../_shared/loop-billing-runtime.ts';
import { loopBillingProvider, loopBillingRpc } from '../_shared/loop-billing-edge.ts';
import { authorizeTrialReminderDispatch, confirmTrialReminders, TRIAL_REMINDER_TICKET_HEADER } from '../_shared/loop-trial-reminders.ts';
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
serve(async req => {
  // Scheduled read of Dodo's trial-ending emails: records evidence, unreadable reads and delivery outcomes, never a confirmation (cron ticket, no user).
  if (req.headers.has(TRIAL_REMINDER_TICKET_HEADER)) {
    const config = loopBillingConfiguration(name => Deno.env.get(name));
    if (!config) throw new ApiError(503, 'LOOP_BILLING_UNAVAILABLE', 'Automated Job Loop subscriptions are unavailable.');
    const admin = adminClient();
    await authorizeTrialReminderDispatch(req, await readJson(req), config.mode, async (ticket, mode) =>
      (await admin.rpc('job_loop_billing_trial_reminder_consume_ticket', { p_ticket: ticket, p_mode: mode })).data);
    // Answer the scheduler at once; the provider reads continue in the background.
    EdgeRuntime.waitUntil(confirmTrialReminders({ rpc: loopBillingRpc(admin), provider: (endpoint, body, method) => loopBillingProvider(config, endpoint, body, method) }, config.mode)
      .then(sweep => console.info('job_loop_trial_reminder_sweep', sweep))
      .catch(error => console.error('job_loop_trial_reminder_sweep_failed', { code: error instanceof ApiError ? error.code : 'LOOP_REMINDER_FAILED' })));
    return json(req, { accepted: true }, 202);
  }
  const { admin, user } = await authenticatedClient(req);
  const authSession = verifiedAuthSession(req);
  const config = loopBillingConfiguration(name => Deno.env.get(name));
  const ports: LoopBillingPorts = { rpc: loopBillingRpc(admin), provider: (endpoint, body, method) => {
    if (!config) throw new ApiError(503, 'LOOP_BILLING_UNAVAILABLE', 'Automated Job Loop subscriptions are unavailable.');
    return loopBillingProvider(config, endpoint, body, method);
  } };
  return json(req, await controlLoopBilling(ports, config, user.id, authSession, await readJson(req), configuredBillingMode()));
});
