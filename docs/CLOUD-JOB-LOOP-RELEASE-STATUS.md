# Cloud Job Loop release evidence — 11 October 2026

The independent Jobvance frontend uses the existing Supabase project `gvftdfriujrkpptdueyb`. The new control API, background worker and disabled-by-default mailbox callback are deployed. The source release includes the `/loop` interface, model adapters and operator setup guides. Frontend publication and its exact source SHA/version are recorded by the Sites deployment history and the task's final release result.

## Verified behavior

Private career record → complete source-backed claims → user-supplied vacancy → checkpointed cloud run → per-role CV/evidence/letter → exact factual and disclosure approval → signed PDF/DOCX/TXT/report/letter downloads → manual application tracking/reload → withdrawal blocking fresh exports. Low heuristic overlap does not silently discard a vacancy the user explicitly added. Missing contact details hold outreach while allowing portal CV preparation.

The hosted run progressed without polling/continuation requests from the test client. Actual PDF/DOCX files were generated in the cloud; every downloaded format matched its immutable manifest hash. A second account could neither read the first account's packets nor obtain a download link. Clients could not forge run state or read the global budget/mail credential tables. No existing customer CV or application data was used.

An initial hosted test found that the original revocation function incorrectly exempted interview/applied-stage packets. `20261011020000_job_loop_revoke_all.sql` removes that exception and repairs stale approval metadata, preserving all files and application history. The control API also checks the current input version before exporting. The repeat hosted test passed withdrawal after a reported interview.

## Validation

- **410 tests / 33 files** passed in the complete repository suite, including the new regression.
- **5 native Deno tests** passed with typechecking, including an actual PDF render.
- **5 generated deployment-file checks** passed with intercepted requests and pinned external library imports.
- **40 first-party hosted checks** passed with two new fictional accounts. Zero paid calls, mailbox reads, sent messages, application submissions or permanent deletions.
- Typecheck, build and hosting-response checks passed. Lint had **zero errors** and 17 pre-existing warnings in legacy/UI files.
- Existing billing remained disabled. The new service's model/search/mail capabilities reported unavailable while their configuration was disabled.
- Eight new tables have RLS enabled; `job-loop-artifacts` is private. Both successful migrations are recorded in Supabase history.
- `trigger-make-run`, `check-email-provider` and `lemon-squeezy-webhook` now return **HTTP410** under the project's published anon credential. Their old integrations cannot bypass the new loop's controls through those routes. The original trigger source was backed up privately; the dashboard did not expose usable source for the other two old functions, so no complete remote-source backup is claimed for them. Existing data and unrelated functions are preserved.

Private hosted evidence is retained beside the repository in `jobvance-repair-evidence/cloud-loop-hosted-qa.json` and `legacy-retirement-hosted.json`; it is not included in public site assets. It contains no session credentials, CV content, signed download URLs or API keys.

## Operating limits and remaining account work

The pilot is free. Rules mode needs no paid model. The shared model/search ledger reserves a conservative maximum and enforces **$50 per UTC calendar month**, with three runs/person/day, one active run/person, five packets/run and three basic searches/run. Uncertain provider calls retain their reservation. This is Jobvance API usage accounting, not a limit on unrelated applications, subscriptions, taxes or a provider price change.

Claude, GPT and Kimi use one validated claim-selection contract; they cannot write ungrounded CV facts or choose arbitrary tool endpoints. Only confirmed facts explicitly marked shareable and vacancy text are sent after consent to the selected provider. The existing OpenAI secret was not read or copied; it can be reused, but its validity/balance are unverified. Paid calls remain off. Follow [the owner account guide](CLOUD-JOB-LOOP-ACCOUNTS.md) before enabling them.

Real external provider calls, funded credits and public Google restricted-scope approval have **not** been tested or purchased. Gmail remains disconnected. Its implementation requires separate permission and a callback-browser-only encrypted ticket, authenticated identity preview, explicit final confirmation and one-use activation; no owner-pollable pending credentials exist. The bounded inbox lane covers metadata for up to ten recruitment messages from seven days and reports partial coverage. Existing-thread replies remain manual. No send/apply route exists.

Runs are user-triggered and continue in the cloud after browser closure; daily scheduling is not configured. Employer/search sources must be configured and permitted; no logged-in LinkedIn scraper or browser-cookie bridge is provided. Relevance scores are heuristics, not ATS/hiring predictions. Unsupported PDF glyphs or excessive page counts hold a packet instead of silently dropping characters or facts. Signed links last two minutes; withdrawal blocks new links but cannot recall downloaded files or instantly invalidate an issued link.

Free hosting is best-effort, with no guaranteed availability/backups/restore time. Local PostgreSQL fixtures serialize one connection; the code uses real database locks, but no multi-connection spending load test or live paid call was performed. Local rendering measurements are not a production latency SLA. No AI-detector percentage, interview or employment guarantee is claimed.

[Build contract](CLOUD-JOB-LOOP-CONTRACT.md) · [Account setup and costs](CLOUD-JOB-LOOP-ACCOUNTS.md) · [Deployment runbook](CLOUD-JOB-LOOP-DEPLOYMENT.md)
