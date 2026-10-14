# Cycle 2 independent audit: MBA and busy professional

Initial guest audit frozen before remediation on 14 October 2026. No prior scores, implementation reports or desired grade were read. The JSON companion preserves full fictional inputs, evidence IDs, raw scores, file hashes and export receipts.

## Scope and provenance

- Preview: `http://127.0.0.1:8383`, own CUA IAB tab 1. Existing desktop viewport; no root tab or browser-wide viewport changes.
- Browser observation window bounded by **03:28:28–03:35:50 UTC** (07:28:28–07:35:50 Dubai). Source/tests followed from 03:35:50 UTC.
- HEAD before/after: `9682cd1bbf776be6d2e74b023766fcd4c9056022`. Working tree was already dirty. This auditor made no runtime edits, commits or deployment.
- Nine relevant source files had identical SHA-256 hashes in two post-browser collections; the second was at **03:37:52.4276836 UTC**. Overview/audience hashes were additionally captured at 03:38:25.9773832 UTC. Full hashes are in JSON. Per-file hashes were not captured before browsing, so complete absence of source drift during browser work is **not established**. Documentation/temporary files changed elsewhere.
- No real data, sign-in, account save, paid model, application send or live support write occurred.

Evidence categories are kept separate: **B** = visible browser behavior; **S/T** = source/function/test evidence; **F** = downloaded-file inspection; **P** = parent-supplied runtime summary; **L** = unverified boundary.

## Raw scores

Ten equal 0–100 dimensions; arithmetic mean is the raw sum divided by ten. These are bounded guest-workflow assessments, not private-cloud or security certification.

| Dimension | MBA | Busy professional | Basis |
|---|---:|---:|---|
| Clarity | 90 | 88 | Clear steps and responsibility; professional entry becomes “Career switcher”, and “verified experience” wording is too strong. |
| Activation | 89 | 90 | Useful flow starts without account/card or lengthy profile. |
| Form effort | 87 | 85 | Role, source, vacancy; source review is necessary, but dense manual evidence and long help add effort. |
| Evidence quality | 69 | 79 | Important negatives/qualifiers stay intact; unrelated negation contaminates MBA strengths, and several useful professional passages remain generic manual review. |
| Workflow completeness | 88 | 88 | Edited CV approval and actual files delivered; PDF visual review has the explicit environment boundary below. |
| Reuse/time-saving | 92 | 93 | Four-step next application, source/final choice, source update and page-only undo all worked. |
| Help/walkthroughs | 88 | 89 | Detailed control-level help, contextual anchor and tutorial choices; confidential search misses dedicated removal topic. |
| UI/accessibility | 86 | 86 | Readable desktop presentation, labelled fields and heading focus observed; full keyboard/screen-reader/mobile work not tested. |
| Trust/privacy | 92 | 93 | Specific local/save/recovery boundaries, full source context, explicit approval and safe export/reuse after removal. This is not exhaustive network/privacy verification. |
| Reliability | 86 | 88 | One startup blank recovered on reload; later edits, removal, downloads, reuse and undo were consistent. |
| **Raw sum / arithmetic mean** | **867 / 86.7** | **879 / 87.9** | No rounding or weighting beyond division by ten. |

## Observed journeys

**MBA candidate pivoting from operations employment (B02–B07).** Chose MBA on home; example, guidance and entry URL changed. Entered fictional Mira Sen, an unfinished MBA, prior employment, team research, a 12% classroom revenue forecast, a project-support/budget negative and explicit absence of professional SQL. Pasted source, removed the fictional ORCHID-LANTERN confidential line before comparison, then entered a six-requirement strategy vacancy. The source kept team contribution, forecast and qualification context intact. SQL absence, unfinished degree and forecast versus delivered outcome received appropriate review warnings. All six findings were manual review, including the incorrect reporting conflict described below.

Edited only the contribution sentence, updated reusable source, used Undo source update, verified final edits remained, then reapplied the safe source. Rechecked, previewed a one-page PDF count, confirmed accuracy/privacy and approved. Actual TXT/PDF/DOCX downloads were received. The approved final CV was default for another vacancy; the reused text retained the edit and excluded ORCHID-LANTERN. Entered a second research vacancy without retyping source, checked its evidence, then Undo new application restored the prior role/vacancy/edited CV at review with fresh approval required.

**Discreet employed professional, about eight years (B11–B14).** Started through “Start with my existing CV”. The source included reporting, a measured internal pilot, support rather than team management, explicit lack of production Power BI and a fictional COBALT-PINE confidential line. Evidence showed one direct, three related and two manual findings; support/leadership and Power BI distinctions were preserved. The eight-year requirement did not become an inferred verified total from dates.

In review, selected source line 6, previewed both source and current CV without it, applied, undid and deliberately repeated removal. The interface warned that undo restores removed details. Edited contribution wording and retained the safe source, rechecked, approved and received TXT/DOCX plus a separate evidence report. Explicitly chose **Reviewed source CV** for a second vacancy; inspected safe reused text, checked the second job, then undid replacement. Both restored CV and source stayed sanitized. A contextual removal-help link focused the correct help topic; returning to check kept the sanitized draft and cleared approval/page-only undo.

**Help and offer (B08–B10).** Help has 12 topics, search and detailed named-control instructions. Interactive tutorials distinguish fictional examples from the live service; contribution tutorial preserves complete team/estimate context. A recording loaded a visible product-screen poster and chapter controls; full playback/audio/caption synchronization was not tested. The Job Loop overview states first-check access, private record reuse, selected employer feeds, ten pilot seats/shared allowance, unavailable broad paid search and mailbox access, disabled checkout and manual user submission. Private-loop CTA reached sign-in; no private account flow was exercised.

## Material findings and bounded acceptance

### PM-01 · P2 — Negation about direct reports overrides positive stakeholder reporting

**Browser and isolated source evidence (B04, S01).** For “Produce stakeholder reports using Excel.”, the interface selects this negative line first:

> Assisted the project manager with schedules; did not manage the project budget or direct reports.

It then shows the actual positive line:

> Prepared quarterly stakeholder reports using Excel.

The status is **Needs manual review**, with the explanation that the CV explicitly describes missing experience about this requirement. “Direct reports” concerns supervising people; it does not negate producing stakeholder reports. The error recurs for reporting in the second MBA vacancy and also pollutes an interviews/projects finding. This adds review burden and hides a useful transferable strength.

Minimal source probe, performed without editing runtime code:

```text
CV:
Prepared quarterly stakeholder reports using Excel.
Assisted the project manager with schedules; did not manage the project budget or direct reports.

Vacancy:
Produce stakeholder reports using Excel.
Manage market research projects and own the project budget.
```

Positive line alone returns `direct`; adding the unrelated negative returns `review` for the same first requirement. Relevant source: `src/lib/cv-evidence.ts` aliases/anchor matching and `uncertainFor`/conflict handling, around lines 91, 335–344, 363–370, 396–403.

**Bounded acceptance:** reporting remains a positive/direct wording finding with both lines present. Actual “no reporting experience” still triggers review. Budget/team-management negatives, SQL absence, project context and forecasts stay conservative. The negative source wording must remain visible and intact.

### PM-02 · P3 — Searching “confidential” omits source-removal help

**Browser (B08).** On `/help`, enter `confidential`. Four matches appear, but **Remove selected source lines before reusing your CV** is missing. Its contextual link works; the search omission makes it harder to discover before the applicant already knows the feature.

**Bounded acceptance:** the confidential query includes the dedicated source-removal topic and relevant privacy help. Exact source/remove search and contextual anchor navigation continue working.

### PM-03 · P3 — “Verified experience” implies more than user confirmation

**Browser/source (B10).** The Job Loop “Busy professionals” card says “Reuse verified experience”. Elsewhere the product correctly states that claims are not independently verified. Source: `src/pages/JobLoopOverview.tsx:22`.

**Bounded acceptance:** use language consistent with user-reviewed or confirmed experience, without implying independent career-history or credential verification.

## Delivery and test boundaries

**Files received, not merely requested (B06, B13; F01).** MBA TXT 630 bytes, PDF 58,745 bytes, DOCX 10,042 bytes. Professional TXT 504 bytes, DOCX 9,977 bytes, evidence report 4,078 bytes. Exact local paths, timestamps and SHA-256 hashes are in JSON. DOCX XML paragraphs reconstructed to text exactly matched the corresponding TXT for both personas; qualifiers remained and neither confidential canary appeared. Professional evidence report was separately labelled and excluded COBALT-PINE.

**PDF visual review remains unverified (L01).** A current preview and page count were generated. The embedded viewer was blank. Clicking its visible exact-PDF new-tab fallback was blocked by browser security policy. No workaround was attempted. Received MBA PDF bytes and a page-count signal do not prove visual layout, glyph correctness or page-by-page rendering. Professional PDF was not downloaded.

**Existing tests (T01).** Five targeted files passed, **119 tests**, exit 0, 11.01 seconds: CV evidence, context regression, guest CV journey, help and walkthroughs. These are automated source/test evidence, not browser observations. They currently miss PM-01’s minimal case.

**Supplied private runtime evidence (P01), not independently tested here.** Parent reports prior 75 fictional rules-only hosted checks covering owner isolation/uploads/approved bytes/schedule/withdrawal; current nine public support HTTP checks; and native SQL checks for service-only/RLS/retention/owner-explicit reads/CAS. Parent reports no paid calls or sends. Raw receipts were not inspected by this auditor. This supplied summary does not upgrade guest browser evidence into private-runtime validation.

No authenticated private record, cloud run, scheduler, mailbox, feed, account isolation or deletion was exercised here. No mobile, full keyboard-only, screen reader, real application or production deployment was tested. Local-only UI statements and comparison source were reviewed; exhaustive network/telemetry verification was not performed.

## Bounded decision

Both personas completed guest preparation, truthful wording review/approval, actual text/Word delivery, source reuse and undo without signing in. The confidential-source paths tested did not reintroduce excluded lines. PM-01 needs correction for useful MBA evidence precision. The guest flow is usable with the stated PDF viewer boundary; this report does not accept or certify the private cloud workflow.

