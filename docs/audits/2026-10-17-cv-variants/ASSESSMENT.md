# Owned CV variant storage foundation

Subsequent source integration: [authenticated control and browser contract](CONTRACT-INTEGRATION.md) registers save/read actions and strict response boundaries. The foundation evidence below retains its original scope; migration and coordinated exposure remain pending.

17 October 2026. **Unpublished source work. Public v32 and the v31 backend remain unchanged. The new migration is not applied.**

This is the next bounded part of the owner's three-variant Job Loop request. It does not make the proposed plans purchasable or establish a complete recurring service. No existing CV, packet or schedule is silently moved to a different source.

## Implemented boundary

The additive migration stores at most three current CV variants for one owner and lifecycle. Each variant has an opaque ID, an incrementing revision, a label, an independent profile/source snapshot and an ordered set of exact fact snapshots. Save requests bind the original record version, lifecycle, request UUID, variant revision, profile, fact references and explicit private-save consent. The server calculates request and source hashes. An exact retry returns its original receipt together with the current variant; a conflicting retry cannot overwrite newer work.

The original receipt's `savedRevision` and `sourceHash` describe the save that was requested. Its `variant` member describes the latest saved revision, which can be newer. A future caller must distinguish these explicitly; it must not present a later revision as the source originally saved or prepared.

Fact references resolve only against the owner's current record under the lifecycle and record locks. Withdrawn, private, unconfirmed, missing, duplicate or stale facts fail closed. Confirmed passages from a CV cannot be copied onto a changed source. A different CV may be saved as an empty-fact draft; editing and confirming facts independently inside each variant remains future work. An empty draft is not ready for preparation.

Private tables keep variants outside the legacy whole-record JSON, so an older writer cannot drop them by omitting new fields. Foreign keys cascade from the record removed by the existing erasure finisher. Reads and saves are service-only, use fixed search paths and require the original active lifecycle. The erasing state hides the data immediately; finishing erasure removes the variant bytes and retry metadata. No new retention exemption is introduced.

A save advances the record's optimistic version without replacing its default profile/claims or changing its preparation input version. The variant storage operation does not start a run, approve a document, enable a schedule or grant a paid allowance.

The source-only TypeScript contract validates strict input and captures an independent, deeply frozen intent before any asynchronous work. Its fact resolver reuses the actual literal-source validator and requires renewed confirmation if validation would change the saved context. It accepts a freshly owner-checked record; it does not itself authenticate or establish ownership. SQL remains responsible for locked reference resolution and hashes.

## Evidence and review

See [verification receipt](verification.json), [independent review](independent-review.md) and [native race receipt](native-postgres.json). The local suites use created identities and sources. Embedded PGlite checks and native multi-connection PostgreSQL checks are recorded separately. Native authentication and Storage tables are fixtures; neither is hosted customer acceptance.

The final full suite passed **1,905 tests in 115 files**, including 42 new SQL and 26 new intent/fact-contract cases. App TypeScript and a targeted check of the shared helper/test passed. Nine native PostgreSQL 17.11 groups observed blocking across separate sessions for identical/conflicting requests, the final variant slot, stale revisions, source edits and both erasure orders. The final native schema includes the existing selected-preparation migration before the new variant migration. The pinned vendor archive was verified before execution; the cluster stopped and a subsequent process read found no PostgreSQL processes.

The first full run had one failure in an unchanged saved-check import test: it checked the route before the deferred router transition committed. The unchanged 38-case file passed by itself. The test now awaits the same exact `/loop` expectation, and the final complete suite passes. No application code or assertion value was changed. No frontend build, Deno handler run, live HTTP check or browser journey was repeated for these unregistered source helpers and schema tests.

Three separately assigned agent contexts contributed SQL implementation, native concurrency verification and independent review; the coordinator implemented the strict intent/fact contract and ran the combined validation. Corrections found during review are recorded in the review report. This is bounded source review, not independent certification of the complete product.

## Before customer exposure

1. Add the authenticated control/client save and exact read contract, deriving the owner from the session and binding every result to its original auth, lifecycle, source and draft lifetime. Implement clear consent, retry recovery and independent variant fact review.
2. Bind a chosen variant ID, revision and immutable profile/fact snapshot into manual and scheduled request identity. Preserve the existing NULL/legacy behavior. Never implement selection by swapping the global profile.
3. Make worker reuse, packet identity, preview, approval and download variant-aware. Recheck current fact sharing and withdrawal: a historical snapshot does not freeze permission forever. Preserve historical outputs and exact-artifact approval.
4. Implement recurring weekday choices, calendar-day semantics, server-held allowances, retry/missed-run rules and explicit recurring provider/source-scope consent. Existing rules schedules must not be silently upgraded to AI.
5. Complete first/second variant browser tasks, hosted synthetic worker/Storage acceptance and independent combined review before coordinated migration/control/worker/site exposure.

No frontend caller, runtime dispatch, generated handler or UI change is included here. No production migration, provider/search call, purchase, candidate mutation, GC configuration query or deployment occurred. Public v32, its saved artifact and all previous rollback references remain authoritative. The new source rollback tag is `jobvance-before-cv-variants-2026-10-17`; source rollback is not database/file restoration. The earlier 100-case matrix remains a synthetic assessment, with its original limitations and no score uplift.
