// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmTrialReminders, isTrialEndingEmailType, pickTrialEndingEmail, trialEndingLog, TrialReminderUnreadable } from '../functions/_shared/loop-trial-reminders.ts';

const charge = '2026-12-01T10:00:00.000Z';
const at = (hoursBefore: number) => new Date(Date.parse(charge) - hoursBefore * 3600000).toISOString();
const email = (changes: Record<string, unknown>) => ({ email_log_id: 'elog_a', email_type: 'subscription_trial_ending', status: 'delivered', created_at: at(48), ...changes });

describe('Dodo trial-ending email recognition', () => {
  it('accepts only types naming a trial that ends or expires', () => {
    for (const type of ['subscription_trial_ending', 'trial_ending', 'subscription.trial.expiring', 'trial_ends']) expect(isTrialEndingEmailType(type)).toBe(true);
    for (const type of ['upcoming_renewal_reminder', 'payment_successful', 'subscription_cancelled', 'add_payment_method_reminder', 'Trial_Ending', 'trial ending'])
      expect(isTrialEndingEmailType(type)).toBe(false);
  });
  it('prefers a sent or delivered email over a failed one, then the newest', () => {
    const log = { items: [email({ email_log_id: 'elog_failed', status: 'failed', created_at: at(40) }), email({ email_log_id: 'elog_old', created_at: at(60) }), email({ email_log_id: 'elog_new', status: 'sent', created_at: at(47) })] };
    expect(pickTrialEndingEmail(log, charge)).toMatchObject({ emailLogId: 'elog_new', status: 'sent' });
    expect(pickTrialEndingEmail({ items: [email({ status: 'failed' })] }, charge)).toMatchObject({ status: 'failed' });
  });
  it('ignores emails outside the three days before the charge, malformed rows and unknown statuses', () => {
    const log = { items: [email({ created_at: at(73) }), email({ created_at: at(0) }), email({ status: 'queued' }), email({ email_log_id: 'bad id' }), null, 'x', email({ created_at: 'soon' })] };
    expect(pickTrialEndingEmail(log, charge)).toBeNull();
    expect(pickTrialEndingEmail({ items: [] }, charge)).toBeNull();
  });
  it('treats an unreadable email log as unavailable, never as "no email"', () => {
    for (const log of [null, [], { items: 'none' }, { total_count: 0 }]) expect(() => pickTrialEndingEmail(log, charge)).toThrow();
  });
});

describe('what the customer-wide email log can and cannot say', () => {
  it('counts every trial-ending email in the window, so an overlapping trial shows as ambiguity', () => {
    const log = { items: [email({ email_log_id: 'elog_a' }), email({ email_log_id: 'elog_b', created_at: at(47) }), email({ email_log_id: 'elog_c', email_type: 'payment_successful' })], total_count: 3 };
    expect(trialEndingLog(log, charge)).toMatchObject({ candidates: 2, email: { emailLogId: 'elog_b' } });
    expect(trialEndingLog({ items: [], total_count: 0 }, charge)).toEqual({ email: null, candidates: 0 });
  });
  it('follows a recorded email by its id, and one that left the log is unreliable rather than absent', () => {
    const log = { items: [email({ email_log_id: 'elog_a', status: 'failed' }), email({ email_log_id: 'elog_b', created_at: at(47) })], total_count: 2 };
    expect(trialEndingLog(log, charge, 'elog_a')).toMatchObject({ email: { emailLogId: 'elog_a', status: 'failed' }, candidates: 2 });
    expect(() => trialEndingLog(log, charge, 'elog_gone')).toThrow(TrialReminderUnreadable);
    try { trialEndingLog(log, charge, 'elog_gone'); } catch (error) { expect(error).toMatchObject({ reason: 'incomplete', status: 503 }); }
  });
  it('gives each unreadable log its own cause', () => {
    const cause = (log: unknown) => { try { trialEndingLog(log, charge); } catch (error) { return (error as TrialReminderUnreadable).reason; } return null; };
    expect(cause(null)).toBe('invalid_response');
    expect(cause({ items: 'none' })).toBe('invalid_response');
    expect(cause({ items: [], total_count: -1 })).toBe('invalid_response');
    expect(cause({ items: [], total_count: 'many' })).toBe('invalid_response');
    expect(cause({ items: [] })).toBeNull();
  });
  it('never calls a page that does not reach back past the window "no email"', () => {
    const recent = email({ email_type: 'payment_successful', created_at: at(10) });
    expect(() => trialEndingLog({ items: [recent], total_count: 150 }, charge)).toThrow(TrialReminderUnreadable);
    expect(() => trialEndingLog({ items: [], total_count: 150 }, charge)).toThrow(TrialReminderUnreadable);
    // A page that reaches past the window start is a complete answer, and a found email needs no complete page.
    expect(trialEndingLog({ items: [recent, email({ email_type: 'payment_successful', created_at: at(100) })], total_count: 150 }, charge).email).toBeNull();
    expect(trialEndingLog({ items: [recent, email({})], total_count: 150 }, charge).email).toMatchObject({ emailLogId: 'elog_a' });
  });
});

describe('trial reminder sweep, with the database and Dodo replaced by stubs', () => {
  afterEach(() => vi.restoreAllMocks());
  const row = (changes: Record<string, unknown> = {}) => ({ subscriptionId: 'sub_a', customerId: 'cus_a', firstChargeAt: charge, emailLogId: null, ...changes });
  function ports(rows: unknown, provider: () => Promise<Record<string, unknown>>, answer: unknown = 'escalated') {
    const calls: [string, Record<string, unknown>][] = [];
    return { calls, ports: { rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return (name === 'job_loop_billing_trial_reminders_unconfirmed' ? rows : answer) as never; }, provider } };
  }
  it('records an unreadable log through the unavailable RPC with its cause, never through the check RPC', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = ports([row()], async () => { throw new Error('Provider timeout'); });
    expect(await confirmTrialReminders(run.ports, 'live')).toEqual({ checked: 1, confirmed: 0, pending: 0, escalated: 0, unavailable: 1, deferred: 0 });
    expect(run.calls.map(call => call[0])).toEqual(['job_loop_billing_trial_reminders_unconfirmed', 'job_loop_billing_trial_reminder_unavailable']);
    expect(run.calls[1][1]).toEqual({ p_mode: 'live', p_subscription: 'sub_a', p_cause: 'read_failed' });
    const invalid = ports([row()], async () => ({ items: 'none' }));
    await confirmTrialReminders(invalid.ports, 'test');
    expect(invalid.calls[1][1]).toEqual({ p_mode: 'test', p_subscription: 'sub_a', p_cause: 'invalid_response' });
  });
  it('follows the recorded email id and passes the candidate count to the check RPC', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = { items: [email({ email_log_id: 'elog_a', status: 'failed' }), email({ email_log_id: 'elog_b' })], total_count: 2 };
    const run = ports([row({ emailLogId: 'elog_a' })], async () => log);
    expect(await confirmTrialReminders(run.ports, 'live')).toMatchObject({ checked: 1, escalated: 1, confirmed: 0 });
    expect(run.calls[1]).toEqual(['job_loop_billing_trial_reminder_check', { p_mode: 'live', p_subscription: 'sub_a', p_email_log_id: 'elog_a', p_email_type: 'subscription_trial_ending',
      p_email_status: 'failed', p_email_created_at: at(48), p_candidates: 2 }]);
    const gone = ports([row({ emailLogId: 'elog_gone' })], async () => log);
    expect(await confirmTrialReminders(gone.ports, 'live')).toMatchObject({ unavailable: 1, escalated: 0 });
    expect(gone.calls[1]).toEqual(['job_loop_billing_trial_reminder_unavailable', { p_mode: 'live', p_subscription: 'sub_a', p_cause: 'incomplete' }]);
  });
  it('never reports a confirmation, whatever the database answers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = { items: [email({})], total_count: 1 };
    expect(await confirmTrialReminders(ports([row()], async () => log, 'confirmed').ports, 'live')).toMatchObject({ confirmed: 0, unavailable: 1 });
    expect(await confirmTrialReminders(ports([row()], async () => log, 'pending').ports, 'live')).toMatchObject({ confirmed: 0, pending: 1 });
  });
  it('stops after five provider failures in a row and defers the rest', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rows = Array.from({ length: 8 }, (_, i) => row({ subscriptionId: 'sub_' + i }));
    let reads = 0;
    const run = ports(rows, async () => { reads++; throw new Error('down'); });
    expect(await confirmTrialReminders(run.ports, 'live')).toMatchObject({ checked: 5, unavailable: 5, deferred: 3 });
    expect(reads).toBe(5);
    // One readable log resets the streak.
    let n = 0;
    const mixed = ports(rows, async () => { n++; if (n === 3) return { items: [], total_count: 0 }; throw new Error('down'); }, 'pending');
    expect(await confirmTrialReminders(mixed.ports, 'live')).toMatchObject({ checked: 8, unavailable: 7, pending: 1, deferred: 0 });
  });
  it('writes no subscription, customer or email id to the function logs, which an account deletion cannot erase', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ids = { subscriptionId: 'sub_private_id', customerId: 'cus_private_id' };
    const log = { items: [email({ email_log_id: 'elog_private_id', status: 'failed' })], total_count: 1 };
    expect(await confirmTrialReminders(ports([row(ids)], async () => log).ports, 'live')).toMatchObject({ escalated: 1 }); // an incident is logged
    expect(await confirmTrialReminders(ports([row(ids)], async () => { throw new Error('Provider timeout for cus_private_id'); }).ports, 'live')).toMatchObject({ unavailable: 1 }); // an unreadable log is logged
    expect(logged.mock.calls.map(call => call[0])).toEqual(['job_loop_trial_reminder_unconfirmed', 'job_loop_trial_reminder_unavailable']);
    const written = JSON.stringify(logged.mock.calls);
    for (const id of ['sub_private_id', 'cus_private_id', 'elog_private_id']) expect(written).not.toContain(id);
    expect(logged.mock.calls[0][1]).toEqual({ mode: 'live', emailStatus: 'failed', candidates: 1 });
  });
  it('refuses a malformed selection from the database', async () => {
    const bad = [{}, row({ subscriptionId: 'x' }), row({ customerId: 'y' }), row({ firstChargeAt: 'soon' }), row({ emailLogId: 'bad id' }), row({ emailLogId: 7 })];
    for (const rowValue of bad) await expect(confirmTrialReminders(ports([rowValue], async () => ({ items: [] })).ports, 'live')).rejects.toMatchObject({ code: 'LOOP_BILLING_UNAVAILABLE' });
    await expect(confirmTrialReminders(ports({}, async () => ({ items: [] })).ports, 'live')).rejects.toMatchObject({ code: 'LOOP_BILLING_UNAVAILABLE' });
  });
});
