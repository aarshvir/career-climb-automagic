/* eslint-disable react-refresh/only-export-components */
import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://jobvance.io";
const SITE_NAME = "Jobvance";

export type JsonLd = Record<string, unknown>;

export interface SeoHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogImage?: string;
  noindex?: boolean;
  structuredData?: JsonLd | JsonLd[];
  openGraphType?: "website" | "article" | "product";
  locale?: string;
  twitterHandle?: string;
}

const buildCanonicalUrl = (pathname: string) => {
  try {
    const url = new URL(pathname, SITE_URL);
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    return `${SITE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  }
};

const renderJsonLd = (data?: JsonLd | JsonLd[]) => {
  if (!data) return null;
  const payload = Array.isArray(data) ? data : [data];
  return payload.map((entry, index) => (
    <script
      key={`jsonld-${index}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
    />
  ));
};

export function SeoHead({
  title,
  description,
  canonicalPath,
  ogImage = `${SITE_URL}/og-job-loop-account.png`,
  noindex = false,
  structuredData,
  openGraphType = "website",
  locale = "en_US",
  twitterHandle = "@jobvance"
}: SeoHeadProps) {
  const location = useLocation();
  const canonical = useMemo(
    () => buildCanonicalUrl(canonicalPath ?? location?.pathname ?? "/"),
    [canonicalPath, location?.pathname]
  );
  const robots = noindex ? "noindex, nofollow" : "index, follow";

  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta name="robots" content={robots} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={openGraphType} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:locale" content={locale} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={ogImage === `${SITE_URL}/og-job-loop-account.png` ? 'Jobvance Automated Job Loop: create your account, choose your roles and schedule, then come back to matched jobs and tailored CVs.' : description} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={twitterHandle} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={ogImage === `${SITE_URL}/og-job-loop-account.png` ? 'Jobvance Automated Job Loop: create your account, choose your roles and schedule, then come back to matched jobs and tailored CVs.' : description} />
      <link rel="dns-prefetch" href="https://www.google-analytics.com" />
      {renderJsonLd(structuredData)}
    </Helmet>
  );
}

export const defaultOrganizationJsonLd: JsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo.svg`
};

export const searchActionJsonLd: JsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string"
  }
};

export const buildWebPageJsonLd = (props: {
  name: string;
  description: string;
  canonicalUrl: string;
  breadcrumbItems?: { name: string; url: string }[];
}): JsonLd => {
  const { name, description, canonicalUrl, breadcrumbItems = [] } = props;
  const breadcrumbJsonLd = breadcrumbItems.length
    ? {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.url
        }))
      }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    url: canonicalUrl,
    description,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL
    },
    breadcrumb: breadcrumbJsonLd
  };
};

export const jobvanceProductJsonLd: JsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Jobvance",
  url: `${SITE_URL}/product`,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "29",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: `${SITE_URL}/pricing`
  }
};

export const faqJsonLd = (faqs: { question: string; answer: string }[]): JsonLd => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer
    }
  }))
});

export const buildCanonicalPath = (slug: string) => {
  const normalized = slug.startsWith("/") ? slug : `/${slug}`;
  return normalized.replace(/\/index$/, "").replace(/\/$/, "");
};

export default SeoHead;
