import { describe, expect, it } from 'vitest';
import { staticPageMeta } from '@/lib/public-site-meta';
import { subscriptionPlans } from '@/lib/subscription-plans';

// The static metadata hard-codes the entry price; this fails the moment the plan data and the description drift apart.
describe('pricing metadata', () => {
  it('quotes the lowest plan price from the plan data', () => {
    expect(staticPageMeta('/pricing')?.description).toContain(`$${Math.min(...subscriptionPlans.map(plan => plan.priceUsd))}/month`);
  });
});
