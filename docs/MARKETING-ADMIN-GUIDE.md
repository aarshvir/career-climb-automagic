# Marketing admin (jobvance.io/marketing-admin)

The page is private. Each request re-checks the account against `jobvance_admin_members`: the `owner` can do everything on the page, and an `operator` can view, sync and queue ideas.

**This release is read-only towards Meta.** It reads ads, status and figures. It cannot launch, pause, resume or re-budget an ad, and there is no auto mode and no hourly job. Make every ad change in Meta Ads Manager.

## What it does

| Section | What you can do |
| --- | --- |
| Summary | Spend against your caps, impressions and landing page views, across every ad. If any ad's figures are unknown or stale, totals say "At least" (or "Unknown") instead of counting them as zero. |
| Recommendations | Plain-language advice from the rules below. Nothing is applied automatically. |
| Meta ads | One row per ad, as read from Meta: live status, budget, spend, impressions, link clicks, link CTR, landing page views, cost per view, a 14-day spend strip, and whether the figures are fresh, stale or unknown, with the time of the last complete read. No buttons that change ads. |
| Ideas | Recorded concepts and versions with their approval history. **New idea**, **Send to ad creation**. |
| Production queue | Ideas waiting for the ad team. They are built with the locked workflow (`jobvance-ad-studio/ADVERTISING-WORKFLOW.md`), and you approve the exact files before anything goes live. |
| Caps and auto mode | Daily cap, total cap, impressions needed before judging, CTR floor and cost ratio. These only shape the recommendations. Auto mode shows "not available yet". |
| Audit log | Every sync and every change made on this page. Entries cannot be edited or deleted. |

**Sync now** reads from Meta and stores the figures in our own tables. It never sends anything to Meta except read requests.

## When figures count as fresh, stale or unknown

A sync stores an ad's figures only when the whole read is complete and valid:

- The ad account's currency matches the launch's currency (INR), and its time zone is still IST.
- The ad still belongs to the recorded ad account, campaign and ad set.
- Meta's answer has the expected shape. Every day is a single, valid, non-future date, with no duplicates. Spend and impressions are real numbers; anything malformed is rejected, never read as zero.
- Every page of daily figures is read. The page follows Meta's cursor itself, up to 10 pages per ad (about 1,000 days).

If any check fails, nothing is written for that ad:

- If the ad had complete figures before, they stay, marked **Stale**.
- If not, its figures show as **Unknown**.
- The row says why.
- The page-wide "Last complete Meta sync" time only moves when every ad was read completely.

Complete figures older than 6 hours also show as **Stale**, because nothing syncs on a schedule.

## Rules behind recommendations

Only ads with fresh figures are judged. Unknown or stale ads get a "figures unknown/stale" note instead.

- **Wait.** An ad isn't judged until it has the set number of impressions (default 1,500).
- **Consider pausing: low click-through.** Link CTR is below the floor (default 0.40%).
- **Consider pausing: expensive.** Cost per landing page view is more than the set multiple (default 2x) of the best ad.
- **Spend cap.** Known spend today, or in total, has reached your cap, so pause running ads in Ads Manager. Known spend is a lower bound when some figures are unknown, so this can say a cap was reached. It never says spend is safely under a cap.
- **Keep the best ad.** If every running ad would be flagged, the best one is marked "keep running for now".
- **Winner.** One ad is clearly cheaper, so consider moving budget to it in Ads Manager.
- **Refresh creative.** The lower bound from impressions divided by summed daily reach is above 3; verify actual unique-person frequency in Ads Manager.
- **Not delivering.** Meta reports the ad as disapproved or with issues.

## Deferred (not in this release)

These came out after Codex's review of PR #26. They come back only with the safeguards listed:

- **Launch, pause and resume from the page.**
  - Each switch-on must be bound to the exact approved creative and copy, and the exact account and parent IDs.
  - It must use fresh platform state: spend, caps, budgets, end dates, currency and time zone. It is blocked when any of these is unknown.
  - A resume must never switch on an owner-paused campaign, ad set or sibling ad.
- **Auto mode and the hourly job.**
  - Each run needs durable intent and attempt records.
  - It must check owner stops and versions right before every write.
  - It must reconcile writes whose outcome is unknown.
  - It never resumes spend on unknown or partial figures.
  - The hourly job (`jobvance-marketing-auto`), its tickets and the `set_status` / `run_auto` actions are removed. The server refuses those actions with `MARKETING_CONTROL_DISABLED`.

The campaign's own Meta spending limit and ad set end dates remain the real spend controls.

## Connecting Meta (owner, one time, about 10 minutes)

Claude cannot do this part because it means creating and pasting a credential. The token only needs to read.

1. Go to developers.facebook.com and select **My Apps**, then **Create app**.
   - Choose **Other**, then the **Business** type.
   - Name it "Jobvance Marketing" and choose the Jobvance business.
2. In the app, select **Add product**, then **Marketing API**, then **Set up**.
3. Go to business.facebook.com/settings and select **Users**, then **System users**, then **Add**.
   - Name it "Jobvance dashboard (read-only)" and give it the **Employee** role, not Admin.
4. Select that system user, then **Assign assets**, then **Ad accounts**.
   - Pick **IQ Bridge learning**.
   - Give **View performance** only. Leave **Manage campaigns** off.
   - Also assign the **Jobvance Marketing** app.
5. Still on the system user, select **Generate new token**.
   - Pick the Jobvance Marketing app.
   - Set expiry to **Never**.
   - Tick **ads_read** only. Do not tick ads_management.
   - Select **Generate**, and copy the token.
6. In the Supabase dashboard, go to **Project settings**, then **Edge Functions**, then **Secrets**, and add these:
   - `META_ACCESS_TOKEN` = the token you copied.
   - `META_AD_ACCOUNT_ID` = `act_1843729196384751`.
7. Open jobvance.io/marketing-admin and press **Sync now**. Figures appear within a few seconds.

Both secrets are needed: without the account ID, the page cannot check currency or which account an ad belongs to, so it treats Meta as not connected.

Never paste the token into chat, a document or the page. If it leaks, go back to step 5, revoke it and generate a new one.

## Data

- Tables: `jobvance_marketing_*`, migration `20261024090000`. There is no cron migration.
- Ideas, files and the four live launches are seeded from the 23 and 24 Oct receipts.
  - Their live status and figures stay unknown until the first complete sync.
- New films are added by the ad team when they upload them.
- Money is stored in paise (integer minor units).
- Meta day boundaries follow the ad account's time zone (IST).
