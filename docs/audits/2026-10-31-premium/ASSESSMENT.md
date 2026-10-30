# Owner-selected newer premium release — v65

Published at **2026-10-30 20:25:45 UTC / 31 October 00:25:45 Dubai** to https://jobvance.io. PR37 final head `b999ca3b0f8f872f89c8ad704617c019c69e39dd` merged as `9915c24154e80c8b749f26bd2016d0e082e2ca34`; the complete merge tree equals the reviewed candidate. Sites v65 uses the pushed reviewed head b999ca3.

The owner directly requested the social-preview fix, final review and publication of the newer version once technical checks passed. Earlier specialist scoring did not pass the all-12-at-95 gate: Claude reported an average improvement from76to90 and a best lowest score86. This release records the later publication authority; it does not relabel those scores as passing or as customer acceptance.

## Result

The newer green/Geist design, product-window hero, pricing/account panels, navigation, footer, guides/help/audience pages, icons and metadata are public. The owner's end-to-end H1 and best-matching-jobs/role-specific-CV lead remain. Signup has per-field feedback using the existing validators and client attempt limiter. One-time CV passes retain their prices, allowances, durations and purchase paths in a native disclosure with prices visible while closed. Account-gated /check is noindex and excluded from the36-URL sitemap;37 routes are still prerendered. No fresh Google indexing inspection or submission is claimed.

Claude supplied the final one-line social-check correction while Codex was checking for competing edits. It replaces the obsolete onboarding-description prefix assertion with the approved lead, retaining the image, metadata, route-byte and account-required checks. Codex did not edit the active premium checkout.

## Verification

- Exact-head CI41121622603/job124288921320 passed all steps, including tests, TypeScript/lint, Deno boundaries, build, hosting and audit. The independent full local run passed3665tests/207files at the runtime-identical parent9211f1f; the only final change is the check assertion. TypeScript passed; lint had0errors/50warnings.
- Two additional independent SDK-mocked cases passed at the final head: the sixth valid auth attempt is blocked and the minute reset permits another; expired pending-confirmation credentials are not reused and the setup destination is preserved. Existing confirmation, original-session/lifecycle/checkout consent and duplicate-purchase protections passed. This is not a genuine confirmation-email or paid-provider acceptance test.
- Serial production build:37pages/20guides, zero external prerender requests; hosting/security/MIME/UTF-8-and-alias-byte/cache/HEAD/canonical/not-found/project checks passed. Worker2180183/3145728compressed bytes. Social checks passed37page metadata sets and both1200×630 PNG routes.
- Live158HTTPresponses all200:113raw exact and45application exact apart from the narrowly recognised appended CloudflareJSDtail. All68JS/17CSS responses and declared security headers matched the built Worker. This is not raw HTML parity.
- Actual live desktop1440×900 and phone390×844 checks retained the H1 and no horizontal overflow (document widths1425/375). Anonymous signup has5required16pxinputs. SelectedSprint opens the disclosure, all9/19/39prices remain visible, and all three sign-in-to-buy return paths are exact. No live form/provider/checkout/payment submission or ad-tagged QA traffic.
- The public homepage contains the existing Meta Pixel script. Pixel code/CSP/core auth/security/contact helpers/public configuration and the complete backend tree are byte-identical to publicv64. Pixel DOM presence is not a positive conversion receipt or attribution proof.

## Preserved boundaries and rollback

Native backend versions remain ACTIVE: control41, worker38, OAuth26, billing25, webhook27, admin26, track1 and meta-conversions3. No migration was replayed and no financial/candidate/ad/funding/permission/outreach state was changed. Original29/59/99monthly plans, whole-unit9-currency catalogue/history, consent, source/variant ownership and review/download controls remain. Genuine useful first/second/repeated-day journeys, real devices, positive commerce/registration delivery and conversion lift remain open evidence gaps.

Retain savedv64 `appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_dd79ccb6a54c8191b906664521aa29e3` and pushed tag `jobvance-before-premium-2026-10-31` at runtime4e84f9c. Rollback does not restore external events or financial/customer data and must not delete receipts or replay migrations.

Private sanitised evidence: `jobvance-repair-evidence/premium-pr37-release-2026-10-31/` plus the earlier independent review folder. The v65 deployment time is a separate measurement boundary from v63 and v64. No identical-runtime deployment is needed for these documentation receipts. Ongoing Claude/Codex collaboration and the same four-hour follow-up continue.
