# Standalone cloud Job Loop: implementation contract

User selected the standalone cloud service on 11 October 2026 and a combined USD50/month AI/search usage cap. User also requested interchangeable Claude, GPT and Kimi models. This cap is a processing constraint, not authorization to purchase subscriptions or enable customer billing. Paid integrations remain disabled until operator keys/configuration are supplied; candidate CV facts need contextual provider consent before model processing.

## Architecture and pilot assumptions

Keep Jobvance's existing React/Vite Sites frontend and Supabase account. Add authenticated Supabase control and background-worker functions, a private owner-scoped career record, immutable run snapshots, application packets and a server-owned spend ledger. Port generic logic to TypeScript rather than executing private Python scripts or requiring Office. PDF/DOCX/TXT rendering has no model authority to add facts. No new VM, Vercel project or payment gateway is required for this bounded pilot.

Planning assumptions: 10 pilot candidates, normally one run/person/day, up to five prepared opportunities/run, three broad-search queries/run. Allow up to three runs per UTC day so corrections can be rebuilt without waiting until tomorrow, with only one active run per owner. Shared PostgreSQL tenancy with owner isolation; PII sensitivity; roughly5:1 read/write operations and a pilot burst under10 requests/second. These are sizing assumptions, not measured traffic. Control-plane objectives are p50<250ms, p95<800ms, p99<1500ms; external run stages are bounded and asynchronous. Pilot hosting is best-effort on free plans. Production objectives are99.5% availability, RPO24h and RTO8h only after funded backups and a restore rehearsal; those guarantees are not established on the free plan.

Supabase's documented free worker limit is150 seconds and2 secondsCPU/request. Work is checkpointed and split across background invocations, with bounded provider fetches and cancellation checks. Closing the browser must not be the executor's stop signal. A request-id/input-hash replay must not start duplicate paid calls. Incomplete or interrupted stages are reported and resumed explicitly; no successful state is fabricated.

## Ownership

- Root: shared contract, integration, navigation/auth/privacy updates, account/cost instructions, browser/hosted QA and publication.
- Backend: new migration, control/worker functions, cloud persistence/budget/OAuth/provider adapters and backend integration tests.
- Engine: pure claim/profile validation, source assessment, grounded packet composition and portable document rendering with actual PDF-page checks; engine tests.
- Frontend: JobLoop page, scoped stylesheet and API client, profile/claim confirmation, runs/opportunity views and explicit approvals; frontend journey tests.

The shared API/types are `supabase/functions/_shared/job-loop-types.ts`. Frontend imports types only. API function is `job-loop-control`; background function is `job-loop-worker`. Neither accepts a caller-supplied user ID. Authorize every record/reference using auth.getUser and bind run ownership on the server. Backend-owned run/packet/spend/token fields are not client-writeable. Preserve existing tables, files, quotas and disabled payments.

## Actual workflow

1. Save a reviewed CV text and profile after explicit private-storage consent. Career stage does not imply seniority, credentials, salary or nationality. Missing experience remains null. Page preference is1 or2. Explicit excluded terms belong to that user.
2. Suggest literal source passages; the user confirms claim type/context/contribution/result status and external disclosure. Imported claims start unconfirmed and not shareable. User answers are marked user-attested. Withdrawn claims cannot reach fresh outputs.
3. Start a bounded run with its selected provider/model and explicit processing consent. Check connected recruitment messages first; missing connection is a visible lane status. Gather configured broad search and permitted employer feeds, plus user-added opportunities. Record source health/freshness and never fabricate jobs, contacts, pay or closures.
4. Assess relevance with a named heuristic and exact claim/job evidence. It is not an employer ATS result or eligibility certification. Student, graduate, trainee, product, finance and technical roles remain available when targeted. Unknown pay/eligibility remains unknown.
5. Build a document attempt for each qualifying opportunity within the declared run capacity. Facts are composed from approved shareable phrasings; model output may select IDs but cannot introduce factual prose. Preserve academic versus employment context and projected versus measured results. Missing contact yields a research task, not a generic cold message.
6. Render the PDF and measure actual pages. A held/oversized/stale packet cannot be presented as approved. Review, factual/disclosure confirmations and an input-bound approval precede final downloads. Claim/profile changes revoke pending approvals; submitted versions retain their history.
7. Show replies/deadlines first, source-lane failures, live/unverified opportunities, exact packet links, missing evidence and one next action. Applied status requires explicit user report or an explicitly confirmed unambiguous receipt. Follow-up dates/notes are user-controlled. No send or application-submission endpoint exists.

## Models and cost controls

Use server-owned provider descriptors and separate adapters: Anthropic Messages, OpenAI Responses and Moonshot's compatible chat endpoint. Only configured/priced models appear as usable choices. Keys remain in managed backend secrets. No browser-provided endpoints, secrets or pricing; no silent cross-provider fallback without consent. The adapter result has one common validated schema. Every factual clause in an export must remain grounded independently of model quality.

Reserve worst-case call cost atomically before invoking a provider, reconcile actual usage, and retain an uncertain reservation after an ambiguous timeout. Enforce a combined USD50 monthly usage ceiling, per-user daily run cap, per-run role/query/token limits and an operator kill switch. Cash charges and included API credits are separate; an allowance does not justify unlimited usage. Track input/output tokens and search credits without recording personal content in logs.

## Gmail and discovery boundaries

Google sign-in is not Gmail consent. Gmail tokens are owner-scoped, encrypted with authenticated encryption and never returned to the browser. Connection uses one-use expiring state, a fixed callback/return path and explicit read/draft consent. Google developer app verification/security-assessment requirements remain an external release gate. Server scopes/functions contain draft creation only, never sending. Draft creation requires a verified/explicitly confirmed recipient and approved exact attachment; uncertain writes are not blindly replayed.

LinkedIn's personal-browser workflow is not ported into an unauthorized hosted scraper. Employer APIs and compliant search are automated; unavailable LinkedIn/inbox lanes stay visible as manual/not-connected. User-pasted source is marked user-provided. A search snippet or fresh HTTP200 is not proof a vacancy is currently open. Only explicit removal/closed signals establish closure.

## Release acceptance

Use fictional student/MBA/career-switcher records; verify owner isolation, no inherited senior exclusions, confirmation/disclosure/withdrawal gates, idempotency/cancellation/stale callbacks, global budget races, malformed provider output, failed/blocked sources, true rendered pages, unsafe URLs/paths and absence of send/apply operations. Hosted tests must distinguish real provider reads from fixtures. Keep existing free check and workspace functional; do not advertise integrations as connected until their real account/consent paths have passed.
