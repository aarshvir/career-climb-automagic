# Job Loop request lifetime repair — 14 October 2026

This bounded JV-02 repair prevents an old permission, schedule, support message or erasure request from being applied to the same person's newly created Job Loop. It builds on v23's durable erasure and upload fencing. Published **v24** on Jobvance.io at **13:37 UTC**, source `5f1912c73f10eea3e0a7f577394263c55f5c3008`. [Exact receipt](releases/2026-10-14-request-generation.json) and [51 live HTTP checks](releases/2026-10-14-request-generation-live-check.json) retain publication/readback evidence. Migration `job_loop_request_generation` is applied as `20261014133523`; control v13, worker v10 and OAuth v4 are ACTIVE, and all three native source readbacks match the reviewed bundles.

## Behavior

- The browser captures the displayed record's lifecycle generation before authentication or network waits. An already captured request retains that generation. Missing/invalid generations from an older interface require refresh; the service does not fetch a new generation and silently replay an old intention.
- New database routines check generation and mutate under the existing owner lock. They cover manual run admission, recurring settings/actions, support intake, OAuth initiation/activation/disconnection, mailbox reads/refreshes, draft claims/receipts and beginning erasure. Old unversioned routes and direct service mutations of the affected mailbox/support tables are revoked. Existing record version floors and run/packet identities remain in place.
- A request for active generation G may begin erasure G+1 and continue that same cleanup. Refresh obtains the current erasure generation through an authenticated read that performs no deletion. Neither G nor G+1 can erase a fresh active G+2 record.
- Only intentional workspace reads and successful erasure completion initialize an empty record. Protected mutations and their response snapshots read an existing generation without activation. Snapshots anchor the record before reading its collections, then verify the same generation again before returning.
- OAuth state and encrypted activation tickets retain their original generation. The callback rechecks the consumed state after external exchange. Worker mailbox access uses the generation captured with its actual run lease. Refresh retains the existing token comparison; metadata batches recheck generation. An external request already in flight cannot be recalled.
- Local route drafts recover only after an authoritative snapshot matches their original owner and generation. A fresh lifetime clears old source/claim/vacancy drafts, processing permissions, mailbox tickets and request references. Support, recurring settings and erasure confirmations reset across fresh lifetimes; the typed confirmation survives a partial retry of the same erasure.
- Shared actual, reserved and uncertain UTC-month commitments remain intact across erasure, repeated finish and fresh setup. The ten-account free pilot and US$50 AI/search ceiling are unchanged.

## Verification and independent review

Three separately assigned agents implemented/reviewed SQL, delayed runtime/browser cases and draft recovery. Their review exposed additional stale manual-run/support intents, retained route drafts, child-local confirmations, mutation-response reactivation and mixed-lifetime snapshot ordering; those findings were fixed before release.

The production build rendered 38 public routes and 20 guides without external requests. All 12 hosting check groups passed (compressed Worker 2,765,407 bytes). The 51 live HTTP checks match the exact built application bodies and headers, including CV-check, Job Loop, Help Center and main JavaScript. The archive contains 131 members and excludes source, internal docs, dependencies and environment files. Native unauthenticated control/worker calls return 401; the no-code OAuth callback returns the fixed Jobvance route with 303.

The final relevant local run passed **315 Vitest cases across 17 files**. It includes 19 real PGlite SQL cases, nine delayed runtime cases, 35 browser request-contract cases, 50 journey cases and 21 route-draft cases, alongside the existing retention/worker/provider/budget regressions. Application TypeScript passed. Eight hermetic Deno handler tests passed on the generated deployment bundles, including stale-request rejection and read-only erasure continuation. Every runtime fetch in those tests is intercepted; no paid provider or real mailbox is contacted.

The SQL cost fixture retains exactly US$10 committed / US$40 remaining, including another owner's costs, through erasure and fresh initialization. Role-catalog assertions verify fixed search paths, browser exclusion and inaccessible legacy delegates. These controlled tests are not a real multi-connection concurrency or hosted Storage deletion test.

Independent review: [request generation](audits/2026-10-14-request-generation-review.md). Future cleanup design: [terminal artifacts](audits/2026-10-14-terminal-artifact-gc-design.md).

## Rollout and rollback

Apply the new CLI-generated migration `20261014131351_job_loop_request_generation.sql`, then deploy matching control, worker and OAuth handlers and the frontend. The migration deliberately closes old mutation routes; old tabs must refresh. Existing mailbox connections are metadata-backfilled and preserved. Pending older activation tickets without a generation require a new connection.

Before changes, source tag `jobvance-before-request-fencing-2026-10-14` preserves `b9b21bba1e90eaefbac31d97fa55f35bb5d77c96`, and saved v23 remains available. Exact pre-change handler/function sources are kept privately in `../jobvance-repair-evidence/request-fencing-before-*`. The native OAuth v3 backup is separate from the locally generated bundle. Prior v22/v21/v20/v19 and earlier fallbacks remain preserved.

Frontend rollback alone does not reverse database grants or restore data. Never restore a prior worker alone against v23's upload guard or this migration's bound mailbox routines. A coordinated schema/handler rollback needs isolated rehearsal and must retain lifecycle/version floors, active erasure and committed spending.

## Remaining scope

JV-02 remains partial: automatic collection of unreferenced terminal-run artifacts is designed but not implemented/enabled; real isolated two-connection and Storage API verification, whole-account erasure and coordinated restore rehearsal remain open. No real candidate was erased for this release.

These local and release-integrity checks do not newly certify production signup/OAuth, native download delivery, unassisted first/second applications, premium continuous video quality, full job-loop parity or a 95/98 product score. The remaining JV-01 work and shared application workflow repairs retain their priority after retention work. No ads, outreach, employer submissions, paid API/search calls or purchases were made.


Security Advisor still reports the informational server-only lifecycle RLS-without-client-policy notice, plus existing definer-function and password-protection warnings. These remain tracked; this release does not establish a clean platform-wide security assessment. [Definer routine guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
