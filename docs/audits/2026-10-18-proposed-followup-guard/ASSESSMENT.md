# Open issue: completed proposal wording classified as a projected result

18 October 2026. **OPEN — reproduced locally; no runtime fix or release.** This bounded finding arose while reviewing a fictional film fixture. It is separate from clearance of the corrected fixture for a labelled source-based demonstration. No real candidate, provider call or production record was involved.

## Exact reproduction

The actual `validateClaim` function in [job-loop-engine.ts](../../../supabase/functions/_shared/job-loop-engine.ts) was called with `sourceKind: 'cv_passage'`, `kind: 'employment'`, `resultStatus: 'not_measured'`, and an exact source passage copied unchanged into both `sourceQuote` and `phrasing`:

> Investigated changes in work-completion patterns by comparing periods, request categories and team queues. Presented the findings with filters and assumptions visible, distinguished observed associations from possible explanations, and proposed follow-up checks without claiming that the analysis caused an operational improvement.

The complete fictional CV contained that same paragraph under the nearby literal context `REPORTING ANALYST | Harborlight Practice Studio | June 2022–present`. The test changed **both** the complete CV source and the exact claim back to this original wording, so rejection was not caused by a stale quote or cropped passage. The input retained `confirmed: false` and `shareable: false`; this is source-input validation, not approval or permission restoration.

Observed result:

```text
Projected wording must retain its projected result label.
```

With the same complete source, wording and context, changing only `resultStatus` to `projected` was accepted. The final authored fictional fixture instead uses **“identified follow-up checks”** in both source and claim; all six final fixture claims pass the same real validator with `not_measured`. This wording correction was explicitly authorized for the invented demonstration source. It is not a product fix or evidence that a real candidate should alter their facts to bypass a guard.

## Cause and interpretation

The shared `PROJECTED` expression at line14 matches the standalone word `proposed`. `projectedResult` at lines56–59 requires `status === 'projected'` whenever the approved phrasing matches that expression. It does not distinguish a completed act of proposing checks from a forecast business result.

The observed rejection is certain; its semantic classification is a **likely conservative false positive for this exact completed-action passage**. The passage explicitly avoids a measured causal-improvement claim. Marking the entire fact as projected is not necessarily an accurate description of what the candidate did. This does not mean actual forecasts, estimates, future outcomes or omitted qualifiers should be accepted as measured facts.

## Required follow-up and evidence limits

Keep this as a distinct source-review usability issue. A future bounded repair should distinguish completed proposal activity from forecast results while retaining exact passage, qualifier, attribution, ownership and current-permission safeguards. Meaningful regressions must include this exact passage/control and true projected/estimated/measured-result negatives. Do not remove `proposed` or weaken projection protection globally as an unreviewed workaround.

The independent local receipt is retained privately as `.tmp/film-production-browser/hero-independent-source-review.json`, timestamp **2026-10-18T15:45:27.279Z**. It records the thrown error, accepted projected-status control, exact final source/package hashes and successful validation of the corrected six-fact fixture. No hosted UI reproduction, broader frequency estimate, fix, full suite, build or deployment is claimed. The issue does not invalidate the separately inspected final source-based rules output or delay genuine film capture.
