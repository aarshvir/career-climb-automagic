# Jobvance implementation priorities

11 October 2026. Suggested implementation scope following the [six-perspective audit](audits/2026-10-11/Jobvance-audit-report.md). This is a proposal, not a release receipt. No fixes below have been implemented by adding this document.

The current audit is **60.9/100 overall**, with **56.8/100 for students, MBA applicants and employed career switchers**. A desired score of 98 is not a forecast. Implementing features cannot establish that score without fresh independent review and observed customer use. Scores describe the reviewed readiness, not employment probability or business success.

The [ten-build roadmap](JOBVANCE-TEN-BUILDS-AND-ARCHETYPES.md) expands this plan into ten customer archetypes plus a separate VC lens, with a full feature-fit matrix, per-archetype acceptance criteria, validation experiments and the requested 95/98 readiness targets. Feature fit is distinct from achieved platform quality.

## The product to build

One private career record → a suitable, source-backed vacancy → a factual application pack → an exact document review → the user's application → a dated next action. The next vacancy reuses the same confirmed facts and requires substantially less setup.

The three audiences need different defaults, but the same reliable workflow. Students need internships/graduate eligibility and project evidence. MBAs need recruiting deadlines, career direction and defensible achievement selection. Employed switchers need discretion, fast setup and a useful recurring action list.

## Audience-specific landing pages

These are planned routes, not currently released pages. Keep an audience selector on the general homepage and provide three shareable entry pages. Use explicit visitor selection; do not infer an audience from private browsing, inbox or CV data.

| Planned page | Message and relevant content | Carry into the first task |
|---|---|---|
| `/for-students` | “Turn your projects and internships into your first application.” Show a clearly fictional graduate example, coursework versus employment distinctions, graduation timing and internship/graduate-role filters. | Student context, graduation timing if supplied, project/internship examples and an editable one-page preference. |
| `/for-mba` | “Build focused applications for your next career move.” Show a clearly fictional career-direction example, defensible achievement selection and recruiting deadlines. | MBA context, chosen career direction, recruiting dates and an editable page preference. MBA study alone never establishes role eligibility. |
| `/for-career-switchers` | “Keep your job search moving while you work.” Show reusable experience, discreet-search controls, current service availability and an example review/action list. | Experienced context, target roles, optional employer exclusions and editable length/availability preferences. |

Use the same accurate capability summary and free offer everywhere. The first call to action is “Check one vacancy free.” A visitor may change audience at any time without losing inputs. Preserve the non-sensitive audience choice through the guest check and sign-in return; storing or sharing CV facts requires its own explicit choice. Do not put employers, contact details, salary or CV content into public URL parameters. Each page changes its examples, priorities and onboarding defaults, not merely its headline or color. Daily-search claims must reflect enabled, verified capabilities.

**Acceptance:** enter from each page on phone and desktop, start the task, change audience, and pass through sign-in. The correct audience and existing inputs persist; editable defaults are clear; no choice silently grants consent. Actual students, MBAs and switchers can explain the relevant value and today's available capabilities.

## One private page showing the candidate's work

The candidate's default signed-in page should be one private workspace, with “Today,” active applications, their career record and a readable activity timeline. Detail panels can show the vacancy, quoted evidence, document versions, actual preview and next action without making the candidate reconstruct progress across separate tools. Guest progress remains visible within the check without requiring cloud saving.

For every substantive event, show what happened, when, who initiated it (candidate or automated run), the linked vacancy/document, and an actionable next step. Record CV parsing, fact confirmation or withdrawal, vacancy addition, a shortlist decision, run progress, blocked/failed states, generated versions, approvals, completed downloads and candidate-reported application updates. Keep sensitive content out of general diagnostic logs; expose personal details only in the owner's authorized view.

Use truthful states such as “Preparing,” “Needs your review,” “Ready to download,” “Application reported by you,” and “Interview date added.” A generated document or opened employer link does not establish submission. An optional permitted integration must identify the event/source it actually observed; unconfirmed status needs a quick candidate confirmation. Jobvance cannot see arbitrary activity on external sites or in an unconnected inbox.

**Acceptance:** one fictional application can be followed from input to reviewed documents and dated tracking without retyping. Refresh, navigation, interrupted runs and a second device show the saved state consistently. Guest recovery follows the selected retention policy. Each timeline entry links to the correct immutable version; a changed or withdrawn fact updates affected approvals. Failed/unavailable work has a useful recovery action. Another account cannot view the timeline, record or files. Coach sharing, if later added, requires separate scoped permission; candidate activity is never a public feed.

## Automate preparation and measure the remaining effort

Automate each repeatable preparation task after the necessary setup and consent: parse source documents, suggest source-backed facts, deduplicate permitted vacancies, extract requirements, rank relevant roles, select confirmed shareable facts, prepare documents and recruiter drafts, render/validate formats, check deadlines, compile in-app next actions, checkpoint work and recover failures. Reuse prior confirmations and ask only for newly missing information. Durable field-level edits should not require re-entering the whole CV or restarting the complete journey.

A recurring workflow must display its cadence, timezone, permitted sources, exclusions and current state. Provide accessible pause and cancel controls; cancellation stops pending work while preserving already prepared records according to the stated retention policy. Show skipped, failed and outdated work in the timeline, with the next decision needed. Batch compatible review questions while keeping factual confirmation and disclosure approval distinct.

Keep the candidate's deliberate decisions: confirm factual claims, choose search/disclosure preferences, approve the exact document and sharing scope, and control sending/submission. The current service has no send/apply route. Future form filling can be assisted where permitted, with review; it is not authorized by this plan. Candidate-correction and approval controls must remain easy to find, including on a phone.

“99% automated” is an aspiration for repetitive preparation, not a verified percentage of the entire job hunt. Distinguish tasks executed automatically from active minutes saved: many quick automated tasks do not prove a 99% reduction in user effort. Measure first setup separately from repeated applications and compare equivalent real tasks at the same evidence/output quality. Track active minutes, manual fields, interruptions/questions, completion, assistance, errors and repeat use; exclude idle background runtime from claimed manual effort saved.

Proposed pilot goals, not achieved results: initial setup within ten active minutes for a straightforward usable CV; a subsequent complete packet review within three active minutes when no new facts or unusual conditions are needed; no duplicate data entry. Observe at least ten consenting users across the three audiences and include failures, complex cases and required corrections. These small-pilot goals are not statistical guarantees or permission to reduce review quality. Publish automation/time-saving claims only when the measured scope, baseline and results support them.

Automation remains bounded by the shared US$50/month model/search ledger. Provide useful rules-mode/manual-source fallback with honest capability states when a provider is disabled, fails or reaches the budget ceiling. Do not silently spend more, change providers' data recipients, send messages, or submit applications to avoid asking a user for an essential decision.

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
