import {adminClient,boundedBody,cors,json,serve} from '../_shared/runtime.ts';
import {ApiError} from '../_shared/core.ts';
import {validateGuestSupport,supportHash,supportRateHash,guestSupportError} from '../_shared/jobvance-guest-support.ts';
// User-authorized public intake; receipt reads require a256-bit bearer secret. No public table or admin access.
serve(async req=>{
  const origin=req.headers.get('Origin');
  if(origin&&!('Access-Control-Allow-Origin' in cors(req)))throw new ApiError(403,'GUEST_SUPPORT_ORIGIN','Open support from the Jobvance website.');
  if(!req.headers.get('Content-Type')?.includes('application/json'))throw new ApiError(415,'GUEST_SUPPORT_INVALID','Use JSON.');
  let value:unknown;try{value=JSON.parse(await boundedBody(req,10000));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,'GUEST_SUPPORT_INVALID','Use a valid request.');}
  const input=validateGuestSupport(value),db=adminClient(),hash=await supportHash(input.receiptKey);
  const result=input.action==='create'?await db.rpc('jobvance_guest_support_create',{p_id:input.requestId,p_receipt_hash:hash,p_rate_hash:await supportRateHash(req.headers.get('cf-connecting-ip')??req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'unknown',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??''),p_category:input.category,p_message:input.message}):await db.rpc('jobvance_guest_support_receipt',{p_id:input.requestId,p_receipt_hash:hash});
  guestSupportError(result.error);return json(req,{receipt:result.data});
});
