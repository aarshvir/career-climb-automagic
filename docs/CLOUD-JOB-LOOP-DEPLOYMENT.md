# Cloud Job Loop deployment runbook

This release adds a cloud service to the existing Jobvance project. It preserves the old CV files, free checks, preparation packs and tracker. It introduces no payments, ads, sent mail or application submissions. Actual release/test results belong in `CLOUD-JOB-LOOP-RELEASE-STATUS.md`; this document is the repeatable procedure.

## Files and functions

- Additive migrations, in order: `supabase/migrations/20261011010000_job_loop_cloud.sql`, then `supabase/migrations/20261011020000_job_loop_revoke_all.sql`. The second removes an incorrect exception for applied/interview-stage packets; their history remains, but a correction revokes fresh export authority.
- Authenticated customer API: `job-loop-control`. It derives the owner from `auth.getUser`, never a browser-supplied user ID.
- Background executor: `job-loop-worker`. It accepts only a run ID plus a fixed server credential; an ordinary user/anonymous token cannot execute it.
- Gmail callback: `job-loop-oauth`. It accepts GET callbacks using expiring, single-use, owner-bound state and encrypted proof-key data. Unconfigured callbacks cannot connect a mailbox.
- Generic engine/render/adapters: `supabase/functions/_shared/job-loop*.ts`. The original private Python/Claude workspace is not copied into a customer's run.
- Frontend: `/loop`. Sign-in returns here through a fixed allowlist; no external `next` address is accepted.

## Deploy the database

1. Open [the existing Supabase project](https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb).
2. Confirm **jobassist-ai / main / Production**. Use **SQL Editor → New query**.
3. Check that no `public.job_loop_%` tables exist yet. If they do, stop and inspect which version is present; do not rerun a create-table migration or reset the database.
4. Execute the entire reviewed migration as one transaction. Never run the legacy initialization migrations or a blanket migration push against this project.
5. Verify the eight new owner/service tables, their RLS and grants, the private `job-loop-artifacts` bucket, and the exact new RPC signatures. Record the successful version in Supabase migration history using its actual schema. Do not mark a failed migration applied.
6. Existing customer tables and objects must remain unchanged. The new storage fences apply only to the new artifact bucket.

## Deploy the functions

Generate reviewed single-file dashboard bundles with `scripts/build-job-loop-ui.ps1`. It pins Deno 2.9.6, inlines local modules, imports the reviewed Supabase SDK and exact `npm:jspdf@4.2.1`/`npm:docx@9.9.0` libraries, minifies and refuses a bundle larger than the documented 5 MB dashboard limit. This keeps browser transfer sizes smaller than a fully inlined dependency bundle. `docs/supabase-loop-ui/manifest.json` records source and artifact hashes. Upload all modules if a future bundle changes to code splitting; never paste a partial entry file. In the dashboard editor, use its normal select-all/cut action, confirm the starter draft is empty, then paste the complete file; filling the editor's virtual textarea can replace only a visible portion. Verify the entire copied editor content matches the file before deploying.

For each of the three functions:

1. In **Supabase → Edge Functions → Functions**, choose **Deploy a new function → Via Editor**.
2. Use the exact function name above. Replace the starter editor with the matching complete generated bundle.
3. Deploy, then open its configuration and set platform **Verify JWT** to match `supabase/config.toml` (`false` for these three handlers). This does not grant anonymous customer access: the control handler verifies `auth.getUser`; the worker requires its server credential; the callback verifies its one-use state.
4. Immediately verify that anonymous control requests and ordinary-user worker requests are denied. A deployment is incomplete if those checks fail.
5. Do not replace the old tailoring/payment functions in this release. Do not copy or expose the project's injected credentials.

Official [dashboard deployment guide](https://supabase.com/docs/guides/functions/quickstart-dashboard) and [function limits](https://supabase.com/docs/guides/functions/limits).

## Server secrets

Use **Edge Functions → Secrets**, never frontend environment variables or GitHub files.

| Name | Configuration |
|---|---|
| `APP_URL` | `https://jobvance.io` |
| `ALLOWED_ORIGINS` | Exact approved frontend origins, including `https://jobvance.io`. Preserve needed independent preview/local origins; no wildcard. |
| `JOB_LOOP_ENABLED` | Absence/`true` enables the rules worker; `false` is the run kill switch. |
| `JOB_LOOP_PAID_APIS_ENABLED` | **`false` for this release**. Only set `true` after owner account/credit setup and a conscious decision to use the configured API services. |
| `JOB_LOOP_WORKER_SECRET` | Optional dedicated server-only secret. Otherwise the worker uses Supabase's injected server credential; never expose either to visitors. |
| `JOB_LOOP_OPENAI_API_KEY` | Optional dedicated project key. The adapter can fall back to the existing `OPENAI_API_KEY`; presence is not proof it is valid/funded. |
| `JOB_LOOP_ANTHROPIC_API_KEY` | Optional Anthropic API key. |
| `JOB_LOOP_MOONSHOT_API_KEY` | Optional Kimi/Moonshot API key. |
| `JOB_LOOP_MOONSHOT_INPUT_USD_PER_MILLION` | Verified positive USD/million input-token rate for `kimi-k2.6`. Missing/invalid means unavailable. |
| `JOB_LOOP_MOONSHOT_OUTPUT_USD_PER_MILLION` | Verified positive USD/million output-token rate for `kimi-k2.6`. |
| `JOB_LOOP_TAVILY_API_KEY` | Optional search key, preferably Free tier with overages disabled. |
| `JOB_LOOP_EMPLOYER_FEEDS` | Optional JSON list of at most four verified Greenhouse/Lever boards, with `provider`, `board` and `company`. Only fixed provider hosts are fetched. No arbitrary URL fetcher. |
| `JOB_LOOP_GMAIL_ENABLED` | Absent/false until Google configuration and the intended tester/public release gates are complete. |
| `JOB_LOOP_GMAIL_CLIENT_ID` | Google Web OAuth client ID, server only. |
| `JOB_LOOP_GMAIL_CLIENT_SECRET` | Google Web OAuth secret, server only. |
| `JOB_LOOP_TOKEN_ENCRYPTION_KEY` | Dedicated cryptographically random 32-byte value encoded as base64. Owner creates/stores it securely; never paste it into chat or a tracked file. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already injected by Supabase. Do not rename, extract or duplicate them. Customer billing stays disabled through its existing settings.

Google's exact OAuth callback is **`https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/job-loop-oauth`**. The server returns to **`https://jobvance.io/loop`**. Configure that exact callback in the Google Web OAuth client. Google sign-in for Jobvance authentication is a separate OAuth configuration.

The callback does not activate a connection or store mailbox tokens. It returns a short-lived encrypted activation ticket only to the callback browser in a URL fragment. Jobvance holds that ticket in component memory, clears the fragment, checks the authenticated owner and shows the mailbox identity/permissions before explicit final confirmation. The ticket is never exposed by record polling or written to local/session storage. Finalization consumes its server state atomically. If authentication expired, keep the confirmation tab open, sign in to the original account in another tab, then return; closing/reloading discards the ticket and requires a new connection.

The mailbox pilot reads at most ten relevant messages from the last seven days and reports its limited coverage. Role/application associations remain unconfirmed. It does not infer that an application was submitted from ambiguous mail. Existing-thread replies remain a manual Gmail action; they are not converted into cold messages. Draft creation is a separate explicit action after recipient and attachment approval.

## Operational checks

Run the complete frontend/backend suites, type checks, lint, real PDF/DOCX parsing and deployable-bundle validation. Fixture tests must not make paid calls or read real customer mail. Use fresh synthetic accounts for hosted checks; retain non-secret evidence and do not permanently delete customer data.

Hosted checks must prove: fresh sign-up; private save; unconfirmed/source-typed claims; a user-added vacancy even with low heuristic overlap; server run progress after the client stops polling; per-role rendering; review/approval; signed downloads of matching bytes; manual tracking/reload; account isolation; correction/withdrawal revoking approvals; duplicate request replay; anonymous/worker denial; disabled external models/search/Gmail; unchanged billing-off behavior. Local mocked integration tests do not substitute for a funded live provider call or Google verification.

The $50 UTC-month ledger locks before reservations. Three runs/owner/UTC day, one active run/owner, five packets/run, three search queries/run and bounded input/output work are server limits. A timeout with unknown provider usage retains its reservation. Keep provider keys dedicated to Jobvance and check prices before adding models; the app cannot constrain another application's calls or provider taxes/subscriptions.

Artifacts are immutable, content-addressed and bound to the approved packet manifest. Clients cannot upload/overwrite/delete cloud artifacts; even a broad legacy storage policy cannot bypass the new bucket fence. Signed URLs expire after two minutes; a newly revoked approval blocks new links but does not recall already downloaded files or instantly invalidate an issued signed URL.

The initial release is user-triggered, with phase checkpoints and explicit resume after interruptions. A saved run can continue after the browser closes. This is not a configured daily scheduler, a guaranteed-uptime service, a live LinkedIn browser scraper, public verified Gmail integration or an employment-outcome promise. Maintain a manual vacancy path when external lanes are unavailable.
