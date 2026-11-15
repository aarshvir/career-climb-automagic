import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const changeSchema = z.object({
  kind: z.enum(['rewrite', 'summary', 'order', 'addition']),
  n: z.number().int().nullable(),
  before: z.string().max(20000),
  after: z.string().max(20000),
  sources: z.array(z.number().int()).max(200),
  /** One-based numbers of the confirmed answers this change used. */
  facts: z.array(z.number().int().min(1).max(5)).max(5).default([]),
  /** For a summary: the 0-based line of the new profile in the returned text. Older functions omit it. */
  at: z.number().int().min(0).nullable().optional(),
});
const responseSchema = z.object({
  tailored: z.object({
    text: z.string().min(1).max(60000),
    changes: z.array(changeSchema).max(200),
    questions: z.array(z.string().max(300)).max(5),
    rejectedCount: z.number().int().min(0),
  }),
  model: z.string().max(120),
});
export type TailorChange = z.infer<typeof changeSchema>;
export type TailoredCv = z.infer<typeof responseSchema>['tailored'];

export class TailorUnavailable extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

const messages: Record<number, string> = {
  401: 'Sign in to your Jobvance account to tailor your CV.',
  429: 'You have reached your AI tailoring limit for now. Compare without AI and editing still work. Passes start at $9 on the Pricing page.',
  503: 'AI tailoring is unavailable right now. Your CV comparison still works.',
};

/** Sends the CV and vacancy (and any answers the candidate confirmed) for source-bound tailoring. Explicit consent is required by the server. */
export async function requestTailoredCv(input: { cvText: string; jobDescription: string; jobTitle: string; company: string; facts?: string[]; factSources?: number[] }): Promise<TailoredCv> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const body = { requestId: crypto.randomUUID(), cvText: input.cvText, jobDescription: input.jobDescription, jobTitle: input.jobTitle, company: input.company, consent: true, ...(input.facts?.length ? { facts: [...input.facts], factSources: [...(input.factSources ?? [])] } : {}) };
  if (body.facts && (body.facts.length > 5 || body.factSources?.length !== body.facts.length || body.factSources.some(n => !Number.isInteger(n) || n < 1))) throw new TailorUnavailable('Choose the CV role or line each answer belongs to.', 'TAILOR_INVALID');
  const result = await Promise.race([
    supabase.functions.invoke('tailor-for-job', { body }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TailorUnavailable('AI tailoring took too long. Your CV comparison still works.', 'TAILOR_TIMEOUT')), 140000); }),
  ]).finally(() => clearTimeout(timer));
  if (result.error) {
    const context = (result.error as { context?: unknown }).context;
    let message = '', code = 'TAILOR_UNAVAILABLE', status = 503;
    if (context instanceof Response) {
      status = context.status;
      try { const payload = await context.clone().json() as { error?: string; code?: string }; message = typeof payload.error === 'string' ? payload.error : ''; code = typeof payload.code === 'string' ? payload.code : code; } catch { /* keep generic */ }
    }
    throw new TailorUnavailable(message || messages[status] || messages[503], code);
  }
  const parsed = responseSchema.safeParse(result.data);
  if (!parsed.success) throw new TailorUnavailable('The AI suggestions could not be checked. Your CV comparison still works.', 'TAILOR_UNREADABLE');
  if (parsed.data.tailored.changes.some(change => change.facts.some(n => n > (body.facts?.length ?? 0) || (change.kind === 'summary' ? !change.sources.includes(body.factSources![n - 1]) : change.n !== body.factSources![n - 1])))) throw new TailorUnavailable('The answer references could not be checked. Your current CV is unchanged.', 'TAILOR_UNREADABLE');
  return parsed.data.tailored;
}

const PROFILE_HEADING = /^(professional\s+|career\s+)?(profile|summary|objective)\s*:?$/iu;
/**
 * Where a new profile sits: its line, and every line above it, as returned. An undo may touch that line only
 * while everything above it is still exactly as it was (or was changed only by this page's own undo steps), so
 * a deleted, moved or edited block above can never make another section look like the profile.
 */
export type ProfilePlace = { at: number; above: string[] } | null;

/**
 * Resolves the place once, from the document the function returned. With the function's exact "at" that line is
 * used if it holds the profile directly under a profile heading. Without "at" (an older function) the place is
 * used only if exactly one line fits; if several do, there is no place and undo is refused. The edited document
 * is never searched.
 */
export function profilePlace(returnedText: string, change: { after: string; at?: number | null }): ProfilePlace {
  const lines = returnedText.split('\n');
  const fits = (at: number) => at > 0 && lines[at] === change.after && PROFILE_HEADING.test((lines[at - 1] ?? '').trim());
  const found = typeof change.at === 'number' ? (fits(change.at) ? [change.at] : []) : lines.flatMap((_, at) => fits(at) ? [at] : []);
  return found.length === 1 ? { at: found[0], above: lines.slice(0, found[0]) } : null;
}

const sameLines = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((line, i) => line === b[i]);

/** True only if the profile is still on its recorded line with nothing above it edited, added or removed. */
export function profilePlaceHolds(lines: readonly string[], place: ProfilePlace, after: string): place is NonNullable<ProfilePlace> {
  return !!place && lines[place.at] === after && sameLines(lines.slice(0, place.at), place.above);
}

/**
 * Follows the profile through one change this page made at line "changedAt" (an undone rewrite or addition).
 * A change below the profile leaves its place as it is. A change above it is followed only if everything above
 * was untouched before the change; otherwise the place is lost and undo is refused.
 */
export function movedProfilePlace(place: ProfilePlace, before: readonly string[], after: readonly string[], changedAt: number): ProfilePlace {
  if (!place || changedAt >= place.at) return place;
  if (!sameLines(before.slice(0, place.at), place.above)) return null;
  const at = place.at + after.length - before.length;
  return at > 0 && after[at] !== undefined ? { at, above: after.slice(0, at) } : null;
}

/**
 * A rewrite of a line inside a profile that a new summary replaced is not in the final CV, so
 * "Keep my original" cannot undo it. The summary change already carries the replaced text as its
 * original; list only changes that are present in the returned CV.
 */
export function withoutReplacedRewrites(tailored: TailoredCv): TailoredCv {
  if (!tailored.changes.some(change => change.kind === 'summary' && change.before)) return tailored;
  return { ...tailored, changes: tailored.changes.filter(change => change.kind !== 'rewrite' || tailored.text.includes(change.after)) };
}

/** Best-effort role title from the first meaningful line of a vacancy. */
export function roleFromVacancy(vacancy: string): string {
  const first = vacancy.split(/\r?\n/u).map(line => line.trim()).find(line => line.length >= 2) ?? '';
  const cleaned = first.replace(/^(job\s+title|role|position)\s*[:\-–]\s*/iu, '').split(/\s+[-–|@]\s+|\s+at\s+/u)[0].replace(/[.:]$/u, '').trim();
  return cleaned.length >= 2 && cleaned.length <= 120 && cleaned.split(/\s+/u).length <= 12 ? cleaned : '';
}

/** Best-effort employer name from a "Role - Company" or "Role at Company" first line. */
export function companyFromVacancy(vacancy: string): string {
  const first = vacancy.split(/\r?\n/u).map(line => line.trim()).find(line => line.length >= 2) ?? '';
  const match = /\s+(?:[-–|@]|at)\s+(.+)$/u.exec(first);
  const value = match?.[1]?.replace(/\s*\(.*?\)\s*/gu, ' ').split(/,\s*/u)[0].trim() ?? '';
  return value.length >= 2 && value.length <= 120 ? value : '';
}
