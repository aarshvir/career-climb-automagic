import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  noindex?: boolean;
}

const SEOHead = ({
  title = "JobVance - AI-Powered Job Application Automation",
  description = "Land your dream job with AI automation. JobVance applies to 20+ relevant jobs daily with optimized resumes. 85% interview success rate.",
  keywords = "job application automation, AI job search, resume optimization, job hunting, career advancement",
  canonical,
  ogImage = "https://jobvance.io/og-image.jpg",
  noindex = false
}: SEOHeadProps) => {
  const location = useLocation();
  const fullTitle = title.includes("JobVance") ? title : `${title} | JobVance`;
  const currentUrl = canonical || `https://jobvance.io${location.pathname}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={currentUrl} />
      
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      
      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:image" content={ogImage} />
      
      {/* Twitter */}
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
};

export default SEOHead;
