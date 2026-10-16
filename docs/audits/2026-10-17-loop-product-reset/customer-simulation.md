# Job Loop customer simulation and repeated-application acceptance

Date: 17 October 2026. Base release: v31 / `4f261359c8ed29c03705a44fdd1188be13956c30`. This report concerns the working-tree changes under review, including the new guided CV builder. It does not describe a new deployment.

## What was executed

`supabase/tests/job-loop-product-acceptance.test.ts` ran **112 tests successfully**:

- 100 deterministic scenarios using actual profile validation, factual packet composition and, where the packet is usable, real PDF/DOCX/TXT rendering and parsing.
- 10 additional no-existing-CV cases using the new guided `buildLoopCvText` helper followed by the actual Loop profile validator.
- One connected first/second selected-worker acceptance test: actual worker phases, exact vacancy identity, generated artifacts, real control-layer approval/download checks, and parsed exports for both applications. A repeat of the first vacancy reuses the original packet without another upload.
- One connected discovery-worker acceptance test: an intercepted Greenhouse HTTP response contains a Dubai match and a London mismatch; the real worker filters the response, persists the match through a local repository adapter, renders the CV and retains the unchanged packet on the next run. Unavailable LinkedIn and broad-search lanes remain explicitly incomplete.

The JSON runner receipt is `acceptance-verification.json`. Per-scenario observations are in `customer-simulation.json`. Reproduce with:

```powershell
$env:LOOP_SIMULATION_REPORT='1'
node node_modules/vitest/vitest.mjs run supabase/tests/job-loop-product-acceptance.test.ts --reporter=json --outputFile=docs/audits/2026-10-17-loop-product-reset/acceptance-verification.json
```

These are **100 synthetic scenarios, not 100 people or 100 full customer sessions**. No model judges assigned scores. The cases use ten career contexts crossed with ten explicit conditions, not a representative sample from a customer population. The assertions are bounded behavior checks; passing all of them does not establish perfection, desirability, conversion or usability.

## Scenario coverage and observed outcomes

Career contexts: first-role student, MBA operations candidate, early-career engineer, experienced manager, career switcher, career returner, international graduate, contractor, senior specialist and first-time volunteer. Their factual context, evidence kind, target title and experience differ. The matrix shares a compact reporting example to make exact-source preservation reproducible; it does not claim broad occupational-content realism.

Conditions: ready profile, remote target, unknown advertised pay, discreet search, unconfirmed fact, private fact, no existing CV, missing target title, Chinese-script name and projected result.

| Outcome | Cases | Meaning |
|---|---:|---|
| Review-ready | 50 | A source-backed packet awaits approval. Actual PDF and DOCX bytes were parsed and TXT was compared exactly. |
| Protected hold | 20 | Unconfirmed or private evidence was withheld; it was not turned into a usable factual CV. |
| No-CV baseline blocked | 10 | Sending an empty source directly to the current profile contract is rejected. This remains a correct low-level safeguard. |
| Missing-target gap | 10 | The server profile validator accepts an empty target-title list. A role-based discovery query cannot be formed; an explicitly selected manual vacancy may reasonably still be prepared. The gap concerns broad-search admission and guidance. |
| PDF limitation | 10 | Chinese-script names are retained in parsed DOCX and exact TXT. The embedded PDF font lacks those glyphs, so PDF fails explicitly without substituting characters. |

The separate ten builder cases now show a first-CV path: explicit answers are assembled into a source accepted by profile validation, preserving the supplied words. This is a deterministic builder, not an AI interview or automatic fact approval. It does not make the ten original empty-source attempts succeed, and the baseline observations have not been rewritten to conceal that distinction.

## Connected worker/export evidence

The selected preparation test drains the real `processLoopPhase` function for a first saved vacancy and then a different second vacancy. Each gets its own opportunity ID, run ID, packet ID and input hash. Both produce actual PDF, DOCX and TXT bytes. The test checks:

1. Preparation starts with unapproved `review_required` packets.
2. Download is rejected before approval.
3. Approval without the separate disclosure confirmation is rejected.
4. An edited review text cannot approve the original artifact through the local SQL adapter.
5. The real control function accepts exact text with both confirmations.
6. Each download refers to that packet's artifact path; SHA-256 matches the bytes.
7. PDF/DOCX extraction retains candidate identity and literal evidence, and excludes vacancy-only requirement text. TXT is exactly the packet text.
8. Repeating the first selection leaves both approved packets intact, reuses the first packet and performs no new upload or paid reservation.

The automatic discovery test starts with no saved vacancies. Its network adapter returns a synthetic employer response to the real employer-reader code; no employer site is contacted. The candidate's Dubai target excludes the London listing. On the next run the same source is reread and the existing packet is reused. This establishes local discovery/targeting/render composition, not production feed coverage or a scheduled wake-up.

## What is substituted

- Authentication, database records, atomic SQL approval, leases, object storage and signed URLs use in-memory adapters. Native SQL concurrency evidence from earlier reports remains separate; this test is not a replacement for it.
- Processing uses the actual rules path, with paid reservations configured to throw. No AI/provider call, hosted function, real candidate record or employer application is used.
- Parsing files created by the renderer proves readable content in the tested formats. It does not by itself prove a browser download event or a complete visual document review.
- The guided builder tests call its actual helper. They do not claim ten people successfully completed its interface.

For browser verification, an opt-in `LOOP_BROWSER_FIXTURE=1` run writes the two actual worker packets and their bytes beneath ignored `.tmp/loop-product-browser`. The local browser adapter requires selection and fresh review/approval before serving those exact hash-checked bytes. Its visible banner states that clicking preparation replays previously generated worker artifacts. Browser observations must be recorded separately; this report does not invent them.

## Remaining acceptance gates

1. Observe the actual desktop and narrow-mobile Job Loop interface: first job and second job, source review, preview, separate approval, native download events and parsing of the received files. The local replay harness can check this UI/transfer segment, with its adapter limits stated.
2. Verify the hosted authenticated chain using a dedicated synthetic identity: save inputs, real admission/worker persistence, refresh/recovery, actual storage readback and exports. No real candidate fixture is appropriate.
3. Verify real scheduled dispatch with explicitly authorized synthetic inputs. A working manual run is not evidence that weekly, three-times-weekly or daily delivery occurred.
4. Verify configured discovery coverage and genuine model-assisted processing separately; this no-spend test cannot establish either paid integration.
5. Verify that the user's chosen plan/cadence and three CV variants are backed by real saved entitlements, scheduling and variant selection before selling or promising them.
6. Add clear target requirements at broad-search admission/guidance, while preserving legitimate manual selected-vacancy preparation without a general target list. Decide the intended behavior for unsupported PDF scripts. Existing fallback messages are honest, but the format limitation is still material for affected customers.
7. Observe first and second tasks with actual unassisted participants. Synthetic scenario counts and passing assertions cannot answer whether people understand the product without help.

No product score or post-fix uplift is assigned.
