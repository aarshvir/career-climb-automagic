# Independent workflow and effort assessment

Reviewed 14 October 2026 against local source `061b37528cb110097878798b92da9c8403f6eeaf` (v21 release). Read-only application review: no production writes, new accounts, paid calls, employer submissions or erasure. I drafted these findings without consulting earlier audit grades. Source inspection establishes the product flow and wiring; it does not establish that live integrations have succeeded.

## Conclusion

Jobvance currently asks a candidate to understand three overlapping products: the six-step free check, a credit-based workspace, and the private Job Loop. Completing the first does not carry the application into the third. This is more consequential than the student/MBA split: the user has to understand the architecture, re-enter material, and manage different records called variations of the same thing. More landing-page copy and tutorials cannot repair that architecture.

The source has useful safeguards, genuine on-device comparison, explicit review, owned records and downloads. Those are worth preserving. The candidate-facing orchestration is not yet a coherent, low-effort end-to-end product. I would not characterize it as best in class, 95/100, or 99% automated on the evidence reviewed.

## Actual journey today

| Stage | What a candidate does | What actually carries forward |
| --- | --- | --- |
| First check | Type role, optionally company, upload/paste CV, inspect extracted text, paste full vacancy | Local check draft |
| Evidence and editing | Inspect comparison, edit a full plain-text CV, optionally add examples or remove paragraphs | Same local draft; some source/final distinctions require extra controls |
| Download | Recheck changes, inspect final evidence, optionally preview PDF, tick two confirmations, approve, download | Downloaded file; no account required |
| Save | Open account form, sign in, consent to storage, explicitly save | A row in `cv_checks`; displayed back on `/check` |
| Track | Separately choose “Also add vacancy to Applications” | A `tracked_applications` row without vacancy URL, description or a relation to the saved check |
| Return | Main signed-in header points to “My Job Loop” | Private Loop record, not the saved check or the old tracker |
| Set up Job Loop | Import/paste CV again; review name; add target roles and locations; save; approve source passages one at a time | Separate private profile and claims |
| Prepare another role in Loop | Add title, HTTPS URL and full description; leave Opportunities; find Today preparation controls; start a run; find Outputs; review/approve/download | Loop opportunities and packets; not the earlier workspace tracker |

This map is based on source wiring. Actual auth, storage, processing and download network success were not assumed from mocked tests.

## Findings ordered by practical consequence

### WF-01 — High: completing the advertised first journey does not create the advertised ongoing journey

**Confirmed source wiring.** `/check` saves `cv_checks` (`src/pages/CvCheck.tsx:322`, `src/lib/free-check-api.ts:103`); its tracking action calls the old workspace API (`src/pages/CvCheck.tsx:333`). `/applications` redirects to the old workspace tracker (`src/MvpApp.tsx:139`). Main signed-in navigation sends the candidate to `/loop` (`src/components/layout/MvpHeader.tsx:29`). Loop imports saved `cv_documents`, not saved `cv_checks` (`src/lib/job-loop-api.ts:136`, `src/pages/JobLoop.tsx:378`), and has separate records/packets in `job_loop_records` and `job_loop_packets` (`supabase/functions/_shared/job-loop-repository.ts:35`, `:43`).

**Candidate consequence:** “I saved my CV/application, but My Job Loop asks me to start again.” A returning user can reasonably believe their work disappeared. Free-check evidence, final CV edits, vacancy text and tracked status do not become a continued Loop application.

**Minimal remedy:** pick one canonical application record and candidate workspace. Add an explicit, consented “Save this application and continue” handoff carrying source CV, reviewed CV, role, employer and vacancy into that record. Show existing legacy records in a migration/recovery view. Do not require re-upload or a second manually created tracker row.

### WF-02 — High: going back to recheck the same vacancy silently discards final CV edits

**Reproduced locally with the real component.** Complete steps 1–5, change “Your CV to review”, select the previous “One vacancy” step, change nothing, click “Check these inputs”, then return to review. The extra wording has gone. `runCheck` explicitly replaces `reviewedText` with a new ordering of `sourceText` (`src/pages/CvCheck.tsx:269–274`). There is no confirmation or retained edit branch for that action.

**Candidate consequence:** a person spends time improving their CV, checks something earlier in the flow, and loses those improvements. Removals of confidential material from final text can also be reintroduced from the source into a new final draft, requiring another careful review. This is a draft regression; it does not by itself send or expose the text.

**Minimal remedy:** distinguish recomputing evidence from regenerating a CV. Recompute evidence against the current edited version by default; if regeneration is chosen, show an explicit choice and retain an undoable prior version.

### WF-03 — High: refresh recovery can delete an account-owned draft before sign-in restoration finishes

**Reproduced locally with the real component and storage helper.** Seed an owner-A consented refresh draft, mount `/check` while auth is loading with `user=null`, then resolve auth to owner A. The form stays empty and recovery contains the blank replacement. The initializer calls `readCheckRecovery(user?.id ?? null)` immediately (`src/pages/CvCheck.tsx:98–104`); the helper treats owner mismatch as invalid and removes the stored copy (`src/lib/check-draft.ts:108–122`), and the persistence effect writes the initial blank draft (`src/pages/CvCheck.tsx:224–227`). The actual AuthProvider starts without a session while reading persisted auth (`src/contexts/AuthContext.tsx:41–44`, `:64–75`).

**Candidate consequence:** the optional setting promising to retain work across refresh does not reliably protect signed-in users at the moment it is needed.

**Minimal remedy:** defer owner-bound recovery until auth has settled. Do not discard a stored draft merely because identity is still unknown. Keep owner isolation and clear approval when restoring; fix initialization order rather than allowing cross-account access.

### WF-04 — High: the setup asks candidates to operate an evidence database, one passage at a time

**Confirmed UI and generator behavior.** Job Loop suggests up to 30 lines, including some headings; only one suggestion is shown at a time (`supabase/functions/_shared/job-loop-engine.ts:171–184`; `src/pages/JobLoop.tsx:391–392`). Each claim requires choosing its evidence category, considering result status, confirming contribution, confirming external permission and saving (`src/pages/JobLoop.tsx:79–90`). Optional details introduce source type, source passage, context label and factual wording.

**Candidate consequence:** a novice must learn “claim”, “source context”, “result status” and “external use”. A busy professional may approve the first easy passage and produce an incomplete CV, or abandon a long sequence. Onboarding text says they do not need to rebuild their CV in a form, while output is composed from the claims they clear.

**Minimal remedy:** import the whole CV into a familiar document preview, group passages by existing job/project, and let the user confirm a section with one clear permission choice. Ask individually only where context, numbers, contribution or confidentiality is ambiguous. Keep the underlying provenance machinery internal.

### WF-05 — High: the private result cannot be edited where the candidate is reviewing it

**Confirmed UI.** “CV text for factual review” is read-only. The candidate is instructed to edit career facts, reconfirm them, and rebuild (`src/pages/JobLoop.tsx:404`). Changing source CV text also clears confirmations for all CV-sourced claims (`supabase/functions/_shared/job-loop-runtime.ts:90–95`). There is no vacancy-specific editable final version comparable to the free-check editor.

**Candidate consequence:** fixing one awkward sentence or shortening one role-specific application requires leaving the result, understanding source records and rebuilding. Users who need a fast final polish may download and edit elsewhere, breaking the visible product journey.

**Minimal remedy:** separate global factual corrections from application-only presentation edits. Allow safe reordering, wording/style changes with visible before/after and source references; escalate new factual assertions for confirmation. Preserve the last approved artifact as a version rather than making users navigate the data model.

### WF-06 — High: three meanings of “application” produce two trackers and orphaned results

**Confirmed wiring.** The free check creates a tracker entry with title/company and an empty link (`src/pages/CvCheck.tsx:337`); it does not include check ID, description or CV document. Old workspace tracking uses `tracked_applications` (`src/lib/workspace-api.ts:199`); Job Loop uses its own opportunities (`src/pages/JobLoop.tsx:399`). “Saved free checks” are visible on `/check`, old “Your recorded applications” on `/dashboard?tab=tracker`, Loop “Your opportunities” on `/loop`.

**Candidate consequence:** “Where is the CV I used for this application?” and “Did I save this in the right place?” require searching separate pages. A user can create a second tracking entry after reopening a saved check because tracked state is held locally.

**Minimal remedy:** one application card containing employer link, vacancy, CV versions, review state, submitted status and next action. Saving a check should save that card; tracker creation must be idempotent and tied to the application ID.

### WF-07 — Medium: model/provider/cloud-run controls expose implementation choices before value

**Confirmed UI and provider contract.** Today includes “Prepare a cloud run”, provider selection, sometimes model selection, “Run history & source coverage”, lanes, record revisions and raw statuses (`src/pages/JobLoop.tsx:361–365`). Outputs include “packet”, claim revisions, model method and evidence references (`:403–404`). The model contract selects approved claim IDs; it does not rewrite CV text, and letters/messages are template-composed (`supabase/functions/_shared/job-loop-providers.ts:65–83`; `job-loop-engine.ts:271–298`).

**Candidate consequence:** users must understand infrastructure and may expect a much richer rewrite when choosing GPT/Claude, while the practical difference is largely evidence selection and limited review questions. “Runs”, “outputs” and “packets” are engineer concepts rather than the user's next task.

**Minimal remedy:** a primary “Prepare this application” button on the vacancy card and a clear result preview. Put model selection, processing route, detailed source audit and run logs under advanced controls/details. Explain the result as relevant evidence selected and arranged, or implement a controlled source-bound rewrite before marketing a fuller tailoring service.

### WF-08 — Medium: adding a vacancy does not lead directly to preparing that vacancy

**Confirmed UI wiring.** “Save opportunity” clears the form and stays under Opportunities (`src/pages/JobLoop.tsx:279–284`, `:398`). Rows offer tracking updates, not a “Prepare this role” action (`:93–98`). The preparation button is on Today and a batch selects up to two opportunities (`supabase/functions/_shared/job-loop-runtime.ts:16–20`, `:240–242`).

**Candidate consequence:** after entering a vacancy, the novice must infer that they should switch tabs and launch a batch, then go to a third tab for the result. The chosen role is not the explicit object of the primary action.

**Minimal remedy:** after save, show that vacancy's card with “Prepare CV for this job”. Open its progress/result in the same application detail view. Batch processing can remain an optional feature after one successful application.

### WF-09 — Medium: a free user can enter a credit dead end while free preparation exists elsewhere

**Confirmed code path; the current production account balance was not queried.** The legacy workspace consumes a signup credit; the schema grants one free pack (`supabase/migrations/20261010000000_grounded_application_mvp.sql:185–186`). At zero, “Prepare application pack” is disabled and points to pack access (`src/pages/Workspace.tsx:708–726`). Checkout is intentionally disabled, while the separate free check and pilot remain available.

**Candidate consequence:** a user may believe the product is exhausted or requires unavailable payment, despite other free routes. The payment hold itself is a standing owner constraint, not a failure to add a button.

**Minimal remedy:** retire the old credit-based preparation path from the primary user journey, or convert the exhausted state into a direct continuation of the current free application workflow without repeated CV entry. Do not enable checkout to hide this product inconsistency.

### WF-10 — Medium: absent segmentation is treated as “student” with a one-page default

**Confirmed defaults.** An ordinary `/loop` entry defaults to `student` (`src/pages/JobLoop.tsx:104`). Its default page target is one and discreet-search preference false (`src/lib/job-loop-audiences.ts:13`, `:52–57`). The student and MBA paths share the same application mechanics; they differ mostly in example copy and starting preferences.

**Candidate consequence:** an employed professional signing in through the normal header is treated as a student until they discover an optional setting. Splitting “student” and “MBA” asks for an identity decision that has little functional payoff, while the more useful distinctions—first CV versus existing CV, job ready versus needing discovery—are not the entry choices.

**Minimal remedy:** one shared entry flow organized by immediate task. Ask at most “Do you already have a CV?” and “Do you have a job in mind?” Derive relevant guidance from the imported material; make page length, confidentiality and preferences explicit/editable rather than attaching them silently to a persona label.

### WF-11 — Medium: email confirmation does not explicitly preserve the requested private destination

**Code-inferred; no real confirmation email was sent.** `rememberLoopReturn` is invoked in Google sign-in only (`src/pages/Auth.tsx:66–70`), not email signup (`:49–56`). Signup redirects confirmation to the general callback (`src/contexts/AuthContext.tsx:99–103`). The callback consumes stored Loop/check destinations and otherwise uses `/dashboard` (`src/pages/AuthCallback.tsx:26`; `src/lib/check-draft.ts:162–167`). A fresh email signup initiated for `/loop` therefore has no explicit stored Loop return in this path.

**Candidate consequence:** the candidate may confirm email and land in the older workspace rather than continuing setup. The precise session/event behavior and same-tab/new-tab email behavior require a fresh-account staging test.

**Minimal remedy:** preserve an allowlisted requested destination for email confirmation as well as Google; show a clear continue action on returning. Test both same-tab and separate-tab email confirmation.

### WF-12 — Medium: fallback and help often explain limitations rather than completing the user's task

**Confirmed surfaces.** “No CV yet?” sends the user to a check which asks them to compose a plain-text career record themselves (`src/pages/JobLoop.tsx:380`; `src/pages/CvCheck.tsx:387`). Scanned PDFs require the user to perform OCR in another product (`src/pages/HelpCenter.tsx:54–65`). Contact research is manual and requires name, source URL, source passage and confirmations (`src/pages/JobLoop.tsx:398`); without that, recruiter drafts are absent (`:405`). Signed-in support receipts show status but no reply body, whereas guest support exposes administrator replies (`src/pages/LoopSupport.tsx:15`; `src/pages/GuestSupport.tsx:19`).

**Candidate consequence:** inexperienced students face a blank-document task, and busy professionals retain research and repair work they expected Jobvance to reduce. For an actual failure, a logged-in customer may be less able to receive a helpful reply than a guest.

**Minimal remedy:** guided fact capture for first CVs; paste fallback beside upload errors; clear “use this posting” intake; one support conversation available to both signed-in users and guests. Add OCR only after measuring upload failures and its cost—do not expand every feature at once.

## What is already working in the inspected flow

- First value does not require signup or a card. On-device comparison and text extraction are real code rather than a simulated network call.
- Evidence references preserve supporting passages, distinguish stated qualifications from ownership and keep review findings out of the CV download.
- The local approval is bound to the reviewed inputs; edits clear approval. PDF readiness is considered separately from DOCX/TXT fallbacks.
- The private service has owner checks, version-bound records, current-source checks and actual capability flags. The UI does not infer live success solely from a queued run.
- Reuse of approved final wording is already offered within the free check; that mechanism is worth joining to the private continuation instead of replacing it with another onboarding concept.

## Proof and limits

The isolated reproduction harness is `.tmp/usability-workflow.test.tsx`, with `.tmp/usability-workflow.config.ts`. It renders the actual `CvCheck`, actual recovery helper and comparison code, while replacing auth and account persistence/network boundaries with local fixtures. Both current-defect assertions passed in 1.23 seconds at 10:49 Asia/Dubai (06:49 UTC) on 14 October. These passing assertions prove the two defects in this controlled lifecycle; they are not an end-to-end certification of signup or the backend. No production writes or provider calls occurred.

The parent's reported live symptom of returning from vacancy comparison to CV entry with no visible explanation was not independently reproduced here. Normal `runCheck` success goes to step 4; its validation failure can go to step 2. It should remain a separate observation until the exact inputs/state are reproduced, rather than being folded into WF-02.

Current live model readiness, successful email confirmation, the current pilot's available capacity, background execution with the browser closed and successful real-account export remain external-unverified in this read-only audit.

## Focused repair order and acceptance criteria

1. **Protect work first:** fix WF-02 and WF-03. Regression checks must prove that final edits and removals survive earlier-step inspection and that a consented owner draft survives delayed auth restoration, while cross-account recovery stays blocked.
2. **Unify one application:** solve WF-01/WF-06/WF-08 together, not as three separate feature projects. One CV import and one vacancy paste must lead to one persistent application card with the exact CV, status and next action; normal sign-in must reopen it.
3. **Reduce onboarding effort:** replace passage-by-passage data entry with section-level review; keep ambiguous facts as focused questions. Permit application-only presentation edits. Remove the student/MBA choice from the critical path.
4. **Make availability understandable:** hide implementation controls under advanced settings; eliminate the legacy credit dead end; preserve the email destination; give signed-in users readable support replies.

Before claiming improvement, conduct moderated first-use tests with a first-time applicant and a busy professional, asking each to prepare one real vacancy then return for a second. Record time, repeated fields, requests for help, lost work and whether they can find the saved application. Success means they complete the task and understand the next step—not that the interface contains more explanatory text or passes more mocked assertions.
