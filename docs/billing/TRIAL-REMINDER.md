# The 7-day trial reminder email

Every trial customer must be told, before the first charge, that the charge is coming. This page explains who sends that email, what Jobvance can and cannot prove about it, and what the support list means.

## Who sends it

Dodo Payments sends it. Dodo has a built-in customer email called **Subscription Trial Ending**. It is on by default.

Jobvance does not send a second email. It has no email service of its own, and a second email would only duplicate Dodo's.

## What Jobvance can prove, and what it cannot

Jobvance reads the customer's sent-email list from Dodo (`GET /customers/{customer_id}/emails`). That list belongs to the **customer**, not to one subscription. Each entry has a type, a time and a delivery status. It has **no** subscription, product or payment reference. Another product's trial for the same customer would produce an entry that looks identical.

So an entry that looks like the trial-ending email is **never treated as proof** that this subscription was reminded. Jobvance does not guess, and it does not use "the type and time fit" as proof. The trial's `reminder_sent_at` is **not** set from it.

What Jobvance does record, and states as exactly this much:

- **Whether Dodo's list could be read.** An attempt that fails, or returns something unusable, is recorded as *unavailable*. That is different from "read fine, no email".
- **Whether a trial-ending-type email exists** in the three days before the first charge: its Dodo id, its send time, its delivery status, and how many such emails there were. More than one means other trials overlapped. This is *candidate evidence*, not confirmation.
- **The email's delivery outcome**, tracked apart from its send time (below).

Because Dodo gives no binding, every trial that has a candidate email is on the support list with the reason `unbound`. A person then opens the customer in Dodo (**Sales → Customers → Sent Emails**), opens the email and checks it is for this trial. Until Dodo documents a subscription link, or a Test-mode check finds a reliable one, no trial is confirmed automatically.

## How the sweep works

A scheduled job runs every 30 minutes. It does three things:

1. **The database records overdue trials by itself.** A reminder that was due, with no candidate email, whose Dodo list has not been read successfully since its 12-hour deadline, is put on the support list as `unavailable_overdue` an hour after that deadline. This needs neither the edge function nor Dodo, so a dead scheduler or a long Dodo outage cannot make an overdue trial disappear.
2. **It wakes the billing function** if any trial still needs a look.
3. **The billing function reads Dodo's list** for the trials that need it, at most 50 per run, **least recently tried first** (never tried first of all). A failed try pushes its trial behind the others, so one stuck group cannot starve the rest. After five failed reads in a row the run stops and leaves the rest for the next run. Each trial is tried at most once per run, then waits 20 minutes, doubling to at most 4 hours after repeated failures.

A trial is watched from its reminder time until three days **after** its first charge. The charge does not end the watch: an outage that spans the charge still produces a lasting record. A trial that was cancelled at the end of its period, or revoked, owes no reminder and is dropped. Before the first charge the subscription must still be active. After it, its status no longer matters: if the first charge fails, Dodo puts the subscription on hold (or it becomes failed, past due, paused or expired), and the missed-reminder incident is still recorded and kept. The sweep and the database backstop share one rule for this, so they cannot disagree.

## The delivery outcome

Dodo documents the status `sent` as **provisional**: the email may still be on its way. A later answer can be `failed`, `complained` (marked as spam) or `blocked`.

- The send time is history. It is written once and never changed, and the database refuses an update that tries.
- The delivery status is tracked on its own. It only moves forward: `sent`, then `delivered`, then `failed` / `complained` / `blocked`. A stale answer cannot hide a bounce.
- While the status is `sent`, the same email is read again on later runs: at most 24 times, with growing waits.
- `delivered`, `failed`, `complained` and `blocked` end the rechecks. Known limit: a spam complaint that arrives after `delivered` is not seen, because a delivered email is no longer read.

## The support list

Call `job_loop_billing_trial_reminders_escalated` with the mode (`live` or `test`). It lists every trial with an open incident, until 30 days after its first charge. Each entry has:

| Field | Meaning |
|---|---|
| `reason` | The most serious open reason: `delivery_failed`, `delivery_complained`, `delivery_blocked`, `not_found`, `unavailable_overdue`, then `unbound`. |
| `reasons` | Every open reason. |
| `emailStatus`, `firstEmailStatus` | The latest delivery status, and the first one seen. |
| `emailSentAt`, `emailLogId` | When Dodo sent the candidate email, and its id, to find it in the dashboard. |
| `candidates` | How many trial-ending-type emails were in the window. More than one is ambiguous. |
| `charged` | The first charge has already passed. |
| `lastReadAt`, `unavailableChecks`, `unavailableStreak`, `lastUnavailableCause` | How the reads went. The cause is `read_failed`, `invalid_response` or `incomplete` (the page did not reach back past the window, so "no email" was not claimed). |
| `subscriptionStatus`, `cancelAtPeriodEnd`, `revoked` | The subscription now, so a cancelled trial can be told apart. |

The reasons:

- `unbound`: a trial-ending-type email exists on the customer's list, but Dodo does not say which subscription it is for. A person must check it.
- `not_found`: more than twelve hours after the reminder time, Dodo's list was read fine and had no such email.
- `unavailable_overdue`: more than twelve hours after the reminder time, Dodo's list still could not be read. Nothing is known.
- `delivery_failed`, `delivery_complained`, `delivery_blocked`: the candidate email later failed, was marked as spam, or was not sent (Test Mode's weekly email limit).

Function logs also print `job_loop_trial_reminder_unconfirmed` and `job_loop_trial_reminder_unavailable`, with the billing mode and counts only. They carry no subscription, customer or email id: the support list names the trial. Nothing here charges, cancels or emails anyone.

**Closing an incident.** Once a person has checked the email in Dodo, the existing function `job_loop_billing_trial_reminder_sent` (mode, subscription) sets the trial's one-way `reminder_sent_at` marker. That marker then means "a person checked", set to the time it is called, not the email's send time. The trial leaves the support list and the sweep. The email's real send time stays unchanged in the receipt.

## What is stored, and when it is erased

A receipt (`loop_trial_reminder_receipts`) holds the subscription id, the id, type, send time and delivery history of the candidate email, and the incident. It holds no email address, no name and no message text. It belongs to **one trial**, is tied to it by a foreign key on the subscription id **and the billing mode**, and is deleted with it:

| What happens | What is erased |
|---|---|
| The account is deleted (`auth.users`) | The subscription and the trial (existing cascades), and through them the receipt. |
| Only the trial is deleted | Its receipt. |
| Only the subscription is deleted | The trial (existing cascade), and its receipt. |

The mode is part of that key, so the database refuses a live receipt for a test trial (and the reverse), and a receipt can only be created for a trial that exists. Evidence is immutable while it lives (a trigger refuses to rewrite it), but a cascade delete is not an update, so erasure is never blocked by that rule.

Everything else this change adds, checked one by one:

- **Dispatch tickets** (`job_loop_trial_reminder_tickets`): a random id, a billing mode and two timestamps. They name no user, subscription, customer or email. The 30-minute job deletes them a day after they expire.
- **The support list and the sweep's list** read a receipt only through its trial, and the legacy due list reads trials only, so an erased trial cannot appear on any of them.
- **The overdue backstop** only writes a receipt for a trial that exists. It holds the trial row while it does, and skips one that is being deleted at that moment, so an erasure cannot make the 30-minute job fail.
- **A trial erased while a sweep is running:** the sweep carries on. Recording a result for it is refused (the trial is gone), which counts as one unavailable read, and nothing is created for it.
- **Function logs** carry no identifier (above).
- **The scheduled job and its HTTP call** carry only the fixed action `trial_reminders`, a ticket and the billing mode. The reply is `{"accepted":true}`.

What this does **not** cover:

- **Dodo's own copy.** The customer, the email and its delivery record are Dodo's data. Erasing them at Dodo is a separate request.
- **Erasing Job Loop data is not account deletion.** That existing path (`job_loop_finish_erase`) removes the person's documents and runs but deliberately keeps billing records. The trial, and so its receipt, is kept until the account itself is deleted.
- **Backups and Supabase platform logs** follow Supabase's own retention.
- **An older, separate item, not changed here:** the deployed billing-event ledger (`loop_billing_events`, from the October billing migrations) has no link to the account. Its rows record the event's user, customer and subscription ids and survive an account deletion. It is not part of the reminder tables and needs its own decision.

## Where this can still be wrong

- **It over-reports rather than over-trusts.** Every trial with a candidate email is listed as `unbound`, because nothing can tie that email to the trial.
- **`not_found` can be a false alarm** if Dodo's trial-ending email has a different type name than the matcher expects, or is created outside the three days before the charge. Dodo's pages disagree about when it is created (about two days before, seven days before, or at the start of a short trial). Test-mode evidence is needed. A mismatch causes `not_found`, never a false confirmation.
- **Only the first 100 emails are read.** If the page does not reach back past the three-day window, the read is `incomplete`, not `not_found`.
- **A complaint after `delivered` is not seen.**
- **Erasure and concurrency are tested only on the local fixture.** It is a single-connection PGlite database. The cascade, the cross-mode key and the backstop's row lock have not been run against a real, concurrent Postgres, and the migration has not been applied anywhere.

## Owner steps (in the Dodo dashboard)

1. In Dodo, open **Settings → Communication**. Under **Customer Emails**, make sure **Subscription Trial Ending** is switched on. Check this in Test Mode, then in Live Mode.
2. In Test Mode, also make sure **Test Mode Emails** is on (**Settings → Communication → Email**). Test emails go to the real address, with `[TEST MODE]` at the start of the subject.
3. During the Test-mode trial, open the test customer in Dodo (**Sales → Customers**, then the **Sent Emails** tab) and note the trial-ending email's exact type, send time and status.

## Before live trials go on

- The Test-mode trial must show the trial-ending email, with the `email_type` the matcher in `supabase/functions/_shared/loop-trial-reminders.ts` expects (a name containing "trial" and "end" or "expir") and a send time inside the three days before the charge. If the trial is escalated as `not_found`, check the type and timing in that customer's Sent Emails tab first.
- A person must have checked, on the support list, that the candidate email is for that trial.
- Automatic confirmation needs a reliable link between an email and a subscription. If Dodo adds one, or the Test-mode check finds one in the email itself, add confirmation in a new migration. Do not infer one from the type and time.
