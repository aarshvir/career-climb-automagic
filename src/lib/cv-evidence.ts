/** A literal English wording comparison of user-provided text, never a qualification verdict. */
export type EvidenceStatus = 'direct' | 'partial' | 'missing' | 'review';
export type EvidenceSourceKind = 'action' | 'skills' | 'other';

export interface EvidencePassage {
  cvQuote: string;
  /** UTF-16 offsets: cvText.slice(start, end) is exactly cvQuote. */
  start: number;
  end: number;
  /** One-based line number in the supplied CV. */
  line: number;
  sourceKind: EvidenceSourceKind;
}

export interface EvidenceRequirement {
  id: string;
  vacancyQuote: string;
  /** UTF-16 offsets in the supplied vacancy text. */
  start: number;
  end: number;
  status: EvidenceStatus;
  evidence: EvidencePassage[];
  explanation: string;
  question: string;
  matchedTerms: string[];
}

export interface EvidenceVacancySpan {
  vacancyQuote: string;
  start: number;
  end: number;
}

export interface EvidenceReport {
  methodVersion: string;
  scope: string;
  requirements: EvidenceRequirement[];
  unparsedNotes: string[];
  summary: { total: number; direct: number; partial: number; missing: number; review: number };
  /** All nonempty headings, other sections and overflow clauses remain available verbatim. */
  omittedSections: EvidenceVacancySpan[];
  warnings: string[];
}

const METHOD_VERSION = 'english-literal-evidence-v1';
const MAX_REQUIREMENTS = 40;
const SCOPE = 'This is an English wording check of user-provided text. The claims are not verified. Read the job requirements yourself; this check does not decide whether you qualify or predict an interview.';
type Span = { start: number; end: number };
type Line = Span & { text: string; line: number; newline: string };
type Section = 'experience' | 'skills' | 'education' | 'credentials' | 'other';
type Passage = EvidencePassage & { section: Section; terms: string[]; negative: boolean; pending: boolean; weakened: boolean };

const REQUIRED_HEADING = /^(?:requirements?|qualifications?|essential(?: criteria| requirements)?|desirable(?: criteria| requirements)?|responsibilities|key responsibilities|duties|what (?:you(?:'|’)ll do|you will do|you bring|we need|we(?:'|’)re looking for)|about you|your (?:role|responsibilities|profile)|skills(?: and experience)?|experience(?: and qualifications)?)(?:\s*:|\s*$)/i;
const OTHER_HEADING = /^(?:about (?:us|the company|our company)|company (?:overview|description)|who we are|benefits|perks|what we offer|salary|compensation|how to apply|application process|equal opportunit(?:y|ies)|our values)(?:\s*:|\s*$)/i;
const MANDATORY = /\b(?:must|required|mandatory|essential|need to|minimum|at least)\b/i;
const UNSUPPORTED_SCRIPT = /[\u0400-\u052f]|[\u0600-\u06ff]|[\u0900-\u097f]|[\u3040-\u30ff]|[\u3400-\u9fff]|[\uac00-\ud7af]/u;
const BULLET = /^(\s*(?:[-*•▪◦‣–—]|\d+[.)])\s+)/;
const SYMBOL_BULLET = /^\s*[-*•▪◦‣–—]\s+/;

const TECH = new Set(['sql', 'nosql', 'java', 'javascript', 'typescript', 'python', 'excel', 'powerbi', 'tableau', 'aws', 'azure', 'gcp', 'salesforce', 'sap', 'oracle', 'react', 'angular', 'vue', 'node.js', 'nodejs', 'git', 'docker', 'kubernetes', 'linux', 'c', 'c++', 'c#', '.net', 'html', 'css', 'r', 'rust', 'golang', 'figma', 'autocad', 'revit', 'jira', 'spss', 'matlab', 'quickbooks', 'xero', 'hubspot', 'servicenow', 'snowflake', 'databricks', 'postgresql', 'mysql', 'mongodb']);
const CREDENTIAL = new Set(['bachelor', 'master', 'doctorate', 'mba', 'pmp', 'cfa', 'cpa', 'acca', 'cipd', 'license', 'certificate', 'certified', 'chartered']);
const ACTION_ALIASES: Record<string, string> = {
  lead: 'lead', led: 'lead', leading: 'lead', leadership: 'lead',
  manage: 'manage', managed: 'manage', managing: 'manage', management: 'manage',
  create: 'produce', created: 'produce', creating: 'produce', prepare: 'produce', prepared: 'produce', preparing: 'produce', produce: 'produce', produced: 'produce', producing: 'produce', draft: 'produce', drafted: 'produce', drafting: 'produce', write: 'produce', wrote: 'produce', written: 'produce', writing: 'produce',
  develop: 'develop', developed: 'develop', developing: 'develop', development: 'develop', build: 'develop', built: 'develop', building: 'develop', implement: 'develop', implemented: 'develop', implementing: 'develop',
  analyze: 'analyze', analyzed: 'analyze', analyzing: 'analyze', analyse: 'analyze', analysed: 'analyze', analysing: 'analyze', analysis: 'analyze',
  support: 'support', supported: 'support', supporting: 'support', assist: 'support', assisted: 'support', assisting: 'support',
  design: 'design', designed: 'design', designing: 'design',
  deliver: 'deliver', delivered: 'deliver', delivering: 'deliver', delivery: 'deliver',
  coordinate: 'coordinate', coordinated: 'coordinate', coordinating: 'coordinate', coordination: 'coordinate',
  forecast: 'forecast', forecasted: 'forecast', forecasting: 'forecast',
  budget: 'budget', budgeted: 'budget', budgeting: 'budget',
  report: 'report', reported: 'report', reporting: 'report',
  negotiate: 'negotiate', negotiated: 'negotiate', negotiating: 'negotiate', negotiation: 'negotiate',
  recruit: 'recruit', recruited: 'recruit', recruiting: 'recruit', recruitment: 'recruit',
  train: 'train', trained: 'train', training: 'train',
  sell: 'sell', sold: 'sell', selling: 'sell',
  audit: 'audit', audited: 'audit', auditing: 'audit',
  test: 'test', tested: 'test', testing: 'test',
  supervise: 'supervise', supervised: 'supervise', supervising: 'supervise', supervision: 'supervise',
};
const ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', nodejs: 'node.js', dotnet: '.net', 'asp.net': '.net',
  bachelors: 'bachelor', 'b.sc': 'bachelor', bsc: 'bachelor', ba: 'bachelor', beng: 'bachelor',
  masters: 'master', 'm.sc': 'master', msc: 'master', meng: 'master', phd: 'doctorate',
  licences: 'license', licence: 'license', licenses: 'license', certifications: 'certificate', certification: 'certificate', certificates: 'certificate',
  stakeholders: 'stakeholder', reports: 'report', projects: 'project', queries: 'query', teams: 'team',
  clients: 'client', customers: 'customer', budgets: 'budget', forecasts: 'forecast', dashboards: 'dashboard',
  risks: 'risk', presentations: 'presentation', vendors: 'vendor', campaigns: 'campaign', applications: 'application',
  contracts: 'contract', products: 'product', timelines: 'timeline', processes: 'process', portfolios: 'portfolio',
  requirements: 'requirement', workflows: 'workflow', developers: 'developer', engineers: 'engineer', employees: 'employee',
  users: 'user', languages: 'language', tools: 'tool', degrees: 'degree',
};
const STOP = new Set(('a an the and or of to for in on with by as from into across within at have has had having be is are was were been being you your our we their they it its must required require requires requirement requirements minimum least more than over up years year yrs yr experience experienced knowledge familiarity familiar proficient proficiency ability able skills skill strong excellent good proven demonstrable demonstrated practical hands hands-on relevant professional prior previous working work using use used including include includes preferably preferred desirable essential mandatory degree equivalent hold holds holding possess possession sought looking need needs will would should can may do does responsibilities responsibility duties duty role position s').split(' '));
const ACTUAL_VERB = /\b(?:led|lead|leading|managed|manage|managing|created|create|prepared|prepare|produced|produce|drafted|draft|wrote|write|written|developed|develop|built|build|implemented|implement|analy[sz]ed|analy[sz]e|supported|support|assisted|assist|designed|design|delivered|deliver|coordinated|coordinate|forecasted|budgeted|reported|reporting|negotiated|negotiate|recruited|recruit|trained|train|sold|sell|audited|audit|tested|test|supervised|supervise|used|using|maintained|operated|automated|improved|reduced|increased|launched|owned)\b/i;
const WEAKENED = /\b(?:assist(?:ed|ing)?|support(?:ed|ing)?|help(?:ed|ing)?|contribut(?:ed|ing)|participat(?:ed|ing)|exposure to|observed|shadow(?:ed|ing))\b/i;
const PENDING = /\b(?:studying|studied|pursuing|learning|learner|in progress|working (?:toward|towards|on a)|candidate for|(?:cpa|cfa|pmp|acca|cipd|bachelor|master|mba|doctorate)(?:\s+degree)?\s+candidate|training for|coursework|expected|planned|pending|scheduled|enrolled|incomplete|unfinished|awaiting|revoked|suspended|plan(?:ning)? to|intend to|hope to|wish to|want to|will (?:learn|complete|study)|aspiring|uncertified|unlicensed|unlicenced|expired|lapsed)\b/i;
const CREDENTIAL_STUDY = /\b(?:syllabus|curriculum|thesis|dissertation|textbook|course(?:s)?|exam prep(?:aration)?|prepar(?:ing|ation) for|practice exam|study material)\b/i;
const NEGATIVE = /\b(?:never|without|lack(?:ing|ed|s)?|not(?!\s+only\b)|no(?!\s+(?:downtime|errors|issues|failures|incidents|delays)\b))\b/i;

function lines(text: string): Line[] {
  const result: Line[] = [];
  const re = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && (m[0].length || m.index < text.length)) {
    result.push({ text: m[1], start: m.index, end: m.index + m[1].length, line: result.length + 1, newline: m[2] });
    if (!m[2]) break;
  }
  return result;
}

function trimmedSpan(text: string, start: number, end: number): Span | null {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return start < end ? { start, end } : null;
}

/** Split sentences without replacing text; do not split conjunctions or degree abbreviations. */
function clauses(text: string, span: Span, cv = false): Span[] {
  const result: Span[] = [];
  const quote = text.slice(span.start, span.end);
  const split = cv ? /;\s+|\s+but\s+|[.!?]\s+(?=[A-Z])/g : /;\s+|[.!?]\s+(?=[A-Z])/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = split.exec(quote))) {
    const before = quote.slice(Math.max(0, m.index - 5), m.index + 1);
    if (/\b(?:[BM]\.Sc|Ph\.D|e\.g|i\.e|Mr|Ms|Dr|vs)\.$/i.test(before)) continue;
    const punctuation = /^[.!?]/.test(m[0]) ? 1 : m[0].startsWith(';') ? 1 : 0;
    const part = trimmedSpan(text, span.start + cursor, span.start + m.index + punctuation);
    if (part) result.push(part);
    cursor = m.index + m[0].length;
  }
  const last = trimmedSpan(text, span.start + cursor, span.end);
  if (last) result.push(last);
  return result;
}

function headingText(text: string): string {
  return text.trim().replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '').trim();
}

function vacancySpans(text: string): { requirements: Span[]; omitted: Span[]; overflow: number } {
  const requirements: Span[] = [];
  const omitted: Span[] = [];
  let ignoreSection = false;
  let overflow = 0;
  const sourceLines = lines(text);
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const raw = trimmedSpan(text, line.start, line.end);
    if (!raw) continue;
    const heading = headingText(line.text);
    const required = REQUIRED_HEADING.exec(heading);
    const other = OTHER_HEADING.exec(heading);
    if (required || other) {
      ignoreSection = !!other;
      const colon = line.text.indexOf(':');
      if (colon >= 0 && line.text.slice(colon + 1).trim()) {
        omitted.push({ start: raw.start, end: line.start + colon + 1 });
        const tail = trimmedSpan(text, line.start + colon + 1, line.end);
        if (tail) {
          for (const part of clauses(text, tail)) {
            if (ignoreSection && !MANDATORY.test(text.slice(part.start, part.end))) omitted.push(part);
            else if (requirements.length < MAX_REQUIREMENTS) requirements.push(part);
            else { omitted.push(part); overflow++; }
          }
        }
      } else omitted.push(raw);
      continue;
    }
    if (ignoreSection && !MANDATORY.test(line.text)) { omitted.push(raw); continue; }
    const bullet = BULLET.exec(line.text);
    let end = line.end;
    if (bullet) {
      while (i + 1 < sourceLines.length) {
        const next = sourceLines[i + 1];
        if (!/^\s{2,}\S/.test(next.text) || BULLET.test(next.text) || REQUIRED_HEADING.test(headingText(next.text)) || OTHER_HEADING.test(headingText(next.text))) break;
        end = next.end;
        i++;
      }
    }
    const span = trimmedSpan(text, line.start + (bullet?.[0].length ?? 0), end);
    if (!span) continue;
    for (const part of clauses(text, span)) {
      if (requirements.length < MAX_REQUIREMENTS) requirements.push(part);
      else { omitted.push(part); overflow++; }
    }
  }
  return { requirements, omitted, overflow };
}

function sectionFor(text: string): Section | null {
  const heading = headingText(text).replace(/:$/, '').toLowerCase();
  if (/^(?:(?:professional|work|relevant|career) )?(?:experience|employment(?: history)?|career history|work history)$/.test(heading)) return 'experience';
  if (/^(?:(?:technical|key|core|professional) )?(?:skills|competencies|tools|technologies)(?: and (?:tools|technologies))?$/.test(heading)) return 'skills';
  if (/^(?:education|academic (?:background|qualifications)|qualifications)$/.test(heading)) return 'education';
  if (/^(?:certifications?|certificates?|licenses?|licences?|professional qualifications)$/.test(heading)) return 'credentials';
  if (/^(?:summary|profile|objective|interests|references|achievements|projects|languages|publications)$/.test(heading)) return 'other';
  return null;
}

function tokens(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase()
    .replace(/\b(?:microsoft|ms)\s+excel\b/g, 'excel')
    .replace(/\bpower\s+bi\b/g, 'powerbi')
    .replace(/\bamazon\s+web\s+services\b/g, 'aws')
    .replace(/\bgoogle\s+cloud\s+platform\b/g, 'gcp');
  return (normalized.match(/\.net\b|[a-z][a-z0-9]*(?:\+\+|#)?(?:[.-][a-z0-9]+)*|\d+(?:\.\d+)?/g) ?? [])
    .map(term => ALIASES[term] ?? ACTION_ALIASES[term] ?? term);
}

function meaningful(text: string): string[] {
  return [...new Set(tokens(text).filter(term => !STOP.has(term) && !/^\d/.test(term)))];
}

function cvPassages(text: string): Passage[] {
  const result: Passage[] = [];
  const sourceLines = lines(text);
  let section: Section = 'other';
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const nextSection = sectionFor(line.text);
    if (nextSection) { section = nextSection; continue; }
    const inlineSkills = /^\s*(?:(?:technical|key|core)\s+)?(?:skills|tools|technologies)\s*:/i.test(line.text);
    const bullet = BULLET.exec(line.text);
    let end = line.end;
    // Only indented continuation lines can be joined without guessing a role boundary.
    if (bullet) {
      while (i + 1 < sourceLines.length) {
        const next = sourceLines[i + 1];
        if (!/^\s{2,}\S/.test(next.text) || BULLET.test(next.text) || sectionFor(next.text)) break;
        end = next.end;
        i++;
      }
    }
    const span = trimmedSpan(text, line.start + (bullet?.[0].length ?? 0), end);
    if (!span) continue;
    for (const part of clauses(text, span, true)) {
      const cvQuote = text.slice(part.start, part.end);
      const sourceKind: EvidenceSourceKind = inlineSkills || section === 'skills' || /\b(?:proficient|proficiency|familiar|knowledge of|skills include|competent)\b/i.test(cvQuote) ? 'skills' : ACTUAL_VERB.test(cvQuote) ? 'action' : 'other';
      result.push({ cvQuote, ...part, line: line.line + (text.slice(line.start, part.start).match(/\r\n|\r|\n/g)?.length ?? 0), sourceKind, section, terms: meaningful(cvQuote), negative: NEGATIVE.test(cvQuote), pending: PENDING.test(cvQuote), weakened: WEAKENED.test(cvQuote) });
    }
  }
  return result;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
type Duration = { min: number; max: number | null; strict: boolean; context: string[] };
function duration(text: string): Duration | null {
  const m = /\b(?:(at least|minimum(?: of)?|more than|over|up to|at most)\s+)?(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)(?:\s*[-–]\s*(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty))?\s*(\+)?\s*(?:years?|yrs?)\b/i.exec(text);
  if (!m) return null;
  const value = NUMBER_WORDS[m[2].toLowerCase()] ?? Number(m[2]);
  const upperBound = /up to|at most/i.test(m[1] ?? '');
  const after = text.slice(m.index + m[0].length).split(/[,;]|\band\b/i)[0];
  const before = text.slice(0, m.index).split(/[,;]|\band\b/i).slice(-1)[0] ?? '';
  // Duration must describe its own field; a degree in Engineering plus years in Finance
  // must not be combined into years of Engineering experience.
  const context = meaningful(after).filter(term => !(term in NUMBER_WORDS));
  return { min: upperBound ? 0 : value, max: upperBound ? value : m[3] ? NUMBER_WORDS[m[3].toLowerCase()] ?? Number(m[3]) : null, strict: /more than|over/i.test(m[1] ?? ''), context: context.length ? context : meaningful(before).filter(term => !(term in NUMBER_WORDS)) };
}

function durationSufficient(request: Duration, passage: Duration): boolean {
  if (request.context.length && !request.context.every(term => passage.context.includes(term))) return false;
  if (request.max !== null && request.min === 0) return passage.min <= request.max && (passage.max ?? passage.min) <= request.max;
  if (request.max !== null && (passage.max ?? passage.min) > request.max) return false;
  return request.strict ? passage.min > request.min : passage.min >= request.min;
}

function requestedActions(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return [...new Set(raw.filter(term => ACTION_ALIASES[term]).map(term => ACTION_ALIASES[term]))];
}

function publicPassage(passage: Passage): EvidencePassage {
  return { cvQuote: passage.cvQuote, start: passage.start, end: passage.end, line: passage.line, sourceKind: passage.sourceKind };
}

function analyzeRequirement(text: string, span: Span, index: number, passages: Passage[]): EvidenceRequirement {
  const vacancyQuote = text.slice(span.start, span.end);
  const requestedDuration = duration(vacancyQuote);
  const terms = meaningful(vacancyQuote).filter(term => !(term in NUMBER_WORDS) || !requestedDuration);
  const technologies = terms.filter(term => TECH.has(term));
  const credentials = terms.filter(term => CREDENTIAL.has(term));
  const actions = requestedActions(vacancyQuote);
  const experience = /\bexperience\b/i.test(vacancyQuote);
  const task = actions.length > 0 && terms.some(term => !actions.includes(term) && !CREDENTIAL.has(term));
  const specificCredential = credentials.some(term => !['license', 'certificate', 'certified', 'chartered'].includes(term)) || (credentials.length > 0 && terms.some(term => !CREDENTIAL.has(term) && !['valid', 'current', 'active'].includes(term)));
  const recognized = technologies.length > 0 || specificCredential || (!!requestedDuration && terms.length > 0) || (task && terms.length > 1);
  // Non-duration quantities can constrain a team, budget or licence class. Do not silently
  // discard them or assume a number elsewhere in the same sentence describes that constraint.
  const numericConstraint = /\b\d+(?:\.\d+)?\b/.test(vacancyQuote.replace(/\b\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*\+?\s*(?:years?|yrs?)\b/gi, ''));
  const ambiguous = numericConstraint || /\b(?:or|equivalent|and\/or|not required|no .*required)\b/i.test(vacancyQuote) || UNSUPPORTED_SCRIPT.test(vacancyQuote);
  const related = passages.map(passage => {
    const matches = terms.filter(term => passage.terms.includes(term));
    // A shared generic verb alone is not a related passage for the requested object.
    const anchors = matches.filter(term => !actions.includes(term) || TECH.has(term) || CREDENTIAL.has(term));
    return { passage, matches, anchors, full: terms.length > 0 && matches.length === terms.length };
  }).filter(match => match.anchors.length > 0).sort((a, b) => Number(b.full) - Number(a.full) || b.anchors.length - a.anchors.length || b.matches.length - a.matches.length || a.passage.start - b.passage.start);
  const base: EvidenceRequirement = { id: `requirement-${index + 1}`, vacancyQuote, ...span, status: 'review', evidence: related.slice(0, 3).map(item => publicPassage(item.passage)), explanation: '', question: `Is there something your CV should show here? Add a specific example or qualification only if it is accurate.`, matchedTerms: [...new Set(related.flatMap(item => item.matches))] };
  if (!recognized || ambiguous) {
    base.explanation = UNSUPPORTED_SCRIPT.test(vacancyQuote) ? 'This part is not in English. Read it yourself against your CV.' : numericConstraint ? 'This requirement includes a number that needs checking, such as team size or budget. Compare it with your actual experience; the check has not assumed a match.' : ambiguous ? 'The employer gives alternatives or conditions here. Check what they mean before deciding whether your experience fits.' : 'The check cannot interpret this requirement reliably. Read the wording above and decide what your CV should show.';
    return base;
  }
  if (!related.length) {
    base.status = 'missing';
    base.explanation = 'Your CV does not show a clear example of this yet. You may still have the experience; add it only if you can explain your contribution.';
    return base;
  }
  const uncertain = (passage: Passage) => passage.negative || passage.pending || (credentials.length > 0 && CREDENTIAL_STUDY.test(passage.cvQuote));
  const conflict = related.some(item => uncertain(item.passage));
  if (conflict) {
    base.evidence = related.filter(item => uncertain(item.passage)).slice(0, 2).map(item => publicPassage(item.passage));
    const positive = related.find(item => !uncertain(item.passage));
    if (positive && base.evidence.length < 3) base.evidence.push(publicPassage(positive.passage));
    base.explanation = 'The wording needs a closer look. It may describe something unfinished, expired or not held. Check the current position before using it.';
    return base;
  }
  const direct = related.find(({ passage, full }) => {
    if (!full || passage.negative || passage.pending) return false;
    if (task && passage.sourceKind !== 'action') return false;
    if (experience && !requestedDuration && passage.sourceKind !== 'action' && !/\bexperience\b/i.test(passage.cvQuote)) return false;
    if (actions.includes('lead') && (passage.weakened || !/\b(?:led|lead|leading)\b(?!\s+by\b)/i.test(passage.cvQuote))) return false;
    if (actions.includes('manage') && (passage.weakened || !/\b(?:managed|manage|managing)\b(?!\s+by\b)/i.test(passage.cvQuote))) return false;
    if (actions.includes('supervise') && (passage.weakened || !/\b(?:supervised|supervise|supervising)\b(?!\s+by\b)/i.test(passage.cvQuote))) return false;
    if (credentials.length && (passage.sourceKind === 'skills' || (!['education', 'credentials'].includes(passage.section) && !/\b(?:certified|graduated|earned|awarded|completed|hold|holds)\b/i.test(passage.cvQuote) && !/^(?:i (?:have|hold) (?:a |an )?|(?:a |an )?)(?:bachelor|master|doctorate|mba|b\.sc|bsc|m\.sc|msc|valid .*licen[cs]e)\b/i.test(passage.cvQuote)))) return false;
    if (technologies.length && !task && !requestedDuration && passage.sourceKind === 'other' && !/\b(?:experience|programming|language|technology|technologies|software|tool)\b/i.test(passage.cvQuote)) return false;
    if (requestedDuration) {
      const stated = duration(passage.cvQuote);
      if (!stated || !durationSufficient(requestedDuration, stated)) return false;
    }
    return true;
  });
  if (direct) {
    base.status = 'direct';
    base.evidence = [publicPassage(direct.passage)];
    base.explanation = requestedDuration ? 'This example mentions the work and the amount of experience requested. Check the dates and scope yourself. The check has not added up years from your employment history.' : credentials.length ? 'Your CV names the qualification. Check that it is complete, current and accepted for this role.' : task ? 'This example mentions the work the employer asks for. Check that it describes your own contribution and the right level of responsibility.' : 'You mention this skill. If the role asks how you used it, a concrete example will help.';
  } else {
    base.status = 'partial';
    base.explanation = requestedDuration ? 'You mention related work, but the amount of relevant experience is unclear. Check the roles and dates; the check has not assumed a total.' : actions.includes('lead') && related.some(item => item.passage.weakened) ? 'Your CV says you supported the work. Keep that distinction. If you led a part of it, explain which part.' : task && related.every(item => item.passage.sourceKind !== 'action') ? 'The skill appears in your CV, but the work is not clear. Add a real example if you have one.' : credentials.length ? 'Your CV mentions something related, but the subject, level or current status may differ. Check the exact qualification.' : 'Your CV covers part of this requirement. Read what is missing and add an example only if it is true.';
  }
  return base;
}

/** Deterministic and local: no model, external request, fabricated quote or percentage score. */
export function analyzeCvEvidence(cvText: string, jobDescription: string): EvidenceReport {
  const parsed = vacancySpans(jobDescription);
  const passages = cvPassages(cvText);
  const requirements = parsed.requirements.map((span, index) => analyzeRequirement(jobDescription, span, index, passages));
  const summary = { total: requirements.length, direct: 0, partial: 0, missing: 0, review: 0 };
  for (const requirement of requirements) summary[requirement.status]++;
  const warnings: string[] = [];
  if (!cvText.trim()) warnings.push('No CV text was supplied; no CV evidence can be found.');
  if (!jobDescription.trim()) warnings.push('No vacancy text was supplied; paste its requirements and responsibilities.');
  if (UNSUPPORTED_SCRIPT.test(cvText) || UNSUPPORTED_SCRIPT.test(jobDescription)) warnings.push('This check compares English text. Read any other languages yourself; they have not been marked as a match.');
  const unparsedNotes = ['The check uses what you provide. It cannot verify your career history, confirm that you qualify or promise a response from an employer.'];
  if (parsed.overflow) unparsedNotes.push(`The check covers the first ${MAX_REQUIREMENTS} requirements. Read the ${parsed.overflow} additional clause${parsed.overflow === 1 ? '' : 's'} below as well.`);
  if (requirements.some(item => item.status === 'review')) unparsedNotes.push('Some requirements need your judgment. You will see their original wording, without an assumed match.');
  if (parsed.omitted.length) unparsedNotes.push('The remaining job description is shown below, including headings and sections outside the check.');
  return { methodVersion: METHOD_VERSION, scope: SCOPE, requirements, unparsedNotes, summary, omittedSections: parsed.omitted.map(span => ({ ...span, vacancyQuote: jobDescription.slice(span.start, span.end) })), warnings };
}

/** Stable ranking only inside safely bounded experience bullet blocks; every original line survives. */
export function prioritizeCvForVacancy(cvText: string, report: EvidenceReport): string {
  if (report.requirements.some(requirement => requirement.evidence.some(evidence => cvText.slice(evidence.start, evidence.end) !== evidence.cvQuote))) return cvText;
  const source = lines(cvText);
  const output = source.map(line => line.text);
  let section: Section = 'other';
  for (let i = 0; i < source.length; i++) {
    const nextSection = sectionFor(source[i].text);
    if (nextSection) { section = nextSection; continue; }
    if (section !== 'experience' || !SYMBOL_BULLET.test(source[i].text)) continue;
    const start = i;
    while (i + 1 < source.length && SYMBOL_BULLET.test(source[i + 1].text)) i++;
    const end = i;
    const after = source[end + 1];
    // Unmarked wrapped lines or numbered lists make ownership of a block ambiguous.
    if (end === start || (after && after.text.trim() && !sectionFor(after.text))) continue;
    const ranked = source.slice(start, end + 1).map((line, order) => {
      let weight = 0;
      for (const requirement of report.requirements) {
        if (requirement.status !== 'direct' && requirement.status !== 'partial') continue;
        for (const evidence of requirement.evidence) {
          if (evidence.sourceKind === 'action' && evidence.start >= line.start && evidence.end <= line.end) weight += requirement.status === 'direct' ? 4 : 1;
        }
      }
      return { text: line.text, order, weight };
    }).sort((a, b) => b.weight - a.weight || a.order - b.order);
    ranked.forEach((item, offset) => { output[start + offset] = item.text; });
  }
  return source.map((line, index) => output[index] + line.newline).join('');
}
