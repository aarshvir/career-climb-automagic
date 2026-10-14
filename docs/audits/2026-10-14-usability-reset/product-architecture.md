# Jobvance: independent product architecture and usability assessment

Date: 14 October 2026. Source inspected: `061b37528cb110097878798b92da9c8403f6eeaf` (v21 source). Reviewer role: product manager, instructed to inspect the product before reading previous audits. No previous audit reports or scores were read. No application, database, account, or deployment changes were made.

This is a source-based assessment of the current user interface, routing and client data flows. It is not a live authenticated transaction test, customer interview, conversion experiment or visual certification. Other reviewers should verify the actual rendered screens and runtime behavior. Findings below distinguish a concrete product decision from its likely user consequence.

## Decision

The platform has accumulated several legitimate features without making them one product. There is a free application check, an older CV-and-pack workspace, a career-fact-based cloud workspace, a guided research pilot and several ways to learn the differences. A newcomer is being asked to understand this history.

Separating students and MBA students is one symptom. Their current application flows are the same. The larger problem is that the product presents internal segments, processing concepts and separate implementations where the customer expects one task: **use my CV to prepare for this job, then keep the application somewhere I can find it**.

The immediate priority is consolidation, not another feature, persona landing page, set of articles, avatar or cosmetic rename. Keep the working evidence comparison and document preview. Make them the center of one application journey.

## Findings, in order of customer impact

### PM-01 — Three application workflows and no single account home

**Severity: P1. Confidence: high. Decision: MERGE.**

`/check` reads, reviews, downloads and saves free checks; `/dashboard` uploads source CVs, generates application packs and tracks applications; `/loop` saves career facts, prepares cloud packets and separately tracks opportunities. These are separate product objects and surfaces, not merely different views over one application.

Evidence:

- `src/MvpApp.tsx:81`–`83`, `127`: the three runtime routes.
- `src/pages/Workspace.tsx:55`–`66`: “Your CVs”, “Tailor & download”, “Applications”, “Packs & payments”.
- `src/pages/JobLoop.tsx:20`–`21`: “Today”, “Career record”, “Opportunities”, “Outputs”, “Help & privacy”.
- `src/lib/free-check-api.ts:71`, `103`, `124`: free checks use `cv_checks`.
- `src/lib/workspace-api.ts:102`–`114`: the older workspace loads `application_packs` and `tracked_applications`.
- `src/pages/JobLoop.tsx:398`, `404`: the cloud workspace has its own opportunity and packet UI.

**Customer consequence:** “Where is the CV I just made?” and “Which tracker should I update?” are reasonable questions. The architecture requires customers to know which feature created their record.

**Fix:** one account-level Applications list and one detail page per vacancy. A detail page contains its job, relevant CV versions, review questions, approved files, status and next action. Existing records must be migrated or surfaced with their origin intact; do not delete historical stores to make the navigation look tidy. Keep `/check` as the account-free entrance to that same application model. Remove the older workspace from primary navigation once continuity is established.

### PM-02 — Sign-in destination changes according to the entrance used

**Severity: P1. Confidence: high. Decision: MERGE.**

Evidence:

- `src/components/layout/MvpHeader.tsx:27`: signed-in main action is “My Job Loop” → `/loop`.
- `src/components/layout/MvpHeader.tsx:34`: ordinary “Sign in” → `/auth` without an explicit destination.
- `src/lib/account-return.ts:10`–`11`: ordinary sign-in defaults to `/dashboard`.
- `src/MvpApp.tsx:139`–`144`: “Applications” redirects to `/dashboard?tab=tracker`, while “Jobs” redirects to the explanatory `/job-loop` page.
- `src/pages/JobLoop.tsx:413`: the cloud workspace calls the other one “Existing workspace”.

**Customer consequence:** the same account appears to open different products. A returning applicant who signs in can land somewhere different from the main signed-in account button.

**Fix:** one destination, labeled “My applications”. Preserve intended return-to-application links during authentication. Old URLs should redirect to the appropriate place inside that home rather than expose a second workspace.

### PM-03 — Saving the first check does not continue into the advertised reusable career record

**Severity: P1. Confidence: high about current client flow; authenticated runtime should confirm. Decision: MERGE.**

The homepage and audience pages describe a natural progression from a first check to saved reusable experience. The actual free check offers a saved check plus a separate optional tracker action, while Job Loop starts its own record setup.

Evidence:

- `src/pages/ProductPage.tsx:145`–`150`: reuse, saved facts, and an account needed to save.
- `src/pages/AudienceLanding.tsx:21`–`23`: saving confirmed experience for the next role is the next step.
- `src/pages/CvCheck.tsx:394`–`395`: “Save approved check to my account” and separately “Also add vacancy to Applications”.
- `src/lib/job-loop-api.ts:136`–`141`: Job Loop's saved-CV import loads document records, not free `cv_checks`.
- `src/pages/JobLoop.tsx:373`–`394`: separate record saving and fact-confirmation setup.

**Customer consequence:** after doing the work once, the customer has to discover another setup process and may need to supply or confirm overlapping information again. “Save” is not a clear completion state.

**Fix:** after first download, a single optional “Save this application” action should save the vacancy, approved document and reusable source with explicit storage consent. Open that exact application after sign-in. Ask only for information actually missing. Fact review for future cloud use can follow progressively; it should not look like starting again.

### PM-04 — Student/MBA segmentation is prominent but does not justify a different product path

**Severity: P1. Confidence: high. Decision: MERGE in product UI; KEEP only useful content context.**

Evidence:

- `src/pages/ProductPage.tsx:54`–`70`, `135`, `149`: audience picker plus three audience cards.
- `src/lib/job-loop-audiences.ts:3`–`35`: students and MBAs receive different text, examples and suggested titles but the same one-page and non-discreet defaults; professionals receive a two-page and discreet-search default.
- `src/pages/AudienceLanding.tsx:17`: three-way audience navigation.
- `src/pages/JobLoopOverview.tsx:22`: three more audience cards.
- `src/pages/PilotLanding.tsx:115`: the same division appears in the pilot form.

MBA applicants can have five to ten years of experience, so “MBA” and “professional” are not mutually exclusive. Separate acquisition content for “MBA CV” can be useful, but that does not mean a user should have to select a different product.

**Customer consequence:** the user wonders whether choosing the wrong label changes their document or excludes them. The product invents a choice before establishing value.

**Fix:** no persona gate before upload. Use the same journey. If useful, ask about internships, academic projects, prior employment or a discreet search when that context affects a specific action. Keep existing indexed audience URLs as relevant educational pages, with the same primary CTA; redirect or consolidate redundant pages carefully instead of abruptly breaking links.

### PM-05 — A neutral-looking primary CTA silently defaults to the student context

**Severity: P2. Confidence: high. Decision: REMOVE silent audience assignment.**

Evidence: `src/pages/ProductPage.tsx:121` initializes `audience` to `student`; `129` takes the main “Start my free CV check” destination from that selected example; `137` confirms that the example selection also chooses editable guidance for the check.

**Customer consequence:** a busy professional who never interacts with the example picker starts with student-specific guidance. Conversely, an apparently decorative example choice changes their primary action.

**Fix:** the main CTA always opens the neutral task. Example toggles change examples only. Preselected product preferences must be visible, relevant and editable at the moment they matter.

### PM-06 — The promise is effortless preparation; the main proof is a manual evidence review

**Severity: P1. Confidence: high. Decision: ALIGN the promise and core experience.**

Evidence:

- `src/pages/ProductPage.tsx:127`: “Stop rewriting your CV for every job.”
- `src/pages/ProductPage.tsx:143`: the before/after example swaps the order of two unchanged sentences.
- `src/pages/CvCheck.tsx:390`: “Relevant bullets may move earlier within the same section”, followed by a long editable CV, evidence questions, optional additions and paragraph removal.
- `src/pages/CvCheck.tsx:391`–`395`: manual final read, PDF layout review, approval, downloads and optional saving/tracking.

The product has useful evidence controls. But showing a two-bullet reorder does not prove the time-saving promise, and asking the user to reconstruct the result is far from the proposed busy-professional service.

**Customer consequence:** a user expecting a prepared application experiences a checklist and a text editor. The disappointment can feel like marketing deception even when individual claims are qualified.

**Fix:** show one real, reproducible input-to-output example with a meaningful change summary. Make a ready-to-review application the first result. Explain what changed, what did not change and the few decisions that need the candidate. Until richer preparation truly works in the same journey, use a narrower claim about checking and organizing a CV for a vacancy. Do not solve a capability gap by writing stronger copy.

### PM-07 — A six-step shell hides a very uneven amount of work

**Severity: P1. Confidence: high. Decision: MERGE stages; DEFER advanced operations.**

Evidence: `src/pages/CvCheck.tsx:383`–`395`. Step 1 is a role title; step 2 requires importing and reviewing CV text; step 3 pastes a vacancy; step 4 reviews findings; step 5 contains the full editor, repeated evidence, fact addition and paragraph removal; step 6 contains a document preview, PDF page controls, evidence, two attestations, approval, four downloads, next-application reuse, optional saving, authentication and tracker creation.

**Customer consequence:** a numbered “step” suggests a small predictable effort, but the final two are entire workflows. Finishing does not reveal one obvious next action. The extensive explanation competes with the document.

**Fix:** present three customer stages—Add CV and job, Review changes, Download/save. The six underlying states can remain if retaining them is necessary, but group them so progress reflects the task. Default to the few review questions that require a decision. Put reusable-source surgery, alternate formats, paragraph omission and processing details behind task-specific disclosure. Do not remove meaningful final approval.

### PM-08 — The cloud workspace turns career facts into database administration

**Severity: P1. Confidence: high. Decision: SIMPLIFY the interaction, KEEP provenance.**

Evidence: `src/pages/JobLoop.tsx:79`–`90`: evidence context, source kind, source passage, source context label, substantiated phrasing, measured/projected result status and two sharing/factual confirmations for an individual fact. The guided version collapses some fields but still exposes classification and result controls. `390`–`394` processes suggestions one passage at a time.

**Customer consequence:** the candidate must learn an evidence ontology and repeatedly certify information already supplied in their CV. This is especially unsuitable for the busy-professional positioning.

**Fix:** show the extracted experience with its employer/project heading and original passage beside it. Let the user correct the specific interpretation. Batch unchanged passages under a clear review and sharing action, while keeping distinct decisions for uncertain, restricted or estimated material. Preserve source citations, revisions, withdrawal and consent in storage. Those controls do not require a miniature database form for every bullet.

### PM-09 — A small CV correction requires a context switch and rebuild

**Severity: P1. Confidence: high. Decision: MERGE into the application review.**

Evidence: `src/pages/JobLoop.tsx:404` makes “CV text for factual review” read-only, explains that edits must be saved and confirmed in the career record first, and offers “Edit career facts, then rebuild”. Packet approvals are correctly version-bound.

**Customer consequence:** the user finds an issue in the CV, leaves the document, finds the corresponding source claim, edits/confirms it, reruns preparation and returns to the output. The interface makes a small action feel dangerous and technical.

**Fix:** let a review correction open the exact cited fact inline and rebuild the affected application after confirmation. Clearly distinguish a wording preference for this application from a change to the reusable fact. Preserve exact-file approval and invalidation. Do not add a free-form override that bypasses source controls.

### PM-10 — Infrastructure and missing integrations dominate a candidate's home

**Severity: P2. Confidence: high. Decision: DEFER to advanced/settings; REMOVE noise from main task.**

Evidence:

- `src/pages/JobLoop.tsx:361`–`369`: cloud run, preparation provider, model, unavailable providers, inbox lane, daily limits, run history, source coverage, scheduling and Gmail configuration.
- `src/pages/JobLoopPanels.tsx:41`: the customer sees remaining dollars of the shared AI/search budget for up to ten pilot accounts.
- `src/pages/JobLoopPanels.tsx:59`: employer API providers and board configuration appear in vacancy discovery.

Some processing disclosure is necessary. Model interchangeability is a sensible operator capability. Neither requires the candidate to operate the system as an infrastructure console.

**Customer consequence:** uncertainty about what is available and whether using the product will consume other customers' budget. “Prepare a cloud run” describes an implementation rather than a job-search outcome.

**Fix:** choose one configured recommended preparation method and clearly disclose relevant external processing at consent. Place optional model choice, diagnostics and technical source coverage in advanced controls. Show a customer's usable allowance and specific recovery action; put operator dollars in admin. If Gmail is unavailable, do not make an empty inbox lane a prominent part of the main daily task. Keep explicit capability boundaries where a user could otherwise misunderstand an outcome.

### PM-11 — “Pilot” means two different services

**Severity: P1. Confidence: high. Decision: REMOVE from primary product journey; KEEP a separate research/contact page if needed.**

Evidence:

- `src/pages/SubscriptionPricing.tsx:6` and `src/lib/subscription-plans.ts:17`–`18`: free pilot means account-based access to current cloud features.
- `src/pages/PilotLanding.tsx:97`–`108`: free pilot means a discussion, a mutually agreed preparation task and optional feedback over two weeks.
- `src/pages/PilotLanding.tsx:108`–`120`: the request form creates an unsent email draft; it does not register participation or reserve anything.
- `src/pages/CvCheck.tsx:405`: the working tool links to this research surface as “Explore a CV review”.

**Customer consequence:** they may complete a form expecting product access, only to get an email draft. A working product abruptly looks like a concept demonstration or consultancy intake.

**Fix:** remove this research path from the check's completion and main navigation. Name it “Help us test Jobvance” or “Request a guided session” only if it remains useful. Current account access should simply be described as free beta access. Do not imply a form submission or receipt when none occurs.

### PM-12 — Public pricing is mostly unavailable choices

**Severity: P2. Confidence: high. Decision: DEFER proposed paid tiers.**

Evidence: `src/pages/SubscriptionPricing.tsx:6`; `src/lib/subscription-plans.ts:2`–`18`. A free starter and free cloud pilot coexist with $15 Focus and $29 Job Loop proposals, disabled checkout buttons, proposed limits and multiple explanations of non-purchasability.

**Customer consequence:** the applicant studies distinctions and prices that cannot influence a purchase today. The disabled product cards reinforce the impression of an unfinished platform. “Packs” and “runs” are new units without an established value in the user's mind.

**Fix:** a concise Free beta page explaining what is available, any capacity limits, how to start and what happens when a limit is reached. Keep pricing research and economic models internally until sales can open. Retain accurate commercial/legal status; do not enable payments without the separate prerequisites.

### PM-13 — The interface is written in repeated review-and-permission language

**Severity: P2. Confidence: high about repetition; perceived tone needs user validation. Decision: EDIT and consolidate, not conceal.**

Examples appear in the main header, homepage preview, audience pages, workspace taglines, fact editor, outputs and footnotes: “reviewed”, “actual”, “confirmed”, “shareable”, “source”, “exact”, “by you”, “not independently verified”, “nothing was sent”. `src/pages/JobLoop.tsx:79`–`90`, `398`–`405`, `413`; `src/pages/CvCheck.tsx:387`–`405`; `src/pages/ProductPage.tsx:142`–`151`.

**Customer consequence:** the system sounds as though it is correcting or defending itself. Repeated warnings compete with the next click and make a straightforward task feel unusually risky. Removing the words “AI” and “fictional” did not address this underlying voice.

**Fix:** write around actions: “Add your CV”, “These 3 points need an answer”, “Download CV”, “Application saved”. Give one clear explanation of source/final-document responsibilities at the point of approval. Preserve necessary permissions and meaningful exceptions. Details can explain the mechanism; they should not be the dominant narrative. Do not invent endorsements or hide demonstration status to make the tone more confident.

### PM-14 — Many help formats compensate for a journey that should explain itself

**Severity: P2. Confidence: medium. Decision: KEEP contextual help; DEFER help-content expansion.**

Evidence: header includes both Job Loop and Help; the homepage links a video and How it works; `/job-loop` has another four-stage explanation; `/help` offers many topics; `/walkthroughs` offers task selection, video, interactive steps, transcript and task help (`src/components/layout/MvpHeader.tsx:15`, `src/pages/JobLoopOverview.tsx:19`, `src/pages/Walkthroughs.tsx:67`–`82`, `src/pages/HelpCenter.tsx:238`–`255`).

**Customer consequence:** users can spend time choosing how to learn the product instead of doing the job. The written and video guidance can describe different generations of the interface; the walkthrough itself notes that interactive guidance may be newer than the recording (`src/pages/Walkthroughs.tsx:81`).

**Fix:** one inline “What do I do here?” answer per important input, plus a short optional walkthrough of the actual current task. Keep text/captions for accessibility. Existing guides can remain in a secondary library; do not put content expansion ahead of simplifying the task. Refresh recordings after the flow stabilizes, rather than using a more realistic avatar to disguise a confusing experience.

## One coherent minimum journey

1. **Landing:** state the task and show the actual resulting document. Main action: “Prepare my CV for a job”. No degree or persona selection required.
2. **Add CV and job:** import the existing CV and paste the job description. Extract title/company where possible and ask the user to check, rather than require a role-title screen before seeing either input. Explain local versus external processing when relevant.
3. **Review:** show the proposed CV beside a short list of changes and genuinely unresolved questions. Cite source passages on demand. Keep academic/employment context visible where it affects a statement. Let corrections be made without navigating into another module.
4. **Finish:** one document preview, factual/privacy approval and primary download action. Secondary formats are secondary. Say clearly whether a file downloaded or is only ready.
5. **Optional save:** keep this exact application in the user's account. Authentication returns to it. Carry the source into future applications with explicit permission. No separate tracker form for the same job.
6. **Return:** “My applications” shows each vacancy with its CV, progress and next action. “Add another job” reuses the source. Scheduling becomes an optional enhancement after a successful application, not initial onboarding homework.

Students, MBA candidates and professionals use the same journey. Their source material, preferred length, target seniority and confidentiality choices vary inside it. A person can be both an MBA applicant and an experienced professional without choosing the wrong product.

## What to retain

- Account-free first use: a strong reduction in commitment before value.
- Original CV and vacancy passages visible beside the comparison: concrete product proof.
- Actual PDF preview and approval tied to the specific document: useful confidence before sending.
- Reuse of an approved CV for another vacancy: close to the customer's repeated task.
- Private storage and owner-bound access, source correction and withdrawal controls: important foundations, with a simpler interaction layer.
- Explicit fact that preparing a document is different from employer submission: keep this precise, once at the relevant moment.
- Accessible written help, captions and recoverable errors: keep them, make the default path understandable without them.

## Bounded heuristic scores

These are a product manager's diagnostic estimates from source, not measured customer satisfaction, benchmark results or a claim about complete production reliability. A live novice test could move them materially. A 95+ target is not evidence of achieving it.

| Dimension | Current estimate / 100 | Main reason |
|---|---:|---|
| First-time purpose and next action | 60 | The homepage names a task, but the wider product switches concepts. |
| Information architecture and return navigation | 38 | Three private application systems and conflicting home destinations. |
| Continuity from first result to saved use | 40 | Free check, tracker and cloud record do not form a clear continuation. |
| Effort relative to the busy-professional promise | 42 | Many manual reviews, classifications, setup steps and rebuilds. |
| Segmentation usefulness | 45 | Different examples are useful; prominent overlapping persona paths are not. |
| Help and task-level explanation | 65 | Substantial guidance exists but is spread over competing formats. |
| Source transparency and final document control | 78 | Strong visibility and exact approval, presented with too much friction. |

No consolidated “platform score” is assigned: source-only architecture inspection cannot honestly grade live CV quality, delivery reliability, user retention, search rankings or willingness to pay.

## A restrained fixing sequence

**First:** remove unnecessary public persona choices, neutralize default student routing, hide unavailable paid proposals, separate guided research from product access, and align sign-in destinations. These are decisions that can reduce confusion without adding a feature.

**Second:** establish one application object and one private home, import existing data safely, connect first-check saving to that object, and make application status/documents visible there. This is the main product repair; do not claim that navigation renaming alone completes it.

**Third:** simplify review and fact correction around that application, then make a configured preparation method the default. Move optional infrastructure choices out of the primary task.

**Then validate:** observe at least two novice students/early-career applicants, two working professionals and one experienced MBA applicant. Ask each to start cold, prepare for a real vacancy, download, save, leave and return to find the right application. Record completion, wrong turns, repeated entry, requests for help and whether they can explain what the system did. Do not coach them through the journey. Treat a review agent's score as a hypothesis; their unassisted completion is the decision evidence.

**Defer:** new persona products, more subscriptions, a coach portal, larger content libraries, a more expensive avatar and broad acquisition campaigns. Improve those after the shared journey is demonstrably understandable.
