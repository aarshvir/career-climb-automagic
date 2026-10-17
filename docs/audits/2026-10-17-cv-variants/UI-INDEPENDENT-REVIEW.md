# Independent review: private CV variant UI and recovery

The acceptance/review agent reviewed this source separately from the implementation authors. Exact file hashes and review time are in `ui-independent-review.json`. This review covers the bounded private variant editor and its recovery integration, not variant-based preparation or the complete paid Job Loop offering.

## Result and executed evidence

No remaining material blocker was found within this bounded source scope after the corrections below. The reviewer independently ran **59 passing tests across five files**: 28 independently authored recovery cases, 16 component-author cases, nine separately authored component adversarial cases, one independently authored actual-JobLoop integration case, and five AuthProvider/tracking authority cases. `ui-independent-verification.json` preserves the runner results with absolute test filename prefixes removed; the original output remains in private sibling evidence.

These are automated local tests using synthetic sessions and records. Recovery tests execute the actual helper and tracking authority, including module reloads and browser-storage failures. Component tests execute the actual component with intercepted API responses. The actual-JobLoop case executes the full page and its variant panel together. They do not establish hosted persistence, a live Supabase session, an actual browser journey, paid provider processing or unassisted customer success. Root's separate desktop/mobile observations are not counted as this reviewer's test execution.

## Defects corrected during review

- **A successful retry could clear newer edits made before the retry.** Comparing only the edit counter captured when retry began missed those earlier changes. The component now compares the current draft's exact fields with the original submitted intent as well as its synchronous edit counter. The original request is retried without clearing newer local text.
- **A route change could lose the association between a confirmed first save and newer edits.** Root identified this case and the separate component reviewer reproduced it. The corrected component retains the original confirmed request alongside newer text until the user explicitly continues on the saved variant, discards it, or deliberately stops retrying. Returning to the route requires a fresh retry acknowledgement and recovers the same saved identity; newer edits do not silently become a second creation.
- **A stale stop-retry acknowledgement could abandon the original identity in the same event batch as an edit.** The handler now checks the synchronous acknowledgement epoch, active request identity, inspected-list identity and operation state. Editing invalidates that acknowledgement immediately.
- **Recovery copy could promise memory retention after retention had failed.** The UI now checks both retention result fields and explicitly warns when the draft cannot be retained, instead of claiming page-memory recovery. Unsupported input cannot replace the last valid pending recovery record.

## Lifetime, consent and source boundaries

The default recovery uses page memory for thirty minutes. Refresh recovery requires a separate unchecked opt-in and a confirmed SDK session containing a valid non-secret session identifier tied to the owner. The helper never stores the access token or its signature. Same-session token refresh retains authority; a different same-owner sign-in increments tracking authority and rejects previous writers. The JWT payload parser is only a discriminator after the trusted SDK session event, not an authentication mechanism.

Independent tests exercise owner A→B→A, changed session identity, unknown bootstrap, delayed foreign-owner observations, exact lifecycle matching, monotonic generation, expiry while the page remains open and expiry on read. Malformed envelopes, wrong owners/generations, extra approval fields, future/expired values and denied storage fail closed. Denied reads/writes and silent no-op writes do not falsely claim refresh recovery. Old request completion cannot clear a newer pending request.

The retained editable draft and the original pending request remain distinct, deep copied values. Intentionally emptied fields survive. Historical consent inside the captured original intent is not restored as a checked UI permission and cannot cause an automatic request. Private save, retry and device recovery all remain deliberate choices after recovery. The added privacy paragraph accurately distinguishes this opt-in session storage from existing general draft memory.

Selected claim references use exact current IDs and revisions. Changing source text clears inherited CV-passage selections, and unavailable current facts block a fresh save. A distinct CV source can be retained as an explicitly incomplete draft without confirmed facts. A historical receipt can acknowledge its original saved revision while showing a later current variant; the UI displays both and requires explicit continuation before applying new edits.

## Actual page wiring and version behavior

The actual-JobLoop regression verifies that the My CV panel calls `read_cv_variants` with the displayed generation and `save_cv_variant` with the original version, generation, request identity, profile and deliberate consent. Variant work produces no automatic main-profile save, run start or approval. An unrelated unsaved main-profile name stays intact.

A variant receipt intentionally does not advance the main workspace snapshot's version, because it is not a complete workspace snapshot. The UI instructs the user to refresh the workspace before other saved changes. The integration case confirms a separately authorized main-profile attempt still uses its original version and preserves its draft when the intercepted backend rejects that stale attempt. This is safe but leaves an explicit refresh step; smoother coordinated refresh without losing other drafts remains a later usability improvement.

## Remaining delivery gates

This is source-only evidence. It authorizes no production exposure by itself and claims no new migration application or deployment. The previously reviewed SQL/control contract and its historical native races retain their own scopes.

Independent per-variant fact creation/confirmation remains incomplete. Variant selection must still be bound to exact owner, lifecycle, variant revision and immutable run/packet source snapshots before it can power manual or scheduled preparation. Fresh runs must recheck current sharing/withdrawal authority; historical saved claims are not perpetual permission. Schedule binding, plan entitlements and billing are not delivered here. Hosted authenticated first/second variant preparation, review, approval and received/parsed exports, as well as unassisted customer acceptance, remain open. No product score or claim of perfection follows from these passing tests.
