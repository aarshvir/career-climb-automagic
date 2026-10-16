# Native selected-admission concurrency verification

16 October 2026. **Local acceptance evidence only. Public v30, control15, worker11 and OAuth5 remain unchanged.** Both pending migrations remain unapplied to production. This step extends the existing disposable PostgreSQL harness; it changes no product runtime, schema source, generated bundle or candidate UI.

## Observed behavior

Nine groups passed against the actual selected-admission migration on native PostgreSQL 17.11. Each race used separate database connections and observed the expected holder in `pg_blocking_pids` before releasing the transaction:

1. Two exact simultaneous requests return one run with the original ordered third/first vacancy selection, generation and immutable snapshot. Another connection sees no partially admitted run before commit.
2. Contending retries with substituted order, request hash or processing consent fail with request conflict, retaining one original run.
3. A source edit that obtains the lock first causes admission with the old displayed version to fail; the edit survives and no run is created.
4. Admission that obtains the lock first captures original wording, while a later edit proceeds without changing the stored snapshot. This tests database isolation; the separate worker/control source comparison remains necessary before output.
5. An ambiguous exact retry waits for a concurrent progress update, returns the original run and preserves later applied status and notes.
6. Erasure that obtains the lifecycle lock first rejects old admission. After finishing fixture erasure and reopening, the old request still cannot enter the new generation.
7. Erasure waits for an admitted run, then cancels it; retrying the original generation fails.
8. Competing selected and wider-discovery requests retain the one-active-run limit.
9. A competing request cannot become a fourth daily admission even when the winning third run is cancelled before commit. Usage remains empty and the local collection fixture remains disabled.

The harness was also rerun in its two previous modes: **six saved-check/Loop groups and five saved-check/tracker groups passed**. All three final clusters stopped normally. A subsequent process check found zero PostgreSQL processes. The selected suite passed once before adding the executed-schema digest and again with the final harness; the final receipts below are authoritative for this step.

## Reproducible evidence

`scripts/test-check-tracking-postgres.mjs --selected-preparation --fixture-root=.tmp/isolated-pg-e7ff9108-68c3-403c-9090-b8d2901dc688` runs the new cases in `scripts/fixtures/selected-preparation-native-cases.mjs`. The existing `--check-loop` and default tracker modes remain available. Suite flags are mutually exclusive. Each invocation creates a new database directory, authenticates only to its loopback cluster and shuts it down in cleanup.

Before each invocation the official 381,531,864-byte PostgreSQL ZIP was verified against pinned SHA-256 `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f` before extraction or binary execution. Existing path, archive-entry, environment and cleanup safeguards remain intact. No project credentials are read. No system service, firewall or PATH changes occur.

Receipts preserve harness, migration, case-module and complete executed-schema digests, distinct backend PIDs, observed blocking PIDs, times and cluster cleanup:

- [Selected admission](native-admission.json): nine groups.
- [Existing check/Loop regression](native-link-regression.json): six groups.
- [Existing tracking regression](native-tracker-regression.json): five groups.

Private detailed logs and unsanitized local paths remain under the sibling repair-evidence directory as `selected-native-final.*`, `selected-native-check-loop-regression.*` and `selected-native-tracker-regression.*`. Public receipts omit local fixture paths and ports. All test owners and vacancy data were created in isolated databases.

## Limits and remaining work

The SQL engine and concurrency are native PostgreSQL. Auth identity, unrelated pack columns and Storage tables are explicit fixtures. These checks do not exercise hosted Supabase/PostgREST, real authentication, actual Storage objects, the worker, document rendering, exports, provider calls or customer tasks. The local disabled collection assertion is not a fresh production configuration query.

No full frontend suite, TypeScript, build, Deno or live HTTP check was rerun for this test-harness-only change. The previous 1,630-test/UI and earlier handler receipts retain their original scopes. No spending, production mutation, migration or deployment occurred. No new independent reviewer sign-off or score uplift is claimed.

Full-navigation/refresh recovery of ambiguous selected requests is next: the current identity remains mounted-page memory. Actual first/second selected-worker preparation, review, exact approval and received/parsed exports, application-specific composition/grouped review, pagination and hosted/unassisted acceptance remain open. Combined independent review is still required before coordinated schema/control/worker/site exposure. Never expose selected admission against worker11 or the import frontend against control15. Preserve saved v30, all existing rollback references and permanent lifecycle/retention/spending fences; source rollback is separate from database/file restoration.
