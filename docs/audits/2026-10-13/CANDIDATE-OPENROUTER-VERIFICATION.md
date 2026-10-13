# Candidate OpenRouter verification preparation

13 October 2026. **Hosted verification passed at 12:12:25 UTC.** The first two attempts stopped before starting a run or making a paid candidate call. The corrected harness started exactly one run, which produced a source-backed review-required packet and recorded settled usage of $0.002344 with no retained reservation. The run honestly reported partial coverage because connected inbox processing and broad paid search were unavailable.

## Initial stopped trace

The release owner reported that the initial attempt created fictional QA account `b18157e3-6d35-4d09-95bc-ca232a506705`, verified ordinary-user administration denial, then stopped at `no-paid-search-or-extra-discovered-vacancies`. Its candidate record was empty, `runStartRequests` was zero and no paid call occurred. Free configured employer feeds triggered the old overly broad preflight. Preserve that stopped result and account identity; this revision does not alter it, resume it or reuse its credentials. A new QA attempt is appropriate only because no original `start_run` happened.

The second attempt created QA account `8e64a9b8-0e61-4053-a4a7-c66495fa3de2`. Its free-feed proof passed for three boards, 105 raw rows and three exclusions, but it stopped at `control-save_claim`/HTTP503 before any `start_run`. A native read-only query restricted to this exact UUID, its QA metadata and reserved test email verified record version 2, one saved claim and zero runs. The internship claim succeeded; the education claim's `Generated QA University | 2026` context lacked a preceding literal header in the fixture source. The actual local validator reproduced that rejection. This was a fixture provenance defect, not evidence of a failed first claim or a charged candidate call. The ordinary validation error became the handler's generic HTTP503.

The current fixture includes the exact education heading. Before any profile/claim/run write, the harness compiles the actual manifest-hashed profile/claim validation source in its isolated context and validates both full fixture claims. The regression test removes that heading and reproduces the old context rejection locally. Both stopped traces remain unchanged; no old account is reused or resumed by the harness.

## Invocation

From the repository root:

```text
node scripts/verify-candidate-openrouter-hosted.mjs
node scripts/verify-candidate-openrouter-hosted.mjs --execute
```

The first command is a preview and makes no network request. The second creates one fictional QA account through ordinary signup, verifies its own identity, checks that `jobvance-admin` returns 403 without private data, saves two confirmed/shareable fictional facts and one manual vacancy, and starts one candidate GPT 6.1 Sol run with `modelConsent: true`, `inboxConsent: false`, `processingRoute: 'openrouter'`.

Only the fixed Jobvance Supabase origin receives credentials. The existing `.env.production` public URL/key is read into memory and validated; no provider or privileged key is read. The script prints only bounded status/ID/cost/check metadata. It does not print tokens, passwords, keys, source text, provider payloads or signed links and does not write a report file. Sanitized output may be saved by the release owner.

The harness stops before starting if router readiness is missing, paid search is available, a mailbox or schedule exists for the new account, or the shared ledger has less than $0.35 remaining. Free employer feeds remain active. The fictional QA profile explicitly excludes every configured feed company/board and every company override in the first 100 public rows per source. Public feed proof uses bounded anonymous GETs to the fixed Greenhouse/Lever endpoints, with no credentials attached; no production configuration is changed.

Before saving the profile, the harness extracts and compiles the actual self-contained `matchesDiscoveryTarget` function from current source in an isolated context, verifies its source hash and the employer-adapter hash against the release manifest, and proves that even worst-case matching title/location challenges from every feed company/board return false. Company overrides are included because `readEmployerFeed` can prefer a row's company over the configured name. The proof also requires the fictional manual vacancy to remain a match and rejects exclusions that would restrict its company or source facts. A unique fictional QA location adds a second guard if public rows change between the proof and the worker's later feed read. The configured source identities and saved exclusions must still match before `start_run`; live feed observations are time-bound, not an atomic freeze of an external service.

The current router bounds allow at most $0.340960 for one 150,000-token-bound/4,096-output-token GPT request at the permitted maximum price; this headroom check is conservative. The database reservation remains authoritative under concurrent usage. The one-run/one-manual-vacancy contract is unchanged, with no authorization for a two-call alternative.

There is exactly one `start_run` invocation. After that it polls `get` only, for at most 80 five-second intervals, and reads only the new account's exact run ID through RLS to verify saved route consent. It never calls a worker, resumes/retries, creates a schedule, reads mail, sends outreach, approves a packet, submits an application, enables payments or deletes records/accounts. New QA records are retained for private reconciliation. **If the check stops, do not rerun it blindly:** the saved run may still be pending or have uncertain usage, whose reservation must remain held.

## Meaning of a passing result

- An ordinary new QA user receives HTTP403/`ADMIN_FORBIDDEN` from the deployed administration API.
- One exact saved run records GPT 6.1 Sol/OpenRouter consent, completes or honestly reports partial coverage, has a positive settled charge no greater than $0.35 and no unresolved reservation, and produces one source-backed packet requiring human review.
- Missing recipient details produce no outreach text. The check does not approve/download the packet or contact an employer.

The candidate API reports aggregate usage and the requested model, but does not expose provider-returned model IDs, token counts or the actual request's reasoning effort. Medium effort is verified in current source at `job-loop-providers.ts:71`; `callRouter` checks the provider-returned model before returning at `jobvance-openrouter.ts:65–70`. A passing harness alone must not be described as direct observation of those hidden provider fields.

## Local verification and release-note limits

Eleven mocked-host tests pass for preview/no-network behavior, one-run/route consent, disabled routing or paid search, admin-response leakage rejection, unknown reservation retention, secret-safe failures, free-feed company/board/response-override exclusions, manual-company collisions, actual source-matcher behavior, and full fixture provenance including the missing education-heading regression. Syntax checking, targeted lint and typechecking pass. These do not count as hosted or paid verification.

Current source limits are **two packets and two search queries per run** (`job-loop-providers.ts:9`), shared monthly AI/search/admin/review spend no greater than $50, with a separate $5 independent-review batch limit. Candidate OpenRouter requests use medium effort; the independent product review requests use maximum effort. Existing rules schedules are not rewritten when router configuration changes.

The dated 11 October `docs/CLOUD-JOB-LOOP-RELEASE-STATUS.md:28–34` describes historical five-packet/three-search limits and earlier paid/scheduler configuration. Preserve that history; current release evidence must explicitly supersede it. Completed independent Kimi/Muse product reviews are separate from this candidate-path check and do not prove real vacancy coverage, customer value, willingness to pay, hiring outcomes, mailbox approval, production latency or multi-session budget-load behavior.

## Observed successful run

Fictional QA user `6b807ff4-7906-4d38-8ab5-7dba24f826bc`, request `cbf5b500-8a96-41f3-adc4-5867029313d1`, run `52a65c74-ed4a-495b-9b45-5d5edaf771cc`. Started 12:11:52 UTC; verification finished 12:12:25 UTC. The existing feeds remained active; the test excluded their opportunities using three company exclusions and a fictional location, after checking 106 public rows and the actual matcher.

The standard signup/session, ordinary-user admin HTTP403, stored OpenRouter route consent, source-validated facts, single run, bounded settled charge, one review-required packet and absence of recipient/outreach text all passed. No retry, resume, schedule, approval, download, send, application, payment or account deletion occurred. The new records remain for private reconciliation. This test establishes this bounded candidate path; it does not establish broad live job coverage, a completed browser download or employment outcomes.
