# 100 paid Job Loop accounts

24 October 2026. Owner request: raise paid account capacity from the original ten-account pilot arrangement to **100 paid accounts**.

## Delivered

Source `6bd00d39bfe67c7145c0d7d0d1d812f3db3c5339` replaces five database routines. Migration `20261024113134_job_loop_paid_capacity_100.sql` was applied once to the live project as `20261024114412` / `job_loop_paid_capacity_100`. Native readback matched all five changed definitions exactly.

- Paid admission permits 100 distinct live paid owners, including unexpired checkout reservations. Existing retry identities remain valid; two competing last-place claims serialize using the existing transaction lock.
- Free pilot memberships are separate and retain their own limit of ten. They do not consume paid places, and free membership does not bypass a full paid pool.
- The free-enrollment wrapper no longer subjects free enrollment to paid capacity. Existing lifecycle checks and refusal to fall back from a former paid subscription remain.
- Budget snapshots report active paid access as eligible for preparation. This prevents an active paid owner being blocked by the old browser free-pilot-full check. Free occupancy fields and the shared $50 monthly AI/search ceiling stay unchanged.
- Artifact authorization and the Storage write trigger accept current paid entitlement without requiring a free-pilot row. Ownership, active lease, original input revision, lifecycle generation, grant expiry and permanent GC path fences remain. Expired or revoked paid access cannot write using a lingering free-pilot row.

This is a database-only release. No frontend rebuild, Site redeployment, Edge Function upload, Dodo configuration change, new checkout session, card charge or advertising operation was needed.

## Verification

- **106 Vitest tests in four files passed** on the final fixture revision. The new test executes **13 actual SQL subchecks**; those subchecks are not counted as thirteen additional Vitest tests. Existing subscription lifecycle, localized price and artifact-GC suites retain their original migration scopes.
- **15 native PostgreSQL 17.11 groups passed**, including the same thirteen functional groups and two additional concurrency groups with separate backend PIDs and observed blocking: last-place contention, and rollback releasing that place to the waiting checkout.
- Native groups also exercise 100 current paid accounts after checkout reservations expire, free-pilot independence, retry deduplication, Test/Live separation, cancellation/grace, expiry, stale generations, paid-only artifact grants and Storage metadata writes, revoked access, tombstones and exact late-payment recovery after capacity becomes available.
- Application TypeScript and JavaScript syntax checks passed. No frontend production build or full application test-suite rerun is claimed.
- All five changed routines retain fixed empty search paths, definer execution and no anonymous/authenticated execution. Existing service-only entrypoints retain their permissions; internal grant/trigger routines remain internal.
- Security advisor findings are unchanged after excluding observation timestamps. Existing unrelated notices are not resolved by this release.
- The pinned official PostgreSQL archive digest was verified before execution. The cluster stopped after the final run and zero PostgreSQL processes remained.

Three early native harness attempts failed on expected-error session reuse or scalar JSON transport, not on the production SQL. The fixture now catches expected SQL errors inside an isolated helper and explicitly JSON-encodes boolean/text scalars. Initial failure receipts are retained privately; they are not passing evidence.

Native tests use isolated synthetic accounts, substitute Auth/Storage tables and actual application routines. They do not establish 100 real customers, hosted Storage byte uploads, new real-card transactions, natural monthly renewal, multi-day product quality or NPS.

## Live readback and preservation

At 11:44:56 UTC: paid capacity **100**, free pilot occupancy **5**, active paid accounts **0**, unexpired paid reservations **0**, unresolved live fulfillment **0**. The five pilot accounts no longer reduce the hundred paid places. Price, currency, monthly renewal and plan entitlements are unchanged.

Post-application actual signed-in browser verification returned a fresh Live Starter quote at 11:45:54 UTC, with initial and recurring totals both USD29. Purchase consent stayed unchecked and no checkout session was created.

Source rollback tag `jobvance-before-paid-capacity-100-2026-10-24` points to `e56690b`. Exact pre-change native definitions/ACLs and post-change receipts are retained outside Git. Once paid-only customers exist, restoring the old free-pilot-only artifact guards could block their files; source rollback is not database or file restoration. Retain financial records, lifecycle and GC fences during any coordinated recovery.

The earlier ten-account shared-capacity health report is historical and superseded by this release. The owner's request authorizes this bounded change; the expired product automation was not restarted.
