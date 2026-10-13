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
  /** Classroom and project work must not be presented as professional employment. */
  contextKind?: 'academic_project' | 'personal_project' | 'internship' | 'volunteering' | 'employment' | 'unspecified';
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
  category?: 'capability' | 'qualification' | 'condition' | 'deadline';
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

const METHOD_VERSION = 'english-literal-evidence-v3';
const MAX_REQUIREMENTS = 40;
const SCOPE = 'This is an English wording check of user-provided text. The claims are not verified. Read the job requirements yourself; this check does not decide whether you qualify or predict an interview.';
type Span = { start: number; end: number };
type Line = Span & { text: string; line: number; newline: string };
type Section = 'experience' | 'internships' | 'volunteering' | 'personal_projects' | 'skills' | 'education' | 'credentials' | 'projects' | 'other';
type Passage = EvidencePassage & { section: Section; terms: string[]; negative: boolean; pending: boolean; weakened: boolean; sourceSpan: Span; sourceLine: number; sourceQuote: string };

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
const PENDING = /\b(?:studying|studied|pursuing|learning|learner|in progress|working (?:toward|towards|on a)|candidate for|(?:cpa|cfa|pmp|acca|cipd|bachelor|master|mba|doctorate)(?:\s+degree)?\s+candidate|training for|expected|planned|pending|scheduled|enrolled|incomplete|unfinished|awaiting|revoked|suspended|plan(?:ning)? to|intend to|hope to|wish to|want to|will (?:learn|complete|study)|aspiring|uncertified|unlicensed|unlicenced|expired|lapsed)\b/i;
// Coursework can demonstrate completed work, but does not itself establish an awarded credential.
const CREDENTIAL_STUDY = /\b(?:syllabus|curriculum|thesis|dissertation|textbook|coursework|course(?:s)?|exam prep(?:aration)?|prepar(?:ing|ation) for|practice exam|study material)\b/i;
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

/** A role heading is listing context, not an achievement the CV must prove.
 * Keep it verbatim among omitted context; never drop a mandatory criterion. */
function listingRoleHeading(text: string, index: number, enteredTitle=''): boolean {
  const value = headingText(text).replace(/[.!]$/, '');
  if (index > 2 || value.length > 100 || MANDATORY.test(value)) return false;
  if (/^(?:job title|role title|position|employer|company)\s*:\s*\S/i.test(value)) return true;
  const words=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const title=words(enteredTitle);
  if(title && ` ${words(value)} `.includes(` ${title} `) && value.split(/\s+/).length<=14 && !/\b(?:with|must|required|qualifications?|skills?|experience|degree|years?|deadline|visa|proficient|preferred|eligible|knowledge|ability|responsibilities|duties|prepare|build|support|manage|deliver|develop|coordinate)\b/i.test(value))return true;
  if (!/(?:intern|internship|analyst|engineer|developer|designer|consultant|associate|specialist|coordinator|administrator|manager|director|officer|assistant)(?:\s*[-|–]\s*[\w\s]{1,30})?$/i.test(value)) return false;
  // A noun phrase at the top can be a title; a task or criterion stays a task.
  return !/^(?:prepare|produce|develop|build|create|support|assist|coordinate|manage|design|deliver|analy[sz]e|conduct|work|be|have|hold|demonstrate|ensure|maintain|own|write|review|complete|report|lead a|lead the)\b/i.test(value) && value.split(/\s+/).length <= 8;
}
function vacancyClauses(text:string,span:Span):Span[] {
  return clauses(text,span).flatMap(sentence=>{
    const value=text.slice(sentence.start,sentence.end), result:Span[]=[];
    const explicitList=/^(?:requirements?|qualifications?)\s*:/i.test(value);
    const declaredTool=(part:string)=>/^(?:(?:basic|advanced|intermediate)\s+)?(?:SQL|Excel|Power\s*BI|Python|JavaScript|Tableau|AWS|Azure|Git)$/i.test(part.trim());
    let cursor=0;
    for(const comma of value.matchAll(/,\s+/g)){
      const following=value.slice(comma.index!+comma[0].length);
      const predicate=following.replace(/^and\s+/i,'');
      const left=value.slice(cursor,comma.index!).replace(/^(?:requirements?|qualifications?)\s*:/i,'').trim();
      const next=predicate.split(',')[0].trim();
      // Split only a new explicit task or independently stated technical criterion.
      // Lists of objects sharing one verb remain together, e.g. financial, risk reports.
      if(!/^(?:clean|build|prepare|produce|develop|create|support|assist|coordinate|manage|design|deliver|analy[sz]e|work|review|maintain|write|present|communicate|collaborate|query|use)\b/i.test(predicate) && !/^(?:basic\s+)?(?:SQL|Excel|Power\s*BI|Python|JavaScript)\s+(?:(?:is|are)\s+)?(?:required|mandatory|essential)\b/i.test(predicate) && !(explicitList && (declaredTool(left)||declaredTool(next))))continue;
      const part=trimmedSpan(text,sentence.start+cursor,sentence.start+comma.index!);
      if(part)result.push(part);
      cursor=comma.index!+comma[0].length;
    }
    const tail=trimmedSpan(text,sentence.start+cursor,sentence.end);if(tail)result.push(tail);
    return result;
  });
}

function vacancySpans(text: string,enteredTitle=''): { requirements: Span[]; omitted: Span[]; overflow: number } {
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
    if (listingRoleHeading(line.text, i,enteredTitle)) { omitted.push(raw); continue; }
    const required = REQUIRED_HEADING.exec(heading);
    const other = OTHER_HEADING.exec(heading);
    if (required || other) {
      ignoreSection = !!other;
      const colon = line.text.indexOf(':');
      if (colon >= 0 && line.text.slice(colon + 1).trim()) {
        omitted.push({ start: raw.start, end: line.start + colon + 1 });
        const tail = trimmedSpan(text, line.start + colon + 1, line.end);
        if (tail) {
          for (const part of vacancyClauses(text, tail)) {
            if(listingRoleHeading(text.slice(part.start,part.end),i,enteredTitle)){omitted.push(part);continue;}
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
    for (const part of vacancyClauses(text, span)) {
      if(listingRoleHeading(text.slice(part.start,part.end),i,enteredTitle)){omitted.push(part);continue;}
      if (requirements.length < MAX_REQUIREMENTS) requirements.push(part);
      else { omitted.push(part); overflow++; }
    }
  }
  return { requirements, omitted, overflow };
}

function sectionFor(text: string): Section | null {
  const heading = headingText(text).replace(/:$/, '').toLowerCase();
  if (/^(?:(?:professional|work|relevant|career) )?(?:experience|employment(?: history)?|career history|work history)$/.test(heading)) return 'experience';
  if (/^(?:(?:summer|work|relevant) )?(?:internships?|internship experience|placements?|work placements?|industrial placements?)$/.test(heading)) return 'internships';
  if (/^(?:volunteering|volunteer(?:ing)? (?:work|experience)|community (?:work|service))$/.test(heading)) return 'volunteering';
  if (/^personal projects$/.test(heading)) return 'personal_projects';
  if (/^(?:(?:technical|key|core|professional) )?(?:skills|competencies|tools|technologies)(?: and (?:tools|technologies))?$/.test(heading)) return 'skills';
  if (/^(?:education|academic (?:background|qualifications)|qualifications)$/.test(heading)) return 'education';
  if (/^(?:certifications?|certificates?|licenses?|licences?|professional qualifications)$/.test(heading)) return 'credentials';
  if (/^(?:(?:academic|university|classroom|personal|selected) )?projects?$/.test(heading)) return 'projects';
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
      const contextKind = section === 'internships' ? 'internship' : section === 'volunteering' ? 'volunteering' : section === 'personal_projects' ? 'personal_project' : section === 'projects' || /\b(?:university|classroom|academic|coursework|student) (?:team )?project\b/i.test(cvQuote) ? 'academic_project' : section === 'experience' ? 'employment' : 'unspecified';
      result.push({ cvQuote, ...part, line: line.line + (text.slice(line.start, part.start).match(/\r\n|\r|\n/g)?.length ?? 0), sourceKind, contextKind, section, terms: meaningful(cvQuote), negative: NEGATIVE.test(cvQuote), pending: PENDING.test(cvQuote), weakened: WEAKENED.test(cvQuote), sourceSpan: span, sourceLine: line.line, sourceQuote: text.slice(span.start,span.end) });
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
  // Match individual clauses, but show their complete logical source line/bullet.
  // This retains team contribution, forecasts and qualifications after a semicolon.
  return { cvQuote: passage.sourceQuote, ...passage.sourceSpan, line: passage.sourceLine, sourceKind: passage.sourceKind, contextKind: passage.contextKind };
}
function publicPassages(passages: Passage[], limit=3): EvidencePassage[] {
  const seen=new Set<string>();
  return passages.map(publicPassage).filter(passage=>{const key=`${passage.start}:${passage.end}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,limit);
}

/** A qualification or uncertainty on a different list item is not a conflicting claim. */
function uncertainFor(passage: Passage, anchors: string[], credential: boolean): boolean {
  if (!passage.negative && !passage.pending && !(credential && CREDENTIAL_STUDY.test(passage.cvQuote))) return false;
  const chunks = passage.cvQuote.split(/[,;]|\s+but\s+/i);
  // Leading negation scopes the whole list: "No SQL, Python" must stay uncertain.
  if (/^\s*(?:skills\s*:\s*)?(?:no|never|not|without|learning|studying|pursuing)\b/i.test(passage.cvQuote)) return true;
  if (chunks.some(chunk => /^\s*(?:incomplete|unfinished|expired|revoked|suspended|pending|planned|scheduled|in progress|expected (?:completion|graduation).*)[.!]?\s*$/i.test(chunk))) return true;
  return chunks.some(chunk => {
    const terms = meaningful(chunk);
    return anchors.some(anchor => terms.includes(anchor)) && (NEGATIVE.test(chunk) || PENDING.test(chunk) || (credential && CREDENTIAL_STUDY.test(chunk)));
  });
}

function analyzeRequirement(text: string, span: Span, index: number, passages: Passage[]): EvidenceRequirement {
  const vacancyQuote = text.slice(span.start, span.end);
  const deadline = /\b(?:applications? (?:close|deadline)|apply by|closing date|deadline)\b/i.test(vacancyQuote);
  const condition = /\b(?:visa|sponsorship|work (?:authorization|authorisation|permit)|right to work|eligible to work|citizenship|nationality|relocat(?:e|ion)|security clearance)\b/i.test(vacancyQuote);
  if (deadline || condition) return { id: `requirement-${index + 1}`, vacancyQuote, ...span, status: 'review', evidence: [], matchedTerms: [], category: deadline ? 'deadline' : 'condition', explanation: deadline ? 'This is an application deadline, not a CV achievement. Check the original employer listing and its time zone before setting your reminder.' : 'This is an employer or eligibility condition, not evidence of a work achievement. Confirm the current condition with the employer; the CV check cannot establish your eligibility.', question: deadline ? 'What is the exact closing date and time zone on the employer listing?' : 'Does this employer condition apply to you? Confirm it without adding unsupported eligibility claims to your CV.' };
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
    const anchors = matches.filter(term => technologies.length && !task ? TECH.has(term) : !actions.includes(term) || TECH.has(term) || CREDENTIAL.has(term));
    return { passage, matches, anchors, full: terms.length > 0 && matches.length === terms.length };
  }).filter(match => match.anchors.length > 0).sort((a, b) => Number(b.full) - Number(a.full) || b.anchors.length - a.anchors.length || b.matches.length - a.matches.length || a.passage.start - b.passage.start);
  const datedQualification = credentials.length > 0 && /\b(?:by|before|after|completed|graduat(?:e|ed|ion))\b/i.test(vacancyQuote) && /\b(?:20\d\d|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(vacancyQuote);
  const base: EvidenceRequirement = { id: `requirement-${index + 1}`, vacancyQuote, ...span, status: 'review', evidence: publicPassages(related.map(item=>item.passage)), explanation: '', question: credentials.length ? 'What exact qualification, completion date and current status can you confirm? Keep expected completion clearly labelled.' : `Is there something your CV should show here? Add a specific example only if it is accurate.`, matchedTerms: [...new Set(related.flatMap(item => item.matches))], category: credentials.length ? 'qualification' : 'capability' };
  if (datedQualification) {
    base.evidence = publicPassages(related.filter(item => item.anchors.some(term => CREDENTIAL.has(term)) || item.passage.section === 'education').map(item=>item.passage));
    base.explanation = 'The employer gives a qualification completion date. Compare it with your actual or expected graduation date. A future completion date is not a completed qualification, and this check cannot confirm eligibility.';
    return base;
  }
  if (!recognized || ambiguous) {
    base.explanation = UNSUPPORTED_SCRIPT.test(vacancyQuote) ? 'This part is not in English. Read it yourself against your CV.' : numericConstraint ? 'This requirement includes a number that needs checking, such as team size or budget. Compare it with your actual experience; the check has not assumed a match.' : ambiguous ? 'The employer gives alternatives or conditions here. Check what they mean before deciding whether your experience fits.' : 'The check cannot interpret this requirement reliably. Read the wording above and decide what your CV should show.';
    return base;
  }
  if (!related.length) {
    base.status = 'missing';
    base.explanation = 'Your CV does not show a clear example of this yet. You may still have the experience; add it only if you can explain your contribution.';
    return base;
  }
  const asksDeliveredOutcome = /\b(?:implemented|delivered|achieved|realised|realized|measured|actual)\b[^.!?]*\b(?:results?|savings?|reductions?|improvements?|revenue|growth)\b|\b(?:reduce|increase)\b[^.!?]*\b(?:costs?|revenue)\b/i.test(vacancyQuote);
  const projected = related.filter(item=>/\b(?:estimat(?:e|ed)|projected|possible|potential|forecast(?:ed)?|proposal)\b|\b(?:not|never)\s+(?:implemented|measured|delivered|realised|realized)\b/i.test(item.passage.sourceQuote));
  if (asksDeliveredOutcome && projected.length) {
    base.status = 'review';
    base.evidence = publicPassages(projected.map(item=>item.passage));
    base.explanation = 'This source describes an estimate, forecast or proposal; it does not establish a delivered or measured result. Keep the full context and your own contribution visible. Add an implemented result only if you can substantiate it.';
    base.question = 'Was this result actually implemented and measured, or only projected? What was your own contribution? Keep an estimate labelled as an estimate.';
    return base;
  }
  const uncertain = (passage: Passage) => uncertainFor(passage, terms.filter(term => !actions.includes(term)), credentials.length > 0);
  const conflict = related.some(item => uncertain(item.passage));
  if (conflict) {
    base.evidence = publicPassages(related.filter(item => uncertain(item.passage)).map(item=>item.passage),2);
    const positive = related.find(item => !uncertain(item.passage));
    if (positive && base.evidence.length < 3) { const source=publicPassage(positive.passage); if(!base.evidence.some(item=>item.start===source.start&&item.end===source.end))base.evidence.push(source); }
    const explicitlyNegative=related.some(item=>item.passage.negative&&uncertain(item.passage));
    base.explanation = explicitlyNegative ? 'Your CV explicitly describes missing experience or another negative statement about this requirement. Keep that distinction visible. Review your actual position; do not turn an absence of experience into a positive claim.' : 'The wording needs a closer look. It may describe something unfinished, expired or not held. Check the current position before using it.';
    return base;
  }
  const direct = related.find(({ passage, full }) => {
    if (!full || uncertain(passage)) return false;
    if (/\b(?:professional|industry|commercial|paid|employment)\s+(?:work\s+)?experience\b/i.test(vacancyQuote) && ['academic_project','personal_project','volunteering'].includes(passage.contextKind ?? '')) return false;
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
    if (direct.passage.contextKind === 'academic_project') base.explanation += ' This passage is project or academic evidence; keep that context visible. It does not establish professional employment experience.';
  } else {
    base.status = 'partial';
    base.explanation = requestedDuration ? 'You mention related work, but the amount of relevant experience is unclear. Check the roles and dates; the check has not assumed a total.' : actions.includes('lead') && related.some(item => item.passage.weakened) ? 'Your CV says you supported the work. Keep that distinction. If you led a part of it, explain which part.' : task && related.every(item => item.passage.sourceKind !== 'action') ? 'The skill appears in your CV, but the work is not clear. Add a real example if you have one.' : credentials.length ? 'Your CV mentions something related, but the subject, level or current status may differ. Check the exact qualification.' : 'Your CV covers part of this requirement. Read what is missing and add an example only if it is true.';
  }
  return base;
}

/** Deterministic and local: no model, external request, fabricated quote or percentage score. */
export function analyzeCvEvidence(cvText: string, jobDescription: string,enteredTitle=''): EvidenceReport {
  const parsed = vacancySpans(jobDescription,enteredTitle);
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
