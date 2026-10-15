# Non-initializing Applications read: backend implementation

15 October 2026. Bounded backend support for the shared Applications home; no database migration or deployment performed by this agent.

## Contract

Authenticated `POST job-loop-control` accepts exactly `{ "action": "get_existing" }`. The existing HTTP handler authenticates the token and derives its owner; the caller cannot supply owner, generation, consent or initialization parameters.

- `{ existingState: "active", snapshot }`: an existing record in an active durable lifecycle. Snapshot includes its `lifecycleGeneration` and `recordVersion`.
- `{ existingState: "absent" }`: no saved record, or an erased lifecycle. This is not an initialized empty workspace.
- `{ existingState: "erasing", erasureGeneration }`: cleanup is incomplete. No private snapshot is returned and cleanup is not automatically continued.

The old `get` action keeps its existing intentional Loop-opening behavior for compatibility. The Applications page must use `get_existing` and must not fall back to `get` when this request fails or an older handler does not recognize it.

## Implementation and consistency

`LoopRepository.existingLifecycle` and `existingRecord` issue direct owner-filtered selects and validate returned owner/lifetime/version fields. They do not call `job_loop_erasure_status` or owner-assert RPCs, which can create lifecycle metadata. They never open a record, enroll a pilot user, activate an erased generation or mutate candidate data.

The runtime builds the ordinary snapshot from the initially read record using the shared snapshot builder, then re-reads both record and lifecycle after collection/operation reads. An erasing/erased transition discards the private snapshot. A fresh active generation returns `LOOP_REQUEST_STALE`; the operation never adopts the new generation and retries the old read silently. A same-lifetime version/input-version change returns `LOOP_VERSION_CONFLICT`, avoiding a mixed-revision snapshot.

The final read is the lifecycle consistency point. A later mutation still relies on the existing owner, generation, record-version, packet-source and approval controls. No HTTP read can prevent a subsequent independent change, so the home cannot treat its loaded state as permission to download or write.

As agreed with the coordinator, a legacy record without durable lifecycle metadata returns `LOOP_REQUEST_STALE` with an instruction to open its saved Job Loop once. It is not silently hidden as an empty account and no metadata is created by the passive read. Database failures propagate as sanitized errors rather than empty success.

Current collections retain the established recent-output bounds of 150 packets and 30 runs. This response is not historical completeness evidence. A home must not infer “no document exists” for an older opportunity simply because its output falls outside that range; label recent available outputs and offer existing source continuation. Historical pagination/exact old-output lookup is a separate boundary.

## Checks

- **49/49 Vitest tests across four files**: new `job-loop-existing-read.test.ts` has 17 cases covering absence, erased/erasing states, current active reads, no RPC initialization, delayed state/generation/version changes, disappearing records, foreign-owner responses, database failures and strict input parsing. Existing request-runtime, claim-validation and engine regressions remain green.
- **13/13 actual source-mode Deno handler tests passed**, including new authenticated/forged-owner checks, active passive snapshot, untouched/erased absence and erasure-only state. Every runtime fetch is intercepted by the local synthetic fixture. No candidate account, external provider, Storage bucket or real mailbox is contacted.
- App TypeScript and scoped whitespace validation passed.

Sources changed: `supabase/functions/_shared/job-loop-types.ts`, `job-loop-engine.ts`, `job-loop-repository.ts`, `job-loop-runtime.ts`; backend tests only. Frontend/client response parsing is owned by the coordinator. This does not itself finish the Applications UI, canonical check/tracker links or per-vacancy worker selection.

## Native publication procedure for the coordinator

1. Preserve the currently deployed control handler source/version and the current frontend/source rollback reference. This action needs no schema migration or change to worker/OAuth secrets, budget or collection configuration.
2. After all shared source changes are frozen, regenerate the reviewed deployment artifacts with `scripts/build-job-loop-ui.ps1` using the existing cached Deno 2.9.6 path (or its reviewed cached esbuild 0.25.5 fallback). The builder pins document dependencies and records exact bundle bytes plus normalized source/migration hashes in `docs/supabase-loop-ui/manifest.json`. After the coordinator's later authorization, this agent regenerated these artifacts locally with cached Deno 2.9.6; nothing was deployed.
3. Run the actual generated-handler tests with `JOBVANCE_LOOP_UI_BUNDLES=true` and cached Deno: `deno test --cached-only --allow-env --allow-read=docs/supabase-loop-ui --config=supabase/functions/job-loop-worker/deno.json supabase/tests/job-loop-edge.deno.ts`. Dynamic bundle imports require that bounded read permission. **13/13 generated-handler tests passed.** Source-mode success alone does not prove the published bundle contains this change.
4. Use the native Supabase function deployment tool for the reviewed `job-loop-control` bundle and its existing function configuration. `supabase/config.toml` records gateway `verify_jwt=false`; retain the handler's explicit `authenticatedClient` verification. This flag is not permission to bypass token verification. Do not paste a truncated bundle; `scripts/read-edge-deploy-chunk.mjs` checks source freshness and bundle hashes when preparing bounded native-tool input.
5. Deploy backend support before the frontend begins calling `get_existing`. Existing old frontend `get` users remain compatible. An unavailable/new-action error in the new home remains an explicit Loop-source failure, never a retry through the activating `get` path.
6. Read back the deployed control version/source hash, compare it to the reviewed artifact, and verify unauthenticated rejection plus a permitted isolated synthetic existing/absent read if secure authority is available. Do not create or erase real candidate records to manufacture acceptance evidence. If such authority is unavailable, report hosted authenticated behavior as unverified and retain the hermetic receipts.

No deployment, migration, enrollment, candidate write, paid API call, collection activation, Git commit or push is claimed here.

## Later independent client/readback checks

The coordinator requested a separate read of the browser response parser and exact-opportunity continuation. The parser requires a current generation for an active snapshot, rejects snapshots for absent/erasing states, and rejects contradictory/missing read states. The opportunity selector accepts only the exact UUID plus safe lifecycle generation; unavailable/stale selectors do not substitute another opportunity or packet. Source freshness, packet approval and download controls remain on the existing paths. No concrete blocker was identified in that source read. Existing API/request-generation suites passed independently, **89/89**; that count does not itself establish coverage of the new read-state parser branches.

SQL inspection confirmed `job_loop_budget_snapshot` (`20261011030000_job_loop_recurring.sql`) and the latest `job_loop_scheduler_state` (`20261011050000_job_loop_cron_platform.sql`) use selects only. Neither appears in the durable-erasure mutation wrapper allowlist. They do not initialize or enroll an untouched identity; untouched/erased passive reads skip operation queries entirely.

Generated control artifact: **65,301 bytes**, SHA-256 **c74ab7f7c8b40747efa9bde41825d0afebff1f8cb67ce15891e654321e3bb6b9**. The verified chunk reader confirmed source freshness and manifest consistency. Control/worker/OAuth artifacts and the manifest changed after regeneration; admin/review/guest artifact bytes remained unchanged. A regenerated artifact is not evidence that its deployed handler changed; native publication/readback remains the coordinator's separate step.

The separate reviewer independently ran the new 17-case backend suite and found no concrete backend blocker. A later wider source-selection run by this agent reproduced the reviewer's **CvCheck** acceptance failure: the selector-helper plus independent source UI suites returned 19 passes and one failure for fresh approval after batched A→B→A. That finding was sent to the coordinator; it is outside this backend implementation but blocks a broader frontend release until corrected. The source-only no-blocker observation above concerns the get-existing response parser and JobLoop opportunity selection, not that failing CvCheck approval path.
