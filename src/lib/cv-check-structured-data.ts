import { cheapestPassPrice, cvCheckFaqs, FREE_TAILORED_CVS_PER_MONTH } from './cv-check-faqs';

/**
 * schema.org nodes for the public CV Check page: the FAQ exactly as printed, and the check described as the free web
 * application it is. No ratings, reviews, awards or outcome figures: none can be claimed.
 */
export function cvCheckStructuredNodes(siteOrigin: string): object[] {
  return [
    { '@type': 'FAQPage', mainEntity: cvCheckFaqs.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) },
    {
      '@type': 'WebApplication', '@id': `${siteOrigin}/cv-check#app`, name: 'Jobvance CV Check', url: `${siteOrigin}/cv-check`,
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      description: 'Compares a CV with one job ad and shows which requirements the CV covers: Covered, Partly covered, Not shown in your CV or Needs your judgment. No fit percentage or ATS score. A free account is needed.',
      featureList: [
        'Requirement-by-requirement comparison of one CV with one job ad',
        'Four outcomes per requirement, with no fit percentage or ATS score',
        'Comparing without AI runs on your device',
        'Optional AI tailoring with each change shown beside your original wording',
        'Download as PDF, DOCX or TXT after you confirm your CV is accurate',
      ],
      provider: { '@id': `${siteOrigin}/#organization` },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: `Unlimited comparisons without AI, plus ${FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs a month. Optional one-time passes from $${cheapestPassPrice}.` },
    },
  ];
}
