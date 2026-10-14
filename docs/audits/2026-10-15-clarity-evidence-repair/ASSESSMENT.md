# Independent assessment and Claude reconciliation

15 October 2026, Asia/Dubai. Baseline: live v26, runtime 637539cd16f5d70bfbdbffe0eec2fa59064eb335; documentation HEAD 9498b07b964f4c1a0dc160674ec544c7cd5f7144. Owner asked to independently assess Jobvance, read Claude’s review brief and build the highest-value improvements.

## Evidence and independence

The coordinator read the local Claude brief, main report, messaging, SEO and implementation handoff, inspected current source and freshly inspected the live public home and pricing screens. Separate reviewers independently checked the evidence algorithm, public/legacy offer, and authentication return paths, then implemented/tested bounded repairs. This is expert/code/browser assessment, not interviews or 400 real customer sessions. Reviewers had access to Claude’s claims to test; this is not a blinded new scoring exercise.

Claude’s original files remain unmodified in ../opus-customer-journey-review. Their reported model is Opus 5.5; that is the report’s own provenance, not a model call made by this task. They include private founder context, so the directory is locally excluded from automated Git packaging. Sanitized findings are recorded here. No source personal anecdotes or private account screenshots are republished.

Claude’s historical assessment is about 45/100 across 400 synthetic scenarios, 9 reported browser journeys and 0 real participants. Earlier 65/100 used a different rubric and evidence on v25. Neither is a current post-repair customer grade. No numerical uplift is claimed here.

## Confirmed findings

| Finding | Independent evidence | Response |
|---|---|---|
| Homepage promises rewriting while the check compares/reorders wording | Source plus current live page heading and interaction | Replace promise with actual CV/job comparison, editing and reviewed download |
| An example choice silently determines customer type | Three live home CTAs link to /check?audience=student by default; source uses example.checkPath | All home starts stay /check; examples only change illustration; remove redundant audience setup cards |
| Free product advertises unavailable/contradictory offers | Live pricing: proposed 15/29 monthly, disabled checkout; Workspace source:29 once/ten packs | One current free offer, no purchase control, retain existing access and free-check fallback |
| Tracker bookmark loses destination during sign-in | Real App route plus local email/callback regressions | Fixed allowlist of workspace tabs carried through existing return machinery |
| Contact line can appear as capability evidence | Current code plus Claude’s created fixture reproduction | Exclude contact-only lines; retain actual mixed work passages |
| Heading and phrase handling skew the comparison/ranking | Current fixture reproduces14requirements,0direct,6partial,2missing,6review and weak-match reordering | Narrow heading/normalization/ranking repair; no attempt to force direct counts |
| /check initial HTML explains almost nothing before auth/client resolution | Existing SSR calls session-pending component | Shared visible optional explainer for both initial HTML and interactive check |
| Free check and Job Loop remain separate systems | Current source and navigation | Disclose current setup; shared application/carryover remains priority, not marked solved |

## What is incorporated, corrected or deferred from Claude

**Incorporated now:** neutral entry, current free offer, removal of unavailable legacy purchases, functional zero-access exit, account-tab continuation, verified evidence correctness, useful public /check explanation.

**Corrected:** do not publish proposed 1/5 daily limits; the server does not implement them. Do not infer a per-user quota from the shared US$50 ceiling. Do not advertise one-minute rewritten CVs, automatic role extraction, seamless application carryover or an unlimited paid plan. Historical legal/competitor assertions are not independently reverified in this release and are not adopted into public copy.

**Technical cautions:** source-line references plus keyword/entity checks cannot prove semantic faithfulness of generated wording. Future tailoring needs adversarial handling of attribution, negation, chronology, scope and numeric relationships. Failed/uncertain provider calls cannot automatically release budget without evidence. Approval must bind both relevant text and the exact reviewed artifact/settings; text-only hashes are not automatically sufficient for PDF approval. Missing llms.txt alone is not proof of poor assistant discovery. None of these proposals warrants changing established safeguards by copy/paste.

**Not adopted as an implicit scope change:** Claude’s presenter-free video recommendation does not cancel the owner’s bottom-right natural-presenter requirement. Preserve existing licensed media and assess future continuous recording quality after the workflow stabilizes. No media purchase/render this turn.

## Five coherent next work packages

1. **One application and dependable continuation:** consented free-check carryover, explicit vacancy, existing-record adapters and one visible application home. First and second applications must not require repeated CV entry. Preserve separate storage/processing consent and all current records.
2. **Useful source-bound preparation:** test source-linked wording proposals with guarded attribution/numbers/conditions, per-application editing and deterministic budget limits. Retain local free check. Do not introduce an anonymous paid endpoint before abuse/privacy/cost gates.
3. **Lower-effort review and finish:** grouped role/project facts, focused unresolved questions, direct prepare-this-vacancy action, clear actual preview and approval, openable document acceptance. Preserve meaningful consent and export independence.
4. **Clear offer and proof:** current release handles confirmed misleading entry/pricing; after preparation improves, show substantial actual before/after outputs and update relevant guides/video. Same workflow for student/MBA/professional contexts.
5. **Real acceptance and operations:** isolated hosted auth/storage/restore verification, support replies and task metrics, then five consenting novice first/second tasks within existing pilot capacity. Broader SEO/acquisition follows proven tasks; no ranking promise or ads.

This sequence reconciles with JV-01/03/04/05/06/11/13/15/19; all 19 broader packages remain partial/open. B9/full B8 stay deferred. Model parity, original inbox/discovery/receipt-ledger parity and presenter quality remain tracked.

## Verification boundaries

Local browser initially used default Vite mode without the production public configuration, resulting in the protected session-recovery screen. Restarting with existing production-mode public settings restored the guest check. No auth boundary was weakened. This was a local preview configuration issue, not claimed as a production regression.

Local/hosted results are appended in the release note. No real candidate mutation, provider/search billable call, payment, outreach, email or employer application is part of this release. Source rollback is distinct from database/file restoration; backend remains unchanged.
