# Rounded local-currency Job Loop subscriptions

18 October 2026. Public **v46**, runtime source `1a92c4d0ae4bd4f56478cb536f93fb2b256dc9c3`, is live at [Jobvance](https://jobvance.io/pricing). [Exact release receipt](../../releases/2026-10-18-local-pricing.json).

The owner's local-price request is implemented for the primary Job Loop subscriptions. A browser locale with an explicit supported region suggests the billing country; the customer can change country and payment currency before purchase. Search locations remain independent. Nine currencies and 28 country choices are supported, with an honest USD option for other countries. No browser location permission, Google-name profession inference or guessed billing address is used. The selected country/currency survive the account return. Existing monthly subscriptions retain their original amount and currency. Optional one-time CV Check passes remain explicitly priced in USD.

| Monthly price | Weekly | Active | Daily |
| --- | ---: | ---: | ---: |
| USD | 29 | 59 | 99 |
| EUR | 25.99 | 51.99 | 87.99 |
| GBP | 21.99 | 43.99 | 73.99 |
| INR | 2,799 | 5,599 | 9,399 |
| AED | 109.99 | 219.99 | 359.99 |
| CAD | 40.99 | 83.99 | 139.99 |
| AUD | 41.99 | 84.99 | 139.99 |
| SGD | 36.99 | 74.99 | 129.99 |
| JPY | 4,599 | 9,299 | 15,599 |

The dated, fixed catalogue uses the published 16 October ECB rates and CBUAE AED/USD rate, then rounds to nearby familiar endings. INR and zero-decimal JPY use whole-unit 99 endings; other localized currencies use .99 endings. The already-approved USD29/59/99 base is unchanged. These are reviewed fixed prices, not floating conversion on every renewal. Native Dodo `by_currency` rules match the catalogue; account-wide Charm Pricing and purchasing-power rules were not enabled. Three Live and three Test products retain their original base, monthly interval, tax-inclusive setting and zero trial. The quote verifies the actual selected product rule and provider preview for both the first and recurring total.

## Price and payment authority

A fifteen-minute authenticated quote binds the original owner, actual auth session, lifecycle generation, plan, country, currency, exact minor-unit amount and catalogue revision. Fresh checkout requires an explicit renewal confirmation for that exact quote. Original ready/uncertain requests remain distinct from newer selections and preserve their identity through recovery. A potentially sent provider write is never blindly repeated. Old legitimate USD checkouts and historical outputs remain compatible; an older tab cannot reinterpret a non-USD subscription as USD. [Edge review](LOCALIZED-EDGE-REVIEW.md), [SQL review](LOCALIZED-SQL-REVIEW.md).

The actual INR provider run exposed a separate USD accounting representation on the Subscription API and a different net settlement amount on the Payment API. Neither is the customer's charged price. The additive immutable accounting observations now bind the exact original checkout, provider customer/subscription, actual local paid amount and service cycle; they cannot grant or extend access. No exchange or fee formula is guessed. Current or older accounting observations never substitute for original local currency/amount proof. Cancellation and proved refunds can stop or revoke owned work without granting time when the accounting representation has changed. [Correction](PROVIDER-ACCOUNTING-CORRECTION.md), [independent review](PROVIDER-ACCOUNTING-REVIEW.md).

## Verification

- **3,036 tests in 161 files**, application TypeScript and four source Deno entrypoints passed. The final production build prerendered 38 pages, and twelve hosting groups passed. The current hosting assertion was updated to the actual published copy and selected-country/currency sign-in return, preserving byte/header checks.
- **Twenty native PostgreSQL groups** passed on the integrated lifecycle/refund/local-price/accounting schema, including distinct-backend blocking observations. The cluster stopped with zero remaining owned PostgreSQL processes. Nineteen deployed routine bodies match local source, use fixed empty search paths, and deny anonymous/authenticated execution. Three new private tables have RLS and no direct client/service-role table access; approved routines provide service authority.
- Separate reviewers covered SQL, runtime and the real billing component. Final independent UI/runtime review passed **177 overlapping cases**. These and earlier focused counts are not added to the full-suite total. Initial full-run failures in stale USD fixtures and an exponent guard were corrected before the final passing run.
- All **27 Test and 27 Live non-purchasing quotes** matched their selected fixed initial and recurring price, using one representative billing country per currency. Five transient Test preview failures returned successful quotes on sequential retry before any checkout was issued; no rate-limit diagnosis is inferred.
- Actual isolated Dodo Test checkout charged **INR2799 Weekly** and **JPY15599 Daily**, with genuine signed notifications and exact local paid-period records. The operator accelerated one JPY renewal; it succeeded at JPY15599 and created its exact new period. Both owned subscriptions then confirmed cancellation while retaining paid-through access. A full refund of the JPY renewal revoked precisely that cycle and retained sticky subscription revocation. The initial JPY cycle remains in the audit ledger. The accelerated INR renewal was still **Processing** at its last provider readback, and no additional paid period was accepted. This is an explicit limit, not a successful-renewal claim.
- Actual production-component desktop and Chrome mobile checks used isolated auth/persistence/provider adapters. They observed local prices, fresh consent, remount/retry with one checkout creation and two link opens, current-subscription price preservation, and paid-through cancellation. Mobile viewport390x844/document375 had no horizontal overflow; its viewport was restored and its preview server stopped. These are not hosted authenticated card acceptance.
- The published domain returned five exact built HTML pages and three exact JavaScript assets. HTML comparison excluded only an observed appended Cloudflare challenge script. Actual live country selection displayed the GBP and zero-decimal JPY cards, and an India price screenshot is retained privately. All **46 uploaded files** across the four Live/Test handlers match native readback. Final versions billing18/webhook20/Test15/Test15 include a platform version increment from closing the Test gate; no unchanged control/worker/OAuth source was re-uploaded.

## Cleanup and remaining limits

Live billing remains configured in **live** mode and the Live Dodo webhook remains enabled. The isolated Test gate is false, the Test webhook is disabled, both new fixture renewals are cancelled, both fixture auth sessions are signed out, and native session count is zero. Financial records and the unresolved Processing INR attempt are retained. No real charge, paid AI/search call, customer-data mutation or candidate erasure occurred.

The two additive migrations were applied once as `20261018100527` and `20261018102654`; source hashes and function versions are in the release receipt. Preserve rollback tag `jobvance-before-local-pricing-2026-10-18` at `2408ac1` and saved v45. Do not drop quoted orders, paid-period monetary history or immutable accounting observations during a frontend rollback. Source rollback is not a database/file restore, and old billing handlers must not be restored alone against enabled localized merchant rules.

Real-card settlement, naturally elapsed monthly renewal, email delivery, every billing-country/tax profile and every browser remain uncertified. This release does not improve the recorded persona forecast or complete broader discovery, repeated-day/unassisted Job Loop acceptance, the revised presenter video, Meta attribution or other tracked requests. Ads remain Off until the exact revised creative is shown and explicitly approved.
