import type { LoopAction, LoopAssessment, LoopClaim, LoopClaimInput, LoopContact, LoopOpportunity, LoopOpportunityInput, LoopPacket, LoopProfile, LoopProfileInput } from './job-loop-types.ts';
import { normalizeFollowUp, validateScheduleInput } from './job-loop-schedule.ts';
import { readDiscoveryMinimumExperience } from '../../../src/lib/employer-discovery.ts';
import { generationBoundAction, validLoopGeneration } from './job-loop-request.ts';
import { validateCvVariantSaveIntent } from './job-loop-cv-variants.ts';
import { validateCvVariantFactSaveIntent, validateCvVariantFactWithdrawIntent, validateCvVariantFactReadScope } from './job-loop-cv-variant-facts.ts';

const CLAIM_KINDS = ['employment', 'internship', 'academic_project', 'personal_project', 'volunteering', 'education', 'skill'] as const;
const STATUSES = ['saved', 'prepared', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'] as const;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECTED = /\b(projected|estimated|potential|forecast|modelled|modeled|expected|proposed|targeted)\b/i;
const STOP = new Set('a an the and or of to in with for at on from as by is are be will you your our we their this that have has experience required skills responsibilities role ability work working must should'.split(' '));
function fail(message: string): never { throw new Error(message); }
function obj(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Expected a plain input object.');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key))) fail('Unknown or privileged input field.');
  return record;
}
function text(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string' || value.length > max || Array.from(value).some(c => c.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(c)) || /[\u202a-\u202e\u2066-\u2069]/u.test(value)) fail('Text is missing, too long or contains unsupported control characters.');
  if (value.trim().length < min) fail('Text is shorter than the required limit.');
  return value.trim();
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail('Expected an explicit true/false choice.'); return value; }
function enumeration<T extends string>(value: unknown, choices: readonly T[]): T { if (typeof value !== 'string' || !choices.includes(value as T)) fail('Unsupported input choice.'); return value as T; }
function numberOrNull(value: unknown, max: number): number | null { if (value === null) return null; if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail('Expected a bounded number or explicit null.'); return value; }
function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail('List exceeds the allowed size.');
  const result = value.map(v => text(v, 1, maxLength));
  if (new Set(result.map(v => v.toLowerCase())).size !== result.length) fail('Repeated list values are not allowed.');
  return result;
}
function reference(value: unknown): string { const id = text(value, 1, 80); if (!ID.test(id)) fail('Invalid record reference.'); return id; }
function version(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('Expected a record revision.'); return value; }
export function safeLoopUrl(value: unknown, optional = true): string {
  const raw = text(value, optional ? 0 : 1, 2000);
  if (!raw && optional) return '';
  let url: URL;
  try { url = new URL(raw); } catch { return fail('Use a public https:// source URL.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || host.includes(':') || /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || /\.(localhost|local|internal)$/.test(host)) fail('Only public HTTPS sources without credentials are allowed.');
  return url.href;
}
export function validateProfile(value: unknown): LoopProfileInput {
  const p = obj(value, ['audience', 'name', 'contactLine', 'targetTitles', 'locations', 'experienceYears', 'languages', 'pageTarget', 'discreetSearch', 'sourceText', 'excludedTerms', 'compensation']);
  const comp = obj(p.compensation, ['currency', 'period', 'minimum']);
  const currency = text(comp.currency, 0, 3).toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) fail('Currency must be an explicit three-letter code or empty.');
  if (p.pageTarget !== 1 && p.pageTarget !== 2) fail('Choose a one- or two-page preference.');
  return { audience: enumeration(p.audience, ['student', 'mba', 'professional']), name: text(p.name, 1, 120), contactLine: text(p.contactLine, 0, 500), targetTitles: strings(p.targetTitles, 10, 150), locations: strings(p.locations, 10, 150), experienceYears: numberOrNull(p.experienceYears, 80), languages: strings(p.languages, 20, 80), pageTarget: p.pageTarget, discreetSearch: bool(p.discreetSearch), sourceText: text(p.sourceText, 80, 60000), excludedTerms: strings(p.excludedTerms, 100, 150), compensation: { currency, period: enumeration(comp.period, ['monthly', 'annual', 'hourly']), minimum: numberOrNull(comp.minimum, 100000000) } };
}
function projectedResult(source: string, phrasing: string, status: LoopClaimInput['resultStatus']): void {
  if (PROJECTED.test(source) && status === 'measured') fail('A projection cannot be relabeled as a measured result.');
  if (PROJECTED.test(source) && /\d/.test(phrasing) && !PROJECTED.test(phrasing)) fail('Numeric wording from a projected source must retain its projection qualifier.');
  if (PROJECTED.test(phrasing) && status !== 'projected') fail('Projected wording must retain its projected result label.');
}
function inferredKind(sourceText: string, quote: string): LoopClaimInput['kind'] | null {
  const start = sourceText.indexOf(quote);
  if (start < 0) return null;
  // A long role may contain many bullet points; its context does not expire
  // after a fixed number of lines. The nearest explicit section still applies.
  const before = sourceText.slice(0, start).split(/\r?\n/).reverse();
  for (const line of before) {
    if (/academic|coursework|university project|capstone|class project/i.test(line)) return 'academic_project';
    if (/internship|\bintern\b/i.test(line)) return 'internship';
    if (/personal project|side project/i.test(line)) return 'personal_project';
    if (/volunteering|volunteer experience/i.test(line)) return 'volunteering';
    if (/^\s*education\s*$/i.test(line)) return 'education';
    if (/^\s*(employment|professional experience|work experience)\s*$/i.test(line)) return 'employment';
  }
  return null;
}
function normalizedPassage(value: string): string { return value.split(/\r?\n/).map(line => line.trim().replace(/^(?:[-•*]|\d+[.)])\s+/, '')).join('\n'); }
function completeSourcePassage(source: string, quote: string): string | null {
  const wanted = normalizedPassage(quote).split('\n');
  if (wanted.length > 30) return null;
  let offset = 0;
  const lines = source.split('\n').map(raw => { const line = { raw, start: offset, normalized: normalizedPassage(raw) }; offset += raw.length + 1; return line; });
  for (let start = 0; start <= lines.length - wanted.length; start++) {
    if (wanted.every((line, n) => lines[start + n].normalized === line)) {
      const last = lines[start + wanted.length - 1];
      return source.slice(lines[start].start, last.start + last.raw.length).trim();
    }
  }
  return null;
}
export function validateClaim(value: unknown, profile: LoopProfileInput): LoopClaimInput {
  const c = obj(value, ['sourceKind', 'sourceQuote', 'phrasing', 'context', 'kind', 'resultStatus', 'confirmed', 'shareable']);
  const claim: LoopClaimInput = { sourceKind: enumeration(c.sourceKind, ['cv_passage', 'user_answer']), sourceQuote: text(c.sourceQuote, 8, 3000), phrasing: text(c.phrasing, 8, 1500), context: text(c.context, 1, 200), kind: enumeration(c.kind, CLAIM_KINDS), resultStatus: enumeration(c.resultStatus, ['measured', 'projected', 'not_measured']), confirmed: bool(c.confirmed), shareable: bool(c.shareable) };
  if (claim.sourceKind === 'cv_passage') {
    const complete = completeSourcePassage(profile.sourceText, claim.sourceQuote);
    if (!complete) fail('The complete source passage is no longer present; cropped quotes cannot establish a claim.');
    if (normalizedPassage(complete) !== normalizedPassage(claim.phrasing)) fail('Approved wording must preserve the complete literal source passage, including negation, contribution and team attribution.');
    claim.sourceQuote = complete;
    claim.phrasing = normalizedPassage(complete);
    const quoteStart = profile.sourceText.indexOf(claim.sourceQuote);
    let contextStart = profile.sourceText.lastIndexOf(claim.context, quoteStart);
    // Saved role headers combine literal source lines. Rebuild them rather than
    // requiring that display separator to appear in the original CV.
    let combinedContext = false;
    if (contextStart < 0 && claim.context.includes(' | ')) {
      contextStart = profile.sourceText.lastIndexOf(claim.context.split(' | ')[0], quoteStart);
      combinedContext = true;
    }
    if (!claim.sourceQuote.includes(claim.context) && (contextStart < 0 || quoteStart - contextStart > 2000)) fail('The context must be a nearby literal course, project or employer label in the source.');
    if (contextStart >= 0 && contextStart < quoteStart) {
      const lineStart = profile.sourceText.lastIndexOf('\n', contextStart) + 1;
      const end = profile.sourceText.indexOf('\n', contextStart);
      const lineEnd = end < 0 ? profile.sourceText.length : end;
      const header = [profile.sourceText.slice(lineStart, lineEnd).trim()];
      for (const line of profile.sourceText.slice(lineEnd, quoteStart).split(/\r?\n/).map(v => v.trim()).filter(Boolean).slice(0, 3)) {
        if (/^[-•*]|[.;]$/.test(line)) break;
        if (line.length <= 150 && (/\b(?:19|20)\d{2}\b/.test(line) || /^(?:title:|role:|intern\b|analyst\b|associate\b|manager\b|director\b|head\b|engineer\b|developer\b|consultant\b|assistant\b)/i.test(line))) header.push(line);
        else break;
      }
      if (header.join(' | ').length > 200) fail('The full source role header is too long; confirm a concise contextual user answer.');
      if (combinedContext && header.join(' | ') !== claim.context) fail('The saved role header no longer matches the literal source title and dates.');
      claim.context = header.join(' | ');
    }
    const kind = inferredKind(profile.sourceText, claim.sourceQuote);
    if (kind && kind !== claim.kind && !(claim.kind === 'skill' && claim.phrasing.length <= 120 && !/\d|\b(led|supported|helped|created|prepared)\b/i.test(claim.phrasing))) fail('Keep the source context: academic, internship and employment evidence cannot be relabeled.');
  } else {
    if (!claim.sourceQuote.includes(claim.context)) fail('A user-attested answer must explicitly identify its course, project or employer context.');
    const complete = normalizedPassage(claim.sourceQuote);
    const contextPrefix = `${claim.context}: `;
    if (normalizedPassage(claim.phrasing) !== complete && !(complete.startsWith(contextPrefix) && normalizedPassage(claim.phrasing) === complete.slice(contextPrefix.length))) fail('Keep the complete user-attested factual sentence; do not crop its qualifiers or attribution.');
  }
  projectedResult(claim.sourceQuote, claim.phrasing, claim.resultStatus);
  return claim;
}
function validateContact(value: unknown): LoopContact | null {
  if (value === null) return null;
  const c = obj(value, ['name', 'title', 'email', 'sourceUrl', 'sourceQuote', 'confirmedByUser', 'inExistingThread']);
  const email = text(c.email, 0, 254);
  if (email && (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) || /[\r\n]/.test(email))) fail('Contact email is invalid.');
  const name = text(c.name, 0, 120), title = text(c.title, 0, 150);
  if (/[\r\n]/.test(name + title)) fail('Contact identity must be a single line.');
  return { name, title, email, sourceUrl: safeLoopUrl(c.sourceUrl), sourceQuote: text(c.sourceQuote, 0, 1000), confirmedByUser: bool(c.confirmedByUser), inExistingThread: bool(c.inExistingThread) };
}
export function validateOpportunity(value: unknown): LoopOpportunityInput {
  const o = obj(value, ['title', 'company', 'location', 'url', 'description', 'contact']);
  return { title: text(o.title, 2, 200), company: text(o.company, 0, 200), location: text(o.location, 0, 200), url: safeLoopUrl(o.url), description: text(o.description, 80, 20000), contact: validateContact(o.contact) };
}
export function validateAction(value: unknown): LoopAction {
  if (!value || typeof value !== 'object' || !('action' in value)) fail('Missing action.');
  const action = (value as { action: unknown }).action;
  const keys: Record<string, string[]> = {
    get: [], get_existing: [], save_profile: ['expectedVersion', 'profile', 'saveConsent'], suggest_claims: [], save_claim: ['expectedVersion', 'id', 'claim'], withdraw_claim: ['expectedVersion', 'id'], add_opportunity: ['expectedVersion', 'opportunity'], update_opportunity: ['expectedVersion', 'id', 'status', 'followUpAt', 'notes'], start_run: ['requestId', 'provider', 'model', 'modelConsent', 'inboxConsent','processingRoute'], resume_run: ['runId'], cancel_run: ['runId'], approve_packet: ['packetId', 'inputHash', 'reviewedText', 'confirmFacts', 'confirmDisclosure'], download: ['packetId', 'format'], preview_packet: ['packetId','inputHash'], save_schedule:['expectedScheduleVersion','schedule','recurringConsent'], pause_schedule:['expectedScheduleVersion'],cancel_schedule:['expectedScheduleVersion'],erase_loop:['confirmErase'],erase_self:['confirmErase'],request_support:['category','message'], gmail_connect: ['allowDrafts'], gmail_preview: ['ticket'], gmail_finalize: ['ticket', 'confirmMailbox'], gmail_disconnect: [], gmail_create_draft: ['packetId', 'requestId', 'confirmRecipientAndAttachment'],
  };
  keys.start_selected_run = ['expectedVersion','requestId','opportunityIds','prepareConsent','provider','model','modelConsent','processingRoute'];
  keys.link_saved_check = ['expectedVersion', 'checkId', 'opportunity', 'linkConsent'];
  keys.save_cv_variant = ['expectedVersion','requestId','variantId','expectedVariantRevision','label','profile','claimRefs','saveConsent'];
  keys.read_cv_variants = [];
  const factKeys = ['expectedVersion','requestId','variantId','expectedVariantRevision','sourceHash','factId','expectedFactRevision'];
  keys.save_cv_variant_fact = [...factKeys,'claim','saveConsent'];
  keys.withdraw_cv_variant_fact = [...factKeys,'withdrawConsent'];
  keys.read_cv_variant_facts = ['variantId'];
  if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(keys, action)) fail('Unsupported action. Sending and application submission are unavailable.');
  if (generationBoundAction(action)) keys[action].push('expectedGeneration');
  const a = obj(value, ['action', ...keys[action]]);
  if (generationBoundAction(action) && !validLoopGeneration(a.expectedGeneration)) fail('Refresh Jobvance before continuing. This action needs the current workspace lifetime.');
  if (keys[action].some(key => !(key === 'id' && action === 'save_claim') && !(key === 'processingRoute' && (action === 'start_run'||action === 'start_selected_run')) && !Object.prototype.hasOwnProperty.call(a, key))) fail('An action is missing required inputs.');
  if ('expectedVersion' in a) version(a.expectedVersion);
  if (action === 'save_cv_variant_fact' || action === 'withdraw_cv_variant_fact' || action === 'read_cv_variant_facts') {
    const { action: _action, ...intent } = a;
    if (action === 'save_cv_variant_fact') return { action, ...validateCvVariantFactSaveIntent(intent) };
    if (action === 'withdraw_cv_variant_fact') return { action, ...validateCvVariantFactWithdrawIntent(intent) };
    return { action, ...validateCvVariantFactReadScope(intent) };
  }
  if (action === 'save_cv_variant') {
    const { action: _action, ...intent } = a;
    return { action, ...validateCvVariantSaveIntent(intent) };
  }
  if ('expectedScheduleVersion' in a) version(a.expectedScheduleVersion);
  for (const name of ['id', 'runId', 'packetId']) if (name in a) reference(a[name]);
  if ('requestId' in a && (typeof a.requestId !== 'string' || !UUID.test(a.requestId))) fail('Invalid request ID.');
  for (const name of ['saveConsent', 'modelConsent', 'inboxConsent', 'confirmFacts', 'confirmDisclosure', 'allowDrafts', 'confirmMailbox', 'confirmRecipientAndAttachment','recurringConsent','confirmErase']) if (name in a) bool(a[name]);
  if ('ticket' in a) a.ticket = text(a.ticket, 1, 16000);
  if (action === 'save_profile') { a.profile = validateProfile(a.profile); if (!a.saveConsent) fail('Explicit private-storage consent is required.'); }
  if (action === 'add_opportunity') a.opportunity = validateOpportunity(a.opportunity);
  if (action === 'link_saved_check') {
    if (typeof a.checkId !== 'string' || !UUID.test(a.checkId)) fail('Choose an exact saved check.');
    if (a.linkConsent !== true) fail('Explicitly choose to save this vacancy linked to the saved check.');
    a.checkId = a.checkId.toLowerCase();
    a.opportunity = validateOpportunity(a.opportunity);
  }
  if (action === 'start_selected_run') {
    a.requestId=(a.requestId as string).toLowerCase();
    if(a.prepareConsent!==true)fail('Explicitly choose to prepare the selected vacancies.');
    if(!Array.isArray(a.opportunityIds)||a.opportunityIds.length<1||a.opportunityIds.length>2||a.opportunityIds.some(id=>typeof id!=='string'||!UUID.test(id)))fail('Choose one or two exact vacancies.');
    a.opportunityIds=(a.opportunityIds as string[]).map(id=>id.toLowerCase());
    if(new Set(a.opportunityIds as string[]).size!==(a.opportunityIds as string[]).length)fail('Choose each vacancy once.');
  }
  if (action === 'save_claim') { obj(a.claim, ['sourceKind', 'sourceQuote', 'phrasing', 'context', 'kind', 'resultStatus', 'confirmed', 'shareable']); }
  if (action === 'start_run'||action === 'start_selected_run') { enumeration(a.provider, ['rules', 'anthropic', 'openai', 'moonshot']); text(a.model, 1, 150); if (a.provider !== 'rules' && !a.modelConsent) fail('Provider processing consent is required.'); if(a.processingRoute!==undefined){enumeration(a.processingRoute,['direct','openrouter']);if(a.provider==='rules')fail('Rules preparation does not authorize an external processing route.');} }
  if (action === 'update_opportunity') { enumeration(a.status, STATUSES); text(a.notes, 0, 5000); a.followUpAt=normalizeFollowUp(a.followUpAt as string|null); }
  if (action === 'save_schedule') { a.schedule=validateScheduleInput(a.schedule); if(!a.recurringConsent)fail('Explicit recurring preparation permission is required.'); }
  if ((action === 'erase_loop'||action==='erase_self') && !a.confirmErase) fail('Confirm erasing your private Job Loop record and generated documents.');
  if (action==='request_support') { enumeration(a.category,['help','privacy','bug']); a.message=text(a.message,5,2000); }
  if (action === 'preview_packet' && (typeof a.inputHash!=='string'||!/^[0-9a-f]{64}$/.test(a.inputHash)))fail('Choose the exact current packet to preview.');
  if (action === 'approve_packet') { text(a.reviewedText, 80, 60000); if (typeof a.inputHash !== 'string' || !/^[0-9a-f]{64}$/.test(a.inputHash) || !a.confirmFacts || !a.confirmDisclosure) fail('Input-bound factual and disclosure approval is required.'); }
  if (action === 'download') enumeration(a.format, ['pdf', 'docx', 'txt', 'report', 'letter']);
  return a as unknown as LoopAction;
}
export function suggestClaims(profile: LoopProfileInput): LoopClaimInput[] {
  const suggestions: LoopClaimInput[] = [];
  const seen = new Set<string>();
  for (const line of profile.sourceText.split(/\r?\n/)) {
    const quote = line.trim();
    if (quote.length < 20 || quote.length > 1500 || /@|https?:\/\//.test(quote) || seen.has(quote)) continue;
    seen.add(quote);
    const phrasing = quote.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '');
    const kind = inferredKind(profile.sourceText, quote) ?? (profile.audience === 'student' ? 'academic_project' : 'employment');
    const before = profile.sourceText.slice(0, profile.sourceText.indexOf(quote)).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const context = before.reverse().find(line => line.length <= 150 && !/^[-•*]/.test(line) && !/@|https?:\/\//.test(line)) ?? quote.slice(0, 150);
    suggestions.push({ sourceKind: 'cv_passage', sourceQuote: quote, phrasing, context, kind, resultStatus: PROJECTED.test(quote) ? 'projected' : 'not_measured', confirmed: false, shareable: false });
    if (suggestions.length >= 30) break;
  }
  return suggestions;
}
function includesExcluded(value: string, profile: LoopProfileInput): boolean { const lower = value.toLowerCase(); return profile.excludedTerms.some(term => lower.includes(term.toLowerCase())); }
function redact(value: string, profile: LoopProfileInput): string { let output = value; for (const term of profile.excludedTerms) output = output.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[restricted]'); return output; }
function inputClaims(profile: LoopProfileInput, claims: LoopClaim[]): LoopClaim[] {
  if (!Array.isArray(claims) || claims.length > 200) fail('Too many claims for one record.');
  const seen = new Set<string>();
  return claims.map(claim => {
    reference(claim.id); version(claim.revision);
    if (seen.has(claim.id)) fail('Repeated claim IDs are not allowed.'); seen.add(claim.id);
    enumeration(claim.status, ['active', 'withdrawn']);
    bool(claim.confirmed); bool(claim.shareable);
    // Source edits quarantine old claims; history must not block unrelated fresh facts.
    if (claim.status === 'active' && claim.confirmed && claim.shareable) {
      const valid = validateClaim({ sourceKind: claim.sourceKind, sourceQuote: claim.sourceQuote, phrasing: claim.phrasing, context: claim.context, kind: claim.kind, resultStatus: claim.resultStatus, confirmed: claim.confirmed, shareable: claim.shareable }, profile);
      return { ...claim, ...valid };
    }
    return claim;
  });
}
export function eligibleLoopClaims(profile: LoopProfileInput, claims: LoopClaim[]): LoopClaim[] { return inputClaims(profile, claims).filter(c => c.status === 'active' && c.confirmed && c.shareable && !includesExcluded(c.phrasing + '\n' + c.context, profile)); }
function tokens(value: string): Set<string> { return new Set(value.toLowerCase().match(/[\p{L}\p{N}+#]+/gu)?.filter(w => w.length > 2 && !STOP.has(w)) ?? []); }
export function assessOpportunity(profile: LoopProfileInput, claims: LoopClaim[], opportunity: LoopOpportunityInput): LoopAssessment {
  const allowed = eligibleLoopClaims(profile, claims), titleWords = tokens(opportunity.title), jdWords = tokens(opportunity.description);
  const targetWords = tokens(profile.targetTitles.join(' '));
  const role = targetWords.size ? Math.round(35 * [...titleWords].filter(w => targetWords.has(w)).length / Math.max(1, titleWords.size)) : 0;
  const ranked = allowed.map(claim => ({ claim, hits: [...tokens(claim.phrasing)].filter(w => jdWords.has(w)).length })).sort((a, b) => b.hits - a.hits || a.claim.id.localeCompare(b.claim.id));
  const owned = tokens(allowed.map(c => c.phrasing).join(' '));
  const evidence = Math.round(50 * [...jdWords].filter(w => owned.has(w)).length / Math.max(1, jdWords.size));
  let constraints = 0;
  const flags = ['ELIGIBILITY_NOT_VERIFIED', 'PAY_NOT_ESTABLISHED'];
  if (profile.discreetSearch) flags.push('DISCREET_SEARCH_REVIEW');
  if (opportunity.location && profile.locations.some(location => opportunity.location.toLowerCase().includes(location.toLowerCase()))) constraints += 7;
  else flags.push(opportunity.location ? 'LOCATION_REVIEW_NEEDED' : 'LOCATION_UNKNOWN');
  const asked = readDiscoveryMinimumExperience(opportunity.description);
  if (profile.experienceYears === null) flags.push('EXPERIENCE_UNKNOWN');
  else if (asked !== null) { if (profile.experienceYears >= asked) constraints += 8; else flags.push('EXPERIENCE_REQUIREMENT_GAP'); }
  else flags.push('EXPERIENCE_REQUIREMENT_NOT_STATED');
  if (!opportunity.contact?.confirmedByUser || !opportunity.contact.name) flags.push('CONTACT_RESEARCH_NEEDED');
  if (allowed.some(c => ['academic_project', 'personal_project', 'internship'].includes(c.kind))) flags.push('PROJECT_AND_INTERNSHIP_CONTEXT_PRESERVED');
  const clauses = opportunity.description.split(/\n|(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 15).slice(0, 20);
  const gaps = clauses.filter(clause => [...tokens(clause)].filter(w => owned.has(w)).length < 2).slice(0, 8).map(clause => redact(clause, profile));
  return { score: Math.max(0, Math.min(100, role + evidence + constraints)), method: 'approved-phrase-overlap-v1; heuristic relevance, not ATS or eligibility certification', components: { role, evidence, constraints }, gaps, flags, claimIds: ranked.map(item => item.claim.id) };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export async function fingerprintLoopInputs(profile: LoopProfileInput, claims: LoopClaim[], opportunities: LoopOpportunityInput[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonical({ profile, claims: [...claims].sort((a, b) => a.id.localeCompare(b.id)), opportunities }));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export type ComposeLoopPacketInput = { profile: LoopProfile; claims: LoopClaim[]; opportunity: LoopOpportunity; assessment?: LoopAssessment; selectedClaimIds?: string[]; runId: string; packetId?: string; inputHash?: string; createdAt?: string; model?: LoopPacket['model'] };
/** A portable CV selects complete confirmed facts, never crops sentences or
 * removes an employment/education context merely to improve keyword overlap. */
export function boundedRulesClaimIds(profile:LoopProfile,claims:LoopClaim[],assessment:LoopAssessment):string[]{
  const allowed=eligibleLoopClaims(profile,claims),ranked=assessment.claimIds.map(id=>allowed.find(claim=>claim.id===id)).filter((claim):claim is LoopClaim=>!!claim);
  const selected:LoopClaim[]=[],contexts=new Set<string>();
  for(const claim of ranked.filter(value=>['employment','internship','education'].includes(value.kind))){const key=`${claim.kind}:${claim.context}`;if(contexts.has(key))continue;contexts.add(key);
    const same=ranked.filter(value=>value.kind===claim.kind&&value.context===claim.context);selected.push(same.find(value=>value.phrasing.length<=600)??same.reduce((a,b)=>a.phrasing.length<=b.phrasing.length?a:b));
  }
  const budget=profile.pageTarget===1?2600:5500;
  let used=profile.name.length+profile.contactLine.length+160+selected.reduce((sum,claim)=>sum+claim.context.length+claim.phrasing.length+40,0);
  for(const claim of ranked){if(selected.some(value=>value.id===claim.id))continue;const cost=claim.phrasing.length+(!selected.some(value=>value.kind===claim.kind&&value.context===claim.context)?claim.context.length+60:10);
    if(selected.length>=16||used+cost>budget)continue;selected.push(claim);used+=cost;
  }
  return selected.map(claim=>claim.id);
}
export async function composePacket(input: ComposeLoopPacketInput): Promise<LoopPacket> {
  const { profile, opportunity } = input;
  const allowed = eligibleLoopClaims(profile, input.claims);
  const assessment = assessOpportunity(profile, input.claims, opportunity);
  const wanted = input.selectedClaimIds ?? boundedRulesClaimIds(profile,input.claims,assessment);
  if (wanted.length > 100 || new Set(wanted).size !== wanted.length || wanted.some(id => !allowed.some(c => c.id === id))) fail('Model selection contains repeated, unknown, withdrawn or unapproved claim IDs.');
  const picked = wanted.map(id => allowed.find(c => c.id === id)!);
  // Never erase an approved employment/internship context or education merely to raise overlap.
  for (const c of allowed) if (['education', 'employment', 'internship'].includes(c.kind) && !picked.some(p => p.kind === c.kind && p.context === c.context)) { if (!picked.some(p => p.id === c.id)) picked.push(c); }
  const unique: LoopClaim[] = [];
  const sources = new Set<string>();
  for (const c of picked) { const key = `${c.sourceKind}\n${c.context}\n${c.sourceQuote}`; if (!sources.has(key)) { sources.add(key); unique.push(c); } }
  const holds: string[] = [];
  const requiredContexts = input.claims.filter(c => c.status === 'active' && c.confirmed && c.shareable && ['employment', 'internship'].includes(c.kind));
  if (requiredContexts.some(c => !allowed.some(a => a.kind === c.kind && (a.id === c.id || a.context === c.context)))) holds.push('WORK_CONTEXT_REQUIRES_SAFE_SHAREABLE_FACT');
  if (!unique.length) holds.push('NO_APPROVED_SHAREABLE_FACTS');
  if (includesExcluded(profile.name + '\n' + profile.contactLine, profile)) holds.push('PROFILE_IDENTITY_REQUIRES_DISCLOSURE_REVIEW');
  const headings: Record<LoopClaimInput['kind'], string> = { employment: 'EMPLOYMENT', internship: 'INTERNSHIPS', academic_project: 'ACADEMIC PROJECTS', personal_project: 'PERSONAL PROJECTS', volunteering: 'VOLUNTEERING', education: 'EDUCATION', skill: 'CONFIRMED SKILLS' };
  const cv = [redact(profile.name, profile), redact(profile.contactLine, profile)].filter(Boolean);
  for (const kind of CLAIM_KINDS) {
    const section = unique.filter(c => c.kind === kind); if (!section.length) continue;
    cv.push('', headings[kind]);
    for (const context of [...new Set(section.map(c => c.context))]) { cv.push(context); for (const c of section.filter(c => c.context === context)) cv.push(`• ${c.phrasing}`); }
  }
  if (cv.join('\n').length < 80) holds.push('CV_TEXT_TOO_SHORT');
  if (cv.join('\n').length > 60000) holds.push('CV_TEXT_TOO_LONG');
  const contact = opportunity.contact;
  const named = !!contact?.confirmedByUser && !!contact.name && !!contact.sourceQuote && !includesExcluded(contact.name, profile);
  const ownedTerms = tokens(unique.map(c => c.phrasing).join(' '));
  const quote = opportunity.description.split(/\r?\n|(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 15 && s.length <= 280 && !includesExcluded(s, profile)).sort((a, b) => [...tokens(b)].filter(t => ownedTerms.has(t)).length - [...tokens(a)].filter(t => ownedTerms.has(t)).length)[0] ?? '';
  const labels: Record<LoopClaimInput['kind'], string> = { employment: 'Employment', internship: 'Internship', academic_project: 'Academic project', personal_project: 'Personal project', volunteering: 'Volunteering', education: 'Education', skill: 'Confirmed skill' };
  const actionExamples = unique.filter(c => !['education', 'skill'].includes(c.kind));
  const briefPool = actionExamples.length ? actionExamples : unique;
  const briefFacts = briefPool.filter(c => c.phrasing.length <= 900).slice(0, 2);
  const facts = (briefFacts.length ? briefFacts : briefPool.slice(0, 1)).map(c => `• ${labels[c.kind]} — ${c.context}: ${c.phrasing}`).join('\n');
  const company = redact(opportunity.company, profile), title = redact(opportunity.title, profile);
  const opening = `I am interested in the ${title}${company ? ` role at ${company}` : ' role'}.`;
  const letter = ['Dear hiring team,', '', opening, quote ? `Your vacancy highlights: “${quote}”` : '', '', 'Relevant examples from my background:', facts, '', 'I would welcome a conversation about how these examples relate to the responsibilities of the role.', '', 'Regards,', redact(profile.name, profile)].filter((line, i, all) => line || all[i - 1] !== '').join('\n');
  const draft = named ? [`Hello ${contact!.name},`, '', contact!.inExistingThread ? `Following up in our existing thread about the ${title} role.` : opening, quote ? `Your vacancy highlights: “${quote}”` : '', '', 'Relevant examples from my background:', facts, '', 'Could you clarify the role scope and the next appropriate step?', '', redact(profile.name, profile)].join('\n') : '';
  const flags = [...assessment.flags];
  if (contact?.inExistingThread) flags.push('REPLY_IN_EXISTING_THREAD_ONLY');
  const evidence = ['JOBVANCE — GROUNDED PACKET REVIEW', 'Relevance is a heuristic. Claims are user-confirmed, not independently verified.', ...(profile.discreetSearch ? ['DISCREET SEARCH REVIEW\nBefore external use, review current-employer details, the intended contact and confidential information in every document and message. This preference is a review reminder; it does not automatically block contacts or guarantee confidentiality.'] : []), ...unique.map(c => `${c.id} revision ${c.revision} / ${c.kind} / ${c.context} / ${c.resultStatus}\nApproved wording: ${c.phrasing}\nSource (${c.sourceKind === 'user_answer' ? 'user-attested answer' : 'reviewed CV passage'}): ${redact(c.sourceQuote, profile)}`), 'EVIDENCE GAPS', ...assessment.gaps, 'NEXT ACTION', named ? contact!.inExistingThread ? 'Review a reply in the existing thread; no cold outreach.' : 'Review the exact recipient, wording and attachment before any draft creation.' : 'Find and confirm a named contact, or submit your reviewed CV through the employer’s own application route. Outreach is held; no generic recruiter draft was created.'].join('\n\n');
  const inputHash = input.inputHash ?? await fingerprintLoopInputs(profile, input.claims, [opportunity]);
  if (!/^[0-9a-f]{64}$/.test(inputHash)) fail('Invalid immutable input fingerprint.');
  return { id: input.packetId ?? crypto.randomUUID(), runId: reference(input.runId), opportunityId: reference(opportunity.id), title, company, inputHash, profileRevision: profile.revision, claimVersions: Object.fromEntries(unique.map(c => [c.id, c.revision])), cvText: cv.join('\n'), evidenceText: evidence, coverLetterText: letter, connectionNote: named && !contact!.inExistingThread ? `Hello ${contact!.name}, I am interested in the ${title} role. May I ask about its scope and the appropriate application route?`.slice(0, 298) : '', messageText: draft, emailSubject: named && contact!.email ? `${title}${company ? ` — ${company}` : ''}` : '', emailBody: named && contact!.email ? draft : '', contact: named ? contact : null, assessment: { ...assessment, flags }, status: holds.length ? 'held' : 'review_required', holdReasons: holds, pageCount: null, createdAt: input.createdAt ?? new Date().toISOString(), approvedAt: null, model: input.model ?? { provider: 'rules', model: 'literal-approved-claims', method: 'literal approved phrasing; no model-authored facts' }, artifacts: {} };
}
