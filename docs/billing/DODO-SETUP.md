# Setting up Dodo Payments for Jobvance passes (test mode first)

This guide walks you through connecting Jobvance to Dodo Payments so people can buy a one-time pass. Start in Dodo's **Test Mode**: it is a practice copy of your Dodo account where test cards work and no money moves. Live mode comes last, and only after Dodo has approved your account.

**What people see on the website:** the Pricing page shows Free and three one-time passes, each with a Buy button. Until you switch payments on, pressing Buy only says "Payments open soon" and nobody is charged. Free use keeps working either way: 3 AI-tailored CVs a month when signed in, 1 a day without an account, and Compare without AI, editing, downloads and the applications tracker with no limit.

**The three passes** (US dollars, one-time, nothing renews):

| Pass | Price | Lasts | AI-tailored CVs | Secret name for its product ID |
| --- | --- | --- | --- | --- |
| Sprint | $9.00 | 7 days | 25 | `DODO_PRODUCT_SPRINT` |
| Job Search | $19.00 | 30 days | 100 | `DODO_PRODUCT_SEARCH` |
| Career Move | $39.00 | 90 days | 300 | `DODO_PRODUCT_MOVE` |

Every pass also has a fair-use limit of 40 AI-tailored CVs a day. If someone buys a second pass while one is still running, the new CVs are added and the new pass's days start when the current one ends.

**What you need:**

- A Dodo Payments account you can sign in to.
- Access to the Jobvance project in Supabase (project ID `gvftdfriujrkpptdueyb`).
- About 45 minutes.
- Your developer, for the steps marked **Developer task**.

**Keep these private.** The API key (step 3) and the signing secret (step 4) work like passwords. Paste them only into Supabase in step 5. Never put them in an email, a chat, a document or a screenshot. If one is ever exposed, delete it in Dodo and make a new one.

---

## Checklist

- [ ] 1. Dodo is in Test Mode.
- [ ] 2. Three one-time products exist in Dodo, and you have copied their three product IDs.
- [ ] 3. A test API key exists, and you have copied it.
- [ ] 4. A webhook exists with exactly two events, and you have copied its signing secret.
- [ ] 5. The secrets are pasted into Supabase.
- [ ] 6. Your developer has applied the database changes and deployed the four functions.
- [ ] 7. One practice purchase and one practice refund both worked.
- [ ] 8. Payments are switched off again until you are ready.

---

## Step 1: Switch Dodo to Test Mode

1. Sign in to the Dodo Payments dashboard.
2. In the left sidebar, find the **Live Mode** switch and turn it **off**. The dashboard is now in Test Mode.
3. Stay in Test Mode for every step below. Products, keys and webhooks made in Test Mode only work in Test Mode.

## Step 2: Create the three passes and copy their IDs

Do this three times, once for each row of the table above.

1. Open **Products** and create a new product.
2. Fill it in exactly like this:
   - **Type / pricing:** One-time payment (not a subscription, not usage-based)
   - **Name:** `Jobvance Sprint pass`, `Jobvance Job Search pass` or `Jobvance Career Move pass`
   - **Price:** `9.00`, `19.00` or `39.00`
   - **Currency:** `USD`
   - **Tax category:** choose the closest digital option, such as digital products or software as a service
   - **Tax inclusive:** turn this **on** if your dashboard offers it, so the price people pay is exactly the price on the Pricing page. Jobvance accepts either setting: it checks that the price before tax is exactly $9, $19 or $39, whether Dodo adds tax on top or includes it. If you leave it off, buyers in some places pay sales tax on top of the listed price.
   - Leave **Pay What You Want**, **discounts** and **purchasing power parity** turned **off**, and do not add **localized prices**.
3. Save the product.
4. Open the product and copy its **Product ID**. It starts with `pdt_`. Write down which pass it belongs to. (A product ID is not secret, but you need it exactly, and each pass needs its own product.)

**About prices:** Jobvance double-checks a pass's price before it opens every checkout. If a product's price does not match its pass exactly, Jobvance pauses checkout for that pass and says it is temporarily unavailable, so nobody is charged the wrong amount. To change a price, ask your developer to change Jobvance's price first, then change it in Dodo.

**Also keep off:** In Dodo's business settings, leave **Adaptive Currency** off. Jobvance accepts US dollar payments only.

**The old $29 pack:** the earlier "10 application packs" product is no longer offered on the website. You do not need it. Leave `DODO_PRODUCT_ID` empty unless your developer asks for it.

## Step 3: Create an API key

1. Open **Developer → API Keys** and choose **Create New Key**.
2. Name it `Jobvance test`.
3. Give it only the access it needs:
   - **Payments:** Write
   - **Products:** Read
   - Everything else: None

   If your dashboard shows a separate **Checkout** permission, set it to **Write**.
4. Create the key and **copy it straight away**. Dodo shows it only once. If you lose it, delete it and make a new one.

## Step 4: Add the webhook and copy its signing secret

A webhook is how Dodo tells Jobvance that a payment or refund went through. Jobvance adds or removes a pass only when it receives this message.

1. Open **Developer → Webhooks** and choose **Add endpoint**.
2. For the endpoint URL, paste exactly:

   `https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/dodo-webhook`

3. Under events, tick only these two:
   - `payment.succeeded` (adds the pass)
   - `refund.succeeded` (removes the pass, including any CVs left on it)

   Do not leave the event list empty. Dodo treats an empty list as "send everything".
4. Choose **Create endpoint**.
5. On the endpoint's **Overview** tab, copy the **signing secret**. It usually starts with `whsec_`. Keep it for step 5.

## Step 5: Paste the settings into Supabase

1. Sign in to Supabase and open the Jobvance project (`gvftdfriujrkpptdueyb`).
2. Go to **Edge Functions → Secrets**. The direct link is <https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/functions/secrets>.
3. Add or update these secrets. Type the names exactly as shown, in capitals:

| Secret name | What to paste |
| --- | --- |
| `DODO_PRODUCT_SPRINT` | The Sprint product ID from step 2 (starts with `pdt_`) |
| `DODO_PRODUCT_SEARCH` | The Job Search product ID from step 2 |
| `DODO_PRODUCT_MOVE` | The Career Move product ID from step 2 |
| `DODO_PAYMENTS_API_KEY` | The API key from step 3 |
| `DODO_PAYMENTS_WEBHOOK_KEY` | The signing secret from step 4 |
| `JOBVANCE_PAYMENT_PROVIDER` | `dodo` |
| `JOBVANCE_BILLING_MODE` | `test` |
| `JOBVANCE_BILLING_ENABLED` | `false` for now. Step 7 switches it on. |

4. Check that `APP_URL` already exists and is exactly `https://jobvance.io`, with nothing after it. Dodo sends buyers back to this address. If it is missing, ask your developer.
5. Do **not** add any of the live-mode settings listed at the end of this guide.

Only one payment provider works at a time. Setting `JOBVANCE_PAYMENT_PROVIDER` to `dodo` means Paddle and Stripe are not used. If any product ID is mistyped, or two passes share the same product ID, Jobvance keeps payments switched off.

## Step 6 (Developer task): put the code live

Your developer needs to do these before the practice purchase. You do not need to do them yourself.

1. Review and apply, in this order, the database changes `supabase/migrations/20261017090000_billing_dodo_provider.sql` and `supabase/migrations/20261017120000_jobvance_tailor_passes.sql`. The second one adds the passes, the monthly free allowance and the refund rules.
2. Deploy the Edge Functions `create-checkout`, `dodo-webhook`, `get-entitlement` and `tailor-for-job` straight after the second database change, so the website and the database agree. Keep platform JWT verification **off** for `dodo-webhook`, as it is in `supabase/config.toml`. The function checks Dodo's signature itself.

## Step 7: Make one practice purchase and one practice refund

1. In Supabase **Edge Functions → Secrets**, change `JOBVANCE_BILLING_ENABLED` to `true`.
2. Sign in to <https://jobvance.io> with your own account.
3. Open <https://jobvance.io/pricing> and press **Buy Sprint**.
4. A Dodo checkout page opens. Its address starts with `https://test.checkout.dodopayments.com`. If it does not, stop and do not enter any card.
5. Pay with Dodo's test card:
   - **Card number:** `4242 4242 4242 4242`
   - **Expiry:** `06/32`
   - **CVV:** `123`
   - **Name:** any name
   - **Email:** an address you own. Test Mode sends real emails marked `[TEST MODE]`.
   - **Country and postcode:** for example, United States and any valid ZIP code
6. After paying, Dodo sends you back to **My applications** on Jobvance.
7. Check that it worked:
   - In Dodo (still in Test Mode), **Payments** shows the payment as **Succeeded**.
   - In Dodo, **Developer → Webhooks →** your endpoint shows a `payment.succeeded` delivery with a **200** response.
   - On Jobvance, **My applications** shows "Your plan: Sprint pass · 25 of 25 tailored CVs left · until …" within a minute. Refresh the page if it has not changed yet.
8. Refund test: in Dodo, open the payment and refund it. The webhook log shows `refund.succeeded` with a **200** response, and **My applications** goes back to "Your plan: Free · … tailored CVs left this month". Partial refunds also remove the pass.
9. **Switch payments off again:** change `JOBVANCE_BILLING_ENABLED` back to `false` in Supabase. The Buy buttons go back to saying "Payments open soon".

Passes bought in Test Mode count only while Jobvance is in test mode. They never carry over to live mode.

### If something goes wrong

Open **Developer → Webhooks →** your endpoint in Dodo and look at the response to the failed delivery:

- **503 "disabled"**: `JOBVANCE_BILLING_ENABLED` is not `true`, `JOBVANCE_PAYMENT_PROVIDER` is not `dodo`, or one of the step 5 secrets was pasted wrongly.
- **503 "not on sale"**: the product ID for that pass is missing from Supabase.
- **400 "signature"**: the signing secret in Supabase does not match this endpoint. Copy it again from the endpoint's Overview tab.
- **400 "does not match"**: the product is not a one-time USD product at exactly that pass's price, or a discount or another currency was used.
- **409 "not bound" or "does not match the plan"**: the payment was not started through Jobvance's Buy button, for example through a Dodo payment link. Jobvance deliberately ignores these. Refund it in Dodo.

Dodo retries failed deliveries several times over about a day. After you fix the cause, you can replay a failed message from the same page.

If pressing **Buy** says "Payments open soon", payments are switched off (`JOBVANCE_BILLING_ENABLED` is not `true`) or that pass's product ID is missing. If it says "Checkout could not be opened right now", check that the product's price in Dodo matches the table above exactly.

---

## Refunds: the 7-day money-back promise

The website promises: **7-day money-back if you've used fewer than 5 tailored CVs.** Dodo does not check this for you; you decide each request yourself.

1. When someone asks for a refund, find their payment in Dodo (**Payments**, search by email) and check it is no more than 7 days old.
2. Check how many tailored CVs they used from that pass. **Developer task, or use the Supabase SQL editor:** replace the email address and run:

   ```sql
   select p.plan, p.created_at, p.status,
     count(u.id) filter (where u.status <> 'settled' or u.actual_micros > 0) as tailored_cvs_used
   from public.jobvance_passes p
   join auth.users a on a.id = p.user_id
   left join public.jobvance_tailor_usage u on u.pass_id = p.id
   where a.email = 'buyer@example.com'
   group by p.id order by p.created_at desc;
   ```

3. If it is within 7 days and fewer than 5 were used, refund the full amount in Dodo. Jobvance removes the pass automatically when Dodo confirms the refund.
4. You can still refund outside the promise if you choose to. Any refund, full or partial, ends that pass.

---

## Before you ever switch to live mode

Live mode takes real money. **Dodo must approve your account first.** You have requested this approval; Dodo says it can take up to 72 hours. Until Dodo confirms it in writing, stay in test mode.

Jobvance refuses to start live mode unless every item below has been switched on in Supabase. Only switch an item on once it is actually true. Turning a switch on does not make the thing true.

1. **Dodo has approved you.** Your Dodo business verification is complete, live mode is active, and Dodo has confirmed in writing that it will sell this product (a CV and job-application service). Then set `JOBVANCE_DODO_MERCHANT_APPROVAL_REVIEWED` to `true`.
2. **You are allowed to sell.** You have checked that you are personally and legally allowed to run paid sales. Then set `JOBVANCE_SELLER_ELIGIBILITY_REVIEWED` to `true`.
3. **The terms are final.** You have read the Pricing, Terms, Refunds and Privacy pages on jobvance.io and they are right for you. The Privacy page now names Dodo Payments as merchant of record and payment processor. Then set `JOBVANCE_COMMERCIAL_TERMS_REVIEWED` to `true`.
4. **Someone has reviewed the whole live setup.** Then set `JOBVANCE_LIVE_BILLING_REVIEWED` to `true`.
5. **Support email works.** `SUPPORT_EMAIL` is set to a real address that someone reads. Refund requests will arrive there.
6. **Live Dodo items are new.** With Dodo's Live Mode switch **on**, you have made three new one-time USD products ($9, $19 and $39, as in step 2), a new API key and a new webhook endpoint at the same URL with the same two events. Test Mode items do not work in live mode. You replaced `DODO_PRODUCT_SPRINT`, `DODO_PRODUCT_SEARCH`, `DODO_PRODUCT_MOVE`, `DODO_PAYMENTS_API_KEY` and `DODO_PAYMENTS_WEBHOOK_KEY` with the live values.
7. **Test mode passed.** A practice purchase and a practice refund have both worked from start to finish.
8. **Only then** set `JOBVANCE_BILLING_MODE` to `live` and `JOBVANCE_BILLING_ENABLED` to `true`.

If any of these is missing, Jobvance keeps payments switched off, and the Buy buttons say "Payments open soon".
