# Independent student / new-graduate review of Jobvance

**Date:** 12 October 2026, Asia/Dubai. **Equal-weight score: 61.8/100.**

Worth trying free for a student who already has a CV and one vacancy. The guest workflow helps keep academic work truthful and produces a usable, searchable PDF. The wider promise—finding suitable graduate roles, reusing facts for a second application, tracking and recurring preparation—has substantial manual setup and was not demonstrated in an authenticated production journey.

Reviewer configuration was **gpt-6.1-sol, high reasoning**, confirmed from the root's `spawn_agent` invocation with `fork_turns=none`. This records configured-model provenance; separate provider/runtime introspection was unavailable. This reviewer did not read prior scores, reports, improvement targets or parent conversations.

## Scope and scoring

Source HEAD was verified as `2e134180a8cdbb248c5fa5dca01b1a1bf8b1fb69` in `jobvance-independent`. Public live pages inspected were the home page, student landing, guest check, sign-in/sign-up UI, pricing and privacy. The deployed commit was not independently established. Source-only observations are not represented as successful live features.

The review used ephemeral synthetic data, completed the guest check and downloaded its PDF. No account was created, no server record was saved, no employer application or message was sent, and no provider, connection or schedule was activated. Only these two audit files were added to the repository. Unit-test counts did not affect customer-experience scoring.

The scale is a persona judgment: 1 means unusable, 25 major unmet needs, 50 partial usefulness with substantial effort or uncertainty, 75 a useful coherent experience with material gaps, and 100 exceptionally complete and directly demonstrated. Unknown capabilities are neither assumed successful nor declared broken.

| Category | Score | Assessment |
|---|---:|---|
| User need / value | 73 | Useful evidence review and free export; a student still needs an existing CV and vacancy. |
| Onboarding | 74 | Six clear guest steps; the primary recurring-workflow entry requires sign-in and detailed facts. |
| UX / accessibility / mobile | 70 | Named fields, skip link, stage focus and mobile reflow; long evidence review and blank embedded PDF. |
| Evidence trust / document quality | 71 | Literal sources, academic labels and approval preserved; false unfinished-work warnings reduce clarity. |
| Job coverage / relevance | 43 | No live graduate shortlist demonstrated; discovery is configured and bounded, with eligibility review left to the student. |
| Automation / effort | 47 | Local check works; reusable facts and recurring preparation require substantial input and unverified services. |
| Tracking / actionability | 62 | Honest status/date/history implementation; no live tracker update and no guest deadline-to-action capture. |
| Reliability / recovery | 65 | Guest analysis/download and navigation recovery worked; page preference reset and PDF display failed in this browser. |
| Privacy / control | 76 | Local guest check and explicit permissions; account-wide erasure and production isolation remain unverified. |
| Willingness to pay | 37 | Would try free; proposed student spending of $15/$29 needs demonstrated coverage and effort savings. |

Sum **618 ÷ 10 = 61.8**. Willingness to pay is reviewer inference, not purchase research. Scores have the individual confidence levels in the accompanying JSON.

## The student journey

**Academic CV — observed.** The fixture was Alex Sample: an expected BSc in June 2027, an operations dashboard coursework project, student-society volunteering, Excel/pivot tables/basic SQL. The student check explicitly permits projects and coursework without employment history. It accepts pasted text or a file; it does not show a guided blank academic-CV builder. The result kept academic context and expected graduation intact.

**First vacancy — observed.** A synthetic graduate-data-analyst description asked for dashboards, Excel, SQL and clear communication, welcomed academic projects and included a closing date. The check split it into ten findings, including the fixture's introductory sentence. It reported one direct wording finding and nine findings needing review. The deadline was correctly treated as a condition rather than a CV achievement, but remained a question to handle manually.

**Evidence problem — observed and explained by source.** The completed statement “Built an Excel dashboard for a university coursework project using a synthetic dataset of 200 orders” was shown under Excel/dashboard requirements with a warning that it might describe something unfinished, expired or not held. `src/lib/cv-evidence.ts:101` includes `coursework` in the pending-language expression; lines 285–294 and 337–343 turn matching uncertain passages into conflict findings. A completed academic project is not pending merely because it is coursework. This encourages review rather than inventing qualifications, but makes the student's best evidence harder to interpret.

**PDF review and first prepared application — partially observed.** Choosing one page and previewing produced a one-page result. Both desktop and 390×844 mobile IAB screenshots showed an empty embedded PDF frame; an exact-preview link was available. After the two explicit factual/confidentiality checks, approval enabled downloads. The PDF download actually completed. Existing PDF.js independently extracted one A4 page, 595.28×841.89 points, with all fixture text, including the 200-order detail and academic/volunteering context. Review warnings were absent from the exported CV. This verifies generation, searchable content and download, not visual typography or clipping. No employer application was submitted; Jobvance tells the user to apply separately.

**Second application — source-only beyond guest recovery.** Source has reusable confirmed/shareable claims, context labels, result status and source passages. Changes and withdrawals invalidate affected approvals; unchanged current packets can be reused. A first profile and each claim nevertheless require several fields and confirmations. No signed-in second application was run. Returning from public pages to generic `/check` did restore the first CV and correctly clear its approval, but changed the selected maximum from one page back to two pages and removed student-specific guidance with the audience parameter.

**Tracking — source-only.** `src/pages/JobLoop.tsx:89–94` implements statuses, follow-up dates, notes and self-attestation for a changed status. `JobLoopPanels.tsx` supplies due cards and actor/time history. Preparation is correctly separated from submission. There are both a Job Loop and an existing workspace, which adds a navigation concept for a first-time student. The tested guest path did not turn the vacancy deadline into a tracked reminder.

**Scheduling — source-only.** `JobLoopPanels.tsx:47–59` provides explicit rules-only opt-in, daily/weekdays/weekly cadence, timezone, next run, pause/cancel and execution-history guidance. Readiness depends on the scheduler, saved profile, cleared claims and ten-account pilot capacity. No actual scheduled occurrence was verified. The Asia/Dubai default is editable; students elsewhere must choose their correct timezone.

## Coverage, privacy and payment boundaries

Source defaults employer feeds to Careem, GoCardless and Duolingo, but an operator can replace them. Those defaults do not establish actual production coverage. Discovery uses role/location matching, optional bounded search and a phrase-overlap relevance heuristic. Unknown pay, eligibility, professional-experience conditions and unverified search snippets require review. A source listing does not prove that a role is still open. No live internship/graduate vacancy sample was collected.

Live pricing explicitly says the pilot is free, first ten accounts have available loop features, and checkout is disabled. Focus at $15/month and Job Loop at $29/month are future proposals; there is no automatic conversion. I would hesitate to pay as a student until second-application effort and graduate-job relevance are demonstrated. That is an inference, not a customer demand estimate.

Live privacy separates local guest work, optional temporary tab storage, account saving, external model consent and Gmail connection. Signing in with Google is not inbox consent. Source confines usable outputs to confirmed/shareable facts and requires explicit packet approval. Job Loop erasure leaves the sign-in account and separate workspace records; account-wide deletion needs a private support request. Support receipt does not imply review or a response-time promise. Actual backend isolation, retention and erasure completion were not exercised.

## Five prioritized, measurable actions

1. **Fix academic uncertainty and irrelevant findings.** On at least 30 independently labelled student fixtures, completed coursework must never become pending solely from academic context. Keep expected degrees, unfinished projects and expired credentials unresolved. Separate administrative vacancy text and deadlines from capability findings; achieve at least 90% relevant capability extraction on a labelled sample.
2. **Guide a student's first academic CV.** At least 8 of 10 novice students starting without a CV should produce an accurate education/project/activities CV and first reviewed preview within ten minutes without help. Ask for personal contribution, context and completion; preserve sources and human sharing/factual approvals while progressively revealing optional claim fields.
3. **Show actual graduate coverage and service availability early.** Offer a read-only view of sources, last checks, pilot capacity and scheduler readiness before account setup. Evaluate at least 50 internship/graduate postings across three regions; at least 80% of recommended titles should meet the stated career-stage filter. Every result needs source/check time and explicit unknown eligibility, sponsorship, pay and closing date.
4. **Make exact PDF review robust and retain page choice.** PDF pages or an explicit meaningful fallback must work on iOS Safari, Android Chrome, desktop Chrome/Edge and IAB at 390px width. Never leave a silently blank review frame. Preserve one-page choice across navigation and authorized recovery, with approval still reset. Visually inspect ten academic PDFs for searchable text and no clipping.
5. **Connect first, second, tracking and recurring preparation around the next action.** With explicit consent, seed the career record from a reviewed first CV without retyping. At least 8 of 10 novices should complete a second packet with 40% lower median active effort. Capture a human-confirmed deadline/timezone, keep applied status separate, and prove one rules-only scheduled occurrence plus its next run/history/pause/cancel in a no-paid-provider pilot.

## Gaps and limits

No authenticated production save, second packet, tracker update, scheduled run, inbox connection, Gmail draft, support request or erasure was executed. Actual operator settings and external provider availability are unknown. Only an English pasted-text fixture was tested; uploads, scanned files, multilingual content, long CVs and DOCX layout were not exercised. The mobile view was a simulated viewport, not a physical-device or comprehensive accessibility assessment. The PDF iframe failure is specific to this environment and does not establish that every customer browser fails. Initial browsing-tool timeouts were not attributed to product downtime.

There is no evidence here of interview or employment outcomes, and none is guaranteed or inferred.
