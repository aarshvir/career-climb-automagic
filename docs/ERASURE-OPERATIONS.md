# Jobvance erasure operations

Reviewed 14 October 2026, including v24 request-generation binding. This describes the deployed Loop-only operation and a whole-account verification checklist. It does not authorize deleting a real account or certify that the whole-account process has been built or rehearsed.

## Candidate: erase Job Loop only

1. Sign in to Jobvance and open **Job Loop → Help & privacy**.
2. Select **Review Job Loop erasure**. Read the scope: career record, preparation documents, schedule and stored mailbox connection. Sign-in, separate workspace records and external copies remain.
3. Type `DELETE JOB LOOP`, tick the scope confirmation and select **Erase my Job Loop data**.
4. If the service says cleanup is unfinished, select **Continue erasing Job Loop data**. The open page retains the confirmation. A large account may need several requests; the service removes at most 1,000 objects per request.
5. After closing or refreshing, the same account can see **Finish erasing your Job Loop**. Select **Review remaining erasure**, confirm the scope and continue. Opening the page does not automatically erase anything.
6. Completion is shown only after the server verifies the exact private artifact prefix is empty and removes the Loop authorities. A fresh empty record may then be opened. The monthly committed spending aggregate and minimal lifecycle/version metadata remain.

An account change clears the preceding account's continuation state. If service access fails without a confirmed erasure state, retry loading rather than assuming completion. Existing signed links expire after their configured short lifetime; downloaded files and Gmail drafts cannot be recalled by this operation.

## Owner: inspect an interrupted Loop erasure

1. Verify the request belongs to the authenticated candidate and confirm the requested scope. Do not use a guessed account identifier or an email supplied by another candidate as deletion authority.
2. Inspect only that owner's lifecycle generation/state, last attempt and bounded remaining-prefix metadata through an authenticated operator path. Counters record attempts, not a verified object count.
3. Keep the generation in `erasing`; do not reactivate the pilot or bypass the storage guard to make a run work. Retrying begin returns the same active generation.
4. Resume the normal authenticated control operation. It obtains bounded flat path batches and calls Storage `remove`; never delete production `storage.objects` rows directly.
5. If a path is malformed, another owner appears, the generation changes, or a Storage error occurs, stop that attempt with the fence intact. Investigate metadata and retry through the supported path. Do not broaden the prefix or discard the lifecycle row.
6. Save a private receipt with scope, generation, attempted batches, service outcome and final empty-prefix readback. Do not put CV text, email tokens or signed document URLs in the receipt.
7. Preserve actual, reserved and uncertain shared monthly commitments. Erasure is not a budget refund. A late usage result whose authority has been erased cannot reopen the allowance.

## Whole-account request: unfinished operator checklist

The current **Privacy or account request** form records a request; it does not execute account-wide erasure. Before implementing or fulfilling that scope, rehearse it with an isolated synthetic account and verify each boundary below.

| Boundary | Required handling/readback |
|---|---|
| Job Loop | Run the fenced operation above to verified completion; include runs, packets, grants, schedules, activity, support records, OAuth states, encrypted connections and draft receipts. |
| Free check | Inventory/delete the owner's `cv_checks` rows separately; confirm originals, reviewed CV and vacancy text are gone. |
| Existing workspace | Inventory `cv_documents`, `application_packs` and `tracked_applications`, including original and derived text. Verify owner relationships before any removal. |
| Workspace files | Remove the exact owner's files from the private `cv-documents` bucket through Storage API and verify the prefix. Loop's `job-loop-artifacts` cleanup does not cover this bucket. |
| Older product stores | Inventory remaining owner-linked tables and legacy resume/variant/file stores from the actual schema; do not assume only the newest workspace exists. |
| Sign-in | Revoke sessions and handle Auth deletion only after owned storage/record scope is verified. An already-issued access token is not assumed invalid merely because a user row was deleted. Rehearse this independently. |
| Financial and model ledgers | Separate career text from committed cost/audit records. Preserve the shared monthly spending ceiling; determine a documented retention treatment rather than blindly cascading a refund or dropping global aggregates. Checkout remains disabled. |
| Browser and external copies | Explain tab-memory/temporary-draft scope and clear candidate-controlled drafts where possible. Gmail-created drafts, downloads and employer copies require their own owner-controlled actions. Do not claim Jobvance erased those external copies. |
| Backups and restore | Document provider backup retention and rehearse isolated restore/re-erasure behavior. Do not describe a Git tag or frontend version as a database/file backup. |

Whole-account completion needs scope-specific receipts and readback, not a filename, support status or empty dashboard. No real account-wide deletion or restore was executed for the v23 release.

## Stale requests and rollback

After erasure and fresh setup, an old tab must refresh and review its action again. Never substitute the newest generation and automatically retry an old schedule, processing permission, mailbox operation, support message or erasure intent. Current erasure continuation is an authenticated read followed by a fresh explicit confirmation; the read itself does not delete anything. An old generation cannot erase a freshly initialized record.

The v24 bound control/worker/OAuth routines and table grants must remain coordinated. A saved frontend or Git tag does not undo those backend changes or restore records/files. Keep the exact pre-change native backups and rehearse coordinated restore in isolation before promising recovery.
