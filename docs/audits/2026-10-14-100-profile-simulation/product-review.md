# Product/customer-value assessment of v25

**Projected panel mean: 67.8/100.** This is a rule-based expert scenario projection over 100 synthetic profiles, not 100 customers or executed browser sessions. Range 46.6–77.7; median 68.4. Decimal scores are arithmetic, not measurement precision.

Reviewed released runtime 7a7af403bd62ea6d10bf056b68a67c5e5cbfe9de at checkout fe55436e2f5c51d2d8a15ead4e19c7a7e8675fcf; no runtime diff. The current panel has 88 readable CV/text inputs, six scans and six without a CV. No external calls, accounts, purchases or candidate mutations were used.

## Reproducible method

Each goal group has eight documented base judgments; each profile then receives explicit device, time, confidence, familiarity, input, vacancy and privacy adjustments. Each dimension is clamped 0–100. Overall is exactly the supplied weighted sum divided by 100. Complete scores for all 100 IDs, every adjustment, assumptions, source evidence and base rationale are in [product-review.json](product-review.json). Profiles are correlated constructed scenarios, so a sampling confidence interval would be inappropriate. No reviewer grades were consulted.

| Dimension | Weight | Mean |
|---|---:|---:|
| understand value | 10% | 78.9 |
| get started | 10% | 76.4 |
| first application value | 20% | 66.3 |
| effort saved | 20% | 54.4 |
| return second application | 15% | 56.2 |
| trust control | 10% | 88.2 |
| interface help | 10% | 70.0 |
| operational reliability | 5% | 77.0 |

| Goal group | Profiles | Projected score |
|---|---:|---:|
| final year | 15 | 71.4 |
| recent graduate | 15 | 70.7 |
| mba | 10 | 66.6 |
| busy same function | 20 | 69.5 |
| busy switcher | 15 | 64.5 |
| urgent search | 5 | 65.3 |
| uae relocation | 5 | 60.6 |
| career return | 5 | 64.8 |
| mobile constraint | 5 | 67.3 |
| privacy constraint | 5 | 66.4 |

## What works and what limits value

The free entry is practical: readable CV + real vacancy, no account/card gate, original passages, editable final text and free formats. Second-vacancy reuse already exists in the free check; its source/final choice and undo receive credit ([CvCheck.tsx](../../../src/pages/CvCheck.tsx):183, 423). v22 repaired U06/U07, and v23–25 strengthened deletion, lifetime and worker integrity. Those repairs are not re-reported as current defects.

The main product problem is continuity. A saved free check, legacy application pack/tracker and Loop career record are separate objects and destinations. The user can reuse a free check, but cannot simply continue its approved work as one shared Loop application ([CvCheck.tsx](../../../src/pages/CvCheck.tsx):350–365; [JobLoop.tsx](../../../src/pages/JobLoop.tsx):401–421; [Workspace.tsx](../../../src/pages/Workspace.tsx):56–66).

The strongest first-task fit is a student/graduate or same-function professional with a readable CV and chosen vacancy. A switcher needs narrative judgment that keyword/phrase comparison and safe bullet ordering do not fully provide ([cv-evidence.ts](../../../src/lib/cv-evidence.ts):456–500). Preparing a cloud packet still requires per-passage category/result/source/sharing decisions; document corrections return to the career record and rebuild ([JobLoop.tsx](../../../src/pages/JobLoop.tsx):72–92, 432). These are the main limits on saved effort, not missing AI branding.

A user needing discovery starts further from the happy path: the free check asks for pasted vacancy text, and selected employer feeds do not establish comprehensive UAE coverage. Scans need external OCR; no-CV users have a useful starter outline but must write source material themselves ([cv-extraction.ts](../../../src/lib/cv-extraction.ts):73; [CvCheck.tsx](../../../src/pages/CvCheck.tsx):417–418). These are capability-fit limitations rather than invented live failures.

## Fix in this order

1. **One application has three possible homes.** Create one application record/home and explicitly continue the approved check there; preserve free-check reuse and current privacy/approval boundaries.
2. **Preparation requires fact administration before the promised time saving.** Propose grouped facts from the imported CV, review high-risk exceptions and edit a source-linked document in context with preserved provenance.
3. **Current tailoring contribution is smaller than the main promise suggests.** Show the exact proposed edit and why it helps, offer source-grounded alternatives with an inspectable diff, and measure useful accepted edits before stronger promises.
4. **Choosing a vacancy still does not directly prepare that application.** Add a clear prepare-this-vacancy action, reuse imported target details, show selected source coverage before setup, and retain manual posting entry.
5. **The finish sequence makes users interpret implementation state.** Order finish as edit → actual preview → approve → download, isolate optional save state and put infrastructure detail behind service-status help.
6. **Audience choice and help should clarify tasks instead of creating categories.** Use one common start and adapt examples after relevant experience is known; contextual help at friction points, with short task clips and a reduced phone review path.

Existing help includes captions, chapters, presenter support and fallback transcripts; current video realism/playback was not tested. Hosted signup/full OAuth, native download delivery and unassisted first/second-task success remain unknown as the latest release itself states ([v25 release](../../ARTIFACT-MAINTENANCE-RELEASE-2026-10-14.md):32). Production orphan collection is still disabled; prepared controls are credited without claiming operational deletion.

Payment work is pending and is not penalized for the present free task. This report contains no conversion, willingness-to-pay, NPS, hiring or revenue prediction. The next useful evidence is observed completion of a first and second application, especially by time-poor and phone users.
