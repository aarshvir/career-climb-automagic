# Independent review and administration contract

12 October 2026. Requested scope: impartial reviews for the three current customer audiences, a consolidated improvement plan, two private administration portals based on the owner's VedicHour implementation, and server-side OpenRouter models within the existing shared $50 monthly AI/search ceiling.

## Independent reviews

- Baseline: Jobvance production version 12, source `2e134180a8cdbb248c5fa5dca01b1a1bf8b1fb69`.
- Audiences: students/new graduates; MBA students/alumni changing direction; employed professionals with 5–10 years' experience and limited time.
- Models: configured GPT 6.1 Sol agents; OpenRouter `moonshotai/kimi-k3`; OpenRouter `meta/muse-spark-1.3` with maximum reasoning. Actual API response model IDs, usage, errors and evidence hashes must be retained. Missing reviews remain missing; never impersonate another model.
- Ten equally weighted parameters: need/value, onboarding, UI/accessibility/mobile, evidence/document trust, job coverage, automation/effort, tracking/actionability, reliability/recovery, privacy/control, willingness to pay.
- Reviewers receive no prior scores, desired target or other reviewers' outputs. Distinguish observed public journeys, source inspection, unverified private behavior and inference.
- Report raw scores, average, spread and evidence limitations. A plan may target 95+, but projected scores are hypotheses until rerun against the same rubric and supported by customer testing.
- Transmit only public product evidence, sanitized source excerpts and fictional fixtures to review models. No customer CVs, credentials, emails or private user records in review prompts or reports.

## Administration

- `/admin`: operations, minimal user records, support receipts, run failures, scheduler health, pilot occupancy and documented manual actions.
- `/admin2`: founder overview, clearly defined funnel and retention metrics, honest revenue/payment state, AI/search reservations and actual spend, model connection status and bounded controls.
- Initial owner is the verified existing Auth account for `aarshvir@gmail.com`; bind privileges to its server-verified UUID, not editable user metadata, an email typed into a form, a shared password or first signup.
- Validate role server-side on every request. Ordinary candidates and anonymous visitors receive no administration data. Use RLS and explicit privilege revocation for private tables/RPCs, including internal task tickets.
- Changes use optimistic versions and append-only administrative audit records. Administrative APIs do not send outreach, submit applications, delete accounts, expose CV text by default or enable payments.
- No fabricated visitors, revenue, conversion, savings or success rates. Zero denominators return unavailable percentages. Exclude synthetic QA work and label partial coverage/small samples. A requested download link is not confirmed browser completion.
- Use UTC for measurement windows and show the range/denominator/source beside each metric. Historical client visits and guest checks have no existing complete telemetry; show them as untracked, rather than inventing numbers.

## Model integration and spend

- The replacement OpenRouter key is stored only as an Edge Function secret. It is never placed in frontend configuration, the repository, logs or reports. Provider status checks return sanitized booleans/status only.
- Prefer GPT 6.1 Sol with medium reasoning or Sonnet 5.5 through OpenRouter; retain direct provider adapters for later platform keys. Clearly disclose the actual processing route and obtain candidate processing consent.
- Numeric calculations remain deterministic and tested. Models select approved evidence and provide explicitly reviewable commentary/questions; they cannot invent achievements or independently certify eligibility.
- Candidate calls, independent-review calls and administrative commentary share one atomic UTC monthly ledger capped at $50. Reserve conservative maxima before each external call; retain reservations for uncertain calls; no blind charged retry or fallback.
- The independent review batch has an additional $5 maximum. No API credit purchase or subscription is authorized by this implementation.
- Enabling a connection does not retroactively consent candidates or rewrite existing opted-in schedules to use paid models.

## Acceptance

Verify owner access and non-owner denial, role revocation, no private CV/secret responses, factual metric denominators, zero/small-sample handling, optimistic configuration conflicts, cap concurrency, uncertain usage retention, explicit processing consent, supported-model selection, secret presence/validity and at least one actual bounded model call. Preserve existing candidate journeys and scheduling. Push and publish the tested source to the existing repository and domain; retain exact source/deployment provenance separately.
