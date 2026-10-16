# Saved-check to Loop: control and client contract

15 October 2026. **Tested source only; public v30 is unchanged.** This continues the SQL foundation in [ASSESSMENT.md](ASSESSMENT.md). The migration remains unapplied, no control handler has been deployed, and no visible interface calls the new action. This is not a completed customer journey or a new product score.

## Implemented

- Added the strict `link_saved_check` request across browser validation, generation binding, server validation, the control runtime and the repository RPC. The server derives the owner from authenticated authority. Explicit consent and the original displayed generation are required; callers cannot supply ownership or provenance fields.
- The repository calls the existing atomic SQL routine, validates its exact returned identity, and the control runtime reads a fresh snapshot in the original generation. A missing, contradictory or changed relationship fails closed. It does not initialize a record, save a profile, approve facts, prepare documents or call a paid provider.
- The browser retains the exact saved-check ID and request contents across asynchronous authentication. Sign-out/account changes, including an A-to-B-to-A transition, invalidate the request or its result. An ambiguous retry uses the same saved-check identity; the server returns current progress without overwriting it.
- Opportunity response schemas now preserve `sourceCheckId`. Ordinary manual URL deduplication excludes linked opportunities, protecting their source relationship. No historical records are merged by employer, title or URL.
- A new regression demonstrated that JavaScript trim and PostgreSQL's default ASCII trim disagreed on Unicode whitespace surrounding source text. The SQL exact-source comparison now uses the explicit ECMAScript whitespace set; internal wording remains exact. The regression failed before the correction and passed afterward.

## Verification

| Evidence | Result | Scope |
| --- | --- | --- |
| Complete Vitest suite | 1,486 tests in 101 files passed | Local code, component and SQL fixtures; not hosted users |
| New contract regressions | 18 runtime/repository + 25 browser API cases | Included in the full-suite total |
| Saved-check SQL suite | 31 cases passed | Includes the new Unicode regression; included above |
| Actual Deno handlers | 15 source cases and 15 generated-bundle cases passed | Mocked Supabase HTTP transport, no production data or paid calls |
| Native PostgreSQL 17.11 | Six concurrency groups passed | Separate connections and observed lock blocking; synthetic auth/Storage fixtures |
| TypeScript and production build | Passed | 38 public pages, 20 guides, zero prerender external requests |
| Hosting verification | 12 groups passed | Local built worker; no new live-site checks or publication |

The current native receipt is [check-loop-native-contract.json](check-loop-native-contract.json). The earlier foundation receipt remains historical because the migration changed for Unicode trimming. The earlier five legacy tracker native groups were not rerun in this step; the source comparison change is covered by the new six-group run. Its disposable cluster stopped, and no PostgreSQL process remained at verification. The compact [verification receipt](contract-verification.json) records test counts and source hashes. Detailed outputs remain in the private sibling evidence folder under `check-loop-contract-*`.

Generated control, worker and OAuth bundles were refreshed locally. **None were deployed.** Production remains control15/worker11/OAuth5, with no new GC configuration query or changes to its disabled gate. A local bundle manifest is not deployed-source parity.

## Still required before exposure

1. Preserve the pending imported check ID and exact vacancy fingerprint in owner/auth/generation-bound draft, save, undo and recovery state. Saving the CV must not discard the vacancy relationship. Recovery requires fresh consent.
2. Add the deliberate UI action. Changed role/company/description must offer restoring the original vacancy or saving a separate vacancy; it must not silently misattribute the source. Delayed results must not clear a newer draft.
3. Group Applications by the exact persisted check relationship and lifetime while preserving independent progress, each source action, absent/failed sources and contradictory-link states.
4. Add component tests and observe created-record first and second application journeys on desktop and mobile. The current contract tests do not establish that a customer can finish these tasks.
5. Obtain independent review, then coordinate migration/control publication, native readback, site publication and hosted acceptance. Existing review agents remain unavailable under the known account usage limit; no new independent sign-off is claimed. No paid-call workaround was used.

Gates 1 and 2 of the foundation report are implemented in source; gates 3–8 remain open, and gate 4 has only its server/client contract covered. The prior rollback tag and saved v30 remain intact. No production schema, candidate records, billing configuration or site artifact was changed. Selected-vacancy preparation, application-specific composition and grouped review remain subsequent work; this action must not be described as preparing only the selected job.
