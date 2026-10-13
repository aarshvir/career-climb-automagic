import { adminClient, json, readJson, serve } from '../_shared/runtime.ts';
import { authenticateAdmin, controlAdmin, validateAdminAction, type AdminDatabase } from '../_shared/jobvance-admin.ts';

serve(async req => {
  const db = adminClient() as unknown as AdminDatabase;
  const actor = await authenticateAdmin(req,db);
  const action = validateAdminAction(await readJson(req));
  return json(req,await controlAdmin(db,actor,action,name=>Deno.env.get(name)));
});
