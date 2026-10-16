import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const changeSchema = z.object({
  kind: z.enum(['rewrite', 'summary', 'order']),
  n: z.number().int().nullable(),
  before: z.string().max(20000),
  after: z.string().max(20000),
  sources: z.array(z.number().int()).max(200),
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
  429: 'You have reached your AI tailoring limit for now. Compare without AI and editing still work. Passes start at $9 on the Pricing page.',
  503: 'AI tailoring is unavailable right now. Your CV comparison still works.',
};

/** Sends the CV and vacancy for source-bound tailoring. Explicit consent is required by the server. */
export async function requestTailoredCv(input: { cvText: string; jobDescription: string; jobTitle: string; company: string }): Promise<TailoredCv> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const body = { requestId: crypto.randomUUID(), cvText: input.cvText, jobDescription: input.jobDescription, jobTitle: input.jobTitle, company: input.company, consent: true };
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
  return parsed.data.tailored;
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
