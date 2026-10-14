# 15 — Email Marketing

**Readiness: 57/100; medium confidence.** This assesses candidate email lifecycle readiness, not the whole product or measured deliverability. Source: e661c6493c30c88f2487800ff38aa10c46c9aae6; published runtime: 57713fb1cb15b29be8d6dc745e3c87bcb718c4af. Source-only examination; no live session, SMTP/DNS configuration, private mailbox or delivery logs inspected. Nothing sent, subscribed, activated or changed.

| Criterion | /20 | Evidence |
|---|---:|---|
| Permission boundaries and truthful expectations | 17 | PilotLanding:110–129; ProductPage:162–166 |
| Consent/preferences/suppression readiness | 7 | Auth:149–169; bounded source/schema search |
| Task relevance and activation | 14 | JobLoopPanels:27–33 |
| Transactional sender readiness | 10 | AuthContext:100–118; AUTH-REPAIR:31 |
| Repeat usefulness and measurement | 9 | JobLoopPanels:17; admin snapshot:65,85–86 |

The strongest foundation is restraint: first value needs no signup; the pilot form prepares an explicitly unsent request; support receipts do not claim email delivery. Recurring preparation consent is separate from Gmail access and draft creation. The historical coach invitations are UNSENT assets, not subscribers or observed acquisition.

## Findings and acceptance

**EMAIL-01 · P1 — Gate optional mail on purpose-specific permission.** Source-confirmed: signup captures credentials (src/pages/Auth.tsx:149); recurring consent authorizes preparation (src/pages/JobLoopPanels.tsx:74). Neither is mailing-list permission. No lifecycle consent/unsubscribe/suppression implementation appeared in the examined source/schema. Add unchecked choices for onboarding, dated reminders and occasional tips; store consent wording/version, source, verified address and timestamp. Provide signed unsubscribe without login, global optional-mail suppression and bounce/complaint handling. **Accept:** no choice means no optional queue; withdrawal, erasure and duplicate webhooks cancel queued mail; later sign-in cannot re-subscribe. Dependencies: settings, owner-approved purpose/retention and future transport. **2–4 engineer-days; no purchase now.**

**EMAIL-02 · P1 — Verify transactional delivery before widening email-dependent access.** AuthContext:100–118 requests signup/recovery through Supabase; AUTH-REPAIR:31 explicitly leaves live delivery checks pending. This does **not** prove failed delivery. An owner-run synthetic-account release check should establish confirmation policy, recovery, expiry, throttling, correct redirects and received headers. Keep operational auth and promotional traffic separate. [Supabase guidance](https://supabase.com/docs/guides/auth/auth-smtp), checked 14 October 2026, describes restricted, best-effort default SMTP and recommends separated auth/marketing streams. [Gmail guidance](https://support.google.com/mail/answer/81126?hl=en) requires sender authentication; its one-click marketing unsubscribe requirement applies to bulk senders over 5,000/day. Adopt easy unsubscribe at pilot scale as product policy. **Accept:** documented provider acceptance versus actual receipt, working expiry/recovery, no promotional auth CTA. Dependencies: owner/provider/DNS access and later authorized delivery test. **0.5–1.5 days; future sender cost unpriced and outside the AI/search cap.**

**EMAIL-03 · P2 — Mirror the next useful task.** JobLoopPanels:27–33 already chooses between confirming facts, adding a vacancy and reviewing a document. Use that resolver for opted-in help; avoid a generic signup drip. Preserve academic-project context for students and truthful contribution for MBA/professional examples. **Accept:** latest state selects one relevant CTA and completion cancels pending help; guests remain anonymous. Dependencies: EMAIL-01 and state events. **1–2 days; static copy, no model calls.**

**EMAIL-04 · P2 — Remind about chosen actions, not every scheduled run.** JobLoopPanels:17,38 excludes closed statuses from due actions; :74 separately controls preparation schedules. Add local send windows, personal-address confirmation, discreet subjects and search paused/ended controls. Send only actionable digests, initially at most two optional emails/week. **Accept:** completion/pause before dispatch suppresses mail; duplicates produce one message; no employer details, CV attachments or private tokens in URLs. Successful search exit ends reminders. Dependencies: EMAIL-01, preferences, idempotent queue. **1.5–3 days; bounded future sending costs.**

**EMAIL-05 · P2 — Measure candidate actions.** Admin snapshot migration:65 correctly distinguishes download requests from completion; :85–86 distinguishes candidate return from scheduled preparation. Extend this with eligible/suppressed/accepted/bounced/unsubscribed counts and seven-day candidate task attribution. **Accept:** one task counts once; automatic runs never establish voluntary return; report denominators and complaints alongside useful action. Dependencies: minimal event policy and future verified webhooks. **1–2 days; reuse storage, no paid analytics.**

## Four draft examples — recommendations only

These are conditional branches, not four mandatory sends. They require EMAIL-01 and an approved sender. The protected workspace route is /loop (MvpApp.tsx:82); /job-loop is the public overview. Future section routing must be verified. Each footer needs a working signed unsubscribe link before use. No recipient is selected.

1. **Onboarding:** 24 hours after separately opted-in account saving, only while facts remain unconfirmed. Subject: **Your first saved step is ready to review**. Preview: Confirm the facts you want to reuse.\
“Your private record is saved. Confirm the facts you want to reuse. Keep your personal contribution accurate and leave confidential details out. Continue with one actual vacancy when ready. Nothing has been sent to an employer.”\
CTA: **Review my facts → /loop**. Stop: confirmation, opt-out or seven days.

2. **Review:** newly reviewable document; next allowed local window. Subject: **Your saved document is ready for review**. Preview: Check the wording against its evidence.\
“A document is waiting for your review. Check its full wording against your evidence, especially your contribution and results. Approval is your decision; preparing it does not submit an application.”\
CTA: **Review my document → /loop**. Stop: approval, invalidation, deletion; once per document revision.

3. **Dated action:** opted-in candidate-selected date becomes due. Subject: **A date you saved needs your attention**. Preview: Check progress before choosing your next action.\
“A date you set is due today. Check the current status. You can move the date, close the task or choose your own follow-up. Jobvance has not contacted the employer.”\
CTA: **See my dated action → /loop**. Stop: rescheduled/closed task; once per date.

4. **Repeat task:** seven days after first approval, still actively searching and opted into tips. Subject: **Reuse your facts for your next application**. Preview: Bring another real vacancy when useful.\
“Your confirmed facts can help with another vacancy. Bring the actual posting and review each new document. Stop reminders whenever your search pauses or ends; there is no streak to maintain.”\
CTA: **Start another check → /check**. Stop: second task, paused/ended search; once.

Shared footer: “You requested [purpose] emails. Stop these reminders: [signed unsubscribe link].” Global stops also include hard bounce, complaint and erasure.

Order: establish permission/suppression; verify transactional readiness; test copy with willing pilot participants; then consider delivery. Measure first approved document, voluntary second-vacancy work and reminder usefulness, not opens. The fuller local draft fixture scored **75/100** in the skill’s heuristic analyzer; that is not a delivery/conversion result. With ten users, report counts and feedback, not significance or benchmarks. Build no paid campaign stack, prospect import, upgrade urgency or automatic outreach.
