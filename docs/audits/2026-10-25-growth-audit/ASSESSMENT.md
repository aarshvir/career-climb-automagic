# 25 October: submission and growth audit

Owner asked Codex to coordinate Claude's IndexNow/Search Console submissions, identify the actual status of all 37 sitemap URLs and continue a multi-aspect platform/growth audit.

Google's native Sitemaps page confirms submitted/read 25 October, Success, 37 discovered URLs. Claude's actual POST tool response at 16:05:33.900 UTC records all 37 submitted to IndexNow with HTTP 202. Per [IndexNow documentation](https://www.indexnow.org/documentation), 202 means received with key validation pending; it does not establish indexing. Codex verified the existing receipt and made no duplicate submission.

Codex individually inspected all 37 URLs in native Google URL Inspection at approximately 16:09–16:14 UTC, checking every displayed inspected URL against the intended sitemap URL. **14 indexed; 23 not indexed**: 3 crawled/currently not indexed, 10 discovered/currently not indexed, 9 unknown to Google, 1 alternate canonical. The aggregate summary with six indexed URLs is stale as of 16 October and must not be used as a current count.

Indexed pages:

- /, /job-loop, /check, /pricing, /how-it-works, /for-students, /faq, /walkthroughs, /guides.
- /guides/cv-job-description-evidence, /guides/student-projects-on-cv, /guides/role-filtering-before-applying, /guides/reuse-second-application, /guides/application-tracking-follow-up.

All 37 current public pages passed actual HTTP 200, self-canonical, no-noindex and one-H1 checks. About's Google exclusion uses its 12 August crawl with the old homepage canonical; current HTTP and rendered DOM both correctly self-canonicalize to /about. Existing daily request coordination should skip all 14 indexed URLs. Three already-requested pages remain excluded; twenty other pages are still queued for later requests within Google's quota. Submission is not guaranteed inclusion; repeated requests do not accelerate crawling ([Google guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)).

The private owner report covers current native Meta results matched to Windsor, aggregate signup/activation/Live-versus-Test billing, scheduler health, current authenticated monthly quote, native 100-paid admission, security advisories, public availability, stale founder payment labels and the unconfigured read-only marketing connection. Private business figures and candidate/credential data are not published here. Detailed dated evidence, all 37 rows/CSV and an interactive report remain outside Git under ../jobvance-repair-evidence/growth-audit-2026-10-25/; findings were shared with Claude in the existing coordination directory and on PR28.

The existing marketing heartbeat was updated and read back active every four hours, with daily index reconciliation and meaningful-change notifications only. It has no fixed end date. This does not extend ad spending, authorize scaling/publication or recreate the expired product automation. A fresh sanitized observation was appended to the existing local growth store without dispatch or old-policy assessment.

No new candidate, checkout purchase, provider generation, ad/experiment/budget/asset mutation, DB migration or runtime release occurred. Current source remains v54. Existing payment/test/browser evidence keeps its original scope; no new unassisted first/second/natural-repeat, revenue, NPS, virality, all-browser or live mobile acceptance is implied. The requested responsive override did not change actual 1920px width and was reset; that attempt is not a mobile pass. Wider discovery, repeated-day usefulness, full conversion attribution and other tracked product requirements remain open.

