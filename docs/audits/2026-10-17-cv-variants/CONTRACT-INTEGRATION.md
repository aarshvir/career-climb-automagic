# CV variant authenticated control and browser contract

Subsequent source slice: [candidate editor and recovery](UI-INTEGRATION.md). The evidence below retains its original contract-only scope; coordinated exposure remains pending.

17 October 2026. **Unpublished source integration. Public v32 and control16/worker12/tailor1/OAuth5 remain unchanged. The existing variant migration is still unapplied.**

The storage foundation now has authenticated `save_cv_variant` and passive `read_cv_variants` actions, strict repository response validation and a browser API boundary. No candidate-facing UI calls these actions yet. Saving three useful, independently reviewed CVs and choosing them for recurring preparation remain unfinished.

## What this contract does

The save action requires the original displayed lifecycle and record version, request UUID, optional exact variant ID, expected variant revision, label, complete source/profile, ordered exact fact references and explicit private-save consent. Owner, request/source hashes, approval, provider and schedule overrides are rejected. The edge handler derives the owner from verified authentication. The server captures the input before its first await; the browser independently copies and freezes it before authentication awaits.

The read action requires an already displayed lifecycle. It reads through the service-only bound RPC and never opens, enrolls or reactivates an absent record. Both actions check active lifecycle before access and again before publishing their response, withholding returned source data if erasure wins in between. The browser rejects an owner change, same-owner sign-out/return or a newer known lifecycle before or after dispatch. Reading the known browser generation never advances authority.

New saves at the exact current record version revalidate referenced facts using the actual literal-source validator. Their SQL write still resolves references under locks. If the record version changed, control deliberately leaves the original intent untouched and enters SQL: only its already committed exact receipt can succeed; an unseen stale request must fail the version gate. Thus later source edits or fact withdrawal cannot hide confirmation that an earlier private save succeeded, and they cannot authorize a new save. The existing migration is unchanged.

The response has a distinct `variantSave` receipt or `cvVariants` list. It does not replace the global Loop snapshot or imply preparation. Validation binds request, generation, exact update ID, saved revision and record version. When the current variant is still the originally saved revision, its source, label, ordered fact membership and source hash must agree with the original intent. A newer current revision is accepted only on an exact reused receipt. The original `savedRevision`/`sourceHash` and the current `variant` remain visibly separate in the data contract; a future UI must preserve that distinction and never clear newer draft edits because an older receipt returned.

Read receipts allow at most three distinct variant IDs and reject malformed, incomplete or unexpected fields. Structural validation of historical fact snapshots does not make them current sharing permission. Future preparation must check current withdrawal, revision and sharing authority again.

## Verification and independent review

The final complete suite passed **2,007 tests in 118 files**. The 102 added cases comprise 44 runtime/receipt cases, 43 browser API cases and 15 separately authored actual-control/PGlite cases. The latter execute the actual unchanged SQL migration through real control/repository code, including source changes or erasure between preflight, SQL and response publication. PGlite remains embedded SQL, not a new native multi-connection run.

An independent agent reran the 43 browser and 15 actual-SQL cases and reviewed source boundaries. It identified malformed claim categories being accepted through array-to-string coercion; explicit string checks and three regressions corrected this before the final full suite. [Independent report](CONTRACT-INDEPENDENT-REVIEW.md) and [receipt](contract-independent-review-receipt.json) retain the reviewed hashes and scope. Three separate agents contributed backend implementation, handler tests and independent review; the coordinator implemented the browser boundary and ran combined checks.

The actual edge-handler suite passed **22 source and 22 generated Deno cases**, including six new variant cases. Its intercepted SDK HTTP fixtures check verified owner derivation, saves, passive reads, retries, invalid authority/consent, absent records, withdrawn facts and response-time erasure. They reject unexpected external calls and do not exercise hosted persistence, a real provider or a worker run. The first generated invocation lacked permission to read its local bundle and ran no cases; granting read access only to `docs/supabase-loop-ui` allowed the unchanged final 22 cases to pass. No handler guard was relaxed.

App TypeScript passed. Production build/hosting and exact source/bundle hashes are recorded in [contract verification](contract-verification.json). Generated control/worker/OAuth files were refreshed locally; they are **not deployed bytes**. The prior nine native storage-race groups retain their original scope; their migration hash still matches this unchanged migration. No native race or browser customer journey was rerun in this contract slice.

## Remaining integration

- Add deliberate variant UI selection, source/fact review, fresh consent and original-request recovery across navigation/refresh. The API's frozen intent is not a completed recovery interface.
- Add independently confirmable facts for different variant sources. The current foundation permits an empty-fact draft but cannot prepare it as a reviewed CV.
- Bind exact variant ID/revision into manual and scheduled requests, worker snapshots, packet identity/reuse, preview, approval and download. Never select a variant by swapping the global profile. Keep historical outputs and current sharing controls.
- Complete recurring cadence/entitlement/retry rules, explicit recurring AI processing consent, useful discovery and hosted synthetic first/second acceptance. Proposed pricing remains non-purchasable; no automatic product-score uplift.
- Obtain combined review and coordinated migration/control/worker/site exposure after the feature is coherent. Do not expose this frontend against control16 or apply the variant migration as a standalone product release.

No schema change, production migration, deployment, candidate mutation, provider/search call, purchase, billing change or GC configuration query occurred. Saved v32/v31 and earlier rollback references remain. Source rollback tag `jobvance-before-cv-variant-contract-2026-10-17` points to the preceding storage foundation; source rollback is separate from database/file restoration.
