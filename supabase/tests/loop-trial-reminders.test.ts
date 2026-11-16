// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isTrialEndingEmailType, pickTrialEndingEmail } from '../functions/_shared/loop-trial-reminders.ts';

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
