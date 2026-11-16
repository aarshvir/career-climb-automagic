import { ApiError } from './core.ts';
import type { LoopBillingPorts } from './loop-billing-runtime.ts';

/**
 * Trial reminders are sent by Dodo Payments ("Subscription Trial Ending",
 * about two days before the first charge). This sweep only CONFIRMS that email
 * from the customer's provider email log and records the receipt; it never
 * sends, charges or cancels. See 20261116120000_job_loop_trial_reminder_receipts.
 */
const DAY_MS = 86400000;
const SUBSCRIPTION = /^sub_[A-Za-z0-9_-]{1,100}$/;
const CUSTOMER = /^cus_[A-Za-z0-9_-]{1,100}$/;
const EMAIL_LOG = /^[A-Za-z0-9_-]{1,200}$/;
const EMAIL_TYPE = /^[a-z0-9_.-]{1,100}$/;
const STATUSES = ['sent', 'delivered', 'failed', 'complained', 'blocked'] as const;
type EmailStatus = typeof STATUSES[number];
/** Dodo documents email_type only by example (`payment_successful`). Until a
 * provider Test-mode trial shows the exact trial-ending value, accept a type
 * naming a trial that ends or expires; a mismatch escalates, never confirms. */
export function isTrialEndingEmailType(value: string): boolean {
  return EMAIL_TYPE.test(value) && /trial/.test(value) && /(end|expir)/.test(value);
}
export interface TrialReminderEmail { emailLogId: string; emailType: string; status: EmailStatus; createdAt: string }
export type TrialReminderOutcome = 'confirmed' | 'pending' | 'escalated';
const unavailable = () => new ApiError(503, 'LOOP_BILLING_UNAVAILABLE', 'Trial reminder confirmation is temporarily unavailable.');
const instant = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

/** The trial-ending email for a first charge at `firstChargeAt`: created in the
 * three days before it. A sent/delivered one wins over a failed one; among
 * equals the newest wins. */
export function pickTrialEndingEmail(log: unknown, firstChargeAt: string): TrialReminderEmail | null {
  if (!log || typeof log !== 'object' || Array.isArray(log)) throw unavailable();
  const items = (log as { items?: unknown }).items;
  if (!Array.isArray(items)) throw unavailable();
  const charge = instant(firstChargeAt);
  if (charge === null) throw unavailable();
  const found: TrialReminderEmail[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const created = instant(item.created_at);
    const status = item.status;
    if (typeof item.email_type !== 'string' || !isTrialEndingEmailType(item.email_type) || typeof item.email_log_id !== 'string' || !EMAIL_LOG.test(item.email_log_id)
      || created === null || created < charge - 3 * DAY_MS || created >= charge || typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) continue;
    found.push({ emailLogId: item.email_log_id, emailType: item.email_type, status: status as EmailStatus, createdAt: new Date(created).toISOString() });
  }
  const ok = (email: TrialReminderEmail) => email.status === 'sent' || email.status === 'delivered' ? 1 : 0;
  found.sort((a, b) => ok(b) - ok(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return found[0] ?? null;
}

export interface TrialReminderSweep { checked: number; confirmed: number; pending: number; escalated: number; unavailable: number }
/** One sweep over due, unconfirmed reminders of one billing mode. A provider
 * read failure leaves the row for the next sweep and is never recorded. */
export async function confirmTrialReminders(ports: Pick<LoopBillingPorts, 'rpc' | 'provider'>, mode: 'test' | 'live', limit = 50): Promise<TrialReminderSweep> {
  const due = await ports.rpc<unknown>('job_loop_billing_trial_reminders_unconfirmed', { p_mode: mode, p_limit: limit });
  if (!Array.isArray(due)) throw unavailable();
  const sweep: TrialReminderSweep = { checked: 0, confirmed: 0, pending: 0, escalated: 0, unavailable: 0 };
  for (const raw of due) {
    const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const { subscriptionId, customerId, firstChargeAt } = row;
    if (typeof subscriptionId !== 'string' || !SUBSCRIPTION.test(subscriptionId) || typeof customerId !== 'string' || !CUSTOMER.test(customerId)
      || typeof firstChargeAt !== 'string' || instant(firstChargeAt) === null) throw unavailable();
    sweep.checked++;
    let email: TrialReminderEmail | null;
    try { email = pickTrialEndingEmail(await ports.provider(`customers/${customerId}/emails?page_size=100`), firstChargeAt); }
    catch { sweep.unavailable++; continue; }
    let outcome: unknown;
    try {
      outcome = await ports.rpc<unknown>('job_loop_billing_trial_reminder_check', { p_mode: mode, p_subscription: subscriptionId,
        p_email_log_id: email?.emailLogId ?? null, p_email_type: email?.emailType ?? null, p_email_status: email?.status ?? null, p_email_created_at: email?.createdAt ?? null });
    } catch { sweep.unavailable++; continue; }
    if (outcome !== 'confirmed' && outcome !== 'pending' && outcome !== 'escalated') { sweep.unavailable++; continue; }
    sweep[outcome]++;
    if (outcome === 'escalated') console.error('job_loop_trial_reminder_unconfirmed', { mode, subscription: subscriptionId, emailStatus: email?.status ?? 'not_found' });
  }
  return sweep;
}

/** The cron-dispatched entry of a billing function: a single-use, mode-bound
 * ticket and the exact body {"action":"trial_reminders"}; nothing else. */
export const TRIAL_REMINDER_TICKET_HEADER = 'x-trial-reminder-ticket';
const TICKET = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function authorizeTrialReminderDispatch(req: Request, body: unknown, mode: 'test' | 'live',
  consume: (ticket: string, mode: 'test' | 'live') => Promise<unknown>): Promise<void> {
  const ticket = req.headers.get(TRIAL_REMINDER_TICKET_HEADER) ?? '';
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { action?: unknown }).action !== 'trial_reminders')
    throw new ApiError(400, 'LOOP_INVALID_INPUT', 'Trial reminder dispatch accepts no overrides.');
  let accepted = false;
  if (TICKET.test(ticket)) { try { accepted = await consume(ticket, mode) === true; } catch { accepted = false; } }
  if (!accepted) throw new ApiError(401, 'LOOP_REMINDER_UNAUTHORIZED', 'The reminder dispatch is unauthorized.');
}
