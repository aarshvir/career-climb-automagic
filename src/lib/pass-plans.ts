/**
 * Public pass catalogue. These mirror PASS_PLANS in supabase/functions/_shared/core.ts and the rows
 * seeded into public.jobvance_pass_plans; a test keeps the three in step.
 */
export const passPlans = [
  { key: 'sprint_7d', name: 'Sprint', price: 9, days: 7, tailoredCvs: 25, badge: null, note: 'For a focused week of applications.' },
  { key: 'search_30d', name: 'Job Search', price: 19, days: 30, tailoredCvs: 100, badge: 'Most popular', note: 'A month of steady applying.' },
  { key: 'move_90d', name: 'Career Move', price: 39, days: 90, tailoredCvs: 300, badge: 'Best value', note: 'About $13 a month.' },
] as const;
export type PassPlanKey = (typeof passPlans)[number]['key'];
export type PassPlan = (typeof passPlans)[number];

export const FREE_TAILORED_CVS_PER_MONTH = 3;
export const GUEST_TAILORED_CVS_PER_DAY = 1;
export const FAIR_USE_TAILORED_CVS_PER_DAY = 40;

export function isPassPlanKey(value: unknown): value is PassPlanKey {
  return passPlans.some(plan => plan.key === value);
}
export function passPlan(key: PassPlanKey): PassPlan {
  return passPlans.find(plan => plan.key === key)!;
}
