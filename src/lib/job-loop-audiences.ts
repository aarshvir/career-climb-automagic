import type { LoopAudience, LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';

export const loopAudienceContent = {
  student: {
    label: 'Students & graduates', path: '/for-students', eyebrow: 'YOUR FIRST CAREER STEP',
    title: 'Your projects deserve a proper introduction.',
    intro: 'Turn coursework, internships and activities into applications you can stand behind. Keep the vacancy, your evidence and your next action together.',
    recordHint: 'Start with projects, internships, volunteering and coursework. Name your own contribution; label academic work clearly.',
    suggestedRoles: ['Graduate business analyst', 'Operations intern', 'Junior data analyst'],
    steps: ['Bring your projects and experience', 'Check a real internship or graduate vacancy', 'Review the CV and keep your deadlines in view'],
    exampleContext: 'University project', exampleFact: 'Built a dashboard for a university operations project.',
    exampleRequirement: 'Build reporting dashboards', exampleQuestion: 'Was this coursework or paid work? Keep that context in the CV.',
    pageTarget: 1 as const, discreetSearch: false,
  },
  mba: {
    label: 'MBA students & alumni', path: '/for-mba', eyebrow: 'YOUR NEXT DIRECTION',
    title: 'Connect what you have done with what comes next.',
    intro: 'Bring your previous work and MBA projects together. Prepare for a pivot with clear evidence, realistic gaps and one place for recruiting deadlines.',
    recordHint: 'Connect prior employment with MBA projects. Separate your contribution from team results and estimates from measured outcomes.',
    suggestedRoles: ['Business analyst', 'Strategy associate', 'Operations manager'],
    steps: ['Confirm previous work and MBA contributions', 'Map transferable evidence to the vacancy', 'Prepare a focused application and interview examples'],
    exampleContext: 'Prior employment', exampleFact: 'Prepared stakeholder reports for a regional operations team.',
    exampleRequirement: 'Present operational findings to stakeholders', exampleQuestion: 'What did you communicate yourself? Add an example only if it is yours to share.',
    pageTarget: 1 as const, discreetSearch: false,
  },
  professional: {
    label: 'Busy professionals', path: '/for-career-switchers', eyebrow: '5–10 YEARS OF EXPERIENCE. A FULL WORKING DAY.',
    title: 'Make your next move around the job you already have.',
    intro: 'Set your direction, confirm your career facts and let the Job Loop prepare the next review. Keep confidential work private and stay in control of every application.',
    recordHint: 'Use accurate employment achievements. Redact client information and confidential figures before saving or approving external use.',
    suggestedRoles: ['Senior business analyst', 'Operations manager', 'Project manager'],
    steps: ['Set your target roles and confidential boundaries', 'Reuse confirmed facts across suitable vacancies', 'Review prepared documents and take the next action'],
    exampleContext: 'Employment experience', exampleFact: 'Coordinated the rollout of a reporting process across two teams.',
    exampleRequirement: 'Coordinate cross-functional delivery', exampleQuestion: 'Which delivery did you own, and what did you support? Keep that distinction.',
    pageTarget: 2 as const, discreetSearch: true,
  },
} as const;

export function validLoopAudience(value: unknown): LoopAudience | null {
  return value === 'student' || value === 'mba' || value === 'professional' ? value : null;
}

/** Preferences are editable starting points. No qualifications or years are inferred. */
export function blankLoopProfile(audience: LoopAudience = 'student'): LoopProfileInput {
  const preference = loopAudienceContent[audience];
  return { audience, name: '', contactLine: '', targetTitles: [], locations: [], experienceYears: null, languages: [],
    pageTarget: preference.pageTarget, discreetSearch: preference.discreetSearch, sourceText: '', excludedTerms: [],
    compensation: { currency: '', period: 'annual', minimum: null } };
}

export function loopAudiencePath(audience: LoopAudience): string { return `/loop?audience=${audience}`; }

export function loopSignInPath(audience: LoopAudience): string { return `/auth?next=${encodeURIComponent(loopAudiencePath(audience))}`; }
