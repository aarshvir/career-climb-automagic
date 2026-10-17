# Account-first Job Loop share preview correction

Prepared locally on 17 October 2026 after a Facebook preview exposed the legacy image's “No account needed” message. This file records a focused asset/metadata correction; it is not a deployment or Facebook cache-refresh receipt.

The editable local sharing-card generator now produces a 1200×630 Job Loop card: create your account → set your search → review your matches. It describes CV upload/building, role/location/schedule choices, connected sources and document review. It contains no guest-access, beta, customer-history or guaranteed-results claim. Existing brand colours and the simple mark are retained.

- New social image URL: `https://jobvance.io/og-job-loop-account.png`.
- The legacy `/og-jobvance.png` bytes are also corrected. Previously cached third-party attachments can still retain their old image until replaced/refetched; a repository change alone does not clear Facebook's cache.
- Both PNG files are **50,322 bytes**, dimensions **1200×630**, SHA-256 **`1b13f8b7fd661ad429b95d09af60a53e9150f23a013ab60eeea258b2ce3ef6cf`**.
- The `/onboarding` initial server HTML now uses “Jobvance — automate your job search” with an account-first CV/preferences/recurring-search description, and explicit matching OG/Twitter image and alt metadata.
- Public prerendering replaces fallback OG/Twitter titles/descriptions with route-specific metadata, avoiding duplicate tags. All 38 route-specific titles remain intact.
- The shared `SEOHead` default now references the real versioned image instead of a missing `/images/og-default.png` asset. Custom image descriptions remain page-specific.

Validation: visual inspection confirmed legible text and three left-to-right panels; application TypeScript, full production build, all 12 hosting groups, and `scripts/check-social-preview.mjs` passed. The bounded share check verifies one title/description/image per OG/Twitter field for all 38 public pages, the `/onboarding` account-first fallback, and exact PNG bytes served by the generated worker at both URLs. Generated worker gzip size is 2,883,545 bytes, below the existing 3 MiB limit. The build log is retained privately as `social-preview-account-build.log`.

No backend, database, payment, recurring-job behaviour or provider configuration changed. No full test-suite rerun, social publication, ad spend or deployment was performed for this asset/metadata subtask. The coordinator owns release and Facebook preview replacement.
