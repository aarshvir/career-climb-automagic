# Jobvance student audit — 11 October 2026

I am a **simulated customer expert**, assessing an undergraduate/final-year student's experience. This is not a real customer interview or evidence of employment outcomes. My judgement is that Jobvance is a credible free CV review utility, but it does not yet deliver a complete first-job search. Weighted score: **57.0/100**.

## Scenario and evidence boundary

“I am completing a BSc in Computer Science in June 2027. I want my first full-time graduate data analyst role in Dubai. I have a university team project, a six-week operations internship and student volunteering. I need to find suitable open roles, check graduation and work-authorization conditions, prepare a truthful one-page CV, and remember application deadlines around classes. I cannot claim one year of professional analysis experience or team leadership.”

**LIVE observed:** Public browser inspection of the homepage, student check, signed-out loop handoff, pilot, pricing, help, privacy and contact. I entered only fictional text into the device-only guest check and reached step six. I repeated one controlled variation of the same input. No approval, download, account creation, account saving, messages, payments or application submissions occurred. At 390 × 844, I inspected the student check and opened its mobile navigation; the temporary viewport was reset. The web reader could not fetch the domain, but the browser loaded these pages; this is not evidence of a site outage.

**SOURCE verified:** Current route tree in `src/MvpApp.tsx` (`src/App.tsx` reexports it), guest evidence logic, Job Loop interface/contract/runtime, document renderer and release configuration. File references below are relative to `jobvance-independent/`.

**Not verified:** Authentication, saved-account journeys, actual cloud runs, cloud document downloads/layout, employer feeds, paid AI calls, inbox processing, reminders delivered externally, deletion fulfillment, screen-reader usability or real vacancy availability. The release record says model/search/mail capabilities were unavailable while disabled, Gmail remains disconnected, and daily scheduling is not configured (`docs/CLOUD-JOB-LOOP-RELEASE-STATUS.md:20,32,34`). Those are recorded operating limits, not my execution results. Test totals did not determine scores.

## Route-by-route experience

| Route | Student experience and friction | Evidence |
|---|---|---|
| [Home](https://jobvance.io/) | LIVE: Students are the default audience. Graduate analyst examples, academic labels and no-account/free promise feel relevant. The lower loop diagram includes replies and search before I can see which connections are actually enabled. | `src/pages/ProductPage.tsx:49,116,143` |
| [Student check](https://jobvance.io/check?audience=student) | LIVE: Six clear steps; paste works without employment history. The factual review preserved my project contribution. Results mix useful passages with generic questions and irrelevant matches; approval preview is text, rather than the rendered CV. | `src/pages/CvCheck.tsx:26,153,244,246` |
| [Job Loop](https://jobvance.io/loop) → [sign in](https://jobvance.io/auth?next=%2Floop) | LIVE: Redirect preserves the destination but shows a generic workspace explanation, with no public capability preview. SOURCE: separate career record, claim confirmation, opportunities and outputs. I cannot count a successful cloud loop from this visit. | `src/MvpApp.tsx:38`; `src/pages/JobLoop.tsx:14,268,273` |
| [Help](https://jobvance.io/help), /how-it-works | LIVE help repeats the guest six-step check. SOURCE how uses the same content. Neither explains migration into the loop or a first-job search routine. | `src/pages/ProductPage.tsx:191` |
| [Pilot](https://jobvance.io/pilot) | LIVE: Clearly fictional and transparent about human research participation. Its central Strategy Manager/consultant example is remote from a student's first job; a student request path exists lower down. | `src/pages/PilotLanding.tsx`; `src/lib/pilot-request.ts:1` |
| [Pricing](https://jobvance.io/pricing) | LIVE: Free access and unavailable $29 pass are clear. Guest checks, one account pack and the free loop have different limits; the pricing page does not explain their relationship. | `src/pages/ProductPage.tsx:190`; release status `:28` |
| [Privacy](https://jobvance.io/privacy), [Contact](https://jobvance.io/contact) | LIVE: Helpful explanations of local processing, explicit saving and separate inbox permission. Privacy sends erasure requests to support, while Contact says direct support details are unavailable; Pilot publishes contact@jobvance.io. Delivery/ownership of that address is unverified. | `src/pages/ProductPage.tsx:156,160,194`; `src/lib/pilot-request.ts:1` |
| /dashboard, /jobs, /applications | SOURCE only: The account workspace is separate; /jobs redirects to tailoring, /applications to its tracker. These are not a public jobs catalogue. Authenticated use is Not verified. | `src/MvpApp.tsx:103,113,117` |

## Demonstrated strengths

The student starting point is substantive: coursework, internships and activities are accepted, while academic work is explicitly distinguished from professional experience. In the live check, my “did not lead the team” wording survived into review and final preview. The product does not disguise keyword findings as a qualification or hiring prediction (`src/pages/CvCheck.tsx:26,67,245`).

Guest review has low commitment: no card, account or original-file upload is needed. Source passages and line references remain visible; evidence reports are separated from the CV. Approval and privacy confirmations precede export (`src/pages/CvCheck.tsx:45,138,246,247`).

SOURCE: The loop preserves evidence context, measured versus projected results, user sharing decisions and exact packet approval. It checks current revisions and holds page/font failures, while model integrations select approved claim IDs rather than generating factual CV text (`src/pages/JobLoop.tsx:25,38,69,281`; `supabase/functions/_shared/job-loop-engine.ts:87`; `supabase/functions/_shared/job-loop-providers.ts:57`). These are worthwhile controls; their authenticated execution was not verified here.

## Common scorecard

Anchors: 0 absent/broken; 50 usable with major friction; 75 strong with material gaps; 90+ exceptional with supporting evidence. Confidence describes this audit's evidence, not statistical certainty.

| Dimension | Weight | Score | Evidence and confidence |
|---|---:|---:|---|
| Audience need/positioning | 10% | 78 | LIVE student examples and academic contribution framing meet a real first-job need. First-job discovery/eligibility promise remains weak. High. |
| Onboarding/time-to-value | 15% | 67 | LIVE guest reaches evidence without signup; SOURCE reusable loop requires profile plus individually cleared claims. Guest-to-loop continuity is missing. Medium-high. |
| CV-vacancy evidence/output quality | 15% | 50 | LIVE correct source preservation, but a controlled skills-line variation changes completed-project classification; dates/sponsorship receive generic guidance. Actual files Not verified. High for evidence, low for files. |
| UI/interaction design | 10% | 76 | LIVE polished hierarchy, six-step progress, clear controls and deliberate review. Long findings and multiple preparation surfaces add effort. Medium-high. |
| Complete job-loop delivery | 15% | 50 | SOURCE supports reusable facts, per-role packets and manual tracking; recorded inbox/search limits leave major stages unavailable. Authenticated delivery Not verified. Medium-low. |
| Live vacancy discovery | 10% | 0 | No live vacancy discovery demonstrated. Recorded search capability unavailable; sources require configuration. Manual pasted vacancies are preparation inputs. Medium. |
| Application tracking | 5% | 62 | SOURCE statuses, notes and follow-up dates with honest user attestation. Separate account/loop stores and no structured closing date. LIVE persistence Not verified. Medium-low. |
| Privacy/trust/control | 10% | 76 | LIVE explicit local/save boundary; SOURCE selective sharing and withdrawal controls. Erasure/support route is inconsistent. Security execution Not verified. Medium. |
| Mobile/accessibility | 5% | 72 | LIVE 390px layout and labelled menu work; first role field lies below the initial viewport. SOURCE focus styles, labels and reduced-motion handling. Assistive technologies Not verified. Medium. |
| Repeat use/commercial readiness | 5% | 45 | Reuse is promising in SOURCE; LIVE help/support and transition friction limit recurring value. $29 is planned, with no current paid validation. Medium. |

**Vector, in the requested order:** `[78, 67, 50, 76, 50, 0, 62, 76, 72, 45]`. Weighted sum: **57.0**.

## Improvement findings and acceptance criteria

1. **P1 — Make suitable live-role discovery usable.** The scenario cannot start inside Jobvance: search is recorded unavailable and employer sources need setup. Homepage's search stage therefore precedes an external hunt (`src/pages/ProductPage.tsx:77,145`; release status `:20,34`; `supabase/functions/_shared/job-loop-runtime.ts:136,143`). **Accept:** A student can retrieve a non-fictional graduate shortlist from at least one permitted source, with employer, full posting, checked time and open-status uncertainty; failed/unavailable sources never resemble zero available jobs. Publish current capability before signup.

2. **P1 — Scope uncertainty to the relevant claim.** LIVE: “Developed Python reports for a university team project” was flagged unfinished/expired when the skills line said “Python, SQL coursework, Excel, English.” Removing only “Python” from that line produced a direct wording finding for the unchanged project. Any related pending passage currently overrides positive evidence (`src/lib/cv-evidence.ts:98,310`). **Accept:** This paired input preserves the completed project's finding; SQL coursework stays qualified. Negation/pending status affects its own skill or task, and explanations identify the exact uncertainty without weakening independent evidence.

3. **P1 — Separate eligibility and deadlines from CV evidence.** LIVE: graduation year and closing date received team-size/budget explanations; “visa sponsorship is not available” was paired with “I did not lead the team.” One-year professional experience pointed to academic data-cleaning contribution. The product correctly withholds certification, but offers little practical next action (`src/lib/cv-evidence.ts:292,300`; loop assessment `supabase/functions/_shared/job-loop-engine.ts:208,212`). **Accept:** Show explicit manual-review fields for graduation/start date, professional-experience requirement, authorization/sponsorship and closing date. No unrelated passage appears as eligibility evidence, academic work is labelled, and deadline wording never invites adding an achievement to the CV.

4. **P2 — Carry a guest check into one reusable search.** SOURCE: saved guest checks use `cv_checks`; loop CV import uses saved CV documents, and guest tracking saves a blank job link (`src/lib/free-check-api.ts:32`; `src/lib/job-loop-api.ts:119`; `src/pages/CvCheck.tsx:204`). **Accept:** With explicit saving consent, offer “Continue this application in Job Loop,” preserving source, vacancy, final text and provenance. Ask for factual confirmations where needed without retyping; keep one linked opportunity/approved version.

5. **P2 — Guide a student through their first evidence record.** Loop claims require context, source passage, wording, result status and two permissions; up to 30 literal suggestions can arrive together (`src/pages/JobLoop.tsx:69`; `supabase/functions/_shared/job-loop-engine.ts:164`). **INFERENCE:** A student unfamiliar with CV writing may struggle to establish these distinctions. **Accept:** Offer a short project/internship/volunteering interview and three-claim starter review, using examples of individual contribution and unmeasured results. Preserve all consent and context checks; never require employment or invented metrics.

6. **P2 — Protect unsaved work during exploration.** LIVE: navigating away from step six and returning opened an empty step one. The warning says refresh clears work, but global route exploration also loses it (`src/pages/CvCheck.tsx:86,116,241`). **Accept:** Before leaving a populated check, explain loss and offer stay, discard or an explicit device-only draft recovery option. Default privacy remains unchanged; recovery expiry and deletion are visible.

7. **P2 — Make the next action durable across trackers.** SOURCE: guest/legacy tracking uses `tracked_applications`, loop uses opportunities; loop entries contain status, follow-up and notes but no structured application deadline (`src/lib/workspace-api.ts:111`; `supabase/functions/_shared/job-loop-types.ts:44`; `src/pages/JobLoop.tsx:83,248`). **Accept:** Present one linked application timeline with closing date, employer link and approved version. Show imminent deadlines separately from follow-ups; offer an explicit calendar export/reminder choice. No delivery or daily checking is implied without a configured mechanism.

8. **P2 — Review the rendered CV before approval.** LIVE step six displays plain text. SOURCE guest exports flatten lines into generic paragraphs; loop shows page count and text rather than a page preview (`src/pages/CvCheck.tsx:246`; `src/lib/document-export.ts:49,78`; `src/pages/JobLoop.tsx:281`). **Accept:** Display the actual one-page PDF layout before final approval, including section hierarchy, overflow and unsupported-character problems. Preview and exported artifact must match. Output attractiveness/readability still needs real student review.

9. **P2 — Resolve support and data-request ambiguity.** LIVE Contact says unavailable, Pilot publishes an address, and Privacy directs account erasure to support (`src/pages/ProductPage.tsx:160,194`; `src/lib/pilot-request.ts:1`). **Accept:** Publish one monitored support/data-request route consistently, with receipt confirmation and response expectation. Verify account-owner requests and clearly explain which originals, checks, packets and downloaded files can be erased.

## Highest priorities and willingness hypothesis

The three highest priorities are **live graduate-role discovery**, **claim-specific evidence precision**, and **a practical eligibility/deadline review before tailoring**. These determine whether I can choose a worthwhile role and understand my next step; extra model choices alone would not solve them.

As this simulated student, I would try the free check for a vacancy I already found and use its visible source comparisons cautiously. I would not yet make Jobvance my daily search system. Paying the planned $29 for ten packs is **not supported by this audit**: my willingness would depend on demonstrated time saved across several genuine graduate roles, useful eligibility guidance, reliable attractive exports, a unified tracker and reachable support. A student discount or institution-supported access could be tested, but neither demand nor a price has been validated.

Live evidence is retained in sibling `student-live-*.txt/.png` files, including original versus counterfactual findings. No other auditor's report was read.
