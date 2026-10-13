# Fresh MBA and busy-professional customer audit

**Frozen initial assessment: 81.6/100 consolidated; MBA 81.3; busy professional 81.9.** Ten dimensions have equal weight. These are customer-experience judgments from the observed preview, not eligibility predictions or a target score. No other auditors' reports, earlier grades, or target scores were read. No app files were edited, commits made, accounts created, purchases made, messages sent, or real personal data used.

## Scope and version

- Public customer preview: `http://localhost:8381`; fresh auditor-owned Chrome tab 1385099017. Inspected `/for-mba`, `/for-career-switchers`, `/`, `/job-loop`, `/check`, `/help`, `/walkthroughs`, `/guides`, and `/guides/mba-career-pivot-cv`.
- Private interface: fresh auditor-owned Chrome tab 1385099023 on `http://localhost:8382/?stage=record`, `?stage=opportunities`, and `?stage=coverage`. This was **explicitly fictional local demo data, in-memory fake authentication/service, external network blocked**. Its successful mutations show UI effort only. They do not prove account persistence, cloud execution, discovery, scheduling, Gmail, document generation, or production security.
- Working-tree HEAD: `f225451e8fc33a71848d8167a793e90c1a2dfb24`, with existing hardening changes. Initial filesystem snapshot: 2026-10-13 22:36:35.910 Dubai / 18:36:35.910 UTC. Score freeze and second snapshot: 22:43:32 Dubai / 18:43:32 UTC. Supplemental PDF attempt ended by 22:46:41 Dubai / 18:46:41 UTC. Scores were not revised after that attempt.
- The public tab exposed Vite client and `/src/main.tsx?t=1791916961965`, so source changes could refresh the preview. `src/lib/cv-evidence.ts` changed during the audit at 22:42:41 Dubai. Guest evidence observations below were made before that change. This is an initial observed-state assessment, not a claim that every later edit was tested.

| File | Initial SHA-256 | Initial modification UTC | End observation |
|---|---|---|---|
| `src/pages/CvCheck.tsx` | `4F66F9E8FA05D50B320E020814584DE29C85E2D463E8F5464DB5CE82EBECD740` | 17:16:08.866 | Unchanged |
| `src/pages/JobLoop.tsx` | `93F2548679F7AC841847E72B65871D439BE58184C067FC206D24AC682A9978D6` | 18:18:32.627 | Unchanged |
| `src/pages/JobLoopPanels.tsx` | `E216ED228255B7320E662C25ECE1011C002154DC050F5FADA2A5B3937E507736` | 17:11:35.212 | Unchanged |
| `src/pages/AudienceLanding.tsx` | `83F7EEE95D5FC40906A358263E2AB0A1BBFBD2744360E9E9ED23A2FFB26B6468` | 18:33:31.031 | Unchanged |
| `src/pages/HelpCenter.tsx` | `00D3B94A3D61A2307869DE3DD0866AB83D6482A90172522A560D5AD7F33276EA` | 17:36:57.336 | Unchanged |
| `src/pages/Walkthroughs.tsx` | `DEC55073946FD5B3350E23BAC8A31EAE0FBE4DC3273F62A3D7DC9F4EE06D8BE1` | 17:36:57.334 | Unchanged |
| `src/lib/cv-evidence.ts` | `BADFDA7E9091CE03FA9E7E83DD30A775A8F3E13268E73350D1D578D51FC7C909` | 18:22:18.309 | `966547C41BBB25C5EE7FF4114DD75E74D8ADC51D632F776B7BD3637DF85ACA5E`, 18:42:41.954 |
| `src/lib/check-draft.ts` | `596B962D9C67FA08C5C27F1E01C8B7099C4DF212BB6D178E43F4F5A10B54E6D1` | 17:10:50.374 | Unchanged |
| `dist/index.html` | `5887662BE354B132E927BED5084DD55BF57B26325B94407760356F400B513F60` | 18:33:53.829 | Unchanged; this is not proof of the Vite-served module version |
| `docs/supabase-loop-ui/manifest.json` | `152B63A6835BCFE1AB75FC054B418B02F59D00B1049DF5FD22AA4F5C7472B705` | 18:08:56.477 | Unchanged |

All modification times in the table are on 2026-10-13. JSON contains full timestamps and byte sizes.

## Actual customer task

The fictional candidate, Nadia Example, had eight years of operations work and an in-progress MBA. The 1,489-character CV deliberately distinguished personally owned reporting and a measured dispatch pilot, support for a finance director's cost model, a five-person classroom project with a projected 18% margin improvement, beginner SQL without production experience, and a plainly marked confidential client/contract line. The first vacancy required strategy analysis, external-client work, production SQL, transformation ownership, and budget management. The second vacancy focused on the candidate's operational work.

The first journey reached evidence, editable review, approval, and export-request UI without an account. The evidence screen returned **11 requirements: 0 direct, 3 related, 8 manual review**. It showed full source wording and line references. It did not turn the SQL denial, supported work, or forecast into an achievement. However, measured process improvement and a clear stakeholder example still received generic manual-review language; the projected classroom passage appeared under several requirements without a contextual badge on the passage itself. The explanation accurately described a literal English wording check, rather than verified qualifications.

The review retained the source wording. I removed the confidential line from the final text, then found that the privacy confirmation explicitly covered **both source and final**. I returned to the source, removed the same line there, and repeated the comparison and review. The paragraph-removal tool grouped the entire employment entry, so direct text editing was the practical way to remove one sensitive line without deleting the role. The final shareable CV was 1,376 characters. Approval required factual and privacy confirmations; controls were disabled beforehand.

TXT and PDF buttons produced a visible “download requested” receipt and a fallback prepared-file blob link. The TXT download event timed out after 15 seconds; the browser's blob-download helper was unsupported; a normal click on the fallback link produced no further receipt; no new file was found in the local Downloads directory. **A downloaded artifact was not independently verified. This is a delivery/automation limitation, not a demonstrated product download failure.** The first PDF preview generated a one-page receipt within the selected two-page maximum and exposed an exact-PDF link/iframe. Generating that preview reset approval. A later second-PDF inspection timed out enabling browser accessibility; a screenshot attempt then timed out and reset the browser tool. Exact PDF layout, file contents, and DOCX fidelity remain unverified.

I selected **Approved final CV → Use this CV for another vacancy**. The new role/company and vacancy were blank; the 1,376-character shareable CV returned intact without any career-history typing. The second vacancy reached evidence and its own approval. It returned **9 findings: 1 direct, 5 related, 3 manual**. The job-title/company header was treated as a requirement. For “SQL knowledge is preferred, not required,” the first two supporting passages were the unrelated finance and MBA project paragraphs; the actual SQL statement appeared third. This is avoidable review work for a busy professional.

Optional saving opened an account form in place. Email/password sign-in, password recovery, account creation, and a separate Google draft-retention permission were visible; none was executed. Draft recovery explicitly described temporary tab storage, its 30-minute limit, and reapproval. After visiting help and other routes, the application returned; a deliberate refresh restored the CV and second vacancy with approval cleared. Account saving was not tested.

## Help and private interface

Help search for “projected” returned the relevant fact-review topic. The help page used the exact control names and explained file recovery, source versus final privacy, second-vacancy reuse, run coverage, source changes, and what was still unavailable. The contribution walkthrough could be selected and advanced, showed complete fictional source wording, and preserved academic context, team credit, and estimates. The 20-guide library surfaced MBA pivot, confidential search, and busy-week planning guides. The MBA article made a credible bridge from prior work, kept faculty projects separate from clients, and gave a useful fictional example. **Recorded avatar videos were not available in the public page during this audit**; it accurately offered interactive steps and transcripts and said recordings appear only when added and reviewed.

In the private demo I replaced the source CV, corrected name/role/location, selected private saving, and observed “Saved revision 2” with the fictional in-memory disclosure. I added an own-answer academic-project claim using complete context, personal contribution, projected result status, and two confirmations; “1 fact ready for reuse” appeared. This manual claim required three text entries, two selections, two confirmations, and Save. Suggest literal passages produced a preset fictional-project notice without a visible suggestion queue for my replacement record. Saving my own fictional vacancy left the form populated and “No opportunities are recorded yet”; the mutation was inconclusive in this stub. I then inspected the preset opportunity and coverage states, explicitly as fixture screens.

The private navigation made Career record, Opportunities, Outputs, and Help & privacy easy to find. Vacancy tracking clearly distinguished saved/prepared/applied and provided a follow-up date and notes. The coverage fixture labelled every lane fictional, not run/not connected/blocked, disabled preparation/resume/scheduling, and showed no outputs. Help & privacy distinguished receipt from review and partial loop erasure from account-wide erasure. No private packet review, export, actual run, or cross-session persistence was proved.

Separately supplied evidence: [hosted validation](../../INTEGRATED-JOB-LOOP-HOSTED-VALIDATION.json) reports 75/75 synthetic checks passed, zero paid calls/messages/submissions, and rules-based hosted checks between 18:24:52.688 and 18:27:16.557 UTC. Its SHA-256 was `E50B0FF0897F99F731EF3B9EA341E664B8CAFFFED2BD909DA3A37749603AC512`. **This report was read after independent task observations and is supporting service evidence from the implementer, not independent browser proof.** It did not raise the frozen customer scores.

## Frozen scores

| Equal-weight dimension | MBA pivot | Busy 5–10-year professional | Consolidated | Basis |
|---|---:|---:|---:|---|
| Clarity | 88 | 90 | 89 | Specific audience guidance, free first task, clear responsibilities and labelled fiction; broad loop benefits depend on available services. |
| Activation | 86 | 86 | 86 | Immediate guest start, no account/card gate, contextual progress. |
| Form effort | 75 | 76 | 75.5 | Pasting a CV is quick; source redaction needs a return trip; private own-answer claims remain substantial. |
| Evidence quality | 68 | 70 | 69 | Full literal sources and cautious boundaries; many generic manual findings, missing passage context badges, header/noisy-source errors. |
| Workflow completeness | 70 | 70 | 70 | Guest review, approvals and reuse observed; exported bytes and private end-to-end production task not independently verified. |
| Reuse / time saving | 80 | 83 | 81.5 | Actual CV reuse with clean vacancy/approval reset; still six steps and much repeated reading. |
| Help / walkthroughs | 92 | 90 | 91 | Search, exact step help, interactive contribution example and substantive MBA guide; public recorded videos absent. |
| UI / accessibility | 87 | 87 | 87 | Clean desktop layout, labels, headings, skip link, visible states and walkthrough keyboard instructions; full keyboard/screen-reader/mobile tests not performed. |
| Trust / privacy | 91 | 91 | 91 | Source/final safety, explicit local/account/Google choices, no hidden model/send behavior, accurate fictional/service boundary. |
| Reliability | 76 | 76 | 76 | Recheck, reuse, recovery and reapproval worked; artifact delivery and PDF visual inspection inconclusive; private stub saves have limits. |
| **Mean** | **81.3** | **81.9** | **81.6** | Ten equal weights; consolidated is the mean of both archetypes per dimension. |

The archetype difference is small. MBA users particularly need projected/team/project context; busy professionals benefit more from reuse and suffer more from noisy evidence and repeated review. Neither score represents a separate human usability study.

## Five highest-value fixes

1. **P1 — Make evidence review more specific without overstating a match.** Reproduce with the first vacancy: 8/11 findings receive manual review even where the full measured pilot or stakeholder passage is present. Add actionable wording explaining the actual missing context (senior versus regional stakeholders, external client versus faculty, personally owned versus supported work) and carry academic/projected/team metadata onto the cited passage. **Acceptance:** this fixture preserves all qualifiers; forecasts never become delivered results; each uncertain row gives a specific reason or clearly states the exact language it cannot interpret; no score or invented claim replaces uncertainty.
2. **P1 — Remove vacancy headings from requirement counts and rank condition evidence by relevance.** Reproduce with the second vacancy: title/company becomes a requirement, and preferred SQL ranks unrelated negated passages before the SQL source. **Acceptance:** title/company/headings are visible in the full posting but do not inflate requirement counts; the SQL source is first; unrelated finance/team paragraphs do not appear merely because they contain “not”; preferred remains preferred. Recheck the current post-audit parser separately before treating this finding as still open.
3. **P1 — Help redact a single sensitive line in both source and final.** Reproduce by removing the marked confidential line in Your review; it remains in source, while paragraph removal would delete an entire role. Provide a clear source/final difference and an explicit reversible choice to apply the same removal to the reusable source. **Acceptance:** only the user-selected text is removed; the measured achievement and employment heading remain; the user sees what changed in each version; approval clears; the second vacancy reuses the shareable version.
4. **P2 — Shorten the second-vacancy path while retaining a fresh review.** Reproduce through Approved final CV → another vacancy: the user returns to role, CV, vacancy, evidence, review and approval. Offer new role/company/vacancy together with the reused CV clearly identified and an optional edit control. **Acceptance:** no career typing, no inherited vacancy or approval, one clear chance to inspect/edit the reused source, then the new comparison and independent approval; fewer setup transitions than the six-step replay.
5. **P2 — Release actual captioned recorded walkthroughs when ready.** The tested public page contains interactive steps and transcripts, with no available recording. **Acceptance:** each released recording loads and plays from the public preview, has synchronized captions and a transcript, clearly identifies fictional examples, and demonstrates source → evidence → review → approval/export → reuse. Retain the interactive alternative and the honest unavailable state for unreleased media.

Export deliverability should also be a release gate: verify PDF, DOCX, TXT and separate evidence files in an ordinary browser and inspect their contents. The present automation result is insufficient to declare it passed or failed.

## Counts, time, and limits

The audit completed **23 named task checks: 20 with a directly observed public or fictional-UI result and 3 partial/inconclusive** (file delivery, exact PDF visual/file fidelity, own-vacancy saving in the stub). Public tasks used the six application stages twice; three target/CV/vacancy content inputs plus optional company were required on the first application, and zero CV/history content inputs on the second. Both applications reached separate approvals. The JSON lists every task check.

Initial task-observation window was approximately **6 minutes 56 seconds**; the total observation window including supporting evidence and the supplemental PDF failure was approximately **10 minutes 5 seconds**. These are agent wall-clock times, including tool/model overhead, not measured human completion times. Per-task elapsed times and human reading time were not instrumented.

This was desktop Chrome with screenshots and accessibility/DOM observations. No real CV, actual account, employer verification, cloud/model run, mailbox, recurring schedule, live private packet, mobile/zoom testing, full keyboard traversal, or screen-reader testing occurred. Browser PDF/CDP failure and blocked browser download-history access limited export investigation; no policy workaround was attempted. The earlier downloaded files in the user's Downloads directory were not treated as this audit's outputs. Public video additions or later source edits need a separate recheck; the frozen score is retained.
