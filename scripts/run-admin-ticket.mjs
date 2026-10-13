/** Fixed first-party ticket invocation. Task tickets only enter through hidden TTY input. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXED_ORIGIN = 'https://gvftdfriujrkpptdueyb.supabase.co';
const ACTIONS = ['provider_status','independent_review','admin_commentary'];
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function invalid() { throw new Error('ADMIN_TICKET_RUNNER_REJECTED'); }
export function parseTicketInput(raw) {
  if (typeof raw !== 'string' || raw.length > 200) invalid();
  let item; try { item=JSON.parse(raw); } catch { invalid(); }
  if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length!==2 || !ACTIONS.includes(item.action) || typeof item.ticket!=='string' || !UUID.test(item.ticket)) invalid();
  return {action:item.action,ticket:item.ticket.toLowerCase()};
}
export function parsePublicConfig(source) {
  if (typeof source!=='string' || source.length>20000) invalid();
  const settings=new Map(); for(const line of source.split(/\r?\n/)){const match=/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/.exec(line);if(match){if(settings.has(match[1]))invalid();settings.set(match[1],match[2].trim());}}
  const key=settings.get('VITE_SUPABASE_PUBLISHABLE_KEY');if(settings.get('VITE_SUPABASE_URL')?.replace(/\/$/,'')!==FIXED_ORIGIN || typeof key!=='string' || key.length>10000 || key.startsWith('sb_secret_'))invalid();
  if(!key.startsWith('sb_publishable_')){let claims;try{claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));}catch{invalid();}if(claims?.role!=='anon'||claims?.ref!=='gvftdfriujrkpptdueyb')invalid();}
  return {url:FIXED_ORIGIN,key};
}
export function readHiddenTicket(input=process.stdin,output=process.stdout) {
  if(!input.isTTY || !output.isTTY || typeof input.setRawMode!=='function')invalid();
  output.write('Enter JSON containing action and task ticket (input hidden): ');
  return new Promise((resolveInput,reject)=>{
    const wasRaw=!!input.isRaw;let raw='';
    function finish(error){input.off('data',onData);input.off('end',onEnd);input.setRawMode(wasRaw);input.pause();output.write('\n');if(error)reject(new Error('ADMIN_TICKET_INPUT_REJECTED'));else{try{resolveInput(parseTicketInput(raw));}catch{reject(new Error('ADMIN_TICKET_INPUT_REJECTED'));}}}
    function onEnd(){finish(true);}
    function onData(chunk){for(const character of chunk.toString('utf8')){if(character==='\u0003'){finish(true);return;}if(character==='\r'||character==='\n'){finish(false);return;}if(character==='\u007f'||character==='\b'){raw=raw.slice(0,-1);continue;}if(character<' '||raw.length>=200){finish(true);return;}raw+=character;}}
    input.setRawMode(true);input.resume();input.on('data',onData);input.once('end',onEnd);
  });
}
export function sanitizeWorkerResponse(body,httpStatus) {
  if(!body || typeof body!=='object' || Array.isArray(body))invalid();
  if(body.providerStatus){const p=body.providerStatus;if(typeof p.configured!=='boolean'||![true,false,null].includes(p.valid)||!['not_configured','valid','invalid','unavailable'].includes(p.status)||typeof p.checkedAt!=='string'||!Number.isFinite(Date.parse(p.checkedAt)))invalid();return{httpStatus,providerStatus:{configured:p.configured,valid:p.valid,status:p.status,checkedAt:p.checkedAt}};}
  if(typeof body.accepted==='boolean'&&typeof body.usageId==='string'&&UUID.test(body.usageId)&&['reserved','settled','uncertain'].includes(body.state))return{httpStatus,accepted:body.accepted,usageId:body.usageId,state:body.state,resultAvailable:!!body.result};
  const codes=['ADMIN_TICKET_INVALID','ADMIN_FORBIDDEN','ADMIN_BUDGET_LIMIT','ADMIN_REVIEW_BATCH_LIMIT','ADMIN_REQUEST_CONFLICT','REVIEW_INPUT_INVALID','REVIEW_PERSISTENCE_FAILED','REVIEW_WORKER_ERROR','ROUTER_NOT_CONFIGURED','ROUTER_INPUT_INVALID','ROUTER_INPUT_TOO_LARGE','INVALID_INPUT','METHOD_NOT_ALLOWED'];
  return{httpStatus,code:codes.includes(body.code)?body.code:'ADMIN_TICKET_RUNNER_FAILED'};
}
export async function runAdminTicket(input,config,fetcher=fetch) {
  const bound=parseTicketInput(JSON.stringify(input));if(config?.url!==FIXED_ORIGIN || typeof config.key!=='string')invalid();
  parsePublicConfig('VITE_SUPABASE_URL='+config.url+'\nVITE_SUPABASE_PUBLISHABLE_KEY='+config.key+'\n');
  const response=await fetcher(FIXED_ORIGIN+'/functions/v1/jobvance-review-worker',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key,'x-jobvance-task-ticket':bound.ticket},body:JSON.stringify({action:bound.action}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.body)invalid();const reader=response.body.getReader();let bytes=0;const chunks=[];while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>100000){await reader.cancel();invalid();}chunks.push(Buffer.from(part.value));}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{invalid();}
  return sanitizeWorkerResponse(body,response.status);
}
export async function main() {
  if(process.argv.length!==2)invalid();
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const config=parsePublicConfig(await readFile(resolve(root,'.env.production'),'utf8'));
  const input=await readHiddenTicket();const result=await runAdminTicket(input,config);process.stdout.write(JSON.stringify(result)+'\n');if(result.httpStatus>=400)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('The ticket invocation did not complete. No ticket, credential or raw response was logged.\n');process.exitCode=1;});
