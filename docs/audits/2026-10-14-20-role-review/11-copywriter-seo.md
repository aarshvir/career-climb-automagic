# 11 — Copywriter & SEO review

**Score: 76/100 · Growth · Medium confidence · 14 October 2026.** This is readiness within copy, content and organic discovery, not measured search success. Source snapshot: e661c6493c30c88f2487800ff38aa10c46c9aae6; published runtime: 57713fb1cb15b29be8d6dc745e3c87bcb718c4af.

## Evidence and limits

I independently read the public routes, audience content, 20-guide data/template, prerender/hosting pipeline and measurement contract. Read-only HTTP checks observed real HTML, unique headings and self-canonicals on /, /guides, student and MBA guides, /job-loop, /pilot and the professional landing page. The sitemap returned 38 public URLs; an invented route returned 404; /loop returned a noindex header; /guides/ and /blog resolved to /guides. The MBA article contained BlogPosting plus Organization/WebSite/WebPage/BreadcrumbList JSON-LD. No browser viewport, account, paid call, deployment or customer data was used.

Search Console, Bing Webmaster Tools, crawler logs, actual indexing, rankings, traffic, rich-result eligibility and conversion rates were unavailable. A web fetch timed out once; direct HTTP checks subsequently succeeded. That is not evidence of a production outage.

| Criterion | Score /20 | Basis |
|---|---:|---|
| Honest and concrete capability claims | 19 | ProductPage.tsx:38–48, 95–112, 157–166 distinguish wording matches, fictional examples, consent and manual submission. |
| Audience relevance and message precision | 17 | job-loop-audiences.ts:5–35 covers projects, MBA pivots, lateral moves and 5–10 years; one MBA label is ambiguous. |
| Crawl, canonical and structured-data foundation | 19 | Observed public HTML; manifest-driven prerender, redirects, genuine 404 and private noindex. |
| Content usefulness and connected journeys | 15 | Original examples, source links, takeaways and related guides; weak persona-to-guide handoffs and generic final actions. |
| Organic measurement and learning | 6 | Guest visits/checks explicitly untracked; no reviewed search-console evidence or content attribution. |

## Findings and acceptance

### SEO-01 · P1 · Establish an organic learning baseline
**Source-confirmed:** supabase/migrations/20261012181402_jobvance_admin_snapshot.sql:77–78 explicitly marks guest visits/checks and download completion untracked. CareerGuides.tsx:22–26 supplies generic links without a content-origin identifier. The public no-account task is therefore missing from the measured business funnel; registered-account milestones cannot establish guide effectiveness.

Create a small route-level weekly report: search impressions/clicks and indexed status from owner-verified Google/Bing tools, then privacy-reviewed first-party counts for guide-to-check, review reached and approved-download action. Record the initiating route and selected audience, never CV text, vacancy text or freeform search queries. A download click is not completed file delivery. **Accept:** named owner, dated baseline for the 38 URLs, explicit unknowns, QA traffic excluded and one test journey represented once. **Effort:** 1–2 engineering days plus owner access/privacy decision; existing tools first, no required paid service. Pilot needed.

### SEO-02 · P2 · Join the audience pages to the existing guides
**Source-confirmed:** AudienceLanding.tsx:17–23 offers the check, overview and account but no relevant guide links. CareerGuides.tsx:25 sends every guide to /check without audience context and “Explore saving and reuse” directly to /loop. Readers lose their stage context or enter an account gate before the explanation.

Add two task-specific guide links to each audience page; preserve explicit student/MBA/professional context in the check link; point an informational saving CTA to /job-loop. Keep the common guide library and workflow. **Accept:** each audience reaches its relevant guide and free check with stage preserved; no unexpected sign-in for “explore”; links remain real anchors in initial HTML. **Effort:** 0.5–1.5 engineering days; depends on shared route conventions. No new vendor cost. Validate with the pilot.

### SEO-03 · P2 · Improve four anchor guides instead of publishing another twenty
**Source-confirmed:** career-guides.ts:5–25 supports prose, bullets and fictional examples, but no reusable task artifact. The existing keyword-map.csv:13–14 and 90-day-calendar.csv:2–9 describe older automation/outreach positioning and 2024 publication dates; they should not silently drive the current editorial plan. This is a planning conflict, not a live capability failure.

Build one shared “one vacancy, defensible evidence” worksheet: requirement, original passage, personal contribution, measured/projected result, uncertainty, approved wording and next action. Attach worked variants to cv-job-description-evidence, student-projects-on-cv, mba-career-pivot-cv and reuse-second-application. Link privacy/source-verification guides as supporting steps. A lateral-move professional example should use transferable delivery evidence without requiring a career switch. **Accept:** four useful completed examples, one copyable worksheet, exact citations, an honest limitations paragraph and pilot feedback on task usefulness. Record publication changes and replace the old keyword/calendar plan. **Effort:** 0.5–1.5 engineering days plus 2–4 editorial days; fictional fixtures and editorial owner required. No model/search spend needed. Value is a hypothesis until pilot use.

### SEO-04 · P2 · Give each guide its own maintenance record
**Source-confirmed:** career-guides.ts:59–60 assigns every article the same publication and modification dates; editorialPolicy:28–32 supplies one shared source-check date. CareerGuides.tsx:67,75 publishes those dates. This is not proof that today's dates are false, but future edits cannot be dated accurately per article with this model.

Move dates into each guide and retain an internal reviewer/source-check record and next review trigger, especially for UAE requirements and product instructions. An organization byline is acceptable; do not invent advisers or credentials. **Accept:** changing one guide changes only its dateModified and sitemap lastmod; unchanged guides retain dates; source changes have an owner. **Effort:** 0.5–1 engineering day plus editorial maintenance; no recurring vendor cost.

### SEO-05 · P2 · Remove MBA admissions ambiguity
**Source-confirmed:** ProductPage.tsx:149 labels the link “For MBA applicants,” while /for-mba and job-loop-audiences.ts:16–18 describe job seekers during/after an MBA. **Inferred:** some visitors may expect admissions CV support. Change the link to “For MBA students and alumni” and align navigation, metadata and examples around employment. **Accept:** three pilot readers correctly identify the supported task without explanation; no admissions promise appears. **Effort:** 0.25–0.5 engineering day; editorial approval only. No vendor cost.

## Ordered plan and search boundaries

First establish the baseline; then fix guide/audience handoffs and the MBA label; improve the four anchor guides; add per-guide maintenance. Preserve the existing strong capability boundaries.

Google recommends prerendered accessible content and consistent canonicals ([JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)). Its [AI search guidance](https://developers.google.com/search/docs/appearance/ai-features) requires no special AI files/schema and includes AI-feature traffic in overall Web reporting. [Bing URL Inspection](https://www.bing.com/webmasters/help/URL-Inspection-55a30305) separates index status from live checks. [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots) distinguishes search access from training controls; OAI-SearchBot is allowed here. These official pages were checked on 14 October 2026.

Do not build automated blog volume, cloned persona products, keyword-stuffed ATS pages, fake expert bylines, paid SEO tooling or a proprietary “AI visibility percentage” now. Crawlable HTML and valid markup create eligibility; they establish neither indexing nor rankings, citations, rich results or job outcomes.
