import {ApiError} from './core.ts';
export type GuestSupportCategory='help'|'bug'|'privacy';
export type GuestSupportAction={action:'create';requestId:string;receiptKey:string;category:GuestSupportCategory;message:string;consent:true;website:string}|{action:'receipt';requestId:string;receiptKey:string};
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const key=/^[a-f\d]{64}$/;
export function validateGuestSupport(value:unknown):GuestSupportAction {
  const invalid=()=>{throw new ApiError(400,'GUEST_SUPPORT_INVALID','Choose a request type, write a short message and confirm private storage.');};
  if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
  const item=value as Record<string,unknown>, fields=item.action==='create'?['action','requestId','receiptKey','category','message','consent','website']:['action','requestId','receiptKey'];
  if(typeof item.action!=='string'||!['create','receipt'].includes(item.action)||Object.keys(item).length!==fields.length||fields.some(field=>!Object.prototype.hasOwnProperty.call(item,field))||typeof item.requestId!=='string'||!uuid.test(item.requestId)||typeof item.receiptKey!=='string'||!key.test(item.receiptKey))return invalid();
  if(item.action==='create' && (item.consent!==true||item.website!==''||typeof item.category!=='string'||!['help','bug','privacy'].includes(item.category)||typeof item.message!=='string'||item.message.includes('\0')||item.message.trim().length<5||item.message.length>2000))return invalid();
  return item as unknown as GuestSupportAction;
}
export async function supportHash(value:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function supportRateHash(ip:string,secret:string):Promise<string>{
  const salt=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',salt,new TextEncoder().encode(ip.slice(0,100))))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function guestSupportError(error:{message?:string}|null):void{
  if(!error)return;
  for(const [code,status,message] of [['GUEST_SUPPORT_INVALID',400,'Check the request fields.'],['GUEST_SUPPORT_CONFLICT',409,'This reference belongs to another request. Start a new request.'],['GUEST_SUPPORT_LIMIT',429,'Too many new requests. Keep your receipt or try again later.'],['GUEST_SUPPORT_NOT_FOUND',404,'That private receipt is unavailable, incorrect or expired.']] as const){if(error.message?.includes(code))throw new ApiError(status,code,message);}
  throw new ApiError(503,'GUEST_SUPPORT_UNAVAILABLE','Your support request could not be confirmed. Keep your draft and retry.');
}
