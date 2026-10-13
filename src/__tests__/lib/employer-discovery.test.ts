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
