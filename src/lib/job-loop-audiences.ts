import type { LoopAudience, LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types';

export const loopAudienceContent = {
  student: {
    label: 'Students & graduates', path: '/for-students', eyebrow: 'FOR INTERNSHIPS AND GRADUATE JOBS',
    title: 'Prepare your student CV for a real vacancy.',
    searchTitle: 'Automate your graduate job search.',
    searchIntro: 'Choose your roles and locations once. Automated Job Loop finds matching jobs and builds a tailored CV for each from your projects, placements and activities.',
    intro: 'Add your CV and an internship or graduate job description. See which projects, placements and activities answer the role’s requirements, review the wording, and download a CV for that application.',
    recordHint: 'Save the projects, internships, volunteering and coursework you want to use again. Keep your contribution and the academic context clear.',
    suggestedRoles: ['Graduate business analyst', 'Operations intern', 'Junior data analyst'],
    steps: ['Add the CV you already have', 'Compare your experience with one graduate role or internship', 'Review your CV, then reuse your work for the next vacancy'],
    exampleContext: 'University project', exampleFact: 'Built a dashboard for a university operations project.',
    exampleRequirement: 'Build reporting dashboards', exampleQuestion: 'Which parts of the dashboard did you build? Describe your own contribution.',
    pageTarget: 1 as const, discreetSearch: false,
  },
  mba: {
    label: 'MBA students & alumni', path: '/for-mba', eyebrow: 'FOR YOUR SEARCH DURING AND AFTER AN MBA',
    title: 'Show how your work and MBA fit the role you want.',
    searchTitle: 'Automate your search after your MBA.',
    searchIntro: 'Choose your roles and locations once. Automated Job Loop finds matching jobs and builds a tailored CV for each from your prior work and MBA projects.',
    intro: 'Bring your previous work and MBA projects into one application. Compare them with the actual vacancy, choose the examples that fit, and keep the experience you have reviewed ready for the next role.',
    recordHint: 'Save your prior work and MBA projects together. Keep your contribution separate from team results so each new application starts with facts you have checked.',
    suggestedRoles: ['Business analyst', 'Strategy associate', 'Operations manager'],
    steps: ['Add your CV with previous work and MBA experience', 'Find the examples that answer this role’s requirements', 'Review the application and save your experience for the next one'],
    exampleContext: 'Prior employment', exampleFact: 'Prepared stakeholder reports for a regional operations team.',
    exampleRequirement: 'Present operational findings to stakeholders', exampleQuestion: 'Which findings did you present, and who used them? Add an example from your own work.',
    pageTarget: 1 as const, discreetSearch: false,
  },
  professional: {
    label: 'Busy professionals', path: '/for-career-switchers', eyebrow: 'FOR PROFESSIONALS · 5–10 YEARS IN',
    title: 'Prepare your next application without rebuilding your CV.',
    searchTitle: 'Automate your next career move.',
    searchIntro: 'Choose your roles and locations once. Automated Job Loop finds matching jobs and builds a tailored CV for each from the experience you already have.',
    intro: 'Use the CV you already have to prepare for a role at another employer or a change of direction. Compare your experience with the vacancy, review the relevant wording, and reuse confirmed facts when the next opportunity comes up.',
    recordHint: 'Save the experience you want to reuse and remove confidential client details or figures first. Your next application can start from that reviewed record.',
    suggestedRoles: ['Senior business analyst', 'Operations manager', 'Project manager'],
    steps: ['Start with your current CV and remove confidential details', 'Compare your experience with the role you want', 'Review a CV for that vacancy and reuse confirmed facts next time'],
    exampleContext: 'Employment experience', exampleFact: 'Coordinated the rollout of a reporting process across two teams.',
    exampleRequirement: 'Coordinate cross-functional delivery', exampleQuestion: 'What did you coordinate across the two teams? Name the work you handled.',
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
