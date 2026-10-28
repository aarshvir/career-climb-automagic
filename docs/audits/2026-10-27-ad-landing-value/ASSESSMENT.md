# PR34 ad landing value — release assessment

PR34 is deployed as public v63 at 2026-10-27T17:44:00.120558+00:00. Runtime source add47189c48ccb989e7d7a7aa883fe7c601584d4; exact reviewed PR head dc9afba2cbe6cd7571117804471e4525b3f3f953. The GitHub merge tree is identical to the tested PR tree. This release contains the current visual design, not the private premium redesign.

The three-file change presents the Automated Job Loop benefits before the signup fields, retains the existing price and current three-per-month free tailoring allowance, and folds the previous three steps into native, initially closed details. Auth submission, Google/in-app guidance, confirmation, contact fields, destination handling, tracking, ads, billing and backend files are unchanged by the exact diff.

Independent source review found no blocker. The existing auth tests pass unchanged plus two new cases. One new test title overstates confirmation coverage: it tests ordinary signin, while confirmation gating is verified by source and existing tests. No broader browser confirmation-flow claim is made.

3484 tests in190 files and application TypeScript passed. PR-head CI40551173708 succeeded. The first local build timed out fetching an unchanged pinned SSR module while other checks were active; the serial retry passed without a source/guard change. Final build:37 public pages,20 guides,12 hosting groups, social-preview checks; compressed Worker2999610/3145728 bytes.

Live checks fetched134 paths:37 public HTML pages,75 JS,15 CSS,5 SPA entries and sitemap/robots.92 responses match local raw bytes.42 HTML responses contain only an appended Cloudflare JS-detection tail beyond the exact local application HTML; raw hashes and exact tail recognition are in private live-http.json. An initial verifier incorrectly required unmodified edge HTML and failed; its strict application-prefix/tail comparison corrected the verifier, with no production change.

Actual live desktop1440x900 and phone375x812 views show the benefits, pricing, allowance and unchanged fields. The native disclosure opened and closed by keyboard. Ordinary signin has no benefit list and only email/password. No form, account, contact, Google, provider or checkout submission occurred. Accepted raster dimensions are1425x891 and360x780. Earlier local375 screenshots are not uncropped initial-fold proof.

Publication: saved v63 appgprj_6aca1c378fb88191aa656f8a85eee68a~appgver_a655ba53ec9481918a03f4c6c70c77e7; deployment appgdep_6ae0e2cc209c8191b8a2f05cb69897ff succeeded. Source helper pushed exact merge source before saving the archive. One packaging attempt refused the expired credential before work; renewal and the subsequent package succeeded. One lost helper-session output was reconciled; only the verified waiting helper was terminated before restart. No uncertain save/deploy duplicate was issued.

Rollback tag jobvance-before-ad-landing-value-2026-10-27 points to da9d69e; saved v62 is retained. Source/site rollback is not database, files or merchant restoration.

Acquisition cutoff is 2026-10-27T17:44:00.120558+00:00. At17:44:49UTC the exact tracked ad-entry cohort had35 pre-release visits/0 first-touch-linked signups and0 post-release visits. No uplift or post-release conversion rate is established. Admin analytics starts26Oct05:48UTC; browser IDs, Meta LPVs and verified unique people differ. Allow email-confirmation lag and compare the same campaign/landing cohort at later existing-monitor wakes, retaining staff/test exclusions and documenting unclassified traffic.

Full hosted signup-to-useful-result, natural multi-day acceptance and the separate premium owner-preview condition remain outside this bounded release. Backend versions, schema, payments, ads, capacity and provider usage were not changed.

