import type { LoopOpportunityInput, LoopProfileInput } from '../../supabase/functions/_shared/job-loop-types.ts';

type DiscoveryProfile = Pick<LoopProfileInput, 'targetTitles' | 'locations' | 'experienceYears' | 'excludedTerms' | 'compensation'>;
type DiscoveryOpportunity = Pick<LoopOpportunityInput, 'title' | 'company' | 'location' | 'url' | 'description'>;
export interface DiscoveryMatchEvidence {
  matches: boolean;
  role: 'matched' | 'mismatch';
  seniority: 'compatible' | 'conflict' | 'unknown';
  location: 'matched' | 'mismatch' | 'unknown' | 'not_requested';
  experience: 'within_stated_years' | 'below_stated_minimum' | 'unknown';
  minimumExperienceYears: number | null;
  compensation: 'at_or_above_minimum' | 'range_overlaps_minimum' | 'below_minimum' | 'unknown' | 'not_requested';
  excluded: boolean;
}

const ROLE_STOP = new Set('a an the and or of for in with at to job role position'.split(' '));
const ROLE_NORMALIZATIONS: Record<string, string> = {
  analysts: 'analyst', engineers: 'engineer', developers: 'developer', managers: 'manager',
  consultants: 'consultant', scientists: 'scientist', specialists: 'specialist', designers: 'designer',
  officers: 'officer', coordinators: 'coordinator', assistants: 'assistant',
};
const EARLY = /\b(?:junior|jr|graduate|graduates|intern|interns|internship|internships|trainee|apprentice|entry[ -]level)\b/i;
const SENIOR = /\b(?:senior|sr|head|director|principal|chief|vp|vice[ -]president)\b|\blead\b(?!\s+generation)|\bstaff\s+(?:(?:software|data|research|machine learning)\s+)?(?:engineer|developer|scientist)\b/i;
const LEVEL_WORDS = new Set('senior sr junior jr graduate graduates intern interns internship internships trainee apprentice head director principal chief vp'.split(' '));

function normalText(value: string): string { return value.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'"); }
function tokens(value: string): string[] { return normalText(value).match(/[\p{L}\p{N}]+/gu) ?? []; }
function roleTerms(value: string): string[] {
  const normalized = normalText(value)
    .replace(/\bsoftware developer\b/g, 'software engineer')
    .replace(/\b(?:ml|machine[ -]learning)\b/g, 'machine learning')
    .replace(/\b(?:hr|human resources)\b/g, 'human resources')
    .replace(/\b(?:qa|quality assurance)\b/g, 'quality assurance')
    .replace(/\bc\s*\+\s*\+/g, ' cplusplus ').replace(/\bc\s*#/g, ' csharp ').replace(/\.net\b/g, ' dotnet ')
    .replace(/\b(front|back)[ -]end\b/g, '$1end').replace(/\bfull[ -]stack\b/g, 'fullstack')
    .replace(/\bentry[ -]level\b|\bvice[ -]president\b/g, ' ')
    .replace(/\blead\b(?!\s+generation)/g, ' ');
  return [...new Set(tokens(normalized).filter(word => !ROLE_STOP.has(word) && !LEVEL_WORDS.has(word)).map(word => ROLE_NORMALIZATIONS[word] ?? word))];
}
function matchRole(targets: string[], title: string): Pick<DiscoveryMatchEvidence, 'role' | 'seniority'> {
  const orderedTitleTerms = roleTerms(title); const titleTerms = new Set(orderedTitleTerms);
  let roleMatched = false;
  for (const target of targets) {
    const terms = roleTerms(target);
    if (!terms.length || !terms.every(term => titleTerms.has(term))) continue;
    if (EARLY.test(target) && SENIOR.test(title) || SENIOR.test(target) && EARLY.test(title)) { roleMatched = true; continue; }
    // "Engineering Manager, Product" is not a Product Manager, nor is
    // "Product Operations Manager". Preserve the requested role phrase.
    if (!` ${orderedTitleTerms.join(' ')} `.includes(` ${terms.join(' ')} `)) continue;
    return { role: 'matched', seniority: EARLY.test(title) || SENIOR.test(title) ? 'compatible' : 'unknown' };
  }
  return { role: roleMatched ? 'matched' : 'mismatch', seniority: roleMatched ? 'conflict' : 'unknown' };
}

// These aliases describe places, never the candidate's residence or authorisation.
const CITY_COUNTRIES: [string, string][] = [
  ['dubai', 'united arab emirates'], ['abu dhabi', 'united arab emirates'],
  ['london', 'united kingdom'], ['new york', 'united states'],
  ['san francisco', 'united states'], ['los angeles', 'united states'], ['seattle', 'united states'],
  ['boston', 'united states'], ['austin', 'united states'], ['chicago', 'united states'],
  ['atlanta', 'united states'], ['denver', 'united states'], ['miami', 'united states'],
  ['washington dc', 'united states'], ['pittsburgh', 'united states'],
  ['bengaluru', 'india'], ['bangalore', 'india'], ['mumbai', 'india'], ['hyderabad', 'india'],
  ['pune', 'india'], ['chennai', 'india'], ['new delhi', 'india'], ['gurugram', 'india'], ['noida', 'india'],
  ['leeds', 'united kingdom'], ['manchester', 'united kingdom'], ['edinburgh', 'united kingdom'],
  ['sharjah', 'united arab emirates'], ['riyadh', 'saudi arabia'], ['jeddah', 'saudi arabia'],
  ['doha', 'qatar'], ['manama', 'bahrain'], ['muscat', 'oman'], ['kuwait city', 'kuwait'],
];
const COUNTRY_NAMES = ['united arab emirates', 'united kingdom', 'united states', 'south africa', 'canada', 'australia', 'india', 'singapore', 'france', 'germany', 'saudi arabia', 'qatar', 'bahrain', 'oman', 'kuwait', 'pakistan', 'bangladesh', 'jordan', 'new zealand'];
function placeText(value: string): string {
  return normalText(value).replace(/\bu\.?a\.?e\.?\b/g, 'united arab emirates')
    .replace(/\bu\.?k\.?\b/g, 'united kingdom').replace(/\b(?:u\.?s\.?a?\.?)\b/g, 'united states')
    .replace(/\bnyc\b/g, 'new york').replace(/\bksa\b/g, 'saudi arabia')
    .replace(/\bbangalore\b/g, 'bengaluru').replace(/\bthe\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function hasPlace(value: string, place: string): boolean { return ` ${value} `.includes(` ${place} `); }
function placeTerms(value: string): Set<string> {
  const normalized = placeText(value); const words = new Set(tokens(normalized));
  const explicitCountries = COUNTRY_NAMES.filter(country => hasPlace(normalized, country));
  for (const [city, country] of CITY_COUNTRIES) {
    if (hasPlace(normalized, city) && (!explicitCountries.length || explicitCountries.includes(country))) tokens(country).forEach(word => words.add(word));
  }
  return words;
}
function samePlace(wanted: string, offered: string): boolean {
  const target = placeText(wanted); const actual = placeText(offered);
  // York and New York are distinct places, despite sharing a complete word.
  if (target === 'york' && hasPlace(actual, 'new york')) return false;
  const desiredWords = tokens(target); const actualWords = placeTerms(actual);
  return desiredWords.length > 0 && desiredWords.every(word => actualWords.has(word));
}
function withinRemoteScope(wanted: string, offered: string): boolean {
  if (samePlace(wanted, offered)) return true;
  const desired = placeText(wanted); const actual = placeText(offered);
  return CITY_COUNTRIES.some(([city, country]) => hasPlace(desired, city) && actual === country);
}
const REMOTE = /\b(?:remote|worldwide|anywhere|global)\b/i;
const GLOBAL_REMOTE = /\b(?:worldwide|anywhere|global)\b/i;
const NEGATED_REMOTE = /\b(?:not|no|non)[ -]?remote\b|\bremote(?: work)? (?:is )?(?:not (?:available|allowed|offered)|unavailable)\b/i;
function remoteScope(value: string): string {
  return placeText(value.replace(/\b(?:fully|remote|worldwide|anywhere|global|only|residents?|based|within|from|in|across|work|working|home|first|friendly)\b/gi, ' '));
}
function explicitRemoteRestrictions(description: string): string[] {
  const restrictions: string[] = [];
  const pattern = /\b(?:must|need to|required to)\s+(?:be\s+)?(?:based|located|reside|live)\s+(?:in|within)\s+([^.;\n]{1,100})|\bremote\s+(?:work\s+)?(?:only\s+)?(?:within|from|in|across)\s+([^.;\n]{1,100})/gi;
  for (const match of description.matchAll(pattern)) {
    const place = (match[1] ?? match[2]).split(/\s+(?:and|because|due to|to work)\s+/i)[0];
    if (!/^(?:our|an?|the office)\b/i.test(place)) restrictions.push(remoteScope(place));
  }
  return restrictions.filter(Boolean);
}
function matchLocation(preferences: string[], opportunity: DiscoveryOpportunity): DiscoveryMatchEvidence['location'] {
  if (!preferences.length) return 'not_requested';
  const location = opportunity.location;
  const remotePreferences = preferences.filter(place => REMOTE.test(place));
  const places = preferences.filter(place => !REMOTE.test(place));
  const isRemote = !NEGATED_REMOTE.test(location) && REMOTE.test(location);
  if (!isRemote) {
    if (places.some(place => samePlace(place, location))) return 'matched';
    return location.trim() ? 'mismatch' : 'unknown';
  }
  if (NEGATED_REMOTE.test(opportunity.description)) return 'mismatch';
  const scope = remoteScope(location);
  const restrictions = explicitRemoteRestrictions(opportunity.description);
  const scopes = [...(scope ? [scope] : []), ...restrictions];
  const requestedScopes = remotePreferences.map(remoteScope).filter(Boolean);
  const geography = [...places, ...requestedScopes];
  if (scopes.length) {
    if (geography.length) return geography.some(place => scopes.every(offered => withinRemoteScope(place, offered))) ? 'matched' : 'mismatch';
    // A remote preference alone does not establish where the person may work.
    return remotePreferences.some(place => !GLOBAL_REMOTE.test(place)) ? 'unknown' : 'mismatch';
  }
  if (GLOBAL_REMOTE.test(location)) return 'matched';
  return 'unknown';
}

const NUMBER_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
const EXPERIENCE_NUMBER = `(?:\\d{1,2}(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`;
/** A minimum is evidence only when stated as mandatory, a range, or N+ years.
 * Optional, negated, alternative and unrecognised wording stays unknown. */
export function readDiscoveryMinimumExperience(description: string): number | null {
  const pattern = new RegExp(`\\b(${EXPERIENCE_NUMBER})\\s*(\\+)?\\s*(?:[-–—]\\s*(${EXPERIENCE_NUMBER})\\s*\\+?)?\\s*(?:years?|yrs?)\\s+(?:of\\s+)?(?:(?:relevant|professional|work|working|industry|commercial|related|practical|hands-on|post[- ]qualification)\\s+){0,3}experience\\b`, 'gi');
  const minima: number[] = [];
  for (const clause of description.split(/\n|;|(?<=[.!?])\s+/)) {
    if (/\b(?:not|required neither|no|without|preferred|preferably|desirable|desired|ideally|optional|nice[ -]to[ -]have)\b/i.test(clause)) continue;
    if (/\b(?:degree|qualification|education)\b.*\bor\b|\bor\b.*\b(?:degree|qualification|education)\b/i.test(clause)) continue;
    for (const match of clause.matchAll(pattern)) {
      const before = clause.slice(0, match.index); const after = clause.slice((match.index ?? 0) + match[0].length);
      if (/\b(?:company|business|team|firm|we)\b.*\b(?:has|have|brings?|combined|collective)\b/i.test(before)) continue;
      const mandatory = !!match[2] || !!match[3] || /\b(?:minimum(?: of)?|at least|requires?|must have|needs?(?: to have)?|essential)\s*$/i.test(before) || /\b(?:required|essential|mandatory|minimum)\b/i.test(after);
      if (!mandatory) continue;
      const value = NUMBER_WORDS[match[1].toLowerCase()] ?? Number(match[1]);
      if (Number.isFinite(value)) minima.push(value);
    }
  }
  return minima.length ? Math.max(...minima) : null;
}

type PayRange = { currency: string; period: LoopProfileInput['compensation']['period']; minimum: number; maximum: number | null };
const CURRENCIES = 'AED|USD|GBP|EUR|SAR|INR|CAD|AUD|CHF|SGD|QAR|KWD|BHD|OMR|JPY|NZD|HKD';
const AMOUNT = '(\\d[\\d,]*(?:\\.\\d+)?\\s*[km]?)';
function payAmount(value: string, sharedSuffix = ''): number {
  const suffix = /[km]\s*$/i.exec(value)?.[0].trim().toLowerCase() ?? sharedSuffix;
  return Number(value.replace(/[,\s]/g, '').replace(/[km]$/i, '')) * (suffix === 'k' ? 1000 : suffix === 'm' ? 1000000 : 1);
}
function readPayRanges(description: string): PayRange[] {
  const ranges: PayRange[] = [];
  for (const clause of description.split(/\n|;|(?<=[.!?])\s+/)) {
    if (!/\b(?:salary|base|pay|compensation|stipend|remuneration|wage|range)\b/i.test(clause) || /\b(?:bonus|ote|on[ -]target|commission|equity|allowance|relocation|sign[ -]on)\b/i.test(clause)) continue;
    // Currency alternatives/conversions in one clause are not a single stated offer.
    if (new Set([...clause.matchAll(new RegExp(`\\b(${CURRENCIES})\\b`, 'gi'))].map(match => match[1].toUpperCase())).size > 1) continue;
    const periods: PayRange['period'][] = [];
    if (/\b(?:annual|annually|yearly|per year|a year|per annum)\b|\/\s*(?:year|yr)\b/i.test(clause)) periods.push('annual');
    if (/\b(?:monthly|per month|a month)\b|\/\s*(?:month|mo)\b/i.test(clause)) periods.push('monthly');
    if (/\b(?:hourly|per hour|an hour)\b|\/\s*(?:hour|hr)\b/i.test(clause)) periods.push('hourly');
    if (periods.length !== 1) continue;
    const prefix = new RegExp(`\\b(${CURRENCIES})\\s*[$€£]?\\s*${AMOUNT}(?:\\s*[-–—]\\s*(?:(${CURRENCIES})\\s*[$€£]?\\s*)?${AMOUNT})?`, 'gi');
    const suffix = new RegExp(`${AMOUNT}(?:\\s*[-–—]\\s*${AMOUNT})?\\s*(${CURRENCIES})\\b`, 'gi');
    const values: { index: number; currency: string; secondCurrency: string | undefined; first: string; second: string | undefined }[] = [...clause.matchAll(prefix)].map(match => ({ index: match.index ?? 0, currency: match[1].toUpperCase(), secondCurrency: match[3]?.toUpperCase(), first: match[2], second: match[4] }));
    if (!values.length) values.push(...[...clause.matchAll(suffix)].map(match => ({ index: match.index ?? 0, currency: match[3].toUpperCase(), secondCurrency: undefined, first: match[1], second: match[2] })));
    for (const value of values) {
      if (value.secondCurrency && value.secondCurrency !== value.currency) continue;
      const sharedSuffix = value.second ? /[km]\s*$/i.exec(value.second)?.[0].trim().toLowerCase() ?? '' : '';
      const lower = payAmount(value.first, sharedSuffix); const upper = value.second ? payAmount(value.second) : lower;
      if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper < lower) continue;
      const before = clause.slice(0, value.index);
      ranges.push({ currency: value.currency, period: periods[0], minimum: /\bup to\s*$/i.test(before) ? 0 : lower, maximum: /\b(?:from|starting at|minimum(?: of)?)\s*$/i.test(before) && !value.second ? null : upper });
    }
  }
  return ranges;
}
function matchCompensation(preference: DiscoveryProfile['compensation'], description: string): DiscoveryMatchEvidence['compensation'] {
  if (preference.minimum === null) return 'not_requested';
  if (!preference.currency.trim()) return 'unknown';
  const ranges = readPayRanges(description).filter(range => range.currency === preference.currency.trim().toUpperCase());
  const comparable = ranges.filter(range => (range.period === 'hourly') === (preference.period === 'hourly'));
  if (!comparable.length) return 'unknown';
  const wanted = preference.minimum * (preference.period === 'monthly' ? 12 : 1);
  const normalized = comparable.map(range => ({ minimum: range.minimum * (range.period === 'monthly' ? 12 : 1), maximum: range.maximum === null ? null : range.maximum * (range.period === 'monthly' ? 12 : 1) }));
  if (normalized.some(range => range.minimum >= wanted)) return 'at_or_above_minimum';
  if (normalized.some(range => range.maximum === null)) return 'unknown';
  if (normalized.some(range => range.maximum! >= wanted)) return 'range_overlaps_minimum';
  return 'below_minimum';
}

/** Discovery admission is a relevance guard, never eligibility or pay verification.
 * Callers retain candidate-controlled manual vacancies independently of this guard. */
export function inspectDiscoveryTarget(profile: DiscoveryProfile, opportunity: DiscoveryOpportunity): DiscoveryMatchEvidence {
  const sourceText = normalText(`${opportunity.title}\n${opportunity.company}\n${opportunity.description}\n${opportunity.url}`).replace(/\s+/g,' ');
  const excluded = profile.excludedTerms.some(term => {
    const escaped = normalText(term.trim()).replace(/\s+/g,' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A short excluded term such as AI must not exclude "retail" or "chair".
    return !!escaped && new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(sourceText);
  });
  const role = matchRole(profile.targetTitles, opportunity.title);
  const location = matchLocation(profile.locations, opportunity);
  const minimumExperienceYears = readDiscoveryMinimumExperience(opportunity.description);
  const experience: DiscoveryMatchEvidence['experience'] = minimumExperienceYears === null || profile.experienceYears === null ? 'unknown' : profile.experienceYears < minimumExperienceYears ? 'below_stated_minimum' : 'within_stated_years';
  const compensation = matchCompensation(profile.compensation, opportunity.description);
  const acceptsUnknownRemote = location === 'unknown' && REMOTE.test(opportunity.location) && profile.locations.some(place => REMOTE.test(place) && !GLOBAL_REMOTE.test(place) && !remoteScope(place));
  return { matches: !excluded && role.role === 'matched' && role.seniority !== 'conflict' && (location === 'matched' || location === 'not_requested' || acceptsUnknownRemote) && experience !== 'below_stated_minimum' && compensation !== 'below_minimum', ...role, location, experience, minimumExperienceYears, compensation, excluded };
}
export function matchesDiscoveryTarget(profile: DiscoveryProfile, opportunity: DiscoveryOpportunity): boolean { return inspectDiscoveryTarget(profile, opportunity).matches; }

/** Plain-language explanations of observed constraints, never invented skill,
 * visa, salary or employer endorsement claims. Safe to render next to a match. */
export function explainDiscoveryMatch(profile: DiscoveryProfile, opportunity: DiscoveryOpportunity): { reasons: string[]; missing: string[] } {
  const evidence = inspectDiscoveryTarget(profile, opportunity);
  const reasons: string[] = []; const missing: string[] = [];
  if (evidence.role === 'matched') reasons.push('The job title matches one of your chosen role directions.');
  else missing.push('The title does not match a complete role direction you selected.');
  if (evidence.location === 'matched') reasons.push(`The listed location (${opportunity.location}) matches your location preferences.`);
  else if (evidence.location === 'mismatch') missing.push('The listed location or remote-work restriction conflicts with your preferences.');
  else if (evidence.location === 'unknown') missing.push('The permitted working location still needs confirmation.');
  if (evidence.seniority === 'conflict') missing.push('The advertised seniority conflicts with your chosen role level.');
  if (evidence.experience === 'within_stated_years') reasons.push(`Your stated years of experience meet the advertised ${evidence.minimumExperienceYears}-year minimum; the type of experience still needs review.`);
  else if (evidence.experience === 'below_stated_minimum') missing.push(`The description states a minimum of ${evidence.minimumExperienceYears} years of experience, above your stated experience.`);
  else missing.push('Experience requirements have not been fully verified.');
  if (evidence.compensation === 'at_or_above_minimum') reasons.push('The stated base-pay range meets your minimum in the same currency.');
  else if (evidence.compensation === 'range_overlaps_minimum') missing.push('Only part of the stated base-pay range meets your minimum.');
  else if (evidence.compensation === 'below_minimum') missing.push('The stated base-pay range is below your minimum.');
  else if (evidence.compensation === 'unknown') missing.push('Comparable base pay is not stated clearly enough to check your minimum.');
  if (evidence.excluded) missing.push('The posting contains an employer or term you excluded.');
  missing.push('Review role-specific requirements and work authorisation before applying.');
  return { reasons, missing };
}
