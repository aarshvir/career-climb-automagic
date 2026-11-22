// @vitest-environment node
// Regression tests for four narrow wrong-rejection repairs in the discovery relevance guard (numbered as in the 22 Nov scope note:
// proposal 1 Intern / Graduate trainee, proposal 2 minimum-experience wording, proposal 3 state/province context, proposal 4 plural filler words).
// Everything here is synthetic: invented titles, locations and sentences. No real vacancy, employer, person or network call.
// Each block states which cases fail on the unrepaired guard (the repair) and which must hold before AND after (the guard that must not weaken).
import { describe, expect, it } from 'vitest';
import { inspectDiscoveryTarget, readDiscoveryMinimumExperience } from '@/lib/employer-discovery';
import { roleChoices } from '@/lib/loop-role-suggestions';
import { discoveryFixtures } from './fixtures/employer-discovery-cases';

const base = discoveryFixtures[0];
const FILLER = 'Fictional synthetic posting written for a deterministic test. It describes no real vacancy.';
const profile = (changes: Record<string, unknown> = {}) => ({ ...base.profile, targetTitles: ['Business analyst'], locations: ['New York'], experienceYears: null, excludedTerms: [], compensation: { currency: '', period: 'annual' as const, minimum: null }, ...changes }) as typeof base.profile;
const job = (title: string, location = 'New York, NY', description = FILLER) => ({ ...base.opportunity, title, location, description });
const roleOf = (target: string, title: string) => inspectDiscoveryTarget(profile({ targetTitles: [target] }), job(title));
const retains = (target: string, title: string) => roleOf(target, title).matches;

describe('proposal 1 - the exact onboarding choices "Intern" and "Graduate trainee" can match a posting', () => {
  // Repair: both choices are made only of level words, so they were left with no role word and never matched.
  it('every non-broad onboarding role choice retains a posting titled exactly like the choice', () => {
    const failing = roleChoices.filter(choice => !/^Any /.test(choice)).filter(choice => !inspectDiscoveryTarget(profile({ targetTitles: [choice] }), job(choice.replace(/\b\w/g, letter => letter.toUpperCase()))).matches);
    expect(failing).toEqual([]);
  });
  it.each(['Marketing Intern', 'Software Engineering Intern', 'Product Manager Intern', 'Operations Internship', 'Summer Internship Program', 'Marketing Internship Programme 2027',
    'Data Science Intern, Summer 2027', 'Intern - Finance', 'Internship (Marketing, 6 months)', 'Finance Interns', 'Intern to the Finance Team'])('Intern retains %s', title => {
    expect(roleOf('Intern', title)).toMatchObject({ matches: true, role: 'matched' });
  });
  it.each(['Graduate Trainee', 'Graduate Trainee Programme', 'Graduate Trainee Accountant', 'Graduate Engineer Trainee', 'Graduate Trainee - Finance',
    'Finance Graduate Trainee (2027 intake)', 'Graduate Management Trainee', 'Trainee Accountant (Graduate Programme)'])('Graduate trainee retains %s', title => {
    expect(roleOf('Graduate trainee', title)).toMatchObject({ matches: true, role: 'matched' });
  });
  it.each(['Interns', 'Any intern role', 'Find any intern jobs', 'Intern level'])('the offered choice phrased as "%s" is the same request', target => {
    expect(roleOf(target, 'Marketing Intern').matches).toBe(true);
  });
  it.each(['Graduate trainees', 'Any graduate trainee role', 'Find any graduate trainee jobs', 'Graduate-trainee'])('the offered choice phrased as "%s" is the same request', target => {
    expect(roleOf(target, 'Graduate Trainee Programme').matches).toBe(true);
  });

  // Negative cases: a job that runs, supervises or recruits for the programme is not the intern or trainee role. Hold before and after.
  it.each(['Internship Programme Manager', 'Internship Program Manager', 'Intern Programme Coordinator', 'Intern Programme Supervisor', 'Intern Supervisor', 'Intern Manager',
    'Internship Recruiter', 'Intern Mentor', 'Intern Programme Specialist', 'Intern Programme Lead', 'Internship Programme Director', 'Head of Internships', 'Senior Intern Programme Director',
    'Internal Tools Engineer', 'International Sales Manager', 'Marketing Manager', 'Software Engineer'])('Intern does not retain %s', title => {
    expect(retains('Intern', title)).toBe(false);
  });
  it.each(['Graduate Trainee Programme Supervisor', 'Graduate Trainee Programme Manager', 'Graduate Trainee Programme Coordinator', 'Graduate Trainee Supervisor', 'Graduate Trainee Manager', 'Graduate Trainee Recruiter',
    'Trainee Programme Supervisor (Graduate)', 'Graduate Trainee Programme Director', 'Head of Graduate Trainee Programme', 'Senior Graduate Trainee', 'Lead Graduate Trainee',
    'Marketing Manager', 'Software Engineer'])('Graduate trainee does not retain %s', title => {
    expect(retains('Graduate trainee', title)).toBe(false);
  });
  it('the two choices stay separate from each other and from the plain Graduate level', () => {
    expect(retains('Intern', 'Graduate Trainee Programme')).toBe(false);
    expect(retains('Graduate trainee', 'Marketing Intern')).toBe(false);
    expect(retains('Graduate trainee', 'Graduate Business Analyst')).toBe(false);
    expect(retains('Graduate trainee', 'Trainee Accountant')).toBe(false);
    expect(retains('Graduate trainee', 'Management Trainee')).toBe(false);
  });
  // Not broadened: "Management trainee", a bare "Trainee" and "Internship" are not offered choices and keep their previous behaviour.
  it('does not turn Management trainee, Trainee or Internship into a broad trainee or intern request', () => {
    expect(retains('Management trainee', 'Software Engineer Trainee')).toBe(false);
    expect(retains('Management trainee', 'Graduate Trainee Programme')).toBe(false);
    expect(retains('Management trainee', 'Management Trainee')).toBe(true);
    expect(retains('Trainee', 'Graduate Trainee Programme')).toBe(false);
    expect(retains('Trainee', 'Management Trainee')).toBe(false);
    expect(retains('Internship', 'Marketing Intern')).toBe(false);
  });
  // Functional-role requirements and explicit early-career behaviour that already existed.
  it('a request that carries a function word still needs that function', () => {
    expect(retains('Marketing intern', 'Marketing Intern')).toBe(true);
    expect(retains('Marketing intern', 'Operations Intern')).toBe(false);
    expect(retains('Operations Intern', 'Operations Internship')).toBe(true);
    expect(retains('Graduate', 'Graduate Business Analyst')).toBe(true);
    expect(retains('Entry-level', 'Software Engineer')).toBe(false);
  });
  it('location, exclusion, minimum-experience and pay guards still apply to both choices', () => {
    for (const target of ['Intern', 'Graduate trainee']) {
      const title = target === 'Intern' ? 'Marketing Intern' : 'Graduate Trainee Programme';
      const candidate = profile({ targetTitles: [target], experienceYears: 0 });
      expect(inspectDiscoveryTarget(candidate, job(title)).matches).toBe(true);
      expect(inspectDiscoveryTarget(candidate, job(title, 'Paris, France')).matches).toBe(false);
      expect(inspectDiscoveryTarget({ ...candidate, excludedTerms: ['Fictional Fixture Employer'] }, job(title)).matches).toBe(false);
      expect(inspectDiscoveryTarget(candidate, job(title, 'New York, NY', `${FILLER} 3+ years of experience required.`)).matches).toBe(false);
      expect(inspectDiscoveryTarget({ ...candidate, compensation: { currency: 'USD', period: 'annual' as const, minimum: 100000 } }, job(title, 'New York, NY', `${FILLER} Salary range: USD 20,000-30,000 per year.`)).matches).toBe(false);
    }
  });
});

describe('proposal 2 - company history is not read as the candidate minimum, requirements keep their minimum', () => {
  const years = 'Fictional synthetic posting for a deterministic test. ';
  // Repair: clear company-history statements (the number is attributed to "our" / "the company's" / "a company with").
  it.each([
    'Founded in 2005, we are a company with 20+ years of experience in payments. Duties are placeholders.',
    'Our 25+ years of industry experience helps customers. Duties are placeholders.',
    'Founded in 2005, our 25+ years of experience in payments is why customers stay.',
    "The company's 25+ years of experience helps customers.",
    'The company’s 25+ years of experience helps customers.',
    'We are a firm with 15+ years of experience in logistics. Duties are placeholders.',
    'Join an organisation spanning 30+ years of experience in logistics.',
  ])('does not reject a 3-year candidate for company history: %s', sentence => {
    expect(readDiscoveryMinimumExperience(years + sentence)).toBeNull();
    expect(inspectDiscoveryTarget(profile({ experienceYears: 3 }), job('Business Analyst', 'New York, NY', years + sentence))).toMatchObject({ matches: true, experience: 'unknown' });
  });
  // Requirement wording keeps its minimum, including wording AFTER the number and wording that starts like company history.
  it.each([
    ['Our 5+ years of experience requirement is mandatory.', 5],
    ['Our 5+ years of experience is required for this role.', 5],
    ['Our 5+ years of experience is a must.', 5],
    ['Our 5+ years of experience is non-negotiable.', 5],
    ['Our 4 years of experience minimum is essential.', 4],
    ["The company's 6+ years of experience minimum applies to every hire.", 6],
    ['The company’s 6+ years of experience requirement applies to every hire.', 6],
    ['Join a company with 5+ years of experience required for every analyst.', 5],
    ['We are a company hiring analysts with 5+ years of experience.', 5],
    ['Our ideal candidate has 5+ years of experience.', 5],
    ['We are looking for someone with 5+ years of experience.', 5],
    ['We require 5+ years of experience.', 5],
    ['The team requires at least 4 years of experience.', 4],
    ['Candidates with 6+ years of experience in analytics.', 6],
    ['A business analyst with 5+ years of experience.', 5],
    ['We need a company analyst with 7+ years of experience.', 7],
    ['Our company has 20+ years of experience. You must have 4+ years of experience.', 4],
    ['Our 25+ years of experience helps customers. You must have 4+ years of experience.', 4],
  ])('still reads the candidate minimum in: %s', (sentence, minimum) => {
    expect(readDiscoveryMinimumExperience(years + sentence)).toBe(minimum);
    expect(inspectDiscoveryTarget(profile({ experienceYears: 2 }), job('Business Analyst', 'New York, NY', years + sentence))).toMatchObject({ matches: false, experience: 'below_stated_minimum', minimumExperienceYears: minimum });
  });
  it('the existing company-history wording and the existing optional, negated and degree-alternative skips are unchanged', () => {
    expect(readDiscoveryMinimumExperience(years + 'Our company has 15+ years of industry experience. Graduates are welcome.')).toBeNull();
    expect(readDiscoveryMinimumExperience(years + '5+ years of experience preferred; graduates are welcome.')).toBeNull();
    expect(readDiscoveryMinimumExperience(years + '5 years of experience is not required.')).toBeNull();
    expect(readDiscoveryMinimumExperience(years + 'A relevant degree or 5 years of experience required.')).toBeNull();
    expect(readDiscoveryMinimumExperience(years + 'Minimum 3 years of experience required.')).toBe(3);
  });
  it('a sentence that addresses the candidate keeps its number even when it starts with "our"', () => {
    expect(readDiscoveryMinimumExperience(years + 'Our 10+ years of experience in the field will help you, and you should bring the same.')).toBe(10);
  });
});

describe('proposal 3 - explicit state and province context resolves the country, bare places stay unresolved', () => {
  const states = (country: string, posting: string) => inspectDiscoveryTarget(profile({ locations: [country] }), job('Business Analyst', posting)).location;
  const resolvesTo = (posting: string, expected: string[]) => {
    for (const country of ['United States', 'Canada', 'Australia', 'United Kingdom', 'Germany']) {
      expect(states(country, posting), `${country} preference vs "${posting}"`).toBe(expected.includes(country) ? 'matched' : 'mismatch');
    }
  };
  // Repair: a place followed by an explicit state, province or nation resolves to that country.
  it.each([
    ['Dallas, TX', ['United States']], ['Portland, OR', ['United States']], ['Honolulu, HI', ['United States']], ['Salt Lake City, UT 84101', ['United States']],
    ['Columbus, OH (Hybrid)', ['United States']], ['Dallas, TX - Hybrid', ['United States']], ['Dallas,TX', ['United States']], ['Raleigh, North Carolina', ['United States']],
    ['Philadelphia, Pennsylvania', ['United States']], ['Austin, Texas', ['United States']], ['San Diego, California', ['United States']], ['Albany, New York', ['United States']],
    ['Vancouver, BC', ['Canada']], ['Calgary, AB', ['Canada']], ['Montreal, QC', ['Canada']], ['Ottawa, ON', ['Canada']], ['Halifax, Nova Scotia', ['Canada']], ['Winnipeg, Manitoba', ['Canada']],
    ['Sydney, NSW', ['Australia']], ['Melbourne, VIC', ['Australia']], ['Brisbane, QLD', ['Australia']], ['Hobart, TAS', ['Australia']], ['Canberra, ACT', ['Australia']],
    ['Sydney, New South Wales', ['Australia']], ['Brisbane, Queensland', ['Australia']],
    ['Glasgow, Scotland', ['United Kingdom']], ['Cardiff, Wales', ['United Kingdom']], ['Belfast, Northern Ireland', ['United Kingdom']],
  ])('%s resolves to its country only', (posting, expected) => resolvesTo(posting, expected));
  it('the same city name resolves by its explicit state, not by the name (Melbourne FL, Sydney NS, Paris TX)', () => {
    resolvesTo('Melbourne, FL', ['United States']);
    resolvesTo('Sydney, NS', ['Canada']);
    resolvesTo('Paris, TX', ['United States']);
    resolvesTo('Melbourne, Florida', ['United States']);
    resolvesTo('Sydney, Nova Scotia', ['Canada']);
  });
  // Negative cases the repair must not break, and the bare-place cases it must leave alone. Hold before and after.
  it('Vancouver WA is not Canada: WA is also Western Australia, so the code resolves to nothing', () => {
    resolvesTo('Vancouver, WA', []);
    resolvesTo('Perth, WA', []);
  });
  it('a bare city that exists in more than one country is never resolved to a country', () => {
    for (const bare of ['Sydney', 'Melbourne', 'Vancouver', 'Brisbane', 'Berlin', 'Munich', 'Portland', 'Dallas', 'Victoria', 'London Ontario']) {
      const result = (country: string) => states(country, bare);
      expect(['United States', 'Canada', 'Australia', 'Germany'].filter(country => result(country) === 'matched'), `bare ${bare}`).toEqual([]);
    }
  });
  it('ambiguous codes and names resolve to nothing instead of guessing', () => {
    for (const posting of ['Darwin, NT', 'Adelaide, SA', 'San Diego, CA', 'Toronto, CA', 'Berlin, DE', 'Mumbai, IN', 'Tel Aviv, IL', 'Ontario, CA', 'Tbilisi, Georgia', 'Savannah, Georgia', 'Victoria, Victoria', 'Tijuana, Baja California', 'Boston, New England']) {
      for (const country of ['United States', 'Canada', 'Australia', 'Germany']) {
        // Toronto is a named city and Boston is a named city: those are matched by their existing table entries and are compared only for the foreign countries below.
        if (posting === 'Toronto, CA' && country === 'Canada') continue;
        if (posting === 'Boston, New England' && country === 'United States') continue;
        expect(states(country, posting), `${country} preference vs "${posting}"`).not.toBe('matched');
      }
    }
  });
  it('a province or state name that is also a city elsewhere is not read as that country', () => {
    resolvesTo('Ontario, California', ['United States']);
    resolvesTo('New Brunswick, NJ', ['United States']);
    resolvesTo('Yukon, OK', ['United States']);
  });
  it('overlapping names resolve by the longest name (New South Wales is not Wales)', () => {
    resolvesTo('Sydney, New South Wales', ['Australia']);
    resolvesTo('Cardiff, Wales', ['United Kingdom']);
    resolvesTo('West Virginia', ['United States']);
  });
  it('a two-letter code is used only in the form "City, ST", in capitals, and never when it is also a country code', () => {
    for (const posting of ['Dallas TX', 'dallas, tx', 'Dallas, Tx', 'Dallas, TX Hybrid Role', 'Dallas OR Houston']) {
      expect(states('United States', posting), posting).not.toBe('matched');
    }
    // ISO 3166-1 alpha-2 country codes (US is already read as the United States by the existing place rules).
    const iso = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
    const resolved = iso.filter(code => ['United States', 'Canada', 'Australia'].some(country => states(country, `Exampletown, ${code}`) === 'matched'));
    expect(resolved).toEqual([]);
  });
  it('explicit country text and the existing city table keep working with a state present', () => {
    resolvesTo('Vancouver, BC, Canada', ['Canada']);
    resolvesTo('Dallas, TX, United States', ['United States']);
    resolvesTo('Sydney, Australia', ['Australia']);
    resolvesTo('Berlin, Germany', ['Germany']);
    resolvesTo('Toronto, ON', ['Canada']);
    resolvesTo('Austin, TX', ['United States']);
    resolvesTo('New York, NY', ['United States']);
  });
  it('a posting that names places in two countries matches both, as it already did for the city table', () => {
    resolvesTo('Dallas, TX | Calgary, AB', ['United States', 'Canada']);
    resolvesTo('Dallas, TX | Berlin, Germany', ['United States', 'Germany']);
  });
  it('an explicit state outranks the city table for the same posting, as explicit country text already does (London, Ontario)', () => {
    expect(states('Canada', 'London, ON')).toBe('matched');
    expect(states('United Kingdom', 'London, ON')).toBe('mismatch');
    expect(states('United Kingdom', 'London, UK')).toBe('matched');
    expect(states('United Kingdom', 'London')).toBe('matched');
  });
  it('a preference naming the city itself still matches by the city name', () => {
    expect(inspectDiscoveryTarget(profile({ locations: ['Dallas'] }), job('Business Analyst', 'Dallas, TX')).location).toBe('matched');
    expect(inspectDiscoveryTarget(profile({ locations: ['Sydney'] }), job('Business Analyst', 'Sydney, NS')).location).toBe('matched');
  });
  it('remote handling and the other guards are unchanged', () => {
    expect(inspectDiscoveryTarget(profile({ locations: ['United States'] }), job('Business Analyst', 'Remote')).matches).toBe(false);
    expect(inspectDiscoveryTarget(profile({ locations: ['United States', 'Remote'] }), job('Business Analyst', 'Remote - US')).location).toBe('matched');
    expect(inspectDiscoveryTarget(profile({ locations: ['Canada'] }), job('Business Analyst', 'Remote - Texas')).location).toBe('mismatch');
    expect(inspectDiscoveryTarget(profile({ locations: ['United States'] }), job('Nurse Practitioner', 'Dallas, TX')).matches).toBe(false);
    expect(inspectDiscoveryTarget(profile({ locations: ['United States'], excludedTerms: ['Fictional Fixture Employer'] }), job('Business Analyst', 'Dallas, TX')).matches).toBe(false);
    expect(inspectDiscoveryTarget(profile({ locations: ['United States'] }), job('Business Analyst', '')).location).toBe('unknown');
  });
});

describe('proposal 4 - typed role ending in a plural filler word (jobs, roles, positions)', () => {
  // Repair: the singular filler words job/role/position are already ignored, the plurals were not.
  it.each(['Data analyst roles', 'Data analyst jobs', 'Data analyst positions', 'Data analyst jobs and roles', 'Data analyst, roles'])('typed role "%s" retains a Data Analyst posting', target => {
    expect(roleOf(target, 'Data Analyst')).toMatchObject({ matches: true, role: 'matched' });
  });
  // Holds before and after.
  it('the singular forms already worked', () => {
    expect(retains('Data analyst role', 'Data Analyst')).toBe(true);
    expect(retains('Data analyst job', 'Data Analyst')).toBe(true);
    expect(retains('Data analyst position', 'Data Analyst')).toBe(true);
  });
  it.each([['Data analyst jobs', 'Financial Analyst'], ['Data analyst roles', 'Data Scientist'], ['Data analyst positions', 'Software Engineer'], ['Business analyst fintech', 'Business Analyst']])('"%s" still does not retain "%s"', (target, title) => {
    expect(retains(target, title)).toBe(false);
  });
  it.each(['jobs', 'roles', 'positions', 'jobs and roles'])('a role made only of filler words ("%s") never matches, as the singular already did not', target => {
    expect(retains(target, 'Data Analyst')).toBe(false);
    expect(retains(target, 'Open Positions Coordinator')).toBe(false);
    expect(retains(target, 'Roles Analyst')).toBe(false);
  });
  it('removes filler only from the end of the typed role, never from the middle or from a posting title', () => {
    expect(retains('Positions coordinator', 'Coordinator')).toBe(false);
    expect(retains('Roles analyst', 'Analyst')).toBe(false);
    expect(retains('Jobs analyst', 'Data Analyst')).toBe(false);
    expect(retains('Positions coordinator', 'Open Positions Coordinator')).toBe(true);
  });
  // Functional words that look like filler keep their meaning. `opportunities` is deliberately NOT treated as filler.
  it('keeps the words of functional titles such as Equal Opportunities Officer', () => {
    expect(retains('Equal Opportunities Officer', 'Equal Opportunities Officer')).toBe(true);
    expect(retains('Equal Opportunities Officer', 'Officer')).toBe(false);
    expect(retains('Equal Opportunities Officer', 'Equal Officer')).toBe(false);
    expect(retains('Equal Officer', 'Equal Opportunities Officer')).toBe(false);
    expect(retains('Business Opportunities Manager', 'Business Manager')).toBe(false);
    expect(retains('Business Manager', 'Business Opportunities Manager')).toBe(false);
  });
  it('does not turn a typed functional role ending in "Opportunities" into a looser one', () => {
    expect(retains('Equal opportunities', 'Equal Opportunities Officer')).toBe(true);
    expect(retains('Equal opportunities', 'Equal Pay Manager')).toBe(false);
  });
  it('location, exclusion and broad-level behaviour are unchanged', () => {
    expect(inspectDiscoveryTarget(profile({ targetTitles: ['Data analyst jobs'] }), job('Data Analyst', 'Paris, France')).matches).toBe(false);
    expect(inspectDiscoveryTarget(profile({ targetTitles: ['Data analyst jobs'], excludedTerms: ['Fictional Fixture Employer'] }), job('Data Analyst')).matches).toBe(false);
    expect(retains('Find any director-level jobs', 'Director of Finance')).toBe(true);
    expect(retains('Find any director-level jobs', 'Marketing Manager')).toBe(false);
  });
});

// The four negatives found by the independent runtime review of the earlier proposal hunks. Each must stay as stated here.
describe('independent-review negatives stay rejected or preserved', () => {
  it('1. Intern does not retain Internship Programme Manager', () => {
    expect(roleOf('Intern', 'Internship Programme Manager')).toMatchObject({ matches: false, role: 'mismatch' });
  });
  it('2. Management trainee does not retain Nursing Trainee (it is not widened into any trainee role)', () => {
    expect(roleOf('Management trainee', 'Nursing Trainee')).toMatchObject({ matches: false, role: 'mismatch' });
    expect(roleOf('Graduate trainee', 'Nursing Trainee')).toMatchObject({ matches: false, role: 'mismatch' });
  });
  it('3. Equal Opportunities Officer does not retain Equal Officer (functional Opportunities is not stripped)', () => {
    expect(roleOf('Equal Opportunities Officer', 'Equal Officer')).toMatchObject({ matches: false, role: 'mismatch' });
    expect(roleOf('Equal Officer', 'Equal Opportunities Officer')).toMatchObject({ matches: false, role: 'mismatch' });
  });
  it('4. "Our 5+ years of experience requirement is mandatory" keeps its minimum of 5', () => {
    const description = `${FILLER} Our 5+ years of experience requirement is mandatory.`;
    expect(readDiscoveryMinimumExperience(description)).toBe(5);
    expect(inspectDiscoveryTarget(profile({ experienceYears: 2 }), job('Business Analyst', 'New York, NY', description))).toMatchObject({ matches: false, experience: 'below_stated_minimum', minimumExperienceYears: 5 });
  });
  it('Melbourne FL, Vancouver WA and Sydney NS are not read as Australia, Canada and Australia', () => {
    const location = (country: string, posting: string) => inspectDiscoveryTarget(profile({ locations: [country] }), job('Business Analyst', posting)).location;
    expect(location('Australia', 'Melbourne, FL')).not.toBe('matched');
    expect(location('Canada', 'Vancouver, WA')).not.toBe('matched');
    expect(location('Australia', 'Sydney, NS')).not.toBe('matched');
  });
});
