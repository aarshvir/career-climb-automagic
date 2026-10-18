# Job Loop subscriptions: provider acceptance and v45

18 October 2026. The owner's secure Live and Test credential handoffs are complete. The $29 Weekly, $59 Active and $99 Daily monthly Job Loop plans remain live, with Job Loop primary and CV Check separate. Public v45 deploys source `49002a0a610417e8daf14e7dfdfaa1aff714d3d2`; [the exact release receipt](../../releases/2026-10-18-loop-provider-acceptance.json) records the saved artifact, deployment, migration and native readback.

## Actual provider journey

These are genuine transactions against **Dodo Test Mode**, completed in its hosted checkout with fictional identities and its documented test cards. Actual signed notifications reached Jobvance and created the exact bound private financial records. No real money moved and no Test payment granted Live access.

| Plan | Observed provider and application result |
| --- | --- |
| Weekly, $29 | Initial payment, operator-accelerated successful renewal, two exact paid periods, cancellation through Jobvance and confirmed original-request retry. Paid-through access remained recorded. |
| Active, $59 | Initial payment, cancellation through Jobvance, full simulated refund and signed revocation of the exact paid period. |
| Daily, $99 | Initial payment; payment method changed in the real Test customer portal to Dodo's renewal-failure card; operator-accelerated renewal declined and the subscription moved to `on_hold`. No extra paid period was created. The initial payment was then refunded. Before cancellation, the hosted API rejected replacement checkout and direct reopening of the consumed checkout with actionable 409 responses. Cancellation still succeeded after access revocation; its exact retry was confirmed. |

The renewal clock was deliberately advanced by the operator. This is not a naturally elapsed month or proof of real-card issuer behavior. This provider configuration went to on-hold without an observed grace window; exact signed grace-deadline behavior retains its separate SQL/runtime regression evidence. Test email delivery was not verified. A Chrome profile rendered an empty provider card iframe; the same checkout completed in the desktop in-app browser. Chrome card acceptance remains an explicit browser limit.

## Defects found and corrected

The first unpaid Test checkout converted the advertised USD amount to AED despite hiding currency selection. Both monthly and one-time checkout requests now explicitly set `billing_currency: 'USD'`. Fresh provider checkouts retained exactly USD29/59/99, including the default UAE billing country before switching to the US. Foreign-currency payment validation was not weakened. The abandoned pre-fix checkout remains unpaid and retained as evidence.

Independent review also found that a refund could hide the cancellation control while the provider might still renew, and that a failed provider read before cancellation could leave an original request permanently stuck. [The safety review](REFUND-RENEWAL-SAFETY.md) documents the fixes, consumed-checkout rejection, atomic replacement guard and fresh-session read-only reconciliation. An unknown potentially sent cancellation write is never blindly repeated; unresolved provider outcomes can still require support.

The live webhook now subscribes to fifteen exact billing event types, adding only `payment.failed` to the existing fourteen. Its URL, signing secret and existing event selections were retained.

## Verification and cleanup

- Full suite: **2,858 tests in 155 files**. The final additional control-to-SQL case was subsequently run in the **28-case SQL suite**; it is not added to or attributed to the earlier full-suite count.
- Application TypeScript, four final Deno entrypoint checks, production build with 38 public pages, twelve hosting groups and five live HTML/three exact JavaScript assets passed. Only the observed appended Cloudflare challenge script was excluded from HTML comparisons. The changed billing component is in the verified entry asset.
- Twelve native PostgreSQL groups passed: the original eight and four additional refund/cancellation races, with distinct backend PIDs and observed blocking. The cluster stopped and no owned PostgreSQL process remained. Independent UI/runtime review passed 177 overlapping focused cases and reproduced recovery with exactly one cancellation PATCH.
- Migration `20261018091955_job_loop_refund_renewal_safety.sql` was applied as `20261018093128`. All six routine bodies match source; fixed search paths and no anonymous/authenticated execution were verified. Thirty-four uploaded files match native source exactly.
- The Test billing gate is **false**, the Dodo Test webhook is **disabled**, all four synthetic Auth sessions and the Test customer portal are signed out, and all three Test subscriptions have future renewal cancelled. Financial audit records and the original unpaid Live reservation are retained. Live checkout remains enabled/configured.

Private receipts retain the exact provider payment, subscription, cancellation and signed-event identities. Server API keys, webhook signing secrets and Supabase Auth tokens were not printed or committed. Saving environment configuration increments Supabase function versions without necessarily changing code; the release receipt distinguishes final native versions from functions actually re-uploaded.

## Remaining boundaries

Preserve saved v44 and tag `jobvance-before-billing-provider-acceptance-2026-10-18` at `7cc84d9`. Financial ledgers, confirmed cancellation evidence and the provider-state guard must remain during source rollback; source rollback is not a database or file restore.

This closes isolated provider payment/renewal/failure/refund/cancellation acceptance for the subscription integration. Real-card checkout, natural monthly operation, real email delivery and unassisted customer acceptance are not certified. Broader discovery, repeated-day product acceptance, the unchanged 100-persona forecast, remaining product requirements and the owner's revised-video/Meta approval gate stay open. Ads remain Off. No NPS uplift or commercial quality score is inferred.
