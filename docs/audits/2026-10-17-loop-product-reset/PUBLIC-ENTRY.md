# Job Loop public entry and proposed pricing

Source work, 17 October 2026. This note covers public presentation, not a deployment receipt or customer study. The starting live release was v31 / 4f261359c8ed29c03705a44fdd1188be13956c30. The owner subsequently authorized implementation and a 100-customer simulation.

## What changed

- Home leads with “Automate your job search” and routes its primary action to Job Loop. CV Check remains a secondary account-free acquisition path.
- Home, How it works and the Job Loop overview share an ordered three-panel explanation: add experience, choose roles/locations/frequency, review jobs and prepared CVs in the dashboard. Columns stack in the same order on narrow screens.
- Copy distinguishes scheduled rules-based preparation from optional per-run consented AI. Selected employer-feed coverage, the ten-account capacity-limited pilot, unavailable broad search/inbox and the candidate's own application submission remain explicit.
- Public navigation leads with Job Loop; signed-in primary access opens the Loop.
- Guided CV creation is a draft made from the candidate's answers, not invented facts or AI authoring.
- Pricing shows current free access first, then the owner's proposed $29 / $59 / $99 monthly subscriptions. These are not purchasable entitlements. The reusable three-CV-variant allowance is proposed, not claimed to exist in the free pilot.
- A contradictory privacy sentence saying the free check never uses external AI was corrected to distinguish local comparison from explicitly chosen AI tailoring.

## Pricing judgment

Retain $29 Weekly / $59 Active / $99 Daily as hypotheses for evaluation, not launch-ready prices. Weekly proposes one run a week, Active three a week, Daily one a day. All propose three saved CV variants and the guided CV creator. A run is one discovery-and-preparation cycle, not a guarantee of a vacancy or interview; a variant is a reusable source CV, not a cap on generated outputs.

Primary sources checked on 17 October 2026:

- [Teal's own pricing page](https://www.tealhq.com/pricing): $29 every 30 days, $13 every seven days and $79 every 90 days. This anchors $29 in the broader CV/job-search software market, but does not establish comparable automation or willingness to pay for Jobvance.
- [Jobscan's own product comparison](https://www.jobscan.co/blog/jobscan-vs-simplify/): describes its Premium offer as $49.95 per month. This is a vendor claim about its own offering, not an independent quality comparison.

The case for $59 and $99 must be ongoing discovery quality and reliable saved time across repeated applications. Higher frequency alone is weak value if coverage is narrow or jobs recur. Measure fresh relevant vacancies, usable documents, repeat-run reliability and support demand before paid launch.

Illustrative arithmetic only, using 52 weeks / 12 months and 365 days / 12 months:

| Proposal | Average runs per month | Revenue per included run | Cost per run at an illustrative 75% gross margin |
| --- | ---: | ---: | ---: |
| $29, weekly | 4.33 | $6.69 | $1.67 |
| $59, three weekly | 13 | $4.54 | $1.13 |
| $99, daily | 30.42 | $3.25 | $0.81 |

These are planning thresholds, not measured margins. The final column assumes the whole 25% cost envelope covers runs; payment fees, storage, support, refunds and other service costs reduce the allowance. No provider rate is inferred and no paid request was made. The shared $50 pilot ledger does not establish commercial cost per subscriber. Before sale, specify documents per run, duplicate/no-result behavior, retries and rollover, AI processing choices, taxes, cancellation and enforced plan entitlements.

## Verification and limitations

- Public positioning/pricing/privacy and navigation: 11 tests in two files passed.
- TypeScript and git diff whitespace checks passed.
- Regressions cover neutral routes, ordered panels, current-vs-proposed allowances, no purchase controls, source coverage/AI boundaries and the privacy correction.
- No browser, live persistence, full-task, paid-provider, production or participant acceptance is claimed by this contribution. The coordinator performs combined verification.
- Source review of the private dashboard identified empty-target schedule routing and recent/loaded count labeling; communicated to the coordinator. Public presentation does not itself resolve those issues.
