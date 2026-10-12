/** Public plan proposals. These are not paid entitlements or a checkout offer. */
export const subscriptionPlans = [
  { id: 'starter', name: 'Free Starter', priceUsd: 0, interval: null, ready: true, billing: false,
    description: 'A useful first application, with you in control.',
    features: ['Free CV-to-vacancy check', 'Reviewed PDF, DOCX and TXT downloads', 'Optional private saving and manual tracking'],
    proposedLimits: null },
  { id: 'focus', name: 'Focus', priceUsd: 15, interval: 'month', ready: false, billing: false,
    description: 'Prepare applications when you choose to run them.',
    features: ['Reusable confirmed career facts', '20 reviewed application packs per month', 'Evidence review and light preparation prompts'],
    proposedLimits: { monthlyPacks: 20, monthlyRuns: null, maxNewPacksPerRun: null } },
  { id: 'loop', name: 'Job Loop', priceUsd: 29, interval: 'month', ready: false, billing: false,
    description: 'Recurring preparation around a busy working week.',
    features: ['Everything in Focus', 'Up to 30 scheduled runs per month', 'Up to 2 new packs per run, 60 per month', 'Private progress, follow-ups and source-linked drafts'],
    proposedLimits: { monthlyPacks: 60, monthlyRuns: 30, maxNewPacksPerRun: 2 } },
] as const;

export const freePilot = { billing: false, priceUsd: 0, maxUsers: 10, monthlyAiSearchCapUsd: 50,
  description: 'The first ten pilot accounts use the available Job Loop features free. No card, charge or automatic conversion. Actual run access is shown in the workspace.' } as const;
