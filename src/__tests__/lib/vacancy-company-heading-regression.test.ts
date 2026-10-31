import { describe, expect, it } from 'vitest';
import { analyzeCvEvidence } from '@/lib/cv-evidence';

const cv = 'Alex Example\nSKILLS\nSQL, Excel';
const report = (job: string) => analyzeCvEvidence(cv, job, 'Analyst');
const quotes = (job: string) => report(job).requirements.map(item => item.vacancyQuote);

describe('company heading boundaries preserve applicant evidence', () => {
  it.each([
    'Strong SQL skills',
    '3 years of experience with Excel',
    'Ability to explain findings clearly',
    'Experience with Salesforce',
    'Excellent written communication',
    'Candidates should have strong SQL skills.',
    'Applicants bring experience with Salesforce.',
    'Duties include preparing weekly reports.',
    'Responsibilities involve presenting monthly forecasts.',
  ])('keeps an explicit criterion inside company context: %s', criterion => {
    const job = `Analyst\nAbout Acme\nAcme supplies household goods.\n${criterion}\nRequirements\nPrepare reports.`;
    expect(quotes(job)).toEqual([criterion, 'Prepare reports.']);
  });

  it.each(['ABOUT YOUR BACKGROUND', 'About Your Skills', 'About your experience:'])('recognizes the applicant heading %s', heading => {
    expect(quotes(`Analyst\n${heading}\nStrong Excel skills\nExcellent written communication`)).toEqual(['Strong Excel skills', 'Excellent written communication']);
  });

  it.each(['About Acme', '🏢 About Example Retail Group', 'Compensation and perks'])('does not absorb an indented section heading into a bullet: %s', heading => {
    const job = `Requirements\n- Prepare reports.\n  ${heading}\nAcme supplies household goods.\nRequirements\nStrong SQL skills.`;
    expect(quotes(job)).toEqual(['Prepare reports.', 'Strong SQL skills.']);
  });

  it('keeps employer tool marketing omitted while preserving conditions, offsets and determinism', () => {
    const job = 'Analyst\r\nAbout Acme\r\nAcme supplies SQL analytics products.\r\nApplicants need a valid work permit.\r\nApply by 31 December 2026.\r\nRequirements\r\nBuild weekly SQL reports.';
    const result = report(job);
    expect(result.requirements.map(item => item.vacancyQuote)).toEqual(['Applicants need a valid work permit.', 'Apply by 31 December 2026.', 'Build weekly SQL reports.']);
    expect(result.omittedSections.map(item => item.vacancyQuote)).toContain('Acme supplies SQL analytics products.');
    for (const item of [...result.requirements, ...result.omittedSections]) expect(job.slice(item.start, item.end)).toBe(item.vacancyQuote);
    expect(report(job)).toEqual(result);
  });
});
