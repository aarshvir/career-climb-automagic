# Consolidated independent baseline review

12 October 2026 · production version **12** · source `2e134180a8cdbb248c5fa5dca01b1a1bf8b1fb69`.

**COMPLETE: 9/9 valid reviews. Whole equal-persona score: 60.57/100.**

This is a model-review baseline, not evidence of customer or hiring success.

| Persona | GPT 6.1 Sol | Kimi K3 | Muse Spark 1.3 | Equal-model mean | Reviewer min–max | Spread |
|---|---:|---:|---:|---:|---:|---:|
| student | 61.80 | 65.10 | 53.20 | 60.03 | 53.20–65.10 | 11.90 |
| mba | 64.20 | 70.00 | 53.80 | 62.67 | 53.80–70.00 | 16.20 |
| professional | 60.70 | 63.80 | 52.50 | 59.00 | 52.50–63.80 | 11.30 |

Across valid reviewer means: 52.50–70.00, spread 17.50. A spread is disagreement, not a confidence interval.

## Ten-category matrix

| Category | Student GPT | Student Kimi | Student Muse | MBA GPT | MBA Kimi | MBA Muse | Professional GPT | Professional Kimi | Professional Muse | Equal-persona mean | Min–max | Spread |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| User need / value | 73.00 | 74.00 | 68.00 | 67.00 | 75.00 | 58.00 | 65.00 | 70.00 | 50.00 | 66.67 | 50.00–75.00 | 25.00 |
| Onboarding | 74.00 | 70.00 | 58.00 | 78.00 | 75.00 | 62.00 | 70.00 | 65.00 | 60.00 | 68.00 | 58.00–78.00 | 20.00 |
| UX / accessibility / mobile | 70.00 | 60.00 | 48.00 | 74.00 | 58.00 | 48.00 | 74.00 | 55.00 | 50.00 | 59.67 | 48.00–74.00 | 26.00 |
| Evidence trust / document quality | 71.00 | 80.00 | 72.00 | 80.00 | 88.00 | 72.00 | 76.00 | 85.00 | 65.00 | 76.56 | 65.00–88.00 | 23.00 |
| Job coverage / relevance | 43.00 | 45.00 | 32.00 | 40.00 | 52.00 | 38.00 | 36.00 | 45.00 | 40.00 | 41.22 | 32.00–52.00 | 20.00 |
| Automation / effort | 47.00 | 55.00 | 44.00 | 50.00 | 60.00 | 46.00 | 48.00 | 55.00 | 45.00 | 50.00 | 44.00–60.00 | 16.00 |
| Tracking / actionability | 62.00 | 68.00 | 54.00 | 62.00 | 70.00 | 54.00 | 62.00 | 60.00 | 55.00 | 60.78 | 54.00–70.00 | 16.00 |
| Reliability / recovery | 65.00 | 75.00 | 57.00 | 67.00 | 78.00 | 52.00 | 59.00 | 68.00 | 55.00 | 64.00 | 52.00–78.00 | 26.00 |
| Privacy / control | 76.00 | 82.00 | 71.00 | 79.00 | 89.00 | 76.00 | 74.00 | 85.00 | 70.00 | 78.00 | 70.00–89.00 | 19.00 |
| Willingness to pay | 37.00 | 42.00 | 28.00 | 45.00 | 55.00 | 32.00 | 43.00 | 50.00 | 35.00 | 40.78 | 28.00–55.00 | 27.00 |

Each reviewer is recalculated from ten equal-weight scores. Each persona weights its three models equally; the whole weights its three personas equally. The JSON retains full precision; tables display two decimals. No prior reviewer mean, target, model cost or test count determines the score.

## Provenance and review records

Frozen external packet SHA-256: `3ceffd92ca847f1f3376cbce9a134be6cfe3ec2e4ad498bda22e464422b1c385`.

| Persona / reviewer | Status | Requested model | Returned model | Reasoning | Original report |
|---|---|---|---|---|---|
| student / GPT 6.1 Sol | complete | gpt-6.1-sol | Unavailable (native configuration only) | high | [JSON](independent/student-gpt61-sol.json) |
| student / Kimi K3 | complete | moonshotai/kimi-k3 | moonshotai/kimi-k3 | max | [JSON](independent/student-kimi-k3.json) |
| student / Muse Spark 1.3 | complete | meta/muse-spark-1.3 | meta/muse-spark-1.3 | max | [JSON](independent/student-muse-spark-13.json) |
| mba / GPT 6.1 Sol | complete | gpt-6.1-sol | Unavailable (native configuration only) | high | [JSON](independent/mba-gpt61-sol.json) |
| mba / Kimi K3 | complete | moonshotai/kimi-k3 | moonshotai/kimi-k3 | max | [JSON](independent/mba-kimi-k3.json) |
| mba / Muse Spark 1.3 | complete | meta/muse-spark-1.3 | meta/muse-spark-1.3 | max | [JSON](independent/mba-muse-spark-13.json) |
| professional / GPT 6.1 Sol | complete | gpt-6.1-sol | Unavailable (native configuration only) | high | [JSON](independent/professional-gpt61-sol.json) |
| professional / Kimi K3 | complete | moonshotai/kimi-k3 | moonshotai/kimi-k3 | max | [JSON](independent/professional-kimi-k3.json) |
| professional / Muse Spark 1.3 | complete | meta/muse-spark-1.3 | meta/muse-spark-1.3 | max | [JSON](independent/professional-muse-spark-13.json) |

Native narrative reports: [student](independent/student-gpt61-sol.md), [MBA](independent/mba-gpt61-sol.md), [professional](independent/professional-gpt61-sol.md). Full sanitized inputs and source-file hashes are embedded unchanged in [the consolidated JSON](CONSOLIDATED-REVIEW.json).

## Execution accounting

Final consolidation completed **13 October 2026**; the baseline and review directory intentionally remain 12 October. Six completed external reviews have confirmed cost **USD 0.51178**, independently summed from their usage records. The original interrupted MBA Muse attempt retains **USD 0.225976** as a fully held, uncertain reservation, so charged-or-held exposure is **USD 0.737756**; actual interrupted-call cost is unknown.

Root confirmed the original free-worker **WallClockTime** failure, corrected the request timeout from the 150-second worker boundary to 120 seconds, and made one controlled replacement under the original $5 batch cap. The actual replacement scored 53.8 and cost USD 0.080038; its saved report is included once. No grade was supplied for the interrupted attempt, its reservation was not released, and no score or average was changed to compensate. Worker/ledger trace is root-reported; this offline script did not access production logs or credentials. Server HTTP 200 key validation was reported separately and does not prove a candidate journey or customer outcome.

## Evidence boundaries

- Native GPT reviewers observed public pages and ephemeral synthetic guest journeys and inspected baseline source; their report-specific scopes and export checks differ. They did not authenticate or establish exact live deployment/source parity.
- External reviewers received the identical frozen public text/source packet, a persona-specific brief and the same rubric. They did not browse, log in or directly operate the product. The packet hash is comparable between external reviews, not proof of equivalent evidence to native observations.
- All included reviews assess production version 12 / source 2e134180a8cdbb248c5fa5dca01b1a1bf8b1fb69. Later guest coursework/page-target corrections and administration/router work are postbaseline and do not retroactively alter these scores.
- No real human usability study, measured first/second-application effort, representative vacancy benchmark, actual purchasing behavior, interview or employment outcomes are established. Willingness to pay is persona judgment.
- Code paths, test passes, available download links and fictional product examples are not evidence of successful authenticated journeys, completed downloads, recurring execution or human outcomes.
- Configured model provenance and actual returned provider model IDs are distinguished. Raw reports, provenance, usage and per-file hashes are retained below and in the immutable input files.
- The original MBA Muse call ended at the free worker WallClockTime limit without a review result. Its full USD 0.225976 reservation remains held as uncertain, not recorded as zero or released. Root made one controlled replacement after correcting the timeout; only its actual completed review occupies that logical model/persona slot.

## Improvement and re-review

The largest recurring native concerns are suitable vacancy coverage, first-use setup, second-application effort and proof that scheduled preparation works. Evidence truthfulness and explicit user control are relative strengths, with PDF/mobile, practical-condition extraction, support and erasure checks still needed. Read each external report for its independent judgment; the matrix preserves disagreement.

The [ordered improvement plan](IMPROVEMENT-PLAN.md) defines engineering work, a ten-person free pilot, metric owners and acceptance checks. A 95+ ambition is an **UNVALIDATED target**, not a forecast or newly achieved grade. Need/value and willingness to pay require real customer evidence; code-only reruns cannot establish them.

Reproduce offline with `node scripts/consolidate-independent-reviews.mjs`. Inputs remain unchanged. No provider call, production credential, account record, payment, outreach, deployment or application submission is used by this script.
