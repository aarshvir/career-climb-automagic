import { ApiError, TAILOR_LIMITS } from '../_shared/core.ts';
import { adminClient, boundedBody, configuredBillingMode, cors, json, serve } from '../_shared/runtime.ts';
import { callRouter, prepareRouterRequest, ROUTER_MODELS, RouterUncertain, type RouterModel } from '../_shared/jobvance-openrouter.ts';
import { assembleTailoredCv, parseProposal, TAILOR_SCHEMA, TAILOR_SYSTEM_PROMPT, TailorInputError, tailorUserPrompt, validateTailorRequest } from '../_shared/cv-tailor.ts';

// Source-bound tailoring for signed-in candidates. Nothing about the
// CV, vacancy or model output is stored or logged; only the cost reservation.
// Allowances: 3 a month signed in, then an active pass (fair use 40 a day).

/** Same owner settings as configuredLoopEnv: routing is off unless the private row is valid and enabled. */
async function routerSettings(admin: ReturnType<typeof adminClient>): Promise<{ enabled: boolean; model: RouterModel }> {
  try {
    const { data, error } = await admin.from('jobvance_admin_config').select('monthly_cap_micros,router_enabled,default_model').eq('singleton', true).maybeSingle();
    const cap = Number(data?.monthly_cap_micros);
    const valid = !error && !!data && Number.isSafeInteger(cap) && cap > 0 && cap <= 50000000;
    const model = String(data?.default_model ?? '');
    return { enabled: valid && data?.router_enabled === true && model in ROUTER_MODELS, model: (model in ROUTER_MODELS ? model : 'openai/gpt-6.1-sol') as RouterModel };
  } catch { return { enabled: false, model: 'openai/gpt-6.1-sol' }; }
}
const OUTPUT_TOKENS = 6000;

function tailorError(error: { message?: string } | null): void {
  if (!error) return;
  const known: [string, number, string][] = [
    ['TAILOR_FREE_LIMIT', 429, `You have used your ${TAILOR_LIMITS.freeMonthly} free AI-tailored CVs this month. Passes start at $9 on the Pricing page. Compare without AI, editing and downloads stay free.`],
    ['TAILOR_PASS_DAILY_LIMIT', 429, `You have reached today’s fair-use limit of ${TAILOR_LIMITS.passDaily} AI-tailored CVs. It resets at midnight UTC and your pass keeps its remaining CVs. Passes start at $9 on the Pricing page.`],
    ['TAILOR_GUEST_LIMIT', 429, `You have used today’s free AI-tailored CV without an account. Sign in for ${TAILOR_LIMITS.freeMonthly} free a month, or see passes from $9 on the Pricing page. Compare without AI still works.`],
    ['TAILOR_GUEST_CAPACITY', 429, `Free AI tailoring without an account is busy today. Sign in for ${TAILOR_LIMITS.freeMonthly} free a month, or compare and edit your CV yourself.`],
    ['TAILOR_BUDGET_LIMIT', 429, 'AI tailoring is paused until next month to stay within our monthly budget. Compare without AI and editing still work.'],
    ['TAILOR_REQUEST_CONFLICT', 409, 'This request was already used. Start again.'],
    ['TAILOR_INVALID', 400, 'This tailoring request could not be read. Start again.'],
  ];
  for (const [code, status, message] of known) if (error.message?.includes(code)) throw new ApiError(status, code, message);
  throw new ApiError(503, 'TAILOR_UNAVAILABLE', 'AI tailoring is unavailable right now. Your CV comparison still works.');
}

serve(async req => {
  if (!('Access-Control-Allow-Origin' in cors(req))) throw new ApiError(403, 'TAILOR_ORIGIN', 'Open Jobvance to tailor your CV.');
  if (!req.headers.get('Content-Type')?.toLowerCase().includes('application/json')) throw new ApiError(415, 'TAILOR_INVALID', 'Use JSON.');
  let input;
  try { input = validateTailorRequest(JSON.parse(await boundedBody(req, 120000))); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'TAILOR_INVALID', error instanceof TailorInputError ? error.message : 'Send your CV and the job description.');
  }
  const admin = adminClient();
  // Auth is enforced here even though gateway verify_jwt is disabled for SDK compatibility.
  let userId: string | null = null;
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
  if (token) { try { const { data } = await admin.auth.getUser(token); userId = data.user?.id ?? null; } catch { userId = null; } }
  if (!userId) throw new ApiError(401, 'TAILOR_AUTH_REQUIRED', 'Sign in to your Jobvance account to tailor your CV.');
  const settings = await routerSettings(admin);
  if (!settings.enabled) throw new ApiError(503, 'TAILOR_PAUSED', 'AI tailoring is paused right now. Your CV comparison still works.');
  const model = settings.model;
  const request = prepareRouterRequest(name => Deno.env.get(name), model, [
    { role: 'system', content: TAILOR_SYSTEM_PROMPT },
    { role: 'user', content: tailorUserPrompt(input.cvText, input.jobTitle, input.company, input.jobDescription, input.facts, input.factSources) },
  ], TAILOR_SCHEMA, OUTPUT_TOKENS, 'medium');
  const reserved = await admin.rpc('jobvance_tailor_reserve', {
    p_user: userId, p_rate_hash: null, p_request: input.requestId, p_provider: 'openrouter', p_model: model, p_micros: request.reservedMicros,
    p_billing_mode: configuredBillingMode(), p_free_monthly: TAILOR_LIMITS.freeMonthly, p_pass_daily: TAILOR_LIMITS.passDaily,
    p_guest_daily: TAILOR_LIMITS.guestDaily, p_guest_global_daily: TAILOR_LIMITS.guestGlobalDaily,
  });
  tailorError(reserved.error);
  const usage = reserved.data as { id: string; is_new: boolean };
  if (!usage?.id) throw new ApiError(503, 'TAILOR_UNAVAILABLE', 'AI tailoring is unavailable right now. Your CV comparison still works.');
  if (!usage.is_new) throw new ApiError(409, 'TAILOR_REQUEST_REPLAYED', 'This request was already used. Start again.');
  let result;
  try { result = await callRouter(request); }
  catch (error) {
    const uncertain = error instanceof RouterUncertain;
    await admin.rpc('jobvance_tailor_settle', { p_id: usage.id, p_actual: uncertain ? null : 0, p_uncertain: uncertain });
    throw new ApiError(503, uncertain ? 'TAILOR_UNCERTAIN' : 'TAILOR_UNAVAILABLE', 'AI tailoring did not complete. Your CV comparison still works; you can try again later.');
  }
  const settled = await admin.rpc('jobvance_tailor_settle', { p_id: usage.id, p_actual: result.actualMicros, p_uncertain: false });
  if (settled.error) console.error('jobvance_tailor_settle_failed');
  let proposal;
  try { proposal = parseProposal(result.content); }
  catch { throw new ApiError(502, 'TAILOR_UNREADABLE', 'The AI suggestions could not be used this time. Your CV comparison still works.'); }
  const tailored = assembleTailoredCv(input.cvText, proposal, input.facts, input.factSources);
  return json(req, { tailored: { text: tailored.text, changes: tailored.changes, questions: tailored.questions, rejectedCount: tailored.rejected.length }, model: result.model });
});
