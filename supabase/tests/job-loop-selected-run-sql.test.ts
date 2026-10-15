// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { checkLoopSchema } from './fixtures/check-loop-schema.mjs';
let db:PGlite,owner:string,other:string,ids:string[],version:number,generation:number;
const hash='a'.repeat(64), consents={model:false,inbox:false};
const query=(sql:string,args:unknown[]=[])=>db.query<Record<string,any>>(sql,args);
async function record(){return (await query('SELECT * FROM job_loop_records WHERE user_id=$1',[owner])).rows[0];}
async function start(selected:unknown=ids.slice(2),request=randomUUID(),overrides:Record<string,unknown>={}){
  await db.exec('SET ROLE service_role');
  try{return (await query('SELECT job_loop_start_selected_run_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[]) result',[owner,generation,request,hash,hash,version,'rules','grounded-rules-v1',consents,selected].map((v,i)=>String(i) in overrides?overrides[String(i)]:v))).rows[0].result;}
  finally{await db.exec('RESET ROLE');}
}
beforeAll(async()=>{db=new PGlite();await db.exec(await checkLoopSchema());await db.exec(await readFile(new URL('../migrations/20261015223000_job_loop_selected_preparation.sql',import.meta.url),'utf8'));},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec('RESET ROLE; TRUNCATE auth.users CASCADE; TRUNCATE job_loop_budget_months CASCADE;');
  owner=randomUUID();other=randomUUID();ids=[randomUUID(),randomUUID(),randomUUID()];
  await query('INSERT INTO auth.users(id) VALUES($1),($2)',[owner,other]);
  const opened=(await query('SELECT job_loop_open_record($1) result',[owner])).rows[0].result;generation=opened.lifecycle_generation;
  const data={profile:{name:'Created candidate',revision:1},claims:[],inbox:[],opportunities:ids.map((id,i)=>({id,title:`Created role ${i}`,company:'Created employer',description:'Created vacancy '.repeat(10),url:`https://example.invalid/${i}`,status:'saved',verification:'user_provided',source:'manual',sourceKey:`manual:${id}`,contact:null}))};
  version=(await query('SELECT job_loop_write_record($1,$2,$3,true) result',[owner,opened.version,data])).rows[0].result.version;
});
describe('isolated selected-vacancy admission SQL (not deployed)',()=>{
  it('selects the third vacancy first and captures its exact owned source snapshot',async()=>{
    const before=await record(),run=await start();
    expect(run.selected_opportunity_ids).toEqual([ids[2]]);expect(run.snapshot).toEqual(before.data);
    expect(run.selected_generation).toBe(generation);expect(run.input_version).toBe(before.input_version);
    expect(await record()).toEqual(before);
  });
  it('preserves explicit order and idempotent retry after later progress without a second run',async()=>{
    const request=randomUUID(),first=await start([ids[2],ids[0]],request);
    await query("UPDATE job_loop_records SET data=jsonb_set(data,'{opportunities,2,notes}','\"Keep later notes\"') WHERE user_id=$1",[owner]);
    const retry=await start([ids[2],ids[0]],request);expect(retry).toEqual(first);
    expect((await query('SELECT * FROM job_loop_runs')).rows).toHaveLength(1);
    expect((await record()).data.opportunities[2].notes).toBe('Keep later notes');
  });
  it.each([null,[],[null]])('rejects malformed/empty selection %j',async selected=>{await expect(start(selected)).rejects.toThrow('LOOP_SELECTION_INVALID');expect((await query('SELECT * FROM job_loop_runs')).rows).toHaveLength(0);});
  it('rejects duplicates and more than two vacancies',async()=>{await expect(start([ids[0],ids[0]])).rejects.toThrow('LOOP_SELECTION_INVALID');await expect(start(ids)).rejects.toThrow('LOOP_SELECTION_INVALID');});
  it('rejects foreign or absent IDs without copying a foreign record',async()=>{await expect(start([randomUUID()])).rejects.toThrow('LOOP_SELECTION_UNAVAILABLE');});
  it('rejects duplicate source IDs instead of choosing an arbitrary source',async()=>{const r=await record();r.data.opportunities.push(r.data.opportunities[2]);await query('UPDATE job_loop_records SET data=$2 WHERE user_id=$1',[owner,r.data]);await expect(start()).rejects.toThrow('LOOP_SELECTION_UNAVAILABLE');});
  it.each(['applied','interview','withdrawn','closed'])('rejects unavailable status %s',async status=>{
    const r=await record();if(status==='closed')r.data.opportunities[2].verification='closed_confirmed';else r.data.opportunities[2].status=status;
    await query('UPDATE job_loop_records SET data=$2 WHERE user_id=$1',[owner,r.data]);await expect(start()).rejects.toThrow('LOOP_SELECTION_UNAVAILABLE');
  });
  it('rejects stale generation/version and retains the disabled collection configuration',async()=>{
    await expect(start(undefined,randomUUID(),{1:generation+1})).rejects.toThrow('LOOP_REQUEST_STALE');
    await expect(start(undefined,randomUUID(),{5:version-1})).rejects.toThrow('LOOP_VERSION_CONFLICT');
    expect((await query('SELECT enabled FROM job_loop_gc_config')).rows[0]).toMatchObject({enabled:false});
  });
  it.each([{model:false,inbox:true},{model:false,inbox:false,scheduled:true}])('rejects inbox/recurring expansion %j',async choices=>{await expect(start(undefined,randomUUID(),{8:choices})).rejects.toThrow('LOOP_SELECTION_INVALID');});
  it('binds the request ID to selection order, hash and processing consent',async()=>{
    const request=randomUUID();await start([ids[2],ids[0]],request);
    for(const selected of [[ids[0],ids[2]],[ids[2]]])await expect(start(selected,request)).rejects.toThrow('LOOP_REQUEST_CONFLICT');
    await expect(start([ids[2],ids[0]],request,{3:'b'.repeat(64)})).rejects.toThrow('LOOP_REQUEST_CONFLICT');
    await expect(start([ids[2],ids[0]],request,{8:{model:true,inbox:false}})).rejects.toThrow('LOOP_REQUEST_CONFLICT');
  });
  it('keeps normal and selected requests distinct with no legacy adoption',async()=>{
    const request=randomUUID();await query('SELECT job_loop_start_run_bound($1,$2,$3,$4,$5,$6,$7,$8,$9)',[owner,generation,request,hash,hash,version,'rules','grounded-rules-v1',consents]);
    await expect(start(undefined,request)).rejects.toThrow('LOOP_REQUEST_CONFLICT');
    expect((await query('SELECT selected_opportunity_ids FROM job_loop_runs')).rows[0].selected_opportunity_ids).toBeNull();
  });
  it('preserves existing active-run and three-per-day limits without reserving or settling spending',async()=>{
    await start();await expect(start([ids[0]])).rejects.toThrow('LOOP_ACTIVE_RUN');
    for(let i=0;i<2;i++){await query("UPDATE job_loop_runs SET status='cancelled'");await start([ids[i]]);}
    await query("UPDATE job_loop_runs SET status='cancelled'");await expect(start()).rejects.toThrow('LOOP_DAILY_LIMIT');
    expect((await query('SELECT * FROM job_loop_usage')).rows).toHaveLength(0);
  });
  it.each(['anon','authenticated'])('denies %s RPC and direct selection writes',async role=>{
    const run=await start();await db.exec(`SET ROLE ${role}`);
    try{await expect(query('SELECT job_loop_start_selected_run_bound($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[])',[owner,generation,randomUUID(),hash,hash,version,'rules','grounded-rules-v1',consents,[ids[2]]])).rejects.toThrow(/permission denied/);
      await expect(query('UPDATE job_loop_runs SET selected_opportunity_ids=$2 WHERE id=$1',[run.id,[ids[0]]])).rejects.toThrow(/permission denied/);
    }finally{await db.exec('RESET ROLE');}
  });
});
