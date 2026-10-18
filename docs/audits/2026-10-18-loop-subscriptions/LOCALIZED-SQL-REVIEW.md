# Localized Job Loop price authority: SQL and cross-layer review

18 October 2026. The SQL implementer reviewed the separate edge implementation; the edge implementer independently reviewed the final SQL. This is bounded implementation and review evidence, not independent commercial acceptance.

The additive migration `20261018095409_job_loop_localized_price_quotes.sql` preserves existing USD records and legitimate USD checkout. New quotes bind the owner, actual authentication session, lifecycle generation, selected plan and exact immutable price revision. Checkout binds that quote; each paid period records its actual currency and minor units. A changed catalogue cannot reprice an existing subscription. Older APIs cannot reinterpret a quoted order as an unquoted USD purchase.

The catalogue contains 54 reviewed rows: three plans, nine currencies and separate Test/Live products. JPY uses exponent zero; the other eight currencies use exponent two. Quotes require exact provider-verified initial and recurring totals and expire after 15 minutes before first checkout. An existing original checkout retains its captured price during recovery. Original-request, capacity, cancellation, refund, ownership and generation protections remain enforced.

Cross-layer review found that the previous shared refund parser rejected an explicit non-USD refund currency. The edge implementer added Loop-specific parsing and comparison against the original provider payment, preserving the separate one-time USD parser. The integrated INR journey now exercises that correction, including original pricing after a current product-ID change and a 409 response for an older client requesting non-USD billing status.

Validation passed:

- **119 tests in three SQL files:** 52 lifecycle, 28 refund/cancellation safety and 39 localized-price cases. The localized file includes actual control/webhook orchestration through PGlite with isolated provider responses: quote, checkout, payment, renewal, cancellation and explicit-currency refund.
- **16 native PostgreSQL groups:** the previous eight lifecycle and four refund groups, plus four new localized groups. Distinct backend sessions and observed `pg_blocking_pids` prove quote retry serialization, one checkout-creation claim, conflicting-currency renewal rejection and permanent refund revocation. The cluster stopped; no PostgreSQL processes remained at readback.
- Targeted TypeScript for the new SQL test passed. The separate edge reviewer found no blocker across the final SQL authority boundaries.

The migration SHA-256 is `e219b605684eaec209f1cc8f50e7e5957138c1111fff341f6430608e20e7557c`. The sanitized native receipt is [localized-native.json](localized-native.json); it retains the executed schema, migration, harness and case hashes.

PGlite and native runs use isolated authentication/Storage fixtures. Provider responses in the integrated test are substitutes; raw signature verification belongs to separate handler tests. This evidence does not establish hosted localized checkout, real provider renewal/refund delivery, natural multi-month behavior or real-money settlement. No provider transaction, production migration, deployment or credential access was performed by this reviewer.
