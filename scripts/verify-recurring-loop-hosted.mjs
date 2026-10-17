/** Authorized hosted verification using new synthetic accounts only.
 * Public configuration is read locally. Credentials exist only in process memory.
 * No funded providers, OAuth grants, messages, application submissions or Auth deletion.
 * Run with --execute only after deployment. A stdin gate lets the operator make
 * this freshly created QA schedule due using authenticated database tools. */
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { unzipSync, strFromU8 } from 'fflate';

const PROJECT = 'gvftdfriujrkpptdueyb';
const ORIGIN = 'https://jobvance.io';
const API = `https://${PROJECT}.supabase.co`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULES = { provider: 'rules', model: 'grounded-rules-v1', modelConsent: false, inboxConsent: false };
const actors = [];
const report = { kind: 'hosted-integrated-job-loop-synthetic-qa', startedAt: new Date().toISOString(), status: 'prepared',
  accountsCreated: 0, paidCalls: 0, sentMessages: 0, applicationSubmissions: 0, authAccountsDeleted: 0,
  syntheticLoopsErased: 0, credentialsPrintedOrSaved: false, signedLinksPrintedOrSaved: false, checks: [] };
class Stop extends Error { constructor(check, status = null, code = null) { super(check); this.check = check; this.status = status; this.code = code; } }
const check = (truth, name) => { if (!truth) throw new Stop(name); report.checks.push({ name, passed: true }); };
const safeCode = value => typeof value === 'string' && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let publicKey = '', tag = '';

async function readPublicConfiguration() {
  const source = await readFile(new URL('../.env.production', import.meta.url), 'utf8');
  if (source.length > 20000) throw new Stop('local-public-config-size');
  const values = new Map(source.split(/\r?\n/).flatMap(line => {
    const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/.exec(line);
    return match ? [[match[1], match[2].trim()]] : [];
  }));
  publicKey = values.get('VITE_SUPABASE_PUBLISHABLE_KEY');
  let anon; try { anon = JSON.parse(Buffer.from(publicKey?.split('.')[1] ?? '', 'base64url').toString()); } catch { anon = null; }
  const publicShape = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publicKey ?? '') || anon?.role === 'anon' && anon?.ref === PROJECT;
  check(values.get('VITE_SUPABASE_URL')?.replace(/\/$/, '') === API && publicShape, 'local-public-key-is-project-bound-and-not-privileged');
}

async function boundedJson(response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 2500000) throw new Stop('bounded-json-header');
  const text = await response.text(); if (Buffer.byteLength(text) > 2500000) throw new Stop('bounded-json-body');
  try { return JSON.parse(text); } catch { return null; }
}
async function api(path, actor, body, method = 'POST') {
  const url = new URL(path, API);
  const allowed = /^\/(?:auth\/v1\/(?:settings|signup|user)|functions\/v1\/(?:job-loop-control|job-loop-worker|get-entitlement)|rest\/v1\/(?:job_loop_packets|job_loop_runs|job_loop_records|job_loop_budget_months|job_loop_connections|job_loop_schedules|job_loop_activity|job_loop_support_requests))$/;
  if (url.origin !== API || !allowed.test(url.pathname) || !['POST', 'GET'].includes(method)) throw new Stop('fixed-first-party-request-scope');
  const response = await fetch(url, { method, headers: { apikey: publicKey, Origin: ORIGIN, 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(25000) });
  return { response, body: await boundedJson(response) };
}
const allowedActions = new Set(['get','save_cv_variant','read_cv_variants','save_cv_variant_fact','read_cv_variant_facts','start_selected_run','save_profile','save_claim','suggest_claims','withdraw_claim','add_opportunity','update_opportunity','start_run','approve_packet','preview_packet','download','save_schedule','pause_schedule','cancel_schedule','request_support','erase_loop']);
async function control(actor, action) {
  if (!actors.includes(actor) || !allowedActions.has(action.action)) throw new Stop('new-synthetic-owner-and-safe-actions-only');
  if (['start_run','save_schedule'].includes(action.action)) {
    const preparation = action.action === 'start_run' ? action : action.schedule;
    if (preparation.provider !== RULES.provider && !(process.argv.includes('--allow-bounded-ai')&&action.action==='save_schedule'&&preparation.provider==='openai'&&preparation.model==='gpt-6.1-sol'&&preparation.processingRoute==='openrouter'&&preparation.modelConsent===true&&preparation.inboxConsent===false)) throw new Stop('unapproved-provider-route');
  }
  const result = await api('/functions/v1/job-loop-control', actor, {...action,...(Number.isSafeInteger(actor.generation)&&['start_run','start_selected_run','save_cv_variant','read_cv_variants','save_cv_variant_fact','read_cv_variant_facts','save_schedule','pause_schedule','cancel_schedule'].includes(action.action)?{expectedGeneration:actor.generation}:{})});
  if (!result.response.ok) throw new Stop(`control-${action.action}`, result.response.status, safeCode(result.body?.code));
  return result.body;
}
async function signup(suffix) {
  const result = await api('/auth/v1/signup', null, { email: `jobvance-integrated-qa-${tag}-${suffix}@example.com`,
    password: `Aa1!${randomBytes(32).toString('base64url')}`, data: { qa_fixture: true, qa_run_id: tag } });
  if (!result.response.ok || !UUID.test(result.body?.user?.id ?? '') || !result.body?.access_token) throw new Stop('fresh-synthetic-signup', result.response.status, safeCode(result.body?.code));
  const actor = { id: result.body.user.id, token: result.body.access_token };
  actors.push(actor); report.accountsCreated++;
  const identity = await api('/auth/v1/user', actor, undefined, 'GET');
  check(identity.response.ok && identity.body?.id === actor.id && identity.body?.user_metadata?.qa_fixture === true && identity.body?.user_metadata?.qa_run_id === tag, `fresh-${suffix}-identity-is-own-synthetic-account`);
  return actor;
}
function requireRulesOnlyTestConfiguration(snapshot) {
  check(snapshot.capabilities?.cloudWorker === true && snapshot.capabilities?.rulesEngine === true, 'cloud-worker-and-source-rules-available');
  check(snapshot.capabilities?.monthlyUsageCapUsd === 50 && snapshot.capabilities?.packetsPerRun === 2, 'fifty-dollar-shared-cap-and-two-packets-per-run-reported');
  check(snapshot.budget?.capUsd === 50 && snapshot.budget?.scope === 'shared_ai_search' && snapshot.budget?.maxPilotUsers === 10 && snapshot.pilot?.maxUsers === 10 && snapshot.pilot.activeUsers <= 10, 'ten-user-shared-budget-is-reported-without-client-override');
  check(!snapshot.capabilities.webSearch && !snapshot.capabilities.gmailRead && !snapshot.capabilities.gmailDrafts, 'paid-search-and-mail-integrations-remain-disabled');
  // Live model availability is separate from this explicitly rules-only test.
  // finishRun checks the actual provider/model and both zero usage/reservation.
  check(snapshot.capabilities.scheduler === true, 'cloud-scheduler-reports-ready');
}
async function finishRun(actor, runId, idleFirst = true) {
  // No polling or continuation during this interval: processing must run itself.
  if (idleFirst) await wait(12000);
  let snapshot;
  for (let attempt = 0; attempt < 20; attempt++) {
    snapshot = (await control(actor, { action: 'get' })).snapshot;
    const run = snapshot.runs.find(value => value.id === runId);
    if (run && ['completed','partial','blocked','failed','cancelled'].includes(run.status)) {
      check(['completed','partial'].includes(run.status), 'cloud-run-reaches-an-observable-completion-state');
      if(run.provider==='rules')check(run.usageUsd===0&&run.reservedUsd===0,'rules-run-incurs-no-funded-provider-usage');else{check(process.argv.includes('--allow-bounded-ai')&&run.provider==='openai'&&run.model==='gpt-6.1-sol'&&run.usageUsd<=0.10&&run.reservedUsd===0,'bounded-ai-usage-settled');report.aiUsageUsd=run.usageUsd;report.paidCalls=run.opportunityIds.length;}
      return snapshot;
    }
    if (attempt < 19) await wait(3000);
  }
  throw new Stop('cloud-run-completion-timeout');
}
async function artifact(actor, packet, format, preview = false) {
  const link = await control(actor, preview ? { action: 'preview_packet', packetId: packet.id, inputHash: packet.inputHash } : { action: 'download', packetId: packet.id, format });
  const url = new URL(link.url), path = decodeURIComponent(url.pathname), expected = `/storage/v1/object/sign/job-loop-artifacts/${actor.id}/${packet.id}/${packet.artifacts[format]?.sha256}/${format}`;
  check(url.origin === API && path === expected && !url.username && !url.password && !url.hash, `private-exact-manifest-${preview ? 'preview' : format}-link`);
  const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000) });
  if (Number(response.headers.get('content-length') || 0) > 5 * 1024 * 1024) throw new Stop('bounded-artifact-header');
  const bytes = new Uint8Array(await response.arrayBuffer());
  check(response.ok && bytes.byteLength > 0 && bytes.byteLength <= 5 * 1024 * 1024 && sha(bytes) === packet.artifacts[format].sha256, `hosted-${preview ? 'preview' : format}-bytes-match-manifest`);
  return bytes;
}
async function waitForOperatorDispatch(actor, snapshot) {
  process.stdout.write(JSON.stringify({ stage: 'waiting-dispatch', qaRunId: tag, qaOwnerId: actor.id,
    scheduleVersion: snapshot.schedule.version, initialNextRunAt: snapshot.schedule.nextRunAt,
    command: `dispatch-ready ${tag}`, checksCompleted: report.checks.length }) + '\n');
  const input = createInterface({ input: process.stdin, terminal: false });
  let timeout;
  try {
    const line = await Promise.race([input.question(''), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Stop('operator-dispatch-gate-timeout')), 15 * 60 * 1000); })]);
    if (line.trim() !== `dispatch-ready ${tag}`) throw new Stop('operator-dispatch-gate-not-resumed');
  } finally { clearTimeout(timeout); input.close(); }
  const initialRunIds = new Set(snapshot.runs.map(run => run.id));
  let dispatched;
  for (let attempt = 0; attempt < 30; attempt++) {
    const fresh = (await control(actor, { action: 'get' })).snapshot;
    if (fresh.schedule?.lastRunId && !initialRunIds.has(fresh.schedule.lastRunId) && Date.parse(fresh.schedule.nextRunAt) > Date.now()) { dispatched = fresh; break; }
    if (attempt < 29) await wait(3000);
  }
  check(!!dispatched, 'operator-made-qa-schedule-dispatches-through-cloud-service');
  check(dispatched.schedule.status === 'active' && Number.isFinite(Date.parse(dispatched.schedule.nextRunAt)) && Date.parse(dispatched.schedule.nextRunAt) > Date.now(), 'scheduled-dispatch-advances-real-next-run');
  const finished = await finishRun(actor, dispatched.schedule.lastRunId, false);
  check(finished.activity.some(event => event.actor === 'jobvance' && event.runId === finished.schedule.lastRunId), 'scheduled-progress-has-jobvance-actor-history');
  return finished;
}


async function main(){
 await readPublicConfiguration(); if(!process.argv.includes('--execute'))return;
 tag=randomBytes(8).toString('hex');report.qaRunId=tag;report.kind='recurring-loop-hosted';
 const settings=await api('/auth/v1/settings',null,undefined,'GET');
 check(settings.body?.mailer_autoconfirm===true,'signup-does-not-send-confirmation-mail');
 const actor=await signup('recurring');report.ownerId=actor.id;
 let s=(await control(actor,{action:'get'})).snapshot;actor.generation=s.lifecycleGeneration;
 check(s.capabilities.cvVariants===true,'variant-authority-deployed');
 check(s.pilot.enrolled||s.pilot.activeUsers<10,'pilot-capacity-available');
 report.models=s.models.map(m=>({provider:m.provider,model:m.model,ready:m.ready,transport:m.transport}));
 const passage='Helped prepare an operations tracker covering six workstreams.';
 const variants=[];
 for(let i=0;i<3;i++){
 s=(await control(actor,{action:'get'})).snapshot;
 const profile={audience:'professional',name:'Alex Example '+i,contactLine:'',targetTitles:['Operations Analyst'],locations:['Remote'],experienceYears:null,languages:['English'],pageTarget:1,discreetSearch:true,sourceText:'Alex Example '+i+'\nWORK EXPERIENCE\nExample Group\n'+passage,excludedTerms:[],compensation:{currency:'',period:'monthly',minimum:null}};
 const saved=await control(actor,{action:'save_cv_variant',expectedVersion:s.recordVersion,requestId:randomUUID(),variantId:null,expectedVariantRevision:0,label:'Hosted QA CV '+i,profile,claimRefs:[],saveConsent:true});
 const v=saved.variantSave?.variant??saved.cvVariantSave?.variant;
 check(!!v,'saved-variant-'+i);
 s=(await control(actor,{action:'get'})).snapshot;
 const receipt=await control(actor,{action:'save_cv_variant_fact',expectedVersion:s.recordVersion,requestId:randomUUID(),variantId:v.id,expectedVariantRevision:v.revision,sourceHash:v.sourceHash,factId:null,expectedFactRevision:0,claim:{sourceKind:'cv_passage',sourceQuote:passage,phrasing:passage,context:'Example Group',kind:'employment',resultStatus:'not_measured',confirmed:true,shareable:true},saveConsent:true});
 const f=receipt.variantFactSave.fact;
 variants.push({variantId:v.id,variantRevision:v.revision,sourceHash:v.sourceHash,factRefs:[{id:f.id,revision:f.revision}]});
 }
 for(let i=0;i<2;i++){
 s=(await control(actor,{action:'get'})).snapshot;
 s=(await control(actor,{action:'add_opportunity',expectedVersion:s.recordVersion,opportunity:{title:'Operations Analyst',company:'Example QA Employer '+i,location:'Remote',url:'https://example.com/jobvance-recurring/'+tag+'/'+i,description:'Prepare operations trackers and document reporting assumptions for workstreams. VacancyOnlySentinel is not candidate experience. This is an isolated verification vacancy.',contact:null}})).snapshot;
 const job=s.opportunities.find(x=>x.company==='Example QA Employer '+i);
 const r=await control(actor,{action:'start_selected_run',expectedVersion:s.recordVersion,requestId:randomUUID(),opportunityIds:[job.id],prepareConsent:true,cvSelection:variants[i],provider:RULES.provider,model:RULES.model,modelConsent:false});
 s=await finishRun(actor,r.runId);const p=s.packets.find(p=>p.runId===r.runId);
 check(p?.cvSelection?.variantId===variants[i].variantId,'exact-hosted-variant-'+i);
 await control(actor,{action:'approve_packet',packetId:p.id,inputHash:p.inputHash,reviewedText:p.cvText,confirmFacts:true,confirmDisclosure:true});
 for(const format of ['pdf','docx','txt']){const b=await artifact(actor,p,format);if(format==='txt')check(new TextDecoder().decode(b).includes(passage),'hosted-txt-source-'+i);if(format==='docx')check(strFromU8(unzipSync(b)['word/document.xml']).includes('six workstreams'),'hosted-docx-source-'+i);if(format==='pdf')check(new TextDecoder().decode(b.slice(0,5))==='%PDF-','hosted-pdf-header-'+i);}
 }
 const method=process.argv.includes('--allow-bounded-ai')?{provider:'openai',model:'gpt-6.1-sol',processingRoute:'openrouter',modelConsent:true,inboxConsent:false}:RULES;
 check(!process.argv.includes('--allow-bounded-ai')||s.models.some(m=>m.provider===method.provider&&m.model===method.model&&m.transport===method.processingRoute&&m.ready),'chosen-recurring-model-ready');
 for(const cadence of ['weekly','three_weekly','daily']){
 s=(await control(actor,{action:'get'})).snapshot;
 s=(await control(actor,{action:'save_schedule',expectedScheduleVersion:s.schedule?.version??0,recurringConsent:true,schedule:{cadence,timezone:'America/New_York',localTime:'08:00',weeklyDay:cadence==='weekly'?1:null,...(cadence==='three_weekly'?{weeklyDays:[1,3,5]}:{}),cvSelection:variants[2],...method,...(method.provider!=='rules'?{recurringAiConsent:{provider:method.provider,model:method.model,processingRoute:method.processingRoute,sourceScope:'selected_cv',cvSelection:variants[2],consented:true}}:{})}})).snapshot;
 check(s.schedule.settings?.cadence===cadence||s.schedule.cadence===cadence,'hosted-'+cadence+'-schedule');
 }
 s=await waitForOperatorDispatch(actor,s);
 check(s.runs.find(r=>r.id===s.schedule.lastRunId)?.cvSelection?.variantId===variants[2].variantId||s.packets.some(p=>p.runId===s.schedule.lastRunId&&p.cvSelection?.variantId===variants[2].variantId),'scheduled-third-CV');
 const third=s.packets.find(p=>p.runId===s.schedule.lastRunId);check(!!third,'scheduled-output-ready');await control(actor,{action:'approve_packet',packetId:third.id,inputHash:third.inputHash,reviewedText:third.cvText,confirmFacts:true,confirmDisclosure:true});for(const format of ['pdf','docx','txt'])await artifact(actor,third,format);report.status='passed';
}
try{await main();}catch(e){report.status='stopped';report.failure=e instanceof Stop?{check:e.check,httpStatus:e.status,code:e.code}:{type:e.name,message:e.message?.slice(0,150)};}
finally{for(const a of actors){try{const s=(await control(a,{action:'get'})).snapshot;if(s.schedule?.status==='active')await control(a,{action:'cancel_schedule',expectedScheduleVersion:s.schedule.version});}catch{report.cleanupFailure='synthetic-schedule-cancel-not-confirmed';}}report.finishedAt=new Date().toISOString();await writeFile('../jobvance-repair-evidence/recurring-hosted-'+tag+'.json',JSON.stringify(report,null,2));process.stdout.write(JSON.stringify(report,null,2)+'\n');}
if(report.status!=='passed')process.exitCode=1;
