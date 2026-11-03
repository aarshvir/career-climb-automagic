# v76 post-signup recovery review and release

Public https://jobvance.io was published as v76 at 2026-11-03T20:18:56.167265+00:00 / 4 November 00:18 Dubai. Reviewed source `27c206db4d81bf9385617613abcfcc3b9d17ef32` from PR55 merged as `354d44e3636c8a246d98ff4da9061bd4dc93007d`. Full candidate/merge tree `03b4f2937a0bf0222ba48925e1f9f08b0a05e694` matches exactly. Saved version `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_cbe63182bc38819187e25a731cf26a94` and deployment `appgdep_6aea4198bf20819189c0c4db5f795523` succeeded; public audience and custom domain were retained.

## Request and verified problems

The owner's direct continuation and standing authority covered independently reproduced blockers, a bounded repair and publication after checks. Codex temporarily owned only this frontend recovery patch, fictional tests, review and release. Claude remains the ongoing product/design writer outside that patch; producer local commits must be preserved.

Two conditional defects were independently reproduced. First, the installed Supabase SDK can retain an initialization error from a failed confirmation callback after a later successful password sign-in has established a current session. Previously, `readAuthSession` threw that historical error before checking the current session, blocking the owned onboarding read. Second, a passive `get_existing` read that remained pending kept the first onboarding question behind a spinner with no retry action. These are source/SDK/mock reproductions. They do not establish what happened to any live account or why observed visitors stopped.

The helper now reads the current SDK session after initialization. It still rejects a current session-read error and retains the historical initialization error when no current session exists. Owned requests still require verified current-user and owner checks. Only the onboarding passive read receives a 20-second UI watchdog. Expiry invalidates the load epoch before showing a connection message and the existing explicit retry action. Matching timers clear on completion/unmount; old results cannot rebind snapshot/generation, clear a newer timer/error or recover revoked owner/session authority. No automatic retry, global request timeout, transport cancellation or backend write was added.

Two production files and two test files changed: `src/utils/authSession.ts`, `src/pages/LoopOnboarding.tsx`, `src/__tests__/auth/initialization-recovery.test.tsx` and `src/__tests__/loop-onboarding.test.tsx`.

## Validation

- Root full suite: 3,850 tests / 218 files. Both affected suites: 54 passed. The same maintained cases on the baseline produced 9 failures / 45 passes; these are regression variants and guard assertions, not nine distinct observed customer defects. The SDK users, sessions and service transports are fictional or mocked.
- Two independent read-only reviews found no blocking findings. They checked stale initialization recovery, current-session/verified-user rejection, old completion/rejection versus retry deadlines, unmount/session invalidation and retained same-tab answers.
- Exact-source CI `41707332521` / job `126166001392`: all steps passed, with the pinned SDK, frozen Deno, auth/tracking and full security audit gates retained. TypeScript: zero errors. Lint: zero errors / 50 inherited warnings. Full moderate audit: zero vulnerabilities.
- Production build: 38 public pages, 20 guides, 38 structured-data hashes; prerender made zero external requests. Hosting and social preview checks passed. Compressed Worker: 2,203,498 / 3,145,728 bytes.
- Anonymous live HTTP verification at `2026-11-03T20:19:17.239Z`: 164 paths passed. Of these, 118 were raw exact; 46 HTML responses matched the application body with only the recognized appended Cloudflare tail and matching security headers. This is **not raw HTML parity** or archive-byte parity. The HTTP check executed no JavaScript and used no ad-tagged QA.
- Corrected final live 390px CV Check signup rendering is saved in `live-390.json` and `live-390.png`: name/email/password required and enabled, phone optional and enabled, all input fonts 16px, submit enabled, scroll width 375px with no horizontal overflow. Root also reported an earlier 1280px pass. The first capture labelled 390px was actually 1280px; it was replaced with the actual 390px capture and is not counted as independent mobile proof. Local 320px/390px production layout checks are prior evidence, not new live private recovery acceptance.

The browser readback exercised anonymous rendering only. No live account/form, email, OAuth, password update, AI/provider, checkout or payment submission occurred. No real-device, customer, provider, Meta or causal conversion-lift acceptance is claimed.

## Boundaries and measurement limits

Seventeen protected objects match base `eb7b4ab244ce4cf741ddd0a036b5049bbdea6593`, including whole Supabase tree `25fb07421709df28cf4914f62e7f1e33dcd53a2c`, AuthContext, MvpApp, optional-phone contact, Pixel/commerce/UK consent, account-return, parser/CV evidence, home/product copy, CSP, packages/lock and CI. All owner/session/epoch/lifecycle/consent/approval guards remain. No backend/schema/migration/function deployment, migration replay, ad/funding, permission, outreach, indexing, payment or paid-provider action was performed. Existing commerce migration `20261030041314` and meta-conversions v3 remain; receipts are never a reason to replay migrations.

Fresh count-only2026-11-03 20:24:51UTC: Dubai4Nov all requested counts0 (new-day zero baseline), UTC3Nov122Meta/120strictPurchase/2classifiedsignups/1firsttouchlinked; LIVEprovidercheckout/paid/eligiblefirstcycles/exactmatchedPurchaseclaims-sent/commerce0. PublicCVCheck entry20:22:57UTC all0 afterv76; no post-v76 ad exposure captured yet. Rollover is not a trigger and existing daily milestones remain deduped. The new release cutoff is `2026-11-03T20:18:56.167265+00:00`. Confirmation/sign-in and an absence of recorded usage do not identify a failing field, provider or error, and generic events do not prove either repaired condition occurred. No attribution or conversion-lift claim follows from this release.

## Rollback and handoff

Saved v75 `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_bab3d9b34014819186752590b0c1b3e8` remains the independent frontend rollback. The local pre-repair tag `jobvance-before-post-signup-recovery-2026-11-03` at application source `f5b3b2c3c40981534fab99f58c646c78d1d594d7` is retained and is not claimed pushed. A frontend rollback cannot restore external/customer/financial data or events; additive schema and durable receipts stay.

The bounded PR55/v76 repair/review/release baton is FINISHED. Claude resumes ongoing sole product/design ownership; future PRs reconcile current main and preserve producer local commits. Separately authorized PR53/PR54 review/release is not included or certified complete here. Shared release/baton files are coordination, not native chat delivery or ACK. Documentation alone does not require another runtime deployment.
