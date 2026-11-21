import { ApiError } from './core.ts';
import type { LoopBillingPorts } from './loop-billing-runtime.ts';

/**
 * Trial reminders are sent by Dodo Payments ("Subscription Trial Ending"). This
 * sweep never sends, charges or cancels. It reads the customer's sent-email list
 * from Dodo and records what it finds, honestly:
 *
 *  - Dodo's email log is customer-wide and its documented entries carry no
 *    subscription, product or payment reference. A trial-ending-type email in
 *    the three days before the first charge is therefore only UNBOUND candidate
 *    evidence: it is recorded and escalated for a person to check, and it never
 *    marks the reminder sent.
 *  - An unreadable log is recorded as unavailable, apart from "no email found".
 *  - The email's delivery outcome is tracked apart from its send time, and an
 *    in-flight ("sent") email is rechecked on later sweeps.
 *
 * See 20261116120000_job_loop_trial_reminder_receipts and docs/billing/TRIAL-REMINDER.md.
 */
const DAY_MS = 86400000;
const SUBSCRIPTION = /^sub_[A-Za-z0-9_-]{1,100}$/;
const CUSTOMER = /^cus_[A-Za-z0-9_-]{1,100}$/;
const EMAIL_LOG = /^[A-Za-z0-9_-]{1,200}$/;
const EMAIL_TYPE = /^[a-z0-9_.-]{1,100}$/;
const STATUSES = ['sent', 'delivered', 'failed', 'complained', 'blocked'] as const;
type EmailStatus = typeof STATUSES[number];
/** After this many provider failures in a row a sweep stops and leaves the rest
 * for the next one (least recently attempted rows are taken first, so nothing
 * starves, and the database flags overdue rows on its own). */
const MAX_CONSECUTIVE_UNAVAILABLE = 5;
/** Dodo documents email_type only by example (`payment_successful`). Until a
 * provider Test-mode trial shows the exact trial-ending value, accept a type
 * naming a trial that ends or expires; a mismatch records "not found", never
 * evidence. */
export function isTrialEndingEmailType(value: string): boolean {
  return EMAIL_TYPE.test(value) && /trial/.test(value) && /(end|expir)/.test(value);
}
export interface TrialReminderEmail { emailLogId: string; emailType: string; status: EmailStatus; createdAt: string }
export type TrialReminderOutcome = 'pending' | 'escalated';
export type UnavailableCause = 'read_failed' | 'invalid_response' | 'incomplete';
/** The email log could not be read, parsed or relied on: never "no email found". */
export class TrialReminderUnreadable extends ApiError {
  constructor(public reason: UnavailableCause) { super(503, 'LOOP_BILLING_UNAVAILABLE', 'Trial reminder confirmation is temporarily unavailable.'); }
}
const unavailable = () => new ApiError(503, 'LOOP_BILLING_UNAVAILABLE', 'Trial reminder confirmation is temporarily unavailable.');
const instant = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

/** The trial-ending emails for a first charge at `firstChargeAt`: created in the
 * three days before it. The best is a sent/delivered one, then the newest. With
 * `trackedLogId` the SAME email as before is returned (evidence is followed,
 * never swapped); if it is no longer on the log the read is unreliable.
 * Without a match, a log page that does not reach back past the window is
 * "incomplete", not "no email". These emails are customer-wide and unbound to
 * any subscription: `candidates` greater than 1 means other trials overlapped. */
export function trialEndingLog(log: unknown, firstChargeAt: string, trackedLogId: string | null = null): { email: TrialReminderEmail | null; candidates: number } {
  if (!log || typeof log !== 'object' || Array.isArray(log)) throw new TrialReminderUnreadable('invalid_response');
  const { items, total_count: total } = log as { items?: unknown; total_count?: unknown };
  if (!Array.isArray(items)) throw new TrialReminderUnreadable('invalid_response');
  if (total !== undefined && (typeof total !== 'number' || !Number.isInteger(total) || total < 0)) throw new TrialReminderUnreadable('invalid_response');
  const charge = instant(firstChargeAt);
  if (charge === null) throw new TrialReminderUnreadable('invalid_response');
  const found: TrialReminderEmail[] = [];
  let oldest = Infinity;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const created = instant(item.created_at);
    if (created !== null && created < oldest) oldest = created;
    const status = item.status;
    if (typeof item.email_type !== 'string' || !isTrialEndingEmailType(item.email_type) || typeof item.email_log_id !== 'string' || !EMAIL_LOG.test(item.email_log_id)
      || created === null || created < charge - 3 * DAY_MS || created >= charge || typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) continue;
    found.push({ emailLogId: item.email_log_id, emailType: item.email_type, status: status as EmailStatus, createdAt: new Date(created).toISOString() });
  }
  const ok = (email: TrialReminderEmail) => email.status === 'sent' || email.status === 'delivered' ? 1 : 0;
  found.sort((a, b) => ok(b) - ok(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (trackedLogId !== null) {
    const tracked = found.find(email => email.emailLogId === trackedLogId);
    if (!tracked) throw new TrialReminderUnreadable('incomplete');
    return { email: tracked, candidates: found.length };
  }
  if (found.length === 0 && typeof total === 'number' && total > items.length && !(oldest < charge - 3 * DAY_MS)) throw new TrialReminderUnreadable('incomplete');
  return { email: found[0] ?? null, candidates: found.length };
}
export function pickTrialEndingEmail(log: unknown, firstChargeAt: string): TrialReminderEmail | null {
  return trialEndingLog(log, firstChargeAt).email;
}

export interface TrialReminderSweep {
  checked: number;
  /** Always 0. Dodo's email log has no subscription binding, so no reminder is machine-confirmed. */
  confirmed: number;
  pending: number;
  escalated: number;
  unavailable: number;
  /** Rows left for the next sweep after repeated provider failures. */
  deferred: number;
}
/** One sweep over the reminders to look at in one billing mode. Every attempt is
 * recorded: a readable log through the check RPC (an email found, or none), an
 * unreadable one through the unavailable RPC. An email already on record is
 * followed by its own id so its delivery outcome can change. */
export async function confirmTrialReminders(ports: Pick<LoopBillingPorts, 'rpc' | 'provider'>, mode: 'test' | 'live', limit = 50): Promise<TrialReminderSweep> {
  const due = await ports.rpc<unknown>('job_loop_billing_trial_reminders_unconfirmed', { p_mode: mode, p_limit: limit });
  if (!Array.isArray(due)) throw unavailable();
  const sweep: TrialReminderSweep = { checked: 0, confirmed: 0, pending: 0, escalated: 0, unavailable: 0, deferred: 0 };
  let streak = 0;
  for (const [index, raw] of due.entries()) {
    if (streak >= MAX_CONSECUTIVE_UNAVAILABLE) { sweep.deferred = due.length - index; break; }
    const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const { subscriptionId, customerId, firstChargeAt } = row;
    const tracked = row.emailLogId ?? null;
    if (typeof subscriptionId !== 'string' || !SUBSCRIPTION.test(subscriptionId) || typeof customerId !== 'string' || !CUSTOMER.test(customerId)
      || typeof firstChargeAt !== 'string' || instant(firstChargeAt) === null || (tracked !== null && (typeof tracked !== 'string' || !EMAIL_LOG.test(tracked)))) throw unavailable();
    sweep.checked++;
    let read: ReturnType<typeof trialEndingLog>;
    try { read = trialEndingLog(await ports.provider(`customers/${customerId}/emails?page_size=100`), firstChargeAt, tracked); }
    catch (error) {
      streak++; sweep.unavailable++;
      const cause: UnavailableCause = error instanceof TrialReminderUnreadable ? error.reason : 'read_failed';
      let incident = false;
      try { incident = await ports.rpc<unknown>('job_loop_billing_trial_reminder_unavailable', { p_mode: mode, p_subscription: subscriptionId, p_cause: cause }) === 'escalated'; }
      catch { /* Nothing more can be recorded; the database flags an overdue row on its own. */ }
      console.error('job_loop_trial_reminder_unavailable', { mode, subscription: subscriptionId, cause, incident });
      continue;
    }
    streak = 0;
    const { email, candidates } = read;
    let outcome: unknown;
    try {
      outcome = await ports.rpc<unknown>('job_loop_billing_trial_reminder_check', { p_mode: mode, p_subscription: subscriptionId,
        p_email_log_id: email?.emailLogId ?? null, p_email_type: email?.emailType ?? null, p_email_status: email?.status ?? null, p_email_created_at: email?.createdAt ?? null,
        p_candidates: candidates });
    } catch { sweep.unavailable++; continue; }
    if (outcome !== 'pending' && outcome !== 'escalated') { sweep.unavailable++; continue; }
    sweep[outcome]++;
    if (outcome === 'escalated') console.error('job_loop_trial_reminder_unconfirmed', { mode, subscription: subscriptionId, emailStatus: email?.status ?? 'not_found', candidates });
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
