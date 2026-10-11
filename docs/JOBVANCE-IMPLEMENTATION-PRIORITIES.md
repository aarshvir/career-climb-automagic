# Jobvance implementation priorities

11 October 2026. Suggested implementation scope following the [six-perspective audit](audits/2026-10-11/Jobvance-audit-report.md). This is a proposal, not a release receipt. No fixes below have been implemented by adding this document.

The current audit is **60.9/100 overall**, with **56.8/100 for students, MBA applicants and employed career switchers**. A desired score of 98 is not a forecast. Implementing features cannot establish that score without fresh independent review and observed customer use. Scores describe the reviewed readiness, not employment probability or business success.

## The product to build

One private career record → a suitable, source-backed vacancy → a factual application pack → an exact document review → the user's application → a dated next action. The next vacancy reuses the same confirmed facts and requires substantially less setup.

The three audiences need different defaults, but the same reliable workflow. Students need internships/graduate eligibility and project evidence. MBAs need recruiting deadlines, career direction and defensible achievement selection. Employed switchers need discretion, fast setup and a useful recurring action list.

## Eight implementation workstreams

| Workstream | Concrete implementation | Completion evidence |
|---|---|---|
| 1. Evidence customers can trust | Scope uncertainty to the actual claim. Separate achievements, qualifications, experience, language, sponsorship conditions and dates. Show the exact supporting quote; identify missing evidence without inventing it. Exclude obvious title/preamble from the requirement count. | The reproduced Python counterfactual is stable. Negation, unfinished credentials, coursework and contribution/ownership cases behave correctly. Dates and sponsorship never quote unrelated achievements. Uncertain eligibility stays unknown. |
| 2. One connected application journey | Connect the guest check, reusable career record, vacancy, packet and tracker through an explicit previewed cloud-saving choice. Start with three guided facts; carry the selected audience into defaults. | A newcomer prepares one application without duplicate entry or a duplicate tracking record. A second role reuses prior confirmations. Changed facts invalidate only dependent artifacts; account switches never expose another account's records. |
| 3. Useful vacancy discovery | Start with permitted employer feeds or a maintained source-backed shortlist. Show employer, location, original posting, checked time, closing status and explainable relevance. Hold incomplete postings for confirmation. | Real roles useful to each audience can be traced to their source. Closed, incomplete or unavailable sources have clear states. No logged-in job-board scraping or snippet-only vacancy verification. |
| 4. A dependable recurring Job Loop | Add explicit opt-in scheduling, timezone-aware daily actions, bounded runs, retries and resumable state. Surface new roles, prepared packs, deadlines and user-entered application updates. Configure optional mailbox access only with separate informed consent and verified permissions. | A consented run completes after the browser closes; failed runs recover without duplicate packets or duplicated charges. The shared model/search reservation ledger remains within US$50/month. Unavailable sources/mail are never described as successful searches. Sending and applying remain user actions. |
| 5. Documents users can inspect and use | Show the actual PDF page layout before approval, plus source-linked changes and one/two-page controls. Provide safe section/bullet selection and undo. Support Arabic names in otherwise English documents; handle each export format independently where safe. | The approved preview matches the downloaded file. Long output has an actionable recovery path. Mixed-script names survive exported files. PDF problems do not unnecessarily prevent valid editable formats. Editing always requires renewed approval. |
| 6. Segment-specific tracking and discretion | Add application deadlines, interviews and next actions in the chosen timezone. Provide MBA recruiting/career-direction views, student eligibility questions, and employer/domain exclusions for switchers. Treat unknown compensation and work authorization explicitly. | A Dubai date-only action is due on the intended day. Users can explain which conditions are known versus unconfirmed. An employer exclusion is enforced in its documented scope; it does not promise complete anonymity. |
| 7. Recovery, mobile usability and support | Protect or warn before discarding a guest draft; optional temporary retention must be explicit and clearable. Collapse evidence into an actionable summary with reachable next-step controls. Fix field-level error/focus recovery and menu Escape behavior. Publish a monitored support and erasure route with clear responsibilities. | Privacy → Back preserves the draft or obtains an explicit discard choice. Phone/keyboard/text-enlargement tasks succeed. A fictional support/erasure request is acknowledged and fulfilled with minimal identifiers and documented scope. |
| 8. Measured product quality | Add consent-appropriate minimal activation and reliability measurement, avoiding CV text in logs. Observe real users completing first and second applications. Retest authenticated isolation, withdrawal, interruptions, exports, budget boundaries and recovery. | Publish actual denominators, assistance, abandonment, completion time, repeat use and failure reasons. Run a fresh independent audit after material fixes. Retention and willingness to pay remain unproven until measured. |

Detailed issue owners, evidence and effort estimates are in the [22-item backlog](audits/2026-10-11/Jobvance-audit-report.md#improvement-backlog--owner-evidence-and-acceptance).

## Recommended order

1. **Repair trust and lost effort:** evidence guidance, safe navigation, monitored support and an accurate capability summary. These require no new paid model calls.
2. **Complete the first and second application:** connected records, guided facts, exact document preview, mobile review and useful dated tracking.
3. **Deliver the time-saving promise:** permitted discovery, bounded recurring runs, useful daily actions, discretion and verified optional integrations.
4. **Validate with customers:** observe at least ten consenting users across the three audiences, including phone use and a second application. Record task results and assistance; do not treat a small pilot as proof of market leadership.

The target is demonstrably reliable task completion and repeat usefulness. A reassessment can then decide whether readiness merits 90+, 98, or a lower score. UI polish and another model adapter alone will not close the current gaps.

## Payments remain separate and pending

Payments are not required for a strong free-pilot experience. Keep the current beta free and billing disabled. Future commercial launch needs an eligible merchant account and an end-to-end checkout/entitlement/refund/reconciliation test, including verified webhook signatures, idempotency, cancelled checkout, delayed events and recovery. A payment link alone does not implement these responsibilities. Eligibility and account approval remain external dependencies; this proposal does not authorize provider activation or resolve the owner's licensing constraint.

No ads, outreach, messages, applications, purchases, mailbox connection or paid provider calls are requested by this plan. The implementation must retain the user's US$50/month shared model/search ceiling, source-grounded facts and explicit user controls.
