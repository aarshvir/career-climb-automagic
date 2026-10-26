import { ApiError } from '../_shared/core.ts';
import { digest, readBoundedResponseJson, type LoopEnv, type LoopFetch } from '../_shared/job-loop-providers.ts';
import { LoopRepository, loopDatabaseError } from '../_shared/job-loop-repository.ts';
import type { LoopInboxSignal, LoopPacket } from '../_shared/job-loop-types.ts';
import { validLoopGeneration } from '../_shared/job-loop-request.ts';

const READ_SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const DRAFT_SCOPE='https://www.googleapis.com/auth/gmail.compose';
export function gmailConfigured(env: LoopEnv): boolean { return env('JOB_LOOP_GMAIL_ENABLED')==='true' && !!env('JOB_LOOP_GMAIL_CLIENT_ID') && !!env('JOB_LOOP_GMAIL_CLIENT_SECRET') && !!env('JOB_LOOP_TOKEN_ENCRYPTION_KEY') && !!env('SUPABASE_URL') && !!env('APP_URL'); }
export function base64(bytes: Uint8Array): string { let text=''; for(let start=0;start<bytes.length;start+=8192) text+=String.fromCharCode(...bytes.slice(start,start+8192)); return btoa(text); }
const unbase64=(text:string)=>Uint8Array.from(atob(text),char=>char.charCodeAt(0));
const base64url=(bytes:Uint8Array)=>base64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function encryptionKey(env:LoopEnv) {
  try { const bytes=unbase64(env('JOB_LOOP_TOKEN_ENCRYPTION_KEY')??''); if(bytes.length!==32) throw new Error(); return await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']); }
  catch { throw new ApiError(503,'LOOP_GMAIL_NOT_CONFIGURED','The mailbox encryption configuration is unavailable.'); }
}
export async function encryptJson(value:unknown,owner:string,env:LoopEnv,purpose='tokens'):Promise<string> {
  const iv=crypto.getRandomValues(new Uint8Array(12)); const key=await encryptionKey(env);
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`jobvance:gmail:${owner}:${purpose}`)},key,new TextEncoder().encode(JSON.stringify(value)));
  return `v1.${base64(iv)}.${base64(new Uint8Array(data))}`;
}
export async function decryptJson(value:string,owner:string,env:LoopEnv,purpose='tokens'):Promise<Record<string,unknown>> {
  try { const [version,nonce,cipher]=value.split('.'); if(version!=='v1'||!nonce||!cipher) throw new Error();
    const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(nonce),additionalData:new TextEncoder().encode(`jobvance:gmail:${owner}:${purpose}`)},await encryptionKey(env),unbase64(cipher));
    const decoded=JSON.parse(new TextDecoder().decode(data)); if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))throw new Error(); return decoded;
  } catch { throw new ApiError(503,'LOOP_GMAIL_UNAVAILABLE','The stored mailbox connection could not be opened. Reconnect the mailbox.'); }
}
export function callbackUrl(env:LoopEnv):string { const url=new URL('/functions/v1/job-loop-oauth',env('SUPABASE_URL')); if(url.protocol!=='https:')throw new ApiError(503,'LOOP_GMAIL_NOT_CONFIGURED','A secure mailbox callback is required.'); return url.href; }
export function returnUrl(env:LoopEnv,result='connected'):string { const url=new URL('/loop',env('APP_URL')); if(url.protocol!=='https:')throw new ApiError(503,'LOOP_GMAIL_NOT_CONFIGURED','A secure return address is required.'); url.searchParams.set('gmail',result);return url.href; }
export async function beginGmail(repo:LoopRepository,userId:string,allowDrafts:boolean,env:LoopEnv,expectedGeneration:number):Promise<string> {
  if(!gmailConfigured(env))throw new ApiError(503,'LOOP_GMAIL_NOT_CONFIGURED','Mailbox access is not configured. Google sign-in alone does not connect Gmail.');
  const state=base64url(crypto.getRandomValues(new Uint8Array(32))); const hash=await digest(state); const verifier=base64url(crypto.getRandomValues(new Uint8Array(48)));
  const verifierCiphertext=await encryptJson({verifier},userId,env,`state:${hash}`);
  await repo.rpc('job_loop_create_oauth_state',{p_user:userId,p_generation:expectedGeneration,p_hash:hash,p_drafts:allowDrafts,p_verifier_cipher:verifierCiphertext,p_expires:new Date(Date.now()+600000).toISOString()});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [key,value] of Object.entries({client_id:env('JOB_LOOP_GMAIL_CLIENT_ID')!,redirect_uri:callbackUrl(env),response_type:'code',scope:allowDrafts?`${READ_SCOPE} ${DRAFT_SCOPE}`:READ_SCOPE,state,access_type:'offline',prompt:'consent',code_challenge:base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))),code_challenge_method:'S256'}))url.searchParams.set(key,value);
  return url.href;
}
async function googleJson(endpoint:string,init:RequestInit,fetcher:LoopFetch,deadline?:AbortSignal):Promise<Record<string,unknown>> {
  const response=await fetcher(endpoint,{...init,redirect:'error',signal:deadline?AbortSignal.any([deadline,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  if(!response.ok)throw new ApiError(503,'LOOP_GMAIL_UNAVAILABLE','The mailbox request could not be confirmed. Reconnect or retry the read.');
  try {return await readBoundedResponseJson(response,250000);} catch {throw new ApiError(503,'LOOP_GMAIL_UNAVAILABLE','The mailbox response was invalid or too large.');}
}
export async function completeGmail(repo:LoopRepository,code:string,state:string,env:LoopEnv,fetcher:LoopFetch=fetch):Promise<string> {
  if(!gmailConfigured(env)||code.length>2000||state.length>200||!/^[a-zA-Z0-9_-]{40,100}$/.test(state))throw new ApiError(400,'LOOP_OAUTH_STATE','This mailbox callback is invalid.');
  const hash=await digest(state); const stored=await repo.rpc<{user_id:string;allow_drafts:boolean;verifier_ciphertext:string;expires_at:string;lifecycle_generation:number}>('job_loop_consume_oauth_state',{p_hash:hash});
  if(!validLoopGeneration(stored.lifecycle_generation))throw new ApiError(409,'LOOP_REQUEST_GENERATION_REQUIRED','Start a new mailbox connection from your current Automated Job Loop.');
  const {verifier}=await decryptJson(stored.verifier_ciphertext,stored.user_id,env,`state:${hash}`);
  if(typeof verifier!=='string')throw new ApiError(400,'LOOP_OAUTH_STATE','This connection could not be verified.');
  const tokens=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env('JOB_LOOP_GMAIL_CLIENT_ID')!,client_secret:env('JOB_LOOP_GMAIL_CLIENT_SECRET')!,redirect_uri:callbackUrl(env),grant_type:'authorization_code',code_verifier:verifier}).toString()},fetcher);
  if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||typeof tokens.expires_in!=='number')throw new ApiError(503,'LOOP_GMAIL_UNAVAILABLE','Offline mailbox permission was not granted. Start a new connection.');
  const scopes=typeof tokens.scope==='string'?tokens.scope.split(' '):[]; if(!scopes.includes(READ_SCOPE)||(stored.allow_drafts&&!scopes.includes(DRAFT_SCOPE)))throw new ApiError(403,'LOOP_GMAIL_SCOPE','The requested mailbox permissions were not granted.');
  const profile=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${tokens.access_token}`}},fetcher);
  if(typeof profile.emailAddress!=='string'||profile.emailAddress.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.emailAddress))throw new ApiError(503,'LOOP_GMAIL_UNAVAILABLE','The mailbox identity could not be verified.');
  await repo.rpc('job_loop_read_oauth_state',{p_user:stored.user_id,p_generation:stored.lifecycle_generation,p_hash:hash});
  const ticket=await encryptJson({owner:stored.user_id,generation:stored.lifecycle_generation,stateHash:hash,email:profile.emailAddress,allowDrafts:stored.allow_drafts,expiresAt:Math.min(Date.now()+300000,Date.parse(stored.expires_at)),tokens:{accessToken:tokens.access_token,refreshToken:tokens.refresh_token,expiresAt:Date.now()+Math.max(0,tokens.expires_in-60)*1000}},stored.user_id,env,'activation-ticket');
  if(ticket.length>16000)throw new ApiError(503,'LOOP_GMAIL_UNAVAILABLE','The mailbox activation ticket exceeded its safe limit.');
  // This ticket is returned only to the callback browser. Neither tokens nor ticket
  // are persisted/pollable by the account that originally initiated the link.
  return ticket;
}
async function activationTicket(repo:LoopRepository,userId:string,ticket:string,env:LoopEnv,expectedGeneration:number):Promise<Record<string,unknown>>{
  if(!gmailConfigured(env)||ticket.length>16000)throw new ApiError(400,'LOOP_OAUTH_STATE','This activation ticket is invalid.');
  let data:Record<string,unknown>;try{data=await decryptJson(ticket,userId,env,'activation-ticket');}catch{throw new ApiError(403,'LOOP_OAUTH_OWNER','This ticket cannot be opened by the signed-in account. Use the account that started the connection.');}
  if(data.owner!==userId||typeof data.stateHash!=='string'||!/^[a-f0-9]{64}$/.test(data.stateHash)||typeof data.expiresAt!=='number'||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now()||typeof data.allowDrafts!=='boolean')throw new ApiError(400,'LOOP_OAUTH_STATE','This activation ticket expired or belongs to another account.');
  if(!validLoopGeneration(expectedGeneration)||data.generation!==expectedGeneration)throw new ApiError(409,'LOOP_REQUEST_STALE','This mailbox connection belongs to an earlier Automated Job Loop. Start a new connection.');
  const state=await repo.rpc<{allow_drafts:boolean;consumed_at:string|null;activated_at:string|null;expires_at:string}>('job_loop_read_oauth_state',{p_user:userId,p_generation:expectedGeneration,p_hash:data.stateHash});
  if(!state?.consumed_at||state.activated_at||Date.parse(state.expires_at)<=Date.now()||state.allow_drafts!==data.allowDrafts)throw new ApiError(400,'LOOP_OAUTH_STATE','This activation ticket expired or was already used.');return data;
}
export async function previewGmailTicket(repo:LoopRepository,userId:string,ticket:string,env:LoopEnv,expectedGeneration:number):Promise<{email:string|null;allowDrafts:boolean;expiresAt:string}>{
  const data=await activationTicket(repo,userId,ticket,env,expectedGeneration);return {email:typeof data.email==='string'?data.email:null,allowDrafts:data.allowDrafts as boolean,expiresAt:new Date(data.expiresAt as number).toISOString()};
}
export async function finalizeGmailTicket(repo:LoopRepository,userId:string,ticket:string,env:LoopEnv,expectedGeneration:number):Promise<void>{
  const data=await activationTicket(repo,userId,ticket,env,expectedGeneration);const tokens=data.tokens as {accessToken?:unknown;refreshToken?:unknown;expiresAt?:unknown};
  if(!tokens||typeof tokens.accessToken!=='string'||typeof tokens.refreshToken!=='string'||typeof tokens.expiresAt!=='number')throw new ApiError(400,'LOOP_OAUTH_STATE','The mailbox ticket is incomplete.');
  await repo.rpc('job_loop_activate_gmail_bound',{p_user:userId,p_generation:expectedGeneration,p_hash:data.stateHash,p_cipher:await encryptJson(tokens,userId,env),p_email:data.email,p_drafts:data.allowDrafts});
}
async function gmailToken(repo:LoopRepository,userId:string,env:LoopEnv,fetcher:LoopFetch,requireDrafts=false,expectedGeneration?:number):Promise<string> {
  if(!gmailConfigured(env))throw new ApiError(503,'LOOP_GMAIL_NOT_CONFIGURED','Mailbox processing is disabled.');
  await repo.assertGeneration(userId,expectedGeneration);
  const data=await repo.rpc<{allow_drafts:boolean;token_ciphertext:string}|null>('job_loop_read_gmail_connection',{p_user:userId,p_generation:expectedGeneration});
  if(!data||requireDrafts&&!data.allow_drafts)throw new ApiError(403,'LOOP_GMAIL_NOT_CONNECTED','Connect Gmail with the required read/draft permission first.');
  const tokens=await decryptJson(data.token_ciphertext,userId,env);
  if(typeof tokens.accessToken!=='string'||typeof tokens.refreshToken!=='string'||typeof tokens.expiresAt!=='number')throw new ApiError(503,'LOOP_GMAIL_UNAVAILABLE','Reconnect the mailbox.');
  if(tokens.expiresAt>Date.now()){await repo.assertGeneration(userId,expectedGeneration);return tokens.accessToken;}
  const refreshed=await googleJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({refresh_token:tokens.refreshToken,client_id:env('JOB_LOOP_GMAIL_CLIENT_ID')!,client_secret:env('JOB_LOOP_GMAIL_CLIENT_SECRET')!,grant_type:'refresh_token'}).toString()},fetcher);
  if(typeof refreshed.access_token!=='string'||typeof refreshed.expires_in!=='number')throw new ApiError(503,'LOOP_GMAIL_UNAVAILABLE','The mailbox authorization expired. Reconnect it.');
  const cipher=await encryptJson({...tokens,accessToken:refreshed.access_token,expiresAt:Date.now()+Math.max(0,refreshed.expires_in-60)*1000},userId,env);
  const updated=await repo.rpc<boolean>('job_loop_refresh_gmail',{p_user:userId,p_generation:expectedGeneration,p_previous_cipher:data.token_ciphertext,p_cipher:cipher});
  if(!updated)throw new ApiError(409,'LOOP_GMAIL_CHANGED','The mailbox connection changed. Retry the read.');return refreshed.access_token;
}
export async function readRecruitmentInbox(repo:LoopRepository,userId:string,env:LoopEnv,fetcher:LoopFetch=fetch,expectedGeneration?:number):Promise<{signals:LoopInboxSignal[];truncated:boolean}> {
  const deadline=AbortSignal.timeout(75000);const token=await gmailToken(repo,userId,env,fetcher,false,expectedGeneration); const endpoint=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  endpoint.searchParams.set('q','newer_than:7d (subject:application OR subject:interview OR subject:assessment OR subject:recruiter OR subject:shortlist OR subject:"next steps")');endpoint.searchParams.set('maxResults','10');
  const list=await googleJson(endpoint.href,{headers:{Authorization:`Bearer ${token}`}},fetcher,deadline);const messages=Array.isArray(list.messages)?list.messages.slice(0,10):[];
  const signals:LoopInboxSignal[]=[];let failures=0;
  for(let at=0;at<messages.length;at+=3){if(deadline.aborted){failures++;break;}
    await repo.assertGeneration(userId,expectedGeneration);
    const batch=await Promise.allSettled(messages.slice(at,at+3).map(async value=>{if(!value||typeof value!=='object'||!('id' in value)||typeof value.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.id))return null;
    const item=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${value.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,{headers:{Authorization:`Bearer ${token}`}},fetcher,deadline);
    const headers=Array.isArray((item.payload as {headers?:unknown[]})?.headers)?(item.payload as {headers:{name:string;value:string}[]}).headers:[];
    const subject=(headers.find(header=>header.name.toLowerCase()==='subject')?.value??'').slice(0,300);const from=(headers.find(header=>header.name.toLowerCase()==='from')?.value??'').slice(0,300);
    const bucket=/interview|assessment|next steps|schedule|question/i.test(subject)?'action_needed':/unfortunately|rejected|not selected/i.test(subject)?'rejected':/application|received|under review|shortlist/i.test(subject)?'progress':'noise';
    return {id:await digest(`gmail:${value.id}`),bucket,subject,from,receivedAt:new Date(Number(item.internalDate)||Date.now()).toISOString(),summary:typeof item.snippet==='string'?item.snippet.slice(0,500):'Read this recruitment message in Gmail.',draftReply:'',threadId:typeof item.threadId==='string'?item.threadId:'',opportunityId:null,roleUnconfirmed:true} as LoopInboxSignal;
    }));for(const result of batch){if(result.status==='fulfilled'&&result.value)signals.push(result.value);else if(result.status==='rejected')failures++;}
  }
  await repo.assertGeneration(userId,expectedGeneration);
  return {signals,truncated:!!list.nextPageToken||failures>0};
}
export async function createGmailDraft(repo:LoopRepository,userId:string,packet:LoopPacket,requestId:string,env:LoopEnv,fetcher:LoopFetch=fetch,expectedGeneration?:number):Promise<string> {
  const contact=packet.contact;
  if(!contact?.confirmedByUser||!contact.email||!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(contact.email)||contact.inExistingThread||!packet.emailBody||!packet.emailSubject||/[\r\n]/.test(packet.emailSubject))throw new ApiError(422,'LOOP_DRAFT_HELD','A confirmed recipient, approved attachment and new-thread message are required. Reply in the existing thread when applicable.');
  const token=await gmailToken(repo,userId,env,fetcher,true,expectedGeneration);const path=packet.artifacts.docx?.path;
  if(!/^[a-f0-9]{64}$/.test(packet.artifacts.docx?.sha256??'')||path!==`${userId}/${packet.id}/${packet.artifacts.docx.sha256}/docx`)throw new ApiError(422,'LOOP_DRAFT_HELD','The approved attachment could not be verified.');
  const {data:attachment,error}=await repo.admin.storage.from('job-loop-artifacts').download(path);loopDatabaseError(error);if(!attachment)throw new ApiError(404,'LOOP_ARTIFACT_MISSING','The approved attachment is unavailable.');
  const bytes=new Uint8Array(await attachment.arrayBuffer());if(await digest(bytes)!==packet.artifacts.docx.sha256)throw new ApiError(409,'LOOP_ARTIFACT_CHANGED','The attachment changed and must be rebuilt.');
  const fingerprint=await digest(JSON.stringify([packet.id,packet.inputHash,contact.email,packet.emailSubject,packet.emailBody,packet.artifacts.docx.sha256]));
  const claimed=await repo.rpc<{is_new:boolean;status:string}>('job_loop_claim_draft_bound',{p_user:userId,p_generation:expectedGeneration,p_packet:packet.id,p_request:requestId,p_hash:fingerprint});
  if(!claimed.is_new){if(claimed.status==='created')return 'The Gmail draft already exists. Review it in Gmail.';throw new ApiError(409,'LOOP_DRAFT_UNCERTAIN','A prior draft write is unconfirmed. Check Gmail before attempting another draft.');}
  const boundary=`jobvance_${crypto.randomUUID().replace(/-/g,'')}`;
  const encodedSubject=`=?UTF-8?B?${base64(new TextEncoder().encode(packet.emailSubject))}?=`;
  const attachmentBase64=base64(bytes).match(/.{1,76}/g)?.join('\r\n')??'';
  const bodyBase64=base64(new TextEncoder().encode(packet.emailBody)).match(/.{1,76}/g)?.join('\r\n')??'';
  const raw=`To: ${contact.email}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${bodyBase64}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\nContent-Disposition: attachment; filename="approved-cv.docx"\r\nContent-Transfer-Encoding: base64\r\n\r\n${attachmentBase64}\r\n--${boundary}--`;
  try{
    await repo.assertGeneration(userId,expectedGeneration);
    const result=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({message:{raw:base64url(new TextEncoder().encode(raw))}})},fetcher);
    if(typeof result.id!=='string')throw new Error();await repo.rpc('job_loop_finish_gmail_draft',{p_user:userId,p_generation:expectedGeneration,p_request:requestId,p_hash:fingerprint,p_status:'created',p_draft_id:result.id});return 'Gmail draft created. Review it yourself in Gmail; nothing was sent.';
  }catch{try{await repo.rpc('job_loop_finish_gmail_draft',{p_user:userId,p_generation:expectedGeneration,p_request:requestId,p_hash:fingerprint,p_status:'uncertain',p_draft_id:null});}catch{/* The erased/replaced owner wins; never write a late receipt into a new lifetime. */}throw new ApiError(503,'LOOP_DRAFT_UNCERTAIN','The Gmail draft write could not be confirmed. Check Gmail; this request will not be blindly retried.');}
}
