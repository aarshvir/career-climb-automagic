# Setting up Dodo Payments for Jobvance (test mode)

This guide walks you through connecting Jobvance to Dodo Payments so you can try one practice purchase. Nothing here charges real money. Dodo's **Test Mode** is a practice copy of your Dodo account: test cards work there, and no money moves.

**What stays the same:** Jobvance still says "Free while in beta". This setup does not add prices or a Buy button to the website. Payments stay switched off until you deliberately turn them on in step 6, and you turn them off again at the end.

**What you need:**

- A Dodo Payments account you can sign in to.
- Access to the Jobvance project in Supabase (project ID `gvftdfriujrkpptdueyb`).
- About 30 minutes.
- Your developer, for two short tasks marked **Developer task**.

**Keep these private.** The API key (step 3) and the signing secret (step 4) work like passwords. Paste them only into Supabase in step 5. Never put them in an email, a chat, a document or a screenshot. If one is ever exposed, delete it in Dodo and make a new one.

---

## Step 1: Switch Dodo to Test Mode

1. Sign in to the Dodo Payments dashboard.
2. In the left sidebar, find the **Live Mode** switch and turn it **off**. The dashboard is now in Test Mode.
3. Stay in Test Mode for every step below. Products, keys and webhooks made in Test Mode only work in Test Mode.

## Step 2: Create the product and copy its ID

1. Open **Products** and create a new product.
2. Fill it in exactly like this:
   - **Type / pricing:** One-time payment (not a subscription, not usage-based)
   - **Name:** `Jobvance: 10 application packs, valid 30 days`
   - **Price:** `29.00`
   - **Currency:** `USD`
   - **Tax category:** choose the closest digital option, such as digital products or software as a service
   - Leave **Pay What You Want**, **discounts** and **purchasing power parity** turned **off**, and do not add **localized prices**.
3. Save the product.
4. Open the product and copy its **Product ID**. It starts with `pdt_`. Keep it somewhere safe for step 5. (A product ID is not secret, but you need it exactly.)

**About the price:** You can change the price later. Jobvance double-checks the price before it opens every checkout, so it only accepts a one-time USD $29 product right now. To use a different price, ask your developer to update Jobvance's price first, then change it in Dodo. Until the two match, Jobvance pauses checkout and says it is temporarily unavailable, so nobody is charged the wrong amount.

**Also keep off:** In Dodo's business settings, leave **Adaptive Currency** off. Jobvance accepts US dollar payments only.

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

A webhook is how Dodo tells Jobvance that a payment or refund went through. Jobvance adds or removes packs only when it receives this message.

1. Open **Developer → Webhooks** and choose **Add endpoint**.
2. For the endpoint URL, paste exactly:

   `https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/dodo-webhook`

3. Under events, tick only these two:
   - `payment.succeeded` (grants 10 packs)
   - `refund.succeeded` (removes the unused packs)

   Do not leave the event list empty. Dodo treats an empty list as "send everything".
4. Choose **Create endpoint**.
5. On the endpoint's **Overview** tab, copy the **signing secret**. It usually starts with `whsec_`. Keep it for step 5.

## Step 5: Paste the settings into Supabase

1. Sign in to Supabase and open the Jobvance project (`gvftdfriujrkpptdueyb`).
2. Go to **Edge Functions → Secrets**. The direct link is <https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb/functions/secrets>.
3. Add or update these secrets. Type the names exactly as shown, in capitals:

| Secret name | What to paste |
| --- | --- |
| `DODO_PAYMENTS_API_KEY` | The API key from step 3 |
| `DODO_PAYMENTS_WEBHOOK_KEY` | The signing secret from step 4 |
| `DODO_PRODUCT_ID` | The product ID from step 2 (starts with `pdt_`) |
| `JOBVANCE_PAYMENT_PROVIDER` | `dodo` |
| `JOBVANCE_BILLING_MODE` | `test` |
| `JOBVANCE_BILLING_ENABLED` | `false` for now. Step 6 switches it on. |

4. Check that `APP_URL` already exists and is exactly `https://jobvance.io`, with nothing after it. Dodo sends buyers back to this address. If it is missing, ask your developer.
5. Do **not** add any of the live-mode settings listed at the end of this guide.

Only one payment provider works at a time. Setting `JOBVANCE_PAYMENT_PROVIDER` to `dodo` means Paddle and Stripe are not used.

## Developer task: put the code live (before step 6)

Your developer needs to do these before the practice purchase. You do not need to do them yourself.

1. Review and apply the database change `supabase/migrations/20261017090000_billing_dodo_provider.sql`. It lets the payment records accept Dodo.
2. Deploy the Edge Functions `create-checkout`, `get-entitlement` and the new `dodo-webhook`. Turn platform JWT verification **off** for `dodo-webhook`, as it is in `supabase/config.toml`. The function checks Dodo's signature itself.

## Step 6: Make one practice purchase

1. In Supabase **Edge Functions → Secrets**, change `JOBVANCE_BILLING_ENABLED` to `true`.
2. Sign in to <https://jobvance.io> with your own account, and keep that browser tab open.
3. **Developer task:** Jobvance has no Buy button while it is free in beta, so your developer opens the practice checkout for you. With you signed in on jobvance.io, they run this once in that tab's browser console. It asks Jobvance's server for a Dodo checkout page and opens it. It has not been run against the live site yet, so your developer should check it first.

   ```js
   const key = Object.keys(localStorage).find(name => /^sb-.+-auth-token$/.test(name));
   const { access_token } = JSON.parse(localStorage.getItem(key));
   const response = await fetch('https://gvftdfriujrkpptdueyb.supabase.co/functions/v1/create-checkout', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
     body: JSON.stringify({ requestId: crypto.randomUUID() }),
   });
   const result = await response.json();
   if (result.provider === 'dodo' && result.url) location.assign(result.url); else console.log(result);
   ```

4. A Dodo checkout page opens. Its address starts with `https://test.checkout.dodopayments.com`. If it does not, stop and do not enter any card.
5. Pay with Dodo's test card:
   - **Card number:** `4242 4242 4242 4242`
   - **Expiry:** `06/32`
   - **CVV:** `123`
   - **Name:** any name
   - **Email:** an address you own. Test Mode sends real emails marked `[TEST MODE]`.
   - **Country and postcode:** for example, United States and any valid ZIP code
6. After paying, Dodo sends you back to Jobvance's dashboard.
7. Check that it worked:
   - In Dodo (still in Test Mode), **Payments** shows the payment as **Succeeded**.
   - In Dodo, **Developer → Webhooks →** your endpoint shows a `payment.succeeded` delivery with a **200** response.
   - In Jobvance, open **Access**. The number of saved preparations goes up by 10 within a minute. Refresh the page if it has not changed yet.
8. Optional refund test: in Dodo, open the payment and refund it in full. The webhook log shows `refund.succeeded` with a **200** response, and the 10 unused packs disappear from Jobvance.
9. **Switch payments off again:** change `JOBVANCE_BILLING_ENABLED` back to `false` in Supabase.

Packs bought in Test Mode count only while Jobvance is in test mode. They never carry over to live mode.

### If something goes wrong

Open **Developer → Webhooks →** your endpoint in Dodo and look at the response to the failed delivery:

- **503 "disabled"**: `JOBVANCE_BILLING_ENABLED` is not `true`, `JOBVANCE_PAYMENT_PROVIDER` is not `dodo`, or one of the step 5 secrets was pasted wrongly.
- **400 "signature"**: the signing secret in Supabase does not match this endpoint. Copy it again from the endpoint's Overview tab.
- **400 "does not match this one-time pass"**: the product is not a one-time USD $29 product, or a discount or other currency was used.
- **409 "not bound"**: the payment was not started through Jobvance, for example through a Dodo payment link. Jobvance deliberately ignores these. Refund it in Dodo.

Dodo retries failed deliveries several times over about a day. After you fix the cause, you can replay a failed message from the same page.

---

## Before you ever switch to live mode

Live mode takes real money. Jobvance refuses to start it unless every item below has been switched on in Supabase. Only switch an item on once it is actually true. Turning a switch on does not make the thing true.

1. **Dodo has approved you.** Your Dodo business verification is complete, live mode is active, and Dodo has confirmed in writing that it will sell this product (a CV and job-application service). Then set `JOBVANCE_DODO_MERCHANT_APPROVAL_REVIEWED` to `true`.
2. **You are allowed to sell.** You have checked that you are personally and legally allowed to run paid sales. Then set `JOBVANCE_SELLER_ELIGIBILITY_REVIEWED` to `true`.
3. **The terms are final.** Price, refund policy, terms of service and privacy wording are final. The privacy page currently names only Paddle and Stripe as payment processors, so it needs updating to mention Dodo. Then set `JOBVANCE_COMMERCIAL_TERMS_REVIEWED` to `true`.
4. **Someone has reviewed the whole live setup.** Then set `JOBVANCE_LIVE_BILLING_REVIEWED` to `true`.
5. **Support email works.** `SUPPORT_EMAIL` is set to a real address that someone reads.
6. **Live Dodo items are new.** With Dodo's Live Mode switch **on**, you have made a new $29 one-time USD product, a new API key and a new webhook endpoint at the same URL. Test Mode items do not work in live mode. You replaced `DODO_PRODUCT_ID`, `DODO_PAYMENTS_API_KEY` and `DODO_PAYMENTS_WEBHOOK_KEY` with the live values.
7. **Test mode passed.** A practice purchase and a practice refund have both worked from start to finish.
8. **The website is ready.** Showing a price and a Buy button needs a separate, reviewed website change. The site says "Free while in beta" until then.
9. **Only then** set `JOBVANCE_BILLING_MODE` to `live` and `JOBVANCE_BILLING_ENABLED` to `true`.

If any of these is missing, Jobvance keeps payments switched off.
