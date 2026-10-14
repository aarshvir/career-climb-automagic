# Cycle 2 independent reliability and privacy review

The frozen candidate has a usable guest application workflow and strong explicit approval, storage and owner boundaries. Two material reliability issues were found: an unbounded wait before private document transfer, and schedule-cancellation guidance that contradicts the server. No P0 or P1 issue was established in this review. The first issue has a separately verified follow-up fix below; the initial scores are unchanged.

## Version and independence

- Reviewer: independent reliability/privacy reviewer; no previous or peer audit, score or target was read.
- Repository: `jobvance-independent`; HEAD `9682cd1bbf776be6d2e74b023766fcd4c9056022`, with an existing dirty working tree.
- Exact initial source freeze: **2026-10-14T03:40:42.8209165Z**.
- Frozen source SHA-256: **1177af0aeab25cc5f8765a0e3ab01c3595a470b2a0a8054d4b174323ddf89fe7** over 397 sorted `relative-path<TAB>sha256` entries joined with LF and no final LF. Scope: `src`, `supabase/functions`, `supabase/migrations`, `supabase/tests`, `scripts`, package files and `docs/supabase-loop-ui`. Manifest: [reliability-privacy-source-manifest.tsv](./reliability-privacy-source-manifest.tsv). A private local source snapshot was retained for frozen-code inspection.
- Browser target: `http://127.0.0.1:8383`, isolated unauthenticated Codex IAB tab. No viewport override was made.
- First drift detected at **2026-10-14T03:44:23.3422475Z** in `check-draft.ts`, `CvCheck.tsx`, `HelpCenter.tsx` and `JobLoopOverview.tsx`. Source observations and initial grades below concern the frozen snapshot. A full preview reload interrupted reuse inspection and cleared the non-consented fictional draft; this is recorded as an environment interruption, not a product defect.
- Final comparison capture: **2026-10-14T03:48:02.9452650Z**. Hash over the same 397 current paths: `bdc17e5e9fcd1734a6366b7a119bec41e830210f66fbcdc1f3d5d0a14b24b33f`. Eleven changed paths are enumerated in the JSON. Later source changes are outside that capture.

## Initial assessment — ten equal dimensions

Each dimension has 10% weight; scores are reviewer judgments, not measured conversion or hiring outcomes. Arithmetic mean: **89.0 / 100**.

| Dimension | Score | Reason |
|---|---:|---|
| Clarity | 90 | Clear role/CV/vacancy/review sequence, with separate approval, saving and applying language. Cancellation guidance is inconsistent. |
| Activation | 92 | Guest can reach an approved real download without signup or payment. |
| Form effort | 86 | Six explicit stages and substantial review content; optional sections are disclosed, and subsequent checks use four stages. |
| Evidence quality | 88 | Literal supporting passages, source lines, academic context, review questions and qualification limitations are visible. This is wording analysis requiring user judgment. |
| Workflow completeness | 91 | Source intake, comparison, edits, exclusion preview, approval, export, optional save and reuse are connected. Private operations were assessed through code/tests and supplied cloud evidence. |
| Reuse / time saving | 91 | Approved final wording is the default reuse source; new vacancy inputs and approval are separate; explicit source adoption and undo exist. |
| Help / walkthroughs | 87 | Detailed task and recovery instructions are accessible without an account. Schedule cancellation contains a material factual mismatch. |
| UI / accessibility | 86 | Named fields, disclosure controls, focus movement and status/error text are present. No full screen-reader, mobile or assistive-technology certification was performed. |
| Trust / privacy | 94 | Local guest checking, explicit temporary storage and account saving, source-line review, strict owner/admin controls, private support bearer receipts and content-minimizing staff lists. |
| Reliability | 85 | Recovery, idempotency, CAS, leases, bounded streaming and lifecycle cancellation are well covered. Pre-link waiting and cancellation semantics need the findings below. |

## Material findings at the freeze

### RP-01 — P2 — The document deadline excludes authentication and signed-link preparation

**Evidence:** frozen `src/lib/job-loop-api.ts:198` awaits `callJobLoop` before installing the 45-second timer at line 202. `callJobLoop` awaits session lookup, `auth.getUser` and the function invocation, without a deadline. The installed `@supabase/functions-js` client uses an ordinary fetch with no built-in deadline. Existing transfer tests cover stalled headers/body, actual stream limits, cancellation and fresh-link retry, but not this prerequisite wait.

**Reproduction:** in the existing `job-loop-api.test.ts` harness, leave any one of `sdk.session`, `sdk.getUser` or `sdk.invoke` unresolved; call `getLoopDownload` or `getLoopPreview` with a live owner and advance fake time beyond 45 seconds. The frozen promise remains pending because the timer has not been installed. This reproduction was established by code inspection; no private browser session or network fault injection was performed against the service.

**Impact:** the preview/download remains busy indefinitely during an authentication or control-service stall. Owner change or unmount still cancels the attempt, but staying on the page provides no bounded error or straightforward retry.

**Acceptance:** begin the overall artifact deadline before prerequisite awaits, race every phase including final owner verification, clean timers/subscriptions on settlement, and ignore a late signed link. Test stalled session/getUser/invoke, late-link suppression, a successful fresh retry, and the existing stream and owner/unmount/approval cancellation cases.

### RP-02 — P2 — Cancel schedule can cancel current work despite contrary guidance

**Evidence:** frozen `src/pages/HelpCenter.tsx:151` says “Cancel schedule does not cancel an already running job”. `JobLoopPanels.tsx:74` gives a matching completion notice. Related distinctions appear in `src/lib/walkthroughs.ts:67`, `ProductPage.tsx:177` and `src/lib/career-guides.ts:591–593`. In contrast, `supabase/migrations/20261011030000_job_loop_recurring.sql:80–81` cancels `last_run_id` when its status is either `queued` or `running`, clears its lease, and marks it finished. The executed recurring SQL test already confirms cancellation of the queued scheduled run.

**Reproduction:** create a due schedule, claim its occurrence, start its scheduled run so the schedule has `last_run_id`, then set that run to `running`. Call `job_loop_schedule_action(user, expectedVersion, 'cancelled')`. The current run becomes `cancelled`; a subsequent commit with its old lease is rejected. This running-state extension is a reproducible acceptance recipe, not a claimed private-browser action.

**Impact:** someone following the help to stop future recurrence can unintentionally stop an active preparation. The completion notice does not explain that this happened. This is a recovery and informed-control problem, rather than an authorization bypass.

**Acceptance:** make the chosen semantics consistent across the workspace notice, help, walkthrough narration, guide and terms text. If retaining current SQL behavior, state that Pause preserves existing preparation while Cancel stops the last queued/running scheduled preparation, and explain how to inspect/resume retained work. Add a running scheduled-run regression and stale-lease rejection assertion. If only future scheduling is intended, change SQL deliberately and update its tests instead.

## Evidence ledger and boundaries

**Direct browser evidence before drift:** home to six-step check using only fictional Morgan Vale / Fictional Northstar Labs text; numbered source-line exclusion preview for `ORCHID-TEST-ONLY`; apply removed that exact line from both versions; final review and privacy confirmations; actual one-page PDF preview link; approval; real TXT and PDF downloads; fallback prepared-file link; default approved-final reuse into the four-stage new-vacancy setup with empty vacancy inputs and an Undo control. The downloaded TXT was read from the exact browser-returned path and excluded the private marker. SHA-256: `200a748179676c33a5b5fa096caf03d12703ef6dc7426a9622b9c2ec7c08fc2c`. PDF download completed with 59,018 bytes. Embedded PDF visual layout was not independently certified from the blank accessibility frame.

**Post-drift supplementary browser evidence:** an incomplete fictional role survived explicit opt-in refresh recovery; the restored-draft notice appeared; navigation to task help and back retained it. Only this disposable local draft was cleared through the product confirmation, and the reviewer-created tab was closed. This does not expand the frozen browser claim. [Recovery screenshot](./reliability-privacy-recovery.jpg).

**Locally executed existing automated checks:** at 03:42:52 UTC, nine frontend test files passed **234/234** tests, including free-check journey/recovery/reuse/exclusion, support and staff inbox, account bootstrap, free-check API, admin API and private artifact API/lifecycle. Eleven backend files passed **102/102** tests, including real PostgreSQL fixture RLS/CAS/retention/lease/shared-budget/scheduler cases and request-boundary tests. These are automated fixtures and mocks where specified by their source; they are not 336 actual browser or cloud operations. Both completed before the first detected drift.

Reproduction commands:

```text
npm exec -- vitest run src/__tests__/cv-check-journey.test.tsx src/__tests__/lib/check-draft.test.ts src/__tests__/guest-support.test.tsx src/__tests__/lib/guest-support-boundary.test.ts src/__tests__/lib/job-loop-api.test.ts src/__tests__/job-loop-journey.test.tsx src/__tests__/auth/bootstrap.test.ts src/__tests__/lib/free-check-api.test.ts src/__tests__/lib/admin-api.test.ts
npm exec -- vitest run --config supabase/tests/vitest.backend.config.ts supabase/tests/jobvance-guest-support-boundary.test.ts supabase/tests/jobvance-guest-support-migration.test.ts supabase/tests/job-loop-scheduler-ticket.test.ts supabase/tests/job-loop-schedule.test.ts supabase/tests/job-loop-recurring-sql.test.ts supabase/tests/job-loop-replay.test.ts supabase/tests/job-loop-lease.test.ts supabase/tests/job-loop-engine.test.ts supabase/tests/job-loop-cloud-sql.test.ts supabase/tests/job-loop-dispatch-sql.test.ts supabase/tests/jobvance-admin.test.ts
```

**Inspected protections:** approval keys cover all five exact inputs and method; source exclusion preserves retained slices and warns that differently edited passages need manual review; new vacancy and undo clear approval/export assets; recovery has owner/TTL/schema bounds and excludes undo/approval. Private artifacts enforce exact project/bucket/owner destinations, reject redirects, check actual bytes before retaining chunks, cap at 10 MiB, cancel reader/fetch on lifecycle invalidation, and retry with a new link. Anonymous support uses a random 256-bit bearer, stores its hash, avoids URL/storage persistence, validates receipt ID/schema, preserves an uncertain request reference for idempotent retry, and bounds messages. Staff lists omit message/reply/bearer/rate data; opening detail is explicit and audited; update uses expected version; access is rechecked through `auth.getUser` plus active membership. Service-only SQL controls support retention and RPCs. Worker authentication, single-use scheduler tickets, atomic global reservations, uncertain-cost retention, input/version checks and schedule leases fail closed in inspected source/tests. No new runtime code was written by this reviewer.

**Supplied cloud evidence, not independently rerun:** authorized inspection of `../jobvance-repair-evidence/cycle2-guest-support-live.json` found nine reported successful real HTTP checks completed at `2026-10-14T03:28:39.365Z`, with zero paid calls/sends and no persisted secret. Its forged-network-header result is a **403 HTML gateway denial**, not proof that the application trusts or sanitizes that header. Treat the five-per-hour network-identity quota as defense in depth; the SQL global 100-per-day ceiling is authoritative. `docs/INTEGRATED-JOB-LOOP-HOSTED-VALIDATION.json` reports 75 prior real hosted synthetic checks finished `2026-10-13T18:27:16.557Z`, including approved artifact bytes, owner isolation and schedule/withdrawal recovery, with zero funded provider calls, messages or submissions. The coordinator additionally supplied native SQL verification of guest RLS/service-only grants, an active 03:17 UTC retention cron and exactly tagged fictional staff list/detail/CAS checks with own QA rows removed; those statements were not independently rerun here. No private admin, signed-in account or Gmail browser was opened by this reviewer. No paid call, send, outreach, signup, deployment or real-user read/write was performed.

## Separate follow-up verification — RP-01

At **2026-10-14 03:46:54–03:46:56 UTC**, independently inspected the changed `job-loop-api.ts`: its timer is now installed before auth subscription/link issuance and remains live through the final owner fence. The cancel race prevents a late link from starting a transfer; stream byte limits, reader cancellation and cleanup remain intact. Independently reran the entire relevant API test file: **45/45 passed**, including new stalled session/getUser/invoke and late-link/fresh-retry regressions. This supports **RP-01 resolved in the follow-up source**, without changing the initial score. It is not a redeployment or hosted-browser verification.

- Follow-up API SHA-256: `6ec6a5ff0c8624655392707c27449b9a7eae6880b82a67734458c1976d378220`.
- Follow-up API test SHA-256: `1c2d1491439dc0c7ed5aed66b64e664f565173cf142c26374ae042490b80cc9e`.
- RP-02 remains open at the report capture; later repairs require their own verification.

## Separate follow-up verification — RP-02

At **2026-10-14 03:51:16–03:51:39 UTC**, independently checked all five corrected source surfaces: `HelpCenter.tsx:151`, `JobLoopPanels.tsx:74`, `ProductPage.tsx:177`, `career-guides.ts:591–593`, and the optional-controls caption/narration in `walkthroughs.ts:67`. They now consistently explain that Pause stops future recurrence and retains current preparation; Cancel also stops the schedule's latest queued/running job; a separately started manual run has its own cancellation control. The workspace explanation appears before the action as well as in its result notice. This aligns with the existing SQL; no backend behavior change was needed.

Independently reran `supabase/tests/job-loop-recurring-sql.test.ts`: **11/11 passed**, including the two new real PostgreSQL fixture cases for an already running scheduled job. Pause keeps its run lease and permits its phase commit. Cancel clears the run lease and rejects the late phase commit. Both prevent another due occurrence from being claimed. Independently reran the changed help/walkthrough/guide frontend suites: **25/25 passed** across three files. These are local automated checks and source inspection, not private browser or hosted scheduler operations.

This supports **RP-02 resolved in the follow-up runtime copy and SQL tests**. The frozen **89.0/100** assessment and original findings remain unchanged. Corrected narration source was inspected; rendered/released video replacement is being handled separately and was **not verified by this reviewer**. Do not infer that shipped MP4/audio/captions or a deployed website were updated from this addendum.

Reproduction commands:

```text
npm exec -- vitest run --config supabase/tests/vitest.backend.config.ts supabase/tests/job-loop-recurring-sql.test.ts
npm exec -- vitest run src/__tests__/help-center.test.tsx src/__tests__/walkthroughs.test.tsx src/__tests__/career-guides.test.tsx
```

Follow-up SHA-256 values:

| Path | SHA-256 |
|---|---|
| `src/pages/HelpCenter.tsx` | `589b48d21ada86218b7b6011fd191828fce8c46a4bff7e23678580078417001a` |
| `src/pages/JobLoopPanels.tsx` | `db1f29532030db4c5b08cbf076f8c4d2f3e1141bed8d7b1abe652d8b5891add7` |
| `src/pages/ProductPage.tsx` | `0904b81eb2621dc3b4fe94a52886eb0de8b72ea89d84c64ded2ae18d212364b1` |
| `src/lib/career-guides.ts` | `dd6c29a44054e652b1710835ef62551172bbc7f8b575df4240c4fb4a7a819eac` |
| `src/lib/walkthroughs.ts` | `6d308d397ffce0d130666da539e7d6672bf59ee09ac2458cb6036bb883127fd6` |
| `supabase/tests/job-loop-recurring-sql.test.ts` | `8d643bd18df351d42fb9e56d494ece20e29122f40b73d1fd36cc6aa817761420` |
| Unchanged recurring SQL migration | `d1e5fc6d31805e8b3abd28ab1058cb7df00a69aafa2e9622ac31e04d866ce188` |
