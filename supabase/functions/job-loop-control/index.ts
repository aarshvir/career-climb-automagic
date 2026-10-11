import { authenticatedClient, json, readJson, serve } from '../_shared/runtime.ts';
import { LoopRepository } from '../_shared/job-loop-repository.ts';
import { controlLoop, validateControlInput } from '../_shared/job-loop-runtime.ts';
serve(async req=>{const {admin,user}=await authenticatedClient(req);const action=validateControlInput(await readJson(req));return json(req,await controlLoop(new LoopRepository(admin),user.id,action,name=>Deno.env.get(name)));});
