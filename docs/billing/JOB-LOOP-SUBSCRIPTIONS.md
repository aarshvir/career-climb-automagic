# Monthly Job Loop billing operations

The main product is Job Loop: Weekly $29/month, Active $59/month and Daily $99/month in USD, tax included. No default trial. An account and a deliberate purchase are required. CV Check passes are separate.

## Secure connection: exact controls

1. Dodo → Live Mode → Developer → Webhooks. The prepared Add endpoint form already contains `https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/dodo-webhook` and fourteen events: payment.succeeded, refund.succeeded and all twelve current subscription events. Click Create endpoint once.
2. On its detail page, find Signing Secret and copy it. Do not send it in chat, screenshot or source.
3. Supabase → Edge Functions → Secrets. Paste it into the Value beside `DODO_PAYMENTS_WEBHOOK_KEY`, then Bulk save. Keep the name exact. This is a different secret from the Dodo API key.
4. The live Dodo API key needs Payments Write, Products Read, Checkout Sessions Write and Subscriptions Write; all other categories None. The saved `DODO_PAYMENT_API_KEY` name is accepted if the canonical plural name is absent or identical. Never set two different values.

Only the owner handles credentials. Product IDs are public identifiers and already mapped:

| Plan | Product ID | Setting |
| --- | --- | --- |
| Weekly | pdt_0NpzVnWkzvNbKUPtHzZGo | DODO_PRODUCT_LOOP_WEEKLY |
| Active | pdt_0NpzW2tG9N28jjBuUzYLB | DODO_PRODUCT_LOOP_ACTIVE |
| Daily | pdt_0NpzWGsuzZZJfaeMXNPQV | DODO_PRODUCT_LOOP_DAILY |

Each product must be subscription/USD/monthly, payment frequency1month, term20years, tax inclusive, trial0, no discount/PPP/localized prices. The backend checks these settings before creating checkout. The long product term avoids an unintended one-payment expiry; charges remain monthly until cancellation.

After the owner confirms seller eligibility, displayed commercial/refund terms and monitored support, configure provider dodo, mode live, APP_URL https://jobvance.io, SUPPORT_EMAIL jobvance.info@gmail.com and the four existing merchant/seller/commercial/live reviewed flags. Set `JOBVANCE_BILLING_ENABLED=true` and `JOBVANCE_LOOP_BILLING_ENABLED=true` only with the secure connection ready. A present key or a price card does not establish live billing. Fresh authenticated status must report billingConfigured=true and billingMode=live. Do not store or read credential values in operator receipts.

## Acceptance and reconciliation

Start with a deliberately selected account/plan. Confirm the exact monthly total and automatic renewal before checkout. A return URL proves nothing; require the provider payment and exact paid service period plus one processed signed occurrence. Reload Pricing/Job Loop Help & privacy to verify plan/current access. A renewal must create one new immutable payment-period row and keep duplicate deliveries idempotent. Cancel monthly renewal, read provider confirmation, then verify the paid-through date remains and future renewal is stopped. A schedule pause is not billing cancellation. Provider Test Mode is separate: it must never buy live entitlement. Do not change real subscription dates to fake a natural renewal.

Real purchase/refund and new API-key entry require direct owner control. No real charge or provider payment/renewal/cancel/refund acceptance was completed in the implementation release. Eight native race groups and provider-adapter journey tests retain their narrower scope.

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

Keep the ten-account limit and $50 shared AI/search ledger. No payment changes processing consent, fact sharing, approval, ownership, erasure floors or permanent file fences. Source rollback cannot restore financial/Storage state.
