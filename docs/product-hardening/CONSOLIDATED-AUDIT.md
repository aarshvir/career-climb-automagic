# Jobvance: consolidated independent audit and acceptance plan

Prepared 14 October 2026, Asia/Dubai, from five independent audits of the October 13 hardening preview. **The frozen equal-audit mean is 82.56/100. There is no final 95 or 98 score.** Later fixes, passing tests and finished local media do not retroactively change the initial scores. Publication and final playback checks were pending when this consolidation was written; append their receipt below.

The product decision remains one shared task: use experience the applicant can explain to review one vacancy, approve an accurate document, then reuse that experience for the next application. Students, MBA candidates and professionals with 5–10 years of experience need different examples and source context. They do not need three separate products. The nine-person formative pilot below is a proposed way to test this hypothesis; no participant results have been collected.

## Frozen assessments and observation windows

| Independent audit | Initial mean | Initial observation / freeze, UTC | Scope and boundary |
| --- | ---: | --- | --- |
| [Product manager, marketing and search](audits/pm-marketing-seo.md) | 83.3 | Initial snapshot 18:18:10; evidence captured through 18:23:48; hash recheck 18:26:44 | Guest journey and actual TXT download; public pages and local Worker HTML. Private operation mostly source-inspected. Search readiness was assessed separately. |
| [University student](audits/student.md) | 82.7 | 18:29:17–18:36:56 | Fictional student CV/no-CV/upload/reuse tasks; private screens were a local fixture. TXT transfer remained unverified in this auditor's browser. |
| [MBA and busy professional](audits/professional-mba.md) | 81.6 | Started 18:36:35; scores frozen 18:43:32; observations ended by 18:46:41 | MBA 81.3; professional 81.9. Desktop fictional first/second applications; exports inconclusive. Evidence source changed during observation. |
| [Mobile and help](audits/mobile-help.md) | 82.5 | 18:40:34–18:48:12 | Actual 390×844 viewport, keyboard/ARIA/help tasks; private local fixture. No screen-reader speech or formal accessibility certification. |
| [Reliability and privacy](audits/reliability-privacy.md) | 82.7 | Started 18:52:03; scores frozen 19:03:20 | Source, database/mocked boundary probes and fictional guest PDF preview; separately supplied hosted QA. No funded provider call. |
| **Equal-audit mean** | **82.56** | Five audit means, each with weight 20% | This is an arithmetic summary of reviewer judgments, not measured customer satisfaction. |

All dates above are 13 October 2026 UTC. Baseline HEAD was `f225451e8fc33a71848d8167a793e90c1a2dfb24`, with evolving uncommitted hardening changes. The reports retain hashes, preview origins and source-drift notes. HEAD alone does not identify the observed build. Each auditor worked without peer scores or a requested target grade. This consolidation is written by an implementer after reading the completed reports; it is not a sixth independent rerating.

| Equal-weight dimension | PM | Student | MBA/pro combined | Mobile/help | Reliability/privacy | Five-audit mean | MBA | Professional |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Clarity | 87 | 88 | 89 | 87 | 86 | 87.4 | 88 | 90 |
| Activation | 84 | 83 | 86 | 82 | 85 | 84.0 | 86 | 86 |
| Form effort | 83 | 80 | 75.5 | 84 | 77 | 79.9 | 75 | 76 |
| Evidence quality | 77 | 69 | 69 | 80 | 81 | 75.2 | 68 | 70 |
| Workflow completeness | 81 | 82 | 70 | 79 | 82 | 78.8 | 70 | 70 |
| Reuse/time-saving | 85 | 86 | 81.5 | 82 | 85 | 83.9 | 80 | 83 |
| Help/walkthroughs | 85 | 88 | 91 | 83 | 86 | 86.6 | 92 | 90 |
| UI/accessibility | 84 | 82 | 87 | 79 | 80 | 82.4 | 87 | 87 |
| Trust/privacy | 87 | 92 | 91 | 91 | 87 | 89.6 | 91 | 91 |
| Reliability | 80 | 77 | 76 | 78 | 78 | 77.8 | 76 | 76 |
| **Mean** | **83.3** | **82.7** | **81.6** | **82.5** | **82.7** | **82.56** | **81.3** | **81.9** |

Evidence quality, reliability, workflow completion and form effort are the largest common opportunities in the frozen table. These means prioritize attention; they do not establish defect frequency or quantify commercial impact.

## All 25 original finding IDs

The original wording, severity and acceptance criteria remain in the linked source reports and in this document's [machine-readable companion](CONSOLIDATED-AUDIT.json). “Independent recheck” means the original reviewer performed a narrow check after a fix. “Implementation proof” means tests/browser evidence from the implementer. “Root-reported” means supplied integration status awaiting the final receipt. None is a complete final rerating.

| ID | Common product work | Latest evidence and remaining scope |
| --- | --- | --- |
| EVID-CONTEXT | Preserve complete source context | Independent PM scenario recheck passed: whole academic/team/estimated/not-implemented passage and explicit forecast warning. Exhaustive matching quality remains unproven. |
| FIRST-VALUE | Guest first value | Independent late PM recheck passed all three audience hero routes to `/check?audience=…`, with private saving secondary. Real activation/time remains unmeasured. |
| GUEST-SUPPORT | Public recovery and operator contact | Open: a verified monitored anonymous support channel/operator identity is still required. Existing task help does not prove staffed support. No invented response SLA. |
| MOBILE-ENTRY | Start without introductory scrolling | Implementation proof: actual Chrome 390×844 Target role top729/bottom779, no horizontal overflow; compact hero/Clear/progress. Independent final recheck, 375×812 and visibility of the next action remain to check. |
| REAL-WALKTHROUGHS | Learn actual task controls | Five completed local narrated AI-presenter films, captions/transcripts/posters and decode/frame checks. Public publication/playback still pending; no frozen score credit. |
| STU-01 | Atomic vacancy requirements, metadata | Independent final browser recheck20:59:58–21:00:53 UTC resolved the exact395-character case: title omitted, five tasks separate, Excel/Power BI direct and basic SQL manual with complete negative source; full original vacancy retained. Earlier partial result remains recorded.72 focused cases are root-supplied supplementary proof; broad parser/offset verification unclaimed. |
| STU-02 | Explicit negative evidence, deduplication | Independent student standalone SQL case resolved: one source excerpt and explicit absence-of-experience explanation. Wider negation corpus remains outside that recheck. |
| STU-03 | No-CV and upload recovery | Independent student tested cases resolved: optional inline facts starter, direct-paste empty guidance, distinct scanned-PDF recovery/OCR help. Filled starter example remains in linked help. |
| STU-04 | Exact help-task ranking | Independent student `no CV` query resolved: dedicated task first, uploads second. This is product help search, not web search ranking. |
| STU-05 | Working path when private preparation unavailable | Independent overview unavailable state resolved with reason/free/manual options; filming fixture target was unsupported. Available-cloud branch and actual published navigation still need verification. |
| F01 | Specific uncertain evidence and passage context | Complete qualifiers/source badges implemented and narrow PM/reliability cases passed. The MBA fixture's full generic-manual-reason concern has no fresh independent rerun; partial rather than broadly resolved. |
| F02 | Vacancy headings and subject-specific evidence | Later parser changes and focused tests address headings/SQL relevance. Original professional reproduction still needs independent current-version verification; overlaps STU-01/R5. |
| F03 | Keep confidential removals out of future reuse | Implementation proof: explicit “Keep these edits in my reusable source” copies user-reviewed final text into this open source, with page-only Undo; approval resets, surrounding reviewed facts remain, saved records unchanged. Approved final is safe reuse default. No automated/selected-line redaction UI added; original richer selected-line request only partly met. Independent professional recheck pending. |
| F04 | One setup view for another vacancy | Implementation proof: role/optional company/new vacancy together, optional reused-CV inspect/edit, then evidence→review→fresh approval. First check retains six stages.114 targeted cases plus real browser four-stage proof; independent professional recheck pending. |
| F05 | Actual captioned media | Same media work as REAL-WALKTHROUGHS. Local files are ready, with honest fictional/local-fixture limits; public playback and export demonstrations require their own receipt. |
| MH-01 | Walkthrough keyboard boundaries | Independent mobile reviewer resolved End/Home focus loss: focus stays on focusable player and correct step status is announced. No full assistive-technology certification. |
| MH-02 | Errors attached to actual fields | Independent mobile role/CV/vacancy recheck resolved with `aria-invalid`, described error and correction clearing. Later combined-reuse validation/focus also has implementation tests; final reuse UI needs independent check. |
| MH-03 | Reversible replacement of approved work | Independent mobile recheck resolved within the stated page lifetime: Undo restores prior CV/vacancy/edits to review, fresh approval required, downloads disabled. Later reuse-mode Undo/owner/reset behavior covered by implementer tests. Undo is not retained across refresh/leaving. |
| MH-04 | Compact phone walkthrough chooser | Independent recheck resolved core issue: only selected card first; alternatives expand; no horizontal overflow. Tutorial title moved from about1739.7 to1000.4px document Y, still below the initial phone viewport. |
| MH-05 | Secondary help targets | Independent recheck partial: walkthrough links grew to32px, below44px aim; footer links about19.2px; claim-library links not revisited. Inline legal links are not automatically a formal compliance failure. |
| R1 | Accurate section context | Independent internship source recheck passed while preserving Assisted rather than Led. Implementation tests/badges cover academic/internship/personal-project/volunteering. Ambiguous headings and final rendered corpus need wider independent verification. |
| R2 | Lease covers bounded provider work | Independent in-memory PostgreSQL recheck passed180-second lease,101-second valid commit and wrong/cancelled/stale/foreign/anonymous/authenticated denials. Root reports additive hosted migration applied with service-only grants; no real slow paid call tested. |
| R3 | Rules-only recurring schedules | Independent mocked check rejects new OpenAI/Anthropic/Moonshot paid schedules before write; rules remains functional. Root reports control11/worker8 and zero existing paid schedules. No paid recurrence success claimed; final backend receipt pending. |
| R4 | Stalled private document recovery | Independent mocked headers/body45-second timeout, abort, fresh-link retry and owner fence passed. Partial: streaming byte-limit enforcement and immediate owner/unmount cancellation were not added. No actual stalled-network browser test. |
| R5 | Decorated role/employer/location metadata | Root's later heading/atomic parser fix overlaps STU-01/F02; focused cases passed. Initial reviewer saw title noise; final independent reproduction pending. |

## Current build and operating evidence

- Twenty original sourced guides and38 public routes have substantive initial HTML in the local build. PM independently checked local Worker responses/canonicals, private/404/redirect boundaries, guide inventory and article content. Actual final-origin headers, HTML/client parity, sitemap and search verification require publication checks. Metadata alignment and social preview are implementation changes, not ranking evidence.
- Five local films total **472.3 seconds /17.05MB**, with real product-screen still scenes composited with a speaking fictional AI presenter, burned English captions, WebVTT, narration, posters and provenance. These are narrated screen walkthroughs, not continuous screen recordings. Job Loop scenes use a visibly labelled local in-memory fixture, not an authenticated cloud run. [Production status](AVATAR-RENDER-STATUS.md) records decode/frame checks and license provenance. No HeyGen Free output is included in public bytes; HeyGen investigation/drafts remain private. Public asset loading, caption selection, CSP and browser playback are pending.
- [Hosted rules-only QA](../INTEGRATED-JOB-LOOP-HOSTED-VALIDATION.json) passed75 synthetic checks with no paid calls, messages or applications. It verifies service behavior/bytes/ownership/scheduling with fictional accounts; it is root-run evidence, not an independent real-customer browser study. Do not infer paid model latency, mailbox behavior, discovery freshness or hiring outcomes.
- Root reports backend **control11 / worker8**, applied180-second lease and service-only grants, with zero existing paid schedules. The independent reliability report separately validates local database and mocked boundaries. The deployment receipt must bind actual function/migration hashes; versions alone do not prove identical bytes.
- Earlier complete suite passed **784 cases before the final reuse follow-up**; the follow-up passed **114 targeted cases**, typecheck and scoped lint. Latest root full attempt ran **793 cases:792 passed, one chapter-time formatting test failed**. Root fixed the formatter;12 walkthrough cases and TypeScript then passed. The final whole-suite run awaits the immutable media manifest. These overlapping sets must not be summed into a unique total or represented as a final793/793 pass.
- [Rollback](ROLLBACK.md) remains protected: tag `jobvance-rollback-2026-10-13-v14`, baseline `f225451e…`, saved Sites version14. Preserve candidate data, reservations, audit history and the replacement key; never reset data to simulate rollback.
- Free pilot bounds remain **ten seats, shared $50/UTC-month AI/search ceiling, committed usage $0.7401** at the supplied checkpoint. Payments, ads, outreach, message sends and application submission stay off. No commercial validation or monetization result follows from this budget.

## Highest-value acceptance plan toward a possible 95+ assessment

95+ is a prospective quality goal, not a result or a guaranteed grade. Reuse the same neutral ten-dimension rubric on one hash-bound published snapshot after the gates below. Give fresh reviewers the tasks/build/evidence boundaries, not a desired score. Append any new score as a separately dated assessment; never replace the frozen table.

| Order | Shared workflow acceptance | Evidence still required | Bounded estimate / confidence |
| --- | --- | --- | --- |
| 1 | Evidence a person can defend: no role/company metadata counted; Excel/tools/SQL individually inspectable; negative SQL explicit; academic/team/forecast/support qualifiers retained in passages and exports; uncertainty explains its exact limitation | Retain passed exact STU-01 recheck; independently check remaining F01/F02/R1/R5 scope on final build; inspect PDF/DOCX/TXT/report content, not only a download request | 0.5–2 engineering/review days if residual parser defects appear; high priority, unknown prevalence |
| 2 | Guest first task: understandable CV+vacancy inputs, useful evidence within5 minutes, accurate review/approval/download without account; empty/no-CV/scanned recovery works | Actual participant times and errors; browser file delivery/inspection;375×812 and390×844 first input/next action, zoom, keyboard and readable focus | 0.5–1 day lab checks plus pilot;5-minute target comes from the requested need, not measured performance |
| 3 | Second vacancy: role/company/JD together, optional clear reused source, no history retyping; reviewed safe wording retained; old approval/PDF/export absent; Undo restores edits for fresh approval | Independent F03/F04/MH-03 walkthrough; source/final difference understood by professionals; account/reset/recovery fences and exact downloaded source text | 0.5–1 day focused checks; high confidence in implemented transition reduction, time-saving unknown |
| 4 | Recovery and help: locate no-CV/reuse/private-run recovery without sign-in; walkthrough endpoint focus remains; selected task visible; standalone help targets usable | Close remaining MH-05 scope without broad redesign; verify public monitored contact/operator; test real videos/captions/transcript fallback against final labels | 0.5–1.5 days plus owner-verified support prerequisite; staffing unknown |
| 5 | Reliable private completion: exact approved bytes, source withdrawal, owner isolation, rules schedule pause/resume/cancel, bounded artifact retry; cancelled/stale/foreign leases denied | Final actual-origin service receipt; remaining R4 cancellation/streaming limits prioritized by observed need; preserve zero funded-call test mode | 0.5–1.5 days checks; service/migration proof partly available, real paid route untested |
| 6 | Search and performance: public route/metadata/guide provenance consistency, correct private noindex/404s; no fabricated ratings | Actual origin crawl checks, successful owner Search Console verification and indexing reports; collect eligible field latency/layout data before performance conclusions | 0.5–1 day release checks; field data/indexing time depends on traffic and crawlers |

Estimates are transparent planning ranges for someone familiar with the code, not a delivery promise. Avoid adding a broad builder, more discovery integrations, automatic applications or more form fields before these common tasks are dependable. The [original PM priorities](../research/2026-10-13-PRODUCT-MANAGER-PRIORITIES.md) and [six-competitor benchmark](../research/COMPETITOR-BENCHMARK.md) support task focus; competitor feature repetition is not proof of Jobvance demand, usage superiority or search rank.

## Nine-person formative pilot

Propose three university students, three MBA candidates and three busy professionals with5–10 years of experience, within the authorized ten-seat ceiling. Recruitment/messages are not performed by this document. Use fictional material or participant-selected safe excerpts; explain local versus saved/source/final processing before any optional account step. Do not require confidential CVs, funded providers, mailbox access, applications or purchases.

Each participant attempts one first vacancy, describes a questionable finding in their own words, edits/removes an unsafe or overstated example, obtains a reviewed document, then sets up a second vacancy from the retained CV. Include one no-CV/plain-record task per student group and a recoverable upload/help task. Record task time, transitions, assistance, abandonments, field errors, source/final confusion, successful file inspection and second-application reuse. Interview notes may explain behavior but cannot establish population conversion rates.

Provisional pilot goals: at least8/9 reach first useful evidence within5 minutes without moderator assistance; all9 understand that wording does not certify eligibility; all9 keep academic/forecast/support qualifiers and no unsafe line returns during reuse; at least8/9 complete the second setup without history retyping and recognize fresh approval; at least8/9 find relevant task help within90 seconds. Track paired second-application time and effort before setting a claimed time-saving percentage. A failure redirects the next fix to the actual shared-task blocker. Nine participants support formative learning, not statistical claims of market fit, retention or hiring improvement.

## Prerequisites that remain outside the current evidence

Measured activation, completion, reuse, retention and document quality require consenting real participants and subsequent usage. Field performance needs actual eligible traffic/device data; tool wall time is not user performance. Search Console property verification, submitted sitemap, indexed URLs/impressions and observed citations/rankings are distinct steps, with no promised ranking or AI-answer inclusion. Monetization needs validated willingness to pay, usage cost/unit economics, an actually supported monitored service, accurate terms/privacy/operator disclosures, and a separate authorized decision to enable payments. The present release keeps payments/ads/outreach off.

## Publication receipt — append only

Status at writing: **pending root publication and final verification**. Append dated source commit/build hash, deployed site/version,38-route and20-guide actual-origin checks, control11/worker8 hashes, migration/grants receipt, final whole-suite count, media URLs/hashes/playback/captions, Search Console verification result, remaining recheck IDs and unchanged budget/rollback bounds. Do not replace initial audit scores or call local files public before these checks pass.
