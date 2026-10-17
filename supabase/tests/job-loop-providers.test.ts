// @vitest-environment node
import { describe,it,expect,vi } from 'vitest';
import { modelOptions,prepareModelRequest,callModel,searchTavily,readEmployerFeed,employerFeeds,safePublicUrl,UncertainProviderCall,digest } from '../functions/_shared/job-loop-providers.ts';
import { encryptJson,decryptJson,callbackUrl,returnUrl,gmailConfigured,completeGmail,previewGmailTicket } from '../functions/job-loop-oauth/gmail.ts';
import { authenticateWorker,selectPreparationOpportunities,validateControlInput,controlLoop,packetInputHash } from '../functions/_shared/job-loop-runtime.ts';
import { LoopRepository,type LoopAdmin,type RunRow } from '../functions/_shared/job-loop-repository.ts';
import type { LoopClaim,LoopOpportunity,LoopProfile } from '../functions/_shared/job-loop-types.ts';
const env=(values:Record<string,string>={})=>(name:string)=>values[name];
const configured=env({JOB_LOOP_PAID_APIS_ENABLED:'true',JOB_LOOP_ANTHROPIC_API_KEY:'fixture-only',OPENAI_API_KEY:'fixture-only',JOB_LOOP_MOONSHOT_API_KEY:'fixture-only',JOB_LOOP_MOONSHOT_INPUT_USD_PER_MILLION:'0.6',JOB_LOOP_MOONSHOT_OUTPUT_USD_PER_MILLION:'2.5',JOB_LOOP_TAVILY_API_KEY:'fixture-only'});
const profile:LoopProfile={audience:'student',name:'Fictional candidate',contactLine:'Private contact not for models',targetTitles:['Graduate analyst'],locations:['Dubai'],experienceYears:null,languages:[],pageTarget:1,discreetSearch:false,sourceText:'Academic project\nPrepared a coursework report about fictional retail operations.\nUnreleased private source detail.',excludedTerms:['Unreleased'],compensation:{currency:'',period:'monthly',minimum:null},revision:1,updatedAt:'2026-10-11T00:00:00Z'};
const claim:LoopClaim={id:'claim-one',revision:1,status:'active',createdAt:profile.updatedAt,sourceKind:'cv_passage',sourceQuote:'Prepared a coursework report about fictional retail operations.',phrasing:'Prepared a coursework report about fictional retail operations.',context:'Academic project',kind:'academic_project',resultStatus:'not_measured',confirmed:true,shareable:true};
const opportunity:LoopOpportunity={id:'00000000-0000-4000-8000-000000000010',source:'manual',sourceKey:'manual:one',checkedAt:profile.updatedAt,verification:'user_provided',title:'Unrelated desired graduate position',company:'Fictional employer',location:'',url:'https://careers.example.com/job/one',description:'A graduate position with a different domain and requirements that have not appeared in the supplied academic record.',contact:null,status:'saved',followUpAt:null,notes:''};
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

describe('server-only provider contracts',()=>{
  it('keeps all paid models disabled by default and freezes allowlisted choices',()=>{
    expect(modelOptions(env({OPENAI_API_KEY:'fixture-only'})).every(model=>!model.ready)).toBe(true);
    expect(()=>prepareModelRequest('openai','unlisted-model',configured,opportunity,[claim])).toThrow(/not configured/);
    expect(modelOptions(configured).find(model=>model.model==='gpt-6.1-sol')?.ready).toBe(true);
    expect(modelOptions(env({JOB_LOOP_PAID_APIS_ENABLED:'true',JOB_LOOP_MOONSHOT_API_KEY:'fixture-only'})).find(model=>model.provider==='moonshot')?.ready).toBe(false);
    expect(modelOptions(env({JOB_LOOP_PAID_APIS_ENABLED:'true',JOB_LOOP_MOONSHOT_API_KEY:'fixture-only',JOB_LOOP_MOONSHOT_INPUT_USD_PER_MILLION:'NaN',JOB_LOOP_MOONSHOT_OUTPUT_USD_PER_MILLION:'-1'})).find(model=>model.provider==='moonshot')?.ready).toBe(false);
    expect(modelOptions(env({JOB_LOOP_PAID_APIS_ENABLED:'true',JOB_LOOP_MOONSHOT_API_KEY:'fixture-only',JOB_LOOP_MOONSHOT_INPUT_USD_PER_MILLION:'0',JOB_LOOP_MOONSHOT_OUTPUT_USD_PER_MILLION:'0'})).find(model=>model.provider==='moonshot')?.ready).toBe(false);
  });
  it('sends only eligible claim excerpts and vacancy, not the source record/contact or unconfirmed facts',()=>{
    const request=prepareModelRequest('openai','gpt-6.1-sol',configured,opportunity,[claim,{...claim,id:'private',phrasing:'Hidden private fact',shareable:false}]);
    const body=JSON.stringify(request.body);expect(body).toContain(claim.phrasing);expect(body).not.toContain('Unreleased private source detail');expect(body).not.toContain(profile.contactLine);expect(body).not.toContain('Hidden private fact');expect(request.reservedMicros).toBeGreaterThan(12000);expect(request.endpoint).toBe('https://api.openai.com/v1/responses');
  });
  it.each(['anthropic','openai','moonshot'] as const)('validates %s output and uses actual token usage',async provider=>{
    const model=provider==='anthropic'?'claude-sonnet-5-5':provider==='openai'?'gpt-6.1-sol':'kimi-k2.6';const request=prepareModelRequest(provider,model,configured,opportunity,[claim]);
    const data=provider==='anthropic'?{usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:'{"claimIds":["claim-one"]}'}]}:provider==='openai'?{usage:{input_tokens:100,output_tokens:20},output:[{content:[{type:'output_text',text:'{"claimIds":["claim-one"]}'}]}]}:{usage:{prompt_tokens:100,completion_tokens:20},choices:[{message:{content:'{"claimIds":["claim-one"]}'}}]};
    const fetcher=vi.fn(async()=>json(data));const result=await callModel(request,fetcher);expect(result.claimIds).toEqual(['claim-one']);expect(result.actualMicros).toBe(Math.ceil(100*request.option.inputUsdPerMillion+20*request.option.outputUsdPerMillion));expect(fetcher).toHaveBeenCalledTimes(1);
    if(provider==='moonshot'){expect(request.body).toMatchObject({thinking:{type:'disabled'}});expect(request.body).not.toHaveProperty('temperature');}
  });
  it('rejects fabricated IDs/prose while retaining known billed usage',async()=>{
    const request=prepareModelRequest('openai','gpt-6.1-sol',configured,opportunity,[claim]);const result=await callModel(request,async()=>json({usage:{input_tokens:100,output_tokens:20},output_text:'{"claimIds":["made-up"],"cvText":"invented"}'}));expect(result.error).toMatch(/unusable/);expect(result.claimIds).toEqual([]);expect(result.actualMicros).toBe(400);
  });
  it('treats timeout or missing usage as uncertain, without silent model retry',async()=>{
    const request=prepareModelRequest('openai','gpt-6.1-sol',configured,opportunity,[claim]);const failed=vi.fn(async()=>{throw new Error('network');});await expect(callModel(request,failed)).rejects.toBeInstanceOf(UncertainProviderCall);expect(failed).toHaveBeenCalledTimes(1);
    await expect(callModel(request,async()=>json({output_text:'{"claimIds":[]}'}))).rejects.toBeInstanceOf(UncertainProviderCall);
  });
  it('uses three-query-compatible fixed basic search endpoint and reported credit cost',async()=>{
    const fetcher=vi.fn(async(_input:Request|string|URL,init?:RequestInit)=>{expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-only');expect(JSON.parse(String(init?.body))).not.toHaveProperty('api_key');return json({usage:{credits:1},results:[{title:'Graduate analyst',url:'https://careers.example.com/one?utm_source=fixture',content:'Role description '.repeat(10)},{title:'Unsafe',url:'https://127.0.0.1/secret',content:'private'}]});});
    const result=await searchTavily('graduate analyst jobs',configured,fetcher);expect(result.actualMicros).toBe(8000);expect(result.results).toHaveLength(1);expect(result.results[0].url).toBe('https://careers.example.com/one');expect(fetcher.mock.calls[0][0]).toBe('https://api.tavily.com/search');
    await expect(searchTavily('anything',env(),fetcher)).rejects.toThrow(/not configured/);expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('requires actual listing records, bounds body reads, and never fetches returned job URLs',async()=>{
    const fetcher=vi.fn(async()=>json({jobs:[{id:12,title:'Graduate analyst',absolute_url:'https://careers.example.com/12',content:'<p>Academic project analysis and careful coursework reporting.</p>'.repeat(3)}]}));const result=await readEmployerFeed({provider:'greenhouse',board:'fictional',company:'Fictional employer'},fetcher);expect(result.opportunities[0].verification).toBe('listed_on_source');expect(result.opportunities[0].company).toBe('Fictional employer');expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(readEmployerFeed({provider:'greenhouse',board:'fictional'},async()=>json({success:true}))).rejects.toThrow(/published job listing/);
    await expect(readEmployerFeed({provider:'lever',board:'../private'},fetcher)).rejects.toThrow(/Invalid employer/);
    await expect(readEmployerFeed({provider:'lever',board:'fictional'},async()=>new Response('['+' '.repeat(5000001)+']'))).rejects.toBeInstanceOf(UncertainProviderCall);
  });
  it('allows only server-configured public feed identifiers and blocks unsafe URLs',()=>{
    expect(employerFeeds(env({JOB_LOOP_EMPLOYER_FEEDS:'[{"provider":"greenhouse","board":"../../private"}]'}))).toEqual([]);
    for(const url of ['http://careers.example.com','https://10.0.0.1','https://user:password@careers.example.com','https://metadata.internal','https://[::1]/'])expect(safePublicUrl(url)).toBeNull();
  });
});

describe('cloud runtime/privacy boundaries',()=>{
  it('prepares an explicitly selected manual vacancy even below the suggestion score floor',()=>{
    const selected=selectPreparationOpportunities(profile,[claim],[opportunity,{...opportunity,id:'auto',source:'web_search',sourceKey:'search:auto'}]);expect(selected.map(item=>item.id)).toEqual([opportunity.id]);
  });
  it('prioritizes unprepared manual work and rejects privileged/action additions',()=>{
    const second={...opportunity,id:'second',sourceKey:'manual:second',status:'prepared' as const};expect(selectPreparationOpportunities(profile,[claim],[second,opportunity])[0].id).toBe(opportunity.id);
    expect(()=>validateControlInput({action:'get',userId:'forged'})).toThrow(/privileged/);expect(()=>validateControlInput({action:'send_email'})).toThrow(/unavailable/);
  });
  it('requires internal constant-time authentication, not a candidate session or body owner',async()=>{
    const server=env({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-secret'});
    await expect(authenticateWorker(new Request('https://fixture',{headers:{Authorization:'Bearer candidate-session'}}),server)).rejects.toThrow(/unauthorized/);
    await expect(authenticateWorker(new Request('https://fixture',{headers:{'x-job-loop-secret':'fixture-service-secret'}}),server)).resolves.toBeUndefined();
  });
  it('binds encrypted tokens to owner/purpose and uses fixed return/callback routes',async()=>{
    const config=env({JOB_LOOP_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),SUPABASE_URL:'https://fixture.supabase.co',APP_URL:'https://jobvance.io'});const cipher=await encryptJson({refreshToken:'fictional-private-token'},'owner',config);
    expect(cipher).not.toContain('fictional-private-token');expect(await decryptJson(cipher,'owner',config)).toEqual({refreshToken:'fictional-private-token'});await expect(decryptJson(cipher,'other',config)).rejects.toThrow(/could not be opened/);await expect(decryptJson(cipher,'owner',config,'different')).rejects.toThrow(/could not be opened/);
    expect(callbackUrl(config)).toBe('https://fixture.supabase.co/functions/v1/job-loop-oauth');expect(returnUrl(config)).toBe('https://jobvance.io/loop?gmail=connected');expect(gmailConfigured(config)).toBe(false);
  });
  it('stores immutable content-addressed bytes and denies a changed approved manifest',async()=>{
    const blobs=new Map<string,Uint8Array>();const upload=vi.fn(async(path:string,bytes:Uint8Array,options:{upsert:boolean})=>{expect(options.upsert).toBe(false);if(blobs.has(path))return {error:{message:'duplicate'}};blobs.set(path,bytes);return {error:null};});const download=vi.fn(async(path:string)=>({data:blobs.has(path)?new Blob([blobs.get(path)!]):null,error:null}));const signed=vi.fn(async(path:string)=>({data:{signedUrl:`https://storage.example.com/${path}`},error:null}));
    const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{expect(name).toBe('job_loop_authorize_artifact');expect(args.p_lease).toBe('fixture-lease');return {data:`${args.p_user}/${args.p_packet}/${args.p_hash}/${args.p_key}`,error:null};});
    const admin={rpc,storage:{from:()=>({upload,download,createSignedUrl:signed})}} as unknown as LoopAdmin;const repo=new LoopRepository(admin);const a=new TextEncoder().encode('approved original'),b=new TextEncoder().encode('late stale render');
    const active={user_id:'owner',id:'fixture-run',lease_token:'fixture-lease'} as RunRow;
    const first=await repo.upload(active,'packet','txt',a,'text/plain');const stale=await repo.upload(active,'packet','txt',b,'text/plain');expect(first).not.toBe(stale);expect(blobs.get(first)).toEqual(a);expect(rpc).toHaveBeenCalledTimes(2);
    const packet={id:'packet',artifacts:{txt:{path:first,sha256:await digest(a),byteSize:a.length}}} as Parameters<LoopRepository['signedArtifact']>[1];expect(await repo.signedArtifact('owner',packet,'txt')).toContain(first);blobs.set(first,b);await expect(repo.signedArtifact('owner',packet,'txt')).rejects.toThrow(/manifest/);
  });
  it('returns callback-only sealed activation ticket without storing mailbox tokens or pollable pending metadata',async()=>{
    const config=env({JOB_LOOP_GMAIL_ENABLED:'true',JOB_LOOP_GMAIL_CLIENT_ID:'fixture-client',JOB_LOOP_GMAIL_CLIENT_SECRET:'fixture-secret',JOB_LOOP_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),SUPABASE_URL:'https://fixture.supabase.co',APP_URL:'https://jobvance.io'});
    const state='a'.repeat(43),hash=await digest(state);const from=vi.fn(()=>{throw new Error('The callback must not write connections or pending tokens.');});
    const repo={rpc:vi.fn(async()=>({lifecycle_generation:0,user_id:'owner',allow_drafts:false,verifier_ciphertext:await encryptJson({verifier:'fixture-verifier'},'owner',config,`state:${hash}`),expires_at:new Date(Date.now()+600000).toISOString()})),admin:{from}} as unknown as LoopRepository;
    const fetcher=vi.fn(async(input:Request|string|URL)=>String(input)==='https://oauth2.googleapis.com/token'?json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.readonly'}):json({emailAddress:'browser-recipient@example.invalid'}));
    const ticket=await completeGmail(repo,'fixture-code',state,config,fetcher);expect(ticket).not.toContain('fixture-refresh');expect(ticket).not.toContain('browser-recipient');expect(from).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(previewGmailTicket(repo,'different-owner',ticket,config,0)).rejects.toThrow(/signed-in account/);expect(from).not.toHaveBeenCalled();
  });
  it('upgrades a discovered source from reviewed full text under CAS without resetting its application history',async()=>{
    const sourceKey=`url:${await digest(opportunity.url)}`;let row={lifecycle_generation:0,user_id:'owner',version:7,input_version:2,updated_at:profile.updatedAt,data:{profile,claims:[claim],opportunities:[{...opportunity,source:'web_search' as const,sourceKey,verification:'unverified' as const,status:'applied' as const,notes:'User-reported prior application'}],inbox:[]}};
    const write=vi.fn(async(_user:string,expected:number,data:typeof row.data,changed:boolean)=>{expect(expected).toBe(7);expect(changed).toBe(true);row={...row,version:8,input_version:3,data};return row;});
    const repo={assertGeneration:vi.fn(async(user:string,generation:number)=>{expect(user).toBe('owner');expect(generation).toBe(0);}),erasureStatus:vi.fn(async()=>({state:'active',generation:0})),record:vi.fn(async()=>structuredClone(row)),write,collections:vi.fn(async()=>({runs:[],packets:[],usage:[],connection:null})),operationalSnapshot:vi.fn(async()=>({schedule:null,activity:[],support:[],scheduler:{ready:false},budget:{month:'2026-10',capUsd:50,committedUsd:0,remainingUsd:50,enrolled:false,activeUsers:0}}))} as unknown as LoopRepository;
    const {id:_id,source:_source,sourceKey:_key,checkedAt:_at,verification:_verify,status:_status,followUpAt:_follow,notes:_notes,...input}=opportunity;
    await controlLoop(repo,'owner',{action:'add_opportunity',expectedVersion:7,opportunity:{...input,description:'A complete reviewed vacancy description with its specific responsibilities, qualifications and source context. '.repeat(2)}},env());
    expect(row.data.opportunities).toHaveLength(1);expect(row.data.opportunities[0]).toMatchObject({id:opportunity.id,source:'manual',verification:'user_provided',status:'applied',notes:'User-reported prior application'});expect(row.data.opportunities[0].description).toContain('complete reviewed');
  });
  it('binds packet approval to actual role evidence while excluding mutable tracking metadata',async()=>{
    const original=await packetInputHash(profile,[claim],opportunity);expect(await packetInputHash(profile,[claim],{...opportunity,status:'applied',notes:'Updated tracking',followUpAt:'2026-10-15T00:00:00Z',checkedAt:'2026-10-12T00:00:00Z'})).toBe(original);
    expect(await packetInputHash(profile,[claim],{...opportunity,description:opportunity.description+' A new mandatory qualification.'})).not.toBe(original);
    expect(await packetInputHash(profile,[{...claim,revision:2}],opportunity)).not.toBe(original);
  });
});
