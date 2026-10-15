# Independent check-tracking backend review

15 October 2026. Reviewer: separately assigned `check_link_home` agent. Read-only review of the backend migration by `check_link_backend`; the reviewer implemented the separate Applications home projection, so its home review below is explicitly self-review. No production mutations or paid calls.

## Result

No blocking defect found in `20261015041519_cv_check_tracking_link.sql` at review time. This is a bounded source/isolated-SQL review, not production acceptance or a product score.

- Source authorization comes from `auth.uid()` and an exact source owner filter, not a caller-supplied owner. The original check has no authenticated UPDATE privilege/policy. The composite `(user_id, cv_check_id)` foreign key also prevents mismatched ownership even for a privileged tracker write. No reparenting cascade was added.
- The RPC takes a source `FOR KEY SHARE` lock before inserting a relationship. Deleting/reparenting the source must wait; concurrent duplicate requests can share that lock and serialize on the unique index. `DO NOTHING` does not overwrite status, notes, dates, title edits or `updated_at`. The separate lookup statement can see a concurrent winner under the normal read-committed isolation level. If a concurrent explicit tracker deletion leaves no row, the function reports retryable `40001` rather than returning a fabricated success. Higher-isolation serialization failure must likewise be retried; no automatic browser replay is asserted.
- The table-level INSERT/UPDATE grants are revoked and replaced with the existing column list excluding `cv_check_id`. A client cannot assign/reassign/detach this relationship even if the target check is owned. Existing policies continue to govern manual/pack writes and owner transitions. The public invoker/private definer split does not bypass authorization: both public and directly called private functions enforce the same identity checks; anonymous roles have no execute grant.
- `ON DELETE SET NULL (cv_check_id)` preserves the tracker, owner and reported progress. Internal FK action is allowed despite omitted client column grants. The existing timestamp trigger updates `updated_at` during this detach; therefore do not claim every field is byte-identical after source deletion. Account cascade remains separate from check deletion.
- Unique owner/check identity and the exclusive check-or-pack constraint prevent duplicate joins and double attribution. No historical rows are guessed or backfilled by role/company.

## Verification performed

Ran the actual migration in the extracted isolated PGlite schema tests together with the changed home unit/component tests: **45 tests in 3 files passed**. This includes 12 backend cases covering repeated calls, retained progress, same-title separation, foreign/absent/anonymous identity, direct column denial, owner transfer, server-side composite FK, conflicting sources, authenticated check deletion, explicit tracker deletion, ordinary pack tracking and account cascade. The fixture imports the actual tracker table/policies/timestamp trigger and check migration; auth identity and unrelated pack schema are substitutes.

Native multi-connection lock evidence and hosted schema/grant readback remain coordinator/backend acceptance responsibilities. No assumption is made here that PGlite establishes hosted concurrency or that the migration has been applied.

## Home projection self-review

Only exact IDs for the current owner join; no wording heuristic. An unavailable, removed or foreign source check leaves its tracker visible as a standalone row with notes/status and the exact tracker action. Missing tracker reads show unknown tracking on checks as well as packs. A tracker selector that becomes grouped after the check source finishes loading offers a deliberate exact linked-check action. Source failure does not silently select a substitute. Contradictory check+pack links fail to a standalone tracker even though the new database constraint prevents them in valid data. When check deletion clears the link, the following read shows standalone tracking. Independently timed source reads can temporarily show a stale source plus detached tracker, but cannot attribute progress to another check. Auth-lifetime guards and source refresh invalidation remain unchanged.
