# Deep Tailor, account journey and discovery — integrated assessment

17 October 2026. **Public v35 is live at https://jobvance.io.** Runtime source `b75fdaa5608782394a36b936ec13e4a11ac1c3fb` was saved as `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_ffac81e8552c81919aaa628970895a3a`; deployment `appgdep_6ad3860926a08191b51f887b578fd2ab` succeeded at 2026-10-17 14:28:43.941335 UTC / 18:28 Dubai. The [sanitized release receipt](../../releases/2026-10-17-deep-tailor-account.json) records exact source, backend and validation boundaries. No new migration was applied. This documentation-only update does not change or redeploy that runtime.

## Product change

Job Loop remains the recurring product. Account creation/sign-in is required for the candidate journey, followed by a quiz that collects chosen roles, locations, optional compensation, reviewed contact details, explicit experience years and uploaded/pasted or guided CV text. Saving is deliberate and private. The corrected owner/auth/lifecycle-bound handoff opens My CV & experience; persistent next-step controls guide the candidate to factual review, saved CV variants and schedule selection. Saving the quiz does not implicitly confirm facts, activate a recurring schedule or grant AI-processing consent. The old pilot heading is removed; service history, customer success and maturity are not fabricated.

Claude's Deep Tailor was reviewed and integrated with the current Loop rather than treated as proof of finished customer outcomes. Confirmed answers bind exact original CV lines and the selected vacancy. Loop rewrites retain full source/revision/context receipts, are checked against the claim they rewrite, and preserve original evidence separately from the proposed wording. Cross-employer transfers, invented numbers, stronger ownership, negated/uncertain evidence promotion, missing answer citations and stale source receipts have bounded regression checks. Rendering a document does not approve it. Current-source authority and exact-artifact review/approval remain required. See [independent Deep Tailor review](DEEP-REVIEW.md).

Discovery adds Ashby alongside Greenhouse and Lever and uses six verified default public employer boards: Careem, GoCardless, Duolingo, Toast, Notion and Zapier. Explicit server source configuration remains authoritative. Reads are bounded by bytes, examined rows and retained matches; relevance is applied before retention. Exact URL/source identity deduplicates jobs while preserving manual descriptions and existing application history. Automatically prepared listings need a fresh source observation in that run. A previously saved listing absent from a failed, capped or filtered read becomes unverified, not expired, and is skipped for automatic preparation. Role/location guards and plain observed-fit/missing-condition explanations improve relevance without claiming complete coverage or a semantic fit score. See [discovery assessment](../2026-10-17-discovery/ASSESSMENT.md).

The prior [v34 recurring-backend release](../../releases/2026-10-17-recurring-backend.json) already supplies three owned CV variants with independent facts; weekly, three selected weekdays and daily schedules; and explicit recurring AI provider/model/route consent. Its original evidence remains historical. A fresh bounded hosted synthetic run against the updated backend is recorded below; it does not replace unassisted or multi-day acceptance.

## Validation

- Coordinator-confirmed final full suite: **2,560 tests in 142 files passed**, 43.12 seconds, against the current integrated runtime. Initial stale feed/harness expectations and a deferred-navigation assertion were corrected before the final run; failing intermediate runs are not counted as passes.
- Application TypeScript, **28 source and 28 generated Deno cases**, complete production build and **12 hosting groups** passed. Focused independent counts in component reports overlap the full suite and must not be added as unique tests.
- Actual isolated desktop browser interaction completed explicit role, location, compensation, contact, experience and CV entry, deliberate private save, and the corrected record handoff. It used synthetic/local boundaries; this is not a new hosted signup or unassisted customer completion.
- The same saved handoff page was inspected at a 390×844 mobile viewport with document width 375 and captured; this is a mobile layout observation, not a separate mobile completion. Private screenshots are `onboarding-desktop-handoff.png` and `onboarding-mobile-handoff.png`. The local port-8089 harness was stopped and no listener remained.
- Backend worker **14**, control **19** and tailor-for-job **4** are active. Native readback matches both worker files, both control files and all six retained tailoring files. The platform pruned an unused guest-support file; retained-file parity is not a claim that every submitted file was retained. OAuth was unchanged; no new GC configuration query or change is claimed.
- Fresh hosted synthetic acceptance passed **49 checks**: three CV variants saved; two manual rules runs and one daily AI run produced **nine PDF/DOCX/TXT downloads** with exact Storage/manifest byte checks. Weekly, three-times-weekly and daily schedules were saved, but only daily dispatch was observed after the operator deliberately made the synthetic schedule due. Recorded AI usage settled at **US$0.003906**. This does not establish a nonempty Deep Tailor rewrite, an independently counted two-provider-transaction execution, multiple observed days or unassisted use. The synthetic schedule was cancelled at version 4 and no live lease remained, as verified by the coordinator. No real candidate record was used.
- Native readback of that scheduled run verifies all six deployed default employer-board lanes: Careem 14, GoCardless 32, Duolingo 63, Toast 318, Notion 128 and Zapier 11 published rows. **Every lane returned zero matches for the synthetic Operations Analyst / Remote preferences.** The run instead processed two user-provided QA vacancies and finished `partial`; broad web search was not connected, LinkedIn was blocked and mailbox access was not requested. The prepared outputs prove bounded processing, not successful discovery of relevant jobs for this fixture. This is distinct from the deliberately broad local adapter fixture above.
- Live HTTP verification passed for **nine page bodies, 34 JavaScript assets and six unauthorized handler probes**. HTML comparison removes only the observed appended Cloudflare challenge script; application HTML and asset bytes otherwise match the build. All 43 HEAD bodies were empty; recorded ETags matched GET, while the platform omitted HEAD Content-Length. HTTP verification alone does not execute the account or payment journey.
- Actual public GETs through the discovery adapter returned **566 published rows and 86 matches** for one deliberately broad combined role/location fixture across six boards. This is a one-time technical readback, not a typical customer's daily yield or market coverage. See [source readback](../2026-10-17-discovery/live-source-readback.json).
- Isolated worker/provider fixtures exercise discovery, composition, rendering, unchanged repeat reuse, failed-feed stale handling and later recovery. They do not establish repeated real-provider quality or fourteen-day customer value.

Three independently assigned implementation/review contexts contributed. The independent onboarding review found missing handoff, contact/experience fields and pilot copy; later source readback verifies the corrections. It did not identify a new authority bypass in the corrected flow. See [onboarding review and correction readback](../2026-10-17-discovery/ONBOARDING-INDEPENDENT-REVIEW.md). This bounded review is not full commercial certification.

## The same 100 personas: honest forecast

The original `2026-10-17-pmf-simulation/personas.json` and `AGENT_BRIEF.md` were retained unchanged. Their SHA-256 hashes, both reviewer-file hashes, exact P001–P100 membership and aggregate counts are in [simulation summary](simulation-summary.json). Two separate agent contexts individually reviewed 50 personas each using the updated product ground truth, the same realism principles and explicit evidence. They did not generate 100 new customers or conduct 100 independent browser sessions. Original historical results were not overwritten.

| Forecast measure | Result |
| --- | ---: |
| Personas assessed | 100 |
| Recommendation scores 9–10 | 0 |
| Recommendation scores 7–8 | 25 |
| Recommendation scores 0–6 | 75 |
| Forecast recommendation index | **−75** |
| Mean forecast recommendation | 5.52 / 10 |
| Conditional recurring purchase interest | 45 |
| Definite recurring purchase intent | 0 |
| Conditional very-disappointed judgment | 10 |
| Definite very-disappointed judgment | 0 |
| Actual participants / confirmed purchases / observed days | **0 / 0 / 0** |

The index uses the familiar promoter-minus-detractor calculation, but **it is not measured NPS**. It does not meet the requested +60 target. Conditional interest is not a paid conversion or a very-disappointed survey response. The forecasts have no statistical confidence interval and should guide priorities, not marketing claims. They assume the corrected handoff and removal of the old pilot heading; superseded navigation defects were not retained as current penalties.

The largest concerns remain useful recurring discovery across this mixed country/industry cohort, setup effort on mobile, uncertain incremental value over familiar tools, incomplete recurring purchase mapping and missing institutional administration for coaches/universities. Specific-vacancy document preparation often fares better than the promise of an automated broad job search. Residence was never treated as work authorisation. The sparse title/location sample in the separate capability matrix is not a measured match rate.

Read the individual rationale, confidence and blockers in [P001–P050](persona-review-1.jsonl) and [P051–P100](persona-review-2.jsonl), with the latter's [method receipt](persona-review-2-method.json). No scores were forced upward to satisfy the target, and a difference from the historical Claude forecast is not a measured uplift.

## Remaining delivery and acceptance

- Coordinated worker/control/tailoring/site publication and retained-file readback are complete for v35. Preserve rollback tag `jobvance-before-account-deep-tailor-2026-10-17`, saved v34 and private `deep-tailor-before-*` handler sources. Source rollback is not a database/file restoration.
- The new quiz still lacks optional recovery before its final save. Industry/work-right/notice-period filtering and broader useful discovery remain open. Six public boards are not whole-web search or licensed aggregator access.
- Confirm unassisted account-to-first/second application preparation, actual repeated-day relevant opportunities, nonempty hosted Deep Tailor rewrite quality and independently observable provider execution. Bounded hosted synthetic execution and local observations do not establish those outcomes.
- Recurring subscription checkout-to-entitlement mapping and merchant/live acceptance remain incomplete. Existing one-time Dodo payment paths are preserved; no new recurring sale or successful charge is claimed. Payment state must come from current native receipts, not these forecasts.
- Older result pagination, grouped per-application review, unsupported PDF scripts, full-route ambiguous-request recovery and the other original tracked requirements remain open unless a later specific receipt resolves them.
- The three videos, Facebook page and Meta launch are separate workstreams. This assessment does not imply content was published, ads activated, budgets spent or cold emails sent.

The bounded source improvements are implemented and tested. The complete product, a +60 measured NPS, broad recurring market coverage and a ready recurring commercial funnel are not declared complete.
