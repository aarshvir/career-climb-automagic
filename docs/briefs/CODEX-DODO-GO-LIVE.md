# Codex prompt: take Jobvance payments live on Dodo

Paste this whole file into Codex. Claude wrote it on 18 October 2026 after checking Dodo's dashboard and the Supabase project directly.

**Your task:**
1. Make Jobvance's three one-time CV passes take real money safely.
2. Prove it with one real purchase and one refund.
3. Then build the monthly Job Loop plans on Dodo subscriptions.

## 1. Where things stand (checked 18 Oct 2026)

| Area | State |
| --- | --- |
| Dodo account | **Approved.** The Verification page says "Live payments are active". Product, identity and bank checks are all Approved. The account is verified as an individual. |
| Dodo Live Mode | **Empty when checked:** no products, no webhook endpoints and no API keys. The owner is creating them (section 2). |
| Dodo Test Mode | Three one-time USD passes, tax-inclusive, software-as-a-service tax category:<br>- Sprint `pdt_0NpvUYMcygElhS6phNXNa`, $9<br>- Job Search `pdt_0NpvUghJBo3cm53V1cNFN`, $19<br>- Career Move `pdt_0NpvUod2EWTaAO2uUNwWD`, $39<br>The live copies will have new IDs. |
| Supabase functions | `create-checkout` v6, `dodo-webhook` v1, `get-entitlement` v7 and `tailor-for-job` v4 are all active. |
| Database | `public.jobvance_passes` has 0 rows. **No purchase has ever completed, in test or live.** The webhook path has never run end to end. |
| Live gate | `supabase/functions/_shared/core.ts:140` keeps live mode off unless all four `*_REVIEWED` switches are `true` and `SUPPORT_EMAIL` is a valid address. |
| Deep tailor | You have already merged and deployed it (`e6cab7b`, `b75fdaa`). Nothing to do. |
| Monthly plans | **Not built.** There is no subscription webhook handling. |

## 2. What the owner does himself: do not do these, and never ask for the values in chat

The keys work like passwords. Claude's tools are also blocked from Dodo's Live Mode. The owner is doing these himself:

1. **Dodo Live Mode:**
   - Import the three passes from Test Mode and copy their three new `pdt_` IDs.
   - Add a webhook endpoint at `https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/dodo-webhook` with only `payment.succeeded` and `refund.succeeded` ticked.
   - Create an API key called "Jobvance live" with Payments: Write, Products: Read, and Checkout: Write if that permission is shown.
   - Check that Adaptive Currency is off.
2. **Supabase Edge Function secrets:**
   - The keys and IDs:
     - `DODO_PRODUCT_SPRINT`
     - `DODO_PRODUCT_SEARCH`
     - `DODO_PRODUCT_MOVE`
     - `DODO_PAYMENTS_API_KEY`
     - `DODO_PAYMENTS_WEBHOOK_KEY`
   - The settings: `JOBVANCE_PAYMENT_PROVIDER=dodo`, `JOBVANCE_BILLING_MODE=live` and `SUPPORT_EMAIL`.
   - The four sign-offs:
     - `JOBVANCE_DODO_MERCHANT_APPROVAL_REVIEWED`
     - `JOBVANCE_SELLER_ELIGIBILITY_REVIEWED`
     - `JOBVANCE_COMMERCIAL_TERMS_REVIEWED`
     - `JOBVANCE_LIVE_BILLING_REVIEWED`
   - Last of all, `JOBVANCE_BILLING_ENABLED=true`.
3. **One real purchase:** he buys the $9 Sprint pass with his own card, then refunds it in full in Dodo.

**Rules for you:**
- Never set the four sign-offs or `SUPPORT_EMAIL` for him. They are his own confirmations.
- Tracker item SC-04 ("No licence/permit for now; payments pending") is his to lift. Update SC-04 only after he has set `JOBVANCE_SELLER_ELIGIBILITY_REVIEWED=true`, recording the date and quoting his words.

## 3. Pre-flight: do this now, before he switches payments on

Read only, unless you find a defect. Report every item as pass or fail, with the evidence.

1. **Deployed functions:** read back the deployed `create-checkout`, `dodo-webhook` and `get-entitlement` and confirm they match main. `dodo-webhook` must keep JWT verification off.
2. **Return address:** confirm `APP_URL` is exactly `https://jobvance.io`. Dodo sends buyers back to it after paying.
3. **The live path in the code:**
   - The checkout host is `checkout.dodopayments.com` and the live API base URL is used.
   - The mode is recorded on every order, payment and pass.
   - A test-mode pass can never count in live mode.
4. **Imported products:** Dodo's "Import from Test" copies products into Live Mode. Confirm your price check accepts such a copy:
   - one-time;
   - USD;
   - exactly $9, $19 or $39 before tax;
   - tax-inclusive.

   If the import could change any field the check depends on, name the field.
5. **Public pages in live mode** (Pricing, Terms, Refunds and Privacy) must say:
   - Dodo Payments is the merchant of record.
   - Passes are one-time and nothing renews.
   - There is a 7-day money-back promise if fewer than 5 tailored CVs were used.
   - The support address is shown.
   - There is no "test", "beta" or "pilot" wording.
   - Buy buttons open checkout once payments are enabled.
6. **Failed webhooks are visible:** a failed delivery must not go unnoticed. At minimum, give the owner one SQL query he can run and tell him where Dodo's webhook logs are.

## 4. After he says "live test done": verify and report

1. In `billing_orders`, `billing_payments` and `billing_payment_events`: there is one live payment, and `payment.succeeded` was processed exactly once.
2. In `jobvance_passes`: there is one Sprint pass with 25 CVs and the correct end date. After the refund, `refund.succeeded` was processed and the pass is revoked.
3. The function logs show both webhook deliveries returning 200.
4. His My applications screen showed the Sprint pass, then went back to Free after the refund.

Report pass or fail for each, with the rows. If anything fails:
- use the troubleshooting list in `docs/billing/DODO-SETUP.md`;
- fix the cause and redeploy only the affected function;
- ask him to repeat the test.

Until this passes, do not call payments live, announce the paid passes, or mention them in ads or posts.

## 5. Then: the monthly Job Loop plans on Dodo subscriptions

Follow section 3 of `docs/briefs/CODEX-JOB-LOOP-BRIEF.md`.

**Plans:**
- Weekly: $29 a month.
- Active: $59 a month, marked most popular.
- Daily: $99 a month.
- Every plan has a 14-day free trial that needs a card.
- The one-time passes stay on sale as add-ons.

These plans replace the Focus $15 / Loop $29 proposal in RQ-09. If you think the prices should be different, ask the owner. Do not change them without telling him.

**From Dodo's documentation:**
- **Product:** a recurring monthly price in USD. Make the subscription period much longer than the payment frequency, for example 10 years. If the two are equal, the subscription expires after one charge.
- **Trial:**
  - Set Trial Period Days to 14, with no Trial Amount.
  - Leave "Start the trial without a card" unticked, so a card is required.
  - Alternatively, pass `subscription_data.trial_period_days` on the checkout session.
- **Webhook events to add to the same endpoint:**
  - `subscription.active`
  - `subscription.renewed`
  - `subscription.past_due`
  - `subscription.on_hold`
  - `subscription.cancelled`
  - `subscription.expired`
  - `subscription.failed`
  - `subscription.plan_changed`
  - `payment.failed`

  Keep `payment.succeeded` and `refund.succeeded`.
- **Access by subscription state:**

  | State | Access |
  | --- | --- |
  | Active or renewed | Full access to the plan. |
  | Past due | Access continues until `past_due_ends_at`. |
  | On hold, expired or failed | No access. |
  | Cancelled at the next billing date | Access continues until the paid period ends. |

- **Trials:** Dodo has no trial-status field. In a free trial, the first payment is $0.

**How to build it:**
- Build and test everything in Dodo Test Mode first. The interrupted recurring-billing work saved in the Git stash (see the tracker) may help.
- Meet the card-network and consumer rules in the Job Loop brief:
  - show the price and both dates before the card is entered;
  - email the terms at sign-up;
  - send reminders on day 7 and day 12;
  - let users cancel in two clicks;
  - offer 7-day money-back after the first charge.
- When it is ready for live, give the owner a click-by-click list of the three live subscription products to create and the extra webhook events to tick. He creates them himself.

## 6. Ground rules

- The owner's instructions in chat override this file.
- Never put secrets in the repository, in chat, in logs or in screenshots.
- Everything the site says must be true. No invented testimonials, user counts, logos or "since 20XX" claims.
- Record each step in `docs/USER-REQUEST-TRACKER.md`, with its evidence.
