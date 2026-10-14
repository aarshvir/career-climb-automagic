# Terminal artifact maintenance — 14 October 2026

This bounded JV-02 implementation adds collection of grant-tracked, unreferenced documents from cancelled or completed runs. **Production collection remains disabled with an empty owner allowlist.** No real candidate file was deleted or marked for collection. Hosted Supabase Storage/S3 byte verification remains open; a prepared collector is not an enabled retention outcome.

## Implemented boundaries

- Only cancelled/completed runs older than 24 hours, without a live lease, can qualify. Queued, running, partial, blocked and failed runs remain excluded. Every packet manifest counts as a reference, including held/revoked packets and unknown format keys. Legacy files without upload grants are outside this collector.
- A database claim selects at most 200 exact paths for one configured owner. It filters references before the limit, rotates between up to ten explicit owners and skips busy owner locks. The handler accepts no owner, path, bucket or limit overrides.
- Claiming permanently closes the path to new authorization, Storage insertion and packet publication. Minimal tombstones survive Loop erasure, so a delayed deletion cannot affect the same path recreated in a fresh lifetime. Claim expiry permits reassignment; it never reopens uploading. Status-only changes preserve untouched legacy packet manifests.
- Each invocation handles at most five claims / 1,000 paths, with Storage removal chunks of at most 100. All claim rows are validated before any removal. Finish rechecks owner, generation, token, packet references and actual Storage metadata absence. Partial/uncertain removals retain authority for later retry. Reported settlement counts include files already absent; they are not deleted-byte or storage-savings claims.
- Maintenance uses its own two-minute, single-use ticket, header, RPC and hourly clock. Preparation can be disabled and have no scheduled jobs. Candidate tokens, ordinary worker credentials and preparation tickets do not authorize maintenance. Direct ticket-table writes are denied, including to the application service role. The disabled gate and empty allowlist produce no outgoing maintenance HTTP request.
- The existing free ten-account pilot and shared US$50 UTC-month AI/search ledger remain. Maintenance invokes no model, search, mailbox or employer service. Its logs contain aggregate counts and bounded error codes, not candidate paths or credentials.

## Evidence

Three separately assigned agents built/reviewed the SQL, orchestration and native concurrency harness. **153 relevant Vitest cases across ten files passed**, including 64 collector-helper cases, 14 new SQL cases, independent dispatch/ticket boundaries, existing erasure/generation/budget/provider checks. Application TypeScript passed. Ten hermetic Deno handler cases passed on generated deployment bundles; the nonempty maintenance case verifies actual handler composition through a mocked Storage HTTP delete and guarded finish. That HTTP mock does not prove hosted object deletion.

**Six native PostgreSQL 17.11 checks passed** using distinct backend processes and observed blocking IDs. They cover collection vs packet publication, actual worker commit, erasure, competing collectors and fresh enrollment. The local cluster stopped, with no owned PostgreSQL processes remaining. [Native receipt](audits/2026-10-14-artifact-gc-native.json) and [reproduction/limits](audits/2026-10-14-artifact-gc-native.md) retain exact migration/harness hashes and official binary provenance. The Storage and cron/net schemas in that harness are explicit substitutes, not hosted services.

The earlier [design](audits/2026-10-14-terminal-artifact-gc-design.md) remains historical. It is now implemented within the boundaries above; operational production activation is still pending.

## Rollout, operation and rollback

The CLI-generated migrations are `20261014161126_job_loop_terminal_artifact_gc.sql` and `20261014161304_job_loop_artifact_maintenance_dispatch.sql`. Apply in order, with the gate disabled and allowlist empty, then deploy the matching handlers. The dispatcher reuses the configured Supabase origin/public key but does not depend on preparation scheduling readiness. The hourly clock performs no outbound request while disabled. No browser or handler can expand its allowlist or enable it.

Before activation, use a dedicated synthetic account and a reviewed exact inventory to verify actual Storage upload/remove/readback, preserve referenced formats and test retry behavior. Do not use a real candidate as a smoke test. No real-owner allowlist or production deletion is authorized by this release receipt.

Source tag `jobvance-before-artifact-maintenance-2026-10-14` preserves `3a60799c743d65450a1aaa6ed7f5e9a82a28105b`; saved v24 and private `../jobvance-repair-evidence/artifact-maintenance-before-*` sources remain available. Disabling the clock/worker does not recall a Storage request already in flight. **Once a claim exists, retain permanent tombstones and all three path fences during rollback.** The prior v24 runtime remains compatible while these additive fences remain and collection is disabled. Earlier v23 storage and v24 generation-required routines still need coordinated handlers. Source rollback does not restore database rows or file bytes.

JV-02 remains partial: actual hosted Storage acceptance, isolated whole-account handling and coordinated restore rehearsal remain open. JV-01 tracking/source-replacement/save/export work and the shared candidate workflow remain next bounded product priorities. This release does not establish production signup/full OAuth, native download delivery, unassisted candidate success, premium videos, full original job-loop parity or a target product score. No purchases, paid AI/search calls, ads, outreach, emails or employer applications were made.
