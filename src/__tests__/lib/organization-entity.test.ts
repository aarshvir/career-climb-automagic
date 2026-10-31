import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { organizationNode, ORGANIZATION_DISAMBIGUATION } from '@/lib/organization-entity';
import { productFaqs } from '@/lib/product-faqs';

describe('Jobvance organisation entity', () => {
  const node = organizationNode('https://jobvance.io');

  it('says what Jobvance is and separates it from the same-name company, without naming an operator', () => {
    expect(node['@id']).toBe('https://jobvance.io/#organization');
    expect(node.description).toMatch(/CV Check/);
    expect(node.disambiguatingDescription).toContain('jobvance.com');
    expect(node.contactPoint.url).toBe('https://jobvance.io/contact');
    expect(JSON.stringify(node)).not.toMatch(/founder|employee|address|telephone|email|sameAs|aggregateRating|review|award/i);
  });

  it('prints the same disambiguation in the FAQ and in llms.txt', () => {
    const faq = productFaqs.find(([question]) => question.includes('jobvance.com'));
    expect(faq?.[1]).toContain('no connection to Jobva or the company at jobvance.com');
    expect(ORGANIZATION_DISAMBIGUATION).toContain('no connection to Jobva or the company at jobvance.com');
    const llms = readFileSync(resolve(__dirname, '../../../public/llms.txt'), 'utf8');
    expect(llms).toContain('no connection to Jobva or the company at jobvance.com');
  });

  it('is what the prerender script puts on every page', () => {
    const script = readFileSync(resolve(__dirname, '../../../scripts/prerender-public-pages.mjs'), 'utf8');
    expect(script).toContain('organizationNode(SITE_ORIGIN)');
  });
});
