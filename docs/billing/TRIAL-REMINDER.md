# The 7-day trial reminder email

Every trial customer must be told, about two days before the first charge, that the charge is coming. This page explains who sends that email and how Jobvance proves it went out.

## Who sends it

Dodo Payments sends it. Dodo has a built-in customer email called **Subscription Trial Ending**. It goes out about two days before a trial's first charge. It is on by default.

Jobvance does not send a second email. It has no email service of its own, and a second email would only duplicate Dodo's.

## How Jobvance proves it went out

Every 30 minutes, a scheduled job looks for trials whose reminder is due (two days before the first charge) but not yet confirmed. For each one, Jobvance reads that customer's sent-email list from Dodo (`GET /customers/{customer_id}/emails`).

- **The email was sent or delivered in the three days before the charge.** Jobvance records it and marks the reminder as sent, using the time Dodo sent the email.
- **Dodo reports it failed, was marked as spam, or was blocked.** The trial goes on the support list straight away.
- **Twelve hours after the reminder time, there is still no email.** The trial goes on the support list.
- **Dodo's email list can't be read.** Nothing is recorded, and the next sweep tries again.

To see the support list, call `job_loop_billing_trial_reminders_escalated` with the mode (`live` or `test`). Function logs also print `job_loop_trial_reminder_unconfirmed` for each such trial. Nothing here charges, cancels or emails anyone.

## Owner steps (in the Dodo dashboard)

1. In Dodo, open **Settings → Communication**. Under **Customer Emails**, make sure **Subscription Trial Ending** is switched on. Check this in Test Mode, then in Live Mode.
2. In Test Mode, also make sure **Test Mode Emails** is on (**Settings → Communication → Email**). Test emails go to the real address, with `[TEST MODE]` at the start of the subject.
3. During the Test-mode trial, wait until day 5. Then open the test customer in Dodo (**Sales → Customers**, then the **Sent Emails** tab) and check that the trial-ending email is listed.

## Before live trials go on

The Test-mode trial must show the trial-ending email confirmed for that subscription. If it is escalated as `not_found`, check the email's `email_type` in that customer's Sent Emails tab. If the name doesn't contain both "trial" and "end" (or "expir"), the matcher in `supabase/functions/_shared/loop-trial-reminders.ts` needs updating before rollout. Until then, a trial can be escalated, but it is never falsely marked as sent.
