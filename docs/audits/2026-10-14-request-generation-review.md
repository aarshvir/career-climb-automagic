# Independent request-lifetime review

14 October 2026. Scope: the request-generation changes after released v23 (`b9b21bba1e90eaefbac31d97fa55f35bb5d77c96`), including the additive SQL migration, server controls, Gmail helpers and same-account browser state. This is a bounded implementation review, not a whole-product quality or usability score. No production records, storage objects, Gmail accounts or paid providers were exercised by this reviewer.

## Findings raised during implementation

1. **A delayed manual run could adopt a new career record.** Binding only schedule, mailbox and erasure actions left `start_run` able to read current facts after an earlier permission crossed erasure and fresh setup. `start_run` now carries the originally displayed generation through client validation and `job_loop_start_run_bound`; its database assertion and admission share the owner lock. The generationless start/core/enrollment entry points are revoked from the service role. Existing scheduled admission remains usable through its lease-bound server path.
2. **Old support text could be restored after erasure.** `request_support` now has the same originating generation and a service-only `job_loop_request_support` RPC. Admission, the daily five-message limit and insertion occur under the owner lock. Delayed text is rejected rather than assigned the newest generation. Direct service-role writes to the support table are revoked.
3. **Same-account route recovery could relabel an erased local draft.** Memory was originally bound only to account ID, and recovery ran before the first authoritative snapshot. A returning tab could combine old dirty CV, claims or vacancy fields with a new record version. `LoopWorkingDraft` now stores a required safe generation; recovery requires an exact owner and generation match and destroys mismatches. JobLoop recovers only after the first matching snapshot. The persistence effect waits while no authoritative snapshot is available. The reviewer implemented this small memory seam and its unit tests; that authored portion is not represented as an independent second-author review.
4. **Child forms retained intent across a new same-account lifetime.** The support message, schedule form and typed erasure confirmation lived below the top-level reset. Support/schedule components are now keyed by account and generation. Erasure uses a confirmation lifetime that stays stable for deliberate continuation of the same partial erasure, then changes for a fresh active workspace. Old typed consent is not reused for the new workspace.
5. **A preliminary assertion did not make a later record open safe.** Erasure could finish between two separate RPCs. Protected controls now use `job_loop_read_record(p_user,p_generation)`, which asserts and reads under the same owner lock and never activates a new workspace. Only intentional workspace opening uses the activation path.
6. **Mutation-result snapshots could reopen the erased workspace.** An admitted old write could finish before erasure, then its response helper could open a new record after erasure. `getLoopSnapshot` now defaults to a non-initializing read. Bound mutation results use the originating generation; only an explicit GET or successful erasure request uses initialization. A final generation assertion guards the assembled response.
7. **Parallel snapshot reads could mix two lifetimes.** A parallel record-open and collections read could obtain a fresh record with old collections if erasure occurred between them. The implementation now obtains the record/generation first, fetches collections and operations next, then asserts that exact generation before returning. Source ordering and the delayed-open regression were checked after this correction.

## Database and mailbox checks

Read the complete `20261014131351_job_loop_request_generation.sql` migration and the runtime, repository, request-validation and Gmail changes. The new generation-sensitive routines use a fixed empty search path and service-only execution. Their generation check acquires the existing owner lock before delegate mutations. The old generationless routes and internal `_unfenced` delegates are unavailable directly to the service role. Browser roles cannot call the epoch/status/token routines.

Generation zero remains valid for a first active workspace. Missing, fractional, negative and unsafe client generations fail closed. Capturing the generation before authentication waits prevents a late request from silently adopting a fresh epoch. The client does not fetch a new epoch and replay old permissions.

OAuth state records preserve their admission generation. Callback exchange rechecks the consumed state before returning an activation ticket; preview/finalize require the ticket's original generation and live consumed state. Token refresh compares both generation and prior ciphertext. A delayed disconnect or refresh cannot overwrite a fresh connection. Workers inherit the generation returned by their successful run claim rather than reading the newest generation later. Inbox processing rechecks between bounded metadata batches and before returning results.

Gmail draft creation uses an exact approved attachment hash, a generation-bound idempotency claim, and a final generation assertion before the external POST. A delayed acknowledgement cannot overwrite a fresh receipt. If the remote write may have happened but the receipt cannot be recorded, the helper still reports uncertainty and directs the candidate to check Gmail; it does not claim that no draft exists or automatically repeat the write.

No unresolved release blocker was identified in this bounded source review after the corrections above. This does not certify every unrelated administrative routine, provider or product journey.

## Local evidence

An independent local rerun at 17:31 Dubai time, after the snapshot-ordering correction, passed **84 tests across four files**:

- `supabase/tests/job-loop-request-generation.test.ts`: lifecycle interleavings, stale schedule/run/support/mailbox/erasure controls, worker claims, role privileges and existing-connection backfill in PGlite.
- `supabase/tests/job-loop-request-runtime.test.ts`: delayed control boundaries with local mocks.
- `src/__tests__/lib/job-loop-request-generation.test.ts`: captured client intent, malformed/missing generations, generation-zero acceptance and no automatic replay.
- `src/__tests__/lib/loop-draft-memory.test.ts`: 21 cases for exact owner/epoch recovery, invalid epochs, cloning, expiry and renewed sharing confirmation.

An earlier run failed because a runtime mock still expected `job_loop_open_record` after the implementation switched to `job_loop_read_record`. That fixture was corrected before the passing run; its earlier failures were not treated as runtime evidence. The final release owner is collecting the broader suite, build and deployment receipts separately. The local run above does not establish hosted deployment or browser test completion.

## Limits and remaining work

- PGlite uses controlled sequential interleavings; it is not a real two-connection PostgreSQL race test. Validate the additive migration, ownership, ACLs and lock behavior against the hosted database before release.
- Mocked Storage/database boundaries do not establish actual Storage HTTP behavior, timeouts or concurrent object writes. The durable erasure proof and hosted checks belong to the broader JV-02 release record.
- A generation check cannot recall an external request already in flight. Gmail drafts may remain after erasure, as disclosed by the interface. Genuine uncertainty must remain visible and must not trigger automatic duplicate writes.
- This review made no live mailbox/model calls, incurred no provider usage and deleted no actual candidate data.
- Automatic terminal-artifact collection is still a design proposal, documented separately in `2026-10-14-terminal-artifact-gc-design.md`. It was not implemented or enabled by this review.
- A passing implementation check is not evidence that candidates find the platform clear or that a complete customer journey merits a particular score.
