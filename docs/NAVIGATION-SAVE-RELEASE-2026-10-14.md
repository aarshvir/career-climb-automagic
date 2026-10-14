# Navigation and optional-save repair — 14 October 2026

Published **v26** on [Jobvance.io](https://jobvance.io) at **19:34 UTC**, source `637539cd16f5d70bfbdbffe0eec2fa59064eb335`. [Exact receipt](releases/2026-10-14-navigation-save.json) and [81 live HTTP checks](releases/2026-10-14-navigation-save-live-check.json).

This bounded JV-01 repair protects candidate work. It does not complete the shared application journey or justify a new product score.

## Shipped behavior

- **Source replacement undo:** deliberate text/file replacement retains the prior source, exact final edits, filename, page preference and application state in page memory. Undo restores them for fresh review, without restoring approval, PDF assets or storage consent. Account/reset changes discard the undo.
- **Optional save is independent of local export:** a pending account save no longer disables already approved TXT/DOCX/otherwise-ready PDF downloads. Save results cannot clear a newer export operation or affect another owner/review. Save success still requires confirmed persistence.
- **Stable save retries:** unchanged reapproval and owner-matched recovery retain the immutable request reference. Changed content or a new application starts another identity. A stale raw reference is not persisted alongside text that has been removed. Approval is never restored automatically.
- **Tracking drafts:** unsaved notes, dates and status choices survive client-side navigation for up to 30 minutes, bounded to 100 drafts. The store is memory-only and binds owner, application, surface, authority revision and, for Loop, lifecycle generation. It does not survive hard refresh or tab close.
- **Refresh and status conflicts:** recovery retains explicit edits while untouched fields adopt the current server baseline. Notes/date-only Workspace saves omit status; changed status needs fresh confirmation after recovery. Late acknowledgements do not erase newer edits. Account changes end old writers and operation notices/locks; confirmations never enter recovery memory.

Three separately assigned agents implemented/reviewed the CV and tracking slices. The coordinator added confirmed-auth authority wiring, reviewed field-conflict behavior and handled final validation/publication. [Trace and review index](audits/2026-10-14-navigation-save/COORDINATOR.md), [CV repair](audits/2026-10-14-navigation-save/cv-check.md), [tracking repair](audits/2026-10-14-navigation-save/tracking.md), [independent acceptance](audits/2026-10-14-navigation-save/independent-review.md).

## Validation and bounded hosted observation

The final full suite passed **1,198 tests in 85 files**, including 45 cases in six new files; TypeScript passed. Initial broad failures were stale fixtures/assertions from earlier request-generation/copy releases, corrected without backend/guide changes. A historical bad-behavior-only erasure observation is archived outside normal discovery; eleven current fencing regressions remain. Original receipts keep their historical provenance.

Production build: 38 public pages, 20 guides, zero external prerender requests, all 12 hosting groups passed, compressed Worker **2,770,484 bytes**. The prepared archive has 131 members, no source/environment/internal docs/dependencies and exact built Worker bytes. Native save/deploy succeeded; **81 live HTTP checks** matched current public/private route shells and the imported JavaScript/CSS bodies with the built Worker. Only the previously verified complete hosting suffix-script template is normalized.

A new Chrome tab on the published domain used only a created test CV/vacancy, with the already signed-in account. The six-step check displayed a one-page actual PDF preview; all three format buttons unlocked after approval. Replacing source and undoing it restored both the literal source and the unique final-edit marker; approval/download readiness then required renewed review. No check or tracker was saved, no real candidate record changed and no cloud run started. The created tab was closed.

**Native file delivery remains unverified.** The PDF button and direct prepared-file fallback timed out in the browser download observer; no matching file appeared at the checked ordinary destination. The browser tool explicitly reports blob retrieval unsupported. This does not prove ordinary customer downloads are broken. DOCX/TXT native delivery and actual file opening were not certified. A batched edit/continue action needed a settled retry, with no established cause. This scripted observation is not unassisted customer evidence, a fresh signup/OAuth test or a completed first/second-application study.

## Operation, rollback and remaining work

No schema or edge handler changed. v25 control14/worker11/OAuth5 and all existing lifecycle/path fences remain. Fresh read-only native configuration confirms **collection disabled, zero allowlisted owners**. No Storage deletion/claim, paid AI/search call, purchase, checkout, ad, outreach, email or employer submission occurred. The free ten-account pilot and shared US$50 UTC-month AI/search ledger remain.

Saved v25 remains available. Remote tag `jobvance-before-navigation-save-repair-2026-10-14` preserves source/documentation `84ce5f3b619e01506c5a108b2cd560362787f74c` (runtime v25 `7a7af40`). Existing older saved versions/tags and permanent GC/lifecycle fences remain. This is a source/UI rollback option, not a database/file restore rehearsal.

JV-01 now has the remaining controlled navigation/source/save regressions covered, while hosted auth/export and unassisted acceptance remain open. Next product work is JV-03/04: one application/home, explicit consented check carryover, chosen-vacancy preparation and application-specific composition; then lower-effort review and neutral entry. The audience split, other usability findings, original-loop/model parity and continuous walkthrough goals remain unfinished. Actual hosted Storage/dispatch/whole-account/restore verification remains pending and production collection stays off. The earlier 65/100 projection remains a v25 hypothetical assessment, with no automatic uplift assigned.

Packaging environment: the current Sites helper initially selected the Windows WSL Bash alias and GNU tar treated a drive prefix as remote. Selecting the installed Git Bash for the helper and `TAR_OPTIONS=--force-local` let the unchanged native source workflow finish successfully. The official installed npm CLI ran the unchanged project build after the helper's Windows npm shim failed. No production manifest or dependency workaround was introduced.
