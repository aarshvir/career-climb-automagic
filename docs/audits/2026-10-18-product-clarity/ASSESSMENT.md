# Contact, plan names and consistent Job Loop result counts

18 October 2026. Bounded corrections identified by the [48-hour product/payment reconciliation](../2026-10-18-chat-48h/product-evidence.md). Local validation is complete; publication is not claimed here. Job Loop remains the primary product. No backend, schema, payment, provider, media or advertising action accompanies this change.

## Corrections

- Contact now offers help for Job Loop, CV Check, accounts and billing without calling the live service a free pilot. Its private support receipt, consent, retention, status and no-promised-response behavior remain unchanged. No operating history or support SLA is invented.
- The subscription Terms use **Starter / Advanced / Pro Job Seeker**, matching the v48 pricing and current provider product names. The one/three/daily cadence, USD29/59/99 baseline, whole-currency catalogue, renewal/cancellation/refund terms and existing purchases are unchanged.
- Today’s three-stage overview and run-history badge use one ready-document count computed by the actual Job Loop page. It reuses the same v49 current packet-source and page-readiness checks as exact review. The overview no longer compares saved-variant packets with unrelated global profile/claim revisions. Pending/failed source reads, withdrawn/non-shareable facts, mismatched source authority, held/unrenderable packets and uncommitted career edits cannot produce a ready count. No extra asynchronous source checker, permission or file-access shortcut is added.

Three new real-`JobLoop` regressions cover a valid approved variant revision1/global revision2 packet with a distinct two-page variant preference, a deferred metadata read transitioning0→1 only after current authority resolves, and unsaved career edits transitioning1→0 while review/download are blocked. Existing withdrawn-fact and legacy global-profile tests now also verify overview/run-history consistency after a definitive settled authority decision. Legacy packets still require their global profile and claims; no variant reads are introduced for them.

## Validation and review

- **60 tests in five files** passed in the final focused run: actual variant review, dashboard continuity, onboarding, support and audience/pricing. The variant file contains17 cases, including the three new count regressions.
- **137 related tests in six files** passed separately: existing journey, audience/pricing, pass pricing, subscription UI, variant preparation and support boundary. Audience/pricing overlaps the preceding run; the counts must not be added as unique coverage. A first extra unsaved-edit regression used the wrong existing field label and failed before interaction; changing the selector to the actual My name field fixed the test without a runtime change.
- Application TypeScript and `git diff --check` passed. No new full-suite pass is claimed; v49’s3,095-case full suite remains historical evidence.
- Complete production stages passed: Vite,38 public prerenders,20 guides,58 structured-data hashes and zero external prerender requests. The initial official build command failed at the recurring OneDrive symbolic-link guard. An actual139-entry inspection (134 files/five directories) using dirent, `lstat` and `readlink` found zero links. The **unchanged** host packager then passed:132 assets,8,596,546 worker bytes and **2,909,128 compressed bytes**, below3,145,728. All12 hosting groups passed. No guard was bypassed or weakened.
- An independently assigned reviewer inspected the final source and ran50 overlapping focused cases, finding no blocker in this bounded patch. The additional final regression changed only tests. Separate remaining journey concerns are retained below; no commercial or usability certification is inferred.

## Scope and retained work

The first two overview stages and next-action selection still use global career/fact readiness. A candidate relying only on independent saved-variant facts can therefore still be prompted to review global facts even when a valid output exists. This pre-existing journey issue is retained for coherent follow-up; this change only makes ready-document reporting agree with existing exact review authority. No complete onboarding simplification, discovery expansion, natural repeated-day operation, hosted authenticated customer task or NPS uplift is claimed.

Conditional legacy signed-in pilot/capacity wording and immutable walkthrough narration remain separate copy work. Do not erase real capacity/budget limits or quietly rewrite published media provenance. Larger discovery, grouped review, pagination, reminders, templates, full-route recovery and all other retained requirements remain open.

## Rollback

Annotated tag `jobvance-before-product-clarity-2026-10-18` at `3433eac63daa443f9c20ccbd144df942b4c755b1` was pushed before source changes. Public v49 is retained as saved version `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_400f0d9784a881919747f0fb60bf1f3e`, runtime `3f0ed1ca9b99cecaf78235527935d9ada72ad84a`. This is source rollback, not database/file/merchant restoration. No commit, publication or live byte readback is claimed by this local assessment.
