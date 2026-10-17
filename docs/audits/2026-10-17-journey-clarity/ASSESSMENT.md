# Job Loop journey continuity and product clarity

17 October 2026. Bounded repair of the owner-reported confusing return from interrupted setup to the older CV workspace.

## Delivered behavior

- Bare dashboard and ordinary sign-in/reset returns open Job Loop. Explicit CV tabs, exact application links and billing returns retain their destinations.
- The product chooser distinguishes Job Loop (scheduled job discovery and tailored CVs) from CV Check (one job already found).
- An empty Job Loop has one setup destination and an optional direct route without questions. Interrupted guided setup shows Resume setup and its current step, rather than an unrelated upload-first workspace.
- Setup answers, typed role/location queries and guided builder answers survive same-tab route navigation for 30 minutes. A fresh passive account/lifecycle read precedes recovery. Refresh, closing the tab, sign-out or a new login session clears this memory. No browser storage or automatic account save is introduced.
- Permission checkboxes, model permission, snapshots and versions are never restored. Private saving still needs fresh explicit consent. Saved server profiles take precedence.
- The older document workspace retains all saved work and is labelled CV documents, with Saved CVs, Review & download, Application tracker and Plan & allowance, plus a prominent Back to Job Loop link.

## Independent review and corrections

Two separate agent contexts contributed routing/workspace implementation and bounded independent acceptance review. Review reproduced a stale absent-record draft rebinding to a later erasure generation. Root added a captured lifecycle guard; the failing regression now passes. Only a first empty-record transition from unknown to generation zero may carry an absent-record draft. Later generations revoke it.

## Verification

Final full suite: 2,639 tests in 146 files passed. App TypeScript passed. Separate routing coverage: 170 tests; onboarding/memory/auth review: 43 tests; dashboard and existing Loop journey coverage: 67 tests (overlapping full suite).

Actual isolated browser: desktop entered a broad director role and uncommitted United States location, left for Job Loop, saw Resume setup at Locations and restored both; mobile entered Graduate analyst, left and restored the pending role at Roles. Mobile viewport 390x844/document width 375. These screens execute actual components with synthetic auth/persistence adapters; they are not hosted writes or unassisted-user evidence. No provider call or candidate mutation was performed.

Initial full run caught old empty-dashboard CTA expectations and the lifecycle regression during concurrent review. Correct selectors were updated to the intended new direct setup action; existing behavioral assertions remain. Final integrated suite passed.

Build/hosting/publication and exact live receipt are recorded separately in the release receipt. Backend, payments, schedules, provider consent and advertising settings are unchanged. This repair does not prove all usability gaps resolved or establish NPS.

## Publication

Public v41, source d1ff52897ff4267ea9fb2595bae9aaaa2d78879a, succeeded 17 October 16:21 UTC. Full production build and 12 hosting groups passed. Four live routes reference the current entry; entry plus five changed JavaScript bundles matched exact built bytes. Live signed-in Chrome confirmed bare dashboard redirects to Job Loop and a temporary unsaved director-role/location draft resumes at Locations with United States still in its search field. No final Save or provider action was used. The temporary browser tab was closed afterward. These are assisted navigation checks, not unassisted product acceptance.

## Final panel identity correction

Cleanup of the preview server exposed an existing React duplicate-key warning in adjacent variant-preparation and saved-check-import panels. A new actual-dashboard regression reproduced the warning before the fix. Distinct selected/variant/saved-check prefixes now retain the same owner, authentication authority and lifecycle values while separating sibling identities. All 68 focused dashboard/onboarding/Loop journey tests passed afterward. This bounded follow-on is published with a separate receipt; the 2,639 full-suite count above belongs to the preceding integrated v41 runtime, not a new full-suite run after these three key changes.
