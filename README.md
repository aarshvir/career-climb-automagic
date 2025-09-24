# Jobvance SEO + Growth Launch Plan

## 1. Executive Summary

**Top opportunities**
- Ship foundational technical SEO (robots, sitemap, canonical/meta framework, structured data) to unlock indexation, rich results, and cleaner analytics.
- Rebuild information architecture around three pillar guides and 12 cluster posts to capture "automated job search" demand across the funnel.
- Launch white-hat backlink and PR engine anchored in data-driven assets (automation benchmarks, calculators, templates) to build authority.

**Estimated impact (90 days)**
- +40–60% increase in qualified organic sessions from automated job search, resume tailoring, and outreach keywords.
- +25% lift in demo requests via improved BOFU copy, social previews, and conversion tracking.
- 15+ authoritative backlinks, 3 podcast features, and baseline rankings for new guides.

**P0 backlog highlights**
1. Deploy SEO head middleware (canonical, OG/Twitter, structured data) and robots/sitemap (see `/components/SeoHead.tsx`, `/seo/robots.txt`, `/seo/sitemap.xml`).
2. Publish Home/Product/Pricing rewrites with embedded schema and social cards.
3. Launch pillar + cluster content calendar and integrate into sitemap and internal nav.

**Core Web Vitals targets**
- LCP ≤ 2.5s (mobile 75th percentile) via hero image optimization, preloads, and font strategy.
- INP ≤ 200ms through interaction audit, script deferral, and hydration splitting.
- CLS ≤ 0.1 with reserved media aspect ratios, font fallback tuning, and consistent component skeletons.

**E-E-A-T upgrades**
- Author bios + About/Contact refresh for transparency.
- Organization, Product, FAQ, and WebPage schema with contact points and review snippets.
- Case studies, testimonials, and compliance messaging embedded in site copy.

## 2. Technical SEO Audit (crawl-informed backlog)

| Issue | Evidence/URL | Severity | Recommended Fix | Effort |
| --- | --- | --- | --- | --- |
| Robots/sitemap missing | jobvance.io root | P0 | Add `seo/robots.txt` and XML sitemap with priority URLs | S |
| No canonical/Open Graph control | Sitewide | P0 | Introduce reusable `<SeoHead>` component for canonical, OG/Twitter, hreflang-ready meta | S |
| Structured data absent | Core templates | P0 | Ship JSON-LD for Organization, WebSite + SearchAction, WebPage, SoftwareApplication, FAQ | S |
| Social previews inconsistent | Sitewide | P0 | Standardize meta descriptions, OG images, and CTA copy via SeoHead | S |
| Hero assets unoptimized | Home/Product | P1 | Deliver responsive WebP hero with preload + fixed dimensions | M |
| Fonts blocking render | Sitewide | P1 | Preconnect/optimize Google Fonts, consider self-host critical fonts | S |
| Analytics coverage gaps | Sitewide | P1 | Implement GA4, GSC, conversion events + dashboards | M |
| Thin IA & internal links | Blog | P0 | Publish pillar & cluster content, update nav and sitemap | L |
| Accessibility guardrails lacking | Sitewide | P1 | Adopt WCAG 2.2 AA checklist, regression QA, semantic markup | M |
| Core Web Vitals risk | PSI + heuristics | P0 | Optimize hero LCP, interaction readiness, layout stability | M |
| Backlink/PR plan absent | Off-site | P1 | Launch white-hat campaigns, assets, outreach templates | M |

Full backlog with owners and KPIs lives in [`backlog.csv`](./backlog.csv).

## 3. Commit-Ready Code Changes

> These snippets assume the existing Vite + React Router setup with `react-helmet-async`. If you migrate to Next.js, swap `<Helmet>` for `<Head>` and `useLocation` for `useRouter` while keeping the same helpers.

### `/seo/robots.txt`
```diff
+User-agent: *
+Allow: /
+
+# Block noisy internal search parameters
+Disallow: /search?
+Disallow: /api/
+Disallow: /admin/
+Disallow: /dashboard/export
+
+Sitemap: https://jobvance.io/sitemap.xml
