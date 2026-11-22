// @vitest-environment node
// Round-4 regressions for the first-value discovery repairs, written against the independent review of the round-3 head:
// only recognized workplace annotations may be set aside when deciding whether a stated region closes its place; any other bracketed
// or dash-separated trailing part ("Dallas, TX (Mexico)", "Dallas, TX - Brazil", "Dallas, TX – Mexico") is unresolved context and blocks the region.
// Everything is synthetic: invented places. No real vacancy, employer, person or network call.
import { describe, expect, it } from 'vitest';
import { inspectDiscoveryTarget } from '@/lib/employer-discovery';
import { discoveryFixtures } from './fixtures/employer-discovery-cases';

const base = discoveryFixtures[0];
const FILLER = 'Fictional synthetic posting written for a deterministic test. It describes no real vacancy.';
const profile = (changes: Record<string, unknown> = {}) => ({ ...base.profile, targetTitles: ['Business analyst'], locations: ['New York'], experienceYears: null, excludedTerms: [], compensation: { currency: '', period: 'annual' as const, minimum: null }, ...changes }) as typeof base.profile;
const job = (title: string, location = 'New York, NY', description = FILLER) => ({ ...base.opportunity, title, location, description });
const matched = (wanted: string, posting: string) => inspectDiscoveryTarget(profile({ locations: [wanted] }), job('Business Analyst', posting)).location === 'matched';

// [stated region place, country it resolves to when it closes the place]. No city here is in the existing city table.
const closed: [string, string][] = [
  ['Dallas, TX', 'United States'], ['Plano, TX', 'United States'], ['Salt Lake City, UT 84101', 'United States'], ['Raleigh, North Carolina', 'United States'],
  ['Calgary, AB', 'Canada'], ['Halifax, Nova Scotia', 'Canada'], ['Sydney, NSW', 'Australia'], ['Hobart, TAS', 'Australia'], ['Glasgow, Scotland', 'United Kingdom'],
];
// Wrappers that attach a qualifier to a place: parentheses, brackets, and a hyphen, en dash or em dash, with the spacing variants.
const wrap = (place: string, qualifier: string): string[] => [
  `${place} (${qualifier})`, `${place}(${qualifier})`, `${place} ( ${qualifier} )`, `${place} [${qualifier}]`, `${place}[${qualifier}]`,
  ...['-', '–', '—'].flatMap(dash => [`${place} ${dash} ${qualifier}`, `${place}  ${dash}  ${qualifier}`, `${place} ${dash}${qualifier}`, `${place}${dash} ${qualifier}`]),
];
const comma = (place: string, qualifier: string) => [`${place}, ${qualifier}`, `${place},${qualifier}`];

// Recognized workplace annotations (no "remote": a posting naming remote work is read by the separate remote rules).
const annotations = ['Hybrid', 'HYBRID', 'hybrid', 'Onsite', 'On-site', 'On site', 'on-site', 'Office', 'In office', 'In-office', 'Hybrid, Office', 'Hybrid & Onsite', 'Hybrid and On-site', 'Office and Hybrid'];
// Unresolved qualifiers: countries (supported and not), places, regions of another country, and other substantive text.
const unresolved = ['Mexico', 'Brazil', 'Japan', 'Ireland', 'Germany', 'Canada', 'United Kingdom', 'Houston', 'Fort Worth', 'Mexico City', 'Tokyo', 'Senior Role', 'Finance Team', 'Hybrid Mexico', 'Mexico Hybrid', 'Hybrid, Brazil', 'Brazil, Hybrid', 'Team of 5', 'Fictional Campus'];

describe('only recognized workplace annotations may follow a stated region', () => {
  it('the five reproduced fixtures', () => {
    expect(matched('United States', 'Dallas, TX (Mexico)')).toBe(false);
    expect(matched('United States', 'Dallas, TX - Brazil')).toBe(false);
    expect(matched('United States', 'Dallas, TX – Mexico')).toBe(false);
    expect(matched('United States', 'Dallas, TX (Hybrid)')).toBe(true);
    expect(matched('United States', 'Dallas, TX - Hybrid')).toBe(true);
  });

  it('every recognized annotation, in every wrapper and spacing, leaves the region closing its place', () => {
    const failures: string[] = [];
    for (const [place, country] of closed) {
      for (const annotation of annotations) {
        for (const posting of [...wrap(place, annotation), ...comma(place, annotation)]) if (!matched(country, posting)) failures.push(`${country} vs ${JSON.stringify(posting)}`);
      }
    }
    expect(failures).toEqual([]);
  });
  it('every unresolved qualifier, in every wrapper and spacing, blocks the region', () => {
    const failures: string[] = [];
    for (const [place, country] of closed) {
      // A qualifier that spells out the very country being asked for is explicit country text, not an unresolved one.
      for (const qualifier of unresolved.filter(candidate => candidate !== country)) {
        for (const posting of [...wrap(place, qualifier), ...comma(place, qualifier)]) if (matched(country, posting)) failures.push(`${country} vs ${JSON.stringify(posting)}`);
      }
    }
    expect(failures).toEqual([]);
  });
  it('a recognized annotation next to an unresolved one still blocks the region', () => {
    const failures: string[] = [];
    for (const [place, country] of closed) {
      for (const posting of [`${place} (Hybrid) (Mexico)`, `${place} (Hybrid) - Mexico`, `${place} - Hybrid - Mexico`, `${place} (Mexico) - Hybrid`, `${place} [Hybrid] [Brazil]`]) if (matched(country, posting)) failures.push(`${country} vs ${JSON.stringify(posting)}`);
    }
    expect(failures).toEqual([]);
  });
  it('two recognized annotations together are still annotations', () => {
    for (const posting of ['Dallas, TX (Hybrid) - Office', 'Dallas, TX (Hybrid) (On-site)', 'Dallas, TX - Hybrid - Office', 'Dallas, TX 75201 (Hybrid)', 'Dallas, TX - Hybrid, Office']) {
      expect(matched('United States', posting), posting).toBe(true);
    }
  });
  it('a qualifier that is not about a stated region never changes the place itself', () => {
    // No region is stated, so there is nothing to block: the same words match as before.
    expect(matched('Dallas', 'Dallas (Mexico)')).toBe(true);
    expect(matched('Mexico', 'Dallas, TX (Mexico)')).toBe(true);
    expect(matched('Dallas', 'Dallas, TX - Brazil')).toBe(true);
    expect(matched('United States', 'Dallas (Hybrid)')).toBe(false);
    expect(matched('Dallas', 'Dallas-Fort Worth, TX')).toBe(true);
    expect(matched('United States', 'Dallas-Fort Worth, TX')).toBe(true);
  });
  it('a qualified place stays one alternative: other alternatives keep their own country, in every separator and both orders', () => {
    const separators = [' | ', '|', '; ', ';', ' / ', '/', ' or ', '\n'];
    const failures: string[] = [];
    for (const separator of separators) {
      for (const blocked of ['Dallas, TX (Mexico)', 'Dallas, TX - Brazil', 'Dallas, TX – Mexico', 'Dallas, TX [Japan]', 'Dallas, TX — Ireland']) {
        for (const posting of [`${blocked}${separator}Calgary, AB`, `Calgary, AB${separator}${blocked}`]) {
          if (matched('United States', posting)) failures.push(`US must not match ${JSON.stringify(posting)}`);
          if (!matched('Canada', posting)) failures.push(`Canada must match ${JSON.stringify(posting)}`);
        }
      }
      for (const open of ['Dallas, TX (Hybrid)', 'Dallas, TX - Hybrid']) {
        for (const posting of [`${open}${separator}Calgary, AB`, `Calgary, AB${separator}${open}`]) {
          if (!matched('United States', posting) || !matched('Canada', posting)) failures.push(`both must match ${JSON.stringify(posting)}`);
          if (matched('Dallas, Canada', posting) || matched('Calgary, United States', posting)) failures.push(`pooled ${JSON.stringify(posting)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('disclosed boundaries that this change does not claim to resolve', () => {
  it('"Austin, TX, Japan" still matches a United States preference through the inherited Austin alias, as on public main', () => {
    expect(matched('United States', 'Austin, TX, Japan')).toBe(true);
    // A city that is not in the existing table has no such alias: the same shape is blocked.
    expect(matched('United States', 'Plano, TX, Japan')).toBe(false);
  });
  it('"Paris, France" against "Paris / France" is a conservative non-match; "/" separates alternatives', () => {
    expect(matched('Paris, France', 'Paris / France')).toBe(false);
    expect(matched('Paris, France', 'Paris, France')).toBe(true);
    expect(matched('Paris', 'Paris / France')).toBe(true);
    expect(matched('France', 'Paris / France')).toBe(true);
  });
});
