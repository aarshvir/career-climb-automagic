# Recurring discovery improvement — 17 October 2026

This change improves the actual recurring discovery worker. It is not a claim of complete job-market coverage or an NPS result.

## Implemented

- Six default published employer boards: Careem, GoCardless, Duolingo, Toast, Notion and Zapier. Existing explicit `JOB_LOOP_EMPLOYER_FEEDS` settings remain authoritative. A configured maximum of eight distinct boards is supported.
- Public Ashby postings support alongside Greenhouse and Lever. Ashby listings must explicitly have `isListed: true`; hidden/direct-link-only listings are not imported. Explicit `workplaceType` overrides the older `isRemote` flag. Actual Notion responses showed hybrid jobs with `isRemote: true`, and the regression protects against labelling them remote.
- Each source read has a five-megabyte streamed byte budget. At most 1,000 rows are examined and 100 relevant rows retained. Relevance is applied before retention so a match after row 100 can be found. Lever follows at most three 100-row pages and reports a remaining cap honestly. Later-page failure fails that source rather than asserting a complete read.
- Exact canonical-URL/source-identity deduplication across discovery sources. Same employer/title is never treated as sufficient identity. Existing manual descriptions, application stages, notes, reminders and record IDs are preserved.
- Automatic preparation requires that the job be observed again in the current source read. An old employer listing not observed becomes `unverified`, with its previous observation timestamp and history retained; it is **not** declared expired. Failed, truncated or unavailable feeds cannot establish closure. A later successful listing can restore current availability and reuse an unchanged packet. Explicit selected-vacancy requests retain their existing saved-source contract.
- More recognised city/country combinations in the US, UK, India and GCC; explicit contradictory country information prevents the city shortcut. Limited role aliases are supported, while requested role phrases prevent `Engineering Manager, Product` and `Product Operations Manager` from passing as `Product Manager`.
- Excluded terms are matched at word boundaries. Excluding `AI` does not accidentally exclude `retail`. Exclusions still apply to title, company, description and URL.
- `explainDiscoveryMatch` exposes plain observed reasons and missing conditions, without an invented ATS percentage, eligibility judgment or salary assurance. UI integration is a separate caller concern.

## Evidence

`live-source-readback.json` records actual read-only public GETs through the final adapter and a created combined role/location profile. On this read, six source boards returned 566 published rows in total and 86 matching rows across the combined target profile. These are a one-time observation, not six markets, employer partnerships, customer success or a stable count to advertise. No private CV was sent to the feeds; no paid search/model calls or production candidate writes occurred.

Primary API documentation inspected:

- [Ashby public job postings](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board)
- [Lever Postings API](https://github.com/lever/postings-api)

Focused validation: **249 tests in five files passed** (`job-loop-discovery`, `job-loop-providers`, `employer-discovery`, `job-loop-process`, `job-loop-product-acceptance`). The actual worker acceptance case now performs discovery, rendered output, unchanged second-run reuse, a later failed feed with no stale preparation, and recovery without duplicate output. The repository/SQL/Storage in that test are isolated adapters, not hosted operations. App TypeScript passed after the final matching/feed corrections; the root integration run must provide final full-suite and build validation.

## Remaining limits

- Six named boards are a bounded source set. Workday, Oracle, SuccessFactors and licensed aggregator access have not been configured or claimed.
- Employer API publication is current source evidence, not a live browser check of every application URL or a guarantee the role remains open later.
- Full semantic matching, skill/visa/industry assessment and unrestricted geography coverage are not established by these deterministic guards. Unknown conditions stay unknown.
- Existing workspace capacity remains 100 opportunities. Capacity now produces an explicit deferred-match message and preserves existing history; pagination/archive management is still required.
- The run still prepares at most the configured packet capacity. Match count is not the number of completed tailored CVs.
- Existing explicit source configuration may need an authorised configuration update to adopt the new defaults. No production configuration, schema, worker or site was deployed by this subtask.

No claim of 100 real participants, multi-day observed delivery or NPS +60 is made.
