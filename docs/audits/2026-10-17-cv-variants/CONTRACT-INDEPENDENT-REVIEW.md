# Independent review: CV variant control and browser contract

This review was performed by the acceptance/review agent separately from the server and browser implementation authors. Exact final review time and source hashes are in `contract-independent-review-receipt.json`. The previous storage foundation review remains historical evidence for its original source scope.

## Result and independently executed evidence

No remaining material blocker was found within the reviewed **read/save control and browser contract**. The reviewer independently executed **58 passing tests**: 43 browser API cases and 15 independently authored control-plus-SQL adversarial cases. The runner receipt is `contract-independent-verification.json`; only the absolute workspace prefix in test filenames was removed for publication. The unmodified runner output is retained in private sibling evidence.

The 15 integration cases call actual `controlLoop`, validators and `LoopRepository` against the actual lifecycle, record, selected-preparation and variant SQL loaded in PGlite. The adapter permits real owner-filtered lifecycle metadata reads and allowlisted RPCs, and throws on private table shortcuts or provider/worker network access. Auth and Storage tables are isolated substitutes. This establishes local composition of the control and database contract, not hosted authentication, Supabase transport or multi-connection concurrency. No production data or paid service was used.

## Defect found and corrected

The initial response validator used `String(value)` for three claim categories. JSON arrays such as `["cv_passage"]` could therefore pass an enum check and return malformed typed claims. Three actual failing independent regressions reproduced this for `sourceKind`, `kind` and `resultStatus`. The implementation author replaced coercion with strict string checks; the same three tests now pass. This was found before the new contract was deployed.

## Exact retries and later edits

The control layer captures and validates the request before its first await, checks the owner's active lifecycle and reads the generation-bound current record. It resolves current semantic claim authority only when that record still has the original expected version. If the version changed, it still enters the original atomic SQL routine. That routine can return an exact existing receipt, or reject an unseen/stale/conflicting request; it cannot create a new variant with that stale version.

This depends on every successful variant save advancing the owner record version, which the reviewed storage routine does. Consequently an exact retry after source editing, withdrawal or removal of current claims can acknowledge the earlier successful save. It does not grant fresh use of withdrawn facts. Fresh requests still require current source and sharing authority, and edits between semantic validation and SQL are rejected by the SQL version check.

The independent tests cover all three later-change forms, an unseen stale request, a changed payload using an existing request ID, a fresh request for withdrawn facts, and a source-sharing edit between preflight and SQL. They also verify that an old exact request returns its original `savedRevision` and `sourceHash` alongside the genuinely newer current variant, without reverting it.

## Lifetime and browser authority

- Read/save avoid initializing a missing record. The server checks active lifecycle before and after its SQL operation. Independent cases start erasure both before the write and after the SQL operation but before the response. Both read and save withhold data when that postcheck discovers erasure; the actual erase finisher then removes stored bytes.
- The browser captures a fresh copy of nested source, references, consent, request ID and original revisions before authentication awaits. Owner A→B→A changes and negative SDK authority reject delayed work.
- The new generation accessor only observes existing page-memory authority. It does not adopt a generation from an asynchronous result. The existing setter cannot move a known generation backwards. The API rejects a differing known generation before and after dispatch.
- Responses require the correct sole wrapper, exact generation/request/update identity, bounded revisions, canonical source, distinct variant IDs and valid saved claim structure. A receipt cannot masquerade as a Loop snapshot, erasure result or preparation response.
- An old receipt with a newer current variant remains explicitly distinct. The browser returns those values without treating the newer snapshot as the originally submitted source.

## Remaining integration gates

This contract does not provide a candidate-facing variant chooser/editor, automatic draft clearing, undo, full-route retry recovery, variant fact confirmation, variant preparation, schedule binding, plan entitlements or hosted acceptance. Future UI must compare captured local draft identity before applying a response and must preserve the original receipt/current variant distinction. Future preparation must independently revalidate current sharing/withdrawal permission, bind exact variant ID/revision/generation into run and packet identity, and preserve approval invalidation.

The storage migration is unchanged by this contract work. Existing nine native storage-race groups retain their original scope; no fresh native race run is claimed here. The server implementation agent separately reports 44 passing runtime contract cases; this reviewer did not rerun those 44. The root's broader build/full-suite/Deno results are separate evidence. This review makes no full-product sign-off, usability score or paid-plan delivery claim.
