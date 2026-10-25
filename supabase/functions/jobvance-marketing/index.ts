import { adminClient, json, readJson, serve } from '../_shared/runtime.ts';
import { authenticateAdmin, type AdminDatabase } from '../_shared/jobvance-admin.ts';
import { controlMarketing, supabaseStore, validateMarketingAction, type SupabaseLike } from '../_shared/jobvance-marketing.ts';

// Owner-authenticated and read-only towards Meta: there is no scheduler entry point and no ad-changing action.
const env = (name: string) => Deno.env.get(name);

serve(async req => {
  const client = adminClient();
  const actor = await authenticateAdmin(req, client as unknown as AdminDatabase);
  const action = validateMarketingAction(await readJson(req));
  return json(req, await controlMarketing(supabaseStore(client as unknown as SupabaseLike), actor, action, env, fetch, new Date()));
});
