# Whole-unit prices and separate provider products

18 October 2026. Public **v47**, runtime `d10200418c4a8cb64f60c8b13e33d59f970b96af`, is live at [Jobvance pricing](https://jobvance.io/pricing). [Exact release receipt](../../releases/2026-10-18-whole-pricing.json). This supersedes v46's fractional prices for new Job Loop purchases. Original subscriptions and ready checkout requests retain their agreed monetary snapshots.

| Currency | Weekly | Active | Daily |
| --- | ---: | ---: | ---: |
| USD | 29 | 59 | 99 |
| EUR | 26 | 52 | 88 |
| GBP | 22 | 44 | 74 |
| INR | 2,999 | 5,999 | 8,999 |
| AED | 109 | 219 | 359 |
| CAD | 41 | 84 | 139 |
| AUD | 42 | 85 | 139 |
| SGD | 37 | 75 | 129 |
| JPY | 4,999 | 8,999 | 15,999 |

All new totals are whole currency units, derived from the same retained dated FX inputs with familiar whole-unit endings. INR and JPY end in999; the existing USD29/59/99 base remains. An exact integer-rational regression verifies every catalogue amount without floating FX. Formatting continues to show historical fractional amounts accurately. It does not truncate a prior agreed charge to fit the new direction. One-time CV Check passes remain explicitly USD.

## Provider behavior found during verification

The coordinator created an unpaid, isolated Test EUR87.99 Daily checkout. Changing a localized rule in Dodo's modal first stages it in the product form; the toast alone does not establish persistence. The preliminary cached-price observation was premature. Once the final Update Product was saved, reloading the old checkout changed it to EUR88.00. This was caught before any original Live product was edited or card/payment step was used. The old Test product was restored to its exact v1 rules; its checkout returned to EUR87.99.

The release therefore uses **six new provider products**, one per mode/plan. Old products and their final original rules are retained. New active catalogue v3 rows bind these exact new IDs; v1 and intermediate v2 price/quote history remain immutable and inactive for new issuance. Dodo's native Copy to Live Mode copied base product settings but did not copy localized rules. All24 new Live currency rules were explicitly added, final product forms saved, and provider reads/previews verified. The [provider documentation](https://docs.dodopayments.com/features/localized-pricing) describes localized price management and future-checkout behavior; the actual old-session observation, rather than an assumed cache contract, determined this implementation.

Do not edit a product's monetary rules after any owned quote/session has bound it. A subsequent catalogue change must create fresh provider products and preserve previous ones. The database catalogue prevents reuse of an old provider ID in this v3 publication. Operational provider versioning complements original order/payment authority; an external merchant dashboard edit is not prevented by an application validator.

The source review also found and repaired a legacy unquoted USD recovery seam: the original owner-scoped order product now reaches the exact session/generation/plan SQL claim before a ready URL is returned. Ready and uncertain originals do not reread provider pricing or repeat checkout creation after current product mapping changes. A fresh purchase uses the new configured product. Quoted historical requests already had the original-product binding. [Edge rotation review](IMMUTABLE-PRODUCT-VERSION-EDGE-REVIEW.md), [SQL review](VERSIONED-PRODUCTS-SQL-REVIEW.md).

## Final verification

- **3,081 tests in163 files**, application TypeScript, four final source Deno entry checks, 38-page production output and twelve hosting groups passed. A fresh full suite followed the legacy recovery correction and catalogue-v3 switch. Independent review separately reran213 overlapping cases in six files. Actual SQL coverage totals179 cases in six files, including v1/v2 historical requests and v3 admission. No broader unchanged native PostgreSQL race rerun is claimed for the two data-only activation migrations.
- Both new migrations were applied once: whole prices as `20261018110804`, then versioned products as `20261018112251`. Native readback shows54 active whole-unit v3 prices on six new IDs, retaining54 v1 and54 v2 rows inactive. No routine, table, RLS or ACL definition changed. All46 uploaded files match final native source exactly. Final function versions billing23/webhook25/Test20/Test20 include the environment version increment from closing the Test gate.
- All **27 Test and27 Live non-purchasing quotes** verified the exact original and recurring provider totals, with one representative billing country per currency. The final v1 ready retry returned the same original session and EUR8799 minor-unit snapshot after quote expiry and product-map rotation. A fresh browser reload of that same provider checkout still displayed EUR87.99 after v3 activation. New Daily EUR quotes returned EUR8800 against the new product. No new card entry, subscription, payment, renewal, refund or paid model/search call was made in this correction.
- Five live HTML pages and three current JavaScript assets match the final build. Only the observed appended Cloudflare challenge script was excluded from HTML comparison. Actual live India cards display INR2999/5999/8999 without fractional prices. The earlier isolated mobile evidence belongs to v46; no new hosted mobile/card acceptance is inferred.
- The OneDrive output guard initially reported a symbolic link during packaging. A separate actual134-file/five-directory dirent/lstat check found zero symlinks. The unchanged packager then completed and all hosting checks passed. No symlink or security guard was removed or bypassed.

The temporary Test gate is false again, the Test webhook remains disabled, and the one new fixture Auth session is signed out with native zero remaining. Its unpaid financial checkout record remains for audit; no Test subscription was created. Fresh authenticated status confirms Live payments configured in live mode. The original Live webhook and its15-event subscription were untouched.

Preserve source rollback tag `jobvance-before-whole-pricing-2026-10-18` at `fe0b49f` and saved v46. Retain every quote/order/paid period/accounting observation and all old provider products during a source rollback. Current frontend, handlers, catalogue and provider mappings require coordinated compatibility; an old billing handler or old price page alone is not a database/file/merchant restore.

This is whole-unit monetary and product-version acceptance, not a new real-card, natural-month, all-country/browser or NPS certificate. V46's original paid Test evidence retains its scope and unresolved INR Processing limitation. Other discovery, product acceptance, revised creative, correct-brand Meta/attribution and all tracked requests remain open. Ads remain Off pending explicit approval of the exact revised final asset.
