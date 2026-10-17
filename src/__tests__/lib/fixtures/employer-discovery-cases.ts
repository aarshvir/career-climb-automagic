import type { DiscoveryMatchEvidence } from '../../../lib/employer-discovery';
import type { LoopOpportunity, LoopProfile } from '../../../../supabase/functions/_shared/job-loop-types';

/** Author-written contract cases, NOT real vacancies, customers or labelled market data. */
export interface DiscoveryFixture {
  id: string;
  provenance: 'synthetic_contract_case';
  audience: LoopProfile['audience'];
  guards: string[];
  rationale: string;
  profile: LoopProfile;
  opportunity: LoopOpportunity;
  expected: Partial<DiscoveryMatchEvidence> & { matches: boolean };
}
const profile = (changes: Partial<LoopProfile> = {}): LoopProfile => ({
  audience: 'student', name: 'Fictional contract candidate', contactLine: '', targetTitles: ['Graduate Business Analyst'],
  locations: ['Dubai'], experienceYears: null, languages: [], pageTarget: 1, discreetSearch: true,
  sourceText: 'Fictional contract fixture. No real candidate, CV or customer data is included.', excludedTerms: [],
  compensation: { currency: '', period: 'monthly', minimum: null }, revision: 1, updatedAt: '2026-10-13T00:00:00Z', ...changes,
});
const vacancy = (changes: Partial<LoopOpportunity> = {}): LoopOpportunity => ({
  id: 'fictional-vacancy', source: 'employer_api', sourceKey: 'fictional:fixture', checkedAt: '2026-10-13T00:00:00Z',
  verification: 'listed_on_source', status: 'saved', followUpAt: null, notes: '', contact: null,
  title: 'Business Analyst', company: 'Fictional Fixture Employer', location: 'Dubai, United Arab Emirates',
  url: 'https://careers.example.test/contract-fixture', description: 'Fictional vacancy text for a deterministic contract case. Responsibilities and eligibility require candidate review.', ...changes,
});
const cases: DiscoveryFixture[] = [];
function add(id: string, guards: string[], rationale: string, p: Partial<LoopProfile>, v: Partial<LoopOpportunity>, expected: DiscoveryFixture['expected']) {
  const candidate = profile(p);
  cases.push({ id, provenance: 'synthetic_contract_case', audience: candidate.audience, guards, rationale, profile: candidate, opportunity: vacancy(v), expected });
}

add('student-plain-title', ['role', 'seniority'], 'A plain matching title has unknown seniority; student status is not a guessed eligibility rule.', {}, {}, { matches: true, seniority: 'unknown', experience: 'unknown' });
add('student-senior-conflict', ['seniority'], 'An explicit graduate target conflicts with an explicitly senior vacancy.', {}, { title: 'Senior Business Analyst' }, { matches: false, seniority: 'conflict' });
add('student-lead-conflict', ['seniority'], 'Lead is explicit seniority evidence in this title.', {}, { title: 'Lead Business Analyst' }, { matches: false, seniority: 'conflict' });
add('student-director-conflict', ['seniority'], 'Director is explicit seniority evidence despite shared role words.', {}, { title: 'Director, Business Analysis Analyst' }, { matches: false, seniority: 'conflict' });
add('student-head-conflict', ['seniority'], 'Head is explicit seniority evidence.', {}, { title: 'Head of Business Analyst Team' }, { matches: false, seniority: 'conflict' });
add('student-staff-engineer-conflict', ['seniority'], 'Staff engineer is an explicit technical seniority title.', { targetTitles: ['Graduate Software Engineer'] }, { title: 'Staff Software Engineer' }, { matches: false, seniority: 'conflict' });
add('half-token-manager', ['role'], 'Business alone must not satisfy Business Analyst.', {}, { title: 'Business Development Manager' }, { matches: false, role: 'mismatch' });
add('different-domain-analyst', ['role'], 'Analyst alone must not satisfy Business Analyst.', {}, { title: 'Financial Analyst' }, { matches: false, role: 'mismatch' });
add('junior-compatible', ['role', 'seniority'], 'Junior and graduate are compatible early-career title intent.', {}, { title: 'Junior Business Analyst' }, { matches: true, seniority: 'compatible' });
add('intern-internship', ['role', 'seniority'], 'Internship and intern are explicit early-career variants.', { targetTitles: ['Operations Intern'] }, { title: 'Operations Internship' }, { matches: true });
add('explicit-graduate-level', ['role'], 'An explicit broad graduate direction admits a graduate title across functions.', { targetTitles: ['Graduate'] }, { title: 'Graduate Business Analyst' }, { matches: true });
add('mixed-target-levels', ['role', 'seniority'], 'A senior consultant target must not make the separate graduate analyst target senior-compatible.', { audience: 'mba', targetTitles: ['Graduate Business Analyst', 'Senior Consultant'] }, { title: 'Senior Business Analyst' }, { matches: false, seniority: 'conflict' });
add('mba-manager-target', ['role'], 'MBA status does not imply graduate-only targets.', { audience: 'mba', targetTitles: ['Product Manager'] }, { title: 'Product Manager, Growth' }, { matches: true, seniority: 'unknown' });
add('mba-role-alternative', ['role'], 'Matching any complete target direction is enough.', { audience: 'mba', targetTitles: ['Strategy Consultant', 'Product Analyst'] }, { title: 'Strategy Consultant' }, { matches: true });
add('professional-senior-target', ['role', 'seniority'], 'A declared senior target can match a senior vacancy.', { audience: 'professional', targetTitles: ['Senior Data Analyst'], experienceYears: 8 }, { title: 'Sr. Data Analyst' }, { matches: true });
add('professional-junior-conflict', ['role', 'seniority'], 'Explicit senior intent conflicts with an explicitly junior title.', { audience: 'professional', targetTitles: ['Senior Data Analyst'] }, { title: 'Junior Data Analyst' }, { matches: false, seniority: 'conflict' });
add('generic-professional-unknown', ['role', 'seniority'], 'Audience and undisclosed years do not create a seniority requirement.', { audience: 'professional', targetTitles: ['Data Analyst'] }, { title: 'Senior Data Analyst' }, { matches: true, experience: 'unknown' });
add('short-bi-token', ['role'], 'BI is meaningful and must not disappear because it is short.', { targetTitles: ['BI Analyst'] }, { title: 'Financial Analyst' }, { matches: false });
add('short-ai-token', ['role'], 'AI is meaningful and distinguishes the requested engineering direction.', { audience: 'mba', targetTitles: ['AI Engineer'] }, { title: 'Civil Engineer' }, { matches: false });
add('technical-symbols', ['role'], 'C++ and C# are different role technologies.', { audience: 'professional', targetTitles: ['C++ Developer'] }, { title: 'C# Developer' }, { matches: false });
add('frontend-normalization', ['role'], 'Documented spacing normalization preserves a legitimate title variant.', { targetTitles: ['Front-end Developer'] }, { title: 'Frontend Developer' }, { matches: true });
add('plural-normalization', ['role'], 'A small documented role-noun plural normalization is allowed.', { targetTitles: ['Data Analyst'] }, { title: 'Data Analysts' }, { matches: true });
add('lead-generation-domain', ['role', 'seniority'], 'Lead generation is a role domain, not an inferred leadership rank.', { targetTitles: ['Graduate Lead Generation Specialist'] }, { title: 'Lead Generation Specialist' }, { matches: true, seniority: 'unknown' });
add('partial-city-country', ['location'], 'Known city geography can complete a compatible partial location string.', { locations: ['Dubai, UAE'] }, { location: 'Dubai' }, { matches: true, location: 'matched' });
add('country-alias', ['location'], 'UAE is a documented country abbreviation.', { locations: ['UAE'] }, {}, { matches: true });
add('location-token-boundary', ['location'], 'York does not match Yorkshire as a substring.', { locations: ['York'] }, { location: 'Yorkshire, UK' }, { matches: false, location: 'mismatch' });
add('different-york', ['location'], 'York and New York are distinct locations.', { locations: ['York'] }, { location: 'New York, USA' }, { matches: false });
add('location-alternatives', ['location'], 'Separate supplied locations are alternatives.', { locations: ['Dubai', 'Abu Dhabi'] }, { location: 'Abu Dhabi, UAE' }, { matches: true });
add('missing-location', ['location'], 'A requested physical location cannot be confirmed from an empty feed field.', {}, { location: '' }, { matches: false, location: 'unknown' });
add('search-snippet-location-unknown', ['location'], 'An unverified search snippet does not gain a location from the query that produced it.', {}, { source: 'web_search', verification: 'unverified', location: '', description: 'Unverified fictional search snippet for business analyst roles in multiple markets.' }, { matches: false, location: 'unknown' });
add('no-location-preference', ['location'], 'An intentionally empty location preference does not invent a restriction.', { locations: [] }, { location: '' }, { matches: true, location: 'not_requested' });
add('remote-worldwide', ['remote'], 'Explicit worldwide remote work fits a remote preference.', { locations: ['Remote'] }, { location: 'Remote — Worldwide' }, { matches: true, location: 'matched' });
add('remote-scope-unknown', ['remote'], 'Generic remote says nothing about allowed working countries.', { locations: ['Remote'] }, { location: 'Remote' }, { matches: true, location: 'unknown' });
add('remote-restricted-no-residence', ['remote'], 'Remote alone does not establish residence; retain for review without claiming a location match.', { locations: ['Remote'] }, { location: 'Remote — UK only' }, { matches: true, location: 'unknown' });
add('remote-us-dubai-conflict', ['remote', 'location'], 'An explicit US work location conflicts with a Dubai preference even when Remote is also requested.', { locations: ['Dubai', 'Remote'] }, { location: 'Remote — US residents only' }, { matches: false, location: 'mismatch' });
add('remote-uae-dubai', ['remote', 'location'], 'Remote UAE work is geographically compatible with a desired Dubai work location; eligibility is still unverified.', { locations: ['Dubai', 'Remote'] }, { location: 'Remote — UAE' }, { matches: true, location: 'matched' });
add('remote-description-restriction', ['remote', 'location'], 'An explicit must-be-based restriction is not erased by a generic Remote field.', { locations: ['Dubai', 'Remote'] }, { location: 'Remote', description: 'This role is remote. Applicants must be based in the United States.' }, { matches: false });
add('remote-company-office-mention', ['remote'], 'A company office paragraph does not establish a candidate working restriction.', { locations: ['Dubai', 'Remote'] }, { location: 'Remote', description: 'Our company has offices in London and New York. This is a remote role.' }, { matches: true, location: 'unknown' });
add('negated-remote', ['remote'], 'Not remote must not satisfy a remote preference.', { locations: ['Remote'] }, { location: 'Not remote; London office' }, { matches: false });
add('hybrid-not-remote', ['remote'], 'Hybrid work is not silently treated as remote.', { locations: ['Remote'] }, { location: 'London (Hybrid)' }, { matches: false });
add('worldwide-rejects-restricted', ['remote'], 'Worldwide-only intent is narrower than remote within one country.', { locations: ['Remote worldwide'] }, { location: 'Remote — UK' }, { matches: false });
add('explicit-minimum-gap', ['experience'], 'An explicit required minimum above the supplied years is a discovery conflict.', { experienceYears: 1 }, { description: 'Applicants must have at least 3 years of relevant experience.' }, { matches: false, experience: 'below_stated_minimum', minimumExperienceYears: 3 });
add('experience-range-lower-bound', ['experience'], 'The lower bound of a required range is the minimum; a candidate need not equal the upper bound.', { audience: 'mba', experienceYears: 3 }, { description: '2–4 years of professional experience required.' }, { matches: true, experience: 'within_stated_years', minimumExperienceYears: 2 });
add('spelled-experience-minimum', ['experience'], 'A supported English number word is employer evidence.', { audience: 'professional', experienceYears: 4, targetTitles: ['Business Analyst'] }, { description: 'Applicants need at least five years of experience.' }, { matches: false, minimumExperienceYears: 5 });
add('negated-experience', ['experience'], 'Negated experience is not a hard requirement.', { experienceYears: 0 }, { description: '5 years of experience is not required. Graduates are welcome.' }, { matches: true, experience: 'unknown', minimumExperienceYears: null });
add('preferred-experience', ['experience'], 'Preferred years do not become a mandatory minimum.', { experienceYears: 0 }, { description: '5+ years of experience preferred; graduates are welcome.' }, { matches: true, experience: 'unknown' });
add('education-or-experience', ['experience'], 'A degree alternative cannot become a universal experience requirement.', { experienceYears: 0 }, { description: 'A relevant degree or 5 years of experience required.' }, { matches: true, experience: 'unknown' });
add('foreign-experience-unknown', ['experience'], 'Unsupported foreign wording stays unknown rather than guessed or certified.', { experienceYears: 1 }, { description: 'Au moins 5 ans d’expérience professionnelle sont requis.' }, { matches: true, experience: 'unknown' });
add('company-history-not-candidate', ['experience'], 'Company history is not a candidate experience minimum.', { experienceYears: 0 }, { description: 'Our company has 15+ years of industry experience. Graduates are welcome.' }, { matches: true, experience: 'unknown' });
add('unknown-candidate-years', ['experience'], 'Undisclosed candidate years cannot be manufactured from student status.', {}, { description: 'Minimum 3 years of experience required.' }, { matches: true, experience: 'unknown', minimumExperienceYears: 3 });
const floor = { currency: 'AED', period: 'monthly' as const, minimum: 12000 };
add('salary-annual-monthly-below', ['compensation'], 'An explicit annual salary ceiling converts to monthly with twelve months per year.', { audience: 'professional', compensation: floor }, { description: 'Base salary: AED 96,000 per year.' }, { matches: false, compensation: 'below_minimum' });
add('salary-range-overlap', ['compensation'], 'A stated range whose upper bound reaches the preference is retained, not certified above it.', { audience: 'mba', compensation: floor }, { description: 'Salary range: AED 8,000–15,000 per month.' }, { matches: true, compensation: 'range_overlaps_minimum' });
add('salary-comparable-meets', ['compensation'], 'A stated lower bound above the same-currency floor supports only the numeric comparison.', { audience: 'professional', compensation: floor }, { description: 'Base salary: 144,000–180,000 AED annually.' }, { matches: true, compensation: 'at_or_above_minimum' });
add('salary-short-range-units', ['compensation'], 'A trailing k applies to both amounts in the explicit salary range.', { compensation: { currency: 'USD', period: 'annual', minimum: 90000 } }, { description: 'Salary range: USD 60–80k per year.' }, { matches: false, compensation: 'below_minimum' });
add('salary-dollar-ambiguous', ['compensation'], 'A dollar sign alone does not identify USD or establish a comparison.', { compensation: { currency: 'USD', period: 'annual', minimum: 90000 } }, { description: 'Salary: $80k/year.' }, { matches: true, compensation: 'unknown' });
add('salary-currency-alternatives', ['compensation'], 'A slash between currencies does not establish which currency the offer uses.', { compensation: { currency: 'CAD', period: 'annual', minimum: 90000 } }, { description: 'Salary: USD/CAD 100k per year.' }, { matches: true, compensation: 'unknown' });
add('salary-period-missing', ['compensation'], 'The salary amount does not establish its payment period.', { compensation: floor }, { description: 'Salary: AED10k.' }, { matches: true, compensation: 'unknown' });
add('salary-hourly-conversion-unknown', ['compensation'], 'Hourly pay cannot be annualized without invented hours.', { compensation: floor }, { description: 'Base pay: AED 80 per hour.' }, { matches: true, compensation: 'unknown' });
add('salary-foreign-currency-unknown', ['compensation'], 'No exchange rate is invented for a different stated currency.', { compensation: floor }, { description: 'Salary: USD 50,000 per year.' }, { matches: true, compensation: 'unknown' });
add('salary-from-no-ceiling', ['compensation'], 'A starting amount below the preference is not a maximum salary.', { compensation: floor }, { description: 'Salary: from AED 8,000 per month.' }, { matches: true, compensation: 'unknown' });
add('salary-bonus-not-base', ['compensation'], 'An annual bonus is not a recurring base salary.', { compensation: floor }, { description: 'Annual bonus compensation: AED 10,000 per year.' }, { matches: true, compensation: 'unknown' });
add('salary-undisclosed', ['compensation'], 'No vacancy salary is estimated from its title.', { compensation: floor }, {}, { matches: true, compensation: 'unknown' });
add('company-exclusion', ['exclusion'], 'Existing literal employer exclusions still apply.', { excludedTerms: ['Fictional Fixture Employer'] }, {}, { matches: false, excluded: true });
add('domain-exclusion', ['exclusion'], 'A declared excluded employer domain also applies to the source URL.', { excludedTerms: ['careers.example.test'] }, {}, { matches: false, excluded: true });
add('description-exclusion', ['exclusion'], 'Literal excluded domain terms still apply within source text.', { excludedTerms: ['gambling'] }, { description: 'Business analyst supporting a gambling operation.' }, { matches: false, excluded: true });

export const discoveryFixtures: readonly DiscoveryFixture[] = cases;
