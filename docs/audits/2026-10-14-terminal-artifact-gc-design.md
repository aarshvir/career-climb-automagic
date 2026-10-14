# Bounded collection of unreferenced terminal-run artifacts

Design only, 14 October 2026. Inspected v23 source `b9b21bba1e90eaefbac31d97fa55f35bb5d77c96`. No collector has been implemented or enabled by this report. No candidate records, storage objects or production accounts were modified during this review.

## Scope

Collect grant-tracked files left by **cancelled or completed runs**, when no packet references the exact path. This closes a bounded part of BACKEND-02/JV-02. It is separate from candidate-requested erasure, which intentionally removes the owner's entire Job Loop artifact prefix.

Do not collect files belonging to `queued`, `running`, `partial`, `blocked` or `failed` runs. The last three are resumable through `job_loop_run_action`; an expired lease alone does not make their artifacts disposable. Preserve references from every packet status, including `held`, `revoked`, `review_required` and `approved`. Grant-free legacy objects are outside this slice because the current path does not independently identify their run; full owner erasure still covers them.

## Existing foundations

- `job_loop_artifact_grants` durably records owner, exact path, run, upload lease and lifecycle generation before Storage upload (`20261014101107_job_loop_durable_erasure.sql:17,273`). This survives a lost upload response or a process stopping after only some parallel uploads finish.
- Storage insertion checks current generation and live run lease; cancelled/completed runs cannot be resumed or claimed through the current RPCs (`20261011010000_job_loop_cloud.sql:167–180`).
- Artifact paths are content-addressed under a packet ID derived from the run and vacancy (`job-loop-runtime.ts:260–269`). A failed commit does not establish authority to delete its uploaded paths: a newer lease might have published a reference.
- Owner-scoped transaction serialization already exists. Use it before locking a grant or run.

## Minimal protocol

1. **Add collection state to the existing grants.** For example: `gc_state` (`available`, `claimed`, `collected`), a random claim token, claim expiry and collection timestamp. These are operational identifiers, not CV content. A claimed path remains closed to new uploads and references even after its worker claim expires.
2. **Claim a bounded set in a service-only RPC.** Propose a conservative 24-hour grace after terminal completion, as an operator-selected retention rule rather than an existing promise. Select only current-generation owners in `active` lifecycle state, cancelled/completed runs with no live lease, and exact paths absent from **all packet manifests**. Apply the reference exclusion before the result limit, so a prefix full of referenced files cannot permanently starve later orphans. Acquire owner locks in a deterministic order, skip busy owners, then recheck eligibility and mark rows claimed under those locks. Start with at most 200 paths per batch.
3. **Make the claim a persistent path fence.** `job_loop_authorize_artifact` must reject collecting/collected paths and must not silently move such a path to another run. The Storage write guard must reject them too. Packet publication/direct packet mutation must reject a reference to a claimed path. Otherwise reference checking followed by a network delete has a race window. Do not reopen path authority merely because a GC worker's claim timed out.
4. **Remove only the returned paths through the Storage API.** A small server helper validates the entire batch before any deletion: UUID owner, exact owner prefix, canonical artifact structure, expected generation/token and bounded array size. Use the fixed `job-loop-artifacts` bucket and chunks of no more than 100. Do not download CV bytes, enumerate other buckets, accept caller-supplied paths or directly delete `storage.objects` metadata.
5. **Finish with an independent database check.** Under the same owner lock, verify the token/generation, lack of packet references and absence of those paths in `storage.objects`. Mark successfully absent paths collected; retain their closed-path tombstones until their run is erased. A partial/uncertain Storage response leaves claimed work retryable. An expired claim may be reassigned to a new maintenance worker, but must never unlock uploading or publication. Old completion tokens cannot update the new claim.
6. **Bound each invocation and resume.** Use at most five batches per invocation. A stopped process resumes from persistent claims and actual remaining objects. Counts of attempted removals are diagnostic; they are not proof of deleted bytes. Owner erasure takes precedence, and stale GC completions must not recreate grants or lifecycle metadata after that erasure.

An active lifecycle generation can be **zero** before the first erasure. Do not reuse the erasure-job validator that requires generation at least one.

## Automatic execution needs an independent wake-up

Appending collection to the current recurring-run path is insufficient. `job_loop_dispatch_due` returns without a dispatch when there are no due schedules or queued/running runs, and it also stops when the preparation scheduler is disabled (`20261011050000_job_loop_cron_platform.sql:17–24`). Terminal-only accounts would therefore never be visited. `processDueSchedules` also requires preparation readiness.

Use a small, separately authenticated maintenance action and a modest independent dispatch, with action-bound single-use tickets or the existing fixed server credential. Keep this independent of AI/search availability and candidate recurring-preparation opt-in. The action accepts no owner or path overrides from browsers and performs no provider calls, drafts, messages or application submissions. Configure and verify this wake-up before describing collection as automatic.

## Suggested files for a later implementation

- New additive migration, `supabase/migrations/<timestamp>_job_loop_terminal_artifact_gc.sql`: grant collection fields/indexes, service-only claim/finish RPCs, persistent path fences and maintenance dispatch authentication.
- New `supabase/functions/_shared/job-loop-artifact-gc.ts`: bounded adapter-driven orchestration, parallel in structure to the erasure helper but with narrower authority.
- `supabase/functions/_shared/job-loop-repository.ts`: fixed-bucket adapter.
- `supabase/functions/job-loop-worker/index.ts` and the relevant ticket/dispatch helper: explicit maintenance action, separately authenticated from user controls and independent of paid preparation.
- New `supabase/tests/job-loop-artifact-gc-sql.test.ts` and `supabase/tests/job-loop-artifact-gc.test.ts`; extend the existing cancelled-render process test only to verify the new collection handoff.

Do not change the existing erasure migration after deployment; add a new migration.

## Remaining acceptance checks

All implementation testing should use local synthetic accounts, mocked Storage and isolated PGlite/PostgreSQL databases. A hosted smoke, if later authorized, needs an explicitly dedicated synthetic account/bucket namespace and a reviewed deletion inventory; never enumerate or delete actual candidate objects to validate the collector.

- Cancel after upload but before commit: no downloadable packet, and grant-tracked orphan files are eventually collected.
- Keep every referenced format from every packet status, even when an unrelated format or earlier hash is orphaned.
- Skip all resumable run states, live leases, other owners/buckets, erasing owners and untracked legacy objects.
- Claim → late upload/reauthorization/packet commit: all attempts to reuse the claimed path are rejected. Claim expiry must not reopen it.
- Two collectors, an expired claim, and a stale completion token: retries remain idempotent and cannot create authority or delete a newly referenced path.
- Storage partially deletes and returns an error; process dies after deletion but before acknowledgement: retries use actual remaining objects and retain the fence until confirmation.
- Full owner erasure/new enrollment occurs during collection: old completion cannot recreate grants, revive old authority or affect the new generation.
- More than 10,000 synthetic objects progress through bounded invocations, including long stretches of referenced paths before orphan candidates.
- Browser roles cannot invoke collection RPCs or inspect collection records. Malicious path batches fail validation before any Storage removal.
- Maintenance still wakes for terminal-only accounts with preparation disabled, while making zero AI/search/email calls.

PGlite staged interleavings establish SQL outcomes, not two-connection locking behavior. A real PostgreSQL concurrency check and a synthetic hosted Storage smoke remain separate release evidence. No collection, retention or cost-saving outcome is claimed by this design document.
