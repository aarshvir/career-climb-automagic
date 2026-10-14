# Independent copy, visual hierarchy and product clarity review

Reviewed 14 October 2026. Source: `061b37528cb110097878798b92da9c8403f6eeaf` (current v21). No previous audit scores were read before drafting these findings. This is a read-only expert inspection, not a study with customers and not an AI-detector result.

## Verdict

The user's objection is supported by the interface. Separating students from MBA students is one example of a larger problem: internal product categories, technical controls and repeatedly explained safeguards have shaped the navigation more than the customer's task has.

The website is selling a one-off CV wording checker. The business ambition is a service that reduces the work of searching and applying. The two experiences have different entry routes, different names for the same objects, different setup requirements and an unclear transition. Changing a few slogans or deleting words such as “fictional” could not have corrected that.

The landing page has competent alignment, spacing and a restrained palette. Those are useful foundations. They do not make the product journey clear or distinctive. The large homepage demonstration shows a weak phrase match and repeated review instructions, rather than a finished, convincing application or a comprehensible daily job-search routine.

## Evidence inspected

- Current source: `ProductPage.tsx`, `ProductRefresh.css`, `AudienceLanding.tsx`, `job-loop-audiences.ts`, `MvpHeader.tsx`, `MvpFooter.tsx`, `JobLoopOverview.tsx`, `JobLoop.tsx`, `JobLoopPanels.tsx`, `CvCheck.tsx`, `HelpCenter.tsx`, `Walkthroughs.tsx`, `walkthroughs.ts`, `PilotLanding.tsx`, `PilotDemo.tsx`, `SubscriptionPricing.tsx`, `subscription-plans.ts`, and selected career-guide copy.
- Fresh live homepage screenshot supplied by the root reviewer: `.tmp/usability-reset/homepage-desktop.jpg`, 1905 × 904, Chrome, signed-in owner session. The screenshot establishes the public-facing hierarchy and actual default student example, not how a new visitor behaves.
- Current first-check video poster: `docs/product-hardening/tutorial-assets/videos/first-check.jpg`. This establishes composition and text scale. I did not infer motion quality or voice quality from the still image.
- No production-account mutations, paid calls, external messages or product changes were made by this reviewer.

## Findings

### CD-01 — The homepage teaches the wrong mental model

**Priority: P1. Evidence: high confidence; conversion impact unmeasured.**

`ProductPage.tsx:127–151` leads with “Stop rewriting your CV for every job” and directs the primary action to the free check. Job Loop appears later as something for multiple applications. `JobLoopOverview.tsx` again primarily directs visitors to `/check`; private setup is farther down the page.

An ordinary visitor is being asked to discover whether Jobvance is a CV checker, a CV writer, a tracker or an ongoing job-search service. The public page never makes one application object and its lifecycle the organizing concept.

**Correction:** establish one application journey: add CV → add a role → review the prepared application → keep its status and next action. Reuse and scheduling become capabilities of that same workspace. The public page should explicitly say which work happens automatically today. Do not replace this with an automation promise the configured product cannot deliver.

### CD-02 — Student and MBA choices are overlapping labels, not meaningful navigation

**Priority: P1. Evidence: high confidence.**

`ProductPage.tsx:52–78,135,149`, `JobLoopOverview.tsx`, `AudienceLanding.tsx` and `/pilot` repeatedly divide visitors into students, MBAs and professionals. MBA students may also be experienced professionals. The same core input and output are required in each path. The homepage itself says “The starting material changes. The job is the same.”

The underlying defaults are more meaningful than the marketing categories: one- or two-page preference, prior work, projects and discreet-search preference (`job-loop-audiences.ts`). Those should be inferred from the imported record where appropriate or asked when they affect the task, with editable defaults. A degree need not decide the site's navigation.

**Correction:** remove audience selection from the main entry. Keep contextual student/MBA content in relevant examples or acquisition pages, with the same core action. If optional onboarding needs a broad question, “Applying for your first role” versus “Applying with work experience” is closer to a task distinction; neither should be a gate.

### CD-03 — An “example” tab silently changes the main action

**Priority: P1. Evidence: high confidence.**

The selector is labelled “See an example for,” but its state changes `example.checkPath` for the hero and later primary CTAs (`ProductPage.tsx:121–136,150–151`). It is not purely an illustrative control. The student option is the default even in the signed-in owner's live screenshot.

**Correction:** illustrative controls should change only the illustration. Product setup should be explicit, editable and driven by the person's record. Returning signed-in users should see a clear way to resume their work, not a student demonstration as the dominant state.

### CD-04 — The homepage's strongest proof is too trivial

**Priority: P1. Evidence: high confidence for content; perceived value is a hypothesis.**

The main student example matches “Develop Python reports” against “Developed Python reports for a university project.” Another major section demonstrates swapping two bullets without changing wording. These are honest examples, but they make the product's contribution look small. “Assisted in leading Python reporting” is awkward demonstration writing and does little to explain what useful output the user receives.

**Correction:** show a complete, readable role-specific application preview and three concrete decisions: useful experience selected, a relevant missing detail requested, a finished CV ready to review. Preserve source access as an expandable control. Use one coherent example with a believable role and CV, rather than multiple miniature compliance demonstrations. Label it as an example once.

### CD-05 — Six numbered steps do not mean six necessary user tasks

**Priority: P1. Evidence: high confidence.**

`CvCheck.tsx:25,383–392` allocates an entire first step to role title and optional company, then separates evidence inspection, full-text review and final approval into more stages. A user who already has a job description must enter its title separately before uploading the CV. The finished download requires finding PDF preview, confirming two long statements, approving and selecting a format.

**Correction:** prototype fewer visible stages, without silently removing accuracy or privacy controls: (1) add CV and job, (2) review changes and questions, (3) preview and download. Role and employer can be extracted as suggestions from the vacancy and edited inline. Whether extraction is feasible should be checked by engineering before implementation. Keep the existing six-stage route only if customer testing demonstrates it is easier, not because an earlier specification had six stages.

### CD-06 — Internal nouns dominate the private product

**Priority: P1. Evidence: high confidence.**

Examples include “Your claim library,” “Suggest literal passages,” “Wording I can substantiate,” “Prepared outputs,” “packet,” “source-based preparation,” and “Career record revision” (`JobLoop.tsx:82–89,389,403–404`). These nouns are meaningful to the implementation and review system but make the candidate learn a new vocabulary.

**Correction:** use stable, ordinary terms: “Your experience,” “Review imported experience,” “CV wording,” “Applications,” “Application documents,” and “Prepare applications.” Keep source IDs, revisions, provider methods and debugging status in expandable detail or the operator portal. Do not just rename the backend concepts while leaving the candidate to perform the same fragmented work.

### CD-07 — Safety copy repeatedly addresses unlikely misunderstandings

**Priority: P1. Evidence: high confidence.**

The final stage says “You are approving the wording, not receiving a qualification certificate” (`CvCheck.tsx:391`). Empty outputs say “A failed or unfinished run is not an empty successful shortlist” (`JobLoop.tsx:403`). The homepage and explanation pages repeatedly state that matching words do not establish qualifications and that the user submits applications themselves.

These statements protect important boundaries, but presenting all of them repeatedly makes the product sound defensive and accusatory. The interface spends attention correcting interpretations the visitor may never have had.

**Correction:** keep a concise, neutral boundary next to the relevant action, such as “Review the details before using this CV” and “Download your documents, then apply on the employer's site.” Show detailed limitations in context when they matter. Preserve real confirmation controls, source accuracy and honest capability reporting; remove repeated lectures and implausible disclaimers.

### CD-08 — Help explains the complexity instead of reducing it

**Priority: P1. Evidence: high confidence.**

`HelpCenter.tsx` contains long instructions for source-line removal, source versus final CV versions, exact approval, page limits, temporary tab retention, multiple kinds of run cancellation, source facts and packet invalidation. Much of this is accurate documentation. It also reveals how much product state a candidate must understand.

**Correction:** shorten the core task first. At each field, provide one small example and one relevant help action. Show one help article at a time rather than rendering the entire manual beneath a task picker and search. Documentation should explain an exception after the user encounters it, not be a prerequisite to preparing an application.

### CD-09 — The walkthrough experience adds another interface to learn

**Priority: P2. Evidence: high confidence.**

`Walkthroughs.tsx` presents a selected task, a task chooser, format navigation, a video-load action, chapters, an interactive storyboard, captions toggle, next/previous/restart controls, a step picker, and a transcript. Written guidance can differ from the recording and explicitly warns about that divergence. This is a tutorial platform inside the job platform.

**Correction:** make the default help action a short clip or guided cue for the exact screen the candidate is using. Keep an accessible transcript adjacent. Additional tutorials can remain in a library, but should not be part of the first-use path. “Interactive walkthrough” is also a poor label when its apparent action is a styled span rather than a working product action; “Step-by-step guide” better matches its behavior.

### CD-10 — Presenter prominence competes with readable product footage

**Priority: P2. Evidence: high confidence for still composition; video motion unreviewed.**

The current first-check poster gives a large right-hand area to the portrait, a small screenshot to the left, and a large caption band below. It does not show the requested small human guide at the bottom right of a dominant product screen. At narrow playback sizes the actual form labels will be difficult to read.

**Correction:** favor a screen-first walkthrough, with cursor movement, zoom/crop to the active control and a small optional portrait. A concise, well-produced guide is more useful than a large avatar. Do not spend more on avatar realism before the workflow is simplified; it will need recording again. This is not evidence that a specific AI detector would assign any percentage.

### CD-11 — “Complete Job Loop” conflicts with the actual availability explanation

**Priority: P1. Evidence: high confidence.**

`SubscriptionPricing.tsx:6` says “Try the complete Job Loop free.” `JobLoopOverview.tsx` says the pilot covers selected employer feeds and that broad paid search and mailbox access are not connected. A visitor reading different pages can form different expectations of what the free product does.

**Correction:** state the available pilot scope once in plain language, with live availability in the workspace. Remove “complete” until the offered job loop is complete. Pricing should not simultaneously foreground two unavailable future subscriptions; keep today's free access primary and put proposed plans in secondary detail until they can be purchased.

### CD-12 — The old pilot funnel is still a competing product entrance

**Priority: P1. Evidence: high confidence.**

`CvCheck.tsx:405` links to `/pilot` as “Explore a CV review.” That page advertises a free guided program and asks visitors to prepare an unsent local email request, then send it themselves (`PilotLanding.tsx`). It introduces career coaches as another audience and uses a differently styled violet demonstration. It is easy to mistake this for the normal way to get access or help.

**Correction:** keep one live product entrance. Move the old coach/demo research flow out of the candidate's main journey, or turn `/pilot` into a short explanation that routes to the current product and a real support action. Do not make the form pretend it submitted when it only prepares a draft.

### CD-13 — The brand voice repeats the same generated-sounding construction

**Priority: P2. Evidence: expert editorial judgment, not a detector finding.**

Examples include “LESS REPEAT WORK. MORE RELEVANT APPLICATIONS,” “The work you've done. Ready for the next vacancy,” “Wherever you are in your career,” “Your next application shouldn't send you back to square one,” “What would you like to get done?” and “SHORT STEPS, AT YOUR PACE.” The problem is the volume of interchangeable headings, tiny all-caps eyebrows, arrow links and repeated three-part explanations. The current main headline itself is reasonably understandable; replacing every sentence with a new slogan would make this worse.

**Correction:** fewer sections and more direct labels. A candidate should see their CV, the job and the next action more often than brand narration. Examples: “Add your CV,” “Paste the job description,” “Here's what needs changing,” “Your CV for this job,” “Save this application.” Prefer a single strong product explanation to another set of clever taglines.

### CD-14 — The interface is orderly, but too much useful detail is miniature

**Priority: P2. Evidence: live desktop screenshot and CSS.**

The hero preview is a nested card with a toolbar, role label, two pairs of evidence cards, category labels, statuses, a question, a footer and a caption. `ProductRefresh.css` sets several desktop labels to 9–11px. In the fresh screenshot, the largest attractive object is a wall of small explanatory text. The preview communicates that there will be substantial reading.

**Correction:** show less information at once, with readable type. Display one strong example or one finished document, with an obvious active element and restrained annotations. Keep the green/cream palette if desired; it is not inherently a problem. Differentiation should come from the product interaction, useful information and consistent finish rather than adding gradients, extra cards or decorative animation.

## Concrete proposed hierarchy

This is a prototype direction, not a claim that the implementation already supports every part.

1. One brief product explanation: “Keep each job, its CV and your next step together.” Below it: “Add your CV and a job description. Review the changes, download your application and keep track of what happens next.”
2. One primary action: “Prepare an application.” If the immediate route is still only a wording comparison, call it “Check my CV against a job” until the unified application workflow exists.
3. One coherent example of the actual result, with a readable finished CV and expandable source links.
4. Three tasks: add your CV and job; review what needs changing; download and track. State precisely which of these the pilot automates.
5. Optional ongoing preparation introduced after first value, inside the same workspace. Do not make visitors select an academic category or decipher Job Loop before trying it.

## Smallest useful correction sequence

1. Remove the overlapping audience choices and silent example-to-onboarding coupling. Keep contextual examples as optional content.
2. Resolve the checker/Job Loop/tracker handoff around one application record, then simplify the first successful journey. This is the substantial product task.
3. Rewrite the active flow around candidate vocabulary and move technical explanation out of the primary screen. Retain factual/source/permission enforcement in the system.
4. Remove stale pilot detours and “complete” availability claims. Show the currently usable offer clearly.
5. Replace the large nested demo with a compelling finished-output example; record short contextual walkthroughs after the new flow is stable.

## Validation needed before calling this clear

- With at least five people who have not seen the project, ask after ten seconds: what does this do, what must you bring, and what should you click next? Do not explain the page first.
- Give each a real but shareable CV and a vacancy. Ask them to prepare a download, return to that application and start another. Observe where they hesitate, backtrack or ask for help; record completion and time without turning them into marketing claims.
- Include a student with limited experience and an employed professional. Include an MBA participant as a context within those groups, not a mandatory distinct navigation silo.
- Test mobile help and video at the size users will actually view them. Test both fresh visitors and returning signed-in users.
- Automated tests should verify correctness and accessibility; they cannot establish that a stranger understands the product or that the copy feels human.

The current evidence supports a focused product simplification, not another high numerical score or a wider feature list.
