# Applications home and exact continuation — 15 October 2026

## Change

The private `/applications` page now lists saved checks, application packs, tracking entries and existing Job Loop vacancies together. Selecting an item shows its stored vacancy, CV versions, notes, dates and next action. Existing pack_id and opportunityId links preserve every linked tracker and recent document attempt; similar titles or companies are never treated as identity. Searches filter the loaded list. Missing sources are independently retryable and do not erase other available work.

Exact opaque selectors reopen the chosen saved check, pack, tracking entry or generation-bound Loop vacancy. They survive allowlisted sign-in returns. Reopening a saved check requires a fresh approval; replacing an existing draft is explicit with page-memory undo. Missing and malformed selectors never select the first available record. Workspace cache keys and CV checks use confirmed authentication lifetimes, including a batched account A → B → A transition.

The new `get_existing` control action reads records without initializing, enrolling or reactivating a Loop. It uses owner-filtered reads, handles absent/erasing states, and rejects changing generations or record versions. Native control version15 is ACTIVE with exact source readback; worker11 and OAuth5 were not redeployed. No schema migration or collection configuration change was made. An initial native deployment failed because the connector inherited the prior absolute import-map path; the retry explicitly supplied the existing relative deno.json and succeeded.

## Acceptance and limits

Three separately assigned contexts built/reviewed the home and passive backend; the coordinator implemented exact source routes. The independent review reproduced three related CvCheck authority edges: batched same-owner reauthentication approval, revoked-owner route mount, and delayed export completion before React updates. All were fixed with correct regressions. A normal Workspace pack-navigation reset regression was also corrected. Existing mocked auth fixtures were aligned with the real SDK authority transition without weakening assertions. The older Applications redirect expectation was updated to the actual new private home route. Local created-record browser inspection checked mixed sources, linked progress, exact continuation URLs, search and narrow-screen layout. These are isolated fixtures, not authenticated hosted customer records.

The backend had49 focused tests,13 source Deno handler tests and13 generated-bundle handler tests. Native deployed source matches reviewed control SHA256 `c74ab7f7c8b40747efa9bde41825d0afebff1f8cb67ce15891e654321e3bb6b9`; unauthenticated get_existing returns401. The final full suite passed1,372 tests in95 files; TypeScript and12 hosting check groups passed. The Worker is2,787,547 compressed bytes, below the3MiB limit. An intermediate packaging attempt rejected a transient symbolic-link entry in the OneDrive build directory; a fresh build passed the unchanged guard. Live publication evidence is recorded in the release receipt after verification.

No real candidate was changed, no paid AI/search request was made and no communication was sent. Reading the new home does not create a career record. Hosted authenticated source loading/import/save, fresh signup/OAuth and unassisted first/second application success remain unverified. Current readers load stored text and have platform row limits; Loop explicitly shows recent loaded attempts (150 packets/30 runs), not a complete historical archive. A missing recent packet does not prove none exists.

## Remaining work

JV-03/04 remain partial. This release is the existing-record home and exact continuation slice. New canonical saved-check/tracker/Loop relationships with additive idempotent writes, exact chosen-vacancy server request identity, application-specific composition and grouped review remain open. No title-based historical merge or unscoped run is presented as completion. No automatic score uplift, 95/98 rating, premium video or complete original-loop parity is claimed.

## Rollback

Saved v28 and tag `jobvance-before-applications-home-2026-10-15` at `09d2baecea84b2fcefa00cc77a15f3f50b2ce03b` preserve the previous frontend/source. Private before/after control sources are in the sibling repair-evidence directory. The additive control15 action remains compatible with the v28 frontend; frontend rollback does not require restoring handlers. Backend/file restore is separate and has not been rehearsed. Never restore older worker/handlers alone or remove lifecycle/path/tombstone fences. Production collection remains previously disabled; no fresh gate query is claimed for this release.
