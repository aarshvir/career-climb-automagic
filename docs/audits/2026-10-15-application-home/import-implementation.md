# Saved CV check → Job Loop: bounded draft continuation

15 October 2026. This implements the import portion of JV-03. It does not merge the existing stores/trackers, automate claim approval or complete per-vacancy composition.

## Result

An owned, approved saved check can now be previewed and deliberately copied into the existing Job Loop career-record and vacancy forms. The reviewed final CV is the default. The original source is a separate choice with a warning and fresh confirmation, because it can contain details removed from the final CV.

The new work adds no save, run, model, mailbox, approval or employer action. Copying changes local editable fields only. The candidate still reviews and saves through the existing controls, confirms their factual claims and supplies the actual employer vacancy link. Existing Loop entry/loading behavior is unchanged; this feature does not preload or initialize Loop from a public landing page.

## Concrete flow

1. A valid `/loop?fromCheck=<opaque UUID>` first goes through the existing authentication path. The actual signed-out Loop CTA also preserves that exact safe return path. Mailbox-return sign-in keeps its separate `/loop` destination.
2. After an authenticated, active Loop snapshot exists, the ID is bound to the current owner, confirmed authentication authority and lifecycle generation. The query is consumed with a replacement navigation to `/loop`; it is a selection hint, not consent or data authority.
3. The chooser uses the existing `listFreeChecks()` owner-verifying API. Without a continuation link, it reads only when the candidate opens **Choose a saved CV check**. It neither fetches from a public home nor replaces a missing/foreign check with another record.
4. The candidate sees role, company, exact CV-version preview and the saved vacancy. The default is **Reviewed final CV (recommended)**. Selecting the original requires **I reviewed the original source…** before the copy action can proceed.
5. If current source/vacancy fields exist, **Replace these local drafts** is required. That confirmation is tied to the exact current draft; another edit invalidates it. The warning lists the affected fields, including clearing the previous vacancy's link, location and recruiter details.
6. **Use this saved check** copies the chosen text, role/company/description into editable drafts. Existing profile name, contact line, target roles and other preferences remain. An untouched new record can derive its name/contact from the chosen CV, explicitly disclosed; existing or edited blanks are preserved. Blank target roles may start with the selected role, for review.
7. A single page-memory backup permits **Undo saved-check import**. The candidate reviews the prior draft and freshly confirms restoration. Edits after ticking that confirmation invalidate it. Undo expires on relevant save, leaving, changed owner/authentication authority, changed lifecycle or changed saved-record version.

## Scope and safeguards

- `src/pages/LoopSavedCheckImport.tsx` validates ownership, approved status, opaque ID and bounded source/final/vacancy fields. Foreign-owner read results fail closed. Recent selectable rows are capped at 50; a valid exact linked older record is resolved against all eligible owner-validated results and included, for at most 51 choices.
- Async reads have an active-request guard and a current-scope check. The parent additionally checks the current mounted owner, confirmed authentication authority and Loop lifecycle generation before importing or undoing. A→B→A authentication changes cannot revive a prior A request just because the account ID matches again.
- Unknown/loading authentication hides the chooser. Returning requires a fresh owner-verified read; original-source and replacement confirmations are not recovered.
- The preview is keyed by owner/authentication authority/lifecycle. A fresh lifecycle clears the selected check, old route hint and undo. A consumed URL cannot automatically apply an older selection when the record is freshly initialized.
- Import is blocked while claim edits are unsaved. Source replacement invalidates suggestions through the existing `importSource()`/`editProfile()` path. Undo keeps suggestions unconfirmed and not shareable.
- Profile-save, fact, disclosure, recipient, model, inbox and optional Gmail permission inputs are cleared on both import and undo. Old recruiter fields are not attached to the new vacancy. Undo restores their text only with contact confirmation cleared.
- The backup is one bounded local snapshot, not browser storage or a new account record. Current working drafts use the existing owner/epoch-bound memory helper; the previous undo snapshot does not survive route unmount or refresh.

Main integration references: `src/pages/JobLoop.tsx:132` (scoped state), `:185` (one-time route binding), `:256` (existing source importer with header preservation), `:263` (draft-bound replacement), `:268` (scope guard), `:275` (explicit copy), `:290` (fresh-confirmation undo), `:440` (actual guest return path) and `:468` (chooser/undo UI).

The chooser stylesheet only scopes native-control minimum/maximum widths and radio-label layout. The coordinator's isolated mobile fixture reported no horizontal overflow at 390 pixels with long role/company values. This is narrow created-data presentation evidence, not an unassisted customer session.

## Verification

`src/__tests__/job-loop-saved-check-import.test.tsx` has **19 passing component/integration cases** using the actual Job Loop parent and router, with fictional local checks and mocked account/Loop boundaries:

- Actual guest sign-in link preserves the safe opaque ID without loading records.
- Preview precedes copy; final text is the default; removed source detail is not imported silently.
- Original-source copying requires its separate warning/confirmation.
- An exact owned link beyond the first 50 recent records remains usable.
- Ordinary entry waits for the chooser to be opened; selection remains blank without a hint.
- Existing drafts require confirmation bound to the current fields. Undo needs fresh confirmation, which a newer edit invalidates.
- Nonblank profile fields/preferences and intentional blank headers remain unchanged. Blank targets are seeded only for review.
- Unsaved claim edits block import.
- Failed reads preserve the current draft and offer retry; foreign-owner data is not rendered.
- Delayed prior-owner success/error is ignored, including A→B→A with the same account ID and a new authentication authority.
- Unknown/loading authentication hides the preview, requires a fresh owned read and resets the version to final.
- Prior-lifecycle pending reads are ignored. Fresh same-owner lifecycle clears selection/undo and does not replay the consumed URL.

The same run included the 50 existing Loop journey cases: **69/69 cases across two files passed**, exit 0. Application TypeScript passed with `tsc --noEmit -p tsconfig.app.json`, exit 0. Each new copy scenario asserts that only the existing `get` action was called, with no new save/run/approve/model write. The existing `get` lifecycle initialization is not represented as a pure read or newly introduced by this feature.

The owner-verifying API itself is mocked in these integration tests; these results do not prove hosted sign-in, Supabase data acceptance, live imported-account persistence or a complete first-to-second application journey. The coordinator separately tested the protected route and isolated chooser; no production candidate record or paid call was used by this subtask.

## Review changes before freeze

Independent/root reviews found and corrected three concrete edge cases before the final test run: older linked checks were initially outside the recent-50 chooser cap; the actual signed-out Loop CTA initially dropped the safe selection ID; and empty profile headers needed an existing/edited-profile guard rather than blanket autofill. Undo wording was also aligned with record-version invalidation. Requested authority tests, fresh undo confirmation and unknown-auth cases are included above.

This subtask edited only `JobLoop.tsx`, the new chooser/CSS, its new test file and this report. No commit, deployment, schema change, production account action or paid service call was performed.
