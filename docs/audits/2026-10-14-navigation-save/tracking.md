# JV-01: unsaved application tracking recovery

Scope: Workspace application tracker and Job Loop opportunity tracker only. Completed 2026-10-14 using fictional local component fixtures. This is a bounded data-loss repair, not a product-wide usability sign-off.

## Reproduced problem

Both rows originally kept editable notes and follow-up dates in child state. Switching tabs or routes unmounted that state. Job Loop also keyed rows by their current server fields, so a refreshed snapshot could remount the editor. A failed or pending status choice could consequently disappear. Workspace's parent operation handler also lacked a complete identity boundary for late completion after an account change.

## Implemented behavior

- A shared memory-only helper retains the editable status, follow-up date and notes for 30 minutes, bounded to 100 application drafts. It writes no browser storage and makes no network calls.
- Recovery is scoped to owner, application, surface and an owner-authority revision; Job Loop also requires the current lifecycle generation. Confirmed account transitions invalidate old writers, including A → B → A. Lower or different Loop generations cannot recover old text.
- Restored status never restores an attestation or submits a request automatically. An explicitly saved changed status needs fresh confirmation. Workspace's existing immediate save after a fresh dropdown selection remains supported.
- Dirty-field masks preserve only the user's edits across refresh and recovery. Untouched fields adopt newer authoritative values. For example, editing a note at Saved no longer freezes Saved if the server later reports Interview. Workspace notes/date-only updates omit status.
- Successful acknowledgement clears only the exact submitted snapshot and advances its field baselines. Text edited during a pending save remains recoverable. Failed saves retain edits. Successful deletion or an authoritative removed-application list clears the corresponding recovery entry.
- Workspace's operation handler captures owner, authority revision, operation revision and mount lifetime. Account/authority transitions release its busy lock; late results cannot publish the former owner's notice or clear a newer operation. Job Loop's existing request-reset boundary now also observes owner authority.
- A changed authoritative status resets local status confirmation. Job Loop rows now have a stable owner/application/lifecycle identity instead of remounting on ordinary field changes.

Implementation: `src/lib/tracking-draft-memory.ts`, `src/pages/Workspace.tsx`, `src/pages/JobLoop.tsx`. Authentication authority wiring was supplied separately by the coordinator in AuthProvider.

## Verification

Final scoped run: **5 files, 83 tests passed**:

- `src/__tests__/lib/tracking-draft-memory.test.ts`
- `src/__tests__/tracking-navigation-save.test.tsx`
- `src/__tests__/independent-tracking-navigation-save.test.tsx` (independent reviewer)
- `src/__tests__/workspace-journey.test.tsx`
- `src/__tests__/job-loop-journey.test.tsx`

The focused cases cover tab/route unmount, failed and pending saves, edits during pending saves, fresh attestation, exact acknowledgement, deletion, TTL/cap, account/lifecycle isolation, A → B → A stale completion, field-wise server refresh/recovery and a genuine recovered status conflict. Independent full-Workspace fixtures additionally exercise parent pending-operation completion/rejection after an account change. TypeScript application checking and scoped whitespace checking passed after the final changes.

## Limits

These are deterministic local component and helper tests; no real candidate data, provider calls or live backend writes were used. Memory recovery survives client-side navigation, not a full page reload or closed browser. Existing UTC-noon follow-up conversion was preserved. This slice does not establish live multi-tab consistency, overall conversion quality, or closure of the broader usability backlog. The coordinator owns full-suite/build verification and publication.
