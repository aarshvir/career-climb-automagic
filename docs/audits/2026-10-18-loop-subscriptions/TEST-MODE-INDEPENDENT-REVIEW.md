# Independent review of isolated Dodo Test acceptance

18 October 2026. Separate review context from the Test entrypoint implementer. The reviewer previously implemented the subscription SQL; this review independently assessed the new Test adapter and entrypoints, not the reviewer's own SQL design.

The reviewed Test wiring is bounded and suitable for coordinator-controlled synthetic provider acceptance. No remaining blocker was found in the checked isolation boundary. This is a source and hermetic-test conclusion, not confirmation of hosted payment, renewal or cancellation success.

## Findings and corrections

The initial Test entry allowed any authenticated production user once its feature flag was enabled. The reviewer requested an explicit synthetic owner scope before SQL/provider mutation. The final adapter requires 1–10 unique valid owner UUIDs. Empty, malformed, duplicated or excessive lists disable the entire Test configuration.

The final authenticated entry checks the verified owner against this scope before orchestration. The webhook verifies the exact raw body using the separate Test signing secret. For payment/subscription messages, Loop ownership metadata is scoped before orchestration and the provider-read subscription owner is checked again. A refund's metadata is not payment ownership: the entry always retrieves the original payment from the Test provider, derives its original owner and caches the bounded read.

## Evidence checked

- The adapter reads only `JOBVANCE_LOOP_TEST_*` and `DODO_TEST_*`. An independent test getter throws on any attempt to consult a Live configuration name. Missing Test credentials, products, explicit origin or enable flag cannot fall back to Live.
- Mode and API origin are forced to Test; visibly Live API key prefixes and Live checkout response URLs are rejected. Caller mode/owner overrides remain invalid.
- The existing authenticated user and actual JWT session ID enter the unchanged SQL intent contracts. Current-session, lifecycle-generation and original request checks remain authoritative.
- A Test signing key is required; the Live signing key is not accepted. Provider requests remain on the Test API host.
- Persisted order/event/subscription operations explicitly use `mode='test'`. Existing SQL does not grant Live paid access from Test records. The Test status response removes effective Live entitlement instead of presenting it as a Test grant.
- The shared orchestration still uses durable request claims. An ambiguous checkout does not repeat its POST; ambiguous cancellation reconciles through reads and the original request rather than blindly repeating PATCH.
- No frontend purchase action calls these endpoints. They are optional acceptance infrastructure and can be disabled after the controlled journey.

The reviewer reran **123 tests in five files**: `loop-billing-test-isolation.test.ts`, `loop-billing-test-isolation-review.test.ts`, `loop-billing-handlers.test.ts`, `loop-billing.test.ts`, and `job-loop-subscription-lifecycle-sql.test.ts`. All passed. Fourteen tests were added independently for configuration isolation and negative scope boundaries. Targeted TypeScript for that independent test file passed, and `git diff --check` was clean.

Provider HTTP, auth and SQL are hermetic substitutes in the entrypoint tests. The separate lifecycle file uses actual integrated PostgreSQL SQL through PGlite. These results do not establish that hosted Test keys, products, signature delivery, issuer behavior, or a real provider renewal are configured correctly.

## Reviewed source hashes

| File | SHA-256 |
|---|---|
| `supabase/functions/_shared/loop-billing-test-config.ts` | `1155dbf1b66909b7512c67a4d899e699ccd1b700dacb23596abe3da3c4cca19e` |
| `supabase/functions/job-loop-billing-test/index.ts` | `4d61bc880fc01a2b984f0a59b4e963094ccf3552c2b2151749e5a74c7e66dc5d` |
| `supabase/functions/dodo-webhook-test/index.ts` | `5732a071392ffd76f4e8908ed6071d394fa85df7469478816ebd5c8a86912fb9` |

## Provider acceptance options and limits

The official [subscription integration guide](https://docs.dodopayments.com/developer-resources/subscription-integration-guide) explicitly selects `test_mode`; the SDK otherwise defaults to Live. It documents cancellation through `cancel_at_next_billing_date` and paid service periods on succeeded payments. The official [TypeScript SDK subscription update contract](https://github.com/dodopayments/dodopayments-typescript/blob/main/src/resources/subscriptions.ts) exposes `next_billing_date`, making an operator-controlled Test-only date adjustment a candidate for accelerated renewal acceptance. No separate provider test-clock facility was established by this review. The official [Dodo example application](https://github.com/dodopayments/chat-ai) documents supported test-card checkout values.

A changed billing date or dashboard sample event does not prove renewal. Acceptance must observe an actual succeeded Test payment with immutable `service_periods`, genuine signed provider delivery and the corresponding new SQL payment-period receipt. Record any operator acceleration and exact dates. Do not call an accelerated Test cycle a naturally elapsed month or a real-money Live renewal. Cancellation flag/readback can be verified immediately; natural paid-period expiry still requires elapsed time or explicitly labelled acceleration/deterministic evidence.

The reviewer made no production deployment, provider transaction, purchase, secret entry or SQL migration change during this review.
