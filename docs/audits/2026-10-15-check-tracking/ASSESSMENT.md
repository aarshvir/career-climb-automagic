# Saved check and application progress: bounded repair

15 October 2026. Baseline public v29. This slice implements exact saved-check/tracker links; it does not complete JV-03/04 or establish a product score.

## Changed behavior

After explicitly saving a reviewed check privately, the candidate can choose **Track this saved check**. The database derives title/company from that exact owned immutable check, creates one tracking entry or returns the existing entry unchanged. Retry after a lost response or refresh uses the saved check ID rather than a page-local flag. Notes, status, reminder dates and prior reported application dates are retained. A different saved check stays separate even with the same title/company. No historical manual rows are guessed or merged.

Applications now displays the linked CV, vacancy and reported progress together. Failed source reads stay visibly unavailable; a missing source retains independent tracker access. Exact tracker deep links offer deliberate navigation to the linked check. A contradictory two-source row remains separate.

No CV text is saved by the tracking operation. Separate private-save consent remains required. Edits invalidate the previous saved snapshot's tracking action. Pending optional tracking cannot block local downloads, and owner/auth-lifetime changes suppress stale completions. Removing the saved check clears the relationship while retaining tracker progress; the timestamp trigger may update the tracker timestamp. Deleting then re-saving also resets the local tracking state.

## Independent work and verification

Three separately assigned agents implemented SQL, home projection and adversarial client/UI tests. The home agent independently reviewed SQL; its report distinguishes that from its own home self-review. The client/UI reviewer reported 19 passing independent tests before its session reached an account usage limit. Root added a twentieth deletion/re-save regression and completed validation. No additional model calls were purchased to replace interrupted agents.

- All **1,412 Vitest tests in 98 files passed**, including 40 added cases: 12 actual isolated SQL cases, 20 client/UI cases and 8 home cases.
- Application TypeScript and all 12 hosting check groups passed; compressed Worker 2,789,054 bytes.
- **Five native PostgreSQL 17.11 groups passed**. Separate backend PIDs and observed blocking cover concurrent first tracking, tracking-before-source-delete, source-delete-before-tracking, authorization/column privileges and legacy writes/same-title separation. Auth identity and unrelated pack fields are explicit local substitutes. See native-postgres.json. Cluster stopped; no postgres process remained.
- Initial native harness failure was multiline json_agg parsing in its final legacy-case observation. Root changed that observation to jsonb_agg and reran all five groups successfully; production SQL was unchanged.
- Actual isolated browser home displayed one saved check with its interview progress, note, follow-up date and exact tracker link. Screenshot retained privately. This is a created fixture, not a real account or authenticated hosted write.
- Production migration `cv_check_tracking_link` applied as **20261015071201**. Native schema readback confirmed constraints, exact routines, fixed search paths, no anonymous execution, no authenticated link-column writes, and continued notes/select/delete privileges. No production candidate row was created, changed or deleted by testing.
- Security advisors returned existing server-only RLS and unrelated definer/password notices; no track_cv_check finding. https://supabase.com/docs/guides/database/database-linter

## Limits and next slice

A model session usage limit interrupted the agents after the tests and SQL review described above; no later independent sign-off is inferred. Source/schema checks are not hosted PostgREST writes, real signup/OAuth or unassisted first/second application acceptance. The migration is additive and previous frontend manual/pack operations still work; source rollback cannot remove schema safely once links exist. Keep the link column, constraints and RPC when rolling back only the interface.

Saved-check-to-Loop persisted identity, exact chosen-vacancy run snapshot/worker selection and per-application composition/grouped review remain next. Existing Loop carryover remains explicit local draft import. No new model, media, billing, quota or collection-gate changes. GC stays at the previously disabled configuration, not freshly queried here.
