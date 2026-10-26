import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { publicPage, SITE_ORIGIN } from '@/lib/public-route-manifest';

const fallbackTitle = 'Jobvance — automate your job search';
const fallbackDescription = 'Create your account, upload or build your CV and choose your job preferences. Set a recurring search from connected sources, then review jobs and prepared CVs in your dashboard.';
const image = `${SITE_ORIGIN}/og-job-loop-account.png?v=2`;
const imageAlt = 'Jobvance: Automate your job search. Automated Job Loop finds jobs on your schedule and prepares a tailored CV for each. You review, download and apply.';

/** Always mounted so title-only private routes retain the common share image.
 * Page Helmets may override specific fields without leaving static duplicates. */
export default function SiteShareMetadata() {
  const { pathname } = useLocation();
  const page = publicPage(pathname);
  const title = page?.title ?? fallbackTitle;
  const description = page?.description ?? fallbackDescription;
  return <Helmet>
    <title>{title}</title><meta name="description" content={description} />
    <meta property="og:title" content={title} /><meta property="og:description" content={description} />
    <meta property="og:url" content={SITE_ORIGIN + pathname} /><meta property="og:type" content={page?.kind === 'guide' ? 'article' : 'website'} />
    <meta property="og:image" content={image} /><meta property="og:image:alt" content={imageAlt} />
    <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content={title} /><meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={image} /><meta name="twitter:image:alt" content={imageAlt} />
  </Helmet>;
}
