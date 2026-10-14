# Bounded CV-check source and save repair

14 October 2026. Baseline checkout `84ce5f3`, public runtime v25 `7a7af403bd62ea6d10bf056b68a67c5e5cbfe9de`. This changes only the CV-check component, its optional recovery reference and local regression tests. No schema, provider, payment or application-workflow redesign.

## Trace and reproduction

Three local component cases were written first and failed against the baseline:

1. Returning to the source step and replacing its text set `reviewedText` to empty and cleared the existing source undo. File extraction also replaced source/final state, without retaining arbitrary replacement history. There was no undo action for that operation.
2. `save()` and `download()` both used `busy`. A pending optional account save disabled approved TXT, DOCX and otherwise-ready PDF exports.
3. Every `approve()` created a new request UUID. The account API already reconciles immutable snapshots by owner/request ID and validates the recovered payload, but unchanged reapproval after an uncertain save discarded the identifier needed for reconciliation.

The tests use synthetic document text, mocked authentication/account calls, controlled promises and mocked download delivery. They do not create an account, call Supabase or deliver a real browser file.

## Changes

- A source replacement retains an owner-bound, page-memory snapshot of the exact prior source/final draft, filename, page target, step, review/reuse state, prior source/adoption undo, next-application undo and save reference. Continuous typing retains the pre-edit baseline. Successful file reading retains an undo even if the source text matches, because it can still clear final edits or change file metadata. `Undo source replacement` restores that snapshot with approval, PDF assets and save consent cleared. It does not mutate saved account snapshots. Reset/account changes discard the undo; it is never put in recovery storage.
- Optional account saving has separate pending/error/success state. It cannot block already-approved local exports or clear a newer local operation's busy state. Existing mounted/owner/revision checks reject late success/error/finally updates after source edits, reset, owner change or unmount. Save success appears only after the account API confirms/reconciles a record.
- An exact review key retains its request ID across unchanged reapproval, route recovery and an explicitly consented refresh. Changed approved text/method gets a new reference. Reset/new application/owner changes start a new identity; deliberate undo restores the prior application's reference. Opening an owned saved record seeds its existing reference rather than inventing another save.
- The bounded recovery helper accepts an optional UUID/key pair. Recovery retains this pair only when it matches the current draft/report exactly. This condition matters: an early regression run showed that persisting an old raw key could retain wording removed for privacy. The writer now omits stale keys, and the existing confidential-source removal/adoption assertions pass unchanged. Undo history remains memory-only. Approval and storage consent still require review again.

Main implementation: `src/pages/CvCheck.tsx` (`SourceReplacementUndo`, `replaceSourceText`, `undoSourceReplacement`, recovery effect, `approve`, `save`). Helper: `src/lib/check-draft.ts` (`CheckSaveReference`, optional bounded recovery field). Existing API reconciliation in `src/lib/free-check-api.ts` is unchanged.

## Verification

- Initial three targeted tests failed for the expected missing undo, disabled export and changed UUID behaviors.
- The first corrected regression batch passed 139 tests across seven scoped files: CV journey, prior work preservation, review state, operation ownership, draft helper, free-check API and the new repair file. This includes prior U06/U07 and source/adoption/line-removal/next-application undo/privacy checks.
- Two further targeted cases pass: rereading an identical source file restores literal prior source/final text and metadata; explicit reset starts a distinct save identity even if a later check uses identical content. The final new repair file has five passing cases.
- Application TypeScript passed. The separately assigned reviewer owns additional delayed-owner/export/recovery acceptance tests; its result is recorded by the coordinator rather than invented here.

These are local controlled checks, not hosted signup/OAuth, Supabase acceptance, native downloaded-file inspection or a customer-success result. The shared application home and reduced fact review remain separate future work. No paid API call, production mutation, Git operation or deployment was performed by this subtask.
