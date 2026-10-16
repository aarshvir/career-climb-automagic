# Job Loop product promise and backend review

17 October 2026. Read-only backend review against the v31 merge receipt (`../jobvance-repair-evidence/claude-merge-release-receipt.json`, source `4f261359c8ed29c03705a44fdd1188be13956c30`). Earlier tracker statements that the two Loop migrations are unapplied are historical. No schema, production configuration, quotas, paid calls or billing were changed by this review.

## Product direction

The owner's intended three-panel journey is coherent: **Build or bring your CV → Choose roles, places and frequency → Receive opportunities and prepared CVs on your dashboard.** CV Check is an acquisition entry; the recurring Loop is the primary product. The current implementation supports parts of this journey, but the public promise must distinguish available pilot behavior from the planned paid service.

| Promise | Current evidence | Remaining implementation |
|---|---|---|
| Bring a CV | `src/pages/JobLoop.tsx` `readFile` extracts PDF/DOCX/TXT on-device and saves reviewed source text with separate consent. The original file is not uploaded. | Say “Add your CV” or explain that reviewed text is saved. Do not claim that original files are stored. |
| Build without a CV | The previous Loop no-CV entry routes to CV Check. No prompt-driven Loop builder existed in v31. | The new pure `src/lib/loop-cv-builder.ts` assembles exact answers with headings. It requires name and experience/project or education; root owns the preview/replace/undo UI. It creates no facts or approvals. |
| Find relevant jobs | `job-loop-providers.ts` supports configured Greenhouse/Lever employer feeds, with three defaults (Careem, GoCardless, Duolingo); Tavily needs configured paid search authority. `employer-discovery.ts` performs explicit role/location/experience/pay filtering. | Broader geography/occupation coverage, source health, full-vacancy verification, older retrieval and enough useful results for the promised audience. A configured adapter does not prove that a suitable job exists. No whole-market coverage claim. |
| Prepare CVs per job | Worker selects up to two opportunities. `composePacket` uses approved claims and preserves source attribution. Optional model calls select approved claim IDs and review questions; they do not rewrite CV facts. | Per-application rewriting is a separate capability from Claude's `tailor-for-job`. Reusing that feature needs durable source-bound proposals, review and approval, retry and shared spending controls. Do not silently turn recurring rules runs into paid rewriting. |
| Run automatically | The scheduler already persists occurrences, claims leases, makes stable occurrence request IDs, dispatches a worker and records failures. Local IANA time is supported. | Current `job-loop-runtime.ts` rejects all non-rules schedule providers. Recurring AI needs explicit recurring processing/route consent, revocation and captured route identity. Existing schedules must remain rules-only unless the owner explicitly changes them. |
| Three CV variants | One owner record contains one `LoopProfile.sourceText`; schedules and run snapshots have no chosen variant ID. | Persist owned variant IDs, revisions, labels and exact claim membership. Select the variant for each schedule/run; capture it immutably. Never implement variants by silently swapping the global source and invalidating unrelated approvals. |
| Weekly, three times weekly, daily plans | Cadence is `weekly`, `weekdays` or `daily`; `weekdays` means five days. Existing SQL allows one scheduled run per UTC day and thirty per UTC month; three total runs per UTC day. | Three selected weekdays requires schema/client/control/scheduler validation. Paid entitlements need server enforcement; the daily promise must accommodate 31-day months. No plan enforcement currently follows a pricing-card choice. |
| Dashboard delivery | Saved packets, run history, exact opportunity links and source states exist. | Actual first/second worker-to-browser receipt remains an acceptance task. Repository reads currently return recent 30 runs/150 packets; old history needs pagination/exact retrieval. |

## Proposed monthly pricing and economics

Keep the owner's $29 / $59 / $99 ladder as a proposal for validation, with the free ten-account pilot and disabled checkout retained. These are planning assumptions, not active entitlements or a claim that margins have been achieved.

| Proposed plan | Frequency | Maximum scheduled occurrences in a calendar month | Monthly revenue | 30% of revenue available for total variable costs | Ceiling per run if the whole amount went to runs |
|---|---|---:|---:|---:|---:|
| $29 | One selected weekday each week | 5 | $29 | $8.70 | $1.74 |
| $59 | Three distinct selected weekdays each week | 15 | $59 | $17.70 | $1.18 |
| $99 | Every calendar day | 31 | $99 | $29.70 | $0.9581 |

Calculations are deterministic: revenue × (1 − 0.70), divided by maximum monthly occurrences. The run ceilings assume a 70% gross-margin target **before allocating payment fees, storage/hosting, support, CV-builder use or other service costs**. Every such allocation reduces the amount available for AI/search. They are not vendor price estimates, observed costs or net profit. If at most two new CV packets were included per run, the corresponding optimistic ceilings per packet would be $0.87 / $0.59 / about $0.479; a real cost model must also charge discovery, failures, retries, uncertain holds and previously generated packet reuse correctly. No package should advertise unlimited job-specific CVs.

The maximum occurrence counts come from the calendar: a selected weekday appears four or five times; three chosen weekdays can each appear five times in a 31-day month; daily means 28/29/30/31 depending on the month. A fixed “30 per month” daily quota under-delivers in a 31-day month. UTC-day admission limits can also conflict with a local schedule after timezone changes; schedule changes must not create an extra occurrence or charge an already consumed one.

Include up to three saved CV variants and the guided first-CV builder in all proposed paid plans if economics supports it. Distinguish a saved reusable variant from a generated per-job output. State whether a run means a search attempt or a promised number of suitable results; the latter cannot be guaranteed when sources return no relevant vacancies. Before charging, define cancellation/pause, missed occurrences, failures, retry counting, timezone changes, and what the dashboard shows when there are no new matches.

## Safe implementation order

1. Deliver an understandable three-panel entry, guided first-CV draft, preserved existing upload/save/confirmation boundaries, and dashboard next actions. Keep current service scope visible near the action, without filling every panel with operational detail.
2. Prove the actual worker → renderer → exact approval → received PDF/DOCX/TXT path for one application, then a distinct second job. Use created identities/data; no provider charge is needed for the rules path. Record actual downloaded bytes, parsed contents, document pages, source/opportunity identity and second-task reuse.
3. Add a versioned CV-variant contract. Migrate the existing single profile to a default variant without discarding history. Bind selected variant/revision and relevant claims to schedules and immutable run snapshots. Test stale variants, account switch, erasure, unchanged retry, source replacement, three-variant limit and deletion with historical packets.
4. Extend the schedule contract with distinct chosen weekdays and durable occurrence identity, keeping existing schedules compatible. Add native races and DST/month-boundary cases before changing active runtime behavior.
5. Implement server-held plan entitlements and cost accounting only as a coordinated backend change. Keep billing inactive until separately authorized. Enable recurring external processing only after explicit consent captures provider/model/route, source scope and frequency; preserve the $50 shared pilot ledger until the owner changes it.

## Approval/export review and acceptance limits

The main Job Loop download already has owner, generation, selected packet, source hash, current approval and abort checks (`JobLoop.tsx`, `download`). It must not be conflated with the separately identified Applications-home saved-CV async concern. Control approval checks current source hashes and separate facts/disclosure confirmations; downloads require an approved current packet and ready format. Preview obtains the saved PDF before approval. Renderer uses actual bytes, hashes and PDF page counts; PDF failure can leave DOCX/TXT available. These boundaries should be preserved when improving the workflow.

The remaining evidence gap is integration, not the absence of every guard. Existing real-page journey tests mock `callJobLoop`, downloads and browser saving. Worker tests and renderer tests validate their own seams. They do not, by themselves, show that a person received the exact worker-built file from the dashboard. A new combined local harness should retain actual composition/rendering and controller behavior, replacing only auth/database/Storage authority with isolated fixtures. Clearly label that result as local integration; it does not certify hosted Storage, production auth, paid AI output or unassisted customer success.

Acceptance should cover: first CV from answers; upload instead of builder; facts confirmation without fabricated completion; target/location mismatch; no results; source failure vs successful empty results; rules and unavailable AI methods; first preparation; exact preview; approval; each file received and parsed; second vacancy with preserved first progress; source correction invalidating only the intended outputs; delayed responses; navigation/refresh retries; timezone/DST; missing old records; mobile keyboard/layout; unsupported scripts or over-page PDF with honest alternate formats. A 100-profile simulation can expose coverage and policy gaps but must remain labelled synthetic, with no invented participants or automatic quality uplift.

## Files reviewed

- `supabase/functions/_shared/job-loop-types.ts`: single profile, schedule and packet contracts.
- `supabase/functions/_shared/job-loop-runtime.ts`: schedule guards, occurrence dispatch, selection, composition, approval/download.
- `supabase/functions/_shared/job-loop-providers.ts`: provider roles, budgets, two-packet capacity, bounded search and employer adapters.
- `supabase/functions/_shared/job-loop-schedule.ts`: IANA timezone, DST and next occurrence rules.
- `supabase/migrations/20261011030000_job_loop_recurring.sql`: one/day and thirty/month scheduled limits.
- `supabase/functions/_shared/job-loop-render.ts`: byte generation, glyph and page limits.
- `supabase/functions/_shared/job-loop-repository.ts`: source/packet collections and pagination limits.
- `src/pages/JobLoop.tsx`, `JobLoopPanels.tsx`, `JobLoopOverview.tsx`: current setup, schedule, review and export flow.
- `src/lib/subscription-plans.ts`: proposed plans, no paid entitlements.
- `src/lib/employer-discovery.ts`: deterministic role/geography/constraint evidence.

## Builder implementation and independent review evidence

The bounded builder helper and tests were implemented in this review assignment. Eight pure tests cover education-only entry, exact wording/Unicode/uncertainty, empty optional sections, per-field size limits, required factual content, non-mutation and malformed runtime values. Six component tests cover deliberate replacement and exact undo, fresh replacement permission after edits, stale same-batch actions, rejected parent authority and an externally changed source. Four tests mount the actual `JobLoop` component with isolated auth/API fixtures: first source draft through explicit detail review; unfinished answers recovered across route unmount; account switch clearing; and batched answer-change/use rejection. The 18 cases passed together. They make no network/model calls and do not establish hosted persistence or browser file receipt.

Independent inspection found a same-batch answer-change → Preview defect in the initial component: old answers could be tagged with the new local revision. The root implementation added the exact answer fingerprint to preview/current checks. The component regression passes against that correction. This is a concrete local defect fixed during review, not a hypothetical certification of the whole product.

The three-panel dashboard should distinguish an **enabled** schedule from one currently ready to run. A schedule can remain active while facts need reconfirmation or scheduler readiness is unavailable. The backend already rejects invalid preparation; the visible readiness mark must convey the same limitation. This review recommendation was sent to the root implementation owner.
