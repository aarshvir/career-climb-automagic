# CV requirement parsing release — v67

Published **31 October2026 at15:22:25UTC /19:22:25Dubai** to https://jobvance.io. PR41 final head `be0dbbfc6121adcb2cc3120218216ebc2fef5702` merged as `55c6f2a0a80d437ac4382fdcb93bb518d73d87d9`; its complete tree `fbb31b326505e43f1953758cdaf476122f749399` is identical to the reviewed/built candidate.

## Result and review corrections

Method `english-literal-evidence-v6` recognizes more whole-listing structure and separates company/pay/perk/legal context from applicant criteria, retaining omitted source verbatim. Shared-verb task lists remain whole. English literal scope, exact UTF-16 source quotes,40-item cap, manual judgment and the existing method-bound review fingerprint remain. This does not verify qualifications, predict hiring or measure ATS/NPS outcomes.

Independent review reproduced four regressions in initial head abad832: two explicit applicant duty clauses were treated as employer blurb; a closing date and work-permit condition under newly recognized context headings disappeared from the review list. The corrected rules retain explicit applicant tasks, preserve deadline/condition manual review, and examine whole continued bullets before deciding omission. No original test was removed;12new guard cases supplement the24author cases. One draft private assertion was corrected because the baseline already split its employer-prefix clause; four defects are claimed, not five.

Current main6c1fc70 was integrated before source corrections, preserving PR38/39/40 consent, signup and full-audit/guarded-CI repairs. Only the parser and two test files differ from that main. The Site helper initially refused divergent old-branch/public history without overwriting anything; reconciliation retained both histories and the reopened helper succeeded normally. Claude's subsequent signup-copy branch/worktree was untouched.

## Verification and limits

- Exact-head CI41213927469/job124574413812 passed every step, including full3741tests/211files, application TypeScript/lint, pinned-auth guards, actual SDK Deno auth/tracking, production build/hosting and the unchanged full security audit.
- Independent local full3741tests/211files,152focused parser/adversarial cases and five private baseline/candidate fixtures pass; the four original private failures now pass. TypeScript passes; lint0errors/50inheritedwarnings. Authored source whitespace passes. No measured coverage percentage.
- Serial build37pages/20guides, no external prerender requests,12hosting groups and37metadata/two1200x630social PNG checks pass. Worker2184754/3145728compressed bytes.
- Live158HTTPpaths all200 at15:23:26UTC:113raw exact/45HTML application exact except the recognized appended CloudflareJSDtail. All68JS/17CSS and security headers match. The delivered CvCheck-Bs4jw77O.js is raw exact and contains methodv6. Not rawHTMLparity, browser execution or authenticated /check acceptance.
- No live form/account/provider/checkout/payment/AI request, ad-tagged QA or real-candidate processing. The original three-public-ad counts are dated author evidence and were not independently repeated on identical original bytes. They are not final accuracy, typical-output or customer-outcome evidence. Claude should rerun the final proof and live readback before changing P2/P3 claims.

## Boundaries, rollback and open work

UI/save/approval/export handlers, auth/contact requirements, UK advertising consent, Pixel/CAPI, CSP, all Supabase sources, migration20261030041314/meta-conversionsv3, billing/webhooks/entitlements and ad/funding/permission settings are unchanged. No backend deployment or migration replay.

Savedv66 and local tag jobvance-before-cv-parser-2026-10-31 at39d2989 remain; tag is not claimed pushed. Roll back the saved frontend independently of main history; retain applied schema and external/financial/event records. No identical runtime redeploy for receipts.

v67 is a new measurement boundary15:22:25UTC; keep earlier release cohorts separate. Root's bounded parser repair/release baton is finished. Claude resumes sole ongoing product/design writing, postrelease claims-ledger/live proof readback, and new PRs from current main. Broader hosted first/second/repeated-day quality acceptance remains open. Private evidence:jobvance-repair-evidence/cv-parser-pr41-review-2026-10-31/.
