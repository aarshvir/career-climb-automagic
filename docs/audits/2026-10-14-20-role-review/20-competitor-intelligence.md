# Reviewer 20 — Competitor intelligence

**14 October 2026 · 63/100 · medium confidence.** This rates competitive decision readiness, not product quality or customer outcomes. Fixed source: `e661c6493c30c88f2487800ff38aa10c46c9aae6`; published runtime supplied in the brief: `57713fb1cb15b29be8d6dc745e3c87bcb718c4af`.

I checked official pages, current routes/approval/reuse source and existing comparison/design/pricing assets. No accounts, uploads, checkout, paid calls, private pages or live Jobvance workflow were tested. “Advertised” means vendor claim. The alternatives are task-relevant, not a market-share ranking. No competitor scores or outcomes are inferred.

| Criterion | /20 | Evidence |
|---|---:|---|
| Primary-source freshness and claim discipline | 17 | Existing benchmark dates and bounds claims; fresh official checks broadly corroborate it. |
| Shared-task and audience coverage | 15 | Six useful alternatives below; existing benchmark omits Simplify and lacks comparative task observations. |
| Demonstrated differentiation | 10 | Source-linked approval/reuse exists in code; comparative advantage is unmeasured. |
| Competitive pricing/value readiness | 12 | Free pilot and proposed prices are correctly separated; no willingness-to-pay evidence. |
| Repeatable intelligence-to-decision process | 9 | Dated research exists; no explicit owner, trigger log or falsification record. |

## Dated product matrix

All observations: **14 October 2026**. USD public displays; taxes, UAE availability, regional offers, checkout eligibility, import fidelity, accessibility and time-to-export remain untested for every vendor. An unmentioned safeguard is **unknown**, not absent.

| Product and official evidence | Advertised overlap / breadth | Public price and material gap |
|---|---|---|
| [Teal](https://www.tealhq.com/pricing) | Unlimited free resumes/tracker; job matching, paid analysis and AI. Broad competitor to repeated applications. | $13/7 days, $29/30 days, $79/90 days. Source-to-output correction controls untested. |
| [Huntr](https://huntr.co/pricing) | Free base resumes/PDF, two tailored resumes/packets, 100 tracked jobs, autofill; Pro adds unlimited tailoring. | $40/month; $90/3 months; $160/6 months. Actual free gating and factual fidelity untested. |
| [Jobscan](https://www.jobscan.co/) | Resume/vacancy scan, matching and optimization; ATS interpretation is central to its pitch. | [Pricing](https://www.jobscan.co/pricing) redirected to an unreadable app plan. Current rate/trial unavailable in this check; do not reuse an editorial price as verified checkout. |
| [Rezi](https://www.rezi.ai/pricing) | Resume writer/editor, keyword targeting, scoring and interview tools. | Free: one resume/three PDF downloads. Pro $29/month; lifetime $149, excluding recurring human review. Approval/provenance parity untested. |
| [Simplify](https://simplify.jobs/) | Free matching, autofill and tracking; profile reuse, tailored suggestions and career-win storage. Particularly relevant to student volume and busy applicants. | Simplify+ exists; current numeric rate unavailable in inspected public text/help retrieval. Geographic job suitability and application reliability untested. |
| [Careerflow](https://www.careerflow.ai/#pricing) | Limited free builder, tracker, storage and autofill; paid resume/LinkedIn tools; Plus interview practice. | Monthly display: Premium $23.99; Plus $44.99. Several billing blocks/offers coexist; eligibility and precise entitlement need checkout verification. |

Competitors advertise broader discovery, networking or application assistance. Breadth does not prove ease; narrowness does not prove speed. Jobvance's `/check` has six stages, local input, no account requirement, a starter outline, approval and reuse (`CvCheck.tsx:25,50,176,386–394`). `/loop` binds packets to fact revisions and shows sources (`JobLoop.tsx:404`; engine:298). These mechanisms do not establish competitor inferiority.

## Findings and acceptance

1. **CI-01 · P1 — Validate advantage before widening the pilot.** Existing research excludes authenticated tests (`COMPETITOR-BENCHMARK.md:3`); provenance remains a hypothesis. Compare identical CV/vacancy tasks on Jobvance, two alternatives and the applicant's document workflow: first application, second vacancy, corrected fact and withdrawn confidential detail. **Accept:** publish active minutes, assistance, retained corrections, factual errors and usable exports, including failures/denominators. Dependencies: consented participants, lawful access, fixed rubric. **2–4 engineering days**, plus recruitment/sessions; no audit spending, later access costs require agreement.

2. **CI-02 · P2 — Update the competitive floor.** The matrix includes Resume Worded instead of Simplify (`benchmark:11–16`). Simplify/Huntr advertise free autofill; reuse/track alone is weak differentiation. Add Simplify and compare input → review → export → employer handoff. **Accept:** rows have dates, sources, free limits and tested/advertised/unknown labels; no superiority badges. Dependency: research owner. **0.5–1 day**; no service cost.

3. **CI-03 · P2 — Test value at the proposed price.** Focus $15/Job Loop $29 remain hypotheses (`ProductPage.tsx:172`; pricing review:17–22). Teal/Rezi already display $29 and competitors offer substantial free utility. Test why a user would switch: fewer corrections, useful reuse or less preparation effort. **Accept:** record current tool, switching objection, second-task use and nonbinding price choice, separately from paid conversion. Dependencies: CI-01 and commercial eligibility before charging. **0.5–1.5 days**; avoid annual/unlimited commitments and unmeasured provider subsidy.

4. **CI-04 · P2 — Compare audience-specific failure costs in one workflow.** Current audience content correctly separates projects, MBA/team contribution and confidential professional material (`job-loop-audiences.ts:7–35`), but has no comparative evidence. **Accept:** study reports each audience's results separately; MBA means job search, not admissions; include a student without a finished CV, a lateral move and a confidential metric. Dependencies: CI-01 fixtures and participants. **0.5–1 day** to prepare fixtures; research time additional. No separate persona products or new paid AI.

5. **CI-05 · P2 — Make research maintainable.** Existing benchmark/design/pricing files are useful dated snapshots, without an explicit refresh decision log. **Accept:** one canonical matrix links these assets, names an owner and records changed claims and resulting decisions; conflicting official surfaces stay unresolved until checked. Dependencies: product owner. **0.5–1 day**; about 30–45 minutes manual review monthly, no bot subscription.

## Three positioning hypotheses to falsify

- **Student:** “See which actual project evidence answers this vacancy.” Validate comprehension and truthful context preservation against keyword-led alternatives.
- **MBA job seeker:** “Reuse prior work and MBA evidence without merging team results into personal claims.” Validate corrections and second-application effort.
- **Busy professional:** “Carry reviewed facts and confidentiality choices into the next exact document.” Validate retained removals and total review time; privacy preference is not a confidentiality guarantee.

## Lean watch and ordered plan

Use one row: `vendor | task | official URL | checked date | advertised/tested/unknown | free limit | price/cadence/region | changed since | Jobvance consequence | owner | next check`. Refresh manually monthly and before pricing/positioning releases. Trigger immediate review when a rival changes free exports/autofill, introduces source-linked approvals, changes deletion/AI terms, or pilot users name a new alternative. Update only consequential claims; do not install an ongoing bot.

Run CI-01/04, then revisit CI-02/03 with observed switching reasons; assign CI-05 now. Do not copy outcome multipliers, opaque ATS scores, auto-apply, outreach, broad scraping or template volume. Preserve the $50 ceiling and disabled checkout. Public pages cannot establish a moat, competitor safety, UAE coverage or hiring improvement.
