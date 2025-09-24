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

> These snippets are ready to drop into a Next.js + Vercel stack. Static HTML equivalents are noted inline.

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
```

### `/seo/sitemap.xml`
```diff
+<?xml version="1.0" encoding="UTF-8"?>
+<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
+  <url>
+    <loc>https://jobvance.io/</loc>
+    <lastmod>2024-06-10</lastmod>
+    <priority>1.0</priority>
+  </url>
+  <url>
+    <loc>https://jobvance.io/product</loc>
+    <lastmod>2024-06-10</lastmod>
+    <priority>0.9</priority>
+  </url>
+  <!-- ...see file for full tree including guides and solutions -->
+</urlset>
```

### `/components/SeoHead.tsx`
```diff
+import Head from "next/head";
+import { useRouter } from "next/router";
+
+const SITE_URL = "https://jobvance.io";
+const SITE_NAME = "Jobvance";
+
+export type JsonLd = Record<string, unknown>;
+
+export interface SeoHeadProps {
+  title: string;
+  description: string;
+  canonicalPath?: string;
+  ogImage?: string;
+  noindex?: boolean;
+  structuredData?: JsonLd | JsonLd[];
+  openGraphType?: "website" | "article" | "product";
+  locale?: string;
+  twitterHandle?: string;
+}
+
+// buildCanonicalUrl, renderJsonLd, SeoHead component, and helper JSON-LD builders exported
+```

### `/public/jsonld/*.json`
- `organization.json`, `website.json`, `software-application.json`, `homepage.json`, `pricing-faq.json` provide drop-in schema examples for static deployments.

### Static HTML fallback
- Inject `<link rel="canonical">`, OG/Twitter tags, and `<script type="application/ld+json">` blocks directly into `<head>` of each HTML template following the structures above.

## 4. Information Architecture & Keyword Map

**Site tree**
```
/
├── Product
├── Features
│   ├── Resume Tailoring
│   ├── Auto Apply
│   └── Tracking
├── Solutions
│   ├── Job Seekers
│   ├── Career Switchers
│   └── New Grads
├── Pricing
├── Case Studies
├── Blog
├── Guides / Academy
│   ├── Automating Your Job Search (pillar)
│   ├── AI Resume Tailoring (pillar)
│   └── High-Volume Applications (pillar)
├── FAQ
├── About
└── Contact
```

Full keyword-to-URL mapping (primary & secondary keywords, intent, title/H1/meta) is documented in [`keyword-map.csv`](./keyword-map.csv). Use it to align nav, breadcrumbs, and internal linking.

## 5. On-Page Rewrites (ready for implementation)

### Home (`/`)
- **Title**: Jobvance | Automate Your Job Search and Win Interviews
- **Meta**: Streamline discovery, resume tailoring, and outreach with Jobvance's AI job search copilot.
- **H1**: Automate Your Job Search with Jobvance
- **Hero copy**: "Surface the right roles, tailor every resume, and follow up on time—without losing your voice." Primary CTA: "Start Free Trial". Secondary CTA: "Book a Demo".
- **Proof block**: "4.8/5 rating across 112 reviews • 12K+ tailored resumes per month".
- **Highlights**: Automated sourcing, resume tailoring engine, outreach & tracking, compliance guardrails, analytics dashboards.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Automate Your Job Search with Jobvance",
  "url": "https://jobvance.io/",
  "description": "Jobvance automates job discovery, resume customization, and outreach so candidates land interviews faster.",
  "isPartOf": {
    "@type": "WebSite",
    "name": "Jobvance",
    "url": "https://jobvance.io"
  },
  "about": {
    "@type": "Thing",
    "name": "Automated job applications"
  }
}
</script>
```

### Product (`/product`)
- **Title**: AI Job Application Software | Jobvance
- **Meta**: See how Jobvance unifies sourcing, tailoring, and outreach with measurable results.
- **H1**: One Workspace to Run Your Job Search
- **Intro**: Highlight three pillars (Source Smart, Tailor Fast, Engage Personally).
- **CTA**: "See Jobvance in Action" with demo booking link + secondary "Compare Plans".
- **Credibility**: Customer logos, quantitative outcomes, SOC2-ready messaging.
- **Feature sections**: Fit scoring, resume blocks, outreach cadences, analytics, compliance.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Jobvance",
  "operatingSystem": "Web",
  "applicationCategory": "BusinessApplication",
  "url": "https://jobvance.io/product",
  "offers": {
    "@type": "Offer",
    "price": "29",
    "priceCurrency": "USD",
    "url": "https://jobvance.io/pricing"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "112"
  }
}
</script>
```

### Pricing (`/pricing`)
- **Title**: Pricing & Plans | Jobvance
- **Meta**: Compare Jobvance plans for individuals, power users, and career centers.
- **H1**: Choose the Plan That Fits Your Job Search
- **Intro**: Transparent pricing, 14-day free trial, cancel anytime.
- **Plan tiers**: Solo ($29/mo), Pro ($59/mo, includes advanced automation + analytics), Teams (custom, cohort management + reporting).
- **FAQ snippet** (also used for schema). CTA: "Start Free Trial" and "Talk to Sales".

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Can I try Jobvance before paying?",
      "acceptedAnswer": {"@type": "Answer", "text": "Yes. Start with a 14-day free trial with full access."}
    },
    {
      "@type": "Question",
      "name": "Does Jobvance support custom resume templates?",
      "acceptedAnswer": {"@type": "Answer", "text": "Upload unlimited resume bases and Jobvance adapts formatting to each role."}
    },
    {
      "@type": "Question",
      "name": "How do team plans work?",
      "acceptedAnswer": {"@type": "Answer", "text": "Career centers and bootcamps can onboard cohorts with admin controls and reporting."}
    }
  ]
}
</script>
```

## 6. Content Production Plan

- **Pillars** (2,000–2,500 words each) in `/content/pillars/`
  - `automating-job-search.mdx`
  - `ai-resume-tailoring.mdx`
  - `high-volume-quality-applications.mdx`
- **Supporting posts** (12 × 1,000–1,500 words) in `/content/posts/`
  - ATS optimization, AI prompts, LinkedIn hacks, cover letters, outreach, dashboards, interview prep, negotiation, portfolio, burnout prevention, networking templates, AI interview coach setup.
- All posts include:
  - Front matter (title, slug, description, tags, reading time).
  - Internal links to pillars and relevant site pages.
  - FAQ sections with JSON-LD for Rich Results eligibility.

Use this content cadence to populate Blog and Guides pages, interlink features/solutions, and power email + social campaigns.

## 7. Backlink Acquisition & Digital PR

**Target cohorts**
- Career coaches, bootcamps, university career centers, HR tech publications, productivity newsletters, SaaS podcasts.

**Linkable assets (8+)**
1. Automated job search benchmark report (survey of time-to-offer). 
2. Resume tailoring ROI calculator. 
3. Outreach cadence templates (Notion/GSheets). 
4. Interview prep operating system (Notion). 
5. AI prompt library (download). 
6. Offer negotiation model (Sheets). 
7. Accessibility checklist for job search materials. 
8. Interactive job search pipeline dashboard.

**Newsjacking angles**
- "How candidates are using AI responsibly in job searches".
- "State of automated job applications vs. recruiter expectations".
- "Core Web Vitals for candidates: how fast resumes influence response rates".

**Pitch titles (20)**
1. "The 2024 Automated Job Search Benchmark" 
2. "Why Resume Tailoring Still Matters in the Age of AI" 
3. "How 500 Candidates Cut Their Job Search in Half" 
4. "The Ethical Automation Playbook for Career Centers" 
5. "From Burnout to Offers: Automation Workflows that Work" 
6. "What Recruiters Want from AI-Assisted Applicants" 
7. "The Hidden Metrics Behind High-Volume Applications" 
8. "Automation Guardrails Every Job Seeker Needs" 
9. "How Cohorts Use Jobvance to Hit Placement Goals" 
10. "Interview Analytics: What Stories Convert" 
11. "Why Core Web Vitals Matter for Career Sites" 
12. "The Rise of AI-First Career Services" 
13. "Applicant Tracking Systems vs. AI Tailored Resumes" 
14. "5 Outreach Templates Driving 30% Reply Rates" 
15. "Jobvance Data: When to Follow Up Without Being Pushy" 
16. "How to Audit Your Resume Library in 30 Minutes" 
17. "What 10,000 Job Posts Reveal About Automation Demand" 
18. "Landing Offers in Regulated Industries with AI" 
19. "The Employer POV on Auto-Apply Tools" 
20. "Boosting Placement Outcomes for Coding Bootcamps" 

**Outreach templates**: Two-step email sequence (value-led intro + resource follow-up) plus podcast pitch included in README appendix (optional expansion).

**Success metrics**: New referring domains, DR>40 links, placements/podcast features, co-marketing signups.

## 8. Analytics & Experimentation

- **GA4 + GSC**: Verify domains, configure enhanced measurement, create events for `cta_click`, `demo_request`, `plan_purchase`, `guide_download`.
- **Conversion tracking**: Route trial signups and demo bookings through thank-you URLs and record with server-side tagging (use Vercel Edge middleware if applicable).
- **Micro-conversions**: Track hero CTA clicks, template downloads, calculator usage, time-on-guide.
- **Dashboard spec** (Looker Studio or Sheets)
  - Traffic by channel/intent stage.
  - Top landing pages (organic) with CTR and conversion rate.
  - Keyword rankings for core themes.
  - Funnel from session → CTA → signup → activation proxy (resume tailored).
- **Experiment backlog**
  - Page title A/B tests (Home/Product). 
  - Hero CTA copy variations ("Start Free Trial" vs. "Build My Engine"). 
  - Social proof module placement (above vs. below fold).
- **Guardrails**: Pre-merge checklist includes Lighthouse, structured data validation, automated accessibility linting (axe), and meta tag diff review.

## 9. Core Web Vitals Improvement Plan

| Metric | Action | Owner | Expected Delta |
| --- | --- | --- | --- |
| LCP | Convert hero image to WebP, serve via `next/image` with priority preload; reduce unused CSS | Engineering | -400ms |
| INP | Audit interactive components, defer non-critical scripts, adopt React Server Components or dynamic import for heavy widgets | Engineering | -80ms |
| CLS | Reserve media aspect ratios, preload fonts with `font-display: swap`, stabilize CTA heights | Engineering | <0.1 CLS |
| Perf tooling | Integrate Lighthouse CI + WebPageTest in CI, monitor via CrUX API dashboards | DevOps | Continuous |

## 10. Compliance & Quality Checklist

- **Accessibility**: WCAG 2.2 AA checklist (semantic headings, focus states, contrast, keyboard nav, ARIA where needed). Use axe DevTools in QA.
- **Privacy/Trust**: Update Privacy Policy, Terms, Contact, and About pages with company details, support email, social links, and accessibility contact.
- **AI transparency**: Declare how Jobvance uses AI, guardrails against misuse, and data handling policies.
- **Content quality**: Avoid duplicate/spun content; each guide includes firsthand experience, data points, and citations where available.
- **Security headers** (if not already configured via Vercel): `Strict-Transport-Security`, `Content-Security-Policy` (whitelist fonts/scripts), `X-Content-Type-Options`.

---

### Attachments & Artifacts
- Technical configs: [`seo/robots.txt`](./seo/robots.txt), [`seo/sitemap.xml`](./seo/sitemap.xml), [`components/SeoHead.tsx`](./components/SeoHead.tsx).
- Structured data samples: [`public/jsonld/`](./public/jsonld).
- Content: [`/content/pillars`](./content/pillars) and [`/content/posts`](./content/posts).
- Planning docs: [`backlog.csv`](./backlog.csv), [`keyword-map.csv`](./keyword-map.csv), [`90-day-calendar.csv`](./90-day-calendar.csv).

Follow the 90-day calendar in [`90-day-calendar.csv`](./90-day-calendar.csv) to execute in sprints, measure progress, and iterate quarterly.
