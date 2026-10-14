# Jobvance positioning and private message research

Prepared 14 October 2026. Jobvance.io is already public. This document proposes stronger copy and a bounded research plan; it does not change the live site, assert a new release, or report customer results.

## Recommended public message

**Strong recommendation on factual clarity; customer preference remains unmeasured.** Lead with repeat application preparation and the person’s existing experience. A single CV check is the first useful action; the reusable private career record explains why someone would return.

| Element | Recommended copy |
|---|---|
| Headline | **Stop rewriting your CV. Build every application from 1 career record.** |
| Supporting copy | Start with your actual CV and one vacancy. Read the source evidence, review the wording and approve your document. Save confirmed career facts privately when you want to reuse them for the next role. |
| Primary action | **Check my CV against a job** |
| Near the action | Free check and approved download. No account or card needed to start. |
| Reuse explanation | One private record. A reviewed document for each role. A dated next action. |
| Pilot offer | Free 10-person research pilot. No card or payments. |
| Pilot action | **Prepare my free pilot request** |
| Pilot action explanation | Prepare a draft, review it, then choose whether to send it yourself. Preparing a draft does not register you or reserve a place. |

“Stop rewriting” addresses repeated setup; it must stay beside the explanation that every new application still needs review. “1 career record” is a reusable set of confirmed facts, not a claim that one unreviewed CV can be sent to every employer. Retain the distinction between the free guest check and optional private saving. “Reviewed” means reviewed and approved by the user; do not imply an included professional or human CV-review service.

Alternative headlines to test against the recommendation:

- **Stop rebuilding your CV. Put 1 career record to work.** Shorter, but needs the supporting line to explain the output.
- **Change direction without starting over. Build 1 clear case.** More relevant to a career pivot, less explicit about the CV.

Alternative primary actions: **Prepare my first application** and **Check my CV for free**. The first may sound like Jobvance submits applications; test comprehension before using it. The recommended action names the actual first task and can lead to `/check`. The pilot action can lead to the existing draft-preparation section of `/pilot`; it must not imply a received request.

## Why the concepts differ

| Audience | Proposed private headline | Benefit to make concrete | Review boundary to retain |
|---|---|---|---|
| Students and graduates | Stop underselling your projects. Turn 1 CV into a clear case. | Show how projects, internships and activities relate to one graduate or internship vacancy. | Academic work remains academic; team work does not become individual ownership. |
| MBA students and alumni applying to jobs | Change direction without starting over. Build 1 clear case. | Connect prior employment and MBA projects to a new role direction. | Team support stays support; forecasts remain forecasts. This is not business-school admissions support. |
| Busy professionals with 5–10 years of experience | Stop rewriting your CV. Make 1 career record work harder. | Reuse confirmed facts and keep separate approved documents and next actions. | Remove restricted material before saving; review each document and submit it yourself. |

Each concept demonstrates the same supported journey: actual career source → vacancy requirements beside original evidence → user-reviewed and approved document → optional private reuse and user-reported tracking. Discovery may use available bounded employer sources, but these pages do not promise complete market coverage, connected mailboxes, autonomous applications or unlimited AI runs.

## Supported statements and remaining unknowns

Source for the product claims: `.claude/product-marketing-context.md`, `src/pages/ProductPage.tsx`, `src/pages/AudienceLanding.tsx`, `src/lib/job-loop-audiences.ts`, `docs/FREE-PILOT.md`, `docs/INTEGRATED-JOB-LOOP-CONTRACT.md`, and the final release checkpoint in `docs/product-hardening/BUILD-STATE.md`. These support workflow and availability statements. Test counts and synthetic audits are not customer testimonials or conversion evidence.

| Supported now | Not established by this work |
|---|---|
| Free guest CV-to-vacancy check with user-approved download. | How quickly real first-time users complete it. |
| Optional confirmed facts, private saving, separate packets and next actions. | How much repeated effort real users save or whether they return. |
| User review, final approval and user-controlled submission. | Interview uplift, hiring outcomes, recruiter preference or ATS-pass probability. |
| Free ten-person research pilot; payments disabled. | Seats remaining, enrolled counts, willingness to pay or future plan conversion. |
| Fictional walkthroughs can illustrate ownership and evidence decisions. | Customer satisfaction, usability ratings, testimonials or verified success stories. |
| Audience examples can change the first explanation. | Which audience is the best initial market or which message converts best. |

No invented customer results, ratings, testimonials, partner logos, urgency counters or hiring guarantees should enter public copy. The private concepts contain labelled fictional passages solely to demonstrate review choices. Do not turn those passages or their numbers into marketing proof. Keep any future speculative claims private and visibly labelled until supported.

## Private preview boundary

The three concepts and their index live only in the existing ignored `.sites-runtime/marketing-lab/` directory:

- `index.html`
- `students.html`
- `mba.html`
- `professionals.html`

They are absent from production source routes, public assets, sitemap and build inputs. Each has an internal-preview banner and `noindex,nofollow,noarchive`. The pages use only local resources and perform no network calls, storage, telemetry, submissions, payments or sending. Preview buttons only explain the next step locally. These controls supplement the private file location; `noindex` alone is not access control. No deployment is requested or performed by this work.

## Headline editing check

Ten candidates were scored with the copywriting skill’s bundled headline scorer before selection. This mechanical score rewards numeral use, length and trigger vocabulary. It is an editing aid, not a customer preference score or evidence that a headline will perform. Complete results remain in the ignored lab; the three leading examples below expose the actual dimensions rather than presenting a fabricated user rating.

| Candidate | Mechanical score | Power words | Emotion words | Numerals | Length | Specificity | Clarity |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Stop underselling your projects. Build a confident CV in 4 stages. | 74/100 | 45 | 50 | 100 | 100 | 68 | 100 |
| Stop rewriting your CV. Build every application from 1 career record. | 61/100 | 45 | 0 | 100 | 100 | 34 | 100 |
| Change direction without starting over. Build 1 clear case. | 61/100 | 45 | 0 | 100 | 100 | 34 | 100 |

Dimension weights: power words 25%, emotion words 15%, numerals 15%, length 20%, specificity 15%, clarity 10%. The first candidate is not the recommended public message: “confident” is less concrete than the source-to-document explanation, and the four stages group a longer product flow. The public recommendation and selected audience headlines all clear the skill’s 60-point editing floor, but that threshold does not establish usefulness. Test spelling out “one” against the numeral only if comprehension or readability gives a reason; do not optimise real copy to a heuristic score.

## Proposed formative study

**No participant recruitment or sessions have happened as part of this work.** Proposed sample: nine consenting participants, three per audience, within the existing ten-person pilot capacity. This is a small diagnostic study, not a statistically powered conversion experiment. Participation, availability and capacity must be confirmed before scheduling. No outreach or scheduling is authorised by this document.

Use a 20–30 minute moderated session with fictional materials first. Do not collect a real CV during message testing. Present the existing public wording and the relevant private concept in counterbalanced order; use five seconds for the first impression, then allow normal reading. Keep product, task, moderator wording and available help consistent. Record which version was seen first. Before interactive feedback appears, record the participant’s initial draft choice and explanation. The preview uses neutral Draft A / Draft B labels. Do not treat a corrected answer after feedback as an unassisted success. Avoid asking “Which design is better?” before checking comprehension.

| Task | What the participant does | Metric and observation |
|---|---|---|
| First impression | After five seconds, describe who it is for, what goes in and what comes out. | Code each of audience, CV + one vacancy, reviewable document and optional reuse as correct/partial/incorrect. Report counts and quotations with consent, not a composite satisfaction score. |
| Concept next action | Explain what the concept’s primary button will open, then find the fictional example. | Correct expectation that this private page opens a fictional local demonstration; time to find it and any account/card misconceptions. This is not a live-check conversion. |
| Live-product action, separate task | On the existing public product, find the action for checking one CV without an account. Explain the expected next screen before clicking. Use fictional data if continuing. | Unassisted correct first choice and account/card misconceptions. Do not compare this navigation time with the static concept task or interpret it as a copy-variant conversion test. |
| Student evidence | From the fictional project source, choose the supported CV wording and explain why the commercial claim is unsupported. | Correct supported choice plus accurate academic/team context, measured as a count out of three students. |
| MBA transfer | From the fictional MBA case, explain how it relates to the vacancy and which ownership/result claims remain unsupported. | Accurate transfer plus explicit academic/forecast distinction. Separately record any admissions-service misunderstanding. |
| Professional reuse | Explain how a second vacancy uses confirmed facts, what still needs review, what may be saved and who submits. | Correct identification of reuse, approval, optional saving and user submission. Record confidential-disclosure misunderstandings separately. |
| Free pilot action | Read the proposed pilot action and explain whether a request was received, a seat reserved or a payment required. | Correct explanation of draft-only preparation, no reserved seat and no payment. Treat any material misunderstanding as a copy defect to fix. |
| Behavioural follow-through | After both versions, choose one next task: inspect the example, do a fictional CV check, or stop. Ask why. | Chosen action, stated reason and actual task completion. A click or stated intention is not an application, customer conversion or hiring outcome. |

Descriptive decision rule: advance a message only when at least two of three participants in **each** audience independently identify the input and reviewed output, with no participant misunderstanding Jobvance as submitting an application, charging money or enrolling them through the preview. With three people per audience, one misunderstanding is a practical signal for revision, not an estimated population failure rate. Fix the relevant line and retest that exact misunderstanding with a new consenting person before recommending publication. If participants only repeat the headline but cannot explain the workflow, simplify the supporting copy before strengthening the claim.

For the actual product task after message comprehension, measure start-to-first-approved-download time, abandoned step, help requests, wrong turns and factual overstatements. Compare first and second applications for the **same person** using matched fictional vacancies; report raw per-person observations and completion conditions. Do not promise a percentage or hours saved before measuring a credible baseline and accounting for unsuccessful attempts.

## Future live message test, only after review

If sufficient consented traffic exists and the owner chooses a public experiment, change one major message at a time. Primary measure: approved-document downloads per eligible first-time visitor who saw that message. Record inputs-ready versus inputs-missing visitors so preparation readiness does not masquerade as copy performance. Secondary measures: check starts, evidence-review completion, sign-in chosen for saving, and second-vacancy completion. Guardrails: task abandonment, unsupported-claim approvals, privacy complaints and confusion about sending or payment. Define event semantics before adding instrumentation; none is installed by this document.

Choose traffic allocation, minimum meaningful improvement, baseline conversion, sample size and a stopping rule before launch. Those quantities are currently unknown, so no winner, uplift forecast or fixed “run for seven days” promise is justified. Low traffic should favour moderated task evidence. Publish only the supportable claim; keep untested stronger promises as private research questions.

## Review and publish gates

1. Confirm every capability and the ten-person free-pilot offer still match the released product.
2. Complete the small comprehension study and resolve material misunderstandings.
3. Review the selected copy with source evidence and exact CTA destination, including guest-first behaviour and the draft/sending distinction.
4. Obtain the owner’s publication decision for the concrete copy change. This document and its private HTML concepts do not publish anything.

Open questions: which audience values reuse most; whether “career record” is understood without explanation; whether a direct first check or the fictional example better supports initial comprehension; whether the pivot message is specific enough; and whether users can complete a second application with less effort. These are test questions, not reported findings.
