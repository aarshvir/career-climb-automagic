# Monthly Job Loop billing operations

The main product is Job Loop: Starter $29/month (weekly), Advanced $59/month (three chosen weekdays) and Pro Job Seeker $99/month (daily) in USD, with fixed whole-unit local prices in eight additional currencies, tax included. No default trial. An account and a deliberate purchase are required. CV Check passes are separate and remain explicitly USD. [Current whole-price table, authority and acceptance](../audits/2026-10-18-loop-subscriptions/WHOLE-CURRENCY-PRICING.md). V47 uses new provider product versions; v46's fractional catalogue is historical for existing purchases.

**Current connection is complete and Live payments are enabled.** The owner already saved the Live and isolated Test API/signing keys and approved the precise permissions, commercial terms and support mailbox. Do not request these handoffs again. The controls below document configuration and recovery; they are not pending owner tasks. The isolated Test gate is false and Test webhook disabled after acceptance.

## Secure connection: exact controls

1. Dodo → Live Mode → Developer → Webhooks. Reuse the existing endpoint `https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/dodo-webhook`. Its fifteen events are payment.succeeded, payment.failed, refund.succeeded and all twelve current subscription events. Do not create a duplicate endpoint.
2. On its detail page, find Signing Secret and copy it. Do not send it in chat, screenshot or source.
3. Supabase → Edge Functions → Secrets. Paste it into the Value beside `DODO_PAYMENTS_WEBHOOK_KEY`, then Bulk save. Keep the name exact. This is a different secret from the Dodo API key.
4. The live Dodo API key needs Payments Write, Products Read, Checkout Sessions Write and Subscriptions Write; all other categories None. The saved `DODO_PAYMENT_API_KEY` name is accepted if the canonical plural name is absent or identical. Never set two different values.

Only the owner handles credentials. Product IDs are public identifiers and already mapped:

| Plan | Product ID | Setting |
| --- | --- | --- |
| Starter | pdt_0Nq0BYq7BdjAS4guEjnZR | DODO_PRODUCT_LOOP_WEEKLY |
| Advanced | pdt_0Nq0Bq1C8qWpEc09hFc9l | DODO_PRODUCT_LOOP_ACTIVE |
| Pro Job Seeker | pdt_0Nq0Bu1sW9DpHx9xCgY44 | DODO_PRODUCT_LOOP_DAILY |

These are current v3 Live products. Keep all original products and localized rules for their owned historical quotes, ready URLs and subscriptions. Changing a rule on an existing Dodo product can reprice a ready checkout session: this was actually reproduced in Test Mode. Publish subsequent prices through separate new products and a new catalogue revision. Never edit prior product rules to implement a new price. Native Copy to Live Mode does not copy localized rules; configure and verify those separately before activation.

Each product retains its subscription/USD base, payment frequency1month, term20years, tax inclusive, trial0, no discount and no PPP. Eight fixed `by_currency` local rules per product now match the versioned application/SQL catalogue. Do not enable floating Charm Pricing, add a USD override or change rules without a coordinated versioned-price release. The backend verifies the selected native rule and both initial/recurring preview totals before creating new checkout. The long product term avoids an unintended one-payment expiry; charges remain monthly until cancellation. Historical USD orders and existing subscriptions keep their original monetary snapshot.

After the owner confirms seller eligibility, displayed commercial/refund terms and monitored support, configure provider dodo, mode live, APP_URL https://jobvance.io, SUPPORT_EMAIL jobvance.info@gmail.com and the four existing merchant/seller/commercial/live reviewed flags. Set `JOBVANCE_BILLING_ENABLED=true` and `JOBVANCE_LOOP_BILLING_ENABLED=true` only with the secure connection ready. A present key or a price card does not establish live billing. Fresh authenticated status must report billingConfigured=true and billingMode=live. Do not store or read credential values in operator receipts.

## Acceptance and reconciliation

Start with a deliberately selected account/plan. Confirm the exact monthly total and automatic renewal before checkout. A return URL proves nothing; require the provider payment and exact paid service period plus one processed signed occurrence. Reload Pricing/Job Loop Help & privacy to verify plan/current access. A renewal must create one new immutable payment-period row and keep duplicate deliveries idempotent. Cancel monthly renewal, read provider confirmation, then verify the paid-through date remains and future renewal is stopped. A schedule pause is not billing cancellation. Provider Test Mode is separate: it must never buy live entitlement. Do not change real subscription dates to fake a natural renewal.

Real purchase/refund and new API-key entry require direct owner control. No real charge has been made. The v45 isolated Dodo Test journey proved USD initial payments, an accelerated successful renewal, a declined renewal, refunds and cancellations. The v46 journey additionally proved INR/JPY initial payments, a successful accelerated JPY renewal, exact-cycle refund and both owned cancellations. The accelerated INR renewal remained Processing at last readback with no extra paid period. [Provider acceptance](../audits/2026-10-18-loop-subscriptions/PROVIDER-ACCEPTANCE.md) and [localized acceptance](../audits/2026-10-18-loop-subscriptions/LOCALIZED-PRICING.md) retain their limits. Neither is natural-month or real-card settlement proof.

Dodo → Developer → Webhooks → the endpoint → message/delivery logs shows success or retry/error for each delivery. Supabase Edge Function logs for dodo-webhook must agree. A failed or processing delivery must remain retryable; do not manually mark it processed. Inspect only necessary financial references, never CVs or card data.

Aggregate read-only operator query:

```sql
select 'orders' as kind, mode, state as status, count(*) as rows
from jobvance_private.loop_billing_orders group by mode,state
union all
select 'subscriptions',mode,status,count(*) from jobvance_private.loop_subscriptions group by mode,status
union all
select 'paid_periods',mode,case when revoked then 'revoked' else 'recorded' end,count(*)
from jobvance_private.loop_subscription_periods group by mode,revoked
union all
select 'pending_fulfillment',mode,case when resolved then 'resolved' else 'needs_reconciliation' end,count(*)
from jobvance_private.loop_billing_pending_fulfillment group by mode,resolved;
```

These rows show received database state, not whether Dodo failed to deliver an event. Reconcile its delivery logs and actual payment/subscription readback. Missing data stays unknown. Never blindly retry an ambiguous checkout or cancellation POST. Recovery retains the original request and uses fresh provider reads; confirmed cancellation remains available after career-data erasure.

Keep the ten-account limit and $50 shared AI/search ledger. No payment changes processing consent, fact sharing, approval, ownership, erasure floors or permanent file fences. Source rollback cannot restore financial/Storage state. Local quote/order/currency and per-payment accounting history are additive financial evidence and must survive a frontend rollback. Do not restore an old USD-only billing handler alone against enabled localized merchant rules. A provider USD accounting or settlement value is not authority to reprice a local customer charge; retain the exact original quoted currency/amount and paid service period.
