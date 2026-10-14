# Copy and first-use baseline

Captured 14 October 2026, before the design refresh, against source commit `39fb057` and the public site at `https://jobvance.io/` (runtime 18). This is an independent expert review of the existing experience, not a customer study, authorship test, conversion experiment or proof that a journey is perfect.

## Finding

The product has a useful, concrete task: bring a CV and a job description, compare the passages, edit the CV and download it. The current experience makes that task feel more complicated than it needs to be. Repeated slogan fragments, several competing paths and a six-step setup weaken an otherwise coherent visual base.

The most urgent change is to make one task and one next action obvious. A first-time visitor should not need to understand “Job Loop,” choose a career identity, read operational caveats or complete role metadata before adding the two documents they came to use.

No overall numeric “quality” or “AI-written” percentage is assigned. A style script returns 84/100 while missing several of the problems below; optimizing toward a chosen score would conceal those problems.

## What was actually reviewed

- Live public homepage, default student state; the primary CV-check link; and the guest flow through the first evidence result using a short, explicitly fictional student CV and vacancy.
- Live screenshots of the homepage and first check screen at the browser's existing approximately 1265 × 712 viewport. No device emulation was used in this review.
- Baseline source for `ProductPage.tsx`, `CvCheck.tsx`, `JobLoopOverview.tsx`, the shared header/footer, help, guides and public metadata. The guest flow and connected cloud workspace were not treated as interchangeable.
- Local Content Humanizer script applied to a captured copy corpus before application edits. It reads style patterns; it cannot establish whether a human or model wrote anything.

No account was created, private user CV used, employer application sent, cloud model invoked or paid action attempted. The guest flow was inspected only as far as evidence review; later review/download observations below are source-based.

## The first five changes

| Priority | Observed problem | Change that directly addresses it |
| --- | --- | --- |
| 1 | The hero is “Your CV. One vacancy. A clearer application.” It lists ingredients and an abstract outcome instead of explaining the service. | Use a natural sentence that names the action and result, for example “Prepare a CV for the job you want to apply for.” Keep the next instruction practical. |
| 2 | The main in-content CTA follows a large headline, audience controls and several lines of copy. It was below the opening desktop viewport. Header “Get started free” remained visible, but is less specific. | Put a specific CV-check action immediately after a short explanation and make it visible in the opening view at common desktop heights. Keep one supporting example link. |
| 3 | The homepage's third audience is “Career-switchers”; the intake calls the same audience “Busy professional,” and guides use “Working professionals.” | Use “Working professionals” consistently. A professional with 5–10 years of experience looking for a similar role must see that they belong. |
| 4 | “Check my CV against a job” first opens target role/company fields. CV input is step two; the job description is step three. The first useful comparison is step four. | Start with CV and job description together, or a tightly connected two-part intake. Derive or defer role/employer where possible. Preserve source review, factual checks and approval without presenting them as more setup. |
| 5 | The same short fragment construction dominates the hero, section headings, check title, stage subtitles and footer. “Review,” “approve” and “fictional” recur throughout the homepage. | Rewrite headings as specific explanations, remove duplicated reassurance and keep each necessary limitation at the point where it helps the user act. Do not manufacture personal stories, customer proof or an informal persona to sound human. |

## Persona walkthroughs

These are expert walkthroughs using audience goals, not interviews or observed behaviour from real customers.

### University student or recent graduate

**Likely starting goal:** “I have a project/internship CV and a graduate job. Help me see what to improve.”

What helps:

- The example visibly labels academic work and an internship. It shows a job requirement next to actual CV wording, which is much more useful than an unexplained compatibility score.
- The first CV check does not ask for an account. Source input can be plain text, so an unfinished CV does not prevent starting.
- The CV step includes “No finished CV yet?” and a starter outline.

What gets in the way:

- The no-CV option appears only after the visitor has committed to a role step. A student who thinks “I don't have a CV yet” may leave earlier.
- The default student selection is an identity choice presented before the main action. It changes illustration/guidance, but is given enough prominence to look like required setup.
- Repeated warnings about ownership and qualification make the site sound cautious before the visitor has received help. The rules are useful, but the homepage does not need to repeat them around every illustration.

**Desired first-use behaviour:** show that a readable draft, project notes or existing CV is enough; let the student add it beside one job description; reveal detailed academic-context guidance where the evidence or editing needs it.

### MBA student or applicant preparing for recruiting

**Likely starting goal:** “I need to connect previous work and MBA experience to this role.”

What helps:

- MBA work and prior employment appear in the example, with the person's own contribution distinguished from team outcomes.
- The guidance acknowledges that recruiting and coursework compete for time.

What gets in the way:

- “Your post-MBA direction” and “Explore my Job Loop” imply a broader career-planning service before showing what the current tool will do for one application.
- The repeated persona cards lead to audience landing pages rather than directly advancing the concrete CV-check task. The homepage has already allowed the visitor to select that audience.
- “MBA students,” “MBA candidates,” and “MBA students & pivots” vary across surfaces. The immediate purpose should say “job applications” clearly enough that someone seeking MBA admissions support does not infer an unsupported admissions service.

**Desired first-use behaviour:** one application workflow with optional MBA guidance; a visible example of how prior work and a project are used for a specific role, followed by the same CV-plus-job intake.

### Busy professional with 5–10 years of experience

**Likely starting goal:** “I have an existing CV and little time. Help me prepare it for this opening without retyping my history.”

What helps:

- The Job Loop overview explicitly says an existing CV can be reused and a career history does not need to be typed into a new form.
- There is a real reuse path for another vacancy. The next employer's vacancy and approval are cleared instead of silently carrying over the previous approval.
- Private saving is optional after the first useful result.

What gets in the way:

- “Career-switchers” excludes advancement within the same profession. This is a positioning problem, not a minor label preference.
- The strongest time-saving explanation sits on the Job Loop overview rather than at the main entry point.
- Three input screens precede the evidence result. The user already has the job title and employer in the vacancy text, yet is asked to type them separately.
- On the first check screen the title, description, audience guidance, six-item rail and duplicated privacy copy take substantial space before the first task. “Continue to your CV” was below the observed opening viewport.

**Desired first-use behaviour:** lead with reuse of an existing CV, accept CV and job description immediately, then keep editing and approval focused on this application. Show private saving and recurring preparation after the value is clear.

### Product manager review

The current product is more credible than a generic “AI gets you hired” service: the input/output contract exists, sources remain visible, findings avoid claiming qualification and the candidate approves the document. Those strengths should be retained.

The activation path still has too many concepts. A visitor encounters the free check, Job Loop explainer, private Job Loop, audience landing pages, fictional pilot demo, walkthroughs, guides and an existing workspace. Several are useful supporting resources, but they should not all compete as next steps.

The task should have one consistent name and one obvious start. Describe “Job Loop” once in plain terms before using it as a product label. Public `/job-loop` explains the product; `/loop` opens the private workspace. Link text should make that distinction clear, especially where a sign-in boundary follows.

## Exact copy patterns to remove

Line numbers below refer to `39fb057`, even after the working copy changes.

| Source | Baseline wording | Why it weakens clarity | Better direction |
| --- | --- | --- | --- |
| `src/pages/ProductPage.tsx:126` | “Your CV. One vacancy. A clearer application.” | Three slogan fragments without a verb explaining the service. | Say what the user prepares for which job. |
| `src/pages/ProductPage.tsx:138` | “An application for your next chapter.” | Career metaphor adds little information. | Explain support for projects, prior work and existing CVs. |
| `src/pages/ProductPage.tsx:139` | “Explore my Job Loop” on all three audience cards | The same opaque label opens different audience pages and repeats an earlier audience choice. | Use direct task labels, or make these explanatory examples rather than another route decision. |
| `src/pages/ProductPage.tsx:142` | “Relevant experience. In clearer view.” | Another noun phrase followed by an abstract fragment. | Explain that the job requirements are compared with passages from the CV. |
| `src/pages/ProductPage.tsx:145` | “One real vacancy. Six clear steps.” / “Bring the source. Review the evidence. Approve what leaves your hands.” | Advertises the process length and repeats the compressed cadence. “Leaves your hands” is vague. | Explain how to add the two inputs and what the user receives. |
| `src/pages/ProductPage.tsx:147` | “One career record. Your Job Loop.” | Relies on a new product name to carry meaning. | Explain reuse: keep a reviewed career record for the next application. |
| `src/pages/ProductPage.tsx:148` | “Use an available manual run or opt into recurring source-based preparation” | Operational vocabulary interrupts a public explanation. | Describe what can be prepared and when; put availability detail in the workspace and access section. |
| `src/pages/ProductPage.tsx:152` | “Your working draft. Your choice to save.” | Repeats the same fragment formula and reassurance. | Explain plainly that the first check works without an account. |
| `src/pages/ProductPage.tsx:153` | “Explore a prewritten concept demonstration. Its role directions illustrate an example, rather than limits on who can use Jobvance.” | Internal-looking explanation of what a demo represents. | A short “See an example using fictional information” label is enough here. |
| `src/pages/ProductPage.tsx:154` | “Bring your experience. Make it clearer.” | Does not make the promised output any more concrete. | Return to preparing the CV for the specific job. |
| `src/pages/ProductPage.tsx:14` | “Start free. Keep your next move in view.” / “Your search. One connected workflow.” / “A few things worth knowing.” | The same generic cadence spreads into pricing, how-it-works and FAQ pages. | Use page titles that state the content: free pilot access; how the CV check works; common questions. |
| `src/pages/CvCheck.tsx:367` | “One vacancy. Your actual experience.” | The working tool repeats the marketing fragment rather than naming the task. | “Check your CV against the job description.” |
| `src/pages/CvCheck.tsx:385` | “Bring your experience into the picture.” / “The opportunity you want to prepare for.” / “Your final call. Your document to send.” | Decorative subtitles compete with direct field instructions. | Replace with the instruction needed for that stage, or remove them. |
| `src/components/layout/MvpHeader.tsx:34` | “Get started free” | Less specific than the destination, particularly when the hero action is below the fold. | Use the same task name as the main CTA. |
| `src/components/layout/MvpFooter.tsx:8` | “Your experience, clearly presented. Your next application, prepared with care.” | Polished but indistinct; contributes to the formulaic overall impression. | One plain sentence about what Jobvance helps the visitor do. |

Not every short label is a problem. Buttons, navigation and step names should remain brief. The problem is repeating compressed, interchangeable slogans where a sentence would explain the product.

## Visual and navigation baseline

Verified from the public desktop view:

- The palette is restrained, the typography hierarchy is consistent and the evidence card looks like a real product artifact. There is a strong base to improve.
- The large mixed sans/serif headline wraps into four lines in the observed opening viewport. The first action is pushed below the fold by the headline, audience control and introduction.
- The evidence preview is relevant, but its small type makes it supporting proof rather than a quick explanation at that size. The full card also extends below the opening view.
- The check screen has a clean card and step rail, but its introduction and guidance block duplicate material before the actual work. Removing that visual overhead would do more for first use than adding decoration.
- “Free CV check” in the header is clear. “Job Loop” needs explanation. Guides and help are useful secondary paths; the fictional pilot and audience routes should not compete with the main start.

Mobile interaction, keyboard navigation and authenticated workspace behaviour need their own functional checks. They are not implied by this desktop copy baseline.

## Mechanical style baseline and its limits

Skill: `marketing-skills:content-humanizer`, using its local `scripts/humanizer_scorer.py`. The skill's brand context was read from `.claude/product-marketing-context.md`: clear, practical, calm, human and precise. The user's preference for natural concrete language takes precedence over the skill's suggestions to inject fragments or contrived personal texture.

Capture time: `2026-10-14T04:33:04.942394+00:00`.

Corpus: the served homepage's `<main>` text, student default, approximately 969 whitespace-separated words. It includes headings, labels, buttons, the fictional example and visually hidden status text. It excludes navigation/footer and unselected audience text. HTML block boundaries are used for separation; these are not prose paragraphs. Spaces are inserted at text-node boundaries to prevent adjacent inline labels from merging.

| Script signal | Result |
| --- | --- |
| Total style heuristic | **84/100** |
| Listed vocabulary | 25/25; zero listed-word hits |
| Sentence-length variation | 10/20; mean 10.4 words, standard deviation 5.9 |
| Approximate passive voice | 20/20; one regex hit |
| Listed hedges | 15/15; zero hits |
| Em dashes | 10/10; one hit |
| Paragraph variety | 4/10; 122 extracted blocks, not 122 real prose paragraphs |

The script's label was “Mostly human — light edits needed.” That label is not adopted as the review's conclusion. The script does not judge whether the headline describes the product, whether a CTA is visible, whether an audience label excludes people or whether the same fragment construction sounds generic. Its passive-voice matching and sentence splitting are approximate. Homepage components make paragraph variation particularly unreliable.

The captured main text contains 13 `review*` forms, nine `approv*` forms, eight instances of “fictional” and five instances of “evidence.” These counts identify repetition for editorial review; none is intrinsically a flaw or a reason to remove necessary context.

Artifacts, intentionally ignored under `.tmp/design-refresh/`:

- `baseline-home.html`: captured served HTML.
- `baseline-home.txt`: exact text sent to the scorer.
- `baseline-home-humanizer.json`: result, timestamp, limits and hashes.
- `extract-baseline-copy.py`: capture/extraction and scorer invocation. It reuses the captured HTML once present and stops if the hero does not match the intended baseline.

Text SHA-256: `024dad4a621183421540842b3e1cc079ebcec1670f9e31f2326f65d8fc08fa97`.

Scorer SHA-256: `1de0686e3ca0565825a2a62fa8840a2e12eafdff942a7f02bfdae71d1c09cf47`.

This is **not an AI-detection percentage**. No genuine percentage of human authorship or model authorship can be obtained from this method. Any later run should retain the same scope and extraction method, and should be reported separately from usability findings. A clearer rewrite can receive a lower heuristic score.

## What a later independent recheck should establish

Use a separate reviewer who is not asked to reach a target score. Give them the refreshed experience and the three audience goals, then ask them to:

1. Explain what Jobvance does after seeing only the opening screen.
2. Find the action for a person who already has a CV and job description.
3. Identify the required inputs, result, account boundary and next action without reading a tutorial.
4. Try a student with no finished CV, an MBA recruiting application and an employed professional staying in the same field.
5. Record every unnecessary decision, repeated field, ambiguous label and point that makes the task feel longer.
6. Check that comparison, editing, source review, download approval and private saving remain understandable after shortening the journey.

Success is fewer unresolved problems and a clear completed task. It is not a 95+ score, “undetectable” writing or an expert claim that all users will find the product effortless.
