# Saved-check → Job Loop entry review

Independent bounded review, 15 October 2026. Baseline: public v27. No runtime, Git, deployment, production-record or paid-provider changes by this reviewer.

## Entry and sign-in findings

No blocking finding in the reviewed entry/auth changes:

- `src/pages/CvCheck.tsx` creates the continuation link only for an approved saved snapshot belonging to the currently rendered owner. The reference is to that saved snapshot, not an unsaved CV currently being edited. Both the saved-list entry and save-success entry use the same guard.
- `src/lib/saved-check-continuation.ts` accepts only `/loop?fromCheck=<UUID>` with the exact query shape. Additional query fields, duplicate selectors, fragments, encoded IDs, email addresses, path traversal and external destinations are rejected. CV text, employer details, approval, consent and lifecycle authority are not placed in the URL.
- `src/lib/account-return.ts` extends the existing private-destination allowlist with that bounded selector. Google return retention remains a 30-minute, single-use tab-storage value containing a path and expiry, not a private CV copy. Email sign-in retains the same exact destination.
- Account-return storage deliberately has no ownership authority. Signing in as a different account can retain the selector, but the destination must freshly resolve it for that account and show unavailable if it is foreign/missing. A UUID selects a record; it does not authorize access.
- Entry wording says “Continue this saved check in Job Loop”, followed at save-success by an explicit choice/review explanation and “Nothing is imported or prepared automatically.” It does not advertise a combined Applications home, saved tracker linkage, scoped automatic preparation, or an application submission.

Independent test run: **4 files / 46 tests passed**:

- `src/__tests__/lib/saved-check-continuation.test.ts`
- `src/__tests__/lib/account-return.test.ts`
- `src/__tests__/auth/workspace-return.test.tsx`
- `src/__tests__/cv-check-source-save.test.tsx`

These checks cover canonical and rejected selectors, expiring single-use return, email/Google route continuation, and an owned saved link disappearing on owner change without save/tracker calls. They use fictional local fixtures. Hosted OAuth and real candidate records were not exercised.

## Destination review

Final runtime reviewed after the implementation agent's frozen signal: `src/pages/LoopSavedCheckImport.tsx`, its scoped CSS and the related `JobLoop.tsx` changes. **No remaining release blocker found within this entry, source-privacy and copy scope.**

- The chooser requires a fresh owned read and an approved, bounded snapshot. It defaults to final CV text and preserves that text exactly, including prior removals. Original-source selection is separate, warns about removed private details and requires a fresh explicit choice. No employer URL/location or recruiter information is invented.
- A mounted/current owner, confirmed auth authority and Loop lifecycle generation gate fetching, displaying and applying the selection. Owner changes, A → B → A, unresolved/failed auth, old delayed list results and fresh lifetimes are covered in the integration tests. A consumed selector is not silently replayed after a new lifetime.
- Copying changes local CV/vacancy drafts only. Existing/edited profile headers, including deliberate blank values, remain unchanged. A genuinely new untouched record may derive name/contact from the chosen CV, and the chooser says so. Existing target preferences remain; a blank target role can use the selected role as an editable starting point.
- Existing draft replacement binds the exact current fields; editing after confirmation invalidates that permission. Old vacancy link/location/recruiter fields are cleared, as disclosed. Dirty claim edits block replacement. Undo requires a new confirmation, retains no sharing/contact approvals and expires after saving, leaving or saved-record version changes.
- The action clears saving, output review/disclosure, recipient, model, inbox and Gmail permission controls. It creates no confirmed/shareable claim and calls no save/run/model API. The subsequent source review, private career save, fact review, vacancy link entry and opportunity save remain separate actions.
- `HelpCenter`'s `continue-saved-check` guide names the actual controls and describes those separate steps. The revised homepage and Job Loop overview promise reviewed reuse into drafts, not a complete shared Applications home, automatic tracker association, scoped worker run or application submission.

## Review findings corrected

1. The initial chooser sliced to the latest 50 records before resolving the exact incoming ID. A valid older link was falsely unavailable. It now finds that exact usable owned record before truncation and includes it alongside the latest 50; the regression uses more than 50 records.
2. The initial preview said profile headers stay unchanged, while empty values could be repopulated from the CV. Existing/edited blank headers are now preserved; copying for a genuinely new untouched record is expressly disclosed and tested.
3. The coordinator caught the direct signed-out Loop CTA dropping the selector. The actual CTA now carries the same strict destination and has a dedicated regression. No real sign-in was submitted for this review.
4. A separate reviewer identified undo wording that omitted invalidation by changed saved records; final copy states that boundary. This reviewer verified its agreement with the current runtime.

## Final verification and limitations

Final independent run: **6 files / 71 tests passed**, comprising the four entry/auth/source suites above plus:

- `src/__tests__/job-loop-saved-check-import.test.tsx` — 19 integration cases, including final/source choice, exact local copy, no writes, replacement/undo, blank-header privacy, old intent beyond 50, read failure, foreign owner, delayed account/authority results and lifecycle changes.
- `src/__tests__/help-center.test.tsx` — published guide controls and links.

The coordinator supplied a browser fixture rendering the actual chooser with a mocked list and no account/backend connection. This reviewer independently viewed `jobvance-repair-evidence/check-continuation-isolated-mobile-long-title.png`: 200-character title/company values wrap inside the narrow panel, and the select remains contained. The initial incorrectly captured `check-continuation-isolated-mobile.png` was excluded when it did not show the chooser; the coordinator corrected capture separately. The corrected long-title image is isolated component evidence, not a full authenticated mobile journey.

These are local synthetic checks and source review. They do not establish hosted OAuth, delivery of actual private saves, backend acceptance or conversion. Full-suite/build/publication and hosted verification belong to the coordinator. The shared Applications home, idempotent saved-check/tracker relationship and per-vacancy cloud composition remain separate work; this continuation is not represented as completing them.
