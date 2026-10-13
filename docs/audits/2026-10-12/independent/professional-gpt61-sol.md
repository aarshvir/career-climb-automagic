# Independent customer review: employed professional

Jobvance scores **60.7/100** for an employed professional with 5–10 years of experience and little job-search time. It is a useful, careful free preparation aid. I have not seen enough evidence to treat it as a reliable service that runs an ongoing confidential search with little effort.

Review date: **12 October 2026, Asia/Dubai**. Source HEAD was verified as `2e134180a8cdbb248c5fa5dca01b1a1bf8b1fb69`. Public UI was inspected at [Jobvance](https://jobvance.io). Matching sampled wording does not prove the live deployment is that exact commit.

Reviewer provenance: configured **gpt-6.1-sol**, reasoning effort **high**, `fork_turns=none`, confirmed from the parent's actual spawn invocation. No separate provider model introspection is available. No prior audits, scores, improvement targets or parent conversation were read. Parent communication concerned task scope and provenance only.

## Scores

Each category has equal weight. Scores reflect current observed customer value, with qualified credit for inspected implementation; they do not presume private features operate in production.

| Category | Score | Assessment |
|---|---:|---|
| User need / value | 65 | Reusable career evidence addresses a real need; live benefit is mostly careful wording review. |
| Onboarding | 70 | Clear free check and no account/card requirement. Private loop requires a saved record, cleared facts and a vacancy before useful output. |
| UX / accessibility / mobile | 74 | Understandable labels, progress and mobile menu; long review pages and a blank embedded PDF preview add friction. |
| Evidence trust / document quality | 76 | Good attribution and contribution controls. Close tense variants needed review; exported layout and ATS readability were not verified. |
| Job coverage / relevance | 36 | Narrow source defaults, coarse role/location matching, and no inspected salary-floor enforcement. Actual live role yield unknown. |
| Automation / effort | 48 | CV re-entry was saved on the second check. Scheduled preparation exists in source but live completion and time saved are unverified. |
| Tracking / actionability | 62 | Source has dated follow-ups, reported status and activity; recipient research and submission remain manual. Reminder delivery was not established. |
| Reliability / recovery | 59 | Two guest journeys worked and navigation recovery preserved the draft. Private execution/failure recovery is source-only; refresh loses unsaved loop edits. |
| Privacy / control | 74 | Local check, optional storage and separate approval are strong. Discreet search is a reminder; account-wide erasure depends on support. |
| Willingness to pay | 43 | I would try the free check; I would not yet pay $29/month without suitable-role and repeat-effort evidence. |
| **Equal-weight mean** | **60.7** | **607 / 10** |

## What I actually observed

On the homepage, choosing **Career-switchers** changed the examples and the main CTA to `/loop?audience=professional`. Opening it reached sign-in with that intended destination retained. I stopped there: no account was created and no private feature was observed live.

I completed two account-free checks using an entirely fictional CV and vacancies. Nothing was saved to an account, no inbox was connected, no provider was paid, and no application or message was sent. No tools were installed and no product code or data was edited. Unit tests were neither run nor counted as customer evidence.

The first record was a fictional eight-year operations manager in Dubai. It included monthly Excel management reports, supporting a procurement pilot with **8% projected savings**, and stakeholder coordination. The first vacancy asked for leadership and measurable savings. The UI preserved the supporting contribution and explicitly asked the user to maintain that distinction. The projected result stayed projected. This is a meaningful trust benefit for a professional who cannot afford an inflated claim.

The first check reported **0 direct, 2 partial, 4 manual-review findings**. “Prepare monthly management reports using Excel” versus “Prepared monthly management reports using Excel” was marked partial. The title itself became a manual-review requirement. Salary of AED 30,000 monthly and the 30 October closing date remained under “the rest of the job description,” rather than useful extracted conditions. The full vacancy was available, so the information was not lost. It did require the user to find it again.

The first PDF preview reported **one page within the selected maximum**. The embedded preview appeared blank in the browser screenshot. I did not inspect downloaded bytes, PDF glyphs, DOCX layout or ATS parsing; document quality beyond text review and preview metadata therefore remains unverified. Two explicit confirmations enabled PDF, DOCX, TXT and evidence-report controls.

At **390 × 844**, the check remained readable and the mobile menu opened with labelled destinations. This was a narrow responsive observation, not full accessibility certification. I did not test keyboard-only use, a screen reader, color contrast or the authenticated loop on mobile.

After visiting pricing and privacy, returning restored the CV and vacancy, with approval and PDF preview cleared. That recovery worked. On the second application I changed the title/company and reused the source CV without pasting it again. The old vacancy remained in the field until I deliberately replaced it. There was no dedicated “new application” handoff in this observed route.

The second check reached approval too. It still required evidence review, wording review and both confirmations. DOCX/TXT/report controls became available; PDF remained disabled without a fresh preview. The second vacancy's **Salary not disclosed** line became a manual-review finding with language about adding a CV example, whereas work authorization was correctly identified as an employer condition. This inconsistency matters when the user has only a short evening window to work.

The live [pricing page](https://jobvance.io/pricing) describes a first-ten-account free pilot. **$15 Focus** and **$29 Job Loop** are proposed future tiers with unavailable checkout. These are not current paid entitlements. My willingness-to-pay score is a persona judgment, not measured market demand.

## What the inspected implementation supports

**First and second applications:** the private loop stores source text and separately confirmed/shareable claims. Rules output selects and orders complete literal facts, retaining context, rather than inventing achievements. Claim revisions and input fingerprints protect approval of stale packets. This should make facts reusable, but the confirmation setup and factual corrections can be substantial work. Actual private first/second-packet effort was not measured. See `src/pages/JobLoop.tsx:314`, `supabase/functions/_shared/job-loop-engine.ts:86` and `:242`, and `supabase/functions/_shared/job-loop-runtime.ts:145`.

**Role coverage and conditions:** default employer boards are Careem, GoCardless and Duolingo, with configuration limited to at most four feeds. Broad web search is conditional on service settings. Discovery matching uses title token overlap while omitting words such as senior and junior, and uses location text matching. Manually added jobs bypass discovery filtering. Compensation minimum/currency/period are collected, but the inspected assessment/selection does not compare salary to the floor: it always flags pay as not established. Unknown pay should remain unknown, but an explicit salary preference currently gives little filtering help. See `supabase/functions/_shared/job-loop-providers.ts:125`, `supabase/functions/_shared/job-loop-runtime.ts:14` and `:21`, `supabase/functions/_shared/job-loop-engine.ts:206`, and `src/pages/JobLoop.tsx:316`. Actual configured live sources and matching roles were not queried.

**Scheduling and handoff:** source implements weekdays/daily/weekly rules preparation, local time and timezone, explicit consent, next run, last attempt, pause/cancel and run history. This is promising for someone who wants to prepare outside working hours. Scheduler readiness and pilot capacity gate access. A schedule authorizes rules preparation, not external AI or inbox reading. Browser-closed execution and the return experience remain unverified. See `src/pages/JobLoopPanels.tsx:49` and `supabase/functions/_shared/job-loop-runtime.ts:82`.

**Follow-ups:** source has manual status, follow-up date and notes, due/upcoming action cards, actor/time activity and run-source lanes. Submission is correctly user-reported, rather than inferred from opening a link. I did not establish outbound reminder delivery or calendar handoff in the inspected paths. Optional recruitment inbox summaries require separate connection/configuration and run consent. See `src/pages/JobLoop.tsx:89`, `src/pages/JobLoopPanels.tsx:12` and `:30`.

**Confidentiality:** the discreet-search setting is explicitly a review reminder, not an automatic current-employer or contact block. Excluded terms prevent some discovery/output use, but I did not execute a comprehensive confidentiality test. The source separates private saving, claim shareability, optional provider consent, Gmail read/draft access and exact recipient/attachment confirmation. The returned mailbox screen even discloses that Google's draft permission also permits sending at the permission level, while Jobvance offers no send action. See `supabase/functions/_shared/job-loop-engine.ts:294` and `src/pages/JobLoop.tsx:297`.

**Recovery and deletion:** unsaved loop drafts use thirty-minute owner-scoped memory and reset factual/sharing confirmations on recovery; refresh clears them. Source includes idempotent run requests, saved progress, resume/cancel, visible partial/failure states and per-format document fallbacks. Erasing the loop leaves the sign-in account and separately saved workspace records; account-wide requests use a support receipt with no response-time promise. Those controls are not proof of live cloud reliability, data isolation or deletion completion. See `src/lib/loop-draft-memory.ts:11`, `src/pages/LoopSupport.tsx:18`, and `supabase/functions/_shared/job-loop-runtime.ts:119`.

## Time to first and second application

**No credible minutes figure was measured.** Both journeys reached approved download controls, not employer submission. Tool speed and a short fictional record do not establish human time savings for a full career history.

The first needed role/company, reviewed source text, pasted vacancy, evidence review, wording review, optional PDF preview and two confirmations. The second saved CV re-entry, while repeating the review sequence and requiring replacement of the prior vacancy. The benefit is real but narrower than an autonomous search. A separate employer form and any contact research still add work outside the app.

## Five actions with acceptance criteria

1. **Show actual coverage and enforce practical constraints.** Publicly expose configured sources, pilot capacity and last-checked outcomes before setup. Keep zero matches distinct from failures. Professional fixtures must preserve seniority, show salary meets/below/unknown with original quotes, and represent work mode/location and employer exclusions. Measure suitable fresh-role yield for agreed targets without implying hiring outcomes.
2. **Measure and reduce repeat-application effort.** Observe employed users with redacted records and report median active minutes for first and second approved packets separately from submission. Add a “new application” route that reuses facts, blanks prior company/vacancy and preserves the previous packet. Show changed inputs and job-specific gaps together, retaining exact review and consent. A second application must not silently reuse the previous vacancy.
3. **Prove schedule execution and return handoff.** A weekly timezone schedule must run with the browser closed and record completed, partial, blocked and failed attempts accurately. Returning must show the prepared packets and a clear next review action. Verify pause/cancel/capacity behavior. Offer separately consented completion/follow-up reminders or calendar handoff and test actual delivery; never submit or send automatically.
4. **Make confidential search enforceable.** Add explicit current-employer/domain/contact exclusions. Preview provider payload and final document/draft disclosure. Use synthetic employer secrets to verify all discovery, rules, AI, letter, report and draft paths. Show export/deletion scope and a verifiable account-wide deletion route or fulfillment evidence.
5. **Reduce evidence noise and verify document handoff.** Handle near-equivalent tense variants consistently without promoting support or projections. Put salary, work mode/location, experience and deadlines in a source-quoted conditions view. Make exact PDF inspection work on desktop and 390px mobile with an explained fallback. Verify exported PDF/DOCX/TXT text and readable two-page professional layouts before relying on export-quality claims.

## Gaps and inference

No live private snapshot, cloud preparation, scheduler execution, inbox consent, provider quality, failure/retry sequence, cross-account storage isolation, erasure completion, downloaded-document layout, professional effort study or hiring outcome was verified. No deployment identifier links the live build to the exact source commit. The initial browser attempt and web fetch timed out; a later browser attempt loaded and the guest flow worked, so I do not attribute those tool/network timeouts to a proven product outage.

My conclusions about long-record setup burden, weak professional-role yield and willingness to pay are explicitly **inferences/judgments** from the observations above. The product's honesty and control deserve credit. The claimed convenience still needs operational and user evidence. No job, interview or response is guaranteed.
