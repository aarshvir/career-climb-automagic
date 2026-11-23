// @vitest-environment node
// Round-2 regressions for the first-value discovery repairs, written against the independent review of the first head (two defect classes,
// six accepted negatives that main rejects). Everything is synthetic: invented titles, places and sentences. No real vacancy, employer, person
// or network call. Each block says which cases failed on the first head and which controls must hold before AND after.
import { describe, expect, it } from 'vitest';
import { inspectDiscoveryTarget } from '@/lib/employer-discovery';
import { discoveryFixtures } from './fixtures/employer-discovery-cases';

const base = discoveryFixtures[0];
const FILLER = 'Fictional synthetic posting written for a deterministic test. It describes no real vacancy.';
const profile = (changes: Record<string, unknown> = {}) => ({ ...base.profile, targetTitles: ['Business analyst'], locations: ['New York'], experienceYears: null, excludedTerms: [], compensation: { currency: '', period: 'annual' as const, minimum: null }, ...changes }) as typeof base.profile;
const job = (title: string, location = 'New York, NY', description = FILLER) => ({ ...base.opportunity, title, location, description });
const retains = (target: string, title: string) => inspectDiscoveryTarget(profile({ targetTitles: [target] }), job(title)).matches;

describe('defect 1 - a supervising or running role is not the intern role, whatever separates the words', () => {
  // The four titles the independent review reproduced (target -> title).
  it.each([
    ['Intern', 'Coordinator, Internship Programme'],
    ['Intern', 'Internship Programme - Coordinator'],
    ['Graduate trainee', 'Supervisor - Graduate Trainee Programme'],
    ['Intern', 'Intern - Product Manager'],
  ])('%s does not retain %s', (target, title) => {
    expect(retains(target, title)).toBe(false);
  });

  const runners = ['Coordinator', 'Co-ordinator', 'Manager', 'Supervisor', 'Programme Manager', 'Programme Coordinator', 'Administrator', 'Mentor', 'Recruiter', 'Trainer', 'Team Leader'];
  const breaks = [', ', ' - ', ' – ', ' — ', ' | ', ' / ', '; ', ': ', ' > ', ' & ', ' and ', ' + ', '-', '/', ','];
  const intern = ['Internship Programme', 'Internship', 'Intern', 'Summer Intern'];
  const trainee = ['Graduate Trainee Programme', 'Graduate Trainee', 'Graduate Trainee Scheme'];
  const prefixAndSuffix = (levels: string[]) => runners.flatMap(runner => levels.flatMap(level => [
    ...breaks.flatMap(separator => [`${runner}${separator}${level}`, `${level}${separator}${runner}`]),
    `${level} (${runner})`, `${runner} (${level})`, `${level} [${runner}]`, `${runner} [${level}]`,
  ]));
  it('Intern: the runner is named before or after the level word, across every separator', () => {
    const accepted = prefixAndSuffix(intern).filter(title => retains('Intern', title));
    expect(accepted).toEqual([]);
  });
  it('Graduate trainee: the runner is named before or after the level word, across every separator', () => {
    const accepted = prefixAndSuffix(trainee).filter(title => retains('Graduate trainee', title));
    expect(accepted).toEqual([]);
  });
  it('a running role written with the level word later in a longer title is still rejected', () => {
    for (const title of ['Programme Coordinator, Marketing - Internship Programme', 'Manager | Finance | Internship', 'Supervisor, Graduate Trainee Programme 2027', 'Internship Programme 2027 - Coordinator']) {
      expect(retains(title.includes('Graduate') ? 'Graduate trainee' : 'Intern', title), title).toBe(false);
    }
  });

  // Controls that must hold before AND after: the person IS the intern or trainee, whatever else the title carries.
  it.each([
    'Product Manager Intern', 'Project Coordinator Intern', 'Operations Supervisor Intern', 'Marketing Intern', 'Software Engineering Intern',
    'Intern - Finance', 'Intern, Finance', 'Intern: Finance', 'Intern | Finance', 'Intern / Finance', 'Intern-Finance', 'Intern (Finance)', 'Intern [Summer 2027]',
    'Finance & Accounting Intern', 'Sales and Marketing Intern', 'Summer Intern - Marketing Operations', 'Internship Programme', 'Internship Programme 2027',
    'Internship Programme - Finance', 'Finance - Internship Programme', 'Internship (Marketing, 6 months)', 'Data Science Intern, Summer 2027',
  ])('Intern retains %s', title => {
    expect(retains('Intern', title), title).toBe(true);
  });
  it.each([
    'Graduate Trainee', 'Graduate Trainee Programme', 'Graduate Trainee - Finance', 'Graduate Trainee, Finance', 'Graduate Trainee (2027 intake)',
    'Finance Graduate Trainee', 'Graduate Engineer Trainee', 'Graduate Trainee Programme - Finance', 'Finance - Graduate Trainee Programme',
    'Product Manager Graduate Trainee', 'Graduate-Trainee Programme',
  ])('Graduate trainee retains %s', title => {
    expect(retains('Graduate trainee', title), title).toBe(true);
  });
  it('the other discovery rules for these titles are unchanged (senior titles, other levels, and unrelated jobs stay out)', () => {
    expect(retains('Intern', 'Senior Intern Programme Director')).toBe(false);
    expect(retains('Intern', 'Head of Internships')).toBe(false);
    expect(retains('Intern', 'Graduate Trainee Programme')).toBe(false);
    expect(retains('Graduate trainee', 'Marketing Intern')).toBe(false);
    expect(retains('Graduate trainee', 'Management Trainee')).toBe(false);
    expect(retains('Intern', 'Marketing Manager')).toBe(false);
  });
});

describe('defect 2 - spelled-out country text outranks a region read from the same place', () => {
  const states = (country: string, posting: string) => inspectDiscoveryTarget(profile({ locations: [country] }), job('Business Analyst', posting)).location;
  const matchedBy = (posting: string) => ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany'].filter(country => states(country, posting) === 'matched');

  // The two strings the independent review reproduced, and their orderings.
  it('United Kingdom does not match "Scotland, Connecticut, United States" and United States does not match "New York, United Kingdom"', () => {
    expect(states('United Kingdom', 'Scotland, Connecticut, United States')).toBe('mismatch');
    expect(states('United States', 'New York, United Kingdom')).toBe('mismatch');
  });
  it.each([
    ['Scotland, Connecticut, United States', ['United States']],
    ['Connecticut, Scotland, United States', ['United States']],
    ['Scotland, Connecticut, USA', ['United States']],
    ['Scotland, CT, United States', ['United States']],
    ['Scotland, Connecticut, US', ['United States']],
    ['Scotland, CT, USA', ['United States']],
    ['New York, United Kingdom', ['United Kingdom']],
    ['New York, UK', ['United Kingdom']],
    ['New York, NY, United Kingdom', ['United Kingdom']],
    ['United Kingdom, New York', ['United Kingdom']],
    ['Texas, Germany', ['Germany']],
    ['Dallas, TX, Canada', ['Canada']],
    ['Calgary, AB, Australia', ['Australia']],
    ['Sydney, New South Wales, Canada', ['Canada']],
    ['Cardiff, Wales, Germany', ['Germany']],
    ['Glasgow, Scotland, United States', ['United States']],
  ])('"%s" is read from its spelled-out country only', (posting, expected) => {
    expect(matchedBy(posting), posting).toEqual(expected);
  });
  it('a place whose regions point at two countries contradicts itself and resolves to none', () => {
    for (const posting of ['Scotland, Connecticut', 'Connecticut, Scotland', 'Wales, Texas', 'Texas, Wales', 'Dallas, TX, Calgary, AB', 'Alberta, Queensland']) {
      expect(matchedBy(posting), posting).toEqual([]);
    }
  });

  // Controls that must hold before AND after.
  it('a state, province or nation alone still resolves its country', () => {
    expect(matchedBy('Dallas, TX')).toEqual(['United States']);
    expect(matchedBy('Albany, New York')).toEqual(['United States']);
    expect(matchedBy('Calgary, AB')).toEqual(['Canada']);
    expect(matchedBy('Sydney, NSW')).toEqual(['Australia']);
    expect(matchedBy('Glasgow, Scotland')).toEqual(['United Kingdom']);
    expect(matchedBy('Columbus, OH (Hybrid)')).toEqual(['United States']);
    expect(matchedBy('Dallas, TX - Hybrid')).toEqual(['United States']);
  });
  it('a region and a spelled-out country that agree still resolve', () => {
    expect(matchedBy('Dallas, TX, United States')).toEqual(['United States']);
    expect(matchedBy('Vancouver, BC, Canada')).toEqual(['Canada']);
    expect(matchedBy('Sydney, New South Wales, Australia')).toEqual(['Australia']);
    expect(matchedBy('Cardiff, Wales, United Kingdom')).toEqual(['United Kingdom']);
    expect(matchedBy('New York, United States')).toEqual(['United States']);
  });
  it('explicit-country postings and the city table are unchanged', () => {
    expect(matchedBy('Berlin, Germany')).toEqual(['Germany']);
    expect(matchedBy('Sydney, Australia')).toEqual(['Australia']);
    expect(matchedBy('London')).toEqual(['United Kingdom']);
    expect(matchedBy('London, UK')).toEqual(['United Kingdom']);
    expect(matchedBy('London, ON')).toEqual(['Canada']);
    expect(matchedBy('New York')).toEqual(['United States']);
    expect(matchedBy('New York, NY')).toEqual(['United States']);
  });
  it('separate places each keep their own country; one place spelling its country does not remove the others', () => {
    expect(matchedBy('Dallas, TX | Calgary, AB')).toEqual(['United States', 'Canada']);
    expect(matchedBy('Dallas, TX; Calgary, AB')).toEqual(['United States', 'Canada']);
    expect(matchedBy('Dallas, TX / Sydney, NSW')).toEqual(['United States', 'Australia']);
    expect(matchedBy('Dallas, TX or Calgary, AB')).toEqual(['United States', 'Canada']);
    expect(matchedBy('Dallas, TX | Berlin, Germany')).toEqual(['United States', 'Germany']);
    expect(matchedBy('Dallas, TX | New York, United Kingdom')).toEqual(['United States', 'United Kingdom']);
  });
  it('a preference naming the place itself still matches by that name', () => {
    expect(inspectDiscoveryTarget(profile({ locations: ['Scotland'] }), job('Business Analyst', 'Scotland, Connecticut, United States')).location).toBe('matched');
    expect(inspectDiscoveryTarget(profile({ locations: ['Dallas'] }), job('Business Analyst', 'Dallas, TX')).location).toBe('matched');
  });
});
