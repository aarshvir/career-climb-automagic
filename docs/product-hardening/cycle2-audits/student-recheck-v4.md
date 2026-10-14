# Student audit — targeted v4 recheck

The three exact scenarios from the independent student audit are **resolved in the observed browser recheck**. The original student.md/student.json and their **83.5/100** score are unchanged. This is a bounded fix verification, not a new score or full regression audit.

- Started: 2026-10-14T03:50:56Z.
- Browser observations and final source-hash check ended: 2026-10-14T03:53:41Z.
- Actual UI: http://127.0.0.1:8383.
- Reviewer-created Chrome tab: 1385099322. The current tool session identified Chrome as browser 1. No other tab was operated and no browser-wide viewport was changed.
- Only the original fictional student source/vacancies and one additional fictional chart sentence were entered. No account sign-in, saved candidate reading, service write, live support, email or paid model call.
- No runtime edits, commits, deployments or test runs by this reviewer.
- Source hashes matched at the start, mid-check and end. No drift observed.

| Check | Browser result | Status |
|---|---|---|
| S1: exact academic passage versus explicit professional Power BI experience | Related passage — review needed; Project / academic evidence label; explicit limitation that this does not establish professional employment experience | Pass for exact fixture |
| S2: original team-only overlap versus chart-creation requirement | No passage found; coding-club workshop passage no longer presented as support | Pass for exact fixture |
| Positive countercase: specific chart-creation passage | Direct wording found with the exact chart sentence, academic label and professional-experience limitation | Pass |
| S3: student check → Help → generic /check | University student guidance and current review text restored | Pass |
| S3: opted-in refresh at generic /check | Guidance, fictional CV and vacancy restored; recovery remained on | Pass |
| S3: Clear & start again → Clear current check | Returned to blank role/company at step 1, student guidance absent and recovery consent off | Pass |

## Exact browser observations

### S1

Re-entered the original fifteen-line source and boundary vacancy C from the immutable [initial report](student.md). The requirement remained:

> Professional experience creating Power BI dashboards is required.

The quoted source remained:

> Created a Power BI dashboard for the class project and presented findings to four classmates. This was academic work, not professional employment.

The UI now labelled this **Related passage — review needed**, showed **Line 7 · From your reviewed source CV · Project / academic evidence**, and explained:

> The related source includes academic, project or volunteer work. It does not establish the professional employment experience requested. Keep its context visible.

The two-clause fixture now had zero direct findings and two related findings. The independent Excel-summary clause also became related because its source describes assistance; this was observed, not separately graded.

[Corrected academic finding screenshot](evidence/student-v4-professional-academic.jpg).

### S2 and positive countercase

Used the same sanitized source plus original added methods-project example (915 characters), with exact vacancy B from the initial report. The requirement **Create charts for a small research team.** now displayed **No passage found**, without citing the workshop/team passage.

Then appended only this fictional countercase:

```text
ACADEMIC PROJECT
Created charts for a small research team using simulated survey data in a university project.
```

Rechecked the unchanged vacancy B. The chart requirement became **Direct wording found**, cited the exact new sentence at line 19, labelled it **Project / academic evidence**, and retained the explanation that it does not establish professional employment experience. This shows the generic-team fix did not suppress the specific chart evidence in this case.

### S3

From the review step of the student-selected check:

1. Opened header Help.
2. Returned through header Free CV check, whose observed link was /check without an audience query.
3. Verified **University student** guidance and the current fictional CV returned at Your review.
4. Opened Draft recovery and checked **Keep my draft in this tab across refresh**.
5. Refreshed generic /check. Verified **University student** guidance remained, current text returned and refresh recovery was on.
6. Chose Clear & start again, then Clear current check. Verified step 1, blank role/company, no student guidance and the default recovery-off wording.

[Recovered audience screenshot](evidence/student-v4-recovered-audience.jpg).

## Source identity and limits

| File | SHA-256 at start and end |
|---|---|
| src/lib/cv-evidence.ts | C1D09F00F9BC452C09ABC51938B3F3C2C879981DB10E8482FDB5C0AD4B337884 |
| src/pages/CvCheck.tsx | 21CC4035208CE26238ED13A5C4850EA45EAC2AA5A48C575D3B1F263970D701E8 |
| src/lib/check-draft.ts | 0533755A60B0EB3D7759BF8DC1575709BA4981510A626E7951137733C1AE2789 |

Secondary source checks corroborated english-literal-evidence-v4, coursework/class heading context, explicit professional-experience limitation, and recovered audience state. Browser observations above establish the reported outcomes.

This recheck does not establish every possible heading, wording, account-owner transition, expiry or storage-denial case. Cross-account behavior was not tested because sign-in was outside this audit. Downloaded files, valid document extraction, mobile accessibility, narration/caption playback and cloud actions were not retested. Initial audit limitations and grades remain unchanged.

