// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { inspectDiscoveryTarget, matchesDiscoveryTarget } from '@/lib/employer-discovery';
import { discoveryFixtures } from './fixtures/employer-discovery-cases';

describe('discovery relevance contract: explicitly synthetic cases', () => {
  it('documents varied audiences and both admission/rejection without claiming market precision', () => {
    expect(discoveryFixtures.length).toBeGreaterThanOrEqual(30);
    expect(new Set(discoveryFixtures.map(item => item.audience))).toEqual(new Set(['student', 'mba', 'professional']));
    expect(discoveryFixtures.every(item => item.provenance === 'synthetic_contract_case' && item.rationale && item.guards.length)).toBe(true);
    expect(discoveryFixtures.filter(item => item.expected.matches).length).toBeGreaterThan(15);
    expect(discoveryFixtures.filter(item => !item.expected.matches).length).toBeGreaterThan(15);
    expect(new Set(discoveryFixtures.map(item => item.id)).size).toBe(discoveryFixtures.length);
  });
  for (const fixture of discoveryFixtures) {
    it(`${fixture.id}: ${fixture.rationale}`, () => {
      expect(inspectDiscoveryTarget(fixture.profile, fixture.opportunity)).toMatchObject(fixture.expected);
      expect(matchesDiscoveryTarget(fixture.profile, fixture.opportunity)).toBe(fixture.expected.matches);
    });
  }
  it('does not mutate candidate preferences or source verification when comparing evidence', () => {
    const fixture = discoveryFixtures.find(item => item.id === 'salary-dollar-ambiguous')!;
    const original = JSON.stringify([fixture.profile, fixture.opportunity]);
    expect(inspectDiscoveryTarget(fixture.profile, fixture.opportunity).compensation).toBe('unknown');
    expect(JSON.stringify([fixture.profile, fixture.opportunity])).toBe(original);
    expect(fixture.opportunity.verification).toBe('listed_on_source');
  });
});

describe('explicit broad seniority searches', () => {
  const baseline = discoveryFixtures[0];
  const match = (target: string, title: string, description = '') => inspectDiscoveryTarget(
    { ...baseline.profile, targetTitles: [target], locations: [], experienceYears: null, excludedTerms: [], compensation: { currency: 'USD', period: 'annual', minimum: null } },
    { ...baseline.opportunity, title, description },
  );
  it.each(['Director', 'Director-level', 'Any director-level role', 'Find any director-level roles', 'Show me director roles', 'Please find any director-level roles.'])('accepts %s across functions using the actual title', target => {
    for (const title of ['Director of Finance', 'Marketing Director', 'Senior Director, Engineering', 'Creative Director']) {
      expect(match(target, title)).toMatchObject({ matches: true, role: 'matched', seniority: 'compatible' });
    }
  });
  it.each(['Assistant to the Director', 'Executive Assistant, Director of Engineering', 'Chief of Staff to the Director', 'Assistant, Director of Engineering', "Director's Assistant", 'Director Office Coordinator', 'Analyst, Office of the Director', 'Software Engineer (reports to Director)', 'Designer supporting the Director', 'Marketing Coordinator', 'Managing Directorship'])('does not mistake %s for a director vacancy', title => {
    expect(match('Find any director-level roles', title, 'Work closely with the director and vice president.')).toMatchObject({ matches: false, role: 'mismatch' });
  });
  it.each(['VP, Engineering', 'Vice President of Finance', 'Senior Vice-President, Sales', 'SVP, Operations'])('matches broad VP to %s', title => {
    expect(match('Any VP-level roles', title).matches).toBe(true);
  });
  it('does not silently turn a director request into VP or ordinary management', () => {
    expect(match('Director', 'Vice President, Sales').matches).toBe(false);
    expect(match('Director', 'Marketing Manager').matches).toBe(false);
    expect(match('VP', 'Director of Sales').matches).toBe(false);
    expect(match('VP', 'Senior Software Engineer').matches).toBe(false);
  });
  it('distinguishes actual assistant/associate director ranks from staff assisting a director', () => {
    expect(match('Director', 'Assistant Director of Finance').matches).toBe(true);
    expect(match('Director', 'Associate Director, Research').matches).toBe(true);
    expect(match('Director', 'Assistant to the Director of Finance').matches).toBe(false);
    expect(match('Director', 'Research Associate supporting the Director').matches).toBe(false);
  });
  it.each(['Junior Software Engineer', 'Graduate Accountant', 'Entry-level Marketing Analyst', 'Engineering Intern'])('accepts explicitly early-career title %s', title => {
    expect(match('Find any entry-level roles', title).matches).toBe(true);
  });
  it('does not infer entry-level suitability from a generic title or a description mentioning junior staff', () => {
    expect(match('Entry-level', 'Software Engineer').matches).toBe(false);
    expect(match('Entry-level', 'Senior Software Engineer', 'Mentor junior staff.').matches).toBe(false);
    expect(match('Entry-level', 'Junior Director').matches).toBe(false);
  });
  it('keeps functional directions narrow and does not strip unsupported requests into a broad search', () => {
    expect(match('Finance Director', 'Marketing Director').matches).toBe(false);
    expect(match('Finance Director', 'Finance Director').matches).toBe(true);
    expect(match('Find any finance director-level roles', 'Marketing Director').matches).toBe(false);
    expect(match('Director or engineer', 'Marketing Director').matches).toBe(false);
    expect(match('Any role', 'Marketing Director').matches).toBe(false);
    expect(match('Find any jobs', 'Marketing Director').matches).toBe(false);
    expect(match('Lead', 'Lead Generation Specialist').matches).toBe(false);
  });
  it('preserves geography, exclusions, experience and compensation for broad requests', () => {
    const profile = { ...baseline.profile, targetTitles: ['Find any director-level roles'], locations: ['US'], experienceYears: 10, excludedTerms: [], compensation: { currency: 'USD', period: 'annual' as const, minimum: 100000 } };
    const opportunity = { ...baseline.opportunity, title: 'Director of Finance', company: 'Created company', location: 'New York', description: 'At least 5 years of experience required. Base salary USD 120000 per year.' };
    expect(inspectDiscoveryTarget(profile, opportunity).matches).toBe(true);
    expect(inspectDiscoveryTarget(profile, { ...opportunity, location: 'London, UK' })).toMatchObject({ matches: false, location: 'mismatch' });
    expect(inspectDiscoveryTarget({ ...profile, excludedTerms: ['Created company'] }, opportunity)).toMatchObject({ matches: false, excluded: true });
    expect(inspectDiscoveryTarget({ ...profile, experienceYears: 2 }, opportunity)).toMatchObject({ matches: false, experience: 'below_stated_minimum' });
    expect(inspectDiscoveryTarget({ ...profile, compensation: { ...profile.compensation, minimum: 200000 } }, opportunity)).toMatchObject({ matches: false, compensation: 'below_minimum' });
  });
});
