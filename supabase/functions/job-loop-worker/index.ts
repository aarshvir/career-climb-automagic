import { ApiError, uuid } from '../_shared/core.ts';
import { adminClient, readJson } from '../_shared/runtime.ts';
import { LoopRepository } from '../_shared/job-loop-repository.ts';
import { authenticateWorker, dispatchWorker, processLoopPhase, processDueSchedules } from '../_shared/job-loop-runtime.ts';
import { consumeScheduledTicket } from '../_shared/job-loop-scheduler-ticket.ts';
import { consumeMaintenanceTicket } from '../_shared/job-loop-maintenance-ticket.ts';
import { configuredLoopEnv } from '../_shared/jobvance-loop-config.ts';
declare const EdgeRuntime:{waitUntil(promise:Promise<unknown>):void};
const baseEnv=(name:string)=>Deno.env.get(name);
Deno.serve(async req=>{
  try{
    if(req.method!=='POST')return new Response(null,{status:405});
    const body=await readJson(req);if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(400,'LOOP_INVALID_INPUT','Use a run reference or a scheduler dispatch.');
    if((body as {action?:unknown}).action==='artifact_gc'){
      if(Object.keys(body).some(key=>key!=='action'))throw new ApiError(400,'LOOP_INVALID_INPUT','Maintenance does not accept account, path or limit overrides.');
      if(!await consumeMaintenanceTicket(req,baseEnv))throw new ApiError(401,'LOOP_MAINTENANCE_UNAUTHORIZED','The maintenance request is unauthorized.');
      const repo=new LoopRepository(adminClient());
      // SQL rechecks its disabled-by-default gate and exact owner allowlist.
      // This path never configures or invokes preparation/model/mail services.
      const work=repo.collectTerminalArtifacts().then(result=>{console.info('job_loop_artifact_gc',result);}).catch(error=>{console.error('job_loop_artifact_gc_failed',{code:error instanceof ApiError?error.code:'LOOP_GC_FAILED'});});
      EdgeRuntime.waitUntil(work);return new Response(JSON.stringify({accepted:true}),{status:202,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }
    if((body as {action?:unknown}).action==='run_due'){
      if(Object.keys(body).some(key=>key!=='action'))throw new ApiError(400,'LOOP_INVALID_INPUT','Scheduled dispatch does not accept account or run overrides.');
      if(!await consumeScheduledTicket(req,baseEnv))await authenticateWorker(req,baseEnv);
      const admin=adminClient();const env=await configuredLoopEnv(admin,baseEnv);
      const work=processDueSchedules(new LoopRepository(admin),env).catch(error=>{console.error('job_loop_scheduler_failed',{type:error instanceof Error?error.name:'Error'});});
      EdgeRuntime.waitUntil(work);return new Response(JSON.stringify({accepted:true}),{status:202,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }
    await authenticateWorker(req,baseEnv);
    if(Object.keys(body).some(key=>key!=='runId'))throw new ApiError(400,'LOOP_INVALID_INPUT','Use a run reference only.');
    const runId=uuid((body as {runId?:unknown}).runId,'Run ID');const admin=adminClient();const repo=new LoopRepository(admin);const env=await configuredLoopEnv(admin,baseEnv);
    const work=processLoopPhase(repo,runId,env).then(async again=>{if(again)await dispatchWorker(runId,env);}).catch(error=>{console.error('job_loop_worker_stage_failed',{type:error instanceof Error?error.name:'Error'});});
    EdgeRuntime.waitUntil(work);return new Response(JSON.stringify({accepted:true}),{status:202,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch(error){return new Response(JSON.stringify({error:error instanceof ApiError?error.message:'The worker request failed.',code:error instanceof ApiError?error.code:'LOOP_WORKER_ERROR'}),{status:error instanceof ApiError?error.status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
});
