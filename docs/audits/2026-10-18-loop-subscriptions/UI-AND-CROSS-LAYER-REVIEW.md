# Job Loop monthly billing: candidate UI and cross-layer review

Date: 18 October 2026, Asia/Dubai. Scope: source implementation and isolated tests before root release validation. This is not a hosted merchant/payment sign-off.

## Delivered candidate behavior

- Job Loop monthly plans lead Pricing: Weekly $29, Active $59 and Daily $99 USD, with tax included, monthly automatic renewal and no default trial. One-time CV passes remain a separate supporting product.
- Signed-out plan selection returns through required account sign-in to the exact allowlisted Pricing plan. It never creates a checkout automatically.
- Signed-in purchase controls require a fresh authenticated billing read, actual configured availability and explicit exact monthly terms. Server-controlled prices and provider products are not accepted from the browser.
- Status distinguishes a recorded paid-period receipt from currently effective server entitlement. Future or noncontiguous paid receipts do not become a browser claim of continuous access. Test payments are labelled and do not purchase live access.
- A pending checkout is recovered from fresh server status using its original request ID; competing plan purchases are blocked. Unknown outcomes are never described as uncharged or successful.
- Cancellation is separate from pausing a Job Loop schedule. Exact subscription/version/generation and original cancellation request identity are checked; provider-confirmed cancellation is read back before displaying success. Uncertain cancellation survives navigation/refresh through session-bound server status, without restoring consent.
- Signed provider grace deadlines are displayed as temporary overdue-payment access only when the actual server entitlement is active. No grace period is invented by the UI.
- A payment buffered for capacity reconciliation is shown as received, with access pending and a support link. A second purchase is blocked.
- Job Loop Help & privacy includes subscription management; Pricing remains available for billing cancellation even without a career record.

## Ownership, consent and race review

The client checks verified SDK ownership before and after network work and observes the existing auth-session authority, including A-to-B-to-A and same-owner new-session changes. Async responses also require the original component epoch. Checkout URL origin must match its exact live/test mode; mixed request, plan and generation receipts are rejected.

An independent edge-agent review found two UI defects before release: checked consent could be rebound to a different subscription/generation after refresh, and an earlier slow refresh could overwrite a newer status. Both were fixed. Consent now has a synchronous owner/session/mode/generation/plan-or-subscription-version fingerprint, and every refresh revokes it. Refresh results have a monotonic request sequence. Targeted regressions cover changed subscription, changed generation and reversed refresh completion order.

No CV, payment secret or raw authentication token is written to local billing recovery storage. Recovery uses the authenticated server's original checkout and cancellation receipts.

## Separate backend review contributions

Cross-layer review identified and coordinated these corrections in the independently owned backend/SQL work:

1. A strict public projection now removes internal revision fields while exposing the agreed version, grace deadline and original cancellation request.
2. The public tax-inclusive promise is enforced by product/subscription validation; a tax-exclusive product is rejected.
3. Pending paid fulfillment is exposed honestly rather than appearing as an unconfirmed checkout alone.
4. Current effective subscriptions are preferred to historical terminal receipts, so delayed events for an old failed subscription cannot hide the current renewal/cancellation control.
5. Access display consumes the effective entitlement rather than inferring current coverage from the earliest/latest paid-period timestamps. Current SQL separately requires an applicable paid period for fresh run admission.

An earlier tentative observation that min/max periods alone granted backend access was withdrawn after checking the current SQL's applicable-period guard. It remains a meaningful distinction for UI copy, which was corrected.

## Verification

- 74 tests in five frontend/pricing/workspace files passed, including 42 dedicated billing boundary/UI cases. These include an actual controller-to-browser status projection test, stale auth results, exact checkout recovery, changed live/test mode, cancellation uncertainty, server grace, paid fulfillment holds and consent/race regressions.
- The UI agent separately ran all three new backend/controller/SQL PGlite test files: 83 tests passed. This is independent execution of another agent's backend work; it does not make this agent an independent reviewer of its own UI implementation.
- Application TypeScript passed after the controller import exposed and the edge agent corrected an ES2022-only Object.hasOwn use against the application's existing target.
- git diff --check passed.

No browser acceptance, real Dodo charge, natural monthly renewal, production cancellation, deployment, schema mutation or paid provider call was performed by this agent. Root owns combined native/browser/release verification and exact deployment receipts. Production launch still requires the secure live API/webhook connection and the necessary subscription API authority.
