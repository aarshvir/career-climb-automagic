# Independent Applications home and exact-source review

15 October 2026. Reviewed the shared home projection/UI, passive Loop read, strict destinations and actual Check/Workspace/Loop continuation changes against the v28 baseline. Runtime changes belong to the coordinator and implementation agents. This reviewer changed tests and this report only.

## Bounded verdict

No remaining release-blocking finding in the frozen source reviewed here. The page is an actual combined list/detail view of existing records, not a set of product shortcuts. Exact source actions reopen their selected item or explain why it is unavailable; they do not silently open another application. This verdict covers the tested boundaries below, not a product-wide score, live persistence sign-off or completeness of all historical output retrieval.

## Findings corrected during review

1. **CV approval survived A → B → A.** Owner strings alone did not observe a confirmed account transition that React batched back to the same final owner. The independent regression first failed with TXT download still enabled. `CvCheck` now binds draft/render state, approvals, saved-list adoption and replacement selection to the confirmed tracking authority as well as owner.
2. **A stale owner could pass a newly mounted gate.** When SDK authority had already revoked A but React still rendered A, a new Check initialized both authority values to -1 and displayed A's recovered text. Signed-in negative authority now fails closed in rendering, retention and list loading. The regression verifies neither private text nor an old-owner list request appears.
3. **A delayed download could escape before React updated.** An approved TXT export awaiting its blob completed after synchronous SDK revocation and started the old private download. Awaited operations now check their captured render authority before publishing text, previews, notices or downloads. The independent deferred-blob case first reproduced the download, then passed after the fix.
4. **Workspace caches needed an auth lifetime.** The private query key now contains confirmed authority, preventing old same-owner cache entries from authorizing an exact-item review while a fresh lifetime's read is pending. Missing selections clear the prior review and download controls.
5. **Accepted uppercase selectors could falsely miss records.** Both exact-source and home selection parsers normalize UUID case. Strict query shapes and safe nonnegative Loop generations remain enforced.
6. **Auth failure needed a real recovery path.** The new protected home supplies retry and sign-in actions; its sign-in link retains the validated selected destination rather than dropping the item.
7. **Recent Loop output caps needed truthful wording.** Existing reads retain the 150-packet/30-run limits. Home and source detail now describe recent loaded attempts and acknowledge earlier outputs may exist. Missing recent results are not presented as proof no document was prepared.
8. **Ordinary pack navigation was affected by selector reset.** The coordinator identified a reset effect clearing normal pack selection when its tab URL changed. It now resets for exact selectors only; the independent regression opens the actual normal pack review across a URL change and ordinary tab navigation.

## Reviewed authority and product boundaries

- `src/pages/ApplicationsHome.tsx`: four independently settled owner-checked sources. A failed pack/tracker/Loop read does not hide a successfully loaded check. Authentication loading/error hides prior private detail, and owner/authority/request counters reject late results. Selected deletion or source refresh removes stale detail and continuation links. No first-row fallback occurs.
- `src/lib/application-home.ts`: only real `pack_id` and `opportunityId` links join records. Multiple linked trackers and loaded packet attempts survive. Identical title/company or raw UUID across sources is not a merge rule. A saved check has no invented submission progress. Packet document labels account for source revisions, held/revoked state and format readiness rather than treating `approved` alone as a fresh download grant.
- `src/lib/application-source-selection.ts`, `account-return.ts` and `MvpApp.tsx`: bounded opaque identities and Loop generation select existing data; no CV, token, signed URL, employer name or consent is carried as route authority. Existing sign-in destination TTL/single-use rules remain. Home navigation is private and excluded from public route generation.
- `CvCheck`: explicit selected-check review, informed current-draft replacement and an exact local undo; fresh approval remains required. A later current-draft edit withdraws the replacement permission. No account save, tracker insertion or download is caused merely by opening the link.
- `Workspace`: exact pack/tracker resolution is owner checked. An unavailable requested tracker does not show another row; changing to a missing pack removes the previous review. Existing saved-pack approval/download semantics remain in the source flow.
- `JobLoop`: the selected opportunity includes its lifecycle generation. An old-generation link displays a mismatch and exposes no current-lifetime tracking or output controls for that selection. Loaded attempts are restricted to that opportunity and keep existing approval/download guards.
- `getExistingLoopSnapshot` and repository readers: direct owner-scoped nullable lifecycle/record reads, followed by collection loading and final lifecycle/version checks. Absent and erasing states return no private snapshot. No open/enrollment/erasure-continuation RPC is used. The budget/scheduler snapshot SQL functions used by the shared builder were inspected and are read-only. Legacy records lacking lifecycle metadata fail honestly instead of being initialized or hidden as an empty success.

## Independent verification

Final run after the ordinary-navigation fix: **9 files / 102 tests passed**. Application TypeScript checking and scoped whitespace checks also passed.

New independent files:

- `src/__tests__/application-source-independent.test.tsx`: **11 cases**, including exact replacement/undo, fresh approval, permission withdrawal after edits, A → B → A, delayed list/download, revoked-owner mount, missing pack/tracker, cached auth lifetime, ordinary pack navigation and Loop generation mismatch.
- `src/__tests__/applications-home-independent.test.tsx`: **6 cases**, covering foreign data rejection with partial source success, delayed auth lifetime results, selected deletion, unresolved auth and actual many-to-one links with duplicate labels/IDs.

The same run included six existing CV suites and the backend agent's 17-case `supabase/tests/job-loop-existing-read.test.ts`. At the coordinator's request, five existing CV fixture files now issue `setTrackingDraftOwner` for confirmed mocked transitions, matching AuthProvider. Assertions were retained. Failed/unknown bootstrap still does not revoke authority; that distinction remains tested.

All fixtures are fictional local data. No real account, candidate record, provider call, purchase or employer action was used by this reviewer. Native edge deployment/readback, full build/suite and hosted verification are the coordinator's responsibility; they are not inferred from these local tests.

## Remaining limits

The home does not create missing saved-check/tracker relationships, merge lookalike applications, or implement preparation for only one chosen vacancy. Historical packets outside recent results still need a separate retrieval/pagination slice. Local tests simulate delayed transitions; they are not a real concurrent database/auth-session study. Already issued server/external actions cannot be recalled by a client reset. Mobile visual quality, conversion and real customer comprehension were not established in this review, and no 95/98 score is asserted.
