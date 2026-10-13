# Jobvance owner guide: private administration

**Release note — 13 October 2026:** the backend is live; the new frontend is awaiting publication. Follow these steps after frontend release. The live owner browser journey has not been verified.

## 1. Open your private workspace

Open [Jobvance.io/admin](https://jobvance.io/admin) for operations or [Jobvance.io/admin2](https://jobvance.io/admin2) for the founder overview. Sign in to the existing **aarshvir@gmail.com** account using its linked sign-in method. You return to the requested portal.

Access is verified by the server for every request. If you see **Administration access required**, check that you used your existing owner account. Another account has no access. These private portals have no public navigation links and are excluded from search indexing.

Choose **7**, **30** or **90 days**; the range stays selected between **Operations** and **Founder**. All times use **UTC**. Use the refresh icon for current data.

## 2. Review daily operations at /admin

1. In **Support receipts**, choose **View saved message** for one receipt. Opening it is audited. Messages may contain private candidate details; this manual review does not send them to a model. **Close message** clears the displayed text without deleting the saved request.
2. Choose **Received**, **In review** or **Resolved**, then click **Save status**. Selection alone changes nothing. Saving is audited and does not send a reply.
3. Check **Recent preparation runs** for failures, blocks and processing routes. These runs started within your selected window. Completion does not prove an application was submitted or a file downloaded.
4. Check **Scheduler health** and **Pilot capacity**. Readiness checks configuration; **Last dispatch** shows the latest recorded dispatch time. Ten accounts can occupy the pilot. Test (QA) accounts occupy real seats and scheduler capacity and are identified separately.
5. Review **Candidate records**: contacts are masked, CV/source text is omitted, career state is current, and run counts are lifetime saved counts.

Support and candidate lists show current saved records, not a day-filtered history. Limits are 100 receipts, 200 candidates and 100 recent runs. **Administrative audit** shows the latest 30 events across all dates: reads, connection checks and changes.

## 3. Read the founder evidence at /admin2

Read each card’s definition, source, dates and sample size. Open **Measurement coverage & limits** before interpreting percentages.

| Panel | What it establishes |
| --- | --- |
| Observed milestones | Completed/failed runs by finish date, approved account CV checks and requested download links within the window. |
| Signup cohort funnel | New accounts in the window reaching saved profile, shareable evidence, completed preparation, current approval and requested download link. Percentages compare each stage with the previous one. |
| Week-two observed return | Eligible new accounts at least 14 days old with a retained candidate action or account CV check during days 7–13 after signup. Login-only return is untracked. |
| Repeated completed preparation | Accounts with at least two completed runs divided by accounts with at least one in the window. Scheduled runs count, so this does not prove a voluntary return. |

Customer metrics exclude QA accounts. Guest visits/checks and completed browser downloads lack complete tracking. **Untracked** and **Unavailable** do not mean zero. An empty comparison group has no percentage. Small samples and older activity have limits. Corrections, erasure and revoked approvals can change funnel counts. These measures do not establish hiring success or willingness to pay.

## 4. Check spending and payment state

**Shared AI + search allowance** covers candidate calls, independent reviews and administrative model calls: **$50 maximum per UTC month**. Reviews also have a **$5 batch limit inside that ceiling**.

**Committed** is the authoritative amount used or held. **Reserved** covers pending calls; **Uncertain usage retained** stays held until reconciled. **Recorded settled usage** is saved cost evidence, not an invoice, and may omit candidate-erased details. QA costs count. Remaining allowance has a floor of zero.

**Revenue & payment state** shows checkout disabled and revenue unavailable without verified payments. Free activity is not paid conversion. These portals cannot activate payments, purchase credits, send outreach, submit applications, delete accounts or grant admin roles.

## 5. Check the model connection and save controls deliberately

1. Click **Check connection status** in **Model connection**. It shows masked credential presence and **Valid**, **Invalid** or **Unverified** status, without generating commentary or buying credits. Valid credentials do not guarantee model availability. Manage keys only through [Supabase secrets setup](https://supabase.com/docs/guides/functions/secrets); Jobvance has no key-entry form.
2. In **Owner controls**, allow/pause existing schedules, allow OpenRouter, lower the ceiling, or choose **GPT 6.1 Sol — medium reasoning** or **Sonnet 5.5 — medium reasoning**. The ceiling must stay positive and can only be lowered from its current value.
3. Click **Save controls** and wait for confirmation. Saving is audited. OpenRouter enablement does not consent candidates or change existing schedules’ processing routes. Candidates must explicitly allow their chosen route. Numeric calculations remain deterministic.

For a newer-version conflict or unconfirmed save, click **Refresh current data**, review the settings and decide whether to save again. Refresh replaces unsaved edits. Sign in again if your session expires; denied access clears private data from the view.
