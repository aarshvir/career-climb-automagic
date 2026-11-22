// @vitest-environment node
// Round-3 regressions for the first-value discovery repairs, written against the independent review of the round-2 head
// (place evidence pooled across offered alternatives; a region read through unresolved trailing context).
// Everything is synthetic: invented places and titles. No real vacancy, employer, person or network call.
import { describe, expect, it } from 'vitest';
import { inspectDiscoveryTarget } from '@/lib/employer-discovery';
import { discoveryFixtures } from './fixtures/employer-discovery-cases';

const base = discoveryFixtures[0];
const FILLER = 'Fictional synthetic posting written for a deterministic test. It describes no real vacancy.';
const profile = (changes: Record<string, unknown> = {}) => ({ ...base.profile, targetTitles: ['Business analyst'], locations: ['New York'], experienceYears: null, excludedTerms: [], compensation: { currency: '', period: 'annual' as const, minimum: null }, ...changes }) as typeof base.profile;
const job = (title: string, location = 'New York, NY', description = FILLER) => ({ ...base.opportunity, title, location, description });
const matched = (wanted: string, posting: string) => inspectDiscoveryTarget(profile({ locations: [wanted] }), job('Business Analyst', posting)).location === 'matched';

// Every documented place separator: "|", ";", "/", a line break and " or ", spaced and unspaced where that reads naturally.
const SEPARATORS = [' | ', '|', '; ', ';', ' / ', '/', ' or ', ' OR ', '\n'];
const both = (a: string, b: string, separator: string) => [`${a}${separator}${b}`, `${b}${separator}${a}`];

describe('the whole requested place is matched against ONE offered alternative, never against pooled evidence', () => {
  it('the three reproduced fixtures', () => {
    expect(matched('London, United States', 'London | Dallas, TX')).toBe(false);
    expect(matched('Dallas, Canada', 'Dallas, TX | Calgary, AB')).toBe(false);
    expect(matched('Dallas, United States', 'Dallas, TX | Calgary, AB')).toBe(true);
  });

  // [wanted, one alternative, another alternative]: city words from one place and country evidence from the other.
  const rejects: [string, string, string][] = [
    ['London, United States', 'London', 'Dallas, TX'], ['Dallas, Canada', 'Dallas, TX', 'Calgary, AB'], ['Calgary, United States', 'Dallas, TX', 'Calgary, AB'],
    ['Dallas, Australia', 'Dallas, TX', 'Sydney, NSW'], ['Dubai, United Kingdom', 'London', 'Dubai'], ['Toronto, United States', 'Dallas, TX', 'Toronto'],
    ['Berlin, France', 'Paris, France', 'Berlin, Germany'], ['Calgary, TX', 'Dallas, TX', 'Calgary, AB'], ['New York, United Kingdom', 'New York', 'United Kingdom'],
    ['Dallas, TX, Canada', 'Dallas, TX', 'Calgary, AB'], ['Sydney, Canada', 'Sydney, NSW', 'Toronto'], ['London, Germany', 'London', 'Berlin, Germany'],
    ['London, United Kingdom', 'London, Germany', 'Birmingham, United Kingdom'], ['Dubai, United Arab Emirates', 'Dubai, Germany', 'Doha, United Arab Emirates'],
  ];
  const accepts: [string, string, string][] = [
    ['Dallas, United States', 'Dallas, TX', 'Calgary, AB'], ['Calgary, Canada', 'Dallas, TX', 'Calgary, AB'], ['Dallas', 'Dallas, TX', 'Calgary, AB'],
    ['Calgary', 'Dallas, TX', 'Calgary, AB'], ['United States', 'Dallas, TX', 'Calgary, AB'], ['Canada', 'Dallas, TX', 'Calgary, AB'],
    ['London, United Kingdom', 'London', 'Dubai'], ['Dubai, United Arab Emirates', 'London', 'Dubai'], ['United States', 'New York', 'United Kingdom'],
    ['United Kingdom', 'New York', 'United Kingdom'], ['Sydney, Australia', 'Dallas, TX', 'Sydney, NSW'], ['Dallas, TX', 'Dallas, TX', 'Calgary, AB'],
    ['London', 'London', 'Dallas, TX'], ['United States', 'London', 'Dallas, TX'], ['Berlin, Germany', 'Paris, France', 'Berlin, Germany'],
  ];
  it.each(rejects)('rejects %s against %s and %s, in both orders and with every separator', (wanted, a, b) => {
    const accepted = SEPARATORS.flatMap(separator => both(a, b, separator)).filter(posting => matched(wanted, posting));
    expect(accepted).toEqual([]);
  });
  it.each(accepts)('accepts %s against %s and %s, in both orders and with every separator', (wanted, a, b) => {
    const refused = SEPARATORS.flatMap(separator => both(a, b, separator)).filter(posting => !matched(wanted, posting));
    expect(refused).toEqual([]);
  });

  // Decision 1 and 2 of the 23 Nov location note, kept as stated: separately stated alternatives may match; a comma-qualified place may not.
  it('"New York | United Kingdom" may match United States, "New York, United Kingdom" may not', () => {
    for (const separator of SEPARATORS) expect(matched('United States', `New York${separator}United Kingdom`), JSON.stringify(separator)).toBe(true);
    expect(matched('United States', 'New York, United Kingdom')).toBe(false);
    expect(matched('United Kingdom', 'New York, United Kingdom')).toBe(true);
  });
  it('"London | Dallas, TX" stays non-matching for the United Kingdom: no country is invented for a bare London', () => {
    for (const posting of SEPARATORS.flatMap(separator => both('London', 'Dallas, TX', separator))) expect(matched('United Kingdom', posting), JSON.stringify(posting)).toBe(false);
    expect(matched('United Kingdom', 'London')).toBe(true);
    expect(matched('United Kingdom', 'Dubai | London')).toBe(true);
  });
  it('explicit same-place country precedence and contradictory-place rejection hold inside an alternative list', () => {
    for (const separator of SEPARATORS) {
      expect(matched('United Kingdom', `Scotland, Connecticut, United States${separator}Dallas, TX`), JSON.stringify(separator)).toBe(false);
      expect(matched('United States', `New York, United Kingdom${separator}Calgary, AB`), JSON.stringify(separator)).toBe(false);
      expect(matched('United Kingdom', `Scotland, Connecticut${separator}Wales, Texas`), JSON.stringify(separator)).toBe(false);
      expect(matched('United States', `Scotland, Connecticut${separator}Dallas, TX`), JSON.stringify(separator)).toBe(true);
    }
  });

  // Generated matrix: for every pair of offered alternatives and every wanted place, (1) the separator does not change the result,
  // (2) the order does not change it, (3) a combined offer matches only if one of its alternatives matches ON ITS OWN.
  const alternatives = ['London', 'Dallas, TX', 'Calgary, AB', 'Dubai', 'Toronto', 'Sydney, NSW', 'Paris, France', 'Berlin, Germany', 'New York, NY', 'Scotland, Connecticut',
    'Dallas, TX, Mexico', 'Albany, New York', 'Glasgow, Scotland', 'Austin', 'Cardiff, Wales, United Kingdom', 'Vancouver, BC'];
  const wanteds = ['London', 'Dallas', 'Calgary', 'Austin', 'United States', 'Canada', 'United Kingdom', 'United Arab Emirates', 'Australia', 'France', 'Germany', 'Mexico',
    'London, United States', 'Dallas, Canada', 'Dallas, United States', 'Calgary, Canada', 'Dubai, United Kingdom', 'Toronto, United States', 'Paris, Germany', 'Berlin, France',
    'New York, United Kingdom', 'Scotland, United States', 'Albany, United States', 'Glasgow, United Kingdom', 'Austin, Canada', 'Vancouver, United States'];
  it('is independent of the separator and the order, and never matches on pooled evidence', () => {
    const failures: string[] = [];
    for (let i = 0; i < alternatives.length; i++) {
      for (let j = i + 1; j < alternatives.length; j++) {
        const [a, b] = [alternatives[i], alternatives[j]];
        for (const wanted of wanteds) {
          const results = SEPARATORS.flatMap(separator => both(a, b, separator).map(posting => matched(wanted, posting)));
          if (new Set(results).size !== 1) failures.push(`separator/order: ${wanted} vs ${a} + ${b}`);
          if (results[0] && !matched(wanted, a) && !matched(wanted, b)) failures.push(`pooled: ${wanted} vs ${a} + ${b}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('a region is read only when it closes the place; unresolved trailing context declines inference', () => {
  // Decision 3: no Mexico-only patch. Any trailing part the region table cannot resolve means nothing is inferred.
  it.each(['Dallas, TX, Mexico', 'Dallas, TX, Brazil', 'Plano, TX, Japan', 'Dallas, TX, Ireland', 'Dallas, TX, Houston', 'Texas, Mexico', 'Dallas, TX, Mexico City', 'Dallas, TX, Texas Panhandle'])(
    '%s does not match a United States preference', posting => {
      expect(matched('United States', posting)).toBe(false);
      for (const separator of SEPARATORS) expect(matched('United States', `${posting}${separator}Calgary, AB`), JSON.stringify(separator)).toBe(false);
    });
  it('the same places still match by their own words, and other alternatives keep their own country', () => {
    expect(matched('Mexico', 'Dallas, TX, Mexico')).toBe(true);
    expect(matched('Dallas', 'Dallas, TX, Mexico')).toBe(true);
    expect(matched('Canada', 'Dallas, TX, Mexico | Calgary, AB')).toBe(true);
    expect(matched('United States', 'Dallas, TX, Mexico | Austin, TX')).toBe(true);
    expect(matched('Canada', 'Calgary, AB, Mexico')).toBe(false);
  });
  it.each(['Dallas, TX', 'Dallas,TX', 'Dallas, TX 75201', 'Salt Lake City, UT 84101', 'Dallas, TX (Hybrid)', 'Columbus, OH (Hybrid)', 'Dallas, TX - Hybrid', 'Dallas, TX, Hybrid',
    'Dallas, TX, Onsite', 'Dallas, Texas', 'Raleigh, North Carolina', 'Austin Texas', 'West Virginia', 'New York, NY', 'Albany, New York', 'Dallas, TX, Fort Worth, TX'])(
    '%s still resolves to the United States', posting => {
      expect(matched('United States', posting), posting).toBe(true);
    });
  it('the other countries still resolve from a closing region', () => {
    expect(matched('Canada', 'Calgary, AB')).toBe(true);
    expect(matched('Canada', 'Halifax, Nova Scotia')).toBe(true);
    expect(matched('Australia', 'Sydney, NSW')).toBe(true);
    expect(matched('Australia', 'Sydney, New South Wales')).toBe(true);
    expect(matched('United Kingdom', 'Glasgow, Scotland')).toBe(true);
    expect(matched('Canada', 'London, ON')).toBe(true);
    expect(matched('United Kingdom', 'London, ON')).toBe(false);
  });
});
