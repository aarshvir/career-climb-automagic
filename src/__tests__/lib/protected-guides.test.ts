import { describe, expect, it } from 'vitest';
import { careerGuides } from '@/lib/career-guides';
import { publicPage } from '@/lib/public-route-manifest';

// Google already ranks these two guides first for narrow queries ("how to list qualifications on a UAE CV",
// "verify a job listing before sharing your CV"). Retitling or moving them would throw that away.
const protectedGuides = [
  ['academic-qualifications-uae-cv', 'How to list qualifications on a UAE CV', 'How to list qualifications on a UAE CV | Jobvance'],
  ['verify-job-listing-source', 'Verify a job listing before sharing your CV', 'Verify a job listing before sharing your CV | Jobvance'],
] as const;

describe('guides that already rank are frozen (see jobvance-marketing-coordination/seo-audit-2026-10-31)', () => {
  it.each(protectedGuides)('%s keeps its slug, title and document title', (slug, title, documentTitle) => {
    const guide = careerGuides.find(item => item.slug === slug);
    expect(guide?.title).toBe(title);
    expect(publicPage(`/guides/${slug}`)?.title).toBe(documentTitle);
  });
});
