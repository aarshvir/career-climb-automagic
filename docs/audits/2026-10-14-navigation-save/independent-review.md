# Independent review: navigation, optional saving and tracking drafts

14 October 2026. Bounded review of the navigation/save change against checkout `84ce5f3` / public v25. The reviewer authored separate acceptance tests and did not edit application code. All identities, documents and tracker rows used here are local fixtures.

## Result

No remaining release blocker was demonstrated within this change's tested scope. The independent files pass **15 cases**: 10 CV-check cases and 5 full-Workspace tracking cases. A combined run of those files, the implementation agents' focused tests and the authentication boundary tests passes **45 cases in 6 files**. Application TypeScript passes.

This is a bounded local result. It does not establish that the entire platform is best in class or that hosted signup, account persistence, native exports, payment or model/search services work. API calls, file extraction and document delivery are mocked; no real account, candidate record, paid call or production write was used.

## Findings addressed during this review

1. **Optional saving must not control the export lock.** The candidate's approved local downloads now remain usable while the optional account save is pending. A save completing while a local export remains pending cannot release that export's lock or deliver its file early. Save failure is presented beside the account controls. The independent tests exercise pending save/export completions in both orders. Implementation: `src/pages/CvCheck.tsx:143`, `src/pages/CvCheck.tsx:385`; acceptance: `src/__tests__/cv-check-independent-navigation-save.test.tsx:87` and `:103`.
2. **Undo needs the exact pre-replacement application, not a regenerated CV.** A continuous pasted-source replacement can be undone to the literal source, manually edited final, filename, page target and previous stage. Approval and privacy confirmations remain cleared. A delayed old owner's file read cannot resurrect its undo or replace the new owner's approved CV. Implementation: `src/pages/CvCheck.tsx:182`–`:201`; acceptance: `src/__tests__/cv-check-independent-navigation-save.test.tsx:197` and `:219`.
3. **Uncertain saves need a stable immutable identity.** Unchanged reapproval and owner-matched, consented refresh recovery retain the save request identifier. A factual edit creates another identifier. Delayed resolve/reject from either an earlier review or another owner cannot replace the current review, clear its pending save or affect its downloads. The code persists the raw exact-review key only when it still matches the current draft, avoiding hidden retention of removed text. Implementation: the recovery effect, `approve()` and `save()` in `src/pages/CvCheck.tsx`, plus `CheckSaveReference` in `src/lib/check-draft.ts`; acceptance: `src/__tests__/cv-check-independent-navigation-save.test.tsx:119`–`:194`.
4. **A row-level draft fence alone does not isolate the Workspace parent's lock and notices.** Review of the initial tracking implementation identified that an old owner's pending `run()` could block the next owner's first mutation or publish a late notice/error and release the next owner's lock. The implementation now checks owner, operation revision, mount state and synchronous tracking authority before parent state updates. Independent full-parent resolve and reject cases confirm owner B can start its operation, and owner A's completion cannot release B's still-pending operation. Implementation: `src/pages/Workspace.tsx:207`, `:270`; acceptance: `src/__tests__/independent-tracking-navigation-save.test.tsx:113`.
5. **A dirty note must not freeze an untouched status or date.** The first whole-draft recovery strategy could preserve an old Saved selector when an authoritative refresh had changed it to Interview. That would make saving the note risk reverting the newer status. The final helper retains a field mask and rebases untouched fields both in place and after route recovery. Workspace note/date-only saves omit status, also protecting a newer status that has not yet appeared locally. A recovered, deliberately edited status still needs fresh confirmation before explicit saving. Implementation: `src/lib/tracking-draft-memory.ts:86`–`:120`, `src/pages/Workspace.tsx:84`–`:89`; independent full-parent cases: `src/__tests__/independent-tracking-navigation-save.test.tsx:43`, `:64`, `:88`.

## Exact independent coverage

`src/__tests__/cv-check-independent-navigation-save.test.tsx` — 10 cases:

- Pending optional save leaves TXT, DOCX and otherwise-ready exact PDF enabled; the TXT delivery boundary is actually invoked.
- Save completion cannot clear a pending local export operation.
- Old owner save success and error are ignored while the next owner has its own pending save and approved downloads: 2 cases.
- Unchanged reapproval reuses an uncertain save reference; changed final text gets a new one.
- Earlier same-owner review save success and error are ignored while a changed review has its own pending save: 2 cases.
- Owner-matched consented cold refresh retains the uncertain reference while clearing approval and confirmations.
- Continuous source-edit undo restores exact prior source/final/step/filename/page preference while keeping approval cleared.
- An old owner's delayed extraction cannot restore its source undo or overwrite the next owner's approved review.

`src/__tests__/independent-tracking-navigation-save.test.tsx` — 5 cases, using the full Workspace parent and real React Query/router:

- A note-only draft survives refresh while an untouched selector adopts authoritative Interview. Saving sends no status field and leaves Interview intact.
- Route recovery merges the pending note onto the newer authoritative status and date; saving retains both.
- A failed candidate-reported Applied change recovered against a newer Interview row is not auto-saved or auto-attested. Explicit retry needs a fresh checkbox action.
- Pending owner A success and error cannot block owner B's first update, publish A's notice/error, or release B's newer pending operation: 2 cases.

These tests assert desired behavior, not archived observations of the broken version. Query refresh assertions wait for the observer update rather than treating the pre-notification render as a new defect.

## Additional code review boundaries

- Tracking draft memory is bounded to 30 minutes and 100 rows, remains in memory rather than browser storage, and includes owner, authority, application, surface and Loop lifecycle generation. Exact acknowledgement protects later edits; membership pruning and owner/generation changes invalidate old recovery. `src/lib/tracking-draft-memory.ts:5`–`:80`.
- `AuthProvider` changes tracking authority synchronously on confirmed SDK identity changes and successful session reads/sign-out. Unknown or failed bootstrap does not pretend to be confirmed sign-out. The coordinator's four boundary tests pass in the combined run. `src/contexts/AuthContext.tsx:55`–`:77`, `:141`–`:149`.
- Loop tracking uses the same scoped helper; fresh attestation is component state and is not restored. The implementation agent's Loop route/recovery, changed-status, owner/generation, acknowledgement and deletion cases pass in the combined run. The independent full-parent cases here cover Workspace, not an entire hosted Loop execution.
- The existing CvCheck owner/revision fences are tested for rendered account changes, same-owner changed reviews and late extraction/save completion. The new tracking authority mechanism has additional A→B→A coverage in the shared helper/row tests. This report does not generalize those local schedules to every possible authentication event ordering or unrelated Workspace upload/tailoring callbacks.
- Tracking recovery deliberately does not survive a hard browser reload or tab close. Source-replacement undo is also page memory only. Consented CV-check recovery has separate explicit storage consent; neither approval nor external-sharing attestation is recovered.

## Validation record

Command used locally, with workspace-local temporary directories and two test workers:

```text
vitest run src/__tests__/cv-check-independent-navigation-save.test.tsx src/__tests__/independent-tracking-navigation-save.test.tsx src/__tests__/cv-check-source-save.test.tsx src/__tests__/tracking-navigation-save.test.tsx src/__tests__/lib/tracking-draft-memory.test.ts src/__tests__/auth/tracking-owner-boundary.test.tsx --maxWorkers=2
```

Result: 6 files passed, 45 cases passed, exit 0. Application check: `tsc --noEmit -p tsconfig.app.json`, exit 0. These were the current edited source files at the time of review; release packaging and any hosted verification belong to the coordinator.

No Git operation, deployment, schema mutation, production erasure or customer outreach was performed by this reviewer.
