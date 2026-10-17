/**
 * Source-bound CV tailoring: pure, deterministic parts (no network, no Deno APIs).
 *
 * The model never writes the CV. It may only propose:
 *   - rewrites of individual bullet/text lines (validated against that line and any
 *     answers the candidate confirmed and the model cited),
 *   - new bullet lines built only from cited answers, under an existing role,
 *   - an order for bullets inside one contiguous block (a permutation),
 *   - a short profile summary citing source lines (validated against them),
 *   - up to five plain questions about genuine gaps.
 * The CV is then assembled here from the original lines, so names, contact
 * details, headings, role/date lines and every bullet always survive.
 */

export type SourceKind = "name" | "contact" | "heading" | "role" | "bullet" | "text" | "blank";
export type SourceLine = { n: number; kind: SourceKind; text: string };
export type ProposedRewrite = { n: number; text: string; facts?: number[] };
export type ProposedAddition = { after: number; text: string; facts?: number[] };
export type ProposedSummary = { text: string; sources: number[]; facts?: number[] };
export type TailorProposal = { rewrites?: ProposedRewrite[]; orders?: number[][]; additions?: ProposedAddition[]; summary?: ProposedSummary | null; questions?: string[] };
/** `facts` lists the one-based numbers of the candidate's confirmed answers a change used. */
export type TailorChange = { kind: "rewrite" | "summary" | "order" | "addition"; n: number | null; before: string; after: string; sources: number[]; facts: number[] };
export type TailorRejection = { n: number | null; text: string; reason: string };
export type TailorResult = { text: string; changes: TailorChange[]; rejected: TailorRejection[]; questions: string[] };

/** At most this many confirmed answers per request, and new lines per result. */
export const MAX_FACTS = 5;
const BULLET = /^\s*([-•*–·▪●◦])\s+/u;
const SECTION_WORDS = /^(professional\s+|work\s+|relevant\s+|career\s+)?(profile|summary|objective|experience|employment(\s+history)?|education|skills|key\s+skills|core\s+skills|competencies|projects|certifications?|qualifications|languages|achievements|awards|publications|volunteering|interests|training|references|additional\s+experience|leadership|activities)\s*:?$/iu;
const SUMMARY_HEADING = /^(professional\s+|career\s+)?(profile|summary|objective)\s*:?$/iu;

function isHeading(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > 50 || BULLET.test(value) || /[.!?]$/u.test(value)) return false;
  if (SECTION_WORDS.test(value)) return true;
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return false;
  return value.replace(/[^\p{Lu}]/gu, "").length / letters.length >= 0.85 && !/[|@]/u.test(value);
}

/** Same structure rules as the client export layout (src/lib/cv-layout.ts). */
export function sourceLines(cv: string): SourceLine[] {
  const raw = cv.replace(/\r\n?/g, "\n").split("\n").map(line => line.replace(/\s+$/u, ""));
  const out: SourceLine[] = [];
  let seen = false, inHeader = false, headerLines = 0;
  raw.forEach((line, index) => {
    const n = index + 1;
    if (!line.trim()) { out.push({ n, kind: "blank", text: "" }); inHeader = false; return; }
    if (!seen) { seen = true; if (!isHeading(line) && !BULLET.test(line) && line.trim().length <= 80) { out.push({ n, kind: "name", text: line }); inHeader = true; return; } }
    if (isHeading(line)) { inHeader = false; out.push({ n, kind: "heading", text: line }); return; }
    if (inHeader && headerLines < 3 && line.trim().length <= 160 && !BULLET.test(line)) { headerLines++; out.push({ n, kind: "contact", text: line }); return; }
    inHeader = false;
    if (BULLET.test(line)) { out.push({ n, kind: "bullet", text: line }); return; }
    const next = raw[index + 1];
    if (next !== undefined && BULLET.test(next) && line.trim().length <= 160) { out.push({ n, kind: "role", text: line }); return; }
    out.push({ n, kind: "text", text: line });
  });
  return out;
}

/** Contiguous bullet blocks (each a list of line numbers) that may be reordered. */
export function bulletBlocks(lines: SourceLine[]): number[][] {
  const blocks: number[][] = [];
  let current: number[] = [];
  for (const line of lines) {
    if (line.kind === "bullet") current.push(line.n);
    else { if (current.length > 1) blocks.push(current); current = []; }
  }
  if (current.length > 1) blocks.push(current);
  return blocks;
}

// ---- Validation -------------------------------------------------------------------------

const STRONG_OWNERSHIP = /\b(led|lead|leading|owned|own|owning|headed|head|directed|managed|manage|managing|ran|run|running|spearheaded|launched|founded|built|drove|oversaw|oversee|delivered|established|created|designed|introduced|negotiated|chaired|orchestrated|championed|architected)\b/iu;
const CREDENTIAL = /\b(certifi\w*|certificate|licen[cs]\w*|chartered|accredit\w*|degree|diploma|bachelor\w*|master'?s|mba|phd|doctorate|pmp|prince2|cfa|acca|cpa|cima|six\s+sigma|black\s+belt|green\s+belt|scrum\s+master|itil|togaf|aws\s+certified)\b/iu;
const COMMON_CAPS = new Set(["I", "A", "An", "The", "And", "Or", "For", "With", "To", "Of", "In", "On", "At", "By", "As", "From", "Across", "Over", "Under", "Into", "Through", "Using", "Including", "Led", "Built", "Ran", "Managed", "Delivered", "Developed", "Created", "Designed", "Improved", "Reduced", "Increased", "Coordinated", "Supported", "Prepared", "Analysed", "Analyzed", "Presented", "Wrote", "Introduced", "Partnered", "Worked", "Owned", "Drove", "Launched", "Established", "Produced", "Tracked", "Reported", "Identified", "Implemented", "Streamlined", "Cut", "Saved", "Grew", "Helped", "Assisted", "Contributed", "Conducted", "Oversaw", "Directed", "Headed", "Negotiated", "Defined", "Shaped", "Set", "Translated", "Advised", "Operations", "Strategy", "Strategic", "Senior", "Manager", "Experienced", "Results", "Data", "Proven", "Track", "Record", "Cross", "Functional", "Business", "Finance", "Commercial", "Continuous", "Improvement", "Process", "Programme", "Program", "Project", "Projects", "Teams", "Team", "Stakeholder", "Stakeholders", "Leaders", "Leadership", "Customer", "Retail", "Supply", "Chain", "Inventory", "Cost", "Costs", "Savings", "Service", "Weekly", "Monthly", "Annual", "Key", "Performance", "Growth", "Digital", "Technology", "Product", "Operational", "Excellence", "Roadmap", "Portfolio", "Change", "Delivery", "Quality", "Executive", "Committee", "Analytical", "Analysis", "Reporting", "Insights", "Planning", "Forecasting", "Automation", "Tools", "Programmes", "Workshops", "Cases", "Case", "Value", "Over", "Nearly", "About", "More", "Than", "Than", "Seven", "Eight", "Nine", "Ten"]);

function normalise(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("en").replace(/[’']/gu, "'");
}
/** Numeric facts: 18%, 2.1M, 300, 2022, AED 2.1M → canonical tokens. */
export function numbers(text: string): string[] {
  return [...normalise(text).matchAll(/\d+(?:[.,]\d+)*\s*(?:%|k|m|bn|b|x)?/gu)].map(match => match[0].replace(/[\s,]/gu, ""));
}
function words(text: string): Set<string> {
  return new Set(normalise(text).split(/[^\p{L}\p{N}+#&.-]+/u).filter(Boolean).map(word => word.replace(/^[.-]+|[.-]+$/gu, "")));
}
const SENTENCE_VERBS = new Set(["Brings", "Combines", "Offers", "Has", "Holds", "Skilled", "Known", "Focused", "Adept", "Comfortable", "Able", "Seeking", "Looking", "Keen", "Eager"]);
const stem = (word: string) => normalise(word).replace(/(ing|ed|es|s|d)$/u, "");
/** Capitalised names and acronyms that are not ordinary sentence words. A
 * sentence-opening word is treated as ordinary when it is a known opening verb,
 * or shares a stem with a source word ("Redesigned" for "redesigning"). */
function properTerms(text: string, sourceWords: Set<string>): string[] {
  const stems = new Set([...sourceWords].map(stem));
  const found: string[] = [];
  for (const match of text.matchAll(/\b[\p{Lu}][\p{L}\p{N}&.+#-]*\b/gu)) {
    const token = match[0], index = match.index ?? 0;
    if (COMMON_CAPS.has(token) || COMMON_CAPS.has(token.replace(/\.$/u, ""))) continue;
    const opening = /^\s*$/u.test(text.slice(0, index)) || /[.!?;:]\s+$/u.test(text.slice(0, index));
    if (opening && !/^[\p{Lu}\d&.+#-]{2,}$/u.test(token) && (SENTENCE_VERBS.has(token) || stems.has(stem(token)))) continue;
    found.push(token);
  }
  return found;
}

export function validateRewrite(after: string, sources: string[]): string | null {
  const source = sources.join("\n");
  const value = after.trim();
  if (!value) return "Empty rewrite.";
  if (value.length > Math.max(260, source.length * 1.8)) return "Rewrite is much longer than its source.";
  if (/\n/u.test(value)) return "Rewrite must stay on one line.";
  const allowedNumbers = new Set(numbers(source));
  const extraNumber = numbers(value).find(token => !allowedNumbers.has(token));
  if (extraNumber) return `Adds a number not in your CV (${extraNumber}).`;
  const sourceWords = words(source);
  const extraTerm = properTerms(value, sourceWords).find(term => !sourceWords.has(normalise(term).replace(/^[.-]+|[.-]+$/gu, "")));
  if (extraTerm) return `Adds a name or term not in this part of your CV (${extraTerm}).`;
  if (CREDENTIAL.test(value) && !CREDENTIAL.test(source)) return "Adds a qualification or certification not in your CV.";
  const credentialAfter = normalise(value).match(new RegExp(CREDENTIAL.source, "giu")) ?? [];
  const missingCredential = credentialAfter.find(term => !normalise(source).includes(term));
  if (missingCredential) return `Adds a qualification not in this part of your CV (${missingCredential}).`;
  if (STRONG_OWNERSHIP.test(value) && !STRONG_OWNERSHIP.test(source)) return "Claims stronger ownership than your CV states (e.g. led or managed).";
  return null;
}

// ---- Assembly ---------------------------------------------------------------------------

function bulletPrefix(line: string): string {
  return line.match(BULLET)?.[0] ?? "- ";
}

/** One-based answer numbers the model cited, keeping only real, distinct answers. */
function citedFacts(value: unknown, facts: string[]): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number => Number.isInteger(item) && item >= 1 && item <= facts.length))].slice(0, MAX_FACTS);
}

export function assembleTailoredCv(cv: string, proposal: TailorProposal, facts: string[] = []): TailorResult {
  const lines = sourceLines(cv);
  const byN = new Map(lines.map(line => [line.n, line]));
  const text = new Map(lines.map(line => [line.n, line.text]));
  const changes: TailorChange[] = [], rejected: TailorRejection[] = [];
  const factText = (cited: number[]) => cited.map(number => facts[number - 1]);

  const seenRewrite = new Set<number>();
  for (const rewrite of (proposal.rewrites ?? []).slice(0, 80)) {
    const source = byN.get(rewrite.n);
    if (!source || (source.kind !== "bullet" && source.kind !== "text") || seenRewrite.has(rewrite.n) || typeof rewrite.text !== "string") { rejected.push({ n: Number.isInteger(rewrite.n) ? rewrite.n : null, text: String(rewrite.text ?? ""), reason: "Not an editable line." }); continue; }
    seenRewrite.add(rewrite.n);
    const sourceBody = source.text.replace(BULLET, "").trim();
    const proposed = rewrite.text.replace(BULLET, "").trim();
    if (proposed === sourceBody) continue;
    // A rewrite may only use its own line, plus answers the candidate confirmed and the model cited.
    const cited = citedFacts(rewrite.facts, facts);
    const problem = validateRewrite(proposed, [sourceBody, ...factText(cited)]);
    if (problem) { rejected.push({ n: rewrite.n, text: proposed, reason: problem }); continue; }
    const after = source.kind === "bullet" ? `${bulletPrefix(source.text)}${proposed}` : proposed;
    text.set(rewrite.n, after);
    changes.push({ kind: "rewrite", n: rewrite.n, before: source.text, after, sources: [rewrite.n], facts: cited });
  }

  // Bullet order: only exact permutations of an existing contiguous block are accepted.
  const order = new Map<number, number>(); // position line n -> source line n placed there
  const blocks = bulletBlocks(lines);
  for (const proposed of (proposal.orders ?? []).slice(0, 40)) {
    if (!Array.isArray(proposed) || !proposed.every(Number.isInteger)) continue;
    const block = blocks.find(candidate => candidate.length === proposed.length && [...candidate].sort((a, b) => a - b).join() === [...proposed].sort((a, b) => a - b).join());
    if (!block || block.some(n => order.has(n))) continue;
    if (block.join() === proposed.join()) continue;
    block.forEach((position, index) => order.set(position, proposed[index]));
    changes.push({ kind: "order", n: block[0], before: block.map(n => byN.get(n)!.text.replace(BULLET, "").trim()).join(" / "), after: proposed.map(n => (text.get(n) ?? "").replace(BULLET, "").trim()).join(" / "), sources: [...proposed], facts: [] });
  }

  // New bullets come only from confirmed answers: each must cite at least one, and is
  // checked against the cited answers alone. They sit under an existing role or bullet.
  const additions = new Map<number, string[]>(); // source line n -> new bullet lines after it
  let added = 0;
  for (const addition of (proposal.additions ?? []).slice(0, 20)) {
    const anchor = byN.get(addition.after);
    const cited = citedFacts(addition.facts, facts);
    const value = typeof addition.text === "string" ? addition.text.replace(BULLET, "").trim().replace(/\s+/gu, " ") : "";
    let problem: string | null = null;
    if (!anchor || (anchor.kind !== "role" && anchor.kind !== "bullet")) problem = "A new line must sit under one of your roles.";
    else if (!cited.length) problem = "A new line must come from one of your answers.";
    else if (added >= MAX_FACTS) problem = "Too many new lines.";
    else problem = validateRewrite(value, factText(cited));
    if (problem || !anchor) { rejected.push({ n: Number.isInteger(addition.after) ? addition.after : null, text: value, reason: problem ?? "Not placed." }); continue; }
    const neighbour = anchor.kind === "bullet" ? anchor : lines.find(line => line.n > anchor.n && line.kind === "bullet");
    const line = `${neighbour ? bulletPrefix(neighbour.text) : "- "}${value}`;
    additions.set(anchor.n, [...(additions.get(anchor.n) ?? []), line]);
    changes.push({ kind: "addition", n: anchor.n, before: "", after: line, sources: [anchor.n], facts: cited });
    added++;
  }

  // Summary: validated against the union of cited lines and cited answers; placed under an
  // existing profile/summary heading (replacing its text lines) or inserted after the header.
  let summaryText: string | null = null, summarySources: number[] = [], summaryFacts: number[] = [];
  if (proposal.summary && typeof proposal.summary.text === "string" && proposal.summary.text.trim()) {
    const cited = [...new Set((proposal.summary.sources ?? []).filter(n => { const line = byN.get(n); return line && line.kind !== "blank" && line.kind !== "heading"; }))];
    const citedAnswers = citedFacts(proposal.summary.facts, facts);
    const value = proposal.summary.text.trim().replace(/\s+/gu, " ");
    const problem = !cited.length ? "A summary must cite lines from your CV." : value.length > 420 ? "Summary too long." : validateRewrite(value, [...cited.map(n => byN.get(n)!.text), ...factText(citedAnswers)]);
    if (problem) rejected.push({ n: null, text: value, reason: problem });
    else { summaryText = value; summarySources = cited; summaryFacts = citedAnswers; }
  }

  const out: string[] = [];
  const summaryHeading = lines.find(line => line.kind === "heading" && SUMMARY_HEADING.test(line.text.trim()));
  let summaryPlaced = false, skipping = false;
  const headerEnd = (() => { let last = 0; for (const line of lines) { if (line.kind === "name" || line.kind === "contact") last = line.n; else if (line.kind !== "blank") break; } return last; })();
  for (const line of lines) {
    if (skipping) {
      if (line.kind === "heading") skipping = false;
      else if (line.kind === "text") { changes.push({ kind: "summary", n: line.n, before: line.text, after: "", sources: summarySources, facts: summaryFacts }); continue; }
      else if (line.kind !== "blank") skipping = false;
    }
    const placed = order.has(line.n) ? order.get(line.n)! : line.n;
    out.push(text.get(placed)!);
    // A role's new lines go first under it; a bullet's go right after that bullet, wherever it moved.
    if (line.kind === "role") out.push(...(additions.get(line.n) ?? []));
    if (line.kind === "bullet") out.push(...(additions.get(placed) ?? []));
    if (summaryText && !summaryPlaced && summaryHeading && line.n === summaryHeading.n) {
      out.push(summaryText); summaryPlaced = true; skipping = true;
    } else if (summaryText && !summaryPlaced && !summaryHeading && headerEnd && line.n === headerEnd) {
      out.push("", "PROFILE", summaryText); summaryPlaced = true;
    }
  }
  if (summaryText && summaryPlaced) changes.push({ kind: "summary", n: summaryHeading?.n ?? null, before: "", after: summaryText, sources: summarySources, facts: summaryFacts });
  // Collapse summary bookkeeping: one visible summary change carrying any replaced text.
  const replaced = changes.filter(change => change.kind === "summary" && change.after === "").map(change => change.before).join(" ");
  const visible = changes.filter(change => !(change.kind === "summary" && change.after === "")).map(change => change.kind === "summary" ? { ...change, before: replaced } : change);

  const questions = (proposal.questions ?? []).filter(question => typeof question === "string" && question.trim().length > 8).map(question => question.trim().slice(0, 300)).slice(0, 5);
  return { text: out.join("\n").replace(/\n{3,}/gu, "\n\n"), changes: visible, rejected, questions };
}

// ---- Prompt -----------------------------------------------------------------------------

export const TAILOR_SYSTEM_PROMPT = `You tailor a candidate's CV to one job. You are strictly truthful.
You receive the CV as numbered lines with a kind (name, contact, heading, role, bullet, text), the job description and, sometimes, answers the candidate has confirmed are true (A1, A2, ...).
Return ONLY a JSON object: {"rewrites":[{"n":number,"text":string,"facts":[number,...]}],"orders":[[number,...]],"additions":[{"after":number,"text":string,"facts":[number,...]}],"summary":{"text":string,"sources":[number,...],"facts":[number,...]},"questions":[string]}.
Rules:
- rewrites: for lines of kind "bullet" or "text" that relate to the job. Make each one clearly stronger, not just a word swap: start with a precise action verb, put the purpose or result early when the line states one, and use the job's own words where the line genuinely supports them. Keep it one line; it may be up to about one and a half times as long. Never add numbers, employers, products, tools, places, certifications, degrees or results that are not in that same line or in an answer you cite. Never upgrade the candidate's role: if the line says supported/assisted/helped/coordinated, do not write led/managed/owned unless a cited answer says so. Do not include the bullet symbol. "facts" lists the answer numbers you used (empty if none). Skip lines that are already strong or not relevant.
- orders: for each list of consecutive bullet lines under one role, you may give the same line numbers in a new order, most relevant to the job first. Use every number of that list exactly once.
- additions: only from answers. Up to 5 new bullet lines, each placed "after" the number of the role line (or a bullet line) it belongs under, each citing the answers it uses in "facts". Use only what those answers say. Use [] when there are no answers.
- summary: a 2-3 sentence profile (max 60 words) positioning the candidate for this job, using only facts from the lines you cite in "sources" and the answers you cite in "facts". Write it whenever the CV has at least two relevant lines. Use {"text":"","sources":[],"facts":[]} only if the CV gives too little to go on.
- questions: up to 5 short plain-English questions about important job requirements that neither the CV nor the answers show (e.g. "Did you run the lean workshops yourself, or support someone who did?"). Never suggest the answer, and never repeat a question an answer already covers.
Write in the CV's language and spelling (UK or US). No markdown.`;

export function tailorUserPrompt(cv: string, jobTitle: string, company: string, jobDescription: string, facts: string[] = []): string {
  const lines = sourceLines(cv).filter(line => line.kind !== "blank").map(line => `${line.n} [${line.kind}] ${line.text}`).join("\n");
  const answers = facts.length ? `\n\nANSWERS THE CANDIDATE CONFIRMED ARE TRUE:\n${facts.map((fact, index) => `A${index + 1}: ${fact}`).join("\n")}` : "";
  return `TARGET ROLE: ${jobTitle}${company ? ` at ${company}` : ""}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 12000)}\n\nCV LINES:\n${lines}${answers}`;
}

const numberList = (value: unknown): number[] => Array.isArray(value) ? value.filter(Number.isInteger) as number[] : [];

export function parseProposal(raw: string): TailorProposal {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI response was not readable.");
  const value = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const rewrites = Array.isArray(value.rewrites) ? value.rewrites.filter((item): item is ProposedRewrite => !!item && typeof item === "object" && Number.isInteger((item as ProposedRewrite).n) && typeof (item as ProposedRewrite).text === "string").map(item => ({ n: item.n, text: item.text, facts: numberList(item.facts) })) : [];
  const orders = Array.isArray(value.orders) ? value.orders.filter((item): item is number[] => Array.isArray(item) && item.every(Number.isInteger)) : [];
  const additions = Array.isArray(value.additions) ? value.additions.filter((item): item is ProposedAddition => !!item && typeof item === "object" && Number.isInteger((item as ProposedAddition).after) && typeof (item as ProposedAddition).text === "string").map(item => ({ after: item.after, text: item.text, facts: numberList(item.facts) })) : [];
  const summaryValue = value.summary as ProposedSummary | null | undefined;
  const summary = summaryValue && typeof summaryValue === "object" && typeof summaryValue.text === "string" && summaryValue.text.trim() && Array.isArray(summaryValue.sources) ? { text: summaryValue.text, sources: summaryValue.sources.filter(Number.isInteger), facts: numberList(summaryValue.facts) } : null;
  const questions = Array.isArray(value.questions) ? value.questions.filter((item): item is string => typeof item === "string") : [];
  return { rewrites, orders, additions, summary, questions };
}

const integers = { type: "array", items: { type: "integer" } };
export const TAILOR_SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["rewrites", "orders", "additions", "summary", "questions"],
  properties: {
    rewrites: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "text", "facts"], properties: { n: { type: "integer" }, text: { type: "string" }, facts: integers } } },
    orders: { type: "array", items: integers },
    additions: { type: "array", items: { type: "object", additionalProperties: false, required: ["after", "text", "facts"], properties: { after: { type: "integer" }, text: { type: "string" }, facts: integers } } },
    summary: { type: "object", additionalProperties: false, required: ["text", "sources", "facts"], properties: { text: { type: "string" }, sources: integers, facts: integers } },
    questions: { type: "array", items: { type: "string" } },
  },
};

export type TailorRequest = { requestId: string; cvText: string; jobDescription: string; jobTitle: string; company: string; consent: true; facts: string[] };
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
export class TailorInputError extends Error {}
/** Strict request shape: exactly these fields (answers optional), bounded sizes, explicit consent. */
export function validateTailorRequest(value: unknown): TailorRequest {
  const fields = ["requestId", "cvText", "jobDescription", "jobTitle", "company", "consent"];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TailorInputError("Send your CV and the job description.");
  const item = value as Record<string, unknown>;
  const expected = Object.prototype.hasOwnProperty.call(item, "facts") ? [...fields, "facts"] : fields;
  if (Object.keys(item).length !== expected.length || expected.some(field => !Object.prototype.hasOwnProperty.call(item, field))) throw new TailorInputError("Send your CV and the job description.");
  if (item.consent !== true) throw new TailorInputError("Confirm that your CV and the job can be sent to our AI provider.");
  if (typeof item.requestId !== "string" || !UUID.test(item.requestId)) throw new TailorInputError("Start a new request.");
  const text = (name: string, min: number, max: number) => { const v = item[name]; if (typeof v !== "string" || v.includes("\0") || v.trim().length < min || v.length > max) throw new TailorInputError(`Check ${name === "cvText" ? "your CV" : name === "jobDescription" ? "the job description" : "the role"} text.`); return v; };
  let facts: string[] = [];
  if (expected.length > fields.length) {
    const raw = item.facts;
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_FACTS || raw.some(fact => typeof fact !== "string" || fact.includes("\0") || fact.trim().length < 10 || fact.length > 400)) throw new TailorInputError(`Check your answers: up to ${MAX_FACTS}, each 10 to 400 characters.`);
    facts = raw.map(fact => (fact as string).trim().replace(/\s+/gu, " "));
  }
  return { requestId: item.requestId, cvText: text("cvText", 80, 30000), jobDescription: text("jobDescription", 80, 20000), jobTitle: text("jobTitle", 2, 200), company: typeof item.company === "string" && item.company.length <= 200 ? item.company : "", consent: true, facts };
}
