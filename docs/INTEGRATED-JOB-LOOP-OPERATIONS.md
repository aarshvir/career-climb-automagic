# Operating the ten-person Jobvance pilot

11 October 2026. The pilot uses the existing Supabase project and independent frontend. No extra hosting project, paid plan, API credits or payment account is purchased by this release. The project was verified as Free before changes. The US$50 ceiling governs this application's model/search ledger, not unrelated services, taxes or domain renewals.

## Publication procedure

1. Verify the selected Supabase project is `jobassist-ai` / `gvftdfriujrkpptdueyb`, with the earlier 0100 and 0200 loop migrations applied.
2. Review and test 0300 recurring/pilot/activity/support migration, then 0400 one-use dispatch tickets, then 0500 Supabase Cron platform migration. Apply these additively; never reset or replay the project's historical initialization.
3. Deploy the exact reviewed `job-loop-control` and `job-loop-worker` entrypoints and all relative shared dependencies/import configuration. Both already use custom authorization with the platform's legacy JWT verification disabled. The worker accepts ordinary stages only under its existing server credential, and `run_due` may consume an unexpired one-use database ticket.
4. Verify anonymous control denial, ordinary-user worker denial, source reachability, the $50 cap and a new consenting fictional candidate's first/second application before public claims.
5. Activate `job_loop_scheduler_config.enabled` and its verified project API origin only after the worker passes. A public publishable key may be configured if gateway routing needs it; never copy the injected privileged service key. Verify the existing named Cron job, an immediate due dispatch, saved scheduled run and exact artifacts readback.
6. Push the tested source to GitHub and the configured hosting source, build/package that same commit, save a version and publish on the existing Jobvance.io domain. Record the SHA, user-facing version and real hosted checks separately.

The scheduled queue wakes every five minutes. Each opted-in candidate has a timezone-aware next run, at most one scheduled run per day, and at most thirty scheduled runs per UTC month. Ten active pilot users and two new packets per run bound the small pilot. These are ceilings, not a promise of sixty relevant vacancies or a production availability guarantee.

## Check the service

In [Supabase](https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb), open **Integrations → Cron**, select **jobvance-recurring-loop**, and inspect its recent run results. Use **Edge Functions → job-loop-worker → Logs** for failures without copying customer input into diagnostics. The candidate workspace shows next run, pause/cancel, failures, budget holds and actual activity.

An operator may inspect `job_loop_scheduler_config`, `job_loop_schedules` and `job_loop_runs` in the Table Editor. Inspect only the records needed for a support issue. Preserve source attribution, candidate-reported status and approvals; do not mark generated documents as sent/applied.

To pause all recurring work, set `job_loop_scheduler_config.enabled=false`, then pause the named Cron job. This does not remove candidate history or prepared files. To resume, verify the worker and source coverage, enable the named job/config and exercise a dispatch/readback. Candidate pause/cancel affects their own queue independently.

## Support and privacy requests

Candidates can submit a short private support request from the authenticated interface and receive a saved reference/status. No outgoing email is sent. The product does not claim a staffed response time.

The owner should open **Table Editor → job_loop_support_requests** daily, review category/message/reference, and set status to `in_review` or `resolved` after actually addressing it. Do not solicit full CVs, credentials or card details in support text. A privacy request for an entire account or older files requires reviewing the separate CV/workspace/account scope; deleting only Job Loop preparation is not whole-account erasure.

The explicit candidate Job Loop erase control clears its stated loop records/artifacts and scheduling/enrollment scope only. It must not be described as deleting unrelated original CVs, older workspace records, authentication identity, provider records or documents already downloaded. Retain only what the interface and actual backend disclose. Operator account erasure remains a separate verified procedure.

## Models, search and spend

Rules mode prepares documents from confirmed shareable facts without a paid model. Claude/GPT/Kimi adapters remain unavailable until their account/key/pricing setup is complete. Search snippets remain unverified discovery; public employer API records have limited coverage and never establish personal eligibility.

Before enabling a paid provider, verify its actual price and dedicated account controls, enable only the reviewed adapter, and test consent and conservative input/output reservations. Review `job_loop_budget_months` and `job_loop_usage` against provider invoices. Unknown/failed calls retain reservations instead of being silently retried. A changed provider price invalidates assumptions and must be reviewed; the app cannot cap another application's key usage.

Billing remains disabled. Future commercial prices/allowances are documented in [the pricing review](SUBSCRIPTION-PRICING-REVIEW.md). The free pilot does not automatically renew into a paid tier.

## Recovery and rollback

Pause recurring dispatch before investigating repeated failures. Reuse a failed run's explicit recovery action; do not blindly repeat uncertain paid calls. Review stale-input or revoked-approval holds before downloads. A PDF warning may leave valid editable formats available; never hide unsupported text or truncate career facts silently.

Keep additive migrations and previous function/source versions. Roll back the frontend to a known saved version if necessary; preserve new records and stop the scheduler before rolling back a worker that cannot understand the new contract. No new backup/restore SLA or managed on-call team is implied. Test restoration separately before promising recovery times.

Official references: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [Cron](https://supabase.com/docs/guides/cron), [Greenhouse public GET API](https://docs.greenhouse.io/job-board.html).
