import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { careerGuides } from '@/lib/career-guides';
import { FREE_TAILORED_CVS_PER_MONTH, passPlans } from '@/lib/pass-plans';
import { subscriptionPlans } from '@/lib/subscription-plans';

const llms = readFileSync(resolve(__dirname, '../../../public/llms.txt'), 'utf8');

// Same owner copy rules as marketing-copy-guard.test.tsx, plus the claims that file's review struck for llms.txt.
const banned: [string, RegExp][] = [
  ['deterrent: nothing is sent', /nothing is sent/i],
  ['deterrent: apply yourself', /apply yourself|you apply yourself/i],
  ['deterrent: never applies', /never applies|does not apply for you|doesn.t apply for you/i],
  ['deterrent: does not submit applications for you', /(does not|doesn.t|never) submit applications/i],
  ['deterrent: you submit applications', /(you|your)\s+(review and\s+)?(send messages and\s+)?submit (each |your )?applications?/i],
  ['absolute: guaranteed', /guaranteed ats|guaranteed (job|interview)s?\b(?!\.)/i],
  ['absolute: every role you target', /every role you target/i],
  ['unbounded preparation', /(?:a |one )?tailored CV for (?:each|every) match/i],
  ['bare Job Loop', /(^|[^d] )Job Loop\b/],
  ['score claim: ATS match', /ATS match/i],
  ['account claim: no sign-up', /no sign-?up|without (creating )?an account|no account needed/i],
  ['absolute: cannot invent', /cannot invent|can't invent/i],
  ['auto-apply', /auto-?apply/i],
];

describe('public/llms.txt', () => {
  it('states the current prices and limits from the pricing source files', () => {
    for (const plan of passPlans) {
      expect(llms, plan.name).toMatch(new RegExp(`${plan.name} \\$${plan.price} \\(${plan.tailoredCvs}[^)]*${plan.days} days\\)`));
    }
    for (const plan of subscriptionPlans) expect(llms, plan.name).toContain(`${plan.name} $${plan.priceUsd}`);
    expect(llms).toContain(`${FREE_TAILORED_CVS_PER_MONTH} AI-tailored CVs a month`);
    expect(llms).toContain('5 MB');
  });

  it('links every guide exactly once, with its own title', () => {
    for (const guide of careerGuides) {
      const url = `https://jobvance.io/guides/${guide.slug})`;
      expect(llms.split(url).length - 1, guide.slug).toBe(1);
      expect(llms, guide.slug).toContain(`[${guide.title}](https://jobvance.io/guides/${guide.slug})`);
    }
  });

  it('uses only claims the owner copy rules allow', () => {
    for (const [name, pattern] of banned) expect(llms, name).not.toMatch(pattern);
  });
});
