# Saved-check continuation — 15 October 2026

**Published as v28 on Jobvance.io at 14 October22:23UTC /15 October02:23Dubai.** This is a bounded JV-03 continuation slice, not the shared application home or automatic preparation.

## Customer task

After saving a CV check, continue with that exact saved CV and vacancy in Job Loop without pasting both again. The destination shows a review before copying anything. Default to the approved final text, so details deliberately removed during review are not silently restored from the original source. Choosing the original source remains explicit.

Opening the link carries an opaque record selector only. It does not save a career record, import confirmed facts, approve an output, start a run or submit an application. Existing private-saving and processing choices remain separate. Existing profile/contact preferences must not be overwritten silently; replacing local work requires an informed choice and a scoped undo.

## Architectural boundary

[Applications-home design and identified blockers](audits/2026-10-15-application-home/architecture.md). The existing Loop get operation can open a new lifecycle. A passive combined Applications home must first gain a non-activating read operation. A list that calls get for every account, three shortcut links or title/company-based record merging would not satisfy the intended home. Saved-check/tracker relationships also need actual idempotent links. None is claimed complete here.

## Implementation review

Root owns typed opaque selector, sign-in return allowlist, saved-check entry and help/copy. A separately assigned agent implements the owner/generation-bound preview and local import. A third independent context reviews privacy, replacement, auth and lifecycle behavior. All fixtures are created local examples; no real candidate is changed and no paid call is used.

## Validation and limits

- All **1,290 tests in 89 files** pass, with TypeScript and all 12 hosting groups. The first full run exposed one stale homepage copy assertion; it was updated to assert the implemented explicit reuse wording, then the full suite passed. No production runtime was changed to satisfy an old limitation assertion.
- Nineteen new real-JobLoop component regressions cover preview/final/source, explicit replacement and undo, edited/blank header preservation, exact selection beyond the latest 50, missing/foreign/failed reads, owner A→B→A, delayed responses, unknown authentication and fresh lifecycle invalidation. Root also adds strict-selector, actual auth-route and saved-entry regressions.
- [Independent architecture/security review](audits/2026-10-15-application-home/saved-check-independent-review.md): 117 focused passes, no remaining material blocker. [Independent entry/copy review](audits/2026-10-15-application-home/entry-review.md): 71 focused passes. These overlap the full suite; they are not additional customers or unique full-suite tests.
- Local actual application browser: signed-out /loop with a strict created check selector arrives at the matching allowlisted sign-in URL. No sign-in was submitted. The new help anchor is readable in the actual page.
- Isolated browser fixture uses the actual chooser with a mocked created-check list and callback, no account/server authority. At a 390px viewport, final CV is selected, original text requires a separate checkbox, replacement is explicit, and choosing final copies the exact reviewed text without the removed line. A 200-character title and company wrap without horizontal document overflow (document 375px; select 303px). Correct viewport captures are retained privately as check-continuation-isolated-mobile.png and check-continuation-isolated-mobile-long-title.png. An initial full-page capture was invalid and was replaced; it is not evidence.
- Build prerenders 38 public pages/20 guides without external requests. Compressed Worker 2,768,975 bytes, below the existing limit.

Actual hosted authenticated import/save, fresh signup/OAuth, unassisted first/second applications and other-browser/mobile file delivery are not newly certified. V27 desktop guest export receipts remain prior evidence. Import adds no save/run/model request, but intentionally opening the existing Loop workspace retains its existing record-initializing GET; this is why it is not used as a passive combined home. The source record and separate vacancy must still be saved explicitly. Shared application identity, idempotent tracker linkage and scoped preparation remain open.

## Publication receipt

[Exact release receipt](releases/2026-10-15-check-continuation.json) and [83/83 live HTTP byte/header checks](releases/2026-10-15-check-continuation-live-check.json).

- Source: `31f56678cdcdb3eb63fb6a3af358154c8f2dfc85`, pushed to GitHub and the Site source repository.
- Saved version: `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_77a3a87c5584819197bb57b9a00ff062`.
- Successful deployment: `appgdep_6ad000c4e80c81919a02dd9ae701b457`.
- Archive SHA256: `6aa4e7bf3773050af85c602d82fd09c11f8c15be014e721f362c6db22204dca6`; all130 archive members reviewed, no source/private documentation/environment files; Worker bytes match the tested build.
- Actual Jobvance.io guest browser retained the exact created UUID selector through the sign-in redirect and rendered the new help topic. No sign-in or private record mutation was performed.

No backend migration or handler release. Control14/worker11/OAuth5 remain the prior deployed versions. Last collection-gate configuration readback was v26; no new enablement or readback is claimed.

## Rollback and operation

Tag jobvance-before-check-continuation-2026-10-15 preserves documentation/source HEAD 6bb6ca6d3c4ea9a337c79b02fae7186d1978a545. Saved v27 is appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_4bd56e97682c819197f5eb2567f1d650, runtime source 5bf52c4e5b749d80822b5973cc85b2adeea985c7. Keep existing backend generation/path fences and budgets; source rollback is not database/file restore. No backend deployment, collection activation, checkout, purchase, outreach or employer submission is part of this slice.
