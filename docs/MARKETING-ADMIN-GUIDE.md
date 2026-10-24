# Marketing admin (jobvance.io/marketing-admin)

The page is private and owner-only. Each request re-checks the account against `jobvance_admin_members`, so only aarshvir@gmail.com (role `owner`) can change ads; an `operator` can only view, sync and queue ideas.

## What it does

| Section | What you can do |
| --- | --- |
| Summary | Spend against your caps, impressions and landing page views, across every ad. |
| Recommendations | Plain-language advice from the rules below. **Pause now** and **Resume now** buttons. |
| Meta ads | One row per ad (from Meta): status, budget, spend, link CTR, landing page views, cost per view, a 14-day spend strip. **Launch on Meta**, **Pause** and **Resume**, each confirmed first. |
| Ideas | Every concept and version with its owner-approved files. **New idea**, **Send to ad creation**. |
| Production queue | Ideas waiting for the ad team. They are built with the locked workflow (`jobvance-ad-studio/ADVERTISING-WORKFLOW.md`), and you approve the exact files before anything goes live. |
| Auto mode | On/off, plus daily cap, total cap, impressions needed before judging, CTR floor and cost ratio. **Run the auto check now**. |
| Audit log | Every change, by you or by auto mode. Entries cannot be edited or deleted. |

## Rules behind recommendations

- **Wait.** An ad isn't judged until it has the set number of impressions (default 1,500).
- **Pause: low click-through.** Link CTR is below the floor (default 0.40%).
- **Pause: expensive.** Cost per landing page view is more than the set multiple (default 2x) of the best ad.
- **Spend cap.** Today's spend or total spend has reached your cap, so every running ad pauses.
- **Resume.** Something auto mode paused for a cap comes back once the cap clears: a new day, or you raised the total.
- **Winner.** One ad is clearly cheaper, so consider moving budget to it. This is advice only; auto mode never raises spend.
- **Refresh creative.** Average frequency is above 3.
- **Not delivering.** Meta reports the ad as disapproved or with issues.

## What auto mode can and cannot do

It runs every hour (pg_cron job `jobvance-marketing-auto`) and only when it's switched on.

**It can:**
- Pause ads over a cap, or ads clearly losing to another ad.
- Resume ads that it paused itself once the cap clears.

**It never:**
- Creates ads.
- Raises a budget.
- Switches on an ad you paused.
- Switches on an idea without an owner-approved video.
- Switches off the last good ad for performance reasons.
- Changes more than 4 ads per run.

The campaign's own Meta spending limit (₹7,000 today) still applies as a hard backstop.

**"Launch on Meta"** switches on an ad that is already set up (paused) in Meta. A new film still goes through the ad team, which uploads it to Meta and adds it here after you approve the files.

## Connecting Meta (owner, one time, about 10 minutes)

Claude cannot do this part because it means creating and pasting a credential.

1. Go to developers.facebook.com and select **My Apps**, then **Create app**.
   - Choose **Other**, then the **Business** type.
   - Name it "Jobvance Marketing" and choose the Jobvance business.
2. In the app, select **Add product**, then **Marketing API**, then **Set up**.
3. Go to business.facebook.com/settings and select **Users**, then **System users**, then **Add**.
   - Name it "Jobvance dashboard" and give it the Admin role.
4. Select that system user, then **Assign assets**, then **Ad accounts**.
   - Pick **IQ Bridge learning** and switch on **Manage campaigns** (full control).
   - Also assign the **Jobvance Marketing** app.
5. Still on the system user, select **Generate new token**.
   - Pick the Jobvance Marketing app.
   - Set expiry to **Never**.
   - Tick **ads_management** and **ads_read**.
   - Select **Generate**, and copy the token.
6. In the Supabase dashboard, go to **Project settings**, then **Edge Functions**, then **Secrets**, and add these:
   - `META_ACCESS_TOKEN` = the token you copied.
   - `META_AD_ACCOUNT_ID` = `1843729196384751`.
7. Open jobvance.io/marketing-admin and press **Sync from Meta**. Figures appear within a few seconds.

Never paste the token into chat, a document or the page. If it leaks, go back to step 5, revoke it and generate a new one.

## Data

- Tables: `jobvance_marketing_*`, migrations `20261024090000` and `20261024090100`.
- Ideas, files and the two live launches are seeded from the 23 Oct receipts.
- New films are added by the ad team when they upload them.
- Money is stored in paise (integer minor units).
- Meta day boundaries follow the ad account's time zone (IST).
