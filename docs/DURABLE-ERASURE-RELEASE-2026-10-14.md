# Durable Job Loop erasure — 14 October 2026

Published **v23** on [Jobvance.io](https://jobvance.io) at 10:34 UTC, source `033348c302cefa429b3ed447544d8fd1ad356846`. Supabase migration `job_loop_durable_erasure` is applied as `20261014102428`; control v12 and worker v9 are active. Their deployed JavaScript matches the reviewed bundles byte for byte. [Exact release receipt](releases/2026-10-14-durable-erasure.json) · [live HTTP readback](releases/2026-10-14-durable-erasure-live-check.json).

This repairs a **private retention gap**, not a demonstrated public disclosure. Previously, starting another run could reactivate an account after erasure began, letting a late worker upload bytes outside the eraser's completed scan. A separate scan ceiling also made accounts above 10,000 objects fail every retry without removing anything.

## Implemented

- A durable owner lifecycle and generation survive Loop erasure. Begin, normal mutations and storage insertion share an owner serialization point. While erasing, new enrollment, records, runs, schedules and mailbox mutations are fenced.
- Upload authority records the exact owner/path/run/current lease/generation before the Storage request. Storage checks it again on INSERT and UPDATE. A delayed old upload cannot become valid after erasure and fresh enrollment. Existing stored documents retain their canonical paths.
- Record and input version floors survive erasure. An old CV/profile/claim/opportunity save cannot match a newly reused record version and restore prior text.
- Cleanup queries flat, exact owner-prefix batches from the database and uses the Storage API to remove files. Each request handles at most five batches of 200 objects, with removal chunks of 100. Retrying starts from actual remaining objects; there is no shrinking-list offset or full-prefix scan ceiling.
- Finish requires the same generation and an empty bucket/prefix readback. An interrupted request retains its fence. Removal counters are diagnostics, not proof of deleted bytes. The old generationless finish cannot bypass verification.
- The candidate can return after refresh, review the existing erasure scope and continue. Private document content is hidden during pending cleanup. The typed confirmation survives a partial retry in the open page. Successful completion accepts the new empty record instead of rejecting its lower historical version.

Scope remains **Job Loop only**. Separately saved CV checks, workspace CVs, packs, tracking, sign-in and external copies are not silently included. The retained lifecycle contains identifiers/version floors and cleanup diagnostics, not career text. [Operations and scope checklist](ERASURE-OPERATIONS.md).

## Verification

Three separately assigned agents implemented/reviewed SQL fencing, progressive cleanup and recovery. They converted the archived bad-behavior observations into correct regressions, rather than counting those observations as release passes.

- **293 Vitest cases in 14 files passed**, including 42 retention/budget cases and seven added UI/API cases. Six hermetic Deno handler tests and application TypeScript passed. A stricter Deno check found an existing salary-parser inference issue; an explicit type annotation fixed it without changing calculations, and its 67 tests passed.
- Real PGlite SQL tests cover the earlier interleaving, record/enrollment/schedule rejection, no-seat erasure, storage rename/update, stale generations/grants, browser privileges and stale CV versions after fresh setup. These are controlled interleavings, not a simultaneous multi-connection test.
- A mock Storage fixture erased **10,001 objects across 11 bounded calls**, with progress on every retry, another owner untouched and completion withheld until empty. Partial/error responses, malformed paths and stale authority fail closed.
- Budget fixtures preserve **$1 actual + $2 uncertain + $3 reserved + $4 another-owner actual = $10** through begin, finish and repeated finish. Deleted usage authority cannot refund the shared aggregate. Another owner's record/usage survives.
- Production readback confirms both new tables, service-only batch authority, no anonymous upload authorization, no service access to the unfenced finish, and the active INSERT/UPDATE storage trigger. Both live handlers reject unauthenticated requests with 401. No real candidate was erased and no test signup or paid provider request was made.
- Build rendered 38 public pages/20 guides without external requests; 12 hosting groups passed. Worker compressed size 2,764,383 bytes. **50 live HTTP byte/header checks passed**, including the changed Job Loop bundle. One prerender transport timeout was resolved by a clean build retry before publication; the failed build was never deployed.

Current official references checked: [Storage remove](https://supabase.com/docs/reference/javascript/storage-from-remove), [Storage list](https://supabase.com/docs/reference/javascript/storage-from-list), and [Supabase changelog](https://supabase.com/changelog). File deletion uses the supported Storage API, not direct deletion of production storage metadata.

## Open acceptance and rollback

JV-02 remains **partial**. Automatic collection of abandoned terminal-run artifacts, comprehensive schedule/OAuth HTTP intent generation binding, actual hosted Storage deletion, two-connection concurrency and whole-account/restore rehearsals remain open. Partial/blocked/failed runs can be resumed; their artifacts must not be collected merely because their lease is currently absent. Any future collector must also preserve paths referenced by held or revoked packets and fence new publication while cleaning.

Security Advisor reports an informational RLS-without-client-policy notice for deliberately server-only lifecycle data. Explicit browser table/function privileges remain revoked. Unrelated existing definer-function and password-protection warnings remain open; this release does not certify the whole platform's security.

Source tag `jobvance-before-durable-erasure-2026-10-14` and saved frontend v22 are preserved, along with prior v21/v20/v19/v14/v18 references. Exact prior control v11, worker v8 and schema definitions are saved outside the public checkout under `../jobvance-repair-evidence/durable-erasure-before-*.json`.

**Do not roll the worker back alone:** the new storage guard requires authorized uploads. Backend rollback needs coordinated schema/function review, preserving erasure generations, version floors and committed spending. No database/file restore rehearsal was performed. Source/UI rollback is not proof of data restoration.
