import { authenticatedClient, json, readJson, serve } from '../_shared/runtime.ts';
import { LoopRepository } from '../_shared/job-loop-repository.ts';
import { controlLoop, validateControlInput } from '../_shared/job-loop-runtime.ts';
import { configuredLoopEnv } from '../_shared/jobvance-loop-config.ts';
serve(async req=>{const {admin,user}=await authenticatedClient(req);const action=validateControlInput(await readJson(req));const env=await configuredLoopEnv(admin,name=>Deno.env.get(name));return json(req,await controlLoop(new LoopRepository(admin),user.id,action,env));});
