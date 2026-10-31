/**
 * The Jobvance organisation node for schema.org data on every public page. It says what Jobvance is and is not, because another
 * company (Jobva, at jobvance.com) shares the name and search and AI tools otherwise merge the two. The operator is
 * deliberately not named: the owner chose to stay anonymous, so the contact route is the public contact page.
 * Add `sameAs` only for profiles the owner really controls.
 */
export const ORGANIZATION_DESCRIPTION = 'Jobvance is an online job-search tool. Its CV Check compares a CV with one job ad, and its Automated Job Loop finds matching jobs on a schedule and prepares tailored CVs.';
export const ORGANIZATION_DISAMBIGUATION = 'Jobvance at jobvance.io is a job-search and CV tool. It is not a recruitment agency or a virtual-assistant service, and it has no connection to Jobva or the company at jobvance.com.';

export function organizationNode(siteOrigin: string) {
  return {
    '@type': 'Organization',
    '@id': `${siteOrigin}/#organization`,
    name: 'Jobvance',
    url: siteOrigin,
    logo: `${siteOrigin}/icon-512.png`,
    description: ORGANIZATION_DESCRIPTION,
    disambiguatingDescription: ORGANIZATION_DISAMBIGUATION,
    knowsAbout: ['Comparing a CV with a job ad', 'CV tailoring', 'Job search automation', 'Job application tracking'],
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', url: `${siteOrigin}/contact` },
  };
}
