# Jobvance MBA recruiting audit — 11 October 2026

**Simulated expert persona; not real customer evidence.** Current-product assessment, read-only. I would use the free check for a careful review of one application; I would not yet rely on Jobvance as my primary MBA recruiting system. **Weighted overall: 62.0/100.**

## Scope and evidence

**LIVE, high confidence:** I inspected [the homepage](https://jobvance.io/), changed its in-memory audience selection to MBA, read the [MBA check entry screen](https://jobvance.io/check?audience=mba), [privacy](https://jobvance.io/privacy), [pricing](https://jobvance.io/pricing) and [guided pilot](https://jobvance.io/pilot). At 390 × 844, I inspected the homepage and expanded mobile navigation, then restored the viewport. The homepage was readable, the persona controls stacked sensibly, and navigation exposed the expected destinations.

The browser already had a signed-in session. I did not open saved records, the protected workspace or loop, and did not enter a CV, create an account, save product data, run preparation, connect mail, send, apply or pay. A saved-check heading appeared automatically on the check page; its contents were excluded from this assessment. Full authenticated behavior, output files, latency, keyboard-only completion and screen-reader usability are **Not verified**.

**SOURCE, high confidence about implementation; medium about current deployment equivalence:** Source root is `the repository root`, inspected HEAD `2d1ad90356a7c952740dde2c9bf02ab5880a1414`. References below are relative to that root and include original one-based lines. `src/App.tsx:1` reexports `MvpApp`; active routes are `src/MvpApp.tsx:61`. Cloud capabilities are assessed against `docs/CLOUD-JOB-LOOP-RELEASE-STATUS.md:20`, `:30`, `:32` and `:34`: rules preparation is available; paid models/search/mail remain disabled; runs are user-triggered and no daily schedule is configured. Release checks support engineering claims, not customer satisfaction or recruiting outcomes.

## MBA scenario

**INFERENCE, medium confidence:** Consider a fictional final-year MBA student with three years of operations/analytical employment, a summer internship, an MBA market-entry project and a student-club leadership example. An internship business case has projected savings; a prior employer’s customer-level figures are confidential. The student needs one-page CVs, a shortlist across two directions, deadline awareness and preparation for recruiter conversations.

Two real vacancy types establish the contrast. [McKinsey Associate, job 15178](https://www.mckinsey.com/careers/search-jobs/jobs/associate-15178) describes workstream ownership, research, analysis, interviews and client work; it typically seeks an advanced graduate degree or equivalent experience, with country/practice variation. [Amazon Senior Financial Analyst, AWS Supply Chain Finance, job 10480421](https://www.amazon.jobs/en/jobs/10480421/senior-financial-analyst-aws-supply-chain-finance) asks for finance modeling, forecasting and senior-management communication, plus field-specific experience and advanced SQL; MBA is preferred. **LIVE external official pages, high confidence:** both pages were retrievable today. Their existence is not confirmation that this persona is eligible or that a particular office has an open seat. No application was made.

The consulting version should foreground analytical problem solving and accurately bounded ownership. The finance version should foreground actual modeling and financial decision support. MBA coursework cannot substitute silently for required professional experience; projected savings must remain projected.

## Scorecard

Scores reflect this persona and enabled product. Anchors: 0 absent/broken, 50 usable with major friction, 75 strong with material gaps, 90+ exceptional and supported.

| Dimension | Weight | Score | Evidence basis |
|---|---:|---:|---|
| Audience need / positioning | 10% | 78 | LIVE MBA guidance; SOURCE breadth |
| Onboarding / time to value | 15% | 67 | LIVE clear entry; SOURCE manual record setup |
| CV–vacancy evidence / output | 15% | 64 | SOURCE grounded checks; one-page/export limitations |
| UI / interaction design | 10% | 80 | LIVE public desktop; private forms SOURCE |
| Complete job loop | 15% | 56 | SOURCE enabled manual preparation; external lanes off |
| Live vacancy discovery | 10% | 10 | SOURCE disabled search; manual import available |
| Tracking | 5% | 58 | SOURCE statuses and follow-up date |
| Trust / privacy / control | 10% | 82 | LIVE clear disclosures; SOURCE approvals |
| Mobile / accessibility | 5% | 76 | LIVE homepage/mobile menu; full workflow Not verified |
| Repeat use / commercial readiness | 5% | 45 | LIVE free beta/planned pricing; SOURCE limits |
| **Weighted overall** | **100%** | **62.0** | Sum of score × weight |

## Current strengths

**LIVE, high confidence:** MBA-specific guidance is practical: bring previous work and projects, distinguish classroom from employer work, explain individual contribution. The homepage’s fictional MBA example distinguishes supported market research from project-management ownership. Its explicit fictional labels and rejection of outcome guarantees help set credible expectations.

**SOURCE, high confidence:** Evidence findings show vacancy passages beside exact CV quotes and line references, expose comparison terms, and retain material requiring manual review (`src/pages/CvCheck.tsx:39`, `:68`; `src/lib/cv-evidence.ts:345`). The check recognizes supporting versus leading, incomplete credentials and duration uncertainty. This is helpful protection against overstating MBA projects.

**LIVE + SOURCE, high confidence:** Guest checks keep content local and optional saving is explicit. The cloud claim model separates internships, academic projects and employment, and measured/projected/unmeasured results (`src/pages/JobLoop.tsx:18`, `:73`). Claims require both factual confirmation and sharing permission. Source revisions invalidate approval; missing contacts hold outreach while allowing portal preparation. These controls make confidentiality and accuracy part of the workflow.

**SOURCE, medium confidence about experience:** Reusable career facts, per-role packets, actual rendered page counts, evidence reports and user-reported tracking can form a useful preparation backbone. This is substantially more concrete than the pilot demo, which correctly identifies itself as prewritten and fictional.

## Nine current gaps and acceptance criteria

### 1. Search is presented as a loop stage while real discovery is unavailable — P1

**LIVE + SOURCE; high confidence.** The homepage lists “Search & shortlist,” followed by a setup caveat. The release status explicitly says model/search/mail capabilities are unavailable (`src/pages/ProductPage.tsx:77`; release status `:20`, `:34`). A student must discover both real vacancies elsewhere and copy their text. The public caveat does not state the current disabled status prominently before entering the loop.

**Acceptance:** Show an explicit current capability summary before sign-in: user-added vacancies available, external discovery unavailable. Once enabled, return permitted employer-source links, checked timestamps and closure uncertainty; demonstrate two relevant real roles without inventing availability.

### 2. Prioritization lacks MBA direction and eligibility decisions — P1

**SOURCE; high confidence.** Role scoring pools all target-title words, evidence is phrase overlap, and constraints add location and a simple experience check (`supabase/functions/_shared/job-loop-engine.ts:200`). Preparation prioritizes manual vacancies, then saved status, then score, capped at five (`supabase/functions/_shared/job-loop-runtime.ts:12`). The opportunities screen is a sequence of records, without a comparison table (`src/pages/JobLoop.tsx:277`).

**Acceptance:** Let the student compare consulting and finance separately, set their own priority and record explicit blockers: degree timing, required field experience, location, languages and work authorization where stated. Show why each role deserves effort; unresolved eligibility must remain visible and never become a hiring probability.

### 3. One-page readiness needs a practical editing workflow — P1

**SOURCE; high confidence.** The free check exports plain text paragraphs; PDF automatically adds pages (`src/lib/document-export.ts:39`, `:81`). It has no page preference or rendered preview. The loop offers one/two pages and holds excess pages, but directs users back to claims and rebuilding (`src/pages/JobLoop.tsx:38`, `:269`, `:281`). Correctly blocking overflow is useful, but it does not help choose what to shorten.

**Acceptance:** Show a rendered preview and page count before approval. Offer user-controlled bullet inclusion, compact formatting and a clear excess-content indicator. Preserve chronology and required contexts. A representative MBA CV must produce a readable one-page PDF with no silently dropped facts.

### 4. Current tailoring is too narrow for project-heavy CVs — P2

**SOURCE; high confidence.** The public check reorders only bounded bullet blocks inside recognized experience sections (`src/lib/cv-evidence.ts:363`); “Projects” is classified as other (`:199`). Workspace tailoring reorders keyword-matching bullets rather than improving a recruiting narrative (`supabase/functions/_shared/core.ts:48`). A new truthful example is appended under “ADDITIONAL EXPERIENCE” (`src/pages/CvCheck.tsx:167`).

**Acceptance:** Preserve explicit academic/internship labels when adding evidence, and support safe prioritization within these sections. Show which factual wording changed versus reordered. For the two directions, demonstrate a meaningful evidence emphasis while retaining team contribution, dates and projected outcomes.

### 5. Moving into repeat use imposes a second setup burden — P2

**SOURCE + INFERENCE; medium-high confidence.** Free checks, workspace packs and the loop have separate storage/actions. The loop can copy an owned CV’s text but then requires profile saving and individually reviewed claims (`src/pages/JobLoop.tsx:271`, `:273`; ClaimEditor `:69`). The existing public check’s approved evidence is not shown as a direct reviewed-claim import.

**Acceptance:** Provide a clear “reuse this reviewed record” handoff with a payload preview and explicit consent. Prepopulate source context without auto-confirming facts. Show the minimum steps needed for a first packet, and measure completion with consenting MBA testers; target effort must be validated, not asserted.

### 6. Recruiting deadlines are not first-class tracking data — P1

**SOURCE; high confidence.** Opportunity records store status, follow-up date and notes, but no application deadline, interview time or preparation milestone (`supabase/functions/_shared/job-loop-types.ts:40`). The UI’s date is labeled follow-up (`src/pages/JobLoop.tsx:83`). The homepage says deadlines and follow-ups stay together; daily scheduling is not configured.

**Acceptance:** Separate application deadline, follow-up and interview dates with timezone and source/unknown status. Provide an imminent-deadline view and exportable reminder. A student must see which of two roles requires action first without interpreting notes or manually opening every record.

### 7. Recruiter preparation stops at document/message drafts — P2

**SOURCE; high confidence.** Outputs contain CV, evidence, letter and contact drafts (`src/pages/JobLoop.tsx:281`, `:282`). Rules letters use a generic introduction and up to two facts (`supabase/functions/_shared/job-loop-engine.ts:265`). No recruiter-call brief or behavioral-story review appears in the active loop.

**Acceptance:** Create an optional source-backed preparation brief: why this direction, two defensible contribution stories, questions about unresolved requirements and prompts about forecast versus realized results. Label gaps plainly. Keep case/technical practice separate from claims of interview readiness.

### 8. Confidentiality controls lack complete retention/erasure clarity — P1

**LIVE + SOURCE; high confidence.** Privacy explains that deleting an original CV does not remove separately saved packs and account erasure requires support. Approved documents are retained after pack expiry (`src/pages/ProductPage.tsx:160`, `:164`). Discreet search is explicitly a review reminder, not guaranteed confidentiality (`job-loop-engine.ts:273`).

**Acceptance:** Publish retention periods and a clear inventory of career source, claims, packets and run records. Provide a reviewed export/erasure request path and scope explanation, including already downloaded files. Before saving, make the boundary between local content, private stored content and externally cleared wording easy to inspect.

### 9. Commercial packaging does not explain loop entitlement — P2

**LIVE + SOURCE; high confidence.** Pricing describes free checks, one free workspace pack, and a planned $29 pass for ten packs, with payment disabled. The homepage advertises a free loop; the release specifies three runs/day and five packets/run (`docs/CLOUD-JOB-LOOP-RELEASE-STATUS.md:28`). Pricing does not reconcile these different units.

**Acceptance:** Put free-check, workspace-pack and loop limits in one plain-language comparison. Explain whether future paid access buys saved preparation, discovery or another benefit. Validate willingness to pay after users complete representative tasks, before presenting commercial demand as established.

## Three priority improvements

1. **Make the current recruiting scope explicit and actionable.** Publish enabled capabilities; add application deadlines and a user-prioritized two-direction shortlist.
2. **Deliver a defensible one-page MBA packet.** Add rendered preview, safe academic/internship prioritization and user-selected shortening while preserving factual/source controls.
3. **Connect preparation to repeat recruiting.** Reuse reviewed evidence with consent, add a recruiter-call brief and clarify retention plus loop entitlement.

## Use and payment hypotheses

**INFERENCE, medium confidence:** I would try the free local check before sending a sensitive CV and return when its questions uncover a real omission. I would still use employer sites, my career office and a separate recruiting calendar. The reusable loop becomes attractive if it saves repeated evidence review without weakening disclosure control.

**INFERENCE, low confidence:** The planned $29/30-day price might be acceptable during an intensive recruiting window if it yields consistently readable one-page outputs, deadline clarity and materially different consulting/finance packets. Basic keyword reordering alone is unlikely to justify it against a free check. Human review may be valuable, but the pilot requires mutual agreement and pricing explicitly excludes included practitioner review. These are testable hypotheses, not willingness-to-pay findings. Use consenting MBA participants to measure task completion, useful edits, return behavior and purchase intent; no customer satisfaction evidence was collected here.
