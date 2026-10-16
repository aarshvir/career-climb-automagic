# Selected-vacancy admission and worker foundation

Recorded 16 October 2026 (Dubai). **Unpublished source only. Public v30, control15, worker11 and OAuth5 are unchanged.** This extends the existing saved-check/link work without rebuilding its SQL, control contract, home grouping or consented import UI.

## What the source now implements

The additive, unapplied `20261015223000_job_loop_selected_preparation.sql` stores an ordered selection of one or two exact vacancy IDs and the original lifecycle generation on the run. NULL selection preserves existing discovery/scheduled behavior. A service-only routine holds the existing generation/owner and record locks, resolves each ID exactly once against that owner's current record, rejects unavailable sources, captures the normal owned snapshot, and binds retry identity to the selection/order, input/request hashes, provider/model and consent. It retains the existing pilot admission, active-run restriction and three-per-UTC-day quota; it does not reserve or settle spending. Inbox or recurring expansion is rejected.

The selection-aware worker resolves only from that admitted snapshot. It bypasses inbox, employer-feed discovery and web search; preserves explicit order rather than ranking a different shortlist; and rejects missing, reordered, omitted or substituted phase selections. Mutable phase wording cannot replace snapshot wording. Before rendering it compares current vacancy facts and provenance, skips later application progress, and retains an exact unchanged existing packet without another upload or model reservation. Existing source verification, factual review, held-packet and artifact approval behavior remains. An ordinary discovery-wide retry cannot adopt a selected run.

An initial SQL test exposed an incorrect assumption that runs already stored `lifecycle_generation`: that value is enriched at claim time. The new `selected_generation` column now explicitly stores admission generation and is checked against claim authority. The stale-generation assertion was corrected to the existing `LOOP_REQUEST_STALE` contract. No existing guard was weakened.

## Verification and limits

- **1,553 tests passed in 102 files**, including **20 new actual-migration PGlite cases** and **14 new actual worker-phase cases**. These include choosing the third vacancy first, choosing two in a particular order, real document rendering from created evidence, source/provenance changes, closed/removed sources, later applied progress, exact packet reuse, phase substitution/omission, lifecycle mismatch, idempotent retry conflicts, quota and client ACL rejection. The worker harness substitutes repository persistence; PGlite is embedded PostgreSQL, not multi-connection native PostgreSQL.
- TypeScript passed. The six edge bundles were regenerated locally with cached Deno 2.9.6. **15 source and 15 generated-handler cases passed** against intercepted local HTTP transport. Those existing handler tests are bounded regression checks; they do not exercise a new selected admission endpoint, because none exists yet.
- **12 hosting groups passed** against the existing frontend artifact. No frontend changed and no fresh frontend production build or live HTTP run was performed.
- No new native PostgreSQL concurrency run, hosted persistence, Storage deletion, authenticated signup/OAuth, browser customer journey, provider call or spending occurred. Previous native receipts retain their earlier source scopes.
- The known independent reviewer usage limit remains; no fresh independent sign-off is claimed. No paid workaround was used.

## Gates before exposure

1. Implement a strict selected-preparation client/control contract deriving owner from the authenticated session, capturing original generation, exact selection and fresh processing consent. Compute the source/request fingerprint on the server. Define safe selected retries independently from discovery-wide retries; the service routine accepts server-derived hashes and is not a browser API.
2. Return selection/scope honestly through run snapshots and UI; require deliberate vacancy selection and handle unavailable/replaced sources without a fallback to an unscoped run. Keep owner/auth/draft stale-result protection and existing saved-check consent boundaries.
3. Add control/SDK/component tests plus isolated real multi-connection races for admission against source edits, duplicate requests, erasure and competing runs. Do not label the embedded tests as native concurrency evidence.
4. Review the combined pending saved-check link and selected-preparation changes independently. Decide a coherent deployment boundary, then preserve rollback and coordinate schema/control/worker/frontend. **Do not apply either pending migration or expose this frontend alone.** Never deploy selected-run admission with worker11, which does not understand the selection.
5. Read back exact deployed schema/ACL/source and artifact receipts, then perform safely isolated hosted first/second preparation/export tasks when authorized infrastructure permits. Per-application composition and grouped review remain open; rendering existing composition is not semantic rewriting or full journey acceptance.

Both `20261015101948_job_loop_saved_check_link.sql` and this selected-preparation migration remain **unapplied**. All local generated bundles remain **undeployed**. The existing v30 saved artifact and rollback tag `jobvance-before-check-loop-link-2026-10-15` remain; additional pushed tag `jobvance-before-selected-preparation-2026-10-16` points to source `28ede63e7d49a430d66df999e5bdd3fb4266ca78`. Source rollback is separate from database/files. Preserve permanent GC fences, existing relationships, all actual/reserved/uncertain commitments, and the disabled collection gate. No fresh collection configuration readback was made.

No customer score, best-in-class status, complete JV-03/04 delivery or successful unassisted journey is claimed. Exact local verification is in `verification.json`; private detailed logs remain under the sibling repair-evidence directory.
