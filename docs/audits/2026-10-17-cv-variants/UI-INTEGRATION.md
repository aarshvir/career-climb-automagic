# CV variant editor and bounded recovery

17 October 2026. **Unpublished source integration. Public v32 and control16/worker12/tailor1/OAuth5 are unchanged. The variant migration is still unapplied.**

The My CV & experience panel now lets an owner deliberately load, inspect, create and edit up to three private CV variants through the previously completed authenticated contract. This is usable source management, not the completed three-CV recurring product: choosing a variant for preparation and independently confirming facts from a different CV remain unavailable and are described honestly.

## Source, facts and permission

Each editor retains its original record and variant revisions. Source text, name and contact edits stay separate from the main career profile. Current facts are offered only when the existing literal-source resolver accepts their exact ID/revision and current sharing authority. Editing CV source removes inherited passage selections; a draft with no confirmed facts can be saved but is not described as preparation-ready. Saved historical facts are inspectable separately from current eligibility. Nothing swaps the global profile, starts preparation, grants document approval or enables a schedule.

Private save needs a fresh checkbox tied to the exact current draft epoch. Source, fact, owner, session and generation changes invalidate stale permission and responses. An ambiguous request is retained separately from newer edits, with its original request UUID, source, references and versions. Retrying requires an explicit new acknowledgement and sends that original request. Its original saved revision and the current saved variant are displayed separately; current returned source is inspectable even after a refresh without a loaded list.

A successful old request cannot clear newer edits. The association with the saved variant remains recoverable through further edits and navigation until the owner explicitly chooses Continue edits to that exact saved variant. A permanent failure has a deliberate exit: refresh and inspect the saved list, acknowledge stopping the old retry, then review the current revision before another save. Abandoning retry never promises to undo a committed save.

The component does **not** copy a variant receipt's record version into a stale global snapshot. Main-profile edits remain untouched and fail closed under their original version until the owner's normal workspace refresh. The success notice explains this requirement. The actual JobLoop integration test checks this behavior; smoother coordinated refresh that preserves dirty drafts remains a future improvement.

## Route and refresh recovery

Default recovery stays in page memory for thirty minutes. A separate unchecked option permits this variant draft and exact original request to be stored in this tab's session storage for the recovery window. This includes CV text, so the option and privacy page disclose it. It does not store an access/refresh token, automatically retry, restore a save checkbox or carry preparation permission.

Refresh recovery requires the same owner, fresh workspace generation and SDK session identifier. The helper reads only the non-secret `session_id` discriminator from the SDK-provided session; it does not authenticate with that value. A same-owner new session revokes the existing synchronous draft authority, while an ordinary token refresh in the same session preserves it. Unknown or failed bootstrap does not discard recoverable work. Invalid/missing session identifiers or denied storage yield honest memory-only recovery. The helper bounds and validates stored data, clones it, expires it with a timer while open and checks expiry on read. Sign-out, account/lifecycle changes, explicit discard and opting out clear accessible stored recovery. The checkbox resets after recovery; further refresh persistence requires a fresh choice.

## Review corrections and verification

Separate agents implemented the UI and reviewed it. They reproduced and corrected retry-cleared newer edits, the lost association between a confirmed create request and later drafts after remount, stale same-batch stop-retry acknowledgement, a permanent-error dead end, missing current-source inspection after refresh and misleading recovery availability. The coordinator added auth-session-bound refresh recovery and privacy disclosure. The final [independent review](UI-INDEPENDENT-REVIEW.md) independently ran 59 cases and records exact reviewed hashes.

The complete suite passed **2,062 tests in 122 files**, including 55 added cases: 16 editor, 9 independently authored editor, 28 recovery, 1 actual JobLoop integration and 1 added AuthProvider session-identity case. App TypeScript, the complete production build and all twelve hosting groups passed. The generated hosting worker compressed to 2,815,167 bytes under the 3,145,728-byte limit. Exact build and hosting results are recorded in [ui-verification.json](ui-verification.json).

Actual isolated browser observations used the real component with a clearly labelled synthetic account and a local persistence/response adapter, never the hosted service:

- Desktop first variant: selected a current fact, opted into refresh recovery, simulated a committed save with an interrupted response, refreshed, reviewed and explicitly retried; exactly one variant appeared.
- Mobile second variant: changing source removed the inherited fact; the distinct empty-fact draft was saved with its readiness limitation. Viewport 390x844, document width 375; source text wrapped without horizontal overflow.
- Desktop third variant/edit: the three-variant limit disabled creation while edit remained available. An interrupted revision save, newer edits, successful original retry and another refresh preserved both the original request and newer wording. Explicit Continue then saved revision three to the same variant, with exactly three variants still listed.

Private screenshots and the bounded browser receipt retain the observation. The temporary viewport was reset, created tab closed and local server stopped. These are assisted local source-management checks, **not** worker execution, received exports, hosted persistence or unassisted customer acceptance. No new Deno/native SQL/hosted HTTP run is claimed; those contracts and schema are unchanged. Earlier native and handler evidence retains its original scope.

## Remaining product work

Independent per-variant fact confirmation and current withdrawal authority, exact immutable variant selection in manual/scheduled admission, worker snapshots, packet identity/reuse/approval/download, recurring entitlements/consent/discovery, and hosted first/second acceptance remain open. Full-route recovery for other preparation actions and all other tracked requirements remain open. This editor alone must not be deployed against control16 or called the finished three-variant product. Obtain combined review before coordinated schema/control/worker/site exposure.

No production migration, deployment, candidate mutation, paid call, checkout, billing or GC configuration change occurred. Rollback tag `jobvance-before-cv-variant-ui-2026-10-17` retains the preceding source contract; saved v32 and prior backend receipts remain. Source rollback is separate from database/file restoration.
