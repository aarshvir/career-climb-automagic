# Whole-unit catalogue v2: SQL review

18 October 2026. The owner requested whole-unit prices for new purchases, including INR prices ending in 999. The additive migration `20261018105918_job_loop_whole_currency_prices.sql` retires v1 catalogue rows for new issuance and appends 54 v2 rows across the same three plans, nine currencies and Test/Live products. USD remains 29/59/99. No monetary authority routine, permission, quote, order, subscription, accounting observation or paid-period row is rewritten.

The migration preserves the previous catalogue provenance and records the owner-approved whole-unit policy. All new non-JPY amounts are whole major units expressed in integer minor units; JPY retains exponent zero. New INR prices are 2999/5999/8999. Product IDs and existing tax-inclusive behavior remain unchanged.

**Fifteen actual SQL tests passed**, plus targeted TypeScript. They cover all 54 v2 price selections and parity with the shared customer catalogue, retirement without mutation of v1 revision fields, original quote and ready-checkout recovery, existing paid access and exact old-price renewal/cancellation/refund, and rejection of an old v1 amount for a new v2 purchase. One case executes actual current control/webhook orchestration through SQL with isolated provider responses: v2 INR quote, pinned checkout, one-POST retry and exact new-price payment. Both previously applied monetary migrations retain their original hashes.

The earlier v1 SQL fixture now pins its historical catalogue values. Its cross-layer case starts with an already-created v1 checkout and verifies current-runtime recovery, payment, renewal, cancellation and refund without repricing. It does not pretend that current quote issuance should accept an inactive historical catalogue.

This change only appends catalogue data and changes active flags. It adds no locking or admission routine; unchanged native race suites were not rerun. These SQL fixtures do not prove provider rule changes, session-price retention, hosted checkout, payment delivery or deployment. Existing provider sessions must be checked separately when changing localized rules; a newly charged amount must never be accepted against an incompatible old quote.

Migration SHA-256: `c02fca8b884304464d4adf82d6220d415541137963b6f487805b213c46fb1c69`. No remote migration, provider write, deployment or commit was performed by this reviewer.
