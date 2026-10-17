# Independent facts for each saved CV variant

This is unpublished source work following the private variant editor at `64f275176decccf96cc8c1c010a331e83a4a08d4`. Public v32 and the deployed control16/worker12/tailor1/OAuth5 baseline remain unchanged. Both variant migrations remain **unapplied**. This slice supplies fact storage and authenticated contracts; the candidate fact editor and variant preparation are still outstanding.

## What the new authority represents

A different saved CV can now have independently confirmed facts without replacing the global profile or borrowing another CV's passage confirmation. Each fact records its owner workspace generation, exact variant ID, variant source revision and fingerprint, and its own identity and revision. The existing inherited global-claim references and the new independently confirmed variant facts are separate authority domains. A future interface must make the scope of confirmation and withdrawal clear.

The server validates a new confirmation against the freshly read exact variant source. It uses the existing literal evidence validator and requires the result to equal what the owner actually confirmed: it cannot quietly expand context, crop a negation, change project work into employment, or turn a projection into a measured result. A user answer must remain a complete literal, contextual answer. This is bounded evidence checking, not proof of semantic truth. No model is called and no facts are generated.

Confirmation and sharing are distinct. A confirmed private fact may have sharing disabled. Withdrawal sets both confirmation and sharing to false. The original fact remains inspectable, with immutable revision history; erasing the Loop record cascades through facts, history and request receipts. A source edit makes older fact provenance stale, even when the wording later returns to exactly the old text. Fresh use must bind the exact current source revision as well as its fingerprint.

## Writes, retries and source changes

`save_cv_variant_fact`, `withdraw_cv_variant_fact` and `read_cv_variant_facts` derive the owner from authentication. They capture original inputs before asynchronous work, require the displayed lifecycle, and reject delayed responses after a lifecycle or authentication change. Reads are passive and never initialize a record.

The additive migration `20261017080000_job_loop_cv_variant_facts.sql` keeps current facts, immutable history and idempotent request receipts in private tables with no client table access. Only the bound service routines are executable by the service role. Writes lock lifecycle, career record and variant before changing a fact. The record version advances, while the global profile, global claims, variant source revision, input version, existing runs and packets remain unchanged. Up to 150 fact identities per variant are supported, including withdrawn identities; edits retain an existing identity.

A fresh confirmation needs the current variant source. Withdrawal instead binds the displayed fact's own source provenance and fact revision, so an old fact can still be withdrawn after its CV changes. Re-confirmation of that fact advances its own revision and binds the newly reviewed source. An older withdrawal cannot revoke a later re-confirmation under a stale fact revision.

An exact retry returns the original saved fact revision and source association alongside the **current** fact and current variant metadata. It does not reapply permissions or restore an older fact. Reusing the request with changed inputs conflicts. Future record versions are rejected before the semantic-validation branch: they cannot wait for another write to make an unvalidated request look current. Independent review identified this race and the same protection was added to the existing variant-save branch.

Browser responses require one exact fact-response envelope. Mixed snapshot/run results, substituted identities, malformed categories, contradictory permissions, unsafe counters and mismatched source revisions are rejected. A read or old receipt is never permission to prepare a document.

## Remaining integration and acceptance

The private source editor and its existing optional session-bound recovery remain unchanged. No candidate screen calls the independent fact actions yet. The next interface must show exact source context, separate fact confirmation from sharing, retain original requests and newer edits, require fresh permission, and make stale-source facts and withdrawal understandable.

Manual and scheduled preparation must subsequently bind **both** the immutable chosen variant ID/revision and ordered exact independent fact ID/revision references. A current-source resolver is provided for that integration, but it is not wired into admission or workers. Every admission, reuse and approval/download authority must recheck current withdrawal and sharing. Existing inherited global references still need their own current checks. Preserve legacy null variant selections and historical outputs. Never select a variant by swapping the global profile.

Review and exact test scopes are recorded in [facts-independent-review.md](facts-independent-review.md) and [facts-verification.json](facts-verification.json). Native concurrency is separate from PGlite and mocked handler/browser API tests. No customer browser journey, hosted persistence, received export, paid-provider call or unassisted first/second task is established by this slice. The 100-scenario simulation retains its earlier scope and scores.

The final full suite passed **2,227 tests in 126 files**, with 165 new tests across four files: 53 helper/resolver, 42 SQL, 57 browser API and 13 actual control/repository/PGlite cases. A separate reviewer authored the latter 70 cases and independently reran all 165. App TypeScript and 28 source plus 28 generated actual Deno handler cases passed. Nine native PostgreSQL groups observed blocking between separate connections for duplicate/conflicting saves, both source-edit orderings, withdrawal/reconfirmation, erasure and legacy writes. The first native attempt completed zero cases because the new fixture omitted transaction terminators; the fixture was corrected, the pinned vendor archive was reverified and the complete run passed. The cluster stopped and no PostgreSQL processes remained. These fixture corrections did not relax runtime guards.

Retain rollback tag `jobvance-before-cv-variant-facts-2026-10-17`, saved v32 and prior source/backend receipts. Do not deploy the partial variant product alone. Combined review and coordinated schema/control/worker/site exposure remain necessary. Source rollback is separate from database or file restoration.
