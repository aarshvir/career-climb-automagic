# Jobvance: 100-profile customer-scenario assessment

**Current projected score: 65/100 (64.65 arithmetic mean).** Reviewed 14 October 2026 against public version 25, runtime source `7a7af403bd62ea6d10bf056b68a67c5e5cbfe9de`.

The product provides useful CV-to-vacancy comparison and source-visible review. It still asks customers to do too much of the preparation and to move between separate application systems. Busy applicants are not yet receiving the low-effort end-to-end experience the product is intended to offer.

## What was actually assessed

Three separately assigned reviewers assessed 100 explicitly synthetic profiles each using a prespecified eight-dimension rubric. That produced 300 profile-rating rows, not 300 participants. Each reviewer documented cohort base judgments and explicit adjustments for input, device, time, confidence, vacancy availability and privacy. The scoring is a deterministic expert scenario model. It is not 100 executed browser sessions, a survey, a statistical sample or a probability forecast. All reviewers used the same underlying model in separate contexts; this is not the pending GPT/Kimi/Muse cross-model re-evaluation.

The coordinator freshly confirmed the public v25 publication, reloaded the homepage, inspected its desktop appearance and inspected the current first-check screen. The homepage still defaults to student guidance and presents overlapping student/MBA/professional categories. The free check already supports reuse of source or approved CV text for another vacancy, and this receives credit. The remaining continuity gap is between the check, separate tracking and private Job Loop.

No candidate record was changed. No fresh signup, full OAuth return, native downloaded file opening, complete first/second application, actual Storage deletion or paid model call was performed. Hosted acceptance gaps are unknowns, not asserted failures. A phone viewport attempt did not change observed width and was reset; no new mobile screenshot test is claimed. See [coordinator observations](coordinator-observations.json).

## Scores by customer task

| Dimension | Weight | Projected score /100 |
|---|---:|---:|
| Understanding what Jobvance does | 10% | 76 |
| Getting started | 10% | 73 |
| Usefulness of the first application | 20% | 65 |
| Time and manual effort saved | 20% | 47 |
| Returning and preparing a second application | 15% | 58 |
| User control and confidence | 10% | 85 |
| Interface clarity and useful help | 10% | 66 |
| Reliability readiness (provisional) | 5% | 73 |

User control includes local-first checks, source visibility, candidate approval and the v22-v25 reliability repairs. Its grade is not a security certification. Reliability readiness is a provisional judgment supported by bounded release/regression evidence, not measured uptime or complete hosted customer acceptance.

## Scores by primary customer need

These are assessment contexts, not a recommendation to create separate persona products. In practice, one person can be a student, an MBA applicant, mobile-first and time-constrained simultaneously. Each profile is assigned one primary context for aggregation.

| Primary context | Profiles | Projected score /100 |
|---|---:|---:|
| Final-year students with a CV | 15 | 68 |
| Recent graduates | 15 | 68 |
| MBA applicants with prior work | 10 | 64 |
| Busy professionals: next role in the same function | 20 | 67 |
| Busy professionals: changing function | 15 | 62 |
| Applicants recently out of work | 5 | 62 |
| Applicants targeting UAE relocation | 5 | 56 |
| Applicants returning after a break | 5 | 62 |
| Applicants mainly using a phone | 5 | 64 |
| Applicants handling confidential experience | 5 | 62 |

## Confidence and sensitivity

- Reviewer means: product/customer value 67.78, comprehension 64.30, workflow 61.89. Their spread is judgment disagreement, not a confidence interval.
- The 100 profiles use an assumed target mix: 30 students/recent graduates, 10 MBA applicants, 35 busy professionals, and 25 constraint/adjacent cases. Eighty-eight bring readable inputs; six have scans and six lack a CV. This is not a measured audience distribution.
- The subset that brings a readable CV and already has a vacancy scores 67.9/100 under the same rules. The major friction therefore remains even on supported inputs.
- More synthetic profiles do not provide the statistical confidence or behavioral validity of more real participants.
- Payment, actual demand, willingness to pay, conversion, retention, NPS, hiring outcomes, search ranking and revenue were not measured or inferred.
- The current cloud pilot remains limited to ten accounts. This review does not demonstrate capacity for 100 concurrent cloud customers. Payments stay disabled and payment absence is not penalized for a free first-check task.

## Highest-value repairs

1. **One application and one home.** Carry the reviewed check, selected source/final document, vacancy and status into private reuse with an explicit storage/processing handoff. Preserve existing records and current free-check reuse.
2. **Reduce manual review.** Group experience under roles/projects, prefill from the source and ask targeted questions about unresolved facts. Retain factual provenance, final approval and meaningful processing permission.
3. **Prepare directly from the chosen vacancy.** Show its source, progress, editable result and next action together. Reuse common facts rather than asking for the same material again.
4. **Make finishing dependable.** Preview the actual layout, then approve and download. Keep local exports available while optional cloud saving stalls, preserve unsaved tracking notes and support undo of source replacement.
5. **Use one neutral public entry.** Keep student/MBA context as optional examples within the common workflow. Remove silent classification and unnecessary infrastructure vocabulary.
6. **Observe real first and second applications.** Within the existing ten-account pilot, start with five consenting novices: overlapping student/graduate, experienced MBA and busy-professional contexts. Measure repeated entries, wrong turns, help requests, time, meaningful accepted changes and actual openable documents. Re-score after these repairs and observations; do not assign fixed point increases to plans.

These repairs follow the existing bounded usability-reset plan; this review is not a new feature roadmap. U06/U07 remain fixed by v22 and must not be reported as current defects. Backend generation/erasure/GC fences in v23-v25 remain valuable, while automatic production collection stays gated off.

## Reproduction and source reports

- [100 scenario definitions and weights](profiles.json)
- [Consolidated scores](consolidated.json)
- [All 100 profile scores (CSV)](100-profile-scores.csv)
- [Product/customer-value review](product-review.md)
- [Comprehension review](comprehension-review.md)
- [Workflow review](workflow-review.md)
- Each reviewer JSON publishes exact bases, adjustments, score rows and current source citations.
- Run `python consolidate.py` in this directory to validate all 100 IDs per reviewer, exact dimension keys, score bounds and weighted arithmetic, then reproduce the consolidated JSON/CSV.

This documentation does not change or redeploy the live application.
