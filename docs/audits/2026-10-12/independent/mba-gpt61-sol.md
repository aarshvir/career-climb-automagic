# Independent MBA career-pivot review — 12 October 2026

**Consolidated score: 64.2/100**, the equal-weight mean of the ten scores below. Jobvance is a credible free tool for inspecting evidence and exporting an approved CV. Its value as an MBA pivot and recurring recruiting companion is less established. I would use the free check; I would withhold subscription purchase until relevant job supply and actual preparation savings are demonstrated.

The persona is an MBA student or alumnus moving into consulting, product or strategy from another function or industry. The source reviewed was `2e134180a8cdbb248c5fa5dca01b1a1bf8b1fb69` in `jobvance-independent`; repository HEAD was verified. The [public live site](https://jobvance.io/) was inspected independently. Its deployed commit identity was not established.

Reviewer configuration is **`gpt-6.1-sol`, reasoning effort `high`, fresh history (`fork_turns=none`)**, confirmed by the parent's explicit spawn-tool metadata. Separate provider/runtime model introspection is unavailable. No prior audit scores, reports, improvement targets or parent conversation history were read. These scores are independent judgments, not a calculation from test-suite counts.

## Scores

| Category | Score | Current evidence and limitation |
|---|---:|---|
| User need/value | 67 | Useful evidence-led single-vacancy preparation. Limited help turning prior work into a persuasive functional pivot or selecting a recruiting channel. |
| Onboarding | 78 | MBA choice carries into a clear six-step guest check. Reusable career-record setup is gated and appears substantially more demanding in source. |
| UX/accessibility/mobile | 74 | Readable layouts, labeled controls, progress and working mobile navigation. Long review content takes scanning effort; full assistive-technology testing remains absent. |
| Evidence trust/document quality | 80 | Verbatim sources, academic labels, uncertainty, approval and separate evidence notes. All tested exports preserved facts. Basic formatting and conservative comparison limit the result. |
| Job coverage/relevance | 40 | Manual pasted vacancies work. Source defaults to three employer feeds, with no demonstrated MBA consulting/product/strategy market coverage. Fit is mostly lexical. |
| Automation/effort | 50 | Guest processing and exports are straightforward. Reuse and rules scheduling exist in source, but setup burden and actual recurring savings were not observed. |
| Tracking/actionability | 62 | Source includes stages, notes, follow-ups, activity and next actions. No private pipeline was exercised; MBA recruiting milestones remain thin. |
| Reliability/recovery | 67 | Public journey and exports completed; navigation recovery preserved text and cleared approval. Cloud failures and scheduler operation are unverified. Support is gated. |
| Privacy/control | 79 | Local guest processing and separate retention, saving, model and inbox controls are strong. Cloud enforcement and account-wide erasure were not tested. |
| Willingness to pay | 45 | I would try it free. Proposed recurring prices require proof of better job supply and measurable time savings; no purchasing behavior was tested. |

Sum: **642**. Equal-weight calculation: **642 ÷ 10 = 64.2**. The scale treats 50 as partially useful with substantial gaps, 75 as useful with material limitations, and 100 as convincingly complete for this persona. Unverified private features receive limited source-based credit, not full operational credit.

## What I observed live

On the home page, selecting MBA students changed both the illustrative evidence and links to `audience=mba`. The [MBA landing](https://jobvance.io/for-mba) distinguishes prior employment, team-project contribution and forecasts from measured outcomes. The examples are explicitly fictional. This is a sensible first impression for someone who needs to defend an MBA project in an interview.

I completed the [free check](https://jobvance.io/check?audience=mba) using only synthetic data: a former operations analyst, an MBA expected in 2027, supported market research, and a classroom revenue forecast explicitly labeled as an estimate. The fictional Strategy Associate vacancy asked for stakeholder reports, research management, go-to-market strategy, commercial analysis, a completed MBA by September 2026, consulting experience, SQL, work authorization and an application deadline.

The check produced **10 findings: 2 direct, 2 related, 3 missing and 3 requiring manual review**. Stakeholder reporting matched. Supported MBA market research remained related and labeled academic. The future MBA, authorization and deadline stayed unresolved. No consulting experience was invented, and the forecast was not turned into realized revenue. However, the vacancy title itself became a requirement with irrelevant CV identity passages. That inflates the count and distracts from substantive review. The missing commercial-analysis result also illustrates how literal wording offers less than a human pivot adviser would: operational cost analysis can be a starting point for discussion, while still falling short of commercial-performance expertise.

The final text remained the original synthetic CV. PDF preview reported one page. Two explicit review confirmations enabled local approval and downloads. **PDF, DOCX and TXT all completed browser downloads.** I inspected the files: DOCX text equaled TXT apart from the trailing newline; the one-page, 60,022-byte PDF equaled TXT after whitespace normalization using installed PyMuPDF. The forecast disclaimer and dash code points survived. The source downloads the same PDF blob used by preview, but I did not independently hash the live preview bytes against the download. PDF visual print quality and complex uploaded-file extraction were not established by this sample.

At a **390 × 844 mobile viewport**, the approval step and MBA landing were readable, and mobile navigation opened and navigated successfully. In the measured check state, document `clientWidth` and `scrollWidth` were both 375; there was no horizontal document overflow. This is one viewport, not a full accessibility or device audit. Small progress labels and long findings still impose reading effort.

Opening Job Loop redirected to sign-in. Returning through Free CV check restored the complete synthetic draft at step six and correctly cleared approval and PDF preview. Because the return link used generic `/check`, MBA guidance disappeared with the audience query. No refresh-storage permission was granted; refresh recovery was inspected in source, not exercised live.

The [pricing page](https://jobvance.io/pricing) displayed a free ten-account pilot, proposed $15 Focus and $29 Job Loop monthly tiers, and disabled checkout. The [contact page](https://jobvance.io/contact) required sign-in for a private support request. No direct support email appeared in the observed public UI, which leaves someone with an account-access problem without an obvious independent route.

## What the source supports, and what that means

`src/lib/cv-evidence.ts` performs an English literal wording check with selected aliases and a 40-requirement limit. It preserves quotations, distinguishes academic context and explicitly avoids a qualification verdict. This earns trust. It also constrains the main MBA promise: translating operational work into product, strategy or consulting evidence usually requires more contextual interpretation than shared words.

The private `JobLoop.tsx` career record can store individual claims with source passage, context, evidence kind, projected/measured result status, confirmation and sharing permission. Backend claim validation in `job-loop-engine.ts` preserves full passages and projection qualifiers. Corrections and withdrawals invalidate affected approvals. These are useful controls, but the detailed claim editor suggests substantial first-use effort. That effort was inferred from forms, not timed with real users.

Discovery in `job-loop-providers.ts` defaults to **Careem, GoCardless and Duolingo**, accepts at most four configured Greenhouse/Lever feeds, and caps feed reads at 100 records. `job-loop-runtime.ts` filters by title/location and records source failures separately from empty results. Broad web search requires configuration and its snippets remain unverified; generated packets from unverified search are held. This is candid, bounded discovery. It is not demonstrated coverage of MBA consulting firms, industry leadership programs, campus recruiting or product pivots. Actual deployed feeds and job yield remain unknown.

Fit scoring in `job-loop-engine.ts` combines title overlap, approved-phrase overlap and simple constraints. It labels the result a heuristic, not an ATS or eligibility result. There is no demonstrated semantic pivot-ranking benchmark. Arbitrary target titles are allowed; MBA suggestions are Business analyst, Strategy associate and Operations manager.

Private tracking code provides saved/prepared/applied/interview/offer/rejected/withdrawn stages, notes, due follow-ups, next-action cards and activity. Preparing a document does not claim an application was submitted. The schedule interface supports daily/weekdays/weekly preparation, local time, timezone, opt-in, actual next-run display and pause/cancel. Scheduler readiness and pilot capacity gate access, and the UI saves rules-only recurring preparation. **Pipeline persistence, actual next-run execution, reminder behavior and schedule recovery were not observed live.** Source implementation alone does not establish that they work for a customer.

The privacy text and support code distinguish guest processing, browser retention, account saving, external models and Gmail. Loop erasure intentionally leaves separately stored workspace records and the sign-in account; account-wide deletion requires a request. This is transparent about scope, but actual cloud enforcement, erasure completion and support response are unverified.

## Five prioritized actions

1. **Demonstrate relevant vacancy coverage.** Use a dated benchmark across consulting, product and strategy in at least two target locations, containing at least 30 known relevant employer postings. Acceptance: recover at least 80% and achieve at least 90% human-rated relevance in the first ten results per profile. Show employer source, checked date, coverage limits and unknown eligibility for every role; distinguish failed reads from a genuinely empty result.

2. **Surface transferable evidence without upgrading facts.** Validate 30 labeled synthetic pivot cases. Acceptance: surface at least 90% of expert-labeled transferable examples for review; distinguish direct wording, potentially transferable evidence and true gaps, each with verbatim sources. Zero cases may promote project support to ownership, a forecast to realized revenue, or an expected MBA to a completed credential. Exclude vacancy title/employer identity from requirement counts in every benchmark case.

3. **Make reusable setup worth its effort.** Test five new MBA users without coaching. Acceptance: at least four reach a reviewed first packet from a mixed employment/project CV within 12 minutes and prepare a second vacancy within three minutes without re-entering the CV or reconfirming unchanged claims. Keep contribution, context and result status visible; invalidate affected approvals on correction.

4. **Connect recruiting milestones to action.** Support timezone-aware employer deadlines, referral follow-ups and interview-round milestones on one opportunity. Acceptance: users can record and find each next action in under 60 seconds and export a usable calendar reminder; all benchmark dates preserve the intended timezone and due-state behavior. Document preparation must never record an application as sent.

5. **Prove the private loop and its paid value.** Run a controlled pilot completing record → two relevant opportunities → approved export → tracked application → scheduled rules run → pause/cancel, with visible receipts. Acceptance: demonstrate expired-session recovery, failed source, unavailable scheduler and claim correction without silent success, data loss or stale export; offer an account-access-independent contact route and account-wide erasure completion receipt. Before charging, at least six of ten MBA testers should independently report 30 minutes saved across five applications and voluntarily choose the proposed subscription at its stated price; record all refusals and reasons.

## Review limits

No account was created or used. No private records, cloud providers, Gmail, messages, paid services or purchases were exercised. No runtime code or persisted account data was changed, and no tools were installed. Synthetic guest downloads were inspected using existing local readers. Only this Markdown file and its JSON counterpart were written in the repository.

Live private authentication, cloud claim persistence, packet export, correction invalidation, discovery configuration, schedule operation, pipeline/follow-up persistence, cloud privacy enforcement, erasure and support resolution explicitly remain **unverified**. Full keyboard/screen-reader/contrast testing, cross-browser behavior, complex/scanned file extraction and real user savings were not tested. No interview or employment outcome was measured or guaranteed.
