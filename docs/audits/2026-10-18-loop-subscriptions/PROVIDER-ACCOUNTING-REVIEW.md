# Provider accounting representation and exact local payment authority

18 October 2026. The coordinator's Dodo Test run exposed a provider representation the earlier local-price fixtures did not cover: the customer invoice was INR 279900 minor units, while the subscription API reported USD 2947 and the payment reported USD 2834 net settlement. Those three values serve different purposes. No conversion formula or equality between them is assumed.

The new additive migration `20261018101948_job_loop_provider_accounting.sql` stores immutable per-payment accounting observations alongside the original quote and paid service period. It does not change entitlement, extend access, convert currency, replace the quoted customer amount or rewrite an earlier cycle. A later verified paid cycle can append a different accounting observation. Existing USD behavior remains separate.

The service-only bind checks the original order, quote, owner, provider subscription/customer, exact local invoice currency/amount and service-period bounds. Existing paid-period evidence must agree. An exact retry returns the original observation; a conflicting tuple fails. The original quoted amount remains the sole monetary amount eligible for the paid-period ledger. Accounting and settlement details stay out of public billing status.

The separate edge implementation verifies the original provider checkout/payment relationship before using these observations. Cancellation and a proved refund can stop or revoke an owned mandate when its current accounting representation has changed; neither can grant additional paid time. An already-anchored older payment can recover after an interruption even if current provider accounting advanced: only that exact older payment and period are accepted, with no new-cycle anchor or access created.

Validation passed:

- **155 tests in four actual-SQL files:** the previous 119 plus 36 accounting cases. Two accounting cases execute real shared control/webhook orchestration through PGlite with isolated provider responses: initial local payment, accounting revaluation, renewal, cancellation with an unknown later accounting value, old-payment refund, and interrupted older-payment recovery. The older cancellation-retry fixture was updated to supply the newly required original checkout/payment reads; its one-PATCH assertions remain.
- **20 native PostgreSQL groups:** the previous 16 plus four accounting groups. Separate backends and observed lock waits verify exact retry serialization, immutable conflict rejection, no access from accounting alone, and unchanged local paid proof through later revaluation/refund. The native cluster stopped; zero PostgreSQL processes remained at readback.
- Targeted TypeScript passed. The edge implementer independently reviewed the new SQL and reported no blocker. The SQL implementer separately reviewed the edge accounting paths and raised the older-payment recovery case covered above.

Migration SHA-256: `3dc4a02f4a1491283db4b3dd09bdb34797df04c4554e006071fadf49066b89d8`. The already-applied local-quote migration remains `e219b605684eaec209f1cc8f50e7e5957138c1111fff341f6430608e20e7557c`. Sanitized native evidence: [provider-accounting-native.json](provider-accounting-native.json).

An unanchored older positive payment whose provider accounting has already advanced remains held for reconciliation; no accounting conversion is guessed. Provider substitutes in these tests do not prove hosted reconciliation, genuine signed delivery, natural monthly operation or real-money settlement. The coordinator's provider receipt and deployment readback must establish those separate scopes. This reviewer made no provider transaction, deployment, production migration or credential access.
