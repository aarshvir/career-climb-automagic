# Jobvance cloud loop: owner setup, accounts and costs

Prepared 11 October 2026. The pilot stays free for users. The selected ceiling is **US$50 per calendar month for Jobvance model and search usage combined**. This is not an instruction to purchase a subscription, add a payment card or top up credits.

## What you already have

Jobvance.io has independent frontend hosting and the existing Supabase project `gvftdfriujrkpptdueyb` (display name `jobassist-ai`). The project currently uses the Free plan. Keep it; do not create another database or move your domain. The new cloud loop uses this account for identity, private career records, run progress and documents. Its files are in this repository; it does not need Lovable, a running laptop, Claude Desktop, Microsoft Word or your private browser session.

The first pilot mode uses approved facts and user-supplied vacancies without calling a paid model. Adding external models is optional. Each provider needs its **API** account/key. The existing Supabase secret list contains an `OPENAI_API_KEY`; its value was not read and its validity/balance have not been verified. The adapter can reuse it while remaining disabled until you choose to enable external calls. Buying ChatGPT, Kimi or Claude consumer access does not generally configure an API account. Eligible Claude Max/Team subscribers have a separate API-credit program; see the section below.

## Accounts to add

| Account | Purpose | Required now? | Cost and limit |
|---|---|---|---|
| Existing Supabase | Sign-in, private records, cloud execution and document storage | Already present | Free pilot plan. Optional Pro starts at $25/month; this is outside the $50 usage ceiling. Do not upgrade for this setup. |
| OpenAI API | GPT model adapter | Optional; start with one provider | Current GPT 6 Luna: $0.10/million input tokens and $0.50/million output tokens. GPT 6.1 Sol: $2/$10. API billing is separate from ChatGPT subscriptions. |
| Anthropic Console | Claude model adapter | Optional | Claude Sonnet 5.5: $2/million input tokens and $10/million output tokens. Eligible Max/Team credits may cover usage; confirm eligibility before buying anything. |
| Kimi Open Platform | Kimi adapter | Optional | API is pay as you go, separate from Kimi membership. Configure the current displayed input/output rates before enabling it. The public pricing page did not expose its price table during this review; no unverified price is assumed. |
| Tavily | Role/location web searches | Optional | Free 1,000 credits/month, no card required. Basic paid usage: $0.008/credit. The app conservatively counts that equivalent cost even when free credits cover it. |
| Google Cloud project | Separate per-user Gmail consent | Later, for inbox functionality | API/project setup alone is not public production approval. Gmail read/draft scopes are restricted; provider verification and any security assessment are separate work/costs. Keep disconnected until ready. |

Sources: [Supabase plans](https://supabase.com/pricing), [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Kimi pricing](https://platform.kimi.ai/docs/pricing/chat), [Tavily pricing](https://www.tavily.com/pricing), [Google Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Add one model first

The recommended first configuration is **GPT 6 Luna**, because this pilot asks the model to choose relevant approved fact IDs rather than rewrite or invent a candidate's history. Choose a different available model in the workspace when testing its relevance decisions. Facts, approvals and the budget stay the same.

1. Open [OpenAI Platform](https://platform.openai.com/). Sign in yourself. Inspect the project/billing for your existing API key first; you may not need another account or key. If account setup asks you to accept terms, complete that yourself.
2. In the platform, open **Settings → Organization → Projects**. Create/select a project named **Jobvance pilot**. The provider's current UI can change; use its project/settings navigation if labels differ.
3. Open **API keys** for that project, then **Create new secret key**. Name it **Jobvance pilot server**. Copy the key privately. Do not paste it into this chat, a GitHub file or a field on Jobvance.io.
4. If the API has no credit, leave it disabled. Do not assume a ChatGPT subscription funds it. Add billing/credits only if you separately choose to pay. Disable automatic top ups. Provider budget alerts are helpful but are not a substitute for the app's hard reservation limit.
5. Open the [existing Supabase project](https://supabase.com/dashboard/project/gvftdfriujrkpptdueyb), then **Edge Functions → Secrets**.
6. Add a secret with name **`JOB_LOOP_OPENAI_API_KEY`** and paste the key as its value. Click the dashboard's save action. Supabase stores it on the server; never put it in a `VITE_` variable.
7. Keep **`JOB_LOOP_PAID_APIS_ENABLED=false`** while account configuration is incomplete. Its absence also means disabled.
8. Once the API account is funded/eligible and you explicitly want to start using it, change **`JOB_LOOP_PAID_APIS_ENABLED`** to **`true`**. This enables configured model/search adapters; the database still refuses a reservation that would exceed the combined $50 monthly ceiling.
9. Open [Jobvance Job Loop](https://jobvance.io/loop), refresh its connections/model list and select **GPT 6 Luna**. Save your record, confirm only facts you can share, add a vacancy and consent to that provider for the run.
10. Start one run. Inspect the source-lane report, evidence, model name and usage before approving a document. No message is sent and no application is submitted.

### Add Claude

1. Open [Anthropic Console](https://platform.claude.com/) and sign in yourself.
2. If you have an eligible Max/Team plan, first follow [Anthropic's API-credit linking instructions](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers). Use **Claude Settings → Billing → API credits** to link the intended Console organization. Complete any program terms yourself. Pro/free plans are not eligible; do not buy a plan just to perform this setup.
3. In Console, open **API keys → Create key**, name it **Jobvance pilot server**, and copy it privately.
4. In **Supabase → Edge Functions → Secrets**, save it as **`JOB_LOOP_ANTHROPIC_API_KEY`**. Keep auto reload/top ups off. Enable external APIs only when you choose to use available credits.
5. Refresh Jobvance and select **Claude Sonnet 5.5** for a run. This does not reuse your Claude chat login or private desktop tools.

### Add Kimi

1. Open [Kimi User Center](https://platform.kimi.ai/console/account) and sign in yourself.
2. Use the console's API-key management to create a server key. Read the current **Models & Pricing** page/account price display before funding it. Kimi membership and Kimi Code are separate products.
3. Save the key in Supabase as **`JOB_LOOP_MOONSHOT_API_KEY`**.
4. The initial supported model is **`kimi-k2.6`**. Read its current rates in the provider account, then add **`JOB_LOOP_MOONSHOT_INPUT_USD_PER_MILLION`** and **`JOB_LOOP_MOONSHOT_OUTPUT_USD_PER_MILLION`** in Supabase Secrets. Each value is the verified USD price for one million tokens, a positive decimal such as a rate copied from the current price table. Missing/invalid prices keep Kimi unavailable; zero is not assumed to mean free. Do not copy the Claude or GPT prices into these fields.
5. Refresh Jobvance and select Kimi when shown as configured. It uses the official [Moonshot-compatible API endpoint](https://platform.kimi.ai/docs/api/overview). Adding another provider later requires an adapter and priced model entry, not rebuilding the customer journey.

## Add web search without buying anything

1. Open [Tavily](https://app.tavily.com/home). Create/sign in to your own account and personally accept any account terms.
2. Stay on the **Free** tier. Do not select a paid subscription or enable a credit overage option.
3. In its API-key area, copy a key privately.
4. Save it in Supabase Secrets as **`JOB_LOOP_TAVILY_API_KEY`**.
5. Only turn external APIs on after the overall setup is ready. The app uses at most three basic queries per run and reports unavailable/failed searches honestly. It searches role/location text, not the candidate's raw CV.
6. Users can continue adding actual vacancies themselves if search is disabled or exhausted. A search hit is marked unverified until the posting is checked; it is not proof that a role remains open.

## Gmail is a separate integration

Do not connect your personal mailbox globally for all customers. Each user needs their own Google authorization. Ordinary Google sign-in only signs them into Jobvance.

For a controlled owner/tester pilot: create/select a Google Cloud project, enable Gmail API, configure the OAuth consent screen, list explicit test users and create a Web OAuth client with the exact callback from the deployment runbook. Store the client ID, client secret and a dedicated token-encryption secret only in Supabase. Google setup and restricted-scope verification must be completed before opening this connection to public users. Do not click through permission expansion on a customer's behalf.

Read access and draft access are separate choices in Jobvance. The draft permission is broader at Google, so the server exposes only draft creation, never sending. A draft requires a reviewed recipient and approved attachment. No LinkedIn browser cookie/session import or automated application submission is part of this pilot.

After the Google permission screen, return to Jobvance and confirm the displayed mailbox and read/draft access. Google approval alone does not activate the connection. If your Jobvance sign-in expired, keep that confirmation tab open, sign in to the original account using its new-tab link, then return. Do not share the callback address; closing or reloading the confirmation tab requires starting the connection again.

## How the $50 ceiling works

The limit is shared across all pilot users and adapters, using UTC calendar months. The server reserves a conservative maximum before each model/search request. Concurrent requests use a database lock. Confirmed provider usage replaces the reservation; uncertain timeouts retain the reservation so retries cannot quietly spend twice. A stopped run releases only work that was never dispatched. Switching models does not reset the budget.

Prices are API usage equivalents, before applicable taxes; credits can reduce your cash bill but do not expand the app's allowance. This cap applies to requests made by Jobvance. It cannot stop spending by another app sharing the same API key/account, provider subscriptions, tax, hosting charges or a provider changing prices. Use dedicated provider projects/keys, no automatic top ups, and review rates before enabling new models.

Illustration, not a forecast: a 10,000-input-token/1,200-output-token selection costs about **$0.0016 with GPT 6 Luna** or **$0.032 with Sonnet 5.5/GPT 6.1 Sol**. Five selections plus three basic Tavily queries would be about **$0.032** or **$0.184** at those token counts. Actual prompts, output and reserved capacity differ. At 300 runs/month, the premium example would exceed $50, so the service must stop earlier or use the lower-cost model.

Keep the pilot at ten invited users, normally one run per person per day and at most five prepared roles per run until real usage is measured. The service allows up to **three runs per person per UTC day** so a correction can be rebuilt, and only one active run per owner. The shared $50 ceiling still applies. The first release is user-triggered; runs continue in the cloud after the browser closes. Daily unattended scheduling is a later explicit setup, not a claim made by this account guide.
