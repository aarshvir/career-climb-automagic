# Jobvance usability and product-judgement assessment

Reviewed 14 October 2026. Live application: version 21, application source `7ef48164bc7e9238809b4c199b3f136605ffaf56`; documentation checkout `061b37528cb110097878798b92da9c8403f6eeaf`.

## Verdict

The student/MBA separation is an avoidable product decision in this implementation. Both use the same underlying application workflow. MBA-specific examples can be useful after importing experience, but a person should not need to classify themselves by degree before understanding the product. Experienced MBA candidates also overlap with working professionals.

The larger problem is that Jobvance has accumulated three partially connected application products: the free check, the older workspace and Job Loop. Different navigation, records, terminology and approval paths make users understand the implementation instead of simply preparing and managing an application. More polished copy or a more realistic presenter cannot resolve those seams.

The preceding word-removal release did what its checks measured. Those checks did not establish a coherent journey, low effort, useful tailoring, repeat use or best-in-class usability. Product decisions should have been assessed against a shared journey before adding more audience pages, explanations and media. That was a prioritization failure.

## Method and evidence

Three separately assigned agents reviewed product architecture, copy/design and workflow/reliability in parallel. They drafted findings without consulting earlier audit grades. Their reports contain 40 finding entries; the 21 consolidated items below merge related entries. These are expert reviews, not interviews with 40 customers or statistically independent customer research.

The coordinator also inspected the current live homepage at desktop and 390×844 mobile sizes; followed its primary CTA through role, CV, vacancy, evidence, editing, approval and PDF preview; requested a TXT download; and inspected the signed-in Job Loop home. The existing browser was already signed into the owner's account. This was not a new-account signup test. The test CV was explicitly marked as a product-review record; no check, tracker or career record was saved, no cloud run was started, and no message was sent. Temporary viewport changes were reset.

Evidence classes:

- **Live:** directly visible on the deployed interface.
- **Source:** current implementation wiring or text.
- **Reproduced:** a controlled local harness demonstrated the reported behavior using the actual component/helper.
- **Judgement:** an editorial or usability interpretation requiring real-user validation.
- **Unverified:** an external integration or outcome not completed in this round.

Independent reports: [product architecture](product-architecture.md), [copy and design](copy-design.md), [workflow and reliability](workflow.md). Machine-readable priorities: [findings.json](findings.json). The two defect observations are archived with [reproduction instructions](reproduction/README.md); they are not passing release regressions.

## Consolidated findings

| ID | Problem and customer consequence | Evidence | Correction |
| --- | --- | --- | --- |
| U01 | **Overlapping audience categories.** A student, MBA student and experienced professional can be the same person, yet the site repeatedly presents them as different paths. | Live + source; PM-04, CD-02 | One main entry. Use projects, prior employment and target role to tailor relevant questions/examples inside the task. |
| U02 | **A demonstration selector changes onboarding.** “See an example for” silently changes the primary CTA. Its default sends everyone to student guidance, including a professional CV in the live walkthrough. | Live + source; PM-05, CD-03, WF-10 | Demonstration controls change only the demonstration. Neutral entry must not silently assign a persona. |
| U03 | **Three application systems.** Free checks, legacy CV packs/tracker and Loop opportunities/outputs have separate records and inconsistent homes. | Source; PM-01, WF-01/06 | One application object and one visible Applications home, with safe access to existing records. A label change alone is insufficient. |
| U04 | **Sign-in does not have one dependable destination.** General auth uses the old dashboard; the header uses Loop; email continuation lacks Google's explicit Loop-return handling. | Source; PM-02, WF-11; fresh email confirmation unverified | Preserve the exact application/task through every supported sign-in method. Test same-tab and new-tab confirmation. |
| U05 | **Saved work does not become continued work.** The live account had a saved free check, while Loop showed zero setup progress and asked for another CV import. | Live + source; PM-03, WF-01 | “Save this application” must retain the CV, vacancy and reviewed document together and resume them in the same home. Obtain storage consent once at that handoff. |
| U06 | **Refresh recovery can discard an owned draft during auth loading.** The recovery helper sees an unknown owner as a mismatch before the session settles. | Reproduced locally; WF-03 | Wait for auth resolution before owner-bound recovery or persistence. Preserve cross-account isolation and clear restored approval. |
| U07 | **Rechecking the unchanged vacancy discards final edits.** The implementation regenerates final wording from the original source without preserving manual changes. | Reproduced locally; WF-02 | Recompute findings against current edits. Regeneration must be explicit and undoable. Preserve removed confidential text as removed from the chosen final version. |
| U08 | **Six screens distribute effort poorly.** A whole stage asks for a role title already present in the vacancy, while later stages contain much longer editing and approval work. | Live + source; PM-07, CD-05 | Prototype three visible stages—add CV/job, review, finish—while retaining necessary underlying checks. Suggest title/company from the vacancy and allow correction. Validate the grouping with novices before adopting it. |
| U09 | **Candidates administer an evidence database.** Passage-by-passage classification, contribution/result states and repeated confirmations are substantial work before a reusable CV exists. | Source; PM-08, WF-04 | Import a familiar CV, group experience by role/project and ask focused questions only about unresolved facts. Keep provenance machinery behind the interface. |
| U10 | **A final wording correction requires leaving the document.** Private output is read-only; a candidate must edit facts, reconfirm and rebuild. | Source; PM-09, WF-05 | Permit application-specific presentation edits where the result is reviewed. Distinguish a global factual correction from wording for one vacancy. |
| U11 | **A saved vacancy has no direct next action.** The candidate moves from Opportunities to Today to a batch run and then to Outputs. | Source; WF-08 | Show “Prepare CV for this job” on that application's card, with its progress and result in the same detail view. Keep batching optional. |
| U12 | **PDF preview and approval have a confusing order.** In the live test, TXT could be approved while PDF stayed disabled; generating its preview then cleared both confirmations and approval. | Live + source | Present the layout preview before one clear final approval. Show the exact missing prerequisite beside any disabled action. Material document changes should still invalidate approval. |
| U13 | **The demonstrated value is smaller than the intended product promise.** The hero shows simple phrase matching and bullet order; provider contracts select existing facts/questions rather than freely rewriting a role-specific CV. | Source + judgement; PM-06, CD-04, WF-07 | Show what the configured product actually produces. Decide and validate the source-bound tailoring behavior before promoting a stronger rewriting/automation claim. A premium model selector is not proof of a richer result. |
| U14 | **Operator concepts are candidate tasks.** Claims, packets, lanes, revisions, providers, cloud runs and the shared monthly balance appear alongside basic application preparation. | Live + source; PM-10, CD-06, WF-07 | Lead with ordinary actions and user-specific progress. Put infrastructure and account-wide diagnostics in administration/advanced details; retain necessary processing consent and actionable failure messages. |
| U15 | **Job discovery coverage is much narrower than an unrestricted job-search product.** The live page listed three configured employer boards and reported broad web search unconfigured. | Live; CD-11 supports the expectation mismatch | State current coverage clearly and offer a working bring-your-own-vacancy route. Broader discovery needs configured sources and verified relevance/freshness before being presented as available. |
| U16 | **A free product exposes unavailable paid plans and an old credit path.** Proposed tiers/disabled checkout compete with current use; the old workspace can reach a credit dead end while another free workflow exists. | Source; PM-12, WF-09 | Present the current free offer. Reconcile legacy entitlements without breaking existing access. Keep future pricing proposals out of the main customer journey. |
| U17 | **“Pilot” names two different things.** Cloud beta access and a guided discussion request are mixed; the older pilot page prepares an unsent email rather than continuing an application. | Source; PM-11, CD-12 | Remove the research-request detour from the main application path. Keep any coach/research invitation in a clearly secondary location. |
| U18 | **The voice repeatedly lectures or qualifies.** Examples include “not receiving a qualification certificate,” “claims remain user-attested” and repeated statements about source, review and sending. | Live + source + judgement; PM-13, CD-07/13 | Use short action-led language. Explain a meaningful limitation once where it affects a decision, rather than repeatedly defending the system. Preserve truthful boundaries and necessary permissions. |
| U19 | **Orderly design is mistaken for compelling product proof.** Large whitespace, repeated cards, tiny nested interface labels and trivial examples do not demonstrate a useful finished application. | Desktop/mobile observation + judgement; CD-04/14 | Keep readable typography and alignment. Make the actual result, meaningful changes and next action the visual focus. Develop a distinct identity around useful work rather than more decorative sections. |
| U20 | **Help and media add another product to learn.** Topic pickers, tutorial formats, interactive steps and transcripts sit beside a large generated guide and small application footage. | Source + current poster/frame review + judgement; PM-14, CD-08/09/10 | Make the default path understandable without a tutorial. Provide a short relevant hint and optional current screen recording; retain captions/text accessibility. Stabilize the workflow before producing more avatar videos. |
| U21 | **Important fallback paths give work back to the candidate.** No-CV entry becomes a blank text-writing task, scans need external OCR, and signed-in support does not display the reply body available to guest support. | Source; WF-12; actual support delivery unverified | Prioritize guided first-CV capture and a readable support conversation. Offer paste fallback beside import failures. Add costly OCR only if observed failures justify it. |

The two reproduced lost-work defects should be fixed before further promotion. U03–U05 and U09–U11 form one shared workflow repair, not seven separate product builds.

## What the live walkthrough establishes—and what it does not

- The primary action opens an on-device CV/vacancy checker. It visibly injects student guidance by default even when the test CV contains several years of employment.
- Evidence findings and an editable CV are real interfaces. The simple test record passed through review and approval; its final text remained unchanged in that particular case. This single input is not a general output-quality benchmark.
- A one-page PDF preview was generated and reported within the selected limit. Previewing after approval reset approval as described in U12.
- Clicking TXT produced “download requested” and a prepared-file link. The browser tool timed out waiting for a download event, and the expected current test file was not found in the inspected Downloads location. **Actual file delivery was not independently established in this run.** This is a verification gap, not a confirmed product failure or proof that every user's download fails.
- One initial comparison attempt returned to CV entry without a visible explanation; retrying from the settled form succeeded. Its cause was not reproduced, so it is retained as an observation, not promoted to a confirmed defect.
- No new account, email confirmation, paid model call, background run, storage mutation, deletion or employer submission was performed. Existing test data in the owner account is not customer traction. No AI-authorship percentage, conversion result, search rank or 95/98 score is certified.

## One intended customer journey

**Add CV and job → review prepared application → preview and download → optionally save → return to the same application → add the next job using the saved experience.**

One application should contain the vacancy, source CV, role-specific CV versions, review state, tracking status and next action. Scheduling and discovery enhance that same application workspace. They should not introduce another onboarding system.

The system should retain academic-versus-employment context, truthful contributions and sharing permission. The user should mainly answer genuine uncertainties, make a final review and decide when to apply. This is the design goal; the percentage of effort automated must be measured, not asserted.

## Four bounded repair releases

1. **Protect work.** Fix U06/U07 and add meaningful regression checks for delayed auth, unchanged-vacancy rechecks, retained edits/removals and cross-account isolation. Rehearse restore paths before relying on them.
2. **Make one application and one home.** Join first-check saving, role-specific documents and tracking. Preserve access to old records through safe adapters/migration; do not erase them to simplify the interface. Authentication must return to the intended application. A second vacancy must reuse existing material without re-importing it.
3. **Reduce the candidate's work.** Replace database-like fact administration with grouped review and a short unresolved-question list. Give each vacancy a direct preparation action and an editable result. Make preview/approval/download one understandable finish. Move configuration out of the main path.
4. **Simplify the public experience around that working flow.** Remove degree-based gates, silent student defaults, redundant explanations, unavailable offers and the research detour. Show a substantial current result. Refine copy and visual identity; refresh short guides only after the interaction is stable.

More persona pages, blog volume, model menus, launch campaigns and expensive avatars should not precede these repairs. Existing useful articles can remain secondary resources. Existing security, budget, payment and ownership constraints still apply.

## How to accept the repair

First use automated regression and controlled hosting checks for technical behavior. Then observe five novice participants: two students/early-career applicants, two busy professionals and one experienced MBA applicant. These overlap deliberately; they are test contexts, not product silos.

Without coaching, each should explain what Jobvance does, start from an existing CV and vacancy, review a useful output, open the downloaded file, save, leave, return to the same application and prepare a second vacancy. Record wrong turns, repeated information, help requests, corrections, file delivery and any lost work. This small study is a usability check, not proof of market demand or a conversion benchmark.

Release acceptance requires preservation of work, a dependable return destination, actual openable exports and clear handling of failure. A new checklist count or a forced high score is not a substitute for those outcomes.

## Visual evidence

The homepage is legible and responsive in the inspected sizes. Its hierarchy and overlapping audience controls are visible in [desktop](evidence/homepage-desktop.jpg) and [mobile](evidence/homepage-mobile.jpg) captures. These public-surface screenshots contain no private CVs or account identifiers. Private Loop and test-document screenshots remain local; private account contents are not included in this report.

The existing broader 19-package backlog remains open. This assessment reframes the product priorities; it does not mark those implementations complete or re-certify private integration/deletion behavior.
