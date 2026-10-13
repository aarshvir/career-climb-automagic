# Independent mobile and help customer audit

Jobvance is usable for a nontechnical applicant starting from a readable CV. The free six-step flow is clear, source passages remain readable on phone, and account creation is optional. The main weaknesses are keyboard focus at walkthrough boundaries, detached validation errors, and the amount of scrolling before a phone walkthrough begins.

**Frozen initial score: 82.5/100.** Ten dimensions have equal 10% weight. Scores describe the capabilities and UI observed; there was no target score, prior-grade context or implementation-source review.

## Scope and timing

- Persona: a 30-year-old nontechnical applicant working on a phone.
- Independent audit-created hidden CUA tab; actual viewport override **390 × 844**, reset afterward. Keyboard tests used the resulting **1280 × 720** desktop viewport.
- Public preview: http://127.0.0.1:8381. Inspected `/`, `/check`, `/job-loop`, all three audience routes, `/help`, `/walkthroughs`, `/guides`, and the upload-failure guide.
- Private screen inspection: http://127.0.0.1:8382 at `record`, `confirmed`, `opportunities`, `coverage`. **FICTIONAL LOCAL DEMO ONLY:** fictional data, in-memory service, external network blocked. These screens do not prove real account or cloud execution.
- Initial observations: **2026-10-13 18:40:34–18:48:12 UTC**, 458 seconds of audit wall time. This is not a customer task-time benchmark. Several step-change tool calls were about 0.39 seconds; PDF generation plus observation was 3.30 seconds. Those are tool wall times, not measured product performance.
- No real data, accounts, purchases, model calls, mail actions or employer application actions. No app edits or commits.
- Not tested: real handset, screen reader output, formal contrast, zoom/reduced motion, file importing, downloaded file fidelity, real private persistence or scheduling. Any parent-supplied 75 cloud checks are separate root proof, not this auditor's independent UI evidence.

## Equal-weight scores

| Dimension | Score | Basis |
|---|---:|---|
| Clarity | 87 | Explicit free start, materials and applicant responsibility; more phone copy and repeated choices than necessary. |
| Activation | 82 | Prominent free CTA, no account/card; walkthrough entry takes substantial scrolling. |
| Form effort | 84 | Required role, CV and vacancy text only; company and factual additions optional. Private demo collapses extra preferences. |
| Evidence quality | 80 | Literal passages and line references help; the sample counted its vacancy-title line as an additional finding. |
| Workflow completeness | 79 | Reached approval and enabled download controls plus reuse; actual downloads and live private/cloud work not independently executed. |
| Reuse / time-saving | 82 | Chosen CV carries forward, unchanged facts need no re-entry; replacement is immediate after its warning. |
| Help / walkthroughs | 83 | Search, no-results recovery, five interactive tutorials, captions and transcripts are useful; no recorded video was present initially. |
| UI / accessibility | 79 | No measured overflow in inspected states, labels/landmarks/skip/focus; endpoint focus loss, error association and small secondary targets need work. |
| Trust / privacy | 91 | Local checking, temporary recovery, private saving and external use have separate visible choices. This is a disclosure assessment, not security certification. |
| Reliability | 78 | Sampled transitions/recovery work; embedded PDF was blank in IAB and live service behavior is outside test scope. |

## What worked

The public check completed with a fictional **Operations analyst** role, a short readable CV, and a fictional vacancy with four substantive requirements. Only the role was required on the first form. Source passages appeared beneath their vacancy requirement with line references; missing SQL evidence stayed a review question. The sample also treated the title line as a finding, resulting in five items rather than four substantive requirements.

The review stage kept optional factual additions optional. Approval required separate accuracy and privacy confirmations. The PDF preview reported one page within the selected maximum, and approval enabled PDF, DOCX, TXT and a separate evidence-report control. The embedded 275 × 360 PDF panel was blank in this browser, but the exact-preview new-tab link existed. This does **not** prove a corrupt PDF; this auditor did not inspect downloaded bytes.

All nine requested public routes fit the measured phone width. Mobile navigation had named open/close controls and exposed its expanded state. Page headings, main/navigation landmarks, labels, and the skip link were present. Body copy and focus rings were visually readable. Some secondary disclosures were 11–13px. No contrast ratio or WCAG pass/fail claim is made.

Help search for **scanned** returned one topic and a `role=status` count. A nonsense query produced zero-topic guidance, shorter-search suggestions and reset controls. Recovery guidance clearly distinguishes route navigation, refresh, closing a tab and private saving. Guide search for **upload** returned three guides, and the upload-failure guide provided concrete troubleshooting, sources and a minimal-data help-request checklist.

Walkthrough Previous, Next, Restart, direct-step and caption controls worked. Transcripts opened and explicitly called the narration timings planned. Initially the public page contained **zero video, audio or track elements**; interactive demonstrations were clearly labeled fictional. A later real video addition needs a separate check.

Desktop keyboard checks verified skip-link focus, role → optional company → Continue Tab order, and Enter activation. Following the header Help link and returning through Free CV check restored the fictional CV with a reminder to review before approving. Clear & start again asked for a second choice; Keep this check preserved the draft.

The private fictional demo showed full academic-source passages with team credit, forecasts and no measured result preserved. Named fields, optional preferences, evidence context, separate accuracy/share confirmations, a source-linked vacancy and self-reported tracking were visible. Unavailable coverage explicitly stated that no source, model, mailbox, document or application ran.

## Five highest-value fixes

1. **MH-01 — P2: Keep keyboard focus at walkthrough endpoints.** Open `/walkthroughs`, focus Next step and press End. Step 6 appears, Next becomes disabled, and focus becomes BODY. Home while Previous is focused likewise loses focus at step 1. Region-focused Home/End works. **Acceptance:** every endpoint transition keeps focus on the tutorial region or an enabled adjacent control; Tab continues predictably and the current step status is announced accurately.

2. **MH-02 — P2: Attach validation errors to their inputs.** Submit the empty role in `/check`. The alert says “Enter the role you want to prepare for” and focus moves to `#check-role`, but the input has neither `aria-invalid` nor `aria-describedby`. **Acceptance:** invalid state and a stable field/error relationship exist; error text is near the field and visible on phone; correction removes obsolete error state.

3. **MH-03 — P2: Protect an approved check before reuse replaces it.** Approve the fictional check without downloading or saving, then activate Use this CV for another vacancy. The old vacancy and approval immediately clear. The preceding warning explains the consequence, but no final confirmation or undo appears. **Acceptance:** confirmation or reliable undo protects the open approved check, names what carries forward/clears, and permits download/save or cancellation. A new vacancy still needs fresh review and approval. This is accidental-replacement risk, not an assertion that the documented reuse behavior is malfunctioning.

4. **MH-04 — P2: Put the selected phone walkthrough before the long chooser.** At 390 × 844, the selected tutorial heading starts about **1,740px** down, after five large selection cards. **Acceptance:** a compact chooser and current tutorial are available near the start; choosing a task focuses/scrolls to it below the sticky header; Previous/Next and captions remain accessible.

5. **MH-05 — P3: Enlarge standalone secondary help targets.** Measured claim-help links are about **17px** high; walkthrough secondary links **19.8px**; legal/breadcrumb links **19.2–21.4px**. **Acceptance:** pad standalone help/recovery targets toward 44px where practical and keep neighboring targets clearly separated. Preserve link identification. Inline text links may retain appropriate prose layout; these measurements alone do not establish a WCAG violation.

## Measurement limits and one unconfirmed anomaly

One initial pointer click on the filtered uploads help result left `/help` with focus on main-content and the target about 624px below the viewport top. A desktop keyboard recheck correctly produced `/help#uploads`, focus on uploads and a settled target top of 205px. The first observation is retained for transparency but is **not** a claimed reproducible defect or one of the five fixes. Smooth scrolling also produced intermediate screenshots; settled measurements and subsequent state were used for conclusions.

This is an inspection and interaction audit, not accessibility certification. It did not synthesize screen-reader speech, formally assess color ratios, or treat fixture coverage as a real service receipt.

## Fingerprint and evidence files

Base commit: `f225451e8fc33a71848d8167a793e90c1a2dfb24`, branch `main`, modified hardening working tree. SHA-256 hashes of the relevant UI files were captured at 18:48:12 UTC and are recorded in `mobile-help.json`. Hashes were obtained without reading implementation source. They are an adjacent repository fingerprint, not a full served-bundle digest.

Detailed evidence E01–E13, exact reproductions and acceptance criteria: `mobile-help.json`.

Keyboard endpoint screenshot: `.sites-runtime/audit-mobile/walkthrough-keyboard-end.jpg`.

**Initial scores remain frozen.** A late video/caption or fix verification should be appended separately and must not overwrite the original ratings.


## Narrow fix recheck — 13 October 2026, 19:25:40–19:29:14 UTC

**The original 82.5 score and all dimension ratings remain frozen.** This appendix only records observed fix outcomes and new hashes. IAB was unavailable, so a new independent Chrome tab was used: desktop 1920 × 855 and the documented 390 × 844 phone override, which was reset afterward. The recheck used fictional local text and made no account, cloud, mail, model or employer action. No video availability credit is given; media/metadata additions remain outside this recheck.

| Fix | Narrow outcome | Observed evidence |
|---|---|---|
| MH-01 | Resolved | End from focused Next and Home from focused Previous now focus the player SECTION, tabindex 0, labeled by wt-tutorial-title. Current step status is correct. |
| MH-02 | Resolved | Empty role, CV and vacancy each mark the offending field invalid and describe it with check-validation-error containing the correct message. Filling the field clears both attributes. |
| MH-03 | Resolved within the stated page lifetime | Undo new application restores the previous source, vacancy and distinct final education-format edit into review. A direct undo-to-approval recheck leaves both confirmations false and all approval/download controls disabled. The page-only undo lifetime is explicit. |
| MH-04 | Core mobile chooser issue resolved | Only the selected card appears initially; alternatives expand and collapse on selection. The chosen card stays first and visible. First tutorial heading document Y is about 1,000px, improved from about 1,740px. No horizontal overflow. |
| MH-05 | Partially resolved | Five standalone walkthrough help links are now 32px high. Footer legal links remain 19.19px high; claim-library links were not rechecked. The broader original target-area recommendation remains partly open. |

The remaining item is **P3 secondary target refinement**: 32px improves the walkthrough links but is below the original suggested 44px aim, and footer targets remain small. Target box height by itself is not a formal accessibility compliance result. No remaining material keyboard-focus or undo defect was observed in these requested reproductions.

Recheck SHA-256 fingerprint (hashes only; implementation source not read):

- `src/pages/CvCheck.tsx`: `81dd3380ad76287f9297c5b4d9d788177e3733c4798da00883badf80679ac504`
- `src/pages/CvCheck.css`: `370dd567fa2dbc520c2784718c65ecc0a8f8f4275164db2c60a9cdc9aa7af3a5`
- `src/pages/Walkthroughs.tsx`: `79f1a90ff065d313adb5e704812d3c60a3915a51cc3f6334837708e106d0916f`
- `src/pages/Walkthroughs.css`: `07d24688c18ecabb4a1239605c966c3d6d38823e3d82526e11ce8f71e906db0f`

Screenshots: `.sites-runtime/audit-mobile/mobile-chooser-recheck.jpg` and `.sites-runtime/audit-mobile/undo-review-recheck.jpg`. Detailed narrow results are recorded in `lateRecheck` in the JSON.


