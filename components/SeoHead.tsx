import Head from "next/head";
import { useRouter } from "next/router";

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
  ogImage = `${SITE_URL}/images/og-default.png`,
  noindex = false,
  structuredData,
  openGraphType = "website",
  locale = "en_US",
  twitterHandle = "@jobvance"
}: SeoHeadProps) {
  const router = useRouter();
  const canonical = buildCanonicalUrl(canonicalPath ?? router.asPath ?? "/");
  const robots = noindex ? "noindex, nofollow" : "index, follow";

  return (
    <Head>
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
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={twitterHandle} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
      <link rel="dns-prefetch" href="https://www.google-analytics.com" />
      <link rel="preload" as="image" href="/images/hero-jobvance.webp" />
      {renderJsonLd(structuredData)}
    </Head>
  );
}

export const defaultOrganizationJsonLd: JsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo.svg`,
  sameAs: [
    "https://www.linkedin.com/company/jobvance",
    "https://twitter.com/jobvance",
    "https://www.youtube.com/@jobvance"
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: "+1-415-555-0199",
      contactType: "customer service",
      areaServed: "US",
      availableLanguage: ["English"]
    }
  ]
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
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "112"
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
