# Jobvance cycle 2: independent reviews and concrete fixes

Five isolated reviewers assessed the candidate on14October2026 without prior or peer grades or a requested target. The frozen equal-review mean is **87.36/100**. The MBA and busy-professional judgments share one reviewer and have one combined20% weight; the other four reviews each carry20%. Each review averages ten equally weighted dimensions. Scores are bounded judgments about synthetic journeys, not measured customer satisfaction, hiring outcomes, market fit, search ranking or scale.

Root consolidated these reports after implementation. This document is not a sixth independent review. Each original report keeps its initial scores and observation/hash boundaries; targeted rechecks record pass/fail separately. Compared with cycle1's82.56, this is a different assessment wave with different observation boundaries, not a controlled measurement of a4.8-point customer improvement.

| Dimension | PM | Student | MBA | Professional | Mobile/help | Reliability/privacy | Five-review mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Clarity | 88 | 89 | 90 | 88 | 91 | 90 | 89.4 |
| Activation | 90 | 86 | 89 | 90 | 92 | 92 | 89.9 |
| Form effort | 87 | 82 | 87 | 85 | 87 | 86 | 85.6 |
| Evidence quality | 78 | 66 | 69 | 79 | 82 | 88 | 77.6 |
| Workflow completeness | 89 | 85 | 88 | 88 | 92 | 91 | 89.0 |
| Reuse / time saving | 90 | 90 | 92 | 93 | 94 | 91 | 91.5 |
| Help / walkthroughs | 91 | 89 | 88 | 89 | 93 | 87 | 89.7 |
| UI / accessibility | 86 | 86 | 86 | 86 | 84 | 86 | 85.6 |
| Trust / privacy | 90 | 80 | 92 | 93 | 92 | 94 | 89.7 |
| Reliability | 85 | 82 | 86 | 88 | 89 | 85 | 85.6 |
| **Mean** | **87.4** | **83.5** | **86.7** | **87.9** | **89.6** | **89.0** | **87.36** |

Original reports: [PM](cycle2-audits/pm.md), [student](cycle2-audits/student.md), [MBA/professional](cycle2-audits/professional-mba.md), [mobile/help](cycle2-audits/mobile-help.md), [reliability/privacy](cycle2-audits/reliability-privacy.md). Their JSON companions preserve fixtures, raw scores, hashes and scope. [Consolidated data](CYCLE2-CONSOLIDATED-AUDIT.json) verifies the arithmetic. Git base9682cd1 plus each reviewer's file hashes identifies its dirty candidate; Git HEAD alone is insufficient. Reliability retained an exact frozen source snapshot, and explicitly separates post-change browser recovery observations.

## Shared workflow changes before these reviews

- Optional literal source-line selection with two-version preview, explicit apply/cancel, undo and fresh approval. Remaining text and line endings stay literal; edited/nonidentical passages need separate review. No saved record is silently changed.
- Artifact streams cancel on account, page, packet and approval/source changes. Actual streamed bytes are capped at10MiB, including misleading headers. Repeated requests receive fresh private links.
- Task-first walkthrough chooser,44px help controls and transcript chapter times from released media rather than planned durations.
- Account-free support with a private receipt code; metadata-only staff queue, explicit audited message access, versioned replies/status, durable quotas,90-day expiry and daily retention. No support email or response-time promise.

## Thirteen findings and the resulting bounded fixes

| Original review / finding | Fix and acceptance evidence |
| --- | --- |
| PM PM-01: team-supported development marked direct | v4 keeps dependent work partial with its own-contribution limitation and in the review filter. Original PM independently rechecked exact failure and genuine-owned positive example. |
| PM PM-02: qualified university project treated as professional experience | v4 classifies academic context across the full source line and qualified project names. Professional-experience requirement stays partial; a generic task can remain direct with academic label. Original PM rechecked both boundaries. |
| Student S1: class/coursework professional-experience false positive | v4 recognizes coursework/class headings and attached academic qualification. Full quote/offset preserved; targeted student recheck is recorded separately when complete. |
| Student S2: team alone produces chart match | v4 excludes a generic team-only passage when the requested task has other substantive objects. Positive chart example remains discoverable. |
| Student S3: student guidance lost after help | Selected audience travels with the same owner-bound temporary draft, including consented refresh. Explicit new selection overrides it; clearing a check removes it. Facts and approval are separate. |
| MBA/pro PM-01: negative about direct reports overrides written reports | v4 distinguishes the people-management object from written reports. Exact positive and genuinely relevant negative regressions pass without stripping the negative source. |
| MBA/pro PM-02: confidential search misses removal help | Dedicated removal topic now includes that customer wording; exact help-search regression passes. |
| MBA/pro PM-03: verified-experience overclaim | Live-source wording now says experience the applicant reviewed. Busy-professional guidance also covers a next role without assuming a career switch. |
| Mobile MH-01: source actions/approval lose focus | Same-step actions focus a stable heading after the DOM update. Original reviewer independently observed apply, undo, source update and approval; next Tab reaches the current CV. |
| Mobile MH-02: removal controls omit passage | Each checkbox's accessible description resolves to its literal source line. Independent DOM/browser association verified; spoken screen-reader coverage is not claimed. |
| Mobile MH-03: playback controls cover burned captions | Rebuilt all five recordings with54px captions, an elevated band and180px bottom clearance; local media checks passed. The actual version17 phone check still found physical native-control overlap. A final mobile4:3player keeps the uncropped16:9recording at the top and reserves space below for controls. Root and the original reviewer observed clear paused captions locally; actual-domain version18 verification is separate. Immutable media commit remainsce2b976a40be461d8c5a3f6c65f77bf60a795380. |
| Reliability RP-01: signed-link wait escapes timeout | One45-second deadline now covers auth, link issuance, transfer and final owner check. Original reviewer independently reran45API tests; late timed-out links cannot fetch and fresh retry succeeds. |
| Reliability RP-02: cancellation instructions contradict current-run behavior | All five copy surfaces match SQL: Pause retains current work; Cancel also stops the latest queued/running scheduled job; a separate manual run has its own control. Independent11SQL +25frontend tests pass, including stale-lease rejection. Corrected rendered narration is a separate media release gate. |

The initial grades above are not raised by these fixes. Recheck files and appendices state their exact source hashes and whether validation used browser, downloaded bytes, source, tests or supplied hosted receipts.

Separate rechecks: [PM](cycle2-audits/pm-recheck-v4.md), [student](cycle2-audits/student-recheck-v4.md), [MBA/professional](cycle2-audits/professional-recheck-v4.md); mobile and reliability appendices are inside their original reports. All13 exact findings have implementation proof; the original reviewers independently rechecked the12 non-media findings. Media has local producer/root frame and decoder proof before its final hosted phone-controls check. Root additionally extended explicit MBA/capstone context and the compound support-plus-owned-action boundary; those regressions are included in the final suite, with a separate PM recheck requested.

Final functional validation before publication: **890/890tests across66files passed**, application TypeScript and quiet ESLint passed. After immutable media wiring,25help/walkthrough/guide checks passed; the final functional parser extension then passed the complete890suite. Build:38public pages,20complete guides,58structured-data hashes, zero outbound renderer requests;114assets, compressed Worker2,730,269bytes under3MiB. The first unrestricted-worker run had one20-guide render test exceed its5-second lab limit under concurrent media/analysis load; limiting test concurrency to four passed all889at that checkpoint, then all890after the added final boundary case. This was a test-resource observation, not a live page timeout.

## Release and evidence gates

Before publishing: finish and inspect the corrected media, wire immutable owned asset URLs, run the complete suite after final runtime changes, TypeScript/lint,38-page prerender/build and host checks; commit/push exact source and deploy on the existing public Jobvance.io site. Preserve both saved version16 and the original version14 rollback tag. Store exact runtime/version/archive/backend hashes in sibling jobvance-repair-evidence; do not use a self-referential commit hash in tracked release files.

Backend evidence is separate: the previous75actual hosted rules-only checks and current9public-support HTTP checks plus native SQL access/retention/owner checks use fictional data. Three own tagged support QA rows were subsequently removed by exact-ID+tag guard, preserving real requests and audit. No actual candidate record was read for these audits. New guest-support1/admin3 are deployed; candidate control11/worker8 remain. No paid AI/search calls, sends, ads or employer submissions were made. Shared10-user/$50UTC-month limits remain; last observed October committed usage$0.740100.

## Focused next loop

Keep one core product for students, MBAs and busy professionals: source once, one vacancy, explainable evidence, reviewed document, reuse. Fix reproducible failures in that shared task before adding integrations. Do not add ten more features to chase a numerical grade.

1. Preserve every initial report. Finish targeted rechecks and publication receipts for this cycle, then use a hash-bound release for any fresh review.
2. Run the existing nine-person formative protocol only with actual consenting participants when available: three students, three MBA candidates, three busy professionals within ten seats. Record unaided first-value time, source/final confusion, factual context, downloaded-file inspection, second-application effort and help recovery. No recruitment or outreach has been sent.
3. Use those observations to simplify the common bottleneck. Synthetic agents do not establish real retention, willingness to pay, usability percentiles or a95+customer rating.
4. Observe real Search Console indexing/query data and field performance when data exists. Sitemap Success/38discovered pages and an indexable homepage establish discovery readiness; they do not establish a top search position on Google or AI answers. Keep the20distinct sourced guides accurate rather than expanding thin pages.
5. Continue the existing quiet three-hour improvement heartbeat through its authorized window. Notify only about a meaningful fix, completion, failure or required external action. Do not rerun unchanged passed checks, invent metrics, enable paid services or rewrite grades.

The stronger three-persona marketing lab remains private at127.0.0.1:8397 and outside production/Git assets; [copy research plan](COPY-RESEARCH-PLAN.md) explains the tests. The public site sells current capabilities without invented customers, testimonials or outcomes.
