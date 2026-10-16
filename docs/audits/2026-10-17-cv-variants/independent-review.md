# Independent review: CV variant storage foundation

Reviewed 17 October 2026 (Dubai). The exact final UTC review time is in the accompanying receipt. This review was performed by the acceptance/review agent separately from the SQL implementation agent and the root helper implementation. It is a bounded source review, not a separate-model product assessment or a production acceptance certificate.

## Result

No remaining material blocker was found **within the reviewed storage/intent foundation** after the corrections below. The final focused run passed **68 tests: 42 SQL and 26 helper tests**. `independent-verification.json` is the runner receipt with local absolute paths replaced by repository-relative paths; the original remains in private evidence. Exact source/test SHA-256 values and review time are in `independent-review-receipt.json`; this conclusion applies to those bytes.

The migration remains unapplied in this review. No live database, candidate record, model provider, paid search, site or deployed handler was changed. The new action is not registered in the control handler. This does not establish a usable three-CV product, variant-aware preparation, recurring variant selection or full account recovery.

## Corrections found during review

1. **Migration initially did not parse.** An actual isolated PGlite application reported `syntax error at end of input` around the comparison with a `CASE` expression in the profile validator. The SQL author parenthesized that expression. The final migration loads and the final SQL suite passes.
2. **Nullable enum checks could fail open.** Source inspection found `NOT IN` checks on extracted audience, compensation period and claim source kind without a null/type guard. The author added explicit type/coalescing guards. A separate actual PGlite probe exercised JSON null in every profile field and each compensation field: 15 probes, with only the intended nullable experience and minimum-compensation values accepted. The final focused suite also covers null audience and period.
3. **Label control-character mismatch.** The helper rejected DEL but the initial SQL label guard did not. The author added DEL rejection and a corresponding SQL case before the final focused run. Explicit null-owner rejection and malformed-reference cases were added as well.

No production defect was introduced or repaired by these unpublished corrections. They were found while the new foundation was under construction.

## Reviewed authority and data behavior

- Private variant and retry-receipt tables have no direct SELECT/DML grants for anonymous, authenticated or service roles. Service-only RPCs use fixed empty search paths; the public save wrapper delegates to the private definer.
- Save and read enter the existing lifecycle-generation lock, then lock the owner record. Writes serialize the three-variant limit and optimistic revisions under that lock. The caller supplies the original generation; it is not replaced with a newly read generation.
- Variants live outside the legacy whole-record JSON. A normal old writer cannot drop them by omitting a JSON property. Save advances record ordering while retaining the legacy source, claims, input version, packet states and run states.
- The profile is supplied independently. Selected claims are copied from exact current owned ID/revision references, with active, confirmed and shareable requirements. A client cannot supply replacement claim contents or confirmation flags through this interface.
- Confirmed CV-passage references require the supplied source text to equal the current owned source. A genuinely different source can be saved as an empty-claim draft. Confirming new variant-specific facts remains later work; this storage RPC does not pretend to implement that flow.
- The helper synchronously validates and deep-freezes a fresh copy of the draft before an auth/network await. Its resolver re-runs the actual literal-evidence validator and rejects facts whose canonical context changes, rather than trusting a stored confirmed flag alone.
- Both private tables cascade from the existing Loop record. The actual existing erase finisher deletes the record, so it removes all stored variant CV bytes and their retry metadata. Reads and saves reject the erasing/old lifetime immediately, before deletion finishes. The SQL tests exercise the existing erasure routines and a fresh lifetime afterward.
- Retry metadata contains hashes and identifiers rather than additional CV copies. Same-request retries preserve subsequent variant changes instead of overwriting them.

PostgreSQL's boolean argument conversion is not an HTTP JSON-type check. The helper's strict `saveConsent === true` remains necessary when a public control action is eventually registered. The SQL typed argument then ensures the persisted action still requires affirmative consent.

## Retry response distinction that future callers must preserve

On an old exact save retry after a later edit, `variant` intentionally contains the **current variant snapshot**, while top-level `sourceHash` and `savedRevision` identify the **original successful save receipt**. Those can differ. The response proves the old request succeeded without replacing newer work; it does not say that the original source is still the current draft.

A future client must validate the original receipt against the captured request, display the current variant separately, and avoid clearing a newer local draft because an older receipt returned. Tests cover preservation of the later saved variant. There is no registered client caller yet, so this review does not certify that UI behavior.

## Concrete gates before variant preparation or production exposure

1. **Current sharing authority:** an immutable claim snapshot must not freeze permission forever. Admission, worker use and artifact approval need to check current claim revision/withdrawal/shareability. Existing global factual withdrawal revocation must remain effective until a reviewed variant-specific policy replaces it.
2. **Exact run identity:** the current request/packet hashes and packet reuse do not identify a CV variant. Add original variant ID, revision and lifecycle generation to request identity, immutable run snapshot and packet provenance. Identical text in two named variants must not silently merge their application histories.
3. **Approval/download authority:** current runtime approval and preview recompute against the global profile and claims; downloads use the global input version. Those paths must understand the selected variant before variant packets can be exposed. Storage-only saving is safe because it does not create those packets.
4. **Schedule binding:** the current scheduler reads the current global profile on each occurrence. A variant schedule must explicitly bind its variant and revision, or an expressly consented update policy. Merely changing the selected editor tab must not change the source of an existing schedule.
5. **Independent facts:** this foundation can store a different source without claims, but does not provide its own fact-review/edit lifecycle. Add that lifecycle without forcing a temporary swap of the global source or invalidating unrelated applications.
6. **Native races:** the separate native agent has now executed nine passing groups on PostgreSQL 17.11 with the existing selected-preparation migration and new variant migration loaded together. This reviewer inspected the cases, lock observations and matching final source hashes, but did not execute that native run. Further variant admission/worker changes will need their own race coverage; these storage races do not establish hosted behavior.
7. **Client and hosted acceptance:** register strict server ownership resolution, response validation, separate save consent, undo/recovery and stale-result handling; then observe browser and hosted synthetic first/second tasks. No subscriptions or entitlement delivery are established by a private table limit alone.

## Final independent verification and native evidence inspection

The final focused run independently passed 68 tests. The last three SQL cases specifically retain queued/running runs and approved packets through variant saving and a legacy whole-record write, and bind claim ordering into the source hash and retry identity.

The native execution agent supplied nine passing groups, finished 2026-10-16T22:42:51.679Z, with the cluster stopped. This reviewer read the actual cases and harness. Each group uses distinct backend PIDs and waits for the expected pg_blocking_pids relationship before committing; it does not infer serialization from a fixed sleep. The final harness loads the existing selected-preparation migration before the variant migration. Migration, harness and case-file hashes match the receipt. Covered races are duplicate/conflicting requests, competing final slots, competing revisions, both source-edit/save orderings, and three erasure/save orderings. The fourth-slot test first verifies stale record rejection, then retries with a fresh record version and verifies the independent three-variant cap. The original retry after a later revision returns the newer variant with the original save receipt, as documented above.

Native PostgreSQL executes actual migrations, but authentication and unrelated storage structures are isolated fixtures. There is no hosted Supabase, provider, worker, document rendering or export acceptance in these nine groups. Exact native receipt path, digest and execution attribution are recorded in independent-review-receipt.json.

## Separate route-test synchronization correction

Reviewed the one-line change in src/__tests__/job-loop-saved-check-import.test.tsx. Its preview helper waits for the selected saved check, which can precede React Router's subsequent route commit. Waiting with waitFor around the unchanged exact /^\/loop$/ assertion is appropriate synchronization. It retains the route expectation and does not change product code or weaken privacy/write assertions. Root owns the full-suite result; this review does not infer that result from the focused variant run.

No complete-product sign-off, quality score, usability uplift or hosted acceptance is claimed.
