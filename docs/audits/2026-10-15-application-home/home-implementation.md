# Shared Applications home implementation

15 October 2026. Bounded frontend implementation against the v28 baseline. No deployment, production account access, paid calls, record migration or production writes were performed by this agent.

## Implemented boundary

- `src/pages/ApplicationsHome.tsx:25` and `:32` independently read owner-filtered packs and tracking rows, checking authenticated ownership before and after each read. They do not depend on CV file reads, billing/entitlements, or `loadWorkspace`.
- `src/pages/ApplicationsHome.tsx:39` reads saved checks through the existing owner-verified API and calls only Loop `get_existing`. Absent, erasing, active with a valid generation, and unavailable are distinct states. Visiting the home does not call enroll/open/run.
- `src/pages/ApplicationsHome.tsx:55` scopes data/results to confirmed account and auth authority. Per-source sequence guards suppress stale refreshes and A→B→A results. Unknown authentication hides private details. A confirmed lifetime change resets selection.
- `src/lib/application-home.ts:45` projects actual source records without title/company/URL deduplication. Checks remain separate; all real `pack_id`-linked trackers stay with their pack; manual and unresolved-link trackers remain present. Loop packet attempts join only their actual `opportunityId` and current lifecycle generation.
- `src/pages/ApplicationsHome.tsx:115` shows the selected vacancy, exact stored document texts, notes, reported status and dates. Original inputs are expandable and clearly labelled. Primary actions reopen only that exact source record. The home neither grants download approval nor copies fields into a working draft.
- Exact deleted/missing selections never substitute another role. Source failures preserve other sources and selected-source failures offer retry. Authoritative removal clears old detail and its continuation. A tracker that becomes grouped when its real pack finishes loading offers that precise linked pack.
- Deliberately choosing a list item focuses and scrolls to its exact detail. Initial loading, background results and refreshes do not move focus or scroll. This makes the mobile list/detail sequence discoverable without automatic first-item selection.
- Loop output labels distinguish revoked, held, source changes, review required and format checks; historical approval alone is insufficient for a ready label. The UI explicitly says outputs are recent loaded attempts and directs fresh source validation to Job Loop.

## Validation

Local created records only, no HTTP services or candidate data:

- `src/__tests__/lib/application-home.test.ts`: **9 passed**. Distinct source identities, exact joins/multiple attempts, current source/format gates, foreign-owner suppression, strict IDs and URLs, dates and canonical local selection.
- `src/__tests__/applications-home.test.tsx`: **16 passed**. Actual mixed-source list/detail and source links; independent failure; selected-source unavailable versus deleted; authoritative deletion; erasing and missing generation; new Loop lifetime; stale refresh; ambiguous selectors; A→B and A→B→A delayed resolution/rejection; unknown authentication; reader ownership before/after; deliberate detail focus/scroll without initial or refresh scrolling.
- Application TypeScript check: **passed**.
- Independent reviewer added `src/__tests__/applications-home-independent.test.tsx`: **6 passed**, as reported by that reviewer; final combined coordinator validation remains separate.
- An ignored actual-component browser fixture is prepared at `.tmp/applications-home-browser/vite.config.mjs` for `127.0.0.1:8082`. It aliases every service/auth reader to created in-memory examples. Preparing this fixture is not evidence that browser checks were performed; the coordinator owns those checks.

## Limits and next boundary

This release adapts existing stores; it does not create a new canonical application database or invent old check→tracker associations. Check and pack readers currently load existing full text. A metadata/detail API and pagination are still needed before substantial scale. Loop returns a bounded recent packet/run window; no loaded output is not proof that the vacancy was never prepared. Existing source flows remain authoritative for approval, download, edits and status attestation. Destination selection/auth/routing/backend tests and live publication are owned by the coordinator and other agents.

Runtime frozen after the 25 owned tests plus 6 independent tests (31 combined) passed; uppercase accepted home UUID selection is normalized to lowercase. No Git commit or deployment was made by this agent.
