# Independent workflow review of 100 synthetic customer profiles

**Projected panel score: 61.89/100.** This is a rule-based expert assessment of 100 synthetic task profiles against v25 source, not100 customers observed using the site. It does not estimate conversion, retention, NPS, interview success or willingness to pay.

The amended panel includes 88 readable inputs,6 scans and6 people without a CV. All profiles need a second vacancy; 27 use mobile and 33 need discovery. The mix is a planning scenario, not measured traffic.

## Projected dimension scores

| Dimension | Weight | Mean |
|---|---:|---:|
| understand_value | 10% | 70.53 |
| get_started | 10% | 72.19 |
| first_application_value | 20% | 64.06 |
| effort_saved | 20% | 43.48 |
| return_second_application | 15% | 52.64 |
| trust_control | 10% | 83.38 |
| interface_help | 10% | 62.76 |
| operational_reliability | 5% | 72 |

## Projected cohorts

| Scenario cohort | Profiles | Mean | Range |
|---|---:|---:|---:|
| Final-year students with a CV | 15 | 63.69 | 44.8–71 |
| Recent graduates | 15 | 63.72 | 52.35–70.5 |
| MBA applicants with prior work | 10 | 61.58 | 44.05–70.7 |
| Busy professionals: next role in the same function | 20 | 65.26 | 56.6–71.9 |
| Busy professionals: changing function | 15 | 59.85 | 39–66.25 |
| Applicants returning after a break | 5 | 59.51 | 49.95–65.85 |
| Applicants targeting UAE relocation | 5 | 53.59 | 50.65–55.35 |
| Applicants recently out of work | 5 | 58.71 | 51.25–66.45 |
| Applicants mainly using a phone | 5 | 61.77 | 52.05–70 |
| Applicants handling confidential experience | 5 | 58.25 | 53.6–66.85 |

The range is the distribution of this deterministic scoring model, not a range of measured customer outcomes. The platform currently has ten cloud pilot seats, so this panel does not establish support for 100 simultaneous Job Loop customers [E16].

## What earns credit

The free check produces a useful comparison for a candidate who already has readable text and a vacancy. It offers local review/export without upfront signup, real source passages, final wording edits, PDF layout review and fallback formats. It already supports source/final CV reuse for another vacancy; saying it has no reuse would be wrong [E01–E04].

The v22 recovery and unchanged-recheck defects are fixed. v23–v25 owner/generation controls, stale-response suppression, bounded erasure and permanent path fences substantially improve trust and recoverability. The private Today view has contextual next actions, readiness and activity, rather than being entirely unstructured [E03,E10,E11,E14]. Help has practical task guides, media/transcript fallback and clear file limitations [E07,E08].

## Why the complete journey is still below an exceptional score

1. **One application record from first check into private reuse and tracking.** Carry the reviewed source/final CV, vacancy and selected version through a deliberate account-save handoff. Show one next action and one application timeline; retain explicit permission for new processing. [E02,E04,E05,E06].
2. **Shorten fact review without inventing evidence or removing meaningful approval.** Group copied passages under their existing context, prefill verified source metadata, review several visible facts in one place and save selected confirmations together. Offer Prepare this vacancy from the opportunity itself. [E05,E06].
3. **Preserve work across saving, navigation and arbitrary source replacement.** Keep local export available during optional saves; retain ambiguous save identity; preserve tracker note/date drafts; represent follow-up dates consistently; add undo for arbitrary source replacement. Keep the already fixed U06/U07 protections. [E03,E04,E12].
4. **Match discovery expectations to a useful, explicit coverage envelope.** Display exactly which locations/roles/sources are covered, distinguish no match from unavailable source, and keep manual vacancy import immediately available. Do not sell a whole-market autonomous search when only selected feeds are connected. [E09,E16].
5. **Make one public task the default; use stage as optional context.** Use a neutral first-check CTA and combine overlapping student/MBA choices into optional experience context. Keep the useful private readiness and next-action controls. [E01,E13,E14].
6. **Prove the current first and second application in real target conditions.** Observe consenting students and professionals complete signup/save/export/second vacancy on desktop and mobile; test an actual email return and native download; record completion, errors, elapsed time and repeated inputs. Keep unsupported scans/no-CV guidance clear and cloud activation gated until its separate acceptance. [E07,E08,E11,E15,E16].

The main gap is saved effort across the whole application journey. A working free check, optional saved check, legacy workspace and private Loop still require users to understand separate records and workflows. The Loop adds repeated vacancy inputs and one-fact-at-a-time review. These matter more to time-poor professionals and function switchers than another marketing section or more backend test counts [E04–E06,E12].

## Transparent scoring model

Desktop, readable PDF/DOCX, medium digital confidence,20minutes,first time,already has a real vacancy,ordinary privacy priority. The complete first-to-second-application journey is assessed, not only the landing page.

Each dimension = clamp0to100(cohort reference base + sum of matching explicit modifier deltas). Overall = sum(dimension score × supplied percentage weight)/100. Cohorts and profiles have equal person weight; no conversions or outcome probabilities are inferred.

Every base vector and modifier is published in workflow-review.json, followed by all 100 profile rows and the weighted result. Readable PDF and DOCX are the neutral file bases; pasted text gains a small intake benefit. Scans and no-CV cases receive explicit workaround penalties, not alleged outage penalties. Mobile, short time budgets and low digital confidence affect inferred effort/form complexity. Returning after the first check earns familiarity/reuse credit without assuming private Loop setup is done.

The fixed rubric is0–19 blocked;20–39 major absence/workaround;40–59 useful pieces with substantial friction;60–74 useful with moderate gaps;75–89 coherent with limited friction;90–100 exceptional and repeatedly evidenced. There is no forced 95/98 floor.

## Uncertainty and acceptance limits

±9 points per ordinary profile and ±12 for unsupported-scan/no-CV profiles are judgement sensitivity bands, not statistical confidence intervals or measured variance. Operational reliability 72 is provisional readiness judgement, not measured uptime or a proven hosted failure. No100 simultaneous-customer capacity claim.

No new hosted signup, OAuth, customer save, file export or unassisted customer session was executed. Unknown acceptance remains unknown rather than being described as a demonstrated failure. Local SQL/component evidence and release integrity checks support readiness; they do not prove a real candidate finishes successfully or returns. Production artifact maintenance remains disabled, and whole-account/Storage/restore acceptance is still bounded [E11,E15].

## Source evidence

- **E01** — confirmed_source; src/pages/CvCheck.tsx:25. Six-step role/CV/vacancy/evidence/review/approval flow; no account is needed for the free local result. Role and readable CV/vacancy text remain necessary inputs.
- **E02** — confirmed_source; src/pages/CvCheck.tsx:183. Existing next-vacancy reuse deliberately chooses reviewed source or approved final wording, preserves the prior application for undo, and uses a shorter four-stage reuse path (visibleSteps line147). It is incorrect to say reuse is absent.
- **E03** — confirmed_source_and_released_regression; src/pages/CvCheck.tsx:296. Existing reviewed wording is rechecked instead of regenerated. The v22 U06/U07 lost-edit and auth-bootstrap defects are fixed, with owner-aware recovery and explicit retry.
- **E04** — confirmed_source; src/pages/CvCheck.tsx:350. Private check save and tracker insertion are separate actions. The tracker receives role/company/empty URL, with no saved-check identifier. A shared busy state also disables local export while optional save is pending.
- **E05** — confirmed_source; src/pages/JobLoop.tsx:289. The separate Loop requires source, name, target titles and locations, then fact review. Each fact editor (lines76–92) exposes category/result and separate accuracy/sharing choices; suggestions are shown one at a time (line420). Existing saved-CV reuse is supported, but no automatic free-check-to-Loop application handoff is visible.
- **E06** — confirmed_source; src/pages/JobLoop.tsx:426. Loop opportunities require separately entered title/company/location/link/description; outputs and tracking have their own records. Output factual edits require source correction and a rebuild (line432).
- **E07** — confirmed_source; src/lib/cv-extraction.ts:32. Local readable PDF, DOCX and UTF8 TXT extraction and paste are supported with size/text bounds. Scanned PDF OCR is explicitly not performed (line73).
- **E08** — confirmed_source; src/pages/HelpCenter.tsx:42. Practical no-CV, external OCR/file, source privacy and Job Loop task guides exist. Walkthroughs.tsx lines27–33 and67–81 provide recorded media, captions/chapters, interactive steps and transcript fallback; premium avatar quality is not established by this review.
- **E09** — confirmed_source_with_release_scope; src/pages/JobLoopPanels.tsx:58. Source coverage is displayed and manual vacancies remain usable. JobLoopOverview.tsx line23 discloses selected employer feeds, unavailable broad paid search and mailbox access, optional rules schedules and disabled checkout.
- **E10** — confirmed_source_and_release_evidence; src/pages/JobLoop.tsx:127. Owner/generation-bound snapshot application and route-draft recovery reset stale source, claims, permissions, support and erasure confirmations. The v24 lifecycle repair and v25 GC fences receive positive control/reliability credit.
- **E11** — release_evidence_bounded; docs/ARTIFACT-MAINTENANCE-RELEASE-2026-10-14.md:5. v25 has applied/verified backend fences, native concurrency evidence and release byte checks. Production artifact collection remains disabled/empty allowlist; hosted Storage byte acceptance, whole-account handling and restore rehearsal remain open. The receipt explicitly does not certify production signup/OAuth/native download or unassisted first/second-application success.
- **E12** — confirmed_source_inferred_loss_risk; src/pages/Workspace.tsx:77. Legacy tracker notes/date are local child state, saved separately, and its tab renders conditionally (line869). Navigation before save can discard edits. This tracker converts dates to UTC noon (lines118–119); the separate Loop calendar implementation has already been corrected.
- **E13** — confirmed_source; src/pages/ProductPage.tsx:120. The homepage starts with student example state and builds its primary CTA from that example. Separate student/MBA/professional example controls and cards remain (lines135,149); this adds classification before one shared underlying task.
- **E14** — confirmed_source; src/pages/JobLoopPanels.tsx:24. Private Today view has actual readiness stages and contextual next-action controls, run coverage, activity and follow-up cues. This earns navigation credit; it does not eliminate cross-module separation.
- **E15** — confirmed_source_external_acceptance_unverified; src/pages/Auth.tsx:35. Email/Google paths, validation, pending confirmation, password reset and safe return routing are implemented. AuthCallback.tsx line29 uses the account/check return; fresh hosted signup/email delivery/OAuth completion was not executed and is neither claimed working end to end nor labelled broken.
- **E16** — confirmed_source; src/pages/JobLoopPanels.tsx:42. Cloud pilot is limited to ten accounts; a full pilot prevents new cloud runs/schedules while free check/manual records remain. This 100-profile panel is not proof of serving 100 simultaneous Loop customers.

Review outputs contain no candidate data and made no changes to the platform.
