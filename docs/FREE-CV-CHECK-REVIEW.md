# Independent review of the free CV check

Reviewed 11 October 2026 in the `jobvance-independent` source tree. This review covers the public six-step `/check` flow, its deterministic comparison, optional account snapshots, approval binding, local exports, and sign-in handoff. All reviewer-authored fixtures are fictional. No personal CV examples were inspected, no employer was contacted, and this reviewer made no deployment or live authentication request.

**Result:** the reproduced issues below have been corrected and the independent 75-test suite passes. No remaining release blocker was established within this bounded source review. This is suitable for the root agent's release verification of a free beta; it is not certification of security, employer eligibility, document interpretation, or hiring outcomes. Payments remain outside this flow and must remain disabled under the current owner constraints.

## Boundaries checked

| Boundary | Observed behavior and evidence |
| --- | --- |
| Guest privacy | File extraction and comparison run locally. The uploaded file is used only for extraction; the user corrects/redacts the source preview. There is no original-file upload in this check. Guest analysis/download does not call the account snapshot or pack-credit APIs. [File handling and corrected source](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/pages/CvCheck.tsx:125>). |
| Truthful evidence | Findings quote actual CV and vacancy spans with UTF-16 offsets and one-based CV lines. The engine exposes counts, not a universal ATS score. The interface says direct wording is not a qualification verdict, verified claim, or outcome prediction. [Finding disclosure](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/pages/CvCheck.tsx:61>). |
| User additions | Optional examples require an explicit accuracy/right-to-use/privacy checkbox and append only to the reviewed CV. The corrected source remains separate. Old Step 5 findings are labelled as preceding the latest edits, and continuing recalculates them. [Addition and regeneration](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/pages/CvCheck.tsx:147>). |
| Approval | Approval is tied to exact role, company, corrected source, reviewed CV, vacancy, and method version. Editing invalidates it. Saved or restored text starts unapproved and is reanalyzed. [Review key](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/lib/check-draft.ts:20>), [approval and reopened snapshots](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/pages/CvCheck.tsx:158>). |
| Export | The exported CV uses approved reviewed text. Gaps/questions remain in a separate evidence report and are not inserted into the CV. Quote labels distinguish user assertions from independent verification. [Export boundary](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/lib/free-check-export.ts:1>). |
| Explicit account storage | Saving requires sign-in, current approval, and a separate save checkbox. The exact corrected source, final CV, and vacancy payload is visible before saving. Snapshots are immutable and request IDs reconcile a lost response without overwriting another review. [Save UI](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/pages/CvCheck.tsx:225>), [save reconciliation](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/lib/free-check-api.ts:84>). |
| Account isolation | Client calls check the authenticated owner before and after owner-filtered requests. UI async results also check owner/revision/mount state. Database RLS permits only owner reads/inserts/deletes; clients cannot update text, owner, status, or server timestamps in place. [Owner check](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/lib/free-check-api.ts:59>), [RLS and column grants](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/supabase/migrations/20261011000000_free_cv_checks.sql:22>). |
| Authentication handoff | Embedded email sign-in and password reset keep the page mounted. Google is gated by specific consent to retain the draft in this tab. Only `/check` is an accepted stored return path; every other value falls back to `/dashboard`. Retention restores inputs, never approval or identity. [Retention contract](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/lib/check-draft.ts:25>). |
| Employer action | The optional tracker action stores a vacancy as Saved. Users apply/send separately. No automatic employer submission, Google inbox access, LinkedIn crawling, or ad event was found in the reviewed check path. [Tracker action](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/pages/CvCheck.tsx:185>). |

## Reproduced findings and fixes

| Finding | Why it mattered | Final disposition |
| --- | --- | --- |
| Bare `No AWS`, `No CPA`, `learning AWS`, and `CPA candidate` could receive direct labels. | Negative or unfinished assertions could be presented too strongly. | The engine now retains these as manual review, including conflicting positive/negative passages. Independently tested. |
| `Prepared reports for the finance leadership team` matched leading that team. | An audience noun was confused with the candidate's own action. | Leading/managing/supervising require actual corresponding verbs, with support/assistance guards. Independently tested for leadership and management. |
| `Assisted the supervisor who managed the finance team` could establish direct management. | Supporting another person's work was promoted into ownership. | Assistance now prevents a direct management/supervision label. Independently tested for management. |
| PMP syllabus use or a master thesis could count as holding/completing the credential. | Study materials and artifacts do not establish an awarded credential. | Study artifacts force review; credential assertions outside credential/education sections are more conservative. Independently tested. |
| An unmarked line containing `2024` allowed the preceding bullet block to reorder. | Moving the last bullet could detach its qualifier and change the meaning. | Unmarked continuation lines make the block ineligible for ranking regardless of a year. Independently tested. |
| SQL field limits applied only after trimming. | A long whitespace suffix could bypass the raw storage-size cap. | Raw database and API upper bounds now precede trimming. Source rechecked; persistence owner supplied the associated Postgres regression. |
| An unknown oversized browser envelope was accepted if its known fields were short. | The retained-cache parser could accept unrelated unbounded content. | Raw envelope is bounded before parsing. Independent oversized-envelope test passes. |
| Destructive retained-draft reads occurred during React state initialization. | A replayed or abandoned render could consume the only copy before commit. | Initialization now peeks without mutation; committed mount clears the copy. Independent replay/peek test passes. |
| Embedded password reset navigated away from unsaved work; callback errors offered only the general sign-in page. | A user could lose a guest check or miss the retained return route. | Reset is inline, and callback errors offer the safe check return when its marker exists. Ten independent mocked auth tests pass. |
| Retention copy implied physical erasure after 30 minutes. | Expiry limits restoration, but cancelled sign-in can leave bytes in tab storage longer. | Consent/privacy copy now separates restore eligibility from clearing on return/clear/tab closure and warns about same-tab access. |
| Delete completion did not recheck the current owner. | Stale results could be acknowledged after switching accounts. | The API now revalidates owner after the delete response; the UI discards stale results. Source rechecked. |

## Independent verification

The reviewer executed:

```text
npm run test:run -- --config src/__tests__/adversarial/vitest.review.config.ts
75 tests passed across 3 files
npm run typecheck
Passed
ESLint on all four reviewer-owned test/config files
Passed
```

The 75 cases comprise 40 draft/privacy/approval-key tests, 10 mocked email/Google callback handoff tests, and 25 independent evidence/integrity cases. They check substring boundaries, negation/pending/conflicts, assistance/audience/credential artifacts, duration non-inference, independent-passage non-pooling, exact quote provenance with emoji and CRLF, manual review of unsupported scripts/numeric constraints, preserved overflow clauses, stale quote-map rejection, prompt-like vacancy text, and unchanged semantic qualifiers during reordering.

Test files: [draft boundaries](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/__tests__/lib/check-draft.test.ts>), [auth handoff](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/__tests__/auth/check-auth-handoff.test.tsx>), [adversarial evidence](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/__tests__/adversarial/free-cv-evidence.adversarial.test.ts>), [isolated configuration](<C:/Users/user/OneDrive/Documents/Projects/Job CV linkedin/jobvance-independent/src/__tests__/adversarial/vitest.review.config.ts>).

The normal restricted Windows React/SWC runner encountered a native cache-permissions problem before tests. The isolated runner avoids that plugin. The final mocked-auth run used the permitted local process context outside the filesystem sandbox; it performed no live auth or Google calls. This is an execution-environment distinction, not evidence of an application defect.

The persistence/export owner separately reports passing 18 API/export/embedded-Postgres tests, including actual RLS, column privileges, uniqueness, limits and PDF/DOCX round trips. Those were source-reviewed here, but their results are attributed to that owner. Root reports hosted verification of 19 groups/22 requests with two synthetic accounts, two snapshots, eight rejected writes, zero deletes and no quota consumption (fixture tag `86d198f2e11b1df5`); root owns that run and its separate record. This reviewer does not infer browser or real Google success from mocked/API tests.

## Remaining limits and release handoff

The comparison is an English heuristic with a limited vocabulary and grammatical coverage. Exact words can describe someone else's work, an unusual condition, or an assertion the user cannot substantiate. Both false positives and false negatives remain possible. A direct label is only a wording finding; keep the existing full-vacancy/manual-review disclosure and never turn the counts into an employer ATS, eligibility, or interview-likelihood percentage.

At most 40 clauses are compared; headings, non-requirement sections and overflow remain visible for manual reading. The check does not verify licensing, degrees, employment history or employer interpretations, and it does not infer years by adding employment dates. Scanned PDFs need readable text, and extracted text must be corrected. PDF font coverage and actual downloads remain browser-dependent, with DOCX/TXT available when PDF export cannot represent text.

Unsaved refresh/closure intentionally loses memory-only work. Specifically consented OAuth tab storage is accessible to someone using that tab; restore eligibility is 30 minutes, not a promise of scheduled erasure. Optional account data has separate deletion controls, which do not remove downloaded copies. Privileged database administration and provider backups are outside the owner-RLS boundary.

Before publication root should finish its browser guest journey, mobile layout, real TXT/PDF/DOCX downloads, optional-save/reopen and account-switch checks, and confirm the additive migration is active with production grants. Do not substitute this local review for those deployment checks. This reviewer has frozen the owned review/test files for packaging.
