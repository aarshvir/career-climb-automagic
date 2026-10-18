# Isolated Dodo Test Mode acceptance endpoints

18 October 2026. These two thin entrypoints reuse the released Job Loop billing orchestration and SQL without changing the Live handlers or frontend. They are acceptance infrastructure, not a second customer checkout product.

## Configuration

Both endpoints remain unavailable until **all** configuration below is valid. No Live API key, signing secret, product, enabled flag, merchant-review gate or return URL is used as a fallback.

| Environment name | Value or requirement |
|---|---|
| `JOBVANCE_LOOP_TEST_BILLING_ENABLED` | Exactly `true`; missing/false disables both endpoints. Set `false` again when acceptance is complete. |
| `JOBVANCE_LOOP_TEST_OWNER_IDS` | Comma-separated list of 1–10 unique synthetic Auth user UUIDs. Blank, repeated, excessive or malformed values disable both endpoints. Use a newly created QA identity, not a real customer. |
| `JOBVANCE_LOOP_TEST_APP_URL` | Explicit return origin, normally `https://jobvance.io`. No path, query, fragment or credentials. |
| `DODO_TEST_PAYMENTS_API_KEY` | Key created in Dodo **Test Mode**, entered securely. A visible `dodo_live_` prefix is refused. |
| `DODO_TEST_PAYMENTS_WEBHOOK_KEY` | The separate Test endpoint's Standard Webhooks signing secret, entered securely. |
| `DODO_TEST_PRODUCT_LOOP_WEEKLY` | Test Mode recurring product ID: USD 29 including tax, every 1 Month. |
| `DODO_TEST_PRODUCT_LOOP_ACTIVE` | Test Mode recurring product ID: USD 59 including tax, every 1 Month. |
| `DODO_TEST_PRODUCT_LOOP_DAILY` | Test Mode recurring product ID: USD 99 including tax, every 1 Month. |

All three Test products must match the Live product contract: renewable term 20 Years, tax included, no trial, no discount, no purchasing-power adjustment, quantity one. The public `active` plan maps to the existing `three_weekly` server cadence. Test key permissions are Products Read, Payments Write (including Read), Checkout Sessions Write (including Read), and Subscriptions Write (including Read). Creating/observing refunds for provider acceptance can use the Dodo Test dashboard; the handlers do not request Refunds API access.

Existing Supabase infrastructure authentication and server credentials are shared. Financial configuration is isolated. Never place either Dodo secret in documentation, chat, receipts, screenshots or browser logs.

## Endpoints and authority

`job-loop-billing-test` requires `auth.getUser`, the actual verified JWT `session_id`, a current SQL Auth session and an allowlisted synthetic owner. It accepts the released `status`, `checkout` and `cancel` contracts. The adapter forces Dodo's `https://test.dodopayments.com` API host, Test checkout URLs and SQL `mode='test'`. Caller-supplied mode or owner overrides are rejected by the released input contract. Existing Live entitlement is removed from Test status responses (`entitlement:null`), and `testModeOnly:true` labels every successful response. Test orders/subscriptions never grant Live Job Loop access.

`dodo-webhook-test` accepts only the isolated Test signing secret over the exact raw body. Point the Dodo **Test Mode** endpoint to:

`https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/dodo-webhook-test`

For supported Subscription/Payment events, immutable Loop metadata must name an allowlisted synthetic owner before orchestration starts. Provider-read Subscription metadata is independently checked against that allowlist. For a signed Refund event, the handler makes one strictly bounded Test-host payment read to derive original payment metadata: refund metadata is not payment ownership authority. That payment read is cached for the actual orchestration. An unrelated or forged owner cannot write subscription authority.

Select these Test webhook events: `payment.succeeded`, `payment.failed`, `refund.succeeded`, `subscription.active`, `subscription.renewed`, `subscription.past_due`, `subscription.on_hold`, `subscription.cancelled`, `subscription.expired`, `subscription.failed`, `subscription.updated`, `subscription.paused`, `subscription.unpaused`, `subscription.plan_changed`, `subscription.update_payment_method`.

No public frontend calls these endpoints. The Live handlers and Live key/product configuration are unchanged. Both new functions use `verify_jwt=false` at the gateway while retaining their own verified user/session checks or Standard Webhooks signature authentication, respectively.

## Acceptance scope and limits

Use the synthetic Test identity to create an actual provider Test checkout, complete Dodo's supported test-card payment, verify signed provider events and immutable paid service periods, deduplicate the original request, observe a real Test renewal, cancel at paid-period end, and exercise Test refunds/failures. If the provider's native Test controls accelerate a renewal, record the operator action and exact timestamps; do not call that natural month-to-month operation. A sample webhook or a manually fabricated period is not payment/renewal acceptance.

The initial implementation passed **23** isolated configuration/actual-entrypoint tests and Deno checks for both new entrypoints. Those tests replace provider HTTP and SQL with hermetic adapters, prove forced Test host/key/product/mode and verify signature, allowlist, checkout-host, refund-owner and cancellation boundaries. Independent reviewer tests and actual hosted/provider acceptance are recorded separately by the coordinator. This implementation made no production deployment, provider generation, charge, purchase or secret entry.

## Coordinator deployment and current acceptance state

The coordinator deployed `job-loop-billing-test` version 1 and `dodo-webhook-test` version 1 on 18 October. Native readback matched all **18 uploaded files** exactly. Both retain application authentication or webhook signatures with gateway `verify_jwt=false`. This adds no frontend route, SQL migration, or change to the four Live billing handlers. Public v44 is unchanged.

While configuration is disabled, a newly created synthetic Auth identity received HTTP 503 `LOOP_TEST_BILLING_DISABLED`, anonymous control access received HTTP 401, and the Test webhook received HTTP 503. Its credentials stay in process memory. The Test allowlist is limited to that synthetic identity; provider financial acceptance has not yet run.

Separate Test Mode monthly products were created and checked in Dodo's native catalogue: Weekly `pdt_0NpzelsHACoM4LDOWv3B4`, Active `pdt_0Npzf8PoOs4n8UQxLW8pO`, and Daily `pdt_0NpzfK6ykcqXCgIvn9YDx`. These public product identifiers are not the Live product mappings. Owner-entered Test credentials and actual provider payment/renewal/cancellation evidence remain pending. The independent review passed 123 focused cases; it does not replace that provider journey.

Private evidence: `loop-subscriptions-test-endpoints.json` and `loop-subscriptions-test-provider.json` in the sibling repair-evidence directory. Do not record API keys, signing secrets, auth credentials or checkout URLs in those receipts.
