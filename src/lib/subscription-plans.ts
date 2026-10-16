/** Proposed monthly subscriptions only. No checkout or paid entitlements are enabled. */
export const subscriptionPlans = [
  { id: 'weekly', name: 'Weekly', priceUsd: 29, interval: 'month', ready: false, billing: false,
    description: 'A steady search alongside work or study.',
    features: ['1 Job Loop run a week', 'Up to 3 saved CV variants', 'Guided CV creator', 'Matched jobs and prepared CVs in your dashboard'],
    proposedLimits: { weeklyRuns: 1, dailyRuns: null, cvVariants: 3 } },
  { id: 'active', name: 'Active', priceUsd: 59, interval: 'month', ready: false, billing: false,
    description: 'More frequent searches while you are actively looking.',
    features: ['3 Job Loop runs a week', 'Up to 3 saved CV variants', 'Guided CV creator', 'Matched jobs and prepared CVs in your dashboard'],
    proposedLimits: { weeklyRuns: 3, dailyRuns: null, cvVariants: 3 } },
  { id: 'daily', name: 'Daily', priceUsd: 99, interval: 'month', ready: false, billing: false,
    description: 'A daily search during a focused job hunt.',
    features: ['1 Job Loop run a day', 'Up to 3 saved CV variants', 'Guided CV creator', 'Matched jobs and prepared CVs in your dashboard'],
    proposedLimits: { weeklyRuns: null, dailyRuns: 1, cvVariants: 3 } },
] as const;
export const freePilot = { billing: false, priceUsd: 0, maxUsers: 10, monthlyAiSearchCapUsd: 50,
  description: 'The first ten pilot accounts use the available Job Loop features free. No card, charge or automatic conversion. Actual run access is shown in the workspace.' } as const;
