import {z} from 'zod';
import {supabase} from '@/integrations/supabase/client';
import type {GuestSupportAction,GuestSupportCategory} from '../../supabase/functions/_shared/jobvance-guest-support';
export const guestReceiptSchema=z.object({id:z.string().uuid(),category:z.enum(['help','bug','privacy']),status:z.enum(['received','in_review','resolved']),reply:z.string().max(2000),createdAt:z.string().datetime({offset:true}),updatedAt:z.string().datetime({offset:true}),expiresAt:z.string().datetime({offset:true})});
export type GuestReceipt=z.infer<typeof guestReceiptSchema>;
export type GuestReference={requestId:string;receiptKey:string};
export function newGuestReference():GuestReference{return {requestId:crypto.randomUUID(),receiptKey:Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte=>byte.toString(16).padStart(2,'0')).join('')};}
export function guestReceiptCode(ref:GuestReference):string{return `JVS-${ref.requestId}.${ref.receiptKey}`;}
export function parseGuestReceiptCode(code:string):GuestReference|null{const match=/^JVS-([a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})\.([a-f\d]{64})$/i.exec(code.trim());return match?{requestId:match[1].toLowerCase(),receiptKey:match[2].toLowerCase()}:null;}
async function request(input:GuestSupportAction):Promise<GuestReceipt>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const result=await Promise.race([supabase.functions.invoke('jobvance-guest-support',{body:input}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Support confirmation took too long.')),30000);})]).catch(()=>{throw new Error('The service could not confirm this request. Keep your draft and retry.');}).finally(()=>clearTimeout(timer));
  if(result.error){const context=(result.error as {context?:unknown}).context;const status=context instanceof Response?context.status:503;throw new Error(status===404?'That private receipt is incorrect, expired or unavailable.':status===429?'Too many new requests. Keep your draft and try again later.':'The service could not confirm this request. Keep your draft and retry.');}
  const parsed=z.object({receipt:guestReceiptSchema}).safeParse(result.data);
  if(!parsed.success||parsed.data.receipt.id!==input.requestId)throw new Error('The receipt could not be verified. Keep your draft and retry.');
  return parsed.data.receipt;
}
export const createGuestSupport=(ref:GuestReference,category:GuestSupportCategory,message:string)=>request({action:'create',...ref,category,message,consent:true,website:''});
export const lookupGuestSupport=(ref:GuestReference)=>request({action:'receipt',...ref});
