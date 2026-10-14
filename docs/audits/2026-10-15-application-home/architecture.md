# Applications home: smallest coherent boundary

15 October 2026. Read-only architecture assessment against checkout `6bb6ca6`. This is a design boundary, not an implemented feature or a score. Existing tracker/usability findings U03/U04/U05 and JV-03/04 remain partial/open.

## Product decision

Make `/applications` one owner-private list of the candidate's actual work, with a selected application's vacancy, documents, progress and next action visible on the same page. Do not replace it with three product links. Keep the existing record stores and authoritative actions; start with adapters rather than a destructive migration to a fourth record system.

A candidate should open the list, choose the role, see what has been prepared and what remains, then continue that exact item. Checking a CV, saving a document and reporting an application are different events. Display document readiness and reported application progress separately; an approved CV is not an applied job.

The immediate implementation chosen by the coordinator is **explicit saved-check → Loop draft continuation**, described below. The Applications home itself is deferred until its read path and source selection are safe. Do not advertise a completed shared home as a result of that continuation.

## Existing records and actual joins

| Source | Actual identity and relationship | Preserve in the home |
|---|---|---|
| Saved free check | `cv_checks.id`, owner, immutable request ID, original/final CV texts, vacancy text; no tracker foreign key | A saved document/version with its actual role and company. Reopen for a fresh review; historical `approved` is not a restored local export approval. |
| Existing pack and tracker | `application_packs.id`; `tracked_applications.pack_id` can link the two; manual tracker entries have no pack | Group only by this real relationship. Retain independent manual entries and existing notes/date/status. |
| Loop opportunity and outputs | `LoopOpportunity.id`; each packet names `opportunityId`, run, profile/claim revisions and input hash | One opportunity row with all its output attempts; distinguish held/revoked/stale/current and candidate-reported progress. |

Never merge records merely because title, company, URL or CV wording looks similar. A candidate may deliberately keep different applications or versions. Previously unlinked check/tracker rows must remain visible without invented associations.

Evidence: `src/lib/free-check-api.ts:5` and `:85` (immutable snapshots/owner checks); `src/lib/cv-database.ts:17` and `:37` (pack/tracker fields); `supabase/functions/_shared/job-loop-types.ts:40` and `:57` (opportunity/packet relationships).

## Small home implementation

1. Add `ApplicationsHome` plus a pure `application-home` adapter. Its discriminated IDs are `check:<uuid>`, `pack:<uuid>`, `tracker:<uuid>`, and `loop:<generation>:<uuid>`. Keep raw IDs and source types; no guessed canonical ID. Pack-linked tracker data belongs on the same row. Unknown states are shown as unavailable, not empty or successful.
2. Load each source independently with owner-keyed requests. Failed Loop loading must not hide saved checks or packs; an entitlement failure must not hide saved documents. Fetch only fields needed for the list initially. Existing `listFreeChecks` loads full text; add a metadata/detail boundary before scaling rather than duplicating private text caches.
3. Render one list with useful role/company, document state, reported progress, last known date and one primary action. Selecting a row opens a real detail panel: original vacancy, available versions, explicit source label, current progress/reminder/notes where those fields exist, and the exact continuation action. “No progress recorded” is valid for a check without a tracker row.
4. Use source actions for actual work: free check → existing check review; pack → existing pack review/download; Loop opportunity → its exact current output or its source record. Keep approval/download enforcement in those flows. Do not copy their source checks into a generic download button.
5. Add an empty-state primary action, “Check a CV against a job”, opening `/check`; optionally “Record an application” for a simple manual tracker record. Add no persona questionnaire or compulsory cloud enrollment.

Use deterministic next actions, not invented completion percentages: review an unfinished document; inspect a held/stale output; download a valid approved version; update a due reminder; add missing vacancy details. Opening an employer page never changes status to applied. Existing status attestations and dirty-field draft/acknowledgment semantics must survive reuse.

### Read-path blocker

Do **not** call current Loop `{action:'get'}` for every Applications visitor. `supabase/functions/_shared/job-loop-runtime.ts:77` uses `getLoopSnapshot(..., initialize=true)`; repository `record(..., initialize=true)` invokes `job_loop_open_record` (`src` is not the authority here: see `supabase/functions/_shared/job-loop-repository.ts:45`). The SQL open function activates a fresh lifetime (`supabase/migrations/20261014131351_job_loop_request_generation.sql:34`). A passive list must not recreate an erased record or enroll a new one.

Add a separate authenticated, side-effect-free application-summary action that derives the owner from the session and reads **existing** Loop state only. Absent/erased means no active Loop applications; erasing returns a continuation state, not old private documents. Read existing lifecycle and record/packet metadata consistently; never route through open/enroll. Return lifecycle generation and record version for active details; recheck generation at the end of a multi-query read. Normal action boundaries remain authoritative after a stale list result. No client access to the private lifecycle table or new service-role browser access is needed.

Existing owner RLS allows select on Loop records/runs/packets (`supabase/migrations/20261011010000_job_loop_cloud.sql:74`), but a raw client projection lacks the current durable lifecycle generation. Do not bypass the lifecycle problem by treating record version as generation.

## Exact item selection and authentication

- Workspace currently keeps chosen pack in `selectedId` memory; `choosePack` changes only `tab=tailor` (`src/pages/Workspace.tsx:198`, `:223`, `:290`). A link to that tab does not reopen the chosen pack.
- Loop tabs and selected packet are also in page memory (`src/pages/JobLoop.tsx:113`, `:121`); arbitrary `?tab=outputs` currently has no implementation.
- Check reopening is the internal `openSaved` function (`src/pages/CvCheck.tsx:405`), which deliberately recomputes evidence and clears approval. Do not inject an object through arbitrary route state and bypass this logic.

Add one typed, bounded selector per existing destination, resolved only against freshly fetched owner records. Source IDs select; they never authorize. On missing/deleted/stale ID, show an explicit unavailable selection and the surviving list, not the first unrelated item. Keep CV/vacancy text, signed URLs, tokens and names out of route parameters. Preserve the selected destination through auth only with a strict path/type/UUID parser and existing TTL/single-use storage; the current fixed account allowlist does not yet support `/applications` or record selectors (`src/lib/account-return.ts:7`). Do not broaden it to arbitrary relative URLs. The initial slice need not change ordinary `/auth`'s `/dashboard` default.

Scope view state and asynchronous work to authenticated owner **and** confirmed auth lifetime, plus Loop generation. Reset details, pending fetches, form flags and approval/attestation on an owner/lifetime change, including A→B→A. Reuse existing tracking-draft memory ownership authority; do not restore its attestation from storage. A URL selecting a prior Loop opportunity cannot revive a draft after erasure/fresh enrollment.

## Immediate saved-check → Loop continuation

The safe small feature is a **previewed local import**, not automatic migration:

1. Candidate selects a specifically owned saved check, chooses approved-final versus original source text deliberately, and sees what will enter the Loop draft. Default to the reviewed final text to avoid silently restoring information removed later; original source remains an explicit alternative with a privacy warning.
2. Pass only the saved check ID and bounded CV-version choice in the route. Loop fetches the check for the current confirmed owner, then checks the still-current owner/auth lifetime after the await. Guest local drafts require the existing separate Google retention consent or inline email flow; do not put their text in a URL or persist it under a new generic key.
3. Wait for a current active Loop generation before retaining or applying the imported draft. Any erasure/owner/lifetime transition invalidates the import. Do not replay an import first accepted for generation G into fresh G+2. Refresh restores no historical consent or approval.
4. Copy the chosen text exactly. Copy only existing target role/company/vacancy description; do not invent the employer link or location. Checks currently have no URL/location fields, while Loop requires an HTTPS source URL (`src/pages/JobLoop.tsx:312`). Ask only for those missing details when the candidate proceeds. Conservative `copyLoopSourceDetails` may suggest existing name/contact text for review, never fabricate identity.
5. If a Loop profile or unsaved edits already exist, show an explicit keep/replace choice before touching them. Preserve replacement undo and existing local source/edit controls. Opening the import link must not silently replace a career record, set confirmed/shareable claims, or consume private save/model/inbox/recurring consent.
6. Candidate reviews and explicitly saves the career record, confirms useful source facts, then separately saves the imported vacancy. No automatic run, inbox connection, paid call, model processing or employer submission. Existing source provenance and packet guards continue to apply.

Existing `saveTracker` (`src/pages/CvCheck.tsx:397`) inserts an unrelated manual tracker entry with blank URL and no check association. Page-local `tracked` prevents only a repeat in that open page. Before offering a generic “track this saved check” action in the new home, add a real owner-checked, unique check→tracker relationship and idempotent operation; never overwrite existing reported progress. Old unlinked records remain intact. This linking is separate from the immediate draft continuation.

## Per-vacancy composition boundary

The current `start_run` request has no selected opportunity (`supabase/functions/_shared/job-loop-types.ts:132`); the worker chooses from eligible opportunities (`supabase/functions/_shared/job-loop-runtime.ts:18`, `:256`). Do not name a row button “Prepare only this job” until backend request hashing, snapshot, persisted run and worker selection carry an exact chosen opportunity ID/list. A future scoped request must bind owner, lifecycle generation, record version and selected opportunity; its idempotency identity must include that selection. It must fail if unavailable, not substitute a different role. Keep manual scoped preparation separate from optional search/inbox discovery and the shared $50 cap.

## Acceptance gates

- Checks, standalone packs, pack-linked tracker rows, manual rows and Loop opportunities all remain visible with correct exact relationships; duplicate titles never auto-merge.
- A failed source read does not erase another source's loaded results or masquerade as “no applications”. Passive home read never activates/reenrolls an absent/erased Loop record.
- Opening a particular item, signing in by email or Google, refreshing, and using Back opens the same owned record or an honest unavailable message. Malformed selectors/external returns fail closed.
- A→B→A delayed fetches/import/save callbacks cannot display or apply previous private text; erasure/fresh generation invalidates a pending import and recovered Loop draft.
- Final-CV import preserves exact edits/removals, original-source alternative is explicit, existing record/dirty draft replacement requires choice and undo, and approval/consents are cleared.
- First and second vacancies reuse chosen CV/facts without changing the first saved check, its tracker progress or approved output. No URL, contact, qualification, submission, model use or successful run is invented.

No runtime, database, Git or deployment edits were made for this design. The shared home, canonical linkage and scoped worker preparation are not marked complete by it.
