import { describe, expect, it } from 'vitest';
import { accountDestination, onboardingPathForChoice, pricingChoiceFromReturn, pricingReturnFromOnboarding } from '@/lib/account-return';
import { LOOP_LOCAL_COUNTRIES } from '@/lib/loop-local-prices';
import { subscriptionPlans } from '@/lib/subscription-plans';

// The plan a person was choosing travels to /onboarding as three query values and comes back as a pricing path. Both directions are
// validated against the allowlists the pricing page and the sign-in return already use; nothing is stored.
describe('onboardingPathForChoice', () => {
  it('builds the onboarding address from a listed plan and market only', () => {
    expect(onboardingPathForChoice('active', { country: 'GB', currency: 'GBP' })).toBe('/onboarding?loopPlan=active&country=GB&currency=GBP');
    expect(onboardingPathForChoice('weekly', { country: 'other', currency: 'USD' })).toBe('/onboarding?loopPlan=weekly&country=other&currency=USD');
    expect(onboardingPathForChoice('daily', { country: 'AE', currency: 'AED' })).toBe('/onboarding?loopPlan=daily&country=AE&currency=AED');
  });
  it('falls back to the plain onboarding address for anything outside the allowlists', () => {
    expect(onboardingPathForChoice('platinum' as never, { country: 'GB', currency: 'GBP' })).toBe('/onboarding');
    expect(onboardingPathForChoice('active', { country: 'XX' as never, currency: 'GBP' })).toBe('/onboarding');
    expect(onboardingPathForChoice('active', { country: 'GB', currency: 'XYZ' as never })).toBe('/onboarding');
    expect(onboardingPathForChoice('active', { country: 'other', currency: 'GBP' })).toBe('/onboarding');
  });
});

describe('pricingReturnFromOnboarding', () => {
  it('turns a valid onboarding address into the exact pricing return the sign-in return already accepts', () => {
    for (const plan of subscriptionPlans) for (const [country, item] of Object.entries(LOOP_LOCAL_COUNTRIES)) {
      const path = pricingReturnFromOnboarding(`?loopPlan=${plan.id}&country=${country}&currency=${item.currency}`);
      expect(path).toBe(`/pricing?loopPlan=${plan.id}&country=${country}&currency=${item.currency}`);
      expect(accountDestination(path)).toBe(path);
      expect(onboardingPathForChoice(plan.id, { country: country as never, currency: item.currency })).toBe(`/onboarding?loopPlan=${plan.id}&country=${country}&currency=${item.currency}`);
    }
    expect(pricingReturnFromOnboarding('?loopPlan=active&country=other&currency=USD')).toBe('/pricing?loopPlan=active&country=other&currency=USD');
  });
  it('ignores advertising tags and other values, and never copies them', () => {
    expect(pricingReturnFromOnboarding('?utm_source=meta&fbclid=abc&country=AE&loopPlan=daily&currency=AED&next=https://attacker.example&cv=Alex%20Example')).toBe('/pricing?loopPlan=daily&country=AE&currency=AED');
  });
  it.each([
    [''], ['?'], ['?loopPlan=active'], ['?country=GB&currency=GBP'], ['?loopPlan=active&country=GB'], ['?loopPlan=active&currency=GBP'],
    ['?loopPlan=platinum&country=GB&currency=GBP'], ['?loopPlan=ACTIVE&country=GB&currency=GBP'], ['?loopPlan=active%20&country=GB&currency=GBP'], ['?loopPlan=%2Fpricing&country=GB&currency=GBP'],
    ['?loopPlan=active&country=XX&currency=GBP'], ['?loopPlan=active&country=gb&currency=GBP'], ['?loopPlan=active&country=GB&currency=XYZ'], ['?loopPlan=active&country=GB&currency=gbp'],
    ['?loopPlan=active&country=other&currency=GBP'], ['?plan=sprint_7d'], ['?plan=sprint_7d&country=GB&currency=GBP'],
    ['?loopPlan=active&loopPlan=daily&country=GB&currency=GBP'], ['?loopPlan=active&country=GB&country=AE&currency=GBP'], ['?loopPlan=active&country=GB&currency=GBP&currency=AED'],
    ['?loopPlan=&country=GB&currency=GBP'], ['?loopPlan[]=active&country=GB&currency=GBP'],
  ])('%j gives nothing', search => { expect(pricingReturnFromOnboarding(search)).toBeNull(); });
  it('names the plan for the button from the same validated path, never a price', () => {
    const path = pricingReturnFromOnboarding('?loopPlan=active&country=GB&currency=GBP');
    expect(pricingChoiceFromReturn(path)).toEqual({ product: 'loop', name: 'Advanced' });
    expect(JSON.stringify(pricingChoiceFromReturn(path))).not.toMatch(/[£$€]|\d|GBP/);
  });
});
