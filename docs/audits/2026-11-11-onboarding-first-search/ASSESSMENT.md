# Onboarding and first-search release assessment — 11 November 2026

PR58 is published as v80; the five-line phone-header follow-up PR60 is published as v81. The current public site is https://jobvance.io/onboarding. Both complete merge trees equal their reviewed source trees. This is a completed bounded repair/review/release, with the wider customer-acquisition work continuing.

## Behavior

Signed-out visitors choose roles and locations before signup. These two preferences stay on the device for up to two hours, are consumed once, and are shown for review after sign-in. Existing saved setup and recovered owned drafts take precedence.

After a saved CV, the first-search panel lists up to twelve literal CV lines. Only the exact displayed, ticked lines are submitted after explicit accuracy and sharing confirmation. Changing the selection clears confirmation. Each save and the one-use source-based search continuation are scoped to the initiating owner, sign-in authority/readiness, lifecycle, source/profile and draft revision, and acknowledged record version. Saves advance only on an exact version+1 acknowledgment. A rejected, partial or uncertain save stops the batch; existing explicit review/retry remains available. The existing start-run API has no expectedVersion field, so this does not claim backend atomicity across unseen cross-tab changes.

Empty suggestions open and focus the existing manual-fact form with confirmations unchecked. Early and final onboarding validation catches the existing server-disallowed control/direction characters in roles, locations, private terms, name, contact and CV text before initialization/save, reports the CV line, and retains text unchanged. Tabs, line breaks, accents and ordinary right-to-left letters remain supported. PR59 contains the same repair and was closed as superseded; its branch and commit remain preserved.

Final live readback found a separate signed-in entry-header overflow: a 360px document extended to 454px because the account controls could not fit beside the logo. PR60 adds five CSS lines, scoped to entry headers below600px, to wrap the header/account controls. The onboarding content itself fit. This correction preserves account actions and keyboard access.

## Evidence

- PR58 exact head `2d1d419c9feaa242d746f5dd887fe2cb0d760de8`, merge `22157a7aa0f2928ae7e1754d49071530d7467301`, tree `263faadfc90bac0eaf9b4471e96e9694cf5a3ed5`; CI42922895002/job130201916619: all18steps pass.
- PR60 exact head `a4ae73dd1afff1f1ebd0640fffbaa57e7c5f64ea`, merge `743bdecd99df1c600463357b272719af47b972c6`, tree `b05de676efea1f5a67e31569d47f9780fe293f4d`; CI42924839905/job130208572321: all18steps pass.
- 3,950 maintained tests/225 files; TypeScript0errors, lint0errors/51warnings, full moderate dependency audit0. Original pinned SDK and frozen Deno authentication/intake guards retained. No new dependency or CI-policy changes.
- Production build40pages/21guides/39sitemap URLs/48JSON-LD hashes; hosting12groups and social checks pass. v81 compressed Worker2,279,378 of3,145,728bytes.
- PR58 protected audit109/111objects identical; intended onboarding and exact authored eight-line JobLoop CSS exceptions. PR60 changes only its five CSS lines; all2,187other Git entries are identical. Whole Supabase tree `25fb07421709df28cf4914f62e7f1e33dcd53a2c` is unchanged. Auth/v76 recovery, owner/session/lifecycle/consent/approval, Pixel/commerce, billing, home H1/metadata, dependencies and CI protections remain.
- Each release's171live HTTP comparisons pass:124raw exact and47HTML application exact with only the recognized Cloudflare-injected tail; security headers match. This is not raw HTML parity or verified crawler Security Events.
- Actual production-built anonymous local preference-to-signup navigation passes at375px and1440px, including keyboard navigation and16px inputs, without signup/OAuth submission. The actual private JobLoop component is exercised only in a network-blocked synthetic fixture: exact selected facts, hidden thirteenth exclusion, consent reset, one mocked rules run, and opened/focused manual fallback with unchecked confirmations. These do not prove live private/provider/search-quality/payment/customer acceptance.
- Actual local header checks pass320/375/1440px. Live existing-session/saved-setup readback fits375px and1920px without data changes; no product console errors captured. A later320px live override was ineffective and is not certified. Owned tabs/servers closed, viewport reset, user tabs preserved.

## Conversion and continuity

At10November23:45UTC, Dubai11November requested daily counts remain0. UTC10November has20Meta-tagged/19strict Purchase-tagged sessions and2classified/first-touch-linked signups, already reported. Genuine LIVE provider checkout, classified paid, eligible first-cycle, exact matched Purchase claims/sent and commerce totals remain0. Stored classifications/tags are not verified people, ad-set attribution or causal lift. The observed profile-to-fact-confirmation gap guided the work; individual departure causes remain unconfirmed.

Health: operations checks0, enabled scheduler fresh23:45UTC, paid0/100 and free5/10. November actual and committed eachUSD0.030451/cap50; October actual0.527938/committed0.753914 retained separately. No paid provider call or new spending authority.

v80 cutoff is10November23:31:20.669367UTC; v81 cutoff is23:45:05.940262UTC. Initial CVCheck entry baselines are0 and kept separately from v75–v79. No relevant new ad exposure occurred during these releases, so the funnel was not rerun. Fromv80, generic onboarding clicks include preference controls and cannot identify authentication/provider attempts. The canonical watch retains all19delivered dedupe keys and prior daily/accounting/intervention/finding histories.

Savedv79 andv80 plus local source tags provide frontend rollback; tags are not claimed pushed. Frontend rollback cannot restore external/customer/financial data/events. Never replay migrations. No real account/form/OAuth/AI/provider/checkout/payment/ad-tagged QA or backend/schema/function/migration/ad/funding/indexing/outreach mutation occurred.

Codex's bounded PR58/PR60 baton is FINISHED. Claude resumes sole ongoing product writer from current main, preserving producer commits. Remaining runtime follow-ups include per-verb ownership checking, question validation/complete drop counts, all-rejected reassurance and profile/rewrite keep-original collision; broader first/second/repeated-day use and search-quality work remain open. Delivered GitHub/shared coordination is not a native chat ACK. The existing four-hour automation continues active delivery and the first genuine checkout/payment watch; no duplicate automation/chat/writer.
