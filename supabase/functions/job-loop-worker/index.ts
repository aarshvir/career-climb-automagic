import { ApiError, uuid } from '../_shared/core.ts';
import { adminClient, readJson } from '../_shared/runtime.ts';
import { LoopRepository } from '../_shared/job-loop-repository.ts';
import { authenticateWorker, dispatchWorker, processLoopPhase } from '../_shared/job-loop-runtime.ts';
declare const EdgeRuntime:{waitUntil(promise:Promise<unknown>):void};
const env=(name:string)=>Deno.env.get(name);
Deno.serve(async req=>{
  try{
    if(req.method!=='POST')return new Response(null,{status:405});await authenticateWorker(req,env);
    const body=await readJson(req);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='runId'))throw new ApiError(400,'LOOP_INVALID_INPUT','Use a run reference only.');
    const runId=uuid((body as {runId?:unknown}).runId,'Run ID');const repo=new LoopRepository(adminClient());
    const work=processLoopPhase(repo,runId,env).then(async again=>{if(again)await dispatchWorker(runId,env);}).catch(error=>{console.error('job_loop_worker_stage_failed',{type:error instanceof Error?error.name:'Error'});});
    EdgeRuntime.waitUntil(work);return new Response(JSON.stringify({accepted:true}),{status:202,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch(error){return new Response(JSON.stringify({error:error instanceof ApiError?error.message:'The worker request failed.',code:error instanceof ApiError?error.code:'LOOP_WORKER_ERROR'}),{status:error instanceof ApiError?error.status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
});
