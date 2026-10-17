# Independent onboarding review — working source, 17 October 2026

Scope: read-only review of `LoopOnboarding.tsx`, the optional `stillAuthorized` hook in `job-loop-api.ts`, and the continuation into the real `JobLoop.tsx`. This is a separate agent context from the onboarding implementer. Findings were sent to root and the account/quiz agent before any corrections. This report is the observed review state, not final sign-off.

## Findings sent for correction

1. **The saved quiz did not lead into the next real task.** Its `/loop` link included `onboardingSaved` state, but the destination did not consume that state. A new account had a saved profile, no confirmed facts and no CV variant, yet arrived on Today. Recurring AI still required separately creating a variant and confirming its facts. The proposed correction was an owner/generation-bound continuation into fact review with an explicit progression to the variant and schedule. No implicit fact confirmation or schedule activation is appropriate.
2. **Contact details were omitted from the quiz.** It collected a name and CV text but always left `contactLine` blank. Contact details present in the uploaded text did not automatically become the reviewed output header. Add an optional visible contact field; extraction must remain reviewable.
3. **Experience was always unknown to discovery.** The quiz never collected `experienceYears`. A short optional explicit answer would let the existing stated-minimum guard work without inventing years from a CV or audience label.
4. **Long-form answers were lost on refresh/navigation.** The page warned about this honestly, but a mobile user building a CV could still lose all answers before the final save. The prior variant editor has separate optional device recovery; this new quiz did not inherit it. Recovery must preserve owner/session/lifecycle boundaries and must not restore private-save or AI permission.
5. **The requested complete onboarding scope was not yet present.** The six-screen flow did not collect work rights, notice period, industry preferences or cadence, and did not activate first discovery. Those fields should only be promised when their backend use is implemented. A saved profile is a meaningful step, not a completed recurring search.
6. **A remaining product label contradicted the new direction.** The dashboard heading still contained `YOUR JOB LOOP · FREE PILOT`. This was reported to the implementer for removal.

## Authority review

The optional API callback is checked before and after SDK owner awaits and after the function response, supplementing server owner/generation validation. The quiz captures its original authority and draft epoch, clears consent synchronously on edits, and does not adopt a newer record version after an ambiguous save. Passive opening uses `get_existing`; initialization occurs only after deliberate private-save consent. Existing profiles are routed back rather than overwritten. No additional ownership or approval bypass was identified in this bounded source review.

## Focused verification at review time

`loop-onboarding`, `job-loop-api`, and `account-return`: **83 passed, one failed**. The failure was the historical expectation that `/check` is not an auth return destination. `/check` is now deliberately account-gated, so the allowlist extension is correct; the test needs the new expected return while retaining invalid-route rejection. This was sent to the implementer. This report does not claim their later corrections have been verified.

## Fixed 100-persona preparation

`persona-capability-matrix.json` preserves and hashes the original `personas.json` and `AGENT_BRIEF.md`. It is a capability inventory, not the requested completed PMF simulation. It records 53 mobile visitors, 18 with no proper CV, and six institutional/coach personas with different administration requirements.

The existing live source readback stores only two public listing examples per board. Two personas have a partial title/location witness in that deliberately small sample; 98 have no established witness there. **This is not a 2% matching rate or evidence that 98 people have no jobs.** Broader discovery measurement and their actual target preferences are missing. Original residence is only a labelled country probe, never assumed work authorisation.

No NPS, trial conversion or fourteen-day customer outcome has been filled in. New deployed pages and account-to-recurring-task observations are required as ground truth. The original historical NPS −88 remains historical and has not been altered.

## Correction readback and subsequent forecast

A later independent source readback confirms the quiz handoff now checks the same owner, auth authority and lifecycle generation against the loaded snapshot before opening My CV & experience. Route state remains a navigation hint, not proof of completion. Persistent next-step buttons return the candidate to fact review, saved variants and schedule choice, and recheck authority before deferred scrolling. The quiz now offers reviewed contact and explicit experience fields; the dashboard heading is YOUR JOB LOOP. No additional authority regression was identified in these corrections. This is source readback, not hosted or unassisted completion evidence. Pre-save quiz recovery and industry/work-right filters remain open.

After root supplied updated integration ground truth, the same P051–P100 personas were assessed independently in `../2026-10-17-deep-tailor-account/persona-review-2.jsonl`, with a separate method and immutable-input hash receipt. These are low-confidence individual forecasts (medium confidence for the explicit institutional feature mismatch), not survey responses, purchases or observed multi-day use. The forecasts assume the corrected handoff and removal of the old pilot heading. They do not reuse the superseded handoff defect as a current penalty.
