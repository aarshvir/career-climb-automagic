import { ApiError } from '../_shared/core.ts';
import { adminClient, json, readJson, serve } from '../_shared/runtime.ts';
import { authenticateAdmin, type AdminDatabase } from '../_shared/jobvance-admin.ts';
import { controlMarketing, runAuto, supabaseStore, validateMarketingAction, type SupabaseLike } from '../_shared/jobvance-marketing.ts';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const env = (name: string) => Deno.env.get(name);

serve(async req => {
  const client = adminClient();
  const store = supabaseStore(client as unknown as SupabaseLike);
  const ticket = req.headers.get('x-jobvance-marketing-ticket');
  if (ticket !== null) {
    // The hourly scheduler: a single-use ticket instead of a user session.
    if (!uuid.test(ticket) || !(await store.consumeTicket(ticket))) throw new ApiError(401, 'UNAUTHORIZED', 'This scheduler ticket is invalid or already used.');
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || (body as { action?: unknown }).action !== 'run_auto') throw new ApiError(400, 'MARKETING_INPUT_INVALID', 'The scheduler may only run the auto check.');
    return json(req, { result: await runAuto(store, null, env, fetch, new Date()) });
  }
  const actor = await authenticateAdmin(req, client as unknown as AdminDatabase);
  const action = validateMarketingAction(await readJson(req));
  return json(req, await controlMarketing(store, actor, action, env, fetch, new Date()));
});
